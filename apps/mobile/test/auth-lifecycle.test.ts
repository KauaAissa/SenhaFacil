import { randomUUID } from 'node:crypto';
import * as SecureStore from 'expo-secure-store';
import * as Clipboard from 'expo-clipboard';
import { useAuthStore } from '../src/stores/auth.store';
import { vaultCryptoService } from '../src/services/vault-crypto.service';
import { offlineVaultService } from '../src/services/offline-vault.service';
import { apiClient } from '../src/services/api.client';
import { createProtection, destroyVaultKey, deriveAuthentication, encryptVaultItem, decryptVaultItem } from '@senha-facil/crypto';
import { accountSecurityService } from '../src/services/account-security.service';
import { sensitiveClipboard } from '../src/services/clipboard.service';
import { nativePromptService } from '../src/services/native-prompt.service';
import { encodeBase64, exportVaultKey } from '@senha-facil/crypto';

const password = 'offline master password';
const salt = '0102030405060708090a0b0c0d0e0f10';
let owner: string;

beforeEach(async () => {
  useAuthStore.getState().handleAppStateChange('active');
  owner = randomUUID();
  await SecureStore.setItemAsync('sf_local_session_v2', JSON.stringify({ user: { id: owner, name: 'Owner', role: 'ELDERLY', email: 'owner@example.invalid' }, kdfSalt: salt }));
  await vaultCryptoService.initializeKey(owner, password, salt);
  vaultCryptoService.lockKey();
  await useAuthStore.getState().bootstrap();
}, 30_000);
afterEach(async () => {
  useAuthStore.getState().lock();
  await sensitiveClipboard.clear();
  jest.useRealTimers();
  await offlineVaultService.close();
  await apiClient.clearToken();
  jest.restoreAllMocks();
});

test('restored session stays locked and offline unlock does not require a JWT', async () => {
  expect(useAuthStore.getState().isLocked).toBe(true);
  expect(vaultCryptoService.isLoaded).toBe(false);
  await useAuthStore.getState().unlock(password);
  expect(useAuthStore.getState()).toEqual(expect.objectContaining({ isLocked: false, isOffline: true }));
  useAuthStore.getState().lock();
  expect(vaultCryptoService.isLoaded).toBe(false);
}, 30_000);

test('wrong offline password never unlocks the session', async () => {
  await expect(useAuthStore.getState().unlock('wrong')).rejects.toThrow();
  expect(useAuthStore.getState().isLocked).toBe(true);
  expect(vaultCryptoService.isLoaded).toBe(false);
}, 30_000);

test('returning from a notification or native prompt requires only one unlock', async () => {
  const unlock = jest.spyOn(vaultCryptoService, 'unlockWithPassword');
  useAuthStore.getState().handleAppStateChange('inactive');
  await useAuthStore.getState().unlock(password);
  useAuthStore.getState().handleAppStateChange('inactive');
  useAuthStore.getState().handleAppStateChange('active');
  expect(unlock).toHaveBeenCalledTimes(1);
  expect(useAuthStore.getState().isLocked).toBe(false);
  expect(vaultCryptoService.isLoaded).toBe(true);
}, 30_000);

test('backgrounding locks the vault but preserves the copied password for its five minute lifetime', async () => {
  await useAuthStore.getState().unlock(password);
  jest.useFakeTimers();
  await sensitiveClipboard.copy('fictitious-secret');
  useAuthStore.getState().handleAppStateChange('background');
  expect(useAuthStore.getState().isLocked).toBe(true);
  expect(vaultCryptoService.isLoaded).toBe(false);
  await jest.advanceTimersByTimeAsync(5 * 60_000 - 1);
  expect(await Clipboard.getStringAsync()).toBe('fictitious-secret');
  await jest.advanceTimersByTimeAsync(1);
  expect(await Clipboard.getStringAsync()).toBe('');
}, 30_000);

