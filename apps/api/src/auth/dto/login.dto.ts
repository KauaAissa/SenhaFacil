import { IsEmail, IsString, MaxLength, MinLength, IsIn, IsOptional } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsOptional()
  @IsIn([1, 2])
  authVersion?: number;
}
