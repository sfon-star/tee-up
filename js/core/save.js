// Save system: everything lives in localStorage under one key.
(function () {
  const KEY = 'teeup_save_v1';

  function defaults() {
    return {
      settings: { sfx: 0.7, music: 0.4, gfx: 'pixel', difficulty: 'easy', keys: {} },
      tees: 0,
      player: {
        name: 'Player',
        hair: 'short', hairColor: '#4a2c17', eyes: 'round', eyeColor: '#2b5d8a',
        skin: '#e8b48a', height: 1, body: 1,
        shirt: { style: 'polo', color: '#2f80ed', design: 'none' },
        pants: { style: 'long', color: '#e9e2cf', design: 'none' },
        jacket: { style: 'none', color: '#34495e', design: 'none' },
        shape: {},
        shoes: { style: 'sneaker', color: '#ffffff' },
        hat: { style: 'cap', color: '#e74c3c' },
        gloves: { style: 'left', color: '#ffffff' },
        mapColor: '#3d8bff',
      },
      owned: {},
      cart: { color: '#f4f4f0', decal: 'none', wheels: 'silver', roof: '#2e7d4f', speedLevel: 0, mapColor: '#ffe066', tires: 'standard', suspension: 'stock', seat: '#3b2a20', bag: '#b8372e', size: 'standard', speakers: 'none', fly: 'none', nitro: 'none', number: 7, station: 1 },
      starterBonus: false,
      caddyLevel: 0,
      clubSet: 0,
      career: { tier: 0, results: {} },
      courses: [],
    };
  }

  function merge(base, src) {
    if (!src || typeof src !== 'object' || Array.isArray(base)) return src === undefined ? base : src;
    const out = { ...base };
    for (const k of Object.keys(src)) {
      out[k] = base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) ? merge(base[k], src[k]) : src[k];
    }
    return out;
  }

  TU.save = {
    data: null,
    load() {
      let raw = null;
      try { raw = JSON.parse(localStorage.getItem(KEY)); } catch (e) { raw = null; }
      this.data = merge(defaults(), raw || {});
      // one-time welcome gift so the shop is usable from the start
      if (!this.data.starterBonus) { this.data.tees += 300; this.data.starterBonus = true; this.write(); }
    },
    write() {
      try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* storage full or blocked */ }
    },
    reset() {
      this.data = defaults();
      this.data.tees = 300;
      this.data.starterBonus = true;
      this.write();
    },
  };
  TU.save.load();
})();
