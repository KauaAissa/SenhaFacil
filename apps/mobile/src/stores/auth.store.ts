import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { generateSalt } from '@senha-facil/crypto';
import { apiClient, ApiError } from '../services/api.client';
import { vaultCryptoService } from '../services/vault-crypto.service';
import { offlineVaultService } from '../services/offline-vault.service';
import { connectivityService } from '../services/connectivity.service';
import { syncService } from '../services/sync.service';
import { accessSocketService } from '../services/access-socket.service';
import { registerPushToken } from '../services/push-notifications.service';
import { sensitiveClipboard } from '../services/clipboard.service';

export type UserRole = 'ELDERLY' | 'CAREGIVER';
export interface AuthUser { id: string; name: string; email: string; role: UserRole; surname?: string; phone?: string | null; dateOfBirth?: string | null }
interface LocalSession { user: AuthUser; kdfSalt: string; onboarded?: boolean }
interface RegisterInput { name: string; email: string; phone?: string; password: string; role: UserRole }
interface AuthState {
  user: AuthUser | null;
  isReady: boolean;
  isLoading: boolean;
  isLocked: boolean;
  isOffline: boolean;
  needsOnboarding: boolean;
  error: string | null;
  bootstrap: () => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  unlock: (password?: string) => Promise<void>;
  reauthenticate: (password?: string) => Promise<void>;
  lock: () => void;
  logout: () => Promise<void>;
  updateProfile: (profile: { name: string; surname: string; phone: string | null; dateOfBirth: string | null }) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  completeOnboarding: () => Promise<void>;
}

const SESSION_KEY = 'sf_local_session_v2';
let localSession: LocalSession | null = null;

function stopSession(): void {
  void sensitiveClipboard.clear().catch(() => undefined);
  apiClient.cancelRequests();
  syncService.stop();
  accessSocketService.disconnect();
  vaultCryptoService.lockKey();
}

async function startOnlineServices(): Promise<boolean> {
  if (!(await apiClient.hasToken())) return false;
  syncService.start();
  if (!connectivityService.isOnline) return false;
  try {
    const profile = await apiClient.get<AuthUser>('/users/me');
    if (profile.id !== localSession?.user.id) throw new ApiError(401, 'SESSION_ACCOUNT_MISMATCH');
    localSession.user = profile;
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(localSession));
    syncService.start();
    void accessSocketService.connect().catch(() => undefined);
    void registerPushToken();
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthorized) await apiClient.clearToken();
    return false;
  }
}

