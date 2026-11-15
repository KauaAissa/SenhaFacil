import { randomUUID } from 'expo-crypto';
import type { VaultItemPlaintext } from '@senha-facil/crypto';
import { offlineVaultService, type DecryptedVaultItem, type LocalVaultItem } from './offline-vault.service';
import { apiClient } from './api.client';
import { syncService } from './sync.service';
import { connectivityService } from './connectivity.service';
import { contactsApiService } from './contacts-api.service';
import { requestLocationService } from './request-location.service';
import { vaultActivityService } from './vault-activity.service';

type VaultCategory =
  | 'BANKING'
  | 'SOCIAL_MEDIA'
  | 'EMAIL'
  | 'HEALTH'
  | 'GOVERNMENT'
  | 'SHOPPING'
  | 'OTHER';

export interface VaultItemInput {
  label: string;
  category: VaultCategory;
  plaintext: VaultItemPlaintext;
  requiresApproval?: boolean;
  isFavorite?: boolean;
}

/**
 * High-level facade combining encryption, offline persistence and sync
 * triggering. Screens should call this instead of touching
 * offlineVaultService / vaultCryptoService directly, keeping the
 * Zero-Knowledge flow (encrypt-then-store) in one place.
 */
class VaultService {
  private readonly emergencyGrants = new Map<string, { owner: string; itemId: string; session: number }>();
  /** Encrypts and persists a new item locally, then opportunistically syncs. */
  async createItem(input: VaultItemInput): Promise<string> {
    const account = offlineVaultService.accountId;
    if (input.requiresApproval) {
      await contactsApiService.requireApprovingContact();
      await requestLocationService.requirePermission();
    }
    if (account !== offlineVaultService.accountId) throw new Error('SESSION_CHANGED');
    const id = generateLocalId();

    await offlineVaultService.saveItem(id, input.label, input.category, input.plaintext, {
      requiresApproval: input.requiresApproval,
      isFavorite: input.isFavorite,
      synced: false,
    });

    this.triggerBackgroundSync();
    return id;
  }

  /** Re-encrypts (fresh IV) and updates an existing item, then opportunistically syncs. */
  async updateItem(id: string, input: VaultItemInput, accessLogId?: string): Promise<void> {
    const existing = await this.revealItem(id, accessLogId);
    const account = offlineVaultService.accountId;
    if (input.requiresApproval && !existing.requiresApproval) {
      await contactsApiService.requireApprovingContact();
      await requestLocationService.requirePermission();
    }
    if (account !== offlineVaultService.accountId) throw new Error('SESSION_CHANGED');
    await offlineVaultService.saveItem(id, input.label, input.category, input.plaintext, {
      requiresApproval: input.requiresApproval,
      isFavorite: input.isFavorite,
      synced: false, // Re-encryption always produces a new IV — must re-sync
    });

    this.triggerBackgroundSync();
  }

  async deleteItem(id: string): Promise<void> {
    const account = offlineVaultService.accountId;
    await vaultActivityService.authorize('DELETE', id);
    if (account !== offlineVaultService.accountId) throw new Error('SESSION_CHANGED');
    await offlineVaultService.deleteItem(id);
    this.triggerBackgroundSync();
  }

  async setFavorite(id: string, favorite: boolean): Promise<void> {
    await offlineVaultService.setFavorite(id, favorite);
    this.triggerBackgroundSync();
  }

  async getAllItems(): Promise<LocalVaultItem[]> {
    return offlineVaultService.getAllItems();
  }

  async getItem(id: string): Promise<LocalVaultItem | null> {
    return offlineVaultService.getItem(id);
  }

  async revealItem(id: string, accessLogId?: string): Promise<DecryptedVaultItem> {
    const accountId = offlineVaultService.accountId;
    let item = await offlineVaultService.getItem(id);
    if (!item) throw new Error('Senha nao encontrada.');
    if (item.requiresApproval) {
      if (!accessLogId) throw new Error('A aprovacao do familiar e necessaria.');
      const grant = await apiClient.get<{ status: string; vaultItemId: string; expiresAt: string }>(`/access/${accessLogId}`);
      item = await offlineVaultService.getItem(id);
      if (!item || grant.status !== 'APPROVED' || grant.vaultItemId !== item.id || !(Date.parse(grant.expiresAt) > apiClient.getServerTime())) {
        throw new Error('Aprovacao ausente ou expirada.');
      }
    }
    if (accountId !== offlineVaultService.accountId) throw new Error('SESSION_CHANGED');
    await vaultActivityService.authorize('REVEAL', item.id);
    if (accountId !== offlineVaultService.accountId) throw new Error('SESSION_CHANGED');
    return offlineVaultService.decryptItem(item);
  }

  async revealEmergency(id: string, authenticate: () => Promise<void>): Promise<DecryptedVaultItem & { emergencyAccessId: string }> {
    if (connectivityService.isOnline) throw new Error('Use a aprovacao do familiar enquanto houver conexao.');
    const account = offlineVaultService.accountId;
    await authenticate();
    if (account !== offlineVaultService.accountId || connectivityService.isOnline) throw new Error('A sessao ou a conexao mudou.');
    const item = await offlineVaultService.getItem(id);
    if (!item) throw new Error('Senha nao encontrada.');
    const emergencyAccessId = await offlineVaultService.recordEmergency(id);
    if (!account || account !== offlineVaultService.accountId) throw new Error('SESSION_CHANGED');
    for (const [key, grant] of this.emergencyGrants) {
      if (grant.owner !== account || grant.itemId === item.id || grant.session !== vaultActivityService.sessionVersion()) this.emergencyGrants.delete(key);
    }
    this.emergencyGrants.set(emergencyAccessId, { owner: account, itemId: item.id, session: vaultActivityService.sessionVersion() });
    return { ...(await offlineVaultService.decryptItem(item)), emergencyAccessId };
  }

  async revealEmergencyAfterConfirmation(id: string, emergencyAccessId: string): Promise<DecryptedVaultItem> {
    if (connectivityService.isOnline) throw new Error('Use a aprovacao do familiar enquanto houver conexao.');
    vaultActivityService.requireRecentAuthentication();
    const grant = this.emergencyGrants.get(emergencyAccessId);
    const item = await offlineVaultService.getItem(id);
    vaultActivityService.requireRecentAuthentication();
    if (!item || !grant || grant.owner !== offlineVaultService.accountId || grant.itemId !== item.id ||
        grant.session !== vaultActivityService.sessionVersion()) throw new Error('SESSION_CHANGED');
    return offlineVaultService.decryptItem(item);
  }

  /** Fire-and-forget sync — never blocks the UI write path. */
  private triggerBackgroundSync(): void {
    if (!connectivityService.isOnline) return;
    syncService.sync().catch((err) => {
      console.warn('[VaultService] Background sync failed:', err);
    });
  }
}

function generateLocalId(): string {
  return `local_${randomUUID()}`;
}

export const vaultService = new VaultService();
