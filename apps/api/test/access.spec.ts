import { createHash } from 'node:crypto';
test('request lookup maps an offline ID to the stable owner-scoped server ID', async () => {
  const { service, prisma } = createService();
  await expect(service.requestAccess('owner', { vaultItemId: 'local_open' })).rejects.toThrow('familiar ativo');
  expect(prisma.vaultItem.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
    id: `sf_${createHash('sha256').update('owner:local_open').digest('hex')}`, userId: 'owner', deletedAt: null,
  } }));
});
import { AccessService } from '../src/access/access.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { AccessGateway } from '../src/access/access.gateway';
import { AccessDecision } from '../src/access/dto/respond-access.dto';

function createService() {
  const prisma = {
    vaultItem: { findFirst: jest.fn().mockResolvedValue({ id: 'item', label: 'Banco', requiresApproval: true }) },
    trustedContact: { findFirst: jest.fn().mockResolvedValue({ id: 'relationship' }), findMany: jest.fn().mockResolvedValue([]) },
    accessLog: {
      findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(),
      findUnique: jest.fn().mockResolvedValue({ id: 'request', status: 'PENDING', expiresAt: new Date(Date.now() + 60_000),
        vaultItem: { userId: 'owner', label: 'Banco' }, requester: { id: 'owner', fcmToken: null } }),
      findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 0 }), upsert: jest.fn(),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ name: 'Owner' }) },
    serializable: jest.fn(),
  };
  prisma.serializable.mockImplementation(async (operation) => operation(prisma));
  const gateway = { notifyAccessResolved: jest.fn() };
  const notifications = { sendAccessResolved: jest.fn(), sendAccessRequest: jest.fn() };
  return { prisma, gateway, service: new AccessService(prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService, gateway as unknown as AccessGateway) };
}

test('a losing concurrent caregiver response cannot emit a second decision', async () => {
  const { service, prisma, gateway } = createService();
  await expect(service.respondToAccess('caregiver', { accessLogId: 'request', decision: AccessDecision.APPROVED })).rejects.toThrow('respondida');
  expect(prisma.accessLog.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'PENDING', expiresAt: expect.any(Object) }) }));
  expect(gateway.notifyAccessResolved).not.toHaveBeenCalled();
});

test('expiry cannot overwrite or announce an already approved request', async () => {
  const { service, prisma, gateway } = createService();
  prisma.accessLog.findMany.mockResolvedValue([{ id: 'request', requester: { id: 'owner', fcmToken: null }, vaultItem: { label: 'Banco' } }] as never);
  expect(await service.expirePendingLogs()).toBe(0);
  expect(gateway.notifyAccessResolved).not.toHaveBeenCalled();
});

test('no active approver means no orphan pending request is created', async () => {
  const { service, prisma } = createService();
  await expect(service.requestAccess('owner', { vaultItemId: 'item' })).rejects.toThrow('familiar ativo');
  expect(prisma.accessLog.create).not.toHaveBeenCalled();
});

test('repeated request returns the existing pending ID instead of creating another', async () => {
  const { service, prisma } = createService();
  prisma.trustedContact.findMany.mockResolvedValue([{ caregiver: { fcmToken: null } }] as never);
  prisma.accessLog.findFirst.mockResolvedValue({ id: 'pending', status: 'PENDING', expiresAt: new Date(Date.now() + 60_000) } as never);
  expect((await service.requestAccess('owner', { vaultItemId: 'item' })).accessLogId).toBe('pending');
  expect(prisma.accessLog.create).not.toHaveBeenCalled();
});

test('status lookup forbids unrelated accounts', async () => {
  const { service, prisma } = createService();
  prisma.accessLog.findUnique.mockResolvedValue({ id: 'request', requesterId: 'owner', status: 'PENDING', expiresAt: new Date() } as never);
  prisma.trustedContact.findFirst.mockResolvedValue(null as never);
  await expect(service.findState('stranger', 'request')).rejects.toThrow('permissao');
});