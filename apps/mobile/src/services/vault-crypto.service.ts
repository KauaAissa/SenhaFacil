import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { nativePromptService } from './native-prompt.service';
import { UserFacingError } from './error-messages';
import { deviceCredentialService, type DeviceLockStatus } from './device-credential.service';
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
const biometricPreference = (ownerId: string) => `sf_biometrics_${ownerId}`;

export interface BiometricStatus {
  available: boolean;
  enabled: boolean;
  label: string;
  reason: string;
}

/**
 * Manages the full lifecycle of the AES-256-GCM encryption key on the device.
 *
 * Security model:
 *   - V2 keys are opened from a password-protected envelope; legacy keys use PBKDF2
 *   - Explicit opt-in persists separate biometric/device-credential protected copies
 *   - Every protected read requires a cryptographic system authentication
 *   - Key bytes are kept outside the serializable key handle and wiped on locking
 */
export class VaultCryptoService {
  private _cryptoKey: VaultKey | null = null;
  private keyEpoch = 0;

  async initializeProtectedKey(ownerId: string, password: string, protection: VaultProtection): Promise<void> {
    const key = await openProtection(password, protection);
    const bytes = exportVaultKey(key);
    try {
      await SecureStore.setItemAsync(protectionName(ownerId), JSON.stringify(protection));
      await this.discardUnconsentedBiometricKey(ownerId);
      await deviceCredentialService.reconcile(ownerId, encodeBase64(bytes));
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
      await this.discardUnconsentedBiometricKey(ownerId);
      await deviceCredentialService.reconcile(ownerId, encodeBase64(rawKey));
      this.lockKey();
      this._cryptoKey = importVaultKey(rawKey);
    } finally {
      rawKey.fill(0);
      destroyVaultKey(exportableKey);
    }
  }

  private async discardUnconsentedBiometricKey(ownerId: string): Promise<void> {
    if ((await SecureStore.getItemAsync(biometricPreference(ownerId))) !== '1') {
      await SecureStore.deleteItemAsync(keyName(ownerId));
    }
  }

