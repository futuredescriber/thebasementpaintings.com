(function () {
  var disposeCurrent = function () {};

  function mount() {
    disposeCurrent();
    var cleanups = [];
    var disposed = false;
    var previousOverflow = document.body.style.overflow;
    function listen(target, type, handler, options) {
      target.addEventListener(type, handler, options);
      cleanups.push(function () { target.removeEventListener(type, handler, options); });
    }
    function dispose() {
      if (disposed) return;
      disposed = true;
      if (window.SiteTrackBrowser) window.SiteTrackBrowser.dispose();
      if (window.SiteVisuals) window.SiteVisuals.dispose();
      cleanups.forEach(function (cleanup) { cleanup(); });
      document.querySelectorAll('.lightbox.active').forEach(function (dialog) {
        dialog.classList.remove('active');
      });
      document.body.style.overflow = previousOverflow;
    }
    disposeCurrent = dispose;
    if (window.SiteAtmosphere) cleanups.push(window.SiteAtmosphere.mount());
    if (window.SiteArcNavigation) cleanups.push(window.SiteArcNavigation.mount());

  // Let vertical scrolling and pinch zoom stay native; only horizontal gestures navigate.
  function addSwipe(surface, onPrev, onNext) {
    var start = null;
    var suppressClick = false;
    listen(surface, 'pointerdown', function (e) {
      suppressClick = false;
      if (!e.isPrimary) { start = null; return; }
      if (e.pointerType === 'mouse' || e.target.closest('button')) return;
      if (window.visualViewport && window.visualViewport.scale > 1) return;
      start = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    listen(surface, 'pointercancel', function () { start = null; });
    listen(surface, 'pointerup', function (e) {
      if (!start || start.id !== e.pointerId) return;
      var dx = e.clientX - start.x;
      var dy = e.clientY - start.y;
      start = null;
      if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      suppressClick = true;
      if (dx < 0) onNext(); else onPrev();
    });
    listen(surface, 'click', function (e) {
      if (!suppressClick || e.detail === 0) return;
      suppressClick = false;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
  }

  // Keep keyboard navigation inside an open image viewer.
  document.querySelectorAll('.lightbox').forEach(function (dialog) {
    listen(dialog, 'keydown', function (e) {
      if (e.key !== 'Tab' || !dialog.classList.contains('active')) return;
      var buttons = Array.from(dialog.querySelectorAll('button, a[href], iframe')).filter(function (element) { return element.getClientRects().length > 0; });
      var first = buttons[0];
      var last = buttons[buttons.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
        e.preventDefault(); first.focus();
      }
    });
  });

  // Album covers use the shared viewer styling and a native modal dialog.
  // Only an explicit cover activation requests the larger artwork; music continues.
  var artDialog = document.getElementById('albumArtLightbox');
  if (artDialog) {
    var artImage = document.getElementById('albumArtImage');
    var artTitle = document.getElementById('albumArtTitle');
    var artOriginal = document.getElementById('albumArtOriginal');
    var artClose = artDialog.querySelector('.lightbox-close');
    var artOpener = null;
    var artOverflow = '';
    function closeArt(restoreFocus) {
      if (!artDialog.open) return;
      artDialog.classList.remove('active');
      artDialog.close();
      document.body.style.overflow = artOverflow;
      artImage.removeAttribute('src');
      artDialog.removeAttribute('aria-busy');
      if (restoreFocus !== false && artOpener && artOpener.isConnected) artOpener.focus({ preventScroll: true });
    }
    document.querySelectorAll('.album-art-open').forEach(function (button) {
      listen(button, 'click', function () {
        artOpener = button;
        artOverflow = document.body.style.overflow;
        artTitle.textContent = button.dataset.artTitle + ' — album artwork';
        artImage.alt = button.dataset.artTitle + ' album artwork';
        artImage.dataset.fallback = button.querySelector('img').src;
        artDialog.setAttribute('aria-busy', 'true');
        artImage.src = button.dataset.artFull;
        artOriginal.href = button.dataset.artFull;
        artDialog.showModal();
        artDialog.classList.add('active');
        document.body.style.overflow = 'hidden';
        artClose.focus({ preventScroll: true });
      });
    });
    listen(artImage, 'load', function () { artDialog.removeAttribute('aria-busy'); });
    listen(artImage, 'error', function () {
      if (!artDialog.open) return;
      artDialog.removeAttribute('aria-busy');
      if (artImage.src !== artImage.dataset.fallback) artImage.src = artImage.dataset.fallback;
    });
    listen(artClose, 'click', function () { closeArt(true); });
    listen(artDialog, 'cancel', function (event) { event.preventDefault(); closeArt(true); });
    listen(artDialog, 'click', function (event) {
      // The figure and caption have empty space too; treat it as backdrop.
      // Keep image gestures and the original-file link available.
      if (!event.target.closest('img, a, button')) closeArt(true);
    });
    cleanups.push(function () { closeArt(false); });
  }

  // Gallery lightbox
  var galleryLightbox = document.getElementById('lightbox');
  if (galleryLightbox) {
    var items = document.querySelectorAll('.gallery-item img');
    var lbImg = document.getElementById('lightbox-img');
    var lbCounter = document.getElementById('lightbox-counter');
    var videoHost = document.createElement('div');
    videoHost.className = 'gallery-video';
    videoHost.hidden = true;
    lbImg.after(videoHost);
    function clearVideo() { videoHost.replaceChildren(); videoHost.hidden = true; }
    cleanups.push(function () { clearVideo(); videoHost.remove(); });
    var currentIndex = 0;
    var srcs = Array.from(items).map(function (img) { return img.src; });
    var alts = Array.from(items).map(function (img) { return img.alt; });
    var lastFocused = null;

    function playVideo() {
      var item = items[currentIndex].parentElement;
      if (!/^[\w-]{11}$/.test(item.dataset.youtube || '')) return;
      if (window.SitePlayer) window.SitePlayer.pause();
      var frame = document.createElement('iframe');
      frame.title = item.dataset.videoTitle || 'The Basement Paintings video';
      frame.src = 'https://www.youtube-nocookie.com/embed/' + item.dataset.youtube + '?autoplay=1&playsinline=1&rel=0';
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      var fallback = document.createElement('a');
      fallback.href = 'https://www.youtube.com/watch?v=' + item.dataset.youtube;
      fallback.target = '_blank';
      fallback.rel = 'noopener';
      fallback.className = 'gallery-video-link';
      fallback.textContent = 'Watch on YouTube';
      videoHost.replaceChildren(frame, fallback);
      if (galleryLightbox.classList.contains('active')) galleryLightbox.querySelector('.lightbox-close').focus();
    }

    function syncLightboxImage(autoplay) {
      clearVideo();
      var item = items[currentIndex].parentElement;
      var isVideo = /^[\w-]{11}$/.test(item.dataset.youtube || '');
      lbImg.hidden = isVideo;
      galleryLightbox.setAttribute('aria-label', isVideo ? item.dataset.videoTitle + ' video viewer' : 'Image viewer');
      lbImg.src = srcs[currentIndex];
      lbImg.alt = alts[currentIndex] || 'The Basement Paintings';
      if (isVideo) {
        videoHost.hidden = false;
        var playButton = document.createElement('button');
        playButton.className = 'gallery-video-play';
        playButton.textContent = 'Play ' + item.dataset.videoTitle;
        playButton.addEventListener('click', playVideo, { once: true });
        videoHost.append(playButton);
        if (autoplay) playVideo();
      }
      lbCounter.textContent = String(currentIndex + 1).padStart(2, '0') + ' / ' + String(srcs.length).padStart(2, '0');
    }

    function open(index) {
      currentIndex = index;
      syncLightboxImage(true);
      lastFocused = document.activeElement;
      galleryLightbox.classList.add('active');
      document.body.style.overflow = 'hidden';
      galleryLightbox.focus();
    }

    function close() {
      clearVideo();
      galleryLightbox.classList.remove('active');
      document.body.style.overflow = '';
      if (lastFocused && lastFocused.focus) lastFocused.focus();
    }

    function prev() {
      currentIndex = (currentIndex - 1 + srcs.length) % srcs.length;
      syncLightboxImage();
    }

    function next() {
      currentIndex = (currentIndex + 1) % srcs.length;
      syncLightboxImage();
    }

    items.forEach(function (img, i) {
      var trigger = img.parentElement;
      trigger.tabIndex = 0;
      trigger.setAttribute('role', 'button');
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.setAttribute('aria-label', trigger.dataset.youtube ? 'Play ' + trigger.dataset.videoTitle : 'Open gallery image ' + (i + 1));
      listen(trigger, 'click', function (e) {
        if (trigger.tagName === 'A' && (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)) return;
        e.preventDefault();
        open(i);
      });
      listen(trigger, 'keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open(i);
        }
      });
    });

    listen(galleryLightbox.querySelector('.lightbox-close'), 'click', close);
    listen(galleryLightbox.querySelector('.lightbox-prev'), 'click', prev);
    listen(galleryLightbox.querySelector('.lightbox-next'), 'click', next);
    addSwipe(lbImg, prev, next);

    listen(galleryLightbox, 'click', function (e) {
      if (e.target === galleryLightbox) close();
    });

    listen(document, 'keydown', function (e) {
      if (!galleryLightbox.classList.contains('active')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    });
  }

  // Bio slideshow + lightbox
  var slideshow = document.getElementById('slideshow');
  if (slideshow) {
    var track = document.getElementById('slideshowTrack');
    var slides = track.querySelectorAll('img');
    var total = slides.length;
    var current = 0;
    var autoTimer;
    var focusoutTimer;
    cleanups.push(function () { clearInterval(autoTimer); clearTimeout(focusoutTimer); });
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function goTo(index) {
      current = ((index % total) + total) % total;
      track.style.transform = 'translateX(-' + (current * 100) + '%)';
      slides.forEach(function (slide, i) {
        slide.tabIndex = i === current ? 0 : -1;
        slide.setAttribute('aria-hidden', String(i !== current));
      });
    }

    function startAuto() {
      clearInterval(autoTimer);
      if (reduceMotion || document.hidden || slideshow.matches(':hover') ||
          slideshow.contains(document.activeElement) ||
          (bioLightbox && bioLightbox.classList.contains('active'))) return;
      autoTimer = setInterval(function () { goTo(current + 1); }, 15000);
    }

    function resetAuto() {
      clearInterval(autoTimer);
      startAuto();
    }

    listen(document.querySelector('.slideshow-prev'), 'click', function () {
      goTo(current - 1);
      resetAuto();
    });

    listen(document.querySelector('.slideshow-next'), 'click', function () {
      goTo(current + 1);
      resetAuto();
    });

    listen(slideshow, 'mouseenter', function () { clearInterval(autoTimer); });
    listen(slideshow, 'mouseleave', startAuto);
    listen(slideshow, 'focusin', function () { clearInterval(autoTimer); });
    listen(slideshow, 'focusout', function () {
      clearTimeout(focusoutTimer);
      focusoutTimer = setTimeout(startAuto, 0);
    });
    listen(document, 'visibilitychange', startAuto);
    addSwipe(track, function () { goTo(current - 1); resetAuto(); }, function () { goTo(current + 1); resetAuto(); });
    listen(slideshow, 'keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      goTo(current + (e.key === 'ArrowLeft' ? -1 : 1));
      if (e.target.tagName === 'IMG') slides[current].focus();
      resetAuto();
    });

    startAuto();

    var bioLightbox = document.getElementById('bioLightbox');
    var bioLbImg = document.getElementById('bioLightboxImg');
    var bioLbClose = document.getElementById('bioLightboxClose');
    var bioLastFocused = null;

    slides.forEach(function (slide, i) {
      slide.style.cursor = 'pointer';
      slide.tabIndex = 0;
      slide.setAttribute('role', 'button');
      slide.setAttribute('aria-label', 'Open bio image ' + (i + 1));

      function openBioLightbox() {
        goTo(i);
        bioLbImg.src = slide.src;
        bioLbImg.alt = slide.alt || 'The Basement Paintings';
        bioLastFocused = document.activeElement;
        bioLightbox.classList.add('active');
        document.body.style.overflow = 'hidden';
        bioLightbox.focus();
        clearInterval(autoTimer);
      }

      listen(slide, 'click', openBioLightbox);
      listen(slide, 'keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openBioLightbox();
        }
      });
    });
    goTo(0);

    function moveBioLightbox(direction) {
      goTo(current + direction);
      bioLbImg.src = slides[current].src;
      bioLbImg.alt = slides[current].alt || 'The Basement Paintings';
    }
    listen(bioLightbox.querySelector('.lightbox-prev'), 'click', function () { moveBioLightbox(-1); });
    listen(bioLightbox.querySelector('.lightbox-next'), 'click', function () { moveBioLightbox(1); });
    addSwipe(bioLbImg, function () { moveBioLightbox(-1); }, function () { moveBioLightbox(1); });

    function closeBioLightbox() {
      bioLightbox.classList.remove('active');
      document.body.style.overflow = '';
      if (bioLastFocused && bioLastFocused.tagName === 'IMG') slides[current].focus();
      else if (bioLastFocused && bioLastFocused.focus) bioLastFocused.focus();
      startAuto();
    }

    listen(bioLbClose, 'click', closeBioLightbox);
    listen(bioLightbox, 'click', function (e) {
      if (e.target === bioLightbox) closeBioLightbox();
    });
    listen(document, 'keydown', function (e) {
      if (!bioLightbox.classList.contains('active')) return;
      if (e.key === 'Escape') closeBioLightbox();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        moveBioLightbox(e.key === 'ArrowLeft' ? -1 : 1);
      }
    });
  }
    return dispose;
  }

  window.SiteUI = { mount: mount, dispose: function () { disposeCurrent(); } };
  mount();
})();
