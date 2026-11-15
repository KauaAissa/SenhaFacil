import * as SecureStore from 'expo-secure-store';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { createProtection, recoverProtection, recoveryAuthentication, destroyVaultKey, type VaultProtection } from '@senha-facil/crypto';
import { apiClient } from './api.client';
import { loginPayload, normalizeLoginIdentifier } from './input-validation';

async function kitName(identifier: string): Promise<string> {
  const normalized = normalizeLoginIdentifier(identifier);
  if (!normalized) throw new Error('LOGIN_IDENTIFIER_INVALID');
  return `sf_kit_${await digestStringAsync(CryptoDigestAlgorithm.SHA256, normalized)}`;
}

export const accountSecurityService = {
  async stageKit(identifier: string, code: string, recoverySalt: string): Promise<void> {
    await SecureStore.setItemAsync(await kitName(identifier), JSON.stringify({ code, recoverySalt }), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  },
  async pendingKit(identifier: string, activeRecoverySalt?: string): Promise<string | null> {
    const stored = await SecureStore.getItemAsync(await kitName(identifier));
    if (!stored) return null;
    const kit: { code: string; recoverySalt: string } = JSON.parse(stored);
    const normalized = normalizeLoginIdentifier(identifier);
    if (!normalized) throw new Error('LOGIN_IDENTIFIER_INVALID');
    const salt = activeRecoverySalt ?? (await apiClient.post<{ recoverySalt?: string }>('/auth/parameters', loginPayload(normalized))).recoverySalt;
    return kit.recoverySalt === salt ? kit.code : null;
  },
  async acknowledgeKit(identifier: string): Promise<void> { await SecureStore.deleteItemAsync(await kitName(identifier)); },
  async recover(identifier: string, code: string, password: string): Promise<void> {
    const normalized = normalizeLoginIdentifier(identifier);
    if (!normalized) throw new Error('LOGIN_IDENTIFIER_INVALID');
    const identity = loginPayload(normalized);
    const parameters = await apiClient.post<{ recoverySalt?: string }>('/auth/parameters', identity);
    if (!parameters.recoverySalt) throw new Error('Esta conta ainda nao possui kit de recuperacao.');
    const proof = recoveryAuthentication(code, parameters.recoverySalt);
    const previous = await apiClient.post<{ protection: VaultProtection; securityVersion: number }>('/auth/recovery-info', { ...identity, recoveryCredential: proof });
    const key = await recoverProtection(code, previous.protection);
    try {
      const prepared = await createProtection(password, undefined, key);
      await this.stageKit(normalized, prepared.recoveryCode, prepared.protection.recoverySalt);
      await apiClient.post('/auth/recover', { ...identity, recoveryCredential: proof, securityVersion: previous.securityVersion,
        credential: prepared.credential, protection: prepared.protection, newRecoveryCredential: prepared.recoveryCredential });
    } finally { destroyVaultKey(key); }
  },
};