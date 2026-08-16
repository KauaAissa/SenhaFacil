import { apiClient } from './api.client';

export type VaultPermission = 'VIEW_ITEMS' | 'APPROVE_ACCESS' | 'MANAGE_ITEMS';
export type ContactStatus = 'PENDING' | 'ACTIVE' | 'REVOKED';

export interface TrustedContact {
  id: string;
  status: ContactStatus;
  permissions: VaultPermission[];
  createdAt: string;
  updatedAt: string;
  elderly: { id: string; name: string; email: string };
  caregiver: { id: string; name: string; email: string };
}

/**
 * API wrapper for the TrustedContact relationship endpoints.
 * Requires connectivity — contacts management is not available offline
 * since it depends on server-side email lookup and cross-user state.
 */
class ContactsApiService {
  invite(caregiverEmail: string): Promise<TrustedContact> {
    return apiClient.post<TrustedContact>('/contacts/invite', { caregiverEmail });
  }

  accept(contactId: string): Promise<TrustedContact> {
    return apiClient.post<TrustedContact>(`/contacts/${contactId}/accept`, {});
  }

  revoke(contactId: string): Promise<TrustedContact> {
    return apiClient.post<TrustedContact>(`/contacts/${contactId}/revoke`, {});
  }

  updatePermissions(contactId: string, permissions: VaultPermission[]): Promise<TrustedContact> {
    return apiClient.patch<TrustedContact>(`/contacts/${contactId}/permissions`, { permissions });
  }

  findAll(): Promise<TrustedContact[]> {
    return apiClient.get<TrustedContact[]>('/contacts');
  }
}

export const contactsApiService = new ContactsApiService();
