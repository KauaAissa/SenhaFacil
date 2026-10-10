import { pbkdf2Async } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { Buffer } from 'buffer';
import { importVaultKey, type VaultKey } from './key';
import { randomBytes } from './random';

const KDF_ITERATIONS = 600_000;
const KEY_LENGTH_BYTES = 32;
const SALT_BYTES = 16;

export type KeyDerivationProvider = (password: Uint8Array, salt: Uint8Array, iterations: number, length: number) => Promise<Uint8Array>;
let keyDerivationProvider: KeyDerivationProvider | undefined;

export function configureKeyDerivation(provider?: KeyDerivationProvider): void {
  keyDerivationProvider = provider;
}

export async function deriveKey(
  masterPassword: string,
  saltHex: string,
  extractable = false,
): Promise<VaultKey> {
  if (!/^[0-9a-f]{32}$/.test(saltHex)) {
    throw new Error('kdfSalt must be a 32-character lowercase hex string (16 bytes)');
  }

  const passwordBytes = Buffer.from(masterPassword, 'utf8');
  const saltBytes = hexToBytes(saltHex);
  let rawKey: Uint8Array | undefined;
  try {
    rawKey = keyDerivationProvider
      ? await keyDerivationProvider(passwordBytes, saltBytes, KDF_ITERATIONS, KEY_LENGTH_BYTES)
      : await pbkdf2Async(sha256, passwordBytes, saltBytes, {
      c: KDF_ITERATIONS,
      dkLen: KEY_LENGTH_BYTES,
      asyncTick: 8,
    });
    if (!(rawKey instanceof Uint8Array) || rawKey.length !== KEY_LENGTH_BYTES) throw new Error('INVALID_DERIVED_KEY');
    return importVaultKey(rawKey, extractable);
  } finally {
    passwordBytes.fill(0);
    saltBytes.fill(0);
    rawKey?.fill(0);
  }
}

export function generateSalt(): string {
  return bytesToHex(randomBytes(SALT_BYTES));
}

export { bytesToHex, hexToBytes };