test('automatic locking preserves the clipboard but manual locking clears it immediately', async () => {
  await useAuthStore.getState().unlock(password);
  await sensitiveClipboard.copy('fictitious-secret');
  const clear = jest.spyOn(sensitiveClipboard, 'clear');
  useAuthStore.getState().lockAutomatically();
  expect(clear).not.toHaveBeenCalled();
  expect(await Clipboard.getStringAsync()).toBe('fictitious-secret');
  useAuthStore.getState().lock();
  expect(clear).toHaveBeenCalledTimes(1);
  await clear.mock.results[0].value;
  expect(await Clipboard.getStringAsync()).toBe('');
}, 30_000);

test('login reports its pending phase and clears loading after a parameters failure', async () => {
  let rejectParameters!: (error: Error) => void;
  let started!: () => void;
  const parametersStarted = new Promise<void>((resolve) => { started = resolve; });
  jest.spyOn(apiClient, 'post').mockImplementation(() => new Promise((_resolve, reject) => { rejectParameters = reject; started(); }));
  const attempt = useAuthStore.getState().login('diagnostic@example.invalid', 'fictitious-password');
  expect(useAuthStore.getState()).toEqual(expect.objectContaining({ isLoading: true, authPhase: 'parameters' }));
  await parametersStarted;
  rejectParameters(new Error('parameters unavailable'));
  await expect(attempt).rejects.toThrow('parameters unavailable');
  expect(useAuthStore.getState()).toEqual(expect.objectContaining({ isLoading: false, authPhase: 'idle', isLocked: true }));
});

test('offline unlock completes without waiting for online profile and ignores completion after locking', async () => {
  jest.spyOn(apiClient, 'hasToken').mockResolvedValue(true);
  let finishProfile!: (value: unknown) => void;
  const profile = new Promise((resolve) => { finishProfile = resolve; });
  jest.spyOn(apiClient, 'get').mockImplementation(async () => profile as never);
  await useAuthStore.getState().unlock(password);
  expect(useAuthStore.getState()).toEqual(expect.objectContaining({ isLoading: false, isLocked: false, isOffline: true }));
  useAuthStore.getState().lock();
  finishProfile({ id: owner, name: 'Owner', email: 'owner@example.invalid', role: 'ELDERLY' });
  await profile;
  await Promise.resolve();
  expect(useAuthStore.getState().isLocked).toBe(true);
  expect(vaultCryptoService.isLoaded).toBe(false);
}, 30_000);

test('onboarding completion persists only for the current account', async () => {
  await useAuthStore.getState().completeOnboarding();
  expect(await SecureStore.getItemAsync(`sf_onboarded_${owner}`)).toBe('1');
  await useAuthStore.getState().bootstrap();
  expect(useAuthStore.getState().needsOnboarding).toBe(false);
  expect(await SecureStore.getItemAsync(`sf_onboarded_${randomUUID()}`)).toBeNull();
});

test('remote deletion destroys memory key and signs out even if local cache erase fails', async () => {
  await useAuthStore.getState().unlock(password);
  jest.spyOn(apiClient, 'delete').mockResolvedValue(undefined);
  jest.spyOn(offlineVaultService, 'eraseAccount').mockRejectedValue(new Error('disk failure'));
  await expect(useAuthStore.getState().deleteAccount(password)).rejects.toThrow('disk failure');
  expect(useAuthStore.getState().user).toBeNull();
  expect(vaultCryptoService.isLoaded).toBe(false);
  expect(await SecureStore.getItemAsync('sf_local_session_v2')).toBeNull();
}, 30_000);

