import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { matchesPreferences, passwordPreferencesSchema, passwordRecommendationSchema } from './password-ai.contract';

const RESPONSE_LIMIT = 16_384;
const PROMPT = [
  'Recommend a password GENERATION POLICY, never a password, words, personal data or prose.',
  'Return only JSON with length, symbols (boolean) and reason.',
  'Length must be one of 16,20,24,32,48,64, not exceeding maxLength. Never recommend less than 16.',
  'FORBIDDEN disallows symbols, REQUIRED requires symbols, ALLOWED lets you choose.',
  'TYPE favors typing comfort without sacrificing length; COPY favors longer passwords.',
  'Reason: EASIER_TO_TYPE only for TYPE, LONGER_FOR_COPY only for COPY,',
  'SITE_LIMIT only when length equals maxLength, NO_SYMBOLS only when symbols=false.',
  'The application generates all password characters with a local cryptographic random source.',
].join(' ');
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    length: { type: 'integer', enum: [16, 20, 24, 32, 48, 64] },
    symbols: { type: 'boolean' },
    reason: { type: 'string', enum: ['EASIER_TO_TYPE', 'LONGER_FOR_COPY', 'SITE_LIMIT', 'NO_SYMBOLS'] },
  },
  required: ['length', 'symbols', 'reason'],
  additionalProperties: false,
};
const envelopeSchema = z.object({
  candidates: z.array(z.object({
    finishReason: z.literal('STOP'),
    content: z.object({ parts: z.array(z.object({ text: z.string().max(1_000), thought: z.literal(false).optional() })).length(1) }),
  })).length(1),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
});
interface UsageCounter { minuteStarted: number; minute: number; daily: number }

@Injectable()
export class PasswordAiService {
  private readonly logger = new Logger(PasswordAiService.name);
  private readonly enabled: boolean;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly dailyLimit: number;
  private day = '';
  private total = 0;
  private readonly usage = new Map<string, UsageCounter>();
  private readonly active = new Set<string>();

  constructor(config: ConfigService) {
    const enabled = config.get<string>('AI_PASSWORD_ENABLED') ?? 'false';
    if (!['true', 'false'].includes(enabled)) throw new Error('AI_PASSWORD_ENABLED must be true or false');
    this.enabled = enabled === 'true';
    this.apiKey = config.get<string>('GEMINI_API_KEY')?.trim() ?? '';
    this.model = config.get<string>('GEMINI_PASSWORD_MODEL') ?? 'gemini-3.5-flash-lite';
    const daily = config.get<string>('AI_PASSWORD_DAILY_LIMIT') ?? '200';
    if (!/^\d+$/.test(daily) || Number(daily) < 1 || Number(daily) > 10_000) {
      throw new Error('AI_PASSWORD_DAILY_LIMIT must be between 1 and 10000');
    }
    this.dailyLimit = Number(daily);
    if (this.enabled && (!this.apiKey || !/^gemini-[a-z0-9.-]{1,80}$/.test(this.model))) {
      throw new Error('Configure GEMINI_API_KEY and a valid GEMINI_PASSWORD_MODEL before enabling AI');
    }
  }

  status(): { available: boolean; provider: 'GEMINI' } {
    return { available: this.enabled, provider: 'GEMINI' };
  }

  async recommend(ownerId: string, input: unknown) {
    const parsed = passwordPreferencesSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('AI_PASSWORD_INVALID_PREFERENCES');
    if (!this.enabled) throw new ServiceUnavailableException('AI_PASSWORD_NOT_CONFIGURED');
    if (!ownerId) throw new BadRequestException('AI_PASSWORD_INVALID_PREFERENCES');
    this.reserve(ownerId);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        redirect: 'error',
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: JSON.stringify(parsed.data) }] }],
          generationConfig: {
            responseMimeType: 'application/json', responseJsonSchema: RESPONSE_SCHEMA,
            maxOutputTokens: 512, candidateCount: 1,
          },
        }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        this.logger.warn(`Gemini password policy request failed (HTTP ${response.status}); no provider content logged.`);
        throw new ServiceUnavailableException(response.status === 429 ? 'AI_PASSWORD_PROVIDER_LIMIT' : 'AI_PASSWORD_UNAVAILABLE');
      }
      const content = await this.readResponse(response);
      const envelope = envelopeSchema.safeParse(JSON.parse(content));
      if (!envelope.success || envelope.data.promptFeedback?.blockReason) {
        throw new ServiceUnavailableException('AI_PASSWORD_INVALID_RESPONSE');
      }
      const recommendation = passwordRecommendationSchema.safeParse(JSON.parse(envelope.data.candidates[0].content.parts[0].text));
      if (!recommendation.success || !matchesPreferences(recommendation.data, parsed.data)) {
        throw new ServiceUnavailableException('AI_PASSWORD_INVALID_RESPONSE');
      }
      return { source: 'GEMINI' as const, policy: { length: recommendation.data.length, symbols: recommendation.data.symbols },
        reason: recommendation.data.reason };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.warn(controller.signal.aborted
        ? 'Gemini password policy request timed out; no content logged.'
        : 'Gemini password policy request failed validation or transport; no content logged.');
      throw new ServiceUnavailableException(controller.signal.aborted ? 'AI_PASSWORD_TIMEOUT'
        : error instanceof SyntaxError ? 'AI_PASSWORD_INVALID_RESPONSE' : 'AI_PASSWORD_UNAVAILABLE');
    } finally {
      clearTimeout(timer);
      this.active.delete(ownerId);
    }
  }

  private reserve(ownerId: string): void {
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    if (day !== this.day) { this.day = day; this.total = 0; this.usage.clear(); }
    const counter = this.usage.get(ownerId) ?? { minuteStarted: now, minute: 0, daily: 0 };
    if (now - counter.minuteStarted >= 60_000) { counter.minuteStarted = now; counter.minute = 0; }
    if (counter.daily >= 20 || this.total >= this.dailyLimit) throw new HttpException('AI_PASSWORD_DAILY_LIMIT', HttpStatus.TOO_MANY_REQUESTS);
    if (counter.minute >= 5) throw new HttpException('AI_PASSWORD_RATE_LIMIT', HttpStatus.TOO_MANY_REQUESTS);
    if (this.active.has(ownerId) || this.active.size >= 2) throw new HttpException('AI_PASSWORD_BUSY', HttpStatus.TOO_MANY_REQUESTS);
    counter.daily += 1; counter.minute += 1; this.total += 1;
    this.usage.set(ownerId, counter);
    this.active.add(ownerId);
  }

  private async readResponse(response: Response): Promise<string> {
    if (!response.body) throw new ServiceUnavailableException('AI_PASSWORD_INVALID_RESPONSE');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > RESPONSE_LIMIT) {
          await reader.cancel();
          throw new ServiceUnavailableException('AI_PASSWORD_INVALID_RESPONSE');
        }
        chunks.push(value);
      }
      return Buffer.concat(chunks).toString('utf8');
    } finally { reader.releaseLock(); }
  }
}
