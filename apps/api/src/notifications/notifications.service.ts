import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';

/**
 * Wraps Firebase Admin SDK for sending push notifications via FCM.
 *
 * If Firebase credentials are not configured (e.g., local dev without Firebase),
 * the service degrades gracefully — all send calls become no-ops with a warning.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private messaging: admin.messaging.Messaging | null = null;

  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    const projectId = config.get<string>('FIREBASE_PROJECT_ID');
    const credentialsFile = config.get<string>('GOOGLE_APPLICATION_CREDENTIALS');

    if (!projectId && !credentialsFile) {
      this.logger.warn('Firebase credentials not configured — push notifications disabled.');
      return;
    }

    const app = admin.apps.length
      ? admin.app()
      : admin.initializeApp({
          ...(projectId ? { projectId } : {}),
          credential: credentialsFile
            ? admin.credential.applicationDefault()
            : admin.credential.cert({
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

  async sendEmergency(params: { userId: string; accessLogId: string }): Promise<void> {
    await this.send(params.userId, { notification: { title: 'Registro de emergencia', body: 'Abra o Senha Facil para consultar o historico.' },
      data: { type: 'EMERGENCY_ACCESS', accessLogId: params.accessLogId },
      android: { priority: 'high', notification: { channelId: 'sf_access_requests', defaultSound: true } } });
  }

  async sendSecurityAlert(ownerId: string, userId: string, eventId: string): Promise<'SENT' | 'RETRY' | 'UNAVAILABLE'> {
    return this.send(userId, { notification: { title: 'Aviso de seguranca', body: 'Abra o Senha Facil para conferir uma atividade da conta.' },
      data: { type: 'SECURITY_EVENT', eventId }, android: { priority: 'high',
        notification: { channelId: 'sf_access_requests', defaultSound: true } } }, ownerId);
  }

  private async send(userId: string, message: Omit<admin.messaging.TokenMessage, 'token'>, securityOwnerId?: string): Promise<'SENT' | 'RETRY' | 'UNAVAILABLE'> {
    const messaging = this.messaging;
    if (!messaging) return 'UNAVAILABLE';
    const user: Prisma.UserWhereInput = securityOwnerId && securityOwnerId !== userId
      ? { isActive: true, caregiverRelations: { some: { elderlyId: securityOwnerId, status: 'ACTIVE',
        permissions: { has: 'APPROVE_ACCESS' }, elderly: { isActive: true } } } } : { isActive: true };
    let sessions: { id: string; fcmToken: string | null }[];
    try {
      sessions = await this.prisma.authSession.findMany({ where: { userId, revokedAt: null,
        expiresAt: { gt: new Date() }, fcmToken: { not: null }, user }, select: { id: true, fcmToken: true } });
    } catch { this.logger.warn('Push session lookup failed.'); return 'RETRY'; }
    if (!sessions.length) return 'UNAVAILABLE';
    const results = await Promise.all(sessions.map(async (session): Promise<'SENT' | 'RETRY' | 'UNAVAILABLE'> => {
      if (!session.fcmToken) return 'UNAVAILABLE';
      try { await messaging.send({ ...message, token: session.fcmToken }); return 'SENT'; }
      catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' &&
          /^messaging\/[a-z-]+$/.test(error.code) ? error.code : 'unknown';
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
          try { await this.prisma.authSession.updateMany({ where: { id: session.id, fcmToken: session.fcmToken }, data: { fcmToken: null } }); }
          catch { this.logger.warn('Invalid push token cleanup failed.'); return 'RETRY'; }
          this.logger.warn(`Push delivery failed: ${code}`);
          return 'UNAVAILABLE';
        }
        this.logger.warn(`Push delivery failed: ${code}`);
        return 'RETRY';
      }
    }));
    return results.includes('RETRY') ? 'RETRY' : results.includes('SENT') ? 'SENT' : 'UNAVAILABLE';
  }
}
