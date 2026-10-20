// Procedural hole generator. Output format is shared with the Architect editor.
// Tiles (4 yards each): O out of bounds, T trees, R rough, F fairway, S sand, W water, G green, E tee box, P cart path.
(function () {
  TU.TILE = 4;

  TU.holegen = function (opts) {
    const o = Object.assign({ seed: 1, par: 4, length: 360, fw: 16, dogleg: 0, bunkers: 2, water: 0, trees: 0.55, greenDiff: 0.5, name: 'Hole' }, opts);
    const U = TU.util, rnd = U.rng(o.seed), T = TU.TILE;
    const shape = o.par === 3 ? 'straight' : (o.shape || 'straight');
    const shaped = shape !== 'straight';
    const w = o.width || (shaped ? 76 : 44), Wy = w * T, margin = 40, side0 = 40;
    const L = o.length, mir = rnd() < 0.5 ? 1 : -1;
    // the centre line ("spine") of the hole as a polyline from the tee to the green
    let spine, Hy;
    const x0 = mir > 0 ? side0 + 14 : Wy - side0 - 14, span = Wy - side0 * 2 - 28;
    if (shape === 'L') {
      // up one side, then a hard turn across to the green
      const b = Math.min(L * 0.45, span), a = L - b;
      Hy = a + margin * 2;
      spine = [[x0, Hy - margin], [x0, margin + 8], [x0 + mir * b, margin + 8]];
    } else if (shape === 'S') {
      // up, across, up again: two bends
      const b = Math.min(L * 0.38, span), a1 = (L - b) * 0.45, a2 = L - b - a1;
      Hy = a1 + a2 + margin * 2;
      spine = [[x0, Hy - margin], [x0, Hy - margin - a1], [x0 + mir * b, Hy - margin - a1], [x0 + mir * b, margin]];
    } else if (shape === 'Z') {
      // a zig-zag: three diagonal legs back and forth across the property
      const leg = L / 3, dx = Math.min(span, leg * 0.8), dy = Math.sqrt(Math.max(400, leg * leg - dx * dx));
      Hy = dy * 3 + margin * 2;
      const xa = x0, xb = x0 + mir * dx;
      spine = [[xa, Hy - margin], [xb, Hy - margin - dy], [xa, Hy - margin - dy * 2], [xb, margin]];
    } else if (shape === 'wide') {
      // a big wide hole split down the middle: two routes either side of a hazard
      Hy = L + margin * 2;
      spine = [[Wy / 2, Hy - margin], [Wy / 2 + mir * 10, Hy / 2], [Wy / 2, margin + 4]];
    } else {
      Hy = L + margin * 2;
      const cl = v => U.clamp(v, 34, Wy - 34);
      const tee0 = { x: cl(Wy / 2 - o.dogleg * 20 + (rnd() - 0.5) * 16), y: Hy - margin };
      const gc0 = { x: cl(Wy / 2 + o.dogleg * 22 + (rnd() - 0.5) * 12), y: margin + 4 };
      const ctrl = { x: cl(Wy / 2 + o.dogleg * 75), y: (tee0.y + gc0.y) / 2 };
      spine = [];
      for (let i = 0; i <= 24; i++) { const t = i / 24, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t; spine.push([a * tee0.x + b * ctrl.x + c * gc0.x, a * tee0.y + b * ctrl.y + c * gc0.y]); }
    }
    const h = Math.ceil(Hy / T);
    Hy = h * T;
    const corners = shaped && shape !== 'wide' ? spine.slice(1, -1).map(([x, y]) => ({ x, y })) : [];
    // round the bends a little (Chaikin), then resample evenly by length
    let sm = spine.map(([x, y]) => ({ x, y }));
    if (shaped) for (let it = 0; it < 3; it++) {
      const out = [sm[0]];
      for (let i = 0; i < sm.length - 1; i++) { const a = sm[i], b = sm[i + 1]; out.push({ x: a.x * 0.8 + b.x * 0.2, y: a.y * 0.8 + b.y * 0.2 }, { x: a.x * 0.2 + b.x * 0.8, y: a.y * 0.2 + b.y * 0.8 }); }
      out.push(sm[sm.length - 1]); sm = out;
    }
    const cum = [0];
    for (let i = 1; i < sm.length; i++) cum.push(cum[i - 1] + U.dist(sm[i], sm[i - 1]));
    const N = 160, pts = [], total = cum[cum.length - 1];
    for (let i = 0, k = 1; i <= N; i++) {
      const sd = total * i / N;
      while (k < cum.length - 1 && cum[k] < sd) k++;
      const a = sm[k - 1], b = sm[k], u = (sd - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1);
      pts.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, t: i / N });
    }
    const tee = { x: pts[0].x, y: pts[0].y }, gc = { x: pts[N].x, y: pts[N].y + (shape === 'L' ? 0 : 0) };
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += U.dist(pts[i], pts[i - 1]);

    const tiles = new Array(w * h).fill('R');
    const set = (i, j, v) => { if (i >= 0 && j >= 0 && i < w && j < h) tiles[j * w + i] = v; };
    const get = (i, j) => tiles[j * w + i];
    const nearest = (x, y, list) => {
      let best = 1e9, bt = 0;
      for (const p of list) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < best) { best = d; bt = p.t; } }
      return [Math.sqrt(best), bt];
    };
    const fwStart = o.par === 3 ? 2 : 0.16;
    const roughW = 12;

    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const x = i * T + 2, y = j * T + 2;
      if (x < 8 || x > Wy - 8 || y < 8 || y > Hy - 8) { set(i, j, 'O'); continue; }
      const [d, t] = nearest(x, y, pts);
      const fw = o.fw * (shape === 'wide' ? 2.3 : 1) * (0.85 + 0.3 * U.noise(t * 6, 0, o.seed));
      if (d < fw && t > fwStart && t < 0.95) set(i, j, 'F');
      else if (d < fw + roughW) set(i, j, 'R');
      else set(i, j, U.noise(x * 0.06, y * 0.06, o.seed + 7) < o.trees + 0.15 ? 'T' : 'R');
    }

    // Shortcuts: across the inside of each bend, the woods give way to a hazard you can try to carry
    // (water or sand with patches of rough) - play it safe round the corner or go for it.
    const segDist = (px, py, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1, u = U.clamp(((px - a.x) * dx + (py - a.y) * dy) / l2, 0, 1); return Math.hypot(px - a.x - dx * u, py - a.y - dy * u); };
    const cuts = [];
    corners.forEach((cn, ci) => {
      // the centre-line points before and after this bend
      let kc = 0, bd = 1e9; pts.forEach((p, k) => { const d = U.dist(p, cn); if (d < bd) { bd = d; kc = k; } });
      const A = pts[Math.max(0, kc - 26)], B = pts[Math.min(N, kc + 26)];
      const useWater = o.water > 0 || ci % 2 === 1;
      cuts.push({ A, B, kind: useWater ? 'W' : 'S' });
    });
    if (shape === 'wide') {
      // the hazard down the middle splits it into a left and a right route
      const A = pts[Math.floor(N * 0.3)], B = pts[Math.floor(N * 0.72)];
      cuts.push({ A, B, kind: o.water > 0 ? 'W' : 'T', mid: true });
    }
    for (const cu of cuts) for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const x = i * T + 2, y = j * T + 2, t0 = get(i, j);
      if (t0 === 'O') continue;
      const dCut = segDist(x, y, cu.A, cu.B), [dSp] = nearest(x, y, pts);
      if (cu.mid) {
        // a long island in the middle of the wide fairway
        if (dCut < 13 + 4 * U.noise(x * 0.1, y * 0.1, o.seed + 11)) set(i, j, cu.kind);
        continue;
      }
      if (dCut < 16 && dSp > o.fw + 3) {
        const n = U.noise(x * 0.12, y * 0.12, o.seed + 9);
        set(i, j, n < 0.62 ? cu.kind : n < 0.8 ? 'R' : 'S');
      }
    }

    // Cart path offset to one side.
    const side = rnd() < 0.5 ? -1 : 1;
    const off = o.fw + roughW * 0.6;
    // control points: start beside the tee, then follow the hole offset to one side
    let ctrlPts = [{ x: tee.x + 12 * side, y: tee.y + 10 }]; // starts a little way off the tee box
    for (let i = 8; i < pts.length; i += 8) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      ctrlPts.push({ x: pts[i].x + (-dy / l) * off * side, y: pts[i].y + (dx / l) * off * side });
    }
    // Chaikin smoothing gives one long flowing curve instead of corners
    for (let it = 0; it < 4; it++) {
      const out = [ctrlPts[0]];
      for (let i = 0; i < ctrlPts.length - 1; i++) {
        const a = ctrlPts[i], b = ctrlPts[i + 1];
        out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
      }
      out.push(ctrlPts[ctrlPts.length - 1]);
      ctrlPts = out;
    }
    const path = ctrlPts.map(p => ({ x: p.x, y: p.y, t: 0 }));

    const blob = (cx, cy, r, v, keep) => {
      for (let j = Math.floor((cy - r) / T); j <= Math.ceil((cy + r) / T); j++)
        for (let i = Math.floor((cx - r) / T); i <= Math.ceil((cx + r) / T); i++) {
          if (i < 0 || j < 0 || i >= w || j >= h) continue;
          const x = i * T + 2, y = j * T + 2;
          const wob = 1 + 0.25 * (U.noise(x * 0.2, y * 0.2, o.seed + 3) - 0.5);
          if ((x - cx) ** 2 + (y - cy) ** 2 < (r * wob) ** 2 && !keep.includes(get(i, j))) set(i, j, v);
        }
    };

    // Water ponds on the side opposite the path.
    for (let k = 0; k < o.water; k++) {
      const p = pts[Math.floor(N * (0.3 + rnd() * 0.35))];
      blob(p.x - side * (o.fw + 6 + rnd() * 8), p.y, 10 + rnd() * 8, 'W', ['O']);
    }
    if (o.creek) {
      const p = pts[Math.floor(N * 0.45)];
      for (let i = 0; i < w; i++) for (let dj = -1; dj <= 0; dj++) {
        const j = Math.floor(p.y / T) + dj + Math.round(Math.sin(i * 0.4) * 1);
        if (j > 0 && j < h && get(i, j) !== 'O') set(i, j, 'W');
      }
    }

    // Path tiles (bridges over water), with a dry bank either side so no lake creeps onto the road.
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (get(i, j) === 'O') continue;
      const [d] = nearest(i * T + 2, j * T + 2, path);
      if (d < 2.6) set(i, j, 'P');
      else if (d < 8 && get(i, j) === 'W') set(i, j, 'R');
    }

    // Green.
    const rx = 12 + rnd() * 3, ry = 10 + rnd() * 3;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const x = i * T + 2, y = j * T + 2;
      const e = ((x - gc.x) / rx) ** 2 + ((y - gc.y) / ry) ** 2;
      if (e < 1) set(i, j, 'G');
      else if (e < 3.2 && get(i, j) === 'T') set(i, j, 'R');
    }

    // Bunkers.
    for (let k = 0; k < o.bunkers; k++) {
      if (k % 2 === 0) {
        const a = rnd() * Math.PI * 2;
        blob(gc.x + Math.cos(a) * (rx + 5), gc.y + Math.sin(a) * (ry + 5), 4 + rnd() * 3, 'S', ['G', 'P', 'O', 'W']);
      } else {
        const p = pts[Math.floor(N * (0.5 + rnd() * 0.3))];
        blob(p.x + (rnd() < 0.5 ? -1 : 1) * o.fw, p.y, 5 + rnd() * 3, 'S', ['G', 'P', 'O', 'W']);
      }
    }

    // Tee box.
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const x = i * T + 2, y = j * T + 2;
      if (Math.abs(x - tee.x) < 7 && Math.abs(y - tee.y) < 6) set(i, j, 'E');
    }

    // drop tiny puddles: any patch of water smaller than a small pond turns back into rough
    {
      const seen = new Uint8Array(w * h);
      for (let k = 0; k < w * h; k++) {
        if (tiles[k] !== 'W' || seen[k]) continue;
        const q = [k]; seen[k] = 1;
        for (let qi = 0; qi < q.length; qi++) {
          const c = q[qi], i = c % w, j = (c - i) / w;
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = i + di, nj = j + dj, nk = nj * w + ni; if (ni >= 0 && nj >= 0 && ni < w && nj < h && tiles[nk] === 'W' && !seen[nk]) { seen[nk] = 1; q.push(nk); } }
        }
        if (q.length < 6) for (const c of q) tiles[c] = 'R';
      }
    }
    const pa = rnd() * Math.PI * 2, pr = rnd() * 0.6;
    const pin = { x: gc.x + Math.cos(pa) * (rx - 4) * pr, y: gc.y + Math.sin(pa) * (ry - 4) * pr };
    const gd = o.greenDiff;
    return {
      name: o.name, par: o.par, w, h,
      terrain: o.terrain || { hills: 0.5, teeLift: 0 },
      tiles: tiles.join(''),
      tee: { x: tee.x, y: tee.y }, pin,
      slope: { ax: (rnd() - 0.5) * 1.4 * gd, ay: (rnd() - 0.5) * 1.4 * gd, k: 0.35 * gd, ph: rnd() * 6 },
      yards: Math.round(len - Math.hypot(pin.x - gc.x, pin.y - gc.y) * 0.5),
      path: path.filter((p, i) => i % 3 === 0 || i === path.length - 1).map(p => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]),
      spine: pts.filter((p, i) => i % 6 === 0 || i === N).map(p => [Math.round(p.x), Math.round(p.y)]),
      fwWidth: o.fw * (shape === 'wide' ? 2.3 : 1), shape,
    };
  };
})();
