export { deriveKey, generateSalt } from './kdf';
export { encryptVaultItem, decryptVaultItem } from './vault';
export { configureRandomSource } from './random';
export { importVaultKey, exportVaultKey, destroyVaultKey } from './key';
export { encodeBase64, decodeBase64 } from './encoding';
export type { VaultKey } from './key';
export type { EncryptedPayload, VaultItemPlaintext } from './types';
