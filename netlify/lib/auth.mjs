import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
export const cookieName = 'bp_stats_admin';
const lifetime = 8 * 3600;
export function configured(env = process.env) { return /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(env.STATS_PASSWORD_HASH || '') && (env.STATS_SESSION_SECRET || '').length >= 40; }
const equal = (a, b) => a.length === b.length && timingSafeEqual(a, b);
export function verifyPassword(password, env = process.env) {
  if (!configured(env) || typeof password !== 'string' || password.length > 1024) return false;
  const [salt, hash] = env.STATS_PASSWORD_HASH.split(':');
  return equal(scryptSync(password, salt, 64), Buffer.from(hash, 'hex'));
}
export function sessionCookie(env = process.env, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + lifetime, nonce: randomBytes(12).toString('base64url') })).toString('base64url');
  const signature = createHmac('sha256', env.STATS_SESSION_SECRET).update(payload).digest('base64url');
  return `${cookieName}=${payload}.${signature}; Path=/stats; HttpOnly; Secure; SameSite=Strict; Max-Age=${lifetime}`;
}
export function authenticated(request, env = process.env, now = Date.now()) {
  if (!configured(env)) return false;
  const cookie = (request.headers.get('cookie') || '').split(';').map(value => value.trim()).find(value => value.startsWith(cookieName + '='));
  if (!cookie || cookie.length > 512) return false;
  try {
    const [payload, signature, extra] = cookie.slice(cookieName.length + 1).split('.');
    if (!payload || !signature || extra) return false;
    const expected = createHmac('sha256', env.STATS_SESSION_SECRET).update(payload).digest();
    if (!equal(expected, Buffer.from(signature, 'base64url'))) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return Number.isSafeInteger(data.iat) && data.exp === data.iat + lifetime && data.iat <= now / 1000 + 30 && data.exp > now / 1000;
  } catch (_) { return false; }
}
export const clearCookie = `${cookieName}=; Path=/stats; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
export function sameOrigin(request) { try { return request.headers.get('origin') === new URL(request.url).origin; } catch (_) { return false; } }
export function headers(nonce = '') {
  return { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow',
    'Referrer-Policy': 'same-origin', 'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; script-src ${nonce ? `'nonce-${nonce}'` : "'none'"}; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'` };
}
export async function bodyText(request, limit = 4096) {
  if (Number(request.headers.get('content-length')) > limit) throw new Error('Payload too large');
  if (!request.body) return '';
  const reader = request.body.getReader(), chunks = []; let length = 0;
  while (true) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > limit) { await reader.cancel(); throw new Error('Payload too large'); } chunks.push(value); }
  return Buffer.concat(chunks).toString('utf8');
}
