import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { PrismaService } from '../src/prisma/prisma.service';
import { PasswordAiController } from '../src/password-ai/password-ai.controller';
import { PasswordAiService } from '../src/password-ai/password-ai.service';

let app: NestFastifyApplication;
const secret = 'fictitious-http-test-secret';
const jwt = new JwtService({ secret });
const prisma = {
  authSession: { findFirst: jest.fn<Promise<{ id: string } | null>, []>(async () => ({ id: 'fictitious-session' })) },
  user: { findUnique: jest.fn(async () => ({ id: 'owner', role: 'ELDERLY', isActive: true })) },
};
const authorization = `Bearer ${jwt.sign({ sub: 'owner', sid: 'fictitious-session' })}`;
const choices = { usage: 'TYPE', symbols: 'FORBIDDEN', maxLength: 32 };

beforeAll(async () => {
  jest.replaceProperty(process, 'env', { ...process.env, JWT_SECRET: secret, AI_PASSWORD_ENABLED: 'true',
    GEMINI_API_KEY: 'fictitious-key', GEMINI_PASSWORD_MODEL: 'gemini-3.5-flash-lite', AI_PASSWORD_DAILY_LIMIT: '200' });
  const module = await Test.createTestingModule({
    imports: [PassportModule.register({ defaultStrategy: 'jwt' }), ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }])],
    controllers: [PasswordAiController],
    providers: [PasswordAiService, JwtAuthGuard, JwtStrategy,
      { provide: APP_GUARD, useClass: ThrottlerGuard },
      { provide: ConfigService, useValue: new ConfigService({ JWT_SECRET: secret, AI_PASSWORD_ENABLED: 'true', GEMINI_API_KEY: 'fictitious-key' }) },
      { provide: PrismaService, useValue: prisma }],
  }).compile();
  app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }));
  await app.init(); await app.getHttpAdapter().getInstance().ready();
});
afterAll(async () => { await app?.close(); });
beforeEach(() => {
  jest.replaceProperty(process, 'env', { ...process.env, JWT_SECRET: secret });
  expect(jwt.verify(authorization.slice(7))).toMatchObject({ sub: 'owner', sid: 'fictitious-session' });
  expect(app.get(ConfigService).getOrThrow('JWT_SECRET')).toBe(secret);
  prisma.authSession.findFirst.mockClear();
  prisma.user.findUnique.mockClear();
  jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"length":20,"symbols":false,"reason":"EASIER_TO_TYPE"}' }] } }],
  })));
});
afterEach(() => jest.restoreAllMocks());

test('unauthenticated requests are denied before external usage', async () => {
  expect((await app.inject({ method: 'POST', url: '/ai/password/suggestion', payload: choices })).statusCode).toBe(401);
  expect((await app.inject({ method: 'GET', url: '/ai/password/status' })).statusCode).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});

test('caregiver and revoked sessions cannot use the password assistant', async () => {
  prisma.user.findUnique.mockResolvedValueOnce({ id: 'owner', role: 'CAREGIVER', isActive: true });
  expect((await app.inject({ method: 'POST', url: '/ai/password/suggestion', headers: { authorization }, payload: choices })).statusCode).toBe(403);
  prisma.authSession.findFirst.mockResolvedValueOnce(null);
  expect((await app.inject({ method: 'GET', url: '/ai/password/status', headers: { authorization } })).statusCode).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});

test('status is authenticated, no-store and does not call the model', async () => {
  const response = await app.inject({ method: 'GET', url: '/ai/password/status', headers: { authorization } });
  expect(prisma.authSession.findFirst).toHaveBeenCalled();
  expect(response.statusCode).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.json()).toEqual({ available: true, provider: 'GEMINI' });
  expect(fetch).not.toHaveBeenCalled();
});

test('HTTP boundary rejects personal fields and returns only a validated policy', async () => {
  const invalid = await app.inject({ method: 'POST', url: '/ai/password/suggestion', headers: { authorization },
    payload: { ...choices, password: 'do-not-send' } });
  expect(invalid.statusCode).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
  const valid = await app.inject({ method: 'POST', url: '/ai/password/suggestion', headers: { authorization }, payload: choices });
  expect(valid.statusCode).toBe(200);
  expect(valid.headers['cache-control']).toBe('no-store');
  expect(valid.json()).toEqual({ source: 'GEMINI', policy: { length: 20, symbols: false }, reason: 'EASIER_TO_TYPE' });
});

test('HTTP throttling rejects excess calls before contacting the provider', async () => {
  const responses = [];
  for (let i = 0; i < 6; i++) {
    responses.push(await app.inject({ method: 'POST', url: '/ai/password/suggestion', headers: { authorization }, payload: choices }));
  }
  expect(responses.some((response) => response.statusCode === 429)).toBe(true);
  expect(responses[5].statusCode).toBe(429);
  expect(jest.mocked(fetch).mock.calls.length).toBeLessThanOrEqual(5);
});
