import { securityApiService } from '../src/services/security-api.service';
import { apiClient } from '../src/services/api.client';
import { parseAccessNotification } from '../src/services/access-api.service';
import { installationData } from '../src/services/installation.service';
import { installationId } from '../src/services/installation-id';

afterEach(() => jest.restoreAllMocks());

test('installation identity is stable and random, not a hardware or personal identifier', async () => {
  const first = await installationId();
  expect(first).toMatch(/^[0-9a-f-]{36}$/);
  expect(await installationId()).toBe(first);
  expect(await installationData()).toEqual({ installationId: first, devicePlatform: 'WEB' });
});

test('security push contains only an event reference and is rejected if malformed', () => {
  expect(parseAccessNotification({ type: 'SECURITY_EVENT', eventId: 'fixture_event' })).toEqual({ type: 'SECURITY_EVENT', eventId: 'fixture_event' });
  for (const eventId of [undefined, '../secret', 123, '']) expect(parseAccessNotification({ type: 'SECURITY_EVENT', eventId })).toBeNull();
});

test('security event contracts reject secret-bearing or unrecognized payloads explicitly', async () => {
  const event = { id: 'fixture_event', type: 'BULK_REVEAL', source: 'DEVICE_REPORT', severity: 'WARNING', count: 5,
    occurredAt: new Date().toISOString(), recordedAt: new Date().toISOString(), expiresAt: new Date().toISOString(), user: { id: 'owner', name: 'Fixture' } };
  const get = jest.spyOn(apiClient, 'get').mockResolvedValue({ items: [event], nextCursor: null });
  expect((await securityApiService.events()).items).toHaveLength(1);
  get.mockResolvedValue({ items: [{ ...event, password: 'must-not-return' }], nextCursor: null });
  await expect(securityApiService.events()).rejects.toThrow('validar os avisos');
  get.mockResolvedValue({ items: [{ ...event, type: 'unknown' }], nextCursor: null });
  await expect(securityApiService.events()).rejects.toThrow('validar os avisos');
});

test('session listings never accept refresh tokens or device hashes', async () => {
  const session = { id: 'fixture_session', createdAt: new Date().toISOString(), expiresAt: new Date().toISOString(), devicePlatform: 'ANDROID' };
  const get = jest.spyOn(apiClient, 'get').mockResolvedValue({ items: [session], total: 1, currentSessionId: session.id });
  expect((await securityApiService.sessions()).items).toHaveLength(1);
  get.mockResolvedValue({ items: [{ ...session, refreshHash: 'secret' }], total: 1, currentSessionId: session.id });
  await expect(securityApiService.sessions()).rejects.toThrow('validar a lista');
});
