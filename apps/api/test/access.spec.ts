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
import { ValidationPipe } from '@nestjs/common';
import { HEADERS_METADATA } from '@nestjs/common/constants';
import { AccessController } from '../src/access/access.controller';
import { RequestAccessDto } from '../src/access/dto/request-access.dto';
import { AccessExpiryService } from '../src/access/access-expiry.service';
import { securityMock } from './security-mock';

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
    accessRequestLocation: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    serializable: jest.fn(),
  };
  prisma.serializable.mockImplementation(async (operation) => operation(prisma));
  const gateway = { notifyAccessResolved: jest.fn() };
  const notifications = { sendAccessResolved: jest.fn(), sendAccessRequest: jest.fn() };
  return { prisma, gateway, notifications, service: new AccessService(prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService, gateway as unknown as AccessGateway, securityMock()) };
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

test('new requests expire exactly ten minutes after creation', async () => {
  const { service, prisma } = createService();
  const now = Date.now();
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
  try {
    prisma.trustedContact.findMany.mockResolvedValue([{ caregiver: { id: 'caregiver' } }] as never);
    prisma.accessLog.create.mockImplementation(async ({ data }) => ({ id: 'request', status: data.status, expiresAt: data.expiresAt }));
    const result = await service.requestAccess('owner', { vaultItemId: 'item' });
    expect(result.status).toBe('PENDING');
    expect(result.expiresAt.getTime() - now).toBe(10 * 60_000);
    expect(prisma.accessLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      expiresAt: new Date(now + 10 * 60_000),
    }) }));
  } finally { clock.mockRestore(); }
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

function location() { return { latitude: 0, longitude: 0, accuracy: 80, capturedAt: new Date().toISOString() }; }

test('a new request stores its location separately and never passes coordinates to push', async () => {
  const { service, prisma, notifications } = createService();
  prisma.trustedContact.findMany.mockResolvedValue([{ caregiver: { id: 'caregiver' } }] as never);
  prisma.accessLog.create.mockImplementation(async ({ data }) => ({ id: 'request', status: data.status,
    expiresAt: data.expiresAt, location: { accessLogId: 'request' } }));
  const point = location();
  const result = await service.requestAccess('owner', { vaultItemId: 'item', location: point });
  expect(result.locationShared).toBe(true);
  expect(prisma.accessLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
    location: { create: { ...point, capturedAt: new Date(point.capturedAt) } },
  }) }));
  expect(notifications.sendAccessRequest).toHaveBeenCalledWith({ userId: 'caregiver', accessLogId: 'request' });
  expect(result).not.toHaveProperty('location');
});

test('a repeated pending request keeps its original location, with no tracking update or second push', async () => {
  const { service, prisma, notifications } = createService();
  prisma.trustedContact.findMany.mockResolvedValue([{ caregiver: { id: 'caregiver' } }] as never);
  prisma.accessLog.findFirst.mockResolvedValue({ id: 'pending', status: 'PENDING',
    expiresAt: new Date(Date.now() + 60_000), location: { accessLogId: 'pending' } } as never);
  expect(await service.requestAccess('owner', { vaultItemId: 'item', location: location() })).toMatchObject({
    accessLogId: 'pending', locationShared: true,
  });
  expect(prisma.accessLog.create).not.toHaveBeenCalled();
  expect(notifications.sendAccessRequest).not.toHaveBeenCalled();
});

test.each([-121_000, 61_000])('stale or future location timestamps are rejected explicitly (%s)', async (offset) => {
  const { service, prisma } = createService();
  await expect(service.requestAccess('owner', { vaultItemId: 'item',
    location: { ...location(), capturedAt: new Date(Date.now() + offset).toISOString() } })).rejects.toThrow('Localizacao antiga');
  expect(prisma.accessLog.create).not.toHaveBeenCalled();
});

test('only live pending requests with a currently authorized active relationship select location', async () => {
  const { service, prisma } = createService();
  await service.findPendingForCaregiver('caregiver');
  expect(prisma.accessLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ status: 'PENDING', expiresAt: { gt: expect.any(Date) },
      requester: { isActive: true, elderlyRelations: { some: { caregiverId: 'caregiver', status: 'ACTIVE',
        permissions: { has: 'APPROVE_ACCESS' }, caregiver: { isActive: true } } } } }),
    select: expect.objectContaining({ location: { select: { latitude: true, longitude: true, accuracy: true, capturedAt: true } } }),
  }));
  expect(Reflect.getMetadata(HEADERS_METADATA, AccessController.prototype.findPending))
    .toContainEqual({ name: 'Cache-Control', value: 'no-store' });
});

