import { wordlist } from '@scure/bip39/wordlists/portuguese';
import { randomIndex } from './random';
import type { PasswordOptions } from './password';

const words = wordlist.map((word) => word.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
const digits = '23456789';
const symbols = '!@#$%&*+-=?';

if (words.length !== 2_048 || new Set(words).size !== 2_048 || words.some((word) => !/^[a-z]+$/.test(word))) {
  throw new Error('INVALID_PASSPHRASE_WORDLIST');
}

export function generatePassphrase(options: PasswordOptions = {}): string {
  if (options.symbols !== undefined && typeof options.symbols !== 'boolean') throw new Error('INVALID_PASSWORD_OPTIONS');
  const selected = Array.from({ length: 6 }, () => {
    const word = words[randomIndex(words.length)];
    return word[0].toUpperCase() + word.slice(1);
  });
  const suffix = digits[randomIndex(digits.length)] + digits[randomIndex(digits.length)];
  return selected.join(options.symbols === false ? '' : '-') + suffix
    + (options.symbols === false ? '' : symbols[randomIndex(symbols.length)]);
}
