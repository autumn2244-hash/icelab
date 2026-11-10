/* ==========================================================================
   ICELAB 아이스랩 — redesign v2
   의존성 없는 단일 스크립트. 모든 기능은 없어도 내용이 읽히도록 작성.
   ========================================================================== */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- header ---------- */
  var header = document.getElementById("siteHeader");
  function onScroll() {
    if (header) header.classList.toggle("is-scrolled", window.scrollY > 12);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- mobile menu ---------- */
  var toggle = document.getElementById("navToggle");
  var menu = document.getElementById("mobileMenu");

  function closeMenu() {
    if (!menu || !toggle) return;
    menu.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "메뉴 열기");
    document.body.style.overflow = "";
    window.setTimeout(function () {
      if (!menu.classList.contains("is-open")) menu.hidden = true;
    }, 260);
  }
  function openMenu() {
    if (!menu || !toggle) return;
    menu.hidden = false;
    // 다음 프레임에 클래스 부여 (transition)
    requestAnimationFrame(function () { menu.classList.add("is-open"); });
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "메뉴 닫기");
    document.body.style.overflow = "hidden";
  }
  if (toggle && menu) {
    toggle.addEventListener("click", function () {
      if (toggle.getAttribute("aria-expanded") === "true") closeMenu();
      else openMenu();
    });
    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) closeMenu();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menu.classList.contains("is-open")) {
        closeMenu();
        toggle.focus();
      }
    });
    window.addEventListener("resize", function () {
      if (window.innerWidth > 900 && menu.classList.contains("is-open")) closeMenu();
    });
  }

  /* ---------- reveal on scroll ---------- */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduced) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    reveals.forEach(function (el) { revealObserver.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("is-in"); });
  }

  /* ---------- active nav ---------- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll(".nav a"));
  var sections = navLinks
    .map(function (link) {
      var id = link.getAttribute("href");
      return id && id.charAt(0) === "#" ? document.querySelector(id) : null;
    })
    .filter(Boolean);

  if ("IntersectionObserver" in window && sections.length) {
    var navObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (link) {
          link.classList.toggle("is-active", link.getAttribute("href") === "#" + entry.target.id);
        });
      });
    }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });
    sections.forEach(function (s) { navObserver.observe(s); });
  }

  /* ---------- 4대 공정 (루핑 쇼케이스) ---------- */
  var processRoot = document.querySelector("[data-process]");
  if (processRoot) {
    var steps = Array.prototype.slice.call(processRoot.querySelectorAll(".pstep"));
    var shots = Array.prototype.slice.call(processRoot.querySelectorAll("[data-pmedia] img"));
    var bars = Array.prototype.slice.call(processRoot.querySelectorAll(".pmedia-progress button"));
    var caption = processRoot.querySelector("[data-pcaption]");
    var counter = processRoot.querySelector("[data-pcount]");
    var captions = ["고압 스팀 살균", "친환경 석회 용해", "고압 헹굼 세척", "투명 제빙 확인"];
    var DURATION = 6500;
    var idx = 0;
    var elapsed = 0;
    var startedAt = 0;
    var timer = null;
    var raf = null;
    var paused = false;
    var inView = true;
    var interacted = false;

    function fill(i, pct) {
      var bar = bars[i] && bars[i].querySelector("i");
      if (!bar) return;
      bar.style.width = Math.max(0, Math.min(100, pct)) + "%";
    }

    function tick() {
      var now = performance.now();
      elapsed = Math.min(now - startedAt, DURATION);
      fill(idx, (elapsed / DURATION) * 100);
      if (elapsed < DURATION) raf = requestAnimationFrame(tick);
    }

    function stopTimeline() {
      if (raf) cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
      raf = null;
      timer = null;
    }

    function play() {
      stopTimeline();
      if (reduced || paused || !inView) return;
      startedAt = performance.now() - elapsed;
      raf = requestAnimationFrame(tick);
      timer = window.setTimeout(function () {
        elapsed = 0;
        show((idx + 1) % steps.length, false);
      }, DURATION - elapsed);
    }

    function show(i, restart) {
      idx = i;
      steps.forEach(function (step, n) {
        var on = n === i;
        step.setAttribute("aria-selected", on ? "true" : "false");
        if (on) step.setAttribute("aria-current", "true");
        else step.removeAttribute("aria-current");
        if (bars[n]) bars[n].setAttribute("aria-pressed", on ? "true" : "false");
        if (shots[n]) shots[n].classList.toggle("is-on", on);
        if (!on) fill(n, 0);
      });
      if (caption) caption.textContent = captions[i];
      if (counter) counter.textContent = ("0" + (i + 1)).slice(-2) + " / 04";
      if (restart) elapsed = 0;
      play();
    }

    steps.forEach(function (step, i) {
      step.addEventListener("click", function () {
        interacted = true;
        show(i, true);
      });
    });
    bars.forEach(function (bar, i) {
      bar.addEventListener("click", function () {
        interacted = true;
        show(i, true);
      });
    });

    // 키보드 좌우 이동 (탭 패턴)
    function keyNav(list) {
      list.forEach(function (el, i) {
        el.addEventListener("keydown", function (e) {
          var next = null;
          if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (i + 1) % list.length;
          else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (i - 1 + list.length) % list.length;
          else if (e.key === "Home") next = 0;
          else if (e.key === "End") next = list.length - 1;
          if (next === null) return;
          e.preventDefault();
          interacted = true;
          show(next, true);
          list[next].focus();
        });
      });
    }
    keyNav(steps);
    keyNav(bars);

    processRoot.addEventListener("mouseenter", function () {
      paused = true;
      stopTimeline();
    });
    processRoot.addEventListener("mouseleave", function () {
      if (document.activeElement && processRoot.contains(document.activeElement)) return;
      paused = false;
      play();
    });
    processRoot.addEventListener("focusin", function () {
      paused = true;
      stopTimeline();
    });
    processRoot.addEventListener("focusout", function (e) {
      if (e.relatedTarget && processRoot.contains(e.relatedTarget)) return;
      paused = false;
      play();
    });

    if ("IntersectionObserver" in window) {
      var pObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          inView = entry.isIntersecting;
          if (inView) play();
          else stopTimeline();
        });
      }, { threshold: 0.15 });
      pObserver.observe(processRoot);
    }

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stopTimeline();
      else play();
    });

    show(0, true);
  }

  /* ---------- Before / After 슬라이더 ---------- */
  function initSlider(stage) {
    if (!stage || stage.dataset.ready === "1") return;
    stage.dataset.ready = "1";

    var handle = stage.querySelector(".ba-handle");
    if (!handle) return;
    var pos = 50;
    var dragging = false;

    function apply(next) {
      pos = Math.max(0, Math.min(100, next));
      stage.style.setProperty("--pos", pos.toFixed(2) + "%");
      handle.setAttribute("aria-valuenow", String(Math.round(pos)));
      handle.setAttribute("aria-valuetext", Math.round(pos) + "퍼센트");
    }

    function fromEvent(e) {
      var rect = stage.getBoundingClientRect();
      if (!rect.width) return pos;
      return ((e.clientX - rect.left) / rect.width) * 100;
    }

    stage.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      dragging = true;
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
      apply(fromEvent(e));
      e.preventDefault();
    });
    stage.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      apply(fromEvent(e));
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      try { stage.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);

    handle.addEventListener("keydown", function (e) {
      var step = e.shiftKey ? 10 : 4;
      var next = null;
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = pos - step;
      else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = pos + step;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = 100;
      if (next === null) return;
      e.preventDefault();
      apply(next);
    });

    apply(50);
  }

  document.querySelectorAll("[data-ba]").forEach(initSlider);

  /* ---------- Before / After 탭 ---------- */
  var baTabsRoot = document.querySelector("[data-ba-tabs]");
  if (baTabsRoot) {
    var tabs = Array.prototype.slice.call(baTabsRoot.querySelectorAll(".ba-tab"));
    function selectTab(i) {
      tabs.forEach(function (tab, n) {
        var on = n === i;
        tab.setAttribute("aria-selected", on ? "true" : "false");
        tab.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(tab.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
      });
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () { selectTab(i); });
      tab.addEventListener("keydown", function (e) {
        var next = null;
        if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (i + 1) % tabs.length;
        else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = tabs.length - 1;
        if (next === null) return;
        e.preventDefault();
        selectTab(next);
        tabs[next].focus();
      });
    });
    selectTab(0);
  }

  /* ---------- 상담 신청서 ---------- */
  var form = document.getElementById("consultForm");
  var result = document.getElementById("formResult");
  var summary = document.getElementById("summaryText");
  var copyBtn = document.getElementById("copyBtn");
  var editBtn = document.getElementById("editBtn");

  function fieldError(input, on) {
    var field = input.closest(".field");
    if (!field) return;
    field.classList.toggle("has-error", !!on);
    input.setAttribute("aria-invalid", on ? "true" : "false");
  }

  function validPhone(value) {
    var digits = value.replace(/[^0-9]/g, "");
    if (digits.length < 9 || digits.length > 11) return false;
    return /^(0[0-9]{1,2}|1[0-9]{3})/.test(digits);
  }

  if (form && result) {
    var shop = document.getElementById("shopName");
    var contact = document.getElementById("contact");
    var region = document.getElementById("region");
    var model = document.getElementById("model");
    var message = document.getElementById("message");
    var consent = document.getElementById("consent");
    var consentErr = document.getElementById("consentErr");

    [shop, contact, region].forEach(function (input) {
      input.addEventListener("input", function () {
        if (input.value.trim()) fieldError(input, false);
      });
      input.addEventListener("change", function () {
        if (input.value.trim()) fieldError(input, false);
      });
    });
    consent.addEventListener("change", function () {
      if (consent.checked) consentErr.hidden = true;
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var firstBad = null;

      if (!shop.value.trim()) { fieldError(shop, true); firstBad = firstBad || shop; }
      else fieldError(shop, false);

      if (!validPhone(contact.value)) { fieldError(contact, true); firstBad = firstBad || contact; }
      else fieldError(contact, false);

      if (!region.value) { fieldError(region, true); firstBad = firstBad || region; }
      else fieldError(region, false);

      consentErr.hidden = !!consent.checked;

      if (firstBad) {
        firstBad.focus({ preventScroll: true });
        firstBad.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
        return;
      }
      if (!consent.checked) return;

      var lines = [
        "[ICELAB 아이스랩 상담 신청]",
        "· 매장명: " + shop.value.trim(),
        "· 연락처: " + contact.value.trim(),
        "· 지역: " + region.value,
        "· 제빙기: " + (model.value.trim() || "모름 (사진으로 확인 요청)"),
        "· 상담 내용: " + (message.value.trim() || "별도 없음")
      ];
      summary.textContent = lines.join("\n");

      form.hidden = true;
      result.classList.add("is-on");
      result.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
      if (copyBtn) copyBtn.focus({ preventScroll: true });
    });

    if (editBtn) {
      editBtn.addEventListener("click", function () {
        result.classList.remove("is-on");
        form.hidden = false;
        form.querySelector("button[type=submit]").focus({ preventScroll: true });
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        var text = summary.textContent || "";
        function done(ok) {
          copyBtn.textContent = ok ? "복사되었습니다" : "복사 실패 — 길게 눌러 선택하세요";
          window.setTimeout(function () { copyBtn.textContent = "내용 복사"; }, 2200);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { done(true); }).catch(function () { done(false); });
        } else {
          try {
            var range = document.createRange();
            range.selectNodeContents(summary);
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            done(document.execCommand("copy"));
          } catch (err) { done(false); }
        }
      });
    }
  }

  /* ---------- year ---------- */
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
