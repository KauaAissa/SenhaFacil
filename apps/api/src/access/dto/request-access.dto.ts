import { IsOptional, IsString, MaxLength } from 'class-validator';

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
}
