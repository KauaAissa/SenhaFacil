import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, test } from 'node:test';
import { wordlist } from '@scure/bip39/wordlists/portuguese';
import { configureRandomSource, generatePassphrase } from '../src/index';

const words = new Set(wordlist.map((word) => word.normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
beforeEach(() => configureRandomSource((length) => new Uint8Array(randomBytes(length))));
afterEach(() => configureRandomSource((length) => new Uint8Array(randomBytes(length))));

test('memorable passwords use six independently drawn Portuguese words, two digits and an optional symbol', () => {
  const generated = new Set<string>();
  for (const symbols of [true, false]) {
    for (let index = 0; index < 200; index++) {
      const password = generatePassphrase({ symbols });
      assert.match(password, symbols ? /[2-9]{2}[!@#$%&*+\-=?]$/ : /[2-9]{2}$/);
      if (!symbols) assert.match(password, /^[A-Za-z2-9]+$/);
      const selected = password.match(/[A-Z][a-z]+/g)!;
      assert.equal(selected.length, 6);
      for (const word of selected) assert.ok(words.has(word.toLowerCase()));
      assert.ok(password.length <= 128);
      generated.add(password);
    }
  }
  assert.equal(generated.size, 400);
  assert.equal(words.size, 2_048);
  assert.ok(6 * Math.log2(words.size) + 2 * Math.log2(8) >= 72);
});

test('word selection keeps the full 2048-word range and permits independent repeated draws', () => {
  configureRandomSource((length) => new Uint8Array(length).fill(255));
  const password = generatePassphrase({ symbols: false });
  const selected = password.match(/[A-Z][a-z]+/g)!;
  assert.equal(selected.length, 6);
  assert.ok(selected.every((word) => word.toLowerCase() === wordlist[2_047].normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
});

test('memorable mode never substitutes predictable values if randomness fails', () => {
  configureRandomSource(() => { throw new Error('rng-unavailable'); });
  assert.throws(() => generatePassphrase(), /rng-unavailable/);
});
