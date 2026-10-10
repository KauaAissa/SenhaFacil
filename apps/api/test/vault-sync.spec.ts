import { randomUUID } from 'node:crypto';
import { VaultService } from '../src/vault/vault.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { VaultCategoryDto } from '../src/vault/dto/create-vault-item.dto';

function createService() {
  const items = new Map<string, any>();
  const receipts = new Map<string, any>();
  const transaction = {
    vaultItem: {
      findUnique: jest.fn(async ({ where }) => items.get(where.id) ?? null),
      create: jest.fn(async ({ data }) => { const item = { ...data }; items.set(item.id, item); return item; }),
      update: jest.fn(async ({ where, data }) => { const item = { ...items.get(where.id), ...data }; items.set(where.id, item); return item; }),
    },
    vaultSyncOperation: {
      findUnique: jest.fn(async ({ where }) => receipts.get(`${where.userId_operationId.userId}:${where.userId_operationId.operationId}`) ?? null),
      create: jest.fn(async ({ data }) => { receipts.set(`${data.userId}:${data.operationId}`, data); return data; }),
    },
  };
  const prisma = { $transaction: jest.fn(async (callback) => callback(transaction)) };
  return { service: new VaultService(prisma as unknown as PrismaService), items, transaction };
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