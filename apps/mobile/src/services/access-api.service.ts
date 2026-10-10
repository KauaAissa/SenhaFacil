import { apiClient } from './api.client';

export type AccessStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED' | 'FALLBACK_GRANTED';

export function parseAccessNotification(data: Record<string, unknown>): { accessLogId: string; type: 'ACCESS_REQUEST' | 'ACCESS_RESOLVED' } | null {
  if (typeof data.accessLogId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(data.accessLogId)) return null;
  if (data.type !== 'ACCESS_REQUEST' && data.type !== 'ACCESS_RESOLVED') return null;
  return { accessLogId: data.accessLogId, type: data.type };
}

export interface AccessRequestResult {
  accessLogId: string;
  status: AccessStatus;
  expiresAt: string;
}

export interface PendingAccessRequest {
  id: string;
  status: AccessStatus;
  requestedAt: string;
  expiresAt: string;
  requester: { id: string; name: string };
  vaultItem: { id: string; label: string; category: string };
}

export interface AccessHistoryEntry extends PendingAccessRequest {
  resolvedAt: string | null;
  fallbackUsed: boolean;
  notes: string | null;
  approver: { name: string } | null;
}

/**
 * API wrapper for the Assisted Access flow endpoints.
 * Real-time resolution is delivered via AccessGateway (see access-socket.service.ts);
 * this service only covers the request/response/listing HTTP calls.
 */
class AccessApiService {
  requestAccess(vaultItemId: string, deviceInfo?: string): Promise<AccessRequestResult> {
    return apiClient.post<AccessRequestResult>('/access/request', { vaultItemId, deviceInfo });
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

  state(id: string): Promise<{ id: string; vaultItemId: string; status: AccessStatus; expiresAt: string; notes: string | null }> {
    return apiClient.get(`/access/${id}`);
  }
}

export const accessApiService = new AccessApiService();
