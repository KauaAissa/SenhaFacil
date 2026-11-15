import { create } from 'zustand';
import type { AppStateStatus } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createProtection, changeProtection, openProtection, deriveAuthentication, deriveKey, destroyVaultKey, type VaultProtection } from '@senha-facil/crypto';
import { apiClient, ApiError } from '../services/api.client';
import { vaultCryptoService, type BiometricStatus } from '../services/vault-crypto.service';
import { offlineVaultService } from '../services/offline-vault.service';
import { connectivityService } from '../services/connectivity.service';
import { syncService } from '../services/sync.service';
import { accessSocketService } from '../services/access-socket.service';
import { registerPushToken } from '../services/push-notifications.service';
import { sensitiveClipboard } from '../services/clipboard.service';
import { accountSecurityService } from '../services/account-security.service';
import { getErrorMessage, UserFacingError } from '../services/error-messages';
import { accountLogin, loginIdentifierError, loginPayload, normalizeLoginIdentifier } from '../services/input-validation';
import { nativePromptService } from '../services/native-prompt.service';
import type { DeviceLockStatus } from '../services/device-credential.service';
import { vaultActivityService } from '../services/vault-activity.service';
import { installationData } from '../services/installation.service';

export type UnlockMethod = 'biometric' | 'device';

export type UserRole = 'ELDERLY' | 'CAREGIVER';
export interface AuthUser { id: string; name: string; email: string | null; loginPhone?: string | null; role: UserRole; surname?: string; phone?: string | null; dateOfBirth?: string | null }
interface LocalSession { user: AuthUser; kdfSalt: string; onboarded?: boolean; authVersion?: number; securityVersion?: number; vaultProtection?: VaultProtection }
interface AuthResponse { accessToken: string; refreshToken: string; user: AuthUser & {
  kdfSalt: string; authVersion: number; securityVersion: number; vaultProtection: VaultProtection | null;
} }
interface RegisterInput { name: string; email?: string; identifier?: string; phone?: string; password: string; role: UserRole }
interface AuthState {
  user: AuthUser | null;
  isReady: boolean;
  isLoading: boolean;
  authPhase: 'idle' | 'parameters' | 'deriving' | 'authenticating' | 'opening' | 'services';
  isLocked: boolean;
  isOffline: boolean;
  needsOnboarding: boolean;
  error: string | null;
  biometrics: BiometricStatus | null;
  deviceLock: DeviceLockStatus | null;
  refreshBiometrics: () => Promise<void>;
  configureDeviceLock: (enabled: boolean, password?: string) => Promise<void>;
  configureBiometrics: (enabled: boolean, password?: string) => Promise<void>;
  bootstrap: () => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  unlock: (password?: string, method?: UnlockMethod) => Promise<void>;
  reauthenticate: (password?: string, method?: UnlockMethod) => Promise<void>;
  lock: () => void;
  lockAutomatically: () => void;
  handleAppStateChange: (state: AppStateStatus) => void;
  logout: () => Promise<void>;
  updateProfile: (profile: { name: string; surname: string; phone: string | null; dateOfBirth: string | null }) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  generateRecoveryKit: (password: string) => Promise<string>;
  getRecoverySalt: () => string | undefined;
  revokeSecuritySessions: (password: string, sessionId?: string) => Promise<number>;
}

const SESSION_KEY = 'sf_local_session_v2';
let localSession: LocalSession | null = null;
let sessionEpoch = 0;
let applicationState: AppStateStatus = 'active';

function requireEpoch(epoch: number): void {
  if (epoch !== sessionEpoch) throw new Error('SESSION_CHANGED');
}

