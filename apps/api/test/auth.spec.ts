import { createHash } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

function createService() {
  const prisma = {
    authSession: {
      findUnique: jest.fn().mockResolvedValue({ id: 'session', userId: 'owner', revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000), user: { email: 'owner@example.com', role: 'ELDERLY', isActive: true } }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn(),
    }, accessLog: { deleteMany: jest.fn() }, serializable: jest.fn(),
  };
  prisma.serializable.mockImplementation(async (operation) => operation(prisma));
  const jwt = { sign: jest.fn().mockReturnValue('access-token') };
  return { prisma, jwt, service: new AuthService(prisma as unknown as PrismaService, jwt as unknown as JwtService) };
}

test('refresh rotates a random token and stores only its SHA-256 hash', async () => {
  const { service, prisma, jwt } = createService();
  const refreshed = await service.refresh('previous');
  expect(refreshed.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(prisma.authSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    data: { refreshHash: createHash('sha256').update(refreshed.refreshToken).digest('hex') },
  }));
  expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ sid: 'session', sub: 'owner' }));
});

test('concurrent loser cannot rotate a token already consumed', async () => {
  const { service, prisma, jwt } = createService();
  prisma.authSession.updateMany.mockResolvedValue({ count: 0 });
  await expect(service.refresh('used-token')).rejects.toThrow('ja utilizado');
  expect(jwt.sign).not.toHaveBeenCalled();
});

test('revoked session cannot refresh', async () => {
  const { service, prisma } = createService();
  prisma.authSession.findUnique.mockResolvedValue({ revokedAt: new Date() } as never);
  await expect(service.refresh('revoked')).rejects.toThrow('expirada');
  expect(prisma.authSession.updateMany).not.toHaveBeenCalled();
});

test('logout revokes the session identified by the refresh hash', async () => {
  const { service, prisma } = createService();
  await service.logout('token');
  expect(prisma.authSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { refreshHash: createHash('sha256').update('token').digest('hex'), revokedAt: null },
  }));
});

test('retention cleans expired sessions and old resolved audit without deleting pending requests', async () => {
  const { service, prisma } = createService();
  await service.cleanExpiredData();
  expect(prisma.authSession.deleteMany).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: expect.any(Array) } }));
  expect(prisma.accessLog.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ status: { not: 'PENDING' }, requestedAt: { lt: expect.any(Date) } }),
  }));
});