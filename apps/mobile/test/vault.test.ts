import { randomUUID } from 'node:crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { importVaultKey, encryptVaultItem } from '@senha-facil/crypto';
import { OfflineVaultService, offlineVaultService } from '../src/services/offline-vault.service';
import { VaultCryptoService, vaultCryptoService } from '../src/services/vault-crypto.service';
import { vaultService } from '../src/services/vault.service';
import { apiClient } from '../src/services/api.client';

const key = importVaultKey(new Uint8Array(32).fill(1));
let database: OfflineVaultService;

beforeEach(async () => {
  jest.spyOn(vaultCryptoService, 'key', 'get').mockReturnValue(key);
  jest.spyOn(vaultCryptoService, 'isLoaded', 'get').mockReturnValue(true);
  database = new OfflineVaultService();
  await database.initialize(randomUUID());
});
afterEach(async () => { await database.close(); jest.restoreAllMocks(); });

test('isolates accounts and preserves each account when switching back', async () => {
  const first = database.accountId!;
  await database.saveItem('local_item', 'Banco', 'BANKING', { password: 'local-secret' });
  await database.initialize(randomUUID());
  expect(await database.getAllItems()).toEqual([]);
  await database.initialize(first);
  const items = await database.getAllItems();
  expect(items).toHaveLength(1);
  expect(items[0]).not.toHaveProperty('plaintext');
  expect(JSON.stringify(items)).not.toContain('local-secret');
});

test('editing preserves creation date and changes the operation ID', async () => {
  await database.saveItem('item', 'Nome', 'OTHER', { password: 'first' });
  const original = (await database.getItem('item'))!;
  await database.saveItem('item', 'Novo', 'OTHER', { password: 'second' });
  const updated = (await database.getItem('item'))!;
  expect(updated.createdAt).toBe(original.createdAt);
  expect(updated.operationId).not.toBe(original.operationId);
  expect(updated.iv).not.toBe(original.iv);
});

test('acknowledging a stale upload does not acknowledge an in-flight edit', async () => {
  await database.saveItem('local_item', 'Nome', 'OTHER', { password: 'first' });
  const sent = (await database.getItem('local_item'))!;
  await database.saveItem('local_item', 'Alterado', 'OTHER', { password: 'second' });
  await database.acknowledge(sent, { serverId: 'server_item', version: 1, action: 'created' });
  const current = (await database.getItem('server_item'))!;
  expect(current.synced).toBe(false);
  expect(current.version).toBe(1);
  expect(current.label).toBe('Alterado');
});

test('pull cannot overwrite unsynced edits or resurrect pending deletions', async () => {
  await database.saveItem('item', 'Local', 'OTHER', { password: 'secret' });
  const local = (await database.getItem('item'))!;
  await database.mergeServerData([{ ...local, label: 'Server', synced: true, version: 2 }]);
  expect((await database.getItem('item'))!.label).toBe('Local');
  await database.deleteItem('item');
  await database.mergeServerData([{ ...local, synced: true, version: 3 }]);
  expect(await database.getAllItems()).toEqual([]);
  expect((await database.getUnsyncedItems())[0].deleted).toBe(true);
});

test('server tombstones hide previously synchronized items', async () => {
  await database.saveItem('item', 'Local', 'OTHER', { password: 'secret' });
  const local = (await database.getItem('item'))!;
  await database.acknowledge(local, { serverId: 'item', version: 1, action: 'created' });
  await database.mergeServerData([{ ...local, synced: true, version: 2, deleted: true }]);
  expect(await database.getAllItems()).toEqual([]);
});

test('conflicts preserve encrypted local work and require a new explicit operation', async () => {
  await database.saveItem('item', 'Local', 'OTHER', { password: 'secret' });
  const local = (await database.getItem('item'))!;
  await database.acknowledge(local, { serverId: 'item', version: 3, action: 'conflict' });
  expect(await database.getUnsyncedItems()).toEqual([]);
  expect((await database.getItem('item'))!.conflict).toBe(true);
  await database.resolveConflict('item', true);
  const pending = (await database.getUnsyncedItems())[0];
  expect(pending.version).toBe(3);
  expect(pending.operationId).not.toBe(local.operationId);
});

test('emergency audit is durable until its receipt is acknowledged', async () => {
  const id = await database.recordEmergency('item');
  expect(await database.getEmergencyEvents()).toEqual([expect.objectContaining({ id, vault_item_id: 'item' })]);
  await database.acknowledgeEmergency(id);
  expect(await database.getEmergencyEvents()).toEqual([]);
});