function stopSession(preserveClipboard = false): void {
  sessionEpoch += 1;
  vaultActivityService.reset();
  if (!preserveClipboard) void sensitiveClipboard.clear().catch(() => undefined);
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
  biometrics: null,
  deviceLock: null,
  refreshBiometrics: async () => {
    const session = localSession;
    const epoch = sessionEpoch;
    if (!session) { set({ biometrics: null, deviceLock: null }); return; }
    const [biometrics, deviceLock] = await Promise.allSettled([
      vaultCryptoService.biometricStatus(session.user.id), vaultCryptoService.deviceLockStatus(session.user.id),
    ]);
    if (epoch !== sessionEpoch || session !== localSession) return;
    set({
      biometrics: biometrics.status === 'fulfilled' ? biometrics.value : null,
      deviceLock: deviceLock.status === 'fulfilled' ? deviceLock.value : null,
      ...((biometrics.status === 'rejected' || deviceLock.status === 'rejected') ? {
        error: getErrorMessage(biometrics.status === 'rejected' ? biometrics.reason
          : deviceLock.status === 'rejected' ? deviceLock.reason : null,
        'Não foi possível verificar uma opção de desbloqueio. Use sua senha mestra ou a outra opção disponível e tente novamente em Segurança.'),
      } : {}),
    });
  },
  configureDeviceLock: async (enabled, password) => {
    const session = localSession;
    if (!session || get().isLocked || get().isLoading) throw new Error('Cofre bloqueado.');
    const epoch = sessionEpoch;
    set({ isLoading: true, error: null });
    try {
      if (enabled) {
        if (!password) throw new UserFacingError('Preencha sua senha mestra atual para ativar o bloqueio do aparelho.');
        await vaultCryptoService.enableDeviceLock(session.user.id, password, session.kdfSalt);
      } else await vaultCryptoService.disableDeviceLock(session.user.id);
      requireEpoch(epoch);
      await get().refreshBiometrics();
    } catch (error) {
      if (epoch === sessionEpoch) set({ error: getErrorMessage(error, enabled
        ? 'O bloqueio do aparelho não foi ativado. Sua senha mestra continua funcionando.'
        : 'Não foi possível desativar o bloqueio do aparelho. Tente novamente.') });
      throw error;
    } finally { set({ isLoading: false }); }
  },
  configureBiometrics: async (enabled, password) => {
    const session = localSession;
    if (!session || get().isLocked || get().isLoading) throw new Error('Cofre bloqueado.');
    const epoch = sessionEpoch;
    set({ isLoading: true, error: null });
    try {
      if (enabled) {
        if (!password) throw new UserFacingError('Preencha sua senha mestra atual para ativar a biometria.');
        await vaultCryptoService.enableBiometrics(session.user.id, password, session.kdfSalt);
      } else await vaultCryptoService.disableBiometrics(session.user.id);
      requireEpoch(epoch);
      await get().refreshBiometrics();
    } catch (error) {
      set({ error: getErrorMessage(error, enabled
        ? 'A biometria não foi ativada. Se você cancelou a confirmação, tente novamente. Sua senha mestra continua funcionando.'
        : 'Não foi possível desativar a biometria. Tente novamente antes de sair desta tela.') });
      throw error;
    } finally { set({ isLoading: false }); }
  },
  bootstrap: async () => {
    try {
      connectivityService.start();
      const cached = await SecureStore.getItemAsync(SESSION_KEY);
      if (cached) {
        const parsed: LocalSession = JSON.parse(cached);
        if (!parsed.user?.id || !/^[0-9a-f]{32}$/.test(parsed.kdfSalt) ||
            !['ELDERLY', 'CAREGIVER'].includes(parsed.user.role)) throw new Error('INVALID_LOCAL_SESSION');
        accountLogin(parsed.user);
        localSession = parsed;
        parsed.onboarded = parsed.onboarded === true || (await SecureStore.getItemAsync(`sf_onboarded_${parsed.user.id}`)) === '1';
        set({ user: parsed.user, isLocked: true, needsOnboarding: !parsed.onboarded });
        await get().refreshBiometrics();
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
    if (input.identifier !== undefined && input.email !== undefined) throw new UserFacingError('Escolha apenas um login: e-mail ou celular com DDD.');
    const invalidIdentifier = loginIdentifierError(input.identifier ?? input.email ?? '');
    if (invalidIdentifier) throw new UserFacingError(invalidIdentifier);
    const normalized = normalizeLoginIdentifier(input.identifier ?? input.email ?? '')!;
    const { email: _email, identifier: _identifier, ...registration } = input;
    const epoch = sessionEpoch;
    set({ isLoading: true, error: null });
    try {
      const device = await installationData();
      requireEpoch(epoch);
      const prepared = await createProtection(input.password);
      let response: AuthResponse;
      try {
        await accountSecurityService.stageKit(normalized, prepared.recoveryCode, prepared.protection.recoverySalt);
        requireEpoch(epoch);
        response = await apiClient.post<AuthResponse>('/auth/register', { ...registration, ...loginPayload(normalized), ...device, password: prepared.credential,
          kdfSalt: prepared.protection.salt, authVersion: 2,
          protection: prepared.protection, recoveryCredential: prepared.recoveryCredential });
      } finally { destroyVaultKey(prepared.key); }
      const { kdfSalt, authVersion, securityVersion, vaultProtection, ...user } = response.user;
      const established = await establishSession(user, kdfSalt, input.password, response.accessToken, response.refreshToken, { authVersion, securityVersion, vaultProtection }, epoch);
      requireEpoch(established);
      set({ user, isLocked: false, isLoading: false, needsOnboarding: !localSession?.onboarded });
      void get().refreshBiometrics();
      void startOnlineServices().then((online) => {
        if (established === sessionEpoch) set({ isOffline: !online });
      }).catch(() => { if (established === sessionEpoch) set({ isOffline: true }); });
    } catch (error) {
      set({ user: localSession?.user ?? null, isLoading: false, isLocked: true, error: getErrorMessage(error) });
      throw error;
    }
  },
  login: async (identifier, password) => {
    if (get().isLoading) throw new Error('Aguarde a operacao atual.');
    const invalidIdentifier = loginIdentifierError(identifier);
    if (invalidIdentifier) throw new UserFacingError(invalidIdentifier);
    const normalized = normalizeLoginIdentifier(identifier)!;
    const epoch = sessionEpoch;
    set({ isLoading: true, error: null, authPhase: 'parameters' });
    try {
      const device = await installationData();
      requireEpoch(epoch);
      const parameters = await apiClient.post<{ kdfSalt: string; authVersion: number }>('/auth/parameters', loginPayload(normalized));
      requireEpoch(epoch);
      set({ authPhase: 'deriving' });
      const credential = parameters.authVersion === 2 ? await deriveAuthentication(password, parameters.kdfSalt) : password;
      requireEpoch(epoch);
      set({ authPhase: 'authenticating' });
      let response = await apiClient.post<AuthResponse>('/auth/login', { ...loginPayload(normalized), ...device, password: credential, authVersion: parameters.authVersion });
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
          response = await apiClient.post<AuthResponse>('/auth/login', { ...loginPayload(normalized), ...device, password: prepared.credential, authVersion: 2 });
        } finally { destroyVaultKey(legacyKey); }
      }
      const { kdfSalt, authVersion, securityVersion, vaultProtection, ...user } = response.user;
      set({ authPhase: 'opening' });
      const established = await establishSession(user, kdfSalt, password, response.accessToken, response.refreshToken, { authVersion, securityVersion, vaultProtection }, epoch);
      requireEpoch(established);
      set({ user, isLocked: false, isLoading: false, needsOnboarding: !localSession?.onboarded, authPhase: 'services' });
      void get().refreshBiometrics();
      void startOnlineServices().then((online) => {
        if (established === sessionEpoch) set({ isOffline: !online, authPhase: 'idle' });
      }).catch(() => { if (established === sessionEpoch) set({ isOffline: true, authPhase: 'idle' }); });
    } catch (error) {
      set({ user: localSession?.user ?? null, isLoading: false, isLocked: true, error: getErrorMessage(error), authPhase: 'idle' });
      throw error;
    }
  },
  unlock: async (password, method = 'biometric') => {
    if (!localSession || get().isLoading) return;
    set({ isLoading: true, error: null, authPhase: 'opening' });
    const epoch = sessionEpoch;
    try {
      const session = localSession;
      if (password !== undefined) await vaultCryptoService.unlockWithPassword(session.user.id, password, session.kdfSalt);
      else if (method === 'device') await vaultCryptoService.loadDeviceKey(session.user.id);
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
      set({ isLocked: true, error: getErrorMessage(error, password === undefined
        ? 'A confirmação do aparelho não foi concluída. Tente novamente ou use sua senha mestra.' : undefined) });
      void get().refreshBiometrics();
      throw error;
    } finally {
      set({ isLoading: false, authPhase: 'idle' });
    }
  },
  reauthenticate: async (password, method = 'biometric') => {
    const session = localSession;
    if (!session || get().isLoading || get().isLocked) throw new Error('Cofre bloqueado.');
    set({ isLoading: true });
    const epoch = sessionEpoch;
    try {
      if (password !== undefined) await vaultCryptoService.unlockWithPassword(session.user.id, password, session.kdfSalt);
      else if (method === 'device') await vaultCryptoService.loadDeviceKey(session.user.id);
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
  lockAutomatically: () => {
    stopSession(true);
    set({ isLocked: true, error: null });
  },
  handleAppStateChange: (state) => {
    applicationState = state;
    nativePromptService.handleAppStateChange(state);
    const session = get();
    if (state === 'background' && !nativePromptService.isActive && (session.user || session.isLoading)) session.lockAutomatically();
  },
  logout: async () => {
    stopSession();
    set({ user: null, isLocked: true, isLoading: true, error: null, biometrics: null, deviceLock: null });
    localSession = null;
    try {
      await apiClient.patch('/users/me/fcm-token', { fcmToken: null }).catch(() => undefined);
      await apiClient.revokeSession().catch(() => undefined);
      const cleanup = await Promise.allSettled([
        apiClient.clearToken(), SecureStore.deleteItemAsync(SESSION_KEY), offlineVaultService.close(),
      ]);
      if (cleanup.some((result) => result.status === 'rejected')) {
        throw new UserFacingError('A conta foi bloqueada, mas a limpeza da sessão neste aparelho não terminou. Feche o aplicativo e tente sair novamente.');
      }
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
          accountSecurityService.acknowledgeKit(accountLogin(session.user)),
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
    await get().login(accountLogin(session.user), next);
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
      await accountSecurityService.stageKit(accountLogin(session.user), prepared.recoveryCode, prepared.protection.recoverySalt);
      requireEpoch(epoch);
      await apiClient.post('/auth/security', { currentCredential, credential: prepared.credential, protection: prepared.protection,
        recoveryCredential: prepared.recoveryCredential, securityVersion: session.securityVersion ?? 0 });
      requireEpoch(epoch);
      stopSession(); completionEpoch = sessionEpoch;
      await apiClient.clearToken(); requireEpoch(completionEpoch); set({ isLocked: true });
    } finally { if (key) destroyVaultKey(key); set({ isLoading: false }); }
    requireEpoch(completionEpoch);
    await get().login(accountLogin(session.user), password);
    return (await accountSecurityService.pendingKit(accountLogin(session.user), localSession?.vaultProtection?.recoverySalt))!;
  },
  getRecoverySalt: () => localSession?.vaultProtection?.recoverySalt,
  revokeSecuritySessions: async (password, sessionId) => {
    const session = localSession;
    if (!session || get().isLocked || get().isLoading) throw new Error('Cofre bloqueado.');
    const epoch = sessionEpoch;
    set({ isLoading: true, error: null });
    try {
      const currentCredential = session.authVersion === 2 ? await deriveAuthentication(password, session.kdfSalt) : password;
      requireEpoch(epoch);
      const result = await apiClient.post<{ revoked: number }>('/security/sessions/revoke', {
        mode: sessionId ? 'ONE' : 'OTHERS', ...(sessionId ? { sessionId } : {}), currentCredential,
      });
      requireEpoch(epoch);
      if (!Number.isInteger(result.revoked) || result.revoked < 0) throw new UserFacingError('O encerramento das sessões não foi confirmado. Atualize a lista.');
      return result.revoked;
    } finally { set({ isLoading: false }); }
  },
}));

nativePromptService.onSettled(() => {
  const session = useAuthStore.getState();
  if (applicationState === 'background' && (session.user || session.isLoading)) session.lockAutomatically();
});
