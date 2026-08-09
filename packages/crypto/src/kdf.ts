/**
 * Key Derivation Functions — Senha Fácil Zero-Knowledge architecture.
 *
 * Uses PBKDF2-SHA256 with 600 000 iterations (OWASP 2023 recommendation).
 * The derived CryptoKey NEVER leaves the client device.
 *
 * Compatible with:
 *   - Expo / React Native (Hermes ≥ 0.12, SDK ≥ 50) via Web Crypto API
 *   - Node.js ≥ 18 via globalThis.crypto
 */

const KDF_ITERATIONS = 600_000;
const KEY_LENGTH_BITS = 256;
const SALT_BYTES = 16; // 128-bit salt → 32 hex chars

/**
 * Derives an AES-256 CryptoKey from the user's master password and a public salt.
 *
 * @param masterPassword - The user's login/master password (plaintext — local only, never sent to server)
 * @param saltHex        - 32-char hex string fetched from or sent to the server (public value)
 * @param extractable    - Set to `true` only when the key needs to be persisted in SecureStore
 */
export async function deriveKey(
  masterPassword: string,
  saltHex: string,
  extractable = false,
): Promise<CryptoKey> {
  validateSaltHex(saltHex);

  const enc = new TextEncoder();

  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(masterPassword),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: hexToBytes(saltHex),
      iterations: KDF_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: KEY_LENGTH_BITS },
    extractable,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Generates a cryptographically secure random salt.
 * Must be called ONCE per user on registration and stored server-side.
 *
 * @returns 32-character lowercase hex string (16 random bytes)
 */
export function generateSalt(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

// --- Internal helpers ---

function validateSaltHex(hex: string): void {
  if (!/^[0-9a-f]{32}$/.test(hex)) {
    throw new Error('kdfSalt must be a 32-character lowercase hex string (16 bytes)');
  }
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
