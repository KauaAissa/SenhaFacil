import { createHash, randomBytes, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../src/prisma/prisma.service';
import { VaultService } from '../src/vault/vault.service';
import { AccessService } from '../src/access/access.service';
import { UsersService } from '../src/users/users.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { AccessGateway } from '../src/access/access.gateway';
import { VaultCategoryDto } from '../src/vault/dto/create-vault-item.dto';
import { AccessDecision } from '../src/access/dto/respond-access.dto';
import { AuthService } from '../src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ContactsService } from '../src/contacts/contacts.service';

const databaseTests = process.env.INTEGRATION_TESTS === '1' ? describe : describe.skip;

databaseTests('PostgreSQL transaction and cascade integration', () => {
  const prisma = new PrismaService();
  const vault = new VaultService(prisma);
  const notifications = { sendAccessRequest: jest.fn(), sendAccessResolved: jest.fn(), sendEmergency: jest.fn() };
  const gateway = { notifyAccessResolved: jest.fn() };
  const access = new AccessService(prisma, notifications as unknown as NotificationsService, gateway as unknown as AccessGateway);
  const users = new UsersService(prisma);
  const auth = new AuthService(prisma, new JwtService({ secret: 'integration-only-secret' }),
    { getOrThrow: () => 'integration-only-secret' } as unknown as ConfigService);
  const ids: string[] = [];
  let owner: string;
  let another: string;
  const caregivers: string[] = [];
  let approvedLogId: string;
  const password = 'integration password 123';

  beforeAll(async () => {
    await prisma.$connect();
    const passwordHash = await argon2.hash(password);
    for (const role of ['ELDERLY', 'ELDERLY', 'CAREGIVER', 'CAREGIVER'] as const) {
      const user = await prisma.user.create({ data: { name: 'Integration fixture', email: `${randomUUID()}@example.invalid`,
        role, passwordHash, kdfSalt: randomBytes(16).toString('hex') } });
      ids.push(user.id);
    }
    [owner, another] = ids;
    caregivers.push(...ids.slice(2));
  }, 45_000);

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  function operation() {
    return { id: `local_${randomUUID()}`, operationId: randomUUID(), label: 'Fixture', category: VaultCategoryDto.OTHER,
      encryptedPayload: randomBytes(48).toString('base64'), iv: randomBytes(12).toString('base64'),
      requiresApproval: false, isFavorite: false, version: 0, updatedAt: new Date().toISOString() };
  }

  test('retries are idempotent, version races preserve one winner and foreign ownership is rejected', async () => {
    const item = operation();
    const receipts = await Promise.all([vault.sync(owner, { items: [item] }), vault.sync(owner, { items: [item] })]);
    const serverId = receipts[0].results[0].serverId;
    expect(receipts[1].results[0].serverId).toBe(serverId);
    expect(await prisma.vaultItem.count({ where: { userId: owner } })).toBe(1);
    const races = await Promise.all(['First', 'Second'].map((label) => vault.sync(owner, { items: [{ ...item,
      id: serverId, operationId: randomUUID(), version: 1, label }] })));
    expect(races.flatMap((result) => result.results.map((receipt) => receipt.action)).sort()).toEqual(['conflict', 'updated']);
    expect((await prisma.vaultItem.findUniqueOrThrow({ where: { id: serverId } })).version).toBe(2);
    await expect(vault.sync(another, { items: [{ ...item, id: serverId, operationId: randomUUID() }] })).rejects.toThrow();
  });

  test('simultaneous caregiver decisions cannot both resolve the same request', async () => {
    for (const caregiverId of caregivers) await prisma.trustedContact.create({ data: {
      elderlyId: owner, caregiverId, status: 'ACTIVE', permissions: ['APPROVE_ACCESS'],
    } });
    const receipt = await vault.sync(owner, { items: [{ ...operation(), requiresApproval: true }] });
    const request = await access.requestAccess(owner, { vaultItemId: receipt.results[0].serverId });
    approvedLogId = request.accessLogId;
    const responses = await Promise.allSettled(caregivers.map((caregiverId) => access.respondToAccess(caregiverId,
      { accessLogId: approvedLogId, decision: AccessDecision.APPROVED })));
    expect(responses.filter((response) => response.status === 'fulfilled')).toHaveLength(1);
    expect(gateway.notifyAccessResolved).toHaveBeenCalledTimes(1);
    expect((await prisma.accessLog.findUniqueOrThrow({ where: { id: approvedLogId } })).status).toBe('APPROVED');
  });

  test('account deletion cascades owned data and anonymizes an excluded approver', async () => {
    const sessionId = randomUUID();
    await prisma.authSession.create({ data: { id: sessionId, userId: owner,
      refreshHash: createHash('sha256').update(randomUUID()).digest('hex'), expiresAt: new Date(Date.now() + 60_000) } });
    const log = await prisma.accessLog.findUniqueOrThrow({ where: { id: approvedLogId } });
    await users.deleteAccount(log.approverId!, password);
    expect((await prisma.accessLog.findUniqueOrThrow({ where: { id: approvedLogId } })).approverId).toBeNull();
    await users.deleteAccount(owner, password);
    expect(await prisma.vaultItem.count({ where: { userId: owner } })).toBe(0);
    expect(await prisma.accessLog.count({ where: { requesterId: owner } })).toBe(0);
    expect(await prisma.authSession.count({ where: { userId: owner } })).toBe(0);
    expect(await prisma.vaultSyncOperation.count({ where: { userId: owner } })).toBe(0);
  });

  test('v2 recovery preserves ciphertext, invalidates the previous kit and revokes sessions', async () => {
    const email = `${randomUUID()}@example.invalid`;
    const protection = { salt: randomBytes(16).toString('hex'), recoverySalt: randomBytes(16).toString('hex'),
      passwordEnvelope: { ciphertext: randomBytes(100).toString('base64'), iv: randomBytes(12).toString('base64') },
      recoveryEnvelope: { ciphertext: randomBytes(100).toString('base64'), iv: randomBytes(12).toString('base64') } };
    const credential = 'aa'.repeat(32); const recoveryCredential = 'bb'.repeat(32);
    const registered = await auth.register({ name: 'Recovery fixture', email, password: credential, authVersion: 2,
      kdfSalt: protection.salt, protection, recoveryCredential });
    ids.push(registered.user.id);
    const item = operation(); await vault.sync(registered.user.id, { items: [item] });
    await expect(auth.login({ email, password, authVersion: 2 })).rejects.toThrow();
    await expect(auth.recoveryInfo({ email, recoveryCredential: '00'.repeat(32) })).rejects.toThrow();
    const next = { ...protection, salt: randomBytes(16).toString('hex'), recoverySalt: randomBytes(16).toString('hex') };
    await auth.recover({ email, recoveryCredential, credential: 'cc'.repeat(32), newRecoveryCredential: 'dd'.repeat(32),
      securityVersion: 1, protection: next });
    expect((await prisma.vaultItem.findFirstOrThrow({ where: { userId: registered.user.id } })).encryptedPayload).toBe(item.encryptedPayload);
    expect(await prisma.authSession.count({ where: { userId: registered.user.id, revokedAt: null } })).toBe(0);
    await expect(auth.recoveryInfo({ email, recoveryCredential })).rejects.toThrow();
    expect((await auth.login({ email, password: 'cc'.repeat(32), authVersion: 2 })).user.securityVersion).toBe(2);
  }, 30_000);

  test('same refresh operation can recover a lost response, but another operation and revoked session cannot', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: another } });
    const logged = await auth.login({ email: user.email, password });
    const requestId = randomUUID();
    const first = await auth.refresh(logged.refreshToken, requestId);
    expect((await auth.refresh(logged.refreshToken, requestId)).refreshToken).toBe(first.refreshToken);
    await expect(auth.refresh(logged.refreshToken, randomUUID())).rejects.toThrow();
    await auth.logout(first.refreshToken);
    await expect(auth.refresh(logged.refreshToken, requestId)).rejects.toThrow();
  });

  test('cancel and approve races have one winner; emergency retries notify once; history pages do not overlap', async () => {
    const activeCaregiver = await prisma.user.findFirstOrThrow({ where: { id: { in: caregivers } } });
    await prisma.trustedContact.upsert({ where: { elderlyId_caregiverId: { elderlyId: another, caregiverId: activeCaregiver.id } },
      update: { status: 'ACTIVE', permissions: ['APPROVE_ACCESS'] }, create: { elderlyId: another, caregiverId: activeCaregiver.id, status: 'ACTIVE', permissions: ['APPROVE_ACCESS'] } });
    const receipt = await vault.sync(another, { items: [{ ...operation(), requiresApproval: true }] });
    const itemId = receipt.results[0].serverId;
    const requested = await access.requestAccess(another, { vaultItemId: itemId });
    await expect(access.cancel(activeCaregiver.id, requested.accessLogId)).rejects.toThrow();
    const results = await Promise.allSettled([access.cancel(another, requested.accessLogId), access.respondToAccess(activeCaregiver.id,
      { accessLogId: requested.accessLogId, decision: AccessDecision.APPROVED })]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const event = { vaultItemId: itemId, eventId: randomUUID(), occurredAt: new Date().toISOString() };
    await access.recordEmergency(another, event); await access.recordEmergency(another, event);
    expect(notifications.sendEmergency).toHaveBeenCalledTimes(1);
    for (let index = 0; index < 31; index++) await prisma.accessLog.create({ data: { vaultItemId: itemId, requesterId: another,
      status: 'EXPIRED', expiresAt: new Date() } });
    const first = await access.historyPage(another); const second = await access.historyPage(another, first.nextCursor!);
    expect(first.items).toHaveLength(30);
    expect(second.items.every((entry) => !first.items.some((previous) => previous.id === entry.id))).toBe(true);
  });

  test('simultaneous reinvitations cannot reset a relationship twice', async () => {
    const caregiver = await prisma.user.findFirstOrThrow({ where: { id: { in: caregivers } } });
    await prisma.trustedContact.updateMany({ where: { elderlyId: another, caregiverId: caregiver.id }, data: { status: 'REVOKED' } });
    const contacts = new ContactsService(prisma);
    const results = await Promise.allSettled([contacts.invite(another, { caregiverEmail: caregiver.email }), contacts.invite(another, { caregiverEmail: caregiver.email })]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const contact = await prisma.trustedContact.findUniqueOrThrow({ where: { elderlyId_caregiverId: { elderlyId: another, caregiverId: caregiver.id } } });
    const accepts = await Promise.allSettled([contacts.accept(caregiver.id, contact.id), contacts.accept(caregiver.id, contact.id)]);
    expect(accepts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = accepts.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect([400, 409]).toContain(rejected.reason.getStatus());
  });
});