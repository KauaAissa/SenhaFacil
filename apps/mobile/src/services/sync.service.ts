import { connectivityService } from './connectivity.service';
import { offlineVaultService, type LocalVaultItem } from './offline-vault.service';
import { apiClient, ApiError } from './api.client';

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
}

interface SyncResultItem {
  clientId: string;
  serverId: string;
  action: 'created' | 'updated' | 'skipped';
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
 *   2. PULL  — fetch full server state via GET /vault
 *              Replace local cache (server is source of truth post-sync)
 *
 * Concurrency: isSyncing flag prevents overlapping sync cycles.
 * Retry: if push or pull fails, the cycle aborts and retries on next
 * connectivity event (items remain synced=false in local DB).
 */
class SyncService {
  private isSyncing = false;
  private unsubscribe: (() => void) | null = null;

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
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /**
   * Triggers a full sync cycle manually.
   * Safe to call from UI (e.g., pull-to-refresh). Concurrent calls are no-ops.
   */
  async sync(): Promise<void> {
    if (this.isSyncing || !connectivityService.isOnline) return;

    this.isSyncing = true;
    try {
      await this.push();
      await this.pull();
    } finally {
      this.isSyncing = false;
    }
  }

  // ─── Push (local → server) ─────────────────────────────────────────────────

  private async push(): Promise<void> {
    const unsynced = await offlineVaultService.getUnsyncedItems();
    if (unsynced.length === 0) return;

    // Send in batches to respect the server-side ArrayMaxSize(100) limit
    for (let offset = 0; offset < unsynced.length; offset += BATCH_SIZE) {
      await this.pushBatch(unsynced.slice(offset, offset + BATCH_SIZE));
    }
  }

  private async pushBatch(items: LocalVaultItem[]): Promise<void> {
    const payload = items.map((item) => ({
      id: item.id,
      label: item.label,
      category: item.category,
      encryptedPayload: item.encryptedPayload,
      iv: item.iv,
      requiresApproval: item.requiresApproval,
      isFavorite: item.isFavorite,
      updatedAt: item.updatedAt,
    }));

    const { results } = await apiClient.post<SyncResponse>('/vault/sync', {
      items: payload,
    });

    // Process server's ID mapping decisions
    for (const result of results) {
      if (result.action === 'skipped') {
        // Server has a newer version — mark local as synced to stop retrying
        await offlineVaultService.markAsSynced(result.clientId);
        continue;
      }

      if (result.clientId !== result.serverId) {
        // NEW item: server assigned a different ID — remap local SQLite record
        await offlineVaultService.remapItemId(result.clientId, result.serverId);
      } else {
        // UPDATED item: local ID matches server ID — just mark as synced
        await offlineVaultService.markAsSynced(result.serverId);
      }
    }
  }

  // ─── Pull (server → local) ─────────────────────────────────────────────────

  private async pull(): Promise<void> {
    const serverItems = await apiClient.get<ServerVaultItem[]>('/vault');

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
    }));

    // Full replace — server is the single source of truth after a successful push
    await offlineVaultService.replaceWithServerData(localItems);
  }
}

export const syncService = new SyncService();
