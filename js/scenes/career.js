// Career menu: pick a tier, then an event; see the field and the purse; start the round.
(function () {
  const ui = TU.ui, input = TU.input, CR = TU.career;
  const place = n => n === 1 ? '1ST' : n === 2 ? '2ND' : n === 3 ? '3RD' : `${n}TH`;

  TU.scenes.career = {
    enter() {
      ui.nav = true;
      const p = CR.progress();
      this.t = Math.min(p.tier || 0, CR.TIERS.length - 1);
      this.e = 0;
      for (let e = 0; e < CR.TIERS[this.t].events.length; e++) if (CR.eventUnlocked(this.t, e)) this.e = e; // jump to the latest open event
    },
    update() { if (input.isPressed('Escape')) TU.go('modes'); },
    drawUI(c) {
      ui.text(c, 'CAREER', 24, 16, { size: 22, color: '#ffe066' });
      ui.text(c, `TEES: ${TU.save.data.tees}`, 936, 20, { size: 12, align: 'right', color: '#ffe066' });

      // tiers
      CR.TIERS.forEach((T, t) => {
        const y = 62 + t * 76, open = CR.tierUnlocked(t);
        if (ui.button(c, 24, y, 260, 66, '', { color: !open ? '#3a4048' : t === this.t ? T.color : '#2b4a3a' }) && open) { this.t = t; this.e = 0; }
        ui.text(c, `TIER ${t + 1}`, 38, y + 10, { size: 8, color: open ? '#ffe066' : '#8a9096' });
        ui.text(c, open ? T.name.toUpperCase() : 'LOCKED', 38, y + 26, { size: 10, color: open ? '#fff' : '#8a9096' });
        const medals = T.events.map((_, e) => CR.result(t, e)).filter(r => r && r.best <= 3).length;
        ui.text(c, open ? `${medals}/${T.events.length} events podium  -  ${TU.Themes.get(T.theme).label}` : 'Podium the previous tier finale', 38, y + 46, { size: 6, color: '#cfe8d8' });
      });

      const T = CR.TIERS[this.t];
      ui.panel(c, 304, 62, 632, 440, { fill: '#14261d' });
      ui.text(c, T.name.toUpperCase(), 324, 76, { size: 14, color: '#ffe066' });
      ui.text(c, T.blurb, 324, 98, { size: 8, color: '#cfe8d8' });

      // events
      T.events.forEach((name, e) => {
        const x = 324 + e * 152, open = CR.eventUnlocked(this.t, e), res = CR.result(this.t, e);
        if (ui.button(c, x, 120, 146, 70, '', { color: !open ? '#3a4048' : e === this.e ? T.color : '#2b4a5a' }) && open) this.e = e;
        ui.text(c, e === T.events.length - 1 ? `EVENT ${e + 1} - FINALE` : `EVENT ${e + 1}`, x + 8, 128, { size: 6, color: open ? '#ffe066' : '#8a9096' });
        ui.wrap(c, open ? name.toUpperCase() : 'LOCKED', 130, 8).forEach((l, k) => ui.text(c, l, x + 8, 142 + k * 12, { size: 8, color: open ? '#fff' : '#8a9096' }));
        ui.text(c, res ? `BEST: ${place(res.best)}` : open ? 'NOT PLAYED' : 'Top 3 previous event', x + 8, 172, { size: 6, color: res && res.best <= 3 ? '#7dff9a' : '#cfe8d8' });
      });

      // event detail
      const course = CR.course(this.t, this.e), field = CR.field(this.t, this.e);
      const par = course.holes.reduce((a, h) => a + h.par, 0), yards = course.holes.reduce((a, h) => a + h.yards, 0);
      ui.text(c, course.name.toUpperCase(), 324, 206, { size: 12 });
      ui.text(c, `${course.holes.length} HOLES   PAR ${par}   ${yards} YDS   WIND UP TO ${T.wind} MPH`, 324, 226, { size: 8, color: '#cfe8d8' });
      ui.text(c, 'THE FIELD', 324, 250, { size: 8, color: '#ffe066' });
      field.forEach((n, i) => {
        const y = 266 + i * 22;
        c.fillStyle = n.color; c.fillRect(324, y, 12, 12);
        ui.text(c, n.name, 344, y + 2, { size: 8 });
        const stars = Math.max(1, Math.min(5, Math.round((n.skill + 0.3) * 4)));
        ui.text(c, '*'.repeat(stars) + '.'.repeat(5 - stars), 560, y + 2, { size: 8, color: '#ffe066' });
      });
      ui.text(c, 'PRIZES', 640, 250, { size: 8, color: '#ffe066' });
      for (let pl = 1; pl <= 6; pl++) ui.text(c, `${place(pl)}   ${CR.prize(this.t, pl)} TEES`, 640, 266 + (pl - 1) * 18, { size: 8, color: pl <= 3 ? '#7dff9a' : '#cfe8d8' });
      ui.text(c, 'First podium: +50% bonus', 640, 380, { size: 6, color: '#8fb3a0' });

      const fee = TU.caddy.fee(), cd = TU.caddy.list[TU.save.data.caddyLevel] || TU.caddy.list[0];
      if (fee) ui.text(c, TU.save.data.tees >= fee ? `CADDY FEE: ${fee} TEES PER ROUND (${cd.name.toUpperCase()})` : `CAN'T PAY ${cd.name.toUpperCase()}'S ${fee} TEE FEE: DUSTY WILL CADDY`, 324, 404, { size: 6, color: TU.save.data.tees >= fee ? '#ffb36a' : '#ff8a6a' });
      if (ui.button(c, 324, 420, 280, 60, 'TEE OFF', { size: 16 }) && CR.eventUnlocked(this.t, this.e)) {
        TU.go('play', { round: CR.newRound(this.t, this.e) });
      }
      if (ui.button(c, 620, 432, 150, 40, 'PRACTICE', { size: 8, color: '#3d6fb0' })) {
        TU.go('play', { round: TU.Round.create({ course: TU.courses.get('practice'), mode: 'quick', windMax: 10 }) });
      }
      if (ui.button(c, 784, 432, 136, 40, 'BACK', { size: 10, color: '#55606a' })) TU.go('modes');
      if (ui.button(c, 24, 448, 260, 40, 'SHOP', { size: 10, color: '#c07a1e' })) TU.go('shop');
    },
  };
})();
