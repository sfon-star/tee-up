// Immediate-mode UI: text, panels, buttons with mouse + keyboard focus.
(function () {
  const input = TU.input;
  const ui = TU.ui = { rects: [], prevRects: [], focus: 0, nav: false };

  ui.font = size => `${size}px "Press Start 2P", monospace`;

  ui.reset = function () { ui.focus = 0; ui.nav = false; ui.rects = []; ui.prevRects = []; };

  ui.beginFrame = function () {
    ui.prevRects = ui.rects;
    ui.rects = [];
    const n = ui.prevRects.length;
    if (ui.nav && n) {
      if (input.isPressed('ArrowDown', 'ArrowRight', 'Tab')) { ui.focus = (ui.focus + 1) % n; TU.audio.play('meter'); }
      if (input.isPressed('ArrowUp', 'ArrowLeft')) { ui.focus = (ui.focus - 1 + n) % n; TU.audio.play('meter'); }
    }
  };
  ui.endFrame = function () {};

  const inRect = (r, x, y) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
  ui.overButton = () => ui.prevRects.some(r => inRect(r, input.mx, input.my));
  ui.inRect = (x, y, w, h) => inRect({ x, y, w, h }, input.mx, input.my);

  ui.text = function (c, str, x, y, o = {}) {
    const size = o.size || 16;
    c.font = ui.font(size);
    c.textAlign = o.align || 'left';
    c.textBaseline = o.base || 'top';
    if (o.shadow !== false) {
      c.fillStyle = o.shadowColor || 'rgba(0,0,0,0.6)';
      c.fillText(str, x + Math.max(2, size / 8), y + Math.max(2, size / 8));
    }
    c.fillStyle = o.color || '#fff';
    c.fillText(str, x, y);
  };

  // Wrap text to width, returns lines.
  ui.wrap = function (c, str, width, size) {
    c.font = ui.font(size);
    const words = str.split(' '), lines = [];
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (c.measureText(t).width > width && line) { lines.push(line); line = w; } else line = t;
    }
    if (line) lines.push(line);
    return lines;
  };

  ui.panel = function (c, x, y, w, h, o = {}) {
    c.fillStyle = o.border || '#0b1410';
    c.fillRect(x - 4, y - 4, w + 8, h + 8);
    c.fillStyle = o.fill || '#1e3a2c';
    c.fillRect(x, y, w, h);
    c.fillStyle = o.light || 'rgba(255,255,255,0.12)';
    c.fillRect(x, y, w, 4);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(x, y + h - 4, w, 4);
  };

  ui.button = function (c, x, y, w, h, label, o = {}) {
    const idx = ui.rects.length;
    ui.rects.push({ x, y, w, h });
    const hover = inRect({ x, y, w, h }, input.mx, input.my);
    if (hover && input.moved) ui.focus = idx;
    const focused = ui.nav && ui.focus === idx;
    const active = (hover || focused) && !o.disabled;
    const base = o.disabled ? '#4a5a52' : (o.color || '#2e9e5b');
    const y2 = y + (active && input.down && hover ? 2 : 0);
    c.fillStyle = '#0b1410';
    c.fillRect(x - 3, y - 3, w + 6, h + 9);
    c.fillStyle = shade(base, -40);
    c.fillRect(x, y + 4, w, h);
    c.fillStyle = active ? shade(base, 30) : base;
    c.fillRect(x, y2, w, h - 2);
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.fillRect(x, y2, w, 3);
    if (focused) {
      c.strokeStyle = '#ffe066';
      c.lineWidth = 3;
      c.strokeRect(x - 6, y - 6, w + 12, h + 14);
    }
    const size = o.size || 16;
    // with a second line (price, OWNED...), the label moves up so the two never overlap on short buttons
    const subSize = h < 44 ? 6 : 8;
    const ly = o.sub ? y2 + (h - subSize - 6) / 2 : y2 + h / 2 - 1;
    ui.text(c, label, x + w / 2, ly, { size, align: 'center', base: 'middle', color: o.disabled ? '#9aa' : '#fff' });
    if (o.sub) ui.text(c, o.sub, x + w / 2, y2 + h - subSize / 2 - 6, { size: subSize, align: 'center', base: 'middle', color: '#dfe' });
    const clicked = !o.disabled && ((hover && input.clicked) || (focused && input.isPressed('Enter', 'Space')));
    if (clicked) TU.audio.play('click');
    return clicked;
  };

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (n >> 16) + amt));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    const b = Math.max(0, Math.min(255, (n & 255) + amt));
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  ui.shade = shade;

  // Horizontal slider 0..1. Returns new value.
  ui.slider = function (c, x, y, w, value) {
    const h = 20;
    ui.rects.push({ x, y: y - 6, w, h: h + 12 });
    c.fillStyle = '#0b1410';
    c.fillRect(x - 3, y - 3, w + 6, h + 6);
    c.fillStyle = '#2b4a3a';
    c.fillRect(x, y, w, h);
    c.fillStyle = '#5fd38a';
    c.fillRect(x, y, w * value, h);
    c.fillStyle = '#fff';
    c.fillRect(x + w * value - 4, y - 6, 8, h + 12);
    if (input.down && inRect({ x: x - 10, y: y - 10, w: w + 20, h: h + 20 }, input.mx, input.my)) {
      return TU.util.clamp((input.mx - x) / w, 0, 1);
    }
    return value;
  };
})();
