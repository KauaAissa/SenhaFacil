import { BadRequestException, HttpException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PasswordAiService } from '../src/password-ai/password-ai.service';
import { type PasswordPreferences } from '../src/password-ai/password-ai.contract';

const preferences: PasswordPreferences = { usage: 'TYPE', symbols: 'FORBIDDEN', maxLength: 32 };
const recommendation = { length: 20, symbols: false, reason: 'EASIER_TO_TYPE' };
const response = (value: unknown = recommendation, finishReason = 'STOP') => new Response(JSON.stringify({
  candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(value) }] } }],
}));
function service(options: Record<string, string | undefined> = {}) {
  jest.replaceProperty(process, 'env', { ...process.env,
    AI_PASSWORD_ENABLED: 'true', GEMINI_API_KEY: 'fictitious-api-key',
    GEMINI_PASSWORD_MODEL: 'gemini-3.5-flash-lite', AI_PASSWORD_DAILY_LIMIT: '200', ...options });
  return new PasswordAiService(new ConfigService());
}
let fetchMock: jest.SpyInstance<ReturnType<typeof fetch>, Parameters<typeof fetch>>;
beforeEach(() => {
  fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => response());
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

test('status and disabled configuration never contact Google or pretend a local rule was AI', async () => {
  jest.replaceProperty(process, 'env', { ...process.env, AI_PASSWORD_ENABLED: 'false' });
  const disabled = new PasswordAiService(new ConfigService());
  expect(disabled.status()).toEqual({ available: false, provider: 'GEMINI' });
  await expect(disabled.recommend('owner', preferences)).rejects.toThrow('AI_PASSWORD_NOT_CONFIGURED');
  expect(fetchMock).not.toHaveBeenCalled();
});

test.each([
  { AI_PASSWORD_ENABLED: 'yes' }, { GEMINI_API_KEY: '' }, { GEMINI_PASSWORD_MODEL: '../other?key=secret' },
  { AI_PASSWORD_DAILY_LIMIT: '0' }, { AI_PASSWORD_DAILY_LIMIT: '10001' }, { AI_PASSWORD_DAILY_LIMIT: '2.5' },
])('invalid active configuration fails explicitly at startup (%j)', (options) => {
  expect(() => service(options)).toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
});

test('only the three enum preferences reach Gemini; key is in a header, never the URL or response', async () => {
  const result = await service().recommend('private-owner-id', preferences);
  expect(result).toEqual({ source: 'GEMINI', policy: { length: 20, symbols: false }, reason: 'EASIER_TO_TYPE' });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
  expect(init?.headers).toEqual({ 'Content-Type': 'application/json', 'x-goog-api-key': 'fictitious-api-key' });
  expect(init?.redirect).toBe('error');
  const payload = JSON.parse(String(init?.body));
  expect(JSON.parse(payload.contents[0].parts[0].text)).toEqual(preferences);
  expect(payload.generationConfig).toMatchObject({ responseMimeType: 'application/json', maxOutputTokens: 512, candidateCount: 1 });
  expect(String(init?.body)).not.toContain('private-owner-id');
  expect(String(url)).not.toContain('fictitious-api-key');
  expect(JSON.stringify(result)).not.toContain('fictitious-api-key');
});

test.each([
  { ...preferences, password: 'never-send-this' }, { ...preferences, email: 'private@example.invalid' },
  { ...preferences, location: { latitude: 0, longitude: 0 } }, { ...preferences, vaultItemId: 'secret' },
  { ...preferences, usage: 'free text' }, { ...preferences, maxLength: '32' }, { ...preferences, maxLength: 12 },
  { ...preferences, symbols: true }, null,
])('rejects invalid/extra input before any external request (%j)', async (input) => {
  await expect(service().recommend('owner', input)).rejects.toBeInstanceOf(BadRequestException);
  expect(fetchMock).not.toHaveBeenCalled();
});

test.each([
  { ...recommendation, length: 12 }, { ...recommendation, length: 64 },
  { ...recommendation, symbols: true }, { ...recommendation, length: '20' },
  { ...recommendation, password: 'model-produced-password' }, { ...recommendation, explanation: 'raw text' },
  { ...recommendation, reason: 'LONGER_FOR_COPY' }, { ...recommendation, reason: 'SITE_LIMIT' },
])('rejects unsafe, incompatible or secret-producing model output (%j)', async (value) => {
  fetchMock.mockResolvedValueOnce(response(value));
  await expect(service().recommend('owner', preferences)).rejects.toThrow('AI_PASSWORD_INVALID_RESPONSE');
});

test('required symbols cannot be silently removed', async () => {
  await expect(service().recommend('owner', { ...preferences, symbols: 'REQUIRED' })).rejects.toThrow('AI_PASSWORD_INVALID_RESPONSE');
});

test.each(['MAX_TOKENS', 'SAFETY', 'RECITATION'])('a non-completed candidate (%s) never becomes a recommendation', async (reason) => {
  fetchMock.mockResolvedValueOnce(response(recommendation, reason));
  await expect(service().recommend('owner', preferences)).rejects.toThrow('AI_PASSWORD_INVALID_RESPONSE');
});

test.each([
  {}, { promptFeedback: { blockReason: 'SAFETY' } },
  { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(recommendation), thought: true }] } }] },
  { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{}' }, { text: '{}' }] } }] },
])('invalid or blocked provider envelopes fail explicitly (%j)', async (envelope) => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(envelope)));
  await expect(service().recommend('owner', preferences)).rejects.toThrow('AI_PASSWORD_INVALID_RESPONSE');
});

