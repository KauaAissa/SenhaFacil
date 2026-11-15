import { Global, Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SecurityController } from './security.controller';
import { SecurityService } from './security.service';

@Global()
@Module({
  imports: [NotificationsModule],
  providers: [SecurityService],
  controllers: [SecurityController],
  exports: [SecurityService],
})
export class SecurityModule {}
