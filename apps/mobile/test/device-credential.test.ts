import { randomUUID } from 'node:crypto';
import { requireOptionalNativeModule } from 'expo';
import * as SecureStore from 'expo-secure-store';
import { createProtection, decryptVaultItem, destroyVaultKey, encryptVaultItem } from '@senha-facil/crypto';
import { VaultCryptoService } from '../src/services/vault-crypto.service';
import { deviceCredentialService } from '../src/services/device-credential.service';
import { getErrorMessage } from '../src/services/error-messages';
import { nativePromptService } from '../src/services/native-prompt.service';

interface TestNativeModule {
  getStatus: jest.Mock<Promise<{ supported: boolean; secure: boolean; enabled: boolean; needsReactivation: boolean }>, [string]>;
  enable: jest.Mock<Promise<void>, [string, string]>;
  unlock: jest.Mock<Promise<string>, [string]>;
  disable: jest.Mock<Promise<void>, [string]>;
  cancel: jest.Mock<Promise<void>, []>;
}
const native = requireOptionalNativeModule<TestNativeModule>('SenhaFacilDeviceCredential')!;
const password = 'fictitious-device-credential-password';
const salt = '0123456789abcdef0123456789abcdef';
let owner: string;
let service: VaultCryptoService;
jest.setTimeout(30_000);

beforeEach(() => {
  owner = randomUUID();
  service = new VaultCryptoService();
  jest.clearAllMocks();
});
afterEach(() => { service.lockKey(); jest.restoreAllMocks(); });

test('checking availability never prompts, reads a key or enables itself', async () => {
  expect(await service.deviceLockStatus(owner)).toMatchObject({ available: true, enabled: false });
  expect(native.enable).not.toHaveBeenCalled();
  expect(native.unlock).not.toHaveBeenCalled();
});

test.each([
  { supported: false, secure: true, enabled: false, needsReactivation: false, text: 'Android 11' },
  { supported: true, secure: false, enabled: false, needsReactivation: false, text: 'Configure um PIN, padrão ou senha' },
  { supported: true, secure: false, enabled: false, needsReactivation: true, text: 'removido ou a chave mudou' },
])('unsupported or removed credentials are explained without an unsecured fallback: $text', async ({ text, ...status }) => {
  native.getStatus.mockResolvedValueOnce(status);
  expect(await service.deviceLockStatus(owner)).toMatchObject({ available: false, reason: expect.stringContaining(text) });
  expect(native.unlock).not.toHaveBeenCalled();
});

test('an old APK stays usable with its password and reports the missing module explicitly', async () => {
  jest.mocked(requireOptionalNativeModule).mockReturnValueOnce(null);
  expect(await service.deviceLockStatus(owner)).toMatchObject({ available: false, enabled: false });
  jest.mocked(requireOptionalNativeModule).mockReturnValueOnce(null);
  await expect(deviceCredentialService.enable(owner, 'unused')).rejects.toThrow('nova versão Android');
  await service.initializeKey(owner, password, salt);
  service.lockKey();
  await service.unlockWithPassword(owner, password, salt);
  expect(service.isLoaded).toBe(true);
});

test('activation requires the master password, one native cryptographic prompt and account-scoped storage', async () => {
  await service.initializeKey(owner, password, salt);
  await expect(service.enableDeviceLock(owner, 'wrong-password', salt)).rejects.toThrow('incorreta');
  expect(native.enable).not.toHaveBeenCalled();
  const write = jest.mocked(SecureStore.setItemAsync);
  write.mockClear();
  native.enable.mockImplementationOnce(async () => { expect(nativePromptService.isActive).toBe(true); });
  await service.enableDeviceLock(owner, password, salt);
  expect(native.enable).toHaveBeenCalledWith(owner, expect.stringMatching(/^[A-Za-z0-9+/]{43}=$/));
  expect(write.mock.calls.some(([key]) => key.startsWith('sf_key_'))).toBe(false);
  expect(nativePromptService.isActive).toBe(false);
  await service.enableDeviceLock(owner, password, salt);
  expect((await service.deviceLockStatus(owner)).enabled).toBe(true);
  expect((await service.deviceLockStatus(randomUUID())).enabled).toBe(false);
});

test('a protected key opens offline after one native operation; disabling preserves the password', async () => {
  await service.initializeKey(owner, password, salt);
  const encrypted = await encryptVaultItem({ password: 'fictitious-secret' }, service.key);
  await service.enableDeviceLock(owner, password, salt);
  service.lockKey();
  native.unlock.mockClear();
  await service.loadDeviceKey(owner);
  expect(native.unlock).toHaveBeenCalledTimes(1);
  expect(await decryptVaultItem(encrypted, service.key)).toMatchObject({ password: 'fictitious-secret' });
  await service.disableDeviceLock(owner);
  service.lockKey();
  await expect(service.loadDeviceKey(owner)).rejects.toThrow('Ative o bloqueio');
  await service.unlockWithPassword(owner, password, salt);
  expect(service.isLoaded).toBe(true);
});

