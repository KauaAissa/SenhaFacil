import 'reflect-metadata';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { UsersController } from '../src/users/users.controller';
import { UsersService } from '../src/users/users.service';
import { ContactsController } from '../src/contacts/contacts.controller';
import { ContactsService } from '../src/contacts/contacts.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SecurityService } from '../src/security/security.service';
import { NotificationsService } from '../src/notifications/notifications.service';

const databaseTests = process.env.INTEGRATION_TESTS === '1' ? describe : describe.skip;

databaseTests('email/mobile login over real HTTP and PostgreSQL', () => {
  let app: NestFastifyApplication;
  const prisma = new PrismaService();
  const ids: string[] = [];
  const credential = 'aa'.repeat(32);
  const recoveryCredential = 'bb'.repeat(32);
  const secret = 'phone-integration-only-secret';
  const phone = `+55119${String(randomInt(0, 100_000_000)).padStart(8, '0')}`;
  const caregiverPhone = `+55219${String(randomInt(0, 100_000_000)).padStart(8, '0')}`;
  const email = `${randomUUID()}@example.invalid`;
  const protection = () => ({
    salt: randomBytes(16).toString('hex'), recoverySalt: randomBytes(16).toString('hex'),
    passwordEnvelope: { iv: randomBytes(12).toString('base64'), ciphertext: randomBytes(80).toString('base64') },
    recoveryEnvelope: { iv: randomBytes(12).toString('base64'), ciphertext: randomBytes(80).toString('base64') },
  });
  interface Session { accessToken: string; user: {
    id: string; email: string | null; loginPhone: string | null; kdfSalt: string; securityVersion: number;
  } }
  let owner: Session;
  let phoneHelper: Session;
  let emailHelper: Session;
  async function register(identity: { identifier: string } | { email: string }, role: 'ELDERLY' | 'CAREGIVER'): Promise<Session> {
    const prepared = protection();
    const response = await app.inject({ method: 'POST', url: '/auth/register', payload: {
      ...identity, name: 'Phone integration fixture', role, password: credential, recoveryCredential,
      authVersion: 2, kdfSalt: prepared.salt, protection: prepared,
    } });
    expect(response.statusCode).toBe(201);
    const session: Session = response.json();
    ids.push(session.user.id);
    return session;
  }
  const authorization = (session: Session) => ({ authorization: `Bearer ${session.accessToken}` });

  beforeAll(async () => {
    jest.replaceProperty(process, 'env', { ...process.env, JWT_SECRET: secret });
    const module = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.register({ secret })],
      controllers: [AuthController, UsersController, ContactsController],
      providers: [AuthService, UsersService, ContactsService, JwtStrategy, JwtAuthGuard,
        { provide: SecurityService, useValue: new SecurityService(prisma, { sendSecurityAlert: jest.fn(async () => 'UNAVAILABLE') } as unknown as NotificationsService, new ConfigService()) },
        { provide: PrismaService, useValue: prisma }, { provide: ConfigService, useValue: new ConfigService() }],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }));
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init(); await app.getHttpAdapter().getInstance().ready();
    owner = await register({ identifier: phone.slice(3) }, 'ELDERLY');
    phoneHelper = await register({ identifier: caregiverPhone }, 'CAREGIVER');
    emailHelper = await register({ email }, 'CAREGIVER');
  }, 45_000);
  afterAll(async () => {
    try { await prisma.user.deleteMany({ where: { id: { in: ids } } }); }
    finally { if (app) await app.close(); else await prisma.$disconnect(); jest.restoreAllMocks(); }
  });

  test('phone-only accounts have a canonical immutable login without fabricated email', async () => {
    expect(owner.user).toMatchObject({ email: null, loginPhone: phone });
    const profile = await app.inject({ method: 'GET', url: '/users/me', headers: authorization(owner) });
    expect(profile.statusCode).toBe(200);
    expect(profile.json()).toMatchObject({ id: owner.user.id, email: null, loginPhone: phone, phone: null });
    const update = await app.inject({ method: 'PATCH', url: '/users/me', headers: authorization(owner), payload: { phone: '+5511912345678' } });
    expect(update.statusCode).toBe(200);
    expect(update.json()).toMatchObject({ loginPhone: phone, phone: '+5511912345678' });
    expect((await app.inject({ method: 'PATCH', url: '/users/me', headers: authorization(owner), payload: { loginPhone: caregiverPhone } })).statusCode).toBe(400);
  });

  test('parameters and login normalize the same phone; duplicate variants are rejected', async () => {
    const national = phone.slice(3);
    const formatted = `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
    const parameters = await app.inject({ method: 'POST', url: '/auth/parameters', payload: { identifier: formatted } });
    expect(parameters.statusCode).toBe(200);
    expect(parameters.json()).toMatchObject({ kdfSalt: owner.user.kdfSalt, authVersion: 2 });
    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: formatted, password: credential, authVersion: 2 } });
    expect(login.statusCode).toBe(200);
    expect(login.json().user.id).toBe(owner.user.id);
    expect((await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: formatted, password: 'wrong-password', authVersion: 2 } })).statusCode).toBe(401);
    const prepared = protection();
    const duplicate = await app.inject({ method: 'POST', url: '/auth/register', payload: {
      identifier: formatted, name: 'Duplicate fixture', password: credential, recoveryCredential,
      authVersion: 2, kdfSalt: prepared.salt, protection: prepared,
    } });
    expect(duplicate.statusCode).toBe(409);
  });

  test('legacy email clients remain compatible, but optional contact phone is not a second login', async () => {
    expect(emailHelper.user).toMatchObject({ email, loginPhone: null });
    expect((await app.inject({ method: 'POST', url: '/auth/login', payload: { email: email.toUpperCase(), password: credential, authVersion: 2 } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: '+5511912345678', password: credential, authVersion: 2 } })).statusCode).toBe(401);
    for (const identity of [{}, { identifier: 'familiar@teste' }, { identifier: '(20) 91234-5678' }, { email, identifier: phone }]) {
      expect((await app.inject({ method: 'POST', url: '/auth/parameters', payload: identity })).statusCode).toBe(400);
    }
  });

  test('invitations, acceptance and contact lists work for phone and email caregivers', async () => {
    const phoneInvite = await app.inject({ method: 'POST', url: '/contacts/invite', headers: authorization(owner),
      payload: { caregiverIdentifier: caregiverPhone.slice(3) } });
    expect(phoneInvite.statusCode).toBe(201);
    expect(phoneInvite.json().caregiver).toMatchObject({ id: phoneHelper.user.id, email: null, loginPhone: caregiverPhone });
    const emailInvite = await app.inject({ method: 'POST', url: '/contacts/invite', headers: authorization(owner),
      payload: { caregiverEmail: email } });
    expect(emailInvite.statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url: `/contacts/${phoneInvite.json().id}/accept`, headers: authorization(phoneHelper), payload: {} })).statusCode).toBe(200);
    const list = await app.inject({ method: 'GET', url: '/contacts', headers: authorization(phoneHelper) });
    expect(list.statusCode).toBe(200);
    expect(list.json()[0].elderly).toMatchObject({ id: owner.user.id, loginPhone: phone, email: null });
  });

  test('phone recovery rotates credentials, invalidates the old kit and revokes sessions', async () => {
    expect((await app.inject({ method: 'POST', url: '/auth/recovery-info', payload: { identifier: phone, recoveryCredential } })).statusCode).toBe(200);
    const recovered = await app.inject({ method: 'POST', url: '/auth/recover', payload: { identifier: phone.slice(3),
      recoveryCredential, credential: 'cc'.repeat(32), newRecoveryCredential: 'dd'.repeat(32),
      securityVersion: 1, protection: protection() } });
    expect(recovered.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/users/me', headers: authorization(owner) })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/auth/recovery-info', payload: { identifier: phone, recoveryCredential } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: phone, password: credential, authVersion: 2 } })).statusCode).toBe(401);
    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: phone, password: 'cc'.repeat(32), authVersion: 2 } });
    expect(login.statusCode).toBe(200);
    expect(login.json().user).toMatchObject({ id: owner.user.id, loginPhone: phone, securityVersion: 2 });
  }, 30_000);
});
