import { randomUUID } from 'node:crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { VaultCryptoService } from '../src/services/vault-crypto.service';

const password = 'fictitious-biometric-password';
const salt = '0123456789abcdef0123456789abcdef';
let owner: string;
let service: VaultCryptoService;
jest.setTimeout(30_000);

beforeEach(() => {
  owner = randomUUID(); service = new VaultCryptoService();
  jest.mocked(SecureStore.canUseBiometricAuthentication).mockReturnValue(true);
});
afterEach(() => { service.lockKey(); jest.restoreAllMocks(); });

test('reports fingerprint and facial support without reading a protected key or opening a prompt', async () => {
  jest.mocked(LocalAuthentication.supportedAuthenticationTypesAsync).mockResolvedValueOnce([1, 2]);
  const reads = jest.mocked(SecureStore.getItemAsync);
  reads.mockClear();
  expect(await service.biometricStatus(owner)).toMatchObject({ available: true, enabled: false, label: 'digital ou rosto' });
  expect(reads.mock.calls.every(([, options]) => !options?.requireAuthentication)).toBe(true);
});

test.each(['no-hardware', 'not-enrolled', 'weak'])('unavailable biometrics (%s) never fall back to an unsecured key copy', async (condition) => {
  if (condition === 'no-hardware') jest.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValueOnce(false);
  if (condition === 'not-enrolled') jest.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValueOnce(false);
  if (condition === 'weak') jest.spyOn(SecureStore, 'canUseBiometricAuthentication').mockReturnValue(false);
  const status = await service.biometricStatus(owner);
  expect(status.available).toBe(false);
  expect(status.reason).toBeTruthy();
  expect(await SecureStore.getItemAsync(`sf_key_${owner}`)).toBeNull();
});

test('login preparation never enrolls biometrics or prompts even if an old automatic key exists', async () => {
  await SecureStore.setItemAsync(`sf_key_${owner}`, 'old-auto-key');
  const writes = jest.mocked(SecureStore.setItemAsync);
  writes.mockClear();
  await service.initializeKey(owner, password, salt);
  expect(writes.mock.calls.every(([, , options]) => !options?.requireAuthentication)).toBe(true);
  expect(await SecureStore.getItemAsync(`sf_key_${owner}`)).toBeNull();
});

test('explicit opt-in requires the correct password and binds one authenticated copy to its account', async () => {
  await service.initializeKey(owner, password, salt);
  await expect(service.enableBiometrics(owner, 'wrong-password', salt)).rejects.toThrow('incorreta');
  expect((await service.biometricStatus(owner)).enabled).toBe(false);
  await service.enableBiometrics(owner, password, salt);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(`sf_key_${owner}`, expect.any(String),
    expect.objectContaining({ requireAuthentication: true, keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }));
  expect((await service.biometricStatus(owner)).enabled).toBe(true);
  expect((await service.biometricStatus(randomUUID())).enabled).toBe(false);
  service.lockKey();
  const reads = jest.mocked(SecureStore.getItemAsync);
  reads.mockClear();
  await service.loadKey(owner);
  expect(service.isLoaded).toBe(true);
  expect(reads.mock.calls.filter(([, options]) => options?.requireAuthentication)).toHaveLength(1);
  await service.disableBiometrics(owner);
  expect(await SecureStore.getItemAsync(`sf_key_${owner}`)).toBeNull();
  service.lockKey();
  await service.unlockWithPassword(owner, password, salt);
  expect(service.isLoaded).toBe(true);
});

test('a key invalidated after enrollment changes disables biometric unlock but preserves the password envelope', async () => {
  await service.initializeKey(owner, password, salt);
  await SecureStore.setItemAsync(`sf_biometrics_${owner}`, '1');
  service.lockKey();
  await expect(service.loadKey(owner)).rejects.toThrow('mudou ou foi removida');
  expect((await service.biometricStatus(owner)).enabled).toBe(false);
  await service.unlockWithPassword(owner, password, salt);
  expect(service.isLoaded).toBe(true);
});

test('cancelling the system prompt never loads a key or enables a password-free fallback', async () => {
  jest.spyOn(service, 'biometricStatus').mockResolvedValue({ enabled: true, available: true, label: 'impressão digital', reason: '' });
  jest.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error('Authentication cancelled'));
  await expect(service.loadKey(owner)).rejects.toThrow('Authentication cancelled');
  expect(service.isLoaded).toBe(false);
  expect(SecureStore.getItemAsync).toHaveBeenLastCalledWith(`sf_key_${owner}`,
    expect.objectContaining({ requireAuthentication: true }));
});