test('v2 local envelope unlocks offline without sending or storing the master password', async () => {
  const prepared = await createProtection(password);
  try {
    await vaultCryptoService.initializeProtectedKey(owner, password, prepared.protection);
    vaultCryptoService.lockKey();
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    await vaultCryptoService.unlockWithPassword(owner, password, prepared.protection.salt);
    expect(vaultCryptoService.isLoaded).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await SecureStore.getItemAsync(`sf_verifier_${owner}`)).toBeNull();
    const stored = await SecureStore.getItemAsync(`sf_protection_${owner}`);
    expect(stored).not.toContain(password);
    vaultCryptoService.lockKey();
    await expect(vaultCryptoService.unlockWithPassword(owner, 'wrong', prepared.protection.salt)).rejects.toThrow();
    expect(vaultCryptoService.isLoaded).toBe(false);
  } finally { destroyVaultKey(prepared.key); }
}, 30_000);

test('registration sends separated credentials and decrypts its returned envelope before loading a session', async () => {
  const post = jest.spyOn(apiClient, 'post').mockImplementation(async (path, body) => {
    if (path !== '/auth/register') throw new Error('unexpected endpoint');
    const input = body as { password: string; protection: object; recoveryCredential: string; kdfSalt: string };
    expect(input.password).not.toBe(password);
    expect(input.password).toMatch(/^[0-9a-f]{64}$/);
    expect(input.recoveryCredential).toMatch(/^[0-9a-f]{64}$/);
    return { accessToken: 'fixture-token', refreshToken: 'fixture-refresh', user: { id: owner, name: 'Owner', email: 'owner@example.invalid',
      role: 'ELDERLY', kdfSalt: input.kdfSalt, authVersion: 2, securityVersion: 1, vaultProtection: input.protection } } as never;
  });
  jest.spyOn(apiClient, 'get').mockResolvedValue({ id: owner, name: 'Owner', email: 'owner@example.invalid', role: 'ELDERLY' });
  await useAuthStore.getState().register({ name: 'Owner', email: 'owner@example.invalid', password, role: 'ELDERLY' });
  expect(post).toHaveBeenCalledTimes(1);
  expect(vaultCryptoService.isLoaded).toBe(true);
  expect(JSON.parse((await SecureStore.getItemAsync('sf_local_session_v2'))!).authVersion).toBe(2);
}, 45_000);

test('phone registration keeps the recovery kit, opens once and restores offline with the same vault key', async () => {
  const identifier = '+5511912345678';
  const profile = { id: owner, name: 'Phone fixture', email: null, loginPhone: identifier, role: 'ELDERLY' };
  const post = jest.spyOn(apiClient, 'post').mockImplementation(async (path, body) => {
    if (path !== '/auth/register') throw new Error('unexpected endpoint');
    const input = body as { identifier: string; email?: string; password: string; protection: object; kdfSalt: string };
    expect(input.identifier).toBe(identifier);
    expect(input.email).toBeUndefined();
    expect(input.password).not.toBe(password);
    return { accessToken: 'fixture-token', refreshToken: 'fixture-refresh', user: {
      ...profile, kdfSalt: input.kdfSalt, authVersion: 2, securityVersion: 1, vaultProtection: input.protection,
    } } as never;
  });
  jest.spyOn(apiClient, 'get').mockResolvedValue(profile);
  await useAuthStore.getState().register({ name: 'Phone fixture', identifier: '(11) 91234-5678', password, role: 'ELDERLY' });
  expect(post).toHaveBeenCalledTimes(1);
  expect(useAuthStore.getState()).toMatchObject({ isLocked: false, user: { email: null, loginPhone: identifier } });
  const ciphertext = await encryptVaultItem({ password: 'phone-vault-fixture' }, vaultCryptoService.key);
  expect(await accountSecurityService.pendingKit(identifier, useAuthStore.getState().getRecoverySalt())).toBeTruthy();
  useAuthStore.getState().lock();
  await useAuthStore.getState().bootstrap();
  await useAuthStore.getState().unlock(password);
  expect(await decryptVaultItem(ciphertext, vaultCryptoService.key)).toEqual({ password: 'phone-vault-fixture' });
  expect(useAuthStore.getState().isLocked).toBe(false);
}, 45_000);

