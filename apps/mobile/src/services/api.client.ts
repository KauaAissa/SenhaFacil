import * as SecureStore from 'expo-secure-store';

const JWT_STORE_KEY = 'sf_access_token';

/**
 * Base URL from Expo public env var.
 * Set EXPO_PUBLIC_API_URL in apps/mobile/.env (gitignored).
 */
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

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
class ApiClient {
  // ─── Token helpers ─────────────────────────────────────────────────────────

  async setToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(JWT_STORE_KEY, token);
  }

  async clearToken(): Promise<void> {
    await SecureStore.deleteItemAsync(JWT_STORE_KEY);
  }

  async hasToken(): Promise<boolean> {
    const token = await SecureStore.getItemAsync(JWT_STORE_KEY);
    return token !== null;
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

  async delete(path: string): Promise<void> {
    await this.request<void>('DELETE', path);
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const token = await SecureStore.getItemAsync(JWT_STORE_KEY);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new ApiError(response.status, text);
    }

    // 204 No Content — no body to parse
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }
}

export const apiClient = new ApiClient();
