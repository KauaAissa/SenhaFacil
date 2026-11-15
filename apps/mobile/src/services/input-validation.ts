import { z } from 'zod';

const emailSchema = z.string().max(254).email();
const areaCodes = new Set('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' '));

export function emailError(value: string): string | null {
  return emailSchema.safeParse(value.trim()).success ? null : 'Informe um e-mail completo, como nome@exemplo.com.';
}

export function normalizeLoginIdentifier(value: string): string | null {
  if (value.length > 254) return null;
  const trimmed = value.trim();
  if (!emailError(trimmed)) return trimmed.toLowerCase();
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) digits = digits.slice(2);
  else if (trimmed.startsWith('+')) return null;
  return /^\d{2}9\d{8}$/.test(digits) && areaCodes.has(digits.slice(0, 2)) ? `+55${digits}` : null;
}

export function loginIdentifierError(value: string): string | null {
  if (normalizeLoginIdentifier(value)) return null;
  return value.includes('@') ? emailError(value)
    : 'Informe seu e-mail completo ou um celular brasileiro com DDD, como (11) 91234-5678.';
}

export function loginPayload(identifier: string): { email: string } | { identifier: string } {
  return identifier.includes('@') ? { email: identifier } : { identifier };
}

export function accountLogin(user: { email?: string | null; loginPhone?: string | null }): string {
  const identifier = normalizeLoginIdentifier(user.email ?? user.loginPhone ?? '');
  if (!identifier) throw new Error('LOGIN_IDENTIFIER_INVALID');
  return identifier;
}
