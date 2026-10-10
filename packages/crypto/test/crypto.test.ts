import assert from 'node:assert/strict';
import { pbkdf2Sync, randomBytes, webcrypto } from 'node:crypto';
import { after, before, test } from 'node:test';
import { gcm } from '@noble/ciphers/aes';
import {
  configureRandomSource,
  configureKeyDerivation,
  decodeBase64,
  decryptVaultItem,
  deriveKey,
  destroyVaultKey,
  encodeBase64,
  encryptVaultItem,
  exportVaultKey,
  generateSalt,
  generatePassword,
  importVaultKey,
  type VaultKey,
} from '../src/index';

const salt = '00112233445566778899aabbccddeeff';
const password = 'senh\u00e3-mestra-\ud83d\udd10';
const item = {
  login: 'av\u00f3@example.com',
  password: 'prote\u00e7\u00e3o-\ud83d\udd10',
  url: 'https://example.com',
  notes: 'Anota\u00e7\u00e3o com acentos',
};
let key: VaultKey;
let rawKey: Uint8Array;

before(async () => {
  configureRandomSource((length) => new Uint8Array(randomBytes(length)));
  key = await deriveKey(password, salt, true);
  rawKey = exportVaultKey(key);
});

after(() => {
  destroyVaultKey(key);
  rawKey.fill(0);
});

test('PBKDF2 matches the Node SHA-256 reference at 600,000 iterations', () => {
  const expected = pbkdf2Sync(password, Buffer.from(salt, 'hex'), 600_000, 32, 'sha256');
  assert.deepEqual(Buffer.from(rawKey), expected);
  expected.fill(0);
});

test('key derivation yields to timers before completing', async () => {
  let timerRan = false;
  const timer = setTimeout(() => { timerRan = true; }, 0);
  let derived: VaultKey | undefined;
  try {
    derived = await deriveKey(password, salt);
    assert.equal(timerRan, true, 'PBKDF2 must not starve UI tasks');
  } finally {
    clearTimeout(timer);
    if (derived) destroyVaultKey(derived);
  }
});

test('native derivation provider preserves parameters, Unicode and buffer cleanup', async () => {
  let capturedPassword: Uint8Array | undefined;
  let capturedSalt: Uint8Array | undefined;
  let output: Uint8Array | undefined;
  let derived: VaultKey | undefined;
  configureKeyDerivation(async (passwordBytes, saltBytes, iterations, length) => {
    capturedPassword = passwordBytes;
    capturedSalt = saltBytes;
    assert.equal(iterations, 600_000);
    assert.equal(length, 32);
    output = pbkdf2Sync(passwordBytes, saltBytes, iterations, length, 'sha256');
    return output;
  });
  try {
    derived = await deriveKey(password, salt, true);
    assert.deepEqual(exportVaultKey(derived), rawKey);
    assert.ok(capturedPassword?.every((value) => value === 0));
    assert.ok(capturedSalt?.every((value) => value === 0));
    assert.ok(output?.every((value) => value === 0));
    configureKeyDerivation(async () => new Uint8Array(31));
    await assert.rejects(deriveKey(password, salt), /INVALID_DERIVED_KEY/);
    configureKeyDerivation(async () => { throw new Error('native failure'); });
    await assert.rejects(deriveKey(password, salt), /native failure/);
  } finally {
    configureKeyDerivation();
    if (derived) destroyVaultKey(derived);
  }
});

test('derivation is deterministic and changes with password or salt', async () => {
  const repeated = await deriveKey(password, salt, true);
  const differentPassword = await deriveKey('another-password', salt, true);
  const differentSalt = await deriveKey(password, 'ffeeddccbbaa99887766554433221100', true);
  try {
    assert.deepEqual(exportVaultKey(repeated), rawKey);
    assert.notDeepEqual(exportVaultKey(differentPassword), rawKey);
    assert.notDeepEqual(exportVaultKey(differentSalt), rawKey);
  } finally {
    for (const derived of [repeated, differentPassword, differentSalt]) destroyVaultKey(derived);
  }
});

test('encrypts and decrypts Unicode fields without exposing plaintext', async () => {
  const encrypted = await encryptVaultItem(item, key);
  assert.deepEqual(await decryptVaultItem(encrypted, key), item);
  assert.deepEqual(Object.keys(encrypted).sort(), ['ciphertext', 'iv']);
  assert.equal(JSON.stringify(encrypted).includes(item.password), false);
});

test('new ciphertext can be decrypted by the previous WebCrypto implementation', async () => {
  const encrypted = await encryptVaultItem(item, key);
  const browserKey = await webcrypto.subtle.importKey('raw', Uint8Array.from(rawKey), 'AES-GCM', false, ['decrypt']);
  const plaintext = await webcrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: Uint8Array.from(decodeBase64(encrypted.iv)) },
    browserKey,
    Uint8Array.from(decodeBase64(encrypted.ciphertext)),
  );
  assert.deepEqual(JSON.parse(Buffer.from(plaintext).toString('utf8')), item);
});

test('decrypts existing WebCrypto ciphertext without migration', async () => {
  const browserKey = await webcrypto.subtle.importKey('raw', Uint8Array.from(rawKey), 'AES-GCM', false, ['encrypt']);
  const iv = new Uint8Array(randomBytes(12));
  const encrypted = await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, browserKey, Buffer.from(JSON.stringify(item)),
  );
  assert.deepEqual(await decryptVaultItem({
    iv: encodeBase64(iv), ciphertext: encodeBase64(new Uint8Array(encrypted)),
  }, key), item);
});

