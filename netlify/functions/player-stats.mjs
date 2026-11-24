import { performance } from 'node:perf_hooks';
import { configured, sameOrigin, bodyText, headers } from '../lib/auth.mjs';
import { validateRecord, recordKey } from '../lib/records.mjs';
import { dayStore, syntheticSessionId } from '../lib/storage.mjs';
export default async function handler(request) {
  const started = performance.now();
  const reply = (status, message) => new Response(JSON.stringify({ ok: status === 204, ...(message ? { error: message } : {}) }), { status: status === 204 ? 200 : status, headers: { ...headers(), 'Content-Type': 'application/json', 'Server-Timing': `app;dur=${(performance.now() - started).toFixed(1)}` } });
  if (request.method !== 'POST') return reply(405, 'POST required');
  if (!configured()) return reply(503, 'Stats unavailable');
  if (!sameOrigin(request)) return reply(403, 'Origin not allowed');
  let record;
  try { record = validateRecord(JSON.parse(await bodyText(request))); } catch (_) { return reply(400, 'Invalid listening checkpoint'); }
  try {
    const day = new Date(record.startedAt).toISOString().slice(0, 10);
    await dayStore(request, day, record.sessionId === syntheticSessionId).setJSON(recordKey(record), record, { onlyIfNew: true });
    return reply(204);
  } catch (_) { return reply(503, 'Please retry later'); }
}
export const config = { path: '/api/player-stats', rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
