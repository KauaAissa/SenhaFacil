import * as SQLite from 'expo-sqlite';
import { encryptVaultItem, decryptVaultItem } from '@senha-facil/crypto';
import { randomUUID } from 'expo-crypto';
import type { VaultItemPlaintext } from '@senha-facil/crypto';
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
  version: number;
  operationId: string;
  deleted: boolean;
  conflict: boolean;
  serverDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DecryptedVaultItem extends LocalVaultItem {
  plaintext: VaultItemPlaintext;
}

interface Row {
  id: string; label: string; category: VaultCategory; encrypted_payload: string; iv: string;
  requires_approval: number; is_favorite: number; synced: number;
  created_at: string; updated_at: string; version: number; operation_id: string;
  deleted: number; conflict: number; remote_deleted: number;
}

function fromRow(row: Row): LocalVaultItem {
  return { id: row.id, label: row.label, category: row.category,
    encryptedPayload: row.encrypted_payload, iv: row.iv,
    requiresApproval: Boolean(row.requires_approval), isFavorite: Boolean(row.is_favorite),
    synced: Boolean(row.synced), createdAt: row.created_at, updatedAt: row.updated_at,
    version: row.version, operationId: row.operation_id, deleted: Boolean(row.deleted), conflict: Boolean(row.conflict), serverDeleted: Boolean(row.remote_deleted) };
}

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
export class OfflineVaultService {
  private db: SQLite.SQLiteDatabase | null = null;
  private ownerId: string | null = null;

