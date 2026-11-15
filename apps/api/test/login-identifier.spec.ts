import 'reflect-metadata';
import { validate } from 'class-validator';
import { LoginDto } from '../src/auth/dto/login.dto';
import { AuthParametersDto } from '../src/auth/dto/vault-protection.dto';
import { InviteContactDto } from '../src/contacts/dto/invite-contact.dto';
import { loginLookup, normalizeLoginIdentifier, resolveLoginIdentifier } from '../src/auth/login-identifier';

test.each(['11912345678', '(11) 91234-5678', '+55 (11) 91234-5678', '5511912345678'])('normalizes phone identity %s before lookup', (identifier) => {
  expect(normalizeLoginIdentifier(identifier)).toBe('+5511912345678');
  expect(resolveLoginIdentifier({ identifier })).toBe('+5511912345678');
});

test('preserves legacy email normalization and does not treat the optional contact phone as a login', () => {
  expect(resolveLoginIdentifier({ email: ' Owner@Example.com ' })).toBe('owner@example.com');
  expect(loginLookup('owner@example.com')).toEqual({ email: { equals: 'owner@example.com', mode: 'insensitive' } });
  expect(loginLookup('+5511912345678')).toEqual({ loginPhone: '+5511912345678' });
  expect(normalizeLoginIdentifier('55912345678')).toBe('+5555912345678');
});

test.each(['', 'owner@local', '(20) 91234-5678', '+111912345678', '1191234567', '11912345678x', '11+912345678', '1'.repeat(255)])('rejects invalid identifier %s', (identifier) => {
  expect(normalizeLoginIdentifier(identifier)).toBeNull();
  expect(() => resolveLoginIdentifier({ identifier })).toThrow('LOGIN_IDENTIFIER_INVALID');
});

test('ambiguous and missing identities are rejected explicitly', () => {
  expect(() => resolveLoginIdentifier({ email: 'owner@example.com', identifier: '+5511912345678' })).toThrow('LOGIN_IDENTIFIER_AMBIGUOUS');
  expect(() => resolveLoginIdentifier({})).toThrow('LOGIN_IDENTIFIER_INVALID');
});

test('DTOs accept both supported contracts and reject missing, invalid or injected fields', async () => {
  for (const identity of [{ email: 'owner@example.com' }, { identifier: '(11) 91234-5678' }]) {
    expect(await validate(Object.assign(new LoginDto(), { ...identity, password: 'fictitious-password' }))).toHaveLength(0);
    expect(await validate(Object.assign(new AuthParametersDto(), identity))).toHaveLength(0);
  }
  for (const identity of [{}, { identifier: 'owner@local' }, { identifier: 11912345678 }, { email: 'owner@local' }]) {
    expect((await validate(Object.assign(new AuthParametersDto(), identity))).length).toBeGreaterThan(0);
  }
  expect(await validate(Object.assign(new InviteContactDto(), { caregiverIdentifier: '(11) 91234-5678' }))).toHaveLength(0);
  expect((await validate(Object.assign(new InviteContactDto(), { caregiverIdentifier: 'owner@local' }))).length).toBeGreaterThan(0);
  expect((await validate(Object.assign(new AuthParametersDto(), { identifier: '(11) 91234-5678', phone: 'injected' }),
    { whitelist: true, forbidNonWhitelisted: true })).length).toBeGreaterThan(0);
});
