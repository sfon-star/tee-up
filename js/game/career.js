// Career: 5 tiers x 4 events, each tier in its own setting (city, country, coast, mountains, desert). Each event is a short course (generated from fixed seeds) played
// against 5 NPC golfers. Finish top 3 to unlock the next event; top 3 in a tier's last event
// unlocks the next tier. Tees are paid by finishing position.
(function () {
  const U = TU.util;
  const TIERS = [
    { name: 'Muni Links', blurb: 'A city muni hemmed in by streets and towers. Learn the ropes.', holes: 3, wind: 6, fw: 21, bunkers: [2, 3], water: [0, 1], trees: 0.45, hills: 0.5, teeLift: [0, 2], greenDiff: 0.3, shapes: { L: 0.25 }, valley: 3, mountains: 0.1, skill: [-0.25, 0.3], purse: 100, color: '#2e9e5b',
      theme: 'city', events: ['Muni Monday', 'Pancake Classic', 'Muni Championship', 'Downtown Scramble'] },
    { name: 'Country Club', blurb: 'Green hills and farmland. Bunkers guard the greens.', holes: 3, wind: 10, fw: 18, bunkers: [3, 4], water: [0, 1], trees: 0.5, hills: 0.8, teeLift: [0, 4], greenDiff: 0.45, shapes: { L: 0.35, S: 0.15 }, valley: 6, mountains: 0.25, skill: [0.05, 0.5], purse: 190, color: '#3d6fb0',
      theme: 'country', events: ['Members Invitational', 'Blazer Cup', 'Club Championship', 'Harvest Open'] },
    { name: 'Coastal Classic', blurb: 'Palms, islands and the open sea. Cut the doglegs if you dare.', holes: 4, wind: 15, fw: 16, bunkers: [3, 5], water: [1, 3], trees: 0.45, hills: 1.0, teeLift: [0, 5], greenDiff: 0.6, shapes: { L: 0.3, S: 0.25, wide: 0.15 }, valley: 8, mountains: 0.35, creekChance: 0.3, skill: [0.25, 0.68], purse: 320, color: '#16a085',
      theme: 'coastal', events: ['Seagull Open', 'Lighthouse Pro-Am', 'Coastal Classic', 'Island Hopper'] },
    { name: 'Mountain Open', blurb: 'Deep valleys between big peaks, S-bends and zig-zags.', holes: 5, wind: 19, fw: 14, bunkers: [4, 5], water: [1, 2], trees: 0.62, hills: 1.6, teeLift: [3, 10], greenDiff: 0.75, shapes: { S: 0.3, Z: 0.3, L: 0.25 }, valley: 18, mountains: 0.9, skill: [0.42, 0.84], purse: 520, color: '#8e44ad',
      theme: 'mountain', events: ['Ridge Runner', 'Summit Series', 'Mountain Open', 'Peak Challenge'] },
    { name: 'Champions Tour', blurb: 'Red-rock desert canyons, creeks and lightning greens.', holes: 6, wind: 24, fw: 12, bunkers: [4, 6], water: [2, 3], trees: 0.6, hills: 1.3, teeLift: [0, 9], greenDiff: 0.95, shapes: { L: 0.2, S: 0.25, Z: 0.25, wide: 0.2 }, valley: 14, mountains: 0.7, creekChance: 0.5, skill: [0.6, 1.0], purse: 800, color: '#c0392b',
      theme: 'desert', events: ['Masters of Turf', 'Grand Slam Invitational', 'Tee Up Championship', 'Canyon Masters'] },
  ];
  const NAMES = ['Chip Morgan', 'Sandy Wedge', 'Bunker Bob', 'Fairway Fran', 'Lefty Lou', 'Slice Sally', 'Mulligan Mike', 'Birdie Bianca', 'Duffy McGee', 'Iron Ines',
    'Putter Pete', 'Hazel Hook', 'Eagle Eddie', 'Divot Dee', 'Bogey Bill', 'Grip Garcia', 'Tempo Tia', 'Caddyshack Carl', 'Links Lena', 'Wedge Walker'];
  const COLORS = ['#c0392b', '#2980b9', '#8e44ad', '#16a085', '#d35400', '#2c3e50', '#7f8c2d', '#b03a6e'];
  const PLACE_MULT = [1, 0.7, 0.5, 0.35, 0.25, 0.15];
  const courses = {};

  TU.career = {
    TIERS,
    id: (t, e) => `t${t}e${e}`,
    progress() { return TU.save.data.career; },
    result(t, e) { return (this.progress().results || {})[this.id(t, e)]; },
    tierUnlocked(t) { return !!this.progress().unlockAll || t <= (this.progress().tier || 0); },
    eventUnlocked(t, e) {
      if (this.progress().unlockAll) return true; // unlocked by I'M THE BOSS in Settings
      if (!this.tierUnlocked(t)) return false;
      if (e === 0) return true;
      const prev = this.result(t, e - 1);
      return !!prev && prev.best <= 3;
    },

    // Deterministic course for an event.
    course(t, e) {
      const key = this.id(t, e);
      if (courses[key]) return courses[key];
      const T = TIERS[t], r = U.rng(9000 + t * 100 + e * 10);
      const pick = ([a, b]) => a + Math.floor(r() * (b - a + 1));
      const pars = [4, 3, 5, 4, 4, 3, 5, 4];
      const holes = [];
      for (let h = 0; h < T.holes; h++) {
        const par = pars[(h + e * 2 + t) % pars.length];
        const len = par === 3 ? 125 + r() * 45 + t * 8 : par === 4 ? 300 + r() * 80 + t * 12 : 450 + r() * 60 + t * 12;
        // pick a shape for the longer holes from this tier's mix (the rest are classic doglegs)
        let shape = 'straight', roll = r();
        if (par !== 3) for (const [k, pr] of Object.entries(T.shapes || {})) { if (roll < pr) { shape = k; break; } roll -= pr; }
        const shapedLen = shape === 'straight' ? len : len * 1.08; // bends make the walk a bit longer
        holes.push(TU.holegen({
          seed: 10000 + t * 1000 + e * 100 + h, par, length: Math.round(shapedLen), shape,
          fw: T.fw * (0.9 + r() * 0.2), dogleg: (r() - 0.5) * (0.6 + t * 0.25), bunkers: pick(T.bunkers),
          water: pick(T.water), creek: par !== 3 && shape !== 'Z' && r() < (T.creekChance || 0), trees: T.trees, greenDiff: T.greenDiff,
          name: `Hole ${h + 1}`, terrain: { hills: T.hills * (0.7 + r() * 0.6), teeLift: pick(T.teeLift), valley: T.valley * (0.6 + r() * 0.8), mountains: T.mountains * (0.6 + r() * 0.8) },
        }));
        holes[h].number = h + 1;
        holes[h].theme = T.theme;
      }
      return (courses[key] = { id: key, name: T.events[e], holes });
    },

    // Five opponents for an event (fixed per event so the field is the same each time).
    field(t, e) {
      const T = TIERS[t], r = U.rng(500 + t * 31 + e * 7), used = new Set(), out = [];
      while (out.length < 5) {
        const n = NAMES[Math.floor(r() * NAMES.length)];
        if (used.has(n)) continue;
        used.add(n);
        const k = out.length / 4; // spread skills across the tier's range
        out.push({ name: n, skill: U.lerp(T.skill[0], T.skill[1], k * 0.85 + r() * 0.15), color: COLORS[out.length % COLORS.length], scores: [] });
      }
      return out;
    },

    // Strokes an NPC takes on a hole: better skill = lower, tougher tiers = higher.
    npcScore(npc, hole, t) {
      const mu = 0.9 - 1.6 * npc.skill + 0.15 * t + (hole.par === 5 ? -0.25 : hole.par === 3 ? 0.05 : 0);
      return U.clamp(hole.par + Math.round(mu + U.gauss() * 0.75), Math.max(1, hole.par - 2), 10);
    },

    // Prize for finishing in `place` (1-based) in tier t.
    prize(t, place) { return Math.round(TIERS[t].purse * (PLACE_MULT[place - 1] || 0.1)); },

    // Records a finished event; returns { place, prize, unlockedEvent, unlockedTier }.
    finish(t, e, place, score) {
      const p = this.progress();
      p.results = p.results || {};
      const key = this.id(t, e), prev = p.results[key];
      const firstTop3 = place <= 3 && (!prev || prev.best > 3);
      p.results[key] = { best: Math.min(place, prev ? prev.best : 99), score: Math.min(score, prev ? prev.score : 999), plays: (prev ? prev.plays : 0) + 1 };
      let unlockedTier = false;
      const last = TIERS[t].events.length - 1;
      if (place <= 3 && e === last && t + 1 < TIERS.length && (p.tier || 0) <= t) { p.tier = t + 1; unlockedTier = true; }
      const prize = this.prize(t, place) + (firstTop3 ? Math.round(TIERS[t].purse * 0.5) : 0);
      TU.save.data.tees += prize;
      TU.save.write();
      return { place, prize, firstTop3, unlockedEvent: place <= 3 && e < last && firstTop3, unlockedTier };
    },

    // A career round with its field of opponents.
    newRound(t, e) {
      const round = TU.Round.create({ course: this.course(t, e), mode: 'career', windMax: TIERS[t].wind });
      round.career = { t, e };
      round.npcs = this.field(t, e);
      return round;
    },
  };
})();
