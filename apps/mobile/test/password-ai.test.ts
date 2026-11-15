import { randomBytes } from 'node:crypto';
import { configureRandomSource } from '@senha-facil/crypto';
import { apiClient } from '../src/services/api.client';
import { connectivityService } from '../src/services/connectivity.service';
import { apiErrorMessage } from '../src/services/error-messages';
import { passwordAdvice } from '../src/services/password-advice.service';
import { passwordAiService, validatePasswordSuggestion, type PasswordPreferences } from '../src/services/password-ai.service';

const preferences: PasswordPreferences = { usage: 'TYPE', symbols: 'FORBIDDEN', maxLength: 32 };
const suggestion = { source: 'GEMINI', policy: { length: 20, symbols: false }, reason: 'EASIER_TO_TYPE' };

beforeEach(() => { configureRandomSource((length) => new Uint8Array(randomBytes(length))); });
afterEach(() => jest.restoreAllMocks());

test('status uses only the authenticated API, never a provider endpoint', async () => {
  const get = jest.spyOn(apiClient, 'get').mockResolvedValue({ available: false, provider: 'GEMINI' });
  expect(await passwordAiService.status()).toEqual({ available: false, provider: 'GEMINI' });
  expect(get).toHaveBeenCalledWith('/ai/password/status', undefined);
});

test('only the three guided choices are sent; a suggestion does not generate or save a password', async () => {
  const post = jest.spyOn(apiClient, 'post').mockResolvedValue(suggestion);
  const generated = jest.spyOn(passwordAiService, 'generate');
  expect(await passwordAiService.suggest(preferences, () => true)).toEqual(suggestion);
  expect(post).toHaveBeenCalledWith('/ai/password/suggestion', {
    usage: 'TYPE', symbols: 'FORBIDDEN', maxLength: 32,
  }, undefined);
  expect(generated).not.toHaveBeenCalled();
});

test('personal fields are rejected rather than silently forwarded or stripped', async () => {
  const post = jest.spyOn(apiClient, 'post');
  await expect(passwordAiService.suggest({ ...preferences, ...{ password: 'never-send-this' } }, () => true)).rejects.toThrow('Confira as escolhas');
  expect(post).not.toHaveBeenCalled();
});

test('offline mode never sends an AI request and still permits local generation from a validated rule', async () => {
  jest.spyOn(connectivityService, 'isOnline', 'get').mockReturnValue(false);
  const post = jest.spyOn(apiClient, 'post');
  await expect(passwordAiService.suggest(preferences, () => true)).rejects.toThrow('internet');
  const result = passwordAiService.generate(validatePasswordSuggestion(suggestion, preferences), preferences);
  expect(result).toHaveLength(20);
  expect(result).toMatch(/^[A-Za-z2-9]+$/);
  expect(post).not.toHaveBeenCalled();
});

test('session/focus invalidation before sending and after receiving never applies a late suggestion', async () => {
  const post = jest.spyOn(apiClient, 'post');
  await expect(passwordAiService.suggest(preferences, () => false)).rejects.toThrow('SESSION_CHANGED');
  expect(post).not.toHaveBeenCalled();
  let current = true;
  post.mockImplementationOnce(async () => { current = false; return suggestion; });
  await expect(passwordAiService.suggest(preferences, () => current)).rejects.toThrow('SESSION_CHANGED');
});

test('cancellation is forwarded to the API and discards late responses', async () => {
  const controller = new AbortController();
  const post = jest.spyOn(apiClient, 'post').mockImplementationOnce(async () => { controller.abort(); return suggestion; });
  await expect(passwordAiService.suggest(preferences, () => true, controller.signal)).rejects.toThrow('SESSION_CHANGED');
  expect(post).toHaveBeenCalledWith('/ai/password/suggestion', preferences, controller.signal);
  post.mockClear();
  await expect(passwordAiService.suggest(preferences, () => true, controller.signal)).rejects.toThrow('SESSION_CHANGED');
  expect(post).not.toHaveBeenCalled();
});

