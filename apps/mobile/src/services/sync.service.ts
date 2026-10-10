import { connectivityService } from './connectivity.service';
import { offlineVaultService, type LocalVaultItem } from './offline-vault.service';
import { apiClient, ApiError } from './api.client';
import { vaultCryptoService } from './vault-crypto.service';

interface ServerVaultItem {
  id: string;
  label: string;
  category: LocalVaultItem['category'];
  encryptedPayload: string;
  iv: string;
  requiresApproval: boolean;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
  deletedAt: string | null;
}

interface SyncResultItem {
  clientId: string;
  serverId: string;
  action: 'created' | 'updated' | 'deleted' | 'conflict';
  operationId: string;
  version: number;
  serverDeleted: boolean;
}

interface SyncResponse {
  synced: number;
  skipped: number;
  results: SyncResultItem[];
}

/** Max items per POST /vault/sync request (mirrors server-side ArrayMaxSize) */
const BATCH_SIZE = 100;

/**
 * Orchestrates bidirectional synchronization between the local SQLite vault
 * and the NestJS API.
 *
 * Sync cycle (triggered when connectivity is restored):
 *   1. PUSH  — upload items where synced=false via POST /vault/sync
 *              Handle server-assigned ID remapping for items created offline
 *   2. PULL  — merge server state and tombstones via GET /vault/sync
 *              Preserve unsent edits and unresolved conflicts
 *
 * Concurrency: isSyncing flag prevents overlapping sync cycles.
 * Retry: if push or pull fails, the cycle aborts and retries on next
 * connectivity event (items remain synced=false in local DB).
 */
class SyncService {
  private isSyncing = false;
  private unsubscribe: (() => void) | null = null;
  private generation = 0;
  private retry: ReturnType<typeof setInterval> | null = null;

  /**
   * Starts the connectivity listener. Call once at app root (e.g., _layout.tsx).
   */
  start(): void {
    if (this.unsubscribe) return; // Guard against double-start

    this.unsubscribe = connectivityService.subscribe(async (isOnline) => {
      if (isOnline) {
        await this.sync().catch((err) => {
          console.error('[SyncService] Sync failed:', err instanceof ApiError ? err.message : err);
        });
      }
    });
    this.retry = setInterval(() => { void this.sync().catch(() => undefined); }, 30_000);
    void this.sync().catch(() => undefined);
  }

  stop(): void {
    this.generation += 1;
    if (this.retry) clearInterval(this.retry);
    this.retry = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /**
   * Triggers a full sync cycle manually.
   * Safe to call from UI (e.g., pull-to-refresh). Concurrent calls are no-ops.
   */
  async sync(): Promise<void> {
    if (this.isSyncing || !this.unsubscribe || !connectivityService.isOnline || !vaultCryptoService.isLoaded) return;

    const generation = this.generation;
    const owner = offlineVaultService.accountId;
    this.isSyncing = true;
    try {
      const token = await apiClient.getToken();
      if (!token || !this.current(generation, owner)) return;
      const profile = await apiClient.get<{ id: string }>('/users/me');
      if (!this.current(generation, owner)) return;
      if (profile.id !== owner) throw new Error('SESSION_ACCOUNT_MISMATCH');
      await this.push(generation, owner);
      if (!this.current(generation, owner)) return;
      await this.pull(generation, owner);
      if (!this.current(generation, owner)) return;
      const events = await offlineVaultService.getEmergencyEvents();
      for (const event of events) {
        if (!this.current(generation, owner)) return;
        await apiClient.post('/access/emergency', { eventId: event.id, vaultItemId: event.vault_item_id, occurredAt: event.occurred_at });
        if (!this.current(generation, owner)) return;
        await offlineVaultService.acknowledgeEmergency(event.id);
      }
    } finally {
      this.isSyncing = false;
    }
  }

  private current(generation: number, owner: string | null): boolean {
    return generation === this.generation && owner !== null && owner === offlineVaultService.accountId && vaultCryptoService.isLoaded;
  }

  // ─── Push (local → server) ─────────────────────────────────────────────────

  private async push(generation: number, owner: string | null): Promise<void> {
    const unsynced = await offlineVaultService.getUnsyncedItems();
    if (unsynced.length === 0) return;

    // Send in batches to respect the server-side ArrayMaxSize(100) limit
    for (let offset = 0; offset < unsynced.length; offset += BATCH_SIZE) {
      if (!this.current(generation, owner)) return;
      await this.pushBatch(unsynced.slice(offset, offset + BATCH_SIZE), generation, owner);
    }
  }

  private async pushBatch(items: LocalVaultItem[], generation: number, owner: string | null): Promise<void> {
    const payload = items.map((item) => ({
      id: item.id,
      label: item.label,
      category: item.category,
      encryptedPayload: item.encryptedPayload,
      iv: item.iv,
      requiresApproval: item.requiresApproval,
      isFavorite: item.isFavorite,
      updatedAt: item.updatedAt,
      operationId: item.operationId,
      version: item.version,
      deleted: item.deleted,
    }));

    const { results } = await apiClient.post<SyncResponse>('/vault/sync', {
      items: payload,
    });
    if (!this.current(generation, owner)) return;

    // Process server's ID mapping decisions
    for (const result of results) {
      if (!this.current(generation, owner)) return;
      const sent = items.find((item) => item.operationId === result.operationId && item.id === result.clientId);
      if (!sent) throw new Error('INVALID_SYNC_RECEIPT');
      await offlineVaultService.acknowledge(sent, result);
    }
  }

  // ─── Pull (server → local) ─────────────────────────────────────────────────

  private async pull(generation: number, owner: string | null): Promise<void> {
    const serverItems = await apiClient.get<ServerVaultItem[]>('/vault/sync');
    if (!this.current(generation, owner)) return;

    const localItems: LocalVaultItem[] = serverItems.map((item) => ({
      id: item.id,
      label: item.label,
      category: item.category,
      encryptedPayload: item.encryptedPayload,
      iv: item.iv,
      requiresApproval: item.requiresApproval,
      isFavorite: item.isFavorite,
      synced: true,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      version: item.version,
      operationId: '',
      deleted: Boolean(item.deletedAt),
      conflict: false,
      serverDeleted: Boolean(item.deletedAt),
    }));

    await offlineVaultService.mergeServerData(localItems);
  }
}

export const syncService = new SyncService();