test('uses fresh 12-byte nonces and fresh 16-byte salts', async () => {
  const nonces = new Set<string>();
  const salts = new Set<string>();
  for (let sample = 0; sample < 64; sample++) {
    const encrypted = await encryptVaultItem(item, key);
    assert.equal(decodeBase64(encrypted.iv).length, 12);
    nonces.add(encrypted.iv);
    const generated = generateSalt();
    assert.match(generated, /^[0-9a-f]{32}$/);
    salts.add(generated);
  }
  assert.equal(nonces.size, 64);
  assert.equal(salts.size, 64);
});

test('rejects wrong keys, modified IVs, ciphertext and authentication tags', async () => {
  const encrypted = await encryptVaultItem(item, key);
  const wrongKey = importVaultKey(new Uint8Array(32).fill(7));
  try {
    await assert.rejects(decryptVaultItem(encrypted, wrongKey));
    const iv = decodeBase64(encrypted.iv);
    iv[0] ^= 1;
    await assert.rejects(decryptVaultItem({ ...encrypted, iv: encodeBase64(iv) }, key));
    for (const offset of [0, decodeBase64(encrypted.ciphertext).length - 1]) {
      const tampered = decodeBase64(encrypted.ciphertext);
      tampered[offset] ^= 1;
      await assert.rejects(decryptVaultItem({ ...encrypted, ciphertext: encodeBase64(tampered) }, key));
    }
  } finally {
    destroyVaultKey(wrongKey);
  }
});

test('rejects invalid salts, base64 and payload lengths', async () => {
  for (const invalid of ['', 'z'.repeat(32), 'A'.repeat(32), '0'.repeat(30)]) {
    await assert.rejects(deriveKey(password, invalid));
  }
  for (const invalid of ['?', 'YQ', 'YR==', 'YQ==\n']) {
    assert.throws(() => decodeBase64(invalid), /INVALID_BASE64/);
  }
  await assert.rejects(decryptVaultItem({ iv: '', ciphertext: '' }, key), /INVALID_ENCRYPTED_PAYLOAD/);
  await assert.rejects(decryptVaultItem({ iv: encodeBase64(new Uint8Array(12)), ciphertext: 'YQ==' }, key));
});

test('rejects authenticated plaintext with an invalid vault item shape', async () => {
  for (const invalid of [null, [], { password: 123 }, { password: 'ok', notes: 123 }]) {
    const iv = new Uint8Array(randomBytes(12));
    const ciphertext = gcm(rawKey, iv).encrypt(Buffer.from(JSON.stringify(invalid)));
    await assert.rejects(decryptVaultItem({ iv: encodeBase64(iv), ciphertext: encodeBase64(ciphertext) }, key), /INVALID_VAULT_ITEM/);
  }
});

test('key handles are not serializable secrets and disabled exports stay disabled', () => {
  const handle = importVaultKey(rawKey);
  try {
    assert.equal(JSON.stringify(handle), '{"extractable":false}');
    assert.throws(() => exportVaultKey(handle), /KEY_NOT_EXTRACTABLE/);
    assert.throws(() => importVaultKey(new Uint8Array(31)), /INVALID_KEY_LENGTH/);
  } finally {
    destroyVaultKey(handle);
  }
});

test('imports and exports make independent copies; destroyed handles cannot decrypt', async () => {
  const copy = Uint8Array.from(rawKey);
  const handle = importVaultKey(copy, true);
  copy.fill(0);
  const exported = exportVaultKey(handle);
  exported.fill(0);
  assert.deepEqual(exportVaultKey(handle), rawKey);
  const encrypted = await encryptVaultItem(item, handle);
  destroyVaultKey(handle);
  destroyVaultKey(handle);
  await assert.rejects(decryptVaultItem(encrypted, handle), /KEY_NOT_LOADED/);
});

test('works without browser crypto, TextEncoder, TextDecoder, btoa or atob', async () => {
  const names = ['crypto', 'TextEncoder', 'TextDecoder', 'btoa', 'atob'] as const;
  const descriptors = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  let portable: VaultKey | undefined;
  try {
    for (const name of names) Object.defineProperty(globalThis, name, { value: undefined, configurable: true });
    portable = await deriveKey(password, salt);
    assert.match(generateSalt(), /^[0-9a-f]{32}$/);
    assert.deepEqual(await decryptVaultItem(await encryptVaultItem(item, portable), portable), item);
  } finally {
    if (portable) destroyVaultKey(portable);
    names.forEach((name, index) => {
      const descriptor = descriptors[index];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
});

test('rejects an invalid random provider instead of using an insecure fallback', () => {
  configureRandomSource(() => new Uint8Array(1));
  try {
    assert.throws(() => generateSalt(), /SECURE_RANDOM_UNAVAILABLE/);
  } finally {
    configureRandomSource((length) => new Uint8Array(randomBytes(length)));
  }
});

test('password generator includes every group, requested length and fresh randomness', () => {
  const passwords = new Set<string>();
  for (let sample = 0; sample < 100; sample++) {
    const generated = generatePassword(20);
    assert.equal(generated.length, 20);
    for (const group of [/[A-Z]/, /[a-z]/, /[2-9]/, /[!@#$%&*+\-= ?]/]) assert.match(generated, group);
    assert.doesNotMatch(generated, /[IOl01]/);
    passwords.add(generated);
  }
  assert.equal(passwords.size, 100);
});

test('password generator rejects lengths outside the supported range', () => {
  for (const invalid of [0, 11, 65, 12.5, NaN]) assert.throws(() => generatePassword(invalid), /OUT_OF_RANGE/);
  assert.equal(generatePassword(12).length, 12);
  assert.equal(generatePassword(64).length, 64);
});