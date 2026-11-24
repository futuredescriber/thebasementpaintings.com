(function () {
  if (!window.SitePlayer) return;
  var nav = document.querySelector('.site-nav');
  if (!nav) return;
  // Entrance and speaker are views of the one persistent original-song player.
  var button = document.createElement('button');
  button.type = 'button';
  button.className = 'sound-toggle';
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path class="sound-toggle__off" d="m17 9 5 6m0-6-5 6"/><path class="sound-toggle__on" d="M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>';
  nav.appendChild(button);
  window.SitePlayer.subscribe(function (state) {
    button.setAttribute('aria-pressed', String(state.playing));
    button.setAttribute('aria-busy', String(state.pending));
    var label = state.playing ? 'Pause music' : (state.failed ? 'Resume music' : 'Play music');
    button.setAttribute('aria-label', label);
    button.title = label;
  });
  button.addEventListener('click', function () { window.SitePlayer.toggle(); });

  var entryCleanup;
  function prepareNavigation() {
    if (entryCleanup) entryCleanup();
    entryCleanup = null;
  }

  function mount() {
  prepareNavigation();
  var nextNav = document.querySelector('.site-nav');
  if (nextNav) nextNav.appendChild(button);
  // A small invitation over the existing home artwork, once per tab.
  // A storage failure simply shows the invitation again on the next visit.
  var entered = false;
  try { entered = sessionStorage.getItem('bp-entered') === 'yes'; } catch (error) { /* optional storage */ }
  if (document.querySelector('.home-landing') && !entered) {
    var home = document.querySelector('.home-wrapper');
    document.documentElement.classList.add('bp-intro-active');
    home.inert = true;
    home.setAttribute('aria-hidden', 'true');
    var cloud = document.createElement('div');
    cloud.className = 'entry-cloud';
    cloud.setAttribute('role', 'group');
    cloud.setAttribute('aria-label', 'Enter The Basement Paintings');
    var withSound = document.createElement('button');
    withSound.type = 'button';
    withSound.className = 'entry-cloud__enter';
    var glyphs = 'ENTER'.split('').map(function (letter, index) {
      var glyph = document.createElement('span');
      glyph.className = 'entry-cloud__glyph';
      glyph.textContent = letter;
      glyph.setAttribute('data-glyph', letter);
      glyph.setAttribute('aria-hidden', 'true');
      glyph.style.setProperty('--glyph-index', index);
      withSound.appendChild(glyph);
      return glyph;
    });
    withSound.setAttribute('aria-label', 'Enter with sound');
    var sigil = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    sigil.setAttribute('class', 'entry-cloud__sigil');
    sigil.setAttribute('viewBox', '0 0 240 140');
    sigil.setAttribute('aria-hidden', 'true');
    sigil.setAttribute('focusable', 'false');
    sigil.innerHTML = '<ellipse class="entry-cloud__ring" cx="120" cy="70" rx="91" ry="43" pathLength="100" stroke-dasharray="21 7 5 9 24 8 10 16"/>' +
      '<g class="entry-cloud__inner-frame"><path class="entry-cloud__trace" d="M43 65 65 48 91 37M105 33 120 28 135 33M149 37 175 48 197 65M197 75 175 92 149 103M135 107 120 112 105 107M91 103 65 92 43 75M65 48 72 54M175 48 168 54M65 92 72 86M175 92 168 86"/></g>' +
      '<g class="entry-cloud__runes"><text x="51" y="41">∷</text><text x="177" y="48">⌁</text><text x="80" y="111">⋮</text></g>' +
      '<g class="entry-cloud__runes entry-cloud__runes--echo"><text x="54" y="43">⌁</text><text x="176" y="46">∴</text><text x="79" y="112">·</text></g>';
    cloud.appendChild(sigil);
    cloud.appendChild(withSound);
    document.body.appendChild(cloud);
    // Keep a readable text fallback until the small same-origin wordmark loads.
    var wordmark = new Image();
    wordmark.onload = function () {
      if (!cloud.isConnected || entering) return;
      glyphs.forEach(function (glyph, index) {
        var letter = 'enter'[index];
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'entry-cloud__letter-svg');
        svg.setAttribute('viewBox', '0 0 24 32');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', 'images/enter-wordmark.svg#letter-' + letter);
        use.setAttribute('width', '24'); use.setAttribute('height', '32');
        svg.appendChild(use);
        var echo = use.cloneNode(true);
        echo.setAttribute('class', 'entry-cloud__letter-echo');
        svg.appendChild(echo);
        glyph.replaceChildren(svg);
      });
    };
    wordmark.src = 'images/enter-wordmark.svg';
    withSound.focus({ preventScroll: true });
    entryCleanup = function () {
      wordmark.onload = null; wordmark.removeAttribute('src');
      document.documentElement.classList.remove('bp-intro-active', 'bp-intro-revealing');
      home.inert = false;
      home.removeAttribute('aria-hidden');
      cloud.remove();
    };

    var entering = false;
    function enter(sound) {
      if (entering) return;
      entering = true;
      withSound.setAttribute('aria-disabled', 'true');
      // Keep audio activation in this click, before the visual transition.
      if (sound) window.SitePlayer.startEntrance();
      else window.SitePlayer.pause();
      try { sessionStorage.setItem('bp-entered', 'yes'); } catch (error) { /* optional storage */ }
      document.documentElement.classList.add('bp-intro-revealing');
      var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var scrambleTimer;
      var revealTimer;
      var tick = 0;
      function reveal() {
        clearInterval(scrambleTimer);
        clearTimeout(revealTimer);
        window.removeEventListener('pagehide', reveal);
        wordmark.onload = null; wordmark.removeAttribute('src');
        document.documentElement.classList.remove('bp-intro-active', 'bp-intro-revealing');
        home.inert = false;
        home.removeAttribute('aria-hidden');
        if (cloud.contains(document.activeElement)) button.focus({ preventScroll: true });
        cloud.remove();
        entryCleanup = null;
      }
      entryCleanup = reveal;
      cloud.classList.add(reduced ? 'is-leaving' : 'is-dissolving');
      if (!reduced) {
        var symbols = ['E', 'N', 'T', 'R', '∴', '∷', '⋮', '⌁', '⟡'];
        scrambleTimer = setInterval(function () {
          tick++;
          glyphs.forEach(function (glyph, index) {
            var symbol = symbols[(tick * 3 + index * 2) % symbols.length];
            glyph.textContent = symbol;
            glyph.setAttribute('data-glyph', symbol);
          });
          if (tick === 12) clearInterval(scrambleTimer);
        }, 65);
      }
      revealTimer = setTimeout(reveal, reduced ? 120 : 1140);
      window.addEventListener('pagehide', reveal);
    }
    withSound.addEventListener('click', function () { enter(true); });
    return true;
  }
  return false;
  }

  window.SiteAmbience = { mount: mount, prepareNavigation: prepareNavigation };
  var gate = mount();
  if (!gate) window.SitePlayer.resumeSaved();
})();
