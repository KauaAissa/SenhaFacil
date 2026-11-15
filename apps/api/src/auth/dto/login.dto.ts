import { IsString, MaxLength, MinLength, IsIn, IsOptional, IsUUID } from 'class-validator';
import { LoginIdentifierDto } from '../login-identifier';

export class LoginDto extends LoginIdentifierDto {
  @IsOptional()
  @IsUUID()
  installationId?: string;

  @IsOptional()
  @IsIn(['ANDROID', 'IOS', 'WEB'])
  devicePlatform?: string;
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsOptional()
  @IsIn([1, 2])
  authVersion?: number;
}
