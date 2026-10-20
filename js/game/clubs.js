// Club bag and club sets. Set stats scale every club.
(function () {
  TU.clubs = {
    bag: [
      { id: 'dr', name: 'Driver', carry: 220, loft: 0.11, roll: 0.14, spread: 3.0, type: 'wood', teeOnly: true },
      { id: '3w', name: '3 Wood', carry: 200, loft: 0.13, roll: 0.12, spread: 2.6, type: 'wood' },
      { id: '5i', name: '5 Iron', carry: 170, loft: 0.17, roll: 0.09, spread: 2.2, type: 'iron' },
      { id: '7i', name: '7 Iron', carry: 148, loft: 0.21, roll: 0.07, spread: 1.9, type: 'iron' },
      { id: '9i', name: '9 Iron', carry: 125, loft: 0.26, roll: 0.05, spread: 1.6, type: 'iron' },
      { id: 'pw', name: 'Pitch Wedge', carry: 100, loft: 0.30, roll: 0.04, spread: 1.4, type: 'iron', wedge: true },
      { id: 'sw', name: 'Sand Wedge', carry: 70, loft: 0.36, roll: 0.03, spread: 1.2, type: 'iron', wedge: true },
      { id: 'pt', name: 'Putter', putter: true, type: 'putter' },
    ],
    sets: [
      { id: 'rusty', name: 'Rusty Starter Set', price: 0, dist: 0.88, acc: 1.6, spin: 0.1 },
      { id: 'club', name: 'Clubhouse Set', price: 400, dist: 0.95, acc: 1.25, spin: 0.3 },
      { id: 'tour', name: 'Tour Forged Set', price: 1200, dist: 1.02, acc: 0.95, spin: 0.55 },
      { id: 'pro', name: 'Pro Elite Set', price: 3000, dist: 1.08, acc: 0.7, spin: 0.8 },
      { id: 'legend', name: 'Legend Set', price: 7000, dist: 1.14, acc: 0.5, spin: 1.0 },
    ],
    currentSet() { return this.sets[TU.save.data.clubSet] || this.sets[0]; },
  };
})();
