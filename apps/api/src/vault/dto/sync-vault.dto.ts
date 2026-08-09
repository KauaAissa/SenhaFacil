import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VaultCategoryDto } from './create-vault-item.dto';

/**
 * Represents a single vault item that was created or modified while offline.
 * The client provides its local ID; the server may assign a different ID for
 * new items and returns the mapping so the mobile can update its local DB.
 */
export class SyncItemDto {
  /** Client-assigned local ID (cuid format from offlineVaultService). */
  @IsString()
  id: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label: string;

  @IsEnum(VaultCategoryDto)
  category: VaultCategoryDto;

  @IsString()
  @MinLength(1)
  encryptedPayload: string;

  @IsString()
  @MinLength(16)
  @MaxLength(24)
  iv: string;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  isFavorite?: boolean;

  /**
   * ISO-8601 timestamp of the last local modification.
   * Used for last-write-wins conflict resolution: if the client's updatedAt
   * is older than the server record, the server version is preserved.
   */
  @IsISO8601()
  updatedAt: string;
}

export class SyncVaultDto {
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMaxSize(100) // Safety cap per request
  @Type(() => SyncItemDto)
  items: SyncItemDto[];
}
