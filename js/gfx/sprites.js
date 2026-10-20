// Procedural pixel-art sprites used by the top-down map texture.
(function () {
  const S = TU.sprites = {};

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  S.makeCanvas = makeCanvas;

  // ---------- Trees ----------
  S.trees = [0, 1, 2].map(v => {
    const cv = makeCanvas(16, 22), x = cv.getContext('2d');
    const pal = [['#2f7a34', '#47a04a', '#1f5a26'], ['#3a8a30', '#5cb04a', '#25622a'], ['#1f6040', '#2f8055', '#154a30']][v];
    x.fillStyle = '#5b3a24';
    x.fillRect(7, 14, 2, 8);
    x.fillStyle = '#3e2716';
    x.fillRect(8, 14, 1, 8);
    if (v < 2) {
      const r = v === 0 ? 7.5 : 6.5, cy = v === 0 ? 8 : 9;
      for (let yy = 0; yy < 18; yy++) for (let xx = 0; xx < 16; xx++) {
        const dx = xx + 0.5 - 8, dy = yy + 0.5 - cy;
        if (dx * dx + dy * dy > r * r) continue;
        const k = dx + dy, n = TU.util.hash(xx, yy, v);
        x.fillStyle = k < -5 || (k < -1 && n > 0.75) ? pal[1] : k > 4 || n < 0.12 ? pal[2] : pal[0];
        x.fillRect(xx, yy, 1, 1);
      }
    } else {
      for (let yy = 0; yy < 17; yy++) {
        const hw = (yy % 6) + Math.floor(yy / 6) * 1.5 + 0.5;
        for (let xx = Math.floor(8 - hw); xx < Math.ceil(8 + hw); xx++) {
          x.fillStyle = xx < 7 ? pal[1] : xx > 8 ? pal[2] : pal[0];
          x.fillRect(xx, yy + 1, 1, 1);
        }
      }
    }
    return cv;
  });

})();
