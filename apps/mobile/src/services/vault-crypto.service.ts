import * as SecureStore from 'expo-secure-store';
import { getRandomBytes } from 'expo-crypto';
import {
  configureRandomSource,
  decodeBase64,
  deriveKey,
  destroyVaultKey,
  encodeBase64,
  exportVaultKey,
  importVaultKey,
  type VaultKey,
} from '@senha-facil/crypto';

configureRandomSource(getRandomBytes);

const ENC_KEY_STORE_KEY = 'sf_enc_key_raw';

/**
 * Manages the full lifecycle of the AES-256-GCM encryption key on the device.
 *
 * Security model:
 *   - The key is derived from the master password via PBKDF2 (600 000 iterations)
 *   - Persisted in expo-secure-store → iOS Keychain / Android Keystore (hardware-backed)
 *   - requireAuthentication: true → OS-level biometric / PIN gate before every access
 *   - Key bytes are kept outside the serializable key handle and wiped on locking
 */
class VaultCryptoService {
  private _cryptoKey: VaultKey | null = null;

  /**
   * Derives a new encryption key and persists it in SecureStore.
   * Call ONCE at registration or on first login on a new device.
   *
   * @param masterPassword - The user's login password (same one sent to the server)
   * @param kdfSalt        - 32-char hex salt returned by the API on register/login
   */
  async initializeKey(masterPassword: string, kdfSalt: string): Promise<void> {
    const exportableKey = await deriveKey(masterPassword, kdfSalt, true);
    const rawKey = exportVaultKey(exportableKey);
    try {
      await SecureStore.setItemAsync(ENC_KEY_STORE_KEY, encodeBase64(rawKey), {
        requireAuthentication: true,
        authenticationPrompt: 'Confirme sua identidade para proteger o cofre',
      });
      this.lockKey();
      this._cryptoKey = importVaultKey(rawKey);
    } finally {
      rawKey.fill(0);
      destroyVaultKey(exportableKey);
    }
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

    const rawKey = decodeBase64(keyBase64);
    try {
      const key = importVaultKey(rawKey);
      this.lockKey();
      this._cryptoKey = key;
    } finally {
      rawKey.fill(0);
    }
  }

  /**
   * Returns the in-memory key handle.
   * Throws if loadKey() has not been called yet this session.
   */
  get key(): VaultKey {
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
    this.lockKey();
    await SecureStore.deleteItemAsync(ENC_KEY_STORE_KEY);
  }

  /**
   * Drops the key from memory only (keeps SecureStore entry).
   * Use when backgrounding the app to force re-authentication on resume.
   */
  lockKey(): void {
    if (this._cryptoKey) destroyVaultKey(this._cryptoKey);
    this._cryptoKey = null;
  }
}

export const vaultCryptoService = new VaultCryptoService();
