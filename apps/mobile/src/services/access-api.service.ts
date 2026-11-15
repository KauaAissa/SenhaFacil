import { apiClient } from './api.client';
import { z } from 'zod';
import { UserFacingError } from './error-messages';

export type AccessStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED' | 'FALLBACK_GRANTED' | 'CANCELLED';

export function parseAccessNotification(data: Record<string, unknown>): { accessLogId: string; type: 'ACCESS_REQUEST' | 'ACCESS_RESOLVED' | 'EMERGENCY_ACCESS' } | { eventId: string; type: 'SECURITY_EVENT' } | null {
  if (data.type === 'SECURITY_EVENT') {
    return typeof data.eventId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(data.eventId) ? { eventId: data.eventId, type: 'SECURITY_EVENT' } : null;
  }
  if (typeof data.accessLogId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(data.accessLogId)) return null;
  if (data.type !== 'ACCESS_REQUEST' && data.type !== 'ACCESS_RESOLVED' && data.type !== 'EMERGENCY_ACCESS') return null;
  return { accessLogId: data.accessLogId, type: data.type };
}

export interface AccessRequestResult {
  accessLogId: string;
  status: AccessStatus;
  expiresAt: string;
  locationShared: boolean;
  locationHistoryExpiresAt?: string | null;
}

export interface AccessRequestLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
}

export interface PendingAccessRequest {
  id: string;
  status: AccessStatus;
  requestedAt: string;
  expiresAt: string;
  requester: { id: string; name: string };
  vaultItem: { id: string; label: string; category: string };
  location?: AccessRequestLocation | null;
}

export interface AccessHistoryEntry extends Omit<PendingAccessRequest, 'location'> {
  locationHistoryExpiresAt?: string | null;
  resolvedAt: string | null;
  fallbackUsed: boolean;
  notes: string | null;
  approver: { name: string } | null;
}

export interface AccessHistoryLocation {
  location: AccessRequestLocation;
  historyExpiresAt: string;
}

export function hasHistoryLocation(entry: Pick<AccessHistoryEntry, 'status' | 'locationHistoryExpiresAt'>, serverTime: number): boolean {
  return (entry.status === 'APPROVED' || entry.status === 'DENIED') &&
    Number.isFinite(serverTime) && Date.parse(entry.locationHistoryExpiresAt ?? '') > serverTime;
}

const historyLocationSchema = z.object({
  location: z.object({
    latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180),
    accuracy: z.number().finite().nonnegative(), capturedAt: z.string().datetime(),
  }).strict(),
  historyExpiresAt: z.string().datetime(),
}).strict();

/**
 * API wrapper for the Assisted Access flow endpoints.
 * Real-time resolution is delivered via AccessGateway (see access-socket.service.ts);
 * this service only covers the request/response/listing HTTP calls.
 */
class AccessApiService {
  requestAccess(vaultItemId: string, deviceInfo?: string, location?: AccessRequestLocation, retainLocationInHistory = false): Promise<AccessRequestResult> {
    return apiClient.post<AccessRequestResult>('/access/request', { vaultItemId, deviceInfo, location,
      ...(location && retainLocationInHistory ? { retainLocationInHistory: true } : {}) });
  }

  respond(
    accessLogId: string,
    decision: 'APPROVED' | 'DENIED',
    notes?: string,
  ): Promise<{ status: AccessStatus; resolvedAt: string }> {
    return apiClient.post('/access/respond', { accessLogId, decision, notes });
  }

  /** Fallback list for the caregiver app when a push notification is missed. */
  findPending(): Promise<PendingAccessRequest[]> {
    return apiClient.get<PendingAccessRequest[]>('/access/pending');
  }

  history(): Promise<AccessHistoryEntry[]> { return apiClient.get('/access/history'); }

  historyPage(cursor?: string): Promise<{ items: AccessHistoryEntry[]; nextCursor: string | null }> {
    return apiClient.get(`/access/history/page${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
  }

  async historyLocation(id: string, signal?: AbortSignal): Promise<AccessHistoryLocation> {
    const response = await apiClient.get<unknown>(`/access/history/${encodeURIComponent(id)}/location`, signal);
    const parsed = historyLocationSchema.safeParse(response);
    if (!parsed.success) throw new UserFacingError('Não foi possível validar o ponto deste histórico. Atualize a lista antes de consultar o mapa.');
    return parsed.data;
  }

  cancel(id: string): Promise<{ status: 'CANCELLED' }> { return apiClient.post(`/access/${id}/cancel`, {}); }

  state(id: string): Promise<{ id: string; vaultItemId: string; status: AccessStatus; expiresAt: string; notes: string | null }> {
    return apiClient.get(`/access/${id}`);
  }
}

export const accessApiService = new AccessApiService();
