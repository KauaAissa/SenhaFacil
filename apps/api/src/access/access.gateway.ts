import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  expirationTimer?: ReturnType<typeof setTimeout>;
  sessionTimer?: ReturnType<typeof setInterval>;
}

/**
 * WebSocket Gateway — namespace `/access`
 *
 * Responsabilities:
 *  1. Authenticate incoming connections via Bearer JWT (passed in handshake auth or header)
 *  2. Assign each client to a private room `user:<userId>` for targeted delivery
 *  3. Expose notifyAccessResolved() so AccessService can push events to the elderly user
 *     the instant a caregiver responds — no polling required on the client
 *
 * Client connection (React Native / Expo):
 * ```ts
 * import { io } from 'socket.io-client';
 * const socket = io('https://api.senhaFacil.com/access', {
 *   auth: { token: accessToken },
 *   transports: ['websocket'],
 * });
 * socket.on('access_resolved', (payload) => { ... });
 * ```
 */
@WebSocketGateway({
  namespace: 'access',
  cors: { origin: process.env.ALLOWED_ORIGINS?.split(',') ?? [] },
  transports: ['websocket'],
})
export class AccessGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server: Server;

  private readonly logger = new Logger(AccessGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      // Token can be passed via handshake.auth.token or Authorization header
      const raw: string | undefined =
        client.handshake.auth?.token ??
        (client.handshake.headers.authorization as string | undefined)?.replace('Bearer ', '');

      if (!raw) throw new Error('Missing token');

      const payload = this.jwt.verify<{ sub: string; sid: string; exp: number }>(raw, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
      if (!payload.sid || !payload.exp) throw new Error('Invalid session');
      const active = async () => this.prisma.authSession.findFirst({
        where: { id: payload.sid, userId: payload.sub, revokedAt: null,
          expiresAt: { gt: new Date() }, user: { isActive: true } }, select: { id: true },
      });
      if (!(await active())) throw new Error('Session revoked');

      client.userId = payload.sub;

      // Each user gets a private room — events are delivered only to their devices
      await client.join(`user:${payload.sub}`);
      client.expirationTimer = setTimeout(() => client.disconnect(true), Math.max(0, payload.exp * 1000 - Date.now()));
      client.sessionTimer = setInterval(() => {
        void active().then((session) => { if (!session) client.disconnect(true); }).catch(() => client.disconnect(true));
      }, 30_000);
      this.logger.log(`WS connected  userId=${payload.sub}  socketId=${client.id}`);
    } catch {
      this.logger.warn(`WS rejected unauthenticated connection  socketId=${client.id}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    if (client.expirationTimer) clearTimeout(client.expirationTimer);
    if (client.sessionTimer) clearInterval(client.sessionTimer);
    if (client.userId) {
      this.logger.log(`WS disconnected  userId=${client.userId}  socketId=${client.id}`);
    }
  }

  /**
   * Emits `access_resolved` to the elderly user's room.
   * Called by AccessService after a caregiver responds or by the expiry job.
   *
   * If the user is offline, the event is silently dropped — the app must
   * reconcile state by checking the AccessLog status on reconnect.
   */
  notifyAccessResolved(params: {
    elderlyUserId: string;
    accessLogId: string;
    status: 'APPROVED' | 'DENIED' | 'EXPIRED';
    notes?: string | null;
  }): void {
    this.server.to(`user:${params.elderlyUserId}`).emit('access_resolved', {
      accessLogId: params.accessLogId,
      status: params.status,
      notes: params.notes ?? null,
      resolvedAt: new Date().toISOString(),
    });
  }
}
