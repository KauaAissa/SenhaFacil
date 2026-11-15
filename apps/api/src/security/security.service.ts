import { BadRequestException, ConflictException, HttpException, Injectable, Logger, NotFoundException, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { RevokeSecuritySessionsDto, SecurityEventType, SecurityReportDto } from './security.dto';

const MINUTE = 60_000;
const FAILURE_WINDOW = 15 * MINUTE;
const RETENTION = 90 * 24 * 60 * MINUTE;

export class SecurityLimitError extends HttpException {
  constructor(public readonly code: string, public readonly retryAfter: number) {
    super({ message: code, retryAfter }, 429);
  }
}

function visibleEvents(userId: string): Prisma.SecurityEventWhereInput {
  return { user: { isActive: true }, expiresAt: { gt: new Date() },
    OR: [{ userId }, { user: { elderlyRelations: { some: { caregiverId: userId, status: 'ACTIVE',
      permissions: { has: 'APPROVE_ACCESS' }, caregiver: { isActive: true } } } } }] };
}

@Injectable()
export class SecurityService implements OnModuleInit {
  private readonly logger = new Logger(SecurityService.name);
  private delivering = false;
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService,
    private readonly config: ConfigService) {}

  private digest(value: string): string {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET')).update(value).digest('hex');
  }

  async record(transaction: Prisma.TransactionClient, input: {
    userId: string; type: SecurityEventType; source?: 'SERVER' | 'DEVICE_REPORT'; occurredAt?: Date;
    count?: number; dedupe: string;
  }): Promise<void> {
    const now = new Date();
    const id = randomUUID();
    const created = await transaction.securityEvent.createMany({ data: [{
      id, userId: input.userId, type: input.type, source: input.source ?? 'SERVER',
      severity: ['PASSWORD_CHANGED', 'RECOVERY_KIT_REPLACED', 'ACCOUNT_RECOVERED', 'NEW_DEVICE', 'SESSIONS_REVOKED'].includes(input.type) ? 'INFO' : 'WARNING',
      count: input.count ?? 1, occurredAt: input.occurredAt ?? now, recordedAt: now,
      expiresAt: new Date(now.getTime() + RETENTION),
      dedupeKey: createHash('sha256').update(input.dedupe).digest('hex'),
    }], skipDuplicates: true });
    if (!created.count) return;
    if (!['PASSWORD_CHANGED', 'RECOVERY_KIT_REPLACED', 'ACCOUNT_RECOVERED', 'SESSIONS_REVOKED'].includes(input.type)) {
      const prior = await transaction.securityEvent.findFirst({ where: { userId: input.userId, type: input.type,
        id: { not: id }, recordedAt: { gte: new Date(now.getTime() - FAILURE_WINDOW) }, deliveries: { some: {} } }, select: { id: true } });
      if (prior) return;
    }
    const contacts = await transaction.trustedContact.findMany({ where: { elderlyId: input.userId, status: 'ACTIVE',
      permissions: { has: 'APPROVE_ACCESS' }, caregiver: { isActive: true } }, select: { caregiverId: true } });
    const recipients = [...new Set([input.userId, ...contacts.map((contact) => contact.caregiverId)])];
    await transaction.securityDelivery.createMany({ data: recipients.map((userId) => ({ eventId: id, userId })), skipDuplicates: true });
  }

  async reserve(transaction: Prisma.TransactionClient, key: string, limit: number, window: number, code: string, cost = 1): Promise<void> {
    const now = new Date();
    const previous = await transaction.securityRateState.findUnique({ where: { key } });
    const live = previous && previous.windowStart.getTime() + window > now.getTime();
    const windowStart = live ? previous.windowStart : now;
    if ((live ? previous.count : 0) + cost > limit) {
      throw new SecurityLimitError(code, Math.max(1, Math.ceil((windowStart.getTime() + window - now.getTime()) / 1_000)));
    }
    await transaction.securityRateState.upsert({ where: { key }, create: {
      key, count: cost, windowStart, expiresAt: new Date(windowStart.getTime() + window),
    }, update: { count: live ? previous.count + cost : cost, windowStart, blockedUntil: null, expiresAt: new Date(windowStart.getTime() + window) } });
  }

  async beforeLogin(identifier: string): Promise<void> {
    const key = this.digest(`login:${identifier}`);
    const failure = await this.prisma.securityRateState.findUnique({ where: { key: `failure:${key}` } });
    if (failure?.blockedUntil && failure.blockedUntil > new Date()) {
      throw new SecurityLimitError('SECURITY_LOGIN_WAIT', Math.max(1, Math.ceil((failure.blockedUntil.getTime() - Date.now()) / 1_000)));
    }
    await this.prisma.serializable((transaction) => this.reserve(transaction, `attempt:${key}`, 10, MINUTE, 'SECURITY_LOGIN_WAIT'));
  }

  async failedLogin(identifier: string, userId?: string): Promise<void> {
    const key = `failure:${this.digest(`login:${identifier}`)}`;
    await this.prisma.serializable(async (transaction) => {
      const now = new Date();
      const previous = await transaction.securityRateState.findUnique({ where: { key } });
      const live = previous && previous.windowStart.getTime() + FAILURE_WINDOW > now.getTime();
      const count = Math.min(100, live ? previous.count + 1 : 1);
      const windowStart = live ? previous.windowStart : now;
      const delay = count >= 8 ? 120_000 : count >= 5 ? 30_000 : count >= 3 ? 5_000 : 0;
      const data = { count, windowStart, blockedUntil: delay ? new Date(now.getTime() + delay) : null,
        expiresAt: new Date(Math.max(windowStart.getTime() + FAILURE_WINDOW, now.getTime() + delay)) };
      await transaction.securityRateState.upsert({ where: { key }, create: { key, ...data }, update: data });
      if (userId && count >= 3) await this.record(transaction, { userId, type: 'FAILED_LOGIN_BURST', count,
        dedupe: `${key}:${windowStart.toISOString()}` });
    });
  }

  async clearLoginFailures(transaction: Prisma.TransactionClient, identifier: string): Promise<void> {
    const digest = this.digest(`login:${identifier}`);
    await transaction.securityRateState.deleteMany({ where: { key: `failure:${digest}` } });
  }

  async reserveAccess(transaction: Prisma.TransactionClient, userId: string): Promise<void> {
    const pending = await transaction.accessLog.count({ where: { requesterId: userId, status: 'PENDING', expiresAt: { gt: new Date() } } });
    if (pending >= 3) throw new SecurityLimitError('SECURITY_PENDING_LIMIT', 60);
    await this.reserve(transaction, `access:${this.digest(userId)}`, 5, MINUTE, 'SECURITY_REQUEST_WAIT');
  }

  async accessLimitReached(userId: string): Promise<void> {
    await this.prisma.serializable(async (transaction) => {
      const user = await transaction.user.findFirst({ where: { id: userId, isActive: true }, select: { id: true } });
      if (!user) return;
      await this.record(transaction, { userId, type: 'ACCESS_REQUEST_BURST',
        dedupe: `access-limit:${userId}:${Math.floor(Date.now() / FAILURE_WINDOW)}` });
    });
  }

  async device(transaction: Prisma.TransactionClient, userId: string, installId?: string, platform = 'UNKNOWN',
    initialRegistration = false): Promise<{ deviceHash?: string; devicePlatform?: string }> {
    if (!installId) return {};
    const deviceHash = this.digest(`device:${userId}:${installId}`);
    const known = await transaction.authDevice.findUnique({ where: { userId_deviceHash: { userId, deviceHash } } });
    await transaction.authDevice.upsert({ where: { userId_deviceHash: { userId, deviceHash } },
      create: { userId, deviceHash, platform }, update: { lastSeenAt: new Date(), platform } });
    if (!known && !initialRegistration) await this.record(transaction, { userId, type: 'NEW_DEVICE',
      dedupe: `device:${userId}:${deviceHash}` });
    return { deviceHash, devicePlatform: platform };
  }

  async recordReports(userId: string, reports: SecurityReportDto[]) {
    const now = Date.now();
    if (new Set(reports.map((report) => report.id)).size !== reports.length) throw new BadRequestException('SECURITY_REPORT_INVALID');
    if (reports.some((report) => Date.parse(report.occurredAt) > now + MINUTE || !Number.isFinite(Date.parse(report.occurredAt)))) {
      throw new BadRequestException('SECURITY_REPORT_INVALID');
    }
    const minimum = { BULK_REVEAL: 5, BULK_COPY: 10, BULK_DELETE: 3 };
    if (reports.some((report) => report.count < minimum[report.type])) throw new BadRequestException('SECURITY_REPORT_INVALID');
    await this.prisma.serializable(async (transaction) => {
      await this.reserve(transaction, `reports:${this.digest(userId)}`, 100, MINUTE, 'SECURITY_REPORT_WAIT', reports.length);
      for (const report of reports) await this.record(transaction, { userId, type: report.type, source: 'DEVICE_REPORT',
        occurredAt: new Date(report.occurredAt), count: report.count, dedupe: `report:${userId}:${report.id}` });
    });
    return { acknowledged: reports.map((report) => report.id) };
  }

  async events(userId: string, cursor?: string) {
    const items = await this.prisma.securityEvent.findMany({ where: visibleEvents(userId),
      select: { id: true, type: true, source: true, severity: true, count: true, occurredAt: true, recordedAt: true,
        expiresAt: true, user: { select: { id: true, name: true } } },
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }], take: 31, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    return { items: items.slice(0, 30), nextCursor: items.length > 30 ? items[29].id : null };
  }

  async sessions(userId: string, currentSessionId: string) {
    const where = { userId, revokedAt: null, expiresAt: { gt: new Date() } };
    const [items, total] = await Promise.all([
      this.prisma.authSession.findMany({ where, select: { id: true, createdAt: true, devicePlatform: true, expiresAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50 }),
      this.prisma.authSession.count({ where }),
    ]);
    return { items, total, currentSessionId };
  }

  async revokeSessions(userId: string, currentSessionId: string, dto: RevokeSecuritySessionsDto) {
    if ((dto.mode === 'ONE' && (!dto.sessionId || dto.sessionId === currentSessionId)) || (dto.mode === 'OTHERS' && dto.sessionId)) {
      throw new BadRequestException('SECURITY_SESSION_SELECTION');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.isActive || !(await argon2.verify(user.passwordHash, dto.currentCredential))) throw new UnauthorizedException('Senha atual incorreta.');
    return this.prisma.serializable(async (transaction) => {
      const current = await transaction.user.findFirst({ where: { id: userId, securityVersion: user.securityVersion,
        passwordHash: user.passwordHash, isActive: true }, select: { id: true } });
      if (!current) throw new ConflictException('A seguranca da conta mudou. Entre novamente.');
      const result = await transaction.authSession.updateMany({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() },
        id: dto.mode === 'ONE' ? dto.sessionId : { not: currentSessionId } }, data: { revokedAt: new Date(), fcmToken: null } });
      if (!result.count && dto.mode === 'ONE') throw new NotFoundException('SECURITY_SESSION_UNAVAILABLE');
      if (result.count) await this.record(transaction, { userId, type: 'SESSIONS_REVOKED', count: result.count,
        dedupe: `revoke:${userId}:${randomUUID()}` });
      return { revoked: result.count };
    });
  }

  async emergency(transaction: Prisma.TransactionClient, userId: string, vaultItemId: string, occurredAt: Date): Promise<void> {
    const denial = await transaction.accessLog.findFirst({ where: { requesterId: userId, vaultItemId, status: 'DENIED',
      resolvedAt: { gte: new Date(occurredAt.getTime() - FAILURE_WINDOW), lte: occurredAt } }, select: { id: true } });
    const count = await transaction.accessLog.count({ where: { requesterId: userId, fallbackUsed: true,
      requestedAt: { gte: new Date(occurredAt.getTime() - 10 * MINUTE), lte: occurredAt } } });
    if (denial) await this.record(transaction, { userId, type: 'EMERGENCY_AFTER_DENIAL', source: 'DEVICE_REPORT', occurredAt,
      dedupe: `emergency-denial:${userId}:${Math.floor(occurredAt.getTime() / FAILURE_WINDOW)}` });
    if (count >= 3) await this.record(transaction, { userId, type: 'EMERGENCY_BURST', source: 'DEVICE_REPORT', occurredAt, count,
      dedupe: `emergency-burst:${userId}:${Math.floor(occurredAt.getTime() / FAILURE_WINDOW)}` });
  }

  async observeDeletions(transaction: Prisma.TransactionClient, userId: string, deleted: number): Promise<void> {
    if (deleted <= 0) return;
    const key = `deletions:${this.digest(userId)}`;
    const now = new Date();
    const prior = await transaction.securityRateState.findUnique({ where: { key } });
    const live = prior && prior.windowStart.getTime() + MINUTE > now.getTime();
    const windowStart = live ? prior.windowStart : now;
    const count = Math.min(100_000, (live ? prior.count : 0) + deleted);
    const data = { count, windowStart, expiresAt: new Date(windowStart.getTime() + MINUTE) };
    await transaction.securityRateState.upsert({ where: { key }, create: { key, ...data }, update: data });
    if (count >= 3) await this.record(transaction, { userId, type: 'BULK_DELETE', source: 'SERVER', count,
      dedupe: `deleted:${userId}:${windowStart.toISOString()}` });
  }

  async onModuleInit(): Promise<void> { await this.cleanup(); }
  @Cron('0 */10 * * * *')
  async cleanup(): Promise<void> {
    await this.prisma.securityEvent.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    await this.prisma.securityRateState.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  }

  @Cron('*/10 * * * * *')
  async deliver(): Promise<void> {
    if (this.delivering) return;
    this.delivering = true;
    try {
      const now = new Date();
      const where: Prisma.SecurityDeliveryWhereInput = { status: { in: ['PENDING', 'RETRY'] }, nextAttemptAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }], event: { expiresAt: { gt: now }, user: { isActive: true } } };
      const items = await this.prisma.securityDelivery.findMany({ where, include: { event: { select: { userId: true } } }, take: 25,
        orderBy: { nextAttemptAt: 'asc' } });
      for (const item of items) {
        const leaseToken = randomUUID();
        const claimed = await this.prisma.securityDelivery.updateMany({ where: { ...where, eventId: item.eventId, userId: item.userId },
          data: { leaseUntil: new Date(Date.now() + 60_000), leaseToken, attempts: { increment: 1 } } });
        if (!claimed.count) continue;
        const allowed = await this.prisma.user.findFirst({ where: { id: item.userId, isActive: true,
          ...(item.event.userId !== item.userId ? { caregiverRelations: { some: { elderlyId: item.event.userId, status: 'ACTIVE',
            permissions: { has: 'APPROVE_ACCESS' }, elderly: { isActive: true } } } } : {}) }, select: { id: true } });
        const status = allowed ? await this.notifications.sendSecurityAlert(item.event.userId, item.userId, item.eventId) : 'SKIPPED';
        const retry = status === 'RETRY' && item.attempts < 5;
        await this.prisma.securityDelivery.updateMany({ where: { eventId: item.eventId, userId: item.userId, leaseToken }, data: {
          status: retry ? 'RETRY' : status === 'RETRY' ? 'FAILED' : status, leaseUntil: null, leaseToken: null,
          nextAttemptAt: new Date(Date.now() + Math.min(3_600_000, 30_000 * 2 ** item.attempts)),
        } });
      }
    } catch {
      this.logger.error('Security delivery cycle failed; pending leases will be retried. No event details logged.');
    } finally { this.delivering = false; }
  }
}
