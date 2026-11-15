import { parseAccessNotification } from '../src/services/access-api.service';
test('push routing accepts database CUIDs and rejects path injection or unknown messages', () => {
  expect(parseAccessNotification({ type: 'ACCESS_REQUEST', accessLogId: 'cm123456789012345678901234' })).not.toBeNull();
  expect(parseAccessNotification({ type: 'ACCESS_RESOLVED', accessLogId: '../users/me' })).toBeNull();
  expect(parseAccessNotification({ type: 'UNLOCK', accessLogId: 'cm123' })).toBeNull();
});
import { ApiClient, ApiError } from '../src/services/api.client';
import * as SecureStore from 'expo-secure-store';

const token = (expiry: number) => `header.${Buffer.from(JSON.stringify({ exp: expiry })).toString('base64url')}.signature`;
let client: ApiClient;

beforeEach(async () => { client = new ApiClient(); await client.clearToken(); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test('screen cancellation aborts only its AI request and never accepts a late response', async () => {
  const controller = new AbortController();
  let release!: (response: Response) => void;
  let started!: () => void;
  const began = new Promise<void>((resolve) => { started = resolve; });
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    started(); return new Promise<Response>((resolve) => { release = resolve; });
  });
  const pending = client.post('/ai/password/suggestion', { usage: 'TYPE' }, controller.signal);
  await began;
  const signal = fetchMock.mock.calls[0][1]?.signal;
  controller.abort();
  expect(signal?.aborted).toBe(true);
  release(new Response('{}'));
  await expect(pending).rejects.toThrow('SESSION_CHANGED');
  fetchMock.mockResolvedValueOnce(new Response('{}'));
  expect(await client.get('/users/me')).toEqual({});
});

test('an already cancelled screen never starts an HTTP request', async () => {
  const controller = new AbortController(); controller.abort();
  const fetchMock = jest.spyOn(globalThis, 'fetch');
  await expect(client.get('/ai/password/status', controller.signal)).rejects.toThrow('SESSION_CHANGED');
  expect(fetchMock).not.toHaveBeenCalled();
});

test.each([387_000, -387_000])('access deadlines use API time when the device clock differs by %i ms', async (skew) => {
  const serverTime = Date.parse('2026-10-17T15:00:00Z');
  const deadline = serverTime + 120_000;
  jest.useFakeTimers({ now: serverTime + skew });
  jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true,
    headers: new Headers({ Date: new Date(serverTime).toUTCString() }),
    json: async () => ({ expiresAt: new Date(deadline).toISOString() }) } as Response);

  const request = await client.post<{ expiresAt: string }>('/access/request', { vaultItemId: 'protected' });
  expect(Date.parse(request.expiresAt) - client.getServerTime()).toBe(119_000);
  jest.setSystemTime(serverTime + 3_600_000);
  expect(client.getServerTime()).toBe(serverTime + 1_000);
  jest.setSystemTime(serverTime - 3_600_000);
  jest.advanceTimersByTime(119_000);
  expect(client.getServerTime()).toBe(deadline);
});

test.each([null, 'invalid-date'])('an unusable API Date header (%s) preserves the last synchronized clock', async (header) => {
  const serverTime = Date.parse('2026-10-17T15:00:00Z');
  jest.useFakeTimers({ now: serverTime + 387_000 });
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true,
    headers: { get: () => header }, json: async () => ({}) } as unknown as Response);
  await client.get('/access/history');
  expect(client.getServerTime()).toBe(Date.now());
  fetchMock.mockResolvedValueOnce({ ok: true,
    headers: new Headers({ Date: new Date(serverTime).toUTCString() }), json: async () => ({}) } as Response);
  await client.get('/access/history');
  jest.advanceTimersByTime(10_000);
  await client.get('/access/history');
  expect(client.getServerTime()).toBe(serverTime + 11_000);
});

test('server time accounts conservatively for HTTP precision and response transit time', async () => {
  const serverTime = Date.parse('2026-10-17T15:00:00Z');
  jest.useFakeTimers({ now: serverTime + 387_000 });
  jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    jest.advanceTimersByTime(1_500);
    return { ok: true, headers: new Headers({ Date: new Date(serverTime).toUTCString() }),
      json: async () => ({}) } as Response;
  });
  await client.get('/access/history');
  expect(client.getServerTime()).toBe(serverTime + 2_500);
});

test('token validation uses synchronized API time rather than refreshing for a fast device clock', async () => {
  const serverTime = Date.parse('2026-10-17T15:00:00Z');
  jest.useFakeTimers({ now: serverTime + 3_600_000 });
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true,
    headers: new Headers({ Date: new Date(serverTime).toUTCString() }), json: async () => ({}) } as Response);
  await client.post('/auth/login', {});
  const current = token(serverTime / 1_000 + 300);
  await client.setToken(current, 'refresh');
  fetchMock.mockClear();
  expect(await client.getToken()).toBe(current);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('a refresh response also synchronizes API time', async () => {
  const serverTime = Date.parse('2026-10-17T15:00:00Z');
  jest.useFakeTimers({ now: serverTime - 387_000 });
  await client.setToken(token(0), 'refresh');
  const renewed = token(serverTime / 1_000 + 3_600);
  jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true,
    headers: new Headers({ Date: new Date(serverTime).toUTCString() }),
    json: async () => ({ accessToken: renewed, refreshToken: 'renewed-refresh' }) } as Response);
  expect(await client.getToken()).toBe(renewed);
  expect(client.getServerTime()).toBe(serverTime + 1_000);
});

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
  await expect(client.getToken()).rejects.toMatchObject({ status: 401 });
  expect(await client.hasToken()).toBe(false);
});

test('HTTP failures preserve their status for control flow but expose only translated messages', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 400,
    text: async () => JSON.stringify({ message: ['email must be an email'], statusCode: 400 }) } as Response);
  const failure = await client.post('/auth/register', {}).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(ApiError);
  expect(failure).toMatchObject({ status: 400, message: 'Informe um e-mail completo, como nome@exemplo.com.' });
  expect(String(failure)).not.toMatch(/HTTP|statusCode|must be an email/);
});

test('HTTP timeout tells the user to check their connection', async () => {
  jest.useFakeTimers();
  jest.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  }));
  const attempt = client.post('/auth/login', {});
  const expectation = expect(attempt).rejects.toThrow('A resposta demorou demais');
  await jest.advanceTimersByTimeAsync(15_000);
  await expectation;
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