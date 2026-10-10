import { IsDateString, IsOptional, IsPhoneNumber, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class UpdateProfileDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  surname?: string;

  @IsOptional()
  @IsPhoneNumber('BR')
  phone?: string | null;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  dateOfBirth?: string | null;
}

export class DeleteAccountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}