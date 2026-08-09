import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { VaultCategoryDto } from './create-vault-item.dto';

/**
 * All fields are optional — only provided fields are updated.
 *
 * Security invariant: `encryptedPayload` and `iv` must ALWAYS be provided
 * together. Re-encrypting content produces a new IV; updating only one of them
 * would leave the record in an inconsistent state. Enforced in VaultService.
 */
export class UpdateVaultItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsEnum(VaultCategoryDto)
  category?: VaultCategoryDto;

  @IsOptional()
  @IsString()
  @MinLength(1)
  encryptedPayload?: string;

  @IsOptional()
  @IsString()
  @MinLength(16)
  @MaxLength(24)
  iv?: string;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  isFavorite?: boolean;
}
