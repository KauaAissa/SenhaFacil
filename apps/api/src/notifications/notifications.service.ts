import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

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

  constructor(config: ConfigService) {
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
    fcmToken: string;
    elderlyName: string;
    vaultItemLabel: string;
    accessLogId: string;
  }): Promise<void> {
    if (!this.messaging) return;

    const message: admin.messaging.Message = {
      token: params.fcmToken,
      notification: {
        title: `${params.elderlyName} precisa da sua ajuda`,
        body: `Solicitação de acesso: "${params.vaultItemLabel}". Toque para responder.`,
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

    try {
      const msgId = await this.messaging.send(message);
      this.logger.debug(`FCM message sent: ${msgId}`);
    } catch (error) {
      this.logger.error(
        `FCM push failed for token ${params.fcmToken.slice(0, 12)}...`,
        error,
      );
    }
  }

  /**
   * (Optional) Notifies the elderly user's device that the request was resolved.
   * Serves as a fallback in case the WebSocket is unavailable.
   */
  async sendAccessResolved(params: {
    fcmToken: string;
    status: 'APPROVED' | 'DENIED' | 'EXPIRED';
    vaultItemLabel: string;
  }): Promise<void> {
    if (!this.messaging) return;

    const map: Record<typeof params.status, { title: string; body: string }> = {
      APPROVED: {
        title: 'Acesso autorizado ✓',
        body: `"${params.vaultItemLabel}" foi liberado pelo seu familiar.`,
      },
      DENIED: {
        title: 'Acesso negado',
        body: `"${params.vaultItemLabel}" foi recusado pelo seu familiar.`,
      },
      EXPIRED: {
        title: 'Solicitação expirada',
        body: `A solicitação para "${params.vaultItemLabel}" não foi respondida a tempo.`,
      },
    };

    const { title, body } = map[params.status];

    try {
      await this.messaging.send({
        token: params.fcmToken,
        notification: { title, body },
        data: { type: 'ACCESS_RESOLVED', status: params.status },
      });
    } catch (error) {
      this.logger.error('FCM resolved notification failed', error);
    }
  }
}
