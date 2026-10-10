import { Type } from 'class-transformer';
import { IsDefined, IsEmail, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class EnvelopeDto {
  @IsString()
  @Matches(/^[A-Za-z0-9+/]+={0,2}$/)
  @MinLength(24)
  @MaxLength(2048)
  ciphertext: string;

  @Matches(/^[A-Za-z0-9+/]{16}$/)
  iv: string;
}

export class VaultProtectionDto {
  @Matches(/^[0-9a-f]{32}$/)
  salt: string;

  @Matches(/^[0-9a-f]{32}$/)
  recoverySalt: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => EnvelopeDto)
  passwordEnvelope: EnvelopeDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => EnvelopeDto)
  recoveryEnvelope: EnvelopeDto;
}

export class AuthParametersDto {
  @IsEmail()
  email: string;
}

export class RecoveryProofDto extends AuthParametersDto {
  @Matches(/^[0-9a-f]{64}$/)
  recoveryCredential: string;
}

export class SecurityUpdateDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  currentCredential: string;

  @Matches(/^[0-9a-f]{64}$/)
  credential: string;

  @IsInt()
  @Min(0)
  securityVersion: number;

  @IsDefined()
  @ValidateNested()
  @Type(() => VaultProtectionDto)
  protection: VaultProtectionDto;

  @IsOptional()
  @Matches(/^[0-9a-f]{64}$/)
  recoveryCredential?: string;
}

export class RecoverAccountDto extends RecoveryProofDto {
  @Matches(/^[0-9a-f]{64}$/)
  credential: string;

  @IsInt()
  @Min(1)
  securityVersion: number;

  @IsDefined()
  @ValidateNested()
  @Type(() => VaultProtectionDto)
  protection: VaultProtectionDto;

  @Matches(/^[0-9a-f]{64}$/)
  newRecoveryCredential: string;
}