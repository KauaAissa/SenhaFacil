import { gcm } from '@noble/ciphers/aes';
import { Buffer } from 'buffer';
import { decodeBase64, encodeBase64 } from './encoding';
import { getKeyBytes, type VaultKey } from './key';
import { randomBytes } from './random';
import type { EncryptedPayload, VaultItemPlaintext } from './types';

const NONCE_BYTES = 12;

export async function encryptVaultItem(
  plaintext: VaultItemPlaintext,
  key: VaultKey,
): Promise<EncryptedPayload> {
  validatePlaintext(plaintext);
  const iv = randomBytes(NONCE_BYTES);
  const bytes = Buffer.from(JSON.stringify(plaintext), 'utf8');
  try {
    const ciphertext = gcm(getKeyBytes(key), iv).encrypt(bytes);
    return { ciphertext: encodeBase64(ciphertext), iv: encodeBase64(iv) };
  } finally {
    bytes.fill(0);
  }
}

export async function decryptVaultItem(
  payload: EncryptedPayload,
  key: VaultKey,
): Promise<VaultItemPlaintext> {
  const iv = decodeBase64(payload.iv);
  const ciphertext = decodeBase64(payload.ciphertext);
  if (iv.length !== NONCE_BYTES || ciphertext.length < 16) {
    throw new Error('INVALID_ENCRYPTED_PAYLOAD');
  }
  const bytes = gcm(getKeyBytes(key), iv).decrypt(ciphertext);
  try {
    const plaintext: unknown = JSON.parse(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('utf8'));
    validatePlaintext(plaintext);
    return plaintext;
  } finally {
    bytes.fill(0);
  }
}

function validatePlaintext(value: unknown): asserts value is VaultItemPlaintext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('INVALID_VAULT_ITEM');
  }
  const item = value as Record<string, unknown>;
  if (typeof item.password !== 'string') throw new Error('INVALID_VAULT_ITEM');
  for (const field of ['login', 'url', 'notes']) {
    if (item[field] !== undefined && typeof item[field] !== 'string') {
      throw new Error('INVALID_VAULT_ITEM');
    }
  }
}
