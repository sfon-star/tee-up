// Everything the Shop sells or the customizer offers. Price 0 = free and always owned.
// Each group edits one key of the player look (or cart setup); dotted keys reach nested fields.
(function () {
  const C = (hexes, price = 0, firstFree = true) => hexes.map((h, i) => [h, '', firstFree && i === 0 ? 0 : price]);
  const HAIR = ['#1b1209', '#4a2c17', '#7a4a24', '#b07a3c', '#e3c27a', '#f0e2b6', '#9b9b9b', '#ffffff', '#c0392b', '#e67e22', '#2e86de', '#8e44ad', '#27ae60', '#ff6fb5'];
  const SKIN = ['#fde0c8', '#f5c9a6', '#e8b48a', '#d49a6a', '#b57a4f', '#8d5a36', '#6b4226', '#4a2c18'];
  const CLOTH = ['#2f80ed', '#e74c3c', '#27ae60', '#f1c40f', '#ffffff', '#1d1d1d', '#e9e2cf', '#8e44ad', '#e67e22', '#ff6fb5', '#16a085', '#34495e', '#7f8c8d', '#a0522d'];
  const free = list => list.map(([v, n]) => [v, n, 0]);
  // bright, easy-to-tell-apart marker colors for the minimap (first two are the defaults)
  const DESIGNS = [['none', 'Plain', 0], ['stripes', 'Stripes', 60], ['pinstripe', 'Pinstripe', 80], ['check', 'Checks', 80], ['plaid', 'Plaid', 120], ['argyle', 'Argyle', 140], ['dots', 'Polka Dots', 100], ['camo', 'Camo', 150], ['floral', 'Hawaiian', 180]];
  // solid gold: the most expensive option in each group
  const GOLD = '#d4af38', gold = price => [GOLD, 'Solid Gold', price];
  const MAP = ['#3d8bff', '#ffe066', '#ff5a5a', '#5fd38a', '#ff9f43', '#c56cf0', '#ff6fb5', '#2ee6d6', '#ffffff', '#a3e635'];

  TU.catalog = {
    golfer: [
      { key: 'hair', label: 'HAIR', options: [['short', 'Short', 0], ['long', 'Long', 0], ['buzz', 'Buzz', 0], ['bald', 'Bald', 0], ['bob', 'Bob', 60], ['ponytail', 'Ponytail', 60], ['spiky', 'Spiky', 80], ['afro', 'Afro', 120], ['mohawk', 'Mohawk', 150]] },
      { key: 'hairColor', label: 'HAIR COLOR', color: true, options: [...free(HAIR.map(h => [h, ''])), gold(2500)] },
      { key: 'skin', label: 'SKIN', color: true, options: free(SKIN.map(h => [h, ''])) },
      { key: 'shape', label: 'BODY SHAPE', sliders: [['height', 'HEIGHT', 'Shorter', 'Taller'], ['weight', 'WEIGHT', 'Thinner', 'Heavier'], ['shoulders', 'SHOULDERS', 'Narrow', 'Broad'], ['head', 'HEAD SIZE', 'Smaller', 'Bigger'], ['legs', 'LEG LENGTH', 'Shorter', 'Longer'], ['arms', 'ARM LENGTH', 'Shorter', 'Longer']] },
      { key: 'height', label: 'HEIGHT', options: [[0, 'Short', 0], [1, 'Average', 0], [2, 'Tall', 0]] },
      { key: 'body', label: 'BUILD', options: [[0, 'Slim', 0], [1, 'Average', 0], [2, 'Heavy', 0]] },
      { key: 'shirt.style', label: 'SHIRT', options: [['polo', 'Polo', 0], ['tee', 'T-Shirt', 0], ['stripes', 'Striped', 80], ['longsleeve', 'Long Sleeve', 60], ['sweater', 'Sweater', 150], ['hoodie', 'Hoodie', 180]] },
      { key: 'shirt.color', label: 'SHIRT COLOR', color: true, options: [...free(CLOTH.map(h => [h, ''])), gold(3000)] },
      { key: 'shirt.design', label: 'SHIRT PRINT', options: DESIGNS },
      { key: 'jacket.style', label: 'JACKET', options: [['none', 'None', 0], ['windbreaker', 'Windbreaker', 200], ['vest', 'Vest', 150], ['blazer', 'Blazer', 350], ['puffer', 'Puffer', 400]] },
      { key: 'jacket.color', label: 'JACKET COLOR', color: true, options: [...free(CLOTH.map(h => [h, ''])), gold(4000)] },
      { key: 'jacket.design', label: 'JACKET PRINT', options: DESIGNS },
      { key: 'pants.style', label: 'PANTS', options: [['long', 'Trousers', 0], ['shorts', 'Shorts', 0], ['skirt', 'Skirt', 60], ['baggy', 'Baggy', 120], ['joggers', 'Joggers', 100], ['cargo', 'Cargo', 140], ['capri', 'Capri', 90]] },
      { key: 'pants.color', label: 'PANTS COLOR', color: true, options: [...free(CLOTH.map(h => [h, ''])), gold(3000)] },
      { key: 'pants.design', label: 'PANTS PRINT', options: DESIGNS },
      { key: 'shoes.style', label: 'SHOES', options: [['sneaker', 'Sneakers', 0], ['classic', 'Classic', 60], ['saddle', 'Saddle', 120], ['spikes', 'Tour Spikes', 200]] },
      { key: 'shoes.color', label: 'SHOE COLOR', color: true, options: [...free(CLOTH.map(h => [h, ''])), gold(2000)] },
      { key: 'hat.style', label: 'HAT', options: [['none', 'None', 0], ['cap', 'Cap', 0], ['visor', 'Visor', 60], ['bucket', 'Bucket', 90], ['beanie', 'Beanie', 90], ['headband', 'Headband', 40], ['flatcap', 'Flat Cap', 120], ['beret', 'Beret', 140], ['fedora', 'Fedora', 220], ['sunhat', 'Sun Hat', 160], ['cowboy', 'Cowboy', 250], ['tophat', 'Top Hat', 350], ['propeller', 'Propeller', 300]] },
      { key: 'hat.color', label: 'HAT COLOR', color: true, options: [...free(CLOTH.map(h => [h, ''])), gold(2000)] },
      { key: 'gloves.style', label: 'GLOVES', options: [['none', 'None', 0], ['left', 'One glove', 0], ['both', 'Both hands', 50]] },
      { key: 'gloves.color', label: 'GLOVE COLOR', color: true, options: [...free(CLOTH.map(h => [h, ''])), gold(1500)] },
      { key: 'mapColor', label: 'MAP ARROW', color: true, options: free(MAP.map(h => [h, ''])) },
    ],
    cart: [
      { key: 'color', label: 'PAINT', color: true, options: [...C(['#f4f4f0', '#e74c3c', '#2f80ed', '#27ae60', '#f1c40f', '#1d1d1d', '#8e44ad', '#e67e22', '#ff6fb5', '#16a085', '#c0c4c8', '#7a1f1f'], 40), gold(5000)] },
      { key: 'decal', label: 'DECALS', options: [['none', 'None', 0], ['stripe', 'Racing Stripe', 80], ['side', 'Side Stripes', 100], ['flames', 'Flames', 180], ['stars', 'Stars', 140], ['checker', 'Checkered', 160], ['lightning', 'Lightning', 170], ['hearts', 'Hearts', 120], ['number', 'Race Number', 150], ['camo', 'Camo Wrap', 220], ['tiger', 'Tiger Stripes', 200], ['gold', 'Gold Package', 4000]] },
      { key: 'number', label: 'RACE NUMBER', number: [0, 99], info: 'Pick the number on your Race Number decal (buy the decal under DECALS).' },
      { key: 'seat', label: 'SEATS', color: true, options: [...C(['#3b2a20', '#1d1d1d', '#f4f4f0', '#c0392b', '#2f80ed', '#27ae60', '#f1c40f', '#8e44ad', '#e67e22', '#ff6fb5'], 40), gold(2000)] },
      { key: 'bag', label: 'GOLF BAG', color: true, options: [...C(['#b8372e', '#1d1d1d', '#f4f4f0', '#2f80ed', '#27ae60', '#f1c40f', '#8e44ad', '#e67e22', '#16a085', '#ff6fb5'], 30), gold(1500)] },
      { key: 'size', label: 'CART SIZE', options: [['standard', '2-Seater', 0], ['double', '4-Seater', 600], ['limo', 'Stretch Limo', 1500]],
        info: { standard: 'The classic two-seater.', double: 'Two rows of seats: room for four. Longer, so turn wide!', limo: 'Three rows: a stretch limo cart for the whole group.' } },
      { key: 'speakers', label: 'SPEAKERS', options: [['none', 'None', 0], ['roof', 'Roof Speakers', 250], ['sub', 'Bass Cannon', 500]],
        info: { none: 'Peace and quiet.', roof: 'Plays music while you drive. Press R to switch it on or off.', sub: 'A huge subwoofer in the back. Louder, bassier music while you drive (R to toggle).' } },
      { key: 'nitro', label: 'NITRO', options: [['none', 'None', 0], ['nitro', 'Nitro Kit', 6500]],
        info: { none: 'No boost.', nitro: 'Twin nitro tanks. Press N (or the NITRO button) while driving for a huge burst of speed - hit a crest and you will fly. Recharges after a while.' } },
      { key: 'fly', label: 'FLIGHT', options: [['none', 'None', 0], ['hover', 'Hover Kit', 2500]],
        info: { none: 'Keeps all four wheels on the ground (mostly).', hover: 'Wings and a rotor! Hold RUN while driving to fly, let go to glide down.' } },
      { key: 'wheels', label: 'WHEELS', options: [['silver', 'Silver', 0], ['black', 'Black Ops', 60], ['gold', 'Gold Rims', 300], ['chrome', 'Chrome', 220], ['solidgold', 'Solid Gold', 3500]] },
      { key: 'roof', label: 'ROOF', color: true, options: [...C(['#2e7d4f', '#f4f4f0', '#1d1d1d', '#c0392b', '#2f80ed', '#f1c40f', '#8e44ad', '#e67e22'], 30), gold(2500)] },
      { key: 'tires', label: 'TIRES', options: [['standard', 'All-Season', 0], ['race', 'Race Slicks', 400], ['offroad', 'Off-Road', 350], ['aqua', 'Aqua Floats', 600]],
        info: { standard: 'Good everywhere, great nowhere. Carts that drive into water sink!', race: 'Really fast on the cart path, slow on grass, rough and sand.', offroad: 'Slow on the path, quick on grass, rough, sand and trees. Extra grip: climbs steep hills and does not tip over.', aqua: 'Floats! Drive right across ponds and creeks without sinking.' } },
      { key: 'suspension', label: 'SUSPENSION', options: [['stock', 'Stock', 0], ['lift', 'Lift Kit', 300]],
        info: { stock: 'Low and steady.', lift: 'Rides higher and bouncier: more air off every bump, flips and stunts.' } },
      { key: 'mapColor', label: 'MAP ICON', color: true, options: free(MAP.map(h => [h, ''])) },
      { key: 'speedLevel', label: 'SPEED', upgrade: true, options: [[0, 'Stock', 0], [1, 'Tuned', 200], [2, 'Sport', 450], [3, 'Turbo', 900], [4, 'Rocket', 1600]] },
    ],
    WHEEL_COLORS: { silver: '#c9ced6', black: '#2a2a2a', gold: '#d4a72c', chrome: '#eef3f8', solidgold: '#d4af38' },

    get(obj, key) { return key.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); },
    set(obj, key, v) {
      const ks = key.split('.'), last = ks.pop();
      const tgt = ks.reduce((o, k) => (o[k] = o[k] || {}), obj);
      tgt[last] = v;
    },
    id(tab, key, value) { return `${tab}:${key}:${value}`; },
    owned(tab, key, value, price) {
      return price === 0 || !!TU.save.data.owned[this.id(tab, key, value)];
    },
  };
})();
