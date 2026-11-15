import { accessApiService, hasHistoryLocation, type AccessStatus } from '../src/services/access-api.service';
import { apiClient } from '../src/services/api.client';

const now = Date.now();
const deadline = new Date(now + 30 * 24 * 60 * 60_000).toISOString();
const result = { location: { latitude: 0, longitude: 0, accuracy: 80, capturedAt: new Date(now).toISOString() }, historyExpiresAt: deadline };

afterEach(() => jest.restoreAllMocks());

test.each(['APPROVED', 'DENIED'] as const)('%s has a map only before its exact retention deadline', (status) => {
  const entry = { status, locationHistoryExpiresAt: deadline };
  expect(hasHistoryLocation(entry, now)).toBe(true);
  expect(hasHistoryLocation(entry, Date.parse(deadline) - 1)).toBe(true);
  expect(hasHistoryLocation(entry, Date.parse(deadline))).toBe(false);
});

test.each(['PENDING', 'CANCELLED', 'EXPIRED', 'FALLBACK_GRANTED'] as AccessStatus[])('%s never advertises historical coordinates', (status) => {
  expect(hasHistoryLocation({ status, locationHistoryExpiresAt: deadline }, now)).toBe(false);
});

test.each([undefined, null, 'invalid', new Date(now - 1).toISOString()])('missing or expired location cannot be opened (%s)', (locationHistoryExpiresAt) => {
  expect(hasHistoryLocation({ status: 'APPROVED', locationHistoryExpiresAt }, now)).toBe(false);
});

test('history location is fetched only on demand with an individual cancellation signal', async () => {
  const get = jest.spyOn(apiClient, 'get').mockResolvedValue(result);
  const controller = new AbortController();
  expect(await accessApiService.historyLocation('request_1', controller.signal)).toEqual(result);
  expect(get).toHaveBeenCalledWith('/access/history/request_1/location', controller.signal);
});

test.each([
  { ...result, historyExpiresAt: 'invalid' },
  { ...result, location: { ...result.location, latitude: 91 } },
  { ...result, location: { ...result.location, accuracy: -1 } },
  { ...result, location: { ...result.location, address: 'unnecessary' } },
  { ...result, personalData: 'unnecessary' },
  { location: null, historyExpiresAt: deadline },
])('invalid or overbroad historical payload is refused (%j)', async (payload) => {
  jest.spyOn(apiClient, 'get').mockResolvedValue(payload);
  await expect(accessApiService.historyLocation('request_1')).rejects.toThrow('Não foi possível validar');
});
