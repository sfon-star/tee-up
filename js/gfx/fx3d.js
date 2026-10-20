// Light effects: the ball's flight trail and pooled particles (divots, sand, splashes, leaves, confetti).
(function () {
  const T = THREE, R3 = TU.R3, MAXP = 500, MAXT = 90;
  const FX = TU.FX = {};

  // particles: one Points object, each particle has velocity, gravity and a lifetime
  const pGeo = new T.BufferGeometry();
  const pPos = new Float32Array(MAXP * 3), pCol = new Float32Array(MAXP * 3);
  pGeo.setAttribute('position', new T.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new T.BufferAttribute(pCol, 3));
  const points = new T.Points(pGeo, new T.PointsMaterial({ size: 0.22, vertexColors: true, transparent: true, depthWrite: false }));
  points.frustumCulled = false;
  R3.scene.add(points);
  const parts = Array.from({ length: MAXP }, () => ({ life: 0 }));
  let pNext = 0;

  // trail: a line through the last positions of the ball, fading toward the tail
  const tGeo = new T.BufferGeometry();
  const tPos = new Float32Array(MAXT * 3), tCol = new Float32Array(MAXT * 3);
  tGeo.setAttribute('position', new T.BufferAttribute(tPos, 3));
  tGeo.setAttribute('color', new T.BufferAttribute(tCol, 3));
  const trail = new T.Line(tGeo, new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }));
  trail.frustumCulled = false;
  R3.scene.add(trail);
  let tPts = [], tFade = 1;

  FX.reset = function () {
    parts.forEach(p => { p.life = 0; });
    tPts = []; tFade = 1;
    FX.update(0);
  };
  // n particles at game coords (x, y) and absolute height h
  FX.burst = function (x, y, h, o = {}) {
    const n = o.n || 12, col = new T.Color(o.color || 0x6fbf4a), cols = o.colors && o.colors.map(c => new T.Color(c));
    for (let i = 0; i < n; i++) {
      const p = parts[pNext]; pNext = (pNext + 1) % MAXP;
      const a = Math.random() * Math.PI * 2, s = (o.spread || 2) * (0.4 + Math.random() * 0.6);
      p.x = x; p.y = h + 0.05; p.z = y;
      p.vx = Math.sin(a) * s + (o.dx || 0); p.vz = Math.cos(a) * s + (o.dy || 0);
      p.vy = (o.up || 3) * (0.5 + Math.random() * 0.7);
      p.g = o.gravity != null ? o.gravity : 12;
      p.drag = o.drag || 0;
      p.life = p.max = (o.life || 0.8) * (0.7 + Math.random() * 0.6);
      p.c = cols ? cols[i % cols.length] : col;
    }
  };
  FX.trailPush = function (pos) { tFade = 1; tPts.push(pos.clone()); if (tPts.length > MAXT) tPts.shift(); };
  FX.trailClear = function () { tPts = []; };
  FX.trailFade = function () { tFade = Math.min(tFade, 0.999); };

  FX.update = function (dt) {
    for (let i = 0; i < MAXP; i++) {
      const p = parts[i];
      if (p.life > 0) {
        p.life -= dt;
        p.vy -= p.g * dt;
        if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vz *= k; p.vy = Math.max(p.vy, -1.2); }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      }
      const alive = p.life > 0, f = alive ? Math.min(1, p.life / p.max * 2) : 0;
      pPos[i * 3] = alive ? p.x : 0; pPos[i * 3 + 1] = alive ? p.y : -999; pPos[i * 3 + 2] = alive ? p.z : 0;
      if (alive) { pCol[i * 3] = p.c.r * f + (1 - f) * 0.2; pCol[i * 3 + 1] = p.c.g * f + (1 - f) * 0.2; pCol[i * 3 + 2] = p.c.b * f + (1 - f) * 0.2; }
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
    points.material.size = R3.style === 'pixel' ? 0.3 : 0.18;

    // the trail fades out after the ball lands
    if (tFade < 1) { tFade -= dt * 0.8; if (tFade <= 0) { tPts = []; tFade = 1; } }
    const n = tPts.length;
    for (let i = 0; i < MAXT; i++) {
      const q = tPts[Math.min(i, n - 1)], k = n ? i / Math.max(1, n - 1) : 0;
      tPos[i * 3] = q ? q.x : 0; tPos[i * 3 + 1] = q ? q.y : -999; tPos[i * 3 + 2] = q ? q.z : 0;
      tCol[i * 3] = tCol[i * 3 + 1] = 0.55 + 0.45 * k; tCol[i * 3 + 2] = 0.6 + 0.4 * k;
    }
    trail.material.opacity = 0.8 * Math.max(0, tFade);
    tGeo.setDrawRange(0, Math.max(0, n));
    tGeo.attributes.position.needsUpdate = true;
    tGeo.attributes.color.needsUpdate = true;
    trail.visible = n > 1;
  };

  // terrain colors for divots and landings
  FX.TILE = { E: 0x5fbf4a, F: 0x6fcf55, R: 0x3f8f35, S: 0xe8d39a, G: 0x7fdf60, T: 0x4a7a30, P: 0xb8b0a0 };
  FX.CONFETTI = [0xffe066, 0xff5a5a, 0x3d8bff, 0x5fd38a, 0xff9f43, 0xc56cf0, 0xffffff];
})();
