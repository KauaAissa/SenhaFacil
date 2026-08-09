import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AccessGateway } from './access.gateway';
import type { RequestAccessDto } from './dto/request-access.dto';
import type { RespondAccessDto } from './dto/respond-access.dto';

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
    // 1. Verify vault item ownership and that it requires approval
    const vaultItem = await this.prisma.vaultItem.findFirst({
      where: { id: dto.vaultItemId, userId: elderlyUserId },
      select: { id: true, label: true, requiresApproval: true },
    });

    if (!vaultItem) throw new NotFoundException('Vault item not found');

    if (!vaultItem.requiresApproval) {
      throw new BadRequestException('This vault item does not require assisted access');
    }

    // 2. Prevent duplicate PENDING requests for the same item
    const duplicatePending = await this.prisma.accessLog.findFirst({
      where: {
        vaultItemId: dto.vaultItemId,
        requesterId: elderlyUserId,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      select: { id: true, expiresAt: true },
    });

    if (duplicatePending) {
      throw new BadRequestException(
        `A pending request for this item already exists (expires at ${duplicatePending.expiresAt.toISOString()})`,
      );
    }

    // 3. Create the AccessLog
    const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60_000);

    const accessLog = await this.prisma.accessLog.create({
      data: {
        vaultItemId: dto.vaultItemId,
        requesterId: elderlyUserId,
        status: 'PENDING',
        expiresAt,
        deviceInfo: dto.deviceInfo,
      },
      select: { id: true, status: true, expiresAt: true },
    });

    // 4. Fetch active caregivers with APPROVE_ACCESS permission
    const contacts = await this.prisma.trustedContact.findMany({
      where: {
        elderlyId: elderlyUserId,
        status: 'ACTIVE',
        permissions: { has: 'APPROVE_ACCESS' },
      },
      include: { caregiver: { select: { fcmToken: true } } },
    });

    const elderly = await this.prisma.user.findUnique({
      where: { id: elderlyUserId },
      select: { name: true },
    });

    // 5. Fire FCM pushes — use allSettled so one failure doesn't abort others
    const pushPromises = contacts
      .filter((tc) => Boolean(tc.caregiver.fcmToken))
      .map((tc) =>
        this.notifications.sendAccessRequest({
          fcmToken: tc.caregiver.fcmToken!,
          elderlyName: elderly?.name ?? 'Usuário',
          vaultItemLabel: vaultItem.label,
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
        requester: { select: { id: true, fcmToken: true } },
      },
    });

    if (!accessLog) throw new NotFoundException('Access request not found');

    if (accessLog.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot respond: request is already ${accessLog.status}`,
      );
    }

    if (new Date() > accessLog.expiresAt) {
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

    const updated = await this.prisma.accessLog.update({
      where: { id: dto.accessLogId },
      data: { status: newStatus, approverId: caregiverId, resolvedAt, notes: dto.notes },
      select: { id: true, status: true, resolvedAt: true },
    });

    // Notify elderly user via WebSocket (primary — real-time)
    this.gateway.notifyAccessResolved({
      elderlyUserId: accessLog.requester.id,
      accessLogId: updated.id,
      status: newStatus,
      notes: dto.notes,
    });

    // Notify elderly user via FCM (fallback — if WS connection is closed)
    if (accessLog.requester.fcmToken) {
      await this.notifications.sendAccessResolved({
        fcmToken: accessLog.requester.fcmToken,
        status: newStatus,
        vaultItemLabel: accessLog.vaultItem.label,
      });
    }

    return { status: updated.status, resolvedAt: updated.resolvedAt };
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
        requester: { select: { id: true, fcmToken: true } },
        vaultItem: { select: { label: true } },
      },
    });

    if (stale.length === 0) return 0;

    await this.prisma.accessLog.updateMany({
      where: { id: { in: stale.map((l) => l.id) } },
      data: { status: 'EXPIRED', resolvedAt: now },
    });

    // Notify each elderly user (WS primary, FCM fallback)
    await Promise.allSettled(
      stale.map(async (log) => {
        this.gateway.notifyAccessResolved({
          elderlyUserId: log.requester.id,
          accessLogId: log.id,
          status: 'EXPIRED',
        });

        if (log.requester.fcmToken) {
          await this.notifications.sendAccessResolved({
            fcmToken: log.requester.fcmToken,
            status: 'EXPIRED',
            vaultItemLabel: log.vaultItem.label,
          });
        }
      }),
    );

    return stale.length;
  }
}
