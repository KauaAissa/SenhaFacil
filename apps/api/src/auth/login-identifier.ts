import { BadRequestException } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, MaxLength, Validate, ValidateIf, ValidatorConstraint, type ValidatorConstraintInterface } from 'class-validator';
import { z } from 'zod';

const emailSchema = z.string().max(254).email();
const areaCodes = new Set('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' '));

export function normalizeLoginIdentifier(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 254) return null;
  const trimmed = value.trim();
  if (emailSchema.safeParse(trimmed).success) return trimmed.toLowerCase();
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) digits = digits.slice(2);
  else if (trimmed.startsWith('+')) return null;
  return /^\d{2}9\d{8}$/.test(digits) && areaCodes.has(digits.slice(0, 2)) ? `+55${digits}` : null;
}

export function loginLookup(identifier: string) {
  return identifier.includes('@')
    ? { email: { equals: identifier, mode: 'insensitive' as const } }
    : { loginPhone: identifier };
}

export function resolveLoginIdentifier(input: { identifier?: string; email?: string }): string {
  if (input.identifier !== undefined && input.email !== undefined) throw new BadRequestException('LOGIN_IDENTIFIER_AMBIGUOUS');
  const identifier = normalizeLoginIdentifier(input.identifier ?? input.email);
  if (!identifier) throw new BadRequestException('LOGIN_IDENTIFIER_INVALID');
  return identifier;
}

@ValidatorConstraint({ name: 'loginIdentifier', async: false })
export class LoginIdentifierValidator implements ValidatorConstraintInterface {
  validate(value: unknown): boolean { return normalizeLoginIdentifier(value) !== null; }
  defaultMessage(): string { return 'LOGIN_IDENTIFIER_INVALID'; }
}

export class LoginIdentifierDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ValidateIf((object: LoginIdentifierDto, value: unknown) => value !== undefined || !object.email)
  @IsString()
  @MaxLength(254)
  @Validate(LoginIdentifierValidator)
  identifier?: string;
}
