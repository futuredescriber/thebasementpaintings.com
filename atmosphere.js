(function () {
  var disposeCurrent = function () {};
  var outlinePaths = null, outlineRequest = null;
  function loadOutline() {
    if (outlineRequest) return;
    outlineRequest = fetch(new URL('images/structure-outline.svg', location.href)).then(function (response) {
      if (!response.ok) throw new Error('Outline unavailable');
      return response.text();
    }).then(function (text) {
      var svg = new DOMParser().parseFromString(text, 'image/svg+xml');
      outlinePaths = [];
      svg.querySelectorAll('path').forEach(function (path) {
        var secondary = !!path.closest('#structure-secondary-facets');
        (path.getAttribute('d').match(/M[^M]*/g) || []).forEach(function (part) {
          var coordinates = part.match(/-?\d+(?:\.\d+)?/g).map(Number), points = [], segments = [], length = 0;
          for (var index = 0; index + 1 < coordinates.length; index += 2) points.push([coordinates[index], coordinates[index + 1]]);
          for (var index = 1; index < points.length; index++) {
            var a = points[index - 1], b = points[index];
            var dx = b[0] - a[0], dy = b[1] - a[1], distance = Math.hypot(dx, dy);
            if (distance) segments.push({ x: a[0], y: a[1], dx: dx, dy: dy, start: length, end: length + distance, inverse: 1 / distance });
            length += distance;
          }
          if (length) outlinePaths.push({ segments: segments, path: new Path2D(part), length: length, secondary: secondary });
        });
      });
    }).catch(function () { outlinePaths = []; });
  }
  function outlineParameters(amplitude) { return { duration: 4.5 + amplitude * 5, opacity: Math.min(1, (0.075 + amplitude * 0.46) * laserIntensity) }; }
  var laserRate = 1.17, laserIntensity = 1.287, cloudVisibility = 1.4625;
  // Conservative sky outline in the original 2500 × 1668 photograph.
  // Map it through the actual background crop, keeping light off the stone.
  var sky = [[0,0],[2500,0],[2500,140],[2150,140],[1920,300],[1760,180],
    [1650,300],[1530,300],[1500,380],[1400,400],[1340,550],[1260,680],
    [1190,680],[1110,520],[1040,440],[930,400],[870,300],[740,280],
    [670,210],[520,330],[410,250],[220,180],[80,190],[0,220]];
  // Desktop cloud banks outside the monument wings, inset from the stone and
  // stopped above the foreground. Mobile keeps its original central-sky mask.
  var outerClouds = [
    [[0,270],[78,270],[170,415],[302,575],[435,745],[520,915],
      [470,940],[330,865],[160,805],[0,760]],
    [[2340,245],[2500,245],[2500,970],[2390,960],[2200,915],[2020,915],
      [1830,990],[1850,865],[1940,690],[2070,535],[2220,375]]
  ];
  var path = [[1135,1210],[1320,1210],[1630,1668],[760,1668]];

  function inside(x, y, polygon) {
    var result = false;
    for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      var a = polygon[i], b = polygon[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
    }
    return result;
  }

  function mount() {
    disposeCurrent();
    var background = document.querySelector('.page-bg--home');
    if (!background) return function () {};
    loadOutline();
    var canvas = document.createElement('canvas');
    canvas.className = 'home-atmosphere';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.inert = true;
    var context = canvas.getContext('2d');
    if (!context) return function () {};
    document.body.appendChild(canvas);
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    var disposed = false;
    var frame = 0;
    var last = 0;
    var clock = 0;
    var width, height, mobile, scale, offsetX, offsetY, ratio, cloudMask;
    var groups = [];
    var particles = [];
    var dirty = false;
    var etching = null, lastEtching = null;
    var nextPath = 5 + Math.random() * 4;
    var nextEtching = 5 + Math.random() * 5;
    var laser = null, nextLaser = 3 / laserRate, quietLaser = (10 + Math.random() * 7) / laserRate, lastHue = -1;
    var laserColors = [{ name: 'red', rgb: '218,91,83' }, { name: 'blue', rgb: '105,162,226' }, { name: 'green', rgb: '112,202,157' }];
    var image = new Image();
    var colors = ['224,230,227', '224,230,227', '224,230,227', '162,202,190', '192,175,209'];
    image.decoding = 'async';
    image.src = new URL('images/backgrounds/home-hero.webp', location.href).href;

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      mobile = width <= 768;
      ratio = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      var bounds = background.getBoundingClientRect();
      scale = Math.max(bounds.width / 2500, bounds.height / 1668);
      offsetX = bounds.left + (bounds.width - 2500 * scale) * (mobile ? 0.47 : 0.5);
      offsetY = bounds.top + (bounds.height - 1668 * scale) * 0.5;
      etching = null; lastEtching = null;
      groups = [];
      dirty = false;
      nextPath = clock + 5 + Math.random() * 4;
      nextEtching = clock + 5 + Math.random() * 5;
      particles = [];
      // Reserve half the desktop glints for the two outer banks, without
      // increasing particle count or adding a per-frame sampling pass.
      for (var tries = 0; particles.length < (mobile ? 40 : 16) && tries < 1000; tries++) {
        var x = 20 + Math.random() * Math.max(1, width - 40);
        var y = 95 + Math.random() * Math.max(1, height * 0.6 - 95);
        if (!inside((x - offsetX) / scale, (y - offsetY) / scale, sky)) continue;
        addParticle(x, y);
      }
      if (!mobile) {
        cloudMask = new Path2D();
        [sky].concat(outerClouds).forEach(function (polygon) {
          polygon.forEach(function (point, index) {
            cloudMask[index ? 'lineTo' : 'moveTo'](offsetX + point[0] * scale, offsetY + point[1] * scale);
          });
          cloudMask.closePath();
        });
        outerClouds.forEach(function (polygon) {
          var xs = polygon.map(function (point) { return offsetX + point[0] * scale; });
          var ys = polygon.map(function (point) { return offsetY + point[1] * scale; });
          var left = Math.max(20, Math.min.apply(null, xs)), right = Math.min(width - 20, Math.max.apply(null, xs));
          var top = Math.max(95, Math.min.apply(null, ys)), bottom = Math.min(height * 0.75, Math.max.apply(null, ys));
          if (right <= left || bottom <= top) return;
          for (var tries = 0, count = 0; count < 8 && tries < 400; tries++) {
            var x = left + Math.random() * (right - left), y = top + Math.random() * (bottom - top);
            if (!inside((x - offsetX) / scale, (y - offsetY) / scale, polygon)) continue;
            addParticle(x, y, polygon); count++;
          }
        });
        // A tall desktop crop can hide an outer bank; keep its allocation in
        // the visible upper sky instead of reducing the total activity.
        for (var tries = 0; particles.length < 32 && tries < 1000; tries++) {
          var x = 20 + Math.random() * Math.max(1, width - 40);
          var y = 95 + Math.random() * Math.max(1, height * 0.6 - 95);
          if (inside((x - offsetX) / scale, (y - offsetY) / scale, sky)) addParticle(x, y);
        }
      }
    }

    function addParticle(x, y, polygon) {
      var duration = 7 + Math.random() * 6, wait = 1 + Math.random() * 4;
      particles.push({ x: x, y: y, polygon: polygon || sky,
        start: clock - Math.random() * (duration + wait), duration: duration, wait: wait,
        speed: 4 + Math.random() * 6, phase: Math.random() * Math.PI * 2,
        width: (mobile ? 1.5 : 1) + Math.random() * 2,
        color: colors[Math.floor(Math.random() * colors.length)] });
    }

    function renewParticle(particle) {
      // Change the source of each wisp after it dissolves, retaining its cloud
      // bank. Nothing teleports while visible or drifts across the monument.
      var xs = particle.polygon.map(function (point) { return offsetX + point[0] * scale; });
      var ys = particle.polygon.map(function (point) { return offsetY + point[1] * scale; });
      var left = Math.max(12, Math.min.apply(null, xs)), right = Math.min(width - 12, Math.max.apply(null, xs));
      var top = Math.max(95, Math.min.apply(null, ys)), bottom = Math.min(height * 0.75, Math.max.apply(null, ys));
      for (var attempt = 0; attempt < 60; attempt++) {
        var x = left + Math.random() * (right - left), y = top + Math.random() * (bottom - top);
        if (inside((x - offsetX) / scale, (y - offsetY) / scale, particle.polygon)) { particle.x = x; particle.y = y; break; }
      }
      particle.start = clock;
      particle.phase = Math.random() * Math.PI * 2;
    }

    function safeRect(x, y, w, h, polygon) {
      // Test the edges and interior, not just a center point, before sampling.
      for (var row = 0; row <= 3; row++) {
        for (var column = 0; column <= 3; column++) {
          if (!inside(x + w * column / 3, y + h * row / 3, polygon)) return false;
        }
      }
      return true;
    }
    function clip(polygon) {
      context.beginPath();
      polygon.forEach(function (point, index) {
        context[index ? 'lineTo' : 'moveTo'](offsetX + point[0] * scale, offsetY + point[1] * scale);
      });
      context.closePath();
      context.clip();
    }
    function clusterPath() {
      if (!image.complete || !image.naturalWidth) return;
      var polygon = path;
      var center;
      for (var tries = 0; tries < 100; tries++) {
        var x = 25 + Math.random() * Math.max(1, width - 50);
        var y = height * (0.72 + Math.random() * 0.2);
        if (inside((x - offsetX) / scale, (y - offsetY) / scale, polygon)) { center = [x,y]; break; }
      }
      if (!center) return;
      var group = { start: clock, duration: mobile ? 1.25 + Math.random() * 0.35 : 1 + Math.random() * 0.3, blocks: [] };
      var direction = Math.random() < 0.5 ? -1 : 1;
      for (var i = 0; i < (mobile ? 4 : 3); i++) {
        var w = 18 + Math.random() * 22;
        var h = (mobile ? 6 : 4) + Math.random() * 9;
        var bx = center[0] + (Math.random() - 0.5) * 70 - w / 2;
        var by = center[1] + (Math.random() - 0.5) * 32;
        var shift = direction * (mobile ? 2 + Math.random() * 3 : 1 + Math.random() * 2);
        var margin = mobile ? 16 : 12;
        var sx = (bx - offsetX + shift) / scale;
        var sy = (by - offsetY) / scale;
        if (!safeRect(sx, sy, w / scale, h / scale, polygon) ||
            !safeRect((bx - offsetX - margin) / scale, (by - offsetY - 2) / scale, (w + margin * 2) / scale, (h + 4) / scale, polygon)) continue;
        var tile = document.createElement('canvas');
        tile.width = Math.ceil(w * ratio);
        tile.height = Math.ceil(h * ratio);
        var tileContext = tile.getContext('2d');
        if (!tileContext) continue;
        tileContext.drawImage(image, sx, sy, w / scale, h / scale, 0, 0, tile.width, tile.height);
        // Match the site's dark photograph treatment before compositing softly.
        tileContext.fillStyle = 'rgba(0,0,0,0.45)';
        tileContext.fillRect(0, 0, tile.width, tile.height);
        group.blocks.push({ tile: tile, x: bx, y: by, width: w, height: h, shift: shift });
      }
      if (group.blocks.length) {
        groups.push(group);
        return true;
      }
      return false;
    }
    function draw(elapsed) {
      // Use the same RAF timestamp as the player canvas so its shared analyser
      // cache serves both views, regardless of callback execution order.
      var signal = window.SiteVisuals ? window.SiteVisuals.sample(last / 1000) : { mode: 'idle', amplitude: 0.06 };
      var live = signal.mode === 'live', response = signal.amplitude;
      var bands = signal.bands || { low: 0, mid: 0, high: 0 };
      canvas.dataset.signal = signal.mode;
      // A live attack can open a trace after its cooldown. Silence still gets
      // an occasional faint, single-colour discovery; never a flashing chase.
      if (!laser && !etching && clock >= nextLaser && (clock >= quietLaser || (live && signal.transient > 0.2)) && outlinePaths && outlinePaths.length) {
        var hue = (lastHue + 1 + Math.floor(Math.random() * 2)) % laserColors.length;
        laser = { start: clock, progress: 0, reverse: Math.random() < 0.5, color: laserColors[hue] };
        lastHue = hue;
        canvas.dataset.outlineHue = laser.color.name;
      }
      if (clock >= nextPath) { var madePath = clusterPath(); nextPath = clock + (madePath ? 8 + Math.random() * 6 : 3); }
      groups = groups.filter(function (group) { return clock - group.start < group.duration; });
      if (!etching && !laser && clock > nextEtching) {
        // Small nonverbal traces move among safe cloud locations, never words
        // repeatedly appearing in the gap between the monuments.
        var locations = particles.filter(function (point) {
          return point.x > 48 && point.x < width - 48 && point.y > 130 &&
            (!lastEtching || Math.hypot(point.x - lastEtching.x, point.y - lastEtching.y) > Math.min(95, width * 0.22)) &&
            safeRect((point.x - 30 - offsetX) / scale, (point.y - 16 - offsetY) / scale, 60 / scale, 32 / scale, sky);
        });
        if (locations.length) {
          var location = locations[Math.floor(Math.random() * locations.length)];
          etching = { start: clock, x: location.x, y: location.y, variant: Math.floor(Math.random() * 3) };
          lastEtching = etching;
        }
        nextEtching = clock + 8 + Math.random() * 6;
      }
      if (!dirty && !particles.length && !groups.length && !etching && !laser) return;
      context.clearRect(0, 0, width, height);
      // Drifting digital wisps: a shared wind, independent eddies, and brief
      // broken afterimages. Audio controls brightness and fragmentation, while
      // motion continues through quiet passages without synthesizing a beat.
      context.save();
      if (mobile) clip(sky); else context.clip(cloudMask);
      particles.forEach(function (particle, index) {
        var age = clock - particle.start;
        if (age >= particle.duration + particle.wait) { renewParticle(particle); age = 0; }
        if (age > particle.duration) return;
        var life = age / particle.duration;
        var envelope = Math.min(1, life / 0.16, (1 - life) / 0.24);
        envelope = Math.max(0, envelope);
        // Separate real bass/mid/treble groups make changing musical detail
        // readable; a treble-heavy mix hid most of it in quiet passages.
        // Fixed gain preserves silence. Only paused ambience uses a time cycle.
        var energy = index % 3 === 0 ? bands.low : index % 3 === 1 ? bands.mid : bands.high;
        var pulse = (live ? Math.min(1, Math.max(0, Math.sqrt(energy) * 2.1 + signal.transient * 0.2 - (index % 4) * 0.04)) : 0.55 + 0.25 * Math.sin(age * 1.3 + particle.phase)) * envelope;
        var wind = particle.speed * (mobile ? 0.85 : 1);
        var driftX = age * wind + Math.sin(age * 0.65 + particle.phase) * 8;
        var driftY = Math.sin(age * 0.5 + particle.phase) * 8 - age * 1.2;
        var x = particle.x + driftX, y = particle.y + driftY;
        var fragment = live ? Math.min(1, signal.transient * 1.5 + bands.high) : 0.15;
        // Sparse offsets interrupt the flow like digital dust, not a static
        // star field. The offset changes at most four times per second.
        var fracture = Math.sin(Math.floor(clock * 4) * 2.39 + particle.phase * 7) > 0.72;
        if (fracture) { x += fragment * 5; y += fragment * (index % 2 ? 2 : -2); }
        // This shared fill also colors the echoes below: apply the gain once.
        context.fillStyle = 'rgba(' + particle.color + ',' + Math.min(1, pulse * (mobile ? 0.64 : 0.38) * (laser ? 0.55 : 1) * cloudVisibility) + ')';
        var glintWidth = particle.width + pulse * (mobile ? 3 : 4);
        context.fillRect(x, y, glintWidth, 1);
        // Two detached, fading grains follow the curved drift instead of
        // drawing continuous lines across the photograph.
        context.globalAlpha = 0.32;
        context.fillRect(x - wind * 0.65, y + 1.5, Math.max(1, glintWidth * 0.5), 1);
        context.globalAlpha = 0.13;
        context.fillRect(x - wind * 1.4, y + 3, 1.5, 1);
        context.globalAlpha = 1;
        if (live && signal.transient > 0.12 && index % 4 === 0) {
          context.globalAlpha = signal.transient * 0.5;
          context.fillRect(x + 5, y + 2, 1, 1);
          context.globalAlpha = 1;
        }
        if (!laser && index % 3 === 0) {
          // Fine broken pixel echoes between monument traces; never displaced
          // cloud tiles. Music controls their visibility, idle uses its sparkle.
          context.globalAlpha = live ? Math.min(0.75, pulse * 0.8 + signal.transient * 0.25) : pulse * 0.35;
          var spread = 3 + Math.sin(age + particle.phase) * 2 + fragment * 6;
          context.fillRect(x + spread, y + (index % 2 ? -2 : 2), 2 + index % 3, 1);
          context.fillRect(x + spread * 2, y + 1, 1, 1);
          context.globalAlpha = 1;
        }
      });
      context.restore();
      groups.forEach(function (group) {
        var phase = (clock - group.start) / group.duration;
        var pulse = Math.pow(Math.sin(Math.PI * phase), 2);
        context.save();
        clip(path);
        context.globalAlpha = pulse * (mobile ? 0.26 : 0.12) * (live ? response * 1.5 : 1);
        group.blocks.forEach(function (block) {
          var drift = block.shift * (live ? bands.low : Math.sin(phase * Math.PI * 0.5));
          context.drawImage(block.tile, block.x + drift, block.y, block.width, block.height);
        });
        context.restore();
      });
      if (etching) {
        context.save();
        clip(sky);
        var phase = Math.min(1, (clock - etching.start) / 4.5);
        var opacity = Math.pow(Math.sin(Math.PI * phase), 2) * (live ? 0.07 + Math.sqrt(response) * 0.38 : 0.16);
        var cuts = [
          [[-25, 5], [-12, -6], [-4, -6]], [[5, 7], [13, 7], [24, -4]],
          [[-14, 11], [-6, 11]], [[8, -11], [15, -11]]
        ];
        context.translate(etching.x, etching.y);
        context.rotate((etching.variant - 1) * 0.38);
        context.lineWidth = 0.75; context.lineCap = 'round';
        cuts.forEach(function (points, index) {
          var energy = live ? (index % 2 ? bands.high : bands.mid) : 0.12;
          context.strokeStyle = 'rgba(207,225,217,' + opacity * (0.5 + Math.sqrt(energy) * 0.8) + ')';
          context.beginPath(); context.moveTo(points[0][0], points[0][1]);
          for (var point = 1; point < points.length; point++) context.lineTo(points[point][0], points[point][1]);
          context.stroke();
        });
        if (phase >= 1) etching = null;
        context.restore();
      }
      if (laser) {
        // Read the live level every frame, not just at the beginning of a burst.
        // Accumulated progress lets louder passages lengthen the trace smoothly.
        var parameters = outlineParameters(response);
        laser.progress += elapsed / parameters.duration;
        var phase = Math.min(1, laser.progress);
        var pulse = Math.min(1, (clock - laser.start) / 0.45, (1 - phase) / 0.16);
        context.save(); context.translate(offsetX, offsetY); context.scale(scale, scale);
        context.lineCap = 'round'; context.lineJoin = 'round';
        // Batch all primary/secondary cuts. Per-path shadows previously caused
        // dozens of blur passes over large monument bounds on every frame.
        var batches = [new Path2D(), new Path2D()];
        outlinePaths.forEach(function (record, index) {
          var local = Math.max(0, Math.min(1, (phase - (index % 5) * 0.018) / 0.92));
          var from = Math.max(0, (local - 0.65) / 0.35) * record.length;
          var to = Math.min(1, local / 0.44) * record.length;
          if (laser.reverse) { var swap = from; from = record.length - to; to = record.length - swap; }
          var batch = batches[record.secondary ? 1 : 0];
          if (from === 0 && to === record.length) { batch.addPath(record.path); return; }
          for (var index = 0; index < record.segments.length; index++) {
            var segment = record.segments[index];
            if (segment.start >= to) break;
            if (segment.end <= from) continue;
            var start = Math.max(from, segment.start), end = Math.min(to, segment.end);
            if (end > start) {
              var first = (start - segment.start) * segment.inverse, final = (end - segment.start) * segment.inverse;
              batch.moveTo(segment.x + segment.dx * first, segment.y + segment.dy * first);
              batch.lineTo(segment.x + segment.dx * final, segment.y + segment.dy * final);
            }
          }
        });
        batches.forEach(function (batch, index) {
          var relief = index ? (live ? 0.15 + bands.mid * 0.85 : 0.35) : 1;
          var opacity = pulse * parameters.opacity * relief;
          // A faint wider stroke retains the soft edge without a blur/filter.
          context.lineWidth = 1.65 / scale;
          context.strokeStyle = 'rgba(' + laser.color.rgb + ',' + opacity * 0.15 + ')'; context.stroke(batch);
          context.lineWidth = (mobile ? 0.85 : 0.75) / scale;
          context.strokeStyle = 'rgba(' + laser.color.rgb + ',' + opacity + ')'; context.stroke(batch);
        });
        context.restore();
        if (phase >= 1) { laser = null; delete canvas.dataset.outlineHue; nextLaser = clock + (5 + Math.random() * 4) / laserRate; quietLaser = clock + (12 + Math.random() * 10) / laserRate; }
      }
      dirty = !!(particles.length || groups.length || etching || laser);
    }

    function allowed() {
      return !disposed && !document.hidden && !reduced.matches &&
        !document.documentElement.classList.contains('bp-intro-active');
    }
    function tick(now) {
      frame = 0;
      if (!allowed()) return;
      if (!last) last = now;
      if (now - last >= 1000 / 20) {
        var elapsed = Math.min((now - last) / 1000, 0.2);
        clock += elapsed;
        last = now;
        draw(elapsed);
      }
      frame = requestAnimationFrame(tick);
    }
    function refresh() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
      if (allowed()) frame = requestAnimationFrame(tick);
      else context.clearRect(0, 0, width, height);
    }
    var observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', refresh);
    reduced.addEventListener('change', refresh);
    resize();
    refresh();
    disposeCurrent = function () {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', refresh);
      reduced.removeEventListener('change', refresh);
      image.removeAttribute('src');
      groups = [];
      particles = [];
      etching = null;
      laser = null;
      canvas.remove();
    };
    return disposeCurrent;
  }
  window.SiteAtmosphere = { mount: mount, dispose: function () { disposeCurrent(); } };
})();
