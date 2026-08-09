import type { EncryptedPayload, VaultItemPlaintext } from './types';

const NONCE_BYTES = 12; // Standard GCM nonce length (96 bits)

/**
 * Encrypts a vault item payload using AES-256-GCM.
 *
 * A fresh random nonce (IV) is generated for EVERY call — never reuse an IV
 * with the same key, as it breaks GCM's security guarantees.
 *
 * The GCM authentication tag (16 bytes) is automatically appended to the
 * ciphertext by the Web Crypto API, providing integrity and authenticity.
 *
 * @param plaintext - Structured vault data to encrypt
 * @param key       - Non-extractable AES-256-GCM CryptoKey from deriveKey()
 * @returns EncryptedPayload with Base64-encoded ciphertext and IV
 */
export async function encryptVaultItem(
  plaintext: VaultItemPlaintext,
  key: CryptoKey,
): Promise<EncryptedPayload> {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(plaintext)),
  );

  return {
    ciphertext: bufferToBase64(ciphertext),
    iv: bufferToBase64(iv),
  };
}

/**
 * Decrypts a vault item payload using AES-256-GCM.
 *
 * Throws a `DOMException` ("OperationError") if:
 *   - The GCM auth tag fails (data was tampered with)
 *   - The wrong key is used
 *   - The IV is incorrect
 *
 * @param payload - The encrypted payload retrieved from server or local DB
 * @param key     - The same CryptoKey used for encryption
 * @returns Decrypted VaultItemPlaintext
 */
export async function decryptVaultItem(
  payload: EncryptedPayload,
  key: CryptoKey,
): Promise<VaultItemPlaintext> {
  const iv = base64ToBuffer(payload.iv);
  const ciphertext = base64ToBuffer(payload.ciphertext);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );

  const dec = new TextDecoder();
  return JSON.parse(dec.decode(plaintext)) as VaultItemPlaintext;
}

// --- Internal helpers ---

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
