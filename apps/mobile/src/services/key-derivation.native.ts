import Constants, { ExecutionEnvironment } from 'expo-constants';
import { configureKeyDerivation } from '@senha-facil/crypto';

export function configureMobileKeyDerivation(): void {
  configureKeyDerivation(async (password, salt, iterations, length) => {
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      throw new Error('Use o development build do Senha Facil. O Expo Go nao inclui a criptografia nativa necessaria para entrar no cofre.');
    }
    const { pbkdf2 } = await import('react-native-quick-crypto');
    return new Promise<Uint8Array>((resolve, reject) => {
      pbkdf2(password, salt, iterations, length, 'sha256', (error, result) => {
        if (error) { reject(error); return; }
        if (!result) { reject(new Error('INVALID_DERIVED_KEY')); return; }
        try { resolve(Uint8Array.from(result)); }
        finally { result.fill(0); }
      });
    });
  });
}