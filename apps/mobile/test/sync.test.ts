import { randomUUID } from 'node:crypto';
import { importVaultKey } from '@senha-facil/crypto';
import { SyncService } from '../src/services/sync.service';
import { offlineVaultService, type LocalVaultItem } from '../src/services/offline-vault.service';
import { vaultCryptoService } from '../src/services/vault-crypto.service';
import { connectivityService } from '../src/services/connectivity.service';
import { apiClient } from '../src/services/api.client';

let service: SyncService;
let owner: string;
let sent: LocalVaultItem;

function receipt(item: LocalVaultItem, index = 0) {
  return { clientId: item.id, serverId: `server_${index}`, operationId: item.operationId,
    version: 1, action: 'created', serverDeleted: false };
}

beforeEach(async () => {
  jest.useFakeTimers();
  owner = randomUUID();
  jest.spyOn(vaultCryptoService, 'key', 'get').mockReturnValue(importVaultKey(new Uint8Array(32).fill(7)));
  jest.spyOn(vaultCryptoService, 'isLoaded', 'get').mockReturnValue(true);
  jest.spyOn(connectivityService, 'isOnline', 'get').mockReturnValue(true);
  await offlineVaultService.initialize(owner);
  await offlineVaultService.saveItem('local_sync_fixture', 'Sync fixture', 'OTHER', { password: 'fixture-never-in-events' });
  sent = (await offlineVaultService.getUnsyncedItems())[0];
  jest.spyOn(apiClient, 'getToken').mockResolvedValue(null);
  jest.spyOn(apiClient, 'get').mockResolvedValue([]).mockResolvedValueOnce({ id: owner });
  jest.spyOn(apiClient, 'post').mockResolvedValue({ results: [receipt(sent)] });
  service = new SyncService();
  service.start();
  await Promise.resolve();
  jest.mocked(apiClient.getToken).mockResolvedValue('fictitious-session');
});

