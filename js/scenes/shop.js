// Pro Shop: GOLFER (customizer) and CART tabs with a live 3D preview on the right.
// Clicking an owned item equips it; clicking a locked one previews it and offers BUY.
(function () {
  const ui = TU.ui, input = TU.input, R3 = TU.R3, CAT = TU.catalog;
  const TABS = [['golfer', 'GOLFER'], ['cart', 'CART'], ['clubs', 'CLUBS'], ['caddy', 'CADDY']];
  // golfer at address with a driver, slowly turning, for the clubs tab
  const G3addr = (m, tee) => {
    m.pose({ mode: 'swing', swing: Math.sin(TU.time * 1.2) * 0.25 - 0.1 });
    TU.Golfer3D.address(m, tee.x, tee.y, Math.PI / 2 + Math.sin(TU.time * 0.3) * 0.4);
  };

  TU.scenes.shop = {
    enter(p) {
      ui.nav = true;
      this.tab = p.tab || 'golfer';
      this.cat = 0;
      this.rot = 0.4;
      this.preview = null;
      this.msg = null;
      this.editing = false;
      this.hole = TU.courses.get('practice').holes[0];
      R3.loadHole(this.hole);
      this.rebuild();
    },
    exit() { this.clearModel(); },
    clearModel() {
      if (!this.model) return;
      R3.scene.remove(this.model.root);
      this.model.root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      this.model = null;
    },
    data() { return this.tab === 'cart' ? TU.save.data.cart : TU.save.data.player; },
    groups() { return CAT[this.tab] || []; },
    // saved setup with the item being tried on applied
    shown() {
      const d = JSON.parse(JSON.stringify(this.data()));
      if (this.preview) CAT.set(d, this.preview.key, this.preview.value);
      return d;
    },
    rebuild() {
      this.clearModel();
      if (this.tab === 'golfer') this.model = TU.Golfer3D.build(this.shown());
      else if (this.tab === 'cart') this.model = TU.Cart3D.build(this.shown());
      else if (this.tab === 'clubs') { this.model = TU.Golfer3D.build(TU.save.data.player); this.model.setClub('wood'); }
      else if (this.tab === 'caddy') {
        const i = this.preview && this.preview.kind === 'caddy' ? this.preview.i : TU.save.data.caddyLevel;
        this.model = TU.Golfer3D.build(TU.caddy.list[i].look);
      }
      if (this.model) R3.scene.add(this.model.root);
    },
    say(text, bad) { this.msg = { text, bad, t: 2.5 }; },
    setTab(t) { if (t === this.tab) return; this.tab = t; this.cat = 0; this.preview = null; this.rebuild(); },
    setCat(i) { if (i === this.cat) return; this.cat = i; if (this.preview) { this.preview = null; this.rebuild(); } },

    select(g, [value, name, price]) {
      const d = this.data();
      if (g.upgrade) {
        const cur = d.speedLevel || 0;
        if (value <= cur) return this.say('Already installed.');
        if (value !== cur + 1) return this.say('Install the previous upgrade first.', true);
        this.preview = { key: g.key, value, price, name: `${name} engine` };
        return;
      }
      if (CAT.owned(this.tab, g.key, value, price)) {
        CAT.set(d, g.key, value);
        TU.save.write();
        this.preview = null;
        this.rebuild();
        TU.audio.play('click');
      } else {
        this.preview = { key: g.key, value, price, name: name || 'This color' };
        this.rebuild();
      }
    },
    buy() {
      const p = this.preview, s = TU.save.data;
      if (!p) return;
      if (s.tees < p.price) { TU.audio.play('bad'); return this.say(`You need ${p.price - s.tees} more Tees.`, true); }
      s.tees -= p.price;
      if (p.kind === 'clubs') { s.owned['clubs:' + p.i] = true; s.clubSet = p.i; }
      else if (p.kind === 'caddy') { s.owned['caddy:' + p.i] = true; s.caddyLevel = p.i; }
      else {
        s.owned[CAT.id(this.tab, p.key, p.value)] = true;
        CAT.set(this.data(), p.key, p.value);
      }
      TU.save.write();
      TU.audio.play('coin');
      this.say(`Bought ${p.name}!`);
      this.preview = null;
      this.rebuild();
    },

    // stat bar 0..1
    bar(c, x, y, w, v, col) {
      c.fillStyle = '#0b1410'; c.fillRect(x, y, w, 8);
      c.fillStyle = col; c.fillRect(x, y, w * TU.util.clamp(v, 0, 1), 8);
    },
    drawClubs(c) {
      const s = TU.save.data;
      TU.clubs.sets.forEach((set, i) => {
        const y = 100 + i * 64, owned = i === 0 || s.owned['clubs:' + i], eq = s.clubSet === i;
        const trying = this.preview && this.preview.kind === 'clubs' && this.preview.i === i;
        if (ui.button(c, 24, y, 556, 56, '', { color: trying ? '#c07a1e' : eq ? '#2e9e5b' : owned ? '#2b4a5a' : '#3a4048' })) {
          if (owned) { s.clubSet = i; TU.save.write(); this.preview = null; TU.audio.play('click'); }
          else this.preview = { kind: 'clubs', i, price: set.price, name: set.name };
        }
        ui.text(c, set.name.toUpperCase(), 36, y + 8, { size: 10 });
        ui.text(c, eq ? 'EQUIPPED' : owned ? 'OWNED' : `${set.price} TEES`, 568, y + 8, { size: 8, align: 'right', color: owned ? '#cfe8d8' : '#ffe066' });
        const stats = [['DISTANCE', (set.dist - 0.8) / 0.4, `${Math.round(220 * set.dist)}y driver`, '#5fd38a'], ['ACCURACY', (1.8 - set.acc) / 1.4, '', '#5fb0ff'], ['SPIN', set.spin, '', '#ffb347']];
        stats.forEach(([label, v, extra, col], k) => {
          const sx = 36 + k * 180;
          ui.text(c, label + (extra ? ' ' + extra : ''), sx, y + 28, { size: 6, color: '#cfe8d8' });
          this.bar(c, sx, y + 40, 160, v, col);
        });
      });
    },
    drawCaddies(c) {
      const s = TU.save.data;
      TU.caddy.list.forEach((cd, i) => {
        const y = 100 + i * 54, hired = TU.caddy.hired(i), cur = s.caddyLevel === i;
        const trying = this.preview && this.preview.kind === 'caddy' && this.preview.i === i;
        if (ui.button(c, 24, y, 556, 48, '', { color: trying ? '#c07a1e' : cur ? '#2e9e5b' : hired ? '#2b4a5a' : '#3a4048' })) {
          if (hired) { s.caddyLevel = i; TU.save.write(); this.preview = null; this.rebuild(); TU.audio.play('click'); }
          else if (!TU.caddy.hired(i - 1)) this.say(`Hire ${TU.caddy.list[i - 1].name} first.`, true);
          else { this.preview = { kind: 'caddy', i, price: cd.price, name: cd.name }; this.rebuild(); }
        }
        TU.Portrait.draw(c, 'caddy' + i, cd.look, 32, y + 5, 38, cd.color);
        ui.text(c, `${cd.name.toUpperCase()}  -  ${cd.title}`, 76, y + 7, { size: 8 });
        const e = cd.err;
        const acc = e.dist === 0 ? 'Exact yardage, wind and club' : `Yardage +/-${Math.round(e.dist * 100)}%  Wind +/-${e.wdir} deg  ${e.clubP > 0.3 ? 'Clubs often wrong' : e.clubP > 0 ? 'Clubs sometimes wrong' : 'Clubs right'}`;
        ui.text(c, acc, 76, y + 22, { size: 6, color: '#cfe8d8' });
        ui.text(c, cd.blurb, 76, y + 34, { size: 6, color: '#8fb3a0' });
        ui.text(c, cur ? 'YOUR CADDY' : hired ? 'HIRED' : `${cd.price} TEES`, 568, y + 7, { size: 8, align: 'right', color: hired ? '#cfe8d8' : '#ffe066' });
        ui.text(c, i ? `FEE ${TU.caddy.fee(i)}/ROUND` : 'NO FEE', 568, y + 34, { size: 6, align: 'right', color: '#ffb36a' });
      });
    },
    update(dt) {
      if (this.msg && (this.msg.t -= dt) <= 0) this.msg = null;
      if (this.editing) {
        const p = TU.save.data.player;
        for (const k of input.typed) {
          if (k === 'Backspace') p.name = p.name.slice(0, -1);
          else if (/^[a-zA-Z0-9 ]$/.test(k) && p.name.length < 12) p.name += k;
        }
        if (input.isPressed('Enter', 'Escape')) { this.editing = false; ui.nav = true; if (!p.name.trim()) p.name = 'Player'; TU.save.write(); }
        return;
      }
      if (input.isPressed('Escape')) TU.go('home');
      // drag the preview to spin it, otherwise it turns slowly
      if (input.down && input.mx > 600 && input.my > 90 && input.my < 470) this.rot += (input.mx - (this.lastMx ?? input.mx)) * 0.012;
      else this.rot += dt * 0.5;
      this.lastMx = input.down ? input.mx : null;
    },

    render3D() {
      const tee = this.hole.tee;
      R3.update(TU.time);
      R3.setBall(tee.x + 40, tee.y, 0);
      R3.setDots([]); R3.setRing(0, 0, false); R3.showArrows(false); R3.setMarker(0, 0, false);
      R3.clearTrees(tee.x, tee.y, 8);
      R3.sign.visible = false;
      const m = this.model;
      if ((this.tab === 'golfer' || this.tab === 'caddy') && m) {
        TU.Golfer3D.placeAt(m, tee.x, tee.y, Math.PI + this.rot);
        m.pose({ mode: 'stand' });
        R3.look(tee.x + 0.3, tee.y + 3.9, 1.25, tee.x - 1.9, tee.y, 0.95); // golfer lands in the open area right of the panel
      } else if (this.tab === 'cart' && m) {
        // spin around the middle of the cart and back the camera off for long or lifted carts
        const h = Math.PI + this.rot, f = TU.util.dirVec(h), ex = m.ex || 0, k = 1 + ex * 0.6 + (m.lift || 0) * 0.5;
        TU.Cart3D.place(m, tee.x + f.x * ex / 2, tee.y + f.y * ex / 2, h);
        if (m.rotor) for (const f of m.rotor) f.rotation.y += 0.15;
        R3.look(tee.x + 0.5 * k, tee.y + 6.4 * k, 2.3 * k, tee.x - 3.0 * k, tee.y, 0.6 + (m.lift || 0) * 0.5);
      } else if (this.tab === 'clubs' && m) {
        G3addr(m, tee);
        R3.look(tee.x + 0.6, tee.y + 4.4, 1.3, tee.x - 1.8, tee.y, 0.8);
      } else {
        R3.look(tee.x, tee.y + 6, 2, tee.x, tee.y - 10, 1);
      }
    },

    drawUI(c) {
      const s = TU.save.data;
      c.fillStyle = 'rgba(10,22,16,0.82)';
      c.fillRect(0, 0, 600, 540);
      ui.text(c, 'PRO SHOP', 24, 16, { size: 20, color: '#ffe066' });
      ui.text(c, `TEES: ${s.tees}`, 936, 18, { size: 14, align: 'right', color: '#ffe066' });
      TABS.forEach(([id, label], i) => {
        if (ui.button(c, 24 + i * 140, 52, 130, 30, label, { size: 10, color: this.tab === id ? '#2e9e5b' : '#55606a' })) this.setTab(id);
      });

      let y = 98;
      if (this.tab === 'clubs') this.drawClubs(c);
      if (this.tab === 'caddy') this.drawCaddies(c);
      if (this.tab === 'golfer') {
        ui.text(c, `NAME: ${s.player.name}${this.editing && Math.floor(TU.time * 2) % 2 ? '_' : ''}`, 24, y + 6, { size: 10 });
        if (ui.button(c, 470, y, 110, 24, this.editing ? 'DONE' : 'EDIT', { size: 8, color: '#3d6fb0' })) {
          this.editing = !this.editing;
          ui.nav = !this.editing;
          TU.save.write();
        }
        if (this.editing) ui.text(c, 'Type a name, Enter to finish', 24, y + 22, { size: 6, color: '#8fb3a0' });
        y += 34;
      }
      // category chips
      const groups = this.groups();
      groups.forEach((g, i) => {
        const cx = 24 + (i % 6) * 93, cy = y + Math.floor(i / 6) * 28;
        if (ui.button(c, cx, cy, 87, 22, g.label, { size: 6, color: i === this.cat ? '#2e9e5b' : '#2b4a3a' })) this.setCat(i);
      });
      y += Math.ceil(groups.length / 6) * 28 + 10;

      const g = groups[this.cat];
      if (g) {
        const d = this.data(), cur = CAT.get(d, g.key);
        ui.text(c, g.label, 24, y, { size: 10, color: '#ffe066' });
        y += 20;
        if (g.number) {
          // number picker: -10 / -1 / big number / +1 / +10
          const [lo, hi] = g.number, n = d[g.key] ?? 7;
          const setN = v => { d[g.key] = TU.util.clamp(v, lo, hi); TU.save.write(); this.rebuild(); TU.audio.play('click'); };
          if (ui.button(c, 24, y, 56, 50, '-10', { size: 8, color: '#3d6fb0' })) setN(n - 10);
          if (ui.button(c, 86, y, 56, 50, '-1', { size: 10, color: '#3d6fb0' })) setN(n - 1);
          ui.panel(c, 150, y, 120, 50, { fill: '#0b1410' });
          ui.text(c, `${n}`, 210, y + 13, { size: 22, align: 'center', color: '#ffe066' });
          if (ui.button(c, 278, y, 56, 50, '+1', { size: 10, color: '#3d6fb0' })) setN(n + 1);
          if (ui.button(c, 340, y, 56, 50, '+10', { size: 8, color: '#3d6fb0' })) setN(n + 10);
          const tip = d.decal === 'number' ? 'Shown on both sides, the hood and the back. Free to change.' : g.info;
          ui.wrap(c, tip, 540, 8).forEach((l, k) => ui.text(c, l, 24, y + 62 + k * 14, { size: 8, color: d.decal === 'number' ? '#cfe8d8' : '#ffb36a' }));
        } else if (g.sliders) {
          // free body designer: every slider is limited so the golf swing still looks right
          d.shape = d.shape || {};
          // two columns so all six sliders fit above the BACK / BUY buttons
          g.sliders.forEach(([k, label, lo, hi], i) => {
            const sx = 24 + (i % 2) * 284, sy = y + 6 + Math.floor(i / 2) * 50, v = d.shape[k] || 0;
            ui.text(c, label, sx, sy, { size: 8 });
            const nv = ui.slider(c, sx, sy + 16, 250, (v + 1) / 2) * 2 - 1;
            ui.text(c, lo, sx, sy + 40, { size: 6, color: '#8fb3a0' });
            ui.text(c, hi, sx + 250, sy + 40, { size: 6, align: 'right', color: '#8fb3a0' });
            if (Math.abs(nv - v) > 0.01) { d.shape[k] = Math.round(nv * 20) / 20; this.shapeDirty = true; }
          });
          if (ui.button(c, 490, y - 24, 90, 20, 'RESET', { size: 6, color: '#55606a' })) { d.shape = {}; this.shapeDirty = true; }
          if (this.shapeDirty && !TU.input.down) { this.shapeDirty = false; TU.save.write(); this.rebuild(); }
          else if (this.shapeDirty && (this.shapeT = (this.shapeT || 0) + 1) % 6 === 0) this.rebuild();
        } else if (g.color) {
          g.options.forEach((o, i) => {
            const [v, , price] = o, ox = 24 + (i % 12) * 46, oy = y + Math.floor(i / 12) * 50;
            const owned = CAT.owned(this.tab, g.key, v, price);
            const sel = v === cur, trying = this.preview && this.preview.value === v;
            if (sel || trying) { c.fillStyle = trying ? '#ffb347' : '#ffe066'; c.fillRect(ox - 4, oy - 4, 44, 44); }
            if (ui.button(c, ox, oy, 36, 36, '', { color: v })) this.select(g, o);
            if (TU.R3.isGold(v)) {
              // a little glint so solid gold reads as metal, not just yellow
              c.fillStyle = 'rgba(255,255,255,0.85)';
              c.fillRect(ox + 8, oy + 8, 12, 3); c.fillRect(ox + 8, oy + 8, 3, 12);
              c.fillRect(ox + 24, oy + 22, 4, 4);
              ui.text(c, 'GOLD', ox + 18, oy + 27, { size: 6, align: 'center', color: '#5a3d00', shadow: false });
            }
            if (!owned) ui.text(c, `${price}`, ox + 18, oy + 40, { size: 6, align: 'center', color: '#ffe066' });
          });
        } else {
          g.options.forEach((o, i) => {
            let [v, name, price] = o;
            // long lists use a tighter 5-column grid so everything fits above the footer
            const many = g.options.length > 8, cols = many ? 5 : 4, bw = many ? 106 : 130, bh = many ? 38 : 44;
            const ox = 24 + (i % cols) * (bw + 6), oy = y + Math.floor(i / cols) * (bh + 6);
            let sub, owned;
            if (g.upgrade) {
              owned = v <= (d.speedLevel || 0);
              sub = owned ? (v === (d.speedLevel || 0) ? 'INSTALLED' : 'OWNED') : `${price} TEES`;
              if (v > 0) name = `${name} +${v * 15}%`;
            } else {
              owned = CAT.owned(this.tab, g.key, v, price);
              sub = v === cur ? 'EQUIPPED' : owned ? (price ? 'OWNED' : 'FREE') : `${price} TEES`;
            }
            const trying = this.preview && this.preview.value === v;
            const col = trying ? '#c07a1e' : v === cur || (g.upgrade && v === (d.speedLevel || 0)) ? '#2e9e5b' : owned ? '#3d6fb0' : '#55606a';
            if (ui.button(c, ox, oy, bw, bh, name, { size: many ? 6 : 8, sub, color: col })) this.select(g, o);
          });
          const tip = g.info && g.info[this.preview && this.preview.key === g.key ? this.preview.value : cur];
          const rowsN = g.options.length > 8 ? Math.ceil(g.options.length / 5) * 44 : Math.ceil(g.options.length / 4) * 50;
          if (tip) ui.wrap(c, tip, 540, 8).forEach((l, k) => ui.text(c, l, 24, y + rowsN + 4 + k * 14, { size: 8, color: '#cfe8d8' }));
        }
      }

      // footer: try-on + buy
      if (this.preview) {
        const p = this.preview, afford = s.tees >= p.price;
        ui.text(c, `TRYING: ${p.name.toUpperCase()}`, 24, 440, { size: 8, color: '#ffb347' });
        ui.text(c, `${p.price} TEES`, 24, 456, { size: 10, color: afford ? '#ffe066' : '#ff8a6a' });
        if (ui.button(c, 300, 482, 150, 44, 'BUY', { size: 12, sub: afford ? '' : 'NOT ENOUGH', color: afford ? '#2e9e5b' : '#7a4a3a' })) this.buy();
        if (ui.button(c, 460, 482, 120, 44, 'CANCEL', { size: 10, color: '#55606a' })) { this.preview = null; this.rebuild(); }
      }
      if (this.msg) ui.text(c, this.msg.text, 24, 420, { size: 8, color: this.msg.bad ? '#ff8a6a' : '#7dff9a' });
      if (ui.button(c, 24, 482, 130, 44, 'BACK', { color: '#55606a' })) TU.go('home');
      if (this.model) ui.text(c, 'Drag to rotate', 780, 512, { size: 8, align: 'center', color: '#e8f4ec' });
    },
  };
})();
