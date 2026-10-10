import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { Buffer } from 'buffer';
import { deriveKey, generateSalt, bytesToHex, hexToBytes } from './kdf';
import { destroyVaultKey, exportVaultKey, importVaultKey, type VaultKey } from './key';
import { encryptVaultItem, decryptVaultItem } from './vault';
import { decodeBase64, encodeBase64 } from './encoding';
import { randomBytes } from './random';
import type { EncryptedPayload } from './types';

export interface VaultProtection {
  salt: string;
  recoverySalt: string;
  passwordEnvelope: EncryptedPayload;
  recoveryEnvelope: EncryptedPayload;
}

export async function deriveAuthentication(password: string, salt: string): Promise<string> {
  const root = await deriveKey(password, salt, true);
  const bytes = exportVaultKey(root);
  try { return bytesToHex(hmac(sha256, bytes, Buffer.from('SenhaFacil/auth/v2'))); }
  finally { bytes.fill(0); destroyVaultKey(root); }
}

async function passwordKey(password: string, salt: string): Promise<VaultKey> {
  const root = await deriveKey(password, salt, true);
  const bytes = exportVaultKey(root);
  const wrapped = hmac(sha256, bytes, Buffer.from('SenhaFacil/wrap/v2'));
  try { return importVaultKey(wrapped); }
  finally { bytes.fill(0); wrapped.fill(0); destroyVaultKey(root); }
}

function recoveryBytes(code: string): Uint8Array {
  const normalized = code.replace(/[\s-]/g, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw new Error('Codigo de recuperacao invalido.');
  return hexToBytes(normalized);
}

export function recoveryAuthentication(code: string, salt: string): string {
  if (!/^[0-9a-f]{32}$/.test(salt)) throw new Error('INVALID_RECOVERY_SALT');
  const bytes = recoveryBytes(code);
  try { return bytesToHex(hmac(sha256, bytes, Buffer.from(`SenhaFacil/recovery-auth/v2:${salt}`))); }
  finally { bytes.fill(0); }
}

function recoveryKey(code: string, salt: string): VaultKey {
  const bytes = recoveryBytes(code);
  const wrapped = hmac(sha256, bytes, Buffer.from(`SenhaFacil/recovery-wrap/v2:${salt}`));
  try { return importVaultKey(wrapped); }
  finally { bytes.fill(0); wrapped.fill(0); }
}

async function seal(key: VaultKey, wrapper: VaultKey, context: string): Promise<EncryptedPayload> {
  const bytes = exportVaultKey(key);
  try { return await encryptVaultItem({ password: encodeBase64(bytes), notes: context }, wrapper); }
  finally { bytes.fill(0); }
}

async function open(envelope: EncryptedPayload, wrapper: VaultKey, context: string): Promise<VaultKey> {
  try {
    const value = await decryptVaultItem(envelope, wrapper);
    if (value.notes !== context) throw new Error('INVALID_ENVELOPE_CONTEXT');
    const bytes = decodeBase64(value.password);
    try { return importVaultKey(bytes, true); }
    finally { bytes.fill(0); }
  } finally { destroyVaultKey(wrapper); }
}

export async function createProtection(password: string, salt = generateSalt(), existingKey?: VaultKey) {
  const generated = randomBytes(32);
  const key = existingKey ?? importVaultKey(generated, true);
  generated.fill(0);
  const secret = randomBytes(32);
  const recoveryCode = bytesToHex(secret).toUpperCase().match(/.{8}/g)!.join('-');
  secret.fill(0);
  const recoverySalt = generateSalt();
  let wrapper: VaultKey | undefined;
  let recoveryWrapper: VaultKey | undefined;
  try {
    wrapper = await passwordKey(password, salt);
    recoveryWrapper = recoveryKey(recoveryCode, recoverySalt);
    const protection: VaultProtection = { salt, recoverySalt,
      passwordEnvelope: await seal(key, wrapper, `password:v2:${salt}`),
      recoveryEnvelope: await seal(key, recoveryWrapper, `recovery:v2:${recoverySalt}`) };
    return { protection, recoveryCode, recoveryCredential: recoveryAuthentication(recoveryCode, recoverySalt),
      credential: await deriveAuthentication(password, salt), key };
  } catch (error) { if (!existingKey) destroyVaultKey(key); throw error; }
  finally {
    if (wrapper) destroyVaultKey(wrapper);
    if (recoveryWrapper) destroyVaultKey(recoveryWrapper);
  }
}

export async function openProtection(password: string, protection: VaultProtection): Promise<VaultKey> {
  return open(protection.passwordEnvelope, await passwordKey(password, protection.salt), `password:v2:${protection.salt}`);
}

export async function recoverProtection(code: string, protection: VaultProtection): Promise<VaultKey> {
  return open(protection.recoveryEnvelope, recoveryKey(code, protection.recoverySalt), `recovery:v2:${protection.recoverySalt}`);
}

export async function changeProtection(password: string, key: VaultKey, protection: VaultProtection) {
  const salt = generateSalt();
  const wrapper = await passwordKey(password, salt);
  try { return { protection: { ...protection, salt,
    passwordEnvelope: await seal(key, wrapper, `password:v2:${salt}`) }, credential: await deriveAuthentication(password, salt) }; }
  finally { destroyVaultKey(wrapper); }
}