test('legacy login migrates the same vault key and logs in again with a derived credential', async () => {
  let protection: object | null = null;
  let derived = '';
  const post = jest.spyOn(apiClient, 'post').mockImplementation(async (path, body) => {
    if (path === '/auth/parameters') return { kdfSalt: salt, authVersion: 1 } as never;
    if (path === '/auth/security') {
      const update = body as { currentCredential: string; credential: string; protection: object };
      expect(update.currentCredential).toBe(password); protection = update.protection; derived = update.credential;
      return { securityVersion: 1 } as never;
    }
    if (path !== '/auth/login') throw new Error('unexpected endpoint');
    const input = body as { authVersion: number; password: string };
    if (input.authVersion === 2) expect(input.password).toBe(derived);
    return { accessToken: 'fixture-token', refreshToken: 'fixture-refresh', user: { id: owner, name: 'Owner', email: 'owner@example.invalid',
      role: 'ELDERLY', kdfSalt: protection ? (protection as { salt: string }).salt : salt,
      authVersion: protection ? 2 : 1, securityVersion: protection ? 1 : 0, vaultProtection: protection } } as never;
  });
  jest.spyOn(apiClient, 'get').mockResolvedValue({ id: owner, name: 'Owner', email: 'owner@example.invalid', role: 'ELDERLY' });
  await useAuthStore.getState().login('owner@example.invalid', password);
  expect(post.mock.calls.map(([path]) => path)).toEqual(['/auth/parameters', '/auth/login', '/auth/security', '/auth/login']);
  const local = JSON.parse((await SecureStore.getItemAsync('sf_local_session_v2'))!);
  expect(local.authVersion).toBe(2);
  expect(await deriveAuthentication(password, local.kdfSalt)).toBe(derived);
}, 60_000);

test('failed kit replacement is not presented as an activated kit', async () => {
  await accountSecurityService.stageKit('owner@example.invalid', 'NEW-CODE', '01'.repeat(16));
  jest.spyOn(apiClient, 'post').mockResolvedValue({ recoverySalt: '02'.repeat(16) });
  expect(await accountSecurityService.pendingKit('owner@example.invalid')).toBeNull();
});

test('an activated pending kit remains available offline with the locally confirmed envelope', async () => {
  const recoverySalt = '01'.repeat(16);
  await accountSecurityService.stageKit('owner@example.invalid', 'OFFLINE-CODE', recoverySalt);
  const post = jest.spyOn(apiClient, 'post').mockRejectedValue(new Error('offline'));
  expect(await accountSecurityService.pendingKit('owner@example.invalid', recoverySalt)).toBe('OFFLINE-CODE');
  expect(post).not.toHaveBeenCalled();
});

test('locking during login prevents a late response from reopening a session', async () => {
  let finish!: (value: unknown) => void;
  const pending = new Promise((resolve) => { finish = resolve; });
  let started!: () => void;
  const parametersStarted = new Promise<void>((resolve) => { started = resolve; });
  const post = jest.spyOn(apiClient, 'post').mockImplementation(async () => { started(); return pending as never; });
  const login = useAuthStore.getState().login('owner@example.invalid', password);
  const rejected = expect(login).rejects.toThrow('SESSION_CHANGED');
  await parametersStarted;
  useAuthStore.getState().lock();
  finish({ kdfSalt: salt, authVersion: 1 });
  await rejected;
  expect(post).toHaveBeenCalledTimes(1);
  expect(useAuthStore.getState().isLocked).toBe(true);
  expect(vaultCryptoService.isLoaded).toBe(false);
});

