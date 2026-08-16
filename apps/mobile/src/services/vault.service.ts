import type { VaultItemPlaintext } from '@senha-facil/crypto';
import { offlineVaultService, type DecryptedVaultItem } from './offline-vault.service';
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
  async updateItem(id: string, input: VaultItemInput): Promise<void> {
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

  async getAllItems(): Promise<DecryptedVaultItem[]> {
    return offlineVaultService.getAllItems();
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
  // crypto.randomUUID() is available via the Web Crypto polyfill already
  // required by @senha-facil/crypto (deriveKey/encryptVaultItem use crypto.subtle).
  return `local_${crypto.randomUUID()}`;
}

export const vaultService = new VaultService();
