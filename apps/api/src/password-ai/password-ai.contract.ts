import { z } from 'zod';

export const passwordPreferencesSchema = z.object({
  usage: z.enum(['TYPE', 'COPY']),
  symbols: z.enum(['ALLOWED', 'FORBIDDEN', 'REQUIRED']),
  maxLength: z.union([z.literal(16), z.literal(20), z.literal(32), z.literal(64)]),
}).strict();
export type PasswordPreferences = z.infer<typeof passwordPreferencesSchema>;

export const passwordRecommendationSchema = z.object({
  length: z.union([z.literal(16), z.literal(20), z.literal(24), z.literal(32), z.literal(48), z.literal(64)]),
  symbols: z.boolean(),
  reason: z.enum(['EASIER_TO_TYPE', 'LONGER_FOR_COPY', 'SITE_LIMIT', 'NO_SYMBOLS']),
}).strict();
export type PasswordRecommendation = z.infer<typeof passwordRecommendationSchema>;

export function matchesPreferences(recommendation: PasswordRecommendation, preferences: PasswordPreferences): boolean {
  return recommendation.length <= preferences.maxLength
    && !(preferences.symbols === 'FORBIDDEN' && recommendation.symbols)
    && !(preferences.symbols === 'REQUIRED' && !recommendation.symbols)
    && !(recommendation.reason === 'NO_SYMBOLS' && recommendation.symbols)
    && !(recommendation.reason === 'EASIER_TO_TYPE' && preferences.usage !== 'TYPE')
    && !(recommendation.reason === 'LONGER_FOR_COPY' && preferences.usage !== 'COPY')
    && !(recommendation.reason === 'SITE_LIMIT' && recommendation.length !== preferences.maxLength);
}
