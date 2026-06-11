/* ============================================================
   Ascend CRM — scroll-cinematic движок.
   Каждая секция .cine содержит sticky-канвас и последовательность
   JPEG-кадров (assets/frames/<scene>/), которые листаются скроллом —
   с ленивой загрузкой, lerp-сглаживанием и подписями по прогрессу.
   ============================================================ */
(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Header: фон при скролле ---------- */
  var header = document.getElementById("header");
  function onScrollHeader() {
    header.classList.toggle("scrolled", window.scrollY > 24);
  }
  window.addEventListener("scroll", onScrollHeader, { passive: true });
  onScrollHeader();

  /* ---------- Reveal-анимации ---------- */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reducedMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.18 });
    revealEls.forEach(function (el, i) {
      el.style.transitionDelay = (i % 3) * 70 + "ms";
      io.observe(el);
    });
  } else {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- Утилиты ---------- */
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function smooth(x) { x = clamp01(x); return x * x * (3 - 2 * x); }

  /* ---------- Плеер одной cinematic-секции ---------- */
  function CinePlayer(section) {
    this.section = section;
    this.canvas = section.querySelector(".cine-canvas");
    this.ctx = this.canvas.getContext("2d");
    this.track = section.querySelector(".cine-track");
    this.path = section.dataset.path;
    this.total = parseInt(section.dataset.frames, 10);
    this.track.style.height = (parseInt(section.dataset.track, 10) || 280) + "vh";

    this.images = new Array(this.total);
    this.loadedMax = -1;          // непрерывно загруженный префикс не нужен — храним по кадру
    this.current = 0;             // плавный (дробный) кадр
    this.drawnFrame = -1;
    this.visible = false;
    this.heroOverlay = section.querySelector("[data-hero-fade]");
    this.caps = Array.prototype.map.call(section.querySelectorAll(".cap"), function (el) {
      return {
        el: el,
        from: parseFloat(el.dataset.from),
        to: parseFloat(el.dataset.to)
      };
    });

    this.resize();
    this.bootstrap();
  }

  CinePlayer.prototype.src = function (i) {
    return this.path + String(i).padStart(4, "0") + ".jpg";
  };

  CinePlayer.prototype.load = function (i, cb) {
    if (this.images[i]) return;
    var img = new Image();
    img.decoding = "async";
    var self = this;
    img.onload = function () { if (cb) cb(); self.dirty = true; };
    img.src = this.src(i);
    this.images[i] = img;
  };

  /* Загрузка волнами: каркас из каждого 8-го кадра, затем всё остальное */
  CinePlayer.prototype.bootstrap = function () {
    var self = this;
    this.load(0, function () { self.dirty = true; });
    if (reducedMotion) return;                       // достаточно постера
    var step;
    for (step = 0; step < this.total; step += 8) this.load(step);
    var fill = function () {
      for (var i = 0; i < self.total; i++) self.load(i);
    };
    if (document.readyState === "complete") setTimeout(fill, 400);
    else window.addEventListener("load", function () { setTimeout(fill, 400); });
  };

  CinePlayer.prototype.nearest = function (target) {
    var img = this.images[target];
    if (img && img.complete && img.naturalWidth) return target;
    for (var d = 1; d < this.total; d++) {
      var lo = target - d, hi = target + d;
      if (lo >= 0) { img = this.images[lo]; if (img && img.complete && img.naturalWidth) return lo; }
      if (hi < this.total) { img = this.images[hi]; if (img && img.complete && img.naturalWidth) return hi; }
    }
    return -1;
  };

  CinePlayer.prototype.resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) { w = window.innerWidth; h = window.innerHeight; }
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.dirty = true;
  };

  CinePlayer.prototype.progress = function () {
    var rect = this.track.getBoundingClientRect();
    var span = rect.height - window.innerHeight;
    if (span <= 0) return 0;
    return clamp01(-rect.top / span);
  };

  CinePlayer.prototype.drawFrame = function (idx) {
    var img = this.images[idx];
    if (!img || !img.complete || !img.naturalWidth) return;
    var cw = this.canvas.width, ch = this.canvas.height;
    var iw = img.naturalWidth, ih = img.naturalHeight;
    var s = Math.max(cw / iw, ch / ih);
    var dw = iw * s, dh = ih * s;
    this.ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    this.drawnFrame = idx;
  };

  CinePlayer.prototype.tick = function () {
    var p = this.progress();

    // Хиро-оверлей растворяется в начале скролла
    if (this.heroOverlay) {
      var f = 1 - smooth(p / 0.16);
      this.heroOverlay.style.opacity = f.toFixed(3);
      this.heroOverlay.style.transform = "translateY(" + (-34 * (1 - f)).toFixed(1) + "px)";
      this.heroOverlay.style.pointerEvents = f < 0.05 ? "none" : "";
    }

    // Подписи: плавный вход/выход в своём диапазоне прогресса.
    // Сдвиг — через CSS-переменную, чтобы не ломать позиционные transform'ы.
    for (var i = 0; i < this.caps.length; i++) {
      var c = this.caps[i];
      var inO = smooth((p - c.from) / 0.07);
      var outO = 1 - smooth((p - (c.to - 0.07)) / 0.07);
      var o = Math.min(inO, outO);
      c.el.style.opacity = o.toFixed(3);
      c.el.style.setProperty("--dy", (26 * (1 - o)).toFixed(1) + "px");
    }

    // Кадр: lerp к целевому
    var target = p * (this.total - 1);
    if (reducedMotion) target = 0;
    this.current += (target - this.current) * 0.22;
    if (Math.abs(target - this.current) < 0.5) this.current = target;
    var idx = this.nearest(Math.round(this.current));
    if (idx >= 0 && (idx !== this.drawnFrame || this.dirty)) {
      this.dirty = false;
      this.drawFrame(idx);
    }
  };

  /* ---------- Инициализация всех секций ---------- */
  var players = Array.prototype.map.call(
    document.querySelectorAll(".cine"),
    function (s) { return new CinePlayer(s); }
  );

  if ("IntersectionObserver" in window) {
    var vis = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var pl = players.find(function (p) { return p.section === e.target; });
        if (pl) pl.visible = e.isIntersecting;
      });
    }, { rootMargin: "20% 0px" });
    players.forEach(function (p) { vis.observe(p.section); });
  } else {
    players.forEach(function (p) { p.visible = true; });
  }

  var resizeT;
  window.addEventListener("resize", function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () {
      players.forEach(function (p) { p.resize(); });
    }, 120);
  });

  function loop() {
    for (var i = 0; i < players.length; i++) {
      if (players[i].visible) players[i].tick();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
