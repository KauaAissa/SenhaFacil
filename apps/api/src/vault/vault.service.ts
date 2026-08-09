import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
      where: { userId },
      select: VAULT_ITEM_SELECT,
      orderBy: [{ isFavorite: 'desc' }, { updatedAt: 'desc' }],
    });
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
      where: { id: itemId, userId },
      select: { id: true },
    });

    if (!existing) throw new NotFoundException('Vault item not found');

    return this.prisma.vaultItem.update({
      where: { id: itemId },
      data: {
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

    await this.prisma.vaultItem.delete({ where: { id: itemId } });
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
    const results: Array<{
      clientId: string;
      serverId: string;
      action: 'created' | 'updated' | 'skipped';
    }> = [];

    for (const item of dto.items) {
      const existing = await this.prisma.vaultItem.findFirst({
        where: { id: item.id, userId },
        select: { id: true, updatedAt: true },
      });

      if (existing) {
        const clientUpdatedAt = new Date(item.updatedAt);

        // Skip if server has a more recent version (conflict resolved in favour of server)
        if (clientUpdatedAt <= existing.updatedAt) {
          results.push({ clientId: item.id, serverId: item.id, action: 'skipped' });
          continue;
        }

        await this.prisma.vaultItem.update({
          where: { id: item.id },
          data: {
            label: item.label,
            category: item.category,
            encryptedPayload: item.encryptedPayload,
            iv: item.iv,
            requiresApproval: item.requiresApproval ?? false,
            isFavorite: item.isFavorite ?? false,
            updatedAt: clientUpdatedAt,
          },
        });

        results.push({ clientId: item.id, serverId: item.id, action: 'updated' });
      } else {
        // New item created offline — server assigns a fresh ID
        const created = await this.prisma.vaultItem.create({
          data: {
            userId,
            label: item.label,
            category: item.category,
            encryptedPayload: item.encryptedPayload,
            iv: item.iv,
            requiresApproval: item.requiresApproval ?? false,
            isFavorite: item.isFavorite ?? false,
          },
          select: { id: true },
        });

        results.push({ clientId: item.id, serverId: created.id, action: 'created' });
      }
    }

    return {
      synced: results.filter((r) => r.action !== 'skipped').length,
      skipped: results.filter((r) => r.action === 'skipped').length,
      results,
    };
  }
}
