import { requireOptionalNativeModule } from 'expo';
import type { LocationObject } from 'expo-location';
import { apiClient } from './api.client';
import type { AccessRequestLocation } from './access-api.service';
import { UserFacingError } from './error-messages';
import { nativePromptService } from './native-prompt.service';

type CaptureResult =
  | { available: true; location: AccessRequestLocation }
  | { available: false; message: string };

async function locationModule() {
  if (!requireOptionalNativeModule('ExpoLocation')) {
    throw new UserFacingError('Instale a nova versão Android do Senha Fácil para ativar a localização. Atualizar a tela não adiciona esse recurso ao aplicativo antigo.');
  }
  return import('expo-location');
}

export function pointFromFix(fix: LocationObject, deviceTime: number, serverTime: number): AccessRequestLocation | null {
  const { latitude, longitude, accuracy } = fix.coords;
  const age = deviceTime - fix.timestamp;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
    !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
    accuracy === null || !Number.isFinite(accuracy) || accuracy < 0 ||
    !Number.isFinite(age) || age < -5_000 || age > 60_000) return null;
  return { latitude, longitude, accuracy, capturedAt: new Date(serverTime - Math.max(0, age)).toISOString() };
}

export const requestLocationService = {
  async requirePermission(): Promise<void> {
    try {
      const location = await locationModule();
      let permission = await location.getForegroundPermissionsAsync();
      if (!permission.granted && permission.canAskAgain) {
        permission = await nativePromptService.run(() => location.requestForegroundPermissionsAsync());
      }
      if (!permission.granted) {
        throw new UserFacingError('Para ativar o acesso assistido, permita a localização nas configurações de permissões deste aplicativo. Sem isso, você ainda pode salvar senhas comuns. A posição só será coletada ao enviar um pedido.');
      }
    } catch (error) {
      if (error instanceof UserFacingError) throw error;
      throw new UserFacingError('Não foi possível conferir a permissão de localização. Tente novamente antes de ativar o acesso assistido. Senhas comuns continuam disponíveis.');
    }
  },

  async captureOnce(isCurrent: () => boolean = () => true): Promise<CaptureResult> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const interrupted: CaptureResult = { available: false, message: 'A tentativa de obter a localização foi interrompida. Abra a senha novamente para continuar.' };
    const canCapture = () => !timedOut && isCurrent();
    try {
      const capture = async (): Promise<CaptureResult> => {
        if (!canCapture()) return interrupted;
        const location = await locationModule();
        if (!canCapture()) return interrupted;
        const permission = await location.getForegroundPermissionsAsync();
        if (!permission.granted) return { available: false, message: 'A permissão de localização não está disponível. O familiar será avisado de que o pedido está sem localização.' };
        if (!canCapture()) return interrupted;
        if (!(await location.hasServicesEnabledAsync())) {
          return { available: false, message: 'A localização do celular está desligada. O familiar será avisado de que o pedido está sem localização.' };
        }
        if (!canCapture()) return interrupted;
        const fix = await location.getCurrentPositionAsync({
          accuracy: location.Accuracy.Balanced, mayShowUserSettingsDialog: false,
        });
        if (!canCapture()) return interrupted;
        const point = pointFromFix(fix, Date.now(), apiClient.getServerTime());
        return point ? { available: true, location: point } : {
          available: false, message: 'Não foi possível obter uma posição recente com precisão informada. O pedido seguirá sem localização.',
        };
      };
      return await Promise.race([
        capture(),
        new Promise<CaptureResult>((resolve) => {
          timer = setTimeout(() => {
            timedOut = true;
            resolve({ available: false, message: 'A localização demorou demais. O pedido seguirá sem localização, com aviso ao familiar.' });
          }, 12_000);
        }),
      ]);
    } catch (error) {
      return { available: false, message: error instanceof UserFacingError ? error.message
        : 'Não foi possível obter sua localização. O pedido seguirá sem localização, com aviso ao familiar.' };
    } finally { if (timer !== undefined) clearTimeout(timer); }
  },
};
