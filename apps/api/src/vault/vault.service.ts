import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateVaultItemDto } from './dto/create-vault-item.dto';
import type { UpdateVaultItemDto } from './dto/update-vault-item.dto';
import type { SyncVaultDto } from './dto/sync-vault.dto';

/** Columns returned in all vault item responses — never exposes userId */
const VAULT_ITEM_SELECT = {
  id: true,
  label: true,
  category: true,
  encryptedPayload: true,
  iv: true,
  requiresApproval: true,
  isFavorite: true,
  version: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class VaultService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── POST /vault ───────────────────────────────────────────────────────────

  async create(userId: string, dto: CreateVaultItemDto) {
    return this.prisma.vaultItem.create({
      data: {
        userId,
        label: dto.label,
        category: dto.category,
        encryptedPayload: dto.encryptedPayload,
        iv: dto.iv,
        requiresApproval: dto.requiresApproval ?? false,
        isFavorite: dto.isFavorite ?? false,
      },
      select: VAULT_ITEM_SELECT,
    });
  }

  // ─── GET /vault ────────────────────────────────────────────────────────────

  async findAll(userId: string) {
    return this.prisma.vaultItem.findMany({
      where: { userId, deletedAt: null },
      select: VAULT_ITEM_SELECT,
      orderBy: [{ isFavorite: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async findSyncState(userId: string) {
    return this.prisma.vaultItem.findMany({ where: { userId }, select: VAULT_ITEM_SELECT });
  }

  // ─── PATCH /vault/:id ──────────────────────────────────────────────────────

  async update(userId: string, itemId: string, dto: UpdateVaultItemDto) {
    // Security invariant: encryptedPayload and iv must be updated together
    const hasPayload = dto.encryptedPayload !== undefined;
    const hasIv = dto.iv !== undefined;
    if (hasPayload !== hasIv) {
      throw new BadRequestException(
        'encryptedPayload and iv must be provided together when updating encrypted data',
      );
    }

    // Ownership check — findFirst enforces userId so no user can update another's item
    const existing = await this.prisma.vaultItem.findFirst({
      where: { id: itemId, userId, deletedAt: null },
      select: { id: true },
    });

    if (!existing) throw new NotFoundException('Vault item not found');

    return this.prisma.vaultItem.update({
      where: { id: itemId, userId, deletedAt: null },
      data: {
        version: { increment: 1 },
        ...(dto.label !== undefined && { label: dto.label }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.encryptedPayload !== undefined && { encryptedPayload: dto.encryptedPayload }),
        ...(dto.iv !== undefined && { iv: dto.iv }),
        ...(dto.requiresApproval !== undefined && { requiresApproval: dto.requiresApproval }),
        ...(dto.isFavorite !== undefined && { isFavorite: dto.isFavorite }),
      },
      select: VAULT_ITEM_SELECT,
    });
  }

  // ─── DELETE /vault/:id ─────────────────────────────────────────────────────

  async remove(userId: string, itemId: string): Promise<void> {
    const existing = await this.prisma.vaultItem.findFirst({
      where: { id: itemId, userId },
      select: { id: true },
    });

    if (!existing) throw new NotFoundException('Vault item not found');

    await this.prisma.vaultItem.updateMany({
      where: { id: itemId, userId, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 }, encryptedPayload: '', iv: '' },
    });
  }

  // ─── POST /vault/sync ──────────────────────────────────────────────────────

  /**
   * Reconciles offline changes from the mobile client.
   *
   * For each item in the payload:
   *   - Existing item (ID found and owned by user) → last-write-wins on updatedAt
   *   - New item (ID not found) → INSERT with a server-generated ID
   *
   * Returns a mapping of clientId → serverId so the mobile can update
   * its local SQLite records after a successful sync.
   */
  async sync(userId: string, dto: SyncVaultDto) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async (transaction) => {
          const results: Array<{
            clientId: string; serverId: string; operationId: string;
            action: 'created' | 'updated' | 'deleted' | 'conflict'; version: number; serverDeleted: boolean;
          }> = [];
          for (const item of dto.items) {
            const receipt = await transaction.vaultSyncOperation.findUnique({
              where: { userId_operationId: { userId, operationId: item.operationId } },
            });
            if (receipt) {
              const result = receipt.result as unknown as (typeof results)[number];
              if (result.clientId !== item.id) throw new BadRequestException('Operation ID already used');
              results.push(result);
              continue;
            }
            const serverId = item.id.startsWith('local_')
              ? `sf_${createHash('sha256').update(`${userId}:${item.id}`).digest('hex')}` : item.id;
            const existing = await transaction.vaultItem.findUnique({ where: { id: serverId } });
            if (existing && existing.userId !== userId) throw new NotFoundException('Vault item not found');
            let action: (typeof results)[number]['action'];
            let version = existing?.version ?? 0;
            if (existing && (existing.deletedAt || existing.version !== item.version)) {
              action = existing.deletedAt && item.deleted ? 'deleted' : 'conflict';
            } else if (!existing && item.version !== 0) {
              action = 'conflict';
            } else {
              version += 1;
              const data = {
                label: item.label, category: item.category,
                encryptedPayload: item.deleted ? '' : item.encryptedPayload,
                iv: item.deleted ? '' : item.iv,
                requiresApproval: item.requiresApproval ?? false,
                isFavorite: item.isFavorite ?? false,
                version, deletedAt: item.deleted ? new Date() : null,
              };
              if (existing) await transaction.vaultItem.update({ where: { id: serverId, userId }, data });
              else await transaction.vaultItem.create({ data: { ...data, id: serverId, userId } });
              action = item.deleted ? 'deleted' : existing ? 'updated' : 'created';
            }
            const result = { clientId: item.id, serverId, operationId: item.operationId, action, version, serverDeleted: Boolean(existing?.deletedAt) };
            await transaction.vaultSyncOperation.create({ data: { userId, operationId: item.operationId, result } });
            results.push(result);
          }
          return { results, synced: results.filter((result) => result.action !== 'conflict').length,
            skipped: results.filter((result) => result.action === 'conflict').length };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (attempt < 2 && error instanceof Prisma.PrismaClientKnownRequestError &&
            ['P2034', 'P2002'].includes(error.code)) continue;
        throw error;
      }
    }
    throw new BadRequestException('Sync conflict; retry later');
  }
}
