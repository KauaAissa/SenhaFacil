import { accountLogin, loginIdentifierError, loginPayload, normalizeLoginIdentifier } from '../src/services/input-validation';
import { accountSecurityService } from '../src/services/account-security.service';
import { apiClient } from '../src/services/api.client';

test.each(['(11) 91234-5678', '11912345678', '+55 (11) 91234-5678', '5511912345678'])('normalizes Brazilian mobile login %s', (value) => {
  expect(normalizeLoginIdentifier(value)).toBe('+5511912345678');
  expect(loginIdentifierError(value)).toBeNull();
});

test('DDD 55 is not mistaken for the country prefix and emails retain their legacy normalization', () => {
  expect(normalizeLoginIdentifier('55912345678')).toBe('+5555912345678');
  expect(normalizeLoginIdentifier(' Owner+test@Example.com ')).toBe('owner+test@example.com');
  expect(loginPayload('owner@example.com')).toEqual({ email: 'owner@example.com' });
  expect(loginPayload('+5511912345678')).toEqual({ identifier: '+5511912345678' });
});

test.each(['', 'familiar@teste', '1191234567', '+111912345678', '(20) 91234-5678', '011912345678', '11912345678abc', '11+912345678', '1'.repeat(255)])('rejects invalid login %s', (value) => {
  expect(normalizeLoginIdentifier(value)).toBeNull();
  expect(loginIdentifierError(value)).toBeTruthy();
});

test('contact phone never silently replaces the immutable sign-in identifier', () => {
  expect(accountLogin({ email: 'owner@example.com', loginPhone: null })).toBe('owner@example.com');
  expect(accountLogin({ email: null, loginPhone: '+5511912345678' })).toBe('+5511912345678');
  expect(() => accountLogin({ email: null })).toThrow('LOGIN_IDENTIFIER_INVALID');
});

test('pending phone kit is normalized, available offline and acknowledged under the same key', async () => {
  const post = jest.spyOn(apiClient, 'post');
  try {
    await accountSecurityService.stageKit('(11) 91234-5678', 'FICTITIOUS-KIT', '01'.repeat(16));
    expect(await accountSecurityService.pendingKit('+5511912345678', '01'.repeat(16))).toBe('FICTITIOUS-KIT');
    expect(await accountSecurityService.pendingKit('+5511912345678', '02'.repeat(16))).toBeNull();
    expect(post).not.toHaveBeenCalled();
    await accountSecurityService.acknowledgeKit('11912345678');
    expect(await accountSecurityService.pendingKit('+5511912345678', '01'.repeat(16))).toBeNull();
  } finally { post.mockRestore(); }
});
