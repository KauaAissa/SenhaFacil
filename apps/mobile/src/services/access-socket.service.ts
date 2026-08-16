import { io, type Socket } from 'socket.io-client';
import { apiClient, API_BASE_URL } from './api.client';

export type AccessResolvedStatus = 'APPROVED' | 'DENIED' | 'EXPIRED';

export interface AccessResolvedEvent {
  accessLogId: string;
  status: AccessResolvedStatus;
  notes: string | null;
  resolvedAt: string;
}

type Listener = (event: AccessResolvedEvent) => void;

/**
 * Real-time client for the elderly app — connects to the NestJS `/access`
 * Socket.io namespace to receive instant `access_resolved` events when a
 * caregiver approves/denies a request, or the background cron expires it.
 *
 * This eliminates the need for the elderly app to poll the server while
 * waiting for a decision.
 *
 * Fallback: if the socket is disconnected (app backgrounded, poor signal),
 * the same event is also delivered via FCM push (see NotificationsService).
 * On reconnect, the screen should re-check status via GET /access/pending
 * or re-attempt decryption if already approved.
 */
class AccessSocketService {
  private socket: Socket | null = null;
  private readonly listeners = new Set<Listener>();

  /** Opens the WebSocket connection authenticated with the current JWT. */
  async connect(): Promise<void> {
    if (this.socket?.connected) return;

    const token = await apiClient.getToken();
    if (!token) throw new Error('NOT_AUTHENTICATED');

    this.socket = io(`${API_BASE_URL}/access`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    });

    this.socket.on('access_resolved', (payload: AccessResolvedEvent) => {
      this.listeners.forEach((cb) => cb(payload));
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /**
   * Subscribe to `access_resolved` events.
   * @returns Unsubscribe function.
   */
  onAccessResolved(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}

export const accessSocketService = new AccessSocketService();
