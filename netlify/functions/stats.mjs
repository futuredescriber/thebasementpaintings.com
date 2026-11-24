import { randomBytes } from 'node:crypto';
import { configured, authenticated, verifyPassword, sessionCookie, clearCookie, sameOrigin, bodyText, headers } from '../lib/auth.mjs';
import { loginPage, dashboardPage } from '../lib/dashboard.mjs';
import { summarize } from '../lib/records.mjs';
import { dateRange, readRecords, dayStore } from '../lib/storage.mjs';
const views = { tracks: ['trackId', 'name', 'album'], albums: ['album'], days: ['day'], sources: ['source'], dailyAlbums: ['day', 'album'] };
const metrics = ['plays', 'qualifiedPlays', 'listeningMs', 'completions', 'skips', 'sessions'];
function csvCell(value) { const text = String(value ?? ''); return '"' + (/^[=+@\-\t\r]/.test(text) ? "'" + text : text).replace(/"/g, '""') + '"'; }
export default async function handler(request) {
  const url = new URL(request.url), path = url.pathname.replace(/\/$/, '') || '/';
  const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { ...headers(), 'Content-Type': 'application/json' } });
  const html = (status, body, nonce = '') => new Response(body, { status, headers: { ...headers(nonce), 'Content-Type': 'text/html; charset=utf-8' } });
  if (!configured()) return json(503, { error: 'Private stats access is not configured' });
  if (path === '/stats/login' && request.method === 'POST') {
    if (!sameOrigin(request)) return json(403, { error: 'Origin not allowed' });
    let password;
    try { password = new URLSearchParams(await bodyText(request, 2048)).get('password'); } catch (_) { return html(400, loginPage('Could not sign in.')); }
    if (!verifyPassword(password)) return html(401, loginPage('Incorrect password.'));
    return new Response(null, { status: 303, headers: { ...headers(), Location: '/stats', 'Set-Cookie': sessionCookie() } });
  }
  if (!authenticated(request)) return path === '/stats' && request.method === 'GET' ? html(200, loginPage()) : json(401, { error: 'Sign in required' });
  if (path === '/stats/logout' && request.method === 'POST') {
    if (!sameOrigin(request)) return json(403, { error: 'Origin not allowed' });
    return new Response(null, { status: 303, headers: { ...headers(), Location: '/stats', 'Set-Cookie': clearCookie } });
  }
  if (path === '/stats' && request.method === 'GET') { const nonce = randomBytes(18).toString('base64'); return html(200, dashboardPage(nonce), nonce); }
  if (path === '/stats/test-records' && request.method === 'DELETE') {
    if (!sameOrigin(request)) return json(403, { error: 'Origin not allowed' });
    const store = dayStore(request, new Date().toISOString().slice(0, 10), true); await store.deleteAll();
    return json(200, { ok: true });
  }
  if (!['/stats/data', '/stats/export.csv'].includes(path) || request.method !== 'GET') return json(404, { error: 'Not found' });
  let range;
  try { range = dateRange(url); } catch (_) { return json(400, { error: 'Choose 1–31 days within the last 90 days' }); }
  try {
    const report = { ...range, ...summarize(await readRecords(request, range.from, range.to, url.searchParams.get('test') === '1'), range) };
    if (path === '/stats/data') return json(200, report);
    const view = url.searchParams.get('view') || 'tracks';
    if (!views[view]) return json(400, { error: 'Unknown table' });
    const fields = [...views[view], ...metrics], rows = [fields, ...report[view].map(row => fields.map(field => row[field]))];
    return new Response(rows.map(row => row.map(csvCell).join(',')).join('\r\n'), { headers: { ...headers(), 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="listening-${view}-${range.from}-${range.to}.csv"` } });
  } catch (error) { return json(503, { error: error.message === 'Too many checkpoints; choose a shorter range' ? error.message : 'Stats temporarily unavailable. Please try again.' }); }
}
export const config = { path: ['/stats', '/stats/*'], rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
