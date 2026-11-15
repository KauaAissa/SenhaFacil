import { Type } from 'class-transformer';
import { IsBoolean, IsISO8601, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class AccessLocationDto {
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  accuracy: number;

  @IsISO8601({ strict: true, strictSeparator: true })
  capturedAt: string;
}

export class RequestAccessDto {
  /** ID do VaultItem sensível ao qual o idoso quer acessar. */
  @IsString()
  vaultItemId: string;

  /**
   * Metadados de auditoria opcionais — JSON serializado pelo cliente.
   * Exemplo: '{"os":"iOS 17","appVersion":"1.0.0","ipHash":"sha256:abc..."}'
   * O hash do IP é gerado no servidor; qualquer hash fornecido pelo cliente é ignorado.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  deviceInfo?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AccessLocationDto)
  location?: AccessLocationDto;

  @IsOptional()
  @IsBoolean()
  retainLocationInHistory?: boolean;
}
