import * as SecureStore from 'expo-secure-store';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { createProtection, recoverProtection, recoveryAuthentication, destroyVaultKey, type VaultProtection } from '@senha-facil/crypto';
import { apiClient } from './api.client';

async function kitName(email: string): Promise<string> {
  return `sf_kit_${await digestStringAsync(CryptoDigestAlgorithm.SHA256, email.trim().toLowerCase())}`;
}

export const accountSecurityService = {
  async stageKit(email: string, code: string, recoverySalt: string): Promise<void> {
    await SecureStore.setItemAsync(await kitName(email), JSON.stringify({ code, recoverySalt }), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  },
  async pendingKit(email: string, activeRecoverySalt?: string): Promise<string | null> {
    const stored = await SecureStore.getItemAsync(await kitName(email));
    if (!stored) return null;
    const kit: { code: string; recoverySalt: string } = JSON.parse(stored);
    const salt = activeRecoverySalt ?? (await apiClient.post<{ recoverySalt?: string }>('/auth/parameters', { email })).recoverySalt;
    return kit.recoverySalt === salt ? kit.code : null;
  },
  async acknowledgeKit(email: string): Promise<void> { await SecureStore.deleteItemAsync(await kitName(email)); },
  async recover(email: string, code: string, password: string): Promise<void> {
    const parameters = await apiClient.post<{ recoverySalt?: string }>('/auth/parameters', { email });
    if (!parameters.recoverySalt) throw new Error('Esta conta ainda nao possui kit de recuperacao.');
    const proof = recoveryAuthentication(code, parameters.recoverySalt);
    const previous = await apiClient.post<{ protection: VaultProtection; securityVersion: number }>('/auth/recovery-info', { email, recoveryCredential: proof });
    const key = await recoverProtection(code, previous.protection);
    try {
      const prepared = await createProtection(password, undefined, key);
      await this.stageKit(email, prepared.recoveryCode, prepared.protection.recoverySalt);
      await apiClient.post('/auth/recover', { email, recoveryCredential: proof, securityVersion: previous.securityVersion,
        credential: prepared.credential, protection: prepared.protection, newRecoveryCredential: prepared.recoveryCredential });
    } finally { destroyVaultKey(key); }
  },
};