test.each([
  { ...suggestion, password: 'model-secret' }, { ...suggestion, explanation: 'model text' },
  { ...suggestion, source: 'LOCAL' }, { ...suggestion, policy: { length: 12, symbols: false } },
  { ...suggestion, policy: { length: 64, symbols: false } }, { ...suggestion, policy: { length: 20, symbols: true } },
  { ...suggestion, policy: { length: '20', symbols: false } }, { ...suggestion, reason: 'LONGER_FOR_COPY' },
  { ...suggestion, reason: 'SITE_LIMIT' },
])('validates server output independently without trusting a policy blindly (%j)', (value) => {
  expect(() => validatePasswordSuggestion(value, preferences)).toThrow();
});

test('required symbols and maximum length are enforced again when generating', () => {
  const result = validatePasswordSuggestion(suggestion, preferences);
  expect(() => passwordAiService.generate(result, { ...preferences, symbols: 'REQUIRED' })).toThrow('não respeitou');
  expect(() => passwordAiService.generate(result, { ...preferences, maxLength: 16 })).toThrow('não respeitou');
});

test('all guided combinations can produce local passwords with the exact validated shape', () => {
  for (const usage of ['TYPE', 'COPY'] as const) {
    for (const symbols of ['ALLOWED', 'FORBIDDEN', 'REQUIRED'] as const) {
      for (const maxLength of [16, 20, 32, 64] as const) {
        const choices = { usage, symbols, maxLength };
        const rule = validatePasswordSuggestion({ source: 'GEMINI',
          policy: { length: maxLength, symbols: symbols !== 'FORBIDDEN' }, reason: 'SITE_LIMIT' }, choices);
        const generated = passwordAiService.generate(rule, choices);
        expect(generated).toHaveLength(maxLength);
        expect(generated).toMatch(/[A-Z]/); expect(generated).toMatch(/[a-z]/); expect(generated).toMatch(/[2-9]/);
        expect(/[!@#$%&*+\-=?]/.test(generated)).toBe(symbols !== 'FORBIDDEN');
        expect(generated).not.toMatch(/[01IOl\s]/);
        expect(passwordAdvice(generated)!.score).toBeGreaterThanOrEqual(3);
      }
    }
  }
});

test('repeated application uses fresh cryptographic randomness, not a password invented by the model', () => {
  const rule = validatePasswordSuggestion(suggestion, preferences);
  const passwords = new Set(Array.from({ length: 100 }, () => passwordAiService.generate(rule, preferences)));
  expect(passwords.size).toBe(100);
});

test.each(['EASIER_TO_TYPE', 'LONGER_FOR_COPY', 'SITE_LIMIT', 'NO_SYMBOLS'] as const)('explanations for %s are local controlled messages', (reason) => {
  expect(passwordAiService.explanation({ source: 'GEMINI', policy: { length: 20, symbols: false }, reason })).toBeTruthy();
});

test.each(['AI_PASSWORD_NOT_CONFIGURED', 'AI_PASSWORD_UNAVAILABLE', 'AI_PASSWORD_PROVIDER_LIMIT',
  'AI_PASSWORD_DAILY_LIMIT', 'AI_PASSWORD_RATE_LIMIT', 'AI_PASSWORD_BUSY', 'AI_PASSWORD_TIMEOUT',
  'AI_PASSWORD_INVALID_RESPONSE', 'AI_PASSWORD_INVALID_PREFERENCES'])('API error %s is translated even for 429/503', (message) => {
  const translated = apiErrorMessage(message.includes('LIMIT') ? 429 : 503, JSON.stringify({ message }), '/ai/password/suggestion');
  expect(translated).not.toContain('AI_PASSWORD_');
  expect(translated).toMatch(/aparelho|escolhas/i);
});
