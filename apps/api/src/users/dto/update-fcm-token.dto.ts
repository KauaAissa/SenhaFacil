import { IsString, MinLength } from 'class-validator';

export class UpdateFcmTokenDto {
  /** Token FCM atual do dispositivo, obtido via expo-notifications. */
  @IsString()
  @MinLength(10)
  fcmToken: string;
}
