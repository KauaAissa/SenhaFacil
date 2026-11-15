import { randomUUID } from 'node:crypto';
import { importVaultKey } from '@senha-facil/crypto';
import { contactsApiService, canApproveAccess, type TrustedContact } from '../src/services/contacts-api.service';
import { connectivityService } from '../src/services/connectivity.service';
import { offlineVaultService } from '../src/services/offline-vault.service';
import { vaultCryptoService } from '../src/services/vault-crypto.service';
import { vaultService } from '../src/services/vault.service';
import { syncService } from '../src/services/sync.service';
import { requestLocationService } from '../src/services/request-location.service';
import { apiClient } from '../src/services/api.client';

const activeContact: TrustedContact = {
  id: 'fixture-contact', status: 'ACTIVE', permissions: ['APPROVE_ACCESS'],
  createdAt: '', updatedAt: '', elderly: { id: 'owner', name: 'Owner', email: 'owner@example.invalid' },
  caregiver: { id: 'caregiver', name: 'Helper', email: 'helper@example.invalid', isActive: true },
};
const input = { label: 'Teste', category: 'OTHER' as const, plaintext: { password: 'fictitious-secret' } };

beforeEach(async () => {
  jest.spyOn(vaultCryptoService, 'key', 'get').mockReturnValue(importVaultKey(new Uint8Array(32).fill(7)));
  jest.spyOn(vaultCryptoService, 'isLoaded', 'get').mockReturnValue(true);
  jest.spyOn(syncService, 'sync').mockResolvedValue();
  await offlineVaultService.initialize(randomUUID());
});
afterEach(async () => { await offlineVaultService.close(); jest.restoreAllMocks(); });

test.each([
  { ...activeContact, status: 'PENDING' as const },
  { ...activeContact, status: 'REVOKED' as const },
  { ...activeContact, permissions: [] },
  { ...activeContact, caregiver: { ...activeContact.caregiver, isActive: false } },
])('rejects a contact that is not eligible to approve (%j)', async (contact) => {
  expect(canApproveAccess(contact)).toBe(false);
  jest.spyOn(contactsApiService, 'findAll').mockResolvedValue([contact]);
  await expect(vaultService.createItem({ ...input, requiresApproval: true })).rejects.toThrow('Primeiro convide');
  expect(await offlineVaultService.getAllItems()).toHaveLength(0);
});

test('ordinary passwords remain available offline without consulting contacts', async () => {
  jest.spyOn(connectivityService, 'isOnline', 'get').mockReturnValue(false);
  const contacts = jest.spyOn(contactsApiService, 'findAll');
  const permission = jest.spyOn(requestLocationService, 'requirePermission');
  const capture = jest.spyOn(requestLocationService, 'captureOnce');
  const id = await vaultService.createItem(input);
  expect(await vaultService.getItem(id)).toMatchObject({ requiresApproval: false });
  expect(contacts).not.toHaveBeenCalled();
  expect(permission).not.toHaveBeenCalled();
  expect(capture).not.toHaveBeenCalled();
});

test('enabling assisted access offline is refused without silently saving or downgrading the item', async () => {
  jest.spyOn(connectivityService, 'isOnline', 'get').mockReturnValue(false);
  await expect(vaultService.createItem({ ...input, requiresApproval: true })).rejects.toThrow('internet');
  const id = await vaultService.createItem(input);
  await expect(vaultService.updateItem(id, { ...input, requiresApproval: true })).rejects.toThrow('internet');
  expect(await vaultService.getItem(id)).toMatchObject({ requiresApproval: false });
});

test('a contact accepted with approval permission allows creating and enabling assisted access', async () => {
  expect(canApproveAccess(activeContact)).toBe(true);
  jest.spyOn(contactsApiService, 'findAll').mockResolvedValue([activeContact]);
  const permission = jest.spyOn(requestLocationService, 'requirePermission');
  const capture = jest.spyOn(requestLocationService, 'captureOnce');
  const id = await vaultService.createItem({ ...input, requiresApproval: true });
  expect(await vaultService.getItem(id)).toMatchObject({ requiresApproval: true });
  const ordinary = await vaultService.createItem(input);
  await vaultService.updateItem(ordinary, { ...input, requiresApproval: true });
  expect(await vaultService.getItem(ordinary)).toMatchObject({ requiresApproval: true });
  expect(permission).toHaveBeenCalledTimes(2);
  expect(capture).not.toHaveBeenCalled();
});

test('location permission denial prevents creation and activation without changing the existing item', async () => {
  jest.spyOn(contactsApiService, 'findAll').mockResolvedValue([activeContact]);
  jest.spyOn(requestLocationService, 'requirePermission').mockRejectedValue(new Error('location permission denied'));
  await expect(vaultService.createItem({ ...input, requiresApproval: true })).rejects.toThrow('permission denied');
  expect(await offlineVaultService.getAllItems()).toHaveLength(0);
  const ordinary = await vaultService.createItem(input);
  await expect(vaultService.updateItem(ordinary, { ...input, requiresApproval: true })).rejects.toThrow('permission denied');
  expect(await vaultService.getItem(ordinary)).toMatchObject({ requiresApproval: false });
});

test('an already protected item keeps its protection and may be edited after location permission is revoked', async () => {
  jest.spyOn(contactsApiService, 'findAll').mockResolvedValue([activeContact]);
  const id = await vaultService.createItem({ ...input, requiresApproval: true });
  const permission = jest.spyOn(requestLocationService, 'requirePermission').mockRejectedValue(new Error('permission revoked'));
  jest.spyOn(apiClient, 'get').mockResolvedValue({ status: 'APPROVED', vaultItemId: id,
    expiresAt: new Date(apiClient.getServerTime() + 60_000).toISOString() });
  await vaultService.updateItem(id, { ...input, label: 'Editado', requiresApproval: true }, 'approved-request');
  expect(await vaultService.getItem(id)).toMatchObject({ label: 'Editado', requiresApproval: true });
  expect(permission).not.toHaveBeenCalled();
});

test('offline emergency neither asks for location permission nor captures coordinates', async () => {
  jest.spyOn(contactsApiService, 'findAll').mockResolvedValue([activeContact]);
  const id = await vaultService.createItem({ ...input, requiresApproval: true });
  jest.spyOn(connectivityService, 'isOnline', 'get').mockReturnValue(false);
  const permission = jest.spyOn(requestLocationService, 'requirePermission');
  const capture = jest.spyOn(requestLocationService, 'captureOnce');
  expect((await vaultService.revealEmergency(id, async () => undefined)).plaintext.password).toBe(input.plaintext.password);
  expect(permission).not.toHaveBeenCalled();
  expect(capture).not.toHaveBeenCalled();
});

test('lost contact connectivity does not create an assisted item or expose its password', async () => {
  jest.spyOn(contactsApiService, 'findAll').mockRejectedValue(new Error('Network request failed'));
  await expect(vaultService.createItem({ ...input, requiresApproval: true })).rejects.toThrow('Network');
  expect(await offlineVaultService.getAllItems()).toHaveLength(0);
});
