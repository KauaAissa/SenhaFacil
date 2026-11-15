import { getAllowedOrigins, getHttpConfiguration } from '../src/http.config';

const production = {
  NODE_ENV: 'production',
  JWT_SECRET: 'fictitious-production-key-'.repeat(4),
  DATABASE_URL: 'postgresql://fixture:fixture@database:5432/fixture',
};

test('keeps local defaults without trusting forwarding headers', () => {
  expect(getHttpConfiguration({})).toEqual({ port: 3000, trustProxy: false, origins: [] });
});

test('uses provider port and only the configured proxy hop count', () => {
  expect(getHttpConfiguration({ ...production, PORT: '8080', TRUST_PROXY_HOPS: '1' }))
    .toEqual({ port: 8080, trustProxy: 1, origins: [] });
});

test('normalizes the same CORS origins for HTTP and WebSocket', () => {
  const environment = { ALLOWED_ORIGINS: ' https://preview.example.invalid, ,http://localhost:8081 ' };
  expect(getHttpConfiguration(environment).origins)
    .toEqual(['https://preview.example.invalid', 'http://localhost:8081']);
  expect(getAllowedOrigins(environment)).toEqual(getHttpConfiguration(environment).origins);
});

test.each(['', '0', '-1', '65536', '3000.5', '3000x', ' 3000', 'Infinity'])(
  'rejects invalid PORT %p explicitly', (PORT) => {
    expect(() => getHttpConfiguration({ PORT })).toThrow('PORT');
  },
);

test.each(['', '0', '-1', '6', '1.5', 'true'])(
  'rejects unsafe or invalid proxy hop configuration %p', (TRUST_PROXY_HOPS) => {
    expect(() => getHttpConfiguration({ TRUST_PROXY_HOPS })).toThrow('TRUST_PROXY_HOPS');
  },
);

test.each([undefined, '', 'short', 'change-me-'.repeat(10)])(
  'rejects missing or illustrative production signing keys', (JWT_SECRET) => {
    expect(() => getHttpConfiguration({ ...production, JWT_SECRET })).toThrow('JWT_SECRET');
  },
);

test.each([undefined, '', 'https://database.example.invalid', '"postgresql://fixture/db"'])(
  'rejects missing or invalid production database configuration', (DATABASE_URL) => {
    expect(() => getHttpConfiguration({ ...production, DATABASE_URL })).toThrow('DATABASE_URL');
  },
);
