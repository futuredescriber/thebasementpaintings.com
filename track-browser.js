(function () {
  var disposeCurrent = function () {};
  function mount() {
    disposeCurrent();
    if (!window.SitePlayer || !window.SitePlayer.getCatalog) return;
    var toggle = document.getElementById('nowPlaying');
    if (!toggle) return;
    var section = toggle.closest('.player-song-section');
    if (!section) {
      section = document.createElement('div'); section.className = 'player-song-section';
      toggle.before(section); section.appendChild(toggle);
    }
    var controller = new AbortController();
    var progress = document.getElementById('progressBar');
    var dragPointer = null, dragTrack = null;
    function seekAt(clientX) {
      var state = window.SitePlayer.getState();
      if (!progress || !window.SitePlayer.seek || !Number.isFinite(state.duration) || state.duration <= 0) return;
      var bounds = progress.getBoundingClientRect();
      if (!bounds.width) return;
      window.SitePlayer.seek(Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width)) * state.duration);
      reflectPosition();
    }
    function finishDrag() {
      if (!progress || dragPointer === null) return;
      var pointer = dragPointer; dragPointer = null; dragTrack = null;
      progress.classList.remove('is-scrubbing');
      if (progress.hasPointerCapture(pointer)) progress.releasePointerCapture(pointer);
    }
    if (progress) {
      progress.tabIndex = 0; progress.setAttribute('role', 'slider'); progress.setAttribute('aria-label', 'Song position');
      progress.setAttribute('aria-valuemin', '0');
      progress.addEventListener('pointerdown', function (event) {
        if (!event.isPrimary || event.button !== 0 || dragPointer !== null) return;
        var state = window.SitePlayer.getState();
        if (!Number.isFinite(state.duration) || state.duration <= 0) return;
        event.preventDefault();
        dragPointer = event.pointerId; dragTrack = state.track && state.track.id;
        progress.setPointerCapture(dragPointer); progress.classList.add('is-scrubbing');
        progress.focus({ preventScroll: true }); seekAt(event.clientX);
      }, { signal: controller.signal });
      progress.addEventListener('pointermove', function (event) {
        if (event.pointerId === dragPointer) seekAt(event.clientX);
      }, { signal: controller.signal });
      progress.addEventListener('pointerup', function (event) {
        if (event.pointerId !== dragPointer) return;
        seekAt(event.clientX); finishDrag();
      }, { signal: controller.signal });
      progress.addEventListener('pointercancel', function (event) { if (event.pointerId === dragPointer) finishDrag(); }, { signal: controller.signal });
      progress.addEventListener('lostpointercapture', function (event) { if (event.pointerId === dragPointer) finishDrag(); }, { signal: controller.signal });
      // Clicks and taps seek on pointerdown. Do not seek again on the synthetic
      // click after a drag: reaching the end may already have advanced the queue.
      progress.addEventListener('keydown', function (event) {
        if (!window.SitePlayer.seek || !['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        var state = window.SitePlayer.getState();
        if (!Number.isFinite(state.duration) || !state.duration) return;
        event.preventDefault();
        var position = event.key === 'Home' ? 0 : event.key === 'End' ? state.duration : state.time + (['ArrowLeft', 'ArrowDown'].includes(event.key) ? -5 : 5);
        window.SitePlayer.seek(position); reflectPosition();
      }, { signal: controller.signal });
    }
    function reflectPosition() {
      if (!progress) return;
      var state = window.SitePlayer.getState();
      var duration = Number.isFinite(state.duration) ? state.duration : 0;
      var seconds = Math.floor(state.time || 0);
      progress.setAttribute('aria-valuemax', String(Math.round(duration)));
      progress.setAttribute('aria-valuenow', String(Math.min(Math.round(duration), seconds)));
      progress.setAttribute('aria-valuetext', Math.floor(seconds / 60) + ' minutes ' + seconds % 60 + ' seconds');
    }
    // Keep the focused slider's spoken position current without a perpetual timer.
    if (progress) progress.addEventListener('focus', reflectPosition, { signal: controller.signal });
    var panel = document.createElement('section');
    panel.id = 'playerTrackBrowser'; panel.className = 'player-track-browser'; panel.hidden = true;
    panel.setAttribute('aria-label', 'All songs');
    var header = document.createElement('header');
    var title = document.createElement('h2'); title.textContent = 'All songs';
    header.append(title);
    var handle = document.createElement('button'); handle.type = 'button'; handle.className = 'player-track-handle';
    handle.setAttribute('aria-label', 'Collapse song picker');
    handle.innerHTML = '<svg viewBox="0 0 28 24" aria-hidden="true"><path d="M6 6l8 6 8-6M6 12l8 6 8-6"/></svg>';
    header.append(handle);
    var scroll = document.createElement('div'); scroll.className = 'player-track-scroll';
    var options = [], album = null, group;
    var trackNumber = 0;
    window.SitePlayer.getCatalog().forEach(function (song) {
      if (song.album !== album) {
        trackNumber = 0;
        album = song.album; group = document.createElement('section'); group.className = 'player-track-album';
        var heading = document.createElement('h3'); heading.textContent = album; group.appendChild(heading); scroll.appendChild(group);
      }
      var option = document.createElement('button'); option.type = 'button'; option.className = 'player-track-option';
      option.dataset.trackId = song.id;
      var number = document.createElement('span'); number.className = 'player-track-number'; number.textContent = String(++trackNumber).padStart(2, '0'); number.setAttribute('aria-hidden', 'true');
      var name = document.createElement('span'); name.textContent = song.name;
      option.append(number, name);
      option.setAttribute('aria-label', 'Play ' + song.name + ' from ' + song.album);
      option.addEventListener('click', function () { window.SitePlayer.playTrack(song.id); }, { signal: controller.signal });
      group.appendChild(option); options.push(option);
    });
    panel.append(header, scroll); section.insertBefore(panel, toggle);
    toggle.setAttribute('aria-controls', panel.id); toggle.setAttribute('aria-expanded', 'false');
    function reflect(state) {
      if (dragPointer !== null && dragTrack !== (state.track && state.track.id)) finishDrag();
      reflectPosition();
      var name = document.createElement('span'); name.className = 'player-song-name'; name.textContent = state.track ? state.track.name : 'The Basement Paintings';
      var album = document.createElement('span'); album.className = 'player-song-album'; album.textContent = state.track ? state.track.album : 'Explore the recordings';
      toggle.replaceChildren(name, album);
      toggle.setAttribute('aria-label', 'Browse all songs' + (state.track ? '. Current song: ' + state.track.name + ' from ' + state.track.album : ''));
      options.forEach(function (option) {
        if (state.track && state.track.id === option.dataset.trackId) option.setAttribute('aria-current', 'true');
        else option.removeAttribute('aria-current');
      });
    }
    var unsubscribe = window.SitePlayer.subscribe(reflect);
    var expanded = false, hideTimer, gesture = null, suppressClickUntil = 0;
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    function fullHeight() { return Math.min(224, window.innerHeight * 0.48); }
    function reveal() {
      clearTimeout(hideTimer);
      if (panel.hidden) { panel.hidden = false; panel.style.height = '0px'; panel.getBoundingClientRect(); }
      panel.inert = false;
      section.classList.add('is-expanded');
    }
    function positionSelection(focus) {
      var selected = options.find(function (option) { return option.getAttribute('aria-current') === 'true'; }) || options[0];
      if (selected) {
        // Scroll this list only, never the document behind the fixed player.
        scroll.scrollTop = selected.offsetTop + selected.offsetHeight - scroll.offsetTop - (fullHeight() - 36);
        if (focus) selected.focus({ preventScroll: true });
      }
    }
    function settle(open, restoreFocus) {
      clearTimeout(hideTimer); section.classList.remove('is-dragging');
      expanded = open; toggle.setAttribute('aria-expanded', String(open));
      if (open) { reveal(); panel.style.height = fullHeight() + 'px'; }
      else {
        panel.inert = true; panel.style.height = '0px'; section.classList.remove('is-expanded');
        hideTimer = setTimeout(function () { panel.hidden = true; }, reducedMotion.matches ? 0 : 280);
      }
      if (restoreFocus) toggle.focus({ preventScroll: true });
    }
    function close(restoreFocus) {
      settle(false, restoreFocus);
    }
    toggle.addEventListener('click', function (event) {
      if (Date.now() < suppressClickUntil && event.detail !== 0) return;
      if (expanded) { close(false); return; }
      settle(true); positionSelection(event.detail === 0);
    }, { signal: controller.signal });
    handle.addEventListener('click', function (event) {
      if (Date.now() >= suppressClickUntil || event.detail === 0) close(true);
    }, { signal: controller.signal });
    [toggle, handle].forEach(function (surface) {
      surface.addEventListener('pointerdown', function (event) {
        if (!event.isPrimary || event.button !== 0 || gesture) return;
        suppressClickUntil = 0;
        gesture = { id: event.pointerId, surface: surface, x: event.clientX, y: event.clientY, height: expanded ? panel.getBoundingClientRect().height : 0, wasOpen: expanded, moved: false };
        surface.setPointerCapture(event.pointerId);
      }, { signal: controller.signal });
      surface.addEventListener('pointermove', function (event) {
        if (!gesture || gesture.id !== event.pointerId) return;
        var dy = gesture.y - event.clientY;
        if (!gesture.moved && (Math.abs(dy) < 6 || Math.abs(dy) < Math.abs(event.clientX - gesture.x))) return;
        if (!gesture.moved) {
          reveal(); section.classList.add('is-dragging'); positionSelection(false); gesture.moved = true;
        }
        panel.style.height = Math.max(0, Math.min(fullHeight(), gesture.height + dy)) + 'px';
      }, { signal: controller.signal });
      function endGesture(event) {
        if (!gesture || gesture.id !== event.pointerId) return;
        var finished = gesture; gesture = null;
        if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
        if (!finished.moved) return;
        suppressClickUntil = Date.now() + 450;
        var distance = finished.y - event.clientY;
        var open = event.type === 'pointercancel' || event.type === 'lostpointercapture' ? finished.wasOpen : Math.abs(distance) > 28 ? distance > 0 : finished.wasOpen;
        settle(open, !open && surface === handle);
      }
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (event) { surface.addEventListener(event, endGesture, { signal: controller.signal }); });
    });
    scroll.addEventListener('keydown', function (event) {
      var index = options.indexOf(event.target);
      if (index < 0 || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      var next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : Math.max(0, Math.min(options.length - 1, index + (event.key === 'ArrowUp' ? -1 : 1)));
      options[next].focus({ preventScroll: true }); options[next].scrollIntoView({ block: 'center', behavior: 'instant' });
    }, { signal: controller.signal });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); close(true); }
    }, { signal: controller.signal });
    document.addEventListener('click', function (event) {
      if (!panel.hidden && !toggle.closest('.player-bar').contains(event.target)) close(false);
    }, { signal: controller.signal });
    disposeCurrent = function () {
      finishDrag();
      if (gesture && gesture.surface.hasPointerCapture(gesture.id)) gesture.surface.releasePointerCapture(gesture.id);
      clearTimeout(hideTimer);
      controller.abort(); unsubscribe(); panel.remove(); section.classList.remove('is-expanded', 'is-dragging'); toggle.setAttribute('aria-expanded', 'false'); toggle.removeAttribute('aria-controls');
    };
  }
  window.SiteTrackBrowser = { mount: mount, dispose: function () { disposeCurrent(); } };
  mount();
})();
