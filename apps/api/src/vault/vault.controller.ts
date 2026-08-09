import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VaultService } from './vault.service';
import { CreateVaultItemDto } from './dto/create-vault-item.dto';
import { UpdateVaultItemDto } from './dto/update-vault-item.dto';
import { SyncVaultDto } from './dto/sync-vault.dto';

interface AuthRequest {
  user: { id: string; role: string };
}

@Controller('vault')
@UseGuards(JwtAuthGuard)
export class VaultController {
  constructor(private readonly vaultService: VaultService) {}

  /**
   * POST /vault
   * Creates a new encrypted vault item for the authenticated user.
   * The server only stores the AES-256-GCM ciphertext and IV — never plaintext.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: AuthRequest, @Body() dto: CreateVaultItemDto) {
    return this.vaultService.create(req.user.id, dto);
  }

  /**
   * GET /vault
   * Returns all encrypted vault items owned by the authenticated user.
   * Ordered: favorites first, then most recently updated.
   */
  @Get()
  findAll(@Req() req: AuthRequest) {
    return this.vaultService.findAll(req.user.id);
  }

  /**
   * POST /vault/sync
   * Receives a batch of items modified while offline and reconciles them
   * with the server state. Uses last-write-wins based on updatedAt.
   * Must be declared BEFORE /:id routes to avoid route conflicts.
   */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  sync(@Req() req: AuthRequest, @Body() dto: SyncVaultDto) {
    return this.vaultService.sync(req.user.id, dto);
  }

  /**
   * PATCH /vault/:id
   * Partially updates a vault item. Ownership is strictly verified.
   * encryptedPayload and iv must always be provided together.
   */
  @Patch(':id')
  update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdateVaultItemDto,
  ) {
    return this.vaultService.update(req.user.id, id, dto);
  }

  /**
   * DELETE /vault/:id
   * Permanently deletes a vault item. Cascades to related AccessLogs.
   * Ownership is strictly verified before deletion.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.vaultService.remove(req.user.id, id);
  }
}
