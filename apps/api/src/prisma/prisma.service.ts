import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Singleton Prisma client for the entire application.
 * Registered as @Global() so every module can inject it without re-importing PrismaModule.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async serializable<Result>(operation: (transaction: Prisma.TransactionClient) => Promise<Result>): Promise<Result> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (attempt < 2 && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') continue;
        throw error;
      }
    }
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
