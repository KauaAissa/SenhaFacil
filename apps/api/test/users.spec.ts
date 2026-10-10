import { validate } from 'class-validator';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsersService } from '../src/users/users.service';
import { UpdateProfileDto } from '../src/users/dto/update-profile.dto';
import { UpdateFcmTokenDto } from '../src/users/dto/update-fcm-token.dto';

jest.mock('argon2', () => ({ verify: jest.fn(async (_hash: string, password: string) => password === 'correct') }));

function setup() {
  const prisma = { user: {
    findUnique: jest.fn().mockResolvedValue({ id: 'owner', passwordHash: 'hash' }),
    update: jest.fn(), delete: jest.fn(), updateMany: jest.fn(),
  }, authSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, serializable: jest.fn() };
  prisma.serializable.mockImplementation(async (operation) => operation(prisma));
  return { prisma, service: new UsersService(prisma as unknown as PrismaService) };
}

test('profile update is restricted to current user and trims names', async () => {
  const { prisma, service } = setup();
  await service.updateProfile('owner', { name: ' Ana ', surname: ' Silva ', phone: null });
  expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'owner' }, data: { name: 'Ana', surname: 'Silva', phone: null } });
});

test('invalid birth date and blank names do not mutate profile', async () => {
  const { prisma, service } = setup();
  await expect(service.updateProfile('owner', { name: '   ' })).rejects.toThrow();
  await expect(service.updateProfile('owner', { dateOfBirth: '2999-01-01' })).rejects.toThrow();
  expect(prisma.user.update).not.toHaveBeenCalled();
});

test('deletion requires correct password and deletes only the authenticated account', async () => {
  const { prisma, service } = setup();
  await expect(service.deleteAccount('owner', 'wrong')).rejects.toThrow('Senha incorreta');
  expect(prisma.user.delete).not.toHaveBeenCalled();
  await service.deleteAccount('owner', 'correct');
  expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'owner' } });
});

test('same device push token is detached from another account transactionally', async () => {
  const { prisma, service } = setup();
  await service.updateFcmToken('owner', 'session', 'device-token');
  expect(prisma.authSession.updateMany).toHaveBeenCalledWith({ where: { fcmToken: 'device-token', id: { not: 'session' } }, data: { fcmToken: null } });
  expect(prisma.authSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ userId: 'owner', id: 'session', revokedAt: null }),
  }));
});

test('nullable birth and phone are allowed but null names and missing push tokens are rejected', async () => {
  expect(await validate(Object.assign(new UpdateProfileDto(), { dateOfBirth: null, phone: null }))).toHaveLength(0);
  expect(await validate(Object.assign(new UpdateProfileDto(), { name: null }))).not.toHaveLength(0);
  expect(await validate(new UpdateFcmTokenDto())).not.toHaveLength(0);
  expect(await validate(Object.assign(new UpdateFcmTokenDto(), { fcmToken: null }))).toHaveLength(0);
});