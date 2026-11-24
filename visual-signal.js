(function () {
  // One read of the actual playing audio serves every visible canvas.
  // No prerecorded envelope, microphone, or simulated playing waveform.
  var disposeCurrent = function () {};
  var lastSample = -1, cached = null, energy = 0, baseline = 0, previousTrack = null;
  function sample(now) {
    var state = window.SitePlayer && window.SitePlayer.getState();
    if (!state || !state.playing) {
      lastSample = -1; energy = 0; baseline = 0;
      var idle = !state || !state.wanted;
      return { mode: idle ? 'idle' : 'unavailable', amplitude: idle ? 0.055 + 0.018 * Math.sin(now * 0.65) : 0,
        transient: 0, bands: { low: 0, mid: 0, high: 0 }, waveform: null, time: state ? state.time : 0 };
    }
    var track = state.track && state.track.id;
    if (cached && previousTrack === track && now - lastSample >= 0 && now - lastSample < 1 / 60) return cached;
    var analysis = window.SitePlayer.getAnalysis && window.SitePlayer.getAnalysis();
    if (!analysis) return { mode: 'unavailable', amplitude: 0, transient: 0, bands: { low: 0, mid: 0, high: 0 }, waveform: null, time: state.time };
    var elapsed = lastSample < 0 || previousTrack !== track ? 1 / 30 : Math.max(1 / 120, Math.min(0.15, now - lastSample));
    if (previousTrack !== track) { energy = 0; baseline = 0; }
    var square = 0;
    for (var index = 0; index < analysis.waveform.length; index++) square += analysis.waveform[index] * analysis.waveform[index];
    var rms = Math.sqrt(square / analysis.waveform.length);
    // Fixed display gain preserves silence and dynamics across tracks.
    var amplitude = Math.min(1, rms * 3.2);
    energy += (amplitude - energy) * (1 - Math.exp(-elapsed / (amplitude > energy ? 0.035 : 0.12)));
    baseline += (amplitude - baseline) * (1 - Math.exp(-elapsed / 0.5));
    function band(from, to) {
      var binHz = analysis.sampleRate / analysis.fftSize;
      var first = Math.max(1, Math.ceil(from / binHz)), end = Math.min(analysis.spectrum.length, Math.ceil(to / binHz)), power = 0;
      for (var bin = first; bin < end; bin++) {
        var db = analysis.spectrum[bin];
        if (Number.isFinite(db)) power += Math.pow(10, db / 10);
      }
      return Math.min(1, Math.sqrt(power) * 4);
    }
    previousTrack = track; lastSample = now;
    cached = { mode: 'live', amplitude: energy, rms: rms, transient: Math.min(1, Math.max(0, amplitude - baseline) * 3),
      bands: { low: band(35, 250), mid: band(250, 2400), high: band(2400, 12000) }, waveform: analysis.waveform, time: state.time };
    return cached;
  }

  function waveform(ctx, width, height, signal, now, target) {
    var state = window.SitePlayer && window.SitePlayer.getState();
    var moving = signal.mode === 'live' && signal.waveform && signal.waveform.length;
    var values = moving ? signal.waveform : null;
    var count = width > 768 ? 176 : 96, points = [];
    // Actual signed samples from the shared native player's analyser. A fixed
    // display gain preserves quiet/loud contrast; quadratic joins soften the
    // trace without inventing a carrier or normalizing every frame to full scale.
    for (var index = 0; index < count; index++) {
      var position = index / (count - 1);
      var value = moving ? values[Math.round(position * (values.length - 1))] : 0;
      points.push({ x: width * position, y: height * 0.52 + Math.tanh(value * 1.8) * height * 0.46 });
    }
    if (!target.history || now === 0 || !moving || target.waveTrack !== (state && state.track && state.track.id) || Math.abs((target.waveTime || 0) - (state && state.time || 0)) > 1) target.history = [];
    target.waveTrack = state && state.track && state.track.id; target.waveTime = state && state.time;
    target.history.unshift(points); target.history.length = Math.min(3, target.history.length);
    function curve(values, color, lineWidth) {
      ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.beginPath(); ctx.moveTo(values[0].x, values[0].y);
      for (var index = 1; index < values.length - 1; index++) {
        var next = values[index + 1];
        ctx.quadraticCurveTo(values[index].x, values[index].y, (values[index].x + next.x) / 2, (values[index].y + next.y) / 2);
      }
      ctx.lineTo(values[values.length - 1].x, values[values.length - 1].y); ctx.stroke();
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (target.history[2]) curve(target.history[2], 'rgba(184,139,101,.27)', 1);
    if (target.history[1]) curve(target.history[1], 'rgba(128,197,193,.42)', 1.2);
    ctx.shadowColor = 'rgba(142,207,198,.45)'; ctx.shadowBlur = moving ? 8 : 0;
    curve(points, moving ? 'rgba(153,204,197,.14)' : 'rgba(153,204,197,.08)', 4);
    ctx.shadowBlur = 0; curve(points, moving ? 'rgba(219,231,210,.83)' : 'rgba(168,187,170,.24)', moving ? 1.2 : 1);
  }

  // Open inscriptions, drawn as a small family of related architectural forms.
  // The quiet stone outline stays present while one stroke is slowly retraced.
  var inscriptions = [
    [ [[-49,12],[-31,12],[-9,-24],[14,-24]], [[-37,21],[-18,21],[5,-16],[25,-16]],
      [[-13,25],[15,-21],[37,13],[26,13]], [[7,25],[26,-5],[43,-5],[51,-17]],
      [[-47,-7],[-32,-7],[-25,-18]], [[35,23],[47,23]] ],
    [ [[-49,-12],[-27,-12],[-9,18],[-9,26]], [[-38,-23],[-18,-23],[6,16],[23,16]],
      [[-5,-26],[-5,-13],[17,23],[37,23]], [[11,-23],[30,8],[48,-22]],
      [[27,-23],[37,-7]], [[-39,13],[-29,13],[-21,26]] ],
    [ [[-48,17],[-30,17],[-6,-22],[17,-22]], [[-35,25],[-13,25],[13,-17],[37,-17]],
      [[-17,-16],[-7,0],[-19,20]], [[7,25],[33,-17],[47,5],[38,5]],
      [[-49,-8],[-37,-8]], [[27,22],[47,22],[52,14]] ]
  ];
  function carved(ctx, x, y, size, variant, signal, phase, rails, verticalScale) {
    var strokes = inscriptions[variant % inscriptions.length];
    ctx.save(); ctx.translate(x, y); ctx.scale(size, size * (verticalScale || 1)); ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
    function stroke(points, portion) {
      var lengths = [], total = 0;
      for (var i = 1; i < points.length; i++) { var length = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]); lengths.push(length); total += length; }
      var remaining = total * portion;
      ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
      for (var j = 1; j < points.length && remaining > 0; j++) {
        var part = Math.min(1, remaining / lengths[j - 1]);
        ctx.lineTo(points[j - 1][0] + (points[j][0] - points[j - 1][0]) * part, points[j - 1][1] + (points[j][1] - points[j - 1][1]) * part);
        remaining -= lengths[j - 1];
      }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(200,204,183,.56)'; ctx.lineWidth = 0.75;
    strokes.forEach(function (points) { stroke(points, 1); });
    if (signal.mode === 'live') {
      // Different cuts answer different live bands. No timed pulse runs over music.
      var bands = signal.bands || {};
      var energy = [bands.low || 0, bands.mid || 0, bands.high || 0];
      strokes.forEach(function (points, index) {
        var strength = Math.min(1, Math.sqrt(energy[(index + variant) % 3] * 1.4 + signal.amplitude * 0.75 + (signal.transient || 0) * 0.3));
        ctx.strokeStyle = 'rgba(231,239,217,' + (strength * 0.95) + ')'; ctx.lineWidth = 1.2;
        stroke(points, 0.12 + strength * 0.88);
      });
    } else if (signal.mode === 'idle') {
      // When paused, a single slow tracing stroke gives the inscription a quiet life.
      var cycle = ((phase % strokes.length) + strokes.length) % strokes.length;
      var progress = cycle % 1;
      ctx.strokeStyle = 'rgba(224,234,215,' + (Math.sin(progress * Math.PI) * 0.35) + ')';
      ctx.lineWidth = 1.05; stroke(strokes[Math.floor(cycle)], Math.min(1, progress * 1.45));
    }
    if (rails) {
      ctx.strokeStyle = 'rgba(177,197,175,.24)'; ctx.lineWidth = 0.45;
      stroke([[-80,3],[-60,3],[-56,-3]], 1); stroke([[57,8],[63,0],[81,0]], 1);
      ctx.fillStyle = 'rgba(216,216,191,.52)'; ctx.fillRect(-64,11,1.3,1.3); ctx.fillRect(61,-12,1.3,1.3);
    }
    ctx.restore();
  }

  function mount() {
    disposeCurrent();
    if (!window.IntersectionObserver) return;
    var targets = [], cleanups = [], disposed = false, frame = 0, last = 0;
    var reduced = matchMedia('(prefers-reduced-motion: reduce)');
    function add(host, kind, variant) {
      var canvas = document.createElement('canvas');
      canvas.className = kind === 'bar' ? 'player-envelope' : kind === 'image' ? 'image-signal' : 'bio-sigil-canvas';
      canvas.setAttribute('aria-hidden', 'true'); canvas.inert = true;
      var context = canvas.getContext('2d');
      if (!context) return;
      host.appendChild(canvas);
      var target = { host: host, canvas: canvas, context: context, kind: kind, variant: variant === undefined ? targets.length % 3 : variant, phase: targets.length * 1.73, visible: false };
      targets.push(target);
      var image = kind === 'image' && host.querySelector('img');
      if (image) {
        var loaded = function () { if (reduced.matches && !disposed) draw(target, 0); };
        image.addEventListener('load', loaded);
        cleanups.push(function () { image.removeEventListener('load', loaded); });
      }
      cleanups.push(function () { canvas.remove(); });
    }
    var bar = document.getElementById('playerBar');
    if (bar) add(bar, 'bar');
    document.querySelectorAll('.gallery-item, .merch-card').forEach(function (host, index) {
      // Leave video affordances and most photographs unmarked; the larger fragments
      // punctuate the collection rather than becoming a watermark on every image.
      if (!host.hasAttribute('data-youtube') && index % 3 === 0) add(host, 'image', Math.floor(index / 3) % 3);
    });
    document.querySelectorAll('.bio-divider').forEach(function (divider, index) {
      var host = document.createElement('div'); host.className = 'bio-sigil-divider';
      host.setAttribute('aria-hidden', 'true'); host.inert = true;
      var hidden = divider.hidden; divider.hidden = true; divider.after(host);
      add(host, 'bio', index % 3);
      cleanups.push(function () { host.remove(); divider.hidden = hidden; });
    });
    function draw(target, now) {
      var rect = target.host.getBoundingClientRect();
      var width = Math.round(rect.width), height = Math.round(rect.height);
      if (!width || !height) return;
      var ratio = Math.min(devicePixelRatio || 1, 1.25);
      if (target.canvas.width !== Math.round(width * ratio) || target.canvas.height !== Math.round(height * ratio)) {
        target.canvas.width = Math.round(width * ratio); target.canvas.height = Math.round(height * ratio);
        target.history = [];
      }
      var ctx = target.context; ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
      var signal = reduced.matches ? { amplitude: 0.12, mode: 'idle' } : sample(now);
      target.canvas.dataset.signal = signal.mode;
      if (target.kind === 'bar') {
        target.canvas.dataset.renderer = 'continuous-waveform';
        waveform(ctx, width, height, signal, reduced.matches ? 0 : now, target);
      } else if (target.kind === 'image') {
        var image = target.host.querySelector('img');
        if (!image || !image.complete || !image.naturalWidth) return;
        var bounds = image.getBoundingClientRect();
        var left = bounds.left - rect.left, top = bounds.top - rect.top;
        var phase = reduced.matches ? target.phase : now * (0.17 + target.variant * 0.019) + target.phase;
        ctx.save(); ctx.beginPath(); ctx.rect(left, top, bounds.width, bounds.height); ctx.clip();
        var size = Math.min(1.05, bounds.width / 280);
        var edgeX = left + (target.variant === 1 ? 44 * size : bounds.width - 44 * size);
        var edgeY = top + 35 * size;
        // A dark hairline gives the stone cuts definition against pale photographs.
        ctx.shadowColor = 'rgba(5,11,8,.8)'; ctx.shadowBlur = 2;
        carved(ctx, edgeX, edgeY, size, target.variant, signal, phase, false);
        ctx.restore();
      } else {
        carved(ctx, width / 2, height / 2, Math.min(2.1, width / 175), target.variant, signal, reduced.matches ? target.phase : now * (0.21 + target.variant * 0.023) + target.phase, true, 0.48);
      }
    }
    function allowed() { return !disposed && !document.hidden && !reduced.matches && !document.documentElement.classList.contains('bp-intro-active') && targets.some(function (target) { return target.visible; }); }
    function tick(now) {
      frame = 0;
      if (!allowed()) return;
      if (now - last >= 1000 / 18) {
        targets.forEach(function (target) {
          if (target.visible && (target.kind === 'bar' || !target.lastDraw || now - target.lastDraw >= 1000 / 12)) { draw(target, now / 1000); target.lastDraw = now; }
        }); last = now;
      }
      frame = requestAnimationFrame(tick);
    }
    function refresh() {
      cancelAnimationFrame(frame); frame = 0; last = 0;
      if (reduced.matches) targets.forEach(function (target) { draw(target, 0); });
      else if (allowed()) frame = requestAnimationFrame(tick);
    }
    var intersection = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { targets.forEach(function (target) { if (target.host === entry.target) target.visible = entry.isIntersecting; }); }); refresh();
    });
    targets.forEach(function (target) { intersection.observe(target.host); });
    var gate = new MutationObserver(refresh); gate.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('visibilitychange', refresh); reduced.addEventListener('change', refresh); window.addEventListener('resize', refresh);
    refresh();
    disposeCurrent = function () {
      disposed = true; cancelAnimationFrame(frame); intersection.disconnect(); gate.disconnect();
      document.removeEventListener('visibilitychange', refresh); reduced.removeEventListener('change', refresh); window.removeEventListener('resize', refresh);
      cleanups.forEach(function (cleanup) { cleanup(); });
    };
  }
  window.SiteVisuals = { sample: sample, mount: mount, dispose: function () { disposeCurrent(); } };
  mount();
})();
