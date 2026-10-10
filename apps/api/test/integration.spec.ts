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

const databaseTests = process.env.INTEGRATION_TESTS === '1' ? describe : describe.skip;

databaseTests('PostgreSQL transaction and cascade integration', () => {
  const prisma = new PrismaService();
  const vault = new VaultService(prisma);
  const notifications = { sendAccessRequest: jest.fn(), sendAccessResolved: jest.fn() };
  const gateway = { notifyAccessResolved: jest.fn() };
  const access = new AccessService(prisma, notifications as unknown as NotificationsService, gateway as unknown as AccessGateway);
  const users = new UsersService(prisma);
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
});