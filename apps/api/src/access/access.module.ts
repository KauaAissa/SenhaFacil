import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AccessController } from './access.controller';
import { AccessService } from './access.service';
import { AccessGateway } from './access.gateway';
import { AccessExpiryService } from './access-expiry.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    NotificationsModule,
    // JwtModule is needed by AccessGateway to verify tokens during WS handshake
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [AccessController],
  providers: [
    AccessService,
    AccessGateway,
    AccessExpiryService,
  ],
})
export class AccessModule {}