test('cancellation never loads a key or falls back to biometric/password without asking', async () => {
  await service.initializeKey(owner, password, salt);
  await service.enableDeviceLock(owner, password, salt);
  service.lockKey();
  native.unlock.mockRejectedValueOnce(Object.assign(new Error('cancelled'), { code: 'DEVICE_AUTH_CANCELLED' }));
  await expect(service.loadDeviceKey(owner)).rejects.toThrow('cancelled');
  expect(service.isLoaded).toBe(false);
  expect((await service.deviceLockStatus(owner)).enabled).toBe(true);
});

test('a permanently invalidated native key is removed without touching the password protection', async () => {
  await service.initializeKey(owner, password, salt);
  await service.enableDeviceLock(owner, password, salt);
  service.lockKey();
  native.unlock.mockRejectedValueOnce(Object.assign(new Error('invalidated'), { code: 'DEVICE_AUTH_KEY_INVALIDATED' }));
  await expect(service.loadDeviceKey(owner)).rejects.toThrow('invalidated');
  expect(service.isLoaded).toBe(false);
  expect((await service.deviceLockStatus(owner)).enabled).toBe(false);
  await service.unlockWithPassword(owner, password, salt);
  expect(service.isLoaded).toBe(true);
});

test('locking during a prompt discards the late native result and cancels the native operation', async () => {
  await service.initializeKey(owner, password, salt);
  await service.enableDeviceLock(owner, password, salt);
  const protectedKey = native.enable.mock.calls[0][1];
  service.lockKey();
  let finish!: (value: string) => void;
  native.unlock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const pending = service.loadDeviceKey(owner);
  await new Promise<void>((resolve) => setImmediate(resolve));
  service.lockKey();
  expect(native.cancel).toHaveBeenCalled();
  finish(protectedKey);
  await expect(pending).rejects.toThrow('SESSION_CHANGED');
  expect(service.isLoaded).toBe(false);
});

test('locking during activation removes any late protected copy and keeps the password envelope', async () => {
  await service.initializeKey(owner, password, salt);
  let finish!: () => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => { started = resolve; });
  native.enable.mockImplementationOnce(async () => {
    started(); await new Promise<void>((resolve) => { finish = resolve; });
  });
  const pending = service.enableDeviceLock(owner, password, salt);
  await ready;
  service.lockKey(); finish();
  await expect(pending).rejects.toThrow('SESSION_CHANGED');
  expect(native.disable).toHaveBeenCalledWith(owner);
  await service.unlockWithPassword(owner, password, salt);
  expect(service.isLoaded).toBe(true);
});

test('recovery with a different vault key removes the stale device copy without a login prompt', async () => {
  await service.initializeKey(owner, password, salt);
  await service.enableDeviceLock(owner, password, salt);
  const prepared = await createProtection(password);
  try {
    native.enable.mockClear(); native.unlock.mockClear();
    await service.initializeProtectedKey(owner, password, prepared.protection);
    expect((await service.deviceLockStatus(owner)).enabled).toBe(false);
    expect(native.enable).not.toHaveBeenCalled();
    expect(native.unlock).not.toHaveBeenCalled();
  } finally { destroyVaultKey(prepared.key); }
});

test('repeated password login preserves an already enrolled identical key without another prompt', async () => {
  await service.initializeKey(owner, password, salt);
  await service.enableDeviceLock(owner, password, salt);
  native.enable.mockClear(); native.unlock.mockClear();
  await service.initializeKey(owner, password, salt);
  expect((await service.deviceLockStatus(owner)).enabled).toBe(true);
  expect(native.enable).not.toHaveBeenCalled();
  expect(native.unlock).not.toHaveBeenCalled();
});

test.each(['DEVICE_AUTH_CANCELLED', 'DEVICE_AUTH_LOCKED_OUT', 'DEVICE_AUTH_NOT_CONFIGURED',
  'DEVICE_AUTH_KEY_INVALIDATED', 'DEVICE_AUTH_UNSUPPORTED', 'DEVICE_AUTH_FAILED'])('native error %s is translated instead of exposing technical details', (code) => {
  const message = getErrorMessage(Object.assign(new Error('technical-detail-not-for-users'), { code }));
  expect(message).not.toContain('technical-detail');
  expect(message).not.toBe('Não foi possível concluir. Tente novamente.');
});
