import { IsEmail, IsOptional, IsString, MaxLength, Validate, ValidateIf } from 'class-validator';
import { LoginIdentifierValidator } from '../../auth/login-identifier';

export class InviteContactDto {
  /** Legacy email contract; new clients can use caregiverIdentifier instead. */
  @IsOptional()
  @IsEmail()
  caregiverEmail?: string;

  @ValidateIf((object: InviteContactDto, value: unknown) => value !== undefined || !object.caregiverEmail)
  @IsString()
  @MaxLength(254)
  @Validate(LoginIdentifierValidator)
  caregiverIdentifier?: string;
}
