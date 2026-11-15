import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';
import { UserFacingError } from './error-messages';

let pending: Promise<string> | null = null;
export function installationId(): Promise<string> {
  if (!pending) {
    pending = (async () => {
      const stored = await SecureStore.getItemAsync('sf_installation_v1');
      if (stored) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stored)) {
          throw new UserFacingError('Não foi possível identificar esta instalação com segurança. Reinicie o aplicativo antes de entrar.');
        }
        return stored;
      }
      const id = randomUUID();
      await SecureStore.setItemAsync('sf_installation_v1', id, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
      return id;
    })();
    void pending.catch(() => { pending = null; });
  }
  return pending;
}
