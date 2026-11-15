import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AccessService } from './access.service';

/**
 * Background job that automatically expires PENDING access requests
 * whose expiresAt deadline has passed.
 *
 * Runs every minute via @Cron.
 * For each expired log it:
 *   1. Updates status → EXPIRED in the database
 *   2. Emits `access_resolved` (EXPIRED) to the elderly user's WebSocket room
 *   3. Sends an FCM push as fallback (in case the WS connection is closed)
 */
@Injectable()
export class AccessExpiryService implements OnModuleInit {
  private readonly logger = new Logger(AccessExpiryService.name);

  constructor(private readonly accessService: AccessService) {}

  async onModuleInit(): Promise<void> {
    await this.handleExpiry();
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiry(): Promise<void> {
    const count = await this.accessService.expirePendingLogs();
    if (count > 0) {
      this.logger.log(`Auto-expired ${count} pending access request(s)`);
    }
  }
}
