import { z } from 'zod';
import { generatePassword } from '@senha-facil/crypto';
import { apiClient } from './api.client';
import { connectivityService } from './connectivity.service';
import { UserFacingError } from './error-messages';

const preferencesSchema = z.object({
  usage: z.enum(['TYPE', 'COPY']),
  symbols: z.enum(['ALLOWED', 'FORBIDDEN', 'REQUIRED']),
  maxLength: z.union([z.literal(16), z.literal(20), z.literal(32), z.literal(64)]),
}).strict();
export type PasswordPreferences = z.infer<typeof preferencesSchema>;
const suggestionSchema = z.object({
  source: z.literal('GEMINI'),
  policy: z.object({
    length: z.union([z.literal(16), z.literal(20), z.literal(24), z.literal(32), z.literal(48), z.literal(64)]),
    symbols: z.boolean(),
  }).strict(),
  reason: z.enum(['EASIER_TO_TYPE', 'LONGER_FOR_COPY', 'SITE_LIMIT', 'NO_SYMBOLS']),
}).strict();
export type PasswordSuggestion = z.infer<typeof suggestionSchema>;
const statusSchema = z.object({ available: z.boolean(), provider: z.literal('GEMINI') }).strict();

const reasons: Record<PasswordSuggestion['reason'], string> = {
  EASIER_TO_TYPE: 'Uma opção para digitar, mantendo pelo menos 16 caracteres e evitando letras e números fáceis de confundir.',
  LONGER_FOR_COPY: 'Como você vai copiar e colar, um tamanho maior pode ser mais prático do que digitar cada caractere.',
  SITE_LIMIT: 'A sugestão usa o tamanho máximo que você informou. Confira as regras do site antes de cadastrar.',
  NO_SYMBOLS: 'Esta configuração usa letras e números, sem símbolos. O tamanho continua sendo de pelo menos 16 caracteres.',
};

export function validatePasswordSuggestion(input: unknown, preferences: PasswordPreferences): PasswordSuggestion {
  const choices = preferencesSchema.safeParse(preferences);
  const result = suggestionSchema.safeParse(input);
  if (!choices.success || !result.success) throw new UserFacingError('A IA não retornou uma configuração válida. Use o gerador no aparelho ou tente novamente.');
  const suggestion = result.data;
  if (suggestion.policy.length > preferences.maxLength
    || (preferences.symbols === 'FORBIDDEN' && suggestion.policy.symbols)
    || (preferences.symbols === 'REQUIRED' && !suggestion.policy.symbols)
    || (suggestion.reason === 'NO_SYMBOLS' && suggestion.policy.symbols)
    || (suggestion.reason === 'EASIER_TO_TYPE' && preferences.usage !== 'TYPE')
    || (suggestion.reason === 'LONGER_FOR_COPY' && preferences.usage !== 'COPY')
    || (suggestion.reason === 'SITE_LIMIT' && suggestion.policy.length !== preferences.maxLength)) {
    throw new UserFacingError('A sugestão não respeitou suas escolhas. Nenhuma senha foi alterada. Use o gerador no aparelho ou tente novamente.');
  }
  return suggestion;
}

export const passwordAiService = {
  async status(signal?: AbortSignal): Promise<{ available: boolean; provider: 'GEMINI' }> {
    const result = statusSchema.safeParse(await apiClient.get<unknown>('/ai/password/status', signal));
    if (!result.success) throw new UserFacingError('Não foi possível conferir a ajuda da IA. O gerador no aparelho continua disponível.');
    return result.data;
  },
  async suggest(preferences: PasswordPreferences, isCurrent: () => boolean, signal?: AbortSignal): Promise<PasswordSuggestion> {
    if (!connectivityService.isOnline) throw new UserFacingError('A ajuda da IA precisa de internet. Você pode gerar uma senha no aparelho, mesmo offline.');
    const choices = preferencesSchema.safeParse(preferences);
    if (!choices.success) throw new UserFacingError('Confira as escolhas de tamanho e símbolos antes de consultar a IA.');
    if (!isCurrent() || signal?.aborted) throw new Error('SESSION_CHANGED');
    // Rebuild the payload: never forward form fields, identifiers or free text.
    const response = await apiClient.post<unknown>('/ai/password/suggestion', {
      usage: choices.data.usage, symbols: choices.data.symbols, maxLength: choices.data.maxLength,
    }, signal);
    if (!isCurrent() || signal?.aborted) throw new Error('SESSION_CHANGED');
    return validatePasswordSuggestion(response, choices.data);
  },
  generate(suggestion: PasswordSuggestion, preferences: PasswordPreferences): string {
    const validated = validatePasswordSuggestion(suggestion, preferences);
    return generatePassword(validated.policy.length, { symbols: validated.policy.symbols });
  },
  explanation(suggestion: PasswordSuggestion): string {
    return reasons[suggestion.reason];
  },
};
