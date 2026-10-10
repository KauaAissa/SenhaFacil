import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  Equals,
  ValidateNested,
  IsDefined,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VaultProtectionDto } from './vault-protection.dto';

export enum UserRoleDto {
  ELDERLY = 'ELDERLY',
  CAREGIVER = 'CAREGIVER',
}

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{7,14}$/, { message: 'phone must be a valid international number' })
  phone?: string;

  @Matches(/^[0-9a-f]{64}$/)
  password: string;

  @Equals(2)
  authVersion: number;

  @IsDefined()
  @ValidateNested()
  @Type(() => VaultProtectionDto)
  protection: VaultProtectionDto;

  @Matches(/^[0-9a-f]{64}$/)
  recoveryCredential: string;

  /**
   * 32-char lowercase hex string (16 random bytes) generated on the device.
   * Used by the client for PBKDF2 key derivation — public value, safe to store server-side.
   */
  @IsString()
  @Matches(/^[0-9a-f]{32}$/, {
    message: 'kdfSalt must be a 32-character lowercase hex string',
  })
  kdfSalt: string;

  @IsOptional()
  @IsEnum(UserRoleDto)
  role?: UserRoleDto;
}