test('a v2 login without its envelope never falls back to a legacy key', async () => {
  jest.spyOn(apiClient, 'post').mockImplementation(async (path) => path === '/auth/parameters'
    ? { kdfSalt: salt, authVersion: 2 } as never
    : { accessToken: 'fixture-token', refreshToken: 'fixture-refresh', user: { id: owner, name: 'Owner', email: 'owner@example.invalid',
      role: 'ELDERLY', kdfSalt: salt, authVersion: 2, securityVersion: 1, vaultProtection: null } } as never);
  await expect(useAuthStore.getState().login('owner@example.invalid', password)).rejects.toThrow('Envelope');
  expect(useAuthStore.getState().isLocked).toBe(true);
  expect(vaultCryptoService.isLoaded).toBe(false);
}, 30_000);

test('logout followed by a v2 login opens the vault once without rewriting a biometric key or requesting a second unlock', async () => {
  const prepared = await createProtection(password);
  try {
    await SecureStore.setItemAsync(`sf_biometrics_${owner}`, '1');
    await SecureStore.setItemAsync(`sf_key_${owner}`, encodeBase64(exportVaultKey(prepared.key)));
    jest.spyOn(apiClient, 'patch').mockResolvedValue(undefined);
    jest.spyOn(apiClient, 'revokeSession').mockResolvedValue(undefined);
    await useAuthStore.getState().logout();
    const writes = jest.mocked(SecureStore.setItemAsync);
    writes.mockClear();
    const post = jest.spyOn(apiClient, 'post').mockImplementation(async (path) => {
      if (path === '/auth/parameters') return { authVersion: 2, kdfSalt: prepared.protection.salt } as never;
      if (path !== '/auth/login') throw new Error('unexpected endpoint');
      return { accessToken: 'fixture', refreshToken: 'refresh', user: {
        id: owner, name: 'Owner', role: 'ELDERLY', email: 'owner@example.invalid', authVersion: 2,
        securityVersion: 1, kdfSalt: prepared.protection.salt, vaultProtection: prepared.protection,
      } } as never;
    });
    jest.spyOn(apiClient, 'get').mockResolvedValue({ id: owner, name: 'Owner', role: 'ELDERLY', email: 'owner@example.invalid' });
    await useAuthStore.getState().login('owner@example.invalid', password);
    expect(post.mock.calls.map(([path]) => path)).toEqual(['/auth/parameters', '/auth/login']);
    expect(writes.mock.calls.every(([, , options]) => !options?.requireAuthentication)).toBe(true);
    expect(useAuthStore.getState()).toMatchObject({ isLocked: false, isLoading: false });
    expect(vaultCryptoService.isLoaded).toBe(true);
  } finally { destroyVaultKey(prepared.key); }
}, 45_000);

test('returning from a trusted native prompt does not lock again, but leaving the app during it still locks', async () => {
  await useAuthStore.getState().unlock(password);
  await nativePromptService.run(async () => {
    useAuthStore.getState().handleAppStateChange('background');
    expect(useAuthStore.getState().isLocked).toBe(false);
    useAuthStore.getState().handleAppStateChange('active');
  });
  expect(useAuthStore.getState().isLocked).toBe(false);
  await nativePromptService.run(async () => { useAuthStore.getState().handleAppStateChange('background'); });
  expect(useAuthStore.getState().isLocked).toBe(true);
  expect(vaultCryptoService.isLoaded).toBe(false);
}, 30_000);

test('a native result arriving before the Android foreground event does not require a second login', async () => {
  await useAuthStore.getState().unlock(password);
  const prompt = nativePromptService.run(async () => {
    useAuthStore.getState().handleAppStateChange('background');
  });
  await Promise.resolve();
  useAuthStore.getState().handleAppStateChange('active');
  await prompt;
  expect(useAuthStore.getState().isLocked).toBe(false);
  expect(vaultCryptoService.isLoaded).toBe(true);
}, 30_000);

