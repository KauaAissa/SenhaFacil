import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, test } from 'node:test';
import { configureRandomSource, generatePassword } from '../src/index';

beforeEach(() => configureRandomSource((length) => new Uint8Array(randomBytes(length))));
afterEach(() => configureRandomSource((length) => new Uint8Array(randomBytes(length))));

test('existing generator retains every length and mandatory character group by default', () => {
  for (const length of [12, 16, 20, 24, 32, 48, 64]) {
    for (let i = 0; i < 50; i++) {
      const password = generatePassword(length);
      assert.equal(password.length, length);
      assert.match(password, /[A-Z]/); assert.match(password, /[a-z]/); assert.match(password, /[2-9]/);
      assert.match(password, /[!@#$%&*+\-=?]/);
      assert.doesNotMatch(password, /[01IOl\s]/);
    }
  }
});

test('symbol-free policy never emits symbols and retains all three alphanumeric groups', () => {
  for (const length of [16, 20, 24, 32, 48, 64]) {
    for (let i = 0; i < 50; i++) {
      const password = generatePassword(length, { symbols: false });
      assert.equal(password.length, length);
      assert.match(password, /^[A-Za-z2-9]+$/);
      assert.match(password, /[A-Z]/); assert.match(password, /[a-z]/); assert.match(password, /[2-9]/);
      assert.doesNotMatch(password, /[01IOl\s]/);
    }
  }
});

test('generation rejects out-of-range lengths without creating partial passwords', () => {
  for (const length of [0, 11, 65, 16.5, NaN, Infinity]) assert.throws(() => generatePassword(length), /PASSWORD_LENGTH_OUT_OF_RANGE/);
});

test('rejection sampling discards biased bytes rather than using direct modulo', () => {
  let calls = 0;
  configureRandomSource((length) => {
    calls += 1;
    return new Uint8Array(length).fill(calls % 2 === 1 ? 255 : 0);
  });
  const password = generatePassword(16, { symbols: false });
  assert.equal(password.length, 16);
  assert.ok(calls > 16);
});

test('randomness failures surface; no predictable fallback is used', () => {
  configureRandomSource(() => { throw new Error('rng-unavailable'); });
  assert.throws(() => generatePassword(20, { symbols: false }), /rng-unavailable/);
});
