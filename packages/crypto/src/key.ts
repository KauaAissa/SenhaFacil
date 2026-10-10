export interface VaultKey {
  readonly extractable: boolean;
}

const keyMaterial = new WeakMap<VaultKey, Uint8Array>();

export function importVaultKey(raw: Uint8Array, extractable = false): VaultKey {
  if (!(raw instanceof Uint8Array) || raw.length !== 32) {
    throw new Error('INVALID_KEY_LENGTH');
  }
  const key = Object.freeze({ extractable });
  keyMaterial.set(key, Uint8Array.from(raw));
  return key;
}

export function getKeyBytes(key: VaultKey): Uint8Array {
  const bytes = keyMaterial.get(key);
  if (!bytes) throw new Error('KEY_NOT_LOADED');
  return bytes;
}

export function exportVaultKey(key: VaultKey): Uint8Array {
  if (!key.extractable) throw new Error('KEY_NOT_EXTRACTABLE');
  return Uint8Array.from(getKeyBytes(key));
}

export function destroyVaultKey(key: VaultKey): void {
  keyMaterial.get(key)?.fill(0);
  keyMaterial.delete(key);
}