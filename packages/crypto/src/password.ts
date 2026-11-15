import { randomIndex } from './random';

const GROUPS = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%&*+-=?'];

export interface PasswordOptions {
  symbols?: boolean;
}

export function generatePassword(length = 20, options: PasswordOptions = {}): string {
  if (!Number.isInteger(length) || length < 12 || length > 64) throw new Error('PASSWORD_LENGTH_OUT_OF_RANGE');
  if (options.symbols !== undefined && typeof options.symbols !== 'boolean') throw new Error('INVALID_PASSWORD_OPTIONS');
  const groups = options.symbols === false ? GROUPS.slice(0, 3) : GROUPS;
  const alphabet = groups.join('');
  const characters = groups.map((group) => group[randomIndex(group.length)]);
  while (characters.length < length) characters.push(alphabet[randomIndex(alphabet.length)]);
  for (let position = characters.length - 1; position > 0; position--) {
    const other = randomIndex(position + 1);
    [characters[position], characters[other]] = [characters[other], characters[position]];
  }
  return characters.join('');
}
