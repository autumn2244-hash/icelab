/* ============================================================================
   v3.3 — 4대 공정 클립 재생기 (ICELAB_CLIP)
   ----------------------------------------------------------------------------
   1) 호스트가 mp4/webm 을 application/octet-stream 으로 내려도 재생되도록
      fetch → Blob(video/mp4 | video/webm) → blob: URL 로 바꿔 재생한다.
      (raw.githack·raw.githubusercontent 미리보기에서 영상이 멈춰 보이던 원인)
   2) 탭을 바꿀 때 load()를 반복하지 않고 src 만 갈아끼운다. 재생 실패는
      canplay·가시성 변화·첫 터치에서 다시 시도해 정지 상태로 남지 않는다.
   3) 화면에 보이는 클립만 재생하고, 화면 밖으로 나가면 멈춰 디코딩 부담을 줄인다.
   ========================================================================== */
(function () {
  'use strict';

  var MIME = { mp4: 'video/mp4', webm: 'video/webm' };
  var ORDER = (function () {
    var v = document.createElement('video');
    function can(t) { try { return !!v.canPlayType(t).replace(/^no$/, ''); } catch (e) { return false; } }
    if (can('video/webm; codecs="vp9"') || can('video/webm')) return ['webm', 'mp4'];
    return ['mp4', 'webm'];
  })();

  var cache = {};

  function path(stem, ext) { return 'assets/' + stem + '.' + ext; }

  function loadClip(stem) {
    var c = cache[stem];
    if (c && c.url) return Promise.resolve(c.url);
    if (c && c.promise) return c.promise;

    function tryExt(i) {
      if (i >= ORDER.length) {
        cache[stem] = { url: path(stem, ORDER[0]), direct: true };
        return Promise.resolve(cache[stem].url);
      }
      var ext = ORDER[i];
      return fetch(path(stem, ext), { credentials: 'same-origin' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.arrayBuffer();
        })
        .then(function (buf) {
          var url = URL.createObjectURL(new Blob([buf], { type: MIME[ext] }));
          cache[stem] = { url: url, ext: ext };
          return url;
        })
        .catch(function () { return tryExt(i + 1); });
    }

    var p = tryExt(0);
    cache[stem] = { promise: p };
    return p;
  }

  function canPlay(v) { return !!(v && v.getAttribute('src')); }

  function ensure(v) {
    if (!v || v.tagName !== 'VIDEO' || !canPlay(v)) return;
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    if (v.getAttribute('data-inview') === '0') return;   // 화면 밖 클립은 재생하지 않는다
    if (!v.paused) return;
    var p;
    try { p = v.play(); } catch (e) { p = null; }
    if (p && p.catch) {
      p.catch(function () {
        v.setAttribute('data-need-play', '1');
        var t = v.getAttribute('data-retry') | 0;
        if (t < 2) {
          v.setAttribute('data-retry', String(t + 1));
          setTimeout(function () { ensure(v); }, 400);
        }
      });
    }
  }

  function setPoster(v, still) {
    if (still && v.getAttribute('poster') !== still) v.setAttribute('poster', still);
  }

  function attach(v, stem, still, alt) {
    if (!v || v.tagName !== 'VIDEO' || !stem) return;
    setPoster(v, still);
    if (alt) v.setAttribute('aria-label', alt);
    if (!v.getAttribute('data-err-hook')) {
      v.setAttribute('data-err-hook', '1');
      v.addEventListener('error', function () {
        var s = v.getAttribute('data-stem');
        if (!s || v.getAttribute('data-err') === '1') return;
        v.setAttribute('data-err', '1');      // blob 재생이 실패하면 원본 경로로 한 번만 재시도
        v.removeAttribute('data-src-ready');
        v.setAttribute('src', 'assets/' + s + '.mp4');
        ensure(v);
      });
    }
    if (v.getAttribute('data-stem') === stem && v.getAttribute('data-src-ready') === '1') {
      ensure(v);
      return;
    }
    v.setAttribute('data-stem', stem);

    v.muted = true;
    v.defaultMuted = true;
    v.loop = true;
    v.playsInline = true;
    v.setAttribute('muted', '');
    v.setAttribute('loop', '');
    v.setAttribute('playsinline', '');
    v.setAttribute('preload', 'auto');

    loadClip(stem).then(function (url) {
      if (v.getAttribute('data-stem') !== stem) return;
      v.setAttribute('data-src-ready', '1');
      var srcs = v.querySelectorAll('source');
      for (var i = 0; i < srcs.length; i++) srcs[i].parentNode.removeChild(srcs[i]);
      if (v.getAttribute('src') !== url) {
        v.setAttribute('src', url);
        v.removeAttribute('data-retry');
      }
      ensure(v);
    });
  }

  /* 자동재생이 막혔거나 PC 환경에서 스크롤/마우스 이동 시 즉시 재생 시도 */
  var resumeTimer = null;
  function resumeAll() {
    if (resumeTimer) return;
    resumeTimer = setTimeout(function () {
      resumeTimer = null;
      var list = document.querySelectorAll('video[src]');
      for (var i = 0; i < list.length; i++) {
        var v = list[i];
        if (v.getAttribute('data-inview') === '0') continue;
        if (v.paused) ensure(v);
      }
    }, 60);
  }
  ['pointerdown', 'touchstart', 'keydown', 'scroll', 'wheel', 'mousemove'].forEach(function (t) {
    window.addEventListener(t, resumeAll, { passive: true });
    document.addEventListener(t, resumeAll, { passive: true });
  });
  window.addEventListener('focus', resumeAll);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) resumeAll();
  });

  var io = null;
  function observeAll() {
    var list = document.querySelectorAll('video');
    if (!('IntersectionObserver' in window)) {
      for (var j = 0; j < list.length; j++) ensure(list[j]);
      return;
    }
    if (!io) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var v = en.target;
          if (en.isIntersecting) {
            v.setAttribute('data-inview', '1');
            v.muted = true;
            ensure(v);
          } else {
            v.setAttribute('data-inview', '0');
            if (!v.paused) { try { v.pause(); } catch (e) {} }
          }
        });
      }, { threshold: 0.001, rootMargin: '200px 0px' });
    }
    for (var i = 0; i < list.length; i++) {
      if (!list[i].getAttribute('data-io')) {
        list[i].setAttribute('data-io', '1');
        io.observe(list[i]);
      }
    }
  }

  var started = false;
  function init() {
    observeAll();
    var list = document.querySelectorAll('video.pc-video[data-stem]');
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      attach(v, v.getAttribute('data-stem'), v.getAttribute('data-poster'), v.getAttribute('aria-label'));
    }
    var procImg = document.getElementById('procImg');
    if (procImg && procImg.tagName === 'VIDEO' && !procImg.getAttribute('src')) {
      attach(procImg, 'gif-steam', 'assets/gif-steam.jpg', '120℃ 고온 스팀 살균');
    }
    resumeAll();
    if (!started) {
      started = true;
      setInterval(observeAll, 1500);
      /* 탭 전환용 클립을 미리 받아 두어 바꿀 때 바로 재생되게 한다 */
      setTimeout(function () {
        var stems = {};
        var tabs = document.querySelectorAll('[data-gif]');
        for (var k = 0; k < tabs.length; k++) {
          var s = tabs[k].getAttribute('data-gif');
          if (s) stems[s] = 1;
        }
        Object.keys(stems).forEach(function (s) { loadClip(s); });
      }, 1200);
    }
  }

  window.ICELAB_CLIP = { attach: attach, ensure: ensure, init: init, load: loadClip };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  window.addEventListener('hashchange', function () { setTimeout(init, 120); });
})();
