(function () {
  if (!window.fetch || !window.DOMParser || !window.AbortController ||
      !window.SiteAmbience || !window.SiteUI || !window.SitePlayer) return;

  var routes = /^\/(?:index|music|gallery|bio|contact)?(?:\.html)?\/?$/;
  var generation = 0;
  var pending;
  var committedURL = location.href;
  var stateKey = 'bp-page-scroll';
  var metadata = 'title, meta, link[rel="canonical"], script[type="application/ld+json"]';

  function known(url) {
    return url.origin === location.origin && routes.test(url.pathname);
  }

  function saveScroll() {
    var state = Object.assign({}, history.state);
    state[stateKey] = [scrollX, scrollY];
    history.replaceState(state, '', location.href);
  }

  function restoreScroll(left, top) {
    var previous = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(left, top);
    document.documentElement.style.scrollBehavior = previous;
  }

  function contactSuccess() {
    var success = new URLSearchParams(location.search).get('success') === '1';
    var message = document.getElementById('formSuccess');
    var form = document.querySelector('.contact-form');
    if (message) message.hidden = !success;
    if (form) form.hidden = success;
  }

  async function navigate(url, fromHistory, historyState) {
    var request = ++generation;
    if (pending) pending.abort();
    pending = new AbortController();
    var controller = pending;
    var timeout = setTimeout(function () { controller.abort(); }, 8000);
    try {
      var response = await fetch(url.href, { signal: controller.signal });
      if (!response.ok || !known(new URL(response.url)) ||
          !(response.headers.get('content-type') || '').includes('text/html')) throw new Error('Page unavailable');
      var source = await response.text();
      if (request !== generation) return;
      var next = new DOMParser().parseFromString(source, 'text/html');
      if (!next.querySelector('.site-nav') || !next.querySelector('.site-footer') ||
          !next.querySelector('.page-content, .home-landing')) throw new Error('Invalid page');

      // Prepare the destination completely before disposing the current view.
      // Fetched scripts stay inert; only our known controllers mount the view.
      next.body.querySelectorAll('script').forEach(function (script) { script.remove(); });
      var bodyNodes = Array.from(next.body.childNodes).map(function (node) {
        return document.importNode(node, true);
      });
      var headNodes = Array.from(next.head.querySelectorAll(metadata)).map(function (node) {
        return document.importNode(node, true);
      });
      if (!fromHistory) saveScroll();
      window.SiteAmbience.prepareNavigation();
      window.SiteUI.dispose();
      window.SitePlayer.dispose();
      document.body.replaceChildren.apply(document.body, bodyNodes);
      document.body.className = next.body.className;
      document.documentElement.lang = next.documentElement.lang || 'en';
      document.head.querySelectorAll(metadata).forEach(function (node) { node.remove(); });
      headNodes.forEach(function (node) { document.head.appendChild(node); });
      if (!fromHistory) history.pushState({}, '', url.href);
      committedURL = url.href;
      window.SiteUI.mount();
      window.SitePlayer.mount();
      if (window.SiteVisuals) window.SiteVisuals.mount();
      if (window.SiteTrackBrowser) window.SiteTrackBrowser.mount();
      var gate = window.SiteAmbience.mount();
      contactSuccess();

      var position = fromHistory && historyState && historyState[stateKey];
      var anchor = url.hash && document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (position) restoreScroll(position[0], position[1]);
      else if (anchor) anchor.scrollIntoView();
      else restoreScroll(0, 0);
      if (!gate) {
        // A selector list returns document order, not selector priority: the
        // page wrapper precedes its heading and would get a page-sized outline.
        var heading = document.querySelector('h1');
        var focusTarget = heading || document.querySelector('main') || document.querySelector('.page-content');
        if (focusTarget) {
          if (!heading) {
            focusTarget.setAttribute('data-route-focus', 'container');
            focusTarget.addEventListener('blur', function () { this.removeAttribute('data-route-focus'); }, { once: true });
          }
          focusTarget.setAttribute('tabindex', '-1'); focusTarget.focus({ preventScroll: true });
        }
      }
      document.dispatchEvent(new CustomEvent('site-page-change'));
    } catch (error) {
      if (request === generation) location.assign(url.href);
    } finally {
      clearTimeout(timeout);
      if (pending === controller) pending = null;
    }
  }

  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var link = event.target.closest && event.target.closest('a[href]');
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    var url = new URL(link.href, location.href);
    if (!known(url)) return;
    var current = new URL(committedURL);
    if (url.pathname === current.pathname && url.search === current.search) {
      generation++;
      if (pending) pending.abort();
      if (!url.hash) {
        event.preventDefault();
        restoreScroll(0, 0);
        var menu = document.getElementById('nav-toggle');
        if (menu) menu.checked = false;
      }
      return;
    }
    event.preventDefault();
    navigate(url, false);
  });

  window.addEventListener('popstate', function (event) {
    generation++;
    if (pending) pending.abort();
    var url = new URL(location.href);
    var current = new URL(committedURL);
    if (url.pathname === current.pathname && url.search === current.search) {
      committedURL = url.href;
      var position = event.state && event.state[stateKey];
      var anchor = url.hash && document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (position) restoreScroll(position[0], position[1]);
      else if (anchor) anchor.scrollIntoView();
      return;
    }
    if (known(url)) navigate(url, true, event.state);
    else location.reload();
  });
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  var scrollFrame;
  window.addEventListener('scroll', function () {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(function () {
      scrollFrame = null;
      if (location.href === committedURL) saveScroll();
    });
  }, { passive: true });
  window.addEventListener('pagehide', saveScroll);
  saveScroll();
  contactSuccess();
})();
