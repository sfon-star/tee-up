// Beverage cart items. Each one is a power-up that lasts some holes or shots.
// mods: power (distance x), accuracy (spread x, lower = straighter), wind (wind effect x),
// meter (swing meter speed x, lower = easier), putt (putt meter speed x), pause (time between
// meter steps x), walk (walking speed x), short (accuracy x on shots under 90 yards).
// Up to 2 different power-ups can be active; the same item never stacks.
(function () {
  const ITEMS = [
    { id: 'clamato', name: 'Clamato', kind: 'drink', price: 600, color: '#c0392b', icon: 'CL', holes: 2,
      desc: 'Everything boosted, no downside. 2 holes.', mods: { power: 1.08, accuracy: 0.6, wind: 0.5, meter: 0.85, putt: 0.7, pause: 0.6, walk: 1.3, short: 0.7 } },
    { id: 'tequila', name: 'Tequila Shot', kind: 'drink', price: 220, color: '#e6c229', icon: 'TQ', holes: 1,
      desc: '+12% distance, a bit less accurate. 1 hole.', mods: { power: 1.12, accuracy: 1.3 } },
    { id: 'beer', name: 'Beer', kind: 'drink', price: 90, color: '#d4a017', icon: 'BR', teeShots: 1,
      desc: '+10% distance on your next tee shot.', mods: { power: 1.1 } },
    { id: 'energy', name: 'Energy Drink', kind: 'drink', price: 140, color: '#2ecc71', icon: 'EN', holes: 2,
      desc: 'Quicker meter recovery, faster walking. 2 holes.', mods: { pause: 0.4, walk: 1.35 } },
    { id: 'coffee', name: 'Coffee', kind: 'drink', price: 120, color: '#6f4e37', icon: 'CO', holes: 2,
      desc: 'Steady hands: slower, easier putting meter. 2 holes.', mods: { putt: 0.6 } },
    { id: 'sandwich', name: 'Club Sandwich', kind: 'food', price: 160, color: '#e9c46a', icon: 'CS', holes: 2,
      desc: 'Cancels the downsides of other items. 2 holes.', mods: {}, cleanse: true },
    { id: 'burger', name: 'Burger', kind: 'food', price: 260, color: '#a0522d', icon: 'BG', holes: 3,
      desc: '+15% distance for 3 holes, but slower walking.', mods: { power: 1.15, walk: 0.75 } },
    { id: 'orange', name: 'Orange Slices', kind: 'food', price: 150, color: '#ff8c1a', icon: 'OR', holes: 2,
      desc: 'Straighter shots and a steadier meter. 2 holes.', mods: { accuracy: 0.65, meter: 0.85 } },
    { id: 'jerky', name: 'Beef Jerky', kind: 'food', price: 130, color: '#7b3f00', icon: 'BJ', shots: 4,
      desc: 'Wind affects your next 4 shots less.', mods: { wind: 0.45 } },
    { id: 'chips', name: 'Chips', kind: 'food', price: 40, color: '#f4d35e', icon: 'CH', shots: 1,
      desc: 'A little more accurate, next shot only.', mods: { accuracy: 0.8 } },
    { id: 'biscuits', name: 'Biscuits', kind: 'food', price: 110, color: '#d9a066', icon: 'BI', holes: 2,
      desc: 'Better chips and pitches (under 90 yds). 2 holes.', mods: { short: 0.5 } },
    { id: 'donuts', name: 'Donuts', kind: 'food', price: 60, color: '#ff6fb5', icon: 'DO', holes: 1,
      desc: 'A small boost to everything. 1 hole.', mods: { power: 1.03, accuracy: 0.88, wind: 0.85, meter: 0.95, putt: 0.9, walk: 1.1, short: 0.9 } },
  ];
  const MAX_ACTIVE = 2;
  // which direction is a downside for each stat
  const BAD = { power: v => v < 1, accuracy: v => v > 1, wind: v => v > 1, meter: v => v > 1, putt: v => v > 1, pause: v => v > 1, walk: v => v < 1, short: v => v > 1 };

  TU.power = {
    ITEMS, MAX_ACTIVE,
    item(id) { return ITEMS.find(i => i.id === id); },
    // round.boosts holds the active ones: { id, holes, shots, teeShots }
    active(round) { return (round && round.boosts) || []; },
    canBuy(round, id) {
      const act = this.active(round);
      if (act.some(b => b.id === id)) return 'Already active';
      if (act.length >= MAX_ACTIVE) return `Max ${MAX_ACTIVE} at a time`;
      if (TU.save.data.tees < this.item(id).price) return 'Not enough Tees';
      return null;
    },
    buy(round, id) {
      const it = this.item(id);
      TU.save.data.tees -= it.price;
      TU.save.write();
      round.boosts = this.active(round).concat([{ id, holes: it.holes || 0, shots: it.shots || 0, teeShots: it.teeShots || 0 }]);
    },
    // Combined multipliers for a shot. shot: { tee, dist }
    mods(round, shot = {}) {
      const m = { power: 1, accuracy: 1, wind: 1, meter: 1, putt: 1, pause: 1, walk: 1 };
      const act = this.active(round), cleanse = act.some(b => this.item(b.id).cleanse);
      for (const b of act) {
        const it = this.item(b.id);
        if (b.teeShots && !shot.tee && shot.dist !== undefined) continue; // beer only helps tee shots
        for (const [k, v] of Object.entries(it.mods)) {
          if (cleanse && BAD[k] && BAD[k](v)) continue;
          if (k === 'short') { if (shot.dist !== undefined && shot.dist < 90) m.accuracy *= v; }
          else m[k] *= v;
        }
      }
      return m;
    },
    // Use up shot-based boosts after a full shot.
    shotTaken(round, tee) {
      for (const b of this.active(round)) {
        if (b.shots) b.shots--;
        if (b.teeShots && tee) b.teeShots--;
      }
      this.prune(round);
    },
    holeDone(round) {
      for (const b of this.active(round)) if (b.holes) b.holes--;
      this.prune(round);
    },
    prune(round) {
      if (!round || !round.boosts) return;
      round.boosts = round.boosts.filter(b => {
        const it = this.item(b.id);
        if (it.holes) return b.holes > 0;
        if (it.shots) return b.shots > 0;
        if (it.teeShots) return b.teeShots > 0;
        return false;
      });
    },
    label(b) {
      const it = this.item(b.id);
      return it.holes ? `${b.holes}H` : it.shots ? `${b.shots}S` : 'TEE';
    },
  };
})();
