import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum AccessDecision {
  APPROVED = 'APPROVED',
  DENIED = 'DENIED',
}

export class RespondAccessDto {
  /** ID do AccessLog que o familiar está respondendo. */
  @IsString()
  accessLogId: string;

  @IsEnum(AccessDecision)
  decision: AccessDecision;

  /** Motivo opcional (exibido ao idoso para transparência). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
