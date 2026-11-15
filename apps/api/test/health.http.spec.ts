import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { HealthController } from '../src/health/health.controller';
import { PrismaService } from '../src/prisma/prisma.service';

let app: NestFastifyApplication;
const prisma = { $queryRaw: jest.fn().mockResolvedValue([]) };

beforeAll(async () => {
  const module = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }])],
    controllers: [HealthController],
    providers: [
      { provide: PrismaService, useValue: prisma },
      { provide: APP_GUARD, useClass: ThrottlerGuard },
    ],
  }).compile();
  app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

beforeEach(() => {
  prisma.$queryRaw.mockReset().mockResolvedValue([]);
});

afterEach(() => jest.restoreAllMocks());
afterAll(async () => { await app?.close(); });

test('liveness is public, no-store and does not query the database', async () => {
  const response = await app.inject({ method: 'GET', url: '/health/live' });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ status: 'ok' });
  expect(response.headers['cache-control']).toBe('no-store');
  expect(prisma.$queryRaw).not.toHaveBeenCalled();
});

test('readiness confirms a database query before returning success', async () => {
  const response = await app.inject({ method: 'GET', url: '/health/ready' });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ status: 'ok' });
  expect(response.headers['cache-control']).toBe('no-store');
  expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
});

test('database failure returns 503 without exposing the underlying message', async () => {
  const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  prisma.$queryRaw.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError(
    'fictitious-private-database-details', { code: 'P1001', clientVersion: 'fixture' },
  ));
  const response = await app.inject({ method: 'GET', url: '/health/ready' });
  expect(response.statusCode).toBe(503);
  expect(response.json().message).toBe('Database unavailable');
  expect(response.body).not.toContain('fictitious-private');
  expect(response.headers['cache-control']).toBe('no-store');
  expect(logger).toHaveBeenCalledWith('Database readiness probe failed.');
});

test('unexpected failures remain errors, not successful health responses', async () => {
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  prisma.$queryRaw.mockRejectedValueOnce(new TypeError('fictitious-unexpected-error'));
  const response = await app.inject({ method: 'GET', url: '/health/ready' });
  expect(response.statusCode).toBe(500);
  expect(response.body).not.toContain('fictitious-unexpected');
});

test('public health routes retain the global request limit', async () => {
  const request = { method: 'GET' as const, url: '/health/live', remoteAddress: '198.51.100.30' };
  for (let index = 0; index < 60; index++) {
    expect((await app.inject(request)).statusCode).toBe(200);
  }
  expect((await app.inject(request)).statusCode).toBe(429);
});
