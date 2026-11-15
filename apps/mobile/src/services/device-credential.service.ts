import { requireOptionalNativeModule } from 'expo';
import { UserFacingError } from './error-messages';
import { nativePromptService } from './native-prompt.service';

interface NativeStatus {
  supported: boolean;
  secure: boolean;
  enabled: boolean;
  needsReactivation: boolean;
}

interface DeviceCredentialModule {
  getStatus(ownerId: string): Promise<NativeStatus>;
  enable(ownerId: string, keyBase64: string): Promise<void>;
  unlock(ownerId: string): Promise<string>;
  disable(ownerId: string): Promise<void>;
  reconcile(ownerId: string, keyBase64: string): Promise<void>;
  cancel(): Promise<void>;
}

export interface DeviceLockStatus {
  available: boolean;
  enabled: boolean;
  reason: string;
}

function nativeModule(): DeviceCredentialModule | null {
  return requireOptionalNativeModule<DeviceCredentialModule>('SenhaFacilDeviceCredential');
}

function requireModule(): DeviceCredentialModule {
  const module = nativeModule();
  if (!module) throw new UserFacingError('Instale a nova versão Android do Senha Fácil para usar o bloqueio do aparelho. Sua senha mestra continua disponível.');
  return module;
}

export const deviceCredentialService = {
  async status(ownerId: string): Promise<DeviceLockStatus> {
    const module = nativeModule();
    if (!module) return { available: false, enabled: false,
      reason: 'Esta opção precisa da nova versão Android do aplicativo. Use sua senha mestra ou a biometria já ativada.' };
    const status = await module.getStatus(ownerId);
    return {
      available: status.supported && status.secure,
      enabled: status.enabled,
      reason: !status.supported ? 'O bloqueio do aparelho exige Android 11 ou superior. Sua senha mestra e a biometria continuam disponíveis.'
        : status.needsReactivation ? 'O bloqueio do aparelho foi removido ou a chave mudou. Use sua senha mestra e ative esta opção novamente.'
          : !status.secure ? 'Configure um PIN, padrão ou senha no bloqueio de tela do Android. Depois volte aqui para ativar.'
            : 'O Android pedirá o PIN, padrão ou senha que já protege este aparelho. Nada disso é enviado ao Senha Fácil.',
    };
  },
  async enable(ownerId: string, keyBase64: string): Promise<void> {
    const module = requireModule();
    await nativePromptService.run(() => module.enable(ownerId, keyBase64));
  },
  async unlock(ownerId: string): Promise<string> {
    const module = requireModule();
    try { return await nativePromptService.run(() => module.unlock(ownerId)); }
    catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'DEVICE_AUTH_KEY_INVALIDATED') {
        await module.disable(ownerId);
      }
      throw error;
    }
  },
  async disable(ownerId: string): Promise<void> {
    const module = nativeModule();
    if (module) await module.disable(ownerId);
  },
  async reconcile(ownerId: string, keyBase64: string): Promise<void> {
    const module = nativeModule();
    if (module) await module.reconcile(ownerId, keyBase64);
  },
  cancel(): void {
    const module = nativeModule();
    if (module) void module.cancel().catch(() => {
      console.error('Não foi possível cancelar a autenticação do aparelho. O resultado será descartado pela sessão.');
    });
  },
};