afterEach(async () => {
  service?.stop();
  await offlineVaultService.close();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('committed receipts notify the visible list before pull completes, including the new mapped ID', async () => {
  let finishPull!: (items: unknown[]) => void;
  const pull = new Promise<unknown[]>((resolve) => { finishPull = resolve; });
  jest.mocked(apiClient.get).mockReset().mockResolvedValueOnce({ id: owner }).mockReturnValueOnce(pull);
  let notified!: () => void;
  const committed = new Promise<void>((resolve) => { notified = resolve; });
  const listener = jest.fn(() => { notified(); });
  const unsubscribe = service.subscribe(listener);
  const syncing = service.sync();
  try {
    await committed;
    expect((await offlineVaultService.getItem(sent.id))).toMatchObject({ id: 'server_0', synced: true });
    expect(listener.mock.calls).toEqual([[owner]]);
  } finally { finishPull([]); await syncing; unsubscribe(); }
  expect(listener.mock.calls).toEqual([[owner], [owner]]);
  expect(JSON.stringify(listener.mock.calls)).not.toContain('fixture-never-in-events');
});

test('a failed pull does not hide receipts that were already saved locally', async () => {
  jest.mocked(apiClient.get).mockReset().mockResolvedValueOnce({ id: owner }).mockRejectedValueOnce(new Error('pull-fixture-failure'));
  const listener = jest.fn();
  service.subscribe(listener);
  await expect(service.sync()).rejects.toThrow('pull-fixture-failure');
  expect(listener).toHaveBeenCalledTimes(1);
  expect(await offlineVaultService.getItem(sent.id)).toMatchObject({ synced: true });
});

test('failed upload never announces synchronization or marks the item as sent', async () => {
  jest.mocked(apiClient.post).mockRejectedValue(new Error('upload-fixture-failure'));
  const listener = jest.fn();
  service.subscribe(listener);
  await expect(service.sync()).rejects.toThrow('upload-fixture-failure');
  expect(listener).not.toHaveBeenCalled();
  expect(await offlineVaultService.getItem(sent.id)).toMatchObject({ synced: false });
});

test('pull changes notify only after the local transaction updates the metadata', async () => {
  await offlineVaultService.acknowledge(sent, receipt(sent));
  const current = (await offlineVaultService.getItem(sent.id))!;
  jest.mocked(apiClient.get).mockReset().mockResolvedValueOnce({ id: owner }).mockResolvedValueOnce([{
    ...current, label: 'Server fixture update', deletedAt: null,
  }]);
  const listener = jest.fn();
  service.subscribe(listener);
  await service.sync();
  expect(listener).toHaveBeenCalledTimes(1);
  expect(await offlineVaultService.getItem(sent.id)).toMatchObject({ label: 'Server fixture update', synced: true });
});

test.each(['stop', 'account-change'] as const)('late upload completion is ignored after %s', async (action) => {
  let finish!: (response: unknown) => void;
  let started!: () => void;
  const startedUpload = new Promise<void>((resolve) => { started = resolve; });
  jest.mocked(apiClient.post).mockImplementation(() => { started(); return new Promise((resolve) => { finish = resolve; }); });
  const listener = jest.fn();
  service.subscribe(listener);
  const syncing = service.sync();
  await startedUpload;
  if (action === 'stop') service.stop();
  else await offlineVaultService.initialize(randomUUID());
  finish({ results: [receipt(sent)] });
  await syncing;
  expect(listener).not.toHaveBeenCalled();
  if (action === 'account-change') expect(await offlineVaultService.getAllItems()).toEqual([]);
  else expect(await offlineVaultService.getItem(sent.id)).toMatchObject({ synced: false });
});

test('unsubscribe stops notifications without preventing synchronization', async () => {
  const listener = jest.fn();
  const unsubscribe = service.subscribe(listener);
  unsubscribe();
  await service.sync();
  expect(listener).not.toHaveBeenCalled();
  expect(await offlineVaultService.getItem(sent.id)).toMatchObject({ synced: true });
});

test('a presentation listener failure is logged and cannot abort synchronization or other listeners', async () => {
  const warning = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  service.subscribe(() => { throw new Error('presentation-fixture-failure'); });
  const listener = jest.fn();
  service.subscribe(listener);
  await expect(service.sync()).resolves.toBeUndefined();
  expect(listener).toHaveBeenCalledTimes(2);
  expect(warning).toHaveBeenCalledWith('[SyncService] Não foi possível avisar uma tela sobre a atualização do cofre.');
});

test('stopping during notification prevents remaining listeners from receiving the old session event', async () => {
  service.subscribe(() => service.stop());
  const listener = jest.fn();
  service.subscribe(listener);
  await service.sync();
  expect(listener).not.toHaveBeenCalled();
  expect(apiClient.get).toHaveBeenCalledTimes(1);
});

test('partially committed batches notify even if a later receipt cannot be written', async () => {
  await offlineVaultService.saveItem('local_bad_fixture', 'Bad fixture', 'OTHER', { password: 'fixture' });
  const pending = await offlineVaultService.getUnsyncedItems();
  jest.mocked(apiClient.post).mockResolvedValue({ results: pending.map(receipt) });
  const original = offlineVaultService.acknowledge.bind(offlineVaultService);
  jest.spyOn(offlineVaultService, 'acknowledge').mockImplementation(async (item, result) => {
    if (item.id === 'local_bad_fixture') throw new Error('receipt-fixture-failure');
    await original(item, result);
  });
  const listener = jest.fn();
  service.subscribe(listener);
  await expect(service.sync()).rejects.toThrow('receipt-fixture-failure');
  expect(listener).toHaveBeenCalledTimes(1);
  expect(await offlineVaultService.getItem(sent.id)).toMatchObject({ synced: true });
  expect(await offlineVaultService.getItem('local_bad_fixture')).toMatchObject({ synced: false });
});

test('conflict receipts update the UI without pretending the local edit was accepted', async () => {
  jest.mocked(apiClient.post).mockResolvedValue({ results: [{ ...receipt(sent), action: 'conflict' }] });
  const listener = jest.fn();
  service.subscribe(listener);
  await service.sync();
  expect(listener).toHaveBeenCalledTimes(2);
  expect(await offlineVaultService.getItem(sent.id)).toMatchObject({ synced: false, conflict: true });
  expect(await offlineVaultService.getConflicts()).toHaveLength(1);
});

test('security reports are minimal and deleted only after an exact server acknowledgement', async () => {
  const report = { id: randomUUID(), type: 'BULK_REVEAL' as const, count: 5, occurredAt: new Date().toISOString() };
  await offlineVaultService.recordSecurityReport(report);
  jest.mocked(apiClient.post).mockResolvedValueOnce({ results: [receipt(sent)] }).mockResolvedValueOnce({ acknowledged: [report.id] });
  await service.sync();
  expect(apiClient.post).toHaveBeenLastCalledWith('/security/reports', { reports: [report] });
  expect(await offlineVaultService.getSecurityReports()).toEqual([]);
});

test('missing security report acknowledgement leaves the audit queued instead of discarding it', async () => {
  const report = { id: randomUUID(), type: 'BULK_DELETE' as const, count: 3, occurredAt: new Date().toISOString() };
  await offlineVaultService.recordSecurityReport(report);
  jest.mocked(apiClient.post).mockResolvedValueOnce({ results: [receipt(sent)] }).mockResolvedValueOnce({ acknowledged: [] });
  await expect(service.sync()).rejects.toThrow('SECURITY_REPORT_RECEIPT_INVALID');
  expect(await offlineVaultService.getSecurityReports()).toEqual([report]);
});
