/* ============================================================================
   v3.4 — 4대 공정 클립 재생기 (ICELAB_CLIP)
   ----------------------------------------------------------------------------
   v3.3 에서 PC(크롬) 탭 전환 시 영상이 poster 정지 화면으로 남던 문제를 고친 판.
   원인은 한 요소의 src 만 갈아끼우는 구조에서 재생이 보장되지 않은 세 가지였다.

     1) src 를 바꾼 뒤 pause()/load() 를 부르지 않아, 이전 클립이 재생 중이던
        요소는 "재생 중(paused=false)" 상태로 남은 채 새 소스를 물고 멈췄다.
     2) ensure() 가 `if (!v.paused) return;` 으로 먼저 빠져나가, 위 상태에서는
        play() 를 아예 시도하지 않았다.
     3) loadeddata·canplay 에서 재생을 다시 거는 훅이 없어, 한 번 멈추면
        사용자가 화면을 건드리기 전까지 poster 에서 깨어나지 않았다.

   그래서 이 버전은
     - 소스를 바꿀 때 반드시 pause() → src → load() 순서로 갈아끼우고,
     - 요소마다 loadeddata·canplay·playing 훅을 한 번만 걸어 데이터가 준비되는
       순간 재생을 다시 시도하며,
     - 재생 판정을 paused 플래그 하나에 기대지 않고(readyState 까지 확인)
       실패하면 200ms 간격으로 최대 4회 재시도하고,
     - 1.5초 주기 감시(observeAll)에서 화면에 보이는데 멈춰 있는 클립을 다시
       재생시켜, 어떤 이유로 한 번 끊겨도 스스로 복구되게 한다.
     - blob 재생이 실패하면 원본 경로로 한 번만 폴백한다(가시 미리보기 대비).
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

  var RETRY_MAX = 4;
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

  function hasSrc(v) { return !!(v && v.getAttribute('src')); }
  function inView(v) { return v.getAttribute('data-inview') !== '0'; }

  /* 소스 교체: 이전 재생을 확실히 끊고 새 소스를 처음부터 다시 읽게 한다.
     (src 속성만 바꾸면 브라우저에 따라 '재생 중' 상태가 그대로 남아 멈춘다) */
  function swapSrc(v, url) {
    try { v.pause(); } catch (e) {}
    var srcs = v.querySelectorAll('source');
    for (var i = 0; i < srcs.length; i++) srcs[i].parentNode.removeChild(srcs[i]);
    if (v.getAttribute('src') !== url) {
      v.setAttribute('src', url);
      try { v.load(); } catch (e) {}
    }
  }

  /* 지금 재생을 시도한다. paused 플래그만 믿지 않고 readyState 까지 본다. */
  function playNow(v) {
    if (!v || v.tagName !== 'VIDEO' || !hasSrc(v)) return;
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    v.loop = true;
    if (v.getAttribute('data-blocked') === '1') return;
    if (!inView(v)) return;
    if (!v.paused && v.readyState >= 2 && !v.ended) return;   // 이미 정상 재생 중
    var p = null;
    try { p = v.play(); } catch (e) { p = null; }
    if (!p || !p.then) return;
    p.then(function () {
      v.removeAttribute('data-need-play');
      v.removeAttribute('data-retry');
    }).catch(function () {
      v.setAttribute('data-need-play', '1');
      var t = v.getAttribute('data-retry') | 0;
      if (t >= RETRY_MAX) { v.setAttribute('data-blocked', '1'); return; }
      v.setAttribute('data-retry', String(t + 1));
      setTimeout(function () { playNow(v); }, 200 * (t + 1));
    });
  }

  /* 요소마다 한 번만 거는 재생 훅: 데이터가 준비되는 순간 재생을 다시 건다. */
  function arm(v) {
    if (!v || v.tagName !== 'VIDEO' || v.getAttribute('data-play-hook') === '1') return;
    v.setAttribute('data-play-hook', '1');

    function kick() { playNow(v); }
    function kickSoon() { setTimeout(kick, 200); }

    ['loadeddata', 'canplay', 'canplaythrough', 'loadedmetadata', 'playing', 'resize'].forEach(function (evt) {
      v.addEventListener(evt, kick);
    });
    ['stalled', 'suspend', 'waiting', 'seeking'].forEach(function (evt) {
      v.addEventListener(evt, kickSoon);
    });

    /* blob 재생이 실패하면 원본 mp4 경로로 한 번만 폴백한다 */
    v.addEventListener('error', function () {
      var s = v.getAttribute('data-stem');
      if (!s || v.getAttribute('data-err') === '1') return;
      v.setAttribute('data-err', '1');
      var d = path(s, 'mp4');
      if (v.getAttribute('src') === d) return;
      v.removeAttribute('data-retry');
      v.removeAttribute('data-blocked');
      swapSrc(v, d);
      playNow(v);
    });
  }

  function setPoster(v, still) {
    if (still && v.getAttribute('poster') !== still) v.setAttribute('poster', still);
  }

  function attach(v, stem, still, alt) {
    if (!v || v.tagName !== 'VIDEO' || !stem) return;
    arm(v);
    setPoster(v, still);
    if (alt) v.setAttribute('aria-label', alt);

    /* 같은 클립을 다시 붙이는 경우 — 소스는 그대로 두고 재생만 보장한다 */
    if (v.getAttribute('data-stem') === stem && v.getAttribute('data-src-ready') === '1') {
      v.removeAttribute('data-blocked');
      playNow(v);
      return;
    }

    v.setAttribute('data-stem', stem);
    v.removeAttribute('data-err');
    v.removeAttribute('data-blocked');
    v.removeAttribute('data-retry');
    v.setAttribute('data-src-ready', '0');

    v.muted = true;
    v.defaultMuted = true;
    v.loop = true;
    v.playsInline = true;
    v.setAttribute('muted', '');
    v.setAttribute('loop', '');
    v.setAttribute('playsinline', '');
    v.setAttribute('preload', 'auto');
    try { v.pause(); } catch (e) {}

    loadClip(stem).then(function (url) {
      if (v.getAttribute('data-stem') !== stem) return;
      swapSrc(v, url);
      v.setAttribute('data-src-ready', '1');
      playNow(v);
      /* 네트워크·디코더가 늦게 준비되는 경우를 위해 한 번 더 */
      setTimeout(function () {
        if (v.getAttribute('data-stem') === stem) playNow(v);
      }, 280);
    }).catch(function () {});
  }

  /* 사용자가 화면을 건드리거나 보고 있으면 멈춘 클립을 다시 재생한다 */
  var resumeTimer = null;
  function resumeAll() {
    if (resumeTimer) return;
    resumeTimer = setTimeout(function () {
      resumeTimer = null;
      var list = document.querySelectorAll('video[src]');
      for (var i = 0; i < list.length; i++) {
        var v = list[i];
        if (!inView(v)) continue;
        if (v.getAttribute('data-blocked') === '1') continue;
        if (v.paused) playNow(v);
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
      for (var j = 0; j < list.length; j++) playNow(list[j]);
      return;
    }
    if (!io) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var v = en.target;
          if (en.isIntersecting) {
            v.setAttribute('data-inview', '1');
            v.muted = true;
            playNow(v);
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
      /* 자가 복구: 화면에 보이는데 멈춰 있는 클립은 주기적으로 다시 재생 */
      var v = list[i];
      if (v.getAttribute('data-inview') === '1' && v.paused && v.getAttribute('data-src-ready') === '1') {
        playNow(v);
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
      }, 800);
    }
  }

  window.ICELAB_CLIP = { attach: attach, ensure: playNow, init: init, load: loadClip };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  window.addEventListener('hashchange', function () { setTimeout(init, 120); });
})();
