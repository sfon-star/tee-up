// Course settings: each one has its own trees, surroundings, backdrop, sky and birds.
//   city     - a muni course hemmed in by streets and buildings, dark and tall pines
//   country  - green rolling hills and farmland, broadleaf trees and silver birches
//   coastal  - on the sea with all kinds of islands (atolls, jungle, volcanoes), palms, seagulls and boats
//   mountain - big snowy peaks and valleys (the original look)
//   desert   - red mesas, dunes, saguaro cacti and circling vultures
(function () {
  const T = THREE, R3 = TU.R3, mat = R3.mat, U = TU.util;
  const DEFAULT_SKY = ['#4f93db', '#9fd0ef', '#d6eef7'];
  const THEMES = {
    city: { label: 'CITY', sky: ['#5d8fc9', '#a9c6de', '#dde2e6'], birds: { color: 0x7a7d86, scale: 1, flocks: 3, flap: 11 }, species: ['darkpine', 'tallpine', 'darkpine'] },
    country: { label: 'COUNTRY', sky: DEFAULT_SKY, birds: { color: 0x2b2f38, scale: 1.2, flocks: 4, flap: 9 }, species: ['round', 'birch', 'round'], balloons: true },
    coastal: { label: 'COASTAL', sky: ['#2f86e0', '#8fd3f5', '#e8f8ff'], birds: { color: 0xf4f4f0, tip: 0x8a929b, scale: 1.4, flocks: 4, flap: 4 }, species: ['palm', 'jungle', 'palm'] },
    mountain: { label: 'MOUNTAIN', sky: DEFAULT_SKY, birds: { color: 0x2b2f38, scale: 1.2, flocks: 4, flap: 9 }, species: ['round', 'round', 'pine'], balloons: true },
    desert: { label: 'DESERT', sky: ['#3f7fcc', '#bcd6ea', '#f3d9b0'], birds: { color: 0x2a1f18, scale: 2.2, flocks: 3, flap: 2.5, circle: true }, species: ['saguaro', 'scrub', 'scrub'] },
  };

  // ---------- geometry helpers ----------
  // merge several geometries (each placed with a matrix) into one non-indexed geometry
  function merge(items) {
    const pos = [];
    for (const { geo, m } of items) {
      const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m);
      pos.push(...g.attributes.position.array);
    }
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    out.computeVertexNormals();
    return out;
  }
  const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(sx, sy, sz));

  const geoCache = {};
  const G = (key, make) => geoCache[key] || (geoCache[key] = make());
  const GREENS = [0x2f7a34, 0x3d8f36, 0x1f6040];

  // each species is a list of parts; a part is one instanced mesh (geometry + color + height offset)
  function species(name) {
    switch (name) {
      case 'round': return [
        { geo: G('trunk', () => new T.CylinderGeometry(0.22, 0.32, 2.6, 5)), color: 0x5b3a24, y: 1.2 },
        { geo: G('ico', () => new T.IcosahedronGeometry(2.3, 0)), palette: GREENS, y: 4.0 }];
      case 'pine': return [
        { geo: G('trunk', () => new T.CylinderGeometry(0.22, 0.32, 2.6, 5)), color: 0x5b3a24, y: 1.2 },
        { geo: G('cone', () => new T.ConeGeometry(2.0, 5.2, 6)), palette: [0x1f6040, 0x2a6d3e, 0x1a5636], y: 4.6 }];
      case 'darkpine': return [
        { geo: G('trunk', () => new T.CylinderGeometry(0.22, 0.32, 2.6, 5)), color: 0x3d2818, y: 1.2 },
        { geo: G('dpine', () => merge([{ geo: new T.ConeGeometry(2.4, 4.2, 7), m: M(0, 0, 0) }, { geo: new T.ConeGeometry(1.8, 3.6, 7), m: M(0, 2.1, 0) }, { geo: new T.ConeGeometry(1.1, 2.6, 7), m: M(0, 3.8, 0) }])), palette: [0x173d26, 0x1d4a2c, 0x123020], y: 3.6 }];
      case 'tallpine': return [
        { geo: G('ttrunk', () => new T.CylinderGeometry(0.16, 0.26, 6, 5)), color: 0x4a3020, y: 3 },
        { geo: G('tcone', () => merge([{ geo: new T.ConeGeometry(1.5, 5, 7), m: M(0, 0, 0) }, { geo: new T.ConeGeometry(1.1, 4, 7), m: M(0, 2.6, 0) }])), palette: [0x163a24, 0x1b4630, 0x204f36], y: 7.6 }];
      case 'birch': return [
        { geo: G('btrunk', () => new T.CylinderGeometry(0.15, 0.22, 4.4, 6)), color: 0xe8e6dc, y: 2.2 },
        { geo: G('bmark', () => merge([0.6, 1.4, 2.3, 3.1].map((y, k) => ({ geo: new T.BoxGeometry(0.34, 0.08, 0.34), m: M(0, y - 2.2, 0, 0, k, 0) })))), color: 0x2b2b2b, y: 2.2 },
        { geo: G('bcan', () => new T.IcosahedronGeometry(1.9, 0)), palette: [0x8fc85a, 0xa4d36a, 0x7fb84a], y: 5.2, sy: 1.35 }];
      case 'palm': return [
        { geo: G('ptrunk', () => new T.TubeGeometry(new T.QuadraticBezierCurve3(new T.Vector3(0, 0, 0), new T.Vector3(0.2, 3.5, 0), new T.Vector3(1.4, 6.4, 0)), 8, 0.22, 6)), color: 0x9a7a52, y: 0 },
        { geo: G('fronds', () => merge(Array.from({ length: 8 }, (_, k) => ({ geo: new T.ConeGeometry(0.45, 3.4, 4), m: M(1.4 + Math.cos(k / 8 * 6.28) * 1.4, 6.0, Math.sin(k / 8 * 6.28) * 1.4, 0, -k / 8 * 6.28, Math.PI / 2 + 0.55, 1, 1, 0.25) })))), palette: [0x3f9a3a, 0x4fae42, 0x2f8a34], y: 0 },
        { geo: G('nuts', () => merge([[0.2, 0], [-0.2, 0.15], [0, -0.2]].map(([a, b]) => ({ geo: new T.SphereGeometry(0.2, 5, 4), m: M(1.4 + a, 6.15, b) })))), color: 0x6b4a26, y: 0 }];
      case 'jungle': return [
        { geo: G('jleaves', () => merge(Array.from({ length: 7 }, (_, k) => ({ geo: new T.SphereGeometry(1, 6, 4), m: M(Math.cos(k * 0.9) * 0.9, 0.9 + (k % 3) * 0.25, Math.sin(k * 0.9) * 0.9, 0.5 * Math.sin(k), k * 0.9, 0.7, 0.45, 0.12, 1.4) })))), palette: [0x1f7a3a, 0x2c8f44, 0x176a32], y: 0 }];
      case 'saguaro': return [
        { geo: G('sag', () => merge([
          { geo: new T.CylinderGeometry(0.42, 0.48, 6, 8), m: M(0, 3, 0) }, { geo: new T.SphereGeometry(0.42, 8, 4, 0, 6.29, 0, Math.PI / 2), m: M(0, 6, 0) },
          { geo: new T.CylinderGeometry(0.28, 0.28, 1.2, 7), m: M(0.7, 2.4, 0, 0, 0, Math.PI / 2) }, { geo: new T.CylinderGeometry(0.28, 0.3, 2, 7), m: M(1.25, 3.4, 0) },
          { geo: new T.CylinderGeometry(0.26, 0.26, 1, 7), m: M(-0.6, 3.2, 0, 0, 0, Math.PI / 2) }, { geo: new T.CylinderGeometry(0.26, 0.28, 1.6, 7), m: M(-1.05, 3.9, 0) }])), palette: [0x4f7a3a, 0x5a8a42, 0x466e34], y: 0 }];
      case 'scrub': return [
        { geo: G('scrub', () => merge([0, 1, 2].map(k => ({ geo: new T.IcosahedronGeometry(1, 0), m: M((k - 1) * 0.8, 0.6, (k % 2) * 0.5, 0, k, 0, 1, 0.7, 1) })))), palette: [0x8a8a4a, 0x9a8a50, 0x7a7a40], y: 0 }];
    }
    return species('round');
  }

  // Plant trees at spots ({ x, z, y = ground height, s = scale, v = 0..2 variant, rot }).
  // track: collect what clearTrees needs to hide individual trees (course trees only).
  function plant(world, spots, theme, track) {
    const names = THEMES[theme].species, groups = {};
    spots.forEach((sp, i) => { const nm = names[sp.v % names.length]; (groups[nm] = groups[nm] || []).push(i); });
    const m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), p = new T.Vector3(), Y = new T.Vector3(0, 1, 0), col = new T.Color();
    const out = track ? spots.map(sp => ({ x: sp.x, y: sp.z, parts: [], hidden: false })) : null;
    for (const [nm, idxs] of Object.entries(groups)) {
      for (const part of species(nm)) {
        const mesh = new T.InstancedMesh(part.geo, part.palette ? mat(0xffffff) : mat(part.color), idxs.length);
        idxs.forEach((si, k) => {
          const sp = spots[si];
          q.setFromAxisAngle(Y, sp.rot);
          sc.set(sp.s * (part.sx || 1), sp.s * (part.sy || 1), sp.s * (part.sz || 1));
          p.set(sp.x, sp.y + part.y * sp.s, sp.z);
          mesh.setMatrixAt(k, m4.compose(p, q, sc));
          if (part.palette) { col.setHex(part.palette[(si * 7 + k) % part.palette.length]).multiplyScalar(0.85 + U.hash(si, k, 9) * 0.3); mesh.setColorAt(k, col); }
          if (out) out[si].parts.push({ mesh, idx: k, base: m4.clone() });
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.castShadow = true; mesh.frustumCulled = false;
        world.add(mesh);
      }
    }
    return out;
  }

  // ---------- city ----------
  const winTexCache = {};
  function windowTex(style) {
    if (winTexCache[style]) return winTexCache[style];
    const cv = TU.sprites.makeCanvas(16, 16), x = cv.getContext('2d');
    const [wall, glass, lit] = [['#b8b2a6', '#4a6278', '#f2e2a0'], ['#8e98a4', '#2d4a66', '#cfe6ff'], ['#c9a882', '#3a4d5e', '#ffe8a8'], ['#6f7a86', '#86b6dc', '#dff2ff']][style];
    x.fillStyle = wall; x.fillRect(0, 0, 16, 16);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { x.fillStyle = U.hash(i, j, style) > 0.75 ? lit : glass; x.fillRect(2 + i * 8, 3 + j * 8, 5, 5); }
    const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = T.NearestFilter; R3.pxTex(t);
    return (winTexCache[style] = t);
  }
  // a building whose window grid keeps a constant size however big it is
  function building(w, h, d, style) {
    const g = new T.BoxGeometry(w, h, d), uv = g.attributes.uv, n = g.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
      const sx = ny > 0.5 ? 0 : nx > 0.5 ? d / 4 : w / 4, sy = ny > 0.5 ? 0 : h / 4;
      uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
    }
    const side = new T.MeshPhongMaterial({ map: windowTex(style), flatShading: true, shininess: 30, specular: 0x222222 });
    const roof = mat([0x6a6a6a, 0x7a7068, 0x5a6068, 0x8a8478][style]);
    return new T.Mesh(g, [side, side, roof, roof, side, side]);
  }
  function cityRing(hole, world, r) {
    const Wy = hole.w * 4, Hy = hole.h * 4, cx = Wy / 2, cz = Hy / 2;
    // asphalt everywhere outside the course and its green buffer, with a park strip round the course
    const asphalt = mat(0x55575c), walk = mat(0x9a9890), line = mat(0xe8e2c8);
    const park = 30, ring = 420;
    for (const [x0, z0, x1, z1] of [[-ring, -ring, Wy + ring, -park], [-ring, Hy + park, Wy + ring, Hy + ring], [-ring, -park, -park, Hy + park], [Wy + park, -park, Wy + ring, Hy + park]]) {
      const pg = new T.PlaneGeometry(x1 - x0, z1 - z0); pg.rotateX(-Math.PI / 2);
      const m = new T.Mesh(pg, asphalt); m.position.set((x0 + x1) / 2, 0.04, (z0 + z1) / 2); m.receiveShadow = true; world.add(m);
    }
    // a pavement edge and road markings around the park
    for (const [x0, z0, x1, z1] of [[-park, -park, Wy + park, -park + 2], [-park, Hy + park - 2, Wy + park, Hy + park], [-park, -park, -park + 2, Hy + park], [Wy + park - 2, -park, Wy + park, Hy + park]]) {
      const pg = new T.PlaneGeometry(x1 - x0, z1 - z0); pg.rotateX(-Math.PI / 2);
      const m = new T.Mesh(pg, walk); m.position.set((x0 + x1) / 2, 0.06, (z0 + z1) / 2); world.add(m);
    }
    for (let x = -park + 8; x < Wy + park - 8; x += 10) for (const z of [-park - 7, Hy + park + 7]) { const d = new T.Mesh(new T.BoxGeometry(4, 0.02, 0.4), line); d.position.set(x, 0.07, z); world.add(d); }
    for (let z = -park + 8; z < Hy + park - 8; z += 10) for (const x of [-park - 7, Wy + park + 7]) { const d = new T.Mesh(new T.BoxGeometry(0.4, 0.02, 4), line); d.position.set(x, 0.07, z); world.add(d); }
    // a few dark pines in the park strip
    const pines = [];
    for (let i = 0; i < 90; i++) {
      const a = r() * Math.PI * 2, x = cx + Math.cos(a) * (Wy / 2 + 8 + r() * (park - 14)), z = cz + Math.sin(a) * (Hy / 2 + 8 + r() * (park - 14));
      if (x > -6 && x < Wy + 6 && z > -6 && z < Hy + 6) continue;
      pines.push({ x, z, y: 0, s: 1 + r() * 0.5, v: Math.floor(r() * 3), rot: r() * 6.28 });
    }
    plant(world, pines, 'city');
    // city blocks: buildings get taller the further out they are
    const blk = 44;
    for (let gx = -ring + 20; gx < Wy + ring - 20; gx += blk) for (let gz = -ring + 20; gz < Hy + ring - 20; gz += blk) {
      if (gx > -park - 28 && gx < Wy + park + 28 && gz > -park - 28 && gz < Hy + park + 28) continue;
      const far = Math.max(Math.abs(gx - cx) - Wy / 2, Math.abs(gz - cz) - Hy / 2);
      if (r() < 0.1) { // a paved plaza with a fountain (no trees out among the buildings)
        const plaza = new T.Mesh(new T.BoxGeometry(30, 0.2, 30), mat(0xb0aaa0)); plaza.position.set(gx, 0.1, gz); world.add(plaza);
        const basin = new T.Mesh(new T.CylinderGeometry(5, 5.4, 1, 14), mat(0x9a948a)); basin.position.set(gx, 0.6, gz); world.add(basin);
        const water = new T.Mesh(new T.CylinderGeometry(4.6, 4.6, 0.1, 14), mat(0x4f9ad8, { shininess: 80 })); water.position.set(gx, 1.05, gz); world.add(water);
        const jet = new T.Mesh(new T.CylinderGeometry(0.3, 0.6, 4, 6), new T.MeshBasicMaterial({ color: 0xd8f0ff, transparent: true, opacity: 0.6 })); jet.position.set(gx, 3, gz); world.add(jet);
        continue;
      }
      const w = 18 + r() * 14, d = 18 + r() * 14, h = 10 + r() * 22 + Math.min(110, far * 0.35 * (0.5 + r()));
      const b = building(w, h, d, Math.floor(r() * 4)); b.position.set(gx, h / 2, gz); b.castShadow = true; b.receiveShadow = true; world.add(b);
      if (r() < 0.5) { const ac = new T.Mesh(new T.BoxGeometry(4, 2, 4), mat(0x9aa0a6)); ac.position.set(gx + (r() - 0.5) * w * 0.5, h + 1, gz + (r() - 0.5) * d * 0.5); world.add(ac); }
      if (h > 70 && r() < 0.5) { const sp = new T.Mesh(new T.CylinderGeometry(0.4, 0.6, 14, 5), mat(0xc9ced6)); sp.position.set(gx, h + 7, gz); world.add(sp); }
    }
  }

  // ---------- coastal ----------
  let waveTexBase = null;
  function waveTex(repeat) {
    if (!waveTexBase) {
      const cv = TU.sprites.makeCanvas(64, 64), x = cv.getContext('2d');
      x.fillStyle = '#2a78c4'; x.fillRect(0, 0, 64, 64);
      for (let k = 0; k < 14; k++) {
        const cx = (k * 29) % 64, cy = (k * 41) % 64, w = 5 + (k % 4) * 3;
        x.strokeStyle = k % 3 ? 'rgba(160,215,245,0.8)' : 'rgba(255,255,255,0.75)'; x.lineWidth = 1.5;
        x.beginPath(); x.moveTo(cx - w, cy); x.quadraticCurveTo(cx, cy - 2.5, cx + w, cy); x.stroke();
      }
      x.fillStyle = 'rgba(20,70,140,0.25)'; for (let k = 0; k < 10; k++) x.fillRect((k * 23) % 64, (k * 37) % 64, 8, 3);
      waveTexBase = cv;
    }
    const t = new T.CanvasTexture(waveTexBase);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat, repeat); t.magFilter = T.NearestFilter;
    return t;
  }
  function seaRing(r0, r1, repeat, opts = {}) {
    const tex = waveTex(repeat);
    const m = new T.Mesh(new T.RingGeometry(r0, r1, 72, 2), new T.MeshPhongMaterial(Object.assign({ map: tex, shininess: 60, specular: 0x88aacc, flatShading: true }, opts)));
    m.rotation.x = -Math.PI / 2;
    return { mesh: m, tex };
  }
  function coastalRing(hole, world, r) {
    const Wy = hole.w * 4, Hy = hole.h * 4, cx = Wy / 2, cz = Hy / 2, R = Math.hypot(Wy, Hy) / 2 + 70;
    // beach then sea all round, out to the horizon
    const beach = new T.Mesh(new T.RingGeometry(R - 34, R + 6, 72), mat(0xe8d6a0)); beach.rotation.x = -Math.PI / 2; beach.position.set(cx, 0.05, cz); world.add(beach);
    const seaM = R3.waterMat || (R3.waterMat = R3.reflect(new T.MeshPhongMaterial({ color: 0x2e6fb8, specular: 0xffffff, shininess: 90, transparent: true, opacity: 0.86 }), 0.55));
    const sea = seaRing(R, 2600, 260); sea.mesh.position.set(cx, 0.12, cz); world.add(sea.mesh);
    // turquoise shallows and a line of surf along the beach
    const shallows = new T.Mesh(new T.RingGeometry(R - 2, R + 16, 72), new T.MeshPhongMaterial({ color: 0x4fc4d8, transparent: true, opacity: 0.85, flatShading: true })); shallows.rotation.x = -Math.PI / 2; shallows.position.set(cx, 0.14, cz); world.add(shallows);
    const foam = new T.Mesh(new T.RingGeometry(R - 3, R - 0.5, 72), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false })); foam.rotation.x = -Math.PI / 2; foam.position.set(cx, 0.16, cz); world.add(foam);
    // a wooden pier running out to sea
    {
      const a = r() * Math.PI * 2, dir = { x: Math.cos(a), z: Math.sin(a) }, len = 46, wood = mat(0x8a6a44), dark = mat(0x5a4028);
      const start = { x: cx + dir.x * (R - 20), z: cz + dir.z * (R - 20) };
      const deck = new T.Mesh(new T.BoxGeometry(4, 0.3, len), wood); deck.position.set(start.x + dir.x * len / 2, 1.4, start.z + dir.z * len / 2); deck.rotation.y = Math.atan2(dir.x, dir.z); world.add(deck);
      for (let k = 0; k <= len; k += 5) for (const sd of [-1.8, 1.8]) {
        const post = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 3, 6), dark);
        post.position.set(start.x + dir.x * k - dir.z * sd, 0.4, start.z + dir.z * k + dir.x * sd); world.add(post);
      }
      const hut = new T.Mesh(new T.BoxGeometry(5, 0.2, 6), wood); hut.position.set(start.x + dir.x * len, 1.4, start.z + dir.z * len); world.add(hut);
    }
    for (let i = 0; i < 5; i++) {
      const a = r() * Math.PI * 2, d = R + 4 + r() * 10, k = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 4, 6), mat([0xe74c3c, 0xf1c40f, 0x27ae60][i % 3])); // a kayak
      k.rotation.set(Math.PI / 2, 0, r() * 6); k.position.set(cx + Math.cos(a) * d, 0.35, cz + Math.sin(a) * d); world.add(k);
    }
    const seaTex = sea.tex;
    // palm groves and jungle plants on the land between the course and the beach
    const plants = [];
    for (let i = 0; i < 220; i++) {
      const a = r() * Math.PI * 2, d = 20 + r() * (R - 50);
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (x > -10 && x < Wy + 10 && z > -10 && z < Hy + 10) continue;
      if (Math.hypot(x - cx, z - cz) > R - 30) continue;
      plants.push({ x, z, y: 0, s: 0.9 + r() * 0.6, v: Math.floor(r() * 3), rot: r() * 6.28 });
    }
    plant(world, plants, 'coastal');
    // beach umbrellas
    const cols = [[0xe74c3c, 0xf4f4f0], [0x2f80ed, 0xf4f4f0], [0xf1c40f, 0x27ae60]];
    for (let i = 0; i < 12; i++) {
      const a = r() * Math.PI * 2, d = R - 16 - r() * 12, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      const g = new T.Group(); g.position.set(x, 0, z); world.add(g);
      const pole = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 2.6, 4), mat(0xf4f4f0)); pole.position.y = 1.3; g.add(pole);
      const [c1, c2] = cols[i % 3];
      for (let k = 0; k < 8; k++) { const seg = new T.Mesh(new T.ConeGeometry(1.6, 0.6, 8, 1, true, k / 8 * Math.PI * 2, Math.PI / 4), mat(k % 2 ? c1 : c2, { side: T.DoubleSide })); seg.position.y = 2.7; g.add(seg); }
      const towel = new T.Mesh(new T.BoxGeometry(1, 0.03, 2), mat(c1)); towel.position.set(1.4, 0.06, 0); g.add(towel);
    }
    // sailboats bobbing out on the water
    const boats = [];
    for (let i = 0; i < 7; i++) {
      const a = r() * Math.PI * 2, d = R + 40 + r() * 260, g = new T.Group();
      g.position.set(cx + Math.cos(a) * d, 0.2, cz + Math.sin(a) * d); g.rotation.y = r() * 6.28; world.add(g);
      const hull = new T.Mesh(new T.BoxGeometry(2.2, 1, 7), mat(0xf4f4f0)); hull.position.y = 0.5; g.add(hull);
      const mast = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 8, 4), mat(0x8a6a44)); mast.position.y = 5; g.add(mast);
      const sailG = new T.BufferGeometry(); sailG.setAttribute('position', new T.Float32BufferAttribute([0, 1.2, 0.2, 0, 8.8, 0.2, 0, 1.2, -3.2], 3)); sailG.computeVertexNormals();
      g.add(new T.Mesh(sailG, mat([0xf4f4f0, 0xe74c3c, 0x2f80ed][i % 3], { side: T.DoubleSide })));
      boats.push({ g, ph: r() * 6 });
    }
    R3.themeAnim = time => {
      boats.forEach(b => { b.g.position.y = 0.2 + Math.sin(time * 1.2 + b.ph) * 0.25; b.g.rotation.z = Math.sin(time * 0.9 + b.ph) * 0.06; });
      seaTex.offset.set(time * 0.01, time * 0.006);
      foam.material.opacity = 0.35 + Math.sin(time * 1.6) * 0.25;
      foam.scale.setScalar(1 + Math.sin(time * 1.6) * 0.004);
    };
  }

  // ---------- desert ----------
  function mesa(rad, h, r, cols) {
    // a flat-topped butte with coloured rock bands
    const g = new T.CylinderGeometry(rad * 0.82, rad, h, 9, 5), pos = g.attributes.position, c = new Float32Array(pos.count * 3), tmp = new T.Color();
    for (let k = 0; k < pos.count; k++) {
      const y = pos.getY(k), band = Math.floor((y / h + 0.5) * 6);
      if (y > -h / 2 + 0.01 && y < h / 2 - 0.01) { const j = 0.86 + r() * 0.28; pos.setX(k, pos.getX(k) * j); pos.setZ(k, pos.getZ(k) * j); }
      tmp.setHex(cols[band % cols.length]);
      c[k * 3] = tmp.r; c[k * 3 + 1] = tmp.g; c[k * 3 + 2] = tmp.b;
    }
    g.setAttribute('color', new T.BufferAttribute(c, 3)); g.computeVertexNormals();
    return g;
  }
  // A sand dune with real shape: a long ridge, a crescent (barchan) with horns swept downwind,
  // or a big star-shaped mound. Gentle windward side, steeper slip face, wind ripples and a lit crest.
  function duneGeo(type, L, Wd, H, r, fog = true) {
    const g = new T.PlaneGeometry(L, Wd, 30, 16); g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, cols = new Float32Array(pos.count * 3), c = new T.Color(), ph = r() * 6;
    const base = new T.Color(0xe2b878), lit = new T.Color(0xf2d39a), shade = new T.Color(0xc2925a);
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k), u = x / (L / 2), v = z / (Wd / 2);
      let h;
      if (type === 'crescent') {
        const bend = u * u * 0.9, vz = v + bend; // horns sweep back
        const across = vz < 0 ? Math.exp(-vz * vz * 3) : Math.exp(-vz * vz * 9); // steep slip face on the lee
        h = H * across * Math.max(0, 1 - Math.pow(Math.abs(u), 2.4));
      } else if (type === 'star') {
        const rr = Math.hypot(u, v), ang = Math.atan2(v, u);
        h = H * Math.max(0, 1 - rr) ** 1.6 * (0.75 + 0.25 * Math.cos(ang * 4 + ph));
      } else {
        const wave = 0.75 + 0.25 * Math.sin(u * 3 + ph);
        const across = v < 0 ? Math.exp(-v * v * 2.5) : Math.exp(-v * v * 7);
        h = H * across * wave * Math.max(0, 1 - Math.pow(Math.abs(u), 4));
      }
      pos.setY(k, h - 0.4);
      // colour: lit windward side, shaded slip face, ripple bands, and a pale crest
      const slope = type === 'star' ? 0 : (v > 0 ? 1 : 0);
      c.copy(base).lerp(slope ? shade : lit, 0.45 * Math.min(1, h / H + 0.2));
      c.multiplyScalar(0.93 + 0.07 * Math.sin(x * 1.1 + z * 0.35 + ph));
      if (h > H * 0.9) c.lerp(lit, 0.5);
      cols[k * 3] = c.r; cols[k * 3 + 1] = c.g; cols[k * 3 + 2] = c.b;
    }
    g.setAttribute('color', new T.BufferAttribute(cols, 3));
    g.computeVertexNormals();
    return g;
  }
  const duneMat = { true: null, false: null };
  const duneM = fog => duneMat[fog] || (duneMat[fog] = new T.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 4, specular: 0x000000, fog }));
  function scatterDunes(group, r, n, cx, cz, rx0, rx1, rz0, rz1, sizeK, fog, keepOut) {
    const kinds = ['ridge', 'crescent', 'star', 'ridge', 'crescent'];
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = r();
      const x = cx + Math.cos(a) * (rx0 + d * (rx1 - rx0)), z = cz + Math.sin(a) * (rz0 + d * (rz1 - rz0));
      if (keepOut && keepOut(x, z)) continue;
      const type = kinds[Math.floor(r() * kinds.length)], k = sizeK * (0.6 + r() * 0.9);
      const L = (type === 'star' ? 60 : 80 + r() * 60) * k, Wd = (type === 'star' ? 60 : 30 + r() * 20) * k, H = (type === 'star' ? 14 : 6 + r() * 8) * k;
      const m = new T.Mesh(duneGeo(type, L, Wd, H, r, fog), duneM(fog));
      m.position.set(x, 0, z); m.rotation.y = 0.6 + (r() - 0.5) * 0.5; // dunes line up with the prevailing wind
      m.receiveShadow = true; group.add(m);
    }
  }
  const ROCK = [0xb5552e, 0xc8703e, 0xa94a2a, 0xd88a50, 0xbf6236, 0x9c4426];
  function desertRing(hole, world, r) {
    const Wy = hole.w * 4, Hy = hole.h * 4, cx = Wy / 2, cz = Hy / 2;
    const rockM = new T.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 4, specular: 0x000000 });
    for (let i = 0; i < 22; i++) {
      const a = (i + r() * 0.6) / 22 * Math.PI * 2, d = 1 + r() * 0.25;
      const x = cx + Math.cos(a) * (Wy / 2 + 230) * d, z = cz + Math.sin(a) * (Hy / 2 + 210) * d, rad = 30 + r() * 45, h = 25 + r() * 55;
      const m = new T.Mesh(mesa(rad, h, r, ROCK), rockM); m.position.set(x, h / 2 - 1, z); m.rotation.y = r() * 6; m.castShadow = true; world.add(m);
    }
    // low dunes, cacti, scrub and rocks on the open sand
    // fields of dunes of every shape all round the course (kept off the course itself)
    const offCourse = (x, z) => x > -40 && x < Wy + 40 && z > -40 && z < Hy + 40;
    scatterDunes(world, r, 60, cx, cz, Wy / 2 + 50, Wy / 2 + 240, Hy / 2 + 50, Hy / 2 + 220, 0.55, true, offCourse);
    const plants = [];
    for (let i = 0; i < 160; i++) {
      const a = r() * Math.PI * 2, d = 0.15 + r() * 0.85, x = cx + Math.cos(a) * (Wy / 2 + 15 + d * 210), z = cz + Math.sin(a) * (Hy / 2 + 15 + d * 200);
      plants.push({ x, z, y: 0, s: 0.8 + r() * 0.6, v: r() < 0.4 ? 0 : 1, rot: r() * 6.28 });
    }
    plant(world, plants, 'desert');
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2, x = cx + Math.cos(a) * (Wy / 2 + 20 + r() * 200), z = cz + Math.sin(a) * (Hy / 2 + 20 + r() * 190), s = 0.8 + r() * 2.5;
      const rk = new T.Mesh(new T.DodecahedronGeometry(s, 0), mat(ROCK[i % ROCK.length])); rk.scale.y = 0.6; rk.position.set(x, s * 0.25, z); world.add(rk);
    }
    // dust devils wandering over the sand, and tumbleweeds rolling along in the wind
    const devils = [], weeds = [];
    for (let i = 0; i < 3; i++) {
      const g = new T.Group(), m = new T.MeshBasicMaterial({ color: 0xd9b07a, transparent: true, opacity: 0.28, side: T.DoubleSide, depthWrite: false });
      for (let k = 0; k < 4; k++) { const ring = new T.Mesh(new T.CylinderGeometry(1.2 + k * 1.4, 0.8 + k * 1.2, 4, 10, 1, true), m); ring.position.y = 2 + k * 4; g.add(ring); }
      const a = r() * Math.PI * 2; g.userData = { a, rad: Math.max(Wy, Hy) / 2 + 60 + r() * 90, sp: 0.02 + r() * 0.02 };
      world.add(g); devils.push(g);
    }
    for (let i = 0; i < 7; i++) {
      const tw = new T.Mesh(new T.IcosahedronGeometry(0.9, 1), new T.MeshBasicMaterial({ color: 0x9a7a4a, wireframe: true }));
      const a = r() * Math.PI * 2; tw.userData = { x: cx + Math.cos(a) * (Wy / 2 + 30 + r() * 120), z: cz + Math.sin(a) * (Hy / 2 + 30 + r() * 120), v: 3 + r() * 3, ph: r() * 6 };
      world.add(tw); weeds.push(tw);
    }
    R3.themeAnim = time => {
      devils.forEach(g => { const u = g.userData, a = u.a + time * u.sp; g.position.set(cx + Math.cos(a) * u.rad, 0, cz + Math.sin(a) * u.rad); g.rotation.y = time * 4; g.children.forEach((c, k) => { c.position.x = Math.sin(time * 2 + k) * 0.6; }); });
      weeds.forEach(tw => {
        const u = tw.userData; // drift east with the wind, wrapping round
        let px = cx + ((u.x - cx + time * u.v) % 500 + 500) % 500 - 250, pz = u.z;
        if (px > -12 && px < Wy + 12 && pz > -12 && pz < Hy + 12) px = -40; // keep them off the course
        tw.position.set(px, 0.9 + Math.abs(Math.sin(time * 3 + u.ph)) * 0.6, pz); tw.rotation.z = -time * u.v / 0.9;
      });
    };
  }

  // ---------- far away ----------
  // Lots of different islands spread right round the horizon: palm atolls with lagoons, jungle
  // islands, smoking volcanoes, rocky cliff islands and tiny islets with a palm or two.
  function buildIslands(group, r, hillGeo, smokes) {
    const palmSpots = [], bushSpots = [];
    const fogless = c => mat(c, { fog: false });
    const vcol = (g, f) => { const pos = g.attributes.position, c = new Float32Array(pos.count * 3), t = new T.Color(); for (let k = 0; k < pos.count; k++) { f(t, pos.getX(k), pos.getY(k), pos.getZ(k)); c[k * 3] = t.r; c[k * 3 + 1] = t.g; c[k * 3 + 2] = t.b; } g.setAttribute('color', new T.BufferAttribute(c, 3)); return g; };
    const vMat = new T.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 6, fog: false });
    const types = ['jungle', 'atoll', 'volcano', 'cliff', 'islet', 'jungle', 'islet', 'atoll', 'cliff', 'jungle'];
    const N = 48;
    for (let i = 0; i < N; i++) {
      const a = (i + r() * 0.8) / N * Math.PI * 2, d = 470 + r() * 1100, far = (d - 470) / 1100;
      const type = types[Math.floor(r() * types.length)], scale = 0.7 + far * 0.9;
      const isl = new T.Group(); isl.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); isl.rotation.y = r() * 6; group.add(isl);
      const reefR = (type === 'islet' ? 14 : 50) * scale * (0.7 + r() * 0.6);
      const reef = new T.Mesh(new T.CylinderGeometry(reefR * 1.35, reefR * 1.4, 0.3, 18), fogless(0x4fc4d8)); reef.position.y = 0.12; isl.add(reef);
      const palm = (x, z, y, s) => palmSpots.push({ x: isl.position.x + x, z: isl.position.z + z, y, s, v: 0, rot: r() * 6.28 });
      if (type === 'atoll') {
        // a ring of sand around a turquoise lagoon, palms along the ring
        const R = reefR;
        const ring = new T.Mesh(new T.TorusGeometry(R, R * 0.18, 5, 22), fogless(0xeedcaa)); ring.rotation.x = Math.PI / 2; ring.scale.z = 0.25; ring.position.y = 0.6; isl.add(ring);
        const lagoon = new T.Mesh(new T.CircleGeometry(R * 0.85, 22), fogless(0x6fe0e8)); lagoon.rotation.x = -Math.PI / 2; lagoon.position.y = 0.2; isl.add(lagoon);
        for (let k = 0; k < 14; k++) { const t = r() * Math.PI * 2; if (r() < 0.75) palm(Math.cos(t) * R, Math.sin(t) * R, 1.6, 2.2 + r() * 1.2); }
      } else if (type === 'volcano') {
        // a rocky cone with a dark crater, glowing lava and a plume of smoke
        const R = reefR * 0.9, H = R * (0.9 + r() * 0.5);
        const beach = new T.Mesh(new T.CylinderGeometry(R * 1.15, R * 1.25, 2, 16), fogless(0x9a8a78)); beach.position.y = 0.5; isl.add(beach);
        const cg = new T.CylinderGeometry(R * 0.18, R, H, 14, 6, true), cp = cg.attributes.position;
        for (let k = 0; k < cp.count; k++) { const y = cp.getY(k); if (y < H / 2 - 0.01 && y > -H / 2 + 0.01) { const j = 0.85 + r() * 0.3; cp.setX(k, cp.getX(k) * j); cp.setZ(k, cp.getZ(k) * j); } }
        cg.computeVertexNormals();
        vcol(cg, (t, x, y) => { const u = (y / H + 0.5); t.setHex(u < 0.35 ? 0x4f7a3a : u < 0.6 ? 0x6b5a48 : 0x4a3a32); if (u > 0.85) t.lerp(new T.Color(0x2a2220), 0.5); });
        const cone = new T.Mesh(cg, vMat); cone.position.y = H / 2 + 1; isl.add(cone);
        const crater = new T.Mesh(new T.CylinderGeometry(R * 0.17, R * 0.05, H * 0.12, 12), fogless(0x1d1512)); crater.position.y = H + 1 - H * 0.05; isl.add(crater);
        const lava = new T.Mesh(new T.CircleGeometry(R * 0.12, 12), new T.MeshBasicMaterial({ color: 0xff6a20, fog: false })); lava.rotation.x = -Math.PI / 2; lava.position.y = H + 0.6; isl.add(lava);
        // a lava streak down one side
        const streak = new T.Mesh(new T.BoxGeometry(R * 0.06, 0.4, H * 0.75), new T.MeshBasicMaterial({ color: 0xe8541e, fog: false })); streak.position.set(0, H * 0.6, R * 0.42); streak.rotation.x = 0.72; isl.add(streak);
        for (let k = 0; k < 5; k++) {
          const m = new T.Mesh(new T.IcosahedronGeometry(R * 0.14, 1), new T.MeshBasicMaterial({ color: 0x8a8a8a, transparent: true, opacity: 0.5, fog: false, depthWrite: false }));
          group.add(m); smokes.push({ m, x: isl.position.x, y: H + 3, z: isl.position.z, s: 1, ph: k / 5 });
        }
        for (let k = 0; k < 5; k++) { const t = r() * Math.PI * 2; palm(Math.cos(t) * R * 1.05, Math.sin(t) * R * 1.05, 1.5, 2 + r()); }
      } else if (type === 'cliff') {
        // a steep rocky island with a grassy top and a little beach at its foot
        const R = reefR * 0.8, H = 25 + r() * 45 * scale;
        const rock = new T.Mesh(mesa(R, H, r, [0x8c8070, 0x7a6e60, 0x9a8e7c, 0x6e6458]), new T.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 4, fog: false })); rock.position.y = H / 2; isl.add(rock);
        const top = new T.Mesh(new T.SphereGeometry(R * 0.85, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), fogless(0x4f9a4a)); top.scale.y = 0.25; top.position.y = H - 0.5; isl.add(top);
        const beach = new T.Mesh(new T.CylinderGeometry(R * 1.3, R * 1.35, 1.2, 14, 1, false, 0, Math.PI * 0.8), fogless(0xeedcaa)); beach.position.y = 0.4; isl.add(beach);
        for (let k = 0; k < 4; k++) { const t = r() * Math.PI * 2; palm(Math.cos(t) * R * 0.5, Math.sin(t) * R * 0.5, H, 2 + r()); }
      } else if (type === 'islet') {
        const R = reefR * 0.7;
        const sand = new T.Mesh(new T.SphereGeometry(R, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), fogless(0xeedcaa)); sand.scale.y = 0.15; isl.add(sand);
        for (let k = 0, n = 1 + Math.floor(r() * 2); k < n; k++) palm((r() - 0.5) * R * 0.6, (r() - 0.5) * R * 0.6, R * 0.14, 2 + r() * 1.2);
      } else {
        // a big jungle island: beaches, a hilly green interior, maybe a second peak, and dense palms
        const R = reefR, h = R * (0.35 + r() * 0.5);
        const sand = new T.Mesh(new T.CylinderGeometry(R * 1.1, R * 1.2, 2, 16), fogless(0xeedcaa)); sand.position.y = 0.5; isl.add(sand);
        const hill = new T.Mesh(hillGeo(R, h, r, 0x2f7f3a, 0x5aa04a), new T.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 6, fog: false })); hill.position.y = 1; isl.add(hill);
        if (r() < 0.5) { const pk = new T.Mesh(hillGeo(R * 0.45, h * 1.4, r, 0x2a6a32, 0x4f9040), new T.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 6, fog: false })); pk.position.set(R * 0.25, 1, -R * 0.2); isl.add(pk); }
        for (let k = 0; k < 16; k++) { const t = r() * Math.PI * 2, rr = R * (0.9 + r() * 0.15); palm(Math.cos(t) * rr, Math.sin(t) * rr, 1.6, 2.4 + r() * 1.4); }
        for (let k = 0; k < 10; k++) { const t = r() * Math.PI * 2, rr = R * r() * 0.6; bushSpots.push({ x: isl.position.x + Math.cos(t) * rr, z: isl.position.z + Math.sin(t) * rr, y: 1 + h * 0.75, s: 3 + r() * 2, v: 1, rot: r() * 6 }); }
      }
    }
    plant(group, palmSpots, 'coastal');
    plant(group, bushSpots, 'coastal');
  }
  function coastalBackdrop(group, r, hillGeo) {
    const sea = seaRing(380, 4000, 360, { fog: false }); sea.mesh.position.y = 0.1; group.add(sea.mesh);
    const smokes = [];
    buildIslands(group, r, hillGeo, smokes);
    // a cargo ship on the horizon and a few sailboats further in
    const ship = new T.Group(), a0 = r() * Math.PI * 2; ship.position.set(Math.cos(a0) * 1600, 0, Math.sin(a0) * 1600); ship.rotation.y = a0 + Math.PI / 2; group.add(ship);
    const hull = new T.Mesh(new T.BoxGeometry(14, 10, 90), mat(0x2b3a4a, { fog: false })); hull.position.y = 4; ship.add(hull);
    const bridge = new T.Mesh(new T.BoxGeometry(12, 12, 14), mat(0xf4f4f0, { fog: false })); bridge.position.set(0, 15, -32); ship.add(bridge);
    for (let k = 0; k < 6; k++) { const ct = new T.Mesh(new T.BoxGeometry(12, 6, 10), mat([0xd23c3c, 0x2f80ed, 0xf1c40f, 0x27ae60][k % 4], { fog: false })); ct.position.set(0, 12, -14 + k * 12); ship.add(ct); }
    const boats = [];
    for (let i = 0; i < 6; i++) {
      const a = r() * Math.PI * 2, d = 600 + r() * 600, g = new T.Group();
      g.position.set(Math.cos(a) * d, 0.3, Math.sin(a) * d); g.rotation.y = r() * 6; g.scale.setScalar(2.5); group.add(g);
      g.add(new T.Mesh(new T.BoxGeometry(2.2, 1, 7), mat(0xf4f4f0, { fog: false })));
      const sailG = new T.BufferGeometry(); sailG.setAttribute('position', new T.Float32BufferAttribute([0, 0.8, 0.2, 0, 8.6, 0.2, 0, 0.8, -3.2], 3)); sailG.computeVertexNormals();
      g.add(new T.Mesh(sailG, mat([0xf4f4f0, 0xe74c3c, 0x2f80ed][i % 3], { side: T.DoubleSide, fog: false })));
      boats.push({ g, ph: r() * 6 });
    }
    R3.backdropAnim = time => {
      sea.tex.offset.set(time * 0.006, time * 0.004);
      ship.position.y = Math.sin(time * 0.4) * 0.6;
      boats.forEach(b => { b.g.position.y = 0.3 + Math.sin(time + b.ph) * 0.5; b.g.rotation.z = Math.sin(time * 0.8 + b.ph) * 0.07; });
      // volcano smoke puffs rise, swell and fade, then start again at the crater
      smokes.forEach(sm => { const u = ((time * 0.12 + sm.ph) % 1); sm.m.position.set(sm.x + u * 18, sm.y + u * 70, sm.z); sm.m.scale.setScalar(sm.s * (0.6 + u * 2)); sm.m.material.opacity = 0.55 * (1 - u); });
    };
  }
  function desertBackdrop(group, r, layer) {
    const rockM = new T.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 4, fog: false });
    // two rings of mesas: big far ones and smaller buttes nearer in
    for (let i = 0; i < 40; i++) {
      const a = (i + r() * 0.6) / 40 * Math.PI * 2, d = 760 + r() * 420, rad = 50 + r() * 110, h = 50 + r() * 140;
      const m = new T.Mesh(mesa(rad, h, r, [0xc77b56, 0xd8946a, 0xb86a48, 0xe0a27a]), rockM); m.position.set(Math.cos(a) * d, h / 2 - 2, Math.sin(a) * d); group.add(m);
    }
    for (let i = 0; i < 18; i++) {
      const a = r() * Math.PI * 2, d = 480 + r() * 200, rad = 15 + r() * 25, h = 40 + r() * 70;
      const m = new T.Mesh(mesa(rad, h, r, ROCK), rockM); m.position.set(Math.cos(a) * d, h / 2 - 2, Math.sin(a) * d); group.add(m);
    }
    layer(30, 1350, 120, 260, 180, 260, 0xd8a888, 0xe6bfa0, 0);
    // natural rock arches
    for (let i = 0; i < 5; i++) {
      const a = r() * Math.PI * 2, d = 520 + r() * 380, R = 22 + r() * 18, tube = 5 + r() * 4;
      const g = new T.Group(); g.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); g.rotation.y = r() * 6; group.add(g);
      const arch = new T.Mesh(new T.TorusGeometry(R, tube, 6, 14, Math.PI), mat(0xc0603a, { fog: false })); arch.position.y = 6; g.add(arch);
      for (const sx of [-R, R]) { const leg = new T.Mesh(new T.CylinderGeometry(tube * 1.1, tube * 1.6, 8, 7), mat(0xa94a2a, { fog: false })); leg.position.set(sx, 3, 0); g.add(leg); }
    }
    // clusters of hoodoos: stacked rock spires with darker caps
    for (let c = 0; c < 9; c++) {
      const a = r() * Math.PI * 2, d = 420 + r() * 380, cx = Math.cos(a) * d, cz = Math.sin(a) * d;
      for (let k = 0; k < 6; k++) {
        const h = 12 + r() * 30, rad = 2 + r() * 3, x = cx + (r() - 0.5) * 40, z = cz + (r() - 0.5) * 40;
        for (let s2 = 0; s2 < 3; s2++) { const seg = new T.Mesh(new T.CylinderGeometry(rad * (0.8 - s2 * 0.12), rad * (1 - s2 * 0.1), h / 3, 7), mat(ROCK[(k + s2) % ROCK.length], { fog: false })); seg.position.set(x, h / 6 + s2 * h / 3, z); group.add(seg); }
        const cap = new T.Mesh(new T.SphereGeometry(rad * 1.1, 7, 4), mat(0x6a3a22, { fog: false })); cap.scale.y = 0.5; cap.position.set(x, h + 0.5, z); group.add(cap);
      }
    }
    // a sea of big dunes spread right across the desert, between and around the rocks
    scatterDunes(group, r, 90, 0, 0, 360, 1250, 360, 1250, 1.3, false);
  }

  TU.Themes = {
    coastalBackdrop, desertBackdrop,
    list: THEMES,
    keys: Object.keys(THEMES),
    of(hole) { return hole && THEMES[hole.theme] ? hole.theme : 'mountain'; },
    get(name) { return THEMES[name] || THEMES.mountain; },
    plant, merge, mesa, ROCK, building,
    // the land beyond the boundary for the settings that don't use the farmland + hills ring
    surround(theme, hole, world, r) {
      R3.themeAnim = null;
      if (theme === 'city') cityRing(hole, world, r);
      else if (theme === 'coastal') coastalRing(hole, world, r);
      else if (theme === 'desert') desertRing(hole, world, r);
      else return false;
      return true;
    },
  };
})();
