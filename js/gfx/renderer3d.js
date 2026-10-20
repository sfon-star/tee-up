// 3D renderer (Three.js). 'pixel' style renders at low resolution for chunky pixels,
// 'smooth' (HIGH RES) style renders at full resolution with antialiasing and HD ground.
// Game coords (x, y) on the ground map to Three coords (x, height, y).
(function () {
  const T = THREE;
  const RW = 480, RH = 270;
  let renderer = null;
  // Antialiasing is fixed per WebGL context, so switching style swaps in a fresh canvas.
  function makeRenderer(style) {
    let cv = document.getElementById('gl');
    if (renderer) {
      const fresh = document.createElement('canvas');
      fresh.id = 'gl';
      fresh.style.cssText = cv.style.cssText;
      cv.replaceWith(fresh);
      renderer.dispose();
      renderer.forceContextLoss();
      cv = fresh;
    }
    const smooth = style === 'smooth';
    renderer = new T.WebGLRenderer({ canvas: cv, antialias: smooth });
    renderer.setPixelRatio(smooth ? Math.min(2, window.devicePixelRatio || 1) : 1);
    renderer.setSize(smooth ? 960 : RW, smooth ? 540 : RH, false);
    renderer.shadowMap.enabled = true;
    // pixel style: a lower-res, blurred shadow map so shadow edges stay soft instead of crisp
    renderer.shadowMap.type = smooth ? T.PCFSoftShadowMap : T.PCFShadowMap;
    cv.style.imageRendering = smooth ? 'auto' : 'pixelated';
  }
  makeRenderer(TU.save.data.settings.gfx);

  const SKY = 0xa8d8f0;
  const scene = new T.Scene();
  scene.background = new T.Color(SKY);
  scene.fog = new T.Fog(SKY, 260, 820);
  const camera = new T.PerspectiveCamera(55, RW / RH, 0.05, 1500);

  const hemi = new T.HemisphereLight(0xe6f6ff, 0x4d6e3c, 0.8);
  scene.add(hemi);
  const SUN_DIR = new T.Vector3(-0.62, 0.6, 0.5).normalize(); // afternoon sun behind-left of most tee shots
  const sun = new T.DirectionalLight(0xfff0d6, 0.8);
  sun.position.copy(SUN_DIR).multiplyScalar(150);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 420 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  function styleShadows(style) {
    const px = style !== 'smooth', size = px ? 1024 : 2048;
    sun.shadow.radius = px ? 3.5 : 1;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
  }
  // visible sun disc with a soft glow, kept far away along the light direction
  const sunDisc = new T.Group();
  sunDisc.add(new T.Mesh(new T.IcosahedronGeometry(26, 1), new T.MeshBasicMaterial({ color: 0xfff6d2, fog: false })));
  sunDisc.add(new T.Mesh(new T.IcosahedronGeometry(60, 1), new T.MeshBasicMaterial({ color: 0xfff1b0, fog: false, transparent: true, opacity: 0.22, depthWrite: false })));
  scene.add(sunDisc);
  // reflection map: sky above, hazy horizon, green ground below
  const envTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 32;
    const x = cv.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 32);
    gr.addColorStop(0, '#3f86d6'); gr.addColorStop(0.48, '#cfeaf6'); gr.addColorStop(0.52, '#7aa070'); gr.addColorStop(1, '#3e6a36');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 32);
    x.fillStyle = '#fffbe6'; x.beginPath(); x.arc(20, 8, 3, 0, 7); x.fill();
    const t = new T.CanvasTexture(cv);
    t.mapping = T.EquirectangularReflectionMapping;
    return t;
  })();

  // Sky: screen-space vertical gradient.
  {
    const cv = document.createElement('canvas'); cv.width = 2; cv.height = 256;
    const x = cv.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#4f93db'); gr.addColorStop(0.55, '#9fd0ef'); gr.addColorStop(1, '#d6eef7');
    x.fillStyle = gr; x.fillRect(0, 0, 2, 256);
    scene.background = new T.CanvasTexture(cv);
  }

  const mats = {};
  const mat = (color, o = {}) => {
    const key = color + JSON.stringify(o);
    if (!mats[key]) {
      mats[key] = new T.MeshPhongMaterial(Object.assign({ color, flatShading: true, shininess: 14, specular: 0x202020 }, o));
    }
    return mats[key];
  };
  const basic = (color, o = {}) => new T.MeshBasicMaterial(Object.assign({ color }, o));

  // A rounded, lumpy hill: a squashed dome with jittered vertices and vertex colors that mottle the
  // grass, darken the base and show bare rock on the steep upper slopes.
  function hillGeo(b, h, rnd, colA, colB) {
    const g = new T.SphereGeometry(1, 16, 9, 0, Math.PI * 2, 0, Math.PI / 2), pos = g.attributes.position;
    const cols = new Float32Array(pos.count * 3), ca = new T.Color(colA), cb = new T.Color(colB), rock = new T.Color(0x8a8670), tmp = new T.Color();
    for (let k = 0; k < pos.count; k++) {
      let x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
      const lump = 0.88 + rnd() * 0.24;
      if (y > 0.02 && y < 0.99) { x *= lump; z *= lump; y *= 0.9 + rnd() * 0.2; }
      pos.setXYZ(k, x * b, y * h, z * b);
      const n = TU.util.noise(x * 3 + b, z * 3, 7);
      tmp.copy(ca).lerp(cb, n);
      tmp.multiplyScalar(0.78 + y * 0.32); // darker at the foot, sunlit on top
      if (y > 0.55 && n > 0.62 && h / b > 0.45) tmp.lerp(rock, 0.65);
      cols[k * 3] = tmp.r; cols[k * 3 + 1] = tmp.g; cols[k * 3 + 2] = tmp.b;
    }
    g.setAttribute('color', new T.BufferAttribute(cols, 3));
    g.computeVertexNormals();
    return g;
  }

  // Backdrop around every hole, rebuilt whenever the course setting changes (see themes.js):
  // far ranges / skyline / islands / mesas, clouds, birds and (in the country) hot-air balloons.
  const backdrop = new T.Group();
  scene.add(backdrop);
  backdrop.userData = { birds: [], balloons: [], clouds: new T.Group() };
  function buildBackdrop(theme) {
    while (backdrop.children.length) { const o = backdrop.children.pop(); o.traverse(x => { if (x.geometry) x.geometry.dispose(); }); }
    R3.backdropAnim = null;
    const r = TU.util.rng(777), TH = TU.Themes ? TU.Themes.get(theme) : { birds: { color: 0x2b2f38, scale: 1.2, flocks: 4, flap: 9 }, balloons: true };
    const layer = (n, rad, hMin, hMax, bMin, bMax, colA, colB, snow) => {
      for (let i = 0; i < n; i++) {
        const a = (i + r() * 0.6) / n * Math.PI * 2, d = rad + (r() - 0.5) * rad * 0.15;
        const h = hMin + r() * (hMax - hMin), b = bMin + r() * (bMax - bMin), seg = 5 + Math.floor(r() * 3);
        const c = new T.Color(colA).lerp(new T.Color(colB), r());
        // jitter the cone so each peak gets its own ridges instead of a perfect cone
        const cg = new T.ConeGeometry(b, h, seg, 3), cp = cg.attributes.position;
        for (let k = 0; k < cp.count; k++) {
          const y = cp.getY(k);
          if (y > h / 2 - 0.01 || y < -h / 2 + 0.01) continue;
          cp.setX(k, cp.getX(k) * (0.85 + r() * 0.3)); cp.setZ(k, cp.getZ(k) * (0.85 + r() * 0.3)); cp.setY(k, y + (r() - 0.5) * h * 0.1);
        }
        cg.computeVertexNormals();
        const m = new T.Mesh(cg, mat(c.getHex(), { fog: false }));
        m.position.set(Math.cos(a) * d, h / 2 - 2, Math.sin(a) * d);
        m.rotation.set((r() - 0.5) * 0.12, r() * 6.28, (r() - 0.5) * 0.12);
        backdrop.add(m);
        if (snow && h > snow) {
          const k = 0.26, cap = new T.Mesh(new T.ConeGeometry(b * k * 1.03, h * k, seg), mat(0xf2f6fa, { fog: false }));
          cap.position.set(0, h / 2 - (h * k) / 2 + 0.5, 0);
          m.add(cap);
        }
      }
    };
    const domes = (n, rad, hMin, hMax, bMin, bMax, colA, colB, spread = 105) => {
      for (let i = 0; i < n; i++) {
        const a = (i + r() * 0.6) / n * Math.PI * 2, d = rad + (r() - 0.5) * spread, h = hMin + r() * (hMax - hMin), b = bMin + r() * (bMax - bMin);
        const m = new T.Mesh(hillGeo(b, h, r, colA, colB), new T.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 6, specular: 0x101010, fog: false }));
        m.position.set(Math.cos(a) * d, -2, Math.sin(a) * d); m.rotation.y = r() * 6.28; backdrop.add(m);
      }
    };
    if (theme === 'mountain') {
      layer(40, 1250, 220, 380, 170, 260, 0xa9b9d0, 0xbfcde0, 270); // faint far range in the haze
      layer(34, 950, 150, 300, 130, 210, 0x7d93b0, 0x9aaecb, 215);
      domes(46, 700, 35, 95, 90, 150, 0x5f8c6c, 0x86ad7c); // rolling foothills
    } else if (theme === 'country') {
      // no peaks, just layers of rolling green hills fading into the haze
      domes(40, 1150, 40, 90, 160, 240, 0x8fae9c, 0xa9c2b4, 160);
      domes(46, 760, 30, 80, 110, 170, 0x5f9a5c, 0x86b97a);
    } else if (theme === 'city') {
      // the skyline: towers of every height ringing the course in the haze
      const towerCols = [0x9aa6b4, 0xaab4c0, 0x8c98a8, 0xb4bcc6, 0x7f8ea0];
      for (let i = 0; i < 120; i++) {
        const a = r() * Math.PI * 2, d = 650 + r() * 600, w = 25 + r() * 45, h = 50 + r() * 230 * (r() < 0.25 ? 1.6 : 1);
        const m = new T.Mesh(new T.BoxGeometry(w, h, w * (0.7 + r() * 0.6)), mat(towerCols[i % towerCols.length], { fog: false }));
        m.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d); m.rotation.y = r() * 6; backdrop.add(m);
        if (h > 200) { const sp = new T.Mesh(new T.CylinderGeometry(1, 2, 30, 5), mat(0xc9ced6, { fog: false })); sp.position.set(m.position.x, h + 15, m.position.z); backdrop.add(sp); }
      }
      domes(30, 1350, 40, 90, 200, 300, 0x9fb2b0, 0xb4c4c2, 160);
    } else if (theme === 'coastal') {
      TU.Themes.coastalBackdrop(backdrop, r, hillGeo);
    } else if (theme === 'desert') {
      TU.Themes.desertBackdrop(backdrop, r, layer);
    }
    // drifting low-poly clouds (fewer over the desert)
    const clouds = new T.Group(), cm = mat(0xffffff, { fog: false, emissive: 0x6a7a88 }), cmb = mat(0xdde6ee, { fog: false, emissive: 0x58687a });
    for (let i = 0, nC = theme === 'desert' ? 12 : 34; i < nC; i++) {
      const cl = new T.Group(), a = r() * Math.PI * 2, d = 250 + r() * 650;
      for (let k = 0, n = 4 + Math.floor(r() * 5); k < n; k++) {
        const base = new T.Mesh(new T.IcosahedronGeometry(11 + r() * 10, 0), cmb);
        base.position.set((k - n / 2) * 13 + r() * 6, -3, (r() - 0.5) * 16); base.scale.set(1.2, 0.35, 1); cl.add(base);
        const puff = new T.Mesh(new T.IcosahedronGeometry(9 + r() * 12, 1), cm);
        puff.position.set((k - n / 2) * 13 + r() * 6, 2 + r() * 8, (r() - 0.5) * 14);
        puff.scale.y = 0.6;
        cl.add(puff);
      }
      cl.position.set(Math.cos(a) * d, 120 + r() * 90, Math.sin(a) * d);
      cl.rotation.y = r() * 6.28;
      clouds.add(cl);
    }
    backdrop.add(clouds);
    backdrop.userData.clouds = clouds;
    // birds in the setting's style: V flocks, seagulls gliding, pigeons, or vultures circling alone
    const B = TH.birds, birds = [], birdM = new T.MeshBasicMaterial({ color: B.color, side: T.DoubleSide, fog: false });
    const tipM = B.tip ? new T.MeshBasicMaterial({ color: B.tip, side: T.DoubleSide, fog: false }) : birdM;
    const wingG = new T.BufferGeometry(); wingG.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0.3, 1.6, 0, -0.35, 0, 0, -0.7], 3));
    const tipG = new T.BufferGeometry(); tipG.setAttribute('position', new T.Float32BufferAttribute([1.1, 0.01, -0.1, 1.6, 0.01, -0.35, 1.2, 0.01, -0.45], 3));
    for (let f = 0; f < B.flocks; f++) {
      const flock = new T.Group(), n = B.circle ? 1 + Math.floor(r() * 2) : 5 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) {
        const b = new T.Group();
        const lw = new T.Mesh(wingG, birdM), rw = new T.Mesh(wingG, birdM); rw.scale.x = -1;
        if (B.tip) { lw.add(new T.Mesh(tipG, tipM)); rw.add(new T.Mesh(tipG, tipM)); }
        const body = new T.Mesh(new T.BoxGeometry(0.28, 0.2, 1.1), birdM); body.position.z = -0.2;
        const tail = new T.Mesh(new T.BoxGeometry(0.45, 0.06, 0.35), birdM); tail.position.z = -0.85;
        b.add(lw, rw, body, tail);
        const row = Math.ceil(k / 2), side = k % 2 ? 1 : -1;
        b.position.set(B.circle ? k * 30 : side * row * 2.4, (r() - 0.5) * (B.circle ? 8 : 1), B.circle ? 0 : row * 2.4);
        b.scale.setScalar(1.6 * B.scale);
        flock.add(b); birds.push({ lw, rw, ph: r() * 6, flap: B.flap });
      }
      flock.userData = { rad: (B.circle ? 70 : 110) + r() * 200, h: 45 + r() * 35, sp: (B.circle ? 0.05 : 0.03 + r() * 0.03) * (r() < 0.5 ? -1 : 1), a: r() * 6.28, sc: B.scale };
      backdrop.add(flock);
      birds.push({ flock });
    }
    backdrop.userData.birds = birds;
    // hot-air balloons drifting slowly in the distance (out in the countryside only)
    const balloons = [];
    const stripes = [[0xe74c3c, 0xf1c40f], [0x2f80ed, 0xf4f4f0], [0x27ae60, 0xe67e22]];
    for (let k = 0; k < (TH.balloons ? 3 : 0); k++) {
      const g = new T.Group(), [c1, c2] = stripes[k];
      for (let s2 = 0; s2 < 8; s2++) {
        const seg = new T.Mesh(new T.SphereGeometry(9, 8, 8, s2 * Math.PI / 4, Math.PI / 4), mat(s2 % 2 ? c1 : c2, { fog: false }));
        seg.scale.y = 1.2; g.add(seg);
      }
      const neck = new T.Mesh(new T.CylinderGeometry(3, 1.6, 4, 8), mat(c1, { fog: false })); neck.position.y = -11; g.add(neck);
      const basket = new T.Mesh(new T.BoxGeometry(2.6, 2, 2.6), mat(0x8a5a30, { fog: false })); basket.position.y = -16; g.add(basket);
      for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const rope = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 4, 3), mat(0x3a2a1e, { fog: false })); rope.position.set(x * 1.3, -13.5, z * 1.3); g.add(rope); }
      const a = r() * 6.28, d = 380 + r() * 260;
      g.userData = { a, d, h: 90 + r() * 60, ph: r() * 6 };
      backdrop.add(g); balloons.push(g);
    }
    backdrop.userData.balloons = balloons;
  }
  // sky gradient and haze colour for a setting
  function setSky(theme) {
    const [top, mid, low] = TU.Themes ? TU.Themes.get(theme).sky : ['#4f93db', '#9fd0ef', '#d6eef7'];
    const cv = document.createElement('canvas'); cv.width = 2; cv.height = 256;
    const x = cv.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, top); gr.addColorStop(0.55, mid); gr.addColorStop(1, low);
    x.fillStyle = gr; x.fillRect(0, 0, 2, 256);
    if (scene.background && scene.background.dispose) scene.background.dispose();
    scene.background = new T.CanvasTexture(cv);
    scene.fog.color.set(low);
  }

  const R3 = TU.R3 = { T, scene, camera, mat, world: null, hole: null, backdrop, envTex, style: TU.save.data.settings.gfx };
  Object.defineProperty(R3, 'renderer', { get: () => renderer });
  R3.smooth = () => R3.style === 'smooth';
  const _f = new T.Vector3();
  R3.render = () => {
    // keep the sun disc in the sky and the shadow box centred just ahead of the camera
    sunDisc.position.copy(camera.position).addScaledVector(SUN_DIR, 1100);
    {
      camera.getWorldDirection(_f);
      _f.y = 0; _f.normalize();
      const fx = camera.position.x + _f.x * 22, fz = camera.position.z + _f.z * 22;
      const fy = R3.hole ? R3.heightAt(fx, fz) : 0;
      sun.target.position.set(fx, fy, fz);
      sun.position.set(fx, fy, fz).addScaledVector(SUN_DIR, 200);
      sun.target.updateMatrixWorld();
    }
    renderer.render(scene, camera);
  };
  // Reflective objects (ball, cart body, water) register here so the style can tune them.
  const reflective = [];
  R3.reflect = (m, amount) => { reflective.push([m, amount]); applyMaterialStyle(); return m; };
  // Solid gold: a special color value that every customizable part turns into polished metal
  // crisp texels in pixel style (no smoothing), normal filtering in high res
  R3.pxTex = t => { if (R3.style !== 'smooth') { t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter; t.generateMipmaps = false; } return t; };
  R3.GOLD = '#d4af38';
  R3.isGold = hex => typeof hex === 'string' && hex.toLowerCase() === R3.GOLD;
  const golds = {};
  R3.gold = (o = {}) => {
    const key = JSON.stringify(o);
    return golds[key] || (golds[key] = R3.reflect(new T.MeshPhongMaterial(Object.assign({ color: 0xd9b23c, specular: 0xfff0b0, shininess: 120, emissive: 0x2a1c00, flatShading: true }, o)), 0.7));
  };
  // a color material that becomes gold for the gold option
  R3.paint = (hex, o = {}) => R3.isGold(hex) ? R3.gold(o) : mat(parseInt(hex.slice(1), 16), o);
  function applyMaterialStyle() {
    const px = R3.style !== 'smooth';
    for (const k in mats) {
      const m = mats[k];
      m.specular.setHex(px ? 0x141414 : 0x202020);
      m.shininess = px ? 8 : 14;
      m.needsUpdate = true;
    }
    // pixel style: much fainter reflections and broad, dim highlights instead of sharp glints
    for (const [m, amount] of reflective) {
      if (!m.userData.base) m.userData.base = { shininess: m.shininess, specular: m.specular ? m.specular.getHex() : 0 };
      const b = m.userData.base;
      m.envMap = envTex;
      m.reflectivity = px ? amount * 0.35 : amount;
      if (m.specular) { m.specular.setHex(b.specular); if (px) m.specular.multiplyScalar(0.45); }
      m.shininess = px ? Math.min(b.shininess, 22) : b.shininess;
      m.needsUpdate = true;
    }
    styleShadows(R3.style);
    hemi.intensity = 0.62;
    sun.intensity = 1.05;
    sun.color.setHex(0xffe8c4);
  }
  // Terrain depends on the style: pixel style = 2 px/yard pixel-art ground,
  // high res style = smooth 4 px/yard ground with a separate road surface.
  function rebuildTerrain() {
    const hole = R3.hole, holder = R3.terrainHolder;
    if (!hole || !holder) return;
    while (holder.children.length) {
      const c = holder.children.pop();
      c.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    }
    if (R3.groundTex) { R3.groundTex.dispose(); R3.groundTex = null; }
    if (R3.smooth()) buildHDTerrain(hole, holder); else buildPixelTerrain(hole, holder);
  }
  function buildPixelTerrain(hole, holder) {
    const Wy = hole.w * 4, Hy = hole.h * 4;
    const g = new T.PlaneGeometry(Wy, Hy, hole.w, hole.h);
    g.rotateX(-Math.PI / 2);
    g.translate(Wy / 2, 0, Hy / 2);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const i = Math.round(pos.getX(k) / 4), j = Math.round(pos.getZ(k) / 4);
      pos.setY(k, TU.terrain.get(hole).hs[j * (hole.w + 1) + i]);
    }
    g.computeVertexNormals();
    const t = R3.groundTex = new T.CanvasTexture(groundCanvas(TU.holeRender.get(hole)));
    t.magFilter = t.minFilter = T.NearestFilter;
    const m = new T.Mesh(g, new T.MeshLambertMaterial({ map: t }));
    m.receiveShadow = true;
    holder.add(m);
  }
  // HIGH RES style: smooth-shaded ground on a 2 yard grid (aligned with the height field so it
  // matches physics exactly), a 4 px/yard texture, and a flat road ribbon along the cart path.
  function buildHDTerrain(hole, holder) {
    const Wy = hole.w * 4, Hy = hole.h * 4;
    const g = new T.PlaneGeometry(Wy, Hy, hole.w * 2, hole.h * 2);
    g.rotateX(-Math.PI / 2);
    g.translate(Wy / 2, 0, Hy / 2);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) pos.setY(k, R3.heightAt(pos.getX(k), pos.getZ(k)));
    g.computeVertexNormals();
    const t = R3.groundTex = new T.CanvasTexture(TU.holeRender.hd(hole));
    t.magFilter = T.LinearFilter;
    t.minFilter = T.LinearMipmapLinearFilter;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const m = new T.Mesh(g, new T.MeshLambertMaterial({ map: t }));
    m.receiveShadow = true;
    holder.add(m);
    if (hole.path) holder.add(buildRoad(hole));
  }
  // Road ribbon: level across its width, follows the ground along its length, darker edges.
  function buildRoad(hole) {
    const pts = [];
    for (let k = 0; k < hole.path.length - 1; k++) {
      const [ax, ay] = hole.path[k], [bx, by] = hole.path[k + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
      for (let i = 0; i < n; i++) pts.push([ax + (bx - ax) * i / n, ay + (by - ay) * i / n]);
    }
    pts.push(hole.path[hole.path.length - 1]);
    const across = [-2.3, -1.9, 1.9, 2.3], shade = [0.72, 1, 1, 0.72];
    const pos = [], col = [], idx = [], base = new T.Color(0xc9c1b0);
    pts.forEach(([x, y], k) => {
      const [px, py] = pts[Math.max(0, k - 1)], [nx, ny] = pts[Math.min(pts.length - 1, k + 1)];
      const tx = nx - px, ty = ny - py, l = Math.hypot(tx, ty) || 1, ox = -ty / l, oy = tx / l;
      // the highest ground under the road's width, so the surface never sinks into the slope
      let hgt = -1e9;
      for (const a of [-2.3, 0, 2.3]) hgt = Math.max(hgt, R3.heightAt(x + ox * a, y + oy * a));
      across.forEach((a, i) => {
        pos.push(x + ox * a, hgt + 0.07, y + oy * a);
        col.push(base.r * shade[i], base.g * shade[i], base.b * shade[i]);
      });
      if (k) for (let i = 0; i < 3; i++) {
        const p0 = (k - 1) * 4 + i, p1 = k * 4 + i;
        idx.push(p0, p1, p0 + 1, p0 + 1, p1, p1 + 1);
      }
    });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new T.Mesh(g, new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.receiveShadow = true;
    return m;
  }
  R3.setStyle = function (style) {
    R3.style = style;
    makeRenderer(style);
    applyMaterialStyle();
    // rebuild the whole hole so scenery, decals and dressing pick the textures for this style
    if (R3.hole) { const h = R3.hole; R3.hole = null; R3.loadHole(h); }
    else rebuildTerrain();
  };
  // Mark every mesh under obj as a shadow caster (instanced trees included).
  R3.castShadows = obj => obj.traverse(o => { if (o.isMesh && !o.userData.noShadow) o.castShadow = true; });
  R3.v3 = (x, y, h = 0) => new T.Vector3(x, h, y);
  applyMaterialStyle();

  // ---------- height field (see game/terrain.js) ----------
  R3.heightAt = (x, y) => R3.hole ? TU.terrain.heightAt(R3.hole, x, y) : 0;

  function groundCanvas(tex) {
    if (tex.groundCanvas) return tex.groundCanvas;
    const cv = TU.sprites.makeCanvas(tex.w, tex.h), x = cv.getContext('2d');
    const img = x.createImageData(tex.w, tex.h);
    new Uint32Array(img.data.buffer).set(tex.ground);
    x.putImageData(img, 0, 0);
    tex.groundCanvas = cv;
    return cv;
  }

  // ---------- scenery around a hole: green mountains with trees on the slopes, woods ----------
  function buildScenery(hole, world) {
    const U = TU.util, r = U.rng(hole.w * 131 + hole.h * 17 + (hole.tiles.length % 97));
    const Wy = hole.w * 4, Hy = hole.h * 4, cx = Wy / 2, cz = Hy / 2;
    // city, coast and desert bring their own surroundings; country and mountain use hills + farmland
    const theme = TU.Themes ? TU.Themes.of(hole) : 'mountain';
    if (TU.Themes && TU.Themes.surround(theme, hole, world, r)) return;
    // the hill ring sits well back so there's a band of open countryside around the course
    const rx = Wy / 2 + 330, rz = Hy / 2 + 290;
    const treeSpots = [], rockSpots = [], flowerSpots = [];
    const hills = [];
    const N = 24;
    for (let i = 0; i < N; i++) {
      const a = (i + r() * 0.5) / N * Math.PI * 2;
      hills.push({ mx: cx + Math.cos(a) * rx * (0.95 + r() * 0.2), mz: cz + Math.sin(a) * rz * (0.95 + r() * 0.2), b: 95 + r() * 70, h: 45 + r() * 65 });
    }
    // farmland, lakes and the road beyond the boundary (kept off the hills); trees keep out of them
    const zones = TU.Countryside ? TU.Countryside.build(hole, world, r, hills.map(q => ({ x: q.mx, z: q.mz, r: q.b }))) : [];
    const clearOf = (x, z) => zones.every(q => Math.hypot(q.x - x, q.z - z) > q.r);
    const hillMat = new T.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 6, specular: 0x101010 });
    for (const hl of hills) {
      const { mx, mz, b, h } = hl;
      const c0 = new T.Color(0x4a8a40).lerp(new T.Color(0x6aa050), r()), c1 = c0.clone().lerp(new T.Color(0x9cc070), 0.55);
      const m = new T.Mesh(hillGeo(b, h, r, c0.getHex(), c1.getHex()), hillMat);
      m.position.set(mx, -3, mz);
      m.rotation.y = r() * 6.28;
      m.receiveShadow = true;
      world.add(m);
      const surf = f => h * Math.sqrt(Math.max(0, 1 - f * f)) * 0.95 - 3; // height of the dome at radial fraction f
      // trees grow in groves on the lower slopes rather than scattered evenly
      for (let gv = 0; gv < 3; gv++) {
        const ga = r() * Math.PI * 2, gf = 0.35 + r() * 0.45;
        for (let k = 0; k < 7; k++) {
          const f = Math.min(0.92, gf + (r() - 0.5) * 0.25), t = ga + (r() - 0.5) * 0.5;
          treeSpots.push({ x: mx + Math.cos(t) * f * b, z: mz + Math.sin(t) * f * b, y: surf(f) - 1, s: 2.2 + r() * 1.6, v: r() < 0.55 ? 2 : 0 });
        }
      }
      // boulders and wildflower meadows dotted over the slopes
      for (let k = 0; k < 6; k++) { const f = 0.2 + r() * 0.7, t = r() * Math.PI * 2; rockSpots.push({ x: mx + Math.cos(t) * f * b, z: mz + Math.sin(t) * f * b, y: surf(f) - 0.5, s: 1.5 + r() * 3 }); }
      for (let k = 0; k < 40; k++) { const f = 0.1 + r() * 0.85, t = r() * Math.PI * 2; flowerSpots.push({ x: mx + Math.cos(t) * f * b, z: mz + Math.sin(t) * f * b, y: surf(f) + 0.3, c: Math.floor(r() * 4) }); }
    }
    // woods on the flat ground between the course and the mountains
    for (let i = 0; i < 260; i++) {
      const a = r() * Math.PI * 2, d = 0.55 + r() * 0.4;
      const x = cx + Math.cos(a) * rx * d * 1.05, z = cz + Math.sin(a) * rz * d * 1.05;
      if (x > -15 && x < Wy + 15 && z > -15 && z < Hy + 15) continue;
      if (!clearOf(x, z)) continue;
      treeSpots.push({ x, z, y: 0, s: 1 + r() * 0.6, v: r() < 0.5 ? 2 : 0 });
    }
    // the setting's own trees (broadleaf + birch in the country, the old mix in the mountains)
    TU.Themes.plant(world, treeSpots.map(t => ({ ...t, v: t.v === 2 ? 2 : (r() < 0.4 ? 1 : 0), rot: r() * 6.28 })), theme);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), p = new T.Vector3(), Y = new T.Vector3(0, 1, 0);
    // boulders and flower patches on the hills
    const rocksM = new T.InstancedMesh(new T.DodecahedronGeometry(1, 0), mat(0x8c8a80), rockSpots.length || 1);
    rockSpots.forEach((t, k) => { q.setFromAxisAngle(Y, r() * 6.28); sc.set(t.s, t.s * 0.65, t.s * 0.9); rocksM.setMatrixAt(k, m4.compose(p.set(t.x, t.y, t.z), q, sc)); });
    rocksM.count = rockSpots.length;
    const fl = new T.InstancedMesh(new T.IcosahedronGeometry(0.9, 0), mat(0xffffff), flowerSpots.length || 1);
    const fcol = [new T.Color(0xffe066), new T.Color(0xff8fc8), new T.Color(0xffffff), new T.Color(0xc56cf0)];
    flowerSpots.forEach((t, k) => { sc.set(1, 0.5, 1); fl.setMatrixAt(k, m4.compose(p.set(t.x, t.y, t.z), q.identity(), sc)); fl.setColorAt(k, fcol[t.c]); });
    fl.count = flowerSpots.length;
    [rocksM, fl].forEach(o => world.add(o));
  }

  // ---------- hole world ----------
  R3.loadHole = function (hole) {
    if (R3.hole === hole && R3.world) return;
    if (R3.world) {
      scene.remove(R3.world);
      R3.world.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      if (R3.groundTex) R3.groundTex.dispose();
    }
    R3.hole = hole;
    R3.detail = null; R3.countryside = null;
    // rebuild the backdrop and sky when the course setting changes
    const theme = TU.Themes ? TU.Themes.of(hole) : 'mountain';
    if (R3.themeName !== theme) { R3.themeName = theme; buildBackdrop(theme); setSky(theme); }
    backdrop.position.set(hole.w * 2, 0, hole.h * 2);
    const world = R3.world = new T.Group();
    const tex = TU.holeRender.get(hole);

    const Wy = hole.w * 4, Hy = hole.h * 4;
    // land around the course: four big slabs framing the map, never overlapping it
    // (the course height field is 0 at its border, so they meet seamlessly)
    {
      // mottled grass texture instead of flat green, tiled every 30 yards
      const am = TU.Countryside ? TU.Countryside.flatTex(theme === 'desert' ? TU.Countryside.sandTex() : TU.Countryside.grassTex()) : new T.MeshLambertMaterial({ color: 0x3e7a3a }), F = 3000;
      for (const [x0, z0, x1, z1] of [[-F, -F, Wy + F, 0], [-F, Hy, Wy + F, Hy + F], [-F, 0, 0, Hy], [Wy, 0, Wy + F, Hy]]) {
        const pg = new T.PlaneGeometry(x1 - x0, z1 - z0);
        const uv = pg.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (x1 - x0) / 30, uv.getY(k) * (z1 - z0) / 30);
        pg.rotateX(-Math.PI / 2);
        const apron = new T.Mesh(pg, am);
        apron.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
        apron.receiveShadow = true;
        world.add(apron);
      }
    }
    // terrain (rebuilt when the style changes)
    R3.terrainHolder = new T.Group();
    world.add(R3.terrainHolder);
    rebuildTerrain();
    // solid props the player and cart bump into: { x, y, r } circles in game coords
    R3.colliders = [];

    buildScenery(hole, world);

    // trees on the course, in the setting's species; each one remembers its parts so the
    // camera can hide the ones that would block the view
    R3.treeData = TU.Themes.plant(world, tex.trees.map((t, k) => ({ x: t.x, z: t.y, y: R3.heightAt(t.x, t.y), s: 0.8 + TU.util.hash(k, 3, 9) * 0.6, v: t.v, rot: TU.util.hash(k, 4, 9) * 6.28 })), theme, true);
    const m4 = new T.Matrix4();

    // tee markers: a golf ball on a red tee peg, one each side of the tee box (knee-high would look like a giant ball)
    for (const dx of [-4.5, 4.5]) {
      const mk = new T.Group();
      const peg = new T.Mesh(new T.CylinderGeometry(0.1, 0.03, 0.32, 8), mat(0xd23c3c)); peg.position.y = 0.16; mk.add(peg);
      const cup = new T.Mesh(new T.CylinderGeometry(0.17, 0.1, 0.07, 10), mat(0xd23c3c)); cup.position.y = 0.34; mk.add(cup);
      const ball = new T.Mesh(new T.IcosahedronGeometry(0.24, 1), mat(0xf6f6f2)); ball.position.y = 0.6; mk.add(ball);
      mk.scale.setScalar(0.5);
      mk.position.set(hole.tee.x + dx, R3.heightAt(hole.tee.x + dx, hole.tee.y), hole.tee.y);
      R3.colliders.push({ x: hole.tee.x + dx, y: hole.tee.y, r: 0.18 });
      R3.castShadows(mk);
      world.add(mk);
    }
    // wooden hole sign beside the tee box. The text texture is drawn at roughly the size it covers
    // on screen (crisp pixels, nearest filtering) in pixel style, and 4x larger in low poly style.
    {
      const k = R3.smooth() ? 4 : 1, cw = 96 * k, ch = 48 * k;
      const cv = TU.sprites.makeCanvas(cw, ch), x = cv.getContext('2d');
      x.imageSmoothingEnabled = false;
      x.fillStyle = '#6b4526'; x.fillRect(0, 0, cw, ch);
      x.fillStyle = '#76502c'; for (let y = 0; y < ch; y += 8 * k) x.fillRect(0, y, cw, 4 * k);
      x.fillStyle = '#3e2716'; x.fillRect(0, 0, cw, 2 * k); x.fillRect(0, ch - 2 * k, cw, 2 * k); x.fillRect(0, 0, 2 * k, ch); x.fillRect(cw - 2 * k, 0, 2 * k, ch);
      const f = document.fonts && document.fonts.check('8px "Press Start 2P"') ? '"Press Start 2P"' : 'monospace';
      x.textAlign = 'center'; x.textBaseline = 'top';
      const line = (t, y, size, col) => { x.font = `${size * k}px ${f}`; x.fillStyle = '#2a1a0e'; x.fillText(t, cw / 2 + k, y * k + k); x.fillStyle = col; x.fillText(t, cw / 2, y * k); };
      line(`HOLE ${hole.number || TU.courses.holeNumber(hole)}`.trim(), 6, 16, '#ffe9a8');
      line(`PAR ${hole.par}`, 26, 16, '#f4ead2');
      const st = new T.CanvasTexture(cv);
      st.magFilter = st.minFilter = k === 1 ? T.NearestFilter : T.LinearFilter;
      st.generateMipmaps = false;
      const sign = new T.Group(), wood = mat(0x5b3a20);
      for (const px of [-1.8, 1.8]) { const post = new T.Mesh(new T.CylinderGeometry(0.09, 0.11, 2.2, 6), mat(0x4a3020)); post.position.set(px, 1.1, -0.08); sign.add(post); }
      const board = new T.Mesh(new T.BoxGeometry(4.2, 2.1, 0.14), [wood, wood, wood, wood, new T.MeshPhongMaterial({ map: st, shininess: 6 }), wood]);
      board.position.y = 2.2; sign.add(board);
      const roof = new T.Mesh(new T.BoxGeometry(4.5, 0.16, 0.45), mat(0x3e2716)); roof.position.y = 3.48; sign.add(roof);
      const sx = hole.tee.x - 6, sy = hole.tee.y - 7;
      sign.position.set(sx, R3.heightAt(sx, sy), sy);
      sign.rotation.y = 0.45; // turned toward the player standing on the tee
      // the board is solid along its whole width
      for (let o = -2; o <= 2; o += 0.5) R3.colliders.push({ x: sx + Math.cos(0.45) * o, y: sy - Math.sin(0.45) * o, r: 0.3 });
      R3.castShadows(sign);
      world.add(sign);
      R3.sign = sign;
    }
    const stakes = [];
    const tile = (i, j) => (i < 0 || j < 0 || i >= hole.w || j >= hole.h) ? 'O' : hole.tiles[j * hole.w + i];
    for (let j = 0; j < hole.h; j++) for (let i = 0; i < hole.w; i++) {
      if (tile(i, j) === 'O' && (i + j) % 3 === 0 && [tile(i + 1, j), tile(i - 1, j), tile(i, j + 1), tile(i, j - 1)].some(t => t !== 'O')) stakes.push([i * 4 + 2, j * 4 + 2]);
    }
    const st = new T.InstancedMesh(new T.BoxGeometry(0.15, 1.2, 0.15), mat(0xf4f4f4), Math.max(1, stakes.length));
    stakes.forEach(([x, y], k) => { st.setMatrixAt(k, m4.makeTranslation(x, R3.heightAt(x, y) + 0.5, y)); R3.colliders.push({ x, y, r: 0.15 }); });
    st.count = stakes.length;
    world.add(st);

    // flag + cup
    const pin = hole.pin, ph = R3.heightAt(pin.x, pin.y);
    const cup = new T.Mesh(new T.CircleGeometry(0.22, 12), basic(0x111111));
    cup.rotation.x = -Math.PI / 2;
    cup.position.set(pin.x, ph + 0.02, pin.y);
    world.add(cup);
    const pole = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 2.6, 5), mat(0xf2f2f2));
    pole.position.set(pin.x, ph + 1.3, pin.y);
    R3.colliders.push({ x: pin.x, y: pin.y, r: 0.12 });
    pole.castShadow = true;
    world.add(pole);
    const flag = R3.flag = new T.Mesh(new T.PlaneGeometry(1.0, 0.65, 4, 1), mat(0xe74c3c, { side: T.DoubleSide }));
    flag.geometry.translate(0.5, 0, 0);
    flag.position.set(pin.x, ph + 2.25, pin.y);
    flag.castShadow = true;
    world.add(flag);

    // water surfaces: one flat level per pond, built on a 1 yard grid that follows the rounded shoreline
    const wq = [], region = new Int32Array(hole.w * hole.h).fill(-1), levels = [], sizes = [];
    for (let k = 0; k < hole.w * hole.h; k++) {
      if (hole.tiles[k] !== 'W' || region[k] >= 0) continue;
      const id = levels.length, q = [k];
      region[k] = id;
      let sum = 0;
      for (let qi = 0; qi < q.length; qi++) {
        const c = q[qi], i = c % hole.w, j = (c - i) / hole.w;
        sum += R3.heightAt(i * 4 + 2, j * 4 + 2);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = i + di, nj = j + dj, nk = nj * hole.w + ni;
          if (ni >= 0 && nj >= 0 && ni < hole.w && nj < hole.h && hole.tiles[nk] === 'W' && region[nk] < 0) { region[nk] = id; q.push(nk); }
        }
      }
      levels.push(sum / q.length + 0.35);
      sizes.push(q.length);
    }
    R3.waterRegion = region; R3.waterLevels = levels; R3.waterSizes = sizes;
    for (let y = 0; y < hole.h * 4; y++) for (let x = 0; x < hole.w * 4; x++) {
      if (TU.holeRender.typeAt(hole, x + 0.5, y + 0.5) !== 'W') continue;
      // level of the closest pond tile
      let best = -1, bd = 1e9;
      for (let j = Math.floor(y / 4) - 2; j <= Math.floor(y / 4) + 2; j++) for (let i = Math.floor(x / 4) - 2; i <= Math.floor(x / 4) + 2; i++) {
        if (i < 0 || j < 0 || i >= hole.w || j >= hole.h) continue;
        const r = region[j * hole.w + i];
        if (r < 0) continue;
        const d = (i * 4 + 2 - x) ** 2 + (j * 4 + 2 - y) ** 2;
        if (d < bd) { bd = d; best = r; }
      }
      if (best < 0) continue;
      const lvl = levels[best], x0 = x, x1 = x + 1, z0 = y, z1 = y + 1;
      wq.push(x0, lvl, z0, x0, lvl, z1, x1, lvl, z1, x0, lvl, z0, x1, lvl, z1, x1, lvl, z0);
    }
    if (wq.length) {
      const wg = new T.BufferGeometry();
      wg.setAttribute('position', new T.Float32BufferAttribute(wq, 3));
      wg.computeVertexNormals();
      const wm = R3.waterMat || (R3.waterMat = R3.reflect(new T.MeshPhongMaterial({ color: 0x2e6fb8, specular: 0xffffff, shininess: 90, transparent: true, opacity: 0.86 }), 0.55));
      const water = R3.water = new T.Mesh(wg, wm);
      water.receiveShadow = true;
      world.add(water);
    } else R3.water = null;

    // ball
    const ball = R3.ball = new T.Mesh(new T.IcosahedronGeometry(0.11, 1), R3.ballMat || (R3.ballMat = R3.reflect(new T.MeshPhongMaterial({ color: 0xffffff, specular: 0x666666, shininess: 60, flatShading: true }), 0.2)));
    ball.castShadow = true;
    world.add(ball);

    // aim dots, landing ring, putt preview, slope arrows
    R3.dots = new T.InstancedMesh(new T.SphereGeometry(0.12, 4, 3), basic(0xffffff), 120);
    R3.dots.count = 0;
    world.add(R3.dots);
    const ring = R3.ring = new T.Mesh(new T.RingGeometry(4.4, 5, 24), basic(0xffe066, { transparent: true, opacity: 0.85, side: T.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    world.add(ring);
    const arrowShape = new T.Shape();
    arrowShape.moveTo(0, 0.45); arrowShape.lineTo(0.3, 0); arrowShape.lineTo(0.1, 0); arrowShape.lineTo(0.1, -0.4);
    arrowShape.lineTo(-0.1, -0.4); arrowShape.lineTo(-0.1, 0); arrowShape.lineTo(-0.3, 0); arrowShape.lineTo(0, 0.45);
    const ag = new T.ShapeGeometry(arrowShape);
    ag.rotateX(-Math.PI / 2);
    R3.arrows = new T.InstancedMesh(ag, basic(0xffffff, { transparent: true, opacity: 0.9, side: T.DoubleSide }), 400);
    const white = new T.Color(0xffffff);
    for (let i = 0; i < 400; i++) R3.arrows.setColorAt(i, white); // allocate per-instance colors at full size
    R3.arrows.count = 0;
    world.add(R3.arrows);
    R3.arrowPts = [];
    for (let y = 0; y < Hy; y += 2) for (let x = 0; x < Wy; x += 2) {
      if (TU.physics.tileAt(hole, x, y) !== 'G' || R3.arrowPts.length >= 400) continue;
      const s2 = TU.physics.slopeAt(hole, x, y);
      R3.arrowPts.push({ x, y, sx: s2.x, sy: s2.y, mag: Math.hypot(s2.x, s2.y) });
    }

    // skid marks: a ring buffer of dark flat strips
    const sk = R3.skids = new T.InstancedMesh(new T.PlaneGeometry(0.22, 0.5).rotateX(-Math.PI / 2), basic(0x2a2a20, { transparent: true, opacity: 0.45, depthWrite: false }), 400);
    sk.count = 0; sk.userData.next = 0; sk.frustumCulled = false;
    world.add(sk);

    // floating marker above the ball while travelling
    const mk = R3.marker = new T.Mesh(new T.ConeGeometry(0.45, 1.0, 4), basic(0xffe066, { fog: false }));
    mk.rotation.x = Math.PI;
    mk.visible = false;
    world.add(mk);

    if (TU.CourseDetail) TU.CourseDetail.build(hole, world);
    world.traverse(o => { if (o.isInstancedMesh) o.frustumCulled = false; });
    scene.add(world);
  };

  const _m = new T.Matrix4(), _p = new T.Vector3(), _q = new T.Quaternion(), _s = new T.Vector3(), _c = new T.Color();
  const UP = new T.Vector3(0, 1, 0);

  // Hide trees close to a point (so the golfer/camera are never inside a tree).
  R3.clearTrees = function (x, y, r, behind, len = 14) {
    const zero = new T.Matrix4().makeScale(0, 0, 0);
    const touched = new Set();
    for (const t of R3.treeData) {
      let hide = Math.hypot(t.x - x, t.y - y) < r;
      if (!hide && behind) {
        const dx = t.x - x, dy = t.y - y;
        const along = -(dx * behind.x + dy * behind.y), side = Math.abs(dx * behind.y - dy * behind.x);
        hide = along > 0 && along < len && side < 4.5;
      }
      if (hide === t.hidden) continue;
      t.hidden = hide;
      for (const pt of t.parts) { pt.mesh.setMatrixAt(pt.idx, hide ? zero : pt.base); touched.add(pt.mesh); }
    }
    touched.forEach(m => { m.instanceMatrix.needsUpdate = true; });
  };

  // See-through: swap an object's materials for faded copies (and back). Copies are shared per
  // original material, so fading one cart never touches anything else that uses the same paint.
  const fadeCopies = new Map();
  const fadedOf = m => {
    if (!fadeCopies.has(m)) { const f = m.clone(); f.transparent = true; f.opacity = 0.28; f.depthWrite = false; fadeCopies.set(m, f); }
    return fadeCopies.get(m);
  };
  R3.fade = function (obj, on) {
    if (!obj || !!obj.userData.faded === on) return;
    obj.userData.faded = on;
    obj.traverse(o => {
      if (!o.isMesh) return;
      if (on) { o.userData.solidMat = o.material; o.material = Array.isArray(o.material) ? o.material.map(fadedOf) : fadedOf(o.material); o.castShadow = o.castShadow; }
      else if (o.userData.solidMat) { o.material = o.userData.solidMat; o.userData.solidMat = null; }
    });
  };
  // Solid prop overlapping a circle of radius r at (x, y), or null.
  R3.obstacleAt = function (x, y, r) {
    for (const c of R3.colliders || []) if (Math.hypot(c.x - x, c.y - y) < c.r + r) return c;
    return null;
  };
  R3.addSkid = function (x, y, h) {
    const sk = R3.skids, i = sk.userData.next;
    _q.setFromAxisAngle(UP, Math.PI - h);
    sk.setMatrixAt(i, _m.compose(_p.set(x, R3.heightAt(x, y) + 0.04, y), _q, _s.set(1, 1, 1)));
    sk.userData.next = (i + 1) % 400;
    sk.count = Math.max(sk.count, i + 1);
    sk.instanceMatrix.needsUpdate = true;
  };
  R3.setBall = function (x, y, z = 0) {
    const h = R3.heightAt(x, y);
    R3.ball.position.set(x, h + z + 0.11, y);
    R3.ball.scale.setScalar(1); // normal size: a round grows it each frame so it stays visible from far away
  };

  // pts: [{x,y,z?}] in game coords
  R3.setDots = function (pts, color = 0xffffff) {
    const d = R3.dots;
    d.material.color.set(color);
    const n = Math.min(pts.length, 120);
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      _p.set(p.x, R3.heightAt(p.x, p.y) + 0.12 + (p.z || 0), p.y);
      const k = Math.max(1, camera.position.distanceTo(_p) / 14); // stay visible far away and up high
      d.setMatrixAt(i, _m.compose(_p, _q.identity(), _s.set(k, k, k)));
    }
    d.count = n;
    d.instanceMatrix.needsUpdate = true;
  };
  R3.setRing = function (x, y, show) {
    R3.ring.visible = !!show;
    if (show) R3.ring.position.set(x, R3.heightAt(x, y) + 0.1, y);
  };
  R3.showArrows = function (show, time = 0) {
    const a = R3.arrows;
    if (!show) { a.count = 0; return; }
    let n = 0;
    for (const p of R3.arrowPts) {
      if (p.mag < 0.04) continue;
      const ph = (time * 0.6 + TU.util.hash(p.x, p.y, 3)) % 1;
      const x = p.x + p.sx / p.mag * (ph - 0.5) * 0.8, y = p.y + p.sy / p.mag * (ph - 0.5) * 0.8;
      _q.setFromAxisAngle(UP, Math.atan2(p.sx, p.sy) + Math.PI);
      const s = 0.6 + Math.min(1, p.mag * 1.6) * 0.9;
      _s.set(s, 1, s);
      _p.set(x, R3.heightAt(x, y) + 0.1, y);
      a.setMatrixAt(n, _m.compose(_p, _q, _s));
      _c.setHSL(0.15 - Math.min(1, p.mag * 1.5) * 0.15, 1, 0.6);
      a.setColorAt(n, _c);
      n++;
    }
    a.count = n;
    a.instanceMatrix.needsUpdate = true;
    if (a.instanceColor) a.instanceColor.needsUpdate = true;
  };

  R3.setMarker = function (x, y, show, time) {
    R3.marker.visible = !!show;
    if (!show) return;
    R3.marker.position.set(x, R3.heightAt(x, y) + 2.6 + Math.sin(time * 3) * 0.3, y);
    R3.marker.rotation.y = time * 2;
    const dist = camera.position.distanceTo(R3.marker.position);
    R3.marker.scale.setScalar(Math.max(1, dist / 25));
  };
  // flat water surface height of the pond at (x, y), or null when not over a pond
  // tiles in the pond at (x, y) (0 when it isn't water)
  R3.waterSizeAt = function (x, y) {
    const hole = R3.hole, reg = R3.waterRegion;
    if (!hole || !reg) return 0;
    const i = Math.floor(x / 4), j = Math.floor(y / 4);
    if (i < 0 || j < 0 || i >= hole.w || j >= hole.h) return 0;
    const rg = reg[j * hole.w + i];
    return rg >= 0 ? R3.waterSizes[rg] : 0;
  };
  R3.waterLevelAt = function (x, y) {
    const hole = R3.hole, reg = R3.waterRegion;
    if (!hole || !reg) return null;
    const i = Math.floor(x / 4), j = Math.floor(y / 4);
    for (const [di, dj] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= hole.w || nj >= hole.h) continue;
      const r = reg[nj * hole.w + ni];
      if (r >= 0) return R3.waterLevels[r];
    }
    return null;
  };
  R3.update = function (time) {
    if (TU.CourseDetail) TU.CourseDetail.update(time);
    if (TU.Countryside) TU.Countryside.update(time);
    if (R3.themeAnim) R3.themeAnim(time);
    if (R3.backdropAnim) R3.backdropAnim(time);
    backdrop.userData.clouds.rotation.y = time * 0.004;
    for (const b of backdrop.userData.birds) {
      if (b.flock) {
        const u = b.flock.userData, a = u.a + time * u.sp;
        // pixelated mode renders at a quarter of the resolution: blow the flocks up so each bird is a clear shape
        b.flock.scale.setScalar((R3.style === 'pixel' ? 2.5 : 1) * (b.flock.userData.sc || 1.2));
        b.flock.position.set(Math.cos(a) * u.rad, u.h + Math.sin(time * 0.3 + u.a) * 6, Math.sin(a) * u.rad);
        b.flock.rotation.y = -a + (u.sp > 0 ? Math.PI : 0);
      } else { const f = Math.sin(time * (b.flap || 9) + b.ph) * 0.7; b.lw.rotation.z = f; b.rw.rotation.z = -f; }
    }
    for (const g of backdrop.userData.balloons) {
      const u = g.userData, a = u.a + time * 0.0025;
      g.position.set(Math.cos(a) * u.d, u.h + Math.sin(time * 0.15 + u.ph) * 8, Math.sin(a) * u.d);
    }
    if (R3.flag) {
      const pos = R3.flag.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        pos.setZ(i, Math.sin(time * 5 + x * 4) * 0.08 * x);
      }
      pos.needsUpdate = true;
    }
  };

  // Camera helper: game coords for eye and target, h = height above terrain.
  R3.look = function (ex, ey, eh, tx, ty, th) {
    camera.position.set(ex, Math.max(R3.heightAt(ex, ey) + 0.5, R3.heightAt(ex, ey) + eh), ey);
    camera.lookAt(tx, R3.heightAt(tx, ty) + th, ty);
  };
})();
