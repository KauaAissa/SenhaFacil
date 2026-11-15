import { apiClient } from './api.client';
import { connectivityService } from './connectivity.service';
import { UserFacingError } from './error-messages';

export type VaultPermission = 'VIEW_ITEMS' | 'APPROVE_ACCESS' | 'MANAGE_ITEMS';
export type ContactStatus = 'PENDING' | 'ACTIVE' | 'REVOKED';

export interface TrustedContact {
  id: string;
  status: ContactStatus;
  permissions: VaultPermission[];
  createdAt: string;
  updatedAt: string;
  elderly: { id: string; name: string; email: string | null; loginPhone?: string | null };
  caregiver: { id: string; name: string; email: string | null; loginPhone?: string | null; isActive: boolean };
}

export function canApproveAccess(contact: TrustedContact): boolean {
  return contact.status === 'ACTIVE' && contact.permissions.includes('APPROVE_ACCESS') && contact.caregiver.isActive;
}

/**
 * API wrapper for the TrustedContact relationship endpoints.
 * Requires connectivity — contacts management is not available offline
 * since it depends on server-side login lookup and cross-user state.
 */
class ContactsApiService {
  invite(identifier: string): Promise<TrustedContact> {
    return apiClient.post<TrustedContact>('/contacts/invite', identifier.includes('@')
      ? { caregiverEmail: identifier } : { caregiverIdentifier: identifier });
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

  async requireApprovingContact(): Promise<void> {
    if (!connectivityService.isOnline) {
      throw new UserFacingError('Conecte-se à internet para conferir o familiar antes de ativar o acesso assistido. Você ainda pode salvar uma senha comum offline.');
    }
    if (!(await this.findAll()).some(canApproveAccess)) {
      throw new UserFacingError('Primeiro convide um familiar, aguarde o aceite e ative “Pode aprovar acessos” em “Meus familiares”.');
    }
  }
}

export const contactsApiService = new ContactsApiService();