test('history and state responses never select coordinates, even for a pending request', async () => {
  const { service, prisma } = createService();
  await service.history('owner');
  expect(prisma.accessLog.findMany.mock.calls[0][0].select.location).toEqual({ select: { historyExpiresAt: true } });
  prisma.accessLog.findUnique.mockResolvedValue({ id: 'request', requesterId: 'owner', status: 'PENDING',
    expiresAt: new Date(Date.now() + 60_000) } as never);
  await service.findState('owner', 'request');
  expect(prisma.accessLog.findUnique.mock.calls[0][0].select).not.toHaveProperty('location');
});

test.each([AccessDecision.APPROVED, AccessDecision.DENIED])('resolving a request deletes only unconsented or expired points in the same transaction (%s)', async (decision) => {
  const { service, prisma, notifications } = createService();
  prisma.accessLog.updateMany.mockResolvedValue({ count: 1 });
  await service.respondToAccess('caregiver', { accessLogId: 'request', decision });
  expect(prisma.serializable).toHaveBeenCalledTimes(1);
  expect(prisma.accessRequestLocation.deleteMany).toHaveBeenCalledWith({ where: { accessLogId: 'request',
    OR: [{ historyExpiresAt: null }, { historyExpiresAt: { lte: expect.any(Date) } }] } });
  expect(notifications.sendAccessResolved).toHaveBeenCalledWith({ userId: 'owner', status: decision, accessLogId: 'request' });
});

test('a failed location deletion fails the resolution before any announcement', async () => {
  const { service, prisma, gateway } = createService();
  prisma.accessLog.updateMany.mockResolvedValue({ count: 1 });
  prisma.accessRequestLocation.deleteMany.mockRejectedValue(new Error('database unavailable'));
  await expect(service.respondToAccess('caregiver', { accessLogId: 'request', decision: AccessDecision.APPROVED }))
    .rejects.toThrow('database unavailable');
  expect(gateway.notifyAccessResolved).not.toHaveBeenCalled();
});

test('cancellation deletes coordinates transactionally, but an unauthorized cancellation cannot erase them', async () => {
  const { service, prisma } = createService();
  await expect(service.cancel('stranger', 'request')).rejects.toThrow('encerrado');
  expect(prisma.accessRequestLocation.deleteMany).not.toHaveBeenCalled();
  prisma.accessLog.updateMany.mockResolvedValue({ count: 1 });
  expect(await service.cancel('owner', 'request')).toEqual({ status: 'CANCELLED' });
  expect(prisma.accessRequestLocation.deleteMany).toHaveBeenCalledWith({ where: { accessLogId: 'request' } });
});

test('expiry purges cancelled, expired and unconsented points without deleting valid historical snapshots', async () => {
  const { service, prisma } = createService();
  await service.expirePendingLogs();
  expect(prisma.accessRequestLocation.deleteMany).toHaveBeenCalledWith({ where: { OR: [
    { historyExpiresAt: { lte: expect.any(Date) } },
    { accessLog: { status: { notIn: ['PENDING', 'APPROVED', 'DENIED'] } } },
    { accessLog: { status: 'PENDING', expiresAt: { lte: expect.any(Date) } } },
    { historyExpiresAt: null, accessLog: { status: { not: 'PENDING' } } },
  ] } });
});

test('expiry failures propagate instead of silently claiming successful cleanup', async () => {
  const { service, prisma } = createService();
  prisma.accessRequestLocation.deleteMany.mockRejectedValue(new Error('database unavailable'));
  await expect(service.expirePendingLogs()).rejects.toThrow('database unavailable');
});

test('startup resumes expiry cleanup without waiting for the first cron tick', async () => {
  const { service } = createService();
  const expiry = jest.spyOn(service, 'expirePendingLogs').mockResolvedValue(0);
  await new AccessExpiryService(service).onModuleInit();
  expect(expiry).toHaveBeenCalledTimes(1);
});

