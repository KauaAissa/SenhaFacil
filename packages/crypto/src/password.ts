import { randomBytes } from './random';

const GROUPS = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%&*+-=?'];

export function generatePassword(length = 20): string {
  if (!Number.isInteger(length) || length < 12 || length > 64) throw new Error('PASSWORD_LENGTH_OUT_OF_RANGE');
  const alphabet = GROUPS.join('');
  const characters = GROUPS.map((group) => group[randomIndex(group.length)]);
  while (characters.length < length) characters.push(alphabet[randomIndex(alphabet.length)]);
  for (let position = characters.length - 1; position > 0; position--) {
    const other = randomIndex(position + 1);
    [characters[position], characters[other]] = [characters[other], characters[position]];
  }
  return characters.join('');
}

function randomIndex(size: number): number {
  const ceiling = 256 - (256 % size);
  let sample: number;
  do { sample = randomBytes(1)[0]; } while (sample >= ceiling);
  return sample % size;
}