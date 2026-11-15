import { randomUUID } from 'node:crypto';
import { importVaultKey, type VaultKey } from '@senha-facil/crypto';
import { ActivityConfirmationRequired, VaultActivityService, vaultActivityService } from '../src/services/vault-activity.service';
import { offlineVaultService } from '../src/services/offline-vault.service';
import { vaultCryptoService } from '../src/services/vault-crypto.service';
import { vaultService } from '../src/services/vault.service';
import { connectivityService } from '../src/services/connectivity.service';

let activity: VaultActivityService;
let key: VaultKey;
let now: number;

beforeEach(async () => {
  now = 1_000;
  key = importVaultKey(new Uint8Array(32).fill(7));
  jest.spyOn(performance, 'now').mockImplementation(() => now);
  jest.spyOn(vaultCryptoService, 'key', 'get').mockImplementation(() => key);
  jest.spyOn(vaultCryptoService, 'isLoaded', 'get').mockReturnValue(true);
  await offlineVaultService.initialize(randomUUID());
  activity = new VaultActivityService();
  vaultActivityService.reset();
});
afterEach(async () => { activity.reset(); vaultActivityService.reset(); await offlineVaultService.close(); jest.restoreAllMocks(); });

test.each([['REVEAL', 5, 'BULK_REVEAL'], ['COPY', 10, 'BULK_COPY'], ['DELETE', 3, 'BULK_DELETE']] as const)(
  '%s requires identity at its exact threshold and stores only one minimal incident', async (action, threshold, type) => {
    for (let index = 0; index < threshold - 1; index++) await activity.authorize(action, `fixture_${index}`);
    await expect(activity.authorize(action, 'last_fixture')).rejects.toBeInstanceOf(ActivityConfirmationRequired);
    for (let index = 0; index < 5; index++) await expect(activity.authorize(action, 'last_fixture')).rejects.toBeInstanceOf(ActivityConfirmationRequired);
    const reports = await offlineVaultService.getSecurityReports();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ type, count: threshold });
    expect(Object.keys(reports[0]).sort()).toEqual(['count', 'id', 'occurredAt', 'type']);
  });

test('reopening the same item and remapping its ID does not count as multiple different passwords', async () => {
  await offlineVaultService.saveItem('local_fixture', 'Fixture', 'OTHER', { password: 'private-fixture' });
  for (let index = 0; index < 10; index++) await activity.authorize('REVEAL', 'local_fixture');
  const item = (await offlineVaultService.getItem('local_fixture'))!;
  await offlineVaultService.acknowledge(item, { serverId: 'server_fixture', version: 1, action: 'created' });
  for (let index = 0; index < 10; index++) await activity.authorize('REVEAL', 'server_fixture');
  expect(await offlineVaultService.getSecurityReports()).toEqual([]);
});

test('no dialog-only confirmation can unlock the activity gate; a newly opened key grants exactly one minute', async () => {
  for (let index = 0; index < 4; index++) await activity.authorize('REVEAL', `fixture_${index}`);
  await expect(activity.authorize('REVEAL', 'fifth')).rejects.toBeInstanceOf(ActivityConfirmationRequired);
  await expect(activity.confirmedAfterAuthentication()).rejects.toThrow('Confirme pelo bloqueio');
  key = importVaultKey(new Uint8Array(32).fill(7));
  await activity.confirmedAfterAuthentication();
  for (let index = 0; index < 100; index++) await activity.authorize('COPY', 'fixture');
  now += 59_999;
  await activity.authorize('COPY', 'fixture');
  now += 1;
  for (let index = 0; index < 9; index++) await activity.authorize('COPY', 'fixture');
  await expect(activity.authorize('COPY', 'fixture')).rejects.toBeInstanceOf(ActivityConfirmationRequired);
});

test('waiting out a flagged burst does not bypass its identity confirmation', async () => {
  for (let index = 0; index < 2; index++) await activity.authorize('DELETE', `fixture_${index}`);
  await expect(activity.authorize('DELETE', 'third')).rejects.toBeInstanceOf(ActivityConfirmationRequired);
  now += 120_000;
  await expect(activity.authorize('REVEAL', 'another')).rejects.toBeInstanceOf(ActivityConfirmationRequired);
});