test('malformed JSON and oversized responses are rejected without logging their contents', async () => {
  fetchMock.mockResolvedValueOnce(new Response('private-provider-details'));
  await expect(service().recommend('owner', preferences)).rejects.toThrow('AI_PASSWORD_INVALID_RESPONSE');
  fetchMock.mockResolvedValueOnce(new Response('private-provider-details'.repeat(1_000)));
  await expect(service().recommend('owner', preferences)).rejects.toThrow('AI_PASSWORD_INVALID_RESPONSE');
  expect(JSON.stringify(jest.mocked(Logger.prototype.warn).mock.calls)).not.toContain('private-provider-details');
});

test.each([400, 403, 429, 500])('provider HTTP %s becomes an explicit service error, never leaked credentials/body', async (status) => {
  fetchMock.mockResolvedValueOnce(new Response('private-provider-details', { status }));
  await expect(service().recommend('owner', preferences)).rejects.toThrow(status === 429 ? 'AI_PASSWORD_PROVIDER_LIMIT' : 'AI_PASSWORD_UNAVAILABLE');
  expect(JSON.stringify(jest.mocked(Logger.prototype.warn).mock.calls)).not.toContain('private-provider-details');
});

test('transport failures do not expose raw error messages', async () => {
  fetchMock.mockRejectedValueOnce(new Error('private-transport-detail'));
  await expect(service().recommend('owner', preferences)).rejects.toThrow('AI_PASSWORD_UNAVAILABLE');
  expect(JSON.stringify(jest.mocked(Logger.prototype.warn).mock.calls)).not.toContain('private-transport-detail');
});

test('five calls per minute per account; no automatic retries', async () => {
  const ai = service();
  for (let i = 0; i < 5; i++) await ai.recommend('owner', preferences);
  await expect(ai.recommend('owner', preferences)).rejects.toThrow('AI_PASSWORD_RATE_LIMIT');
  expect(fetchMock).toHaveBeenCalledTimes(5);
  await ai.recommend('other-owner', preferences);
  expect(fetchMock).toHaveBeenCalledTimes(6);
});

test('per-account daily quota and UTC rollover limit attempts, including failed provider calls', async () => {
  jest.useFakeTimers({ now: new Date('2026-11-08T09:00:00Z') });
  const ai = service();
  fetchMock.mockImplementation(async () => new Response('unavailable', { status: 503 }));
  for (let minute = 0; minute < 4; minute++) {
    for (let i = 0; i < 5; i++) await expect(ai.recommend('owner', preferences)).rejects.toBeInstanceOf(ServiceUnavailableException);
    jest.advanceTimersByTime(60_000);
  }
  await expect(ai.recommend('owner', preferences)).rejects.toThrow('AI_PASSWORD_DAILY_LIMIT');
  expect(fetchMock).toHaveBeenCalledTimes(20);
  jest.setSystemTime(new Date('2026-11-09T00:00:01Z'));
  await expect(ai.recommend('owner', preferences)).rejects.toThrow('AI_PASSWORD_UNAVAILABLE');
  expect(fetchMock).toHaveBeenCalledTimes(21);
});

test('global daily budget bounds total attempted provider calls across accounts', async () => {
  const ai = service({ AI_PASSWORD_DAILY_LIMIT: '2' });
  await ai.recommend('one', preferences); await ai.recommend('two', preferences);
  await expect(ai.recommend('three', preferences)).rejects.toBeInstanceOf(HttpException);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('same-account overlap and more than two concurrent external calls are blocked', async () => {
  const releases: Array<(value: Response) => void> = [];
  fetchMock.mockImplementation(() => new Promise((resolve) => { releases.push(resolve); }));
  const ai = service();
  const one = ai.recommend('one', preferences);
  const two = ai.recommend('two', preferences);
  await expect(ai.recommend('one', preferences)).rejects.toThrow('AI_PASSWORD_BUSY');
  await expect(ai.recommend('three', preferences)).rejects.toThrow('AI_PASSWORD_BUSY');
  releases.forEach((release) => release(response()));
  await Promise.all([one, two]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('timeout aborts after twelve seconds and releases the concurrency slot', async () => {
  jest.useFakeTimers();
  fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }));
  const ai = service();
  const pending = ai.recommend('owner', preferences);
  const assertion = expect(pending).rejects.toThrow('AI_PASSWORD_TIMEOUT');
  await jest.advanceTimersByTimeAsync(12_000);
  await assertion;
  fetchMock.mockImplementation(async () => response());
  expect(await ai.recommend('owner', preferences)).toHaveProperty('source', 'GEMINI');
});
