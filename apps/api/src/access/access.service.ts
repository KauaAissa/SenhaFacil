import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AccessGateway } from './access.gateway';
import type { RequestAccessDto } from './dto/request-access.dto';
import type { RespondAccessDto } from './dto/respond-access.dto';
import type { EmergencyAccessDto } from './dto/emergency-access.dto';

/** Window (minutes) for a caregiver to respond before auto-expiry */
const EXPIRY_MINUTES = 2;

@Injectable()
export class AccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly gateway: AccessGateway,
  ) {}

  // ─── POST /access/request ──────────────────────────────────────────────────

  async requestAccess(elderlyUserId: string, dto: RequestAccessDto) {
    const itemId = dto.vaultItemId.startsWith('local_')
      ? `sf_${createHash('sha256').update(`${elderlyUserId}:${dto.vaultItemId}`).digest('hex')}` : dto.vaultItemId;
    const { accessLog, contacts, created } = await this.prisma.serializable(async (transaction) => {
      const vaultItem = await transaction.vaultItem.findFirst({
        where: { id: itemId, userId: elderlyUserId, deletedAt: null },
        select: { id: true, label: true, requiresApproval: true },
      });
      if (!vaultItem) throw new NotFoundException('Senha nao encontrada.');
      if (!vaultItem.requiresApproval) throw new BadRequestException('Esta senha nao requer aprovacao.');
      const contacts = await transaction.trustedContact.findMany({
        where: { elderlyId: elderlyUserId, status: 'ACTIVE', permissions: { has: 'APPROVE_ACCESS' }, caregiver: { isActive: true } },
        include: { caregiver: { select: { id: true } } },
      });
      if (!contacts.length) throw new BadRequestException('Adicione um familiar ativo com permissao para aprovar acessos.');
      const pending = await transaction.accessLog.findFirst({
        where: { vaultItemId: itemId, requesterId: elderlyUserId, status: 'PENDING', expiresAt: { gt: new Date() } },
        select: { id: true, status: true, expiresAt: true },
      });
      if (pending) return { vaultItem, contacts, accessLog: pending, created: false };
      const accessLog = await transaction.accessLog.create({
        data: { vaultItemId: itemId, requesterId: elderlyUserId, status: 'PENDING',
          expiresAt: new Date(Date.now() + EXPIRY_MINUTES * 60_000), deviceInfo: dto.deviceInfo },
        select: { id: true, status: true, expiresAt: true },
      });
      return { vaultItem, contacts, accessLog, created: true };
    });

    // 5. Fire FCM pushes — use allSettled so one failure doesn't abort others
    const pushPromises = (created ? contacts : [])
      .map((tc) =>
        this.notifications.sendAccessRequest({
          userId: tc.caregiver.id,
          accessLogId: accessLog.id,
        }),
      );

    await Promise.allSettled(pushPromises);

    return {
      accessLogId: accessLog.id,
      status: accessLog.status,
      expiresAt: accessLog.expiresAt,
    };
  }

  // ─── POST /access/respond ──────────────────────────────────────────────────

  async respondToAccess(caregiverId: string, dto: RespondAccessDto) {
    const accessLog = await this.prisma.accessLog.findUnique({
      where: { id: dto.accessLogId },
      include: {
        vaultItem: { select: { userId: true, label: true } },
        requester: { select: { id: true } },
      },
    });

    if (!accessLog) throw new NotFoundException('Access request not found');

    if (accessLog.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot respond: request is already ${accessLog.status}`,
      );
    }

    if (new Date() >= accessLog.expiresAt) {
      throw new BadRequestException('Access request has already expired');
    }

    // Verify the caregiver has APPROVE_ACCESS permission for this elderly user
    const trustedContact = await this.prisma.trustedContact.findFirst({
      where: {
        caregiverId,
        elderlyId: accessLog.vaultItem.userId,
        status: 'ACTIVE',
        permissions: { has: 'APPROVE_ACCESS' },
      },
    });

    if (!trustedContact) {
      throw new ForbiddenException(
        'You do not have permission to respond to this access request',
      );
    }

    const newStatus = dto.decision === 'APPROVED' ? 'APPROVED' : 'DENIED';
    const resolvedAt = new Date();

    const updated = await this.prisma.accessLog.updateMany({
      where: { id: dto.accessLogId, status: 'PENDING', expiresAt: { gt: resolvedAt },
        vaultItem: { deletedAt: null },
        requester: { elderlyRelations: { some: { caregiverId, status: 'ACTIVE', permissions: { has: 'APPROVE_ACCESS' } } } } },
      data: { status: newStatus, approverId: caregiverId, resolvedAt, notes: dto.notes },
    });
    if (updated.count !== 1) throw new BadRequestException('A solicitacao foi respondida, expirou ou o vinculo foi revogado.');

    // Notify elderly user via WebSocket (primary — real-time)
    this.gateway.notifyAccessResolved({
      elderlyUserId: accessLog.requester.id,
      accessLogId: accessLog.id,
      status: newStatus,
      notes: dto.notes,
    });

    // Notify elderly user via FCM (fallback — if WS connection is closed)
      await this.notifications.sendAccessResolved({
        userId: accessLog.requester.id,
        status: newStatus,
        accessLogId: accessLog.id,
      });

    return { status: newStatus, resolvedAt };
  }

  // ─── GET /access/pending ────────────────────────────────────────────────────

  /**
   * Lists PENDING (non-expired) access requests visible to a caregiver —
   * i.e., requests raised by elderly users who have an ACTIVE relationship
   * with APPROVE_ACCESS permission granted to this caregiver.
   *
   * Serves as a fallback UI when the FCM push is missed or delayed.
   */
  async findPendingForCaregiver(caregiverId: string) {
    const activeElderlyIds = await this.prisma.trustedContact.findMany({
      where: {
        caregiverId,
        status: 'ACTIVE',
        permissions: { has: 'APPROVE_ACCESS' },
      },
      select: { elderlyId: true },
    });

    const elderlyIds = activeElderlyIds.map((c) => c.elderlyId);
    if (elderlyIds.length === 0) return [];

    return this.prisma.accessLog.findMany({
      where: {
        status: 'PENDING',
        expiresAt: { gt: new Date() },
        vaultItem: { deletedAt: null },
        requesterId: { in: elderlyIds },
      },
      select: {
        id: true,
        status: true,
        requestedAt: true,
        expiresAt: true,
        requester: { select: { id: true, name: true } },
        vaultItem: { select: { id: true, label: true, category: true } },
      },
      orderBy: { requestedAt: 'asc' },
    });
  }

  // ─── Called by AccessExpiryService (cron) ─────────────────────────────────

  /**
   * Bulk-expires PENDING logs past their expiresAt deadline.
   * Emits `access_resolved` (EXPIRED) to each elderly user's WS room.
   * Returns the count of expired records.
   */
  async expirePendingLogs(): Promise<number> {
    const now = new Date();

    // Fetch before updating so we have requester IDs for WS/FCM notifications
    const stale = await this.prisma.accessLog.findMany({
      where: { status: 'PENDING', expiresAt: { lt: now } },
      select: {
        id: true,
        requester: { select: { id: true } },
        vaultItem: { select: { label: true } },
      },
    });

    if (stale.length === 0) return 0;

    let count = 0;

    // Notify each elderly user (WS primary, FCM fallback)
    await Promise.allSettled(
      stale.map(async (log) => {
        const expired = await this.prisma.accessLog.updateMany({
          where: { id: log.id, status: 'PENDING', expiresAt: { lte: now } },
          data: { status: 'EXPIRED', resolvedAt: now },
        });
        if (expired.count !== 1) return;
        count += 1;
        this.gateway.notifyAccessResolved({
          elderlyUserId: log.requester.id,
          accessLogId: log.id,
          status: 'EXPIRED',
        });

          await this.notifications.sendAccessResolved({
            userId: log.requester.id,
            status: 'EXPIRED',
            accessLogId: log.id,
          });
      }),
    );

    return count;
  }

  async findState(userId: string, id: string) {
    const log = await this.prisma.accessLog.findUnique({ where: { id },
      select: { id: true, vaultItemId: true, requesterId: true, approverId: true, status: true, expiresAt: true, notes: true } });
    if (!log) throw new NotFoundException('Solicitacao nao encontrada.');
    if (log.requesterId !== userId) {
      const relationship = await this.prisma.trustedContact.findFirst({ where: { elderlyId: log.requesterId, caregiverId: userId,
        status: 'ACTIVE', permissions: { has: 'APPROVE_ACCESS' } } });
      if (!relationship) throw new ForbiddenException('Sem permissao para esta solicitacao.');
    }
    if (log.status === 'APPROVED') {
      const relationship = await this.prisma.trustedContact.findFirst({ where: { elderlyId: log.requesterId,
        caregiverId: log.approverId ?? '', status: 'ACTIVE', permissions: { has: 'APPROVE_ACCESS' } } });
      if (!relationship) return { ...log, status: 'DENIED' as const };
    }
    return { ...log, status: log.expiresAt <= new Date() && log.status === 'PENDING' ? 'EXPIRED' : log.status };
  }

  async history(userId: string, cursor?: string, take = 100) {
    return this.prisma.accessLog.findMany({
      where: { OR: [{ requesterId: userId }, { requester: { elderlyRelations: { some: {
        caregiverId: userId, status: 'ACTIVE', permissions: { has: 'APPROVE_ACCESS' },
      } } } }] },
      select: { id: true, status: true, requestedAt: true, resolvedAt: true, expiresAt: true, fallbackUsed: true, notes: true,
        requester: { select: { id: true, name: true } }, approver: { select: { name: true } },
        vaultItem: { select: { id: true, label: true, category: true } } },
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }], take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  async historyPage(userId: string, cursor?: string) {
    const results = await this.history(userId, cursor, 31);
    return { items: results.slice(0, 30), nextCursor: results.length > 30 ? results[29].id : null };
  }

  async cancel(userId: string, id: string) {
    const result = await this.prisma.accessLog.updateMany({ where: { id, requesterId: userId, status: 'PENDING' },
      data: { status: 'CANCELLED', resolvedAt: new Date() } });
    if (result.count !== 1) throw new BadRequestException('Pedido encerrado ou indisponivel para cancelamento.');
    return { status: 'CANCELLED' as const };
  }

  async recordEmergency(userId: string, dto: EmergencyAccessDto) {
    const occurredAt = new Date(dto.occurredAt);
    if (occurredAt.getTime() > Date.now() + 60_000) throw new BadRequestException('Horario de emergencia invalido.');
    const itemId = dto.vaultItemId.startsWith('local_')
      ? `sf_${createHash('sha256').update(`${userId}:${dto.vaultItemId}`).digest('hex')}` : dto.vaultItemId;
    const item = await this.prisma.vaultItem.findFirst({ where: { id: itemId, userId } });
    if (!item) throw new NotFoundException('Senha ainda nao sincronizada.');
    const id = `emergency_${createHash('sha256').update(`${userId}:${dto.eventId}`).digest('hex')}`;
    const { result, created } = await this.prisma.serializable(async (transaction) => {
      const existing = await transaction.accessLog.findUnique({ where: { id }, select: { id: true, status: true } });
      if (existing) return { result: existing, created: false };
      const result = await transaction.accessLog.create({
        data: { id, vaultItemId: itemId, requesterId: userId, status: 'FALLBACK_GRANTED', fallbackUsed: true,
          requestedAt: occurredAt, resolvedAt: occurredAt, expiresAt: occurredAt, deviceInfo: 'offline_client_report' },
        select: { id: true, status: true } });
      return { result, created: true };
    });
    if (created) {
      const contacts = await this.prisma.trustedContact.findMany({ where: { elderlyId: userId, status: 'ACTIVE',
        permissions: { has: 'APPROVE_ACCESS' }, caregiver: { isActive: true } }, select: { caregiverId: true } });
      await Promise.allSettled(contacts.map((contact) => this.notifications.sendEmergency({ userId: contact.caregiverId, accessLogId: id })));
    }
    return result;
  }
}
