import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cryptoModule from '../../packages/crypto/src/index.ts';

const { configureRandomSource, createProtection, destroyVaultKey, encryptVaultItem } = cryptoModule;

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.SECURITY_RUN_DIR ?? 'D:/SenhaFacil-security/runs/2026-10-17';
const base = 'http://127.0.0.1:3101';
const proxy = 'http://127.0.0.1:8091';
const apiKey = randomBytes(32).toString('hex');
const children = [];
const streams = [];
const keys = [];
const checks = [];
const traffic = [];
const result = { startedAt: new Date().toISOString(), target: base, checks, traffic, activeScan: null, completed: false };
configureRandomSource((size) => new Uint8Array(randomBytes(size)));

async function zap(component, type, action, parameters = {}) {
  const url = new URL(`/JSON/${component}/${type}/${action}/`, proxy);
  url.search = new URLSearchParams({ apikey: apiKey, ...parameters }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const body = await response.json();
  if (!response.ok || body.code) throw new Error(`ZAP ${component}/${action} failed: ${body.code ?? response.status}`);
  return body;
}

async function startService(executable, args, readyPattern, filename, options = {}) {
  const stream = createWriteStream(path.join(output, filename));
  streams.push(stream);
  const child = spawn(executable, args, { cwd: root, windowsHide: true, ...options });
  children.push(child);
  await new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => reject(new Error(`${filename}: startup timeout`)), 90_000);
    const receive = (data) => {
      stream.write(data);
      buffer = (buffer + data.toString()).slice(-16_000);
      if (readyPattern.test(buffer)) { clearTimeout(timeout); resolve(); }
    };
    child.stdout.on('data', receive);
    child.stderr.on('data', receive);
    child.once('error', () => { clearTimeout(timeout); reject(new Error(`${filename}: launch failed`)); });
    child.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`${filename}: exited ${code} before completion`)); });
  });
  return child;
}

async function request(endpoint, { method = 'GET', body, token, headers = {} } = {}) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const response = await new Promise((resolve, reject) => {
    const outgoing = http.request({ hostname: '127.0.0.1', port: 8091, method, path: `${base}${endpoint}`,
      headers: { Host: '127.0.0.1:3101', ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers } }, (incoming) => {
      let text = '';
      incoming.setEncoding('utf8');
      incoming.on('data', (chunk) => { text += chunk; });
      incoming.on('end', () => {
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = text; }
        resolve({ status: incoming.statusCode, headers: incoming.headers, data, text });
      });
    });
    outgoing.setTimeout(20_000, () => outgoing.destroy(new Error('Target request timed out')));
    outgoing.on('error', reject);
    outgoing.end(payload);
  });
  traffic.push({ method, path: endpoint, status: response.status, authenticated: Boolean(token) });
  return response;
}

