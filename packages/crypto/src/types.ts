/**
 * Represents the result of an AES-256-GCM encryption operation.
 * Both fields are Base64-encoded strings for safe JSON serialization.
 */
export interface EncryptedPayload {
  /** Base64-encoded ciphertext — includes the GCM authentication tag (16 bytes appended). */
  ciphertext: string;
  /** Base64-encoded 12-byte random nonce (IV). MUST be unique per encryption call. */
  iv: string;
}

/**
 * Plaintext structure stored inside a VaultItem before encryption.
 * This object is serialized to JSON and then encrypted as a single blob.
 */
export interface VaultItemPlaintext {
  login?: string;
  password: string;
  url?: string;
  notes?: string;
}
