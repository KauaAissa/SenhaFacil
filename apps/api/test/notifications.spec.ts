import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/notifications/notifications.service';

function setup() {
  const prisma = { authSession: {
    findMany: jest.fn().mockResolvedValue([{ id: 'first', fcmToken: 'one' }, { id: 'second', fcmToken: 'two' }]),
    updateMany: jest.fn(),
  } };
  const service = new NotificationsService({ get: () => undefined } as unknown as ConfigService, prisma as unknown as PrismaService);
  const messaging = { send: jest.fn().mockResolvedValue('message-id') };
  Object.assign(service, { messaging });
  return { service, prisma, messaging };
}

test('notifies all current sessions without profile or vault labels in lock screen text', async () => {
  const { service, prisma, messaging } = setup();
  await service.sendAccessRequest({ userId: 'owner', accessLogId: 'request' });
  expect(messaging.send).toHaveBeenCalledTimes(2);
  expect(prisma.authSession.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ userId: 'owner', revokedAt: null, user: { isActive: true } }),
  }));
  expect(messaging.send.mock.calls[0][0]).toEqual(expect.objectContaining({
    notification: { title: 'Pedido de acesso', body: 'Ha uma solicitacao aguardando sua resposta.' },
    data: { type: 'ACCESS_REQUEST', accessLogId: 'request' },
  }));
});

test('invalid token cleanup cannot erase a concurrently refreshed token', async () => {
  const { service, prisma, messaging } = setup();
  messaging.send.mockRejectedValueOnce({ code: 'messaging/registration-token-not-registered' });
  await service.sendAccessResolved({ userId: 'owner', accessLogId: 'request', status: 'APPROVED' });
  expect(prisma.authSession.updateMany).toHaveBeenCalledWith({ where: { id: 'first', fcmToken: 'one' }, data: { fcmToken: null } });
  expect(messaging.send).toHaveBeenCalledTimes(2);
});

test('push lookup failure never changes the access operation outcome', async () => {
  const { service, prisma } = setup();
  prisma.authSession.findMany.mockRejectedValue(new Error('offline'));
  await expect(service.sendAccessRequest({ userId: 'owner', accessLogId: 'request' })).resolves.toBeUndefined();
});