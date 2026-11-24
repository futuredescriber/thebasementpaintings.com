import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from '../netlify/lib/catalog.mjs';
import { validateRecord, recordKey, summarize } from '../netlify/lib/records.mjs';

const now = Date.parse('2026-11-15T12:00:00Z');
const base = () => ({ v: 1, playId: 'a0000000-0000-4000-8000-000000000001', sessionId: 'b0000000-0000-4000-8000-000000000001', seq: 0, trackId: catalog[0].id, source: 'entrance', startedAt: now - 600000, listeningMs: 0, days: {}, ended: false, skipped: false });
const snapshot = (seq, listeningMs, extra = {}) => validateRecord({ ...base(), seq, listeningMs, days: { '2026-11-15': listeningMs }, ...extra }, now);

test('catalog has 25 distinct measured original tracks', () => {
  assert.equal(catalog.length, 25); assert.equal(new Set(catalog.map(t => t.id)).size, 25);
  assert.equal(new Set(catalog.map(t => t.album)).size, 4);
  assert.ok(catalog.every(t => Number.isSafeInteger(t.durationMs) && t.durationMs > 0));
});
test('sequence zero normalizes identifiers and generates immutable key', () => {
  const record = validateRecord({ ...base(), playId: base().playId.toUpperCase() }, now);
  assert.equal(recordKey(record), '2026-11-15/a0000000-0000-4000-8000-000000000001/000000');
});
test('duplicates and out of order snapshots count one qualified play', () => {
  const records = [snapshot(3, 45000), snapshot(1, 10000), snapshot(2, 30000), snapshot(3, 45000)];
  const report = summarize(records);
  assert.deepEqual(report.overview, { plays: 1, qualifiedPlays: 1, listeningMs: 45000, completions: 0, skips: 0, sessions: 1 });
  assert.deepEqual(summarize(records.reverse()), report);
  assert.equal(report.tracks[0].listeningMs, 45000);
  assert.equal(report.days[0].qualifiedPlays, 1);
  assert.ok(!JSON.stringify(report).includes(base().sessionId));
});
test('seek to end is not completion, genuine listened completion is', () => {
  assert.equal(summarize([snapshot(1, 30000, { ended: true })]).overview.completions, 0);
  assert.equal(summarize([snapshot(1, Math.ceil(catalog[0].durationMs * 0.9), { ended: true, skipped: true })]).overview.completions, 1);
  assert.equal(summarize([snapshot(1, 30000, { ended: true, skipped: true })]).overview.skips, 0);
  assert.equal(summarize([snapshot(1, 30000, { skipped: true })]).overview.skips, 1);
});
test('daily listening crosses midnight while play counts belong to start day', () => {
  const startedAt = Date.parse('2026-11-14T23:59:30Z');
  const earlier = snapshot(1, 30000, { startedAt, days: { '2026-11-14': 30000 } });
  const later = snapshot(2, 60000, { startedAt, days: { '2026-11-14': 30000, '2026-11-15': 30000 } });
  const report = summarize([later, earlier, later]);
  assert.equal(report.days[0].listeningMs, 30000); assert.equal(report.days[1].listeningMs, 30000);
  assert.equal(report.days[0].qualifiedPlays, 1); assert.equal(report.days[1].qualifiedPlays, 0);
  assert.equal(report.overview.listeningMs, 60000);
  assert.equal(report.dailyAlbums.length, 2);
  assert.equal(report.dailyAlbums[0].album, catalog[0].album);
  assert.equal(report.dailyAlbums[0].listeningMs, 30000);
  assert.equal(report.dailyAlbums[1].listeningMs, 30000);
  assert.equal(report.dailyAlbums[0].qualifiedPlays, 1);
  assert.equal(report.dailyAlbums[1].qualifiedPlays, 0);
});
test('rejects unknown, extra, nonfinite, impossible and malformed fields', () => {
  const invalid = [{ trackId: 'unknown' }, { seq: -1 }, { seq: 4096 }, { seq: 1.5 }, { listeningMs: NaN }, { listeningMs: 700000, days: { '2026-11-15': 700000 } }, { listeningMs: 1, days: [] }, { source: 'autoplay' }, { extra: true }, { ended: 1 }, { startedAt: now - 8 * 86400000 }, { startedAt: now + 300001 }, { days: { '2026-02-30': 0 } }, { days: { '2026-11-16': 0 } }, { days: { '2026-11-15': 30000 }, listeningMs: 0 }];
  for (const changes of invalid) assert.throws(() => validateRecord({ ...base(), ...changes }, now));
  for (const value of [null, [], 'record', {}]) assert.throws(() => validateRecord(value, now));
});

test('range includes overnight listening without prior-day play counts', () => {
  const startedAt = Date.parse('2026-11-14T23:59:30Z');
  const overnight = snapshot(2, 60000, { startedAt, days: { '2026-11-14': 30000, '2026-11-15': 30000 }, skipped: true });
  const report = summarize([overnight], { from: '2026-11-15', to: '2026-11-15' });
  assert.deepEqual(report.overview, { plays: 0, qualifiedPlays: 0, listeningMs: 30000, completions: 0, skips: 0, sessions: 1 });
  assert.equal(report.days.length, 1); assert.equal(report.days[0].day, '2026-11-15');
  assert.equal(report.dailyAlbums.length, 1); assert.equal(report.dailyAlbums[0].listeningMs, 30000);
  assert.equal(report.tracks[0].listeningMs, 30000); assert.equal(report.sources[0].listeningMs, 30000);
  const prior = summarize([overnight], { from: '2026-11-14', to: '2026-11-14' });
  assert.equal(prior.overview.plays, 1); assert.equal(prior.overview.qualifiedPlays, 1); assert.equal(prior.overview.skips, 1);
  assert.equal(prior.overview.listeningMs, 30000);
  assert.equal(summarize([overnight], { from: '2026-11-16', to: '2026-11-16' }).overview.sessions, 0);
});
