import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { authenticated, verifyPassword, sessionCookie, bodyText } from '../netlify/lib/auth.mjs';
import stats from '../netlify/functions/stats.mjs';
import ingest from '../netlify/functions/player-stats.mjs';

// Disposable credentials used only in this isolated test process.
const password = randomBytes(24).toString('hex'), salt = randomBytes(16).toString('hex');
process.env.STATS_PASSWORD_HASH = salt + ':' + scryptSync(password, salt, 64).toString('hex');
process.env.STATS_SESSION_SECRET = randomBytes(32).toString('hex');
const origin = 'https://thebasementpaintings.com';
function request(path, init = {}) { return new Request(origin + path, init); }
const cookie = () => sessionCookie().split(';')[0];

test('password verification rejects incorrect and oversized passwords', () => {
  assert.equal(verifyPassword(password), true);
  assert.equal(verifyPassword(password + 'wrong'), false);
  assert.equal(verifyPassword('x'.repeat(1025)), false);
  assert.equal(verifyPassword(null), false);
});

test('signed sessions reject tampering and expiration and use protected cookie flags', () => {
  const now = Date.now(), session = sessionCookie(process.env, now), value = session.split(';')[0];
  assert.match(session, /HttpOnly; Secure; SameSite=Strict/);
  assert.equal(authenticated(request('/stats', { headers: { cookie: value } }), process.env, now), true);
  assert.equal(authenticated(request('/stats', { headers: { cookie: value + 'changed' } }), process.env, now), false);
  assert.equal(authenticated(request('/stats', { headers: { cookie: value } }), process.env, now + 9 * 3600000), false);
});

test('all private reports and test cleanup require authentication', async () => {
  for (const path of ['/stats/data', '/stats/export.csv', '/stats/test-records']) {
    const response = await stats(request(path, { method: path.includes('test-records') ? 'DELETE' : 'GET' }));
    assert.equal(response.status, 401, path);
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
});

test('login requires correct password and same origin; dashboard uses a script nonce', async () => {
  const post = (body, from = origin) => request('/stats/login', { method: 'POST', headers: { origin: from }, body: new URLSearchParams({ password: body }) });
  assert.equal((await stats(post(password, 'https://unrelated.example'))).status, 403);
  assert.equal((await stats(post('incorrect'))).status, 401);
  const login = await stats(post(password));
  assert.equal(login.status, 303);
  const session = login.headers.get('set-cookie').split(';')[0];
  const dashboard = await stats(request('/stats', { headers: { cookie: session } }));
  assert.equal(dashboard.status, 200);
  assert.match(dashboard.headers.get('content-security-policy'), /script-src 'nonce-/);
  assert.match(await dashboard.text(), /Listening stats/);
  assert.equal((await stats(request('/stats/logout', { method: 'POST', headers: { cookie: session, origin: 'https://unrelated.example' } }))).status, 403);
});

test('collector rejects wrong methods, foreign origins, oversized and malformed input before storage', async () => {
  assert.equal((await ingest(request('/api/player-stats'))).status, 405);
  assert.equal((await ingest(request('/api/player-stats', { method: 'POST', headers: { origin: 'https://unrelated.example' }, body: '{}' }))).status, 403);
  for (const body of ['{}', 'not-json', 'x'.repeat(4097)]) {
    assert.equal((await ingest(request('/api/player-stats', { method: 'POST', headers: { origin }, body }))).status, 400);
  }
  await assert.rejects(bodyText(request('/stats/login', { method: 'POST', body: 'x'.repeat(20) }), 10));
});

test('authenticated reports reject unbounded date ranges before reading storage', async () => {
  const response = await stats(request('/stats/data?from=2020-01-01&to=2026-11-15', { headers: { cookie: cookie() } }));
  assert.equal(response.status, 400);
});
