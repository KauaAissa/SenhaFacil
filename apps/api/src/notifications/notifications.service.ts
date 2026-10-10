import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Wraps Firebase Admin SDK for sending push notifications via FCM.
 *
 * If FIREBASE_PROJECT_ID is not set (e.g., local dev without Firebase),
 * the service degrades gracefully — all send calls become no-ops with a warning.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private messaging: admin.messaging.Messaging | null = null;

  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    const projectId = config.get<string>('FIREBASE_PROJECT_ID');

    if (!projectId) {
      this.logger.warn('Firebase credentials not configured — push notifications disabled.');
      return;
    }

    const app = admin.apps.length
      ? admin.app()
      : admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            privateKey: config
              .getOrThrow<string>('FIREBASE_PRIVATE_KEY')
              .replace(/\\n/g, '\n'),
            clientEmail: config.getOrThrow<string>('FIREBASE_CLIENT_EMAIL'),
          }),
        });

    this.messaging = admin.messaging(app);
  }

  /**
   * Notifies a caregiver that an elderly user is requesting vault access.
   * High-priority push on both Android and iOS.
   *
   * Push failure is logged but never propagated — it must not block the access
   * request creation (the caregiver can poll or use the fallback PIN flow).
   */
  async sendAccessRequest(params: {
    userId: string;
    accessLogId: string;
  }): Promise<void> {
    if (!this.messaging) return;

    const message: Omit<admin.messaging.TokenMessage, 'token'> = {
      notification: {
        title: 'Pedido de acesso',
        body: 'Ha uma solicitacao aguardando sua resposta.',
      },
      data: {
        type: 'ACCESS_REQUEST',
        accessLogId: params.accessLogId,
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'sf_access_requests',
          priority: 'max',
          defaultSound: true,
        },
      },
      apns: {
        payload: { aps: { sound: 'default', badge: 1, contentAvailable: true } },
        headers: { 'apns-priority': '10' },
      },
    };

    await this.send(params.userId, message);
  }

  /**
   * (Optional) Notifies the elderly user's device that the request was resolved.
   * Serves as a fallback in case the WebSocket is unavailable.
   */
  async sendAccessResolved(params: {
    userId: string;
    accessLogId: string;
    status: 'APPROVED' | 'DENIED' | 'EXPIRED';
  }): Promise<void> {
    if (!this.messaging) return;

    const map: Record<typeof params.status, { title: string; body: string }> = {
      APPROVED: {
        title: 'Solicitacao atualizada',
        body: 'Abra o Senha Facil para consultar a resposta.',
      },
      DENIED: {
        title: 'Solicitacao atualizada',
        body: 'Abra o Senha Facil para consultar a resposta.',
      },
      EXPIRED: {
        title: 'Solicitacao atualizada',
        body: 'Abra o Senha Facil para consultar a resposta.',
      },
    };

    const { title, body } = map[params.status];

      await this.send(params.userId, {
        notification: { title, body },
        data: { type: 'ACCESS_RESOLVED', status: params.status, accessLogId: params.accessLogId },
      });
  }

  private async send(userId: string, message: Omit<admin.messaging.TokenMessage, 'token'>): Promise<void> {
    const messaging = this.messaging;
    if (!messaging) return;
    const sessions = await this.prisma.authSession.findMany({ where: { userId, revokedAt: null,
      expiresAt: { gt: new Date() }, fcmToken: { not: null }, user: { isActive: true } }, select: { id: true, fcmToken: true } })
      .catch(() => { this.logger.warn('Push session lookup failed.'); return []; });
    await Promise.allSettled(sessions.map(async (session) => {
      try { await messaging.send({ ...message, token: session.fcmToken! }); }
      catch (error) {
        const code = (error as { code?: string }).code;
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
          await this.prisma.authSession.updateMany({ where: { id: session.id, fcmToken: session.fcmToken }, data: { fcmToken: null } });
        }
        this.logger.warn(`Push delivery failed: ${code ?? 'unknown'}`);
      }
    }));
  }
}
