// Course dressing built with each hole: animated water (waves, ripple overlay, shoreline foam,
// lily pads, reeds, ripples), bunker rakes, shore rocks, a ball washer / bench / bin on the tee,
// yardage plates, the cup liner and a numbered flag. Everything you could bump into is solid.
(function () {
  const T = THREE, R3 = TU.R3, mat = R3.mat, U = TU.util;
  const HR = () => TU.holeRender;

  function rippleTex() {
    if (R3.rippleTex) return R3.rippleTex;
    const cv = TU.sprites.makeCanvas(64, 64), x = cv.getContext('2d');
    x.clearRect(0, 0, 64, 64);
    x.strokeStyle = 'rgba(255,255,255,0.55)'; x.lineWidth = 1.5;
    for (let k = 0; k < 9; k++) {
      const cx = (k * 23) % 64, cy = (k * 37) % 64, w = 6 + (k % 3) * 4;
      x.beginPath(); x.moveTo(cx - w, cy); x.quadraticCurveTo(cx, cy - 3, cx + w, cy); x.stroke();
    }
    const t = new T.CanvasTexture(cv);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.magFilter = T.NearestFilter;
    return (R3.rippleTex = t);
  }

  TU.CourseDetail = {
    build(hole, world) {
      const D = { water: [], pads: [], rings: [], foam: null, overlay: null, t0: 0, nextRipple: 0, nextFish: 3 };
      const typeAt = (x, y) => HR().typeAt(hole, x, y);
      const isW = (x, y) => typeAt(x, y) === 'W';
      const W = hole.w * 4, H = hole.h * 4;

      // ---- water ----
      const wm = R3.water;
      if (wm) {
        const pos = wm.geometry.attributes.position;
        D.base = Float32Array.from(pos.array);
        D.waterGeo = wm.geometry;
        // moving ripple highlights on top of the water
        const og = wm.geometry.clone(), op = og.attributes.position, uv = new Float32Array(op.count * 2);
        for (let i = 0; i < op.count; i++) { uv[i * 2] = op.getX(i) / 7; uv[i * 2 + 1] = op.getZ(i) / 7; op.setY(i, op.getY(i) + 0.03); }
        og.setAttribute('uv', new T.BufferAttribute(uv, 2));
        const tex = rippleTex().clone(); tex.needsUpdate = true;
        D.overlay = new T.Mesh(og, new T.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false }));
        world.add(D.overlay);
        D.ovTex = tex;
        // shoreline foam, lily pads, reeds
        const foam = [], padSpots = [], reedSpots = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          if (!isW(x + 0.5, y + 0.5)) continue;
          const lvl = R3.waterLevelAt(x + 0.5, y + 0.5);
          if (lvl == null) continue;
          const shore = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !isW(x + 0.5 + dx, y + 0.5 + dy));
          if (shore) {
            const yy = lvl + 0.05;
            foam.push(x, yy, y, x, yy, y + 1, x + 1, yy, y + 1, x, yy, y, x + 1, yy, y + 1, x + 1, yy, y);
            if (U.hash(x, y, 41) > 0.82) reedSpots.push({ x: x + 0.5, y: y + 0.5, lvl });
          } else if (U.hash(x, y, 42) > 0.985 && [[2, 0], [-2, 0], [0, 2], [0, -2]].every(([dx, dy]) => isW(x + 0.5 + dx, y + 0.5 + dy))) padSpots.push({ x: x + 0.5, y: y + 0.5, lvl });
        }
        if (foam.length) {
          const fg = new T.BufferGeometry(); fg.setAttribute('position', new T.Float32BufferAttribute(foam, 3));
          D.foam = new T.Mesh(fg, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }));
          world.add(D.foam);
        }
        // lily pads (a few with a pink flower) bob gently
        const padM = mat(0x3f9a3a, { side: T.DoubleSide }), padG = new T.CircleGeometry(0.8, 12, 0.3, Math.PI * 2 - 0.6);
        padG.rotateX(-Math.PI / 2);
        padSpots.slice(0, 26).forEach((s, k) => {
          const g = new T.Group(); g.position.set(s.x, s.lvl + 0.04, s.y); g.rotation.y = U.hash(k, 3, 43) * 6.28;
          const pad = new T.Mesh(padG, padM); pad.scale.setScalar(0.7 + U.hash(k, 4, 43) * 0.6); g.add(pad);
          if (k % 3 === 0) for (let p = 0; p < 5; p++) {
            const pet = new T.Mesh(new T.ConeGeometry(0.06, 0.18, 4), mat(0xff8fc8)); pet.position.set(Math.cos(p * 1.26) * 0.06, 0.08, Math.sin(p * 1.26) * 0.06); pet.rotation.set(Math.sin(p * 1.26) * 0.6, 0, -Math.cos(p * 1.26) * 0.6); g.add(pet);
          }
          world.add(g); D.pads.push({ g, ph: k });
        });
        // reeds and cattails standing in the shallows
        const reeds = reedSpots.slice(0, 60), nStem = reeds.length * 4;
        if (nStem) {
          const stem = new T.InstancedMesh(new T.CylinderGeometry(0.02, 0.03, 1.4, 4), mat(0x5d8a32), nStem);
          const head = new T.InstancedMesh(new T.CylinderGeometry(0.06, 0.06, 0.28, 5), mat(0x6b4226), nStem);
          const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), sc = new T.Vector3(1, 1, 1), p = new T.Vector3();
          let k = 0;
          reeds.forEach((r, i) => {
            for (let s = 0; s < 4; s++) {
              const ox = (U.hash(i, s, 44) - 0.5) * 0.7, oz = (U.hash(i, s, 45) - 0.5) * 0.7, hgt = 0.8 + U.hash(i, s, 46) * 0.6;
              e.set((U.hash(i, s, 47) - 0.5) * 0.25, 0, (U.hash(i, s, 48) - 0.5) * 0.25); q.setFromEuler(e);
              sc.set(1, hgt, 1); p.set(r.x + ox, r.lvl + 0.7 * hgt, r.y + oz);
              stem.setMatrixAt(k, m4.compose(p, q, sc));
              sc.set(1, 1, 1); p.set(r.x + ox, r.lvl + 1.35 * hgt, r.y + oz);
              head.setMatrixAt(k, m4.compose(p, q, sc));
              k++;
            }
          });
          [stem, head].forEach(m => { m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; m.castShadow = true; world.add(m); });
        }
        // expanding ripple rings
        for (let i = 0; i < 4; i++) {
          const ring = new T.Mesh(new T.RingGeometry(0.3, 0.38, 20), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide }));
          ring.rotation.x = -Math.PI / 2; ring.visible = false; world.add(ring);
          D.rings.push({ ring, t: 9 });
        }
        D.waterCells = padSpots.length ? padSpots : reedSpots;
      }

      // ---- rocks along the shore (solid) ----
      const rockG = new T.DodecahedronGeometry(0.4, 0), rockM = mat(0x8c8f94);
      let rocks = 0;
      for (let y = 2; y < H - 2 && rocks < 30; y += 2) for (let x = 2; x < W - 2 && rocks < 30; x += 2) {
        const t = typeAt(x, y);
        if (t === 'W' || t === 'G' || t === 'E' || t === 'O' || t === 'S' || HR().onPath(hole, x, y)) continue;
        if (!(isW(x + 2, y) || isW(x - 2, y) || isW(x, y + 2) || isW(x, y - 2))) continue;
        if (U.hash(x, y, 51) < 0.8) continue;
        const r = new T.Mesh(rockG, rockM), s = 0.6 + U.hash(x, y, 52) * 0.8;
        r.scale.set(s, s * 0.6, s * 0.9); r.rotation.set(U.hash(x, y, 53) * 3, U.hash(x, y, 54) * 3, 0);
        r.position.set(x, R3.heightAt(x, y) + 0.1 * s, y); r.castShadow = true; world.add(r);
        R3.colliders.push({ x, y, r: 0.35 * s });
        rocks++;
      }

      // ---- a rake beside each bunker (solid) ----
      const seen = new Uint8Array(hole.w * hole.h);
      for (let k = 0; k < hole.w * hole.h; k++) {
        if (hole.tiles[k] !== 'S' || seen[k]) continue;
        const q = [k], cells = []; seen[k] = 1;
        while (q.length) {
          const c = q.pop(), i = c % hole.w, j = (c - i) / hole.w; cells.push([i, j]);
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const ni = i + di, nj = j + dj, nk = nj * hole.w + ni;
            if (ni >= 0 && nj >= 0 && ni < hole.w && nj < hole.h && hole.tiles[nk] === 'S' && !seen[nk]) { seen[nk] = 1; q.push(nk); }
          }
        }
        const cx = cells.reduce((a, c) => a + c[0], 0) / cells.length * 4 + 2, cy = cells.reduce((a, c) => a + c[1], 0) / cells.length * 4 + 2;
        // walk outward from the middle until we're on grass just outside the sand
        const ang = U.hash(cx, cy, 55) * 6.28;
        let spot = null;
        for (let d = 2; d < 30; d += 0.5) {
          const x = cx + Math.cos(ang) * d, y = cy + Math.sin(ang) * d, t = typeAt(x, y);
          if (t !== 'S') { if ((t === 'R' || t === 'F') && !TU.physics.treeAt(hole, x, y, 0.8)) spot = { x: x + Math.cos(ang) * 0.6, y: y + Math.sin(ang) * 0.6 }; break; }
        }
        if (!spot) continue;
        const g = new T.Group(), hz = ang + Math.PI / 2; // lies along the bunker edge
        const handle = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 1.8, 5), mat(0xc8a15a)); handle.rotation.z = Math.PI / 2; handle.position.y = 0.05; g.add(handle);
        const headM = mat(0xe0b020), headB = new T.Mesh(new T.BoxGeometry(0.06, 0.08, 0.6), headM); headB.position.set(0.92, 0.06, 0); g.add(headB);
        for (let t = 0; t < 7; t++) { const tooth = new T.Mesh(new T.BoxGeometry(0.1, 0.02, 0.02), headM); tooth.position.set(0.98, 0.02, -0.27 + t * 0.09); g.add(tooth); }
        g.position.set(spot.x, R3.heightAt(spot.x, spot.y), spot.y); g.rotation.y = -hz;
        R3.castShadows(g); world.add(g);
        const dx = Math.cos(hz), dy = Math.sin(hz);
        for (const o of [-0.7, 0, 0.7]) R3.colliders.push({ x: spot.x + dx * o, y: spot.y + dy * o, r: 0.18 });
      }

      // ---- tee furniture: ball washer and a bench you can sit on (both solid) ----
      R3.benches = [];
      R3.props = [];
      const tee = hole.tee, okGround = (x, y) => { const t = typeAt(x, y); return (t === 'E' || t === 'F' || t === 'R') && !TU.physics.treeAt(hole, x, y, 1) && !R3.obstacleAt(x, y, 1) && !HR().onPath(hole, x, y) && !HR().onPath(hole, x + 2, y) && !HR().onPath(hole, x - 2, y); };
      // try a few spots on both sides of the tee box until one is clear of trees, props and the path
      const spots = (dx, dy) => [[dx, dy], [-dx, dy], [dx, dy + 4], [-dx, dy + 4], [dx + 3, dy], [-dx - 3, dy], [dx, dy - 4], [-dx, dy - 4], [dx + 3, dy + 6], [-dx - 3, dy + 6]];
      const place = (cands, build, r) => {
        for (const [ox, oy] of cands) {
          const x = tee.x + ox, y = tee.y + oy;
          if (!okGround(x, y)) continue;
          const g = build(ox); g.position.set(x, R3.heightAt(x, y), y); R3.castShadows(g); world.add(g); R3.colliders.push({ x, y, r });
          R3.props.push({ obj: g, x, y, r: r + 0.6 });
          return { x, y, ox };
        }
        return null;
      };
      place(spots(6.5, -2), () => {
        const g = new T.Group();
        const post = new T.Mesh(new T.CylinderGeometry(0.06, 0.08, 1.0, 6), mat(0x2b2b2b)); post.position.y = 0.5; g.add(post);
        const body = new T.Mesh(new T.BoxGeometry(0.3, 0.32, 0.22), mat(0x2f80ed)); body.position.y = 1.12; g.add(body);
        const lid = new T.Mesh(new T.BoxGeometry(0.32, 0.05, 0.24), mat(0x1d4f9a)); lid.position.y = 1.3; g.add(lid);
        const crank = new T.Mesh(new T.CylinderGeometry(0.015, 0.015, 0.5, 4), mat(0xc9ced6)); crank.position.set(0, 1.5, 0); g.add(crank);
        const knob = new T.Mesh(new T.SphereGeometry(0.04, 5, 4), mat(0xe74c3c)); knob.position.set(0, 1.76, 0); g.add(knob);
        const towel = new T.Mesh(new T.BoxGeometry(0.02, 0.3, 0.12), mat(0xf4f4f0)); towel.position.set(0.17, 0.95, 0); g.add(towel);
        return g;
      }, 0.3);
      // the bench faces the tee box from whichever side it ends up on
      const bench = place(spots(7.5, 3), ox => {
        const g = new T.Group(), wd = mat(0x8a5a30), mt = mat(0x2b2b2b);
        for (const x of [-0.7, 0.7]) { const leg = new T.Mesh(new T.BoxGeometry(0.08, 0.45, 0.45), mt); leg.position.set(x, 0.22, 0); g.add(leg); }
        for (let k = 0; k < 3; k++) { const pl = new T.Mesh(new T.BoxGeometry(1.7, 0.05, 0.13), wd); pl.position.set(0, 0.47, -0.15 + k * 0.15); g.add(pl); }
        for (let k = 0; k < 2; k++) { const bk = new T.Mesh(new T.BoxGeometry(1.7, 0.12, 0.04), wd); bk.position.set(0, 0.7 + k * 0.17, -0.25); g.add(bk); }
        g.rotation.y = ox > 0 ? -Math.PI / 2 : Math.PI / 2;
        return g;
      }, 0.9);
      if (bench) R3.benches.push({ x: bench.x, y: bench.y, face: bench.ox > 0 ? -Math.PI / 2 : Math.PI / 2, seat: R3.heightAt(bench.x, bench.y) + 0.5 });

      // ---- yardage plates on the fairway (100 red, 150 white, 200 blue) ----
      const pin = hole.pin, dTee = U.dist(tee, pin);
      [[100, '#d63a3a'], [150, '#f4f4f0'], [200, '#2f60d0']].forEach(([n, color]) => {
        if (n > dTee - 30) return;
        const u = n / dTee, x = pin.x + (tee.x - pin.x) * u, y = pin.y + (tee.y - pin.y) * u;
        if (typeAt(x, y) !== 'F') return;
        const cv = TU.sprites.makeCanvas(32, 32), c2 = cv.getContext('2d');
        c2.fillStyle = color; c2.beginPath(); c2.arc(16, 16, 15, 0, Math.PI * 2); c2.fill();
        c2.strokeStyle = '#1d1d1d'; c2.lineWidth = 2; c2.stroke();
        c2.fillStyle = color === '#f4f4f0' ? '#1d1d1d' : '#ffffff'; c2.font = 'bold 12px monospace'; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillText(`${n}`, 16, 17);
        const pl = new T.Mesh(new T.CircleGeometry(0.45, 14), new T.MeshBasicMaterial({ map: R3.pxTex(new T.CanvasTexture(cv)), transparent: true }));
        pl.rotation.x = -Math.PI / 2; pl.rotation.z = Math.atan2(pin.x - tee.x, pin.y - tee.y);
        pl.position.set(x, R3.heightAt(x, y) + 0.04, y); world.add(pl);
      });

      // ---- cup liner and a numbered flag ----
      const ph = R3.heightAt(pin.x, pin.y);
      const liner = new T.Mesh(new T.RingGeometry(0.22, 0.27, 14), new T.MeshBasicMaterial({ color: 0xf4f4f0 }));
      liner.rotation.x = -Math.PI / 2; liner.position.set(pin.x, ph + 0.025, pin.y); world.add(liner);
      if (R3.flag) {
        const num = hole.number || TU.courses.holeNumber(hole) || '';
        const cv = TU.sprites.makeCanvas(64, 40), c2 = cv.getContext('2d');
        c2.fillStyle = '#e74c3c'; c2.fillRect(0, 0, 64, 40);
        c2.fillStyle = '#f4f4f0'; c2.fillRect(0, 34, 64, 6);
        c2.fillStyle = '#ffffff'; c2.font = 'bold 24px monospace'; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillText(`${num}`, 30, 18);
        const ft = new T.CanvasTexture(cv); ft.magFilter = T.NearestFilter;
        R3.flag.material = new T.MeshPhongMaterial({ map: ft, side: T.DoubleSide, shininess: 5 });
        const topper = new T.Mesh(new T.SphereGeometry(0.06, 6, 4), mat(0xffe066)); topper.position.set(pin.x, ph + 2.62, pin.y); world.add(topper);
      }
      R3.detail = D;
    },

    update(time) {
      const D = R3.detail;
      if (!D) return;
      const dt = Math.min(0.1, time - (D.t0 || time)); D.t0 = time;
      // gentle waves on the water surface
      if (D.waterGeo && D.base) {
        const pos = D.waterGeo.attributes.position, a = pos.array, b = D.base;
        for (let i = 0; i < a.length; i += 3) a[i + 1] = b[i + 1] + Math.sin(b[i] * 0.7 + time * 1.6) * 0.035 + Math.sin(b[i + 2] * 0.9 - time * 1.2) * 0.03;
        pos.needsUpdate = true;
      }
      if (D.ovTex) { D.ovTex.offset.set(time * 0.012, time * 0.02); }
      if (D.foam) D.foam.material.opacity = 0.3 + Math.sin(time * 1.8) * 0.12;
      for (const p of D.pads) { p.g.position.y += Math.sin(time * 1.3 + p.ph) * 0.0006; p.g.rotation.y += Math.sin(time * 0.4 + p.ph) * 0.0008; }
      // ripples now and then, and a fish jumping once in a while
      const cells = D.waterCells;
      if (cells && cells.length) {
        if (time > D.nextRipple) {
          D.nextRipple = time + 1 + Math.random() * 2;
          const r = D.rings.find(r => r.t > 1.6), s = cells[Math.floor(Math.random() * cells.length)];
          if (r && s) { r.t = 0; r.ring.position.set(s.x + (Math.random() - 0.5) * 2, s.lvl + 0.06, s.y + (Math.random() - 0.5) * 2); r.ring.visible = true; }
        }
        if (time > D.nextFish) {
          D.nextFish = time + 6 + Math.random() * 10;
          const s = cells[Math.floor(Math.random() * cells.length)];
          if (s && TU.FX) TU.FX.burst(s.x, s.y, s.lvl + 0.1, { n: 10, colors: [0xffffff, 0xbfe6ff], spread: 0.6, up: 3, life: 0.7 });
        }
      }
      for (const r of D.rings) {
        if (r.t > 1.6) { r.ring.visible = false; continue; }
        r.t += dt;
        r.ring.scale.setScalar(1 + r.t * 3);
        r.ring.material.opacity = Math.max(0, 0.6 - r.t * 0.4);
      }
    },
  };
})();
