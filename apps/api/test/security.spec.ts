import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SecurityUpdateDto } from '../src/auth/dto/vault-protection.dto';

jest.mock('argon2', () => ({ argon2id: 2, verify: jest.fn(async (_hash: string, value: string) => value === 'current-password'), hash: jest.fn(async (value: string) => `hashed:${value}`) }));
const protection = { salt: '01'.repeat(16), recoverySalt: '02'.repeat(16),
  passwordEnvelope: { ciphertext: 'A'.repeat(100), iv: 'A'.repeat(16) }, recoveryEnvelope: { ciphertext: 'B'.repeat(100), iv: 'B'.repeat(16) } };

function setup() {
  const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'owner', isActive: true, passwordHash: 'old-hash', authVersion: 1 }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, authSession: { updateMany: jest.fn() }, serializable: jest.fn() };
  prisma.serializable.mockImplementation(async (operation) => operation(prisma));
  return { prisma, service: new AuthService(prisma as unknown as PrismaService, {} as JwtService) };
}

const update = { currentCredential: 'current-password', credential: 'aa'.repeat(32), recoveryCredential: 'bb'.repeat(32), securityVersion: 0, protection };

test('legacy migration stores only encrypted protection and hashes, revoking previous sessions', async () => {
  const { service, prisma } = setup();
  await service.updateSecurity('owner', update);
  expect(prisma.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'owner', securityVersion: 0, passwordHash: 'old-hash' }),
    data: expect.objectContaining({ authVersion: 2, passwordHash: `hashed:${update.credential}`, recoveryHash: `hashed:${update.recoveryCredential}`, vaultProtection: protection }) }));
  expect(prisma.authSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'owner', revokedAt: null } }));
});

test('wrong credential and concurrent version loss cannot change security or revoke sessions', async () => {
  const { service, prisma } = setup();
  await expect(service.updateSecurity('owner', { ...update, currentCredential: 'wrong' })).rejects.toThrow();
  expect(prisma.user.updateMany).not.toHaveBeenCalled();
  prisma.user.updateMany.mockResolvedValue({ count: 0 });
  await expect(service.updateSecurity('owner', update)).rejects.toThrow('outro aparelho');
  expect(prisma.authSession.updateMany).not.toHaveBeenCalled();
});

test('nested malformed IVs are rejected by the HTTP DTO contract', async () => {
  const errors = await validate(plainToInstance(SecurityUpdateDto, { ...update,
    protection: { ...protection, passwordEnvelope: { ...protection.passwordEnvelope, iv: 'bad' } } }));
  expect(errors).not.toHaveLength(0);
});

test('password changes cannot silently replace the recovery envelope without a matching credential', async () => {
  const { service, prisma } = setup();
  prisma.user.findUnique.mockResolvedValue({ id: 'owner', isActive: true, passwordHash: 'old-hash', authVersion: 2,
    vaultProtection: protection } as never);
  await expect(service.updateSecurity('owner', { ...update, recoveryCredential: undefined,
    protection: { ...protection, recoverySalt: '03'.repeat(16) } })).rejects.toThrow('nova credencial');
  expect(prisma.user.updateMany).not.toHaveBeenCalled();
});