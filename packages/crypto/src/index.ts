/**
 * @senha-facil/crypto
 *
 * Client-side cryptography utilities (Zero-Knowledge architecture).
 *
 * IMPORTANT: This package runs ONLY on the client device.
 * The derived encryption key NEVER leaves the device.
 *
 * Requires Web Crypto API (globalThis.crypto.subtle):
 *   - Expo / React Native: Hermes ≥ 0.12 (Expo SDK ≥ 50) ✓
 *   - Node.js ≥ 18 ✓
 */

export { deriveKey, generateSalt } from './kdf';
export { encryptVaultItem, decryptVaultItem } from './vault';
export type { EncryptedPayload, VaultItemPlaintext } from './types';
