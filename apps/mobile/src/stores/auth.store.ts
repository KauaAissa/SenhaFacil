import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { createProtection, changeProtection, openProtection, deriveAuthentication, deriveKey, destroyVaultKey, type VaultProtection } from '@senha-facil/crypto';
import { apiClient, ApiError } from '../services/api.client';
import { vaultCryptoService } from '../services/vault-crypto.service';
import { offlineVaultService } from '../services/offline-vault.service';
import { connectivityService } from '../services/connectivity.service';
import { syncService } from '../services/sync.service';
import { accessSocketService } from '../services/access-socket.service';
import { registerPushToken } from '../services/push-notifications.service';
import { sensitiveClipboard } from '../services/clipboard.service';
import { accountSecurityService } from '../services/account-security.service';

export type UserRole = 'ELDERLY' | 'CAREGIVER';
export interface AuthUser { id: string; name: string; email: string; role: UserRole; surname?: string; phone?: string | null; dateOfBirth?: string | null }
interface LocalSession { user: AuthUser; kdfSalt: string; onboarded?: boolean; authVersion?: number; securityVersion?: number; vaultProtection?: VaultProtection }
interface AuthResponse { accessToken: string; refreshToken: string; user: AuthUser & {
  kdfSalt: string; authVersion: number; securityVersion: number; vaultProtection: VaultProtection | null;
} }
interface RegisterInput { name: string; email: string; phone?: string; password: string; role: UserRole }
interface AuthState {
  user: AuthUser | null;
  isReady: boolean;
  isLoading: boolean;
  authPhase: 'idle' | 'parameters' | 'deriving' | 'authenticating' | 'opening' | 'services';
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
  changePassword: (current: string, next: string) => Promise<void>;
  generateRecoveryKit: (password: string) => Promise<string>;
  getRecoverySalt: () => string | undefined;
}

const SESSION_KEY = 'sf_local_session_v2';
let localSession: LocalSession | null = null;
let sessionEpoch = 0;

function requireEpoch(epoch: number): void {
  if (epoch !== sessionEpoch) throw new Error('SESSION_CHANGED');
}

function stopSession(): void {
  sessionEpoch += 1;
  void sensitiveClipboard.clear().catch(() => undefined);
  apiClient.cancelRequests();
  syncService.stop();
  accessSocketService.disconnect();
  vaultCryptoService.lockKey();
}

async function startOnlineServices(): Promise<boolean> {
  const epoch = sessionEpoch;
  if (!(await apiClient.hasToken())) return false;
  requireEpoch(epoch);
  syncService.start();
  if (!connectivityService.isOnline) return false;
  try {
    const profile = await apiClient.get<AuthUser>('/users/me');
    requireEpoch(epoch);
    if (profile.id !== localSession?.user.id) throw new ApiError(401, 'SESSION_ACCOUNT_MISMATCH');
    localSession.user = profile;
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(localSession));
    requireEpoch(epoch);
    syncService.start();
    void accessSocketService.connect().catch(() => undefined);
    void registerPushToken();
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthorized) await apiClient.clearToken();
    return false;
  }
}

