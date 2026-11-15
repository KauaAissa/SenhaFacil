import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export const reportTypes = ['BULK_REVEAL', 'BULK_COPY', 'BULK_DELETE'] as const;
export type DeviceReportType = typeof reportTypes[number];
export type SecurityEventType = DeviceReportType | 'PASSWORD_CHANGED' | 'RECOVERY_KIT_REPLACED' | 'ACCOUNT_RECOVERED' |
  'NEW_DEVICE' | 'FAILED_LOGIN_BURST' | 'ACCESS_REQUEST_BURST' | 'EMERGENCY_BURST' | 'EMERGENCY_AFTER_DENIAL' | 'SESSIONS_REVOKED';

export class SecurityReportDto {
  @IsUUID()
  id: string;

  @IsIn(reportTypes)
  type: DeviceReportType;

  @IsISO8601({ strict: true, strictSeparator: true })
  occurredAt: string;

  @IsInt()
  @Min(1)
  @Max(100_000)
  count: number;
}

export class SecurityReportsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SecurityReportDto)
  reports: SecurityReportDto[];
}

export class RevokeSecuritySessionsDto {
  @IsIn(['ONE', 'OTHERS'])
  mode: 'ONE' | 'OTHERS';

  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  currentCredential: string;
}