async function establishSession(user: AuthUser, salt: string, password: string, token: string, refreshToken: string): Promise<void> {
  stopSession();
  await apiClient.clearToken();
  await offlineVaultService.close();
  localSession = null;
  await SecureStore.deleteItemAsync(SESSION_KEY);
  try {
    await vaultCryptoService.initializeKey(user.id, password, salt);
    await offlineVaultService.initialize(user.id);
    const onboarded = (await SecureStore.getItemAsync(`sf_onboarded_${user.id}`)) === '1';
    localSession = { user, kdfSalt: salt, onboarded };
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(localSession));
    await apiClient.setToken(token, refreshToken);
  } catch (error) {
    stopSession();
    localSession = null;
    await apiClient.clearToken();
    await SecureStore.deleteItemAsync(SESSION_KEY);
    await offlineVaultService.close();
    throw error;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null, isReady: false, isLoading: false, isLocked: true, isOffline: false, needsOnboarding: false, error: null,
  bootstrap: async () => {
    try {
      connectivityService.start();
      const cached = await SecureStore.getItemAsync(SESSION_KEY);
      if (cached) {
        const parsed: LocalSession = JSON.parse(cached);
        if (!parsed.user?.id || !/^[0-9a-f]{32}$/.test(parsed.kdfSalt) ||
            !['ELDERLY', 'CAREGIVER'].includes(parsed.user.role)) throw new Error('INVALID_LOCAL_SESSION');
        localSession = parsed;
        parsed.onboarded = parsed.onboarded === true || (await SecureStore.getItemAsync(`sf_onboarded_${parsed.user.id}`)) === '1';
        set({ user: parsed.user, isLocked: true, needsOnboarding: !parsed.onboarded });
      }
    } catch {
      localSession = null;
      set({ user: null, error: 'Nao foi possivel restaurar a sessao. Entre novamente.' });
    } finally {
      set({ isReady: true });
    }
  },
  register: async (input) => {
    if (get().isLoading) return;
    set({ isLoading: true, error: null });
    try {
      const salt = generateSalt();
      const response = await apiClient.post<{ accessToken: string; refreshToken: string; user: AuthUser }>('/auth/register', {
        ...input, email: input.email.trim().toLowerCase(), kdfSalt: salt,
      });
      await establishSession(response.user, salt, input.password, response.accessToken, response.refreshToken);
      set({ user: response.user, isLocked: false, isLoading: false, needsOnboarding: !localSession?.onboarded });
      set({ isOffline: !(await startOnlineServices()) });
    } catch (error) {
      set({ user: localSession?.user ?? null, isLoading: false, isLocked: true, error: errorMessage(error) });
      throw error;
    }
  },
  login: async (email, password) => {
    if (get().isLoading) return;
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.post<{ accessToken: string; refreshToken: string; user: AuthUser & { kdfSalt: string } }>(
        '/auth/login', { email: email.trim().toLowerCase(), password },
      );
      const { kdfSalt, ...user } = response.user;
      await establishSession(user, kdfSalt, password, response.accessToken, response.refreshToken);
      set({ user, isLocked: false, isLoading: false, needsOnboarding: !localSession?.onboarded });
      set({ isOffline: !(await startOnlineServices()) });
    } catch (error) {
      set({ user: localSession?.user ?? null, isLoading: false, isLocked: true, error: errorMessage(error) });
      throw error;
    }
  },
  unlock: async (password) => {
    if (!localSession || get().isLoading) return;
    set({ isLoading: true, error: null });
    try {
      const session = localSession;
      if (password !== undefined) await vaultCryptoService.unlockWithPassword(session.user.id, password, session.kdfSalt);
      else await vaultCryptoService.loadKey(session.user.id);
      await offlineVaultService.initialize(session.user.id);
      const online = await startOnlineServices();
      set({ user: session.user, isOffline: !online, isLocked: false });
    } catch (error) {
      stopSession();
      set({ isLocked: true, error: password === undefined
        ? 'Biometria indisponivel ou cancelada. Use sua senha mestra.' : errorMessage(error) });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },
  reauthenticate: async (password) => {
    const session = localSession;
    if (!session || get().isLoading || get().isLocked) throw new Error('Cofre bloqueado.');
    set({ isLoading: true });
    try {
      if (password !== undefined) await vaultCryptoService.unlockWithPassword(session.user.id, password, session.kdfSalt);
      else await vaultCryptoService.loadKey(session.user.id, 'Confirme o acesso de emergencia');
      if (localSession !== session) throw new Error('SESSION_CHANGED');
    } finally {
      set({ isLoading: false });
    }
  },
  lock: () => {
    stopSession();
    set({ isLocked: true, error: null });
  },
  logout: async () => {
    stopSession();
    set({ user: null, isLocked: true, isLoading: true, error: null });
    localSession = null;
    try {
      await apiClient.patch('/users/me/fcm-token', { fcmToken: null }).catch(() => undefined);
      await apiClient.revokeSession().catch(() => undefined);
      await apiClient.clearToken();
      await SecureStore.deleteItemAsync(SESSION_KEY);
      await offlineVaultService.close();
    } finally { set({ isLoading: false }); }
  },
  updateProfile: async (profile) => {
    const user = await apiClient.patch<AuthUser>('/users/me', profile);
    if (!localSession || localSession.user.id !== user.id) throw new Error('SESSION_CHANGED');
    localSession.user = user;
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(localSession));
    set({ user });
  },
  deleteAccount: async (password) => {
    const session = localSession;
    if (!session || get().isLoading) return;
    set({ isLoading: true });
    try {
      await apiClient.delete('/users/me', { password });
      syncService.stop(); accessSocketService.disconnect(); apiClient.cancelRequests();
      try { await offlineVaultService.eraseAccount(session.user.id); }
      finally {
        stopSession();
        localSession = null;
        set({ user: null, isLocked: true });
        const cleanup = await Promise.allSettled([
          vaultCryptoService.clearKey(session.user.id), apiClient.clearToken(),
          SecureStore.deleteItemAsync(SESSION_KEY), offlineVaultService.close(),
        ]);
        if (cleanup.some((result) => result.status === 'rejected')) throw new Error('Conta excluida; falha na limpeza local.');
      }
    } finally { set({ isLoading: false }); }
  },
  completeOnboarding: async () => {
    const session = localSession;
    if (!session) throw new Error('SESSION_CHANGED');
    await SecureStore.setItemAsync(`sf_onboarded_${session.user.id}`, '1');
    if (session !== localSession) throw new Error('SESSION_CHANGED');
    session.onboarded = true;
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
    if (session === localSession) set({ needsOnboarding: false });
  },
}));

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'E-mail ou senha incorretos, ou sessao encerrada.';
    try {
      const body = JSON.parse(error.body);
      if (typeof body.message === 'string') return body.message;
      if (Array.isArray(body.message)) return body.message.join('\n');
    } catch {}
    return 'Nao foi possivel concluir. Tente novamente.';
  }
  return error instanceof Error ? error.message : 'Nao foi possivel concluir. Tente novamente.';
}
