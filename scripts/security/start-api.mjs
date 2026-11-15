import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const database = new URL(process.env.SECURITY_DATABASE_URL ?? 'postgresql://security_test:security_test_only@127.0.0.1:5433/security_test?schema=public');
if (database.hostname !== '127.0.0.1' || database.port !== '5433' || database.pathname !== '/security_test') {
  throw new Error('Security scans require the isolated local security_test database on port 5433.');
}

const environment = {
  ...process.env,
  DATABASE_URL: database.toString(),
  PORT: '3101',
  NODE_ENV: 'production',
  JWT_SECRET: randomBytes(64).toString('hex'),
  JWT_EXPIRES_IN: '1h',
  ALLOWED_ORIGINS: 'http://127.0.0.1:8091',
  FIREBASE_PROJECT_ID: '',
  GOOGLE_APPLICATION_CREDENTIALS: '',
  FIREBASE_CLIENT_EMAIL: '',
  FIREBASE_PRIVATE_KEY: '',
  NODE_PATH: `${root}apps/api/node_modules;${root}node_modules`,
};

if (process.argv.includes('--check')) {
  console.log('Isolated security target: port 3101, database security_test:5433, Firebase disabled.');
} else {
  const child = spawn(process.execPath, [process.env.SECURITY_API_ENTRY ?? 'dist/main.js'], {
    cwd: `${root}apps/api`, env: environment, stdio: 'inherit',
  });
  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
  child.on('error', () => { console.error('Isolated API could not start. Build apps/api first.'); process.exitCode = 1; });
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
}