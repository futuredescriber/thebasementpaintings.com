import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../player.js', import.meta.url), 'utf8');
const registrationStart = source.lastIndexOf('  if (navigator.mediaSession) {');
const registration = source.slice(registrationStart, source.indexOf('  window.SitePlayer =', registrationStart));
const skip = source.slice(source.indexOf('  function skip('), source.indexOf('  function seek('));
function harness(unsupported) {
  const handlers = new Map(), calls = [];
  const sandbox = { navigator: { mediaSession: { setActionHandler(action, callback) {
    calls.push(action); if (action === unsupported) throw new Error('Unsupported action'); handlers.set(action, callback);
  } } }, catalog: [{ id: 'first' }, { id: 'middle' }, { id: 'last' }], current: null,
  audio: { currentTime: 20, duration: 300 }, Number, Math,
  select(song) { sandbox.current = song; sandbox.selected = song; },
  play(...args) { sandbox.playArgs = args; }, pause(...args) { sandbox.pauseArgs = args; },
  save() { sandbox.saves = (sandbox.saves || 0) + 1; }, reflect() {} };
  vm.createContext(sandbox); vm.runInContext(skip + registration, sandbox);
  return { s: sandbox, handlers, calls };
}

test('playlist actions register independently and do not advertise competing skip-seconds controls', () => {
  const h = harness('play');
  assert.deepEqual(h.calls, ['play', 'pause', 'nexttrack', 'previoustrack', 'seekto']);
  assert.ok(h.handlers.has('nexttrack')); assert.ok(h.handlers.has('previoustrack')); assert.ok(h.handlers.has('seekto'));
  h.handlers.get('pause')(); assert.equal(h.s.pauseArgs[0], true);
});
test('Media Session next and previous navigate the same catalog and wrap', () => {
  const h = harness();
  h.s.current = h.s.catalog[2]; h.handlers.get('nexttrack')(); assert.equal(h.s.selected.id, 'first');
  h.handlers.get('previoustrack')(); assert.equal(h.s.selected.id, 'last');
  h.handlers.get('previoustrack')(); assert.equal(h.s.selected.id, 'middle');
  h.handlers.get('play')(); assert.deepEqual(Array.from(h.s.playArgs), [false, true]);
});
test('lock-screen scrubbing clamps to track boundaries and rejects invalid positions', () => {
  const h = harness(), seek = h.handlers.get('seekto');
  seek({ seekTime: 85 }); assert.equal(h.s.audio.currentTime, 85);
  seek({ seekTime: -5 }); assert.equal(h.s.audio.currentTime, 0);
  seek({ seekTime: 500 }); assert.equal(h.s.audio.currentTime, 300);
  seek({ seekTime: NaN }); assert.equal(h.s.audio.currentTime, 300); assert.equal(h.s.saves, 3);
});
