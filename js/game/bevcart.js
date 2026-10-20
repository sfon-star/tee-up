// Beverage cart (Career only). While you travel between shots it sometimes drives by on the
// cart path. Stop it by SHOUTING (timing meter: louder the closer to the middle you click;
// the farther away it is, the louder you need to be) or by RUNNING it down on foot before it
// leaves. If it stops, buy drinks and snacks (power-ups) with Tees.
(function () {
  const U = TU.util, ui = TU.ui, input = TU.input;
  const SPEED = 6.5;
  const VENDOR = { hair: 'bob', hairColor: '#1b1209', skin: '#d49a6a', height: 1, body: 1, eyes: 'round', eyeColor: '#2b5d8a',
    shirt: { style: 'stripes', color: '#c0392b' }, pants: { style: 'shorts', color: '#1d1d1d' }, shoes: { style: 'sneaker', color: '#ffffff' },
    hat: { style: 'visor', color: '#f1c40f' }, gloves: { style: 'none', color: '#ffffff' } };

  // polyline helpers over hole.path ([[x, y], ...])
  function track(path) {
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
    const at = s => {
      s = U.clamp(s, 0, cum[cum.length - 1]);
      let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
      const a = path[i - 1], b = path[i], t = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
      return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, h: Math.atan2(b[0] - a[0], -(b[1] - a[1])) };
    };
    const nearest = (x, y) => {
      let best = 0, bd = 1e9;
      for (let s = 0; s <= cum[cum.length - 1]; s += 2) { const p = at(s), d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = s; } }
      return { s: best, d: bd };
    };
    return { at, nearest, len: cum[cum.length - 1] };
  }

  TU.bev = {
    // call at the start of each hole
    setupHole(p) {
      p.bev = null; p.bevMode = null; p.bevTimer = 0;
      p.bevPlan = p.round.mode === 'career' && !!p.hole.path && Math.random() < 0.55;
      p.bevDelay = 1.5 + Math.random() * 4;
      if (!p.bevObj) {
        p.bevObj = TU.Cart3D.build({ color: '#c0392b', roof: '#f1c40f', wheels: 'silver', bev: true });
        p.bevDriver = TU.Golfer3D.build(VENDOR);
        TU.R3.scene.add(p.bevObj.root, p.bevDriver.root);
      }
      p.bevObj.root.visible = p.bevDriver.root.visible = false;
    },
    remove(p) {
      for (const k of ['bevObj', 'bevDriver']) if (p[k]) { TU.R3.scene.remove(p[k].root); p[k].root.traverse(o => { if (o.geometry) o.geometry.dispose(); }); p[k] = null; }
    },
    playerPos(p) { return p.state === 'drive' ? p.cart : p.walker; },
    spawn(p, force) {
      p.bevPlan = false;
      const tr = track(p.hole.path), me = this.playerPos(p), near = tr.nearest(me.x, me.y);
      if (near.d > 60 && !force) return; // too far from the path to notice it
      let dir = Math.random() < 0.5 ? 1 : -1;
      let s0 = near.s - dir * 45, s1 = near.s + dir * 55;
      s0 = U.clamp(s0, 0, tr.len); s1 = U.clamp(s1, 0, tr.len);
      if (Math.abs(s1 - s0) < 40 && force) { dir = -dir; s0 = U.clamp(near.s - dir * 45, 0, tr.len); s1 = U.clamp(near.s + dir * 55, 0, tr.len); }
      if (Math.abs(s1 - s0) < 40) return;
      p.bev = { tr, s: s0, end: s1, dir: Math.sign(s1 - s0), state: 'driving', shoutUsed: false };
      p.bevMode = 'offer';
      TU.audio.play('coin');
      this.place(p);
    },
    place(p) {
      const b = p.bev, pos = b.tr.at(b.s), h = b.dir > 0 ? pos.h : pos.h + Math.PI;
      b.x = pos.x; b.y = pos.y; b.h = h;
      p.bevObj.root.visible = p.bevDriver.root.visible = true;
      TU.Cart3D.place(p.bevObj, pos.x, pos.y, h, b.state === 'driving' ? SPEED / 60 : 0);
      p.bevDriver.pose({ mode: 'sit', wave: p.bevA && p.bevA.arr != null ? TU.time : null });
      p.bevDriver.root.quaternion.copy(p.bevObj.root.quaternion);
      p.bevDriver.root.position.copy(TU.Cart3D.seatPos(p.bevObj, -(p.bevDriver.hipY - 0.1)));
    },
    dist(p) { const me = this.playerPos(p); return p.bev ? Math.hypot(me.x - p.bev.x, me.y - p.bev.y) : 999; },
    // true while a full-screen bev panel should freeze travel input
    modal(p) { return p.bevMode === 'shout' || p.bevMode === 'menu' || p.bevMode === 'approach'; },

    update(p, dt) {
      const travel = p.state === 'walk' || p.state === 'drive';
      if (!p.bev) {
        if (p.bevPlan && travel) { p.bevTimer += dt; if (p.bevTimer > p.bevDelay) this.spawn(p); }
        return;
      }
      const b = p.bev;
      if (b.state === 'escaping') return this.updateEscape(p, dt);
      if (b.state === 'driving') {
        // waits for you (or your cart) to get out of the way instead of driving through
        const me = this.playerPos(p), ahead = { x: b.x + Math.sin(b.h) * 2.2, y: b.y - Math.cos(b.h) * 2.2 };
        const blocked = (me && Math.hypot(me.x - ahead.x, me.y - ahead.y) < 2) || (p.cart && Math.hypot(p.cart.x - ahead.x, p.cart.y - ahead.y) < 2.2);
        if (!blocked) { b.s += b.dir * SPEED * dt; b.waitT = 0; }
        else if ((b.waitT = (b.waitT || 0) + dt) > 5) { if (p.bevMode === 'offer') p.showBanner('The beverage cart turned around', '', 1.4); b.dir = -b.dir; return this.escape(p); }
        if ((b.end - b.s) * b.dir <= 0) {
          if (p.bevMode === 'offer' || p.bevMode === 'run' || p.bevMode === 'shout') p.showBanner('The beverage cart drove off', '', 1.4);
          return this.escape(p);
        }
      }
      this.place(p);
      if (!travel && p.bevMode !== 'menu') return this.escape(p);
      if (p.bevMode === 'offer') {
        if (input.isPressed('Digit1')) this.startShout(p);
        else if (input.isPressed('Digit2')) this.startRun(p);
        else if (input.isPressed('Digit3')) p.bevMode = 'ignored';
      } else if (p.bevMode === 'shout') this.updateShout(p, dt);
      else if (p.bevMode === 'run') {
        if (p.state === 'walk' && this.dist(p) < 3) this.stop(p);
      } else if (p.bevMode === 'approach') this.updateApproach(p, dt);
    },
    // drive away: speed up along the path (and straight on past its end) until well out of sight
    escape(p) {
      const b = p.bev;
      if (!b) return;
      b.state = 'escaping'; b.v = Math.max(b.v || SPEED, SPEED); b.off = 0;
      if (p.bevMode !== 'menu') p.bevMode = null;
      TU.audio.play('swing');
    },
    updateEscape(p, dt) {
      const b = p.bev, Ph = TU.physics, hole = p.hole;
      // never runs you over: brakes hard if you or your cart are right in front of it
      const me0 = this.playerPos(p), ah = { x: b.x + Math.sin(b.h) * 2.4, y: b.y - Math.cos(b.h) * 2.4 };
      const inWay = (me0 && Math.hypot(me0.x - ah.x, me0.y - ah.y) < 2.2) || (p.cart && Math.hypot(p.cart.x - ah.x, p.cart.y - ah.y) < 2.4);
      b.v = inWay ? 0 : Math.min(24, b.v + 8 * dt);
      const len = b.tr.len, step = b.v * dt;
      if (b.ox == null && b.s + b.dir * step >= 0 && b.s + b.dir * step <= len) {
        // still on the path: follow it
        b.s += b.dir * step;
        const pos = b.tr.at(b.s);
        b.x = pos.x; b.y = pos.y; b.h = b.dir > 0 ? pos.h : pos.h + Math.PI;
      } else {
        // past the end of the path: carry on across the grass, steering round trees, water and props
        if (b.ox == null) { b.ox = b.x; b.oy = b.y; b.off = 0; }
        const blockedAt = (x, y) => { const t = Ph.tileAt(hole, x, y); return t === 'W' || t === 'G' || t === 'T' || Ph.treeAt(hole, x, y, 1.3) || !!TU.R3.obstacleAt(x, y, 1); };
        const clear = h => { for (let d = 1.5; d <= 10; d += 1.5) if (blockedAt(b.x + Math.sin(h) * d, b.y - Math.cos(h) * d)) return false; return true; };
        b.v = Math.min(b.v, 12); // slower on the grass so it can steer
        if (!clear(b.h)) {
          let turned = false;
          for (let k = 1; k <= 12 && !turned; k++) for (const sgn of [1, -1]) { const h = b.h + sgn * k * 0.25; if (clear(h)) { b.h += sgn * Math.min(k * 0.25, 4 * dt); turned = true; break; } }
          if (!turned) b.h += 4 * dt; // boxed in: turn on the spot until there's a way out
        }
        // never move into anything
        const nx = b.x + Math.sin(b.h) * b.v * dt, ny = b.y - Math.cos(b.h) * b.v * dt;
        if (!blockedAt(nx, ny)) { b.x = nx; b.y = ny; b.off += b.v * dt; b.stuckT = 0; } else b.v = 0;
        // boxed in for a couple of seconds: turn around and leave the other way down the path
        if (b.v < 0.5 && !inWay && (b.stuckT = (b.stuckT || 0) + dt) > 2 && !b.turned) {
          b.turned = true; b.dir = -b.dir; b.ox = null; b.off = 0; b.stuckT = 0;
          b.s = b.tr.nearest(b.x, b.y).s; // rejoin the path where it left it
        }
      }
      p.bevObj.root.visible = p.bevDriver.root.visible = true;
      TU.Cart3D.place(p.bevObj, b.x, b.y, b.h, step, { z: TU.R3.heightAt(b.x, b.y) });
      p.bevDriver.pose({ mode: 'sit', wave: p.bevA && p.bevA.arr != null ? TU.time : null });
      p.bevDriver.root.quaternion.copy(p.bevObj.root.quaternion);
      p.bevDriver.root.position.copy(TU.Cart3D.seatPos(p.bevObj, -(p.bevDriver.hipY - 0.1)));
      // gone once it's far away from you (or well off the edge of the course)
      const me = this.playerPos(p) || p.ball, far = me ? Math.hypot(me.x - b.x, me.y - b.y) : 999;
      const outside = b.x < -30 || b.y < -30 || b.x > hole.w * 4 + 30 || b.y > hole.h * 4 + 30;
      // only vanish where you can't see it happen: off screen, or tiny in the distance
      const cam = TU.R3.camera, v = new THREE.Vector3(b.x, TU.R3.heightAt(b.x, b.y) + 1, b.y).project(cam);
      const onScreen = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      if ((far > 70 && !onScreen) || far > 170 || (outside && !onScreen) || (b.off || 0) > 160) this.leave(p);
    },
    leave(p) {
      p.bev = null; p.bevMode = null;
      if (p.bevObj) p.bevObj.root.visible = p.bevDriver.root.visible = false;
    },
    // It pulls over: you hop out (if you were driving), walk up to the vendor, they wave hello,
    // and you get a good look at the cart before the menu opens.
    stop(p) {
      const b = p.bev;
      b.state = 'stopped';
      p.bevMsg = null;
      if (p.state === 'drive') {
        const c = p.cart, l = U.dirVec(c.h - Math.PI / 2);
        p.walker = p.makeWalker(c.x + l.x * 1.4, c.y + l.y * 1.4, U.angleTo(c, b));
        c.v = 0; p.state = 'walk';
      }
      // stand right beside the vendor's seat, facing them (or across the cart if that side's blocked)
      const l = U.dirVec(b.h - Math.PI / 2), seat = TU.Cart3D.seatPos(p.bevObj), sx = seat.x, sy = seat.z;
      let spot = { x: sx + l.x * 1.7, y: sy + l.y * 1.7 }, side = 1;
      if (p.walkBlocked(spot.x, spot.y)) { spot = { x: sx - l.x * 2.6, y: sy - l.y * 2.6 }; side = -1; }
      p.bevA = { t: 0, spot, side, arr: null };
      p.bevMode = 'approach';
      p.snapCamera = true;
      TU.audio.play('coin');
    },
    updateApproach(p, dt) {
      const A = p.bevA, w = p.walker, b = p.bev;
      A.t += dt;
      if (A.arr == null) {
        const dx = A.spot.x - w.x, dy = A.spot.y - w.y, d = Math.hypot(dx, dy);
        if (d < 0.25 || A.t > 7) { w.x = A.spot.x; w.y = A.spot.y; A.arr = A.t; w.moving = false; TU.audio.play('cheer'); }
        else {
          const sp = Math.min(d / dt, 4.2), nx = w.x + dx / d * sp * dt, ny = w.y + dy / d * sp * dt;
          if (!p.walkBlocked(nx, ny)) { w.x = nx; w.y = ny; }
          w.face = Math.atan2(dx, -dy); w.moving = true; w.phase += sp * dt * 2.2;
        }
        w.z = TU.physics.groundAt(p.hole, w.x, w.y);
      } else { const d = p.bevDriver.root.position; w.face = U.angleTo(w, { x: d.x, y: d.z }); } // face the vendor
      // once you've said hello (or click to hurry it along) the menu opens
      if ((A.arr != null && A.t - A.arr > 2.4) || (input.clicked && A.t > 1)) {
        const d = p.bevDriver.root.position;
        if (A.arr == null) { w.x = A.spot.x; w.y = A.spot.y; w.z = TU.physics.groundAt(p.hole, w.x, w.y); }
        w.face = U.angleTo(w, { x: d.x, y: d.z });
        w.moving = false;
        p.bevMode = 'menu';
        p.bevA = null;
      }
    },
    startShout(p) {
      if (p.bev.shoutUsed) return;
      p.bev.shoutUsed = true;
      p.bevMode = 'shout';
      p.shout = { pos: 0, dir: 1, need: U.clamp(0.3 + this.dist(p) / 70, 0.35, 0.95), result: null, t: 0 };
    },
    updateShout(p, dt) {
      const sh = p.shout;
      if (sh.result) {
        sh.t -= dt;
        if (sh.t <= 0) {
          if (sh.result === 'heard') this.stop(p);
          else { p.bevMode = 'offer'; p.showBanner("They didn't hear you!", 'Try running after it', 1.6); }
        }
        return;
      }
      sh.pos += sh.dir * dt * 1.5;
      if (sh.pos >= 1) { sh.pos = 1; sh.dir = -1; }
      if (sh.pos <= 0) { sh.pos = 0; sh.dir = 1; }
      if (input.clicked || input.isPressed('Space', 'Enter')) {
        sh.loud = 1 - Math.abs(sh.pos - 0.5) * 2;
        sh.result = sh.loud >= sh.need ? 'heard' : 'quiet';
        sh.t = 1.1;
        TU.audio.play(sh.result === 'heard' ? 'cup' : 'bad');
      }
    },
    startRun(p) {
      p.bevMode = 'run';
      // hop out of the golf cart to give chase
      if (p.state === 'drive') {
        const c = p.cart, l = U.dirVec(c.h - Math.PI / 2);
        p.walker = p.makeWalker(c.x + l.x * 1.4, c.y + l.y * 1.4, U.angleTo(c, p.bev));
        c.v = 0;
        p.state = 'walk';
      } else p.walker.face = U.angleTo(p.walker, p.bev);
      p.holdRelease = false;
      p.showBanner('Catch the beverage cart!', 'Hold run and get close to it', 1.6);
    },

    // ---------- drawing ----------
    drawUI(c, p) {
      const m = p.bevMode;
      if (m === 'offer') {
        ui.panel(c, 250, 362, 460, 80, { fill: '#2a1712' });
        ui.text(c, 'BEVERAGE CART!', 268, 372, { size: 12, color: '#ffe066' });
        ui.text(c, `Driving by on the path, ${Math.round(this.dist(p))} yds away`, 268, 392, { size: 8, color: '#f6d8c8' });
        if (ui.button(c, 268, 408, 130, 26, '1 SHOUT', { size: 8, color: p.bev.shoutUsed ? '#55606a' : '#c0392b', disabled: p.bev.shoutUsed })) this.startShout(p);
        if (ui.button(c, 410, 408, 130, 26, '2 RUN', { size: 8, color: '#d35400' })) this.startRun(p);
        if (ui.button(c, 552, 408, 140, 26, '3 IGNORE', { size: 8, color: '#55606a' })) p.bevMode = 'ignored';
      } else if (m === 'run') {
        ui.panel(c, 330, 380, 300, 40, { fill: '#2a1712' });
        ui.text(c, `CATCH IT!  ${Math.round(this.dist(p))} YDS`, 480, 393, { size: 10, align: 'center', color: '#ffe066' });
      } else if (m === 'shout') this.drawShout(c, p);
      else if (m === 'menu') this.drawMenu(c, p);
    },
    drawShout(c, p) {
      const sh = p.shout;
      c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, 960, 540);
      ui.panel(c, 230, 170, 500, 200, { fill: '#2a1712' });
      ui.text(c, 'SHOUT!', 480, 186, { size: 24, align: 'center', color: '#ffe066' });
      ui.text(c, 'Click when the marker is in the middle. Farther away = shout louder.', 480, 222, { size: 6, align: 'center', color: '#f6d8c8' });
      const bx = 270, bw = 420, by = 250, bh = 34;
      // loudness bar: quiet at the edges, loudest in the middle
      for (let i = 0; i < bw; i += 4) {
        const loud = 1 - Math.abs(i / bw - 0.5) * 2;
        c.fillStyle = loud >= sh.need ? `hsl(${100 + loud * 30},70%,${35 + loud * 15}%)` : `hsl(${10 + loud * 30},60%,30%)`;
        c.fillRect(bx + i, by, 4, bh);
      }
      ui.text(c, `NEED ${Math.round(sh.need * 100)}% LOUD`, 480, by + bh + 8, { size: 8, align: 'center', color: '#ffe066' });
      const mx = bx + bw * sh.pos;
      c.fillStyle = '#0b1410'; c.fillRect(mx - 4, by - 8, 8, bh + 16);
      c.fillStyle = '#ffffff'; c.fillRect(mx - 2, by - 6, 4, bh + 12);
      if (sh.result) {
        ui.text(c, sh.result === 'heard' ? `"HEY! OVER HERE!"  ${Math.round(sh.loud * 100)}%` : `"hey..."  ${Math.round(sh.loud * 100)}%`, 480, 330, { size: 12, align: 'center', color: sh.result === 'heard' ? '#7dff9a' : '#ff8a6a' });
      }
    },
    drawMenu(c, p) {
      const P = TU.power, r = p.round;
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(0, 0, 960, 540);
      ui.panel(c, 40, 30, 880, 480, { fill: '#2a1712' });
      ui.text(c, 'BEVERAGE CART', 64, 44, { size: 18, color: '#ffe066' });
      ui.text(c, `TEES: ${TU.save.data.tees}`, 896, 48, { size: 10, align: 'right', color: '#ffe066' });
      ui.text(c, `Up to ${P.MAX_ACTIVE} different boosts at once. The same item doesn't stack.`, 64, 72, { size: 6, color: '#f6d8c8' });
      P.ITEMS.forEach((it, i) => {
        const col = i % 2, row = Math.floor(i / 2), x = 64 + col * 424, y = 92 + row * 64;
        const why = P.canBuy(r, it.id);
        ui.panel(c, x, y, 400, 54, { fill: '#3b221a' });
        c.fillStyle = it.color; c.fillRect(x + 8, y + 9, 36, 36);
        ui.text(c, it.icon, x + 26, y + 21, { size: 10, align: 'center', color: '#1d1712', shadow: false });
        ui.text(c, `${it.name.toUpperCase()}`, x + 54, y + 6, { size: 8 });
        ui.text(c, `${it.price} TEES`, x + 288, y + 6, { size: 6, align: 'right', color: '#ffe066' });
        ui.wrap(c, it.desc, 232, 6).slice(0, 3).forEach((l, k) => ui.text(c, l, x + 54, y + 20 + k * 10, { size: 6, color: '#f6d8c8' }));
        if (ui.button(c, x + 296, y + 12, 96, 30, why === 'Already active' ? 'ACTIVE' : 'BUY', { size: 8, color: why ? '#55606a' : '#2e9e5b', disabled: !!why })) {
          P.buy(r, it.id);
          TU.audio.play('coin');
          p.bevMsg = `${it.name}! ${it.desc}`;
        }
      });
      if (p.bevMsg) ui.text(c, p.bevMsg, 64, 482, { size: 8, color: '#7dff9a' });
      if (ui.button(c, 760, 470, 136, 32, 'DONE', { size: 10, color: '#c0392b' })) {
        p.bevMode = 'done';
        p.bev.state = 'driving';
        p.showBanner('Enjoy!', '', 1);
      }
    },
    // active power-up icons with their remaining holes / shots
    drawHUD(c, p) {
      const act = TU.power.active(p.round);
      act.forEach((b, i) => {
        const it = TU.power.item(b.id), x = 410 + i * 58, y = 20;
        ui.panel(c, x, y, 50, 34, { fill: '#2a1712' });
        c.fillStyle = it.color; c.fillRect(x + 4, y + 4, 22, 26);
        ui.text(c, it.icon, x + 15, y + 12, { size: 6, align: 'center', color: '#1d1712', shadow: false });
        ui.text(c, TU.power.label(b), x + 38, y + 12, { size: 6, align: 'center', color: '#ffe066' });
      });
    },
  };
})();
