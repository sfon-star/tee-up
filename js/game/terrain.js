// 3D terrain height field (yards) shared by physics and rendering.
// Rolling hills, an optional raised tee with a cliff edge (the cart path gets a ramp),
// flattened tee boxes, greens built from a tilted plane with gentle undulations,
// sunken ponds and bunkers. Heights live on the tile-corner grid (every 4 yards).
(function () {
  const cache = new WeakMap();
  const U = TU.util;
  const smooth = (a, b, x) => { const t = U.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const GREEN_TILT = 0.1; // height change per yard for slope 1.0 on the green

  function build(hole) {
    const W = hole.w + 1, H = hole.h + 1, hs = new Float32Array(W * H);
    const o = Object.assign({ hills: 0.5, teeLift: 0 }, hole.terrain || {});
    const seed = (hole.w * 31 + hole.h * 7 + hole.tiles.length) % 997;
    const tile = (i, j) => (i < 0 || j < 0 || i >= hole.w || j >= hole.h) ? 'O' : hole.tiles[j * hole.w + i];
    const tee = hole.tee, pin = hole.pin, sl = hole.slope;
    const mapW = hole.w * 4, mapH = hole.h * 4;
    const sp = hole.spine, fwW = hole.fwWidth || 16;

    // 1) base: hills fading to zero at the map border so the course meets the surrounding land
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const x = i * 4, y = j * 4;
      const edge = smooth(0, 36, Math.min(x, y, mapW - x, mapH - y));
      let h = (U.noise(x * 0.012, y * 0.012, seed) - 0.5) * 2 * 7 * o.hills
        + (U.noise(x * 0.035, y * 0.035, seed + 1) - 0.5) * 2 * 1.4
        + U.noise(x * 0.09, y * 0.09, seed + 2) * 0.25;
      // big mountain-scale swells (career tiers ask for these)
      if (o.mountains) h += (U.noise(x * 0.006, y * 0.006, seed + 5) - 0.5) * 2 * 26 * o.mountains;
      // valleys: the land climbs away from the fairway on both sides, so you play down a corridor
      // between ridges (and the inside of a bend becomes a hill you can try to carry)
      if (o.valley && sp) {
        let dmin = 1e9;
        for (let k = 1; k < sp.length; k++) {
          const ax = sp[k - 1][0], ay = sp[k - 1][1], dx = sp[k][0] - ax, dy = sp[k][1] - ay, l2 = dx * dx + dy * dy || 1;
          const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
          dmin = Math.min(dmin, Math.hypot(x - ax - dx * u, y - ay - dy * u));
        }
        h += o.valley * smooth(fwW + 6, fwW + 60, dmin) * (0.7 + 0.6 * U.noise(x * 0.02, y * 0.02, seed + 6));
      }
      // hand-sculpted hills from the Architect editor (one value per tile corner)
      if (o.sculpt) h += o.sculpt[j * W + i] || 0;
      h *= edge;
      // raised tee: a plateau around the tee with a steep drop, except a long gentle ramp where the path runs
      if (o.teeLift) {
        const d = Math.hypot(x - tee.x, y - tee.y);
        const onPath = TU.holeRender.onPath(hole, x, y) || TU.holeRender.onPath(hole, x + 2, y) || TU.holeRender.onPath(hole, x - 2, y);
        const w = onPath ? 30 : 3;
        h += o.teeLift * (1 - smooth(16, 16 + w, d)) * edge;
      }
      hs[j * W + i] = h;
    }
    // 1b) keep generated terrain climbable: no slope steeper than a golfer can walk up (0.9 rise per yard).
    // Hand-sculpted Architect holes are left exactly as built.
    if (!o.sculpt) {
      const maxD = 4 * 0.9;
      for (let it = 0; it < 24; it++) {
        let moved = false;
        for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
          const k = j * W + i;
          for (const [di, dj] of [[1, 0], [0, 1]]) {
            const ni = i + di, nj = j + dj;
            if (ni >= W || nj >= H) continue;
            const k2 = nj * W + ni, d = hs[k2] - hs[k];
            if (Math.abs(d) > maxD) { const fix = (Math.abs(d) - maxD) / 2 * Math.sign(d); hs[k] += fix; hs[k2] -= fix; moved = true; }
          }
        }
        if (!moved) break;
      }
    }
    const at = (i, j) => hs[U.clamp(j, 0, H - 1) * W + U.clamp(i, 0, W - 1)];
    const set = (i, j, v) => { hs[j * W + i] = v; };
    const adjCount = (i, j, t) => [tile(i - 1, j - 1), tile(i, j - 1), tile(i - 1, j), tile(i, j)].filter(v => v === t).length;

    // 2) tee box: flat pad slightly raised
    const teeCorners = [];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (adjCount(i, j, 'E')) teeCorners.push([i, j]);
    if (teeCorners.length) {
      const avg = teeCorners.reduce((s, [i, j]) => s + at(i, j), 0) / teeCorners.length;
      for (const [i, j] of teeCorners) set(i, j, U.lerp(at(i, j), avg + 0.3, adjCount(i, j, 'E') / 4));
    }

    // 3) green: tilted plane + small rolls, blended in at the edge
    const greenCorners = [];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (adjCount(i, j, 'G')) greenCorners.push([i, j]);
    if (greenCorners.length) {
      const avg = greenCorners.reduce((s, [i, j]) => s + at(i, j), 0) / greenCorners.length;
      for (const [i, j] of greenCorners) {
        const x = i * 4, y = j * 4;
        // slope vector (ax, ay) points downhill, so height falls along it
        const g = avg - GREEN_TILT * (sl.ax * (x - pin.x) + sl.ay * (y - pin.y))
          - GREEN_TILT * sl.k * 2 * (Math.sin(x * 0.25 + sl.ph * 1.3) + Math.sin(y * 0.25 + sl.ph));
        set(i, j, U.lerp(at(i, j), g, adjCount(i, j, 'G') / 4));
      }
    }

    // 4) bunkers sink a little
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const n = adjCount(i, j, 'S');
      if (n) set(i, j, at(i, j) - n / 4 * 0.5);
    }

    // 5) ponds: flatten each pond to just below its lowest shore
    const seen = new Uint8Array(hole.w * hole.h);
    for (let k = 0; k < hole.w * hole.h; k++) {
      if (hole.tiles[k] !== 'W' || seen[k]) continue;
      const q = [k], corners = new Set();
      seen[k] = 1;
      for (let qi = 0; qi < q.length; qi++) {
        const c = q[qi], i = c % hole.w, j = (c - i) / hole.w;
        for (const [ci, cj] of [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]]) corners.add(cj * W + ci);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = i + di, nj = j + dj, nk = nj * hole.w + ni;
          if (ni >= 0 && nj >= 0 && ni < hole.w && nj < hole.h && hole.tiles[nk] === 'W' && !seen[nk]) { seen[nk] = 1; q.push(nk); }
        }
      }
      let lvl = Infinity;
      corners.forEach(c => { lvl = Math.min(lvl, hs[c]); });
      corners.forEach(c => {
        const i = c % W, j = (c - i) / W, n = adjCount(i, j, 'W');
        hs[c] = n === 4 ? lvl - 1.2 : Math.min(hs[c], lvl - 0.2);
      });
    }
    // 5b) cart path: a proper road. Its height follows a smoothed, gentle centre-line profile, and every
    // point across its width takes the centre height, so it never tilts to the side (zero roll).
    // Bridges ride level over ponds; the verge blends back into the land.
    if (hole.path && hole.path.length > 1) {
      const P = hole.path, cum = [0];
      for (let k = 1; k < P.length; k++) cum.push(cum[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
      const total = cum[cum.length - 1];
      const bil = (x, y) => {
        const fx = U.clamp(x / 4, 0, W - 1.001), fy = U.clamp(y / 4, 0, H - 1.001), i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
        return (hs[j * W + i] * (1 - u) + hs[j * W + i + 1] * u) * (1 - v) + (hs[(j + 1) * W + i] * (1 - u) + hs[(j + 1) * W + i + 1] * u) * v;
      };
      const pointAt = sd => { let k = 1; while (k < cum.length - 1 && cum[k] < sd) k++; const u = (sd - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1); return [P[k - 1][0] + (P[k][0] - P[k - 1][0]) * u, P[k - 1][1] + (P[k][1] - P[k - 1][1]) * u]; };
      const STEP = 2, n = Math.max(2, Math.ceil(total / STEP) + 1), prof = new Float32Array(n);
      for (let k = 0; k < n; k++) { const [x, y] = pointAt(Math.min(total, k * STEP)); prof[k] = bil(x, y); }
      // smooth the profile, then cap the grade so carts can always climb it
      for (let pass = 0; pass < 4; pass++) { const c2 = prof.slice(); for (let k = 0; k < n; k++) { let sum = 0, m = 0; for (let d = -4; d <= 4; d++) { const kk = k + d; if (kk >= 0 && kk < n) { sum += c2[kk]; m++; } } prof[k] = sum / m; } }
      const G = 0.32 * STEP;
      for (let k = 1; k < n; k++) prof[k] = U.clamp(prof[k], prof[k - 1] - G, prof[k - 1] + G);
      for (let k = n - 2; k >= 0; k--) prof[k] = U.clamp(prof[k], prof[k + 1] - G, prof[k + 1] + G);
      const profAt = sd => { const f = U.clamp(sd / STEP, 0, n - 1), k = Math.min(n - 2, Math.floor(f)), u = f - k; return prof[k] * (1 - u) + prof[k + 1] * u; };
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const x = i * 4, y = j * 4;
        let best = 1e9, bs = 0;
        for (let k = 1; k < P.length; k++) {
          const ax = P[k - 1][0], ay = P[k - 1][1], dx = P[k][0] - ax, dy = P[k][1] - ay, l2 = dx * dx + dy * dy || 1;
          const u = U.clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1), d = Math.hypot(x - ax - dx * u, y - ay - dy * u);
          if (d < best) { best = d; bs = cum[k - 1] + Math.sqrt(l2) * u; }
        }
        // greens and the middle of the tee box keep their own shape; everything else near the road levels out
        // greens and the tee box keep their shape, unless the road itself runs over that corner
        if (best > 15 || (best > 3.5 && (adjCount(i, j, 'G') >= 3 || adjCount(i, j, 'E') >= 3))) continue;
        const hp = profAt(bs), k = j * W + i;
        hs[k] = best <= 8.5 ? hp : U.lerp(hp, hs[k], smooth(8.5, 15, best));
      }
    }

    // 6) seal the border: ponds, bunkers, path leveling and sculpting can all pull the edge away from
    // ground level, which opens a gap to the land outside (and lets you see under the map).
    // Pin the outer ring to 0 and ease the next two rings toward it.
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const ring = Math.min(i, j, W - 1 - i, H - 1 - j);
      if (ring === 0) hs[j * W + i] = 0;
      else if (ring === 1) hs[j * W + i] *= 0.35;
      else if (ring === 2) hs[j * W + i] *= 0.75;
    }
    return { hs, W, H };
  }

  TU.terrain = {
    GREEN_TILT,
    get(hole) {
      let t = cache.get(hole);
      if (!t) { t = build(hole); cache.set(hole, t); }
      return t;
    },
    heightAt(hole, x, y) {
      const { hs, W } = this.get(hole);
      const fx = U.clamp(x / 4, 0, hole.w - 0.001), fy = U.clamp(y / 4, 0, hole.h - 0.001);
      const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
      // Same two triangles the meshes draw (split along the u + v = 1 diagonal), so what you
      // see is exactly what the ball, cart and golfer stand on.
      const h00 = hs[j * W + i], h10 = hs[j * W + i + 1], h01 = hs[(j + 1) * W + i], h11 = hs[(j + 1) * W + i + 1];
      if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
      return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
    },
    // Uphill gradient (dh/dx, dh/dy).
    grad(hole, x, y) {
      const e = 0.5;
      return {
        x: (this.heightAt(hole, x + e, y) - this.heightAt(hole, x - e, y)) / (2 * e),
        y: (this.heightAt(hole, x, y + e) - this.heightAt(hole, x, y - e)) / (2 * e),
      };
    },
  };
})();
