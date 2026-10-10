import { IsString, MinLength, MaxLength, ValidateIf } from 'class-validator';

export class UpdateFcmTokenDto {
  /** Token FCM atual do dispositivo, obtido via expo-notifications. */
  @IsString()
  @ValidateIf((_object, value) => value !== null)
  @MinLength(10)
  @MaxLength(4096)
  fcmToken: string | null;
}
