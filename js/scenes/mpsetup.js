// MULTIPLAYER setup: 2-6 hot-seat players on one device. Each picks a name, a color and a
// character; then choose a built-in or Architect course. No Tees are earned in multiplayer.
(function () {
  const ui = TU.ui, input = TU.input;
  const COLORS = ['#3d8bff', '#ff5a5a', '#5fd38a', '#ff9f43', '#c56cf0', '#2ee6d6', '#ff6fb5', '#a3e635'];

  // characters to pick from: your own golfer first, then a cast of presets
  function presets() {
    const base = TU.caddy.list.map(c => ({ name: c.name, look: c.look }));
    const tint = (look, shirt, hat) => ({ ...look, shirt: { ...look.shirt, color: shirt }, hat: { ...look.hat, color: hat } });
    return [{ name: 'My Golfer', look: TU.save.data.player }, ...base,
      { name: 'Rookie Red', look: tint(base[2].look, '#e74c3c', '#ffffff') }, { name: 'Lime Lad', look: tint(base[0].look, '#a3e635', '#1d1d1d') }];
  }
  function courses() {
    const list = [{ label: 'Practice Links', get: () => TU.courses.get('practice') }];
    TU.career.TIERS.forEach((T, t) => T.events.forEach((ev, e) => list.push({ label: `${ev} (${T.name})`, get: () => TU.career.course(t, e) })));
    TU.architect.courses().forEach(c => list.push({ label: `${c.name} (custom)`, custom: c, get: () => TU.architect.playable(c) }));
    return list;
  }

  TU.scenes.mpsetup = {
    enter(p) {
      ui.nav = false;
      this.list = courses();
      this.info = this.list.map(() => null);
      if (p && p.again) return; // keep the same setup
      this.count = 2;
      this.players = Array.from({ length: 6 }, (_, i) => ({ name: i ? `Player ${i + 1}` : (TU.save.data.player.name || 'Player 1'), color: COLORS[i], look: i ? 1 + (i % 6) : 0 }));
      this.courseIdx = 0;
      this.editing = -1;
      this.msg = null;
    },
    update(dt) {
      if (this.msg && (this.msg.t -= dt) <= 0) this.msg = null;
      if (this.editing >= 0) {
        const p = this.players[this.editing];
        for (const k of input.typed) {
          if (k === 'Backspace') p.name = p.name.slice(0, -1);
          else if (/^[a-zA-Z0-9 ]$/.test(k) && p.name.length < 12) p.name += k;
        }
        if (input.isPressed('Enter', 'Escape')) { if (!p.name.trim()) p.name = `Player ${this.editing + 1}`; this.editing = -1; }
        return;
      }
      if (input.isPressed('Escape')) TU.go('modes');
    },
    nextColor(i) {
      const used = new Set(this.players.slice(0, this.count).filter((_, k) => k !== i).map(p => p.color));
      let k = COLORS.indexOf(this.players[i].color);
      for (let n = 0; n < COLORS.length; n++) { k = (k + 1) % COLORS.length; if (!used.has(COLORS[k])) { this.players[i].color = COLORS[k]; return; } }
    },
    start() {
      const pick = this.list[this.courseIdx];
      if (pick.custom) {
        const bad = pick.custom.holes.map((h, i) => [i, TU.architect.problem(h)]).find(([, pr]) => pr);
        if (bad) { this.msg = { text: `That course needs fixing (hole ${bad[0] + 1}): ${bad[1]}`, t: 3 }; return; }
      }
      const ps = presets();
      const players = this.players.slice(0, this.count).map(p => ({ name: p.name, look: ps[p.look].look, mapColor: p.color, color: p.color, scores: [], human: true }));
      TU.Round.assignMapColors(players);
      const round = TU.Round.create({ course: pick.get(), mode: 'multi', players, windMax: 10 });
      TU.go('play', { round });
    },
    drawUI(c) {
      c.fillStyle = '#1a0f12';
      c.fillRect(0, 0, 960, 540);
      ui.text(c, 'MULTIPLAYER', 24, 16, { size: 22, color: '#ff8a6a' });
      ui.text(c, 'Pass the device: everyone tees off in order, then the farthest from the hole plays.', 24, 50, { size: 6, color: '#f6d8c8' });
      ui.text(c, 'PLAYERS', 24, 74, { size: 8, color: '#ffe066' });
      for (let n = 2; n <= 6; n++) if (ui.button(c, 100 + (n - 2) * 44, 68, 38, 24, `${n}`, { size: 8, color: n === this.count ? '#c0563a' : '#3a2a2e' })) { this.count = n; this.editing = -1; }
      const ps = presets();
      for (let i = 0; i < this.count; i++) {
        const p = this.players[i], y = 104 + i * 52;
        ui.panel(c, 24, y, 560, 44, { fill: '#2a1a1e' });
        if (ui.button(c, 32, y + 8, 28, 28, '', { color: p.color })) this.nextColor(i);
        ui.text(c, this.editing === i ? `${p.name}_` : p.name.toUpperCase(), 72, y + 10, { size: 10 });
        if (ui.button(c, 72, y + 26, 70, 14, 'RENAME', { size: 6, color: '#55606a' })) this.editing = i;
        if (ui.button(c, 300, y + 10, 26, 24, '<', { size: 8, color: '#3a2a2e' })) p.look = (p.look + ps.length - 1) % ps.length;
        ui.text(c, ps[p.look].name.toUpperCase(), 418, y + 17, { size: 8, align: 'center', color: '#f6d8c8' });
        if (ui.button(c, 512, y + 10, 26, 24, '>', { size: 8, color: '#3a2a2e' })) p.look = (p.look + 1) % ps.length;
      }
      // course picker
      const list = this.list;
      this.courseIdx = Math.min(this.courseIdx, list.length - 1);
      ui.panel(c, 604, 74, 332, 320, { fill: '#2a1a1e' });
      ui.text(c, 'COURSE', 620, 86, { size: 8, color: '#ffe066' });
      if (input.wheel && input.mx > 604) this.courseIdx = TU.util.clamp(this.courseIdx + input.wheel, 0, list.length - 1);
      const first = TU.util.clamp(this.courseIdx - 4, 0, Math.max(0, list.length - 9));
      list.slice(first, first + 9).forEach((cs, k) => {
        const i = first + k;
        if (ui.button(c, 616, 104 + k * 30, 308, 26, '', { color: i === this.courseIdx ? '#c0563a' : '#3a2a2e' })) this.courseIdx = i;
        ui.text(c, cs.label.slice(0, 38), 626, 113 + k * 30, { size: 6 });
      });
      const sel = this.info[this.courseIdx] || (this.info[this.courseIdx] = list[this.courseIdx].get());
      ui.text(c, `${sel.holes.length} HOLES  -  PAR ${sel.holes.reduce((a, h) => a + h.par, 0)}`, 620, 378, { size: 8, color: '#f6d8c8' });
      ui.text(c, 'No cart, no walking and no beverage cart in multiplayer. No Tees are earned.', 24, 420, { size: 6, color: '#cfa8a0' });
      if (this.msg) ui.text(c, this.msg.text, 24, 438, { size: 8, color: '#ff8a6a' });
      if (ui.button(c, 604, 410, 332, 56, 'START', { size: 16, color: '#c0563a' })) this.start();
      if (ui.button(c, 24, 470, 160, 44, 'BACK', { color: '#55606a' })) TU.go('modes');
    },
  };
})();