test('startup cleanup errors are not silently ignored', async () => {
  const { service } = createService();
  jest.spyOn(service, 'expirePendingLogs').mockRejectedValue(new Error('database unavailable'));
  await expect(new AccessExpiryService(service).onModuleInit()).rejects.toThrow('database unavailable');
});

const validation = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
test('validated requests may omit location without inventing a position', async () => {
  const dto = await validation.transform({ vaultItemId: 'item' }, { type: 'body', metatype: RequestAccessDto });
  expect(dto.location).toBeUndefined();
  const withLocation = await validation.transform({ vaultItemId: 'item', location: location() }, { type: 'body', metatype: RequestAccessDto });
  expect(withLocation.location.latitude).toBe(0);
});
test.each([
  { latitude: 91 }, { latitude: -91 }, { longitude: 181 }, { longitude: -181 }, { latitude: '0' },
  { accuracy: -1 }, { accuracy: NaN }, { accuracy: Infinity }, { capturedAt: 'not-a-date' },
  { address: 'unnecessary personal data' },
])('location DTO rejects invalid values or extra personal fields (%j)', async (overrides) => {
  await expect(validation.transform({ vaultItemId: 'item', location: { ...location(), ...overrides } },
    { type: 'body', metatype: RequestAccessDto })).rejects.toThrow();
});

test('explicit history consent sets exactly thirty days from server creation, not a client-selected deadline', async () => {
  const { service, prisma } = createService();
  const now = Date.now();
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
  try {
    prisma.trustedContact.findMany.mockResolvedValue([{ caregiver: { id: 'caregiver' } }] as never);
    prisma.accessLog.create.mockImplementation(async ({ data }) => ({ id: 'request', status: data.status,
      expiresAt: data.expiresAt, location: { accessLogId: 'request', historyExpiresAt: data.location.create.historyExpiresAt } }));
    const result = await service.requestAccess('owner', { vaultItemId: 'item', location: location(), retainLocationInHistory: true });
    expect(result.locationHistoryExpiresAt?.getTime()).toBe(now + 30 * 24 * 60 * 60_000);
    expect(result.expiresAt.getTime()).toBe(now + 10 * 60_000);
    expect(prisma.accessLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      requestedAt: new Date(now), location: { create: expect.objectContaining({ historyExpiresAt: result.locationHistoryExpiresAt }) },
    }) }));
  } finally { clock.mockRestore(); }
});

test('retry cannot extend a retained snapshot or opt an existing legacy request into retention', async () => {
  const { service, prisma } = createService();
  prisma.trustedContact.findMany.mockResolvedValue([{ caregiver: { id: 'caregiver' } }] as never);
  prisma.accessLog.findFirst.mockResolvedValue({ id: 'pending', status: 'PENDING', expiresAt: new Date(Date.now() + 60_000),
    location: { accessLogId: 'pending', historyExpiresAt: null } } as never);
  const result = await service.requestAccess('owner', { vaultItemId: 'item', location: location(), retainLocationInHistory: true });
  expect(result.locationHistoryExpiresAt).toBeNull();
  expect(prisma.accessLog.create).not.toHaveBeenCalled();
});

test.each(['true', 30, 1])('history consent is a strict boolean (%s)', async (retainLocationInHistory) => {
  await expect(validation.transform({ vaultItemId: 'item', retainLocationInHistory },
    { type: 'body', metatype: RequestAccessDto })).rejects.toThrow();
});

test('clients cannot supply an arbitrary location retention deadline', async () => {
  await expect(validation.transform({ vaultItemId: 'item', retainLocationInHistory: true,
    location: { ...location(), historyExpiresAt: '2099-01-01T00:00:00Z' } }, { type: 'body', metatype: RequestAccessDto })).rejects.toThrow();
});

test('historical location endpoint is no-store and rejects invalid identifiers before reaching the service', () => {
  const { service } = createService();
  const controller = new AccessController(service);
  expect(Reflect.getMetadata(HEADERS_METADATA, AccessController.prototype.historyLocation))
    .toContainEqual({ name: 'Cache-Control', value: 'no-store' });
  const location = jest.spyOn(service, 'historyLocation');
  expect(() => controller.historyLocation({ user: { id: 'owner', role: 'ELDERLY' } }, '../invalid')).toThrow();
  expect(location).not.toHaveBeenCalled();
});