// Swing meter in two separate steps, each with its own 10 second timer.
// STEP 1 POWER: a marker slides back and forth on the power bar, click to lock it.
// STEP 2 ACCURACY: a needle sweeps left/right over a centered target, click when it is in the green.
// Putts only use the power step. If a timer runs out, the current value is used.
(function () {
  // Difficulty: marker speed, seconds per step, and size of the PERFECT / GOOD zones.
  const DIFF = {
    easy: { speed: 1, limit: 10, perfect: 0.15, good: 0.4 },
    regular: { speed: 1.5, limit: 6, perfect: 0.11, good: 0.3 },
    hard: { speed: 2.1, limit: 4, perfect: 0.07, good: 0.2 },
  };

  class SwingMeter {
    constructor() { this.reset('full'); }
    reset(mode, opts = {}) {
      this.mode = mode;
      this.state = 'idle';
      this.pos = 0; this.dirn = 1; this.needle = 0; this.ndir = 1;
      this.power = 0; this.acc = 0;
      const d = DIFF[TU.save.data.settings.difficulty] || DIFF.easy;
      this.limit = d.limit; this.perfect = d.perfect; this.good = d.good;
      this.timer = this.limit; this.pause = 0;
      // a tough lie (sand) shrinks the sweet spot
      if (opts.tight) { this.perfect *= opts.tight; this.good *= Math.sqrt(opts.tight); }
      this.speed = (opts.speed || 1) * d.speed;
      this.pauseMul = opts.pause || 1;
      this.target = opts.target ?? null; // 0..1 marker for "power needed to reach the pin"
      this.targetLabel = opts.targetLabel || '';
      this.quality = '';
    }
    start() { this.state = 'power'; this.pos = 0; this.dirn = 1; this.timer = this.limit; TU.audio.play('meter'); }
    click() {
      if (this.state === 'power') this.lockPower();
      else if (this.state === 'accuracy') this.lockAccuracy();
    }
    lockPower() {
      this.power = Math.max(0.02, this.pos);
      TU.audio.play('meter');
      if (this.mode === 'putt') { this.state = 'done'; return; }
      this.state = 'between';
      this.pause = 0.7 * this.pauseMul;
    }
    lockAccuracy() {
      const n = this.needle, a = Math.abs(n);
      this.acc = a < this.perfect ? 0 : -n; // needle left = hook (positive), right = slice; 0 = dead straight
      TU.audio.play('meter');
      this.quality = a < this.perfect ? 'PERFECT!' : a < this.good ? (this.acc > 0 ? 'Slight draw' : 'Slight fade') : (this.acc > 0 ? 'HOOK' : 'SLICE');
      this.state = 'done';
    }
    update(dt) {
      const sp = this.speed;
      if (this.state === 'power') {
        this.timer -= dt;
        this.pos += this.dirn * dt * (this.mode === 'putt' ? 0.42 : 0.5) * sp;
        if (this.pos >= 1) { this.pos = 1; this.dirn = -1; }
        if (this.pos <= 0) { this.pos = 0; this.dirn = 1; }
        if (this.timer <= 0) this.lockPower();
      } else if (this.state === 'between') {
        this.pause -= dt;
        if (this.pause <= 0) { this.state = 'accuracy'; this.timer = this.limit; this.needle = -1; this.ndir = 1; }
      } else if (this.state === 'accuracy') {
        this.timer -= dt;
        this.needle += this.ndir * dt * 0.9 * sp;
        if (this.needle >= 1) { this.needle = 1; this.ndir = -1; }
        if (this.needle <= -1) { this.needle = -1; this.ndir = 1; }
        if (this.timer <= 0) this.lockAccuracy();
      }
    }

    draw(c, x, y, w) {
      const ui = TU.ui, h = 30;
      const step = this.state === 'accuracy' ? 2 : 1;
      const steps = this.mode === 'putt' ? '' : ` - STEP ${step} OF 2`;
      ui.panel(c, x, y - 26, w, h + 72, { fill: '#14261d' });
      const accStep = this.state === 'accuracy' || (this.state === 'done' && this.mode !== 'putt');
      ui.text(c, (accStep ? 'ACCURACY' : 'POWER') + steps, x + 14, y - 16, { size: 10, color: '#ffe066' });
      if (step === 2 || this.state === 'between' || (this.state === 'done' && this.mode !== 'putt')) {
        ui.text(c, `POWER ${Math.round(this.power * 100)}%`, x + w - 74, y - 16, { size: 8, align: 'right', color: '#cfe8d8' });
      }
      const bx = x + 14, bw = w - 88, by = y + 6;
      if (!accStep) {
        for (let i = 0; i < bw; i += 4) {
          const v = i / bw;
          c.fillStyle = `hsl(${120 - v * 100},65%,${38 + v * 14}%)`;
          c.fillRect(bx + i, by, 4, h);
        }
        [0.25, 0.5, 0.75].forEach(v => { c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(bx + bw * v - 1, by, 2, h); });
        if (this.target !== null) {
          const tx = bx + bw * Math.min(1, this.target);
          c.fillStyle = '#ffffff';
          c.fillRect(tx - 2, by - 6, 4, h + 12);
          ui.text(c, this.targetLabel || 'PIN', tx, by + h + 8, { size: 8, align: 'center', color: '#fff' });
        }
        const val = this.state === 'idle' ? 0 : this.state === 'power' ? this.pos : this.power;
        if (this.state !== 'idle') this.drawMarker(c, bx + bw * val, by, h);
      } else {
        c.fillStyle = '#7a2f2f'; c.fillRect(bx, by, bw, h);
        const cx = bx + bw / 2, half = bw / 2;
        c.fillStyle = '#c9a23a'; c.fillRect(cx - half * this.good, by, half * this.good * 2, h);
        c.fillStyle = '#3fbf5f'; c.fillRect(cx - half * this.perfect, by, half * this.perfect * 2, h);
        c.fillStyle = '#fff'; c.fillRect(cx - 1, by - 4, 2, h + 8);
        ui.text(c, 'HOOK', bx + 4, by + h + 8, { size: 8, color: '#ffb0a0' });
        ui.text(c, 'SLICE', bx + bw - 4, by + h + 8, { size: 8, align: 'right', color: '#ffb0a0' });
        ui.text(c, 'PERFECT', cx, by + h + 8, { size: 8, align: 'center', color: '#a8ffb8' });
        const nv = this.state === 'done' ? -this.acc : this.needle;
        this.drawMarker(c, cx + nv * half, by, h);
      }
      // timer on the side
      const tx = x + w - 62, ty = y + 2;
      const active = this.state === 'power' || this.state === 'accuracy';
      const frac = active ? Math.max(0, this.timer) / this.limit : 1;
      c.fillStyle = '#0b1410'; c.fillRect(tx, ty, 48, 52);
      c.fillStyle = frac < 0.3 ? '#e04848' : '#3fbf5f';
      c.fillRect(tx + 4, ty + 4 + 44 * (1 - frac), 12, 44 * frac);
      ui.text(c, active ? `${Math.ceil(Math.max(0, this.timer))}` : '--', tx + 34, ty + 18, { size: 12, align: 'center', color: '#fff' });
      ui.text(c, 'SEC', tx + 34, ty + 36, { size: 6, align: 'center', color: '#cfe8d8' });

      let label;
      if (this.state === 'idle') label = 'Click or Space to start your swing';
      else if (this.state === 'power') label = this.mode === 'putt' ? 'Click when the marker reaches the PIN line' : 'Click to lock your POWER';
      else if (this.state === 'between') label = 'Power locked! Get ready for accuracy...';
      else if (this.state === 'accuracy') label = 'Click when the needle is in the GREEN';
      else label = this.quality || '';
      ui.text(c, label, x + 14, y + h + 28, { size: 8, color: '#cfe8d8' });
    }
    drawMarker(c, mx, by, h) {
      c.fillStyle = '#0b1410';
      c.fillRect(mx - 4, by - 8, 8, h + 16);
      c.fillStyle = '#ffe066';
      c.fillRect(mx - 2, by - 6, 4, h + 12);
    }
  }
  TU.SwingMeter = SwingMeter;
  TU.SwingMeter.DIFF = DIFF;
})();
