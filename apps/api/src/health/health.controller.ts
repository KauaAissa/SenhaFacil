import { Controller, Get, Header, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  @Header('Cache-Control', 'no-store')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async ready(): Promise<{ status: 'ok' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) &&
        !(error instanceof Prisma.PrismaClientInitializationError) &&
        !(error instanceof Prisma.PrismaClientUnknownRequestError) &&
        !(error instanceof Prisma.PrismaClientRustPanicError)
      ) {
        throw error;
      }
      this.logger.error('Database readiness probe failed.');
      throw new ServiceUnavailableException('Database unavailable');
    }
    return { status: 'ok' };
  }
}