  async initialize(ownerId: string): Promise<void> {
    if (!/^[a-zA-Z0-9_-]+$/.test(ownerId)) throw new Error('INVALID_ACCOUNT_ID');
    if (this.ownerId === ownerId && this.db) return;
    await this.close();
    this.db = await SQLite.openDatabaseAsync(`senha_facil_${ownerId}.db`);
    this.ownerId = ownerId;

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

      CREATE TABLE IF NOT EXISTS emergency_events (
        id TEXT PRIMARY KEY, vault_item_id TEXT NOT NULL, occurred_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS item_aliases (
        old_id TEXT PRIMARY KEY, new_id TEXT NOT NULL
      );
    `);
    const columns = await this.db.getAllAsync<{ name: string }>('PRAGMA table_info(vault_items)');
    for (const [name, definition] of Object.entries({
      version: 'INTEGER NOT NULL DEFAULT 0', operation_id: "TEXT NOT NULL DEFAULT ''",
      deleted: 'INTEGER NOT NULL DEFAULT 0', conflict: 'INTEGER NOT NULL DEFAULT 0',
      remote_deleted: 'INTEGER NOT NULL DEFAULT 0',
    })) {
      if (!columns.some((column) => column.name === name)) await this.db.execAsync(`ALTER TABLE vault_items ADD COLUMN ${name} ${definition}`);
    }
    const missingIds = await this.db.getAllAsync<{ id: string }>("SELECT id FROM vault_items WHERE operation_id = ''");
    for (const item of missingIds) await this.db.runAsync('UPDATE vault_items SET operation_id = ? WHERE id = ?', [randomUUID(), item.id]);
    await this.importLegacy();
  }

  private async importLegacy(): Promise<void> {
    if (!vaultCryptoService.isLoaded) return;
    const database = this.database;
    const key = vaultCryptoService.key;
    const legacy = await SQLite.openDatabaseAsync('senha_facil_vault.db');
    try {
      const table = await legacy.getFirstAsync("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'vault_items'");
      if (!table) return;
      const rows = await legacy.getAllAsync<Row>('SELECT * FROM vault_items');
      for (const row of rows) {
        if (await database.getFirstAsync('SELECT old_id FROM item_aliases WHERE old_id = ?', [row.id])) continue;
        try { await decryptVaultItem({ ciphertext: row.encrypted_payload, iv: row.iv }, key); }
        catch { continue; }
        if (database !== this.db || !vaultCryptoService.isLoaded || vaultCryptoService.key !== key) throw new Error('SESSION_CHANGED');
        await database.runAsync(`INSERT OR IGNORE INTO vault_items
          (id,label,category,encrypted_payload,iv,requires_approval,is_favorite,synced,created_at,updated_at,operation_id)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [row.id,row.label,row.category,row.encrypted_payload,row.iv,row.requires_approval,row.is_favorite,
            row.synced,row.created_at,row.updated_at,randomUUID()]);
      }
    } finally { await legacy.closeAsync(); }
  }

  get accountId(): string | null {
    return this.ownerId;
  }

  async close(): Promise<void> {
    const database = this.db;
    this.db = null;
    this.ownerId = null;
    await database?.closeAsync();
  }

  async eraseAccount(ownerId: string): Promise<void> {
    if (ownerId !== this.ownerId) throw new Error('SESSION_CHANGED');
    const key = vaultCryptoService.key;
    const legacy = await SQLite.openDatabaseAsync('senha_facil_vault.db');
    try {
      const table = await legacy.getFirstAsync("SELECT name FROM sqlite_master WHERE type='table' AND name='vault_items'");
      if (table) for (const row of await legacy.getAllAsync<Row>('SELECT * FROM vault_items')) {
        try { await decryptVaultItem({ ciphertext: row.encrypted_payload, iv: row.iv }, key); }
        catch { continue; }
        await legacy.runAsync('DELETE FROM vault_items WHERE id = ?', [row.id]);
      }
    } finally { await legacy.closeAsync(); }
    await this.close();
    await SQLite.deleteDatabaseAsync(`senha_facil_${ownerId}.db`);
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
    const database = this.database;
    const account = this.ownerId;
    const key = vaultCryptoService.key;
    const resolvedId = await this.resolveId(id);
    const { ciphertext, iv } = await encryptVaultItem(plaintext, key);
    if (this.ownerId !== account || database !== this.db || !vaultCryptoService.isLoaded || vaultCryptoService.key !== key) throw new Error('SESSION_CHANGED');
    const now = new Date().toISOString();

    await database.runAsync(
      `INSERT INTO vault_items
         (id, label, category, encrypted_payload, iv,
          requires_approval, is_favorite, synced, created_at, updated_at, operation_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET label=excluded.label, category=excluded.category,
         encrypted_payload=excluded.encrypted_payload, iv=excluded.iv,
         requires_approval=excluded.requires_approval, is_favorite=excluded.is_favorite,
         synced=excluded.synced, updated_at=excluded.updated_at, operation_id=excluded.operation_id`,
      [
        resolvedId,
        label,
        category,
        ciphertext,
        iv,
        options.requiresApproval ? 1 : 0,
        options.isFavorite ? 1 : 0,
        options.synced ? 1 : 0,
        now,
        now,
        randomUUID(),
      ],
    );
  }

  /**
   * Retrieves and decrypts all vault items ordered by most recently updated.
   */
  async getAllItems(): Promise<LocalVaultItem[]> {
    const rows = await this.database.getAllAsync<Row>(
      'SELECT * FROM vault_items WHERE deleted = 0 ORDER BY is_favorite DESC, updated_at DESC',
    );
    return rows.map(fromRow);
  }

  async getItem(id: string): Promise<LocalVaultItem | null> {
    const database = this.database;
    const resolvedId = await this.resolveId(id);
    if (database !== this.db) throw new Error('SESSION_CHANGED');
    const row = await database.getFirstAsync<Row>('SELECT * FROM vault_items WHERE id = ? AND deleted = 0', [resolvedId]);
    if (database !== this.db) throw new Error('SESSION_CHANGED');
    return row ? fromRow(row) : null;
  }

  async resolveId(id: string): Promise<string> {
    const database = this.database;
    let current = id;
    for (let count = 0; count < 8; count++) {
      const alias = await database.getFirstAsync<{ new_id: string }>('SELECT new_id FROM item_aliases WHERE old_id = ?', [current]);
      if (database !== this.db) throw new Error('SESSION_CHANGED');
      if (!alias) return current;
      current = alias.new_id;
    }
    throw new Error('INVALID_ID_ALIAS');
  }

  async decryptItem(item: LocalVaultItem): Promise<DecryptedVaultItem> {
    const key = vaultCryptoService.key;
    const account = this.ownerId;
    const plaintext = await decryptVaultItem({ ciphertext: item.encryptedPayload, iv: item.iv }, key);
    if (account !== this.ownerId || !vaultCryptoService.isLoaded || vaultCryptoService.key !== key) throw new Error('SESSION_CHANGED');
    return { ...item, plaintext };
  }

  /**
   * Returns encrypted rows that have not yet been uploaded to the server.
   * Used by the sync service when connectivity is restored.
   */
  async getUnsyncedItems(): Promise<LocalVaultItem[]> {
    const rows = await this.database.getAllAsync<Row>(
      'SELECT * FROM vault_items WHERE synced = 0 AND conflict = 0',
    );
    return rows.map(fromRow);
  }

  async acknowledge(item: LocalVaultItem, result: { serverId: string; version: number; action: string; serverDeleted?: boolean }): Promise<void> {
    await this.database.withExclusiveTransactionAsync(async (transaction) => {
      if (item.id !== result.serverId) await transaction.runAsync('INSERT OR REPLACE INTO item_aliases (old_id,new_id) VALUES (?,?)', [item.id, result.serverId]);
      await transaction.runAsync(`UPDATE vault_items SET id = ?, version = ?,
      synced = CASE WHEN operation_id = ? AND ? != 'conflict' THEN 1 ELSE 0 END,
      conflict = CASE WHEN ? = 'conflict' THEN 1 ELSE conflict END, remote_deleted = ? WHERE id = ?`,
      [result.serverId, result.version, item.operationId, result.action, result.action, result.serverDeleted ? 1 : 0, item.id]);
    });
  }

  async deleteItem(id: string): Promise<void> {
    const database = this.database;
    const resolvedId = await this.resolveId(id);
    if (database !== this.db) throw new Error('SESSION_CHANGED');
    await database.runAsync('UPDATE vault_items SET deleted = 1, synced = 0, operation_id = ?, updated_at = ? WHERE id = ?',
      [randomUUID(), new Date().toISOString(), resolvedId]);
  }

  async setFavorite(id: string, favorite: boolean): Promise<void> {
    const database = this.database;
    const resolvedId = await this.resolveId(id);
    if (database !== this.db) throw new Error('SESSION_CHANGED');
    await database.runAsync('UPDATE vault_items SET is_favorite = ?, synced = 0, operation_id = ?, updated_at = ? WHERE id = ? AND deleted = 0',
      [favorite ? 1 : 0, randomUUID(), new Date().toISOString(), resolvedId]);
  }

  async getConflicts(): Promise<LocalVaultItem[]> {
    return (await this.database.getAllAsync<Row>('SELECT * FROM vault_items WHERE conflict = 1')).map(fromRow);
  }

  /**
   * Swaps a client-assigned local ID for the server-assigned ID.
   * Called by SyncService when a new offline item reaches the server and
   * the server creates it with a different (server-generated) ID.
   *
   * SQLite does not allow updating a primary key in-place, so we:
   *   1. Copy the row with the new ID
   *   2. Delete the old row
   * Both steps run in a single transaction for atomicity.
   */
  async resolveConflict(id: string, keepLocal: boolean): Promise<void> {
    if (keepLocal) {
      await this.database.runAsync(`UPDATE vault_items SET conflict = 0, operation_id = ?,
        id = CASE WHEN remote_deleted = 1 THEN ? ELSE id END,
        version = CASE WHEN remote_deleted = 1 THEN 0 ELSE version END, remote_deleted = 0 WHERE id = ?`,
        [randomUUID(), `local_${randomUUID()}`, id]);
    }
    else await this.database.runAsync('DELETE FROM vault_items WHERE id = ? AND conflict = 1', [id]);
  }

  /**
   * Full replace from server data (used after login or reconnection).
   * All existing local rows are dropped and replaced with server rows (marked synced=1).
   *
   * @param serverItems - Encrypted items as returned by GET /vault
   */
  async mergeServerData(serverItems: LocalVaultItem[]): Promise<void> {
    const database = this.database;
    await database.withExclusiveTransactionAsync(async (transaction) => {
      for (const item of serverItems) {
        await transaction.runAsync(
          `INSERT INTO vault_items
             (id, label, category, encrypted_payload, iv,
              requires_approval, is_favorite, synced, created_at, updated_at, version, operation_id, deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET label=excluded.label, category=excluded.category,
             encrypted_payload=excluded.encrypted_payload, iv=excluded.iv,
             requires_approval=excluded.requires_approval, is_favorite=excluded.is_favorite,
             created_at=excluded.created_at, updated_at=excluded.updated_at,
             version=excluded.version, deleted=excluded.deleted
           WHERE vault_items.synced = 1`,
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
            item.version,
            item.operationId,
            item.deleted ? 1 : 0,
          ],
        );
      }
    });
  }

  async recordEmergency(id: string): Promise<string> {
    const eventId = randomUUID();
    await this.database.runAsync('INSERT INTO emergency_events (id, vault_item_id, occurred_at) VALUES (?, ?, ?)',
      [eventId, id, new Date().toISOString()]);
    return eventId;
  }

  async getEmergencyEvents(): Promise<Array<{ id: string; vault_item_id: string; occurred_at: string }>> {
    return this.database.getAllAsync('SELECT * FROM emergency_events');
  }

  async acknowledgeEmergency(id: string): Promise<void> {
    await this.database.runAsync('DELETE FROM emergency_events WHERE id = ?', [id]);
  }
}

export const offlineVaultService = new OfflineVaultService();
