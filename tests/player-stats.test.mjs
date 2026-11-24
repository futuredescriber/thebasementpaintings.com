import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const source = readFileSync(new URL('../player-stats.js', import.meta.url), 'utf8');
function harness(start = Date.parse('2026-11-15T12:00:00Z')) {
  let now = start, output = true, responseStatus = 202;
  const requests = [], storage = new Map();
  function target(properties = {}) {
    const events = new Map();
    return Object.assign(properties, {
      addEventListener(name, fn) { const list = events.get(name) || []; list.push(fn); events.set(name, list); },
      emit(name) { for (const fn of events.get(name) || []) fn(); }
    });
  }
  const audio = target({ currentTime: 0, paused: true, ended: false, seeking: false });
  const window = target(), document = target({ hidden: false });
  class Clock extends Date { static now() { return now; } }
  vm.runInNewContext(source, {
    window, document, Date: Clock, crypto: { randomUUID }, Blob,
    navigator: { onLine: true },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    fetch: async (url, init) => { requests.push(JSON.parse(init.body)); return { ok: responseStatus < 400, status: responseStatus }; }
  });
  const collector = window.PlayerStats.create(audio, () => output);
  assert.ok(collector);
  const settle = () => new Promise(resolve => setImmediate(resolve));
  return {
    collector, audio, requests, document,
    async start() { await settle(); collector.start('antipodes-gnosis', 'entrance'); audio.paused = false; audio.emit('playing'); },
    tick(seconds) { for (let i = 0; i < seconds; i++) { now += 1000; audio.currentTime++; audio.emit('timeupdate'); } },
    setOutput(value) { output = value; },
    setStatus(value) { responseStatus = value; },
    retry() { window.emit('online'); },
    async flush() { collector.flush(false); await settle(); return requests.at(-1); },
    settle
  };
}

test('collector counts playback, excluding pause and seek jumps', async () => {
  const h = harness(); await h.start(); h.tick(20);
  h.audio.paused = true; h.audio.emit('pause'); await h.settle();
  h.tick(10);
  h.audio.seeking = true; h.audio.emit('seeking'); h.audio.currentTime += 200;
  h.audio.seeking = false; h.audio.emit('seeked');
  h.audio.paused = false; h.audio.emit('playing'); h.tick(10);
  const record = await h.flush();
  assert.equal(record.listeningMs, 30000);
  assert.equal(record.source, 'entrance');
});

test('collector excludes time while the audio context is suspended', async () => {
  const h = harness(); await h.start(); h.tick(10);
  h.setOutput(false); h.tick(10);
  h.setOutput(true); h.audio.emit('playing'); h.tick(10);
  assert.equal((await h.flush()).listeningMs, 20000);
});

test('collector splits actual listening across UTC midnight', async () => {
  const h = harness(Date.parse('2026-11-15T23:59:50Z')); await h.start(); h.tick(20);
  const record = await h.flush();
  assert.deepEqual(record.days, { '2026-11-15': 10000, '2026-11-16': 10000 });
  assert.equal(record.listeningMs, 20000);
});

test('collector distinguishes a skip from reaching the end', async () => {
  const h = harness(); await h.start(); h.tick(10); h.collector.finish(false); await h.settle();
  assert.equal(h.requests.at(-1).skipped, true);
  assert.equal(h.requests.at(-1).ended, false);
  h.collector.start('antipodes-koan', 'queue'); h.audio.emit('playing'); h.tick(10);
  h.collector.finish(true); await h.settle();
  assert.equal(h.requests.at(-1).ended, true);
  assert.equal(h.requests.at(-1).skipped, false);
  assert.equal(h.requests.at(-1).source, 'queue');
});

test('collector retries an immutable checkpoint after a temporary failure', async () => {
  const h = harness(); await h.start(); h.tick(10); h.setStatus(503);
  const first = await h.flush();
  h.setStatus(202); h.retry(); await h.settle();
  assert.deepEqual(h.requests.at(-1), first);
  assert.equal(h.requests.length, 2);
});

test('repeated flushes without new listening do not create extra uploads', async () => {
  const h = harness(); await h.start(); h.tick(10); await h.flush();
  await h.flush(); await h.flush();
  assert.equal(h.requests.length, 1);
});

test('a rejected checkpoint does not permanently block later plays', async () => {
  const h = harness(); await h.start(); h.tick(10); h.setStatus(422); await h.flush();
  h.collector.finish(false); await h.settle();
  h.setStatus(202); h.collector.start('antipodes-koan', 'manual');
  h.audio.emit('playing'); h.tick(10); const record = await h.flush();
  assert.equal(record.trackId, 'antipodes-koan');
  const count = h.requests.length; h.retry(); await h.settle();
  assert.equal(h.requests.length, count);
});
