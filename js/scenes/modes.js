// Mode select: CAREER, ARCHITECT, MULTIPLAYER, ONLINE.
(function () {
  const ui = TU.ui;
  TU.scenes.modes = {
    enter() { ui.nav = true; },
    update() { if (TU.input.isPressed('Escape')) TU.go('home'); },
    drawUI(c) {
      ui.text(c, 'CHOOSE A MODE', 480, 50, { size: 28, align: 'center', color: '#ffe066' });
      const cards = [
        { t: 'CAREER', d: 'Climb 5 tiers of events against rival golfers. Win Tees, unlock tougher courses.', col: '#2e9e5b', go: () => TU.go('career') },
        { t: 'ARCHITECT', d: 'Paint your own holes, build 1, 9 or 18 hole courses and test-play them.', col: '#7b5bb5', go: () => TU.go('architect') },
        { t: 'MULTIPLAYER', d: 'Hot-seat for 2-6 players on one device. Pick names, colors and a course, then pass it around.', col: '#c0563a', go: () => TU.go('mpsetup') },
        { t: 'ONLINE', d: 'Play friends anywhere with a room code. Everyone brings their own golfer, cart and caddy.', col: '#2e7bd0', go: () => TU.go('online') },
      ];
      cards.forEach((cd, i) => {
        const x = 30 + i * 228, y = 130;
        ui.panel(c, x, y, 216, 300, { fill: '#173024' });
        ui.wrap(c, cd.d, 180, 8).forEach((l, k) => ui.text(c, l, x + 18, y + 30 + k * 16, { size: 8, color: '#cfe8d8' }));
        if (ui.button(c, x + 14, y + 220, 188, 56, cd.t, { color: cd.col, disabled: cd.disabled, size: cd.t.length > 9 ? 12 : 14 })) cd.go();
      });
      if (ui.button(c, 380, 470, 200, 44, 'BACK', { color: '#55606a' })) TU.go('home');
    },
  };
})();
