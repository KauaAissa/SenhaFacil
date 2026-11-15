import { randomUUID } from 'expo-crypto';
import type { VaultKey } from '@senha-facil/crypto';
import { offlineVaultService } from './offline-vault.service';
import { vaultCryptoService } from './vault-crypto.service';
import { apiClient } from './api.client';
import { UserFacingError } from './error-messages';

type Action = 'REVEAL' | 'COPY' | 'DELETE';
export type SecurityReportType = 'BULK_REVEAL' | 'BULK_COPY' | 'BULK_DELETE';
export interface LocalSecurityReport { id: string; type: SecurityReportType; occurredAt: string; count: number }
interface ActivityWindow { started: number; ids: Set<string>; count: number }
const thresholds: Record<Action, number> = { REVEAL: 5, COPY: 10, DELETE: 3 };
const types: Record<Action, SecurityReportType> = { REVEAL: 'BULK_REVEAL', COPY: 'BULK_COPY', DELETE: 'BULK_DELETE' };

export class ActivityConfirmationRequired extends UserFacingError {
  constructor() {
    super('Foram feitas várias ações em pouco tempo. Confirme que é você para continuar. Suas senhas não foram apagadas.');
  }
}

export class VaultActivityService {
  private owner: string | null = null;
  private epoch = 0;
  private graceUntil = 0;
  private readonly windows = new Map<Action, ActivityWindow>();
  private blockedKey: VaultKey | null = null;
  private incident: LocalSecurityReport | null = null;
  private incidentSaved = false;
  private authenticatedKey: VaultKey | null = null;
  private operations: Promise<void> = Promise.resolve();

  reset(): void {
    this.epoch += 1; this.owner = null; this.graceUntil = 0;
    this.windows.clear(); this.blockedKey = null; this.incident = null; this.incidentSaved = false; this.authenticatedKey = null;
  }

  sessionVersion(): number {
    const owner = offlineVaultService.accountId;
    if (!owner || !vaultCryptoService.isLoaded) throw new Error('Cofre bloqueado.');
    if (this.owner !== owner) { this.reset(); this.owner = owner; }
    return this.epoch;
  }

  requireRecentAuthentication(): void {
    const owner = this.owner;
    if (!owner || !this.authenticatedKey || performance.now() >= this.graceUntil) throw new Error('Cofre bloqueado.');
    this.requireCurrent(owner, this.epoch);
    if (vaultCryptoService.key !== this.authenticatedKey) throw new Error('SESSION_CHANGED');
  }

  private requireCurrent(owner: string, epoch: number): void {
    if (this.owner !== owner || this.epoch !== epoch || offlineVaultService.accountId !== owner || !vaultCryptoService.isLoaded) {
      throw new Error('SESSION_CHANGED');
    }
  }

  private async saveIncident(owner: string, epoch: number): Promise<void> {
    if (!this.incident || this.incidentSaved) return;
    this.requireCurrent(owner, epoch);
    await offlineVaultService.recordSecurityReport(this.incident);
    this.requireCurrent(owner, epoch);
    this.incidentSaved = true;
  }

  async authorize(action: Action, itemId: string): Promise<void> {
    const owner = offlineVaultService.accountId;
    if (!owner || !vaultCryptoService.isLoaded) throw new Error('Cofre bloqueado.');
    this.sessionVersion();
    const epoch = this.epoch;
    const operation = this.operations.catch(() => undefined).then(async () => {
      this.requireCurrent(owner, epoch);
      if (this.blockedKey) {
        await this.saveIncident(owner, epoch);
        throw new ActivityConfirmationRequired();
      }
      const now = performance.now();
      if (now < this.graceUntil) return;
      let window = this.windows.get(action);
      if (!window || now - window.started >= 60_000) {
        window = { started: now, ids: new Set(), count: 0 };
        this.windows.set(action, window);
      }
      const resolved = await offlineVaultService.resolveId(itemId);
      const normalized = await Promise.all([...window.ids].map((id) => offlineVaultService.resolveId(id)));
      this.requireCurrent(owner, epoch);
      window.ids = new Set(normalized);
      if (action === 'COPY') window.count += 1;
      else { window.ids.add(resolved); window.count = window.ids.size; }
      if (window.count < thresholds[action]) return;
      this.blockedKey = vaultCryptoService.key;
      this.incident = { id: randomUUID(), type: types[action], count: window.count, occurredAt: new Date(apiClient.getServerTime()).toISOString() };
      this.incidentSaved = false;
      await this.saveIncident(owner, epoch);
      throw new ActivityConfirmationRequired();
    });
    this.operations = operation;
    await operation;
  }

  async confirmedAfterAuthentication(): Promise<void> {
    const owner = this.owner;
    const epoch = this.epoch;
    if (!owner || !this.blockedKey) throw new UserFacingError('Abra novamente a ação que precisa confirmar.');
    this.requireCurrent(owner, epoch);
    if (vaultCryptoService.key === this.blockedKey) throw new UserFacingError('Confirme pelo bloqueio do celular, biometria ou senha mestra antes de continuar.');
    await this.saveIncident(owner, epoch);
    this.requireCurrent(owner, epoch);
    this.graceUntil = performance.now() + 60_000;
    this.authenticatedKey = vaultCryptoService.key;
    this.windows.clear(); this.blockedKey = null; this.incident = null; this.incidentSaved = false;
  }
}

export const vaultActivityService = new VaultActivityService();
