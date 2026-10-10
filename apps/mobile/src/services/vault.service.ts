import { randomUUID } from 'expo-crypto';
import type { VaultItemPlaintext } from '@senha-facil/crypto';
import { offlineVaultService, type DecryptedVaultItem, type LocalVaultItem } from './offline-vault.service';
import { apiClient } from './api.client';
import { syncService } from './sync.service';
import { connectivityService } from './connectivity.service';

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
  /** Encrypts and persists a new item locally, then opportunistically syncs. */
  async createItem(input: VaultItemInput): Promise<string> {
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
    await this.revealItem(id, accessLogId);
    await offlineVaultService.saveItem(id, input.label, input.category, input.plaintext, {
      requiresApproval: input.requiresApproval,
      isFavorite: input.isFavorite,
      synced: false, // Re-encryption always produces a new IV — must re-sync
    });

    this.triggerBackgroundSync();
  }

  async deleteItem(id: string): Promise<void> {
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
      if (!item || grant.status !== 'APPROVED' || grant.vaultItemId !== item.id || new Date(grant.expiresAt).getTime() <= Date.now()) {
        throw new Error('Aprovacao ausente ou expirada.');
      }
    }
    if (accountId !== offlineVaultService.accountId) throw new Error('SESSION_CHANGED');
    return offlineVaultService.decryptItem(item);
  }

  async revealEmergency(id: string, authenticate: () => Promise<void>): Promise<DecryptedVaultItem> {
    if (connectivityService.isOnline) throw new Error('Use a aprovacao do familiar enquanto houver conexao.');
    const account = offlineVaultService.accountId;
    await authenticate();
    if (account !== offlineVaultService.accountId || connectivityService.isOnline) throw new Error('A sessao ou a conexao mudou.');
    const item = await offlineVaultService.getItem(id);
    if (!item) throw new Error('Senha nao encontrada.');
    await offlineVaultService.recordEmergency(id);
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
