// Settings: GENERAL (volumes, graphics style, reset save) and CONTROLS (rebind keys).
(function () {
  const ui = TU.ui, K = TU.keys, input = TU.input;
  TU.scenes.settings = {
    enter() { ui.nav = true; this.tab = 'general'; this.confirm = 0; this.msg = ''; this.waiting = null; this.boss = null; this.bossMsg = null; },
    // I'M THE BOSS: the secret code gives you everything in the game
    bossUnlock() {
      const s = TU.save.data, own = s.owned;
      s.tees = 999999;
      s.career.unlockAll = true;
      s.career.tier = TU.career.TIERS.length - 1;
      for (const tab of ['golfer', 'cart']) for (const g of TU.catalog[tab]) {
        if (!g.options) continue;
        if (g.upgrade) { s.cart[g.key] = Math.max(s.cart[g.key] || 0, ...g.options.map(o => o[0])); continue; } // fully upgraded
        for (const [v, , price] of g.options) if (price) own[TU.catalog.id(tab, g.key, v)] = true;
      }
      TU.clubs.sets.forEach((_, i) => { own['clubs:' + i] = true; });
      TU.caddy.list.forEach((_, i) => { own['caddy:' + i] = true; });
      s.boss = true;
      TU.save.write();
    },
    update(dt) {
      if (this.confirm > 0) this.confirm -= dt;
      if (this.bossMsg && (this.bossMsg.t -= dt) <= 0) this.bossMsg = null;
      if (this.boss) {
        // typing the code (digits only, Enter to check, Esc to cancel)
        for (const k of input.typed) {
          if (k === 'Backspace') this.boss.code = this.boss.code.slice(0, -1);
          else if (/^[0-9]$/.test(k) && this.boss.code.length < 8) this.boss.code += k;
        }
        if (input.isPressed('Enter')) this.checkBoss();
        if (input.isPressed('Escape')) { this.boss = null; ui.nav = true; }
        return;
      }
      if (this.waiting) {
        // capture the next key press for the selected slot (Esc cancels)
        const code = Object.keys(input.pressed)[0];
        if (code) {
          if (code !== 'Escape') K.set(this.waiting.action, this.waiting.slot, code);
          this.waiting = null;
          ui.nav = true;
        }
        return;
      }
      if (input.isPressed('Escape')) TU.go('home');
    },
    checkBoss() {
      if (this.boss.code === '2102') {
        this.bossUnlock();
        this.boss = null; ui.nav = true;
        this.bossMsg = { text: 'Welcome back, boss. Everything is yours.', t: 3, ok: true };
        TU.audio.play('cheer');
      } else {
        this.boss.code = '';
        this.bossMsg = { text: 'Wrong code.', t: 2 };
        TU.audio.play('bad');
      }
    },
    drawUI(c) {
      ui.text(c, 'SETTINGS', 480, 24, { size: 24, align: 'center', color: '#ffe066' });
      if (ui.button(c, 300, 66, 170, 36, 'GENERAL', { size: 10, color: this.tab === 'general' ? '#2e9e5b' : '#55606a' })) this.tab = 'general';
      if (ui.button(c, 490, 66, 170, 36, 'CONTROLS', { size: 10, color: this.tab === 'controls' ? '#2e9e5b' : '#55606a' })) this.tab = 'controls';
      if (this.tab === 'general') this.drawGeneral(c); else this.drawControls(c);
      if (ui.button(c, 380, 486, 200, 40, 'BACK', { color: '#55606a' })) TU.go('home');
      if (this.boss) this.drawBoss(c);
    },
    drawBoss(c) {
      c.fillStyle = 'rgba(0,0,0,0.65)';
      c.fillRect(0, 0, 960, 540);
      ui.panel(c, 280, 160, 400, 220, { fill: '#1a2a20' });
      ui.text(c, "I'M THE BOSS", 480, 180, { size: 16, align: 'center', color: '#ffe066' });
      ui.text(c, 'Type the code:', 480, 214, { size: 8, align: 'center', color: '#cfe8d8' });
      const shown = '*'.repeat(this.boss.code.length) + (Math.floor(TU.time * 2) % 2 ? '_' : ' ');
      ui.panel(c, 380, 234, 200, 44, { fill: '#0f1a14' });
      ui.text(c, shown, 480, 248, { size: 18, align: 'center' });
      if (this.bossMsg && !this.bossMsg.ok) ui.text(c, this.bossMsg.text, 480, 290, { size: 8, align: 'center', color: '#ff8a6a' });
      if (ui.button(c, 300, 312, 170, 48, 'OK', { color: '#2e9e5b' })) this.checkBoss();
      if (ui.button(c, 490, 312, 170, 48, 'CANCEL', { color: '#55606a' })) { this.boss = null; ui.nav = true; }
    },
    drawGeneral(c) {
      const s = TU.save.data.settings;
      ui.panel(c, 120, 126, 720, 340);
      ui.text(c, 'SOUND FX', 150, 146, { size: 12 });
      const sfx = ui.slider(c, 150, 170, 300, s.sfx);
      ui.text(c, 'MUSIC', 150, 214, { size: 12 });
      const mus = ui.slider(c, 150, 238, 300, s.music);
      if (sfx !== s.sfx || mus !== s.music) { s.sfx = sfx; s.music = mus; TU.audio.applyVolume(); TU.save.write(); }

      ui.text(c, 'GRAPHICS STYLE', 510, 146, { size: 12 });
      const styles = [['pixel', 'PIXELATED', 'Chunky retro pixels'], ['smooth', 'HIGH RES', 'Sharp, smooth HD']];
      styles.forEach(([id, label, sub], i) => {
        const on = (s.gfx || 'pixel') === id;
        if (ui.button(c, 510 + i * 160, 172, 146, 56, label, { size: 10, sub, color: on ? '#2e9e5b' : '#55606a' }) && !on) {
          s.gfx = id;
          TU.save.write();
          TU.R3.setStyle(id);
        }
      });

      ui.text(c, 'DIFFICULTY', 510, 262, { size: 12 });
      const diffs = [['easy', 'EASY', 'Slow, 10s'], ['regular', 'REGULAR', 'Faster, 6s'], ['hard', 'HARD', 'Fastest, 4s']];
      diffs.forEach(([id, label, sub], i) => {
        const on = (s.difficulty || 'easy') === id;
        if (ui.button(c, 510 + i * 104, 288, 96, 56, label, { size: 8, sub, color: on ? '#2e9e5b' : '#55606a' }) && !on) { s.difficulty = id; TU.save.write(); }
      });
      ui.wrap(c, 'Swing meter speed, time per step and the size of the PERFECT zone.', 300, 8).forEach((l, k) => ui.text(c, l, 510, 360 + k * 14, { size: 8, color: '#8fb3a0' }));

      const boss = TU.save.data.boss;
      if (ui.button(c, 510, 400, 300, 44, boss ? "I'M THE BOSS  (ON)" : "I'M THE BOSS", { size: 10, color: boss ? '#c9a227' : '#7b5bb5' }) && !this.boss) {
        // already the boss: just top the Tees back up and grab anything new
        if (boss) { this.bossUnlock(); this.bossMsg = { text: 'Tees topped up. Everything is yours.', t: 2.5, ok: true }; TU.audio.play('coin'); }
        else { this.boss = { code: '' }; this.bossMsg = null; ui.nav = false; }
      }
      if (this.bossMsg && this.bossMsg.ok) ui.text(c, this.bossMsg.text, 510, 450, { size: 6, color: '#7dff9a' });

      const label = this.confirm > 0 ? 'CLICK AGAIN TO CONFIRM' : 'RESET SAVE DATA';
      if (ui.button(c, 150, 330, 300, 48, label, { color: '#b03a3a', size: this.confirm > 0 ? 10 : 12 })) {
        if (this.confirm > 0) { TU.save.reset(); TU.audio.applyVolume(); TU.R3.setStyle(TU.save.data.settings.gfx); this.msg = 'Save data reset.'; this.confirm = 0; }
        else this.confirm = 3;
      }
      if (this.msg) ui.text(c, this.msg, 150, 396, { size: 10, color: '#ffb0b0' });
      ui.text(c, 'Resets Tees, items, progress and settings.', 150, 420, { size: 8, color: '#8fb3a0' });
    },
    drawControls(c) {
      ui.panel(c, 120, 118, 720, 352);
      ui.text(c, 'ACTION', 146, 128, { size: 8, color: '#8fb3a0' });
      ui.text(c, 'KEY 1', 556, 128, { size: 8, align: 'center', color: '#8fb3a0' });
      ui.text(c, 'KEY 2', 706, 128, { size: 8, align: 'center', color: '#8fb3a0' });
      // rows shrink to fit as more actions get added, so the list never runs under BACK
      const rh = Math.min(21, Math.floor(296 / K.ACTIONS.length));
      K.ACTIONS.forEach(([a, name], i) => {
        const y = 144 + i * rh;
        ui.text(c, name, 146, y + (rh - 4) / 2 - 4, { size: 8, color: '#e8f4ec' });
        const keys = K.get(a);
        [0, 1].forEach(slot => {
          const w = this.waiting && this.waiting.action === a && this.waiting.slot === slot;
          const lbl = w ? 'PRESS KEY' : K.label(keys[slot]);
          if (ui.button(c, 486 + slot * 150, y, 140, rh - 4, lbl, { size: 8, color: w ? '#c07a1e' : '#3d6fb0' }) && !this.waiting) {
            this.waiting = { action: a, slot };
            ui.nav = false;
          }
        });
      });
      const y = 144 + K.ACTIONS.length * rh + 4;
      ui.text(c, this.waiting ? 'Press any key to bind it (Esc to cancel)' : 'Click a key to change it. Menus always use arrows + Enter.', 146, y + 4, { size: 8, color: '#ffe066' });
      if (ui.button(c, 676, y, 150, 22, 'RESET KEYS', { size: 8, color: '#b03a3a' })) K.reset();
    },
  };
})();