test('backgrounding while password login is in flight prevents late automatic unlocking', async () => {
  let finish!: (value: unknown) => void;
  let started!: () => void;
  const parametersStarted = new Promise<void>((resolve) => { started = resolve; });
  jest.spyOn(apiClient, 'post').mockImplementation(async () => new Promise((resolve) => { finish = resolve; started(); }) as never);
  const login = useAuthStore.getState().login('owner@example.invalid', password);
  const rejected = expect(login).rejects.toThrow('SESSION_CHANGED');
  await parametersStarted;
  useAuthStore.getState().handleAppStateChange('background');
  finish({ authVersion: 2, kdfSalt: salt });
  await rejected;
  expect(vaultCryptoService.isLoaded).toBe(false);
});

test('invalid registration email is rejected locally before staging a kit or calling the API', async () => {
  const post = jest.spyOn(apiClient, 'post');
  const kit = jest.spyOn(accountSecurityService, 'stageKit');
  await expect(useAuthStore.getState().register({ name: 'Fixture', email: 'familiar@teste', password, role: 'CAREGIVER' })).rejects.toThrow('e-mail completo');
  expect(post).not.toHaveBeenCalled();
  expect(kit).not.toHaveBeenCalled();
});

test('device unlock and offline emergency use their own protected operation, never implicit biometrics', async () => {
  await useAuthStore.getState().unlock(password);
  const enabled = jest.spyOn(vaultCryptoService, 'enableDeviceLock');
  await useAuthStore.getState().configureDeviceLock(true, password);
  expect(enabled).toHaveBeenCalledWith(owner, password, salt);
  expect(useAuthStore.getState().deviceLock).toMatchObject({ enabled: true });
  useAuthStore.getState().lock();
  const nativeLoad = jest.spyOn(vaultCryptoService, 'loadDeviceKey');
  const biometricLoad = jest.spyOn(vaultCryptoService, 'loadKey');
  await useAuthStore.getState().unlock(undefined, 'device');
  expect(useAuthStore.getState().isLocked).toBe(false);
  expect(nativeLoad).toHaveBeenCalledTimes(1);
  await useAuthStore.getState().reauthenticate(undefined, 'device');
  expect(nativeLoad).toHaveBeenCalledTimes(2);
  expect(biometricLoad).not.toHaveBeenCalled();
  await useAuthStore.getState().configureDeviceLock(false);
  expect(useAuthStore.getState().deviceLock).toMatchObject({ enabled: false });
}, 30_000);

test('failed device confirmation leaves the restored session locked and password unlock available', async () => {
  jest.spyOn(vaultCryptoService, 'loadDeviceKey').mockRejectedValue(Object.assign(new Error('cancelled'), { code: 'DEVICE_AUTH_CANCELLED' }));
  await expect(useAuthStore.getState().unlock(undefined, 'device')).rejects.toThrow('cancelled');
  expect(useAuthStore.getState()).toMatchObject({ isLocked: true, isLoading: false, error: expect.stringContaining('cancelado') });
  expect(vaultCryptoService.isLoaded).toBe(false);
  await useAuthStore.getState().unlock(password);
  expect(useAuthStore.getState().isLocked).toBe(false);
}, 30_000);

test('a device status failure does not hide the independent biometric alternative', async () => {
  jest.spyOn(vaultCryptoService, 'deviceLockStatus').mockRejectedValue(new Error('storage unavailable'));
  await useAuthStore.getState().refreshBiometrics();
  expect(useAuthStore.getState().biometrics).toMatchObject({ available: true });
  expect(useAuthStore.getState().deviceLock).toBeNull();
  expect(useAuthStore.getState().error).toContain('Não foi possível verificar');
});

test('a biometric status failure does not hide the independent device credential alternative', async () => {
  jest.spyOn(vaultCryptoService, 'biometricStatus').mockRejectedValue(new Error('sensor unavailable'));
  await useAuthStore.getState().refreshBiometrics();
  expect(useAuthStore.getState().deviceLock).toMatchObject({ available: true });
  expect(useAuthStore.getState().biometrics).toBeNull();
  expect(useAuthStore.getState().error).toContain('Não foi possível verificar');
});