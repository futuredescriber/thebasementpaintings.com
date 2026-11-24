import { catalog, catalogById } from './catalog.mjs';

export const recordRetentionDays = 90;
const DAY = 86400000;
const sources = ['entrance', 'manual', 'queue', 'resume'];
const fields = ['v', 'playId', 'sessionId', 'seq', 'trackId', 'source', 'startedAt', 'listeningMs', 'days', 'ended', 'skipped'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const dayOf = time => new Date(time).toISOString().slice(0, 10);
const integer = value => Number.isSafeInteger(value) && value >= 0;
function requireThat(condition, message) { if (!condition) throw new Error(message); }

export function validateRecord(input, now = Date.now()) {
  requireThat(Number.isSafeInteger(now) && now >= 0, 'Invalid server time');
  requireThat(plain(input) && Object.keys(input).length === fields.length && fields.every(key => Object.hasOwn(input, key)), 'Invalid record fields');
  requireThat(input.v === 1, 'Unsupported version');
  requireThat(typeof input.playId === 'string' && uuid.test(input.playId) && typeof input.sessionId === 'string' && uuid.test(input.sessionId), 'Invalid identifier');
  requireThat(integer(input.seq) && input.seq <= 4095, 'Invalid sequence');
  requireThat(typeof input.trackId === 'string' && catalogById.has(input.trackId), 'Unknown track');
  requireThat(sources.includes(input.source), 'Invalid source');
  requireThat(integer(input.startedAt) && input.startedAt >= now - 7 * DAY && input.startedAt <= now + 300000, 'Invalid start time');
  requireThat(integer(input.listeningMs) && input.listeningMs <= 21600000 && input.listeningMs <= Math.max(0, now - input.startedAt) + 5000, 'Invalid listening time');
  requireThat(typeof input.ended === 'boolean' && typeof input.skipped === 'boolean', 'Invalid flags');
  requireThat(plain(input.days), 'Invalid daily listening');
  const entries = Object.entries(input.days), startDay = dayOf(input.startedAt), lastDay = dayOf(now);
  requireThat(entries.length <= 8, 'Too many days');
  let total = 0;
  const days = {};
  for (const [day, value] of entries) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(day) && Date.parse(day + 'T00:00:00.000Z');
    requireThat(Number.isFinite(date) && dayOf(date) === day && day >= startDay && day <= lastDay && integer(value) && value <= 21600000, 'Invalid day');
    total += value; days[day] = value;
  }
  requireThat(Math.abs(total - input.listeningMs) <= 2, 'Daily listening mismatch');
  return { v: 1, playId: input.playId.toLowerCase(), sessionId: input.sessionId.toLowerCase(), seq: input.seq, trackId: input.trackId, source: input.source, startedAt: input.startedAt, listeningMs: input.listeningMs, days, ended: input.ended, skipped: input.skipped };
}

export function recordKey(record) {
  return `${dayOf(record.startedAt)}/${record.playId}/${String(record.seq).padStart(6, '0')}`;
}

// Reports expose aggregate counts only. No session or play identifiers leave here.
export function summarize(records, range = {}) {
  const inRange = day => (!range.from || day >= range.from) && (!range.to || day <= range.to);
  const plays = new Map();
  // Immutable identity is chosen from the earliest sequence, independent of arrival.
  for (const record of [...records].sort((a, b) => a.seq - b.seq || a.startedAt - b.startedAt)) {
    let play = plays.get(record.playId);
    if (!play) {
      play = { ...record, days: {}, listeningMs: 0, ended: false, skipped: false };
      plays.set(record.playId, play);
    }
    if (record.trackId !== play.trackId || record.sessionId !== play.sessionId || record.source !== play.source || record.startedAt !== play.startedAt) continue;
    play.listeningMs = Math.max(play.listeningMs, record.listeningMs);
    play.ended ||= record.ended; play.skipped ||= record.skipped;
    for (const [day, value] of Object.entries(record.days)) play.days[day] = Math.max(play.days[day] || 0, value);
  }
  function bucket(extra = {}) { return { ...extra, plays: 0, qualifiedPlays: 0, listeningMs: 0, completions: 0, skips: 0, sessions: new Set() }; }
  const overview = bucket(), tracks = new Map(catalog.map(track => [track.id, bucket({ trackId: track.id, name: track.name, album: track.album })]));
  const albums = new Map(), days = new Map(), dailyAlbums = new Map(), bySource = new Map(sources.map(source => [source, bucket({ source })]));
  function dailyAlbum(day, album) {
    const key = day + '/' + album;
    if (!dailyAlbums.has(key)) dailyAlbums.set(key, bucket({ day, album }));
    return dailyAlbums.get(key);
  }
  for (const track of catalog) if (!albums.has(track.album)) albums.set(track.album, bucket({ album: track.album }));
  for (const play of plays.values()) {
    const track = catalogById.get(play.trackId);
    if (!track) continue;
    const startDay = dayOf(play.startedAt);
    const countPlay = inRange(startDay);
    const listeningEntries = Object.entries(play.days).filter(([day]) => inRange(day));
    const listeningMs = range.from || range.to ? listeningEntries.reduce((total, [, value]) => total + value, 0) : play.listeningMs;
    if (!countPlay && !listeningMs) continue;
    if (countPlay && !days.has(startDay)) days.set(startDay, bucket({ day: startDay }));
    const qualified = play.listeningMs >= 30000;
    const complete = play.ended && play.listeningMs >= track.durationMs * 0.9;
    const skipped = play.skipped && !play.ended;
    const groups = [overview, tracks.get(play.trackId), albums.get(track.album), bySource.get(play.source)];
    for (const group of groups) {
      if (countPlay) { group.plays++; group.qualifiedPlays += Number(qualified); group.completions += Number(complete); group.skips += Number(skipped); }
      group.sessions.add(play.sessionId); group.listeningMs += listeningMs;
    }
    if (countPlay) for (const group of [days.get(startDay), dailyAlbum(startDay, track.album)]) {
      group.plays++; group.qualifiedPlays += Number(qualified); group.completions += Number(complete); group.skips += Number(skipped); group.sessions.add(play.sessionId);
    }
    for (const [day, value] of listeningEntries) {
      if (!days.has(day)) days.set(day, bucket({ day }));
      days.get(day).listeningMs += value;
      if (value > 0) days.get(day).sessions.add(play.sessionId);
      const albumDay = dailyAlbum(day, track.album);
      albumDay.listeningMs += value;
      if (value > 0) albumDay.sessions.add(play.sessionId);
    }
  }
  const finish = group => ({ ...group, sessions: group.sessions.size });
  return { overview: finish(overview), tracks: [...tracks.values()].map(finish), albums: [...albums.values()].map(finish), days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)).map(finish), sources: [...bySource.values()].map(finish), dailyAlbums: [...dailyAlbums.values()].sort((a, b) => a.day.localeCompare(b.day) || a.album.localeCompare(b.album)).map(finish) };
}
