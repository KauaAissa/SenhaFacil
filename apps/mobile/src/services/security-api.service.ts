import { z } from 'zod';
import { apiClient } from './api.client';
import { UserFacingError } from './error-messages';

const types = ['BULK_REVEAL', 'BULK_COPY', 'BULK_DELETE', 'PASSWORD_CHANGED', 'RECOVERY_KIT_REPLACED', 'ACCOUNT_RECOVERED',
  'NEW_DEVICE', 'FAILED_LOGIN_BURST', 'ACCESS_REQUEST_BURST', 'EMERGENCY_BURST', 'EMERGENCY_AFTER_DENIAL', 'SESSIONS_REVOKED'] as const;
const eventSchema = z.object({
  id: z.string().max(100), type: z.enum(types), source: z.enum(['SERVER', 'DEVICE_REPORT']), severity: z.enum(['INFO', 'WARNING']),
  count: z.number().int().positive(), occurredAt: z.string().datetime(), recordedAt: z.string().datetime(), expiresAt: z.string().datetime(),
  user: z.object({ id: z.string(), name: z.string() }).strict(),
}).strict();
const eventsSchema = z.object({ items: z.array(eventSchema).max(30), nextCursor: z.string().nullable() }).strict();
const sessionsSchema = z.object({
  currentSessionId: z.string(), total: z.number().int().nonnegative(),
  items: z.array(z.object({ id: z.string(), createdAt: z.string().datetime(), expiresAt: z.string().datetime(),
    devicePlatform: z.enum(['ANDROID', 'IOS', 'WEB', 'UNKNOWN']).nullable() }).strict()).max(50),
}).strict();
export type SecurityEvent = z.infer<typeof eventSchema>;
export type SecuritySession = z.infer<typeof sessionsSchema>['items'][number];

export const securityApiService = {
  async events(cursor?: string, signal?: AbortSignal) {
    const response = await apiClient.get<unknown>(`/security/events${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, signal);
    const parsed = eventsSchema.safeParse(response);
    if (!parsed.success) throw new UserFacingError('Não foi possível validar os avisos de segurança. Atualize o aplicativo e tente novamente.');
    return parsed.data;
  },
  async sessions(signal?: AbortSignal) {
    const response = await apiClient.get<unknown>('/security/sessions', signal);
    const parsed = sessionsSchema.safeParse(response);
    if (!parsed.success) throw new UserFacingError('Não foi possível validar a lista de sessões. Atualize o aplicativo e tente novamente.');
    return parsed.data;
  },
};
