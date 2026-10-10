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