test('a failed audit write prevents the action and is retried with the same incident, never faked as a success', async () => {
  const record = jest.spyOn(offlineVaultService, 'recordSecurityReport').mockRejectedValueOnce(new Error('fixture-audit-failure'));
  for (let index = 0; index < 4; index++) await activity.authorize('REVEAL', `fixture_${index}`);
  await expect(activity.authorize('REVEAL', 'fifth')).rejects.toThrow('fixture-audit-failure');
  await expect(activity.authorize('REVEAL', 'sixth')).rejects.toBeInstanceOf(ActivityConfirmationRequired);
  expect(record.mock.calls[0][0].id).toBe(record.mock.calls[1][0].id);
  expect(await offlineVaultService.getSecurityReports()).toHaveLength(1);
});

test('the facade does not decrypt the fifth different item or delete a third item before reauthentication', async () => {
  for (let index = 0; index < 5; index++) await offlineVaultService.saveItem(`fixture_${index}`, 'Fixture', 'OTHER', { password: 'private-fixture' });
  const decrypt = jest.spyOn(offlineVaultService, 'decryptItem');
  for (let index = 0; index < 4; index++) await vaultService.revealItem(`fixture_${index}`);
  await expect(vaultService.revealItem('fixture_4')).rejects.toBeInstanceOf(ActivityConfirmationRequired);
  expect(decrypt).toHaveBeenCalledTimes(4);
  vaultActivityService.reset();
  await vaultService.deleteItem('fixture_0'); await vaultService.deleteItem('fixture_1');
  await expect(vaultService.deleteItem('fixture_2')).rejects.toBeInstanceOf(ActivityConfirmationRequired);
  expect(await offlineVaultService.getItem('fixture_2')).not.toBeNull();
});

test('offline emergency is not denied by a burst, but copying its revealed item later requires a genuine fresh confirmation', async () => {
  jest.spyOn(connectivityService, 'isOnline', 'get').mockReturnValue(false);
  await offlineVaultService.saveItem('emergency_fixture', 'Fixture', 'OTHER', { password: 'private-fixture' }, { requiresApproval: true });
  for (let index = 0; index < 9; index++) await vaultActivityService.authorize('COPY', 'emergency_fixture');
  await expect(vaultActivityService.authorize('COPY', 'emergency_fixture')).rejects.toBeInstanceOf(ActivityConfirmationRequired);
  const emergency = await vaultService.revealEmergency('emergency_fixture', async () => { key = importVaultKey(new Uint8Array(32).fill(7)); });
  expect(emergency.plaintext.password).toBe('private-fixture');
  await vaultActivityService.confirmedAfterAuthentication();
  const repeated = await vaultService.revealEmergencyAfterConfirmation('emergency_fixture', emergency.emergencyAccessId);
  expect(repeated.plaintext.password).toBe('private-fixture');
  expect(await offlineVaultService.getEmergencyEvents()).toHaveLength(1);
  await expect(vaultService.revealEmergencyAfterConfirmation('unrelated', emergency.emergencyAccessId)).rejects.toThrow('SESSION_CHANGED');
  vaultActivityService.reset();
  await expect(vaultService.revealEmergencyAfterConfirmation('emergency_fixture', emergency.emergencyAccessId)).rejects.toThrow();
});

test('switching accounts cannot carry counters, incidents or confirmation into the other vault', async () => {
  for (let index = 0; index < 4; index++) await activity.authorize('REVEAL', `fixture_${index}`);
  await expect(activity.authorize('REVEAL', 'fifth')).rejects.toBeInstanceOf(ActivityConfirmationRequired);
  await offlineVaultService.initialize(randomUUID());
  await activity.authorize('REVEAL', 'other_owner_item');
  expect(await offlineVaultService.getSecurityReports()).toEqual([]);
  await expect(activity.confirmedAfterAuthentication()).rejects.toThrow('Abra novamente');
});
