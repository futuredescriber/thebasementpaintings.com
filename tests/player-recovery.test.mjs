import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../player.js', import.meta.url), 'utf8');
function functions(first, last) { return source.slice(source.indexOf('  function ' + first), source.indexOf('  function ' + last)); }
function harness() {
  const audio = { paused: false, ended: false, currentTime: 82, duration: 300,
    playCalls: 0, loadCalls: 0, play() { this.playCalls++; this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; }, load() { this.loadCalls++; this.currentTime = 0; } };
  const context = { state: 'interrupted', resumeCalls: 0, resume() { this.resumeCalls++; this.state = 'running'; return Promise.resolve(); } };
  const sandbox = { audio, audioGraph: { context }, playing: true, pending: false, wanted: true,
    automaticPending: false, failed: false, attempt: 0, current: { id: 'song' }, pendingSeek: null,
    stats: null, fadeFrame: 0, level: .2, document: { hidden: false }, navigator: {},
    Promise, Error, Number, cancelAnimationFrame() {}, ensureInitial() {}, reflect() {}, save() {},
    fadeIn() {}, setLevel(value) { sandbox.levelSet = value; },
    seekSaved() { if (sandbox.pendingSeek !== null) { audio.currentTime = sandbox.pendingSeek; sandbox.pendingSeek = null; } },
    state() { return { playing: sandbox.playing && !audio.paused && context.state === 'running' }; } };
  vm.createContext(sandbox);
  vm.runInContext(functions('resumeGraph', 'prepareGraph') +
    'function prepareGraph(){return resumeGraph();}\n' + functions('pause', 'startEntrance') + functions('toggle', 'select'), sandbox);
  return { s: sandbox, audio, context, settle: () => new Promise(resolve => setImmediate(resolve)) };
}
test('explicit Play retries interrupted output even when native media reports playing', async () => {
  const h = harness(); h.s.play(false, false); await h.settle();
  assert.equal(h.context.resumeCalls, 1); assert.equal(h.audio.playCalls, 1);
  assert.equal(h.audio.currentTime, 82); assert.equal(h.s.levelSet, .2);
  assert.equal(h.s.state().playing, true); assert.equal(h.s.pending, false);
});
test('a stuck pending attempt can be replaced by a fresh gesture and stale rejection cannot stop it', async () => {
  const h = harness(); let reject;
  h.audio.play = function () { this.playCalls++; return this.playCalls === 1 ? new Promise((_, no) => { reject = no; }) : Promise.resolve(); };
  h.s.play(false, false); h.s.toggle(); await h.settle(); reject(new Error('old attempt')); await h.settle();
  assert.equal(h.audio.playCalls, 2); assert.equal(h.s.failed, false); assert.equal(h.s.state().playing, true);
});
test('unrecoverable or still-interrupted output reports failure rather than false playback', async () => {
  for (const state of ['closed', 'interrupted']) {
    const h = harness(); h.context.state = state; h.context.resume = () => Promise.resolve();
    h.s.play(false, false); await h.settle();
    assert.equal(h.s.failed, true); assert.equal(h.s.pending, false); assert.equal(h.s.state().playing, false);
  }
});
test('media error retry reloads the same recording and restores position', async () => {
  const h = harness(); h.audio.error = { code: 2 };
  h.s.play(false, false); await h.settle();
  assert.equal(h.audio.loadCalls, 1); assert.equal(h.audio.currentTime, 82);
});
