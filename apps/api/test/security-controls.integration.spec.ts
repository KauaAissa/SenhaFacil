import 'reflect-metadata';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { UsersController } from '../src/users/users.controller';
import { UsersService } from '../src/users/users.service';
import { AccessController } from '../src/access/access.controller';
import { AccessService } from '../src/access/access.service';
import { AccessGateway } from '../src/access/access.gateway';
import { NotificationsService } from '../src/notifications/notifications.service';
import { SecurityController } from '../src/security/security.controller';
import { SecurityService } from '../src/security/security.service';
import { VaultService } from '../src/vault/vault.service';
import { VaultCategoryDto } from '../src/vault/dto/create-vault-item.dto';

const databaseTests = process.env.INTEGRATION_TESTS === '1' ? describe : describe.skip;
interface Session {
  accessToken: string;
  user: { id: string; email: string; securityVersion: number; vaultProtection: ReturnType<typeof protection> };
}
function protection() {
  return { salt: randomBytes(16).toString('hex'), recoverySalt: randomBytes(16).toString('hex'),
    passwordEnvelope: { iv: randomBytes(12).toString('base64'), ciphertext: randomBytes(100).toString('base64') },
    recoveryEnvelope: { iv: randomBytes(12).toString('base64'), ciphertext: randomBytes(100).toString('base64') } };
}

