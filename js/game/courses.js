// Built-in courses (generated from fixed seeds so they are always identical).
(function () {
  const lazy = {};
  TU.courses = {
    // 1-based number of a hole within its course (for signs).
    holeNumber(hole) {
      for (const id in lazy) { const i = lazy[id].holes.indexOf(hole); if (i >= 0) return i + 1; }
      return '';
    },
    get(id) {
      if (lazy[id]) return lazy[id];
      const def = this.defs[id];
      lazy[id] = { id, name: def.name, holes: def.holes.map((h, i) => Object.assign(TU.holegen({ ...h, name: h.name || `Hole ${i + 1}` }), { theme: def.theme })) };
      return lazy[id];
    },
    defs: {
      practice: {
        name: 'Practice Links',
        theme: 'country',
        holes: [
          { seed: 101, par: 4, length: 340, fw: 18, dogleg: 0.4, bunkers: 2, water: 0, trees: 0.5, greenDiff: 0.4, name: 'Welcome Mat', terrain: { hills: 0.6, teeLift: 5 } },
          { seed: 202, par: 3, length: 150, fw: 14, dogleg: 0, bunkers: 3, water: 1, trees: 0.5, greenDiff: 0.5, name: 'Little Splash', terrain: { hills: 0.4, teeLift: 8 } },
          { seed: 303, par: 5, length: 470, fw: 16, dogleg: -0.6, bunkers: 3, water: 1, trees: 0.6, greenDiff: 0.5, name: 'The Long Way', terrain: { hills: 0.9, teeLift: 3 } },
        ],
      },
    },
  };
})();
