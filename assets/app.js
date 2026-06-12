/* ============================================================
   СПЕКТР — движок лендинга.
   1. Three.js: «преломлённый свет» — мягкие спектральные пятна
      на бумажном фоне, дрейфуют, отвечают на скролл и курсор.
   2. GSAP: scroll-scrub hero-видео (короткий пин, два «такта»),
      line-reveal заголовков, счётчики, прогресс этапов.
   ============================================================ */
(function () {
  'use strict';

  document.documentElement.classList.add('js');

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ----------------------------------------------------------
     THREE.JS — ambient spectral background
  ---------------------------------------------------------- */
  var glState = { vel: 0 };

  function initGL() {
    if (!window.THREE) return;
    var canvas = document.getElementById('gl');
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas, alpha: true, antialias: false,
        powerPreference: 'low-power'
      });
    } catch (e) { canvas.remove(); return; }

    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));

    var scene = new THREE.Scene();
    var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    var uniforms = {
      uRes:     { value: new THREE.Vector2(1, 1) },
      uTime:    { value: 0 },
      uScroll:  { value: 0 },
      uVel:     { value: 0 },
      uPointer: { value: new THREE.Vector2(0.5, 0.5) }
    };

    var material = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      uniforms: uniforms,
      vertexShader: 'void main(){gl_Position=vec4(position,1.0);}',
      fragmentShader: [
        'precision highp float;',
        'uniform vec2 uRes;uniform float uTime;uniform float uScroll;uniform float uVel;uniform vec2 uPointer;',
        'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}',
        'float blob(vec2 p,vec2 c,float k){vec2 d=p-c;return exp(-k*dot(d,d));}',
        'void main(){',
        '  vec2 uv=gl_FragCoord.xy/uRes;',
        '  float ar=uRes.x/uRes.y;',
        '  vec2 p=vec2(uv.x*ar,uv.y);',
        '  float t=uTime*0.05;',
        '  float s=uScroll;',
        // курсор слегка «притягивает» свет
        '  vec2 pt=vec2(uPointer.x*ar,1.0-uPointer.y);',
        // пастельный спектр: лаванда, голубой, шалфей, персик
        '  vec3 c1=vec3(0.760,0.700,0.980);',
        '  vec3 c2=vec3(0.600,0.800,0.980);',
        '  vec3 c3=vec3(0.660,0.870,0.780);',
        '  vec3 c4=vec3(0.990,0.760,0.660);',
        '  vec2 b1=vec2(0.16*ar+0.10*sin(t*0.90+1.0),0.86-0.55*s+0.07*cos(t*0.70));',
        '  vec2 b2=vec2(0.88*ar+0.09*cos(t*0.80+2.0),0.30+0.45*s+0.08*sin(t*0.60+4.0));',
        '  vec2 b3=vec2(0.55*ar+0.13*sin(t*0.50+5.0),0.12+0.30*s+0.07*cos(t*0.85+1.5));',
        '  vec2 b4=vec2(0.30*ar+0.11*cos(t*0.65+0.5),0.55+0.10*sin(t*0.75)+0.20*s);',
        '  b1+= (pt-b1)*0.06; b2+=(pt-b2)*0.05; b3+=(pt-b3)*0.07; b4+=(pt-b4)*0.05;',
        '  float w1=blob(p,b1,5.5),w2=blob(p,b2,6.0),w3=blob(p,b3,5.0),w4=blob(p,b4,6.5);',
        '  float wt=w1+w2+w3+w4;',
        '  vec3 col=(c1*w1+c2*w2+c3*w3+c4*w4)/max(wt,1e-3);',
        '  float a=smoothstep(0.04,0.9,wt)*(0.34+0.30*uVel);',
        '  a+=(hash(uv*vec2(913.0,527.0)+fract(uTime))-0.5)*0.014;', // дизер против банding
        '  gl_FragColor=vec4(col,clamp(a,0.0,0.62));',
        '}'
      ].join('\n')
    });

    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

    function resize() {
      var w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      uniforms.uRes.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
    }
    resize();
    window.addEventListener('resize', resize);

    var targetPtr = { x: 0.5, y: 0.5 };
    window.addEventListener('pointermove', function (e) {
      targetPtr.x = e.clientX / window.innerWidth;
      targetPtr.y = e.clientY / window.innerHeight;
    }, { passive: true });

    var clock = new THREE.Clock();
    function frame() {
      if (!document.hidden) {
        uniforms.uTime.value = clock.getElapsedTime();
        var doc = document.documentElement;
        var max = Math.max(1, doc.scrollHeight - window.innerHeight);
        uniforms.uScroll.value += ((window.scrollY / max) - uniforms.uScroll.value) * 0.06;
        uniforms.uVel.value += (Math.min(Math.abs(glState.vel) / 2400, 1) - uniforms.uVel.value) * 0.04;
        glState.vel *= 0.94; // затухание, иначе свечение «залипает» после остановки
        var ptr = uniforms.uPointer.value;
        ptr.x += (targetPtr.x - ptr.x) * 0.04;
        ptr.y += (targetPtr.y - ptr.y) * 0.04;
        renderer.render(scene, camera);
      }
      if (!REDUCED) requestAnimationFrame(frame);
    }
    frame(); // при reduced motion рисуем один статичный кадр
  }

  /* ----------------------------------------------------------
     GSAP — хореография
  ---------------------------------------------------------- */
  function initAnimations() {
    if (!window.gsap) return;
    gsap.registerPlugin(ScrollTrigger);
    if (window.SplitText) gsap.registerPlugin(SplitText);

    gsap.defaults({ ease: 'power3.out', duration: 1 });

    var header = document.getElementById('header');
    header.classList.add('header--hero');

    /* ---------- reduced motion: всё видно сразу, без пина и твинов ---------- */
    if (REDUCED) {
      gsap.set('.reveal, .reveal-row', { autoAlpha: 1 });
      gsap.set('#stepsProgress', { scaleX: 1 });
      document.querySelectorAll('.count').forEach(function (el) {
        el.textContent = el.dataset.to;
      });
      var rHero = document.getElementById('hero');
      var rVideo = document.getElementById('heroVideo');
      rVideo.addEventListener('error', function () {
        setTimeout(function () {
          if (rVideo.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
            rHero.classList.add('hero--novideo');
          }
        }, 0);
      }, true);
      rVideo.addEventListener('loadeddata', function () {
        try { rVideo.currentTime = 0.001; } catch (e) {}
      });
      rVideo.load();
      ScrollTrigger.create({
        trigger: rHero,
        start: 'bottom 90px',
        onLeave: function () {
          header.classList.remove('header--hero');
          header.classList.add('header--solid');
        },
        onEnterBack: function () {
          header.classList.add('header--hero');
          header.classList.remove('header--solid');
        }
      });
      document.getElementById('year').textContent = new Date().getFullYear();
      return;
    }

    /* ---------- hero: видео-скраб + два такта ---------- */
    var hero = document.getElementById('hero');
    var video = document.getElementById('heroVideo');
    var videoOk = false;

    // источники перебираются по очереди (локальный файл → CDN);
    // фолбэк-фон включаем, только когда не сработал ни один
    video.addEventListener('error', function () {
      setTimeout(function () {
        if (video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
          hero.classList.add('hero--novideo');
        }
      }, 0);
    }, true);

    video.addEventListener('loadedmetadata', function () {
      videoOk = true;
      try { video.currentTime = 0.001; } catch (e) {}
    });
    video.load();

    // iOS: «разбудить» видео первым касанием, чтобы скраб работал стабильно
    function wake() {
      if (!videoOk) return; // ждём метаданные, листенер остаётся
      window.removeEventListener('touchstart', wake);
      var p = video.play();
      if (p && p.then) p.then(function () { video.pause(); }).catch(function () {});
    }
    window.addEventListener('touchstart', wake, { passive: true });

    var scrub = { target: 0, current: 0 };

    var heroTl = gsap.timeline({
      scrollTrigger: {
        trigger: hero,
        start: 'top top',
        end: '+=185%',          // короткий пин: 2 такта, не надоедает
        pin: true,
        scrub: 0.6,
        anticipatePin: 1,
        onUpdate: function (st) {
          scrub.target = st.progress;
          glState.vel = st.getVelocity();
        }
      }
    });

    heroTl
      .to('.hero__stage--a', { autoAlpha: 0, y: -60, scale: 0.985, ease: 'power1.in', duration: 0.32 }, 0.10)
      .to('.hero__hint', { autoAlpha: 0, duration: 0.12 }, 0.02)
      .fromTo('.hero__stage--b',
        { autoAlpha: 0, y: 70 },
        { autoAlpha: 1, y: 0, ease: 'power2.out', duration: 0.34 }, 0.52)
      .to('.hero__video', { scale: 1.0, ease: 'none', duration: 1 }, 0);

    // плавный скраб: rAF-петля догоняет целевой прогресс
    gsap.ticker.add(function () {
      if (!videoOk || !video.duration) return;
      scrub.current += (scrub.target - scrub.current) * 0.12;
      var t = scrub.current * Math.max(video.duration - 0.06, 0);
      if (Math.abs(video.currentTime - t) > 0.005) {
        try { video.currentTime = t; } catch (e) {}
      }
    });

    /* ---------- header: светлый над hero, «стекло» дальше ---------- */
    ScrollTrigger.create({
      trigger: hero,
      start: 'bottom 90px',
      onLeave: function () {
        header.classList.remove('header--hero');
        header.classList.add('header--solid');
      },
      onEnterBack: function () {
        header.classList.add('header--hero');
        header.classList.remove('header--solid');
      }
    });

    /* ---------- интро hero при загрузке ---------- */
    var intro = gsap.timeline({ delay: 0.15 });
    if (window.SplitText) {
      try {
        var split = new SplitText('#heroTitle', { type: 'chars' });
        intro.from(split.chars, {
          yPercent: 60, autoAlpha: 0, stagger: 0.045,
          duration: 1.1, ease: 'power4.out'
        }, 0.25);
      } catch (e) {
        intro.from('#heroTitle', { autoAlpha: 0, y: 40, duration: 1.1 }, 0.25);
      }
    } else {
      intro.from('#heroTitle', { autoAlpha: 0, y: 40, duration: 1.1 }, 0.25);
    }
    intro
      .from('.hero__kicker', { autoAlpha: 0, y: -16, duration: 0.8 }, 0.15)
      .from('.hero__sub', { autoAlpha: 0, y: 24, duration: 0.9 }, 0.75)
      .from('.hero__cta .btn', { autoAlpha: 0, y: 24, stagger: 0.08, duration: 0.8 }, 0.9)
      .from('.hero__hint', { autoAlpha: 0, duration: 0.8 }, 1.2);

    /* ---------- заголовки: line reveal ---------- */
    document.querySelectorAll('.split').forEach(function (el) {
      var targets = [el];
      var masks = [];
      if (window.SplitText) {
        try {
          var s = new SplitText(el, { type: 'lines', linesClass: 'split-line' });
          // обёртка-маска для каждой строки
          s.lines.forEach(function (line) {
            var wrap = document.createElement('div');
            wrap.style.overflow = 'clip';
            line.parentNode.insertBefore(wrap, line);
            wrap.appendChild(line);
            masks.push(wrap);
          });
          targets = s.lines;
        } catch (e) {}
      }
      var masked = masks.length > 0;
      gsap.from(targets, {
        yPercent: masked ? 112 : 0,
        autoAlpha: masked ? 1 : 0,
        duration: 1.15,
        stagger: 0.09,
        ease: 'power4.out',
        scrollTrigger: { trigger: el, start: 'top 84%', once: true },
        onComplete: function () {
          // маска больше не нужна — возвращаем выносные элементы букв
          masks.forEach(function (w) { w.style.overflow = 'visible'; });
        }
      });
    });

    /* ---------- мягкие появления ---------- */
    ScrollTrigger.batch('.reveal', {
      start: 'top 88%',
      once: true,
      onEnter: function (els) {
        gsap.fromTo(els,
          { autoAlpha: 0, y: 30 },
          { autoAlpha: 1, y: 0, duration: 1, stagger: 0.09, overwrite: true });
      }
    });
    ScrollTrigger.batch('.reveal-row', {
      start: 'top 86%',
      once: true,
      onEnter: function (els) {
        gsap.fromTo(els,
          { autoAlpha: 0, y: 44 },
          { autoAlpha: 1, y: 0, duration: 1.1, stagger: 0.12, overwrite: true });
      }
    });

    /* ---------- счётчики ---------- */
    document.querySelectorAll('.count').forEach(function (el) {
      var to = parseInt(el.dataset.to, 10);
      var obj = { v: parseInt(el.dataset.from || '0', 10) };
      ScrollTrigger.create({
        trigger: el,
        start: 'top 88%',
        once: true,
        onEnter: function () {
          gsap.to(obj, {
            v: to, duration: 1.8, ease: 'power2.out',
            onUpdate: function () { el.textContent = Math.round(obj.v); }
          });
        }
      });
    });

    /* ---------- этапы: спектральная линия прогресса ---------- */
    gsap.fromTo('#stepsProgress', { scaleX: 0 }, {
      scaleX: 1, ease: 'none',
      scrollTrigger: {
        trigger: '#stepsTrack',
        start: 'top 78%',
        end: 'bottom 45%',
        scrub: 0.5
      }
    });

    /* ---------- скролл-скорость для фона ---------- */
    ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: function (st) { glState.vel = st.getVelocity(); }
    });

    document.getElementById('year').textContent = new Date().getFullYear();
  }

  /* ----------------------------------------------------------
     bootstrap: ждём шрифты, чтобы SplitText резал строки точно
  ---------------------------------------------------------- */
  function boot() {
    initGL();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(initAnimations);
    } else {
      initAnimations();
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
