(function () {
  // One original-song media element and one live-analysis graph survive navigation.
  var albums = [
    ['Antipodes', 'antipodes', ['Instinct', 'Gnosis', 'Koan', 'Ziggurat', 'Soma', 'Antipodes']],
    ['Mystic', 'mystic', ['Nomad', 'Veda', 'River', 'Portal', 'Cave Dance', 'Pensive', 'Oneiros', 'Mystic']],
    ['Time Lapse City', 'time-lapse-city', ['Time Lapse City', 'Adult Male Beluga Whale', 'Desert Surfer']],
    ['Self-Titled', 'self-titled', ['Future Describer', 'Forest', 'Sharp & Dull', 'Adult Male Beluga Whale', 'The Carl Sagan Abduction', 'Cycles', 'Robot Stomp', 'Desert Surfer']]
  ];
  var catalog = [];
  albums.forEach(function (album) {
    album[2].forEach(function (name, index) {
      var slug = name.toLowerCase().replace(/&/g, 'and').replace(/ /g, '-');
      var id = album[1] + '/' + String(index + 1).padStart(2, '0') + '-' + slug;
      var artwork = album[1] === 'mystic' ? 'album-art' : album[1] + '-art';
      catalog.push({ id: id, name: name, album: album[0], artwork: 'images/music/' + artwork + '.jpg', src: new URL('audio/' + id + '.mp3', location.href).href });
    });
  });
  var initialIds = ['antipodes/02-gnosis', 'mystic/06-pensive', 'antipodes/05-soma', 'mystic/02-veda', 'mystic/07-oneiros', 'time-lapse-city/02-adult-male-beluga-whale', 'self-titled/06-cycles', 'self-titled/01-future-describer'];
  var storageKey = 'bp-player-v2';
  var revealKey = 'bp-player-bar-revealed';
  var audio = new Audio();
  audio.preload = 'none';
  audio.loop = false;
  var fadeFrame;
  var level = 0.2;
  var outputLevel = level;
  var audioGraph = null, graphUnavailable = false;
  function resumeGraph() {
    if (!audioGraph || audioGraph.context.state === 'running') return Promise.resolve();
    if (audioGraph.context.state === 'closed') return Promise.reject(new Error('Audio output closed'));
    try { return Promise.resolve(audioGraph.context.resume()).then(function () {
      if (audioGraph.context.state !== 'running') throw new Error('Audio output interrupted');
    }); } catch (error) { return Promise.reject(error); }
  }
  function prepareGraph() {
    // Called synchronously from play, including Enter and Media Session actions.
    if (audioGraph) return resumeGraph();
    if (graphUnavailable) return;
    var Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) { graphUnavailable = true; return; }
    var context, source;
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (error) { /* optional platform audio-session policy */ }
    try {
      context = new Context({ latencyHint: 'playback' });
      var gain = context.createGain();
      gain.gain.value = outputLevel;
      gain.connect(context.destination);
      var analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.12;
      analyser.connect(gain);
      // All downstream nodes exist before this irreversible routing operation.
      source = context.createMediaElementSource(audio);
      audioGraph = { context: context, source: source, analyser: analyser, gain: gain,
        waveform: new Float32Array(analyser.fftSize), spectrum: new Float32Array(analyser.frequencyBinCount) };
      source.connect(analyser);
      audio.volume = 1;
      context.addEventListener('statechange', function () { if (stats) stats.status(); reflect(); });
      return resumeGraph();
    } catch (error) {
      graphUnavailable = true;
      if (source && audioGraph) {
        // A routed media element cannot revert to native output by disconnecting.
        // Retain an audible graph even if the analysis branch failed.
        try { source.disconnect(); source.connect(audioGraph.gain); audio.volume = 1; } catch (routingError) { /* preserve graph for a resume gesture */ }
        audioGraph.analyser = null;
        return resumeGraph();
      } else if (context) {
        context.close().catch(function () {});
      }
    }
  }
  function readAnalysis() {
    if (!audioGraph || !audioGraph.analyser || audioGraph.context.state !== 'running') return null;
    try {
      audioGraph.analyser.getFloatTimeDomainData(audioGraph.waveform);
      audioGraph.analyser.getFloatFrequencyData(audioGraph.spectrum);
    } catch (error) { return null; }
    return { waveform: audioGraph.waveform, spectrum: audioGraph.spectrum,
      sampleRate: audioGraph.context.sampleRate, fftSize: audioGraph.analyser.fftSize };
  }
  var current = null;
  var pendingSeek = null;
  var wanted = false, playing = false, pending = false, failed = false, automaticPending = false;
  var attempt = 0;
  var barRevealed = false;
  var tracks = [];
  var subscribers = [];
  var disposeCurrent = function () {};
  var lastSavedSecond = -1;
  var mediaTrackId;
  var stats = window.PlayerStats ? window.PlayerStats.create(audio, function () { return !audioGraph || audioGraph.context.state === 'running'; }) : null;
  var bar = document.getElementById('playerBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'playerBar'; bar.className = 'player-bar';
    bar.innerHTML = '<button id="playerPlayPause" type="button" aria-label="Play music"><svg class="icon-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg><svg class="icon-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg></button><div class="now-playing" id="nowPlaying"></div><div class="progress-bar" id="progressBar"><div class="progress-fill" id="progressFill"></div></div><span class="track-duration" id="playerTime">0:00</span>';
  }
  bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Music player');
  var playPause = bar.querySelector('#playerPlayPause');
  var transport = document.createElement('div'); transport.className = 'player-transport';
  function skipButton(direction, label) {
    var button = document.createElement('button'); button.type = 'button';
    button.className = 'player-skip player-skip--' + (direction < 0 ? 'previous' : 'next');
    button.setAttribute('aria-label', label); button.title = label;
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (direction < 0 ? 'M16 6 8 12 16 18ZM6 6v12' : 'M8 6 16 12 8 18ZM18 6v12') + '"/></svg>';
    button.addEventListener('click', function () { skip(direction); });
    return button;
  }
  playPause.before(transport);
  transport.append(skipButton(-1, 'Previous track'), playPause, skipButton(1, 'Next track'));
  var nowPlaying = bar.querySelector('#nowPlaying');
  if (nowPlaying.tagName !== 'BUTTON') {
    var songButton = document.createElement('button');
    songButton.id = 'nowPlaying'; songButton.className = 'now-playing'; songButton.type = 'button';
    nowPlaying.replaceWith(songButton); nowPlaying = songButton;
  }
  var progress = bar.querySelector('#progressBar');
  var fill = bar.querySelector('#progressFill');
  var time = bar.querySelector('#playerTime');

  function find(id) { return catalog.find(function (song) { return song.id === id; }); }
  function state() {
    return { track: current, time: pendingSeek !== null ? pendingSeek : audio.currentTime, duration: audio.duration || 0,
      wanted: wanted, playing: playing && !audio.paused && !audio.ended && (!audioGraph || audioGraph.context.state === 'running'),
      analysis: audioGraph && audioGraph.analyser && audioGraph.context.state === 'running' ? 'live' : 'unavailable',
      audioContextState: audioGraph ? audioGraph.context.state : 'native',
      pending: pending, failed: failed, barRevealed: barRevealed };
  }
  function save() {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ track: current ? current.id : null,
        time: pendingSeek !== null ? pendingSeek : audio.currentTime, wanted: wanted }));
    } catch (error) { /* optional storage */ }
  }
  function updateProgress() {
    var position = pendingSeek !== null ? pendingSeek : audio.currentTime;
    fill.style.width = audio.duration ? (position / audio.duration * 100) + '%' : '0%';
    time.textContent = Math.floor(position / 60) + ':' + String(Math.floor(position % 60)).padStart(2, '0');
  }
  function updateMediaPosition() {
    if (!navigator.mediaSession || !navigator.mediaSession.setPositionState || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    try { navigator.mediaSession.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate,
      position: Math.max(0, Math.min(audio.duration, state().time)) }); } catch (error) { /* unsupported position state */ }
  }
  function updateMediaSession(value) {
    if (!navigator.mediaSession) return;
    if (current && mediaTrackId !== current.id && window.MediaMetadata) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title: current.name,
          artist: 'The Basement Paintings', album: current.album,
          artwork: [{ src: new URL(current.artwork, location.href).href }] });
        mediaTrackId = current.id;
      } catch (error) { /* unsupported metadata */ }
    }
    try { navigator.mediaSession.playbackState = value.playing ? 'playing' : (current ? 'paused' : 'none'); } catch (error) { /* optional controls */ }
    updateMediaPosition();
  }
  function reflectBar() {
    var hidden = !barRevealed || document.documentElement.classList.contains('bp-intro-active');
    bar.classList.toggle('active', barRevealed);
    bar.inert = hidden;
    bar.setAttribute('aria-hidden', String(hidden));
    document.body.classList.toggle('has-music-player', barRevealed);
  }
  function revealBar() {
    barRevealed = true;
    try { sessionStorage.setItem(revealKey, 'yes'); } catch (error) { /* optional storage */ }
    reflectBar();
  }
  function reflect() {
    var value = state();
    reflectBar();
    playPause.classList.toggle('is-playing', value.playing);
    playPause.setAttribute('aria-label', (value.playing ? 'Pause ' : (failed ? 'Retry playing ' : 'Play ')) + (current ? current.name : 'music'));
    playPause.setAttribute('aria-busy', String(pending));
    nowPlaying.textContent = current ? current.name + ' • ' + current.album : 'The Basement Paintings';
    tracks.forEach(function (track) {
      var selected = current && new URL(track.dataset.src, location.href).href === current.src;
      track.classList.toggle('playing', !!selected);
      track.classList.toggle('active-playback', !!selected && value.playing);
      var name = track.querySelector('.track-name').textContent;
      track.setAttribute('aria-label', (selected && value.playing ? 'Pause ' : 'Play ') + name + ' from ' + track.dataset.album);
    });
    updateProgress();
    updateMediaSession(value);
    subscribers.slice().forEach(function (subscriber) { subscriber(value); });
  }
  function setLevel(value) {
    outputLevel = value;
    if (audioGraph) audioGraph.gain.gain.setValueAtTime(value, audioGraph.context.currentTime);
    else audio.volume = value;
  }
  function fadeIn() {
    if (document.hidden) { cancelAnimationFrame(fadeFrame); setLevel(level); return; }
    var start = performance.now();
    function step(now) {
      if (!wanted || !playing || audio.paused) return;
      var fraction = Math.min(1, (now - start) / 4000);
      setLevel(level * fraction);
      if (fraction < 1) fadeFrame = requestAnimationFrame(step);
    }
    cancelAnimationFrame(fadeFrame);
    fadeFrame = requestAnimationFrame(step);
  }
  function seekSaved() {
    if (pendingSeek === null || !audio.duration) return;
    if (pendingSeek >= 0 && pendingSeek < audio.duration) audio.currentTime = pendingSeek;
    pendingSeek = null;
  }
  function assign(song, position, source) {
    if (stats) { if (source === 'resume') stats.restore(song.id); else stats.start(song.id, source || 'manual'); }
    current = song; pendingSeek = Number.isFinite(position) && position > 0 ? position : 0;
    audio.src = song.src;
    failed = false;
    updateProgress();
  }
  function ensureInitial() {
    if (!current) assign(find(initialIds[Math.floor(Math.random() * initialIds.length)]), 0, 'entrance');
  }
  function pause(clearIntent) {
    attempt++; cancelAnimationFrame(fadeFrame);
    if (clearIntent !== false) wanted = false;
    pending = false; automaticPending = false; playing = false;
    audio.pause(); setLevel(0); save(); reflect();
  }
  function failure(request) {
    if (request !== attempt) return;
    pause(false); failed = true; reflect();
  }
  function play(automatic, fade) {
    ensureInitial();
    if (stats) stats.ensure(current.id, automatic ? 'resume' : 'manual');
    var output;
    if (!automatic || audioGraph || (navigator.userActivation && navigator.userActivation.isActive)) output = prepareGraph();
    // Consume an output rejection even if a synchronous media failure below
    // prevents reaching Promise.all; the original promise still gates success.
    Promise.resolve(output).catch(function () {});
    wanted = true; pending = true; failed = false; automaticPending = !!automatic;
    var request = ++attempt;
    cancelAnimationFrame(fadeFrame);
    save(); reflect();
    try {
      if (audio.error) { pendingSeek = audio.currentTime || pendingSeek; audio.load(); }
      setLevel(fade && !document.hidden ? 0 : level);
      // The existing media element still owns decoding, seeking and Media Session.
      // Resume the persistent analysis graph and start playback in this gesture.
      var playback = audio.play();
      Promise.all([playback, output]).then(function () {
        if (request !== attempt || !wanted) return;
        pending = false; automaticPending = false; playing = true;
        seekSaved(); save(); reflect(); if (fade) fadeIn();
      }).catch(function () { failure(request); });
    } catch (error) { failure(request); }
  }
  function startEntrance() { revealBar(); play(false, true); }
  function toggle() {
    if (pending) play(false, true);
    else if (state().playing) pause(true);
    else play(false, true);
  }
  function select(song) {
    pause(false); assign(song, 0); play(false, false);
  }
  // Match the existing lock-screen controls: choosing either adjacent song
  // starts it, including from pause, and wraps through the complete catalog.
  function skip(direction) {
    var index = current ? catalog.indexOf(current) : (direction > 0 ? -1 : 0);
    select(catalog[(index + direction + catalog.length) % catalog.length]);
  }
  function seek(seconds) {
    if (!Number.isFinite(seconds) || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, seconds));
    save(); updateProgress();
  }
  function readSession() {
    try {
      var stored = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      var song = stored && find(stored.track);
      if (song) {
        var position = Number(stored.time);
        if (!current || current.id !== song.id) assign(song, position, 'resume');
        else { pendingSeek = Number.isFinite(position) && position >= 0 ? position : 0; seekSaved(); }
        wanted = stored.wanted === true;
      } else if (!stored) {
        // Legacy excerpt time never carries into a full original song.
        var oldId = sessionStorage.getItem('bp-sound-clip');
        var legacy = { soma: 'antipodes/05-soma', pensive: 'mystic/06-pensive' }[oldId];
        if (oldId) {
          assign(find(legacy || initialIds[Math.floor(Math.random() * initialIds.length)]), 0, 'resume');
          wanted = sessionStorage.getItem('bp-sound') === 'on'; save();
        }
      }
      barRevealed = sessionStorage.getItem(revealKey) === 'yes';
    } catch (error) { /* optional storage */ }
  }
  playPause.addEventListener('click', toggle);
  // The entrance can finish after playback starts; expose the persistent bar
  // only when its gate releases, without remounting or restarting the player.
  new MutationObserver(reflectBar).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  audio.addEventListener('loadedmetadata', function () { seekSaved(); reflect(); });
  audio.addEventListener('pause', function () { playing = false; reflect(); });
  audio.addEventListener('error', function () { if (audio.error) failure(attempt); });
  audio.addEventListener('timeupdate', function () {
    updateProgress();
    var second = Math.floor(audio.currentTime);
    if (second !== lastSavedSecond && second % 4 === 0) { lastSavedSecond = second; save(); updateMediaPosition(); }
  });
  audio.addEventListener('ended', function () {
    if (stats) stats.finish(true);
    playing = false;
    if (!wanted || !current) { reflect(); return; }
    var index = catalog.findIndex(function (song) { return song.id === current.id; });
    assign(catalog[(index + 1) % catalog.length], 0, 'queue');
    play(true, false);
  });
  function mount() {
    disposeCurrent();
    document.querySelectorAll('.player-bar').forEach(function (incoming) { if (incoming !== bar) incoming.remove(); });
    document.body.appendChild(bar);
    if (!document.querySelector('.home-landing')) {
      revealBar();
    }
    var controller = new AbortController();
    tracks = Array.from(document.querySelectorAll('.track'));
    tracks.forEach(function (track) {
      var song = catalog.find(function (entry) { return entry.src === new URL(track.dataset.src, location.href).href; });
      if (!song) return;
      track.querySelector('.track-play').classList.add('enabled'); track.classList.add('is-enabled');
      track.tabIndex = 0; track.setAttribute('role', 'button'); track.setAttribute('aria-disabled', 'false');
      function activate() { if (current && current.id === song.id) toggle(); else select(song); }
      track.addEventListener('click', activate, { signal: controller.signal });
      track.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
      }, { signal: controller.signal });
    });
    reflect();
    disposeCurrent = function () { controller.abort(); tracks = []; };
    return disposeCurrent;
  }
  function resumeSaved() { if (wanted) play(true, true); else reflect(); }
  function activateAnalysis(event) {
    // A saved session can autoplay natively before an activation is available.
    // Its first real interaction upgrades that same stream without restarting it.
    if (!event.isTrusted || !wanted || audio.paused || audio.ended) return;
    if (navigator.userActivation && !navigator.userActivation.isActive) return;
    // Transport controls already activate in play(); a pause must stay a pause.
    if (event.target.closest && event.target.closest('.sound-toggle, #playerPlayPause, .entry-cloud__enter, [data-src]')) return;
    Promise.resolve(prepareGraph()).catch(function () { reflect(); });
  }
  // Click runs after mouse/touch/pen activation (touch pointerdown is too early).
  document.addEventListener('click', activateAnalysis, { capture: true, passive: true });
  document.addEventListener('keydown', activateAnalysis, { capture: true });
  function background() {
    cancelAnimationFrame(fadeFrame);
    if (wanted) setLevel(level);
    save();
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) background();
    else if (wanted) resumeGraph().catch(function () { reflect(); });
  });
  window.addEventListener('pagehide', background);
  window.addEventListener('pageshow', function (event) {
    if (!event.persisted) return;
    if (wanted) resumeGraph().catch(function () { reflect(); });
    // A restored page may have kept its native audio running while JavaScript
    // was frozen. Never rewind that live stream to an older stored position.
    if (current && !audio.paused && !audio.ended) {
      try { barRevealed = barRevealed || sessionStorage.getItem(revealKey) === 'yes'; } catch (error) { /* optional storage */ }
      save(); reflect(); return;
    }
    readSession(); reflect();
    if (!document.documentElement.classList.contains('bp-intro-active')) resumeSaved();
  });
  readSession();
  if (navigator.mediaSession) {
    var actions = {
      play: function () { play(false, true); }, pause: function () { pause(true); },
      nexttrack: function () { skip(1); },
      previoustrack: function () { skip(-1); },
      // Advertise playlist navigation rather than competing skip-seconds actions.
      // The browser/OS still decides which controls fit its lock-screen UI.
      seekto: function (details) { if (Number.isFinite(details.seekTime) && audio.duration) { audio.currentTime = Math.max(0, Math.min(audio.duration, details.seekTime)); save(); reflect(); } }
    };
    Object.keys(actions).forEach(function (action) {
      try { navigator.mediaSession.setActionHandler(action, actions[action]); } catch (error) { /* unsupported action */ }
    });
  }
  window.SitePlayer = { mount: mount, dispose: function () { disposeCurrent(); },
    getCatalog: function () { return catalog.map(function (song) { return { id: song.id, name: song.name, album: song.album }; }); },
    playTrack: function (id) { var song = find(id); if (!song) return; if (current && current.id === id) play(false, false); else select(song); },
    startEntrance: startEntrance, toggle: toggle, pause: function () { pause(true); }, resumeSaved: resumeSaved,
    previous: function () { skip(-1); }, next: function () { skip(1); },
    seek: seek, getAnalysis: readAnalysis,
    getState: state, subscribe: function (callback) {
      subscribers.push(callback); callback(state());
      return function () { subscribers = subscribers.filter(function (entry) { return entry !== callback; }); };
    } };
  mount();
})();
