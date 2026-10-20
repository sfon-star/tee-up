// Round state shared by all modes.
(function () {
  TU.Round = {
    create({ course, mode = 'quick', players, windMax = 10 }) {
      return {
        course, mode, windMax,
        holeIdx: 0,
        players: players || [{ name: TU.save.data.player.name, look: TU.save.data.player, scores: [], human: true }],
        turn: 0,
      };
    },
    // Multiplayer: give every player a different minimap color, keeping their own pick when it's free.
    assignMapColors(players) {
      const MAP = ['#3d8bff', '#ff5a5a', '#5fd38a', '#ff9f43', '#c56cf0', '#2ee6d6', '#ff6fb5', '#a3e635'];
      const used = new Set();
      for (const p of players) {
        const want = p.mapColor || (p.look && p.look.mapColor);
        p.mapColor = want && !used.has(want) ? want : MAP.find(c => !used.has(c));
        used.add(p.mapColor);
      }
      return players;
    },
    total(p) { return p.scores.reduce((a, b) => a + (b || 0), 0); },
    parThrough(round, n) { return round.course.holes.slice(0, n).reduce((a, h) => a + h.par, 0); },
    scoreName(diff, strokes) {
      if (strokes === 1) return 'HOLE IN ONE!';
      return { '-3': 'ALBATROSS!', '-2': 'EAGLE!', '-1': 'BIRDIE!', '0': 'PAR', '1': 'Bogey', '2': 'Double Bogey', '3': 'Triple Bogey' }[diff] || (diff < -3 ? 'INCREDIBLE!' : `+${diff}`);
    },
  };
})();
