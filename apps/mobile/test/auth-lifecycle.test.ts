import { randomUUID } from 'node:crypto';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../src/stores/auth.store';
import { vaultCryptoService } from '../src/services/vault-crypto.service';
import { offlineVaultService } from '../src/services/offline-vault.service';
import { apiClient } from '../src/services/api.client';

const password = 'offline master password';
const salt = '0102030405060708090a0b0c0d0e0f10';
let owner: string;

beforeEach(async () => {
  owner = randomUUID();
  await SecureStore.setItemAsync('sf_local_session_v2', JSON.stringify({ user: { id: owner, name: 'Owner', role: 'ELDERLY', email: 'owner@example.invalid' }, kdfSalt: salt }));
  await vaultCryptoService.initializeKey(owner, password, salt);
  vaultCryptoService.lockKey();
  await useAuthStore.getState().bootstrap();
});
afterEach(async () => {
  useAuthStore.getState().lock();
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
});

test('wrong offline password never unlocks the session', async () => {
  await expect(useAuthStore.getState().unlock('wrong')).rejects.toThrow();
  expect(useAuthStore.getState().isLocked).toBe(true);
  expect(vaultCryptoService.isLoaded).toBe(false);
});

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
});