// The land beyond the course boundary: patchwork farm fields with crop rows, hedges and fences,
// hay bales, grazing sheep and cows, a couple of lakes with reeds, a winding dirt road, bushes and
// rocks. It's all outside the playable map, so it's scenery only (the boundary stops you first).
(function () {
  const T = THREE, R3 = TU.R3, mat = R3.mat;

  // crop textures: rows of plants on soil
  const CROPS = {
    wheat: ['#c9a646', '#e2c46a', '#b08a34'],
    plowed: ['#94683e', '#a8784a', '#7a5432'],
    lavender: ['#5c7a3e', '#9b7ad0', '#7d5cb8'],
    sprouts: ['#94683e', '#86c850', '#66a83e'],
    sunflower: ['#4f7a30', '#f1c40f', '#7a4a1e'],
    pasture: ['#6fae52', '#7fbe5e', '#5f9a46'],
  };
  const texCache = {};
  const pixel = () => R3.style !== 'smooth';
  // flat-shaded like the rest of the pixel world (smooth Lambert looked out of place)
  const flatTex = map => new T.MeshPhongMaterial({ map, flatShading: true, shininess: 4, specular: 0x000000 });
  function cropTex(kind) {
    const key = kind + (pixel() ? 'px' : 'hd');
    if (texCache[key]) return texCache[key];
    // pixel style: a small texture with big blocky rows (about 2 texels per yard, like the course)
    const P = pixel(), S = P ? 16 : 64, row = P ? 4 : 8;
    const [base, a, b] = CROPS[kind], cv = TU.sprites.makeCanvas(S, S), x = cv.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, S, S);
    if (kind === 'pasture') {
      for (let k = 0; k < (P ? 24 : 140); k++) { x.fillStyle = k % 2 ? a : b; x.fillRect((k * 37) % S, (k * 53) % S, P ? 1 : 2, P ? 1 : 2); }
    } else {
      for (let rr = 0; rr < S; rr += row) {
        x.fillStyle = a; x.fillRect(0, rr + (P ? 1 : 1), S, P ? 2 : 4);
        x.fillStyle = b; for (let i = 0; i < S; i += P ? 3 : 4) x.fillRect(i + (rr % (row * 2) ? 1 : 0), rr + (P ? 1 : 2), 1 + (P ? 0 : 1), P ? 1 : 2);
      }
    }
    const t = new T.CanvasTexture(cv);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = T.NearestFilter;
    return (texCache[key] = t);
  }
  function grassTex() {
    const key = 'grass' + (pixel() ? 'px' : 'hd');
    if (texCache[key]) return texCache[key];
    const S = pixel() ? 48 : 128, f = 128 / S; // ~1.6 texels per yard in pixel style
    const cv = TU.sprites.makeCanvas(S, S), x = cv.getContext('2d'), U = TU.util;
    const img = x.createImageData(S, S), d = img.data;
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const n = U.noise(px * f * 0.05, py * f * 0.05, 31), m = U.noise(px * f * 0.2, py * f * 0.2, 32), h = U.hash(px, py, 33);
      const k = (py * S + px) * 4;
      d[k] = 54 + n * 22 + m * 10 + h * 6; d[k + 1] = 108 + n * 26 + m * 12 + h * 8; d[k + 2] = 48 + n * 10; d[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const t = new T.CanvasTexture(cv);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = T.NearestFilter;
    return (texCache[key] = t);
  }

  // desert sand for the land outside a desert course
  function sandTex() {
    const key = 'sand' + (pixel() ? 'px' : 'hd');
    if (texCache[key]) return texCache[key];
    const S = pixel() ? 48 : 128, f = 128 / S, cv = TU.sprites.makeCanvas(S, S), x = cv.getContext('2d'), U = TU.util;
    const img = x.createImageData(S, S), d = img.data;
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const n = U.noise(px * f * 0.05, py * f * 0.05, 41), m = U.noise(px * f * 0.25, py * f * 0.25, 42), h = U.hash(px, py, 43), k = (py * S + px) * 4;
      d[k] = 206 + n * 24 + m * 10 + h * 6; d[k + 1] = 164 + n * 20 + m * 8 + h * 5; d[k + 2] = 112 + n * 12; d[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = T.NearestFilter;
    return (texCache[key] = t);
  }
  TU.Countryside = {
    grassTex, flatTex, sandTex,
    // r: the scenery rng; returns keep-out zones so trees don't grow in fields, lakes or on the road
    build(hole, world, r, keepOut = []) {
      const Wy = hole.w * 4, Hy = hole.h * 4, cx = Wy / 2, cz = Hy / 2;
      const zones = [], animals = [];
      const blockers = keepOut; // the surrounding hills
      const inMap = (x, z, m = 14) => x > -m && x < Wy + m && z > -m && z < Hy + m;
      const free = (x, z, rad) => !inMap(x, z, 14 + rad) && zones.every(q => Math.hypot(q.x - x, q.z - z) > q.r + rad) && blockers.every(q => Math.hypot(q.x - x, q.z - z) > q.r + rad);
      // a spot in the ring just outside the course
      const ringSpot = (d0, d1) => {
        const a = r() * Math.PI * 2, d = d0 + r() * (d1 - d0);
        return { x: cx + Math.cos(a) * (Wy / 2 + d), z: cz + Math.sin(a) * (Hy / 2 + d) };
      };

      // ---- lakes ----
      const waterM = R3.waterMat || (R3.waterMat = R3.reflect(new T.MeshPhongMaterial({ color: 0x2e6fb8, specular: 0xffffff, shininess: 90, transparent: true, opacity: 0.86 }), 0.55));
      for (let k = 0, tries = 0; k < 2 && tries < 30; tries++) {
        const p = ringSpot(45, 150), rad = 22 + r() * 18;
        if (!free(p.x, p.z, rad + 6)) continue;
        const sh = new T.Shape();
        for (let i = 0; i <= 18; i++) { const a = i / 18 * Math.PI * 2, rr = rad * (0.75 + 0.35 * Math.sin(a * 3 + k) * 0.6 + r() * 0.15); i ? sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        const shore = new T.Mesh(new T.ShapeGeometry(sh), mat(0xc8b48a)); shore.rotation.x = -Math.PI / 2; shore.scale.setScalar(1.08); shore.position.set(p.x, 0.05, p.z); world.add(shore);
        const lake = new T.Mesh(new T.ShapeGeometry(sh), waterM); lake.rotation.x = -Math.PI / 2; lake.position.set(p.x, 0.1, p.z); world.add(lake);
        // reeds round the edge
        for (let i = 0; i < 26; i++) {
          const a = r() * Math.PI * 2, rr = rad * (0.85 + r() * 0.2);
          const reed = new T.Mesh(new T.CylinderGeometry(0.05, 0.08, 2 + r(), 4), mat(0x5d8a32)); reed.position.set(p.x + Math.cos(a) * rr, 1, p.z + Math.sin(a) * rr); world.add(reed);
        }
        zones.push({ x: p.x, z: p.z, r: rad + 4 }); k++;
      }

      // ---- patchwork fields with hedges, fences, hay and animals ----
      const kinds = ['wheat', 'plowed', 'lavender', 'sprouts', 'sunflower', 'pasture', 'pasture', 'wheat'];
      const fenceM = mat(0x8a6a44), hedgeM = mat(0x2f6a2c), hayM = mat(0xd9b860), hayEnd = mat(0xc9a446);
      for (let k = 0, tries = 0; k < 14 && tries < 120; tries++) {
        const p = ringSpot(20, 190), w = 26 + r() * 30, d = 20 + r() * 26, rot = r() * Math.PI, rad = Math.hypot(w, d) / 2;
        if (!free(p.x, p.z, rad)) continue;
        const kind = kinds[k % kinds.length], g = new T.Group();
        g.position.set(p.x, 0, p.z); g.rotation.y = rot; world.add(g);
        const tx = cropTex(kind).clone(); tx.needsUpdate = true; tx.repeat.set(w / 10, d / 10);
        const field = new T.Mesh(new T.PlaneGeometry(w, d), flatTex(tx)); field.rotation.x = -Math.PI / 2; field.position.y = 0.06; field.receiveShadow = true; g.add(field);
        // the edge: a hedge on some fields, a post-and-rail fence on others
        if (k % 3 === 0) {
          for (const [hx, hz, hw, hd] of [[0, -d / 2, w, 1.2], [0, d / 2, w, 1.2], [-w / 2, 0, 1.2, d], [w / 2, 0, 1.2, d]]) {
            const hedge = new T.Mesh(new T.BoxGeometry(hw, 1.4, hd), hedgeM); hedge.position.set(hx, 0.7, hz); hedge.castShadow = true; g.add(hedge);
          }
        } else {
          const posts = [];
          for (let s = -w / 2; s <= w / 2; s += 3) posts.push([s, -d / 2], [s, d / 2]);
          for (let s = -d / 2 + 3; s < d / 2; s += 3) posts.push([-w / 2, s], [w / 2, s]);
          const pm = new T.InstancedMesh(new T.BoxGeometry(0.15, 1.2, 0.15), fenceM, posts.length);
          const m4 = new T.Matrix4();
          posts.forEach(([x, z], i) => pm.setMatrixAt(i, m4.makeTranslation(x, 0.6, z)));
          g.add(pm);
          for (const [rx, rz, rw, rd] of [[0, -d / 2, w, 0.08], [0, d / 2, w, 0.08], [-w / 2, 0, 0.08, d], [w / 2, 0, 0.08, d]]) for (const y of [0.55, 1.0]) {
            const rail = new T.Mesh(new T.BoxGeometry(rw, 0.08, rd), fenceM); rail.position.set(rx, y, rz); g.add(rail);
          }
        }
        if (kind === 'wheat') for (let i = 0; i < 5; i++) {
          // round hay bales lying in the stubble
          const bale = new T.Group(), body = new T.Mesh(new T.CylinderGeometry(0.9, 0.9, 1.4, 12), hayM); body.rotation.z = Math.PI / 2; bale.add(body);
          for (const sx of [-0.71, 0.71]) { const e = new T.Mesh(new T.CircleGeometry(0.88, 12), hayEnd); e.rotation.y = sx * Math.PI / 2; e.position.x = sx; bale.add(e); }
          bale.position.set((r() - 0.5) * (w - 6), 0.9, (r() - 0.5) * (d - 6)); bale.rotation.y = r() * 3; R3.castShadows(bale); g.add(bale);
        }
        if (kind === 'pasture') {
          const cows = r() < 0.5;
          for (let i = 0, n = 4 + Math.floor(r() * 4); i < n; i++) {
            const a = cows ? this.cow() : this.sheep();
            a.root.position.set((r() - 0.5) * (w - 6), 0, (r() - 0.5) * (d - 6)); a.root.rotation.y = r() * 6.28;
            g.add(a.root);
            animals.push({ ...a, w: w / 2 - 3, d: d / 2 - 3, ph: r() * 10, sp: cows ? 0.5 : 0.8, turnT: r() * 5 });
          }
        }
        zones.push({ x: p.x, z: p.z, r: rad + 2 }); k++;
      }

      // ---- a winding dirt road looping round the course ----
      const pts = [];
      for (let i = 0; i <= 64; i++) {
        // a rounded rectangle (superellipse) so the road never cuts across the corners of the course
        const a = i / 64 * Math.PI * 2, wob = Math.sin(a * 5) * 8, c = Math.cos(a), s2 = Math.sin(a), e = 0.25;
        pts.push(new T.Vector3(cx + Math.sign(c) * Math.pow(Math.abs(c), e) * (Wy / 2 + 34 + wob), 0.08, cz + Math.sign(s2) * Math.pow(Math.abs(s2), e) * (Hy / 2 + 34 + wob)));
      }
      const roadPos = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l * 2.5, nz = dx / l * 2.5;
        roadPos.push(a.x + nx, 0.08, a.z + nz, a.x - nx, 0.08, a.z - nz, b.x + nx, 0.08, b.z + nz, a.x - nx, 0.08, a.z - nz, b.x - nx, 0.08, b.z - nz, b.x + nx, 0.08, b.z + nz);
      }
      const rg = new T.BufferGeometry(); rg.setAttribute('position', new T.Float32BufferAttribute(roadPos, 3)); rg.computeVertexNormals();
      const road = new T.Mesh(rg, mat(0xb8a074, { side: T.DoubleSide })); road.receiveShadow = true; world.add(road);
      for (let i = 0; i < pts.length - 1; i++) for (let t = 0; t < 1; t += 0.25) zones.push({ x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, z: pts[i].z + (pts[i + 1].z - pts[i].z) * t, r: 4 });

      // ---- bushes and rocks scattered on the open grass ----
      const bushes = [], rocks = [];
      for (let i = 0; i < 400 && (bushes.length < 120 || rocks.length < 50); i++) {
        const p = ringSpot(10, 230);
        if (!free(p.x, p.z, 1.5)) continue;
        (r() < 0.7 ? bushes : rocks).push({ ...p, s: 0.8 + r() * 1.4, a: r() * 6.28 });
      }
      const m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), pv = new T.Vector3(), Y = new T.Vector3(0, 1, 0);
      const bm = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), mat(0x3f7f34), Math.max(1, bushes.length));
      bushes.forEach((b, i) => { q.setFromAxisAngle(Y, b.a); sc.set(b.s * 1.3, b.s, b.s * 1.2); bm.setMatrixAt(i, m4.compose(pv.set(b.x, b.s * 0.6, b.z), q, sc)); });
      bm.count = bushes.length; bm.castShadow = true;
      const rm = new T.InstancedMesh(new T.DodecahedronGeometry(1, 0), mat(0x8c8a80), Math.max(1, rocks.length));
      rocks.forEach((b, i) => { q.setFromAxisAngle(Y, b.a); sc.set(b.s, b.s * 0.6, b.s * 0.9); rm.setMatrixAt(i, m4.compose(pv.set(b.x, b.s * 0.25, b.z), q, sc)); });
      rm.count = rocks.length;
      [bm, rm].forEach(o => { o.frustumCulled = false; world.add(o); });

      R3.countryside = { animals, t0: 0 };
      return zones;
    },
    sheep() {
      const root = new T.Group(), wool = mat(0xf2f0ea), dark = mat(0x2b2b2b);
      const body = new T.Mesh(new T.IcosahedronGeometry(0.75, 1), wool); body.scale.set(0.9, 0.8, 1.25); body.position.y = 0.95; root.add(body);
      const head = new T.Mesh(new T.BoxGeometry(0.35, 0.4, 0.5), dark); head.position.set(0, 1.1, 0.95); root.add(head);
      const legs = [];
      for (const [x, z] of [[0.3, 0.5], [-0.3, 0.5], [0.3, -0.5], [-0.3, -0.5]]) { const l = new T.Mesh(new T.BoxGeometry(0.12, 0.6, 0.12), dark); l.position.set(x, 0.3, z); root.add(l); legs.push(l); }
      R3.castShadows(root);
      return { root, head, legs };
    },
    cow() {
      const root = new T.Group(), white = mat(0xf4f4f0), black = mat(0x1d1d1d), pink = mat(0xe8a0a0);
      const body = new T.Mesh(new T.BoxGeometry(1.1, 1.0, 2.2), white); body.position.y = 1.3; root.add(body);
      for (const [x, y, z, w2, h2, d2] of [[0.56, 1.4, 0.3, 0.02, 0.5, 0.6], [-0.56, 1.2, -0.5, 0.02, 0.6, 0.7], [0, 1.81, -0.3, 0.6, 0.02, 0.6]]) { const sp = new T.Mesh(new T.BoxGeometry(w2, h2, d2), black); sp.position.set(x, y, z); root.add(sp); }
      const head = new T.Group(); head.position.set(0, 1.55, 1.25); root.add(head);
      head.add(new T.Mesh(new T.BoxGeometry(0.6, 0.6, 0.7), white));
      const nose = new T.Mesh(new T.BoxGeometry(0.5, 0.3, 0.2), pink); nose.position.set(0, -0.15, 0.4); head.add(nose);
      for (const sx of [-0.35, 0.35]) { const horn = new T.Mesh(new T.ConeGeometry(0.06, 0.25, 4), mat(0xe9e2cf)); horn.position.set(sx, 0.38, -0.1); head.add(horn); }
      const legs = [];
      for (const [x, z] of [[0.4, 0.8], [-0.4, 0.8], [0.4, -0.8], [-0.4, -0.8]]) { const l = new T.Mesh(new T.BoxGeometry(0.2, 0.8, 0.2), white); l.position.set(x, 0.4, z); root.add(l); legs.push(l); }
      R3.castShadows(root);
      return { root, head, legs };
    },
    // animals graze: head bobs down to the grass, then they amble a few steps and turn
    update(time) {
      const C = R3.countryside;
      if (!C) return;
      const dt = Math.min(0.1, time - (C.t0 || time)); C.t0 = time;
      for (const a of C.animals) {
        const graze = Math.sin(time * 0.6 + a.ph) > 0.2;
        a.head.rotation.x = graze ? 0.7 : 0;
        a.turnT -= dt;
        if (!graze) {
          const f = a.root.rotation.y, nx = a.root.position.x + Math.sin(f) * a.sp * dt, nz = a.root.position.z + Math.cos(f) * a.sp * dt;
          if (Math.abs(nx) < a.w && Math.abs(nz) < a.d) { a.root.position.x = nx; a.root.position.z = nz; } else a.root.rotation.y += Math.PI * 0.6;
          a.legs.forEach((l, i) => { l.rotation.x = Math.sin(time * 6 + i * Math.PI / 2) * 0.35; });
        }
        if (a.turnT < 0) { a.turnT = 4 + Math.random() * 6; a.root.rotation.y += (Math.random() - 0.5) * 1.6; }
      }
    },
  };
})();
