import * as SecureStore from 'expo-secure-store';
import { decodeBase64 } from '@senha-facil/crypto';

const TOKENS_STORE_KEY = 'sf_session_tokens_v2';
interface Tokens { accessToken: string; refreshToken: string }

/**
 * Base URL from Expo public env var.
 * Set EXPO_PUBLIC_API_URL in apps/mobile/.env (gitignored).
 */
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`HTTP ${status}: ${body}`);
    this.name = 'ApiError';
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

/**
 * Thin fetch wrapper with automatic JWT injection from expo-secure-store.
 *
 * Usage:
 *   const items = await apiClient.get<VaultItem[]>('/vault');
 *   const item  = await apiClient.post<VaultItem>('/vault', dto);
 *
 * Token management:
 *   - setToken() after login/register
 *   - clearToken() on logout
 */
export class ApiClient {
  private generation = 0;
  private controllers = new Set<AbortController>();
  private renewal: Promise<string | null> | null = null;
  private writes: Promise<void> = Promise.resolve();

  cancelRequests(): void {
    this.generation += 1;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    this.renewal = null;
  }
  // ─── Token helpers ─────────────────────────────────────────────────────────

  async setToken(token: string, refreshToken: string): Promise<void> {
    this.cancelRequests();
    await this.persist({ accessToken: token, refreshToken }, this.generation);
  }

  async clearToken(): Promise<void> {
    this.cancelRequests();
    await this.persist(null, this.generation);
  }

  async hasToken(): Promise<boolean> {
    return (await SecureStore.getItemAsync(TOKENS_STORE_KEY)) !== null;
  }

  /** Returns the raw JWT — used by services that need to authenticate outside HTTP (e.g., WebSocket handshake). */
  async getToken(): Promise<string | null> {
    const generation = this.generation;
    const stored = await SecureStore.getItemAsync(TOKENS_STORE_KEY);
    if (!stored || generation !== this.generation) return null;
    const tokens: Tokens = JSON.parse(stored);
    if (expiresAt(tokens.accessToken) > Date.now() + 30_000) return tokens.accessToken;
    if (!this.renewal) {
      const renewal = this.renew(tokens, generation);
      this.renewal = renewal;
      void renewal.finally(() => { if (this.renewal === renewal) this.renewal = null; }).catch(() => undefined);
    }
    return this.renewal;
  }

  async revokeSession(): Promise<void> {
    const stored = await SecureStore.getItemAsync(TOKENS_STORE_KEY);
    if (!stored) return;
    const tokens: Tokens = JSON.parse(stored);
    await this.post('/auth/logout', { refreshToken: tokens.refreshToken });
  }

  private async persist(tokens: Tokens | null, generation: number): Promise<void> {
    const write = this.writes.catch(() => undefined).then(async () => {
      if (generation !== this.generation) return;
      if (tokens) await SecureStore.setItemAsync(TOKENS_STORE_KEY, JSON.stringify(tokens));
      else await SecureStore.deleteItemAsync(TOKENS_STORE_KEY);
    });
    this.writes = write;
    await write;
  }

  private async renew(tokens: Tokens, generation: number): Promise<string | null> {
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }), signal: controller.signal,
      });
      if (generation !== this.generation) throw new Error('SESSION_CHANGED');
      if (!response.ok) {
        if (response.status === 401) await this.persist(null, generation);
        throw new ApiError(response.status, await response.text());
      }
      const renewed: Tokens = await response.json();
      if (generation !== this.generation) throw new Error('SESSION_CHANGED');
      await this.persist(renewed, generation);
      return generation === this.generation ? renewed.accessToken : null;
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(controller);
    }
  }

  // ─── HTTP methods ──────────────────────────────────────────────────────────

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  async delete(path: string, body?: unknown): Promise<void> {
    await this.request<void>('DELETE', path, body);
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const generation = this.generation;
    const token = path.startsWith('/auth/') ? null : await this.getToken();
    if (generation !== this.generation) throw new Error('SESSION_CHANGED');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    this.controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method, headers, signal: controller.signal,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (generation !== this.generation) throw new Error('SESSION_CHANGED');

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new ApiError(response.status, text);
    }

    // 204 No Content — no body to parse
    if (response.status === 204) {
      return undefined as T;
    }

      const result = await response.json();
      if (generation !== this.generation) throw new Error('SESSION_CHANGED');
      return result as T;
    } finally {
      clearTimeout(timer);
      this.controllers.delete(controller);
    }
  }
}

export const apiClient = new ApiClient();

function expiresAt(token: string): number {
  try {
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=');
    const payload = JSON.parse(String.fromCharCode(...decodeBase64(padded)));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0;
  } catch { return 0; }
}