test('protected item cannot be decrypted by the facade without a current matching approval', async () => {
  await offlineVaultService.initialize(randomUUID());
  await offlineVaultService.saveItem('protected', 'Banco', 'BANKING', { password: 'secret' }, { requiresApproval: true });
  const decrypt = jest.spyOn(offlineVaultService, 'decryptItem');
  await expect(vaultService.revealItem('protected')).rejects.toThrow('aprovacao');
  expect(decrypt).not.toHaveBeenCalled();
  jest.spyOn(apiClient, 'get').mockResolvedValue({ status: 'DENIED', vaultItemId: 'protected', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  await expect(vaultService.revealItem('protected', 'request')).rejects.toThrow('Aprovacao');
  expect(decrypt).not.toHaveBeenCalled();
  await offlineVaultService.close();
});

test('account-scoped key can unlock offline and rejects another password', async () => {
  const service = new VaultCryptoService();
  const account = randomUUID();
  const salt = '00112233445566778899aabbccddeeff';
  await service.initializeKey(account, 'correct-password', salt);
  service.lockKey();
  await expect(service.unlockWithPassword(account, 'wrong-password', salt)).rejects.toThrow('incorreta');
  expect(service.isLoaded).toBe(false);
  await service.unlockWithPassword(account, 'correct-password', salt);
  expect(service.isLoaded).toBe(true);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(`sf_key_${account}`, expect.any(String), expect.objectContaining({ requireAuthentication: true }));
  service.lockKey();
  await expect(service.loadKey(randomUUID())).rejects.toThrow('ENCRYPTION_KEY_NOT_FOUND');
  await service.clearKey(account);
});

test('keeping work after a server deletion creates a fresh offline ID instead of resurrecting the tombstone', async () => {
  await database.saveItem('item', 'Local', 'OTHER', { password: 'secret' });
  const local = (await database.getItem('item'))!;
  await database.acknowledge(local, { serverId: 'item', version: 3, action: 'conflict', serverDeleted: true });
  await database.resolveConflict('item', true);
  const pending = (await database.getUnsyncedItems())[0];
  expect(pending.id).toMatch(/^local_/);
  expect(pending.version).toBe(0);
  expect(pending.label).toBe('Local');
});

test('legacy migration imports only authenticated items without deleting other accounts', async () => {
  const legacy = await SQLite.openDatabaseAsync('senha_facil_vault.db');
  await legacy.execAsync(`CREATE TABLE IF NOT EXISTS vault_items (
    id TEXT PRIMARY KEY,label TEXT,category TEXT,encrypted_payload TEXT,iv TEXT,requires_approval INTEGER,
    is_favorite INTEGER,synced INTEGER,created_at TEXT,updated_at TEXT)`);
  const own = await encryptVaultItem({ password: 'own' }, key);
  const other = await encryptVaultItem({ password: 'other' }, importVaultKey(new Uint8Array(32).fill(2)));
  const ownId = randomUUID();
  const otherId = randomUUID();
  for (const [id, payload] of [[ownId, own], [otherId, other]] as const) {
    await legacy.runAsync('INSERT INTO vault_items VALUES (?,?,?,?,?,0,0,0,?,?)',
      [id, 'Legacy', 'OTHER', payload.ciphertext, payload.iv, new Date().toISOString(), new Date().toISOString()]);
  }
  const isolated = new OfflineVaultService();
  await isolated.initialize(randomUUID());
  expect(await isolated.getItem(ownId)).not.toBeNull();
  expect(await isolated.getItem(otherId)).toBeNull();
  expect(await legacy.getFirstAsync('SELECT id FROM vault_items WHERE id = ?', [otherId])).not.toBeNull();
  await isolated.close();
  await legacy.runAsync('DELETE FROM vault_items WHERE id IN (?,?)', [ownId, otherId]);
});

test('local account erasure removes its cache and preserves another account database', async () => {
  const otherOwner = randomUUID();
  const other = new OfflineVaultService();
  await other.initialize(otherOwner);
  const preservedId = randomUUID();
  await other.saveItem(preservedId, 'Preserved', 'OTHER', { password: 'secret' });
  await other.close();
  const owner = database.accountId!;
  await database.saveItem('item', 'Own', 'OTHER', { password: 'secret' });
  await database.eraseAccount(owner);
  await database.initialize(owner);
  expect(await database.getAllItems()).toHaveLength(0);
  await other.initialize(otherOwner);
  expect(await other.getItem(preservedId)).not.toBeNull();
  await other.close();
});

test('an open local ID continues resolving after sync remaps it without creating a duplicate on edit', async () => {
  await database.saveItem('local_open', 'Original', 'OTHER', { password: 'first' });
  const sent = (await database.getItem('local_open'))!;
  await database.acknowledge(sent, { serverId: 'server_open', version: 1, action: 'created' });
  expect((await database.getItem('local_open'))!.id).toBe('server_open');
  await database.saveItem('local_open', 'Edited', 'OTHER', { password: 'second' });
  expect(await database.getAllItems()).toHaveLength(1);
  await database.setFavorite('local_open', true);
  expect((await database.getItem('server_open'))!.isFavorite).toBe(true);
  await database.deleteItem('local_open');
  expect(await database.getItem('server_open')).toBeNull();
});