// Ball physics: shot planning, flight, roll, slopes, cup.
(function () {
  const U = TU.util;
  const TERRAIN = {
    E: { name: 'Tee Box', friction: 5, bounce: 1, lie: 1, spread: 1 },
    F: { name: 'Fairway', friction: 5, bounce: 1, lie: 1, spread: 1 },
    R: { name: 'Rough', friction: 14, bounce: 0.35, lie: 0.82, spread: 1.5 },
    S: { name: 'Bunker', friction: 60, bounce: 0, lie: 0.5, spread: 2.6 },
    G: { name: 'Green', friction: 1.8, bounce: 0.8, lie: 1, spread: 1 },
    P: { name: 'Cart Path', friction: 3, bounce: 1.5, lie: 0.95, spread: 1.2 },
    T: { name: 'Trees', friction: 20, bounce: 0.1, lie: 0.5, spread: 2.5 },
    W: { name: 'Water', friction: 99, bounce: 0, lie: 0, spread: 1 },
    O: { name: 'Out of Bounds', friction: 99, bounce: 0, lie: 0, spread: 1 },
  };
  const SLOPE_G = 1.1;
  const CUP_R = 0.32;      // generous cup (about 1 ft)
  const PULL_R = 0.75;     // slow balls inside this get pulled toward the cup
  const TAP_IN = 0.7;      // a ball stopping this close is tapped in automatically (about 2 ft)
  const PUTT_MAX = 30;

  const colCache = new WeakMap();
  const FOREST_DEPTH = 3; // tiles (12 yds) into the woods before it becomes impassable
  const TREE_R = 0.5;

  // Ball flight height for irons and wedges: apex height, carry, roll-out and wind exposure.
  const TRAJ = {
    low: { label: 'LOW', apex: 0.6, carry: 0.94, roll: 1.9, wind: 0.6 },
    mid: { label: 'MID', apex: 1, carry: 1, roll: 1, wind: 1 },
    high: { label: 'HIGH', apex: 1.5, carry: 0.96, roll: 0.35, wind: 1.35 },
  };

  const Ph = TU.physics = {
    TRAJ,
    TERRAIN, PUTT_MAX, TAP_IN,
    tileAt(hole, x, y) {
      const i = Math.floor(x / TU.TILE), j = Math.floor(y / TU.TILE);
      if (i < 0 || j < 0 || i >= hole.w || j >= hole.h) return 'O';
      return hole.tiles[j * hole.w + i];
    },
    hasTree(hole, x, y) {
      const i = Math.floor(x / TU.TILE), j = Math.floor(y / TU.TILE);
      return Ph.tileAt(hole, x, y) === 'T' && U.hash(i, j, 5) > 0.15;
    },
    // Per-hole collision data: how deep each tree tile is inside the forest, and a tree lookup grid.
    collision(hole) {
      let c = colCache.get(hole);
      if (c) return c;
      const w = hole.w, h = hole.h, depth = new Uint8Array(w * h).fill(255), q = [];
      for (let k = 0; k < w * h; k++) { const t = hole.tiles[k]; if (t !== 'T' && t !== 'O') { depth[k] = 0; q.push(k); } }
      for (let qi = 0; qi < q.length; qi++) {
        const k = q[qi], i = k % w, j = (k - i) / w;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
          const nk = nj * w + ni;
          if (hole.tiles[nk] === 'T' && depth[nk] === 255) { depth[nk] = depth[k] + 1; q.push(nk); }
        }
      }
      const grid = new Map();
      for (const t of TU.holeRender.get(hole).trees) {
        const k = Math.floor(t.y / TU.TILE) * w + Math.floor(t.x / TU.TILE);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(t);
      }
      c = { depth, grid };
      colCache.set(hole, c);
      return c;
    },
    deepForest(hole, x, y) {
      const i = Math.floor(x / TU.TILE), j = Math.floor(y / TU.TILE);
      if (i < 0 || j < 0 || i >= hole.w || j >= hole.h) return false;
      const k = j * hole.w + i;
      return hole.tiles[k] === 'T' && Ph.collision(hole).depth[k] >= FOREST_DEPTH;
    },
    // Tree whose trunk overlaps a circle of radius r at (x, y), or null.
    treeAt(hole, x, y, r) {
      const g = Ph.collision(hole).grid, i0 = Math.floor(x / TU.TILE), j0 = Math.floor(y / TU.TILE);
      for (let j = j0 - 1; j <= j0 + 1; j++) for (let i = i0 - 1; i <= i0 + 1; i++) {
        const list = g.get(j * hole.w + i);
        if (list) for (const t of list) if (Math.hypot(t.x - x, t.y - y) < r + TREE_R) return t;
      }
      return null;
    },
    // Downhill slope from the 3D terrain, scaled so 1.0 is a strong green break.
    slopeAt(hole, x, y) {
      const g = TU.terrain.grad(hole, x, y), k = 1 / TU.terrain.GREEN_TILT;
      return { x: -g.x * k, y: -g.y * k };
    },
    groundAt(hole, x, y) { return TU.terrain.heightAt(hole, x, y); },
    randomWind(max) {
      return { speed: Math.round(Math.random() * max), dir: Math.random() * Math.PI * 2 };
    },
    lieMod(club, lie) {
      if (lie === 'S' && club.wedge) return 0.8;
      return TERRAIN[lie] ? TERRAIN[lie].lie : 1;
    },
    // Expected carry for aim preview (no randomness).
    expectedCarry(club, set, lie, power = 1) {
      return club.carry * set.dist * Ph.lieMod(club, lie) * power;
    },

    // accErr: signed accuracy from swing meter (-1.5..1.5), 0 = perfect. Positive = hook (left).
    planShot({ hole, from, aim, club, set, power, accErr, lie, wind, mods = {}, traj = 'mid' }) {
      const tj = TRAJ[traj] || TRAJ.mid;
      const T = TERRAIN[lie] || TERRAIN.F;
      let D = club.carry * set.dist * Ph.lieMod(club, lie) * power * (mods.power || 1) * tj.carry;
      // sand: contact is never clean. Wedges sometimes, other clubs often, catch it fat and barely move it
      let fat = false;
      if (lie === 'S') {
        if (Math.random() < (club.wedge ? 0.18 : 0.4)) { fat = true; D *= 0.25 + Math.random() * 0.3; }
        else D *= 0.8 + Math.random() * 0.25;
      }
      const over = Math.max(0, power - 1) * 10;
      const sigma = club.spread * set.acc * T.spread * 0.5 * (mods.accuracy || 1) * (1 + over);
      const dirA = aim + U.gauss() * sigma * Math.PI / 180;
      const curveDeg = -accErr * 12; // accErr is 0 for a PERFECT strike
      const dir = U.dirVec(dirA), perp = { x: -dir.y, y: dir.x };
      const L = D * Math.tan(curveDeg * Math.PI / 180);
      const Tf = (1 + D / 70) * (0.85 + 0.15 * tj.apex);
      const wk = 0.35 * Tf * (0.6 + club.loft * tj.apex * 1.5) * (mods.wind || 1) * tj.wind;
      const wv = U.dirVec(wind.dir);
      return {
        from: { ...from }, h0: Ph.groundAt(hole, from.x, from.y), dir, perp, D, L, T: Tf, apex: D * club.loft * tj.apex, rollMul: tj.roll, club,
        drift: { x: wv.x * wind.speed * wk, y: wv.y * wind.speed * wk },
        t: 0, fat,
      };
    },
    flightPos(f, u) {
      return {
        x: f.from.x + f.dir.x * f.D * u + f.perp.x * f.L * u * u + f.drift.x * Math.pow(u, 1.5),
        y: f.from.y + f.dir.y * f.D * u + f.perp.y * f.L * u * u + f.drift.y * Math.pow(u, 1.5),
        z: 4 * f.apex * u * (1 - u),
      };
    },
    // Starts the roll after landing at flight progress u. Returns velocity.
    landingVelocity(f, tile, set, u = 1) {
      const a = Ph.flightPos(f, u - 0.03), b = Ph.flightPos(f, u);
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const T = TERRAIN[tile];
      let rd = f.D * f.club.roll * T.bounce * (f.rollMul || 1);
      if (tile === 'G') rd *= 1 - set.spin * 0.6;
      const v0 = Math.sqrt(2 * T.friction * rd);
      return { vx: (b.x - a.x) / l * v0, vy: (b.y - a.y) / l * v0 };
    },
    // Putt scale: the meter's full bar covers a bit more than the distance to the hole.
    puttScale(dist) { return U.clamp(dist * 1.6, 6, PUTT_MAX); },
    puttVelocity(aim, d) {
      const v0 = Math.sqrt(2 * TERRAIN.G.friction * d);
      const dv = U.dirVec(aim);
      return { vx: dv.x * v0, vy: dv.y * v0 };
    },
    // One roll step. ball: {x,y,vx,vy}. Returns null | 'stopped' | 'water' | 'oob' | 'holed'.
    // slopeFn lets the caddy's (possibly wrong) green read drive the putt preview
    rollStep(b, hole, dt, slopeFn = Ph.slopeAt) {
      const t = Ph.tileAt(hole, b.x, b.y);
      if (t === 'W') return 'water';
      if (t === 'O') return 'oob';
      if (t !== 'S') {
        // gravity pulls the ball downhill everywhere (sand grabs it)
        const s = slopeFn(hole, b.x, b.y), m = Math.hypot(s.x, s.y), cap = m > 7 ? 7 / m : 1;
        b.vx += s.x * SLOPE_G * cap * dt;
        b.vy += s.y * SLOPE_G * cap * dt;
      }
      let sp = Math.hypot(b.vx, b.vy);
      const dec = TERRAIN[t].friction * dt;
      if (sp <= dec) { b.vx = b.vy = 0; sp = 0; }
      else { b.vx *= (sp - dec) / sp; b.vy *= (sp - dec) / sp; sp -= dec; }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const dp = Math.hypot(b.x - hole.pin.x, b.y - hole.pin.y);
      if (dp < PULL_R && sp < 3 && dp > 0.01) {
        b.vx += (hole.pin.x - b.x) / dp * 2.5 * dt;
        b.vy += (hole.pin.y - b.y) / dp * 2.5 * dt;
      }
      if (dp < CUP_R) {
        if (sp < 5) { b.x = hole.pin.x; b.y = hole.pin.y; b.vx = b.vy = 0; return 'holed'; }
        // lip out: deflect and slow down
        const ang = (Math.random() - 0.5) * 1.2, c = Math.cos(ang), s2 = Math.sin(ang);
        const vx = b.vx * c - b.vy * s2, vy = b.vx * s2 + b.vy * c;
        b.vx = vx * 0.6; b.vy = vy * 0.6;
      }
      if (sp < 0.05) return 'stopped';
      return null;
    },
    // Predicted putt path (game coords) for a straight putt of distance d at angle aim.
    simulatePutt(hole, from, aim, d, slope) {
      const v = Ph.puttVelocity(aim, d), b = { x: from.x, y: from.y, vx: v.vx, vy: v.vy }, pts = [];
      const fn = slope ? (h, x, y) => slope(x, y) : Ph.slopeAt;
      for (let i = 0; i < 900; i++) {
        const r = Ph.rollStep(b, hole, 1 / 120, fn);
        if (i % 8 === 0) pts.push({ x: b.x, y: b.y });
        if (r) break;
      }
      return pts;
    },
  };
})();
