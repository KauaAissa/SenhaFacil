import { randomUUID } from 'node:crypto';
import { VaultService } from '../src/vault/vault.service';
import { securityMock } from './security-mock';
import { PrismaService } from '../src/prisma/prisma.service';
import { VaultCategoryDto } from '../src/vault/dto/create-vault-item.dto';

function createService() {
  const items = new Map<string, any>();
  const receipts = new Map<string, any>();
  const transaction = {
    trustedContact: { findFirst: jest.fn().mockResolvedValue(null) },
    vaultItem: {
      findFirst: jest.fn(async ({ where }) => items.get(where.id) ?? null),
      findUnique: jest.fn(async ({ where }) => items.get(where.id) ?? null),
      create: jest.fn(async ({ data }) => { const item = { ...data }; items.set(item.id, item); return item; }),
      update: jest.fn(async ({ where, data }) => { const item = { ...items.get(where.id), ...data }; items.set(where.id, item); return item; }),
    },
    vaultSyncOperation: {
      findUnique: jest.fn(async ({ where }) => receipts.get(`${where.userId_operationId.userId}:${where.userId_operationId.operationId}`) ?? null),
      create: jest.fn(async ({ data }) => { receipts.set(`${data.userId}:${data.operationId}`, data); return data; }),
    },
  };
  const prisma = { $transaction: jest.fn(async (callback) => callback(transaction)),
    serializable: jest.fn(async (callback) => callback(transaction)) };
  return { service: new VaultService(prisma as unknown as PrismaService, securityMock()), items, transaction };
}

const makeItem = () => ({ id: `local_${randomUUID()}`, operationId: randomUUID(), version: 0,
  label: 'Banco', category: VaultCategoryDto.BANKING, encryptedPayload: 'ciphertext', iv: 'abcdefghijklmnop', updatedAt: new Date().toISOString() });

test('retrying the same operation returns its receipt without duplicating the vault item', async () => {
  const { service, items, transaction } = createService();
  const item = makeItem();
  const first = await service.sync('owner', { items: [item] });
  const retried = await service.sync('owner', { items: [item] });
  expect(retried).toEqual(first);
  expect(items.size).toBe(1);
  expect(transaction.vaultItem.create).toHaveBeenCalledTimes(1);
});

test('stable offline IDs remain isolated across accounts', async () => {
  const { service, items } = createService();
  const item = makeItem();
  const first = await service.sync('owner-a', { items: [item] });
  const second = await service.sync('owner-b', { items: [item] });
  expect(first.results[0].serverId).not.toBe(second.results[0].serverId);
  expect(items.size).toBe(2);
});

test('stale version reports conflict without overwriting server data', async () => {
  const { service, items } = createService();
  const item = makeItem();
  const created = (await service.sync('owner', { items: [item] })).results[0];
  const result = await service.sync('owner', { items: [{ ...item, id: created.serverId, operationId: randomUUID(), label: 'Stale', version: 0 }] });
  expect(result.results[0].action).toBe('conflict');
  expect(items.get(created.serverId).label).toBe('Banco');
});

test('delete is durable and a stale edit cannot resurrect a tombstone', async () => {
  const { service, items } = createService();
  const item = makeItem();
  const created = (await service.sync('owner', { items: [item] })).results[0];
  const deleted = await service.sync('owner', { items: [{ ...item, id: created.serverId, operationId: randomUUID(), version: 1, deleted: true }] });
  expect(deleted.results[0].action).toBe('deleted');
  expect(items.get(created.serverId).encryptedPayload).toBe('');
  const stale = await service.sync('owner', { items: [{ ...item, id: created.serverId, operationId: randomUUID(), version: 1 }] });
  expect(stale.results[0].action).toBe('conflict');
  expect(items.get(created.serverId).deletedAt).toBeInstanceOf(Date);
});

test('cannot update another account by sending its server ID', async () => {
  const { service } = createService();
  const item = makeItem();
  const created = (await service.sync('owner-a', { items: [item] })).results[0];
  await expect(service.sync('owner-b', { items: [{ ...item, id: created.serverId, operationId: randomUUID(), version: 1 }] })).rejects.toThrow('not found');
});

test('assisted creation is rejected both directly and through sync until a qualified contact exists', async () => {
  const { service, transaction, items } = createService();
  const item = { ...makeItem(), requiresApproval: true };
  await expect(service.create('owner', item)).rejects.toThrow('familiar ativo');
  await expect(service.sync('owner', { items: [item] })).rejects.toThrow('familiar ativo');
  expect(items.size).toBe(0);
  expect(transaction.trustedContact.findFirst).toHaveBeenCalledWith({
    where: { elderlyId: 'owner', status: 'ACTIVE', permissions: { has: 'APPROVE_ACCESS' }, caregiver: { isActive: true } },
    select: { id: true },
  });
  transaction.trustedContact.findFirst.mockResolvedValue({ id: 'qualified-contact' });
  await expect(service.sync('owner', { items: [item] })).resolves.toMatchObject({ synced: 1 });
});

test('enabling assistance is guarded while keeping existing protection and deletions is still allowed after contact removal', async () => {
  const { service, transaction, items } = createService();
  const item = makeItem();
  const created = (await service.sync('owner', { items: [item] })).results[0];
  await expect(service.update('owner', created.serverId, { requiresApproval: true })).rejects.toThrow('familiar ativo');
  await expect(service.sync('owner', { items: [{ ...item, id: created.serverId, version: 1,
    operationId: randomUUID(), requiresApproval: true }] })).rejects.toThrow('familiar ativo');
  transaction.trustedContact.findFirst.mockResolvedValue({ id: 'qualified-contact' });
  await service.sync('owner', { items: [{ ...item, id: created.serverId, version: 1,
    operationId: randomUUID(), requiresApproval: true }] });
  transaction.trustedContact.findFirst.mockResolvedValue(null);
  const updated = await service.sync('owner', { items: [{ ...item, id: created.serverId, version: 2,
    operationId: randomUUID(), requiresApproval: true, isFavorite: true }] });
  expect(updated.results[0].action).toBe('updated');
  expect(items.get(created.serverId).requiresApproval).toBe(true);
  const deleted = await service.sync('owner', { items: [{ ...item, id: created.serverId, version: 3,
    operationId: randomUUID(), requiresApproval: true, deleted: true }] });
  expect(deleted.results[0].action).toBe('deleted');
});