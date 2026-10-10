import * as SecureStore from 'expo-secure-store';
import { getRandomBytes } from 'expo-crypto';
import {
  configureRandomSource,
  decodeBase64,
  deriveKey,
  decryptVaultItem,
  destroyVaultKey,
  encodeBase64,
  exportVaultKey,
  encryptVaultItem,
  importVaultKey,
  type VaultKey,
  openProtection,
  type VaultProtection,
} from '@senha-facil/crypto';
import { configureMobileKeyDerivation } from './key-derivation';

configureRandomSource(getRandomBytes);
configureMobileKeyDerivation();

const keyName = (ownerId: string) => `sf_key_${ownerId}`;
const verifierName = (ownerId: string) => `sf_verifier_${ownerId}`;
const protectionName = (ownerId: string) => `sf_protection_${ownerId}`;

/**
 * Manages the full lifecycle of the AES-256-GCM encryption key on the device.
 *
 * Security model:
 *   - The key is derived from the master password via PBKDF2 (600 000 iterations)
 *   - Persisted in expo-secure-store → iOS Keychain / Android Keystore (hardware-backed)
 *   - requireAuthentication: true → OS-level biometric / PIN gate before every access
 *   - Key bytes are kept outside the serializable key handle and wiped on locking
 */
export class VaultCryptoService {
  private _cryptoKey: VaultKey | null = null;

  async initializeProtectedKey(ownerId: string, password: string, protection: VaultProtection): Promise<void> {
    const key = await openProtection(password, protection);
    const bytes = exportVaultKey(key);
    try {
      await SecureStore.setItemAsync(protectionName(ownerId), JSON.stringify(protection));
      if (SecureStore.canUseBiometricAuthentication()) await SecureStore.setItemAsync(keyName(ownerId), encodeBase64(bytes), {
        requireAuthentication: true, keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        authenticationPrompt: 'Confirme sua identidade para proteger o cofre',
      });
      else await SecureStore.deleteItemAsync(keyName(ownerId));
      await SecureStore.deleteItemAsync(verifierName(ownerId));
      this.lockKey(); this._cryptoKey = importVaultKey(bytes);
    } finally { bytes.fill(0); destroyVaultKey(key); }
  }

  /**
   * Derives a new encryption key and persists it in SecureStore.
   * Call ONCE at registration or on first login on a new device.
   *
   * @param masterPassword - The user's login password (same one sent to the server)
   * @param kdfSalt        - 32-char hex salt returned by the API on register/login
   */
  async initializeKey(ownerId: string, masterPassword: string, kdfSalt: string): Promise<void> {
    const exportableKey = await deriveKey(masterPassword, kdfSalt, true);
    const rawKey = exportVaultKey(exportableKey);
    try {
      const verifier = await encryptVaultItem({ password: 'sf_key_check' }, exportableKey);
      await SecureStore.setItemAsync(verifierName(ownerId), JSON.stringify(verifier));
      if (SecureStore.canUseBiometricAuthentication()) {
        await SecureStore.setItemAsync(keyName(ownerId), encodeBase64(rawKey), {
          requireAuthentication: true,
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          authenticationPrompt: 'Confirme sua identidade para proteger o cofre',
        });
      } else {
        await SecureStore.deleteItemAsync(keyName(ownerId));
      }
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
  async loadKey(ownerId: string, authPrompt = 'Confirme sua identidade para acessar o cofre'): Promise<void> {
    const keyBase64 = await SecureStore.getItemAsync(keyName(ownerId), {
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
  async unlockWithPassword(ownerId: string, password: string, salt: string): Promise<void> {
    const protection = await SecureStore.getItemAsync(protectionName(ownerId));
    if (protection) {
      let key: VaultKey;
      try { key = await openProtection(password, JSON.parse(protection)); }
      catch (error) {
        if (error instanceof Error && error.message.includes('development build')) throw error;
        throw new Error('Senha mestra incorreta.');
      }
      const bytes = exportVaultKey(key);
      try { this.lockKey(); this._cryptoKey = importVaultKey(bytes); }
      finally { bytes.fill(0); destroyVaultKey(key); }
      return;
    }
    const verifier = await SecureStore.getItemAsync(verifierName(ownerId));
    if (!verifier) throw new Error('Entre novamente com internet para preparar o acesso offline.');
    const key = await deriveKey(password, salt);
    try {
      const checked = await decryptVaultItem(JSON.parse(verifier), key);
      if (checked.password !== 'sf_key_check') throw new Error('INVALID_KEY');
      this.lockKey();
      this._cryptoKey = key;
    } catch {
      destroyVaultKey(key);
      throw new Error('Senha mestra incorreta.');
    }
  }

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
  async clearKey(ownerId: string): Promise<void> {
    this.lockKey();
    await SecureStore.deleteItemAsync(keyName(ownerId));
    await SecureStore.deleteItemAsync(verifierName(ownerId));
    await SecureStore.deleteItemAsync(protectionName(ownerId));
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
