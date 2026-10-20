// Low-poly golf cart. Faces local +z; the driver sits on the left (+x) side.
(function () {
  const T = THREE, R3 = TU.R3, mat = R3.mat;
  const col = hex => parseInt(hex.slice(1), 16);

  TU.Cart3D = {
    SEAT: { x: 0.32, y: 0.78, z: -0.15 },
    build(opts = {}) {
      const bodyC = col(opts.color || '#f4f4f0'), roofC = col(opts.roof || '#2e7d4f'), trim = col(opts.trim || '#2b2b2b');
      const root = new T.Group(), shell = new T.Group();
      // tires and suspension change the ride height: the body sits on top of the wheels
      const tires = opts.tires || 'standard', lifted = opts.suspension === 'lift';
      const TIRE = { standard: [0.25, 0.2], race: [0.23, 0.27], offroad: [0.33, 0.3], aqua: [0.27, 0.24] }[tires] || [0.25, 0.2];
      const lift = (TIRE[0] - 0.25) + (lifted ? 0.38 : 0);
      shell.position.y = lift; root.add(shell);
      const camoTex = () => {
        const cv = TU.sprites.makeCanvas(32, 32), x = cv.getContext('2d'), sh = TU.ui.shade;
        x.fillStyle = opts.color || '#f4f4f0'; x.fillRect(0, 0, 32, 32);
        const cs = opts.decal === 'tiger' ? ['#1d1d1d'] : [sh(opts.color || '#5a6b3a', -45), sh(opts.color || '#5a6b3a', 35), '#3b3a24'];
        if (opts.decal === 'tiger') { x.fillStyle = '#1d1d1d'; for (let i = 0; i < 32; i += 6) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 4, 0); x.lineTo(i + 1, 32); x.lineTo(i - 1, 32); x.fill(); } }
        else for (let k = 0; k < 14; k++) { x.fillStyle = cs[k % 3]; x.beginPath(); x.ellipse((k * 37) % 32, (k * 53) % 32, 4 + (k % 3) * 2, 3 + (k % 2) * 2, k, 0, Math.PI * 2); x.fill(); }
        const t = new T.CanvasTexture(cv); t.magFilter = t.minFilter = T.NearestFilter; return t;
      };
      const wrapped = opts.decal === 'camo' || opts.decal === 'tiger';
      const body = R3.isGold(opts.color) ? R3.gold() : wrapped ? new T.MeshPhongMaterial({ map: camoTex(), flatShading: true, shininess: 20 }) : R3.reflect(mat(bodyC).clone(), 0.3);
      const dark = mat(trim), seatM = R3.paint(opts.seat || '#3b2a20'), roofM = R3.paint(opts.roof || '#2e7d4f');
      const add = (geo, m, x, y, z) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); shell.add(o); return o; };
      // bigger carts: extra rows of seats stretch everything behind the front row
      const rows = { double: 2, limo: 3 }[opts.size] || 1, ex = (rows - 1) * 1.1;
      add(new T.BoxGeometry(1.25, 0.3, 2.5 + ex), dark, 0, 0.38, -ex / 2);            // chassis
      add(new T.BoxGeometry(1.3, 0.42, 0.75), body, 0, 0.65, 0.88);         // front cowl
      add(new T.BoxGeometry(1.32, 0.12, 0.8), body, 0, 0.9, 0.85);          // dash top
      add(new T.BoxGeometry(1.3, 0.35, 1.0 + ex), body, 0, 0.62, -0.55 - ex / 2);         // rear body
      for (let r = 0; r < rows; r++) {
        add(new T.BoxGeometry(1.15, 0.16, 0.6), seatM, 0, 0.86, -0.2 - r * 1.1);        // seat
        add(new T.BoxGeometry(1.15, 0.55, 0.12), seatM, 0, 1.15, -0.5 - r * 1.1);       // seat back
      }
      const posts = [0.75, -0.95 - ex]; if (rows === 3) posts.push(-0.95 - 1.1);
      for (const sx of [-0.6, 0.6]) for (const sz of posts) add(new T.CylinderGeometry(0.03, 0.03, 1.2, 4), dark, sx, 1.5, sz); // roof posts
      add(new T.BoxGeometry(1.42, 0.07, 2.2 + ex), roofM, 0, 2.12, -0.1 - ex / 2);        // roof
      if (rows === 3) { // limo: chrome trim along the sides
        for (const sx of [-0.66, 0.66]) add(new T.BoxGeometry(0.02, 0.05, 2.06 + ex), mat(0xeef3f8), sx, 0.82, -0.03 - ex / 2);
      }
      // details: headlights, tail lights, bumpers, a tinted windshield and a TEE UP plate
      const chrome = R3.reflect(new T.MeshPhongMaterial({ color: 0xdfe5ea, specular: 0xffffff, shininess: 90, flatShading: true }), 0.5);
      for (const sx of [-0.42, 0.42]) {
        add(new T.CylinderGeometry(0.1, 0.1, 0.05, 10), chrome, sx, 0.72, 1.255).rotation.x = Math.PI / 2;
        add(new T.CircleGeometry(0.075, 10), new T.MeshBasicMaterial({ color: 0xfff6c8 }), sx, 0.72, 1.283);
        add(new T.BoxGeometry(0.16, 0.08, 0.03), new T.MeshBasicMaterial({ color: 0xd42020 }), sx * 1.25, 0.66, -1.06 - ex);
      }
      add(new T.BoxGeometry(1.36, 0.1, 0.1), dark, 0, 0.36, 1.3);             // front bumper
      add(new T.BoxGeometry(1.36, 0.1, 0.1), dark, 0, 0.36, -1.3 - ex);       // rear bumper
      const ws = add(new T.PlaneGeometry(1.2, 0.95), new T.MeshPhongMaterial({ color: 0x9fd6ff, transparent: true, opacity: 0.28, shininess: 100, specular: 0xffffff, side: T.DoubleSide }), 0, 1.6, 0.74);
      ws.rotation.x = -0.12;
      const pc = TU.sprites.makeCanvas(64, 24), px2 = pc.getContext('2d');
      px2.fillStyle = '#f4f4f0'; px2.fillRect(0, 0, 64, 24); px2.strokeStyle = '#1d3a8a'; px2.lineWidth = 2; px2.strokeRect(1, 1, 62, 22);
      px2.fillStyle = '#1d3a8a'; px2.font = 'bold 13px monospace'; px2.textAlign = 'center'; px2.textBaseline = 'middle'; px2.fillText('TEE UP', 32, 13);
      const plate = add(new T.PlaneGeometry(0.34, 0.13), new T.MeshBasicMaterial({ map: R3.pxTex(new T.CanvasTexture(pc)) }), 0, 0.5, -1.36 - ex);
      plate.rotation.y = Math.PI;
      // off-road tires come with a roof light bar
      if (tires === 'offroad') {
        add(new T.BoxGeometry(1.1, 0.1, 0.12), dark, 0, 2.21, 0.9);
        for (let k = 0; k < 5; k++) add(new T.CircleGeometry(0.04, 8), new T.MeshBasicMaterial({ color: 0xfff6c8 }), -0.4 + k * 0.2, 2.21, 0.961);
      }
      // nitro kit: twin blue tanks behind the seats and chrome exhausts out the back
      let nitroFx = null;
      if (opts.nitro === 'nitro') {
        const tankM = R3.reflect(new T.MeshPhongMaterial({ color: 0x1f6fd8, specular: 0xffffff, shininess: 90, flatShading: true }), 0.4);
        for (const sx of [-0.33, 0.33]) {
          const tank = add(new T.CylinderGeometry(0.16, 0.16, 0.9, 10), tankM, sx, 1.05, -0.78 - ex); tank.rotation.x = Math.PI / 2;
          add(new T.SphereGeometry(0.16, 8, 6), tankM, sx, 1.05, -0.33 - ex); add(new T.SphereGeometry(0.16, 8, 6), tankM, sx, 1.05, -1.23 - ex);
          add(new T.CylinderGeometry(0.03, 0.03, 0.3, 5), mat(0xeef3f8), sx, 1.25, -0.6 - ex);
          const pipe = add(new T.CylinderGeometry(0.08, 0.1, 0.5, 8), chrome, sx * 1.4, 0.42, -1.35 - ex); pipe.rotation.x = Math.PI / 2;
        }
        // exhaust flames, hidden until the nitro fires
        const fg = new T.ConeGeometry(0.12, 1.2, 8, 1, true); fg.translate(0, -0.6, 0); fg.rotateX(-Math.PI / 2);
        const fm = new T.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.85, side: T.DoubleSide, depthWrite: false });
        nitroFx = [-0.46, 0.46].map(sx => { const f = add(fg, fm, sx, 0.42, -1.6 - ex); f.visible = false; return f; });
      }
      // speakers
      if (opts.speakers === 'roof' || opts.speakers === 'sub') for (const sx of [-0.45, 0.45]) {
        const sp = add(new T.BoxGeometry(0.32, 0.22, 0.2), mat(0x1d1d1d), sx, 1.98, 0.85);
        const cone = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 0.02, 8), mat(0x6a6f76)); cone.rotation.x = Math.PI / 2; cone.position.set(0, 0, 0.105); sp.add(cone);
      }
      if (opts.speakers === 'sub') {
        const sub = add(new T.BoxGeometry(0.9, 0.5, 0.45), mat(0x1d1d1d), 0, 1.1, -0.95 - ex);
        for (const sx of [-0.22, 0.22]) { const w = new T.Mesh(new T.CylinderGeometry(0.17, 0.17, 0.03, 10), mat(0x9aa3ad)); w.rotation.x = Math.PI / 2; w.position.set(sx, 0, -0.23); sub.add(w); }
      }
      // hover kit: swept wings in the body color with white trim, ducted fans on the tips,
      // red/green nav lights and twin jet nozzles that glow when you fly
      let rotor = null, jets = null;
      if (opts.fly === 'hover') {
        rotor = []; jets = [];
        // brushed-metal wings with a stripe in the cart's paint (white on pale carts)
        const wingM = R3.reflect(new T.MeshPhongMaterial({ color: 0xaeb5bd, specular: 0xffffff, shininess: 70, flatShading: true }), 0.4);
        const trimM = mat(new T.Color(bodyC).getHSL({}).l > 0.8 ? 0xe74c3c : bodyC), wz = -0.25 - ex / 2;
        for (const sx of [-1, 1]) {
          const sh = new T.Shape();
          sh.moveTo(0, 0.35); sh.lineTo(sx * 1.05, -0.25); sh.lineTo(sx * 1.05, -0.62); sh.lineTo(0, -0.55); sh.closePath();
          const g = new T.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false }); g.rotateX(Math.PI / 2);
          const wg = add(g, wingM, sx * 0.6, 0.9, wz); wg.rotation.z = sx * 0.06;
          // white leading-edge stripe
          const le = add(new T.BoxGeometry(1.2, 0.055, 0.06), trimM, sx * 1.12, 0.9, wz + 0.06); le.rotation.y = sx * 0.52;
          // ducted fan on the wing tip
          const duct = add(new T.TorusGeometry(0.3, 0.05, 6, 16), mat(0x2b2b2b), sx * 1.65, 0.93, wz - 0.44); duct.rotation.x = Math.PI / 2;
          const fan = new T.Group(); fan.position.set(sx * 1.65, 0.93, wz - 0.44); shell.add(fan); rotor.push(fan);
          for (let k = 0; k < 3; k++) { const bl = new T.Mesh(new T.BoxGeometry(0.5, 0.015, 0.09), mat(0x9aa3ad)); bl.rotation.y = k * Math.PI / 3; fan.add(bl); }
          add(new T.CylinderGeometry(0.05, 0.05, 0.06, 6), mat(0x2b2b2b), sx * 1.65, 0.93, wz - 0.44);
          const nav = add(new T.SphereGeometry(0.05, 6, 4), new T.MeshBasicMaterial({ color: sx < 0 ? 0xff3030 : 0x30ff60 }), sx * 1.98, 0.93, wz - 0.44);
          nav.userData.nav = true;
          // upturned winglet and a strip of panel rivets
          const fin = add(new T.BoxGeometry(0.04, 0.32, 0.36), trimM, sx * 1.62, 1.08, wz - 0.05); fin.rotation.z = sx * -0.25;
          for (let k = 0; k < 4; k++) add(new T.SphereGeometry(0.015, 4, 3), mat(0x6a6f76), sx * (0.75 + k * 0.2), 0.93, wz - 0.3 - k * 0.04);
        }
        // twin jets under the back
        for (const sx of [-0.35, 0.35]) {
          const pod = add(new T.CylinderGeometry(0.13, 0.16, 0.55, 10), mat(0x6a6f76), sx, 0.42, -1.1 - ex); pod.rotation.x = Math.PI / 2;
          const glow = new T.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.25 });
          const core = add(new T.CircleGeometry(0.11, 10), glow, sx, 0.42, -1.38 - ex); core.rotation.y = Math.PI;
          add(new T.TorusGeometry(0.13, 0.025, 4, 12), chrome, sx, 0.42, -1.37 - ex);
          // exhaust flame that grows with thrust
          const fg = new T.ConeGeometry(0.1, 0.7, 8, 1, true); fg.translate(0, -0.35, 0); fg.rotateX(-Math.PI / 2);
          const flameM = new T.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.8, side: T.DoubleSide, depthWrite: false });
          const flame = add(fg, flameM, sx, 0.42, -1.4 - ex); flame.scale.set(1, 1, 0.01);
          glow.userData.flame = flame;
          jets.push(glow);
        }
      }
      // steering wheel
      const col2 = add(new T.CylinderGeometry(0.025, 0.025, 0.5, 4), dark, 0.32, 1.05, 0.42); col2.rotation.x = -0.6;
      const wheel = add(new T.TorusGeometry(0.17, 0.025, 4, 10), dark, 0.32, 1.25, 0.3); wheel.rotation.x = -0.9;
      // golf bag at the back
      const bagZ = -1.15 - ex - (opts.speakers === 'sub' ? 0.35 : 0);
      // (a group, so riders sharing the cart can each have their own bag back there)
      const bagG = new T.Group(); bagG.position.set(0, 0, bagZ); shell.add(bagG);
      const bag = new T.Mesh(new T.CylinderGeometry(0.17, 0.15, 0.9, 7), R3.paint(opts.bag || '#b8372e')); bag.position.set(0, 1.05, 0); bag.rotation.x = -0.25; bagG.add(bag);
      for (let k = 0; k < 3; k++) { const hd = new T.Mesh(new T.BoxGeometry(0.06, 0.06, 0.1), mat(0xc0c6cc)); hd.position.set(-0.08 + k * 0.08, 1.55, -0.1); bagG.add(hd); }
      // beverage cart extras: cooler, striped umbrella, DRINKS sign
      if (opts.bev) {
        add(new T.BoxGeometry(1.0, 0.6, 0.7), mat(0xf4f4f4), 0, 1.0, -1.05);
        add(new T.BoxGeometry(1.02, 0.12, 0.72), mat(0x2f80ed), 0, 1.33, -1.05);
        add(new T.CylinderGeometry(0.03, 0.03, 0.9, 4), dark, 0, 2.6, -0.1);
        for (let k = 0; k < 8; k++) {
          const seg = add(new T.ConeGeometry(1.25, 0.45, 8, 1, true, k / 8 * Math.PI * 2, Math.PI / 4), mat(k % 2 ? 0xf4f4f4 : 0xe74c3c, { side: T.DoubleSide }), 0, 3.15, -0.1);
          seg.castShadow = true;
        }
        const cv = TU.sprites.makeCanvas(64, 16), x2 = cv.getContext('2d');
        x2.fillStyle = '#f1c40f'; x2.fillRect(0, 0, 64, 16);
        x2.fillStyle = '#7a1f1f'; x2.font = 'bold 12px monospace'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText('DRINKS', 32, 9);
        const tx = R3.pxTex(new T.CanvasTexture(cv));
        const sign = add(new T.BoxGeometry(1.2, 0.3, 0.05), [mat(0xf1c40f), mat(0xf1c40f), mat(0xf1c40f), mat(0xf1c40f), new T.MeshBasicMaterial({ map: tx }), new T.MeshBasicMaterial({ map: tx })], 0, 2.32, 1.0);
        sign.castShadow = true;
        // umbrella: scalloped fringe and a knob on top
        for (let k = 0; k < 16; k++) {
          const a2 = k / 16 * Math.PI * 2, fr = add(new T.ConeGeometry(0.1, 0.18, 3), mat(k % 2 ? 0xe74c3c : 0xf4f4f4), Math.cos(a2) * 1.22, 2.88, -0.1 + Math.sin(a2) * 1.22);
          fr.rotation.x = Math.PI;
        }
        add(new T.SphereGeometry(0.08, 6, 4), mat(0xf1c40f), 0, 3.42, -0.1);
        // cans and bottles on ice in the open cooler, a stack of cups and a snack rack
        add(new T.BoxGeometry(0.9, 0.04, 0.6), mat(0xdff3ff), 0, 1.31, -1.05);
        const canC = [0xe74c3c, 0x2f80ed, 0x27ae60, 0xf1c40f, 0xff9f43, 0x8e44ad];
        for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) add(new T.CylinderGeometry(0.06, 0.06, 0.16, 8), mat(canC[(i + j * 2) % canC.length]), -0.3 + i * 0.2, 1.4, -1.2 + j * 0.25);
        for (let i = 0; i < 3; i++) {
          const bx = -0.28 + i * 0.28;
          add(new T.CylinderGeometry(0.05, 0.06, 0.24, 8), mat(0x2e7d32, { transparent: true, opacity: 0.85 }), bx, 1.47, -0.92);
          add(new T.CylinderGeometry(0.02, 0.03, 0.08, 6), mat(0x2e7d32), bx, 1.62, -0.92);
          add(new T.CylinderGeometry(0.022, 0.022, 0.02, 6), mat(0xd4b04a), bx, 1.67, -0.92);
        }
        for (let k = 0; k < 5; k++) add(new T.CylinderGeometry(0.075 + k * 0.001, 0.06, 0.08, 8), mat(0xf4f4f0), 0.62, 1.0 + k * 0.05, 0.62);
        const rack = add(new T.BoxGeometry(0.06, 0.5, 0.6), mat(0x8a5a30), -0.7, 0.95, -0.6);
        for (let k = 0; k < 3; k++) add(new T.BoxGeometry(0.04, 0.12, 0.16), mat([0xf1c40f, 0xe67e22, 0xc0392b][k]), -0.75, 0.82 + k * 0.14, -0.6 + (k - 1) * 0.15);
        // chalk menu board on the back
        const mc = TU.sprites.makeCanvas(64, 48), m2 = mc.getContext('2d');
        m2.fillStyle = '#20302a'; m2.fillRect(0, 0, 64, 48); m2.strokeStyle = '#8a5a30'; m2.lineWidth = 4; m2.strokeRect(0, 0, 64, 48);
        m2.fillStyle = '#ffe066'; m2.font = 'bold 9px monospace'; m2.textAlign = 'center'; m2.fillText('MENU', 32, 12);
        m2.fillStyle = '#f4f4f0'; m2.font = '7px monospace'; m2.textAlign = 'left';
        ['SODA', 'ICED TEA', 'HOT DOG', 'PRETZEL'].forEach((t, k) => m2.fillText(t, 6, 22 + k * 7));
        const menu = add(new T.PlaneGeometry(0.7, 0.52), new T.MeshBasicMaterial({ map: R3.pxTex(new T.CanvasTexture(mc)) }), 0, 1.75, -1.42);
        menu.rotation.y = Math.PI;
        // party bunting along the roof edge
        for (let k = 0; k < 9; k++) { const fl = add(new T.ConeGeometry(0.07, 0.16, 3), mat([0xe74c3c, 0xf1c40f, 0x2f80ed][k % 3]), -0.65 + k * 0.16, 2.0, 1.0); fl.rotation.x = Math.PI; }
      }
      // decals
      const light = new T.Color(bodyC).getHSL({}).l > 0.6;
      const decalM = mat(light ? 0x1d1d1d : 0xf4f4f0);
      const d = opts.decal || 'none';
      if (d === 'stripe') {
        add(new T.BoxGeometry(0.22, 0.02, 0.82), decalM, 0, 0.97, 0.85);
        add(new T.BoxGeometry(0.22, 0.02, 2.2 + ex), decalM, 0, 2.165, -0.1 - ex / 2);
        add(new T.BoxGeometry(0.22, 0.02, 1.0 + ex), decalM, 0, 0.8, -0.55 - ex / 2);
      } else if (d === 'side') {
        for (const sx of [-0.66, 0.66]) {
          add(new T.BoxGeometry(0.02, 0.07, 0.75), decalM, sx, 0.7, 0.88);
          add(new T.BoxGeometry(0.02, 0.07, 1.0 + ex), decalM, sx, 0.7, -0.55 - ex / 2);
          add(new T.BoxGeometry(0.02, 0.04, 0.75), mat(0xe74c3c), sx, 0.6, 0.88);
          add(new T.BoxGeometry(0.02, 0.04, 1.0 + ex), mat(0xe74c3c), sx, 0.6, -0.55 - ex / 2);
        }
      } else if (d === 'stars') {
        const sh = new T.Shape();
        for (let k = 0; k < 10; k++) { const r = k % 2 ? 0.05 : 0.12, a = k / 10 * Math.PI * 2; k ? sh.lineTo(Math.sin(a) * r, Math.cos(a) * r) : sh.moveTo(0, r); }
        const sg = new T.ShapeGeometry(sh);
        const starSpots = [[0.66, 0.95], [0.55, 0.7]];
        for (let z = -0.3, k = 0; z > -1.0 - ex; z -= 0.38, k++) starSpots.push([k % 2 ? 0.55 : 0.64, z]);
        for (const sx of [-0.67, 0.67]) for (const [y, z] of starSpots) {
          const st = add(sg, mat(0xf1c40f, { side: T.DoubleSide }), sx, y, z);
          st.rotation.y = Math.PI / 2;
        }
      }
      // painted decals: drawn into canvas textures and laid flat on the body panels
      const tex = (w, h, draw) => { const cv = TU.sprites.makeCanvas(w, h); draw(cv.getContext('2d'), w, h); const t = new T.CanvasTexture(cv); t.magFilter = T.NearestFilter; t.minFilter = R3.style === 'smooth' ? T.LinearFilter : T.NearestFilter; return new T.MeshBasicMaterial({ map: t, transparent: true, side: T.DoubleSide, depthWrite: false }); };
      const panel = (m, w, h, y, z, which = 'sides', mirror = true) => {
        if (which === 'sides') for (const sx of [-1, 1]) {
          const pl = add(new T.PlaneGeometry(w, h), m, sx * 0.667, y, z);
          pl.rotation.y = sx * Math.PI / 2; if (sx < 0 && mirror) pl.scale.x = -1; // mirrored so the art runs front-to-back on both sides (but text stays readable)
        } else if (which === 'hood') { const pl = add(new T.PlaneGeometry(w, h), m, 0, 0.968, z); pl.rotation.x = -Math.PI / 2; }
        else if (which === 'rear') { const pl = add(new T.PlaneGeometry(w, h), m, 0, y, z); pl.rotation.y = Math.PI; }
        else if (which === 'front') add(new T.PlaneGeometry(w, h), m, 0, y, z);
      };
      const cowl = [0.74, 0.36, 0.66, 0.88], rear = [0.98 + ex, 0.3, 0.62, -0.55 - ex / 2];
      if (d === 'flames') {
        // flame licks streaming back from the nose, yellow core to red tips
        const fm = tex(128, 48, (x, w, h) => {
          for (let k = 0; k < 6; k++) {
            const yc = 8 + k * 6.5, len = 70 + (k % 3) * 22 + (k === 2 ? 20 : 0);
            const gr = x.createLinearGradient(0, 0, len, 0); gr.addColorStop(0, '#fff3a0'); gr.addColorStop(0.35, '#ffb300'); gr.addColorStop(0.75, '#e8541e'); gr.addColorStop(1, '#b0201a');
            x.fillStyle = gr; x.strokeStyle = '#3a1208'; x.lineWidth = 2;
            x.beginPath(); x.moveTo(0, yc - 5);
            x.bezierCurveTo(len * 0.45, yc - 9, len * 0.7, yc - 2, len, yc + (k % 2 ? -6 : 4));
            x.bezierCurveTo(len * 0.7, yc + 4, len * 0.45, yc + 8, 0, yc + 6);
            x.closePath(); x.stroke(); x.fill();
          }
        });
        panel(fm, cowl[0], cowl[1], cowl[2], cowl[3]);
        panel(fm, rear[0], rear[1], rear[2], rear[3]);
        const hm = tex(64, 64, (x) => { x.translate(32, 64); for (let k = -2; k <= 2; k++) { const gr = x.createLinearGradient(0, 0, 0, -58); gr.addColorStop(0, '#ffb300'); gr.addColorStop(1, '#b0201a'); x.fillStyle = gr; x.strokeStyle = '#3a1208'; x.lineWidth = 2; x.beginPath(); x.moveTo(k * 11 - 6, 0); x.quadraticCurveTo(k * 13, -30, k * 15 + (k % 2 ? 4 : -4), -58 + Math.abs(k) * 8); x.quadraticCurveTo(k * 13 + 6, -26, k * 11 + 6, 0); x.closePath(); x.stroke(); x.fill(); } });
        panel(hm, 1.1, 0.75, 0, 0.86, 'hood');
      } else if (d === 'lightning') {
        // a jagged bolt along each side and one on the hood
        const lm = tex(128, 48, (x) => {
          x.fillStyle = '#ffe14d'; x.strokeStyle = '#2a2208'; x.lineWidth = 3; x.lineJoin = 'miter';
          x.beginPath(); x.moveTo(4, 14); x.lineTo(52, 10); x.lineTo(44, 22); x.lineTo(96, 18); x.lineTo(84, 30); x.lineTo(124, 28); x.lineTo(70, 40); x.lineTo(80, 30); x.lineTo(30, 34); x.lineTo(38, 24); x.lineTo(4, 26); x.closePath(); x.stroke(); x.fill();
          x.fillStyle = '#ffffff'; x.globalAlpha = 0.7; x.fillRect(10, 17, 30, 3); x.fillRect(56, 21, 26, 2);
        });
        panel(lm, cowl[0], cowl[1], cowl[2], cowl[3]);
        panel(lm, rear[0], rear[1], rear[2], rear[3]);
        const hb = tex(48, 64, (x) => { x.fillStyle = '#ffe14d'; x.strokeStyle = '#2a2208'; x.lineWidth = 3; x.beginPath(); x.moveTo(30, 2); x.lineTo(10, 34); x.lineTo(24, 34); x.lineTo(14, 62); x.lineTo(40, 24); x.lineTo(26, 24); x.lineTo(38, 2); x.closePath(); x.stroke(); x.fill(); });
        panel(hb, 0.45, 0.6, 0, 0.86, 'hood');
      } else if (d === 'checker') {
        // full chequered-flag wrap: both sides, hood and the back
        const lightBody = new T.Color(bodyC).getHSL({}).l > 0.5, inkC = lightBody ? '#1d1d1d' : '#f4f4f0';
        const ck = (cols, rows) => tex(cols * 8, rows * 8, (x) => { x.fillStyle = inkC; for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if ((i + j) % 2) x.fillRect(i * 8, j * 8, 8, 8); });
        panel(ck(8, 4), cowl[0], cowl[1], cowl[2], cowl[3]);
        panel(ck(Math.round(rear[0] * 10), 3), rear[0], rear[1], rear[2], rear[3]);
        panel(ck(10, 6), 1.28, 0.76, 0, 0.85, 'hood');
        panel(ck(10, 3), 1.28, 0.3, 0.62, -1.06 - ex, 'rear');
        panel(ck(10, 4), 1.28, 0.4, 0.65, 1.262, 'front');
      } else if (d === 'gold') {
        // the full gold package: twin pinstripes down both sides, a crest on the hood, gold bumpers and trim
        const G = R3.gold();
        for (const sx of [-0.668, 0.668]) for (const y of [0.76, 0.5]) {
          add(new T.BoxGeometry(0.012, 0.025, 0.75), G, sx, y, 0.88);
          add(new T.BoxGeometry(0.012, 0.025, 1.0 + ex), G, sx, y - 0.04, -0.55 - ex / 2);
        }
        const crest = add(new T.CylinderGeometry(0.16, 0.16, 0.02, 12), G, 0, 0.975, 0.86);
        const star = new T.Shape(); for (let k = 0; k < 10; k++) { const r2 = k % 2 ? 0.05 : 0.12, a2 = k / 10 * Math.PI * 2; k ? star.lineTo(Math.sin(a2) * r2, Math.cos(a2) * r2) : star.moveTo(0, r2); }
        const sm = add(new T.ShapeGeometry(star), mat(0x1d1d1d, { side: T.DoubleSide }), 0, 0.988, 0.86); sm.rotation.x = -Math.PI / 2;
        add(new T.BoxGeometry(1.38, 0.11, 0.11), G, 0, 0.36, 1.31);
        add(new T.BoxGeometry(1.38, 0.11, 0.11), G, 0, 0.36, -1.31 - ex);
        add(new T.BoxGeometry(1.44, 0.03, 2.24 + ex), G, 0, 2.09, -0.1 - ex / 2); // gold roof edge
        for (const sx of [-0.6, 0.6]) for (const sz of posts) add(new T.CylinderGeometry(0.038, 0.038, 1.2, 6), G, sx, 1.5, sz); // gold-wrapped posts
      } else if (d === 'hearts') {
        const sh = new T.Shape(); sh.moveTo(0, -0.08); sh.bezierCurveTo(-0.12, 0.02, -0.06, 0.1, 0, 0.04); sh.bezierCurveTo(0.06, 0.1, 0.12, 0.02, 0, -0.08);
        const hg = new T.ShapeGeometry(sh);
        // two on the front cowl, then a row all the way down the rear body (however long it is)
        const spots = [[0.66, 0.95], [0.58, 0.68]];
        for (let z = -0.2, k = 0; z > -1.0 - ex; z -= 0.32, k++) spots.push([k % 2 ? 0.56 : 0.68, z]);
        for (const sx of [-0.67, 0.67]) for (const [y, z] of spots) { const h = add(hg, mat(0xff6fb5, { side: T.DoubleSide }), sx, y, z); h.rotation.y = Math.PI / 2; }
        for (const [x, z] of [[-0.3, 0.75], [0.3, 0.95]]) { const h = add(hg, mat(0xff6fb5, { side: T.DoubleSide }), x, 0.968, z); h.rotation.x = -Math.PI / 2; }
      } else if (d === 'number') {
        // your race number in a white roundel on both doors and the hood
        const num = String(opts.number ?? 7);
        const nm = tex(64, 64, (x) => { x.fillStyle = '#ffffff'; x.beginPath(); x.arc(32, 32, 30, 0, Math.PI * 2); x.fill(); x.strokeStyle = '#1d1d1d'; x.lineWidth = 3; x.stroke(); x.fillStyle = '#1d1d1d'; x.font = `bold ${num.length > 1 ? 34 : 42}px monospace`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(num, 32, 35); });
        panel(nm, 0.36, 0.36, 0.66, 0.86, 'sides', false);
        panel(nm, 0.34, 0.34, 0, 0.86, 'hood');
        panel(nm, 0.28, 0.28, 0.62, -0.55 - ex / 2, 'sides', false);
      }
      // wheels
      const hubM = opts.wheels === 'solidgold' ? R3.gold() : opts.wheels === 'chrome' || opts.wheels === 'gold'
        ? R3.reflect(new T.MeshPhongMaterial({ color: col(TU.catalog.WHEEL_COLORS[opts.wheels]), specular: 0xffffff, shininess: 80, flatShading: true }), 0.6)
        : R3.paint(TU.catalog.WHEEL_COLORS[opts.wheels] || '#c9ced6');
      const wheels = [], [tr, tw] = TIRE, tireM = mat(tires === 'aqua' ? 0x1f5f9a : 0x1c1c1c);
      for (const sx of [-0.62, 0.62]) for (const sz of [-0.8 - ex, 0.82]) {
        const w = new T.Group(); w.position.set(sx + Math.sign(sx) * (tw - 0.2) / 2, tr, sz); root.add(w);
        const tire = new T.Mesh(new T.CylinderGeometry(tr, tr, tw, tires === 'offroad' ? 10 : 8), tireM); tire.rotation.z = Math.PI / 2; w.add(tire);
        const hub = new T.Mesh(new T.CylinderGeometry(tr * 0.52, tr * 0.52, tw + 0.01, 6), hubM); hub.rotation.z = Math.PI / 2; w.add(hub);
        if (tires === 'offroad') for (let k = 0; k < 10; k++) {
          // chunky tread blocks
          const kb = new T.Mesh(new T.BoxGeometry(tw + 0.02, 0.07, 0.09), tireM), a = k / 10 * Math.PI * 2;
          kb.position.set(0, Math.cos(a) * tr, Math.sin(a) * tr); kb.rotation.x = -a; w.add(kb);
        }
        if (tires === 'race') { const st = new T.Mesh(new T.CylinderGeometry(tr * 0.8, tr * 0.8, tw + 0.012, 10), mat(0xe74c3c)); st.rotation.z = Math.PI / 2; st.scale.y = 0.15; st.position.x = Math.sign(sx) * tw * 0.4; w.add(st); }
        wheels.push(w);
      }
      // lift kit: coil-over shocks bolted between each hub and the frame. They sit on the cart
      // (not the spinning wheel) and stretch or squash as the body bounces.
      const shocks = [];
      if (lifted) {
        const rodG = new T.CylinderGeometry(0.03, 0.03, 1, 6); rodG.translate(0, 0.5, 0);
        const coilG = new T.CylinderGeometry(0.07, 0.07, 1, 8, 1, true); coilG.translate(0, 0.5, 0);
        const coilM = mat(0xe67e22, { side: T.DoubleSide }), rodM = R3.reflect(new T.MeshPhongMaterial({ color: 0xdfe5ea, specular: 0xffffff, shininess: 90, flatShading: true }), 0.5);
        for (const w of wheels) {
          const g = new T.Group(); g.position.set(w.position.x - Math.sign(w.position.x) * 0.2, tr, w.position.z); root.add(g);
          const rod = new T.Mesh(rodG, rodM); g.add(rod);
          const coil = new T.Mesh(coilG, coilM); coil.position.y = 0.12; g.add(coil);
          const cap = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 0.04, 8), mat(0x2b2b2b)); g.add(cap);
          const top = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 0.04, 8), mat(0x2b2b2b)); g.add(top);
          shocks.push({ rod, coil, top });
        }
        // a chunky roll bar over the seats
        const rb = mat(0x1d1d1d);
        for (const sx of [-0.62, 0.62]) add(new T.CylinderGeometry(0.035, 0.035, 0.9, 6), rb, sx, 1.6, -0.62);
      }
      if (tires === 'aqua') for (const sx of [-0.8, 0.8]) {
        // flotation pontoons along both sides
        const pn = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 2.3 + ex, 8), mat(0xf1c40f)); pn.rotation.x = Math.PI / 2; pn.position.set(sx, 0.45, -ex / 2); shell.add(pn);
      }
      R3.castShadows(root);
      const c = { root, shell, lift, wheels, rotor, jets, rows, ex, shocks, hub: tr, spin: 0, nitroFx, bags: [bagG], bagKey: opts.bag || '#b8372e' };
      if (shocks.length) TU.Cart3D.fitShocks(c, 0);
      return c;
    },
    // Place at game coords facing game heading h; tilt to follow the ground.
    // o: { z, pitch (nose down +), roll (left side up +) }
    place(c, x, y, h, dist = 0, o = {}) {
      c.root.rotation.set(o.pitch || 0, Math.PI - h, o.roll || 0, 'YXZ');
      c.root.position.set(x, o.z ?? R3.heightAt(x, y), y);
      if (c.shell) c.shell.position.y = (c.lift || 0) + (o.bob || 0);
      if (c.shocks && c.shocks.length) TU.Cart3D.fitShocks(c, o.bob || 0);
      c.spin += dist / 0.25;
      for (const w of c.wheels) w.rotation.x = c.spin;
      if (c.rotor) for (const f of c.rotor) f.rotation.y += o.rotor || 0;
      if (c.nitroFx) for (const f of c.nitroFx) { f.visible = !!o.nitro; if (o.nitro) f.scale.set(1, 1, 0.7 + Math.random() * 0.6); }
      if (c.jets) for (const j of c.jets) {
        const th = o.thrust || 0;
        j.opacity = 0.25 + th * 0.7; j.color.setHex(th > 0.5 ? 0xffa040 : 0x66ccff);
        const f = j.userData.flame; if (f) { f.visible = th > 0.05; f.scale.set(1, 1, th * (0.8 + Math.random() * 0.4)); }
      }
    },
    // one golf bag per rider, side by side at the back, each in its owner's bag color
    setBags(c, colors) {
      const key = colors.join(',');
      if (!c.bags || c.bagKey === key) return;
      c.bagKey = key;
      while (c.bags.length < colors.length) { const g = c.bags[0].clone(); g.children[0] = g.children[0].clone(); c.bags[0].parent.add(g); c.bags.push(g); }
      const X = [[0], [-0.22, 0.22], [-0.38, 0, 0.38]][Math.min(3, colors.length) - 1];
      c.bags.forEach((g, i) => {
        g.visible = i < colors.length;
        if (!g.visible) return;
        g.position.x = X[i];
        g.children[0].material = R3.paint(colors[i]);
      });
    },
    // stretch the shocks from the hub up to the (bouncing) frame
    fitShocks(c, bob) {
      const L = Math.max(0.15, (c.lift || 0) + 0.3 - c.hub + bob);
      for (const s of c.shocks) { s.rod.scale.y = L; s.coil.scale.y = L * 0.72; s.top.position.y = L; }
    },
    // World position of the driver seat.
    // side 1 = driver (left), -1 = passenger (right)
    // row 0 = front (driver), each row behind is 1.1 further back
    seatPos(c, up = 0, side = 1, row = 0) {
      c.root.updateMatrixWorld(true);
      return new T.Vector3(this.SEAT.x * side, this.SEAT.y + (c.lift || 0) + up, this.SEAT.z - row * 1.1).applyMatrix4(c.root.matrixWorld);
    },
  };
})();