async function establishSession(user: AuthUser, salt: string, password: string, token: string, refreshToken: string,
  security: { authVersion: number; securityVersion: number; vaultProtection: VaultProtection | null }, expectedEpoch: number): Promise<number> {
  requireEpoch(expectedEpoch);
  stopSession();
  const epoch = sessionEpoch;
  await apiClient.clearToken();
  await offlineVaultService.close();
  localSession = null;
  await SecureStore.deleteItemAsync(SESSION_KEY);
  try {
    requireEpoch(epoch);
    if (security.authVersion === 2) {
      if (!security.vaultProtection) throw new Error('Envelope de seguranca ausente. Entre novamente.');
      await vaultCryptoService.initializeProtectedKey(user.id, password, security.vaultProtection);
    } else if (security.authVersion === 1) await vaultCryptoService.initializeKey(user.id, password, salt);
    else throw new Error('Versao de seguranca nao suportada.');
    requireEpoch(epoch);
    await offlineVaultService.initialize(user.id);
    requireEpoch(epoch);
    const onboarded = (await SecureStore.getItemAsync(`sf_onboarded_${user.id}`)) === '1';
    requireEpoch(epoch);
    localSession = { user, kdfSalt: salt, onboarded, authVersion: security?.authVersion ?? 1,
      securityVersion: security?.securityVersion ?? 0, vaultProtection: security?.vaultProtection ?? undefined };
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(localSession));
    requireEpoch(epoch);
    await apiClient.setToken(token, refreshToken);
    requireEpoch(epoch);
    return epoch;
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
  authPhase: 'idle',
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
    if (get().isLoading) throw new Error('Aguarde a operacao atual.');
    const epoch = sessionEpoch;
    set({ isLoading: true, error: null });
    try {
      const prepared = await createProtection(input.password);
      let response: AuthResponse;
      try {
        await accountSecurityService.stageKit(input.email, prepared.recoveryCode, prepared.protection.recoverySalt);
        requireEpoch(epoch);
        response = await apiClient.post<AuthResponse>('/auth/register', { ...input, password: prepared.credential,
          email: input.email.trim().toLowerCase(), kdfSalt: prepared.protection.salt, authVersion: 2,
          protection: prepared.protection, recoveryCredential: prepared.recoveryCredential });
      } finally { destroyVaultKey(prepared.key); }
      const { kdfSalt, authVersion, securityVersion, vaultProtection, ...user } = response.user;
      const established = await establishSession(user, kdfSalt, input.password, response.accessToken, response.refreshToken, { authVersion, securityVersion, vaultProtection }, epoch);
      requireEpoch(established);
      set({ user, isLocked: false, isLoading: false, needsOnboarding: !localSession?.onboarded });
      void startOnlineServices().then((online) => {
        if (established === sessionEpoch) set({ isOffline: !online });
      }).catch(() => { if (established === sessionEpoch) set({ isOffline: true }); });
    } catch (error) {
      set({ user: localSession?.user ?? null, isLoading: false, isLocked: true, error: errorMessage(error) });
      throw error;
    }
  },
  login: async (email, password) => {
    if (get().isLoading) throw new Error('Aguarde a operacao atual.');
    const epoch = sessionEpoch;
    set({ isLoading: true, error: null, authPhase: 'parameters' });
    try {
      const normalized = email.trim().toLowerCase();
      const parameters = await apiClient.post<{ kdfSalt: string; authVersion: number }>('/auth/parameters', { email: normalized });
      requireEpoch(epoch);
      set({ authPhase: 'deriving' });
      const credential = parameters.authVersion === 2 ? await deriveAuthentication(password, parameters.kdfSalt) : password;
      requireEpoch(epoch);
      set({ authPhase: 'authenticating' });
      let response = await apiClient.post<AuthResponse>('/auth/login', { email: normalized, password: credential, authVersion: parameters.authVersion });
      if (response.user.authVersion === 1) {
        requireEpoch(epoch);
        await apiClient.setToken(response.accessToken, response.refreshToken);
        const legacyKey = await deriveKey(password, response.user.kdfSalt, true);
        try {
          const prepared = await createProtection(password, undefined, legacyKey);
          await accountSecurityService.stageKit(normalized, prepared.recoveryCode, prepared.protection.recoverySalt);
          requireEpoch(epoch);
          await apiClient.post('/auth/security', { currentCredential: password, credential: prepared.credential,
            protection: prepared.protection, recoveryCredential: prepared.recoveryCredential, securityVersion: response.user.securityVersion });
          requireEpoch(epoch);
          response = await apiClient.post<AuthResponse>('/auth/login', { email: normalized, password: prepared.credential, authVersion: 2 });
        } finally { destroyVaultKey(legacyKey); }
      }
      const { kdfSalt, authVersion, securityVersion, vaultProtection, ...user } = response.user;
      set({ authPhase: 'opening' });
      const established = await establishSession(user, kdfSalt, password, response.accessToken, response.refreshToken, { authVersion, securityVersion, vaultProtection }, epoch);
      requireEpoch(established);
      set({ user, isLocked: false, isLoading: false, needsOnboarding: !localSession?.onboarded, authPhase: 'services' });
      void startOnlineServices().then((online) => {
        if (established === sessionEpoch) set({ isOffline: !online, authPhase: 'idle' });
      }).catch(() => { if (established === sessionEpoch) set({ isOffline: true, authPhase: 'idle' }); });
    } catch (error) {
      set({ user: localSession?.user ?? null, isLoading: false, isLocked: true, error: errorMessage(error), authPhase: 'idle' });
      throw error;
    }
  },
  unlock: async (password) => {
    if (!localSession || get().isLoading) return;
    set({ isLoading: true, error: null, authPhase: 'opening' });
    const epoch = sessionEpoch;
    try {
      const session = localSession;
      if (password !== undefined) await vaultCryptoService.unlockWithPassword(session.user.id, password, session.kdfSalt);
      else await vaultCryptoService.loadKey(session.user.id);
      requireEpoch(epoch);
      await offlineVaultService.initialize(session.user.id);
      requireEpoch(epoch);
      set({ user: session.user, isOffline: true, isLocked: false });
      void startOnlineServices().then((online) => {
        if (epoch === sessionEpoch) set({ isOffline: !online });
      }).catch(() => { if (epoch === sessionEpoch) set({ isOffline: true }); });
    } catch (error) {
      stopSession();
      set({ isLocked: true, error: password === undefined
        ? 'Biometria indisponivel ou cancelada. Use sua senha mestra.' : errorMessage(error) });
      throw error;
    } finally {
      set({ isLoading: false, authPhase: 'idle' });
    }
  },
  reauthenticate: async (password) => {
    const session = localSession;
    if (!session || get().isLoading || get().isLocked) throw new Error('Cofre bloqueado.');
    set({ isLoading: true });
    const epoch = sessionEpoch;
    try {
      if (password !== undefined) await vaultCryptoService.unlockWithPassword(session.user.id, password, session.kdfSalt);
      else await vaultCryptoService.loadKey(session.user.id, 'Confirme o acesso de emergencia');
      requireEpoch(epoch);
      if (localSession !== session) throw new Error('SESSION_CHANGED');
    } catch (error) {
      if (epoch !== sessionEpoch) vaultCryptoService.lockKey();
      throw error;
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
      const credential = session.authVersion === 2 ? await deriveAuthentication(password, session.kdfSalt) : password;
      await apiClient.delete('/users/me', { password: credential });
      syncService.stop(); accessSocketService.disconnect(); apiClient.cancelRequests();
      try { await offlineVaultService.eraseAccount(session.user.id); }
      finally {
        stopSession();
        localSession = null;
        set({ user: null, isLocked: true });
        const cleanup = await Promise.allSettled([
          vaultCryptoService.clearKey(session.user.id), apiClient.clearToken(),
          SecureStore.deleteItemAsync(SESSION_KEY), offlineVaultService.close(),
          accountSecurityService.acknowledgeKit(session.user.email),
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
  changePassword: async (current, next) => {
    const session = localSession;
    if (!session || get().isLoading) throw new Error('Sessao indisponivel.');
    if (!session.vaultProtection) throw new Error('Prepare o kit de recuperacao antes de trocar a senha.');
    const epoch = sessionEpoch;
    let completionEpoch = epoch;
    set({ isLoading: true });
    const key = await openProtection(current, session.vaultProtection).catch((error) => { set({ isLoading: false }); throw error; });
    try {
      const prepared = await changeProtection(next, key, session.vaultProtection);
      const currentCredential = await deriveAuthentication(current, session.kdfSalt);
      requireEpoch(epoch);
      await apiClient.post('/auth/security', { currentCredential, credential: prepared.credential, protection: prepared.protection,
        securityVersion: session.securityVersion });
      requireEpoch(epoch);
      stopSession();
      completionEpoch = sessionEpoch;
      await apiClient.clearToken();
      requireEpoch(completionEpoch);
      set({ isLocked: true });
    } finally { destroyVaultKey(key); set({ isLoading: false }); }
    requireEpoch(completionEpoch);
    await get().login(session.user.email, next);
  },
  generateRecoveryKit: async (password) => {
    const session = localSession;
    if (!session || get().isLoading) throw new Error('Sessao indisponivel.');
    const epoch = sessionEpoch;
    let completionEpoch = epoch;
    set({ isLoading: true });
    let key;
    try {
      key = session.vaultProtection ? await openProtection(password, session.vaultProtection) : await deriveKey(password, session.kdfSalt, true);
      const prepared = await createProtection(password, undefined, key);
      const currentCredential = session.authVersion === 2 ? await deriveAuthentication(password, session.kdfSalt) : password;
      await accountSecurityService.stageKit(session.user.email, prepared.recoveryCode, prepared.protection.recoverySalt);
      requireEpoch(epoch);
      await apiClient.post('/auth/security', { currentCredential, credential: prepared.credential, protection: prepared.protection,
        recoveryCredential: prepared.recoveryCredential, securityVersion: session.securityVersion ?? 0 });
      requireEpoch(epoch);
      stopSession(); completionEpoch = sessionEpoch;
      await apiClient.clearToken(); requireEpoch(completionEpoch); set({ isLocked: true });
    } finally { if (key) destroyVaultKey(key); set({ isLoading: false }); }
    requireEpoch(completionEpoch);
    await get().login(session.user.email, password);
    return (await accountSecurityService.pendingKit(session.user.email, localSession?.vaultProtection?.recoverySalt))!;
  },
  getRecoverySalt: () => localSession?.vaultProtection?.recoverySalt,
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
