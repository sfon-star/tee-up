// Core: canvas, input, scene manager, main loop, math utils.
window.TU = {};
(function () {
  const W = 960, H = 540, PW = 480, PH = 270;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const pix = document.createElement('canvas');
  pix.width = PW; pix.height = PH;
  const pctx = pix.getContext('2d');
  Object.assign(TU, { W, H, PW, PH, canvas, ctx, pix, pctx, time: 0 });

  function fit() {
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    for (const cv of [canvas, document.getElementById('gl')]) {
      cv.style.width = Math.floor(W * s) + 'px';
      cv.style.height = Math.floor(H * s) + 'px';
    }
  }
  window.addEventListener('resize', fit);
  fit();

  // ---- Input ----
  const input = TU.input = { mx: 0, my: 0, down: false, clicked: false, rclicked: false, moved: false, keys: {}, pressed: {}, wheel: 0, typed: [] };
  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    input.mx = (e.clientX - r.left) * W / r.width;
    input.my = (e.clientY - r.top) * H / r.height;
  }
  canvas.addEventListener('mousemove', e => { toCanvas(e); input.moved = true; });
  canvas.addEventListener('mousedown', e => {
    toCanvas(e);
    if (e.button === 0) { input.down = true; input.clicked = true; }
    if (e.button === 2) { input.rclicked = true; input.rdown = true; }
    if (e.button === 1) { input.rdown = true; e.preventDefault(); }
    if (TU.audio) TU.audio.unlock();
  });
  window.addEventListener('mouseup', e => { if (e.button === 0) input.down = false; else input.rdown = false; });
  canvas.addEventListener('wheel', e => { input.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('keydown', e => {
    if (!input.keys[e.code]) input.pressed[e.code] = true;
    input.lastKey = e.code;
    input.keys[e.code] = true;
    if (e.key.length === 1 || e.key === 'Backspace') input.typed.push(e.key);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Backspace'].includes(e.code)) e.preventDefault();
    if (TU.audio) TU.audio.unlock();
  });
  window.addEventListener('keyup', e => { input.keys[e.code] = false; });
  window.addEventListener('blur', () => { input.keys = {}; });
  input.isDown = (...c) => c.some(k => input.keys[k]);
  input.isPressed = (...c) => c.some(k => input.pressed[k]);

  // ---- Utils ----
  const util = TU.util = {
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    lerp: (a, b, t) => a + (b - a) * t,
    dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    // Angle convention: 0 = north (-y), clockwise positive.
    angleTo: (a, b) => Math.atan2(b.x - a.x, -(b.y - a.y)),
    dirVec: a => ({ x: Math.sin(a), y: -Math.cos(a) }),
    wrap: a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; },
    rng(seed) {
      let s = seed >>> 0 || 1;
      return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    hash(x, y, seed = 0) {
      let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    },
    noise(x, y, seed = 0) {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const s = t => t * t * (3 - 2 * t);
      const h = util.hash;
      const a = h(xi, yi, seed), b = h(xi + 1, yi, seed), c = h(xi, yi + 1, seed), d = h(xi + 1, yi + 1, seed);
      const u = s(xf), v = s(yf);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    },
    gauss(r = Math.random) {
      return Math.sqrt(-2 * Math.log(r() || 1e-6)) * Math.cos(2 * Math.PI * r());
    },
  };

  // ---- Scenes ----
  TU.scenes = {};
  let scene = null, fade = 0;
  TU.go = function (name, params) {
    if (scene && scene.exit) scene.exit();
    scene = TU.scenes[name];
    TU.sceneName = name;
    TU.ui.reset();
    if (scene.enter) scene.enter(params || {});
    fade = 1;
  };

  let last = performance.now();
  function frame(t) {
    const raw = (t - last) / 1000, dt = Math.min(0.05, raw);
    last = t;
    TU.time += dt;
    TU.ui.beginFrame();
    if (scene.update) scene.update(dt);
    ctx.imageSmoothingEnabled = false;
    pctx.imageSmoothingEnabled = false;
    if (scene.render3D) {
      scene.render3D(dt);
      TU.R3.render();
      ctx.clearRect(0, 0, W, H);
    } else if (scene.drawWorld) {
      pctx.fillStyle = '#000';
      pctx.fillRect(0, 0, PW, PH);
      scene.drawWorld(pctx);
      ctx.drawImage(pix, 0, 0, W, H);
    } else {
      ctx.fillStyle = '#0d1a14';
      ctx.fillRect(0, 0, W, H);
    }
    if (scene.drawUI) scene.drawUI(ctx);
    if (fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${fade})`;
      ctx.fillRect(0, 0, W, H);
      fade = Math.max(0, fade - Math.min(raw, 0.1) * 4);
    }
    input.clicked = input.rclicked = input.moved = false;
    input.pressed = {};
    input.wheel = 0;
    input.typed = [];
    requestAnimationFrame(frame);
  }
  TU.start = function (name) {
    TU.go(name);
    requestAnimationFrame(frame);
  };
})();
