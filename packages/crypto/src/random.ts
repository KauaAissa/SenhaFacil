type RandomSource = (length: number) => Uint8Array;

let source: RandomSource | undefined;

export function configureRandomSource(provider: RandomSource): void {
  source = provider;
}

export function randomBytes(length: number): Uint8Array {
  const bytes = source
    ? source(length)
    : globalThis.crypto?.getRandomValues(new Uint8Array(length));
  if (!(bytes instanceof Uint8Array) || bytes.length !== length) {
    throw new Error('SECURE_RANDOM_UNAVAILABLE');
  }
  return Uint8Array.from(bytes);
}