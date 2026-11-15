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

export function randomIndex(size: number): number {
  if (!Number.isInteger(size) || size < 1 || size > 65_536) throw new Error('INVALID_RANDOM_RANGE');
  const width = size <= 256 ? 1 : 2;
  const range = width === 1 ? 256 : 65_536;
  const ceiling = range - (range % size);
  let sample: number;
  do {
    const bytes = randomBytes(width);
    sample = width === 1 ? bytes[0] : bytes[0] * 256 + bytes[1];
  } while (sample >= ceiling);
  return sample % size;
}