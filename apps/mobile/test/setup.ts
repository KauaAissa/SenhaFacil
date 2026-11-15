import { pbkdf2 } from 'node:crypto';
import { configureKeyDerivation } from '@senha-facil/crypto';

beforeEach(() => {
  configureKeyDerivation((password, salt, iterations, length) => new Promise<Uint8Array>((resolve, reject) => {
    pbkdf2(password, salt, iterations, length, 'sha256', (error, result) => {
      if (error) { reject(error); return; }
      try { resolve(Uint8Array.from(result)); }
      finally { result.fill(0); }
    });
  }));
});

jest.mock('expo-secure-store', () => {
  const values = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
    deleteItemAsync: jest.fn(async (key: string) => { values.delete(key); }),
    canUseBiometricAuthentication: jest.fn(() => true),
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
  };
});

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  supportedAuthenticationTypesAsync: jest.fn(async () => [1]),
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
}));

jest.mock('expo', () => {
  const deviceKeys = new Map<string, string>();
  const deviceCredential = {
    getStatus: jest.fn(async (owner: string) => ({
      supported: true, secure: true, enabled: deviceKeys.has(owner), needsReactivation: false,
    })),
    enable: jest.fn(async (owner: string, key: string) => { deviceKeys.set(owner, key); }),
    unlock: jest.fn(async (owner: string) => {
      const key = deviceKeys.get(owner);
      if (!key) throw Object.assign(new Error('Missing test key'), { code: 'DEVICE_AUTH_KEY_INVALIDATED' });
      return key;
    }),
    disable: jest.fn(async (owner: string) => { deviceKeys.delete(owner); }),
    reconcile: jest.fn(async (owner: string, key: string) => {
      if (deviceKeys.has(owner) && deviceKeys.get(owner) !== key) deviceKeys.delete(owner);
    }),
    cancel: jest.fn(async () => undefined),
  };
  return { requireOptionalNativeModule: jest.fn((name: string) => name === 'SenhaFacilDeviceCredential' ? deviceCredential : {}) };
});
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  hasServicesEnabledAsync: jest.fn(async () => true),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
}));

jest.mock('expo-crypto', () => {
  const crypto = jest.requireActual('node:crypto');
  return { getRandomBytes: (length: number) => new Uint8Array(crypto.randomBytes(length)), randomUUID: crypto.randomUUID,
    CryptoDigestAlgorithm: { SHA256: 'SHA256' },
    digestStringAsync: async (_algorithm: string, value: string) => crypto.createHash('sha256').update(value).digest('hex') };
});

jest.mock('expo-clipboard', () => {
  let contents = '';
  return { setStringAsync: jest.fn(async (value: string) => { contents = value; return true; }),
    getStringAsync: jest.fn(async () => contents) };
});

jest.mock('expo-sqlite', () => {
  const { DatabaseSync } = jest.requireActual('node:sqlite');
  const databases = new Map();
  function adapter(database: any): any {
    return {
      execAsync: async (sql: string) => database.exec(sql),
      runAsync: async (sql: string, parameters: unknown[] = []) => database.prepare(sql).run(...parameters),
      getAllAsync: async (sql: string, parameters: unknown[] = []) => database.prepare(sql).all(...parameters),
      getFirstAsync: async (sql: string, parameters: unknown[] = []) => database.prepare(sql).get(...parameters) ?? null,
      closeAsync: async () => undefined,
      withExclusiveTransactionAsync: async (callback: (transaction: any) => Promise<void>) => {
        database.exec('BEGIN');
        try { await callback(adapter(database)); database.exec('COMMIT'); }
        catch (error) { database.exec('ROLLBACK'); throw error; }
      },
    };
  }
  return { deleteDatabaseAsync: async (name: string) => { databases.delete(name); }, openDatabaseAsync: jest.fn(async (name: string) => {
    if (!databases.has(name)) databases.set(name, new DatabaseSync(':memory:'));
    return adapter(databases.get(name));
  }) };
});

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => () => undefined),
}));
jest.mock('../src/services/access-socket.service', () => ({
  accessSocketService: { connect: jest.fn(async () => undefined), disconnect: jest.fn() },
}));
jest.mock('../src/services/push-notifications.service', () => ({ registerPushToken: jest.fn(async () => undefined) }));