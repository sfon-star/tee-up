// Scorecard + leaderboard after each hole and at round end.
// Career rounds include the NPC field (sorted by score to par) and pay Tees by finishing place.
(function () {
  const ui = TU.ui, R = TU.Round;
  const ord = n => n === 1 ? '1ST' : n === 2 ? '2ND' : n === 3 ? '3RD' : `${n}TH`;

  TU.scenes.scorecard = {
    enter(p) { this.round = p.round; ui.nav = true; this.award(); if ((this.round.mode === 'multi' || this.round.mode === 'online') && this.done()) setTimeout(() => TU.audio.play('cheer'), 300); },
    // everyone on the card: players first, then NPCs
    entries() {
      const r = this.round;
      return [...r.players.map(p => ({ ...p, you: !!p.human })), ...(r.npcs || []).map(n => ({ ...n, npc: true }))];
    },
    played(e) { let k = 0; while (e.scores[k] !== undefined) k++; return k; },
    toPar(e) { const k = this.played(e); return R.total(e) - R.parThrough(this.round, k); },
    standings() {
      // stable sort by score to par; ties share a position
      const list = this.entries().map((e, i) => ({ e, i, d: this.toPar(e) }));
      list.sort((a, b) => a.d - b.d || a.i - b.i);
      let pos = 0, last = null;
      list.forEach((x, k) => { if (x.d !== last) { pos = k + 1; last = x.d; } x.pos = pos; });
      return list;
    },
    done() { const r = this.round, n = r.course.holes.length; return r.players.every(p => p.scores[n - 1] !== undefined); },

    award() {
      const r = this.round;
      if (r.mode === 'multi' || r.mode === 'online' || r.mode === 'test' || r.rewarded !== undefined || !this.done()) return; // no Tees for multiplayer or your own test courses
      if (r.mode === 'career') {
        const me = this.standings().find(x => x.e.you);
        r.result = TU.career.finish(r.career.t, r.career.e, me.pos, R.total(r.players[0]));
        r.rewarded = r.result.prize;
      } else {
        // practice round: base + par bonus + under-par bonus
        const p = r.players[0];
        let tees = 40;
        r.course.holes.forEach((h, i) => { const d = p.scores[i] - h.par; if (d === 0) tees += 5; if (d < 0) tees += 25 * -d; });
        r.rewarded = tees;
        TU.save.data.tees += tees;
        TU.save.write();
      }
      setTimeout(() => TU.audio.play(r.result && r.result.place <= 3 ? 'cheer' : 'coin'), 300);
    },
    update() {},
    drawUI(c) {
      const r = this.round, holes = r.course.holes, n = holes.length, done = this.done();
      ui.text(c, r.course.name.toUpperCase(), 480, 24, { size: 18, align: 'center', color: '#ffe066' });
      ui.text(c, done ? (r.npcs ? 'FINAL LEADERBOARD' : 'FINAL SCORECARD') : `AFTER HOLE ${r.holeIdx + 1} OF ${n}`, 480, 54, { size: 10, align: 'center', color: '#cfe8d8' });

      const rows = r.npcs ? this.standings() : this.entries().map((e, i) => ({ e, i, d: this.toPar(e), pos: '' }));
      const rh = r.npcs || r.players.length > 3 ? 30 : 40, cw = Math.min(52, 470 / n), y0 = 84;
      const tw = Math.max(n * cw + 340, 600), left = 480 - tw / 2, x0 = left + 210;
      ui.panel(c, left, y0 - 8, tw, rh * (2 + rows.length) + 16, { fill: '#f3ecd6', border: '#3a2e1a', light: 'rgba(255,255,255,0.3)' });
      const ink = '#2d2a20', T = (t, x, y, o = {}) => ui.text(c, t, x, y, Object.assign({ size: 10, color: ink, shadow: false }, o));
      T(r.npcs ? 'POS  PLAYER' : 'HOLE', left + 18, y0 + 6);
      T('PAR', left + 18, y0 + rh + 6);
      holes.forEach((h, i) => {
        T(`${i + 1}`, x0 + i * cw + cw / 2, y0 + 6, { align: 'center' });
        T(`${h.par}`, x0 + i * cw + cw / 2, y0 + rh + 6, { align: 'center' });
      });
      T('TOT', x0 + n * cw + 30, y0 + 6, { align: 'center' });
      T(`${R.parThrough(r, n)}`, x0 + n * cw + 30, y0 + rh + 6, { align: 'center' });
      T('+/-', x0 + n * cw + 90, y0 + 6, { align: 'center' });
      c.fillStyle = '#3a2e1a';
      c.fillRect(left + 10, y0 + rh * 2 - 6, tw - 20, 3);

      rows.forEach(({ e, d, pos }, k) => {
        const y = y0 + rh * (2 + k) + 2;
        if (e.you && r.npcs) { c.fillStyle = 'rgba(255,224,102,0.45)'; c.fillRect(left + 8, y - 6, tw - 16, rh - 2); }
        const mp = r.mode === 'multi' || r.mode === 'online', sw = r.npcs ? e.color : mp && e.mapColor;
        if (sw) { c.fillStyle = sw; c.fillRect(r.npcs ? left + 56 : left + 14, y - 1, 10, 10); }
        T(pos ? `${pos}` : '', left + 18, y);
        T(e.name.slice(0, 14).toUpperCase(), left + (r.npcs ? 72 : mp ? 30 : 18), y, { size: 8 });
        holes.forEach((h, i) => {
          const s = e.scores[i];
          if (s === undefined) return;
          const cx = x0 + i * cw + cw / 2, dd = s - h.par, q = Math.min(12, rh / 2 - 3);
          if (dd < 0) { c.strokeStyle = '#c0392b'; c.lineWidth = 2; c.beginPath(); c.arc(cx, y + 5, q, 0, Math.PI * 2); c.stroke(); }
          if (dd > 0) { c.strokeStyle = '#2c5aa0'; c.lineWidth = 2; c.strokeRect(cx - q, y + 5 - q, q * 2, q * 2); }
          T(`${s}`, cx, y, { align: 'center' });
        });
        T(`${R.total(e)}`, x0 + n * cw + 30, y, { align: 'center' });
        T(d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}`, x0 + n * cw + 90, y, { align: 'center', color: d < 0 ? '#c0392b' : ink });
      });

      if (done) {
        const res = r.result;
        if (res) {
          ui.text(c, `YOU FINISHED ${ord(res.place)}!`, 480, 344, { size: 18, align: 'center', color: res.place <= 3 ? '#7dff9a' : '#ffe066' });
          ui.text(c, `+${res.prize} TEES${res.firstTop3 ? '  (first podium bonus!)' : ''}${r.fee ? `   (caddy fee -${r.fee})` : ''}`, 480, 374, { size: 12, align: 'center', color: '#ffe066' });
          const note = res.unlockedTier ? `NEW TIER UNLOCKED: ${TU.career.TIERS[r.career.t + 1].name.toUpperCase()}!` : res.unlockedEvent ? 'NEXT EVENT UNLOCKED!' : res.place > 3 ? 'Finish top 3 to unlock the next event.' : '';
          if (note) ui.text(c, note, 480, 402, { size: 8, align: 'center', color: '#cfe8d8' });
        } else if (r.rewarded) {
          ui.text(c, `+${r.rewarded} TEES`, 480, 380, { size: 20, align: 'center', color: '#ffe066' });
          ui.text(c, `${r.fee ? `Caddy fee -${r.fee}  -  ` : ''}Total: ${TU.save.data.tees} Tees  -  spend them in the SHOP`, 480, 410, { size: 8, align: 'center', color: '#cfe8d8' });
        }
        if (r.mode === 'multi' || r.mode === 'online') {
          // lowest total wins; a tie shares the win
          const best = Math.min(...r.players.map(R.total)), win = r.players.filter(p => R.total(p) === best);
          ui.text(c, win.length > 1 ? `TIE: ${win.map(p => p.name.toUpperCase()).join(' & ')}` : `${win[0].name.toUpperCase()} WINS!`, 480, 360, { size: win.length > 1 ? 14 : 22, align: 'center', color: win[0].mapColor || '#ffe066' });
          ui.text(c, 'No Tees in multiplayer - just bragging rights.', 480, 404, { size: 8, align: 'center', color: '#cfe8d8' });
          if (r.mode === 'online') { if (ui.button(c, 360, 440, 240, 56, 'MAIN MENU', { color: '#55606a' })) { TU.net.leave(); TU.go('home', { resume: true }); } }
          else {
            if (ui.button(c, 250, 440, 220, 56, 'PLAY AGAIN', { color: '#c0563a' })) TU.go('mpsetup', { again: true });
            if (ui.button(c, 490, 440, 220, 56, 'MAIN MENU', { color: '#55606a' })) TU.go('home', { resume: true });
          }
        } else if (r.mode === 'career') {
          if (ui.button(c, 250, 440, 220, 56, 'CAREER', { color: '#2e9e5b' })) TU.go('career');
          if (ui.button(c, 490, 440, 220, 56, 'PLAY AGAIN', { color: '#3d6fb0' })) TU.go('play', { round: TU.career.newRound(r.career.t, r.career.e) });
        } else if (ui.button(c, 360, 440, 240, 56, r.returnTo ? 'BACK TO EDITOR' : 'MAIN MENU')) TU.go(r.returnTo || 'home', { resume: true });
      } else if (r.mode === 'online' && !TU.net.isHost) {
        ui.text(c, 'Waiting for the host to start the next hole...', 480, 466, { size: 8, align: 'center', color: '#cfe8d8' });
      } else if (ui.button(c, 360, 440, 240, 56, 'NEXT HOLE')) {
        if (r.mode === 'online') TU.net.send('next', {}); // everyone moves on together
        r.holeIdx++;
        TU.go('play', { round: r });
      }
    },
  };
})();
