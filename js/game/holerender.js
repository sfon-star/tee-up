// Pre-renders a hole into ground textures:
// - pixel texture (2 px per yard) used by the pixelated style and the minimap
// Cart paths are drawn from the hole's smooth path polyline when it has one.
(function () {
  const PPT = 8; // pixels per tile in the pixel texture
  const cache = new WeakMap();
  const pack = (r, g, b) => (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
  const clampB = v => v < 0 ? 0 : v > 255 ? 255 : v | 0;
  const C = (r, g, b, n, amt) => pack(clampB(r + (n - 0.5) * amt), clampB(g + (n - 0.5) * amt), clampB(b + (n - 0.5) * amt));

  // Distance (yards) from every pixel to the path polyline, at `ppy` pixels per yard.
  function pathDistance(hole, w, h, ppy) {
    const dist = new Float32Array(w * h).fill(99);
    const pts = hole.path;
    if (!pts) return dist;
    const R = 3;
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
      const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - R) * ppy)), x1 = Math.min(w - 1, Math.ceil((Math.max(ax, bx) + R) * ppy));
      const y0 = Math.max(0, Math.floor((Math.min(ay, by) - R) * ppy)), y1 = Math.min(h - 1, Math.ceil((Math.max(ay, by) + R) * ppy));
      for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
        const x = (px + 0.5) / ppy, y = (py + 0.5) / ppy;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
        const d = Math.hypot(x - ax - dx * t, y - ay - dy * t), i = py * w + px;
        if (d < dist[i]) dist[i] = d;
      }
    }
    return dist;
  }
  const PATH_W = 2.3;

  // Terrain type lookup with a smooth domain warp, so tile corners become rounded, organic shapes.
  function warpedLookup(hole) {
    const U = TU.util, Wy = hole.w * 4, Hy = hole.h * 4, gw = Wy + 2, gh = Hy + 2;
    const smoothPath = !!hole.path;
    const wxA = new Float32Array(gw * gh), wyA = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      wxA[j * gw + i] = (U.noise(i * 0.13, j * 0.13, 3) - 0.5) * 3.4;
      wyA[j * gw + i] = (U.noise(i * 0.13 + 40, j * 0.13, 4) - 0.5) * 3.4;
    }
    const warp = (arr, xx, yy) => {
      const i = Math.max(0, Math.min(gw - 2, xx | 0)), j = Math.max(0, Math.min(gh - 2, yy | 0)), u = xx - i, v = yy - j, k = j * gw + i;
      return arr[k] * (1 - u) * (1 - v) + arr[k + 1] * u * (1 - v) + arr[k + gw] * (1 - u) * v + arr[k + gw + 1] * u * v;
    };
    const raw = (xx, yy) => {
      const i = Math.floor(xx / 4), j = Math.floor(yy / 4);
      const t = (i < 0 || j < 0 || i >= hole.w || j >= hole.h) ? 'O' : hole.tiles[j * hole.w + i];
      return smoothPath && t === 'P' ? 'R' : t;
    };
    // returns type at warped position, plus a helper testing whether a different type is within d yards
    return (xx, yy) => {
      const sx = xx + warp(wxA, xx, yy), sy = yy + warp(wyA, xx, yy);
      // majority vote over a small diamond rounds off square corners of small shapes
      let t = raw(sx, sy);
      const o = [raw(sx + 1.6, sy + 1.6), raw(sx - 1.6, sy + 1.6), raw(sx + 1.6, sy - 1.6), raw(sx - 1.6, sy - 1.6)];
      if (o.filter(v => v === t).length < 2) {
        for (const v of o) if (o.filter(u => u === v).length >= 3) { t = v; break; }
      }
      return { t, near: d => raw(sx + d, sy) !== t || raw(sx - d, sy) !== t || raw(sx, sy + d) !== t || raw(sx, sy - d) !== t };
    };
  }

  TU.holeRender = {
    PPY: 2,
    get(hole) {
      let t = cache.get(hole);
      if (!t) { t = this.build(hole); cache.set(hole, t); }
      return t;
    },
    invalidate(hole) { cache.delete(hole); },
    // Terrain type with the same rounded edges the textures use (visual only; physics stays per tile).
    typeAt(hole, x, y) { return this.lookAt(hole, x, y).t; },
    // { t, near(d) } at (x, y): type plus a test for a different type within d yards.
    lookAt(hole, x, y) {
      const b = this.get(hole);
      if (!b.look) b.look = warpedLookup(hole);
      return b.look(x, y);
    },
    // True when (x, y) in yards is on the cart path.
    onPath(hole, x, y) {
      const t = this.get(hole);
      if (!hole.path) return TU.physics.tileAt(hole, x, y) === 'P';
      const px = Math.floor(x * 2), py = Math.floor(y * 2);
      if (px < 0 || py < 0 || px >= t.w || py >= t.h) return false;
      return t.pathDist[py * t.w + px] < PATH_W + 0.3;
    },
    build(hole) {
      const U = TU.util, w = hole.w * PPT, h = hole.h * PPT;
      const cv = TU.sprites.makeCanvas(w, h), x = cv.getContext('2d');
      const img = x.createImageData(w, h), u32 = new Uint32Array(img.data.buffer);
      const smoothPath = !!hole.path;
      const pathDist = pathDistance(hole, w, h, 2);
      // with a smooth path, the blocky 'P' tiles render as rough and the curve is drawn on top
      const tile = (i, j) => {
        const t = (i < 0 || j < 0 || i >= hole.w || j >= hole.h) ? 'O' : hole.tiles[j * hole.w + i];
        return smoothPath && t === 'P' ? 'R' : t;
      };

      const look = warpedLookup(hole);
      const desert = hole.theme === 'desert'; // sandy ground among the cacti instead of forest floor
      for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
        const L = look((px + 0.5) / 2, (py + 0.5) / 2);
        let t = L.t;
        const n = U.hash(px, py, 11);
        // edge: pixels (at 2 px/yard) to the nearest different terrain, capped at 3
        let edge = 9;
        if (t === 'G' || t === 'S' || t === 'W') edge = L.near(0.5) ? 0 : L.near(1) ? 1 : L.near(1.5) ? 2 : 9;
        const pd = pathDist[py * w + px];
        if (smoothPath && pd < PATH_W && t !== 'G' && t !== 'E') { t = 'P'; edge = pd > PATH_W - 0.5 ? 0 : 9; }
        let col;
        switch (t) {
          case 'F': col = ((py >> 4) & 1) ? C(104, 182, 74, n, 8) : C(94, 170, 66, n, 8); break;
          case 'E': col = (((px >> 2) + (py >> 2)) & 1) ? C(116, 194, 84, n, 6) : C(108, 186, 78, n, 6); break;
          case 'G':
            col = edge < 2 ? C(92, 168, 66, n, 6) : ((((px >> 2) + (py >> 2)) & 1) ? C(128, 210, 96, n, 5) : C(120, 202, 90, n, 5));
            break;
          case 'R': col = n > 0.93 ? pack(54, 116, 44) : n < 0.05 ? pack(88, 158, 66) : C(70, 140, 56, n, 10); break;
          case 'T': col = desert ? C(196, 162, 112, n, 10) : C(46, 100, 42, n, 10); break;
          case 'S':
            // raked sand: wavy furrows, with a darker lip at the edge
            col = edge < 1 ? pack(186, 160, 102) : ((py + Math.sin(px * 0.3) * 1.4) % 3 + 3) % 3 < 1 ? C(214, 192, 132, n, 6) : C(236, 216, 154, n, 8);
            break;
          case 'W':
            if (edge < 1) col = pack(206, 200, 150);
            else if (edge < 3) col = C(92, 166, 220, n, 8);
            else col = ((px + py * 3) % 11 === 0 && n > 0.5) ? pack(120, 180, 236) : C(56, 126, 204, n, 8);
            break;
          case 'P': col = edge < 1 ? pack(136, 128, 116) : C(182, 174, 160, n, 10); break;
          default: col = desert ? C(206, 170, 120, n, 10) : C(42, 88, 40, n, 10);
        }
        u32[py * w + px] = col;
      }
      x.putImageData(img, 0, 0);
      const ground = new Uint32Array(u32);

      // Trees, OOB stakes, tee markers.
      const trees = [];
      for (let j = 0; j < hole.h; j++) for (let i = 0; i < hole.w; i++) {
        const t = tile(i, j);
        if (t === 'T' && U.hash(i, j, 5) > 0.15) {
          const jx = Math.round((U.hash(i, j, 6) - 0.5) * 4), v = Math.floor(U.hash(i, j, 7) * 3);
          const bx = i * PPT + 4 + jx, by = j * PPT + 8;
          x.fillStyle = 'rgba(0,0,0,0.25)';
          x.fillRect(bx - 5, by - 2, 12, 3);
          x.drawImage(TU.sprites.trees[v], bx - 8, by - 22);
          trees.push({ x: (bx) / 2, y: (by - 1) / 2, v });
        }
        if (t === 'O' && (i + j) % 3 === 0 && [tile(i + 1, j), tile(i - 1, j), tile(i, j + 1), tile(i, j - 1)].some(n => n !== 'O')) {
          x.fillStyle = '#f4f4f4';
          x.fillRect(i * PPT + 3, j * PPT + 1, 2, 6);
        }
      }
      const tx = hole.tee.x * 2, ty = hole.tee.y * 2;
      x.fillStyle = '#ffffff';
      x.fillRect(tx - 10, ty - 1, 3, 3); x.fillRect(tx + 8, ty - 1, 3, 3);
      return { canvas: cv, ground, w, h, trees, pathDist };
    },

    // High resolution ground (4 px per yard) for the HIGH RES style: rounded hazard edges,
    // soft mowing stripes, green fringe, sand lip and subtle color variation.
    hd(hole) {
      const base = this.get(hole);
      if (base.hdCanvas) return base.hdCanvas;
      const U = TU.util, P = 4, w = hole.w * 4 * P, h = hole.h * 4 * P, desert = hole.theme === 'desert';
      const cv = TU.sprites.makeCanvas(w, h), x = cv.getContext('2d');
      const img = x.createImageData(w, h), u32 = new Uint32Array(img.data.buffer);
      for (let py = 0; py < h; py++) {
        const yy = (py + 0.5) / P;
        for (let px = 0; px < w; px++) {
          const xx = (px + 0.5) / P;
          const L = this.lookAt(hole, xx, yy), t = L.t;
          const n = U.hash(px, py, 21), lf = U.noise(xx * 0.05, yy * 0.05, 9) - 0.5, mf = U.noise(xx * 0.3, yy * 0.3, 10) - 0.5;
          let col;
          // holes with a smooth path get a separate road mesh, so the texture shows grass there;
          // older tile-painted paths are drawn here
          switch (t) {
            case 'P': col = C(196, 188, 172, n, 6); break;
            case 'F': {
              const stripe = Math.floor((yy + xx * 0.12) / 7) & 1;
              col = stripe ? C(108 + lf * 18 + mf * 6, 186 + lf * 14 + mf * 6, 78, n, 5) : C(97 + lf * 18 + mf * 6, 172 + lf * 14 + mf * 6, 69, n, 5);
              break;
            }
            case 'E': col = (Math.floor(yy / 2.5) & 1) ? C(118, 198, 88, n, 4) : C(109, 188, 81, n, 4); break;
            case 'G':
              if (L.near(1.4)) col = C(96 + mf * 8, 176 + mf * 8, 70, n, 4);
              else col = ((Math.floor(xx / 2.5) + Math.floor(yy / 2.5)) & 1) ? C(132, 214, 100, n, 3) : C(123, 205, 93, n, 3);
              break;
            case 'R': col = C(70 + lf * 22 + mf * 14, 140 + lf * 18 + mf * 14, 55, n, 12); break;
            case 'T': col = desert ? C(198 + lf * 14, 164 + lf * 12, 114, n, 10) : C(48 + lf * 14 + mf * 10, 100 + lf * 14 + mf * 10, 43, n, 12); break;
            case 'S': {
              // raked furrows that curve gently, a shadowed lip, and the odd footprint
              const fur = (((yy + Math.sin(xx * 0.55) * 0.7) % 1.3) + 1.3) % 1.3;
              const foot = U.hash(Math.floor(xx * 0.7), Math.floor(yy * 0.45), 23) > 0.985 && ((xx * 0.7) % 1) < 0.5;
              col = L.near(0.35) ? C(176, 150, 96, n, 5) : L.near(0.7) ? C(204, 180, 120, n, 6)
                : foot ? C(206, 184, 126, n, 4) : fur < 0.28 ? C(216 + mf * 8, 194 + mf * 8, 136, n, 5) : C(238 + mf * 10, 218 + mf * 10, 158, n, 8);
              break;
            }
            case 'W': col = L.near(0.5) ? C(150, 136, 96, n, 6) : L.near(1.2) ? C(110, 150, 120, n, 6) : C(42 + mf * 10, 100 + mf * 10, 170, n, 6); break; // wet shore, shallows, deep
            default: col = desert ? C(208 + lf * 12, 172 + lf * 10, 122, n, 10) : C(44 + lf * 14, 90 + lf * 14, 42, n, 10);
          }
          u32[py * w + px] = col;
        }
      }
      x.putImageData(img, 0, 0);
      base.hdCanvas = cv;
      return cv;
    },
  };
})();
