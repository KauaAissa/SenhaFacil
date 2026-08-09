import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export enum VaultCategoryDto {
  BANKING = 'BANKING',
  SOCIAL_MEDIA = 'SOCIAL_MEDIA',
  EMAIL = 'EMAIL',
  HEALTH = 'HEALTH',
  GOVERNMENT = 'GOVERNMENT',
  SHOPPING = 'SHOPPING',
  OTHER = 'OTHER',
}

export class CreateVaultItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label: string;

  @IsEnum(VaultCategoryDto)
  category: VaultCategoryDto;

  /**
   * Base64-encoded AES-256-GCM ciphertext (includes GCM auth tag).
   * Produced by encryptVaultItem() on the client device.
   */
  @IsString()
  @MinLength(1)
  encryptedPayload: string;

  /**
   * Base64-encoded 12-byte nonce used during encryption.
   * Must be unique per item per update — never reuse with the same key.
   */
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
}
