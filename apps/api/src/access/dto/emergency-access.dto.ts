import { IsISO8601, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class EmergencyAccessDto {
  @IsUUID()
  eventId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  vaultItemId: string;

  @IsISO8601()
  occurredAt: string;
}