async function check(title, endpoint, expected, options = {}, predicate = () => true) {
  const response = await request(endpoint, options);
  const accepted = Array.isArray(expected) ? expected : [expected];
  const passed = accepted.includes(response.status) && predicate(response);
  checks.push({ title, method: options.method ?? 'GET', path: endpoint, expected: accepted, actual: response.status, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${title}: HTTP ${response.status}`);
  return response;
}

async function register(role) {
  const prepared = await createProtection(`fictitious-audit-${randomUUID()}`);
  keys.push(prepared.key);
  const email = `${randomUUID()}@example.invalid`;
  const response = await check(`Fixture ${role}: cadastro isolado`, '/auth/register', 201, { method: 'POST', body: {
    name: 'Security audit fixture', email, role, authVersion: 2, password: prepared.credential,
    kdfSalt: prepared.protection.salt, protection: prepared.protection, recoveryCredential: prepared.recoveryCredential,
  } });
  assert.equal(response.status, 201, 'Isolated fixture registration failed');
  return { email, prepared, ...response.data };
}

try {
  await mkdir(output, { recursive: true });
  const zapHome = path.join(output, `zap-home-${randomUUID()}`);
  await mkdir(zapHome, { recursive: true });
  await startService('D:/Android/Java21/jdk-21.0.12.1+1/bin/java.exe', [
    '-Xmx512m', `-Djava.io.tmpdir=${output}`, '-jar', 'D:/SenhaFacil-security/tools/zap/ZAP_2.17.0/zap-2.17.0.jar',
    '-daemon', '-host', '127.0.0.1', '-port', '8091', '-dir', zapHome, '-silent', '-config', `api.key=${apiKey}`,
  ], /ZAP is now listening/i, 'zap-console.log');
  result.zapVersion = (await zap('core', 'view', 'version')).version;
  await startService(process.execPath, ['scripts/security/start-api.mjs'], /Nest application successfully started/, 'api-console.log', {
    env: { ...process.env, SECURITY_API_ENTRY: path.join(output, 'api-build', 'main.js') },
  });
  result.firebaseDisabled = true;
  console.log(`Isolated DAST started with OWASP ZAP ${result.zapVersion}.`);

  for (const endpoint of ['/users/me', '/vault', '/vault/sync', '/contacts', '/access/history', '/access/pending']) {
    await check('JWT ausente nao acessa ' + endpoint, endpoint, 401);
  }
  await check('JWT adulterado e rejeitado', '/users/me', 401, { token: 'invalid.header.signature' });
  await check('Arquivo .env nao e servido', '/.env', 404);
  await check('Repositorio Git nao e servido', '/.git/config', 404);
  await check('Metodo TRACE indisponivel', '/users/me', [404, 405], { method: 'TRACE' });
  await check('Erro nao expoe stack ou SQL', '/not-a-real-route', 404, {}, ({ text }) => !/PrismaClient|node_modules|SELECT .+ FROM|at .+\.js:\d/.test(text));
  await check('Objeto como email e rejeitado', '/auth/parameters', 400, { method: 'POST', body: { email: { $ne: null } } });
  await check('Entrada SQL em email e rejeitada', '/auth/parameters', 400, { method: 'POST', body: { email: "audit' OR 1=1--" } });
  await check('Propriedade extra e rejeitada', '/auth/parameters', 400, { method: 'POST', body: { email: 'audit@example.invalid', isAdmin: true } });
  await check('Chave __proto__ e rejeitada', '/auth/parameters', 400, { method: 'POST', body: JSON.parse('{"email":"audit@example.invalid","__proto__":{"isAdmin":true}}') });

  const owner = await register('ELDERLY');
  const caregiver = await register('CAREGIVER');
  const stranger = await register('ELDERLY');
  await check('Perfil autenticado sem segredos de autenticacao', '/users/me', 200, { token: owner.accessToken }, ({ data }) =>
    data.id === owner.user.id && !('passwordHash' in data) && !('recoveryCredentialHash' in data) && !('refreshToken' in data));
  await check('Origem externa sem permissao CORS', '/users/me', 200, { token: owner.accessToken, headers: { Origin: 'https://untrusted.example.invalid' } },
    ({ headers }) => !headers['access-control-allow-origin']);
  await check('Headers de protecao presentes', '/users/me', 200, { token: owner.accessToken }, ({ headers }) =>
    headers['x-content-type-options'] === 'nosniff' && Boolean(headers['content-security-policy']) && Boolean(headers['x-frame-options']));
  const encrypted = await encryptVaultItem({ password: 'fictitious-audit-vault-value' }, owner.prepared.key);
  const created = await check('Item cifrado criado na fixture', '/vault', 201, { method: 'POST', token: owner.accessToken, body: {
    label: 'Security fixture', category: 'OTHER', encryptedPayload: encrypted.ciphertext, iv: encrypted.iv, requiresApproval: true, isFavorite: false,
  } });
  assert.equal(created.status, 201, 'Encrypted fixture failed');
  const item = created.data;
  await check('Outra conta nao lista o item do titular', '/vault', 200, { token: stranger.accessToken }, ({ data }) => Array.isArray(data) && !data.some((entry) => entry.id === item.id));
  await check('IDOR: outra conta nao altera item', `/vault/${item.id}`, 404, { method: 'PATCH', token: stranger.accessToken, body: { label: 'Unauthorized change' } });
  await check('IDOR: outra conta nao exclui item', `/vault/${item.id}`, 404, { method: 'DELETE', token: stranger.accessToken });
  await check('Cuidador nao lista ciphertext do titular', '/vault', 200, { token: caregiver.accessToken }, ({ data }) => !JSON.stringify(data).includes(encrypted.ciphertext));
  const invited = await check('Vinculo de teste criado', '/contacts/invite', 201, { method: 'POST', token: owner.accessToken, body: { caregiverEmail: caregiver.email } });
  assert.equal(invited.status, 201);
  const contact = invited.data;
  await check('Cuidador aceita vinculo de teste', `/contacts/${contact.id}/accept`, 200, { method: 'POST', token: caregiver.accessToken, body: {} });
  await check('Titular define permissao de aprovacao', `/contacts/${contact.id}/permissions`, 200, { method: 'PATCH', token: owner.accessToken, body: { permissions: ['VIEW_ITEMS', 'APPROVE_ACCESS'] } });
  await check('Cuidador nao altera as proprias permissoes', `/contacts/${contact.id}/permissions`, 403, { method: 'PATCH', token: caregiver.accessToken, body: { permissions: ['VIEW_ITEMS', 'APPROVE_ACCESS'] } });
  await check('Terceiro nao revoga vinculo alheio', `/contacts/${contact.id}/revoke`, [403, 404], { method: 'POST', token: stranger.accessToken, body: {} });
  const requested = await check('Pedido protegido usa prazo de dez minutos', '/access/request', 201, { method: 'POST', token: owner.accessToken, body: { vaultItemId: item.id } },
    ({ data, headers }) => { const remaining = Date.parse(data.expiresAt) - Date.parse(headers.date); return remaining >= 590_000 && remaining <= 601_000; });
  assert.equal(requested.status, 201);
  const requestId = requested.data.accessLogId;
  await check('Titular nao aprova o proprio pedido', '/access/respond', 403, { method: 'POST', token: owner.accessToken, body: { accessLogId: requestId, decision: 'APPROVED' } });
  await check('Terceiro nao consulta pedido alheio', `/access/${requestId}`, 403, { token: stranger.accessToken });
  await check('Pendentes do cuidador nao incluem ciphertext/senha', '/access/pending', 200, { token: caregiver.accessToken }, ({ data }) =>
    Array.isArray(data) && data.some((entry) => entry.id === requestId) && !JSON.stringify(data).includes(encrypted.ciphertext) && !JSON.stringify(data).includes('fictitious-audit-vault-value'));
  await check('Cuidador autorizado aprova pedido', '/access/respond', 200, { method: 'POST', token: caregiver.accessToken, body: { accessLogId: requestId, decision: 'APPROVED' } });
  await check('Decisao resolvida nao pode ser repetida', '/access/respond', 400, { method: 'POST', token: caregiver.accessToken, body: { accessLogId: requestId, decision: 'DENIED' } });
  await check('Revogacao do vinculo e aceita', `/contacts/${contact.id}/revoke`, 200, { method: 'POST', token: owner.accessToken, body: {} });
  await check('Aprovacao perde validade apos revogar vinculo', `/access/${requestId}`, 200, { token: owner.accessToken }, ({ data }) => data.status !== 'APPROVED');
  await check('Cursor com payload SQL e rejeitado', "/access/history/page?cursor=%27%20OR%201%3D1--", 400, { token: owner.accessToken });
  await check('Logout da fixture e aceito', '/auth/logout', 204, { method: 'POST', body: { refreshToken: stranger.refreshToken } });
  await check('JWT revogado nao volta a acessar perfil', '/users/me', 401, { token: stranger.accessToken });

  await zap('context', 'action', 'newContext', { contextName: 'isolated-security-audit' });
  await zap('context', 'action', 'includeInContext', { contextName: 'isolated-security-audit', regex: '^http://127[.]0[.]0[.]1:3101/.*$' });
  await zap('ascan', 'action', 'addScanPolicy', { scanPolicyName: 'targeted-sql-xss' });
  await zap('ascan', 'action', 'disableAllScanners', { scanPolicyName: 'targeted-sql-xss' });
  await zap('ascan', 'action', 'enableScanners', { ids: '40018,40012', scanPolicyName: 'targeted-sql-xss' });
  await zap('ascan', 'action', 'setOptionThreadPerHost', { Integer: '1' });
  await zap('ascan', 'action', 'setOptionDelayInMs', { Integer: '1500' });
  await zap('ascan', 'action', 'setOptionMaxScanDurationInMins', { Integer: '2' });
  await zap('ascan', 'action', 'setOptionMaxRuleDurationInMins', { Integer: '1' });
  await zap('replacer', 'action', 'addRule', { description: 'audit-authentication', enabled: 'true', matchType: 'REQ_HEADER', matchRegex: 'false',
    matchString: 'Authorization', replacement: `Bearer ${owner.accessToken}`, initiators: '2' });
  const scanPath = `/access/history/page?cursor=${requestId}`;
  await request(scanPath, { token: owner.accessToken });
  const scan = await zap('ascan', 'action', 'scan', { url: base + scanPath, recurse: 'false', scanPolicyName: 'targeted-sql-xss' });
  result.activeScan = { id: scan.scan, rules: ['40018', '40012'], durationLimitMinutes: 2, target: '/access/history/page?cursor=<fixture>', status: 'RUNNING' };
  console.log('ZAP targeted SQL injection/XSS scan started; maximum two minutes, one worker.');
  const scanDeadline = Date.now() + 180_000;
  while (Number((await zap('ascan', 'view', 'status', { scanId: scan.scan })).status) < 100) {
    if (Date.now() > scanDeadline) throw new Error('ZAP targeted scan exceeded its safety deadline');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  result.activeScan.status = 'FINISHED';
  await zap('replacer', 'action', 'removeRule', { description: 'audit-authentication' });
  const passiveDeadline = Date.now() + 60_000;
  while (Number((await zap('pscan', 'view', 'recordsToScan')).recordsToScan) > 0) {
    if (Date.now() > passiveDeadline) throw new Error('Passive scanning did not drain');
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  result.alerts = (await zap('core', 'view', 'alerts', { baseurl: base, start: '0', count: '1000' })).alerts;
  result.zapTraffic = (await zap('core', 'view', 'messages', { baseurl: base, start: '0', count: '1000' })).messages.map((message) => ({
    requestLine: message.requestHeader.split('\r\n')[0], status: Number(message.responseHeader.split(' ')[1]),
  }));
  let rateLimited = false;
  for (let attempt = 0; attempt < 21; attempt++) {
    const response = await request('/auth/parameters', { method: 'POST', body: { email: 'rate-limit-audit@example.invalid' } });
    if (response.status === 429) { rateLimited = true; break; }
  }
  checks.push({ title: 'Limite de requisicoes bloqueia repeticao automatizada', method: 'POST', path: '/auth/parameters', expected: [429], actual: rateLimited ? 429 : 200, passed: rateLimited });
  result.completed = true;
} catch (error) {
  result.failure = error.message;
  console.error('DAST incomplete: ' + error.message);
  process.exitCode = 1;
} finally {
  result.finishedAt = new Date().toISOString();
  result.passed = checks.filter((entry) => entry.passed).length;
  result.failed = checks.filter((entry) => !entry.passed).length;
  await writeFile(path.join(output, 'dast-results.json'), JSON.stringify(result, null, 2));
  for (const key of keys) destroyVaultKey(key);
  for (const child of children.reverse()) {
    if (child.exitCode !== null) continue;
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      await once(killer, 'exit').catch(() => undefined);
    } else child.kill('SIGTERM');
  }
  for (const stream of streams) stream.end();
  console.log(`DAST evidence saved: ${checks.length} checks, ${result.passed} passed, ${result.failed} failed.`);
}