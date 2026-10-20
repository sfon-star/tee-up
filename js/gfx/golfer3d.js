// Humanlike low-poly golfer built from the player's look, with a simple skeleton.
// Model faces local +z; its left hand side is +x (the target side for a right-handed swing).
(function () {
  const T = THREE, R3 = TU.R3, mat = R3.mat;
  // gold stays gold when shaded, so trims and bands on a gold item are gold too
  const shade = (hex, a) => R3.isGold(hex) ? hex : TU.ui.shade(hex, a);
  const col = hex => parseInt(hex.slice(1), 16);

  function cyl(rt, rb, h, m, seg = 7) {
    const g = new T.CylinderGeometry(rt, rb, h, seg);
    g.translate(0, -h / 2, 0); // hangs down from its pivot
    return new T.Mesh(g, m);
  }
  function box(w, h, d, m) { return new T.Mesh(new T.BoxGeometry(w, h, d), m); }

  // fabric patterns drawn into small nearest-filtered textures, cached per pattern + color
  const designCache = {};
  function designTex(kind, c1) {
    const key = kind + c1;
    if (designCache[key]) return designCache[key];
    const c2 = shade(c1, TU.ui && new T.Color(c1).getHSL({}).l > 0.55 ? -70 : 70);
    const cv = TU.sprites.makeCanvas(32, 32), x = cv.getContext('2d');
    x.fillStyle = c1; x.fillRect(0, 0, 32, 32);
    x.fillStyle = c2;
    if (kind === 'stripes') for (let y = 0; y < 32; y += 8) x.fillRect(0, y, 32, 4);
    else if (kind === 'pinstripe') for (let i = 0; i < 32; i += 6) x.fillRect(i, 0, 1, 32);
    else if (kind === 'check') for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { if ((i + j) % 2) x.fillRect(i * 8, j * 8, 8, 8); }
    else if (kind === 'plaid') {
      x.globalAlpha = 0.55; for (let i = 0; i < 32; i += 10) { x.fillRect(i, 0, 4, 32); x.fillRect(0, i, 32, 4); }
      x.globalAlpha = 1; x.fillStyle = shade(c1, -90); for (let i = 5; i < 32; i += 10) { x.fillRect(i, 0, 1, 32); x.fillRect(0, i, 32, 1); }
    } else if (kind === 'argyle') {
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { x.beginPath(); const cx = i * 16 + 8, cy = j * 16 + 8; x.moveTo(cx, cy - 8); x.lineTo(cx + 8, cy); x.lineTo(cx, cy + 8); x.lineTo(cx - 8, cy); if ((i + j) % 2 === 0) x.fill(); }
      x.strokeStyle = '#ffffff'; x.globalAlpha = 0.5; x.beginPath(); x.moveTo(0, 0); x.lineTo(32, 32); x.moveTo(32, 0); x.lineTo(0, 32); x.stroke(); x.globalAlpha = 1;
    } else if (kind === 'dots') for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(i * 8 + (j % 2) * 4 + 2, j * 8 + 4, 1.8, 0, Math.PI * 2); x.fill(); }
    else if (kind === 'camo') {
      const cs = [shade(c1, -45), shade(c1, 35), '#3b3a24'];
      for (let k = 0; k < 14; k++) { x.fillStyle = cs[k % 3]; x.beginPath(); x.ellipse((k * 37) % 32, (k * 53) % 32, 4 + (k % 3) * 2, 3 + (k % 2) * 2, k, 0, Math.PI * 2); x.fill(); }
    } else if (kind === 'floral') {
      for (let k = 0; k < 6; k++) {
        const fx = (k * 13) % 32, fy = (k * 21) % 32;
        x.fillStyle = ['#ffffff', '#ffe066', '#ff6fb5'][k % 3];
        for (let a = 0; a < 5; a++) { x.beginPath(); x.arc(fx + Math.cos(a * 1.26) * 2.5, fy + Math.sin(a * 1.26) * 2.5, 1.6, 0, Math.PI * 2); x.fill(); }
        x.fillStyle = '#e67e22'; x.fillRect(fx - 1, fy - 1, 2, 2);
      }
    } else if (kind === 'bands') for (let y = 0; y < 32; y += 8) { x.fillStyle = shade(c1, -35); x.fillRect(0, y + 6, 32, 2); }
    const t = new T.CanvasTexture(cv);
    t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter;
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(2, 2);
    return (designCache[key] = t);
  }
  function cloth(color, design) {
    if (R3.isGold(color)) return R3.gold();
    if (!design || design === 'none') return R3.paint(color);
    return new T.MeshPhongMaterial({ map: designTex(design, color), flatShading: true, shininess: 0, specular: 0x000000 });
  }

  function stripeTex(c1, c2) {
    const cv = TU.sprites.makeCanvas(8, 16), x = cv.getContext('2d');
    x.fillStyle = c1; x.fillRect(0, 0, 8, 16);
    x.fillStyle = c2; for (let y = 0; y < 16; y += 4) x.fillRect(0, y, 8, 2);
    const t = new T.CanvasTexture(cv);
    t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter;
    return t;
  }

  TU.Golfer3D = {
    build(look) {
      // body designer sliders (-1..1), limited so the swing still works
      const sh0 = look.shape || {}, sv = k => TU.util.clamp(sh0[k] || 0, -1, 1);
      const H = [1.78, 1.92, 2.05][look.height ?? 1] * (1 + sv('height') * 0.08);
      const bw = [0.88, 1, 1.18][look.body ?? 1] * (1 + sv('weight') * 0.2);
      const legK = 1 + sv('legs') * 0.12, armK = 1 + sv('arms') * 0.12, headK = 1 + sv('head') * 0.3, shK = 1 + sv('shoulders') * 0.15;
      const skin = R3.paint(look.skin), skinD = R3.paint(shade(look.skin, -25));
      const shirtC = look.shirt.color, pantsC = look.pants.color;
      const shirt = cloth(shirtC, look.shirt.design && look.shirt.design !== 'none' ? look.shirt.design : look.shirt.style === 'stripes' ? 'stripes' : 'none');
      const shirtSolid = look.shirt.design && look.shirt.design !== 'none' ? shirt : R3.paint(shirtC);
      const pants = cloth(pantsC, look.pants.design);
      const ps = look.pants.style, jk = (look.jacket && look.jacket.style) || 'none';
      const jd = look.jacket && look.jacket.design;
      // windbreakers are shiny nylon; the rest are matte cloth
      const jacketM = jk === 'puffer' ? cloth(look.jacket.color, 'bands')
        : jk !== 'none' && R3.isGold(look.jacket.color) ? R3.gold()
        : jk === 'windbreaker' && (!jd || jd === 'none') ? new T.MeshPhongMaterial({ color: col(look.jacket.color), shininess: 90, specular: 0x777777, flatShading: true })
        : jk !== 'none' ? cloth(look.jacket.color, jd) : null;
      const bellyOn = (look.body ?? 1) === 2 || (look.shape && look.shape.weight > 0.5);
      const baggy = ps === 'baggy' ? 1.32 : ps === 'cargo' ? 1.12 : 1;
      const hair = R3.paint(look.hairColor);
      const hatM = R3.paint(look.hat.color);
      const hatD = R3.paint(shade(look.hat.color, -40));
      const shoeM = R3.paint(look.shoes.color);
      const gloveM = R3.paint(look.gloves.color);

      const thighL = 0.24 * H * legK, shinL = 0.24 * H * legK, footH = 0.04 * H;
      const hipY = thighL + shinL + footH, waistY = hipY + 0.06 * H, shY = waistY + 0.23 * H;
      const sw = 0.115 * H * bw * shK, hw = 0.075 * H * bw;
      const upL = 0.17 * H * armK, foreL = 0.15 * H * armK, armL = upL + foreL;
      const headR = 0.062 * H * headK;

      const root = new T.Group();
      const hips = new T.Group(); hips.position.y = hipY; root.add(hips);

      // pelvis
      const pelvis = cyl(hw * 1.05, hw * 1.1, waistY - hipY + 0.05, look.pants.style === 'skirt' ? pants : pants, 8);
      pelvis.position.y = waistY - hipY + 0.02; pelvis.scale.z = 0.62;
      hips.add(pelvis);

      // legs
      const legs = [];
      for (const side of [1, -1]) {
        const leg = new T.Group(); leg.position.x = side * hw * 0.55; hips.add(leg);
        const legTop = ps === 'skirt' ? skin : pants;
        const thigh = cyl(0.05 * H * bw * baggy, 0.038 * H * bw * baggy, thighL, legTop); thigh.scale.z = 0.9; leg.add(thigh);
        const pDk = R3.paint(shade(pantsC, -30)), pLt = R3.paint(shade(pantsC, 35));
        const tr = 0.05 * H * bw * baggy; // thigh radius
        if (ps === 'cargo') {
          // big flap pockets on the outside of each thigh, with a button, plus knee patches
          const pk = box(0.02 * H, 0.085 * H, 0.07 * H, pDk); pk.position.set(side * (tr * 0.95), -thighL * 0.6, 0); leg.add(pk);
          const flap = box(0.024 * H, 0.022 * H, 0.074 * H, pLt); flap.position.set(side * (tr * 0.98), -thighL * 0.6 + 0.045 * H, 0); leg.add(flap);
          const btn = new T.Mesh(new T.SphereGeometry(0.006 * H, 4, 3), mat(0x2b2b2b)); btn.position.set(side * (tr * 1.05 + 0.01), -thighL * 0.6 + 0.04 * H, 0); leg.add(btn);
          const patch = box(0.06 * H, 0.06 * H, 0.012, pDk); patch.position.set(0, -thighL * 0.95, tr * 0.88); leg.add(patch);
        }
        if (ps === 'joggers') {
          // tracksuit stripes down the outside of the leg
          const st = box(0.008 * H, thighL, 0.016 * H, mat(0xf4f4f0)); st.position.set(side * tr * 0.92, -thighL / 2, 0); leg.add(st);
        }
        const knee = new T.Group(); knee.position.y = -thighL; leg.add(knee);
        const fullLeg = ps === 'long' || ps === 'baggy' || ps === 'joggers' || ps === 'cargo';
        const shinM = fullLeg ? pants : skin;
        const shin = cyl(0.036 * H * bw * baggy, (ps === 'baggy' ? 0.04 : ps === 'joggers' ? 0.024 : 0.027) * H * (ps === 'baggy' ? bw : 1), shinL, shinM); knee.add(shin);
        if (ps === 'capri') { const cp = cyl(0.038 * H * bw, 0.032 * H * bw, shinL * 0.55, pants); knee.add(cp); }
        if (ps === 'joggers') {
          // stripes continue down the shin; tight ribbed cuff above a bit of sock
          const st2 = box(0.008 * H, shinL * 0.85, 0.014 * H, mat(0xf4f4f0)); st2.position.set(side * 0.031 * H * bw, -shinL * 0.45, 0); knee.add(st2);
          for (let k = 0; k < 3; k++) { const rib = cyl(0.027 * H, 0.027 * H, 0.01 * H, k % 2 ? pDk : pants); rib.position.y = -shinL + 0.07 * H - k * 0.011 * H; knee.add(rib); }
          const sock = cyl(0.022 * H, 0.022 * H, 0.03 * H, mat(0xf4f4f0)); sock.position.y = -shinL + 0.035 * H; knee.add(sock);
        }
        if (ps === 'cargo') {
          const sp = box(0.016 * H, 0.05 * H, 0.04 * H, pDk); sp.position.set(side * 0.04 * H * bw * baggy, -shinL * 0.35, 0); knee.add(sp); // shin pocket
          const roll = cyl(0.04 * H * bw * baggy, 0.04 * H * bw * baggy, 0.03 * H, pLt); roll.position.y = -shinL + 0.03 * H; knee.add(roll); // rolled cuff
        }
        const foot = new T.Group(); foot.position.y = -shinL; knee.add(foot);
        const st = look.shoes.style;
        const upper = box(0.055 * H, footH * 0.75, 0.13 * H, st === 'saddle' ? mat(0xf2f2f2) : shoeM);
        upper.position.set(0, -footH * 0.45, 0.03 * H); foot.add(upper);
        if (st === 'saddle') { const mid = box(0.057 * H, footH * 0.7, 0.05 * H, shoeM); mid.position.set(0, -footH * 0.45, 0.03 * H); foot.add(mid); }
        const sole = box(0.058 * H, footH * 0.3, 0.135 * H, mat(st === 'sneaker' ? 0xf4f4f4 : st === 'spikes' ? 0x1a1a1a : col(shade(look.shoes.color, -60))));
        sole.position.set(0, -footH * 0.88, 0.03 * H); foot.add(sole);
        legs.push({ leg, knee });
      }
      if (look.pants.style === 'skirt') {
        const sk = cyl(hw * 1.1, hw * 1.55, 0.17 * H, pants, 9); sk.scale.z = 0.8;
        sk.position.y = waistY - hipY; hips.add(sk);
      }

      // spine + torso
      const spine = new T.Group(); spine.position.y = waistY - hipY; hips.add(spine);
      const torsoH = shY - waistY;
      const torso = cyl(sw * 0.92, hw * 1.05, torsoH, shirt, 8);
      torso.position.y = torsoH; torso.scale.z = 0.58; spine.add(torso);
      if (bellyOn) { const belly = new T.Mesh(new T.SphereGeometry(hw * 1.15, 8, 6), shirtSolid); belly.position.set(0, torsoH * 0.35, hw * 0.35); belly.scale.set(1, 0.9, 0.75); spine.add(belly); }
      const shoulders = new T.Mesh(new T.SphereGeometry(sw * 0.95, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), shirtSolid);
      shoulders.scale.set(1, 0.32, 0.58); shoulders.position.y = torsoH - 0.01; spine.add(shoulders);
      if (ps === 'joggers') {
        // elastic waistband with drawstrings instead of a belt
        const wb = cyl(hw * 1.09, hw * 1.09, 0.03 * H, R3.paint(shade(pantsC, -30)), 8); wb.scale.z = 0.63; wb.position.y = 0.014 * H; spine.add(wb);
        for (const sx of [1, -1]) { const cord = box(0.005 * H, 0.05 * H, 0.005 * H, mat(0xf4f4f0)); cord.position.set(sx * 0.012 * H, -0.02 * H, hw * 0.7); spine.add(cord); }
      } else if (look.pants.style !== 'skirt') {
        const belt = cyl(hw * 1.08, hw * 1.08, 0.025 * H, mat(0x3a2a1e), 8); belt.scale.z = 0.63; belt.position.y = 0.012 * H; spine.add(belt);
        const buckle = box(0.03 * H, 0.022 * H, 0.01, mat(0xd4b04a)); buckle.position.set(0, 0, hw * 0.68); spine.add(buckle);
      }
      if (look.shirt.style === 'polo') {
        const collar = cyl(0.04 * H, 0.05 * H, 0.03 * H, R3.paint(shade(shirtC, 45)), 8); collar.position.y = torsoH + 0.035 * H; collar.scale.z = 0.8; spine.add(collar);
      }
      if (look.shirt.style === 'sweater') {
        const hem = cyl(hw * 1.1, hw * 1.1, 0.03 * H, R3.paint(shade(shirtC, -30)), 8); hem.scale.z = 0.64; hem.position.y = 0.04 * H; spine.add(hem);
      }

      // jackets and hoodies are a layer over the shirt
      if (jacketM) {
        const bulk = jk === 'puffer' ? 1.14 : 1.05, jc = look.jacket.color;
        const dk = R3.paint(shade(jc, -45)), lt = R3.paint(shade(jc, 60)), white = mat(0xf4f4f0);
        const tail = jk === 'blazer' ? 0.08 * H : 0; // a blazer hangs below the belt
        const jt = cyl(sw * 0.92 * bulk, hw * 1.1 * bulk * (jk === 'blazer' ? 1.1 : 1), torsoH * 0.97 + tail, jacketM, 8);
        jt.position.y = torsoH; jt.scale.z = 0.6 * bulk; spine.add(jt);
        const jsh = new T.Mesh(new T.SphereGeometry(sw * 0.97 * bulk, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), jacketM); jsh.scale.set(1, 0.34, 0.6); jsh.position.y = torsoH - 0.005; spine.add(jsh);
        // the jacket stretches over a belly instead of the belly poking through
        let bellyZ = 0;
        if (bellyOn) { const jb = new T.Mesh(new T.SphereGeometry(hw * 1.2 * bulk, 8, 6), jacketM); jb.position.set(0, torsoH * 0.35, hw * 0.35); jb.scale.set(1, 0.9, 0.8); spine.add(jb); bellyZ = hw * (0.35 + 1.2 * bulk * 0.8); }
        const front = hw * 0.66 * bulk + 0.004, chestZ = sw * 0.92 * bulk * 0.6 * 0.95;
        if (jk === 'blazer' || jk === 'vest') {
          // open V front: shirt, collar points and a tie, framed by wide lapels; buttons below
          const vZ = Math.max(front, chestZ) + 0.004;
          const op = box(0.06 * H, torsoH * 0.42, 0.01, shirtSolid); op.position.set(0, torsoH * 0.76, vZ); spine.add(op);
          if (bellyOn) { const bp = box(0.05 * H, torsoH * 0.25, 0.01, shirtSolid); bp.position.set(0, torsoH * 0.38, bellyZ + 0.002); spine.add(bp); }
          const tie = box(0.016 * H, torsoH * 0.36, 0.008, mat(jk === 'blazer' ? 0xa82828 : 0x1d1d1d)); tie.position.set(0, torsoH * 0.77, vZ + 0.008); spine.add(tie);
          for (const sx of [1, -1]) {
            const lp = box(0.032 * H, torsoH * 0.5, 0.012, jk === 'blazer' ? dk : jacketM); lp.position.set(sx * 0.04 * H, torsoH * 0.74, vZ + 0.006); lp.rotation.z = sx * 0.32; spine.add(lp);
            const cp = box(0.022 * H, 0.012 * H, 0.008, white); cp.position.set(sx * 0.018 * H, torsoH * 0.97, vZ + 0.01); cp.rotation.z = sx * -0.6; spine.add(cp);
          }
          const by = bellyOn ? [0.18, 0.32] : [0.34, 0.48], bz = bellyOn ? bellyZ : front;
          for (const yy of by) { const bt = new T.Mesh(new T.SphereGeometry(0.008 * H, 5, 4), mat(0x1d1712)); bt.position.set(0, torsoH * yy, bz + 0.006); spine.add(bt); }
          if (jk === 'blazer') {
            const sq = box(0.03 * H, 0.014 * H, 0.008, white); sq.position.set(0.075 * H, torsoH * 0.78, chestZ + 0.006); spine.add(sq); // pocket square
            for (const sx of [1, -1]) { const fl = box(0.06 * H, 0.008 * H, 0.012, dk); fl.position.set(sx * 0.07 * H, torsoH * 0.12, (bellyOn ? bellyZ * 0.8 : front) + 0.004); spine.add(fl); }
          }
        } else {
          const zip = box(0.007 * H, torsoH * 0.95, 0.01, mat(0xc9ced6)); zip.position.set(0, torsoH * 0.52, Math.max(front, bellyZ * 0.92) + 0.012); spine.add(zip);
          const cl = cyl(0.047 * H, 0.058 * H, 0.05 * H, jacketM, 8); cl.position.y = torsoH + 0.05 * H; cl.scale.z = 0.85; spine.add(cl); // high collar
          const hem = cyl(hw * 1.13 * bulk, hw * 1.13 * bulk, 0.03 * H, dk, 8); hem.position.y = 0.03 * H; hem.scale.z = 0.64 * bulk; spine.add(hem); // elastic hem
          if (jk === 'windbreaker') {
            // sporty two-tone chest band and a rolled hood at the back of the collar
            const band = cyl(sw * 0.93 * bulk + 0.003, sw * 0.9 * bulk + 0.003, 0.045 * H, lt, 8); band.position.y = torsoH * 0.78; band.scale.z = 0.62 * bulk; spine.add(band);
            const hood = new T.Mesh(new T.TorusGeometry(0.045 * H, 0.018 * H, 5, 10, Math.PI), jacketM); hood.position.set(0, torsoH + 0.035 * H, -0.03 * H); hood.rotation.x = -0.4; spine.add(hood);
          }
        }
      }
      if (look.shirt.style === 'hoodie') {
        const hood = new T.Mesh(new T.SphereGeometry(0.075 * H, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6), shirtSolid); hood.position.set(0, torsoH + 0.01 * H, -0.06 * H); hood.rotation.x = -1.6; hood.scale.set(1, 0.6, 0.6); spine.add(hood);
        const pocket = box(0.11 * H, 0.05 * H, 0.012, R3.paint(shade(shirtC, -25))); pocket.position.set(0, torsoH * 0.28, hw * 0.68); spine.add(pocket);
      }

      // neck + head
      const neck = cyl(0.026 * H, 0.03 * H, 0.05 * H, skin, 6); neck.position.y = torsoH + 0.045 * H; spine.add(neck);
      const head = new T.Group(); head.position.y = torsoH + 0.035 * H + headR * 1.05; spine.add(head);
      const skull = new T.Mesh(new T.SphereGeometry(headR, 10, 8), skin); skull.scale.set(0.9, 1.08, 0.98); head.add(skull);
      const jaw = new T.Mesh(new T.SphereGeometry(headR * 0.7, 8, 5), skin); jaw.position.set(0, -headR * 0.45, headR * 0.12); jaw.scale.set(1, 0.8, 1); head.add(jaw);
      for (const s of [1, -1]) { const ear = new T.Mesh(new T.SphereGeometry(headR * 0.2, 5, 4), skinD); ear.position.set(s * headR * 0.88, -headR * 0.05, 0); ear.scale.set(0.5, 1, 0.8); head.add(ear); }
      const nose = box(headR * 0.18, headR * 0.3, headR * 0.22, skinD); nose.position.set(0, -headR * 0.12, headR * 0.97); head.add(nose);
      const mouth = box(headR * 0.42, headR * 0.07, headR * 0.06, R3.paint(shade(look.skin, -55))); mouth.position.set(0, -headR * 0.5, headR * 0.88); head.add(mouth);
      // eyes: simple dark eyes with a highlight, plus brows
      const eyeM = mat(0x1d1712), glint = mat(0xffffff), brow = R3.paint(shade(look.hairColor, -20));
      for (const s of [1, -1]) {
        const ex = s * headR * 0.34, ey = headR * 0.12;
        const e = box(headR * 0.2, headR * 0.25, headR * 0.1, eyeM); e.position.set(ex, ey, headR * 0.93); head.add(e);
        const gl = box(headR * 0.07, headR * 0.07, headR * 0.04, glint); gl.position.set(ex - headR * 0.04, ey + headR * 0.06, headR * 0.985); head.add(gl);
        const b = box(headR * 0.32, headR * 0.07, headR * 0.06, brow); b.position.set(ex, ey + headR * 0.27, headR * 0.93); b.rotation.z = s * -0.12; head.add(b);
      }

      // hair: built inside a group with the same squash as the skull so every piece hugs the head
      const hs = look.hair, ht = look.hat.style;
      const covered = ht !== 'none' && ht !== 'visor' && ht !== 'headband'; // a full hat hides the top of the hair
      const hairG = new T.Group(); hairG.scale.set(0.9, 1.08, 0.98); head.add(hairG);
      const hairDS = R3.paint(look.hairColor, { side: T.DoubleSide });
      const shaved = R3.paint(shade(look.hairColor, -10));
      const R = headR;
      const add = (m, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); hairG.add(m); return m; };
      // cap of hair over the crown; tilted back so the hairline sits above the forehead
      const cap = (r, th, m, tilt = -0.45) => { const c = add(new T.Mesh(new T.SphereGeometry(R * r, 18, 10, 0, Math.PI * 2, 0, Math.PI * th), m)); c.rotation.x = tilt; return c; };
      // hair seen below a hat brim: sides and back only
      const fringe = (m, r = 1.06) => add(new T.Mesh(new T.SphereGeometry(R * r, 18, 4, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, Math.PI * 0.44, Math.PI * 0.2), m));
      // open shell hanging behind and beside the head (long hair, bob)
      const shell = (rt, rb, h, y, start, len) => add(new T.Mesh(new T.CylinderGeometry(R * rt, R * rb, R * h, 18, 1, true, Math.PI * start, Math.PI * len), hairDS), 0, R * y, 0);

      if (hs !== 'bald') {
        if (covered) fringe(hs === 'buzz' || hs === 'mohawk' ? shaved : hair, hs === 'afro' ? 1.16 : 1.06);
        else if (hs === 'buzz') cap(1.03, 0.56, shaved);
        else if (hs === 'mohawk') {
          cap(1.015, 0.56, R3.paint(shade(look.skin, -22))); // shaved sides
          for (let k = 0; k < 7; k++) {
            const a = -0.35 + k * 0.36, n = new T.Vector3(0, Math.cos(a), -Math.sin(a));
            const sp = add(new T.Mesh(new T.ConeGeometry(R * 0.2, R * 0.75, 4), hair), 0, n.y * R * 1.25, n.z * R * 1.25);
            sp.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), n);
          }
        } else if (hs === 'afro') { const af = add(new T.Mesh(new T.IcosahedronGeometry(R * 1.3, 2), hair), 0, R * 0.5, -R * 0.38); af.scale.set(1.08, 0.95, 0.88); } // sits up and back so the face stays clear
        else cap(hs === 'short' || hs === 'spiky' ? 1.07 : 1.09, 0.58, hair);
        if (hs === 'spiky' && !covered) for (let k = 0; k < 9; k++) {
          // spikes standing out along the surface of the crown
          const a = k / 9 * Math.PI * 2, tilt = 0.55, n = new T.Vector3(Math.sin(a) * Math.sin(tilt), Math.cos(tilt), Math.cos(a) * Math.sin(tilt) - 0.25).normalize();
          const c = add(new T.Mesh(new T.ConeGeometry(R * 0.2, R * 0.7, 4), hair), n.x * R * 1.28, n.y * R * 1.28, n.z * R * 1.28);
          c.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), n);
        }
        if (hs === 'long') shell(1.04, 1.12, 1.6, -0.62, 0.42, 1.16);
        if (hs === 'bob') shell(1.07, 1.16, 0.95, -0.22, 0.22, 1.56);
        if (hs === 'ponytail') {
          add(new T.Mesh(new T.SphereGeometry(R * 0.26, 8, 6), hair), 0, R * 0.05, -R * 1.08);
          const tail = add(new T.Mesh(new T.CylinderGeometry(R * 0.2, R * 0.08, R * 1.3, 7), hair), 0, -R * 0.55, -R * 1.18);
          tail.rotation.x = -0.15;
          add(new T.Mesh(new T.CylinderGeometry(R * 0.2, R * 0.2, R * 0.08, 7), mat(0xe74c3c)), 0, R * 0.08, -R * 1.2).rotation.x = Math.PI / 2;
        }
        if (hs === 'afro' && covered) for (const sx of [-1, 1]) add(new T.Mesh(new T.IcosahedronGeometry(R * 0.42, 1), hair), sx * R * 0.82, -R * 0.15, -R * 0.35);
      } else if (!covered) {
        const shine = add(new T.Mesh(new T.SphereGeometry(R * 0.2, 6, 4), R3.paint(shade(look.skin, 25))), -R * 0.25, R * 0.92, R * 0.1); shine.scale.y = 0.3;
      }
      // hat
      const capGeo = (r, th) => new T.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, th);
      if (ht === 'cap') {
        const c = new T.Mesh(capGeo(headR * 1.12, Math.PI * 0.5), hatM); c.rotation.x = -0.2; c.scale.set(0.95, 1.06, 1.02); head.add(c); // taller than the skull (1.08) so it never clips
        const brim = box(headR * 1.25, headR * 0.06, headR * 0.9, hatD); brim.position.set(0, headR * 0.3, headR * 1.1); brim.rotation.x = 0.12; head.add(brim);
      } else if (ht === 'visor') {
        const band = new T.Mesh(new T.CylinderGeometry(headR * 1.13, headR * 1.13, headR * 0.3, 12, 1, true), hatM); band.position.y = headR * 0.42; head.add(band);
        const brim = box(headR * 1.25, headR * 0.06, headR * 0.9, hatD); brim.position.set(0, headR * 0.32, headR * 1.1); head.add(brim);
      } else if (ht === 'bucket') {
        const c = new T.Mesh(new T.CylinderGeometry(headR * 0.85, headR * 1.08, headR * 0.85, 10), hatM); c.position.y = headR * 0.72; head.add(c);
        const brim = new T.Mesh(new T.CylinderGeometry(headR * 1.55, headR * 1.65, headR * 0.06, 12), hatD); brim.position.y = headR * 0.25; head.add(brim);
      } else if (ht === 'beanie') {
        const c = new T.Mesh(capGeo(headR * 1.13, Math.PI * 0.56), hatM); c.rotation.x = -0.15; head.add(c);
        const fold = new T.Mesh(new T.CylinderGeometry(headR * 1.12, headR * 1.12, headR * 0.25, 12), hatD); fold.position.y = headR * 0.2; fold.rotation.x = -0.15; head.add(fold);
        const pom = new T.Mesh(new T.SphereGeometry(headR * 0.28, 6, 5), hatD); pom.position.y = headR * 1.18; head.add(pom);
      } else if (ht === 'cowboy') {
        const c = new T.Mesh(new T.CylinderGeometry(headR * 0.75, headR * 0.92, headR * 0.95, 10), hatM); c.position.y = headR * 0.8; head.add(c);
        const band = new T.Mesh(new T.CylinderGeometry(headR * 0.93, headR * 0.93, headR * 0.15, 10), hatD); band.position.y = headR * 0.42; head.add(band);
        const brim = new T.Mesh(new T.CylinderGeometry(headR * 2.0, headR * 2.0, headR * 0.06, 14), hatM); brim.position.y = headR * 0.35; brim.scale.z = 0.85; head.add(brim);
      }

      else if (ht === 'tophat') {
        const c = new T.Mesh(new T.CylinderGeometry(headR * 0.85, headR * 0.85, headR * 1.7, 12), hatM); c.position.y = headR * 1.25; head.add(c);
        const band = new T.Mesh(new T.CylinderGeometry(headR * 0.87, headR * 0.87, headR * 0.25, 12), R3.paint(shade(look.hat.color, 60))); band.position.y = headR * 0.6; head.add(band);
        const brim = new T.Mesh(new T.CylinderGeometry(headR * 1.45, headR * 1.45, headR * 0.06, 14), hatM); brim.position.y = headR * 0.42; head.add(brim);
      } else if (ht === 'fedora') {
        const c = new T.Mesh(new T.CylinderGeometry(headR * 0.78, headR * 1.0, headR * 0.8, 10), hatM); c.position.y = headR * 0.75; c.scale.z = 0.92; head.add(c);
        const dent = box(headR * 0.12, headR * 0.1, headR * 1.2, hatD); dent.position.y = headR * 1.15; head.add(dent);
        const band = new T.Mesh(new T.CylinderGeometry(headR * 1.0, headR * 1.02, headR * 0.16, 10), mat(0x1d1d1d)); band.position.y = headR * 0.45; head.add(band);
        const brim = new T.Mesh(new T.CylinderGeometry(headR * 1.6, headR * 1.6, headR * 0.05, 14), hatM); brim.position.y = headR * 0.38; head.add(brim);
      } else if (ht === 'flatcap') {
        const c = new T.Mesh(capGeo(headR * 1.13, Math.PI * 0.42), hatM); c.scale.set(1.02, 0.7, 1.15); c.position.set(0, headR * 0.15, headR * 0.08); c.rotation.x = 0.1; head.add(c);
        const brim = box(headR * 1.2, headR * 0.05, headR * 0.5, hatD); brim.position.set(0, headR * 0.3, headR * 1.05); brim.rotation.x = 0.25; head.add(brim);
      } else if (ht === 'beret') {
        const c = new T.Mesh(new T.SphereGeometry(headR * 1.2, 12, 6), hatM); c.scale.set(1, 0.32, 1); c.position.set(headR * 0.15, headR * 0.82, -headR * 0.05); c.rotation.z = -0.2; head.add(c);
        const nub = new T.Mesh(new T.CylinderGeometry(headR * 0.06, headR * 0.06, headR * 0.15, 5), hatD); nub.position.set(headR * 0.12, headR * 1.22, 0); head.add(nub);
      } else if (ht === 'sunhat') {
        const c = new T.Mesh(capGeo(headR * 1.12, Math.PI * 0.5), hatM); head.add(c);
        const brim = new T.Mesh(new T.CylinderGeometry(headR * 2.3, headR * 2.4, headR * 0.05, 18), hatM); brim.position.y = headR * 0.3; head.add(brim);
        const rib = new T.Mesh(new T.CylinderGeometry(headR * 1.13, headR * 1.13, headR * 0.2, 14), mat(0xe74c3c)); rib.position.y = headR * 0.42; head.add(rib);
      } else if (ht === 'headband') {
        const band = new T.Mesh(new T.CylinderGeometry(headR * 1.1, headR * 1.1, headR * 0.28, 14, 1, true), hatM); band.position.y = headR * 0.42; band.scale.z = 1.02; head.add(band);
      } else if (ht === 'propeller') {
        const c = new T.Mesh(capGeo(headR * 1.13, Math.PI * 0.5), hatM); c.rotation.x = -0.15; head.add(c);
        for (let k = 0; k < 4; k++) { const seg = new T.Mesh(capGeo(headR * 1.135, Math.PI * 0.5), mat([0xe74c3c, 0xf1c40f, 0x2f80ed, 0x27ae60][k])); seg.scale.set(0.25, 1, 1); seg.rotation.set(-0.15, k * Math.PI / 4, 0); head.add(seg); }
        const stick = new T.Mesh(new T.CylinderGeometry(headR * 0.04, headR * 0.04, headR * 0.35, 4), mat(0x9aa3ad)); stick.position.y = headR * 1.25; head.add(stick);
        const blade = box(headR * 1.4, headR * 0.03, headR * 0.18, mat(0xe74c3c)); blade.position.y = headR * 1.42; head.add(blade);
      }

      // arms (inside a swing pivot at shoulder height)
      const pivot = new T.Group(); pivot.position.y = torsoH - 0.02 * H; spine.add(pivot);
      const arms = [];
      const sleeveJ = jacketM && jk !== 'vest';
      const longSleeve = look.shirt.style === 'sweater' || look.shirt.style === 'hoodie' || look.shirt.style === 'longsleeve' || sleeveJ;
      const sleeveM = sleeveJ ? jacketM : shirtSolid, sk = sleeveJ ? (jk === 'puffer' ? 1.25 : 1.1) : 1;
      for (const side of [1, -1]) {
        const sh = new T.Group(); sh.position.x = side * (sw - 0.02 * H); pivot.add(sh);
        const sleeve = cyl(0.036 * H * bw * sk, 0.032 * H * bw * sk, upL * (longSleeve ? 1 : 0.5), sleeveM); sh.add(sleeve);
        if (!longSleeve) { const up = cyl(0.028 * H * bw, 0.026 * H * bw, upL * 0.5, skin); up.position.y = -upL * 0.5; sh.add(up); }
        const elbow = new T.Group(); elbow.position.y = -upL; sh.add(elbow);
        const fore = cyl(0.026 * H * bw * sk, 0.021 * H * sk, foreL, longSleeve ? sleeveM : skin); elbow.add(fore);
        if (sleeveJ && (jk === 'windbreaker' || jk === 'puffer')) { const cf = cyl(0.024 * H * sk, 0.024 * H * sk, 0.025 * H, R3.paint(shade(look.jacket.color, -45))); cf.position.y = -foreL + 0.025 * H; elbow.add(cf); }
        if (sleeveJ && jk === 'blazer') { const cf = cyl(0.023 * H, 0.023 * H, 0.012 * H, mat(0xf4f4f0)); cf.position.y = -foreL + 0.01 * H; elbow.add(cf); } // shirt cuff peeking out
        const gl = look.gloves.style === 'both' || (look.gloves.style === 'left' && side === 1);
        const hand = box(0.035 * H, 0.06 * H, 0.03 * H, gl ? gloveM : skin); hand.position.y = -foreL - 0.025 * H; elbow.add(hand);
        arms.push({ sh, elbow, side });
      }
      // club (hidden unless swinging)
      const club = new T.Group(); pivot.add(club);
      const shaft = cyl(0.012, 0.009, 1, mat(0xc9ced6), 4); club.add(shaft);
      const clubHead = new T.Mesh(new T.BoxGeometry(1, 1, 1), mat(0x9aa3ad)); club.add(clubHead);
      const grip = box(0.04 * H, 0.1 * H, 0.04 * H, gloveM); grip.position.y = -0.04 * H; club.add(grip);

      R3.castShadows(root);

      const g = { root, head, hips, spine, pivot, legs, arms, club, shaft, clubHead, H, hipY, sw, armL, clubType: null, addr: null };
      g.setClub = type => TU.Golfer3D.setClub(g, type);
      g.pose = o => TU.Golfer3D.pose(g, o);
      g.setClub('iron');
      g.pose({ mode: 'stand' });
      return g;
    },

    setClub(g, type) {
      g.clubType = type;
      const h = g.clubHead;
      // the Legend set is solid gold, heads and shafts
      const legend = !g.noGoldClubs && TU.clubs && TU.clubs.currentSet().id === 'legend';
      if (type === 'wood') { h.scale.set(0.11, 0.07, 0.13); h.material = legend ? R3.gold() : mat(0x2a221c); }
      else if (type === 'putter') { h.scale.set(0.13, 0.035, 0.04); h.material = legend ? R3.gold() : mat(0xb8bec6); }
      else { h.scale.set(0.09, 0.06, 0.02); h.material = legend ? R3.gold() : mat(0xb8bec6); }
      g.shaft.material = legend ? R3.gold() : mat(0xc9ced6);
      g.addr = null;
    },

    // mode: 'stand' | 'walk' (walk = phase) | 'swing' (swing -1..1) | 'putt' (swing -1..1)
    pose(g, o) {
      const mode = o.mode;
      const swinging = mode === 'swing' || mode === 'putt';
      g.club.visible = swinging;
      g.hips.rotation.set(0, 0, 0);
      g.spine.rotation.set(0, 0, 0);
      g.pivot.rotation.set(0, 0, 0);
      for (const l of g.legs) { l.leg.rotation.set(0, 0, 0); l.knee.rotation.set(0, 0, 0); }
      if (mode === 'stumble') {
        // knocked back: lean back, arms flung out, knees buckled
        const w = Math.sin((o.t || 0) * 18) * 0.15;
        g.spine.rotation.x = -0.45 + w;
        g.legs.forEach((l, i) => { l.leg.rotation.x = 0.25 * (i ? 1 : -1); l.knee.rotation.x = 0.5; });
        g.arms.forEach(ar => { ar.sh.quaternion.identity(); ar.sh.rotation.set(-0.6, 0, ar.side * 1.3); ar.elbow.rotation.set(-0.4, 0, 0); });
        return;
      }
      if (mode === 'cheer') {
        // arms up, a little hop
        const t = o.t || 0, hop = Math.abs(Math.sin(t * 7));
        g.legs.forEach(l => { l.knee.rotation.x = 0.25 * (1 - hop); });
        g.spine.rotation.x = -0.12;
        g.arms.forEach((ar, i) => { ar.sh.quaternion.identity(); ar.sh.rotation.set(-2.7 + Math.sin(t * 9 + i) * 0.2, 0, ar.side * 0.35); ar.elbow.rotation.set(-0.3, 0, 0); });
        g.hop = hop * 0.18;
        return;
      }
      g.hop = 0;
      if (mode === 'sit') {
        g.legs.forEach(l => { l.leg.rotation.x = -1.45; l.knee.rotation.x = 1.4; });
        g.arms.forEach(ar => { ar.sh.quaternion.identity(); ar.sh.rotation.set(-0.95, 0, ar.side * -0.12); ar.elbow.rotation.set(-0.5, 0, 0); });
        if (o.wave != null) { const ar = g.arms[0]; ar.sh.rotation.set(-2.6, 0, ar.side * (0.35 + Math.sin(o.wave * 9) * 0.35)); ar.elbow.rotation.set(-0.4, 0, 0); } // waving hello
        return;
      }
      if (!swinging) {
        const p = mode === 'walk' ? o.walk || 0 : 0, a = mode === 'walk' ? 0.55 : 0;
        g.legs.forEach((l, i) => {
          const s = Math.sin(p + i * Math.PI);
          l.leg.rotation.x = -s * a;
          l.knee.rotation.x = Math.max(0, Math.sin(p + i * Math.PI + 1.2)) * a * 1.3;
        });
        g.arms.forEach((ar, i) => {
          ar.sh.quaternion.identity();
          ar.sh.rotation.set(Math.sin(p + i * Math.PI) * a * 0.8, 0, ar.side * 0.07);
          ar.elbow.rotation.set(-0.15 - (mode === 'walk' ? 0.2 : 0), 0, 0);
        });
        g.spine.rotation.x = mode === 'walk' ? 0.05 : 0;
        return;
      }
      const putt = mode === 'putt', sv = o.swing || 0;
      g.spine.rotation.x = putt ? 0.55 : 0.42;
      g.spine.rotation.y = putt ? 0 : sv * 0.85;
      g.legs.forEach(l => { l.leg.rotation.x = -0.18; l.knee.rotation.x = 0.32; l.leg.rotation.z = (l === g.legs[0] ? 1 : -1) * 0.06; });
      g.hips.rotation.y = putt ? 0 : sv * 0.3;
      g.pivot.rotation.z = sv * (putt ? 0.35 : 2.55);
      // both arms reach a grip point in front of the chest
      const f = g.armL * 0.18, sw = g.sw - 0.02 * g.H;
      const gy = -Math.sqrt(Math.max(0.01, g.armL * g.armL - sw * sw - f * f));
      const grip = new T.Vector3(0, gy, f);
      for (const ar of g.arms) {
        const dir = grip.clone().sub(ar.sh.position).normalize();
        ar.sh.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), dir);
        ar.elbow.rotation.set(0, 0, 0);
      }
      g.club.position.copy(grip);
      const cd = putt ? new T.Vector3(0, -1, 0.42) : g.clubType === 'wood' ? new T.Vector3(0, -1, 1.05) : new T.Vector3(0, -1, 0.85);
      g.club.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), cd.normalize());
      if (!g.addr || g.addr.type !== mode + g.clubType) this.fitClub(g, mode);
    },

    // At address, size the club so its head touches the ground and record where the head is.
    fitClub(g, mode) {
      // measure in a neutral, upright stance (no leftover turn or cart tilt)
      const r = g.root, sp = r.position.clone(), sq = r.quaternion.clone();
      r.position.set(0, 0, 0); r.rotation.set(0, 0, 0);
      const sv = g.pivot.rotation.z, sy = g.spine.rotation.y, hy = g.hips.rotation.y;
      g.pivot.rotation.z = 0; g.spine.rotation.y = 0; g.hips.rotation.y = 0;
      r.updateMatrixWorld(true);
      const hands = new T.Vector3(); g.club.getWorldPosition(hands);
      const dir = new T.Vector3(0, -1, 0).applyQuaternion(g.club.getWorldQuaternion(new T.Quaternion()));
      const len = Math.max(0.5, (hands.y - 0.05) / -dir.y);
      g.shaft.scale.y = len;
      g.clubHead.position.set(0, -len, 0.02);
      const head = hands.clone().add(dir.multiplyScalar(len));
      g.addr = { type: mode + g.clubType, x: head.x, z: head.z };
      g.pivot.rotation.z = sv; g.spine.rotation.y = sy; g.hips.rotation.y = hy;
      r.position.copy(sp); r.quaternion.copy(sq);
    },

    // Stand at address to a ball at (bx, by) aiming at angle `aim` (game convention).
    address(g, bx, by, aim) {
      const ry = Math.PI / 2 - aim;
      g.root.rotation.set(0, ry, 0); // also clears any tilt left over from riding in the cart
      const a = g.addr || { x: 0.2, z: 0.6 };
      const c = Math.cos(ry), s = Math.sin(ry);
      const ox = a.x * c + a.z * s, oz = -a.x * s + a.z * c;
      const x = bx - ox, y = by - oz;
      // on slopes, stand at the ball's height (within reason) so the club head meets the ball
      const feet = R3.heightAt(x, y), ballH = R3.heightAt(bx, by);
      g.root.position.set(x, feet + TU.util.clamp(ballH - feet, -0.3, 0.3), y);
    },
    // Place standing/walking at (x, y) facing game angle `face`.
    placeAt(g, x, y, face) {
      // full reset: riding in a tilted cart leaves pitch/roll on the root that must not carry over
      g.root.rotation.set(0, Math.PI - face, 0);
      g.root.position.set(x, R3.heightAt(x, y), y);
    },
  };
})();
