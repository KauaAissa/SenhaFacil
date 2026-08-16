import { IsEmail } from 'class-validator';

export class InviteContactDto {
  /** Email of the caregiver being invited. The caregiver must already have an account. */
  @IsEmail()
  caregiverEmail: string;
}
