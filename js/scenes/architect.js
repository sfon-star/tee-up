// ARCHITECT: build your own courses.
// List screen: create (1, 9 or 18 holes), edit, play or delete saved courses.
// Editor: paint terrain tiles with a brush or fill, place the tee and the pin, set name / par /
// length / hills / green slope, undo, and test-play the hole straight away.
// Courses are stored in save.courses in an editable form; TU.architect.toPlayable() turns a
// hole into the same format the generator produces, so the rest of the game can play it.
(function () {
  const ui = TU.ui, input = TU.input, U = TU.util;
  const W = 44;
  // LARGE is a big chunky canvas: much wider as well as long, room for L, S and zig-zag holes
  const SIZES = { short: { label: 'SHORT', h: 63, w: 44, par: 3 }, medium: { label: 'MEDIUM', h: 110, w: 44, par: 4 }, long: { label: 'LONG', h: 145, w: 44, par: 5 }, large: { label: 'LARGE', h: 130, w: 76, par: 5 } };
  const HILLS = [['FLAT', 0], ['GENTLE', 0.3], ['ROLLING', 0.6], ['HILLY', 1.0]];
  const GREENS = [['FLAT', 0.15], ['GENTLE', 0.45], ['TRICKY', 0.9]];
  const TOOLS = [['F', 'FAIRWAY'], ['R', 'ROUGH'], ['G', 'GREEN'], ['S', 'SAND'], ['W', 'WATER'], ['T', 'TREES'], ['E', 'TEE BOX'], ['P', 'CART PATH'], ['O', 'OUT OF BOUNDS'], ['tee', 'TEE MARKER'], ['pin', 'PIN']];
  const COL = { F: '#5fb24a', R: '#468f39', G: '#7fd862', S: '#e6d395', W: '#3f86c8', T: '#2d6a2f', E: '#6cc055', P: '#b9b2a3', O: '#2b4f2a' };
  const SCULPT = [['raise', 'RAISE'], ['lower', 'LOWER'], ['smooth', 'SMOOTH'], ['flatten', 'FLATTEN']];
  const HMIN = -45, HMAX = 90; // sculpt range in yards: deep valleys to proper mountains
  const VX = 168, VY = 52, VW = 392, VH = 476;
  // sculpt heights live on tile corners: (w + 1) x (h + 1)
  const sculptOf = e => e.sculpt || (e.sculpt = new Array((e.w + 1) * (e.h + 1)).fill(0));
  // compact storage: quarter-yard steps packed into base64
  // (v2: two bytes per corner so heights can go far beyond the old +-31 yards)
  const enc = arr => {
    if (!arr || !arr.some(v => v)) return null;
    let str = '';
    for (const v of arr) { const q = (Math.max(-32000, Math.min(32000, Math.round(v * 4))) + 65536) % 65536; str += String.fromCharCode(q >> 8, q & 255); }
    return '2:' + btoa(str);
  };
  const dec = (str, n) => {
    const out = new Array(n).fill(0);
    if (!str) return out;
    if (str.startsWith('2:')) {
      const bin = atob(str.slice(2));
      for (let i = 0; i < n && i * 2 + 1 < bin.length; i++) { const q = (bin.charCodeAt(i * 2) << 8) | bin.charCodeAt(i * 2 + 1); out[i] = (q > 32767 ? q - 65536 : q) / 4; }
      return out;
    }
    const bin = atob(str);
    for (let i = 0; i < n && i < bin.length; i++) { const x = bin.charCodeAt(i); out[i] = (x > 127 ? x - 256 : x) / 4; }
    return out;
  };

  // ---------- hole data ----------
  const seed = () => Math.floor(Math.random() * 1e9);
  function blankHole(size, n) {
    const h = SIZES[size].h, W = SIZES[size].w || 44, t = new Array(W * h).fill('R');
    for (let j = 0; j < h; j++) for (let i = 0; i < W; i++) {
      if (i < 2 || i >= W - 2 || j < 2 || j >= h - 2) t[j * W + i] = 'O';
      const gx = (i + 0.5 - W / 2) / 3.3, gy = (j + 0.5 - 5) / 2.6;
      if (gx * gx + gy * gy < 1) t[j * W + i] = 'G';
      if (Math.abs(i + 0.5 - W / 2) < 2 && Math.abs(j + 0.5 - (h - 7)) < 1.5) t[j * W + i] = 'E';
    }
    return { name: `Hole ${n}`, par: SIZES[size].par, w: W, h, tiles: t, sculpt: new Array((W + 1) * (h + 1)).fill(0), tee: { x: W * 2, y: (h - 7) * 4 }, pin: { x: W * 2, y: 20 }, size, hillsLvl: 1, greenLvl: 1, seed: seed() };
  }
  function randomHole(size, n) {
    const r = Math.random, par = SIZES[size].par;
    const length = size === 'short' ? 140 + r() * 50 : size === 'medium' ? 320 + r() * 80 : size === 'large' ? 470 + r() * 80 : 460 + r() * 60;
    const sd = seed();
    // large holes get a shape: an L, an S or a zig-zag, with a risky shortcut across the bend
    const shape = size === 'large' ? ['L', 'S', 'Z', 'wide'][Math.floor(r() * 4)] : 'straight';
    const g = TU.holegen({ seed: sd, par, length: Math.round(length), fw: 14 + r() * 6, dogleg: (r() - 0.5) * 1.4, bunkers: 1 + Math.floor(r() * 3) + (size === 'large' ? 2 : 0), water: r() < 0.5 || size === 'large' ? 1 : 0, trees: 0.5, greenDiff: 0.5, shape, width: size === 'large' ? SIZES.large.w : 44 });
    return { name: `Hole ${n}`, par, w: g.w, h: g.h, tiles: g.tiles.split(''), sculpt: new Array((g.w + 1) * (g.h + 1)).fill(0), tee: { ...g.tee }, pin: { ...g.pin }, size, hillsLvl: 1, greenLvl: 1, seed: sd };
  }
  function slopeFor(e) {
    const r = U.rng(e.seed), gd = GREENS[e.greenLvl][1];
    return { ax: (r() - 0.5) * 1.4 * gd, ay: (r() - 0.5) * 1.4 * gd, k: 0.35 * gd, ph: r() * 6 };
  }
  const tileAt = (e, x, y) => { const i = Math.floor(x / 4), j = Math.floor(y / 4); return i < 0 || j < 0 || i >= e.w || j >= e.h ? 'O' : e.tiles[j * e.w + i]; };
  function problem(e) {
    if (tileAt(e, e.pin.x, e.pin.y) !== 'G') return 'Put the pin on the green.';
    const tt = tileAt(e, e.tee.x, e.tee.y);
    if (tt === 'W' || tt === 'O' || tt === 'T') return 'The tee must be on playable ground.';
    if (U.dist(e.tee, e.pin) < 40) return 'Move the tee further from the pin.';
    return null;
  }
  // Editable hole -> the playable format used everywhere else.
  function toPlayable(e, n, theme = 'country') {
    const tiles = Array.isArray(e.tiles) ? e.tiles.join('') : e.tiles;
    const sculpt = e.sculpt && e.sculpt.some(v => v) ? Float32Array.from(e.sculpt) : null;
    return { name: e.name, par: e.par, w: e.w, h: e.h, tiles, tee: { ...e.tee }, pin: { ...e.pin }, slope: slopeFor(e), terrain: { hills: HILLS[e.hillsLvl][1], teeLift: 0, sculpt }, yards: Math.round(U.dist(e.tee, e.pin)), number: n, theme };
  }
  const forSave = e => { const o = { ...e, tiles: e.tiles.join('') }; delete o.sculpt; const h = enc(e.sculpt); if (h) o.heights = h; return o; };
  const forEdit = e => { const o = { ...e, tiles: e.tiles.split(''), tee: { ...e.tee }, pin: { ...e.pin } }; delete o.heights; o.sculpt = dec(e.heights, (e.w + 1) * (e.h + 1)); return o; };

  TU.architect = {
    courses() { return TU.save.data.courses || (TU.save.data.courses = []); },
    // a saved course in the playable form (used by the course list and multiplayer)
    playable(c) { return { id: c.id, name: c.name, custom: true, holes: c.holes.map((h, i) => toPlayable(forEdit(h), i + 1, c.theme || 'country')) }; },
    problem: e => problem(Array.isArray(e.tiles) ? e : forEdit(e)),
  };

  TU.scenes.architect = {
    enter(p) {
      ui.nav = false;
      if (p.resume && this.mode === 'edit' && this.course) return; // back from a test round
      this.mode = 'list';
      this.course = null;
      this.confirm = null;
      this.listScroll = 0;
      this.msg = null;
    },
    say(text, bad) { this.msg = { text, bad, t: 3 }; },

    // ---------- list ----------
    newCourse(n) {
      const sizes = n === 1 ? ['medium'] : Array.from({ length: n }, (_, i) => ['medium', 'short', 'long', 'medium'][i % 4]);
      this.openEditor({ id: Date.now().toString(36), name: `My Course ${this.courseCount() + 1}`, holes: sizes.map((sz, i) => randomHole(sz, i + 1)) }, true);
    },
    courseCount() { return TU.architect.courses().length; },
    openEditor(c, fresh) {
      this.course = { id: c.id, name: c.name, theme: c.theme || 'country', holes: c.holes.map(h => (Array.isArray(h.tiles) ? h : forEdit(h))) };
      this.mode = 'edit';
      this.hi = 0; this.tool = 'F'; this.brush = 2; this.fill = false; this.zoom = 8; this.scrollY = 9999;
      this.undo = []; this.editing = null; this.dirty = !!fresh; this.leaveConfirm = 0;
    },
    playCourse(c) {
      const bad = c.holes.map((h, i) => [i, TU.architect.problem(h)]).find(([, p]) => p);
      if (bad) return this.say(`Hole ${bad[0] + 1}: ${bad[1]}`, true);
      const r = TU.Round.create({ course: TU.architect.playable(c), mode: 'test', windMax: 10 });
      r.returnTo = 'architect';
      this.mode = 'list';
      TU.go('play', { round: r });
    },
    drawList(c) {
      const list = TU.architect.courses();
      ui.text(c, 'ARCHITECT', 24, 16, { size: 22, color: '#c9a6ff' });
      ui.text(c, 'Design holes and courses, then play them.', 24, 50, { size: 8, color: '#cfe8d8' });
      [[1, 'NEW 1-HOLE'], [9, 'NEW 9-HOLE'], [18, 'NEW 18-HOLE']].forEach(([n, label], i) => {
        if (ui.button(c, 24 + i * 210, 74, 196, 44, label, { size: 10, color: '#7b5bb5' })) this.newCourse(n);
      });
      ui.panel(c, 24, 136, 912, 330, { fill: '#1b1530' });
      if (!list.length) ui.text(c, 'No courses yet. Start one above!', 480, 290, { size: 10, align: 'center', color: '#cfc4e6' });
      if (input.wheel) this.listScroll = U.clamp(this.listScroll + input.wheel, 0, Math.max(0, list.length - 6));
      list.slice(this.listScroll, this.listScroll + 6).forEach((cr, k) => {
        const i = k + this.listScroll, y = 146 + k * 52, par = cr.holes.reduce((a, h) => a + h.par, 0);
        ui.panel(c, 36, y, 888, 44, { fill: '#2a2145' });
        ui.text(c, cr.name.toUpperCase(), 52, y + 8, { size: 10 });
        ui.text(c, `${cr.holes.length} HOLE${cr.holes.length > 1 ? 'S' : ''}  -  PAR ${par}`, 52, y + 26, { size: 6, color: '#cfc4e6' });
        if (ui.button(c, 560, y + 6, 110, 32, 'EDIT', { size: 8, color: '#7b5bb5' })) this.openEditor(cr);
        if (ui.button(c, 682, y + 6, 110, 32, 'PLAY', { size: 8, color: '#2e9e5b' })) this.playCourse(cr);
        const sure = this.confirm === i;
        if (ui.button(c, 804, y + 6, 110, 32, sure ? 'SURE?' : 'DELETE', { size: 8, color: '#b03a3a' })) {
          if (sure) { list.splice(i, 1); TU.save.write(); this.confirm = null; this.say('Course deleted.'); } else this.confirm = i;
        }
      });
      if (this.msg) ui.text(c, this.msg.text, 24, 476, { size: 8, color: this.msg.bad ? '#ff8a6a' : '#7dff9a' });
      if (ui.button(c, 784, 482, 152, 44, 'BACK', { color: '#55606a' })) TU.go('modes');
    },

    // ---------- editor ----------
    hole() { return this.course.holes[this.hi]; },
    snapshot() {
      const e = this.hole();
      this.undo.push({ hi: this.hi, tiles: e.tiles.slice(), sculpt: sculptOf(e).slice(), tee: { ...e.tee }, pin: { ...e.pin }, h: e.h, w: e.w, size: e.size });
      if (this.undo.length > 40) this.undo.shift();
      this.dirty = true;
    },
    doUndo() {
      const u = this.undo.pop();
      if (!u) return this.say('Nothing to undo.');
      this.hi = u.hi;
      Object.assign(this.hole(), { tiles: u.tiles, sculpt: u.sculpt, tee: u.tee, pin: u.pin, h: u.h, w: u.w || this.hole().w, size: u.size });
    },
    origin() {
      const e = this.hole();
      const z = this.zoom = Math.max(4, Math.min(8, Math.floor(VW / e.w))); // wide holes zoom out to fit

      this.scrollY = U.clamp(this.scrollY, 0, Math.max(0, e.h * z - VH));
      return { ox: VX + Math.max(0, (VW - e.w * z) / 2), oy: VY - this.scrollY + Math.max(0, (VH - e.h * z) / 2) };
    },
    paint(i, j) {
      const e = this.hole(), r = this.brush - 1;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (di * di + dj * dj > r * r + r) continue;
        const ii = i + di, jj = j + dj;
        if (ii >= 0 && jj >= 0 && ii < e.w && jj < e.h) e.tiles[jj * e.w + ii] = this.tool;
      }
    },
    sculpting() { return SCULPT.some(([id]) => id === this.tool); },
    // Height brush in yards: soft round falloff, works on tile corners.
    sculpt(x, y, start, dt) {
      const e = this.hole(), sc = sculptOf(e), cw = e.w + 1, R = Math.max(1.2, this.brush * 1.3) * 4;
      const ci = x / 4, cj = y / 4, rr = R / 4;
      if (start) this.flatTo = this.heightAt(x, y);
      for (let j = Math.max(0, Math.floor(cj - rr)); j <= Math.min(e.h, Math.ceil(cj + rr)); j++) {
        for (let i = Math.max(0, Math.floor(ci - rr)); i <= Math.min(e.w, Math.ceil(ci + rr)); i++) {
          const d = Math.hypot(i - ci, j - cj) / rr;
          if (d >= 1) continue;
          const wgt = (1 - d * d) * (1 - d * d), k = j * cw + i;
          let v = sc[k];
          // faster the longer you hold it, so building a real mountain doesn't take forever
          const rate = 6 + Math.min(18, (this.holdT || 0) * 6);
          if (this.tool === 'raise') v += rate * dt * wgt;
          else if (this.tool === 'lower') v -= rate * dt * wgt;
          else if (this.tool === 'flatten') v += (this.flatTo - v) * Math.min(1, 6 * dt * wgt);
          else if (this.tool === 'smooth') {
            let sum = 0, n = 0;
            for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii <= e.w && jj <= e.h) { sum += sc[jj * cw + ii]; n++; } }
            v += (sum / n - v) * Math.min(1, 8 * dt * wgt);
          }
          sc[k] = U.clamp(v, HMIN, HMAX);
        }
      }
    },
    // sculpted height (yards) at a point, bilinear between corners
    heightAt(x, y) {
      const e = this.hole(), sc = sculptOf(e), cw = e.w + 1;
      const fx = U.clamp(x / 4, 0, e.w - 0.001), fy = U.clamp(y / 4, 0, e.h - 0.001), i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
      const a = sc[j * cw + i], b = sc[j * cw + i + 1], c = sc[(j + 1) * cw + i], d = sc[(j + 1) * cw + i + 1];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    },
    floodFill(i, j) {
      const e = this.hole(), from = e.tiles[j * e.w + i], to = this.tool;
      if (from === to) return;
      const q = [[i, j]];
      while (q.length) {
        const [a, b] = q.pop();
        if (a < 0 || b < 0 || a >= e.w || b >= e.h || e.tiles[b * e.w + a] !== from) continue;
        e.tiles[b * e.w + a] = to;
        q.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]);
      }
    },
    // Change length by stretching or squeezing the middle of the hole, so the green (top)
    // and the tee box (bottom) are always kept.
    resize(size) {
      const e = this.hole();
      if (e.size === size) return;
      this.snapshot();
      const nh = SIZES[size].h, d = nh - e.h;
      let rows = [];
      for (let j = 0; j < e.h; j++) rows.push(e.tiles.slice(j * e.w, (j + 1) * e.w));
      const top = Math.min(e.pin.y, e.tee.y) / 4, bot = Math.max(e.pin.y, e.tee.y) / 4;
      const mid = Math.round((top + bot) / 2);
      if (d > 0) rows.splice(mid, 0, ...Array.from({ length: d }, () => rows[mid].slice()));
      else {
        // remove rows between the green and the tee (keep a little space around both)
        const lo = Math.ceil(top + 8), hi = Math.floor(bot - 8), can = Math.max(0, hi - lo);
        const cut = Math.min(-d, can), start = Math.max(lo, mid - Math.floor(cut / 2));
        rows.splice(start, cut);
        if (cut < -d) return this.say('Not enough room to make it that short. Move the tee closer first.', true);
      }
      const shift = (y) => (y / 4 > mid ? y + d * 4 : y);
      const sc = sculptOf(e), cw = e.w + 1;
      let crow = [];
      for (let j = 0; j <= e.h; j++) crow.push(sc.slice(j * cw, (j + 1) * cw));
      if (d > 0) crow.splice(mid, 0, ...Array.from({ length: d }, () => crow[mid].slice()));
      else {
        const lo = Math.ceil(top + 8), hi = Math.floor(bot - 8), cut = Math.min(-d, Math.max(0, hi - lo));
        crow.splice(Math.max(lo, mid - Math.floor(cut / 2)), cut);
      }
      e.sculpt = [].concat(...crow);
      e.tiles = [].concat(...rows);
      e.h = nh; e.size = size;
      e.tee.y = shift(e.tee.y); e.pin.y = shift(e.pin.y);
      this.resizeWidth(SIZES[size].w || 44);
    },
    // Widen (or narrow) by adding (or removing) columns evenly on both sides; the middle is kept.
    resizeWidth(nw) {
      const e = this.hole(), d = nw - e.w;
      if (!d) return;
      const left = Math.trunc(d / 2), right = d - left, cw = e.w + 1, sc = sculptOf(e);
      const rows = [], crow = [];
      for (let j = 0; j < e.h; j++) rows.push(e.tiles.slice(j * e.w, (j + 1) * e.w));
      for (let j = 0; j <= e.h; j++) crow.push(sc.slice(j * cw, (j + 1) * cw));
      const grow = (row, l, r) => {
        if (l >= 0) { row.unshift(...Array(l).fill(row[0])); row.push(...Array(r).fill(row[row.length - 1])); }
        else { row.splice(0, -l); row.splice(row.length + r, -r); }
        return row;
      };
      // new outside columns start as trees with out of bounds at the very edge
      e.tiles = [].concat(...rows.map(rw => grow(rw, left, right).map((t, i, a) => (i < 2 || i >= a.length - 2) ? 'O' : (d > 0 && (i < left + 2 || i >= a.length - right - 2) ? 'T' : t))));
      e.sculpt = [].concat(...crow.map(rw => grow(rw, left, right).map((v, i) => d > 0 && (i < left || i > rw.length - right - 1) ? 0 : v)));
      e.w = nw;
      e.tee.x += left * 4; e.pin.x += left * 4;
      e.tee.x = U.clamp(e.tee.x, 12, nw * 4 - 12); e.pin.x = U.clamp(e.pin.x, 12, nw * 4 - 12);
    },
    testHole() {
      const e = this.hole(), bad = problem(e);
      if (bad) return this.say(bad, true);
      const r = TU.Round.create({ course: { name: this.course.name, holes: [toPlayable(e, this.hi + 1, this.course.theme || 'country')] }, mode: 'test', windMax: 8 });
      r.returnTo = 'architect';
      TU.go('play', { round: r });
    },
    saveCourse() {
      const list = TU.architect.courses(), data = { id: this.course.id, name: this.course.name, theme: this.course.theme || 'country', holes: this.course.holes.map(forSave) };
      const i = list.findIndex(c => c.id === data.id);
      if (i >= 0) list[i] = data; else list.push(data);
      TU.save.write();
      this.dirty = false;
      const bad = this.course.holes.map((h, k) => [k, problem(h)]).find(([, p]) => p);
      this.say(bad ? `Saved. Fix hole ${bad[0] + 1} before playing: ${bad[1]}` : 'Course saved!', !!bad);
      TU.audio.play('coin');
    },

    update(dt) {
      if (this.msg && (this.msg.t -= dt) <= 0) this.msg = null;
      if (this.mode !== 'edit') { if (input.isPressed('Escape')) TU.go('modes'); return; }
      if (this.leaveConfirm > 0) this.leaveConfirm -= dt;
      const e = this.hole();
      // typing a name
      if (this.editing) {
        const obj = this.editing === 'hole' ? e : this.course;
        for (const k of input.typed) {
          if (k === 'Backspace') obj.name = obj.name.slice(0, -1);
          else if (/^[a-zA-Z0-9 '\-!]$/.test(k) && obj.name.length < 20) obj.name += k;
        }
        if (input.isPressed('Enter', 'Escape')) { this.editing = null; if (!obj.name.trim()) obj.name = 'Untitled'; this.dirty = true; }
        return;
      }
      if ((input.keys.MetaLeft || input.keys.MetaRight || input.keys.ControlLeft || input.keys.ControlRight) && input.isPressed('KeyZ')) this.doUndo();
      // scroll / pan
      if (input.wheel) this.scrollY += input.wheel * 48;
      if (input.isDown('KeyW', 'ArrowUp')) this.scrollY -= 500 * dt;
      if (input.isDown('KeyS', 'ArrowDown')) this.scrollY += 500 * dt;
      if (input.rdown && this.lastMy !== undefined) this.scrollY -= input.my - this.lastMy;
      this.lastMy = input.my;
      // painting and placing
      const inView = input.mx >= VX && input.mx < VX + VW && input.my >= VY && input.my < VY + VH;
      if (!inView) { this.stroke = false; return; }
      const { ox, oy } = this.origin(), z = this.zoom;
      const i = Math.floor((input.mx - ox) / z), j = Math.floor((input.my - oy) / z);
      if (i < 0 || j < 0 || i >= e.w || j >= e.h) return;
      if (input.clicked) { this.snapshot(); this.stroke = true; this.last = null; }
      if (!input.down) { this.stroke = false; return; }
      if (!this.stroke) return;
      const x = (input.mx - ox) / z * 4, y = (input.my - oy) / z * 4;
      this.cursorH = this.heightAt(x, y);
      if (this.sculpting()) { this.holdT = input.clicked ? 0 : (this.holdT || 0) + dt; this.sculpt(x, y, input.clicked, dt); }
      else if (this.tool === 'tee') e.tee = { x, y };
      else if (this.tool === 'pin') e.pin = { x, y };
      else if (this.fill) { if (input.clicked) this.floodFill(i, j); }
      else {
        // paint along the line from the last point so fast strokes leave no gaps
        const a = this.last || { i, j }, n = Math.max(Math.abs(i - a.i), Math.abs(j - a.j), 1);
        for (let k = 0; k <= n; k++) this.paint(Math.round(a.i + (i - a.i) * k / n), Math.round(a.j + (j - a.j) * k / n));
        this.last = { i, j };
      }
    },

    drawMap(c) {
      const { ox, oy } = this.origin(), e = this.hole(), z = this.zoom;
      ui.panel(c, VX, VY, VW, VH, { fill: '#0f1a12' });
      c.save();
      c.beginPath(); c.rect(VX, VY, VW, VH); c.clip();
      const j0 = Math.max(0, Math.floor((VY - oy) / z)), j1 = Math.min(e.h, Math.ceil((VY + VH - oy) / z));
      for (let j = j0; j < j1; j++) for (let i = 0; i < e.w; i++) {
        c.fillStyle = COL[e.tiles[j * e.w + i]] || '#468f39';
        c.fillRect(ox + i * z, oy + j * z, z, z);
      }
      // sculpted heights: lighter = higher, darker = lower, contour lines every 2 yards
      const sc = sculptOf(e), cw = e.w + 1, th = (i, j) => (sc[j * cw + i] + sc[j * cw + i + 1] + sc[(j + 1) * cw + i] + sc[(j + 1) * cw + i + 1]) / 4;
      for (let j = j0; j < j1; j++) for (let i = 0; i < e.w; i++) {
        const v = th(i, j);
        if (Math.abs(v) < 0.05) continue;
        // shading keeps building up to the new limits, so a 60-yard peak looks taller than a 10-yard bump
        c.fillStyle = v > 0 ? `rgba(255,255,255,${Math.min(0.7, 0.08 + v / 40)})` : `rgba(0,0,30,${Math.min(0.75, 0.08 - v / 28)})`;
        c.fillRect(ox + i * z, oy + j * z, z, z);
      }
      if (this.showH) {
        c.fillStyle = 'rgba(255,224,102,0.85)';
        for (let j = j0; j < j1; j++) for (let i = 0; i < e.w; i++) {
          // contour every 2 yards near the ground, every 5 on big mountains and deep valleys
          const band = v => Math.abs(v) < 12 ? Math.floor(v / 2) : 100 + Math.floor(v / 5);
          const b = band(th(i, j));
          if (i + 1 < e.w && band(th(i + 1, j)) !== b) c.fillRect(ox + (i + 1) * z - 1, oy + j * z, 2, z);
          if (j + 1 < e.h && band(th(i, j + 1)) !== b) c.fillRect(ox + i * z, oy + (j + 1) * z - 1, z, 2);
        }
      }
      // trees get a dot so they read as woods
      c.fillStyle = 'rgba(0,0,0,0.25)';
      for (let j = j0; j < j1; j++) for (let i = 0; i < e.w; i++) if (e.tiles[j * e.w + i] === 'T') c.fillRect(ox + i * z + z / 4, oy + j * z + z / 4, z / 2, z / 2);
      // tee -> pin line with yardage
      const T = p => ({ x: ox + p.x / 4 * z, y: oy + p.y / 4 * z });
      const tp = T(e.tee), pp = T(e.pin);
      c.setLineDash([6, 6]); c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(tp.x, tp.y); c.lineTo(pp.x, pp.y); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#fff'; c.beginPath(); c.arc(tp.x, tp.y, 7, 0, Math.PI * 2); c.fill();
      ui.text(c, 'T', tp.x, tp.y + 1, { size: 8, align: 'center', base: 'middle', color: '#1d1d1d', shadow: false });
      c.strokeStyle = '#fff'; c.beginPath(); c.moveTo(pp.x, pp.y + 2); c.lineTo(pp.x, pp.y - 18); c.stroke();
      c.fillStyle = '#e74c3c'; c.beginPath(); c.moveTo(pp.x, pp.y - 18); c.lineTo(pp.x + 12, pp.y - 13); c.lineTo(pp.x, pp.y - 8); c.fill();
      c.fillStyle = '#111'; c.beginPath(); c.arc(pp.x, pp.y, 3, 0, Math.PI * 2); c.fill();
      // brush preview
      if (input.mx >= VX && input.mx < VX + VW && input.my >= VY && input.my < VY + VH && (this.tool.length === 1 || this.sculpting()) && !this.fill) {
        const rr = this.sculpting() ? Math.max(1.2, this.brush * 1.3) * z : (this.brush - 0.5) * z;
        c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1;
        c.beginPath(); c.arc(input.mx, input.my, rr, 0, Math.PI * 2); c.stroke();
      }
      c.restore();
      ui.text(c, 'Right-drag or wheel: scroll', VX + 6, VY + VH - 14, { size: 6, color: '#cfe8d8' });
    },
    drawEditor(c) {
      const e = this.hole(), co = this.course;
      // top bar: course name + hole tabs
      ui.text(c, this.editing === 'course' ? `${co.name}_` : co.name.toUpperCase(), 16, 14, { size: 12, color: '#c9a6ff' });
      if (ui.button(c, 16 + Math.min(260, co.name.length * 12 + 12), 8, 60, 24, 'RENAME', { size: 6, color: '#55606a' })) this.editing = 'course';
      co.holes.forEach((h, k) => {
        const n = co.holes.length, bw = Math.min(30, 560 / n);
        if (ui.button(c, 380 + k * (bw + 2), 10, bw, 26, `${k + 1}`, { size: 6, color: k === this.hi ? '#7b5bb5' : TU.architect.problem(h) ? '#7a4a3a' : '#2a2145' })) { this.hi = k; this.scrollY = 9999; }
      });

      // tools
      TOOLS.forEach(([id, label], k) => {
        const y = 52 + k * 24, sel = this.tool === id;
        if (ui.button(c, 16, y, 140, 20, '', { color: sel ? '#7b5bb5' : '#2a2145' })) this.tool = id;
        c.fillStyle = COL[id] || (id === 'tee' ? '#ffffff' : '#e74c3c');
        c.fillRect(22, y + 4, 12, 12);
        ui.text(c, label, 42, y + 6, { size: 6 });
      });
      const sy0 = 52 + TOOLS.length * 24 + 4;
      ui.text(c, 'SCULPT HILLS', 16, sy0, { size: 6, color: '#cfe8d8' });
      SCULPT.forEach(([id, label], k) => {
        if (ui.button(c, 16 + (k % 2) * 72, sy0 + 12 + Math.floor(k / 2) * 24, 68, 20, label, { size: 6, color: this.tool === id ? '#c07a1e' : '#2a2145' })) { this.tool = id; this.fill = false; this.showH = true; }
      });
      const ty = sy0 + 64;
      ui.text(c, 'BRUSH', 16, ty, { size: 6, color: '#cfe8d8' });
      [1, 2, 3, 5].forEach((b, k) => { if (ui.button(c, 16 + k * 36, ty + 12, 32, 24, `${b}`, { size: 6, color: this.brush === b && !this.fill ? '#7b5bb5' : '#2a2145' })) { this.brush = b; this.fill = false; } });
      if (ui.button(c, 16, ty + 40, 68, 22, 'FILL', { size: 6, color: this.fill ? '#7b5bb5' : '#2a2145' })) this.fill = !this.fill;
      if (ui.button(c, 88, ty + 40, 68, 22, 'UNDO', { size: 6, color: '#55606a' })) this.doUndo();
      if (ui.button(c, 16, ty + 66, 140, 20, this.showH ? 'HEIGHTS: ON' : 'HEIGHTS: OFF', { size: 6, color: this.showH ? '#c07a1e' : '#2a2145' })) this.showH = !this.showH;

      this.drawMap(c);

      // hole settings
      const px = 576;
      ui.panel(c, px, 52, 368, 404, { fill: '#1b1530' });
      ui.text(c, this.editing === 'hole' ? `${e.name}_` : e.name.toUpperCase(), px + 14, 64, { size: 10 });
      if (ui.button(c, px + 290, 58, 66, 22, 'RENAME', { size: 6, color: '#55606a' })) this.editing = 'hole';
      const row = (label, y, opts, cur, set) => {
        ui.text(c, label, px + 14, y + 7, { size: 6, color: '#cfc4e6' });
        opts.forEach(([v, l], k) => { if (ui.button(c, px + 92 + k * 68, y, 64, 22, l, { size: 6, color: cur === v ? '#7b5bb5' : '#2a2145' })) { if (cur !== v) { set(v); this.dirty = true; } } });
      };
      row('PAR', 92, [[3, '3'], [4, '4'], [5, '5']], e.par, v => { e.par = v; });
      row('LENGTH', 122, Object.entries(SIZES).map(([k, v]) => [k, v.label]), e.size, v => this.resize(v));
      row('HILLS', 152, HILLS.map(([l], k) => [k, l]), e.hillsLvl, v => { e.hillsLvl = v; });
      row('GREEN', 182, GREENS.map(([l], k) => [k, l]), e.greenLvl, v => { e.greenLvl = v; });
      // the setting the whole course is played in: backdrop, trees and surroundings
      ui.text(c, 'SETTING', px + 14, 219, { size: 6, color: '#cfc4e6' });
      [['city', 'CITY'], ['country', 'CNTRY'], ['coastal', 'COAST'], ['mountain', 'MTN'], ['desert', 'DESRT']].forEach(([v, l], k) => {
        if (ui.button(c, px + 92 + k * 54, 212, 52, 22, l, { size: 6, color: (this.course.theme || 'country') === v ? '#7b5bb5' : '#2a2145' })) { this.course.theme = v; this.dirty = true; }
      });
      ui.text(c, `TEE TO PIN: ${Math.round(U.dist(e.tee, e.pin))} YDS`, px + 14, 242, { size: 8, color: '#ffe066' });
      {
        const { ox, oy } = this.origin(), hx = (input.mx - ox) / this.zoom * 4, hy = (input.my - oy) / this.zoom * 4;
        if (input.mx >= VX && input.mx < VX + VW && input.my >= VY && input.my < VY + VH) {
          const hv = this.heightAt(hx, hy);
          ui.text(c, `HEIGHT ${hv >= 0 ? '+' : ''}${hv.toFixed(1)} YDS`, px + 354, 218, { size: 6, align: 'right', color: '#c9a6ff' });
        }
      }
      const bad = problem(e);
      ui.text(c, bad ? `! ${bad}` : 'Ready to play.', px + 200, 243, { size: 6, color: bad ? '#ff8a6a' : '#7dff9a' });
      if (ui.button(c, px + 14, 256, 166, 34, 'RANDOM LAYOUT', { size: 6, color: '#3d6fb0' })) { this.snapshot(); Object.assign(e, randomHole(e.size, this.hi + 1), { name: e.name, par: e.par, hillsLvl: e.hillsLvl, greenLvl: e.greenLvl }); }
      if (ui.button(c, px + 188, 256, 166, 34, 'CLEAR HOLE', { size: 6, color: '#55606a' })) { this.snapshot(); Object.assign(e, blankHole(e.size, this.hi + 1), { name: e.name, par: e.par, hillsLvl: e.hillsLvl, greenLvl: e.greenLvl }); }
      if (ui.button(c, px + 14, 300, 340, 44, 'TEST HOLE', { size: 12, color: '#2e9e5b' })) this.testHole();
      ui.wrap(c, 'Paint with the left mouse. Hold to sculpt hills. Greens and ponds level themselves. The pin must sit on green. Cmd+Z undoes.', 340, 6)
        .slice(0, 3).forEach((l, k) => ui.text(c, l, px + 14, 350 + k * 12, { size: 6, color: '#8fb3a0' }));
      if (ui.button(c, px + 14, 392, 166, 44, this.dirty ? 'SAVE COURSE*' : 'SAVE COURSE', { size: 8, color: '#c07a1e' })) this.saveCourse();
      if (ui.button(c, px + 188, 392, 166, 44, this.leaveConfirm > 0 ? 'UNSAVED! AGAIN' : 'BACK', { size: 8, color: '#55606a' })) {
        if (this.dirty && this.leaveConfirm <= 0) this.leaveConfirm = 3;
        else { this.mode = 'list'; this.course = null; }
      }
      if (this.msg) ui.text(c, this.msg.text, px, 470, { size: 6, color: this.msg.bad ? '#ff8a6a' : '#7dff9a' });
    },
    drawUI(c) {
      c.fillStyle = '#120e20';
      c.fillRect(0, 0, 960, 540);
      if (this.mode === 'edit' && this.course) this.drawEditor(c); else this.drawList(c);
    },
  };
})();
