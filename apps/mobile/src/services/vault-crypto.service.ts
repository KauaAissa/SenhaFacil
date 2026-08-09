import * as SecureStore from 'expo-secure-store';
import { deriveKey } from '@senha-facil/crypto';

const ENC_KEY_STORE_KEY = 'sf_enc_key_raw';

/**
 * Manages the full lifecycle of the AES-256-GCM encryption key on the device.
 *
 * Security model:
 *   - The key is derived from the master password via PBKDF2 (600 000 iterations)
 *   - Persisted in expo-secure-store → iOS Keychain / Android Keystore (hardware-backed)
 *   - requireAuthentication: true → OS-level biometric / PIN gate before every access
 *   - In-memory key is non-extractable (CryptoKey) — cannot be serialized or exfiltrated
 */
class VaultCryptoService {
  private _cryptoKey: CryptoKey | null = null;

  /**
   * Derives a new encryption key and persists it in SecureStore.
   * Call ONCE at registration or on first login on a new device.
   *
   * @param masterPassword - The user's login password (same one sent to the server)
   * @param kdfSalt        - 32-char hex salt returned by the API on register/login
   */
  async initializeKey(masterPassword: string, kdfSalt: string): Promise<void> {
    // extractable=true so we can export raw bytes for SecureStore persistence
    const exportableKey = await deriveKey(masterPassword, kdfSalt, true);
    const rawKey = await crypto.subtle.exportKey('raw', exportableKey);

    await SecureStore.setItemAsync(ENC_KEY_STORE_KEY, bufferToBase64(rawKey), {
      requireAuthentication: true,
      authenticationPrompt: 'Confirme sua identidade para proteger o cofre',
    });

    // Re-import as non-extractable for in-memory security
    this._cryptoKey = await importRawKey(rawKey);
  }

  /**
   * Loads the encryption key from SecureStore.
   * Triggers the device's biometric / PIN prompt.
   *
   * @param authPrompt - Custom biometric dialog message
   */
  async loadKey(authPrompt = 'Confirme sua identidade para acessar o cofre'): Promise<void> {
    const keyBase64 = await SecureStore.getItemAsync(ENC_KEY_STORE_KEY, {
      requireAuthentication: true,
      authenticationPrompt: authPrompt,
    });

    if (!keyBase64) {
      // Key not found — user must log in again so it can be re-derived
      throw new Error('ENCRYPTION_KEY_NOT_FOUND');
    }

    this._cryptoKey = await importRawKey(base64ToBuffer(keyBase64));
  }

  /**
   * Returns the in-memory CryptoKey.
   * Throws if loadKey() has not been called yet this session.
   */
  get key(): CryptoKey {
    if (!this._cryptoKey) {
      throw new Error('KEY_NOT_LOADED');
    }
    return this._cryptoKey;
  }

  /** True when the key is loaded in memory for the current session. */
  get isLoaded(): boolean {
    return this._cryptoKey !== null;
  }

  /**
   * Clears the key from memory AND from SecureStore.
   * Use on logout or account deletion.
   */
  async clearKey(): Promise<void> {
    this._cryptoKey = null;
    await SecureStore.deleteItemAsync(ENC_KEY_STORE_KEY);
  }

  /**
   * Drops the key from memory only (keeps SecureStore entry).
   * Use when backgrounding the app to force re-authentication on resume.
   */
  lockKey(): void {
    this._cryptoKey = null;
  }
}

// --- Internal helpers ---

async function importRawKey(raw: ArrayBuffer | Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable in memory
    ['encrypt', 'decrypt'],
  );
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const vaultCryptoService = new VaultCryptoService();
