import * as SQLite from 'expo-sqlite';
import { encryptVaultItem, decryptVaultItem } from '@senha-facil/crypto';
import type { EncryptedPayload, VaultItemPlaintext } from '@senha-facil/crypto';
import { vaultCryptoService } from './vault-crypto.service';

// Mirrors the Prisma VaultCategory enum
type VaultCategory =
  | 'BANKING'
  | 'SOCIAL_MEDIA'
  | 'EMAIL'
  | 'HEALTH'
  | 'GOVERNMENT'
  | 'SHOPPING'
  | 'OTHER';

export interface LocalVaultItem {
  id: string;
  label: string;
  category: VaultCategory;
  encryptedPayload: string; // maps to encrypted_payload column
  iv: string;
  requiresApproval: boolean;
  isFavorite: boolean;
  /** false = pending upload to server; true = confirmed synced */
  synced: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DecryptedVaultItem extends LocalVaultItem {
  plaintext: VaultItemPlaintext;
}

const DB_NAME = 'senha_facil_vault.db';

/**
 * Local SQLite vault for offline-first access to encrypted vault items.
 *
 * Security guarantees:
 *   - Only AES-256-GCM encrypted blobs are persisted — never plaintext
 *   - The SQLite file itself is stored in the app's private sandbox
 *   - WAL mode enabled for write performance and crash safety
 *
 * Sync strategy:
 *   - `synced = 0`  → item exists locally only; must be uploaded when online
 *   - `synced = 1`  → item is confirmed to be in sync with the server
 *   - replaceWithServerData() performs a full replace after a successful pull
 */
class OfflineVaultService {
  private db: SQLite.SQLiteDatabase | null = null;

  async initialize(): Promise<void> {
    this.db = await SQLite.openDatabaseAsync(DB_NAME);

    await this.db.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS vault_items (
        id                TEXT PRIMARY KEY,
        label             TEXT NOT NULL,
        category          TEXT NOT NULL,
        encrypted_payload TEXT NOT NULL,
        iv                TEXT NOT NULL,
        requires_approval INTEGER NOT NULL DEFAULT 0,
        is_favorite       INTEGER NOT NULL DEFAULT 0,
        synced            INTEGER NOT NULL DEFAULT 0,
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_vault_synced
        ON vault_items (synced);
    `);
  }

  private get database(): SQLite.SQLiteDatabase {
    if (!this.db) {
      throw new Error('OfflineVaultService not initialized — call initialize() first.');
    }
    return this.db;
  }

  /**
   * Encrypts and persists a vault item locally.
   * Pass `synced: true` only when saving data that was just fetched from the server.
   */
  async saveItem(
    id: string,
    label: string,
    category: VaultCategory,
    plaintext: VaultItemPlaintext,
    options: { requiresApproval?: boolean; isFavorite?: boolean; synced?: boolean } = {},
  ): Promise<void> {
    const { ciphertext, iv } = await encryptVaultItem(plaintext, vaultCryptoService.key);
    const now = new Date().toISOString();

    await this.database.runAsync(
      `INSERT OR REPLACE INTO vault_items
         (id, label, category, encrypted_payload, iv,
          requires_approval, is_favorite, synced, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        label,
        category,
        ciphertext,
        iv,
        options.requiresApproval ? 1 : 0,
        options.isFavorite ? 1 : 0,
        options.synced ? 1 : 0,
        now,
        now,
      ],
    );
  }

  /**
   * Retrieves and decrypts all vault items ordered by most recently updated.
   */
  async getAllItems(): Promise<DecryptedVaultItem[]> {
    type Row = {
      id: string;
      label: string;
      category: string;
      encrypted_payload: string;
      iv: string;
      requires_approval: number;
      is_favorite: number;
      synced: number;
      created_at: string;
      updated_at: string;
    };

    const rows = await this.database.getAllAsync<Row>(
      'SELECT * FROM vault_items ORDER BY updated_at DESC',
    );

    return Promise.all(
      rows.map(async (row): Promise<DecryptedVaultItem> => {
        const payload: EncryptedPayload = { ciphertext: row.encrypted_payload, iv: row.iv };
        const plaintext = await decryptVaultItem(payload, vaultCryptoService.key);

        return {
          id: row.id,
          label: row.label,
          category: row.category as VaultCategory,
          encryptedPayload: row.encrypted_payload,
          iv: row.iv,
          requiresApproval: row.requires_approval === 1,
          isFavorite: row.is_favorite === 1,
          synced: row.synced === 1,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          plaintext,
        };
      }),
    );
  }

  /**
   * Returns encrypted rows that have not yet been uploaded to the server.
   * Used by the sync service when connectivity is restored.
   */
  async getUnsyncedItems(): Promise<LocalVaultItem[]> {
    type Row = {
      id: string;
      label: string;
      category: string;
      encrypted_payload: string;
      iv: string;
      requires_approval: number;
      is_favorite: number;
      synced: number;
      created_at: string;
      updated_at: string;
    };

    const rows = await this.database.getAllAsync<Row>(
      'SELECT * FROM vault_items WHERE synced = 0',
    );

    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      category: row.category as VaultCategory,
      encryptedPayload: row.encrypted_payload,
      iv: row.iv,
      requiresApproval: row.requires_approval === 1,
      isFavorite: row.is_favorite === 1,
      synced: false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /** Marks an item as synced after a successful server upload. */
  async markAsSynced(id: string): Promise<void> {
    await this.database.runAsync(
      'UPDATE vault_items SET synced = 1, updated_at = ? WHERE id = ?',
      [new Date().toISOString(), id],
    );
  }

  async deleteItem(id: string): Promise<void> {
    await this.database.runAsync('DELETE FROM vault_items WHERE id = ?', [id]);
  }

  /**
   * Full replace from server data (used after login or reconnection).
   * All existing local rows are dropped and replaced with server rows (marked synced=1).
   *
   * @param serverItems - Encrypted items as returned by GET /vault
   */
  async replaceWithServerData(serverItems: LocalVaultItem[]): Promise<void> {
    await this.database.withTransactionAsync(async () => {
      await this.database.runAsync('DELETE FROM vault_items');

      for (const item of serverItems) {
        await this.database.runAsync(
          `INSERT INTO vault_items
             (id, label, category, encrypted_payload, iv,
              requires_approval, is_favorite, synced, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          [
            item.id,
            item.label,
            item.category,
            item.encryptedPayload,
            item.iv,
            item.requiresApproval ? 1 : 0,
            item.isFavorite ? 1 : 0,
            item.createdAt,
            item.updatedAt,
          ],
        );
      }
    });
  }
}

export const offlineVaultService = new OfflineVaultService();
