(function () {
  var disposeCurrent = function () {};
  function mount() {
    disposeCurrent();
    var home = document.querySelector('.home-wrapper');
    var nav = document.querySelector('.site-nav');
    if (!nav) return function () {};
    var root = document.createElement('div');
    root.className = 'arc-nav' + (home ? ' arc-nav--home' : '');
    root.innerHTML = '<button class="arc-nav__handle" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="arc-navigation-panel"><svg viewBox="0 0 32 32" aria-hidden="true"><g class="arc-nav__handle-base"><path d="M11 5a13 13 0 0 1 0 22M10 11l6 5-6 5"/><circle cx="22" cy="16" r="1"/></g><g class="arc-nav__handle-draw"><path pathLength="100" d="M11 5a13 13 0 0 1 0 22M10 11l6 5-6 5"/></g><g class="arc-nav__handle-ghost"><path d="M11 5a13 13 0 0 1 0 22M10 11l6 5-6 5"/></g></svg></button><nav class="arc-nav__panel" id="arc-navigation-panel" aria-label="Choose a page" hidden><svg class="arc-nav__rail" viewBox="0 0 150 290" aria-hidden="true"><path d="M4 0A170 170 0 0 1 71 260"/><path d="M11 18A154 154 0 0 1 73 244"/><g class="arc-nav__empty"><text x="28" y="88">∷</text><text x="45" y="286">⌁</text></g></svg><div class="arc-nav__links"></div><span class="sr-only arc-nav__status" aria-live="polite"></span></nav>';
    (home || document.body).appendChild(root);
    var menuButton = document.createElement('button');
    menuButton.type = 'button';
    menuButton.className = 'arc-nav__menu-button';
    menuButton.setAttribute('aria-label', 'Open navigation');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-controls', 'arc-navigation-panel');
    menuButton.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11" stroke-dasharray="16 5 3 6"/><path d="m13 10 6 6-6 6M8 16h4m9 0h3"/></svg>';
    nav.appendChild(menuButton);
    var controller = new AbortController();
    var handle = root.querySelector('.arc-nav__handle');
    var dots = document.createElement('span');
    dots.className = 'arc-nav__hint-dots';
    dots.setAttribute('aria-hidden', 'true');
    [7.1, 9.3, 6.7, 10.9, 8.1, 11.7, 7.9].forEach(function (period, index) {
      var dot = document.createElement('span');
      dot.style.setProperty('--dot-index', index);
      dot.style.setProperty('--dot-period', period + 's');
      dot.style.setProperty('--dot-delay', (-index * 1.37) + 's');
      dot.innerHTML = '<i></i>';
      dots.appendChild(dot);
    });
    handle.appendChild(dots);
    var panel = root.querySelector('.arc-nav__panel');
    var status = root.querySelector('.arc-nav__status');
    var pages = ['Home', 'Music', 'Gallery', 'Bio', 'Contact'];
    var symbols = ['⌂', '∴', '⋮', '⟡', '∷'];
    var route = location.pathname.replace(/\.html$/, '').replace(/^\/|\/$/g, '');
    var current = Math.max(0, pages.findIndex(function (name) { return name.toLowerCase() === route; }));
    var links = pages.map(function (name) {
      var link = document.createElement('a');
      link.href = name === 'Home' ? '/' : name.toLowerCase() + '.html';
      link.dataset.arcName = name;
      link.innerHTML = '<span class="arc-nav__label" aria-hidden="true"></span>';
      root.querySelector('.arc-nav__links').appendChild(link);
      return link;
    });
    var selected = current;
    var opened = false;
    var progress = 0;
    var opener = handle;
    var gesture = null;
    var suppressClick = false;
    var echoes = [];
    var hideTimer, decodeTimer, hintTimer;
    var decoding = false;
    var hintStopped = false;
    var mobile = window.matchMedia('(max-width: 768px)');
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    function listen(target, type, handler, capture) {
      target.addEventListener(type, handler, { signal: controller.signal, capture: !!capture });
    }
    function clamp(value) { return Math.max(0, Math.min(1, value)); }
    function wrap(index) { return ((index % pages.length) + pages.length) % pages.length; }
    function stopDecode() { clearInterval(decodeTimer); decodeTimer = null; decoding = false; }
    function decode() {
      stopDecode();
      var label = links[selected].firstChild, name = pages[selected], tick = 0;
      if (reduced.matches) { label.textContent = name; return; }
      decoding = true;
      label.textContent = symbols[selected];
      decodeTimer = setInterval(function () {
        tick++;
        label.textContent = name.split('').map(function (letter, index) {
          return index < tick * 2 ? letter : symbols[(selected + index + tick) % symbols.length];
        }).join('');
        if (tick >= 4) { label.textContent = name; stopDecode(); }
      }, 50);
    }
    function renderWheel(base, offset, live) {
      root.classList.toggle('is-wheeling', live);
      var half = pages.length / 2;
      links.forEach(function (link, index) {
        var slot = ((index - base + offset + half) % pages.length + pages.length) % pages.length - half;
        var old = Number(link.dataset.arcSlot);
        link.classList.toggle('is-wrapping', Number.isFinite(old) && Math.abs(old - slot) > half);
        var angle = Math.asin(slot * 52 / 170) * 180 / Math.PI;
        link.style.setProperty('--arc-angle', angle + 'deg');
        link.style.setProperty('--arc-counter-angle', -angle + 'deg');
        link.style.opacity = live ? clamp((2.5 - Math.abs(slot)) / 0.35) : 1;
        link.dataset.arcSlot = slot;
        link.classList.toggle('is-selected', index === selected);
        link.classList.toggle('is-current', index === current);
        if (index === current) link.setAttribute('aria-current', 'page');
        link.setAttribute('aria-label', (index === selected ? 'Open ' : 'Select ') + pages[index]);
        link.firstChild.textContent = pages[index];
      });
    }
    function select(index, announce, scramble) {
      stopDecode();
      selected = wrap(index);
      renderWheel(selected, 0, false);
      if (opened && scramble !== false) decode();
      if (announce) status.textContent = pages[selected] + ' selected. Tap to open.';
    }
    function clearEchoes() {
      echoes.forEach(function (echo) { if (echo.animation) echo.animation.cancel(); echo.node.remove(); });
      echoes = [];
    }
    function createEchoes() {
      clearEchoes();
      if (reduced.matches || !handle.animate) return;
      for (var i = 0; i < 3; i++) {
        var node = document.createElement('span');
        node.className = 'arc-nav__open-copy';
        node.setAttribute('aria-hidden', 'true');
        node.innerHTML = handle.querySelector('svg').outerHTML;
        root.appendChild(node);
        echoes.push({ node: node, distance: 24 + i * 18, opacity: 0.18 - i * 0.025 });
      }
    }
    function pullEchoes(value) {
      if (!echoes.length || echoes.some(function (echo) { return echo.animation || !echo.node.isConnected; })) createEchoes();
      echoes.forEach(function (echo) {
        if (echo.animation) { echo.animation.cancel(); echo.animation = null; }
        echo.node.style.transform = 'translateX(' + echo.distance * value + 'px)';
        echo.node.style.opacity = echo.opacity * value * 1.65;
      });
    }
    function animateEchoes(push, hold) {
      if (push) createEchoes();
      else if (echoes.some(function (echo) { return echo.animation; })) {
        var positions = echoes.map(function (echo) {
          var style = getComputedStyle(echo.node);
          return { transform: style.transform, opacity: style.opacity };
        });
        createEchoes();
        echoes.forEach(function (echo, index) {
          echo.node.style.transform = positions[index].transform;
          echo.node.style.opacity = positions[index].opacity;
        });
      }
      if (reduced.matches) { clearEchoes(); return; }
      echoes.forEach(function (echo) {
        var target = hold ? 'translateX(' + echo.distance + 'px)' : 'translateX(0)';
        var opacity = hold ? echo.opacity * 0.75 : 0;
        var frames = push ? [{ transform: 'translateX(0)', opacity: 0 },
          { transform: 'translateX(' + echo.distance + 'px)', opacity: echo.opacity, offset: 0.45 },
          { transform: target, opacity: opacity }] : [
          { transform: echo.node.style.transform || 'translateX(0)', opacity: Number(echo.node.style.opacity) || 0 },
          { transform: target, opacity: opacity }];
        echo.animation = echo.node.animate(frames, { duration: push ? 480 : 300, easing: 'ease-out' });
        (function (entry, effect) {
          effect.finished.then(function () {
            if (entry.animation !== effect || !entry.node.isConnected) return;
            if (hold && opened) {
              entry.node.style.transform = target;
              entry.node.style.opacity = opacity;
              entry.animation = null;
            } else entry.node.remove();
          }).catch(function () { entry.node.remove(); });
        })(echo, echo.animation);
      });
    }
    function stopHint() {
      hintStopped = true; clearTimeout(hintTimer); root.classList.remove('is-hinting');
      try { sessionStorage.setItem('bp-arc-hint', 'seen'); } catch (error) { /* optional storage */ }
    }
    function checkHint() {
      clearTimeout(hintTimer);
      if (!home || hintStopped || !mobile.matches || reduced.matches || document.hidden ||
          document.documentElement.classList.contains('bp-intro-active')) { root.classList.remove('is-hinting'); return; }
      try { if (sessionStorage.getItem('bp-arc-hint') === 'seen') return; } catch (error) { /* optional storage */ }
      hintTimer = setTimeout(function () {
        root.classList.add('is-hinting');
        try { sessionStorage.setItem('bp-arc-hint', 'seen'); } catch (error) { /* optional storage */ }
      }, 1800);
    }
    function setProgress(value, live) {
      progress = clamp(value);
      root.classList.toggle('is-pulling', live);
      root.classList.toggle('is-open', progress > 0);
      root.style.setProperty('--arc-open', progress);
      root.style.setProperty('--arc-shift', (1 - progress) * -20 + 'px');
      if (progress > 0) { clearTimeout(hideTimer); panel.hidden = false; }
      panel.inert = !opened || progress < 0.999;
      [handle, menuButton].forEach(function (button) {
        button.setAttribute('aria-expanded', String(progress > 0));
        button.setAttribute('aria-label', progress > 0 ? 'Close navigation' : 'Open navigation');
      });
    }
    function commitOpen(value, focus, trigger, fromPull) {
      stopHint(); clearTimeout(hideTimer);
      if (trigger) opener = trigger;
      opened = value;
      setProgress(value ? 1 : 0, false);
      root.classList.remove('is-wheeling');
      if (value) {
        if (fromPull) animateEchoes(false, true); else animateEchoes(true, true);
        select(selected, false, !fromPull);
        if (focus) links[selected].focus({ preventScroll: true });
      } else {
        stopDecode(); renderWheel(selected, 0, false); animateEchoes(false, false);
        hideTimer = setTimeout(function () {
          if (!opened && progress === 0) { panel.hidden = true; clearEchoes(); }
        }, reduced.matches ? 0 : 190);
        if (focus || fromPull || panel.contains(document.activeElement)) opener.focus({ preventScroll: true });
      }
    }
    function releaseCapture(id) {
      [root, handle].forEach(function (surface) { if (surface.hasPointerCapture(id)) surface.releasePointerCapture(id); });
    }
    function cancelGesture() {
      if (!gesture) return false;
      var previous = gesture; gesture = null;
      releaseCapture(previous.id);
      select(previous.index, false, false);
      clearEchoes();
      opened = previous.startOpened;
      setProgress(opened ? 1 : 0, false);
      if (opened) { createEchoes(); animateEchoes(false, true); }
      if (!opened) { panel.hidden = true; panel.inert = true; }
      suppressClick = true;
      return true;
    }
    function close(focus) { cancelGesture(); commitOpen(false, focus, null, true); }
    function open(focus, trigger) { if (mobile.matches) { cancelGesture(); commitOpen(true, focus, trigger, false); } }
    listen(handle, 'click', function (event) { if (opened) close(false); else open(event.detail === 0, handle); });
    listen(menuButton, 'click', function (event) { if (opened || progress > 0) close(false); else open(event.detail === 0, menuButton); });
    links.forEach(function (link, index) {
      listen(link, 'click', function (event) {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (selected !== index) { event.preventDefault(); select(index, true); }
        else if (decoding) event.preventDefault();
        else { if (index === current) event.preventDefault(); close(event.detail === 0 || index === current); }
      });
    });
    listen(root, 'keydown', function (event) {
      if (event.key === 'Escape') { event.preventDefault(); close(true); }
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      if (!opened) open(false, handle);
      select(selected + (event.key === 'ArrowUp' ? -1 : 1), true);
      links[selected].focus({ preventScroll: true });
    });
    listen(root, 'pointerdown', function (event) {
      suppressClick = false; stopHint();
      if (!event.isPrimary || event.button !== 0) return;
      var isHandle = !!event.target.closest('.arc-nav__handle');
      var offset = opened ? (links[selected].getBoundingClientRect().top + 22 - panel.getBoundingClientRect().top - 156) / 52 : 0;
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, index: selected, offset: offset,
        startProgress: progress, startOpened: opened, axis: null, dragged: false, fullAt: null };
      if (isHandle) { opener = handle; handle.setPointerCapture(event.pointerId); }
    });
    listen(root, 'pointermove', function (event) {
      if (!gesture || gesture.id !== event.pointerId) return;
      var dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
      if (!gesture.dragged && Math.hypot(dx, dy) < 10) return;
      gesture.dragged = true; suppressClick = true; stopDecode(); root.setPointerCapture(event.pointerId);
      if (!gesture.axis) gesture.axis = Math.abs(dx) > Math.abs(dy) ? 'pull' : (gesture.startOpened ? 'wheel' : 'blocked');
      if (gesture.axis === 'pull') {
        var value = gesture.startProgress + dx / (gesture.startOpened ? 64 : 96);
        setProgress(value, true); panel.inert = true; pullEchoes(progress);
        if (progress >= 0.999) {
          if (!gesture.fullAt) gesture.fullAt = { x: event.clientX, y: event.clientY };
          else if (Math.abs(event.clientY - gesture.fullAt.y) > 12 &&
              Math.abs(event.clientY - gesture.fullAt.y) > Math.abs(event.clientX - gesture.fullAt.x)) {
            gesture.axis = 'wheel'; gesture.x = gesture.fullAt.x; gesture.y = gesture.fullAt.y;
            gesture.offset = 0; gesture.index = selected; opened = true; setProgress(1, false); animateEchoes(false, true);
          }
        } else gesture.fullAt = null;
      }
      if (gesture.axis === 'wheel') {
        root.classList.remove('is-pulling');
        var offset = gesture.offset + (event.clientY - gesture.y) / 52;
        selected = wrap(gesture.index - Math.round(offset));
        renderWheel(gesture.index, offset, true);
      }
      if (event.cancelable) event.preventDefault();
    });
    listen(root, 'pointerup', function (event) {
      if (!gesture || gesture.id !== event.pointerId) return;
      var previous = gesture; gesture = null;
      releaseCapture(previous.id);
      if (!previous.dragged) return;
      if (previous.axis === 'pull') commitOpen(progress >= 0.5, false, opener, true);
      else if (previous.axis === 'wheel') { select(selected, true, false); links[selected].focus({ preventScroll: true }); }
      suppressClick = true;
    });
    listen(root, 'pointercancel', cancelGesture);
    listen(root, 'lostpointercapture', function (event) {
      if (gesture && gesture.id === event.pointerId && !root.hasPointerCapture(event.pointerId) && !handle.hasPointerCapture(event.pointerId)) cancelGesture();
    });
    listen(root, 'click', function (event) {
      if (!suppressClick || event.detail === 0) return;
      suppressClick = false; event.preventDefault(); event.stopImmediatePropagation();
    }, true);
    listen(document, 'pointerdown', function (event) { if (progress > 0 && !root.contains(event.target) && !menuButton.contains(event.target)) close(false); });
    listen(document, 'keydown', function (event) { if (progress > 0 && event.key === 'Escape') { event.preventDefault(); close(true); } });
    listen(mobile, 'change', function () { if (!mobile.matches) close(false); checkHint(); });
    listen(reduced, 'change', function () { if (reduced.matches) { stopDecode(); clearEchoes(); renderWheel(selected, 0, false); } checkHint(); });
    listen(document, 'visibilitychange', function () { if (document.hidden) cancelGesture(); checkHint(); });
    listen(handle, 'animationend', function () { root.classList.remove('is-hinting'); });
    var observer = new MutationObserver(checkHint);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    renderWheel(selected, 0, false); setProgress(0, false);
    var checkbox = nav.querySelector('.nav-toggle'); if (checkbox) checkbox.checked = false;
    nav.classList.add('arc-enhanced'); checkHint();
    disposeCurrent = function () {
      if (gesture) releaseCapture(gesture.id);
      gesture = null; controller.abort(); observer.disconnect(); stopDecode(); clearEchoes();
      clearTimeout(hintTimer); clearTimeout(hideTimer); nav.classList.remove('arc-enhanced'); menuButton.remove(); root.remove();
    };
    return disposeCurrent;
  }
  window.SiteArcNavigation = { mount: mount, dispose: function () { disposeCurrent(); } };
})();