databaseTests('security controls over HTTP, JWT and PostgreSQL', () => {
  const prisma = new PrismaService();
  const secret = 'security-integration-only-secret';
  const credential = 'aa'.repeat(32);
  const recoveryCredential = 'ee'.repeat(32);
  const transport = { sendSecurityAlert: jest.fn<Promise<'SENT' | 'RETRY' | 'UNAVAILABLE'>, [string, string, string]>(async () => 'SENT'),
    sendAccessRequest: jest.fn(), sendAccessResolved: jest.fn(), sendEmergency: jest.fn() };
  const config = new ConfigService();
  const security = new SecurityService(prisma, transport as unknown as NotificationsService, config);
  const gateway = { notifyAccessResolved: jest.fn() };
  const access = new AccessService(prisma, transport as unknown as NotificationsService, gateway as unknown as AccessGateway, security);
  const vaultService = new VaultService(prisma, security);
  let app: NestFastifyApplication;
  let owner: Session;
  let caregiver: Session;
  let stranger: Session;
  let relationId: string;
  let installation: string;
  const ids: string[] = [];
  const headers = (session: Session) => ({ authorization: `Bearer ${session.accessToken}` });

  async function register(role: 'ELDERLY' | 'CAREGIVER', installationId: string = randomUUID()) {
    const prepared = protection();
    const response = await app.inject({ method: 'POST', url: '/auth/register', payload: {
      name: 'Security integration fixture', email: `${randomUUID()}@example.invalid`, role, installationId, devicePlatform: 'ANDROID',
      password: credential, recoveryCredential, authVersion: 2, kdfSalt: prepared.salt, protection: prepared,
    } });
    expect(response.statusCode).toBe(201);
    const session: Session = response.json(); ids.push(session.user.id); return session;
  }
  function login(session: Session, password = credential, installationId = installation) {
    return app.inject({ method: 'POST', url: '/auth/login', payload: { email: session.user.email, password, authVersion: 2, installationId, devicePlatform: 'ANDROID' } });
  }
  function events(session: Session) { return app.inject({ method: 'GET', url: '/security/events', headers: headers(session) }); }
  function update(payload: object) {
    return app.inject({ method: 'POST', url: '/auth/security', headers: headers(owner), payload });
  }
  async function item() {
    return prisma.vaultItem.create({ data: { userId: owner.user.id, label: 'Security fixture', category: 'OTHER', requiresApproval: true,
      encryptedPayload: randomBytes(48).toString('base64'), iv: randomBytes(12).toString('base64') } });
  }

  beforeAll(async () => {
    jest.replaceProperty(process, 'env', { ...process.env, JWT_SECRET: secret });
    const module = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.register({ secret })],
      controllers: [AuthController, UsersController, AccessController, SecurityController],
      providers: [AuthService, UsersService, JwtStrategy, JwtAuthGuard,
        { provide: PrismaService, useValue: prisma }, { provide: ConfigService, useValue: config },
        { provide: SecurityService, useValue: security }, { provide: AccessService, useValue: access }],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }));
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init(); await app.getHttpAdapter().getInstance().ready();
  });
  beforeEach(async () => {
    jest.replaceProperty(process, 'env', { ...process.env, JWT_SECRET: secret });
    ids.length = 0; installation = randomUUID(); transport.sendSecurityAlert.mockReset().mockResolvedValue('SENT');
    owner = await register('ELDERLY', installation); caregiver = await register('CAREGIVER'); stranger = await register('ELDERLY');
    const relation = await prisma.trustedContact.create({ data: { elderlyId: owner.user.id, caregiverId: caregiver.user.id,
      status: 'ACTIVE', permissions: ['APPROVE_ACCESS'] } });
    relationId = relation.id;
  }, 45_000);
  afterEach(async () => { jest.restoreAllMocks(); await prisma.user.deleteMany({ where: { id: { in: ids } } }); });
  afterAll(async () => { await app?.close(); await prisma.$disconnect(); jest.restoreAllMocks(); });

  test('registration establishes a device baseline; repeated login is quiet and a new installation is audited once', async () => {
    expect((await events(owner)).json().items).toHaveLength(0);
    expect((await login(owner)).statusCode).toBe(200);
    const newInstallation = randomUUID();
    expect((await login(owner, credential, newInstallation)).statusCode).toBe(200);
    expect((await login(owner, credential, newInstallation)).statusCode).toBe(200);
    const list = (await events(owner)).json();
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ type: 'NEW_DEVICE', source: 'SERVER' });
    expect(JSON.stringify(list)).not.toContain(newInstallation);
    expect((await prisma.authDevice.findMany({ where: { userId: owner.user.id } })).every((device) => /^[a-f0-9]{64}$/.test(device.deviceHash))).toBe(true);
    expect(await prisma.securityDelivery.count({ where: { event: { userId: owner.user.id } } })).toBe(2);
  });

  test('password, kit and recovery operations audit atomically and revoke only the owner online sessions', async () => {
    const changed = { ...owner.user.vaultProtection, salt: randomBytes(16).toString('hex') };
    expect((await update({ currentCredential: credential, credential: 'bb'.repeat(32), securityVersion: 1, protection: changed })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/users/me', headers: headers(owner) })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/users/me', headers: headers(caregiver) })).statusCode).toBe(200);
    owner = (await login(owner, 'bb'.repeat(32))).json();
    expect((await update({ currentCredential: 'bb'.repeat(32), credential: 'bb'.repeat(32), recoveryCredential: 'cc'.repeat(32),
      securityVersion: 2, protection: protection() })).statusCode).toBe(200);
    const recovered = await app.inject({ method: 'POST', url: '/auth/recover', payload: { email: owner.user.email,
      recoveryCredential: 'cc'.repeat(32), credential: 'dd'.repeat(32), newRecoveryCredential: 'ff'.repeat(32),
      securityVersion: 3, protection: protection() } });
    expect(recovered.statusCode).toBe(200);
    owner = (await login(owner, 'dd'.repeat(32))).json();
    const list = (await events(caregiver)).json().items;
    expect(list.map((entry: { type: string }) => entry.type).sort()).toEqual(['ACCOUNT_RECOVERED', 'PASSWORD_CHANGED', 'RECOVERY_KIT_REPLACED'].sort());
    expect(list.every((entry: { source: string }) => entry.source === 'SERVER')).toBe(true);
    expect(JSON.stringify(list)).not.toMatch(/credential|recoverySalt|passwordEnvelope|ciphertext/);
  }, 30_000);

  test('an audit failure rolls security changes and session revocation back, never claiming an unrecorded update', async () => {
    jest.spyOn(security, 'record').mockRejectedValueOnce(new Error('fixture-audit-failure'));
    expect((await update({ currentCredential: credential, credential: 'bb'.repeat(32), securityVersion: 1,
      protection: { ...owner.user.vaultProtection, salt: randomBytes(16).toString('hex') } })).statusCode).toBe(500);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.user.id } })).securityVersion).toBe(1);
    expect(await prisma.authSession.count({ where: { userId: owner.user.id, revokedAt: null } })).toBe(1);
  });

  test('failed login uses shared progressive 5s/30s/120s waits without extending them on blocked attempts', async () => {
    const key = `failure:${createHmac('sha256', secret).update(`login:${owner.user.email}`).digest('hex')}`;
    for (let count = 1; count <= 8; count++) {
      expect((await login(owner, 'wrong-fixture-password')).statusCode).toBe(401);
      const state = await prisma.securityRateState.findUniqueOrThrow({ where: { key } });
      expect(state.count).toBe(count);
      if (count >= 3) {
        const delay = count >= 8 ? 120 : count >= 5 ? 30 : 5;
        const blocked = await login(owner);
        expect(blocked.statusCode).toBe(429);
        expect(blocked.json()).toMatchObject({ message: 'SECURITY_LOGIN_WAIT', retryAfter: expect.any(Number) });
        expect(blocked.json().retryAfter).toBeLessThanOrEqual(delay);
        const unchanged = await prisma.securityRateState.findUniqueOrThrow({ where: { key } });
        expect(unchanged.count).toBe(count);
        expect(unchanged.blockedUntil).toEqual(state.blockedUntil);
        await prisma.securityRateState.update({ where: { key }, data: { blockedUntil: new Date(Date.now() - 1_000) } });
      }
    }
    expect((await login(owner)).statusCode).toBe(200);
    expect(await prisma.securityRateState.findUnique({ where: { key } })).toBeNull();
    expect(await prisma.securityEvent.count({ where: { userId: owner.user.id, type: 'FAILED_LOGIN_BURST' } })).toBe(1);
    expect((await events(caregiver)).json().items.some((entry: { type: string }) => entry.type === 'FAILED_LOGIN_BURST')).toBe(true);
  }, 30_000);

  test('three pending and five new requests per minute are enforced per account, while retries reuse pending requests', async () => {
    const requests: string[] = [];
    let firstItem = '';
    for (let count = 0; count < 3; count++) {
      const vault = await item(); if (count === 0) firstItem = vault.id;
      const response = await app.inject({ method: 'POST', url: '/access/request', headers: headers(owner), payload: { vaultItemId: vault.id } });
      expect(response.statusCode).toBe(201); requests.push(response.json().accessLogId);
    }
    const repeated = await app.inject({ method: 'POST', url: '/access/request', headers: headers(owner), payload: { vaultItemId: firstItem } });
    expect(repeated.json().accessLogId).toBe(requests[0]);
    const extra = await item();
    const blocked = await app.inject({ method: 'POST', url: '/access/request', headers: headers(owner), payload: { vaultItemId: extra.id } });
    expect(blocked.statusCode).toBe(429); expect(blocked.json().message).toBe('SECURITY_PENDING_LIMIT');
    for (const id of requests) await access.cancel(owner.user.id, id);
    for (let count = 0; count < 2; count++) {
      const response = await access.requestAccess(owner.user.id, { vaultItemId: extra.id });
      await access.cancel(owner.user.id, response.accessLogId);
    }
    const perMinute = await app.inject({ method: 'POST', url: '/access/request', headers: headers(owner), payload: { vaultItemId: extra.id } });
    expect(perMinute.statusCode).toBe(429); expect(perMinute.json().message).toBe('SECURITY_REQUEST_WAIT');
    expect(await prisma.securityEvent.count({ where: { userId: owner.user.id, type: 'ACCESS_REQUEST_BURST' } })).toBe(1);
  });

  test('device reports are strict, idempotent, minimal and visible only to currently authorized accounts', async () => {
    const report = { id: randomUUID(), type: 'BULK_REVEAL', count: 5, occurredAt: new Date().toISOString() };
    for (const entry of [{ ...report, password: 'never-send' }, { ...report, type: 'PASSWORD_CHANGED' }, { ...report, count: -1 }]) {
      expect((await app.inject({ method: 'POST', url: '/security/reports', headers: headers(owner), payload: { reports: [entry] } })).statusCode).toBe(400);
    }
    for (let count = 0; count < 2; count++) {
      const response = await app.inject({ method: 'POST', url: '/security/reports', headers: headers(owner), payload: { reports: [report] } });
      expect(response.statusCode).toBe(201); expect(response.json().acknowledged).toEqual([report.id]);
    }
    expect((await events(owner)).headers['cache-control']).toBe('no-store');
    expect((await events(caregiver)).json().items).toHaveLength(1);
    expect((await events(stranger)).json().items).toHaveLength(0);
    expect((await app.inject({ method: 'GET', url: '/security/events' })).statusCode).toBe(401);
    await prisma.trustedContact.update({ where: { id: relationId }, data: { status: 'REVOKED' } });
    expect((await events(caregiver)).json().items).toHaveLength(0);
    expect(await prisma.securityEvent.count({ where: { userId: owner.user.id } })).toBe(1);
  });

  test('session review excludes tokens/hashes, and revocation requires the owner current credential', async () => {
    const another: Session = (await login(owner)).json();
    const rows = await prisma.authSession.findMany({ where: { userId: owner.user.id }, orderBy: { createdAt: 'desc' } });
    const target = rows.find((row) => row.id !== rows[0].id)!;
    const foreign = await prisma.authSession.findFirstOrThrow({ where: { userId: stranger.user.id } });
    const listed = await app.inject({ method: 'GET', url: '/security/sessions', headers: headers(another) });
    expect(listed.statusCode).toBe(200); expect(listed.json().total).toBe(2);
    expect(JSON.stringify(listed.json())).not.toMatch(/refreshHash|fcmToken|deviceHash/);
    const revoke = (sessionId: string, currentCredential = credential) => app.inject({ method: 'POST', url: '/security/sessions/revoke',
      headers: headers(another), payload: { mode: 'ONE', sessionId, currentCredential } });
    expect((await revoke(target.id, 'wrong-password')).statusCode).toBe(401);
    expect((await revoke(foreign.id)).statusCode).toBe(404);
    expect((await revoke(listed.json().currentSessionId)).statusCode).toBe(400);
    expect((await revoke(target.id)).json().revoked).toBe(1);
    expect((await app.inject({ method: 'GET', url: '/users/me', headers: headers(owner) })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/users/me', headers: headers(another) })).statusCode).toBe(200);
  });

  test('delivery uses durable claims, rechecks permission and never sends an already recorded event again', async () => {
    await security.recordReports(owner.user.id, [{ id: randomUUID(), type: 'BULK_COPY', occurredAt: new Date().toISOString(), count: 10 }]);
    const otherWorker = new SecurityService(prisma, transport as unknown as NotificationsService, config);
    await Promise.all([security.deliver(), otherWorker.deliver()]);
    expect(transport.sendSecurityAlert).toHaveBeenCalledTimes(2);
    await security.deliver();
    expect(transport.sendSecurityAlert).toHaveBeenCalledTimes(2);
    transport.sendSecurityAlert.mockClear();
    await security.recordReports(owner.user.id, [{ id: randomUUID(), type: 'BULK_DELETE', occurredAt: new Date().toISOString(), count: 3 }]);
    await prisma.trustedContact.update({ where: { id: relationId }, data: { permissions: [] } });
    await security.deliver();
    expect(transport.sendSecurityAlert).toHaveBeenCalledTimes(1);
    expect(transport.sendSecurityAlert.mock.calls[0][1]).toBe(owner.user.id);
    expect(await prisma.securityDelivery.count({ where: { userId: caregiver.user.id, status: 'SKIPPED' } })).toBe(1);
  });

  test('transient transport failure is retried without deleting the event or repeating completed recipients', async () => {
    await security.recordReports(owner.user.id, [{ id: randomUUID(), type: 'BULK_COPY', occurredAt: new Date().toISOString(), count: 10 }]);
    transport.sendSecurityAlert.mockResolvedValueOnce('RETRY');
    await security.deliver();
    const retry = await prisma.securityDelivery.findFirstOrThrow({ where: { event: { userId: owner.user.id }, status: 'RETRY' } });
    expect(retry.attempts).toBe(1); expect(retry.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    await prisma.securityDelivery.update({ where: { eventId_userId: { eventId: retry.eventId, userId: retry.userId } },
      data: { nextAttemptAt: new Date(Date.now() - 1_000) } });
    await security.deliver();
    expect(transport.sendSecurityAlert).toHaveBeenCalledTimes(3);
    expect(await prisma.securityEvent.count({ where: { userId: owner.user.id } })).toBe(1);
  });

  test('emergency remains available and correlates repeated reports or a previous denial without creating duplicate audit', async () => {
    const vault = await item();
    const request = await access.requestAccess(owner.user.id, { vaultItemId: vault.id });
    const response = await app.inject({ method: 'POST', url: '/access/respond', headers: headers(caregiver),
      payload: { accessLogId: request.accessLogId, decision: 'DENIED' } });
    expect(response.statusCode).toBe(200);
    const firstId = randomUUID();
    for (const eventId of [firstId, firstId, randomUUID(), randomUUID()]) {
      const emergency = await app.inject({ method: 'POST', url: '/access/emergency', headers: headers(owner),
        payload: { eventId, vaultItemId: vault.id, occurredAt: new Date().toISOString() } });
      expect(emergency.statusCode).toBe(201);
    }
    expect(await prisma.accessLog.count({ where: { requesterId: owner.user.id, fallbackUsed: true } })).toBe(3);
    const list = (await events(owner)).json().items;
    expect(list.map((entry: { type: string }) => entry.type).sort()).toEqual(['EMERGENCY_AFTER_DENIAL', 'EMERGENCY_BURST'].sort());
    expect(list.every((entry: { source: string }) => entry.source === 'DEVICE_REPORT')).toBe(true);
  });

  test('expired events are hidden before cleanup and deletion removes deliveries by cascade', async () => {
    await security.recordReports(owner.user.id, [{ id: randomUUID(), type: 'BULK_REVEAL', occurredAt: new Date().toISOString(), count: 5 }]);
    const event = await prisma.securityEvent.findFirstOrThrow({ where: { userId: owner.user.id } });
    expect(event.expiresAt.getTime() - event.recordedAt.getTime()).toBe(90 * 24 * 60 * 60_000);
    await prisma.securityEvent.update({ where: { id: event.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    expect((await events(owner)).json().items).toHaveLength(0);
    await security.cleanup();
    expect(await prisma.securityEvent.findUnique({ where: { id: event.id } })).toBeNull();
    expect(await prisma.securityDelivery.count({ where: { eventId: event.id } })).toBe(0);
  });

  test('repeated same-kind device incidents stay in the audit but do not flood notification recipients', async () => {
    const reports = Array.from({ length: 5 }, () => ({ id: randomUUID(), type: 'BULK_REVEAL' as const, count: 5, occurredAt: new Date().toISOString() }));
    await security.recordReports(owner.user.id, reports);
    expect(await prisma.securityEvent.count({ where: { userId: owner.user.id } })).toBe(5);
    expect(await prisma.securityDelivery.count({ where: { event: { userId: owner.user.id } } })).toBe(2);
    const invalid = await app.inject({ method: 'POST', url: '/security/reports', headers: headers(owner),
      payload: { reports: [{ id: randomUUID(), type: 'BULK_COPY', count: 1, occurredAt: new Date().toISOString() }] } });
    expect(invalid.statusCode).toBe(400);
  });

  test('server deletion and sync paths audit three committed deletions, never counting retries twice', async () => {
    const rows = await Promise.all([item(), item(), item()]);
    await vaultService.remove(owner.user.id, rows[0].id);
    await vaultService.remove(owner.user.id, rows[1].id);
    const operation = { id: rows[2].id, operationId: randomUUID(), label: 'Delete fixture', category: VaultCategoryDto.OTHER,
      encryptedPayload: rows[2].encryptedPayload, iv: rows[2].iv, deleted: true, requiresApproval: false,
      version: rows[2].version, updatedAt: new Date().toISOString() };
    await vaultService.sync(owner.user.id, { items: [operation] });
    await vaultService.sync(owner.user.id, { items: [operation] });
    const events = await prisma.securityEvent.findMany({ where: { userId: owner.user.id, type: 'BULK_DELETE' } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ source: 'SERVER', count: 3 });
    expect(await prisma.vaultItem.count({ where: { userId: owner.user.id, deletedAt: { not: null } } })).toBe(3);
  });
});
