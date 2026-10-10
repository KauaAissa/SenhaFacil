import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { configureRandomSource, createProtection, openProtection, recoverProtection, changeProtection,
  deriveAuthentication, importVaultKey, encryptVaultItem, decryptVaultItem, destroyVaultKey,
  recoveryAuthentication, type VaultProtection, type VaultKey } from '../src';

configureRandomSource((length) => new Uint8Array(randomBytes(length)));

test('password rotation and recovery preserve existing ciphertext and isolate authentication from vault key', async () => {
  const legacy = importVaultKey(new Uint8Array(32).fill(42), true);
  const encrypted = await encryptVaultItem({ password: 'existing secret' }, legacy);
  const created = await createProtection('first strong password', undefined, legacy);
  const opened = await openProtection('first strong password', created.protection);
  const rotated = await changeProtection('new strong password', opened, created.protection);
  const changed = await openProtection('new strong password', rotated.protection);
  const recovered = await recoverProtection(created.recoveryCode, rotated.protection);
  for (const key of [opened, changed, recovered]) assert.equal((await decryptVaultItem(encrypted, key)).password, 'existing secret');
  assert.notEqual(created.credential, rotated.credential);
  const authKey = importVaultKey(Buffer.from(await deriveAuthentication('new strong password', rotated.protection.salt), 'hex'));
  await assert.rejects(decryptVaultItem(rotated.protection.passwordEnvelope, authKey));
  await assert.rejects(openProtection('first strong password', rotated.protection));
  await assert.rejects(recoverProtection('00'.repeat(32), rotated.protection));
  await assert.rejects(recoverProtection('invalid', rotated.protection));
  await assert.rejects(openProtection('new strong password', { ...rotated.protection,
    passwordEnvelope: { ...rotated.protection.passwordEnvelope, iv: Buffer.alloc(12).toString('base64') } }));
  for (const key of [legacy, opened, changed, recovered, authKey]) destroyVaultKey(key);
});

interface HttpSession {
  accessToken: string;
  refreshToken: string;
  user: { id: string; vaultProtection: VaultProtection; securityVersion: number };
}

test('HTTP protection contract preserves vault data across rotation and recovery', {
  skip: process.env.HTTP_TESTS !== '1', timeout: 60_000,
}, async () => {
  const fixtures: { email: string; credential: string; session: HttpSession; prepared: Awaited<ReturnType<typeof createProtection>> }[] = [];
  const keys: VaultKey[] = [];
  async function request<Result = unknown>(path: string, body?: unknown, token?: string, method = 'POST', expected = 200): Promise<Result> {
    const response = await fetch(`${process.env.HTTP_API_URL ?? 'http://localhost:3000'}${path}`, { method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    assert.equal(response.status, expected, `${path}: unexpected HTTP status`);
    return response.status === 204 ? undefined as Result : await response.json() as Result;
  }
  async function register(role: 'ELDERLY' | 'CAREGIVER') {
    const prepared = await createProtection('fictitious HTTP password'); keys.push(prepared.key);
    const email = `${randomUUID()}@example.invalid`;
    const session = await request<HttpSession>('/auth/register', { name: 'HTTP fixture', email, role, authVersion: 2,
      password: prepared.credential, kdfSalt: prepared.protection.salt, protection: prepared.protection,
      recoveryCredential: prepared.recoveryCredential }, undefined, 'POST', 201);
    const fixture = { email, credential: prepared.credential, session, prepared }; fixtures.push(fixture); return fixture;
  }
  try {
    const owner = await register('ELDERLY'); const caregiver = await register('CAREGIVER');
    const cipher = await encryptVaultItem({ password: 'fictitious vault value' }, owner.prepared.key);
    const item = await request<{ id: string }>('/vault', { label: 'HTTP fixture item', category: 'OTHER',
      encryptedPayload: cipher.ciphertext, iv: cipher.iv, requiresApproval: true, isFavorite: false }, owner.session.accessToken, 'POST', 201);
    const contact = await request<{ id: string }>('/contacts/invite', { caregiverEmail: caregiver.email }, owner.session.accessToken, 'POST', 201);
    await request(`/contacts/${contact.id}/accept`, {}, caregiver.session.accessToken);
    await request(`/contacts/${contact.id}/permissions`, { permissions: ['VIEW_ITEMS', 'APPROVE_ACCESS'] }, owner.session.accessToken, 'PATCH');
    const pending = await request<{ accessLogId: string }>('/access/request', { vaultItemId: item.id }, owner.session.accessToken, 'POST', 201);
    await request(`/access/${pending.accessLogId}/cancel`, {}, owner.session.accessToken, 'POST', 201);
    assert.equal((await request<{ status: string }>(`/access/${pending.accessLogId}`, undefined, owner.session.accessToken, 'GET')).status, 'CANCELLED');

    const changed = await changeProtection('fictitious changed password', owner.prepared.key, owner.prepared.protection);
    await request('/auth/security', { currentCredential: owner.credential, credential: changed.credential, protection: changed.protection,
      securityVersion: 1 }, owner.session.accessToken);
    owner.credential = changed.credential;
    await request('/users/me', undefined, owner.session.accessToken, 'GET', 401);
    owner.session = await request<HttpSession>('/auth/login', { email: owner.email, password: owner.credential, authVersion: 2 });
    const changedKey = await openProtection('fictitious changed password', owner.session.user.vaultProtection); keys.push(changedKey);
    assert.equal((await decryptVaultItem(cipher, changedKey)).password, 'fictitious vault value');

    const proof = recoveryAuthentication(owner.prepared.recoveryCode, changed.protection.recoverySalt);
    const info = await request<{ protection: VaultProtection; securityVersion: number }>('/auth/recovery-info', { email: owner.email, recoveryCredential: proof });
    const recoveredKey = await recoverProtection(owner.prepared.recoveryCode, info.protection); keys.push(recoveredKey);
    const renewed = await createProtection('fictitious recovered password', undefined, recoveredKey);
    await request('/auth/recover', { email: owner.email, recoveryCredential: proof, credential: renewed.credential,
      newRecoveryCredential: renewed.recoveryCredential, securityVersion: info.securityVersion, protection: renewed.protection });
    owner.credential = renewed.credential;
    owner.session = await request<HttpSession>('/auth/login', { email: owner.email, password: owner.credential, authVersion: 2 });
    const recovered = await openProtection('fictitious recovered password', owner.session.user.vaultProtection); keys.push(recovered);
    assert.equal((await decryptVaultItem(cipher, recovered)).password, 'fictitious vault value');
    await request('/auth/recovery-info', { email: owner.email, recoveryCredential: proof }, undefined, 'POST', 401);
    const history = await request<{ items: { status: string }[] }>('/access/history/page', undefined, owner.session.accessToken, 'GET');
    assert.equal(history.items[0].status, 'CANCELLED');
    const requestId = randomUUID();
    const refreshed = await request<HttpSession>('/auth/refresh', { refreshToken: owner.session.refreshToken, requestId });
    const retry = await request<HttpSession>('/auth/refresh', { refreshToken: owner.session.refreshToken, requestId });
    assert.ok(refreshed.refreshToken === retry.refreshToken, 'Lost-response retry must return the same refresh token');
  } finally {
    for (const key of keys) destroyVaultKey(key);
    for (const fixture of fixtures) {
      const session = await request<HttpSession>('/auth/login', { email: fixture.email, password: fixture.credential, authVersion: 2 });
      await request('/users/me', { password: fixture.credential }, session.accessToken, 'DELETE', 204);
    }
  }
});