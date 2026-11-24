(function () {
  'use strict';
  var endpoint = '/api/player-stats';
  function uuid() { return crypto.randomUUID(); }
  function read(key, fallback) { try { return JSON.parse(sessionStorage.getItem(key)) || fallback; } catch (_) { return fallback; } }
  function write(key, value) { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* optional tab storage */ } }
  function create(audio, outputRunning) {
    var sessionId = read('bp-stats-session', null) || uuid(); write('bp-stats-session', sessionId);
    var current = null, saved = read('bp-stats-current', null), pending = read('bp-stats-pending', {});
    if (!pending || typeof pending !== 'object' || Array.isArray(pending)) pending = {};
    Object.keys(pending).forEach(function (id) { if (!pending[id] || Date.now() - pending[id].startedAt > 604800000) delete pending[id]; });
    var lastSignature = read('bp-stats-signature', '');
    var lastMedia = audio.currentTime || 0, lastWall = Date.now(), eligible = false, seeking = false, sending = false;
    var lastPersist = 0, nextFlush = 30000;
    function running() { return !audio.paused && !audio.ended && !audio.seeking && !seeking && outputRunning(); }
    function persist() { write('bp-stats-current', current); write('bp-stats-pending', pending); write('bp-stats-signature', lastSignature); }
    function listen(target, event, callback) { target.addEventListener(event, function () { try { callback(); } catch (_) { /* analytics must remain isolated */ } }); }
    function addDays(start, end, amount) {
      var span = Math.max(1, end - start), remaining = amount;
      while (start < end && remaining > 0) {
        var day = new Date(start).toISOString().slice(0, 10), boundary = Date.parse(day) + 86400000;
        var until = Math.min(end, boundary);
        var part = until === end ? remaining : Math.min(remaining, Math.round(amount * (until - start) / span));
        current.days[day] = (current.days[day] || 0) + part; remaining -= part; start = until;
      }
    }
    function sample(final) {
      var now = Date.now(), media = audio.currentTime || 0, delta = media - lastMedia, wall = Math.max(0, now - lastWall);
      var active = running();
      if (current && eligible && (active || (final && outputRunning() && !seeking && !audio.seeking)) && wall > 0 && delta > 0 && delta * 1000 <= wall + 1500) {
        var amount = Math.min(Math.round(delta * 1000), wall, 21600000 - current.listeningMs);
        if (amount > 0) { current.listeningMs += amount; addDays(lastWall, now, amount); }
      }
      lastMedia = media; lastWall = now; eligible = active;
      if (current && now - lastPersist >= 4000) { lastPersist = now; persist(); }
    }
    function snapshot() {
      if (!current || current.listeningMs === 0) return;
      var signature = [current.playId, current.listeningMs, current.ended, current.skipped, JSON.stringify(current.days)].join('|');
      if (signature === lastSignature || current.seq >= 4095) return;
      lastSignature = signature;
      current.seq++;
      pending[current.playId] = JSON.parse(JSON.stringify(current));
      var keys = Object.keys(pending);
      while (keys.length > 40) { delete pending[keys.shift()]; }
      persist();
    }
    async function send() {
      if (sending || !navigator.onLine) return;
      sending = true;
      try {
        for (var count = 0; count < 3; count++) {
          var id = Object.keys(pending)[0]; if (!id) break;
          var record = pending[id];
          var response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record), keepalive: true, credentials: 'omit' });
          if (!response.ok && ![400, 413, 422].includes(response.status)) break;
          if (pending[id] && pending[id].seq === record.seq) delete pending[id];
          persist();
        }
      } catch (_) { /* never interrupt music; retry the same immutable snapshot */ }
      finally { sending = false; }
    }
    function flush(beacon) {
      sample(true); snapshot();
      if (beacon && navigator.sendBeacon) {
        Object.keys(pending).slice(0, 3).forEach(function (id) {
          try { navigator.sendBeacon(endpoint, new Blob([JSON.stringify(pending[id])], { type: 'application/json' })); } catch (_) { /* best effort */ }
        });
      } else send();
    }
    function finish(ended) {
      if (!current) return;
      sample(true); current.ended = !!ended; current.skipped = !ended && current.listeningMs > 0;
      snapshot(); send(); current = null; write('bp-stats-current', null);
    }
    function start(trackId, source) {
      if (current && current.trackId === trackId && !current.ended && !current.skipped) return;
      finish(false);
      current = { v: 1, playId: uuid(), sessionId: sessionId, seq: 0, trackId: trackId, source: source,
        startedAt: Date.now(), listeningMs: 0, days: {}, ended: false, skipped: false };
      lastSignature = ''; nextFlush = 30000; lastMedia = audio.currentTime || 0; lastWall = Date.now(); eligible = false; persist();
    }
    function restore(trackId) {
      if (saved && saved.trackId === trackId && saved.sessionId === sessionId && !saved.ended && !saved.skipped && Date.now() - saved.startedAt < 604800000) {
        current = saved; nextFlush = current.listeningMs + 60000;
      }
      saved = null;
    }
    listen(audio, 'timeupdate', function () {
      sample(false);
      if (current && current.listeningMs >= nextFlush) { nextFlush = current.listeningMs + 60000; snapshot(); send(); }
    });
    listen(audio, 'playing', function () { lastMedia = audio.currentTime || 0; lastWall = Date.now(); eligible = running(); });
    listen(audio, 'pause', function () { flush(false); eligible = false; });
    listen(audio, 'seeking', function () { seeking = true; eligible = false; lastMedia = audio.currentTime || 0; lastWall = Date.now(); });
    listen(audio, 'seeked', function () { seeking = false; lastMedia = audio.currentTime || 0; lastWall = Date.now(); eligible = running(); });
    listen(audio, 'loadedmetadata', function () { lastMedia = audio.currentTime || 0; lastWall = Date.now(); eligible = running(); });
    listen(window, 'pagehide', function () { flush(true); });
    listen(document, 'visibilitychange', function () { if (document.hidden) flush(true); });
    listen(window, 'online', send);
    send();
    return { start: start, restore: restore, finish: finish, flush: flush,
      ensure: function (trackId, source) { if (!current) start(trackId, source); },
      status: function () { lastMedia = audio.currentTime || 0; lastWall = Date.now(); eligible = running(); } };
  }
  window.PlayerStats = { create: function (audio, outputRunning) {
    if (navigator.globalPrivacyControl || navigator.doNotTrack === '1') return null;
    try {
      var tracker = create(audio, outputRunning), isolated = {};
      Object.keys(tracker).forEach(function (method) { isolated[method] = function () { try { return tracker[method].apply(null, arguments); } catch (_) { /* never block playback */ } }; });
      return isolated;
    } catch (_) { return null; }
  } };
})();
