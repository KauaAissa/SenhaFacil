import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { AccessService } from '../src/access/access.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { AccessGateway } from '../src/access/access.gateway';
import { AccessDecision } from '../src/access/dto/respond-access.dto';
import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AccessController } from '../src/access/access.controller';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { createHash } from 'node:crypto';
import { SecurityService } from '../src/security/security.service';
import { createHmac } from 'node:crypto';

const databaseTests = process.env.INTEGRATION_TESTS === '1' ? describe : describe.skip;

databaseTests('ephemeral and consented historical request locations in PostgreSQL', () => {
  const prisma = new PrismaService();
  const notifications = { sendAccessRequest: jest.fn(), sendAccessResolved: jest.fn(), sendEmergency: jest.fn() };
  const gateway = { notifyAccessResolved: jest.fn() };
  const security = new SecurityService(prisma, notifications as unknown as NotificationsService,
    { getOrThrow: () => 'location-history-integration-secret' } as unknown as ConfigService);
  const access = new AccessService(prisma, notifications as unknown as NotificationsService, gateway as unknown as AccessGateway, security);
  const ids: string[] = [];
  let owner: string;
  let caregiver: string;
  let otherCaregiver: string;
  let stranger: string;
  let app: NestFastifyApplication;
  const secret = 'location-history-integration-secret';
  const jwt = new JwtService({ secret });
  const tokens = new Map<string, string>();
  const point = () => ({ latitude: 0, longitude: 0, accuracy: 80, capturedAt: new Date().toISOString() });

  beforeAll(async () => {
    await prisma.$connect();
    for (const role of ['ELDERLY', 'CAREGIVER', 'CAREGIVER', 'CAREGIVER'] as const) {
      const user = await prisma.user.create({ data: { name: 'Location integration fixture',
        email: `${randomUUID()}@example.invalid`, role, passwordHash: 'unused-integration-fixture',
        kdfSalt: randomBytes(16).toString('hex') } });
      ids.push(user.id);
    }
    [owner, caregiver, otherCaregiver, stranger] = ids;
    for (const caregiverId of [caregiver, otherCaregiver]) await prisma.trustedContact.create({ data: {
      elderlyId: owner, caregiverId, status: 'ACTIVE', permissions: ['APPROVE_ACCESS'],
    } });
    for (const userId of ids) {
      const sid = randomUUID();
      await prisma.authSession.create({ data: { id: sid, userId,
        refreshHash: createHash('sha256').update(randomUUID()).digest('hex'), expiresAt: new Date(Date.now() + 3_600_000) } });
      tokens.set(userId, jwt.sign({ sub: userId, sid }));
    }
    jest.replaceProperty(process, 'env', { ...process.env, JWT_SECRET: secret });
    const module = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [AccessController],
      providers: [JwtStrategy, JwtAuthGuard, { provide: ConfigService, useValue: new ConfigService() },
        { provide: PrismaService, useValue: prisma }, { provide: AccessService, useValue: access }],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }));
    await app.init(); await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    try { await prisma.user.deleteMany({ where: { id: { in: ids } } }); }
    finally { await app?.close(); await prisma.$disconnect(); jest.restoreAllMocks(); }
  });
  afterEach(async () => {
    await prisma.accessLog.deleteMany({ where: { requesterId: owner, status: 'PENDING' } });
    const key = createHmac('sha256', secret).update(owner).digest('hex');
    await prisma.securityRateState.deleteMany({ where: { key: `access:${key}` } });
  });

  async function request(withLocation = true, retainLocationInHistory = false) {
    const item = await prisma.vaultItem.create({ data: { userId: owner, label: 'Location fixture', category: 'OTHER',
      encryptedPayload: randomBytes(48).toString('base64'), iv: randomBytes(12).toString('base64'), requiresApproval: true } });
    return access.requestAccess(owner, { vaultItemId: item.id, retainLocationInHistory, ...(withLocation ? { location: point() } : {}) });
  }

  function historical(userId: string, id: string) {
    return app.inject({ method: 'GET', url: `/access/history/${id}/location`, headers: { authorization: `Bearer ${tokens.get(userId)}` } });
  }

  test('only authorized caregivers receive coordinates, with no location in history or state', async () => {
    const result = await request();
    expect(result.locationShared).toBe(true);
    expect((await access.findPendingForCaregiver(caregiver)).find((entry) => entry.id === result.accessLogId)?.location)
      .toMatchObject({ latitude: 0, longitude: 0, accuracy: 80, capturedAt: expect.any(Date) });
    expect(await access.findPendingForCaregiver(stranger)).toEqual([]);
    expect(JSON.stringify(await access.history(owner))).not.toContain('latitude');
    expect(await access.findState(owner, result.accessLogId)).not.toHaveProperty('location');
  });

  test('revocation and permission removal prevent subsequent location reads', async () => {
    const where = { elderlyId_caregiverId: { elderlyId: owner, caregiverId: caregiver } };
    await prisma.trustedContact.update({ where, data: { status: 'REVOKED' } });
    expect(await access.findPendingForCaregiver(caregiver)).toEqual([]);
    await prisma.trustedContact.update({ where, data: { status: 'ACTIVE', permissions: [] } });
    expect(await access.findPendingForCaregiver(caregiver)).toEqual([]);
    await prisma.trustedContact.update({ where, data: { permissions: ['APPROVE_ACCESS'] } });
    await prisma.user.update({ where: { id: caregiver }, data: { isActive: false } });
    expect(await access.findPendingForCaregiver(caregiver)).toEqual([]);
    await prisma.user.update({ where: { id: caregiver }, data: { isActive: true } });
  });

  test('retrying a pending request does not replace the original snapshot', async () => {
    const result = await request();
    const log = await prisma.accessLog.findUniqueOrThrow({ where: { id: result.accessLogId } });
    const original = await prisma.accessRequestLocation.findUniqueOrThrow({ where: { accessLogId: result.accessLogId } });
    const repeated = await access.requestAccess(owner, { vaultItemId: log.vaultItemId,
      location: { ...point(), latitude: 1 } });
    expect(repeated.accessLogId).toBe(result.accessLogId);
    expect(await prisma.accessRequestLocation.findUnique({ where: { accessLogId: result.accessLogId } })).toEqual(original);
  });

  test.each([AccessDecision.APPROVED, AccessDecision.DENIED])('decision %s removes coordinates and retains only normal audit data', async (decision) => {
    const result = await request();
    await access.respondToAccess(caregiver, { accessLogId: result.accessLogId, decision });
    expect(await prisma.accessRequestLocation.findUnique({ where: { accessLogId: result.accessLogId } })).toBeNull();
    expect((await prisma.accessLog.findUniqueOrThrow({ where: { id: result.accessLogId } })).status).toBe(decision);
  });

  test('only the owner can cancel; successful cancellation removes the snapshot', async () => {
    const result = await request();
    await expect(access.cancel(stranger, result.accessLogId)).rejects.toThrow();
    expect(await prisma.accessRequestLocation.findUnique({ where: { accessLogId: result.accessLogId } })).not.toBeNull();
    await access.cancel(owner, result.accessLogId);
    expect(await prisma.accessRequestLocation.findUnique({ where: { accessLogId: result.accessLogId } })).toBeNull();
  });

  test('expired snapshots cannot be read before the cron runs and are deleted by expiry', async () => {
    const result = await request();
    await prisma.accessLog.update({ where: { id: result.accessLogId }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    expect((await access.findPendingForCaregiver(caregiver)).some((entry) => entry.id === result.accessLogId)).toBe(false);
    await access.expirePendingLogs();
    expect(await prisma.accessRequestLocation.findUnique({ where: { accessLogId: result.accessLogId } })).toBeNull();
    expect((await prisma.accessLog.findUniqueOrThrow({ where: { id: result.accessLogId } })).status).toBe('EXPIRED');
  });

  test('concurrent decisions resolve once and remove the coordinates', async () => {
    const result = await request();
    const decisions = await Promise.allSettled([caregiver, otherCaregiver].map((caregiverId) =>
      access.respondToAccess(caregiverId, { accessLogId: result.accessLogId, decision: AccessDecision.APPROVED })));
    expect(decisions.filter((decision) => decision.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.accessRequestLocation.findUnique({ where: { accessLogId: result.accessLogId } })).toBeNull();
  });

  test('a request without GPS remains valid, while all push and socket payloads omit coordinates', async () => {
    const result = await request(false);
    expect(result.locationShared).toBe(false);
    expect((await access.findPendingForCaregiver(caregiver)).find((entry) => entry.id === result.accessLogId)?.location).toBeNull();
    expect(JSON.stringify(notifications.sendAccessRequest.mock.calls)).not.toContain('latitude');
    expect(JSON.stringify(notifications.sendAccessResolved.mock.calls)).not.toContain('latitude');
    expect(JSON.stringify(gateway.notifyAccessResolved.mock.calls)).not.toContain('latitude');
  });

  test.each([AccessDecision.APPROVED, AccessDecision.DENIED])('consented %s point is retained for thirty days and loaded only on demand by an authorized account', async (decision) => {
    const result = await request(true, true);
    const original = await prisma.accessRequestLocation.findUniqueOrThrow({ where: { accessLogId: result.accessLogId } });
    const log = await prisma.accessLog.findUniqueOrThrow({ where: { id: result.accessLogId } });
    expect(original.historyExpiresAt!.getTime() - log.requestedAt.getTime()).toBe(30 * 24 * 60 * 60_000);
    expect((await historical(owner, result.accessLogId)).statusCode).toBe(404);
    await access.respondToAccess(caregiver, { accessLogId: result.accessLogId, decision });
    expect(await prisma.accessRequestLocation.findUnique({ where: { accessLogId: result.accessLogId } })).toEqual(original);
    const history = await access.historyPage(caregiver);
    expect(history.items.find((entry) => entry.id === result.accessLogId)?.locationHistoryExpiresAt).toEqual(original.historyExpiresAt);
    expect(JSON.stringify(history)).not.toMatch(/latitude|longitude/);
    for (const userId of [owner, caregiver, otherCaregiver]) {
      const response = await historical(userId, result.accessLogId);
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.json()).toEqual({ location: { latitude: 0, longitude: 0, accuracy: 80,
        capturedAt: original.capturedAt.toISOString() }, historyExpiresAt: original.historyExpiresAt!.toISOString() });
    }
    expect((await historical(stranger, result.accessLogId)).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/access/history/${result.accessLogId}/location` })).statusCode).toBe(401);
    await prisma.accessLog.update({ where: { id: result.accessLogId }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    await access.expirePendingLogs();
    expect((await historical(owner, result.accessLogId)).statusCode).toBe(200);
  });

  test('revoked, inactive and unpermitted caregivers lose historical coordinates immediately', async () => {
    const result = await request(true, true);
    await access.respondToAccess(caregiver, { accessLogId: result.accessLogId, decision: AccessDecision.APPROVED });
    const where = { elderlyId_caregiverId: { elderlyId: owner, caregiverId: caregiver } };
    try {
      await prisma.trustedContact.update({ where, data: { status: 'REVOKED' } });
      expect((await historical(caregiver, result.accessLogId)).statusCode).toBe(404);
      await prisma.trustedContact.update({ where, data: { status: 'ACTIVE', permissions: [] } });
      expect((await historical(caregiver, result.accessLogId)).statusCode).toBe(404);
      await prisma.trustedContact.update({ where, data: { permissions: ['APPROVE_ACCESS'] } });
      await prisma.user.update({ where: { id: caregiver }, data: { isActive: false } });
      expect((await historical(caregiver, result.accessLogId)).statusCode).toBe(401);
      expect((await historical(owner, result.accessLogId)).statusCode).toBe(200);
    } finally {
      await prisma.user.update({ where: { id: caregiver }, data: { isActive: true } });
      await prisma.trustedContact.update({ where, data: { status: 'ACTIVE', permissions: ['APPROVE_ACCESS'] } });
    }
  });

  test('retention deadline is enforced before cron and cleanup keeps the audit but deletes only the expired point', async () => {
    const result = await request(true, true);
    await access.respondToAccess(caregiver, { accessLogId: result.accessLogId, decision: AccessDecision.DENIED });
    await prisma.accessRequestLocation.update({ where: { accessLogId: result.accessLogId }, data: { historyExpiresAt: new Date() } });
    expect((await historical(owner, result.accessLogId)).statusCode).toBe(404);
    expect((await access.history(owner)).find((entry) => entry.id === result.accessLogId)?.locationHistoryExpiresAt).toBeNull();
    await access.expirePendingLogs();
    expect(await prisma.accessRequestLocation.findUnique({ where: { accessLogId: result.accessLogId } })).toBeNull();
    expect((await prisma.accessLog.findUniqueOrThrow({ where: { id: result.accessLogId } })).status).toBe('DENIED');
  });

  test('opt-in cannot preserve cancelled, expired or GPS-free requests', async () => {
    const cancelled = await request(true, true);
    await access.cancel(owner, cancelled.accessLogId);
    const expired = await request(true, true);
    await prisma.accessLog.update({ where: { id: expired.accessLogId }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    await access.expirePendingLogs();
    const noGps = await request(false, true);
    await access.respondToAccess(caregiver, { accessLogId: noGps.accessLogId, decision: AccessDecision.APPROVED });
    for (const result of [cancelled, expired, noGps]) {
      expect(await prisma.accessRequestLocation.findUnique({ where: { accessLogId: result.accessLogId } })).toBeNull();
      expect((await historical(owner, result.accessLogId)).statusCode).toBe(404);
    }
  });

  test('retries never extend retention or retrospectively opt an older pending request in', async () => {
    for (const retain of [true, false]) {
      const result = await request(true, retain);
      const log = await prisma.accessLog.findUniqueOrThrow({ where: { id: result.accessLogId } });
      const original = await prisma.accessRequestLocation.findUniqueOrThrow({ where: { accessLogId: result.accessLogId } });
      await access.requestAccess(owner, { vaultItemId: log.vaultItemId, location: point(), retainLocationInHistory: true });
      expect(await prisma.accessRequestLocation.findUnique({ where: { accessLogId: result.accessLogId } })).toEqual(original);
      await access.respondToAccess(caregiver, { accessLogId: result.accessLogId, decision: AccessDecision.APPROVED });
      expect((await historical(owner, result.accessLogId)).statusCode).toBe(retain ? 200 : 404);
    }
  });
});
