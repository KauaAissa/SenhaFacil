import { parseAccessNotification } from '../src/services/access-api.service';
test('push routing accepts database CUIDs and rejects path injection or unknown messages', () => {
  expect(parseAccessNotification({ type: 'ACCESS_REQUEST', accessLogId: 'cm123456789012345678901234' })).not.toBeNull();
  expect(parseAccessNotification({ type: 'ACCESS_RESOLVED', accessLogId: '../users/me' })).toBeNull();
  expect(parseAccessNotification({ type: 'UNLOCK', accessLogId: 'cm123' })).toBeNull();
});
import { ApiClient } from '../src/services/api.client';
import * as SecureStore from 'expo-secure-store';

const token = (expiry: number) => `header.${Buffer.from(JSON.stringify({ exp: expiry })).toString('base64url')}.signature`;
let client: ApiClient;

beforeEach(async () => { client = new ApiClient(); await client.clearToken(); });
afterEach(() => jest.restoreAllMocks());

test('concurrent expired-token calls share one refresh and use the rotated token', async () => {
  await client.setToken(token(0), 'refresh-old');
  const renewed = token(Math.floor(Date.now() / 1000) + 3600);
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true,
    json: async () => ({ accessToken: renewed, refreshToken: 'refresh-new' }) } as Response);
  expect(await Promise.all([client.getToken(), client.getToken()])).toEqual([renewed, renewed]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(await client.getToken()).toBe(renewed);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('logout during an in-flight HTTP response prevents the response from reaching its caller', async () => {
  await client.setToken(token(Math.floor(Date.now() / 1000) + 3600), 'refresh');
  let finish!: (value: Response) => void;
  let started!: () => void;
  const began = new Promise<void>((resolve) => { started = resolve; });
  jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
    started(); return new Promise<Response>((resolve) => { finish = resolve; });
  });
  const request = client.get('/users/me');
  const rejected = expect(request).rejects.toThrow('SESSION_CHANGED');
  await began;
  await client.clearToken();
  finish({ ok: true, json: async () => ({ id: 'previous-account' }) } as Response);
  await rejected;
  expect(await client.getToken()).toBeNull();
});

test('refresh failure removes only the online tokens', async () => {
  await client.setToken(token(0), 'revoked-refresh');
  jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 401, text: async () => 'revoked' } as Response);
  await expect(client.getToken()).rejects.toThrow('401');
  expect(await client.hasToken()).toBe(false);
});

test('a lost refresh response persists its operation id for retry after restarting the client', async () => {
  await client.setToken(token(0), 'refresh-old');
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network lost'));
  await expect(client.getToken()).rejects.toThrow('network lost');
  const stored = JSON.parse((await SecureStore.getItemAsync('sf_session_tokens_v2'))!);
  expect(stored.refreshRequestId).toMatch(/^[a-f0-9-]{36}$/);
  const renewed = token(Math.floor(Date.now() / 1000) + 3600);
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ accessToken: renewed, refreshToken: 'refresh-new' }) } as Response);
  const replacement = new ApiClient();
  expect(await replacement.getToken()).toBe(renewed);
  const request = JSON.parse(fetchMock.mock.calls[1][1]!.body as string);
  expect(request.requestId).toBe(stored.refreshRequestId);
  expect(JSON.parse((await SecureStore.getItemAsync('sf_session_tokens_v2'))!).refreshRequestId).toBeUndefined();
});