  async biometricStatus(ownerId: string): Promise<BiometricStatus> {
    const enabled = (await SecureStore.getItemAsync(biometricPreference(ownerId))) === '1';
    const [hardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
    const fingerprint = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
    const label = face && fingerprint ? 'digital ou rosto' : face ? 'reconhecimento facial' : 'impressão digital';
    const strong = typeof SecureStore.canUseBiometricAuthentication === 'function' && SecureStore.canUseBiometricAuthentication();
    return {
      enabled, available: hardware && enrolled && strong, label,
      reason: !hardware ? 'Este aparelho não oferece biometria compatível. Continue usando sua senha mestra.'
        : !enrolled ? 'Cadastre uma digital ou um rosto nas configurações de segurança do aparelho. Depois volte aqui.'
          : !strong ? 'O sistema não disponibilizou uma biometria forte. Use sua senha mestra; se o sensor estiver bloqueado, aguarde e tente novamente. Reconhecimento facial simples não pode proteger este cofre.'
            : 'A confirmação é feita pelo próprio aparelho. Sua digital e seu rosto não são enviados ao Senha Fácil.',
    };
  }

  async enableBiometrics(ownerId: string, password: string, salt: string): Promise<void> {
    const status = await this.biometricStatus(ownerId);
    if (!status.available) throw new UserFacingError(status.reason);
    const activeKey = this.key;
    const key = await this.openPasswordKey(ownerId, password, salt);
    const bytes = exportVaultKey(key);
    try {
      if (this._cryptoKey !== activeKey) throw new Error('SESSION_CHANGED');
      await nativePromptService.run(() => SecureStore.setItemAsync(keyName(ownerId), encodeBase64(bytes), {
        requireAuthentication: true,
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        authenticationPrompt: 'Ativar biometria para desbloquear o Senha Fácil',
      }));
      if (this._cryptoKey !== activeKey) throw new Error('SESSION_CHANGED');
      await SecureStore.setItemAsync(biometricPreference(ownerId), '1');
    } finally { bytes.fill(0); destroyVaultKey(key); }
  }

  async disableBiometrics(ownerId: string): Promise<void> {
    await SecureStore.deleteItemAsync(keyName(ownerId));
    await SecureStore.deleteItemAsync(biometricPreference(ownerId));
  }

  deviceLockStatus(ownerId: string): Promise<DeviceLockStatus> {
    return deviceCredentialService.status(ownerId);
  }

  async enableDeviceLock(ownerId: string, password: string, salt: string): Promise<void> {
    const activeKey = this.key;
    const epoch = this.keyEpoch;
    const status = await this.deviceLockStatus(ownerId);
    if (!status.available) throw new UserFacingError(status.reason);
    const key = await this.openPasswordKey(ownerId, password, salt);
    const bytes = exportVaultKey(key);
    try {
      if (epoch !== this.keyEpoch || this._cryptoKey !== activeKey) throw new Error('SESSION_CHANGED');
      await deviceCredentialService.enable(ownerId, encodeBase64(bytes));
      if (epoch !== this.keyEpoch || this._cryptoKey !== activeKey) {
        await deviceCredentialService.disable(ownerId);
        throw new Error('SESSION_CHANGED');
      }
    } finally { bytes.fill(0); destroyVaultKey(key); }
  }

  async disableDeviceLock(ownerId: string): Promise<void> {
    await deviceCredentialService.disable(ownerId);
  }

  async loadDeviceKey(ownerId: string): Promise<void> {
    const epoch = this.keyEpoch;
    const status = await this.deviceLockStatus(ownerId);
    if (!status.available) throw new UserFacingError(status.reason);
    if (!status.enabled) throw new UserFacingError('Ative o bloqueio do aparelho em Minha conta → Segurança. Por enquanto, use sua senha mestra.');
    if (epoch !== this.keyEpoch) throw new Error('SESSION_CHANGED');
    const keyBase64 = await deviceCredentialService.unlock(ownerId);
    const bytes = decodeBase64(keyBase64);
    try {
      if (epoch !== this.keyEpoch) throw new Error('SESSION_CHANGED');
      const key = importVaultKey(bytes);
      this.lockKey();
      this._cryptoKey = key;
    } finally { bytes.fill(0); }
  }

  /**
   * Loads the encryption key from SecureStore.
   * Triggers one system biometric prompt; never replaces it with an app-level check.
   *
   * @param authPrompt - Custom biometric dialog message
   */
  async loadKey(ownerId: string, authPrompt = 'Confirme sua identidade para acessar o cofre'): Promise<void> {
    const epoch = this.keyEpoch;
    const status = await this.biometricStatus(ownerId);
    if (!status.enabled) throw new UserFacingError('Ative o desbloqueio com biometria em Minha conta → Segurança. Por enquanto, use sua senha mestra.');
    if (!status.available) throw new UserFacingError(status.reason);
    if (epoch !== this.keyEpoch) throw new Error('SESSION_CHANGED');
    const keyBase64 = await nativePromptService.run(() => SecureStore.getItemAsync(keyName(ownerId), {
      requireAuthentication: true,
      authenticationPrompt: authPrompt,
    }));

    if (!keyBase64) {
      await this.disableBiometrics(ownerId);
      throw new UserFacingError('A biometria deste aparelho mudou ou foi removida. Use sua senha mestra e ative a biometria novamente em Segurança.');
    }

    const rawKey = decodeBase64(keyBase64);
    try {
      if (epoch !== this.keyEpoch) throw new Error('SESSION_CHANGED');
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
    const epoch = this.keyEpoch;
    const key = await this.openPasswordKey(ownerId, password, salt);
    const bytes = exportVaultKey(key);
    try {
      if (epoch !== this.keyEpoch) throw new Error('SESSION_CHANGED');
      this.lockKey(); this._cryptoKey = importVaultKey(bytes);
    }
    finally { bytes.fill(0); destroyVaultKey(key); }
  }

  private async openPasswordKey(ownerId: string, password: string, salt: string): Promise<VaultKey> {
    const protection = await SecureStore.getItemAsync(protectionName(ownerId));
    if (protection) {
      try { return await openProtection(password, JSON.parse(protection)); }
      catch (error) {
        if (error instanceof Error && error.message.includes('development build')) throw error;
        throw new Error('Senha mestra incorreta.');
      }
    }
    const verifier = await SecureStore.getItemAsync(verifierName(ownerId));
    if (!verifier) throw new Error('Entre novamente com internet para preparar o acesso offline.');
    const key = await deriveKey(password, salt, true);
    try {
      const checked = await decryptVaultItem(JSON.parse(verifier), key);
      if (checked.password !== 'sf_key_check') throw new Error('INVALID_KEY');
      return key;
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
    await SecureStore.deleteItemAsync(biometricPreference(ownerId));
    await deviceCredentialService.disable(ownerId);
  }

  /**
   * Drops the key from memory only (keeps SecureStore entry).
   * Use when backgrounding the app to force re-authentication on resume.
   */
  lockKey(): void {
    this.keyEpoch += 1;
    deviceCredentialService.cancel();
    if (this._cryptoKey) destroyVaultKey(this._cryptoKey);
    this._cryptoKey = null;
  }
}

export const vaultCryptoService = new VaultCryptoService();
