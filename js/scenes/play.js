// Hole play in 3D: aim, two-step swing meter, flight with chase camera, roll, putting, penalties, HUD.
(function () {
  const U = TU.util, Ph = TU.physics, ui = TU.ui, input = TU.input, K = TU.keys, R3 = TU.R3, G3 = TU.Golfer3D, C3 = TU.Cart3D;
  const T = THREE;
  const bag = TU.clubs.bag, PUTTER = bag.length - 1, MAX_STROKES = 10;
  const WALK_SPEED = 5.5, RUN_SPEED = 10, GRAVITY = 18;
  // online: what gets swapped in when your own free-roam runs, and the moments every camera watches the shot
  const ROAM_FIELDS = ['state', 'walker', 'cad', 'golfer', 'caddyObj', 'holdRelease', 'nearCart', 'nearCartIdx', 'nearBench', 'nearBall', 'blockMsgT', 'cartDist', 'skidT', 'skidSound', 'tumbleSnd', 'bubT', 'simSelf', 'ride'];
  const SHOT_STATES = ['swing', 'downswing', 'flight', 'roll', 'result', 'puttswing', 'holed'];

  TU.scenes.play = {
    enter(p) {
      this.round = p.round;
      this.online = p.round.mode === 'online' ? p.round.online : null;
      if (this.online) this.listenOnline();
      TU.caddy.payFee(this.round);
      TU.caddy.roundLevel = this.round.caddyLevel;
      this.meter = new TU.SwingMeter();
      this.paused = false;
      this.camPos = new T.Vector3();
      this.camLook = new T.Vector3();
      this.startHole();
    },
    exit() { this.spectating = false; this.removeActors(); TU.caddy.roundLevel = null; TU.audio.ambient(false); TU.audio.engine(0); TU.audio.radio(false); },
    removeActors() {
      if (this.rope) this.rope.visible = false;
      const drop = m => { R3.scene.remove(m.root); m.root.traverse(o => { if (o.geometry) o.geometry.dispose(); }); };
      if (this.actors) { this.actors.forEach(a => { drop(a.golfer); drop(a.caddy); }); this.actors = null; this.golfer = this.caddyObj = null; }
      if (this.carts) { this.carts.forEach(k => drop(k.obj)); this.carts = null; this.cartObj = null; }
      for (const k of ['golfer', 'cartObj', 'caddyObj']) {
        if (!this[k]) continue;
        R3.scene.remove(this[k].root);
        this[k].root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
        this[k] = null;
      }
      TU.bev.remove(this);
      if (this.otherBalls) { this.otherBalls.forEach(m => R3.scene.remove(m)); this.otherBalls = null; }
    },
    // combined beverage cart boosts for the current situation
    mods(shot) { return TU.power.mods(this.round, shot); },
    travelEnabled() { return this.round.mode !== 'multi'; },

    // ---------- setup ----------
    startHole() {
      const r = this.round;
      this.hole = r.course.holes[r.holeIdx];
      this.tex = TU.holeRender.get(this.hole);
      R3.loadHole(this.hole);
      this.removeActors();
      this.mp = null; this.pose = {}; this.roam = null; // last hole's line-up
      if (this.online) {
        // everyone's own golfer and caddy
        this.actors = r.players.map(p => {
          const a = { golfer: G3.build(p.look), caddy: G3.build((TU.caddy.list[p.caddy] || TU.caddy.list[0]).look) };
          R3.scene.add(a.golfer.root, a.caddy.root);
          return a;
        });
        this.golfer = this.actors[0].golfer; this.caddyObj = this.actors[0].caddy;
      } else {
        this.golfer = G3.build(this.player().look);
        R3.scene.add(this.golfer.root);
        this.caddyObj = G3.build(TU.caddy.current().look);
        R3.scene.add(this.caddyObj.root);
      }
      if (this.travelEnabled()) {
        // one cart each (online everyone brings their own, decals and upgrades included), parked side by side
        const datas = this.online ? r.players.map(p => p.cart || TU.save.data.cart) : [TU.save.data.cart];
        this.carts = [];
        datas.forEach((data, k) => {
          const obj = C3.build(data);
          R3.scene.add(obj.root);
          this.carts.push({ data, obj, owner: k, st: null });
          this.useCart(k);
          this.carts[k].st = this.cart = this.parkingSpot();
        });
        this.useCart(0);
      }
      this.ball = { x: this.hole.tee.x, y: this.hole.tee.y, z: 0, vx: 0, vy: 0 };
      this.strokes = 0;
      this.pluggedNext = false;
      if (r.mode === 'multi' || this.online) {
        // honors: best score on the last hole tees off first (setup order on hole 1)
        const order = r.players.map((p, i) => i);
        if (r.holeIdx > 0) order.sort((a, b) => r.players[a].scores[r.holeIdx - 1] - r.players[b].scores[r.holeIdx - 1] || a - b);
        this.mp = r.players.map((p, i) => ({ ball: { x: this.hole.tee.x, y: this.hole.tee.y }, strokes: p.left ? MAX_STROKES : 0, done: !!p.left, cartIdx: i }));
        this.mpOrder = order;
        r.turn = order.find(i => !this.mp[i].done) ?? order[0];
        if (!this.online) {
          this.golfer.root.parent.remove(this.golfer.root);
          this.golfer = G3.build(this.player().look);
          R3.scene.add(this.golfer.root);
        }
        this.otherBalls = r.players.map(p => {
          const m = new T.Mesh(new T.IcosahedronGeometry(0.11, 1), new T.MeshPhongMaterial({ color: new T.Color(p.mapColor), flatShading: true }));
          m.castShadow = true; m.visible = false; R3.scene.add(m); return m;
        });
      }
      if (this.online) {
        // the same wind on every screen
        const rr = U.rng(this.online.seed + r.holeIdx * 7919);
        this.wind = { speed: Math.round(rr() * r.windMax), dir: rr() * Math.PI * 2 };
      } else this.wind = Ph.randomWind(r.windMax);
      TU.FX.reset();
      TU.audio.ambient(true, this.wind.speed);
      this.view = '3d';
      this.feedback = null;
      this.banner = null;
      this.setupShot();
      this.cad = { x: this.caddySpot.x, y: this.caddySpot.y, face: 0, phase: 0, moving: false, vx: 0, vy: 0 };
      TU.bev.setupHole(this);
      this.snapCamera = true;
      const feeNote = r.holeIdx > 0 ? '' : r.feeShort ? `  -  Not enough Tees for ${r.feeShort}: Dusty has the bag` : r.fee ? `  -  ${TU.caddy.current().name}'s fee: ${r.fee} Tees` : '';
      this.showBanner(this.holeTitle(), `Par ${this.hole.par}  -  ${this.hole.yards} yds${feeNote}`, feeNote ? 3.4 : 2.4);
      if (this.online) this.onlineActivate(r.turn, true);
      else if (this.mp) this.gate = true;
    },
    // ---------- online ----------
    // Whoever's turn it is plays normally and streams what's happening; everyone else watches it live.
    listenOnline() {
      const net = TU.net;
      net.on('snap', d => { if (this.spectating && d.h === this.round.holeIdx && d.turn === this.round.turn) this.snapIn = d; });
      net.on('turn', d => {
        if (d.h !== this.round.holeIdx) return;
        this.mp = d.mp;
        const mine = this.roam && this.roam.state === 'drive' ? this.roam.cartIdx : -1;
        d.carts.forEach((cs, k) => { if (this.carts[k] && k !== mine && !(this.pose && Object.values(this.pose).some(p => p.st === 'drive' && p.k === k))) Object.assign(this.carts[k].st, cs); });
        if (d.next < 0) return this.finishRound();
        this.onlineActivate(d.next);
      });
      // the host hears when a guest drops and tells everyone
      net.on('gone', d => {
        const i = this.round.players.findIndex(p => p.peer === d.peer);
        if (i < 0) return;
        net.send('left', { i });
        this.onlineDrop(i);
      });
      net.on('left', d => this.onlineDrop(d.i));
      net.on('roam', d => {
        if (d.h !== this.round.holeIdx || d.i === this.round.turn || d.i === this.online.me) return;
        const P = this.pose || (this.pose = {}), o = P[d.i];
        P[d.i] = { st: d.st, k: d.k, row: d.row || 0, tgt: d, w: o && o.w && d.w ? o.w : d.w && { ...d.w }, cad: o && o.cad && d.cad ? o.cad : d.cad && { ...d.cad } };
        // just got in: start the cart where they are
        if (d.st === 'drive' && d.c && this.carts[d.k] && !(o && o.st === 'drive' && o.k === d.k)) Object.assign(this.carts[d.k].st, d.c);
      });
      net.on('hostgone', () => {
        if (TU.sceneName !== 'play' && TU.sceneName !== 'scorecard') return;
        this.showBanner('THE HOST LEFT', 'The round is over', 3);
        setTimeout(() => { if (TU.sceneName === 'play' || TU.sceneName === 'scorecard') { net.leave(); TU.go('home', { resume: true }); } }, 3000);
      });
      net.on('next', () => { if (TU.sceneName === 'scorecard') { this.round.holeIdx++; TU.go('play', { round: this.round }); } });
    },
    onlineDrop(i) {
      const r = this.round, p = r.players[i];
      if (!p || p.left) return;
      p.left = true;
      if (TU.sceneName !== 'play' || !this.mp) return;
      const o = this.mp[i];
      if (!o.done) { o.done = true; o.strokes = MAX_STROKES; }
      this.showBanner(`${p.name.toUpperCase()} LEFT`, 'They pick up on every hole from here', 2.2);
      // if it was their turn, the host moves the game on
      if (r.turn === i && TU.net.isHost) {
        const nx = this.chooseNext();
        this.sendTurn(nx);
        if (nx < 0) this.finishRound(); else this.onlineActivate(nx);
      }
    },
    sendTurn(next) {
      const carts = this.carts.map(K => JSON.parse(JSON.stringify(K.st)));
      TU.net.send('turn', { h: this.round.holeIdx, next, mp: JSON.parse(JSON.stringify(this.mp)), carts });
    },
    // hand the turn to player `next` on this screen: your own turn plays, anyone else's you watch
    onlineActivate(next, first) {
      const r = this.round, p = this.mp[next], name = r.players[next].name, me = this.online.me;
      r.turn = next;
      if (this.pose) delete this.pose[next];
      if (next === me && this.roam && this.roam.h === r.holeIdx) {
        // your turn: carry on from wherever you wandered to (hopping out if you were in a cart)
        const R = this.roam;
        if (R.state === 'drive' || R.state === 'ride') this.keepSeat = { st: R.state, k: R.cartIdx, ride: R.ride, cad: R.cad };
        let w = R.walker;
        if (R.state === 'drive' || R.state === 'ride' || !w) { const c = this.carts[R.cartIdx].st, l = U.dirVec(c.h - Math.PI / 2); w = { x: c.x + l.x * 1.6, y: c.y + l.y * 1.6 }; }
        p.gpos = { x: w.x, y: w.y }; p.cartIdx = R.cartIdx; if (R.cad) p.cad = { x: R.cad.x, y: R.cad.y, face: R.cad.face };
      }
      if (next === me) this.roam = null;
      this.golfer = this.actors[next].golfer; this.caddyObj = this.actors[next].caddy;
      if (this.carts) this.useCart(p.cartIdx ?? next);
      Object.assign(this.ball, { x: p.ball.x, y: p.ball.y, z: 0, vx: 0, vy: 0 });
      this.strokes = p.strokes;
      this.pluggedNext = !!p.plugged;
      this.nextFrom = p.from || null;
      this.walker = null; this.arrive = null; this.fish = null; this.cut = null; this.snapIn = null; this.arc = null;
      this.spectating = next !== this.online.me;
      this.snapCamera = true;
      const ballSpot = p.gpos || this.teeSpot(next);
      if (this.spectating) {
        this.state = 'wait';
        this.shotStart = { x: p.ball.x, y: p.ball.y };
        this.aim = U.angleTo(p.ball, this.hole.pin);
        this.putting = false; this.bubble = null; this.feedback = null;
        this.cad = { x: (p.cad || ballSpot).x, y: (p.cad || ballSpot).y + (p.cad ? 0 : 2), face: 0, phase: 0, moving: false, vx: 0, vy: 0 };
        G3.placeAt(this.golfer, ballSpot.x, ballSpot.y, this.aim);
        this.startRoam();
        if (!first) this.showBanner(`${name.toUpperCase()}'S TURN`, p.strokes ? `Stroke ${p.strokes + 1}  -  look around while you wait` : 'Teeing off  -  look around while you wait', 1.8);
        return;
      }
      const g = p.gpos || (p.strokes ? ballSpot : null), seat = this.keepSeat;
      this.keepSeat = null;
      this.cad = p.cad ? { x: p.cad.x, y: p.cad.y, face: p.cad.face, phase: 0, moving: false, vx: 0, vy: 0 } : null;
      if (seat && this.carts) {
        // you were in a cart when your turn came: carry on (driving, or riding along) to your ball
        this.shotStart = { x: this.ball.x, y: this.ball.y };
        this.useCart(seat.k);
        this.state = seat.st; this.ride = seat.ride || null; this.walker = null;
        if (!this.cad) this.cad = { x: this.cart.x, y: this.cart.y, face: 0, phase: 0, moving: false, vx: 0, vy: 0 };
        this.blockMsgT = 0; this.feedback = null;
      } else if (g && U.dist(g, this.ball) > 4 && this.travelEnabled()) {
        // walk (or drive) to your ball from wherever you were standing
        this.shotStart = { x: this.ball.x, y: this.ball.y };
        G3.placeAt(this.golfer, g.x, g.y, 0);
        if (!this.cad) this.cad = { x: g.x + 2, y: g.y, face: 0, phase: 0, moving: false, vx: 0, vy: 0 };
        this.beginTravel();
      } else {
        this.setupShot();
        if (!this.cad) this.cad = { x: this.caddySpot.x, y: this.caddySpot.y, face: 0, phase: 0, moving: false, vx: 0, vy: 0 };
        else Object.assign(this.cad, { x: this.caddySpot.x, y: this.caddySpot.y });
      }
      if (!first || r.holeIdx > 0 || next !== 0) { this.showBanner('YOUR TURN', p.strokes ? `Stroke ${p.strokes + 1}` : 'Tee it up', 1.6); TU.audio.play('coin'); }
    },
    // where each player waits on the tee before teeing off (a row behind the tee box)
    teeSpot(i) {
      const t = this.hole.tee, f = U.dirVec(U.angleTo(t, this.hole.pin)), sd = { x: -f.y, y: f.x }, k = (i % 2 ? 1 : -1) * (2.5 + Math.floor(i / 2) * 1.8);
      return { x: t.x - f.x * 5 + sd.x * k, y: t.y - f.y * 5 + sd.y * k };
    },
    // where a waiting player stands: where they last played, stepping aside if someone's playing from right there
    idleSpot(i) {
      const o = this.mp[i], g = o.gpos || this.teeSpot(i), b = this.shotStart || this.ball;
      if (U.dist(g, b) > 3.5) return { g, cad: o.cad && U.dist(o.cad, b) > 3 ? o.cad : null };
      const f = U.dirVec(U.angleTo(b, this.hole.pin)), sd = { x: -f.y, y: f.x }, k = (i % 2 ? 1 : -1) * (3 + Math.floor(i / 2) * 1.6);
      return { g: { x: b.x - f.x * 4.5 + sd.x * k, y: b.y - f.y * 4.5 + sd.y * k }, cad: null };
    },
    // the players waiting their turn (and their caddies) are solid too
    peopleHit(x, y, r) {
      if (!this.actors || !this.mp) return false;
      return this.peopleSpots().some(q => Math.hypot(q.x - x, q.y - y) < 0.35 + r);
    },
    makeSnap() {
      const c = this.cart, w = this.walker, cd = this.cad, J = o => o && JSON.parse(JSON.stringify(o));
      const arc = this.arc && { color: this.arc.color, putt: this.arc.putt, pts: this.arc.pts.filter((q, i, a) => i % 3 === 0 || i === a.length - 1).map(q => [q.x, q.y, q.z]), end: this.arc.end && [this.arc.end.x, this.arc.end.y, this.arc.end.z] };
      return {
        h: this.round.holeIdx, turn: this.round.turn, state: this.state, strokes: this.strokes, lie: this.lie, putting: this.putting, clubIdx: this.clubIdx,
        ball: { x: this.ball.x, y: this.ball.y, z: this.ball.z || 0 }, aim: this.aim, swing: this.swing, shotStart: this.shotStart, view: this.view,
        walker: w && { x: w.x, y: w.y, z: w.z, face: w.face, phase: w.phase, moving: w.moving, stumble: w.stumble, sitting: J(w.sitting) },
        ride: this.ride, cart: c && this.state !== 'ride' && { x: c.x, y: c.y, z: c.z, cy: c.cy, h: c.h, p: c.p, r: c.r, v: c.v, vx: c.vx, vy: c.vy, vz: c.vz, air: c.air, free: c.free, flip: c.flip, sink: c.sink, dive: c.dive, lean: c.lean, wob: c.wob, nitroT: c.nitroT },
        cartIdx: this.cartIdx, cad: cd && { x: cd.x, y: cd.y, face: cd.face, phase: cd.phase, moving: cd.moving, running: cd.running },
        cut: J(this.cut), arrive: J(this.arrive), fish: J(this.fish), flight: this.flight && { dir: this.flight.dir }, cheerT: this.cheerT,
        banner: J(this.banner), bubble: J(this.bubble), feedback: J(this.feedback), arc,
      };
    },
    // watching someone else: follow their stream, smoothing the moving bits between updates
    updateSpectate(dt) {
      const was = this.roamCam();
      this.applySnap(dt);
      // who's on foot where (so you can't walk through the player whose turn it is)
      const st = this.state;
      const inCart = st === 'drive' || st === 'ride' || st === 'arrive' || st === 'fishout';
      this.actPeople = st === 'walk' && this.walker ? [this.walker, this.cad].filter(Boolean) : inCart ? [] : [this.shotStart, this.cad].filter(Boolean);
      if (this.roam) this.updateRoam(dt);
      if (was !== this.roamCam()) this.snapCamera = true; // cut to the shot, and back to you after
      const R = this.roam, mineDriving = this.roamCam() && R.state === 'drive';
      TU.audio.engine(mineDriving ? Math.abs(this.carts[R.cartIdx].st.v || 0) : this.state === 'drive' && this.cart && !this.roamCam() ? Math.abs(this.cart.v || 0) : 0);
    },
    applySnap(dt) {
      const s = this.snapIn;
      if (!s) return;
      const W = a => Math.atan2(Math.sin(a), Math.cos(a)), k = Math.min(1, dt * 14);
      const ease = (o, n, keys, ang) => {
        for (const key of keys) if (n[key] != null) o[key] = o[key] == null ? n[key] : o[key] + (n[key] - o[key]) * k;
        for (const key of ang || []) if (n[key] != null) o[key] = o[key] == null ? n[key] : o[key] + W(n[key] - o[key]) * k;
      };
      const prev = this.state;
      if (s.state !== prev) {
        if (s.state === 'flight' || (s.state === 'roll' && prev === 'downswing')) TU.audio.play(s.putting ? 'putt' : 'hit');
        if (s.state === 'holed') TU.audio.play('rattle');
        if (['aim', 'putt', 'walk', 'holed', 'arrive', 'fishout'].includes(s.state) && !['aim', 'swing', 'putt', 'puttswing'].includes(prev)) this.snapCamera = true;
      }
      if (this.carts && s.cartIdx != null && s.cartIdx !== this.cartIdx) this.useCart(s.cartIdx);
      this.ride = s.ride || null;
      Object.assign(this, { state: s.state, strokes: s.strokes, lie: s.lie, putting: s.putting, clubIdx: s.clubIdx, shotStart: s.shotStart, view: s.view, cut: s.cut, arrive: s.arrive, fish: s.fish, flight: s.flight, cheerT: s.cheerT });
      if (!this.roam || SHOT_STATES.includes(s.state)) Object.assign(this, { banner: s.banner, bubble: s.bubble, feedback: s.feedback });
      else this.bubble = this.feedback = null;
      this.aim = this.aim == null ? s.aim : this.aim + W(s.aim - this.aim) * k;
      this.swing = s.swing;
      if (this.golfer && s.clubIdx != null && bag[s.clubIdx] && this.specClub !== s.clubIdx) { this.specClub = s.clubIdx; this.golfer.setClub(bag[s.clubIdx].type); }
      if (s.state === 'flight' || s.state === 'roll') ease(this.ball, s.ball, ['x', 'y', 'z']); else Object.assign(this.ball, s.ball);
      if (s.walker) { if (!this.walker) this.walker = { ...s.walker }; else { ease(this.walker, s.walker, ['x', 'y', 'z', 'phase'], ['face']); Object.assign(this.walker, { moving: s.walker.moving, stumble: s.walker.stumble, sitting: s.walker.sitting }); } }
      else this.walker = null;
      if (s.cart && this.cart) {
        const jump = Math.hypot(s.cart.x - this.cart.x, s.cart.y - this.cart.y) > 12;
        if (jump) Object.assign(this.cart, s.cart);
        else { ease(this.cart, s.cart, ['x', 'y', 'z', 'cy', 'dive', 'lean', 'wob'], ['h', 'p', 'r']); Object.assign(this.cart, { v: s.cart.v, vx: s.cart.vx, vy: s.cart.vy, vz: s.cart.vz, air: s.cart.air, free: s.cart.free, flip: s.cart.flip, sink: s.cart.sink, nitroT: s.cart.nitroT }); }
        this.cartDist = Math.abs(this.cart.v || 0) * dt;
      }
      if (s.cad) { if (!this.cad) this.cad = { ...s.cad }; else { ease(this.cad, s.cad, ['x', 'y', 'phase'], ['face']); Object.assign(this.cad, { moving: s.cad.moving, running: s.cad.running }); } }
      const V = q => new T.Vector3(q[0], q[1], q[2]);
      this.specArc = s.arc && { color: s.arc.color, putt: s.arc.putt, pts: s.arc.pts.map(V), end: s.arc.end && V(s.arc.end) };
    },
    // everyone not playing right now: standing where they last played (or on the tee), carts where they left them
    placeIdle() {
      const r = this.round, rt = r.turn, me = this.online.me;
      const putPerson = (m, w, mode) => {
        if (w.sitting) {
          const bn = w.sitting, f = U.dirVec(bn.face);
          G3.placeAt(m, bn.x - f.x * 0.12, bn.y - f.y * 0.12, bn.face); m.root.position.y = bn.seat - m.hipY + 0.1; m.pose({ mode: 'sit' }); return;
        }
        G3.placeAt(m, w.x, w.y, w.face || 0);
        if (w.z != null) m.root.position.y = w.z;
        m.pose(w.moving ? { mode: 'walk', walk: (w.phase || 0) * (w.running ? 1.3 : 1) } : { mode: mode || 'stand' });
      };
      const inCart = (m, k, side, row) => {
        const obj = this.carts[k].obj;
        m.pose({ mode: 'sit' }); m.root.quaternion.copy(obj.root.quaternion);
        m.root.position.copy(C3.seatPos(obj, -(m.hipY - 0.1), side, row || 0));
      };
      this.actors.forEach((a, i) => {
        if (i === rt) return;
        const o = this.mp[i];
        const src = i === me && this.roam ? { st: this.roam.state, w: this.roam.walker, k: this.roam.cartIdx, row: this.roam.ride ? this.roam.ride.row : 0, cad: this.roam.cad } : this.pose && this.pose[i];
        const show = !r.players[i].left && (!!src || !o.done);
        a.golfer.root.visible = a.caddy.root.visible = show;
        if (!show) return;
        if (src) {
          if (src.st === 'drive' || src.st === 'ride') { const row = src.st === 'ride' ? src.row : 0; inCart(a.golfer, src.k, 1, row); inCart(a.caddy, src.k, -1, row); }
          else {
            if (src.w) putPerson(a.golfer, src.w);
            if (src.cad) putPerson(a.caddy, src.cad);
          }
          if (i === me && this.roamCam() && src.w && src.st !== 'drive') R3.clearTrees(src.w.x, src.w.y, 0, U.dirVec(src.w.face || 0), 5);
          return;
        }
        const spot = this.idleSpot(i), g = spot.g, face = U.angleTo(g, this.hole.pin);
        G3.placeAt(a.golfer, g.x, g.y, face); a.golfer.pose({ mode: 'stand' });
        const cd = spot.cad || { x: g.x - U.dirVec(face).x * 1.5 + 1.5, y: g.y - U.dirVec(face).y * 1.5 };
        G3.placeAt(a.caddy, cd.x, cd.y, U.angleTo(cd, g)); a.caddy.pose({ mode: 'stand' });
      });
      const act = this.actors[rt];
      if (act) act.golfer.root.visible = act.caddy.root.visible = true;
    },
    // ---------- online: free roam while someone else plays ----------
    // Your own walk/drive runs on the same code as a normal turn: your bits are swapped in, updated, swapped back.
    withRoam(fn) {
      const R = this.roam, save = {};
      for (const f of ROAM_FIELDS) { save[f] = this[f]; this[f] = R[f]; }
      const ci = this.cartIdx;
      this.useCart(R.cartIdx);
      this.roaming = true;
      try { fn(); } finally {
        for (const f of ROAM_FIELDS) { R[f] = this[f]; this[f] = save[f]; }
        R.cartIdx = this.cartIdx;
        this.useCart(ci);
        this.roaming = false;
      }
    },
    // the shot itself: every screen watches the ball
    shotTime() { return this.spectating && SHOT_STATES.includes(this.state); },
    roamCam() { return !!(this.spectating && this.roam && !this.shotTime()); },
    startRoam() {
      const r = this.round, me = this.online.me, o = this.mp[me];
      if (this.roam && this.roam.h === r.holeIdx) return;
      const g = this.idleSpot(me).g, face = U.angleTo(g, this.hole.pin), a = this.actors[me];
      this.roam = {
        h: r.holeIdx, state: 'walk', walker: this.makeWalker(g.x, g.y, face), cartIdx: o.cartIdx ?? me, simSelf: me,
        cad: { x: g.x - U.dirVec(face).x * 1.5 + 1.5, y: g.y - U.dirVec(face).y * 1.5, face, phase: 0, moving: false, vx: 0, vy: 0 },
        golfer: a.golfer, caddyObj: a.caddy, holdRelease: true, blockMsgT: 0,
      };
    },
    updateRoam(dt) {
      // while the ball's in the air your keys rest (the camera's on the shot)
      const frozen = this.shotTime(), kd = K.down, kp = K.pressed, clk = input.clicked;
      this.actInfo = { st: this.state, k: this.cartIdx, row: this.ride ? this.ride.row : 0 }; // the shooter, as seen from your roam
      if (frozen) { K.down = () => false; K.pressed = () => false; input.clicked = false; }
      try {
        this.withRoam(() => {
          this.updateCaddy(dt);
          if (this.state === 'walk') this.updateWalk(dt);
          else if (this.state === 'ride') this.updateRide(dt);
          else if (this.state === 'drive') {
            const pr = input.pressed;
            for (let n = Math.ceil(dt / (1 / 120)), k = 0; k < n && this.state === 'drive'; k++) { if (k) input.pressed = {}; this.updateDrive(dt / n); }
            input.pressed = pr;
          }
          if (this.state === 'walk' || this.state === 'drive') this.surfaceFX(dt);
          // nobody's at the wheel while the camera's on the shot: let the cart roll to a gentle stop
          if (frozen && this.state === 'drive' && !this.cart.air) this.cart.v *= Math.pow(0.15, dt);
        });
      } finally { K.down = kd; K.pressed = kp; input.clicked = clk; }
      // let everyone see where you've got to
      this.roamT = (this.roamT || 0) - dt;
      if (this.roamT <= 0) {
        this.roamT = 0.1;
        const R = this.roam, w = R.walker, c = this.carts[R.cartIdx].st, cd = R.cad;
        TU.net.send('roam', {
          h: this.round.holeIdx, i: this.online.me, st: R.state, k: R.cartIdx, row: R.ride ? R.ride.row : 0,
          w: w && { x: w.x, y: w.y, z: w.z, face: w.face, phase: w.phase, moving: w.moving, sitting: w.sitting ? { x: w.sitting.x, y: w.sitting.y, face: w.sitting.face, seat: w.sitting.seat } : null },
          c: R.state === 'drive' ? { x: c.x, y: c.y, z: c.z, cy: c.cy, h: c.h, p: c.p, r: c.r, v: c.v, vx: c.vx, vy: c.vy, vz: c.vz, air: c.air, free: c.free, flip: c.flip, sink: c.sink, dive: c.dive, lean: c.lean, wob: c.wob, nitroT: c.nitroT } : null,
          cad: cd && { x: cd.x, y: cd.y, face: cd.face, phase: cd.phase, moving: cd.moving, running: cd.running },
        });
      }
    },
    // a roaming cart that sinks: the caddy just hauls it out (no cutscene, the shot's the show)
    roamRescue() {
      const c = this.cart, sp = c.trail[0] || { x: this.walker ? this.walker.x : c.x, y: this.walker ? this.walker.y : c.y, h: c.h };
      Object.assign(c, this.cartAt(sp.x, sp.y, sp.h ?? c.h));
      const l = U.dirVec(c.h - Math.PI / 2);
      this.walker = this.makeWalker(c.x + l.x * 1.6, c.y + l.y * 1.6, c.h);
      if (this.cad) Object.assign(this.cad, { x: c.x - l.x * 1.6, y: c.y - l.y * 1.6, moving: false });
      this.state = 'walk'; this.holdRelease = true;
      this.showBanner('Fished out!', 'Your caddy hauled the cart back to dry land', 1.6);
    },
    // someone else's roaming, smoothed between their updates
    easePoses(dt) {
      const k = Math.min(1, dt * 10), W = a => Math.atan2(Math.sin(a), Math.cos(a));
      const ease = (o, t, keys, ang) => { for (const q of keys) if (t[q] != null) o[q] = o[q] == null ? t[q] : o[q] + (t[q] - o[q]) * k; for (const q of ang || []) if (t[q] != null) o[q] = o[q] == null ? t[q] : o[q] + W(t[q] - o[q]) * k; };
      for (const p of Object.values(this.pose || {})) {
        const t = p && p.tgt;
        if (!t) continue;
        if (p.w && t.w) { ease(p.w, t.w, ['x', 'y', 'z'], ['face']); Object.assign(p.w, { phase: t.w.phase, moving: t.w.moving, sitting: t.w.sitting }); }
        if (p.cad && t.cad) { ease(p.cad, t.cad, ['x', 'y'], ['face']); Object.assign(p.cad, { phase: t.cad.phase, moving: t.cad.moving, running: t.cad.running }); }
        if (p.st === 'drive' && t.c && this.carts[p.k]) {
          const c = this.carts[p.k].st;
          ease(c, t.c, ['x', 'y', 'z', 'cy', 'dive', 'lean', 'wob'], ['h', 'p', 'r']);
          Object.assign(c, { v: t.c.v, vx: t.c.vx, vy: t.c.vy, vz: t.c.vz, air: t.c.air, free: t.c.free, flip: t.c.flip, sink: t.c.sink, nitroT: t.c.nitroT });
        }
      }
    },
    // what player i is up to: { st: 'drive' | 'ride' | ..., k: cart, row } (whoever's being simulated right now first)
    seatOf(i) {
      const r = this.round, self = this.simSelf ?? r.turn;
      if (i === self) return { st: this.state, k: this.cartIdx, row: this.ride ? this.ride.row : 0 };
      if (i === r.turn) return this.actInfo || null;
      if (this.online && i === this.online.me && this.roam) return { st: this.roam.state, k: this.roam.cartIdx, row: this.roam.ride ? this.roam.ride.row : 0 };
      const p = this.pose && this.pose[i];
      return p ? { st: p.st, k: p.k, row: p.row || 0 } : null;
    },
    // everyone sitting in cart k: the driver is row 0, passengers (each with their caddy) fill the rows behind
    cartRiders(k) {
      if (!this.online) return [];
      const out = [];
      this.round.players.forEach((pl, i) => {
        if (pl.left) return;
        const q = this.seatOf(i);
        if (!q || q.k !== k) return;
        if (q.st === 'drive') out.push({ i, row: 0 }); else if (q.st === 'ride') out.push({ i, row: q.row });
      });
      return out;
    },
    // the first free row (0 = the wheel), or -1 when it's full: a row seats one player and their caddy
    seatFree(k) {
      const rows = this.carts[k].obj.rows || 1, used = new Set(this.cartRiders(k).map(q => q.row));
      for (let r = 0; r < rows; r++) if (!used.has(r)) return r;
      return -1;
    },
    // the cart's own bag, plus one for everyone else riding in it
    bagColors(k) {
      const K0 = this.carts[k], cols = [K0.data.bag || '#b8372e'];
      this.cartRiders(k).sort((a, b) => a.row - b.row).forEach(q => { if (q.i !== K0.owner) cols.push((this.round.players[q.i].cart || {}).bag || '#b8372e'); });
      return cols.slice(0, 3);
    },
    // riding along in someone else's cart
    updateRide(dt) {
      const rd = this.ride, c = this.cart, self = this.simSelf ?? this.round.turn;
      if (!rd) { this.state = 'walk'; return; }
      const hasDriver = this.cartRiders(rd.k).some(q => q.row === 0 && q.i !== self);
      // nobody at the wheel: slide over and drive it yourself
      if (!hasDriver && K.pressed('forward')) { this.ride = null; this.state = 'drive'; this.holdRelease = false; this.showBanner('You take the wheel', '', 1.2); TU.audio.play('click'); return; }
      if (!K.pressed('cart')) return;
      if (Math.abs(c.v || 0) > 2 || c.air) { if (this.blockMsgT <= 0) { this.showBanner('Wait till it stops', '', 1); this.blockMsgT = 1.2; } return; }
      // hop out beside your row, on whichever side is clear (nearer your ball)
      const d = U.dirVec(c.h), l = U.dirVec(c.h - Math.PI / 2), back = 0.2 + rd.row * 1.1;
      const sides = [1, -1].map(k => ({ x: c.x - d.x * back + l.x * 1.5 * k, y: c.y - d.y * back + l.y * 1.5 * k, k }))
        .filter(q => !this.walkBlocked(q.x, q.y)).sort((a, b) => U.dist(a, this.ball) - U.dist(b, this.ball));
      const ex = sides[0] || { x: c.x - d.x * back + l.x * 1.5, y: c.y - d.y * back + l.y * 1.5, k: 1 };
      this.walker = this.makeWalker(ex.x, ex.y, U.angleTo(ex, this.ball));
      if (this.cad) Object.assign(this.cad, { x: c.x - d.x * back - l.x * 1.5 * ex.k, y: c.y - d.y * back - l.y * 1.5 * ex.k, moving: false });
      this.ride = null; this.state = 'walk'; this.holdRelease = true;
      TU.audio.play('click');
    },
    // everyone on foot except whoever is moving right now (in a cart they're covered by the cart itself)
    peopleSpots() {
      const out = [], r = this.round, self = this.simSelf ?? r.turn, me = this.online.me;
      r.players.forEach((pl, i) => {
        if (i === self || pl.left) return;
        if (i === r.turn) { out.push(...(this.actPeople || [])); return; }
        if (i === me && this.roam) { const R = this.roam; if (R.state !== 'drive' && R.state !== 'ride') { out.push(R.walker); if (R.cad) out.push(R.cad); } return; }
        const p = this.pose && this.pose[i];
        if (p) { if (p.st !== 'drive' && p.st !== 'ride') { if (p.w) out.push(p.w); if (p.cad) out.push(p.cad); } return; }
        if (this.mp[i].done) return;
        const sp = this.idleSpot(i); out.push(sp.g); if (sp.cad) out.push(sp.cad);
      });
      return out;
    },
    // ---------- hot-seat multiplayer ----------
    // after a shot: save this player's ball, then the next to play is anyone yet to tee off (in honor order),
    // otherwise whoever is farthest from the hole
    nextTurn() {
      const r = this.round, me = this.mp[r.turn];
      me.ball = { x: this.ball.x, y: this.ball.y };
      me.from = this.shotStart;
      me.strokes = this.strokes;
      me.plugged = this.pluggedNext;
      if (this.online) {
        // where you're standing, which cart you took and where your caddy is wait for your next turn
        me.gpos = { x: this.shotStart.x, y: this.shotStart.y };
        me.cartIdx = this.cartIdx;
        if (this.cad) me.cad = { x: this.cad.x, y: this.cad.y, face: this.cad.face || 0 };
        const nx = this.chooseNext();
        this.sendTurn(nx);
        return nx < 0 ? this.finishRound() : this.onlineActivate(nx);
      }
      const next = this.chooseNext();
      if (next < 0) return this.finishRound();
      const changed = next !== r.turn;
      r.turn = next;
      const p = this.mp[next];
      Object.assign(this.ball, { x: p.ball.x, y: p.ball.y, z: 0, vx: 0, vy: 0 });
      this.strokes = p.strokes;
      this.pluggedNext = p.plugged;
      this.nextFrom = p.from || null;
      if (changed) {
        this.golfer.root.parent.remove(this.golfer.root);
        this.golfer = G3.build(this.player().look);
        R3.scene.add(this.golfer.root);
      }
      this.setupShot();
      Object.assign(this.cad, { x: this.caddySpot.x, y: this.caddySpot.y, moving: false, vx: 0, vy: 0 });
      this.gate = changed;
    },
    // anyone yet to tee off (in honor order), otherwise whoever is farthest from the hole; -1 when everyone's done
    chooseNext() {
      const left = this.mpOrder.filter(i => !this.mp[i].done);
      if (!left.length) return -1;
      const fresh = left.filter(i => this.mp[i].strokes === 0);
      return fresh.length ? fresh[0] : left.reduce((a, b) => U.dist(this.mp[b].ball, this.hole.pin) > U.dist(this.mp[a].ball, this.hole.pin) ? b : a);
    },
    finishRound() {
      const r = this.round;
      r.players.forEach((p, i) => { p.scores[r.holeIdx] = this.mp[i].strokes; });
      TU.go('scorecard', { round: r });
    },
    setupShot() {
      const b = this.ball;
      // where this player's last shot was hit from (for the putt's starting line)
      const lastFrom = this.nextFrom !== undefined ? this.nextFrom : this.shotStart;
      this.nextFrom = undefined;
      this.lie = Ph.tileAt(this.hole, b.x, b.y);
      this.plugged = this.lie === 'S' && this.pluggedNext;
      this.pluggedNext = false;
      this.surfPrev = null;
      this.shotStart = { x: b.x, y: b.y };
      this.swing = 0;
      this.cheerT = 0;
      this.banner = null;
      this.putting = this.lie === 'G';
      this.snapCamera = true;
      this.read = null;
      if (this.putting) {
        this.state = 'putt';
        this.clubIdx = PUTTER;
        // no auto-aim on the green: you start facing the way the ball came in, and line it up yourself
        this.aim = lastFrom && U.dist(lastFrom, b) > 1 ? U.angleTo(lastFrom, b) : (this.aim ?? U.angleTo(b, this.hole.pin) + 0.5);
        this.pread = TU.caddy.readPutt(this);
        this.puttScale = Ph.puttScale(this.pread.dist);
        this.say(this.pread.text, 3, true);
      } else {
        this.state = 'aim';
        // the caddy reads the shot (yardage, wind, club, aim); a rookie gets it wrong
        this.read = TU.caddy.read(this);
        this.clubIdx = this.read.club;
        this.aim = this.smartAim() + this.read.aimErr;
        this.say(this.read.text, 3, true);
        if (this.plugged) this.showBanner('PLUGGED LIE!', 'Buried in the sand: less distance, tiny sweet spot', 2.4);
        else if (this.lie === 'S') this.showBanner('IN THE BUNKER', 'Smaller sweet spot - a wedge is safest', 1.8);
      }
      this.resetMeter();
      this.golfer.setClub(bag[this.clubIdx].type);
      // caddy picks a spot off to the left of the starting line, clear of trees and props
      const d0 = U.dirVec(this.aim), r0 = { x: -d0.y, y: d0.x };
      this.caddySpot = { x: b.x + d0.x * 1.2 - r0.x * 4.2, y: b.y + d0.y * 1.2 - r0.y * 4.2 };
      for (const side of [1, -1]) {
        const sx = b.x + d0.x * 1.2 - r0.x * 4.2 * side, sy = b.y + d0.y * 1.2 - r0.y * 4.2 * side;
        if (!Ph.treeAt(this.hole, sx, sy, 0.4) && !R3.obstacleAt(sx, sy, 0.4) && Ph.tileAt(this.hole, sx, sy) !== 'W') { this.caddySpot = { x: sx, y: sy }; break; }
      }
    },
    // speech bubble from the caddy
    // sticky bubbles (the caddy's read) stay up through aiming, the swing and the flight
    say(text, t = 3.5, sticky = false) { this.bubble = { text, t, sticky }; },
    // distance the player is told: the caddy's read for full shots
    toldDist() { return this.read ? this.read.dist : U.dist(this.ball, this.hole.pin); },
    resetMeter() {
      const d = this.putting ? this.pread.dist : this.toldDist();
      const mo = this.mods({ tee: this.lie === 'E', dist: d });
      if (this.putting) this.meter.reset('putt', { target: d / this.puttScale, targetLabel: 'HOLE', speed: mo.putt });
      else {
        const full = this.expCarry();
        const sand = this.lie === 'S';
        this.meter.reset('full', { target: d < full ? d / full : null, targetLabel: 'PIN', speed: mo.meter * (sand ? 1.3 : 1), pause: mo.pause, tight: sand ? (this.plugged ? 0.35 : 0.5) : 0 });
      }
    },
    validClub(i) {
      const c = bag[i];
      return !c.putter && !(c.teeOnly && this.lie !== 'E');
    },
    autoClub() {
      const d = U.dist(this.ball, this.hole.pin), set = TU.clubs.currentSet();
      let best = -1;
      for (let i = 0; i < PUTTER; i++) {
        if (this.validClub(i) && Ph.expectedCarry(bag[i], set, this.lie) >= d * 0.95) best = i;
      }
      if (best < 0) for (let i = 0; i < PUTTER; i++) if (this.validClub(i)) return i;
      return best;
    },
    // Default aim: toward the pin, bent toward safe landing ground on doglegs/hazards.
    smartAim() {
      const b = this.ball, pin = this.hole.pin, base = U.angleTo(b, pin);
      const carry = Math.min(this.expCarry(), U.dist(b, pin));
      const val = { F: 3, G: 3, E: 3, P: 2, R: 1, S: -1, T: -3, W: -6, O: -6 };
      let best = base, bestV = -1e9;
      for (let k = -20; k <= 20; k++) {
        const a = base + k * 0.035, d = U.dirVec(a);
        const lx = b.x + d.x * carry, ly = b.y + d.y * carry;
        let v = 0;
        for (const [ox, oy] of [[0, 0], [7, 0], [-7, 0], [0, 7], [0, -7]]) v += val[Ph.tileAt(this.hole, lx + ox, ly + oy)];
        v -= U.dist({ x: lx, y: ly }, pin) / 40 + Math.abs(k) * 0.05;
        if (v > bestV) { bestV = v; best = a; }
      }
      return best;
    },
    cycleClub(d) {
      let i = this.clubIdx;
      for (let k = 0; k < PUTTER; k++) {
        i = (i + d + PUTTER) % PUTTER;
        if (this.validClub(i)) {
          this.clubIdx = i;
          this.golfer.setClub(bag[i].type);
          this.resetMeter();
          TU.audio.play('click');
          return;
        }
      }
    },
    expCarry() { return Ph.expectedCarry(bag[this.clubIdx], TU.clubs.currentSet(), this.lie) * Ph.TRAJ[this.flightH()].carry; },
    // ball flight height: only irons and wedges can be flighted low or high
    // peak height of the planned shot in yards (club loft x flight choice)
    peakHeight() { const cl = bag[this.clubIdx]; return cl.putter ? 0 : this.expCarry() * cl.loft * Ph.TRAJ[this.flightH()].apex; },
    canTraj() { const c = bag[this.clubIdx]; return !this.putting && c && c.type === 'iron'; },
    flightH() { return this.canTraj() ? (this.traj || 'mid') : 'mid'; },
    setTraj(t) { if (!this.canTraj() || this.traj === t) return; this.traj = t; this.resetMeter(); TU.audio.play('click'); },
    // carry as the caddy sees it: a caddy who misjudges the yardage misplaces the landing ring too
    shownCarry() {
      const c = this.expCarry();
      if (!this.read || this.read.exact) return c;
      return c * this.read.dist / Math.max(1, U.dist(this.ball, this.hole.pin));
    },
    showBanner(title, sub, t = 2, big = false) { this.banner = { title, sub, t, t0: t, big }; },
    // Start the cart on the nearest cart path near the tee, facing the green.
    parkingSpot() {
      const tee = this.hole.tee, h = U.angleTo(tee, this.hole.pin);
      let best = null, bd = 1e9;
      for (let y = tee.y - 30; y <= tee.y + 30; y += 2) for (let x = tee.x - 30; x <= tee.x + 30; x += 2) {
        const d = Math.hypot(x - tee.x, y - tee.y);
        // a clear spot on the path: never on top of the bench, sign, rocks or trees
        if (d > 6 && d < bd && Ph.tileAt(this.hole, x, y) === 'P' && !this.cartBlocked(x, y, h)) { bd = d; best = { x, y }; }
      }
      if (!best) {
        for (let k = 0; k < 24 && !best; k++) {
          const a = h + Math.PI / 2 + k * 0.5, dd = 7 + Math.floor(k / 12) * 4, q = { x: tee.x + Math.sin(a) * dd, y: tee.y - Math.cos(a) * dd };
          if (!this.cartBlocked(q.x, q.y, h)) best = q;
        }
        if (!best) { const r = U.dirVec(h + Math.PI / 2); best = { x: tee.x + r.x * 7, y: tee.y + r.y * 7 }; }
      }
      return this.cartAt(best.x, best.y, h);
    },
    player() { return this.round.players[this.round.turn]; },
    // "HOLE 3: Big Air", or just "HOLE 3" when the hole's name is only its number
    holeTitle() {
      const n = this.round.holeIdx + 1, name = this.hole.name || '';
      return /^hole\s*\d+$/i.test(name.trim()) ? `HOLE ${n}` : `HOLE ${n}: ${name}`;
    },

    // ---------- update ----------
    update(dt) {
      if (K.pressed('pause') || (this.paused && input.isPressed('Escape'))) { this.paused = !this.paused; ui.nav = this.paused; ui.focus = 0; }
      if (this.paused) return;
      if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
      if (this.feedback) { this.feedback.t -= dt; if (this.feedback.t <= 0) this.feedback = null; }
      if (this.bubble) {
        const during = ['aim', 'swing', 'downswing', 'flight', 'putt', 'puttswing'].includes(this.state);
        if (!(this.bubble.sticky && during)) { this.bubble.t -= dt; if (this.bubble.t <= 0) this.bubble = null; }
      }
      if (this.online) this.easePoses(dt);
      if (this.spectating) return this.updateSpectate(dt);
      const act = (input.clicked && !ui.overButton()) || K.pressed('swing');
      const m = this.meter;
      if (this.gate) {
        // hand the device over: nothing moves until the next player is ready
        if (act || input.isPressed('Enter')) { this.gate = false; this.snapCamera = true; TU.audio.play('click'); }
        return;
      }

      this.updateCaddy(dt);
      TU.bev.update(this, dt);
      TU.audio.engine(this.state === 'drive' && this.cart ? (this.cart.air && this.cartSpec().fly ? 14 : this.cart.v) : 0);
      // cart speakers: music while you drive (R toggles)
      const radio = this.cartObj && this.cartSpec().radio;
      if (radio && K.pressed('radio') && (this.state === 'drive' || this.state === 'walk')) this.nextStation();
      const station = TU.save.data.cart.station ?? 1;
      TU.audio.radio(!!radio && station > 0 && (this.state === 'drive' || this.state === 'arrive'), radio, station);
      if (this.cheerT) this.cheerT += dt;
      // the nitro bottle refills slowly whenever it isn't firing
      if (this.nitroCharge == null) this.nitroCharge = 1;
      if (!(this.cart && this.cart.nitroT > 0)) this.nitroCharge = Math.min(1, this.nitroCharge + dt / 14);
      if (this.state === 'walk' || this.state === 'drive') this.surfaceFX(dt);
      if (this.cut) this.cut.t += dt;
      const bevModal = TU.bev.modal(this);
      // online: stream what you're doing to everyone watching
      if (this.online) { this.snapT = (this.snapT || 0) - dt; if (this.snapT <= 0) { this.snapT = 0.05; TU.net.send('snap', this.makeSnap()); } }
      switch (this.state) {
        case 'aim': this.updateAim(dt, act); break;
        case 'swing':
          m.update(dt);
          if (act) m.click();
          this.swing = -(m.state === 'power' ? m.pos : m.power);
          if (m.state === 'done') this.launch();
          break;
        case 'downswing':
          this.swingT += dt;
          this.swing = U.lerp(this.swingFrom, 1, Math.min(1, this.swingT / 0.35));
          if (this.swingT >= 0.14 && !this.launched) {
            this.launched = true;
            const ty = bag[this.clubIdx].type;
            TU.audio.play(this.putting ? 'putt' : ty === 'wood' ? 'drive' : bag[this.clubIdx].wedge ? 'chip' : 'hit');
            if (!this.putting) {
              TU.FX.trailClear();
              const tile = this.lie, d = U.dirVec(this.aim);
              TU.FX.burst(this.ball.x, this.ball.y, Ph.groundAt(this.hole, this.ball.x, this.ball.y), { n: tile === 'S' ? 30 : tile === 'E' ? 6 : 14, color: TU.FX.TILE[tile] || 0x6fcf55, spread: tile === 'S' ? 2.5 : 1.4, up: tile === 'S' ? 4 : 3, dx: d.x * 2, dy: d.y * 2 });
            }
            if (this.putting) this.state = 'roll';
            else this.state = 'flight';
          }
          break;
        case 'flight':
          this.swing = Math.min(1, this.swing + dt * 3);
          this.updateFlight(dt);
          break;
        case 'roll':
          this.swing = Math.min(this.putting ? 0.6 : 1, this.swing + dt * 3);
          this.updateRoll(dt);
          break;
        case 'result':
          this.resultT -= dt;
          if (this.resultT <= 0 || (act && this.resultT < 1.6)) this.afterResult();
          break;
        case 'putt': this.updatePuttAim(dt, act); break;
        case 'puttswing':
          m.update(dt);
          if (act) m.click();
          this.swing = -(m.state === 'power' ? m.pos : m.power) * 0.8;
          if (m.state === 'done') this.launchPutt();
          break;
        case 'walk': if (!bevModal) this.updateWalk(dt); break;
        case 'ride': this.updateRide(dt); break;
        case 'drive':
          if (bevModal) break;
          // small fixed steps keep the springs and tumbles stable at any frame rate
          { const pr = input.pressed;
            for (let n = Math.ceil(dt / (1 / 120)), k = 0; k < n && this.state === 'drive'; k++) { if (k) input.pressed = {}; this.updateDrive(dt / n); }
            input.pressed = pr; }
          break;
        case 'holed':
          this.resultT -= dt;
          if (this.resultT <= 0 || (act && this.cut && this.cut.t > 0.8)) this.finishHole();
          break;
        case 'arrive': this.updateArrive(dt, act); break;
        case 'fishout': this.updateFishout(dt, act); break;
      }
    },
    updateAim(dt, act) {
      const rot = (K.down('fineAim') ? 0.1 : 0.6) * dt;
      if (K.down('aimLeft')) this.aim -= rot;
      if (K.down('aimRight')) this.aim += rot;
      if (K.pressed('clubPrev') || input.wheel < 0) this.cycleClub(-1);
      if (K.pressed('clubNext') || input.wheel > 0) this.cycleClub(1);
      if (K.pressed('traj') && this.canTraj()) this.setTraj({ low: 'mid', mid: 'high', high: 'low' }[this.flightH()]);
      if (K.pressed('view')) this.view = this.view === '3d' ? 'top' : '3d';
      if (act) { this.meter.start(); this.state = 'swing'; this.view = '3d'; }
    },
    updatePuttAim(dt, act) {
      const rot = (K.down('fineAim') ? 0.06 : 0.4) * dt;
      if (K.down('aimLeft')) this.aim -= rot;
      if (K.down('aimRight')) this.aim += rot;
      if (K.pressed('view')) this.view = this.view === '3d' ? 'top' : '3d';
      if (act) { this.meter.start(); this.state = 'puttswing'; }
    },
    launch() {
      const club = bag[this.clubIdx], set = TU.clubs.currentSet();
      const tee = this.lie === 'E';
      const mods = { ...this.mods({ tee, dist: this.toldDist() }) };
      if (this.plugged) mods.power = (mods.power || 1) * 0.65; // buried in the sand
      this.flight = Ph.planShot({ hole: this.hole, from: this.ball, aim: this.aim, club, set, power: this.meter.power, accErr: this.meter.acc, lie: this.lie, wind: this.wind, mods, traj: this.flightH() });
      this.plugged = false;
      TU.power.shotTaken(this.round, tee);
      this.flight.checked = {};
      this.strokes++;
      this.state = 'downswing';
      this.swingT = 0;
      this.swingFrom = this.swing;
      this.launched = false;
      TU.audio.play('swing');
      this.feedback = { text: this.flight.fat ? 'CHUNKED IT!' : this.meter.quality, t: 1.8 };
      if (this.meter.quality && this.meter.quality.startsWith('PERFECT')) TU.audio.play('perfect');
    },
    launchPutt() {
      const v = Ph.puttVelocity(this.aim, this.meter.power * this.puttScale);
      this.ball.vx = v.vx; this.ball.vy = v.vy;
      this.strokes++;
      this.state = 'downswing';
      this.swingT = 0;
      this.swingFrom = this.swing;
      this.launched = false;
    },
    updateFlight(dt) {
      const f = this.flight;
      f.t += dt * 1.25;
      // the arc keeps falling past its planned end if the ground is lower (downhill shots carry further)
      const u = Math.min(2, f.t / f.T), p = Ph.flightPos(f, u);
      const ground = Ph.groundAt(this.hole, p.x, p.y), above = f.h0 + p.z - ground;
      p.z = Math.max(0, above);
      if (above < 9 && Math.hypot(p.x - f.from.x, p.y - f.from.y) > 10) {
        const key = Math.floor(p.x / 4) + ',' + Math.floor(p.y / 4);
        if (!f.checked[key]) {
          f.checked[key] = 1;
          if (Ph.hasTree(this.hole, p.x, p.y) && Math.random() < 0.3) return this.treeHit(p);
        }
      }
      Object.assign(this.ball, p);
      if ((u > 0.25 && above <= 0) || u >= 2) { f.uLand = u; this.land(p); }
    },
    treeHit(p) {
      TU.audio.play('tree');
      TU.FX.burst(p.x, p.y, Ph.groundAt(this.hole, p.x, p.y) + 4, { n: 24, colors: [0x3f8f35, 0x5aa83f, 0x2e6b28], spread: 2, up: 1, gravity: 3, drag: 2, life: 1.6 });
      TU.FX.trailFade();
      const f = this.flight;
      Object.assign(this.ball, { x: p.x, y: p.y, z: 0, vx: -f.dir.x * 3 + (Math.random() - 0.5) * 5, vy: -f.dir.y * 3 + (Math.random() - 0.5) * 5 });
      this.showBanner('TIMBER!', 'Your ball clipped a tree', 1.4);
      this.state = 'roll';
    },
    land(p) {
      const tile = Ph.tileAt(this.hole, p.x, p.y);
      this.ball.z = 0;
      TU.FX.trailFade();
      const gh = Ph.groundAt(this.hole, p.x, p.y);
      if (tile === 'W') TU.FX.burst(p.x, p.y, gh, { n: 40, colors: [0xffffff, 0xbfe6ff, 0x7fc8f0], spread: 1.6, up: 6, life: 1 });
      if (tile === 'W' || tile === 'O') return this.penalty(tile === 'W' ? 'water' : 'oob', p);
      TU.FX.burst(p.x, p.y, gh, { n: tile === 'S' ? 26 : 8, color: TU.FX.TILE[tile] || 0x6fcf55, spread: tile === 'S' ? 1.8 : 1, up: tile === 'S' ? 3.5 : 1.8 });
      // dropping in steeply can bury the ball: a fried egg lie
      if (tile === 'S' && this.flight.apex > 10 && Math.random() < 0.4) this.pluggedNext = true;
      if (tile === 'S') TU.audio.play('sand'); else if (tile === 'R' || tile === 'T') TU.audio.play('thud');
      const v = Ph.landingVelocity(this.flight, tile, TU.clubs.currentSet(), this.flight.uLand || 1);
      this.ball.vx = v.vx; this.ball.vy = v.vy;
      TU.audio.play('land');
      this.state = 'roll';
    },
    updateRoll(dt) {
      for (let i = 0; i < 4; i++) {
        const r = Ph.rollStep(this.ball, this.hole, dt / 4);
        if (!r) continue;
        if (r === 'water' || r === 'oob') return this.penalty(r, { x: this.ball.x, y: this.ball.y });
        if (r === 'holed') return this.holed();
        if (r === 'stopped') return this.stopped();
      }
    },
    stopped() {
      const b = this.ball, tile = Ph.tileAt(this.hole, b.x, b.y);
      if (this.travelEnabled() && Ph.deepForest(this.hole, b.x, b.y)) return this.penalty('lost', { x: b.x, y: b.y });
      const toPin = U.dist(b, this.hole.pin);
      if (tile === 'G' && toPin < Ph.TAP_IN) {
        this.strokes++;
        return this.holed('Tapped in');
      }
      if (this.putting) {
        const ft = toPin * 3;
        this.showBanner(tile !== 'G' ? 'Off the green' : ft < 6 ? 'So close!' : ft < 15 ? 'Not far now' : 'Still a long way', '', 1.1);
        this.resultT = 1.0;
      } else {
        const carry = U.dist(this.shotStart, b);
        const pinTxt = tile === 'G' ? (toPin * 3 < 12 ? 'Close to the pin!' : 'On the green') : '';
        this.showBanner(`${Ph.TERRAIN[tile].name}  -  ${Math.round(carry)} yds`, pinTxt, 2);
        const cd = TU.caddy.current(), good = tile === 'G' || (tile === 'F' && carry > 30);
        this.say(TU.caddy.pick(good ? cd.good : cd.bad), 2.6);
        this.resultT = 2.2;
      }
      this.state = 'result';
    },
    penalty(kind, p) {
      this.strokes++;
      const b = this.ball;
      if (kind === 'water') {
        const d = { x: this.shotStart.x - p.x, y: this.shotStart.y - p.y }, l = Math.hypot(d.x, d.y) || 1;
        let x = p.x, y = p.y;
        for (let s = 0; s < l; s += 1) {
          x = p.x + d.x / l * s; y = p.y + d.y / l * s;
          const t = Ph.tileAt(this.hole, x, y);
          if (t !== 'W' && t !== 'O') { x += d.x / l * 2; y += d.y / l * 2; break; }
        }
        Object.assign(b, { x, y });
        TU.audio.play('splash');
        this.showBanner('WATER HAZARD', '+1 penalty stroke. Ball dropped.', 2.2);
        this.say(TU.caddy.pick(TU.caddy.current().bad), 2.6);
      } else if (kind === 'lost') {
        // drop where the ball entered the reachable edge of the woods
        const d = { x: this.shotStart.x - p.x, y: this.shotStart.y - p.y }, l = Math.hypot(d.x, d.y) || 1;
        let x = p.x, y = p.y;
        for (let s = 0; s < l; s += 1) {
          x = p.x + d.x / l * s; y = p.y + d.y / l * s;
          if (!Ph.deepForest(this.hole, x, y) && !Ph.treeAt(this.hole, x, y, 0.3)) break;
        }
        Object.assign(b, { x, y });
        TU.audio.play('tree');
        this.showBanner('LOST IN THE WOODS', '+1 penalty stroke. Ball dropped at the edge.', 2.2);
      } else {
        Object.assign(b, { x: this.shotStart.x, y: this.shotStart.y });
        TU.audio.play('bad');
        this.showBanner('OUT OF BOUNDS', '+1 stroke. Replay from the last spot.', 2.2);
      }
      b.vx = b.vy = 0; b.z = 0;
      this.resultT = 2.2;
      this.state = 'result';
    },
    afterResult() {
      if (this.strokes >= MAX_STROKES) {
        this.strokes = MAX_STROKES;
        this.startCut('PICKED UP', `Max ${MAX_STROKES} strokes per hole`, false);
        this.resultT = 2.6;
        return;
      }
      if (this.mp) return this.nextTurn();
      const g = this.golfer.root.position;
      if (this.travelEnabled() && Math.hypot(g.x - this.ball.x, g.z - this.ball.y) > 4) return this.beginTravel();
      this.setupShot();
    },
    beginTravel() {
      const g = this.golfer.root.position;
      this.walker = this.makeWalker(g.x, g.z, U.angleTo({ x: g.x, y: g.z }, this.cart));
      this.holdRelease = true;
      this.state = 'walk';
      this.blockMsgT = 0;
      this.feedback = null;
    },
    makeWalker(x, y, face) {
      return { x, y, face, phase: 0, z: Ph.groundAt(this.hole, x, y), vz: 0, kx: 0, ky: 0, stumble: 0 };
    },
    skipTravel() {
      // Cutscene: the cart pulls up near the ball, stops, and you and the caddy walk over to it.
      const b = this.ball, back = U.dirVec(U.angleTo(this.hole.pin, b));
      let to = null;
      for (let k = 4; k < 40; k += 2) {
        const x = b.x + back.x * k, y = b.y + back.y * k;
        const h = U.angleTo({ x, y }, this.hole.pin);
        if (!this.cartBlocked(x, y, h)) { to = { x, y, h }; break; }
      }
      if (!to) return this.setupShot();
      const d = U.dirVec(to.h);
      let from = to;
      for (let k = 14; k >= 2; k -= 2) {
        const x = to.x - d.x * k, y = to.y - d.y * k;
        if (!this.cartBlocked(x, y, to.h)) { from = { x, y }; break; }
      }
      Object.assign(this.cart, this.cartAt(from.x, from.y, to.h));
      this.arrive = { t: 0, from, to, walked: false };
      this.walker = null;
      this.state = 'arrive';
      this.banner = null;
      this.snapCamera = true;
    },
    updateArrive(dt, act) {
      const a = this.arrive, c = this.cart, S = this.cartSpec();
      a.t += dt;
      if (act && a.t > 0.5) return this.endArrive();
      const DRIVE = 2.2, STOP = 2.7;
      if (a.t < DRIVE) {
        // ease in to a stop
        const u = a.t / DRIVE, s = 1 - (1 - u) * (1 - u), x = U.lerp(a.from.x, a.to.x, s), y = U.lerp(a.from.y, a.to.y, s);
        this.cartDist = Math.hypot(x - c.x, y - c.y);
        c.x = x; c.y = y;
        c.z = this.cartGround(x, y); c.cy = c.z + S.com;
        const t = this.cartTilt(x, y, c.h); c.p = t.p; c.r = t.r;
        c.dive = u > 0.7 ? Math.sin((u - 0.7) / 0.3 * Math.PI) * 0.1 : -0.03;
        TU.audio.engine(8 * (1 - u));
        return;
      }
      TU.audio.engine(0);
      c.dive *= Math.pow(0.02, dt);
      if (a.t < STOP) return;
      if (!a.walked) {
        // hop out: you on the driver side, the caddy on the other
        a.walked = true;
        const l = U.dirVec(c.h - Math.PI / 2), b = this.ball, toBall = U.dirVec(U.angleTo(this.hole.pin, b));
        this.walker = this.makeWalker(c.x + l.x * 1.4, c.y + l.y * 1.4, 0);
        Object.assign(this.cad, { x: c.x - l.x * 1.4, y: c.y - l.y * 1.4, moving: false });
        a.gT = { x: b.x + toBall.x * 1.4, y: b.y + toBall.y * 1.4 };
        a.cT = { x: b.x + toBall.x * 3 - toBall.y * 3.5, y: b.y + toBall.y * 3 + toBall.x * 3.5 };
        TU.audio.play('click');
      }
      const step = (p, tgt, key) => {
        const dx = tgt.x - p.x, dy = tgt.y - p.y, dd = Math.hypot(dx, dy);
        p.moving = dd > 0.15;
        if (!p.moving) return true;
        const sp = Math.min(dd / dt, 3.6);
        p.x += dx / dd * sp * dt; p.y += dy / dd * sp * dt;
        p[key] = Math.atan2(dx, -dy);
        p.phase += sp * dt * 2.2;
        return false;
      };
      const g = step(this.walker, a.gT, 'face'), cd = step(this.cad, a.cT, 'face');
      this.walker.z = Ph.groundAt(this.hole, this.walker.x, this.walker.y);
      if ((g && cd) || a.t > STOP + 7) this.endArrive();
    },
    endArrive() {
      const a = this.arrive, c = this.cart;
      Object.assign(c, this.cartAt(a.to.x, a.to.y, a.to.h));
      TU.audio.engine(0);
      this.arrive = null;
      this.setupShot();
      if (this.cad && this.caddySpot) Object.assign(this.cad, { x: this.caddySpot.x, y: this.caddySpot.y, moving: false });
    },
    // Tires and suspension from the shop. Speed multipliers per terrain (path = on the cart path).
    // the cart being driven (or cart k): online that can be a friend's, with their tires and upgrades
    cartData(k = this.cartIdx) { const K = this.carts && this.carts[k]; return (K && K.data) || TU.save.data.cart; },
    useCart(k) { const K = this.carts[k]; this.cartIdx = k; this.cart = K.st; this.cartObj = K.obj; this.cartEx = K.obj.ex || 0; },
    cartOwner(k = this.cartIdx) { const p = this.online && this.round.players[this.carts[k].owner]; return p ? p.name : null; },
    cartSpec(k) {
      const s = this.cartData(k), tires = s.tires || 'standard', lift = s.suspension === 'lift';
      const T0 = {
        standard: { path: 1, E: 0.75, F: 0.75, R: 0.55, S: 0.3, T: 0.45, W: 0.3, climb: 1.1, grip: 0.3, track: 0.68, traction: 1 },
        race: { path: 1.5, E: 0.45, F: 0.45, R: 0.3, S: 0.15, T: 0.25, W: 0.2, climb: 0.9, grip: 0.4, track: 0.68, traction: 1 },
        offroad: { path: 0.7, E: 1, F: 1, R: 0.95, S: 0.85, T: 0.85, W: 0.35, climb: 1.9, grip: 0.15, track: 0.92, traction: 0.45 },
        aqua: { path: 1, E: 0.75, F: 0.75, R: 0.55, S: 0.3, T: 0.45, W: 0.65, climb: 1.1, grip: 0.3, track: 0.68, traction: 1 },
      }[tires] || {};
      const com = 0.62 + (lift ? 0.2 : 0) + (tires === 'offroad' ? 0.06 : 0);
      const o = Object.assign({ tires, lift, com, k: lift ? 35 : 70, damp: lift ? 5 : 10, bounce: lift ? 0.5 : 0.3, hard: lift ? 12 : 8, pop: lift ? 1.6 : 0 }, T0);
      o.top = 2.2 + (lift ? 0.38 : 0) - com;
      o.ex = (({ double: 2, limo: 3 }[s.size] || 1) - 1) * 1.1; // longer carts
      o.half = 1.25 + o.ex / 2;
      o.fly = s.fly === 'hover';
      o.nitro = s.nitro === 'nitro';
      o.radio = s.speakers && s.speakers !== 'none' ? s.speakers : null;
      if (lift) o.track += 0.1; // lift kits come with a wider stance
      return o;
    },
    cartMul(S, x, y) {
      const t = Ph.tileAt(this.hole, x, y);
      if (t === 'G' || t === 'O') return null;
      if (t !== 'W' && TU.holeRender.onPath(this.hole, x, y)) return S.path;
      return t === 'P' ? S.R : S[t] != null ? S[t] : 0.4;
    },
    // ground under the cart: aqua tires ride on the pond surface
    cartGround(x, y) {
      const g = Ph.groundAt(this.hole, x, y);
      if (this.cartSpec().tires !== 'aqua' || Ph.tileAt(this.hole, x, y) !== 'W') return g;
      const w = R3.waterLevelAt(x, y);
      return w == null ? g : Math.max(g, w - 0.15);
    },
    // terrain pitch (nose down +) and roll (left side up +) under a cart at (x, y) facing h
    cartTilt(x, y, h) {
      const d = U.dirVec(h), l = U.dirVec(h - Math.PI / 2), G = (px, py) => this.cartGround(px, py);
      return { p: Math.atan2(G(x - d.x * 1.1, y - d.y * 1.1) - G(x + d.x * 1.1, y + d.y * 1.1), 2.2), r: Math.atan2(G(x + l.x * 0.6, y + l.y * 0.6) - G(x - l.x * 0.6, y - l.y * 0.6), 1.2) };
    },
    // How far the cart's lowest point sits below its center of mass for a tilt (p, r):
    // the body is a box; rotating it changes which corner touches the ground.
    cartSupport(S, p, r) {
      const hx = S.track, cp = Math.cos(p), sp = Math.sin(p), cr = Math.cos(r), sr = Math.sin(r);
      let m = -1e9;
      for (const x of [-hx, hx]) for (const y of [-S.com, S.top]) for (const z of [-S.half, S.half]) m = Math.max(m, -((x * sr + y * cr) * cp - z * sp));
      return m;
    },
    cartAt(x, y, h) {
      const S = this.cartSpec(), t = this.cartTilt(x, y, h), z = this.cartGround(x, y);
      return { x, y, h, v: 0, z, cy: z + S.com, vz: 0, air: false, vx: 0, vy: 0, p: t.p, r: t.r, wp: 0, wr: 0, free: false, rest: 0, flip: 0, sink: 0, dive: 0, lean: 0, wob: 0, wobV: 0, trail: [], safeT: 0 };
    },
    // Splashes and sprays as you (or your cart) go in, out of and through water and bunkers.
    surfaceFX(dt) {
      const drive = this.state === 'drive', p = drive ? this.cart : this.walker;
      if (!p || p.sitting) return;
      const hole = this.hole, c = this.cart, air = drive && c.air;
      const tile = air ? null : Ph.tileAt(hole, p.x, p.y), prev = this.surfPrev;
      const sp = drive ? (c.air ? Math.hypot(c.vx, c.vy) : Math.abs(c.v)) : (p.moving ? (K.down('run') ? RUN_SPEED : WALK_SPEED) : 0);
      const f = U.dirVec(drive ? c.h : p.face), g = Ph.groundAt(hole, p.x, p.y);
      const lvl = R3.waterLevelAt(p.x, p.y);
      const SAND = [0xe8d39a, 0xd8c088, 0xf2e2b0], WATER = [0xffffff, 0xd8f0ff, 0x9fd6f5];
      if (tile && prev && tile !== prev) {
        const big = Math.min(1.6, 0.5 + sp / 10);
        if (tile === 'S' || prev === 'S') {
          // kicking sand up as you step or roll into (or out of) a bunker
          TU.FX.burst(p.x + f.x * 0.6, p.y + f.y * 0.6, g, { n: Math.round((drive ? 30 : 14) * big), colors: SAND, spread: (drive ? 2.2 : 1.2) * big, up: (drive ? 4 : 2.6) * big, life: 0.8, dx: f.x * sp * 0.3, dy: f.y * sp * 0.3 });
          TU.audio.play('sand');
        }
        if (drive && (tile === 'W' || prev === 'W')) {
          // ploughing into the water (aqua tires) or climbing back out
          const y0 = lvl != null ? lvl : g;
          TU.FX.burst(p.x + f.x * 1.2, p.y + f.y * 1.2, y0 + 0.1, { n: Math.round(45 * big), colors: WATER, spread: 2.6 * big, up: 6 * big, life: 1, dx: f.x * sp * 0.25, dy: f.y * sp * 0.25 });
          TU.audio.play('splash'); this.bump(0.3 * big);
          if (prev === 'W') this.dripT = 2.5; // still dripping for a bit after
        }
      }
      if (tile) this.surfPrev = tile;
      // continuous spray while moving through
      this.sprayT = (this.sprayT || 0) - dt;
      if (sp > 1.5 && this.sprayT <= 0) {
        this.sprayT = drive ? 0.07 : 0.14;
        const side = { x: -f.y, y: f.x }, k = Math.min(1.5, sp / 12);
        if (tile === 'S') {
          if (drive) for (const sd of [-0.6, 0.6]) TU.FX.burst(p.x - f.x * 0.9 + side.x * sd, p.y - f.y * 0.9 + side.y * sd, g, { n: 4, colors: SAND, spread: 0.6, up: 2 * k + 0.6, life: 0.6, dx: -f.x * sp * 0.25, dy: -f.y * sp * 0.25 });
          else TU.FX.burst(p.x, p.y, g, { n: 3, colors: SAND, spread: 0.5, up: 1.4, life: 0.45 });
        }
        if (drive && tile === 'W' && lvl != null) {
          // bow spray off both sides plus a frothy wake behind
          for (const sd of [-1, 1]) TU.FX.burst(p.x + f.x * 1.1 + side.x * sd * 0.7, p.y + f.y * 1.1 + side.y * sd * 0.7, lvl + 0.1, { n: 4, colors: WATER, spread: 0.5, up: 2.2 * k + 0.8, life: 0.7, dx: side.x * sd * sp * 0.25, dy: side.y * sd * sp * 0.25 });
          TU.FX.burst(p.x - f.x * 1.4, p.y - f.y * 1.4, lvl + 0.05, { n: 3, colors: WATER, spread: 0.9, up: 0.8, life: 0.8 });
        }
      }
      // hover kit skimming low over a pond whips up spray underneath
      if (air && this.cartSpec().fly && Ph.tileAt(hole, c.x, c.y) === 'W') {
        const lv = R3.waterLevelAt(c.x, c.y), above = c.z - (lv ?? g);
        if (lv != null && above < 3 && this.sprayT <= 0.02) TU.FX.burst(c.x, c.y, lv + 0.1, { n: 6, colors: WATER, spread: 2 - above * 0.4, up: 1.5, life: 0.6 });
      }
      // drips coming off the cart after a swim
      if (this.dripT > 0) {
        this.dripT -= dt;
        if (Math.random() < 0.5) TU.FX.burst(c.x + (Math.random() - 0.5) * 1.2, c.y + (Math.random() - 0.5) * 2, (c.z || g) + 0.5, { n: 1, colors: [0xbfe6ff], spread: 0.1, up: 0.1, gravity: 12, life: 0.4 });
      }
    },
    // cart radio: step through the stations (R key goes forward, OFF sits at the end of the loop)
    nextStation(dir = 1) {
      const d = TU.save.data.cart, n = TU.audio.STATIONS.length;
      d.station = ((d.station ?? 1) + dir + n) % n;
      if (d.station) d.lastStation = d.station;
      TU.save.write();
      TU.audio.play('click');
    },
    toggleRadio() {
      const d = TU.save.data.cart;
      d.station = d.station ? 0 : (d.lastStation || 1);
      TU.save.write();
      TU.audio.play('click');
    },
    // While you're lining up and hitting a shot, anything between the camera and your golfer
    // (your cart, the beverage cart, the hole sign, the bench...) turns see-through.
    seeThrough(st) {
      // (not while you're off roaming online: your camera isn't behind the shooter then)
      const shooting = ['aim', 'swing', 'downswing', 'putt', 'puttswing'].includes(st) && !this.gate && !this.roamCam();
      const cam = R3.camera.position, g = this.golfer && this.golfer.root.position;
      const blocks = (x, y, r) => {
        if (!shooting || !g) return false;
        const ax = cam.x, ay = cam.z, dx = g.x - ax, dy = g.z - ay, l2 = dx * dx + dy * dy || 1;
        const u = ((x - ax) * dx + (y - ay) * dy) / l2;
        if (u <= 0 || u >= 1.02) return false;
        return Math.hypot(x - ax - dx * u, y - ay - dy * u) < r;
      };
      // every cart on the course (online there's one per player), and the players waiting their turn
      if (this.carts) this.carts.forEach(K => R3.fade(K.obj.root, blocks(K.st.x, K.st.y, 1.9 + (K.obj.ex || 0) / 2)));
      else if (this.cartObj && this.cart) R3.fade(this.cartObj.root, blocks(this.cart.x, this.cart.y, 1.9 + (this.cartEx || 0) / 2));
      if (this.actors) this.actors.forEach((a, i) => {
        if (i === this.round.turn) { R3.fade(a.golfer.root, false); return; } // the shooter is never see-through
        const p = a.golfer.root.position, q = a.caddy.root.position;
        R3.fade(a.golfer.root, blocks(p.x, p.z, 0.7)); R3.fade(a.caddy.root, blocks(q.x, q.z, 0.7));
      });
      if (this.bevObj && this.bev && this.bev.x != null) { const on = blocks(this.bev.x, this.bev.y, 2); R3.fade(this.bevObj.root, on); if (this.bevDriver) R3.fade(this.bevDriver.root, on); }
      if (R3.sign) R3.fade(R3.sign, blocks(this.hole.tee.x - 6, this.hole.tee.y - 7, 3));
      for (const pr of R3.props || []) R3.fade(pr.obj, blocks(pr.x, pr.y, pr.r));
      if (this.caddyObj && this.cad) R3.fade(this.caddyObj.root, blocks(this.cad.x, this.cad.y, 0.7));
    },
    // Camera for cutscenes: look at the middle of everything that matters and back off along `side`
    // far enough that all of it fits inside the letterboxed frame (bars cover about a quarter of it).
    frameShot(pts, side, minDist = 9) {
      let cx = 0, cy = 0, ch = 0;
      for (const p of pts) { cx += p.x; cy += p.y; ch += p.h; }
      cx /= pts.length; cy /= pts.length; ch /= pts.length;
      let rad = 0;
      for (const p of pts) rad = Math.max(rad, Math.hypot(p.x - cx, p.y - cy) + 1.8, Math.abs(p.h - ch) + 1.8);
      const cam = R3.camera, fv = cam.fov * Math.PI / 180 * 0.7, fh = 2 * Math.atan(Math.tan(cam.fov * Math.PI / 360) * cam.aspect);
      const d = Math.max(minDist, rad / Math.tan(Math.min(fv, fh) / 2) * 1.1), elev = 0.3;
      const eye = { x: cx + side.x * d * Math.cos(elev), y: cy + side.y * d * Math.cos(elev), ay: ch + d * Math.sin(elev) };
      R3.clearTrees(cx, cy, Math.min(rad, 6), side, d + 4);
      return { eye, look: { x: cx, y: cy, ay: ch + 0.4 } };
    },
    // the radio panel: bottom left, beside the driving panel (that corner is empty while travelling)
    drawRadio(c) {
      // a small two-line strip tucked in the bottom-left corner, clear of every other panel
      const d = TU.save.data.cart, stn = d.station ?? 1, on = stn > 0;
      const x = 16, y = 478, w = 200, h = 46;
      ui.panel(c, x, y, w, h, { fill: '#1d1430' });
      for (let i = 0; i < 3; i++) { const bh = on ? 2 + Math.abs(Math.sin(TU.time * (5 + i * 1.7) + i)) * 7 : 2; c.fillStyle = on ? '#c56cf0' : '#55606a'; c.fillRect(x + 8 + i * 4, y + 16 - bh, 3, bh); }
      const song = on && TU.audio.radioSong();
      ui.text(c, on ? `${TU.audio.STATIONS[stn]}${song ? ' - ' + song : ''}`.slice(0, 26) : 'RADIO OFF', x + 24, y + 6, { size: 6, color: on ? '#ffe066' : '#9aa' });
      const by = y + 24;
      if (ui.button(c, x + 8, by, 26, 16, '<', { size: 6, color: '#4a3a6a' })) this.nextStation(-1);
      if (ui.button(c, x + 38, by, 26, 16, '>', { size: 6, color: '#4a3a6a' })) this.nextStation(1);
      if (on && ui.button(c, x + 68, by, 60, 16, 'SKIP', { size: 6, color: '#4a3a6a' })) { TU.audio.radioSkip(); TU.audio.play('click'); }
      if (ui.button(c, x + 148, by, 44, 16, on ? 'OFF' : 'ON', { size: 6, color: on ? '#7a3a3a' : '#2e9e5b' })) this.toggleRadio();
    },
    bump(amount) { this.shake = Math.max(this.shake || 0, amount); },

    // ---------- caddy movement ----------
    // The caddy walks with you between shots (running when they fall behind), rides in the
    // passenger seat while you drive, and walks over to a spot beside you for each shot.
    updateCaddy(dt) {
      const cd = this.cad, st = this.state;
      if (!cd || st === 'drive' || st === 'ride' || st === 'arrive' || st === 'fishout' || this.cut) return;
      cd.vx = cd.vx || 0; cd.vy = cd.vy || 0;
      const follow = st === 'walk', w = this.walker;
      let tx, ty, idleFace, keep;
      if (follow) {
        // keep a relaxed distance from the player along whatever side the caddy is already on,
        // so turning on the spot doesn't send the caddy running around you
        const ax = cd.x - w.x, ay = cd.y - w.y, l = Math.hypot(ax, ay) || 1;
        tx = w.x + ax / l * 2.6; ty = w.y + ay / l * 2.6;
        idleFace = U.angleTo(cd, w);
        keep = 2.6;
      } else {
        tx = this.caddySpot.x; ty = this.caddySpot.y;
        idleFace = U.angleTo(this.caddySpot, this.shotStart);
      }
      const dx = tx - cd.x, dy = ty - cd.y, dist = Math.hypot(dx, dy);
      const gap = follow ? Math.hypot(cd.x - w.x, cd.y - w.y) : dist;
      if (gap > 45) { const f = U.dirVec(w ? w.face : 0); Object.assign(cd, { x: (w ? w.x : tx) - f.x * 3, y: (w ? w.y : ty) - f.y * 3, vx: 0, vy: 0 }); return; }
      // start walking only once the player has moved off, then ease in and out
      if (follow) {
        if (!cd.moving && gap < 4) cd.want = 0;
        else cd.want = U.clamp((gap - keep) * 1.6, 0, gap > 8 ? RUN_SPEED * 1.05 : WALK_SPEED * 1.1);
      } else cd.want = !cd.moving && dist < 0.35 ? 0 : U.clamp(dist * 1.8, 0, WALK_SPEED);
      const ux = dist ? dx / dist : 0, uy = dist ? dy / dist : 0, k = Math.min(1, dt * 3.5);
      // face the way you're about to walk first: no speed until roughly facing it
      const intends = cd.want > 0;
      if (intends) {
        const off = Math.abs(U.wrap(Math.atan2(ux, -uy) - cd.face));
        cd.want *= U.clamp(1 - (off - 0.6) / 0.9, 0, 1);
      }
      cd.vx += (ux * cd.want - cd.vx) * k; cd.vy += (uy * cd.want - cd.vy) * k;
      // move with collisions: slide along obstacles, or step around them
      const sx = cd.vx * dt, sy = cd.vy * dt;
      if (sx || sy) {
        if (this.caddyBlocked(cd.x, cd.y) || !this.caddyBlocked(cd.x + sx, cd.y + sy)) { cd.x += sx; cd.y += sy; } // already overlapping something: walk out
        else if (!this.caddyBlocked(cd.x + sx, cd.y)) { cd.x += sx; cd.vy *= 0.5; }
        else if (!this.caddyBlocked(cd.x, cd.y + sy)) { cd.y += sy; cd.vx *= 0.5; }
        else {
          const m = Math.hypot(sx, sy), base = Math.atan2(sx, -sy);
          let moved = false;
          for (const off of [0.7, -0.7, 1.4, -1.4]) {
            const d2 = U.dirVec(base + off), nx = cd.x + d2.x * m, ny = cd.y + d2.y * m;
            if (!this.caddyBlocked(nx, ny)) { cd.x = nx; cd.y = ny; moved = true; break; }
          }
          if (!moved) { cd.vx *= 0.3; cd.vy *= 0.3; }
        }
      }
      const sp = Math.hypot(cd.vx, cd.vy);
      cd.moving = sp > 0.35;
      cd.running = sp > WALK_SPEED * 1.3;
      cd.phase += sp * dt * 2.2;
      const head = dist > 0.3 && (intends || cd.moving) ? Math.atan2(ux, -uy) : null;
      const want = head !== null ? head : idleFace;
      const turn = U.wrap(want - cd.face), maxT = 7 * dt;
      cd.face += U.clamp(turn, -maxT, maxT);
    },
    // Same solid world as the player, plus the player themself.
    caddyBlocked(x, y) {
      const t = Ph.tileAt(this.hole, x, y);
      if (t === 'W' || t === 'O' || Ph.deepForest(this.hole, x, y)) return true;
      if (Ph.treeAt(this.hole, x, y, 0.3) || R3.obstacleAt(x, y, 0.3) || this.cartHit(x, y, 0.35) || this.bevHit(x, y, 0.35)) return true;
      const w = this.walker;
      if (this.state === 'walk' && w && Math.hypot(w.x - x, w.y - y) < 0.7) return true;
      return false;
    },

    // ---------- walking ----------
    updateWalk(dt) {
      const w = this.walker, hole = this.hole;
      // sitting on a bench: any move key (or E) gets you back up, in front of the bench
      if (w.sitting) {
        const moved = ['forward', 'back', 'left', 'right'].some(a => K.pressed(a)) || K.pressed('cart');
        if (moved) {
          const bn = w.sitting, f = U.dirVec(bn.face);
          Object.assign(w, { sitting: null, x: bn.x + f.x * 1.5, y: bn.y + f.y * 1.5, face: bn.face, z: Ph.groundAt(hole, bn.x + f.x * 1.5, bn.y + f.y * 1.5) });
          this.holdRelease = true;
          TU.audio.play('click');
        }
        w.moving = false; this.nearBench = null;
        return;
      }
      this.nearBench = (R3.benches || []).find(bn => Math.hypot(bn.x - w.x, bn.y - w.y) < 2.2) || null;
      if (this.nearBench && !this.nearCart && K.pressed('cart')) { w.sitting = this.nearBench; w.moving = false; TU.audio.play('click'); return; }
      const turn = (K.down('left') ? -1 : 0) + (K.down('right') ? 1 : 0);
      // keys still held from driving (e.g. the brake) are ignored until you let go of them
      const held = ['forward', 'back', 'left', 'right'].some(a => K.down(a));
      if (this.holdRelease && !held) this.holdRelease = false;
      const frozen = w.stumble > 0 || this.holdRelease;
      const fwd = frozen ? 0 : (K.down('forward') ? 1 : 0) - (K.down('back') ? 0.6 : 0);
      w.face += turn * 2.6 * dt * (frozen ? 0 : 1);
      const running = K.down('run');
      let sp = (running ? RUN_SPEED : WALK_SPEED) * fwd * this.mods().walk;
      const d = U.dirVec(w.face);
      // slopes: slower uphill, a little quicker downhill, sheer walls can't be climbed
      const gr = TU.terrain.grad(hole, w.x, w.y), up = (gr.x * d.x + gr.y * d.y) * Math.sign(sp || 1);
      sp *= U.clamp(1 - up * 1.4, 0.35, 1.25);
      let nx = w.x + d.x * sp * dt + w.kx * dt, ny = w.y + d.y * sp * dt + w.ky * dt;
      const tooSteep = w.z < 0.01 + Ph.groundAt(hole, w.x, w.y) && Ph.groundAt(hole, nx, ny) - Ph.groundAt(hole, w.x, w.y) > 1.2 * Math.hypot(nx - w.x, ny - w.y) + 0.02;
      if (tooSteep) { nx = w.x; ny = w.y; if (sp && this.blockMsgT <= 0) { this.showBanner('Too steep to climb!', '', 1); this.blockMsgT = 1.4; } }
      // slide along obstacles; if already stuck inside one, let the player walk out
      const stuck = this.walkBlocked(w.x, w.y);
      if (stuck || !this.walkBlocked(nx, ny)) { w.x = nx; w.y = ny; }
      else {
        // running into something at speed knocks you back
        if (running && Math.abs(sp) > WALK_SPEED * 1.2 && w.stumble <= 0) {
          w.kx = -d.x * 6; w.ky = -d.y * 6; w.stumble = 0.7;
          TU.audio.play('land');
          this.bump(0.35);
          this.showBanner('OOF!', '', 0.8);
          if (this.cartHit(nx, ny, 0.35)) { this.cart.wobV += 3; } // the cart rocks on its springs
        } else if (sp) {
          // glide around the obstacle, but only in directions close to where you're facing,
          // so you never crab-walk or drift backwards along a wall
          const step = Math.hypot(nx - w.x, ny - w.y), dirA = Math.atan2(nx - w.x, -(ny - w.y));
          let slid = false;
          for (const off of [0.35, -0.35, 0.7, -0.7, 1.0, -1.0]) {
            const dv = U.dirVec(dirA + off), sx = w.x + dv.x * step * Math.cos(off), sy = w.y + dv.y * step * Math.cos(off);
            if (!this.walkBlocked(sx, sy)) { w.x = sx; w.y = sy; slid = true; break; }
          }
          if (!slid && this.blockMsgT <= 0 && Ph.deepForest(hole, nx, ny)) { this.showBanner('The woods are too thick to go further', '', 1.2); this.blockMsgT = 1.5; }
        }
      }
      w.kx *= Math.pow(0.02, dt); w.ky *= Math.pow(0.02, dt);
      w.stumble -= dt;
      this.blockMsgT -= dt;
      // vertical: follow the ground, fall off ledges
      const g = Ph.groundAt(hole, w.x, w.y);
      if (w.z > g + 0.05 || w.vz > 0) {
        w.vz -= GRAVITY * dt; w.z += w.vz * dt;
        if (w.z <= g) {
          if (w.vz < -8) { w.stumble = 0.9; TU.audio.play('land'); this.bump(0.5); this.showBanner('OUCH!', 'Watch your step', 1); }
          w.z = g; w.vz = 0;
        }
      } else if (g < w.z - 0.6) { w.vz = 0; } // stepped off an edge: start falling next frame
      else w.z = g;
      const ph0 = Math.floor(w.phase / Math.PI);
      w.phase += sp * dt * 2.2; // negative while backing up, so the legs step backwards
      if (Math.floor(w.phase / Math.PI) !== ph0) TU.audio.play('step');
      w.moving = sp !== 0;
      // any cart on the course will do: online you can hop in a friend's (your caddy comes along)
      let near = -1, nd = 1e9;
      (this.carts || []).forEach((K, k) => {
        const c = K.st, dd = Math.hypot(w.x - c.x, w.y - c.y);
        if (dd < 2.8 + (K.obj.ex || 0) / 2 && dd < nd && !c.flip && !c.free && !c.sink) { near = k; nd = dd; }
      });
      this.nearCart = near >= 0; this.nearCartIdx = near;
      const ballD = Math.hypot(w.x - this.ball.x, w.y - this.ball.y);
      this.nearBall = ballD < 3;
      const wantsShot = K.pressed('swing') || (input.clicked && !ui.overButton());
      if (this.roaming) this.nearBall = false; // not your turn yet
      if (this.nearBall && wantsShot) return this.setupShot();
      if (wantsShot && !this.nearCart && !this.roaming) this.showBanner(`Walk closer to your ball (${Math.round(ballD)} yds)`, '', 1.2);
      if (this.nearCart && K.pressed('cart')) {
        const row = this.online ? this.seatFree(near) : 0;
        if (row < 0) { this.showBanner('That cart is full', 'Every row has a golfer and caddy in it', 1.4); return; }
        if (near !== this.cartIdx) this.useCart(near);
        const owner = this.cartOwner(), self = this.simSelf ?? this.round.turn;
        TU.audio.play('click');
        if (row > 0) {
          // someone's driving: hop in the back with your caddy and ride along
          const drv = this.cartRiders(near).find(q => q.row === 0);
          this.ride = { k: near, row }; this.state = 'ride';
          this.showBanner(drv ? `Riding with ${this.round.players[drv.i].name}` : 'Hopped in the back', `${K.hint('cart')}: hop out when it stops`, 1.6);
          return;
        }
        if (owner && this.carts[near].owner !== self) this.showBanner(`Driving ${owner}'s cart`, '', 1.4);
        this.state = 'drive';
      }
    },
    walkBlocked(x, y) {
      const t = Ph.tileAt(this.hole, x, y);
      if ((t === 'W' && this.deepWater(x, y)) || t === 'O' || Ph.deepForest(this.hole, x, y) || !!Ph.treeAt(this.hole, x, y, 0.3) || !!R3.obstacleAt(x, y, 0.3) || this.cartHit(x, y, 0.35) || this.bevHit(x, y, 0.35)) return true;
      if (this.online && this.peopleHit(x, y, 0.35)) return true;
      // you can't walk through your caddy either
      const cd = this.cad;
      return !!(cd && this.state === 'walk' && Math.hypot(cd.x - x, cd.y - y) < 0.55);
    },
    // the beverage cart is solid too (two circles along its length)
    bevHit(x, y, r) {
      const b = this.bev;
      if (!b || !this.bevObj || !this.bevObj.root.visible || b.x == null) return false;
      const d = U.dirVec(b.h);
      return [-0.65, 0.65].some(o => Math.hypot(b.x + d.x * o - x, b.y + d.y * o - y) < 0.8 + r);
    },
    // The cart is two circles along its length.
    cartHit(x, y, r, skip) {
      if (!this.carts) return false;
      return this.carts.some((K, k) => k !== skip && K.st && this.cartHitOne(K, x, y, r));
    },
    cartHitOne(K, x, y, r) {
      const c = K.st;
      const d = U.dirVec(c.h);
      const e = K.obj.ex || 0, offs = e ? [-0.65 - e / 2, -e / 4, 0, e / 4, 0.65 + e / 2] : [-0.65, 0.65];
      if (offs.some(o => Math.hypot(c.x + d.x * o - x, c.y + d.y * o - y) < 0.8 + r)) return true;
      // the golf bag (and speakers / jets) hang off the back
      const rear = -1.5 - e / 2;
      if (Math.hypot(c.x + d.x * rear - x, c.y + d.y * rear - y) < 0.5 + r) return true;
      // the hover kit's wings and wing-tip fans stick out to the sides
      if (K.data.fly === 'hover') {
        const sd = { x: -d.y, y: d.x };
        for (const [a, sdo, rr] of [[-0.3, 1.25, 0.55], [-0.6, 1.7, 0.45]]) for (const k of [-1, 1]) if (Math.hypot(c.x + d.x * a + sd.x * sdo * k - x, c.y + d.y * a + sd.y * sdo * k - y) < rr + r) return true;
      }
      return false;
    },
    // Why the cart can't drive from (x0, y0) to (x, y) facing h: something in the way, or a wall of terrain too steep to climb.
    cartWhy(S, x0, y0, x, y, h) {
      const why = this.cartBlocked(x, y, h);
      if (why) return why;
      const run = Math.hypot(x - x0, y - y0);
      return run > 0 && this.cartGround(x, y) - this.cartGround(x0, y0) > run * S.climb + 0.02 ? 'steep' : null;
    },
    // Why the cart can't be at (x, y) facing h: null if it can.
    cartBlocked(x, y, h) {
      const d = U.dirVec(h), e = (this.cartEx || 0) / 2;
      for (const o of e ? [-0.75 - e, 0, 0.75 + e] : [-0.75, 0.75]) {
        const px = x + d.x * o, py = y + d.y * o;
        if (Ph.treeAt(this.hole, px, py, 0.7)) return 'tree';
        if (R3.obstacleAt(px, py, 0.7)) return 'prop';
        if (this.bevHit(px, py, 0.5)) return 'bev';
        if (this.carts && this.carts.length > 1 && this.cartHit(px, py, 0.6, this.cartIdx)) return 'prop';
        if (this.online && this.peopleHit(px, py, 0.7)) return 'prop';
      }
      for (const o of [-1.4 - e, 0, 1.4 + e]) {
        const px = x + d.x * o, py = y + d.y * o, t = Ph.tileAt(this.hole, px, py);
        if (t === 'G' || t === 'O') return t;
        if (Ph.deepForest(this.hole, px, py)) return 'deep';
      }
      return null;
    },

    // ---------- driving ----------
    // Rigid-body-ish cart: planted on its wheels (suspension springs follow the ground), free when
    // tipping or tumbling (gravity torque around whichever edge touches the ground), or airborne
    // (ballistic, with air control: hold reverse for a backflip, gas for a front flip, steer to barrel roll).
    updateDrive(dt) {
      const c = this.cart, hole = this.hole, S = this.cartSpec(), lvl = (this.cartData().speedLevel || 0);
      const maxV = 16 * (1 + 0.15 * lvl) * (S.tires === 'race' ? 1.12 : 1);
      const turn = (K.down('left') ? -1 : 0) + (K.down('right') ? 1 : 0);
      const gas = K.down('forward'), brake = K.down('back');
      const W = a => Math.atan2(Math.sin(a), Math.cos(a));
      this.blockMsgT -= dt;
      this.cartDist = 0;
      // body springs: bounce decays (softer and longer with the lift kit)
      c.wobV -= c.wob * S.k * dt; c.wobV *= Math.pow(S.lift ? 0.2 : 0.05, dt); c.wob += c.wobV * dt;

      if (c.sink > 0) return this.updateSink(dt, S);
      if (c.flip > 0) {
        // the caddy pushes the cart back onto its wheels
        c.flip -= dt;
        const t = this.cartTilt(c.x, c.y, c.h), k = Math.min(1, dt * 4);
        c.p += W(t.p - c.p) * k; c.r += W(t.r - c.r) * k;
        c.cy = this.cartGround(c.x, c.y) + this.cartSupport(S, W(c.p - t.p), W(c.r - t.r));
        c.z = c.cy - S.com;
        if (c.flip <= 0) { Object.assign(c, { p: t.p, r: t.r, wp: 0, wr: 0, free: false, freeT: 0, v: 0, vx: 0, vy: 0 }); this.showBanner('Back on four wheels', 'Your caddy rights the cart', 1.4); }
        return;
      }

      if (c.air) {
        c.vz -= GRAVITY * dt;
        const above = c.cy - S.com - this.cartGround(c.x, c.y);
        if (S.fly) {
          // flying: RUN = thrust up (up to a ceiling), let go to glide down; gas/brake set the airspeed
          // only glide once you're actually flying (pressed RUN); a plain jump falls like any cart
          if (K.down('run')) c.flying = true;
          if (K.down('run') && above < 32) c.vz = Math.min(8, c.vz + 34 * dt);
          else if (c.flying) c.vz = Math.max(c.vz, above > 3 ? -4 : -2.5);
          // gas flies forward, reverse flies backward, let go to coast to a hover
          const fd = U.dirVec(c.h);
          if (c.fv == null) c.fv = c.vx * fd.x + c.vy * fd.y;
          const want = gas ? maxV * 1.1 : brake ? -maxV * 0.45 : c.fv * (1 - dt * 0.6);
          c.fv += U.clamp(want - c.fv, -12 * dt, 9 * dt);
          // momentum swings round to the way the cart points
          const k = Math.min(1, dt * 3);
          c.vx += (fd.x * c.fv - c.vx) * k; c.vy += (fd.y * c.fv - c.vy) * k;
          // no parking on the green from above
          if (Ph.tileAt(hole, c.x, c.y) === 'G' && above < 1.6) { c.vz = Math.max(c.vz, 0); c.cy += (1.6 - above) * Math.min(1, dt * 6); }
        }
        const nx = c.x + c.vx * dt, ny = c.y + c.vy * dt;
        // only things at ground level can stop you, and only when you're low enough to hit them
        // low down everything blocks; higher up, tree canopies (up to ~9 yds) and the map edge still do
        const airHit = (x, y) => {
          let h = above < 1.2 ? this.cartBlocked(x, y, c.h) : Ph.tileAt(hole, x, y) === 'O' ? 'O' : null;
          if (!h && above < 9 && Ph.treeAt(hole, x, y, above > 2.5 ? 1.9 : 0.9)) h = 'tree';
          if (!h && above < 2.2 && (R3.obstacleAt(x, y, 0.8) || this.bevHit(x, y, 0.5))) h = 'prop';
          return h === 'G' ? null : h;
        };
        const hit = airHit(nx, ny);
        if (hit) {
          const imp = Math.hypot(c.vx, c.vy);
          // glance off: keep whichever part of the motion is clear instead of stopping dead
          if (!airHit(c.x + c.vx * dt, c.y)) { c.x += c.vx * dt; c.vy *= -0.25; }
          else if (!airHit(c.x, c.y + c.vy * dt)) { c.y += c.vy * dt; c.vx *= -0.25; }
          else { c.vx *= -0.4; c.vy *= -0.4; }
          if (c.fv != null) { const fd = U.dirVec(c.h); c.fv = c.vx * fd.x + c.vy * fd.y; }
          if (imp > 3 && this.blockMsgT <= 0) {
            TU.audio.play(hit === 'tree' ? 'tree' : 'land'); this.bump(Math.min(1, imp / 14)); this.blockMsgT = 1;
            if (hit === 'tree') TU.FX.burst(nx, ny, c.cy, { n: 18, colors: [0x3f8f35, 0x5aa83f, 0x2e6b28], spread: 2, up: 1, gravity: 3, drag: 2, life: 1.4 });
          }
        } else { c.x = nx; c.y = ny; }
        c.cy += c.vz * dt;
        // nitro keeps shoving you forward through the air
        if (c.nitroT > 0) {
          c.nitroT -= dt;
          const fdir = U.dirVec(c.h), sp0 = Math.hypot(c.vx, c.vy);
          if (sp0 < maxV * 2.4) { c.vx += fdir.x * 30 * dt; c.vy += fdir.y * 30 * dt; }
        }
        // steering in the air turns the cart (and its momentum) a little
        if (turn) {
          const yw = turn * 1.1 * dt, cs = Math.cos(yw), sn = Math.sin(yw);
          c.h += yw;
          const vx = c.vx * cs - c.vy * sn, vy = c.vx * sn + c.vy * cs; c.vx = vx; c.vy = vy;
        }
        // stunts once there's real air: reverse = backflip, gas (pressed again) = front flip, run + steer = barrel roll
        if (!gas) c.airGas = true;
        const ctl = 6 * dt, stunt = above > 1.5 && !S.fly;
        if (stunt && brake) c.wp -= ctl;
        if (stunt && gas && c.airGas) c.wp += ctl;
        if (stunt && turn && K.down('run')) c.wr -= turn * ctl;
        c.wp = U.clamp(c.wp, -7, 7); c.wr = U.clamp(c.wr, -7, 7);
        // let go of the keys and the cart levels itself out once it's near upright (makes landing tricks doable)
        // level toward the ground underneath, like a driver bracing for the landing
        const t0 = this.cartTilt(c.x, c.y, c.h), relP = W(c.p - t0.p), relR = W(c.r - t0.r);
        if (!(stunt && (brake || (gas && c.airGas))) && Math.abs(relP) < 1.3) c.wp += (-relP * 9 - c.wp * 3) * dt;
        if (!(turn && K.down('run')) && Math.abs(relR) < 1.3) c.wr += (-relR * 9 - c.wr * 3) * dt;
        c.p += c.wp * dt; c.r += c.wr * dt;
        c.airP += c.wp * dt; c.airR += c.wr * dt;
        const t = this.cartTilt(c.x, c.y, c.h), g = this.cartGround(c.x, c.y);
        const rp = W(c.p - t.p), rr = W(c.r - t.r), sup = this.cartSupport(S, rp, rr);
        c.z = c.cy - S.com;
        if (c.cy - sup <= g) this.cartLand(S, t, rp, rr, g, sup);
        return;
      }

      const t = this.cartTilt(c.x, c.y, c.h);
      let rp = W(c.p - t.p), rr = W(c.r - t.r);
      if (c.free) {
        // tipping or tumbling: gravity rolls it around the edge touching the ground
        const tp = t.p * S.traction, tr = t.r * S.traction, e = 0.02;
        const dSr = (this.cartSupport(S, rp + tp, rr + tr + e) - this.cartSupport(S, rp + tp, rr + tr - e)) / (2 * e);
        const dSp = (this.cartSupport(S, rp + tp + e, rr + tr) - this.cartSupport(S, rp + tp - e, rr + tr)) / (2 * e);
        c.wr += (-dSr * GRAVITY * 1.3 - c.wr * 2.2) * dt;
        c.wp += (-dSp * GRAVITY * 0.9 - c.wp * 2.2) * dt;
        // it rolls itself back onto its wheels: straight away with the gas held, or after a short tumble
        c.freeT = (c.freeT || 0) + dt;
        if (gas || c.freeT > 0.7) { c.wr += (-rr * 16 - c.wr * 3) * dt; c.wp += (-rp * 16 - c.wp * 3) * dt; }
        c.r += c.wr * dt; c.p += c.wp * dt;
        rp = W(c.p - t.p); rr = W(c.r - t.r);
        // keeps its momentum: it only slows like a coasting cart (sand drags harder); gas keeps it going
        const sp = Math.hypot(c.vx, c.vy);
        if (sp > 0 && !gas) {
          const dec = 3 + (1 - (this.cartMul(S, c.x, c.y) || 0.4)) * 14, k = Math.max(0, sp - dec * dt) / sp;
          c.vx *= k; c.vy *= k;
        }
        if (brake) { const k = Math.max(0, sp - 12 * dt) / (sp || 1); c.vx *= k; c.vy *= k; }
        const nx = c.x + c.vx * dt, ny = c.y + c.vy * dt;
        if (!this.cartBlocked(nx, ny, c.h)) { c.x = nx; c.y = ny; }
        else if (!this.cartBlocked(nx, c.y, c.h)) { c.x = nx; c.vy *= -0.25; } // glance off
        else if (!this.cartBlocked(c.x, ny, c.h)) { c.y = ny; c.vx *= -0.25; }
        else { c.vx *= -0.4; c.vy *= -0.4; }
        const g = this.cartGround(c.x, c.y), sup = this.cartSupport(S, rp, rr);
        c.cy = g + sup; c.z = c.cy - S.com;
        if (Math.abs(c.wr) > 3 || Math.abs(c.wp) > 3) { this.tumbleSnd = (this.tumbleSnd || 0) - dt; if (this.tumbleSnd <= 0) { this.tumbleSnd = 0.35; TU.audio.play('thud'); this.bump(0.3); } }
        if (this.deepWater(c.x, c.y) && S.tires !== 'aqua') return this.startSink();
        const upright = Math.abs(rp) < 0.22 && Math.abs(rr) < 0.22;
        if (upright && Math.abs(c.wr) < 1.2 && Math.abs(c.wp) < 1.2) {
          // fell back onto its wheels: drive off the way it's sliding
          const sp = Math.hypot(c.vx, c.vy), fd = U.dirVec(c.h), along = c.vx * fd.x + c.vy * fd.y;
          if (sp > 2 && along > -0.3 * sp && Math.abs(along) < 0.8 * sp) {
            const nh = Math.atan2(c.vx, -c.vy);
            if (!this.cartBlocked(c.x, c.y, nh)) c.h = nh;
          }
          const fd2 = U.dirVec(c.h);
          Object.assign(c, { free: false, freeT: 0, wp: c.wp * 0.3, wr: c.wr * 0.3, v: c.vx * fd2.x + c.vy * fd2.y });
          c.wobV += 3; TU.audio.play('land');
        } else if (Math.abs(c.wr) < 0.5 && Math.abs(c.wp) < 0.5 && Math.hypot(c.vx, c.vy) < 1) {
          c.rest += dt;
          if (c.rest > 2.5) { c.flip = 1.4; c.rest = 0; } // properly stuck: the caddy helps
        } else c.rest = 0;
        return;
      }

      // planted on four wheels: engine, brakes, rolling resistance
      const mul = this.cartMul(S, c.x, c.y) || 0.4;
      const v0 = c.v;
      if (!brake) c.stopT = 0;
      if (gas) c.v = Math.min(Math.max(c.v, maxV * mul), c.v + 12 * dt);
      else if (brake) {
        // brake to a stop first; only after holding at a standstill for a moment does it reverse
        c.stopT = c.v <= 0.05 ? (c.stopT || 0) + dt : 0;
        c.v = c.v > 0 ? Math.max(0, c.v - 18 * dt) : c.stopT > 0.5 ? Math.max(-5, c.v - 6 * dt) : c.v;
      }
      else c.v -= Math.sign(c.v) * Math.min(Math.abs(c.v), 4 * dt);
      if (gas && c.v > maxV * mul && !(c.nitroT > 0)) c.v = Math.max(maxV * mul, c.v - 10 * dt);
      // NITRO: a huge shove forward for a couple of seconds (hit a crest at this speed and you fly)
      if (S.nitro && (K.pressed('nitro') || this.nitroReq) && (this.nitroCharge ?? 1) >= 1 && !(c.nitroT > 0)) {
        c.nitroT = 2.6; this.nitroCharge = 0;
        TU.audio.play('drive'); TU.audio.play('swing'); this.bump(0.6);
        this.showBanner('NITRO!', '', 0.9);
      }
      this.nitroReq = false;
      if (c.nitroT > 0) { c.nitroT -= dt; c.v = Math.min(maxV * 2.4, Math.max(c.v, 0) + 46 * dt); }
      // gravity along the slope: roll downhill, crawl uphill (off-road tires grip better)
      const d0 = U.dirVec(c.h), gr = TU.terrain.grad(hole, c.x, c.y), along = gr.x * d0.x + gr.y * d0.y;
      c.v -= along * GRAVITY * 0.55 * S.traction * dt;
      // weight transfer: hard braking dives the nose, throttle lifts it, turning leans the body
      const accel = (c.v - v0) / dt;
      c.dive += (U.clamp(-accel * 0.012, -0.08, 0.16) - c.dive) * Math.min(1, dt * 8);
      c.lean += (U.clamp(-turn * c.v / maxV * 0.14, -0.14, 0.14) - c.lean) * Math.min(1, dt * 6);
      // suspension: the body follows the ground through springs
      c.wp += (-S.k * rp - S.damp * c.wp) * dt; c.wr += (-S.k * rr - S.damp * c.wr) * dt;
      c.p += c.wp * dt; c.r += c.wr * dt;
      // skid marks when braking or turning hard at speed
      this.skidT = (this.skidT || 0) - dt;
      if ((brake && c.v > 6) || (turn && Math.abs(c.v) > 11)) {
        if (this.skidT <= 0) { this.skidT = 0.04; for (const s of [-0.55, 0.55]) { const l = U.dirVec(c.h + Math.PI / 2); R3.addSkid(c.x - d0.x * 0.8 + l.x * s, c.y - d0.y * 0.8 + l.y * s, c.h); } }
        if (brake && c.v > 8 && !this.skidSound) { TU.audio.play('swing'); this.skidSound = true; }
      } else this.skidSound = false;

      // hover kit: hold RUN to lift off
      if (S.fly && K.down('run')) {
        Object.assign(c, { air: true, flying: true, vx: d0.x * c.v, vy: d0.y * c.v, vz: 5, fv: c.v, airP: 0, airR: 0, airGas: !gas, cy: c.z + S.com + 0.05 });
        TU.audio.play('swing');
        return;
      }
      const yawRate = turn * 1.7 * U.clamp(c.v / 4, -1, 1);
      const nh = c.h + yawRate * dt;
      if (!this.cartBlocked(c.x, c.y, nh)) c.h = nh;
      // tipping over: a steep side slope or a fast sharp turn pushes the weight past the wheels
      const balR = Math.atan2(S.track, S.com), balP = Math.atan2(1.25, S.com);
      const lat = Math.atan(yawRate * c.v / GRAVITY) * S.grip, tipR = t.r * S.traction - lat;
      const tipP = t.p * S.traction + U.clamp(-accel / GRAVITY, -1, 1) * 0.25;
      if (Math.abs(tipR) > balR || Math.abs(tipP) > balP) {
        const side = Math.abs(tipR) > balR ? Math.sign(tipR) : 0, fwd = side ? 0 : Math.sign(tipP);
        Object.assign(c, { free: true, freeT: 0, rest: 0, vx: d0.x * c.v, vy: d0.y * c.v, wr: c.wr + side * 2.5, wp: c.wp + fwd * 2.5 });
        TU.audio.play('bad'); this.bump(0.6);
        this.showBanner(side ? 'TIPPING OVER!' : 'WHOA!', side ? 'Too steep or too sharp a turn' : '', 1.4);
        return;
      }
      let d = U.dirVec(c.h), nx = c.x + d.x * c.v * dt, ny = c.y + d.y * c.v * dt;
      let why = this.cartWhy(S, c.x, c.y, nx, ny, c.h), stuck = false;
      if (why) {
        // never a dead stop: glance off and slide along whatever's in the way (the smallest turn that clears it)
        const impact = Math.abs(c.v), k = Math.min(1, dt * 10);
        let ok = null;
        for (const a of [0.2, 0.45, 0.75, 1.05, 1.35, 1.57]) {
          for (const s of [1, -1]) {
            const dd = U.dirVec(c.h + s * a), hh = c.h + s * a * k;
            const tx = c.x + dd.x * c.v * dt, ty = c.y + dd.y * c.v * dt;
            if (!this.cartWhy(S, c.x, c.y, tx, ty, hh)) { ok = { a, hh, tx, ty }; break; }
          }
          if (ok) break;
        }
        if (ok) {
          c.h = ok.hh; nx = ok.tx; ny = ok.ty; d = U.dirVec(c.h);
          c.v *= 1 - (1 - Math.cos(ok.a)) * 0.05; // scraping along costs a little speed, not all of it
        } else { c.v = -c.v * 0.3; stuck = true; } // boxed in on every side: the only time it bounces back
        if (impact > 3 && this.blockMsgT <= 0) {
          TU.audio.play(why === 'tree' ? 'tree' : 'land');
          c.wobV += (Math.random() < 0.5 ? -1 : 1) * impact * 0.2;
          this.bump(Math.min(0.7, impact / 18));
          const msg = { G: 'No carts on the green! Park and walk.', O: 'Out of bounds.', deep: 'The woods are too thick to drive further', bev: 'Beep beep! Mind the beverage cart.' }[why];
          if (msg) this.showBanner(msg, '', 1.4);
          this.blockMsgT = 1.2;
        }
      }
      const gNow = this.cartGround(c.x, c.y), gNext = this.cartGround(nx, ny);
      if (!stuck) {
        c.x = nx; c.y = ny; this.cartDist = Math.abs(c.v * dt);
        // leave the ground if it drops away faster than gravity can follow (cliffs, crests, ramps)
        const vzGround = dt > 0 ? (gNext - c.z) / dt : 0;
        if (vzGround < c.vz - GRAVITY * dt - 5 && Math.abs(c.v) > 2) {
          Object.assign(c, { air: true, flying: false, vx: d.x * c.v, vy: d.y * c.v, airP: 0, airR: 0, airGas: !gas, cy: c.z + S.com, tiltP: t.p, tiltR: t.r });
          // leave the lip with the upward speed you had climbing it, so ramps actually throw you up
          c.vz = Math.max(c.vz, (c.climb || 0) * 0.95) + S.pop; // (+ the lift kit's springs)
          if (c.v > 8) this.showBanner('AIRBORNE!', 'Hold reverse to backflip  -  run + steer to barrel roll', 0.9);
        } else {
          // bumps compress the springs: the body bounces (a lot more with the lift kit)
          c.wobV -= U.clamp(vzGround - c.vz, -6, 6) * (S.lift ? 1.2 : 0.5);
          // remember how fast we've been climbing just now (decays quickly) for launching off crests
          c.climb = Math.max(vzGround, (c.climb || 0) - 26 * dt);
          c.vz = vzGround; c.z = gNext; c.cy = c.z + S.com;
        }
      }
      // water: aqua tires float, anything else sinks
      const tile = Ph.tileAt(hole, c.x, c.y);
      if (tile === 'W') {
        if (S.tires !== 'aqua' && this.deepWater(c.x, c.y)) return this.startSink();
      } else {
        // remember where it was safely on dry land (to fish it out after a dunk)
        c.safeT -= dt;
        if (c.safeT <= 0) { c.safeT = 0.3; c.trail.push({ x: c.x, y: c.y, h: c.h }); if (c.trail.length > 8) c.trail.shift(); }
      }
      if (Math.abs(c.v) < 1.5 && K.pressed('cart')) {
        const l = U.dirVec(c.h - Math.PI / 2);
        // hop out on whichever side is nearer the ball (and free), then face the ball
        const sides = [1, -1].map(k => ({ x: c.x + l.x * 1.4 * k, y: c.y + l.y * 1.4 * k, k }))
          .filter(p => !this.walkBlocked(p.x, p.y))
          .sort((a, b) => U.dist(a, this.ball) - U.dist(b, this.ball));
        if (!sides.length && tile === 'W') { this.showBanner("You can't get out on the water", 'Drive to dry land first', 1.2); return; }
        const ex = sides.length ? sides[0] : { x: c.x + l.x * 1.4, y: c.y + l.y * 1.4, k: 1 };
        this.walker = this.makeWalker(ex.x, ex.y, U.angleTo(ex, this.ball));
        this.holdRelease = true;
        if (this.cad) { this.cad.x = c.x - l.x * 1.4 * ex.k; this.cad.y = c.y - l.y * 1.4 * ex.k; } // caddy gets out the other side
        c.v = 0;
        this.state = 'walk';
        TU.audio.play('click');
      }
    },
    // touchdown after a jump: wheels first = landing (and maybe a trick), anything else = tumble
    cartLand(S, t, rp, rr, g, sup) {
      const c = this.cart, impact = -c.vz, d = U.dirVec(c.h);
      c.flying = false; c.climb = 0;
      c.cy = g + sup; c.z = c.cy - S.com;
      if (this.deepWater(c.x, c.y) && S.tires !== 'aqua') { c.air = false; return this.startSink(); }
      // wheels touch first unless it's badly nose-, tail- or side-down
      if (Math.abs(rp) < 1.4 && Math.abs(rr) < 1.0) {
        const flips = Math.round(Math.abs(c.airP) / (Math.PI * 2)), rolls = Math.round(Math.abs(c.airR) / (Math.PI * 2));
        c.p = t.p + rp; c.r = t.r + rr;
        if (impact > S.hard) {
          c.vz = Math.min(6, impact * S.bounce); c.vx *= 0.97; c.vy *= 0.97; c.cy = g + sup + 0.02; // bounce, keeping your momentum
          c.wobV += Math.min(impact, 14) * 0.6; TU.audio.play('land'); this.bump(Math.min(0.8, impact / 14));
          if (this.blockMsgT <= 0 && !flips && !rolls) { this.showBanner('HARD LANDING!', '', 1); this.blockMsgT = 1.2; }
        } else {
          Object.assign(c, { air: false, vz: 0, fv: null, v: (c.vx * d.x + c.vy * d.y) * 0.97 });
          c.wobV += impact * 0.4; this.bump(impact / 20); TU.audio.play('land');
        }
        if (flips || rolls) {
          const name = flips ? (c.airP < 0 ? 'BACKFLIP' : 'FRONTFLIP') : 'BARREL ROLL';
          const n = flips || rolls;
          this.showBanner(`${n > 1 ? n + 'x ' : ''}${name}!${flips && rolls ? ' + ROLL' : ''}`, 'Stuck the landing!', 1.8, true);
          TU.audio.play('clap');
        }
        c.airP = c.airR = 0;
        return;
      }
      // landed on its side, roof or nose: keep tumbling
      // landed on its side, roof or nose: tumble on (keeping the speed) and roll back onto the wheels
      Object.assign(c, { air: false, free: true, freeT: 0, rest: 0, vz: 0, wp: c.wp * 0.6, wr: c.wr * 0.6, vx: c.vx * 0.95, vy: c.vy * 0.95 });
      TU.audio.play('thud'); this.bump(Math.min(0.7, 0.3 + impact / 25));
    },
    // a puddle no bigger than the cart (a couple of tiles) is too shallow to sink in: you just splash through
    deepWater(x, y) { return Ph.tileAt(this.hole, x, y) === 'W' && R3.waterSizeAt(x, y) > 2 && !this.onRoad(x, y, 4.5); },
    // within r yards of the cart road's centre line (the road is always safe to drive, even where a lake edge touches it)
    onRoad(x, y, r) {
      const P = this.hole.path;
      if (!P || P.length < 2) return false;
      for (let k = 0; k < P.length - 1; k++) {
        const [ax, ay] = P[k], [bx, by] = P[k + 1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
        const u = U.clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1);
        if (Math.hypot(x - ax - dx * u, y - ay - dy * u) < r) return true;
      }
      return false;
    },
    startSink() {
      const c = this.cart;
      Object.assign(c, { sink: 2.6, v: 0, vx: 0, vy: 0, vz: 0, air: false, free: false });
      TU.audio.play('splash');
      TU.FX.burst(c.x, c.y, (R3.waterLevelAt(c.x, c.y) ?? c.z) + 0.2, { n: 50, colors: [0xffffff, 0xbfe6ff, 0x7fc8f0], spread: 2.2, up: 6, life: 1.1 });
      this.showBanner('SPLASH!', "Carts don't float... it's sinking!", 2.2);
    },
    updateSink(dt, S) {
      const c = this.cart, lvl = R3.waterLevelAt(c.x, c.y) ?? c.z;
      c.sink -= dt;
      c.cy = Math.max(lvl - 2.6, c.cy - dt * 0.9);
      c.z = c.cy - S.com;
      c.p += (0.35 - c.p) * dt; c.r += (0.15 - c.r) * dt; // nose goes down first
      this.bubT = (this.bubT || 0) - dt;
      if (this.bubT <= 0) { this.bubT = 0.15; TU.FX.burst(c.x + (Math.random() - 0.5) * 1.5, c.y + (Math.random() - 0.5) * 1.5, lvl, { n: 3, colors: [0xffffff, 0xd8f0ff], spread: 0.3, up: 1.2, gravity: 2, life: 0.6 }); }
      if (c.sink > 0) return;
      this.startFishout();
    },
    // Cutscene: you climb out onto the bank, your caddy runs over, throws a rope and hauls the cart
    // up from the bottom and back onto dry land.
    startFishout() {
      if (this.roaming) return this.roamRescue();
      const c = this.cart, hole = this.hole;
      // the nearest bit of solid bank to where it sank, so the haul is short and easy to follow
      const dryOk = (x, y) => { const t = Ph.tileAt(hole, x, y); return t !== 'W' && t !== 'O' && t !== 'G' && !Ph.deepForest(hole, x, y) && !Ph.treeAt(hole, x, y, 1.2) && !R3.obstacleAt(x, y, 1.2); };
      let best = null;
      for (let d = 1; d <= 40 && !best; d += 1) for (let k = 0; k < 32; k++) {
        const a = k / 32 * Math.PI * 2, v = U.dirVec(a), x = c.x + v.x * d, y = c.y + v.y * d;
        if (!dryOk(x, y) || !dryOk(x + v.x * 4, y + v.y * 4) || !dryOk(x + v.x * 8, y + v.y * 8)) continue;
        if (!best || d < best.d) best = { d, a, x, y };
      }
      const fallback = c.trail[0] || { x: this.ball.x, y: this.ball.y };
      const away = best ? U.dirVec(best.a) : U.dirVec(U.angleTo(c, fallback));
      const edge = best ? { x: best.x, y: best.y } : fallback;
      const to = { x: edge.x + away.x * 2.6, y: edge.y + away.y * 2.6, h: Math.atan2(-away.x, away.y) }; // nose toward the water, dragged out backwards
      const side = { x: -away.y, y: away.x };
      const caddyAt = { x: to.x + away.x * 4.5, y: to.y + away.y * 4.5 };
      // you watch from the bank, well clear of the cart (longer carts need more room)
      const ex = this.cartEx || 0;
      let you = { x: edge.x + side.x * (5 + ex) + away.x * 3, y: edge.y + side.y * (5 + ex) + away.y * 3 };
      if (!dryOk(you.x, you.y)) you = { x: edge.x - side.x * (5 + ex) + away.x * 3, y: edge.y - side.y * (5 + ex) + away.y * 3 };
      this.walker = this.makeWalker(you.x, you.y, U.angleTo(you, c));
      let start = this.cad ? { x: this.cad.x, y: this.cad.y } : { x: caddyAt.x + side.x * 9, y: caddyAt.y + side.y * 9 };
      if (U.dist(start, caddyAt) > 18 || Ph.tileAt(hole, start.x, start.y) === 'W') start = { x: caddyAt.x - side.x * 9, y: caddyAt.y - side.y * 9 };
      const haul = U.dist(c, to);
      // paced so you can follow it: run over, throw, the cart surfaces, then a steady haul up the bank
      const RUN = U.clamp(U.dist(start, caddyAt) / 4.5, 1.2, 3), THROW = RUN + 1.1, RISE = THROW + 1.8, DRAG = RISE + Math.max(2.4, haul / 2), DRY = DRAG + 1.4;
      this.fish = { t: 0, from: { x: c.x, y: c.y, cy: c.cy, p: c.p, r: c.r }, to, caddyAt, start, away, lvl: R3.waterLevelAt(c.x, c.y) ?? c.z, dripT: 0, RUN, THROW, RISE, DRAG, DRY };
      c.h = to.h;
      if (this.cad) Object.assign(this.cad, { x: start.x, y: start.y, moving: false });
      if (!this.rope) { this.rope = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 1, 5), R3.mat(0xd8c08a)); R3.scene.add(this.rope); }
      this.rope.visible = false;
      this.state = 'fishout';
      this.banner = null;
      this.snapCamera = true;
      TU.audio.engine(0);
    },
    updateFishout(dt, act) {
      const F = this.fish, c = this.cart, cd = this.cad, S = this.cartSpec();
      F.t += dt;
      if (act && F.t > 0.8) return this.endFishout();
      const { RUN, THROW, RISE, DRAG, DRY } = F, smooth = u => u * u * (3 - 2 * u);
      this.cartDist = 0;
      // the caddy jogs to the bank, throws the rope, then leans back and pulls with small backward steps
      if (cd) {
        if (F.t < RUN) {
          const u = smooth(F.t / RUN);
          cd.x = U.lerp(F.start.x, F.caddyAt.x, u); cd.y = U.lerp(F.start.y, F.caddyAt.y, u);
          cd.face = U.angleTo(F.start, F.caddyAt); cd.moving = true; cd.running = true; cd.phase += dt * 11;
        } else if (F.t < RISE) { cd.moving = false; cd.face = U.angleTo(cd, c); }
        else if (F.t < DRAG) {
          const back = smooth((F.t - RISE) / (DRAG - RISE)) * 1.8;
          cd.x = F.caddyAt.x + F.away.x * back; cd.y = F.caddyAt.y + F.away.y * back;
          cd.face = U.angleTo(cd, c); cd.moving = true; cd.running = false; cd.phase -= dt * 3.5;
        } else { cd.moving = false; cd.face = U.angleTo(cd, c); }
      }
      const lvl = F.lvl, surface = lvl - 0.5 + S.com;
      if (F.t >= THROW && F.t < RISE) {
        // slowly floats up off the bottom, bobbing as it breaks the surface
        const u = smooth((F.t - THROW) / (RISE - THROW));
        c.x = F.from.x; c.y = F.from.y;
        c.cy = U.lerp(F.from.cy, surface, u) + Math.sin(F.t * 4) * 0.06 * u;
        c.p = U.lerp(F.from.p, 0.05, u); c.r = U.lerp(F.from.r, 0, u) + Math.sin(F.t * 3) * 0.04 * u;
        F.dripT -= dt;
        if (u > 0.6 && F.dripT <= 0) { F.dripT = 0.2; TU.FX.burst(c.x, c.y, lvl, { n: 5, colors: [0xffffff, 0xbfe6ff], spread: 1, up: 2, life: 0.6 }); }
      } else if (F.t >= RISE && F.t < DRAG) {
        // a steady haul backwards up onto the bank
        const u = smooth((F.t - RISE) / (DRAG - RISE)), px = c.x, py = c.y;
        c.x = U.lerp(F.from.x, F.to.x, u); c.y = U.lerp(F.from.y, F.to.y, u);
        this.cartDist = -Math.hypot(c.x - px, c.y - py);
        const wet = Ph.tileAt(this.hole, c.x, c.y) === 'W', g = Ph.groundAt(this.hole, c.x, c.y);
        c.cy = Math.max(wet ? surface : g + S.com, g + S.com) + (wet ? Math.sin(F.t * 4) * 0.04 : 0);
        const t2 = this.cartTilt(c.x, c.y, c.h);
        c.p += ((wet ? 0.05 : t2.p) - c.p) * Math.min(1, dt * 3); c.r += ((wet ? 0 : t2.r) - c.r) * Math.min(1, dt * 3);
        F.dripT -= dt;
        if (wet && F.dripT <= 0) { F.dripT = 0.15; TU.FX.burst(c.x, c.y, lvl, { n: 5, colors: [0xffffff, 0xbfe6ff], spread: 1, up: 2, life: 0.6 }); if (Math.random() < 0.25) TU.audio.play('splash'); }
      } else if (F.t >= DRAG) {
        F.dripT -= dt;
        if (F.dripT <= 0) { F.dripT = 0.2; TU.FX.burst(c.x + (Math.random() - 0.5), c.y + (Math.random() - 0.5), c.z + 0.6, { n: 3, colors: [0xbfe6ff], spread: 0.2, up: 0.2, gravity: 10, life: 0.5 }); }
      }
      c.z = c.cy - S.com;
      // the rope runs from the caddy's hands to the back of the cart
      if (this.rope && cd && F.t >= RUN + 0.5 && F.t < DRAG + 0.3) {
        const throwU = U.clamp((F.t - RUN - 0.5) / 0.6, 0, 1); // it flies out over the water first
        const a = new T.Vector3(cd.x, Ph.groundAt(this.hole, cd.x, cd.y) + 1.1, cd.y);
        const rear = U.dirVec(c.h + Math.PI), end = new T.Vector3(c.x + rear.x * 1.3, Math.max(c.cy, lvl - 0.3) + 0.1, c.y + rear.y * 1.3);
        const b = a.clone().lerp(end, throwU), dir = b.clone().sub(a), L = dir.length();
        if (L > 0.05) {
          this.rope.visible = true;
          this.rope.position.copy(a).addScaledVector(dir, 0.5);
          this.rope.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
          this.rope.scale.set(1, L, 1);
        }
      } else if (this.rope) this.rope.visible = false;
      if (F.t > DRY) this.endFishout();
    },
    endFishout() {
      const F = this.fish;
      Object.assign(this.cart, this.cartAt(F.to.x, F.to.y, F.to.h));
      if (this.rope) this.rope.visible = false;
      if (this.cad) Object.assign(this.cad, { x: F.caddyAt.x, y: F.caddyAt.y, moving: false });
      this.fish = null;
      this.state = 'walk';
      this.holdRelease = true;
      this.snapCamera = true;
      this.showBanner('Fished out!', 'Your caddy hauled the cart back to dry land', 2);
    },
    holed(note) {
      const diff = this.strokes - this.hole.par;
      Object.assign(this.ball, { x: this.hole.pin.x, y: this.hole.pin.y, vx: 0, vy: 0 });
      TU.audio.play('rattle');
      TU.FX.trailFade();
      if (diff < 0 || this.strokes === 1) {
        setTimeout(() => TU.audio.play(diff <= -2 || this.strokes === 1 ? 'bigclap' : 'clap'), 350);
        const pin = this.hole.pin, ph = Ph.groundAt(this.hole, pin.x, pin.y);
        TU.FX.burst(pin.x, pin.y, ph + 2.4, { n: diff <= -2 || this.strokes === 1 ? 160 : 80, colors: TU.FX.CONFETTI, spread: 3, up: 5, gravity: 4, drag: 1.5, life: 2.6 });
      } else if (diff === 0) setTimeout(() => TU.audio.play('coin'), 300);
      this.cheerT = diff <= 0 ? 0.001 : 0;
      const n = `${this.strokes} stroke${this.strokes > 1 ? 's' : ''}`;
      this.startCut(TU.Round.scoreName(diff, this.strokes), note ? `${note} - ${n}` : n, diff <= 0);
      this.resultT = 3.6;
    },
    // Hole-out cutscene: letterboxed, the camera swings round to face the golfer and caddy,
    // and the score sits in the bottom bar instead of over the characters.
    startCut(title, sub, happy) {
      this.banner = null; this.bubble = null; this.feedback = null;
      G3.address(this.golfer, this.shotStart.x, this.shotStart.y, this.aim);
      const g = this.golfer.root.position, f = U.dirVec(this.aim + Math.PI), r = { x: -f.y, y: f.x };
      const caddy = { x: g.x + r.x * 1.6 + f.x * 0.3, y: g.z + r.y * 1.6 + f.y * 0.3 };
      const cx = (g.x + caddy.x) / 2, cy = (g.z + caddy.y) / 2;
      // pick the camera angle with the fewest trees in the way
      let best = 0, bestN = 1e9;
      for (const off of [0.35, -0.35, 0.9, -0.9]) {
        const v = U.dirVec(this.aim + Math.PI + off);
        let n = 0;
        for (let k = 1.5; k <= 7; k += 1) if (Ph.hasTree(this.hole, cx + v.x * k, cy + v.y * k) || (this.cart && this.cartHit(cx + v.x * k, cy + v.y * k, 0.6))) n++;
        if (n < bestN) { bestN = n; best = off; }
      }
      this.cut = { title, sub, happy, t: 0, gx: g.x, gy: g.z, cx, cy, a0: this.aim + Math.PI + best, caddy };
      if (happy && !this.cheerT) this.cheerT = 0.001;
      this.state = 'holed';
      this.snapCamera = true;
    },
    finishHole() {
      this.cut = null;
      const r = this.round;
      if (this.mp) { this.mp[r.turn].done = true; return this.nextTurn(); }
      this.player().scores[r.holeIdx] = this.strokes;
      TU.power.holeDone(r);
      // the rest of the field plays the hole too
      if (r.npcs) for (const n of r.npcs) n.scores[r.holeIdx] = TU.career.npcScore(n, this.hole, r.career.t);
      TU.go('scorecard', { round: this.round });
    },

    // ---------- 3D scene ----------
    render3D(dt) {
      const st = this.state, b = this.ball, s0 = this.shotStart;
      const d = U.dirVec(this.aim), r = { x: -d.y, y: d.x };
      R3.update(TU.time);
      TU.FX.update(dt);
      if (st === 'flight') TU.FX.trailPush(R3.ball.position);
      R3.sign.visible = true;
      R3.setBall(b.x, b.y, b.z || 0);
      if (this.otherBalls) this.otherBalls.forEach((m, i) => {
        const o = this.mp[i], show = i !== this.round.turn && !o.done && o.strokes > 0;
        m.visible = show;
        if (show) { m.position.set(o.ball.x, R3.heightAt(o.ball.x, o.ball.y) + 0.11, o.ball.y); m.scale.setScalar(Math.max(1, R3.camera.position.distanceTo(m.position) / 18)); }
      });

      // golfer + cart
      const g = this.golfer, travel = st === 'walk' || st === 'drive';
      this.placeCaddy(st);
      if (this.online && this.actors) this.placeIdle();
      if (this.cartObj) { this.cartObj.root.visible = true; this.placeCart(st === 'drive' || st === 'arrive' || st === 'fishout' ? this.cartDist || 0 : st === 'ride' ? Math.abs(this.cart.v || 0) * dt : 0); }
      if (this.carts) this.carts.forEach((K, k) => {
        if (k !== this.cartIdx) { K.obj.root.visible = true; this.placeCart(Math.abs(K.st.v || 0) * dt, k); }
        if (this.online) C3.setBags(K.obj, this.bagColors(k));
      });
      this.cartDist = 0;
      if (st === 'walk' && this.walker.sitting) {
        // seated on the bench, hips on the planks, facing out
        const bn = this.walker.sitting, f = U.dirVec(bn.face);
        G3.placeAt(g, bn.x - f.x * 0.12, bn.y - f.y * 0.12, bn.face);
        g.root.position.y = bn.seat - g.hipY + 0.1;
        g.pose({ mode: 'sit' });
      } else if (st === 'walk') {
        const w = this.walker;
        G3.placeAt(g, w.x, w.y, w.face);
        g.root.position.y = w.z;
        g.pose(w.stumble > 0 ? { mode: 'stumble', t: w.stumble } : w.moving ? { mode: 'walk', walk: w.phase } : { mode: 'stand' });
        R3.clearTrees(w.x, w.y, 0, U.dirVec(w.face), 5);
      } else if (st === 'fishout') {
        // dripping wet on the bank, watching the rescue
        const w = this.walker;
        G3.placeAt(g, w.x, w.y, U.angleTo(w, this.cart));
        g.pose({ mode: 'stand' });
      } else if (st === 'arrive' && this.walker) {
        const w = this.walker;
        G3.placeAt(g, w.x, w.y, w.face);
        g.root.position.y = w.z;
        g.pose(w.moving ? { mode: 'walk', walk: w.phase } : { mode: 'stand' });
      } else if (st === 'ride' && this.ride && this.carts) {
        // in the back row of someone else's cart
        const obj = this.carts[this.ride.k].obj;
        g.pose({ mode: 'sit' });
        g.root.quaternion.copy(obj.root.quaternion);
        g.root.position.copy(C3.seatPos(obj, -(g.hipY - 0.1), 1, this.ride.row));
      } else if (st === 'drive' || st === 'arrive') {
        g.pose({ mode: 'sit' });
        g.root.quaternion.copy(this.cartObj.root.quaternion);
        g.root.position.copy(C3.seatPos(this.cartObj, -(g.hipY - 0.1)));
        R3.clearTrees(this.cart.x, this.cart.y, 0, U.dirVec(this.cart.h), 7.5);
      } else {
        if (st === 'holed' && this.cut) {
          // face the camera; celebrate on par or better
          G3.address(g, s0.x, s0.y, this.aim);
          G3.placeAt(g, g.root.position.x, g.root.position.z, this.aim + Math.PI);
          if (this.cut.happy && this.cheerT > 0.4) { g.pose({ mode: 'cheer', t: this.cheerT }); g.root.position.y += g.hop; } else g.pose({ mode: 'stand' });
        } else if (st === 'holed' && this.cheerT > 0.4) {
          // turn to face the camera and celebrate
          G3.address(g, s0.x, s0.y, this.aim);
          G3.placeAt(g, g.root.position.x, g.root.position.z, this.aim + Math.PI);
          g.pose({ mode: 'cheer', t: this.cheerT });
          g.root.position.y += g.hop;
        } else {
          g.pose({ mode: this.putting ? 'putt' : 'swing', swing: this.swing });
          G3.address(g, s0.x, s0.y, this.aim);
        }
        R3.clearTrees(s0.x, s0.y, 5, d);

      }
      R3.setMarker(b.x, b.y, travel, TU.time);

      // markers
      const aiming = st === 'aim' || st === 'swing';
      const puttAim = st === 'putt' || st === 'puttswing';
      if (this.spectating) {
        // the shooter's own aim line, as they see it
        this.arc = (aiming || puttAim) && !this.roamCam() ? this.specArc : null;
        R3.setDots([]); R3.setRing(0, 0, false);
      } else if (aiming) {
        // preview the ball's flight arc: its height depends on the club's loft and LOW/MID/HIGH
        // the arc grows and shrinks with the power bar while you swing
        const m = this.meter, pw = st !== 'swing' ? 1 : m.state === 'power' ? m.pos : m.power;
        const c = this.shownCarry() * Math.max(0.05, pw), apex = this.peakHeight() * Math.max(0.05, pw), h0 = Ph.groundAt(this.hole, b.x, b.y), pts = [];
        for (let k = 0; k <= 48; k++) {
          const u = k / 48, x = b.x + d.x * c * u, y = b.y + d.y * c * u;
          pts.push(new T.Vector3(x, h0 + 4 * apex * u * (1 - u) + 0.12, y));
        }
        this.arc = { pts, end: new T.Vector3(b.x + d.x * c, Ph.groundAt(this.hole, b.x + d.x * c, b.y + d.y * c) + 0.1, b.y + d.y * c), pw, color: pw > 1.02 ? '#ff6a4a' : '#ffe066' };
        R3.setDots([]);
        R3.setRing(0, 0, false);
      } else if (puttAim) {
        // the line your caddy *thinks* the putt takes (only Ace reads it perfectly)
        const pts = Ph.simulatePutt(this.hole, b, this.aim, this.pread.dist, this.pread.slope);
        const m = this.meter, pw = st === 'puttswing' ? (m.state === 'power' ? m.pos : m.power) * this.puttScale / Math.max(0.5, this.pread.dist) : 0.7;
        const shown = pts.slice(0, Math.max(2, Math.ceil(pts.length * U.clamp(pw, 0.05, 1))));
        this.arc = { pts: shown.map(q => new T.Vector3(q.x, R3.heightAt(q.x, q.y) + 0.06, q.y)), color: '#ffffff', putt: true };
        R3.setDots([]);
        R3.setRing(0, 0, false);
      } else { R3.setDots([]); R3.setRing(0, 0, false); }
      if (!aiming && !puttAim) this.arc = null;
      if (this.spectating && this.state === 'wait') {
        // waiting for their first update: stand them at their ball
        G3.placeAt(g, this.shotStart.x, this.shotStart.y, this.aim); g.pose({ mode: 'stand' });
      }
      R3.showArrows(this.putting && st !== 'holed' && !travel, TU.time);

      // camera
      let eye, look, k = 1 - Math.pow(0.02, dt);
      if (this.roamCam()) {
        const R = this.roam, K0 = this.carts[R.cartIdx];
        ({ eye, look, k } = this.chaseCam(R.state === 'walk' ? 'walk' : 'drive', R.walker, K0.st, K0.obj.ex || 0, dt));
      } else if (this.cut) {
        // slow orbit in front of the golfer and caddy
        const q = this.cut, f = U.dirVec(q.a0 + q.t * 0.1), cx = q.cx, cy = q.cy;
        eye = { x: cx + f.x * 6.5, y: cy + f.y * 6.5, h: 2.2 };
        look = { x: cx, y: cy, h: 1.1 };
        R3.clearTrees(cx, cy, 1.5, f, 8);
        // nothing between the camera and the stars of the show
        if (this.cartObj) {
          const c = this.cart, ex = eye.x - cx, ey = eye.y - cy, L = ex * ex + ey * ey, u = U.clamp(((c.x - cx) * ex + (c.y - cy) * ey) / L, 0, 1);
          this.cartObj.root.visible = Math.hypot(c.x - cx - ex * u, c.y - cy - ey * u) > 2.2;
        }
        k = 1 - Math.pow(0.05, dt);
      } else if (st === 'fishout') {
        // side-on shot of the bank so you see the caddy, the rope and the cart coming out
        // a steady wide shot from the side: water, bank, caddy and rope all in frame
        const F = this.fish, side = { x: -F.away.y, y: F.away.x };
        const mid = { x: (F.from.x + F.caddyAt.x) / 2, y: (F.from.y + F.caddyAt.y) / 2 }, span = U.dist(F.from, F.caddyAt);
        if (F.camSide == null) {
          const blocked = sd => { let n = 0; for (let d = 3; d < 18; d += 3) if (Ph.hasTree(this.hole, mid.x + side.x * d * sd, mid.y + side.y * d * sd)) n++; return n; };
          F.camSide = blocked(1) <= blocked(-1) ? 1 : -1;
        }
        const cd = this.cad, w = this.walker, c = this.cart, G = (x, y) => Ph.groundAt(this.hole, x, y);
        const pts = [{ x: c.x, y: c.y, h: c.cy }, { x: w.x, y: w.y, h: G(w.x, w.y) + 1 }];
        if (cd) pts.push({ x: cd.x, y: cd.y, h: G(cd.x, cd.y) + 1 });
        const shot = this.frameShot(pts, { x: side.x * F.camSide, y: side.y * F.camSide }, 10);
        eye = shot.eye; look = shot.look;
        k = 1 - Math.pow(0.08, dt);
      } else if (st === 'arrive') {
        // side-on shot of the cart pulling up, then following the walk to the ball
        const a = this.arrive, w = this.walker, fx = w ? (w.x + this.ball.x) / 2 : this.cart.x, fy = w ? (w.y + this.ball.y) / 2 : this.cart.y;
        const mid = { x: (a.to.x + this.ball.x) / 2, y: (a.to.y + this.ball.y) / 2 };
        if (a.side == null) {
          // film from whichever side has fewer trees in the way
          const open = sd => { const v = U.dirVec(a.to.h + sd * Math.PI / 2); let n = 0; for (let k = 2; k <= 11; k += 1.5) if (Ph.hasTree(this.hole, mid.x + v.x * k, mid.y + v.y * k)) n++; return n; };
          a.side = open(1) <= open(-1) ? 1 : -1;
        }
        const side = U.dirVec(a.to.h + a.side * Math.PI / 2), c = this.cart, cd = this.cad, G = (x, y) => Ph.groundAt(this.hole, x, y);
        // keep the cart, you, your caddy and the ball all in the shot
        const pts = [{ x: c.x, y: c.y, h: c.cy || c.z + 1 }, { x: this.ball.x, y: this.ball.y, h: G(this.ball.x, this.ball.y) + 0.5 }];
        if (w) pts.push({ x: w.x, y: w.y, h: G(w.x, w.y) + 1 });
        if (cd && a.walked) pts.push({ x: cd.x, y: cd.y, h: G(cd.x, cd.y) + 1 });
        const shot = this.frameShot(pts, side, 9);
        eye = shot.eye; look = shot.look;
        k = 1 - Math.pow(0.08, dt);
      } else if (st === 'walk' && this.bevMode === 'approach' && this.bev && this.bevA) {
        // a showcase shot of the beverage cart as you walk up and the vendor says hello
        const A = this.bevA, b = this.bev, w = this.walker, G = (x, y) => Ph.groundAt(this.hole, x, y);
        const l = U.dirVec(b.h - Math.PI / 2), f = U.dirVec(b.h), turn = A.t * 0.07;
        const sx = l.x * A.side * 0.8 + f.x * 0.6, sy = l.y * A.side * 0.8 + f.y * 0.6, cs = Math.cos(turn), sn = Math.sin(turn);
        const side = { x: sx * cs - sy * sn, y: sx * sn + sy * cs }, n = Math.hypot(side.x, side.y) || 1;
        const shot = this.frameShot([{ x: b.x, y: b.y, h: G(b.x, b.y) + 1.4 }, { x: w.x, y: w.y, h: G(w.x, w.y) + 1 }], { x: side.x / n, y: side.y / n }, 8);
        eye = shot.eye; look = shot.look;
        k = 1 - Math.pow(0.08, dt);
      } else if (st === 'walk' || st === 'drive' || st === 'ride') {
        ({ eye, look, k } = this.chaseCam(st === 'walk' ? 'walk' : 'drive', this.walker, this.cart, this.cartEx || 0, dt));
      } else if (this.view === 'top' && (st === 'aim' || st === 'putt')) {
        const reach = this.putting ? U.dist(b, this.hole.pin) / 2 : this.expCarry() / 2;
        const cx = b.x + d.x * reach, cy = b.y + d.y * reach, hgt = this.putting ? 16 : Math.max(60, reach * 1.6);
        eye = { x: cx - d.x * hgt * 0.3, y: cy - d.y * hgt * 0.3, h: hgt };
        look = { x: cx, y: cy, h: 0 };
        k = 1 - Math.pow(0.001, dt);
      } else if (aiming || st === 'downswing' && !this.putting) {
        eye = { x: s0.x - d.x * 6.5 + r.x * 0.2, y: s0.y - d.y * 6.5 + r.y * 0.2, h: 2.2 };
        look = { x: s0.x + d.x * 14, y: s0.y + d.y * 14, h: -1.2 };
      } else if (puttAim || this.putting) {
        eye = { x: s0.x - d.x * 4.2 + r.x * 1.4, y: s0.y - d.y * 4.2 + r.y * 1.4, h: 3.2 };
        look = { x: s0.x + d.x * 5, y: s0.y + d.y * 5, h: 0 };
        if (st === 'roll' || st === 'result' || st === 'holed') {
          eye = { x: s0.x - d.x * 4.2 + r.x * 1.4, y: s0.y - d.y * 4.2 + r.y * 1.4, h: 3.6 };
          look = { x: b.x, y: b.y, h: 0 };
        }
        k = 1 - Math.pow(0.05, dt);
      } else {
        // chase the ball
        const f = this.flight ? this.flight.dir : d, z = b.z || 0;
        const back = st === 'flight' ? 10 : 8;
        eye = { x: b.x - f.x * back, y: b.y - f.y * back, h: z * 0.9 + 3.5 };
        look = { x: b.x + f.x * 12, y: b.y + f.y * 12, h: z * 0.5 };
        k = 1 - Math.pow(st === 'flight' ? 0.0005 : 0.01, dt);
      }
      const eh = Math.max(R3.heightAt(eye.x, eye.y) + 0.5, eye.ay != null ? eye.ay : R3.heightAt(eye.x, eye.y) + eye.h);
      const tE = new T.Vector3(eye.x, eh, eye.y), tL = new T.Vector3(look.x, look.ay != null ? look.ay : R3.heightAt(look.x, look.y) + look.h, look.y);
      if (this.snapCamera) { this.camPos.copy(tE); this.camLook.copy(tL); this.snapCamera = false; }
      else { this.camPos.lerp(tE, k); this.camLook.lerp(tL, k); }
      R3.camera.position.copy(this.camPos);
      R3.camera.lookAt(this.camLook);
      // things that grow with distance (so you can still spot them far away) are sized from where the camera
      // is now, not last frame: otherwise a camera cut makes them pop up huge for a frame
      const camP = R3.camera.position;
      R3.ball.scale.setScalar(Math.max(1, camP.distanceTo(R3.ball.position) / 18));
      if (R3.marker.visible) R3.marker.scale.setScalar(Math.max(1, camP.distanceTo(R3.marker.position) / 25));
      if (this.otherBalls) this.otherBalls.forEach(m => { if (m.visible) m.scale.setScalar(Math.max(1, camP.distanceTo(m.position) / 18)); });
      this.seeThrough(st);
      if (this.shake > 0) {
        const k2 = this.shake * 0.35;
        R3.camera.position.x += (Math.random() - 0.5) * k2; R3.camera.position.y += (Math.random() - 0.5) * k2; R3.camera.position.z += (Math.random() - 0.5) * k2;
        this.shake = Math.max(0, this.shake - dt * 2.2);
      }
    },

    // chase camera behind someone walking or driving
    chaseCam(st, w, cart, ex, dt) {
      let eye, look, k;
      const p = st === 'walk' ? w : cart, f = U.dirVec(st === 'walk' ? p.face : p.h);
      if (st === 'drive') {
        // chase cam pinned to the cart itself (not the ground under the camera), so jumps and
        // flights stay in frame: it pulls back with speed and height and keeps up quickly in the air
        const c = cart, sp = c.air ? Math.hypot(c.vx, c.vy) : Math.abs(c.v), above = Math.max(0, c.z - Ph.groundAt(this.hole, c.x, c.y));
        const back = 7.5 + Math.min(5, sp * 0.18) + Math.min(4, above * 0.15) + ex * 0.8;
        const vf = c.air && sp > 2 ? { x: c.vx / sp, y: c.vy / sp } : f; // follow where it's going while flying
        eye = { x: c.x - vf.x * back, y: c.y - vf.y * back, ay: c.z + 3.2 + Math.min(3, above * 0.12) };
        look = { x: c.x + vf.x * 5, y: c.y + vf.y * 5, ay: c.z + 0.8 + Math.min(c.vz || 0, 0) * 0.15 };
        k = 1 - Math.pow(c.air ? 0.0005 : 0.01, dt);
      } else {
        const back = 5, lift = p.z - Ph.groundAt(this.hole, p.x, p.y); // height above ground (jumps, falls)
        eye = { x: p.x - f.x * back, y: p.y - f.y * back, h: 2.6 + Math.max(0, lift) };
        look = { x: p.x + f.x * 6, y: p.y + f.y * 6, h: 0.9 + Math.max(0, lift) * 0.7 };
        k = 1 - Math.pow(0.01, dt);
      }
      return { eye, look, k };
    },

    placeCaddy(st) {
      const m = this.caddyObj, cd = this.cad;
      if (!m || !cd) return;
      if (this.cut) {
        const q = this.cut.caddy;
        G3.placeAt(m, q.x, q.y, this.aim + Math.PI);
        if (this.cut.happy && this.cheerT > 0.6) { m.pose({ mode: 'cheer', t: this.cheerT + 0.3 }); m.root.position.y += m.hop; } else m.pose({ mode: 'stand' });
        return;
      }
      if (st === 'ride' && this.ride && this.carts) {
        const obj = this.carts[this.ride.k].obj;
        m.pose({ mode: 'sit' }); m.root.quaternion.copy(obj.root.quaternion);
        m.root.position.copy(C3.seatPos(obj, -(m.hipY - 0.1), -1, this.ride.row));
        return;
      }
      if ((st === 'drive' || (st === 'arrive' && !this.walker)) && this.cartObj) {
        m.pose({ mode: 'sit' });
        m.root.quaternion.copy(this.cartObj.root.quaternion);
        m.root.position.copy(C3.seatPos(this.cartObj, -(m.hipY - 0.1), -1));
        return;
      }
      G3.placeAt(m, cd.x, cd.y, cd.face);
      if (st === 'holed' && this.cheerT > 0.5 && !cd.moving) { m.pose({ mode: 'cheer', t: this.cheerT + 0.3 }); m.root.position.y += m.hop; return; }
      m.pose(cd.moving ? { mode: 'walk', walk: cd.phase * (cd.running ? 1.3 : 1) } : { mode: 'stand' });
    },

    // Cart pose from its physics state: rotate around the center of mass so tumbles and flips look right.
    placeCart(dist, k = this.cartIdx) {
      const pc = this.carts ? this.carts[k] : { st: this.cart, obj: this.cartObj }, live = k === this.cartIdx;
      const c = pc.st, S = this.cartSpec(k), planted = !c.air && !c.free && !c.flip && !c.sink, obj = pc.obj;
      if (c.cy == null) c.cy = c.z + S.com;
      c.dive = c.dive || 0; c.lean = c.lean || 0; c.wob = c.wob || 0;
      const pitch = c.p + (planted ? c.dive + c.wob * 0.12 : 0), roll = c.r + (planted ? c.lean + c.wob * 0.2 : 0);
      const root = obj.root;
      root.rotation.set(pitch, Math.PI - c.h, roll, 'YXZ');
      // the center of mass sits mid-chassis (further back on long carts)
      const off = (this.comV || (this.comV = new T.Vector3())).set(0, S.com, -S.ex / 2).applyEuler(root.rotation);
      C3.place(obj, c.x, c.y, c.h, dist, { pitch, roll, z: c.cy - off.y, bob: planted ? c.wob * (S.lift ? 0.12 : 0.05) : 0, rotor: S.fly && live ? (c.air ? 0.9 : this.state === 'drive' ? 0.2 : 0) : 0, thrust: S.fly && c.air && live ? (K.down('run') && !this.spectating ? 1 : 0.35) : 0, nitro: live && c.nitroT > 0 });
      if (live && c.nitroT > 0) {
        const back = U.dirVec(c.h + Math.PI), ex = S.ex || 0;
        TU.FX.burst(c.x + back.x * (2 + ex / 2), c.y + back.y * (2 + ex / 2), c.cy - S.com + 0.5, { n: 4, colors: [0x66aaff, 0xffffff, 0xffa040], spread: 0.6, up: 0.6, gravity: 0, drag: 3, life: 0.35, dx: back.x * 8, dy: back.y * 8 });
        this.bump(0.12);
      }
      // c.x, c.y is the centre of the cart; the offset above already puts the middle of a long cart there
      root.position.x -= off.x; root.position.z -= off.z;
    },

    // ---------- HUD ----------
    drawUI(c) {
      const h = this.hole, r = this.round;
      if ((this.cut || this.state === 'arrive' || this.state === 'fishout' || (this.bevMode === 'approach' && this.bevA)) && !this.paused && !this.roamCam()) return this.drawCutUI(c);
      if (this.arc && !this.gate) this.drawArc(c);
      if (this.spectating) return this.drawSpectateUI(c);
      ui.panel(c, 16, 16, 280, 82, { fill: '#14261d' });
      ui.text(c, `HOLE ${r.holeIdx + 1}/${r.course.holes.length}`, 30, 28, { size: 12, color: '#ffe066' });
      ui.text(c, `PAR ${h.par}   ${h.yards} YDS`, 30, 50, { size: 10 });
      ui.text(c, `STROKES ${this.strokes}`, 30, 72, { size: 10, color: '#cfe8d8' });
      this.drawTurnStrip(c);

      if (!this.paused && ui.button(c, 308, 20, 92, 34, 'MENU', { size: 8, color: '#55606a' })) { this.paused = true; ui.nav = true; ui.focus = 0; }
      this.drawWind(c, 812, 16);
      if (!this.putting && ['aim', 'swing', 'result', 'walk', 'drive', 'ride'].includes(this.state)) this.drawMinimap(c);

      const club = bag[this.clubIdx];
      const shotState = ['aim', 'swing'].includes(this.state), puttState = ['putt', 'puttswing'].includes(this.state);
      if (shotState || puttState) {
        ui.panel(c, 16, 424, 250, 100, { fill: '#14261d' });
        const toPin = U.dist(this.ball, h.pin);
        ui.text(c, club.name.toUpperCase(), 141, 434, { size: 12, align: 'center', color: '#ffe066' });
        if (this.putting) {
          ui.text(c, this.pread && !this.pread.exact ? `~${Math.round(this.pread.dist * 3)} FT (CADDY)` : `${Math.round(toPin * 3)} FT TO HOLE`, 141, 458, { size: 10, align: 'center' });
          ui.text(c, 'Arrows point DOWNHILL.', 141, 480, { size: 8, align: 'center', color: '#cfe8d8' });
          ui.text(c, 'White dots = caddy line.', 141, 496, { size: 8, align: 'center', color: '#cfe8d8' });
          ui.text(c, `Aim: ${K.hint('aimLeft')}/${K.hint('aimRight')} keys`, 141, 512, { size: 6, align: 'center', color: '#8fb3a0' });
        } else {
          ui.text(c, `CARRY ~${Math.round(this.shownCarry())} YDS  -  PEAK ${Math.round(this.peakHeight())} YDS`, 141, 454, { size: 6, align: 'center' });
          ui.text(c, this.read && !this.read.exact ? `PIN ~${this.read.dist} YDS (CADDY)` : `PIN ${Math.round(toPin)} YDS`, 141, 466, { size: 8, align: 'center' });
          ui.text(c, `LIE: ${Ph.TERRAIN[this.lie].name}`, 141, 480, { size: 6, align: 'center', color: '#cfe8d8' });
          // flight height (irons and wedges)
          if (this.canTraj()) {
            ['low', 'mid', 'high'].forEach((t, k) => {
              if (ui.button(c, 30 + k * 74, 494, 70, 22, Ph.TRAJ[t].label, { size: 6, color: this.flightH() === t ? '#c07a1e' : '#2b4a3a' }) && this.state === 'aim') this.setTraj(t);
            });
          } else ui.text(c, `FLIGHT: MID (${club.type === 'wood' ? 'woods' : 'this club'} only hit mid)`, 141, 500, { size: 6, align: 'center', color: '#8fb3a0' });
          if (this.state === 'aim') {
            if (ui.button(c, 24, 430, 30, 26, '<', { size: 10, color: '#3d6fb0' })) this.cycleClub(-1);
            if (ui.button(c, 228, 430, 30, 26, '>', { size: 10, color: '#3d6fb0' })) this.cycleClub(1);
          }
        }
        if (this.state === 'aim' || this.state === 'putt') {
          if (ui.button(c, 726, 452, 68, 30, 'AIM<', { size: 8, color: '#3d6fb0' })) this.aim -= this.putting ? 0.01 : 0.03;
          if (ui.button(c, 800, 452, 68, 30, 'AIM>', { size: 8, color: '#3d6fb0' })) this.aim += this.putting ? 0.01 : 0.03;
          if (ui.button(c, 874, 452, 68, 30, this.view === '3d' ? 'MAP' : '3D', { size: 8, color: '#55606a' })) this.view = this.view === '3d' ? 'top' : '3d';
        }
        this.meter.draw(c, 282, 456, 436);
      }
      if ((this.state === 'walk' || this.state === 'drive') && this.cartObj && this.cartSpec().radio) this.drawRadio(c);
      if (this.state === 'walk' || this.state === 'drive' || this.state === 'ride') {
        const st = this.state, p = st === 'walk' ? this.walker : this.cart;
        ui.panel(c, 250, 452, 460, 72, { fill: '#14261d' });
        ui.text(c, `BALL: ${Math.round(U.dist(p, this.ball))} YDS AWAY`, 268, 464, { size: 10, color: '#ffe066' });
        let hint;
        const H = K.hint, move = `${H('forward')}/${H('left')}/${H('back')}/${H('right')}`;
        if (st === 'ride') {
          const drv = this.cartRiders(this.cartIdx).find(q => q.row === 0);
          hint = drv ? `Riding with ${this.round.players[drv.i].name}   ${H('cart')}: hop out (when it stops)` : `${H('forward')}: take the wheel   ${H('cart')}: hop out`;
        } else if (st === 'drive') {
          const S = this.cartSpec();
          hint = `${H('forward')}/${H('back')}: gas/brake  ${H('left')}/${H('right')}: steer  ` + (Math.abs(this.cart.v) < 1.5 ? `${H('cart')}: get out` : '(stop to get out)') + (S.fly ? `  ${H('run')}: fly` : '') + (S.radio ? `  ${H('radio')}: radio` : '');
        }
        else if (this.holdRelease) hint = 'Let go of the keys to start walking';
        else if (this.nearBall) hint = `${H('swing')} or click: play your shot`;
        else if (this.walker && this.walker.sitting) hint = `Taking a seat...   ${move} or ${H('cart')}: get up`;
        else if (this.nearCart) hint = `${H('cart')}: get in ${this.online && this.carts[this.nearCartIdx].owner !== this.online.me ? this.round.players[this.carts[this.nearCartIdx].owner].name + "'s" : 'the'} cart   ${move}: walk`;
        else if (this.nearBench) hint = `${H('cart')}: sit on the bench   ${move}: walk`;
        else hint = `${move}: walk   hold ${H('run')}: run`;
        ui.text(c, hint, 268, 486, { size: hint.length > 56 ? 6 : 8 });
        ui.text(c, st !== 'walk' ? `SPEED ${Math.round(Math.abs(this.cart.v) * 2.05)} MPH  -  paths are fastest` : 'Follow the yellow marker to your ball', 268, 504, { size: 8, color: '#cfe8d8' });
        if (st !== 'ride' && ui.button(c, 726, 470, 216, 40, 'SKIP TO BALL', { size: 10, color: '#55606a' })) this.skipTravel();
        if (st === 'drive' && this.cartSpec().nitro) {
          // the nitro button fills up as it recharges
          const ch = this.nitroCharge ?? 1, firing = this.cart.nitroT > 0, ready = ch >= 1 && !firing;
          if (ui.button(c, 726, 428, 216, 34, '', { color: ready ? '#1f6fd8' : '#1d2f4a' }) && ready) this.nitroReq = true;
          c.fillStyle = firing ? 'rgba(255,160,64,0.85)' : 'rgba(102,170,255,0.55)';
          c.fillRect(726, 428, 216 * (firing ? Math.max(0, this.cart.nitroT / 2.6) : ch), 32);
          ui.text(c, firing ? 'NITRO!!!' : ready ? `NITRO  (${K.hint('nitro')})` : `NITRO CHARGING ${Math.floor(ch * 100)}%`, 834, 438, { size: 8, align: 'center' });
        }
      }
      if (this.bubble && !this.paused) this.drawBubble(c);
      TU.bev.drawHUD(c, this);
      if (!this.paused) TU.bev.drawUI(c, this);
      if (this.feedback && this.feedback.text) {
        const t = this.feedback.text;
        const col = t.startsWith('PERFECT') ? '#7dff9a' : t === t.toUpperCase() ? '#ff8a6a' : '#ffe066';
        ui.text(c, t, 480, 380, { size: 18, align: 'center', color: col });
      }
      this.drawBanner(c);
      if (this.state === 'result' || this.state === 'holed') ui.text(c, 'Click to continue', 480, 510, { size: 8, align: 'center', color: '#fff' });
      if (this.gate && !this.paused) {
        const p = this.player(), o = this.mp[this.round.turn];
        c.fillStyle = 'rgba(0,0,0,0.55)';
        c.fillRect(0, 0, 960, 540);
        ui.panel(c, 250, 170, 460, 190, { fill: '#14261d' });
        c.fillStyle = p.mapColor; c.fillRect(270, 190, 36, 36);
        ui.text(c, 'PASS TO', 324, 188, { size: 10, color: '#cfe8d8' });
        ui.text(c, p.name.toUpperCase(), 324, 204, { size: 20, color: '#ffe066' });
        const toPin = Math.round(U.dist(this.ball, this.hole.pin));
        ui.text(c, o.strokes === 0 ? 'Teeing off' : `Stroke ${o.strokes + 1}  -  ${this.putting ? 'on the green' : Ph.TERRAIN[this.lie].name}  -  about ${toPin} yds out`, 480, 250, { size: 8, align: 'center' });
        if (ui.button(c, 380, 284, 200, 52, 'READY', { color: '#c0563a' })) { this.gate = false; this.snapCamera = true; }
      }
      if (this.paused) this.drawPause(c);
    },
    // turn order strip: whose turn it is, everyone's strokes on this hole
    drawTurnStrip(c) {
      if (!this.mp) return;
      const r = this.round, p = this.player(), mine = this.online && r.turn === this.online.me;
      ui.panel(c, 412, 16, 388, 62, { fill: '#14261d' });
      c.fillStyle = p.mapColor; c.fillRect(424, 26, 20, 20);
      ui.text(c, mine ? 'YOUR TURN' : `${p.name.toUpperCase()}'S TURN`, 454, 30, { size: 10, color: '#ffe066' });
      r.players.forEach((q, i) => {
        const x = 412 + i * 64, o = this.mp[i];
        c.fillStyle = q.mapColor; c.fillRect(x + 6, 56, 8, 8);
        ui.text(c, `${q.name.slice(0, 5).toUpperCase()} ${q.left ? 'OUT' : o.done ? o.strokes + '*' : i === r.turn ? this.strokes : o.strokes}`, x + 17, 57, { size: 6, color: i === r.turn ? '#ffe066' : q.left ? '#8a8a8a' : '#e8f4ec' });
      });
    },
    // watching a friend play: the scores, their caddy's chatter and what they're up to (nothing to press)
    drawSpectateUI(c) {
      const h = this.hole, r = this.round, p = this.player();
      ui.panel(c, 16, 16, 280, 82, { fill: '#14261d' });
      ui.text(c, `HOLE ${r.holeIdx + 1}/${r.course.holes.length}`, 30, 28, { size: 12, color: '#ffe066' });
      ui.text(c, `PAR ${h.par}   ${h.yards} YDS`, 30, 50, { size: 10 });
      ui.text(c, `${p.name.toUpperCase()}: ${this.strokes} STROKE${this.strokes === 1 ? '' : 'S'}`, 30, 72, { size: 8, color: '#cfe8d8' });
      this.drawTurnStrip(c);
      this.drawWind(c, 812, 16);
      if (!this.paused && ui.button(c, 308, 20, 92, 34, 'MENU', { size: 8, color: '#55606a' })) { this.paused = true; ui.nav = true; ui.focus = 0; }
      if (this.roamCam()) {
        // free roam: your own walking / driving hints
        const R = this.roam, H = K.hint, move = `${H('forward')}/${H('left')}/${H('back')}/${H('right')}`;
        ui.panel(c, 250, 452, 460, 72, { fill: '#14261d' });
        c.fillStyle = p.mapColor; c.fillRect(266, 464, 14, 14);
        ui.text(c, `${p.name.toUpperCase()} IS PLAYING  -  look around while you wait`, 288, 464, { size: 8, color: '#ffe066' });
        const near = R.nearCart && this.carts[R.nearCartIdx], who = near && near.owner !== this.online.me ? `${r.players[near.owner].name}'s` : 'your';
        const drv = R.state === 'ride' && this.cartRiders(R.cartIdx).find(q => q.row === 0 && q.i !== this.online.me);
        const hint = R.state === 'ride' ? (drv ? `Riding with ${r.players[drv.i].name}   ${H('cart')}: hop out (when it stops)` : `${H('forward')}: take the wheel   ${H('cart')}: hop out`)
          : R.state === 'drive' ? `${H('forward')}/${H('back')}: gas/brake  ${H('left')}/${H('right')}: steer  ${H('cart')}: get out (when stopped)`
          : R.walker && R.walker.sitting ? `Taking a seat...   ${move} or ${H('cart')}: get up`
          : near ? `${H('cart')}: get in ${who} cart   ${move}: walk` : R.nearBench ? `${H('cart')}: sit on the bench   ${move}: walk` : `${move}: walk   hold ${H('run')}: run`;
        ui.text(c, hint, 268, 488, { size: hint.length > 56 ? 6 : 8 });
        ui.text(c, 'The camera jumps to the ball when they swing.', 268, 506, { size: 6, color: '#8fb3a0' });
        this.drawBanner(c);
        if (this.paused) this.drawPause(c);
        return;
      }
      const doing = { wait: 'getting ready', aim: 'lining up a shot', swing: 'swinging...', downswing: 'swinging...', flight: 'in the air!', roll: 'rolling...', result: 'taking a look', putt: 'reading the putt', puttswing: 'putting...', walk: 'walking to the ball', drive: 'driving to the ball', holed: 'in the hole!' }[this.state] || '';
      ui.panel(c, 250, 470, 460, 54, { fill: '#14261d' });
      c.fillStyle = p.mapColor; c.fillRect(266, 484, 24, 24);
      ui.text(c, `WATCHING ${p.name.toUpperCase()}`, 302, 482, { size: 10, color: '#ffe066' });
      ui.text(c, doing + (this.state === 'drive' && this.cartOwner() ? `  (in ${this.cartOwner()}'s cart)` : ''), 302, 502, { size: 8, color: '#cfe8d8' });
      if (this.bubble && !this.paused) this.drawBubble(c);
      if (this.feedback && this.feedback.text) ui.text(c, this.feedback.text, 480, 380, { size: 18, align: 'center', color: this.feedback.text.startsWith('PERFECT') ? '#7dff9a' : '#ffe066' });
      this.drawBanner(c);
      if (this.paused) this.drawPause(c);
    },
    drawPause(c) {
      {
        c.fillStyle = 'rgba(0,0,0,0.6)';
        c.fillRect(0, 0, 960, 540);
        ui.text(c, 'PAUSED', 480, 150, { size: 32, align: 'center', color: '#ffe066' });
        if (ui.button(c, 360, 230, 240, 50, 'RESUME')) { this.paused = false; ui.nav = false; }
        if (ui.button(c, 360, 300, 240, 50, this.round.returnTo ? 'BACK TO EDITOR' : this.online ? 'LEAVE GAME' : 'QUIT TO MENU', { color: '#b03a3a' })) { if (this.online) TU.net.leave(); TU.go(this.round.returnTo || 'home', { resume: true }); }
      }
    },
    drawBanner(c) {
      if (!this.banner) return;
      {
        const b = this.banner, size = b.big ? 32 : 16;
        const w = Math.min(920, Math.max(360, b.title.length * size + 60, (b.sub || '').length * 10 + 40));
        // pop in with a little overshoot, fade out at the end
        const age = (b.t0 || b.t) - b.t, k = Math.min(1, age / 0.25), sc = k < 1 ? 0.6 + 0.4 * k + Math.sin(k * Math.PI) * 0.12 : 1;
        c.save();
        c.globalAlpha = Math.min(1, b.t / 0.3, 0.2 + k);
        c.translate(480, 150); c.scale(sc, sc); c.translate(-480, -150);
        ui.panel(c, 480 - w / 2, 120, w, b.sub ? (b.big ? 110 : 80) : 56, { fill: 'rgba(16,36,26,0.92)' });
        ui.text(c, b.title, 480, 138, { size, align: 'center', color: b.big ? '#ffe066' : '#fff' });
        if (b.sub) ui.text(c, b.sub, 480, b.big ? 192 : 168, { size: 10, align: 'center', color: '#cfe8d8' });
        c.restore();
      }
    },
    // The aim arc, projected onto the full-resolution UI layer so it stays crisp in pixelated mode:
    // a dark outline, a bright core and dots marching along it.
    drawArc(c) {
      const cam = R3.camera, P = new T.Vector3(), scr = [];
      for (const q of this.arc.pts) {
        P.copy(q).project(cam);
        if (P.z > 1) { scr.push(null); continue; }
        scr.push({ x: (P.x + 1) * 480, y: (1 - P.y) * 270 });
      }
      const path = () => { c.beginPath(); let on = false; for (const q of scr) { if (!q) { on = false; continue; } if (on) c.lineTo(q.x, q.y); else { c.moveTo(q.x, q.y); on = true; } } };
      c.save();
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = 'rgba(10,20,14,0.55)'; c.lineWidth = 6; path(); c.stroke();
      c.strokeStyle = this.arc.color; c.lineWidth = 2.5; path(); c.stroke();
      // marching dots show the direction of travel
      const ph = (TU.time * 2) % 1;
      c.fillStyle = '#ffffff';
      for (let i = 0; i < scr.length - 1; i += 4) {
        const a = scr[i], b = scr[i + 1];
        if (!a || !b) continue;
        c.beginPath(); c.arc(a.x + (b.x - a.x) * ph, a.y + (b.y - a.y) * ph, 2.2, 0, Math.PI * 2); c.fill();
      }
      if (this.arc.end) {
        P.copy(this.arc.end).project(cam);
        if (P.z < 1) {
          const x = (P.x + 1) * 480, y = (1 - P.y) * 270;
          c.strokeStyle = 'rgba(10,20,14,0.6)'; c.lineWidth = 5; c.beginPath(); c.ellipse(x, y, 9, 4.5, 0, 0, Math.PI * 2); c.stroke();
          c.strokeStyle = this.arc.color; c.lineWidth = 2; c.beginPath(); c.ellipse(x, y, 9, 4.5, 0, 0, Math.PI * 2); c.stroke();
        }
      }
      c.restore();
    },
    // letterbox bars for cutscenes; text lives in the bars, never over the characters
    drawCutUI(c) {
      const q = this.cut, t = q ? q.t : (this.arrive || this.fish || this.bevA).t, bar = 74 * Math.min(1, t / 0.35);
      c.fillStyle = '#000';
      c.fillRect(0, 0, 960, bar); c.fillRect(0, 540 - bar, 960, bar);
      if (t < 0.3) return;
      const r = this.round;
      if (q) {
        const k = Math.min(1, (t - 0.3) / 0.3), sc = 0.7 + 0.3 * k + Math.sin(k * Math.PI) * 0.1;
        ui.text(c, `${this.holeTitle().toUpperCase().replace(': ', '  -  ')}  -  PAR ${this.hole.par}`, 480, 28, { size: 10, align: 'center', color: '#cfe8d8' });
        if (this.mp) ui.text(c, this.player().name.toUpperCase(), 480, 48, { size: 8, align: 'center', color: this.player().mapColor });
        c.save(); c.translate(480, 488); c.scale(sc, sc); c.translate(-480, -488);
        ui.text(c, q.title, 480, 476, { size: q.title.length > 12 ? 20 : 26, align: 'center', color: q.happy ? '#ffe066' : '#ffffff' });
        c.restore();
        ui.text(c, q.sub, 480, 512, { size: 8, align: 'center', color: '#cfe8d8' });
        if (q.t > 0.8) ui.text(c, 'Click to continue', 940, 524, { size: 6, align: 'right', color: '#8fb3a0' });
      } else {
        ui.text(c, this.bevA ? 'THE BEVERAGE CART' : this.fish ? 'SPLASH!  THE CART SANK' : `${Math.round(U.dist(this.ball, this.hole.pin))} YDS TO THE PIN`, 480, 28, { size: 10, align: 'center', color: '#cfe8d8' });
        ui.text(c, this.bevA ? (this.bevA.arr == null ? 'It pulled over! Walking up to say hello...' : '"Hey there! Fancy a drink or a snack?"') : this.fish ? (this.fish.t < this.fish.RUN ? 'Your caddy runs to the rescue...' : this.fish.t < this.fish.RISE ? 'Rope tied on... up she comes!' : this.fish.t < this.fish.DRAG ? 'Heave... ho! Hauling the cart out of the water' : 'Back on dry land. Still dripping!') : this.walker ? 'Walking up to your ball...' : 'Your caddy drives you over...', 480, 488, { size: 10, align: 'center', color: '#ffffff' });
        ui.text(c, 'Click to skip', 940, 524, { size: 6, align: 'right', color: '#8fb3a0' });
      }
    },
    drawBubble(c) {
      const cd = this.online ? (TU.caddy.list[this.player().caddy] || TU.caddy.list[0]) : TU.caddy.current(), lines = ui.wrap(c, this.bubble.text, 200, 8);
      const x = 16, y = 108, h = Math.max(78, 30 + lines.length * 14);
      ui.panel(c, x, y, 280, h, { fill: '#f6efd9', border: '#3a2e1a', light: 'rgba(255,255,255,0.4)' });
      // portrait: face, hat band in the caddy's color
      const px = x + 31, py = y + 30;
      TU.Portrait.draw(c, 'caddy' + TU.caddy.list.indexOf(cd), cd.look, x + 9, y + 9, 46, cd.color);
      ui.text(c, cd.name.toUpperCase(), px + 1, y + 62, { size: 6, align: 'center', color: '#3a2e1a', shadow: false });
      lines.forEach((l, i) => ui.text(c, l, x + 66, y + 12 + i * 14, { size: 8, color: '#2d2a20', shadow: false }));
    },
    drawWind(c, x, y) {
      ui.panel(c, x, y, 132, 82, { fill: '#14261d' });
      // full shots show the caddy's read of the wind; putts and travel show the real wind
      const rd = this.read && !this.read.exact && (this.state === 'aim' || this.state === 'swing') ? this.read : null;
      const spd = rd ? rd.wspd : this.wind.speed, dirW = rd ? rd.wdir : this.wind.dir;
      ui.text(c, rd ? 'WIND (CADDY)' : 'WIND', x + 66, y + 8, { size: rd ? 6 : 8, align: 'center', color: '#cfe8d8' });
      const rel = dirW - (this.view === 'top' ? 0 : this.aim);
      const cx = x + 40, cy = y + 50, d = U.dirVec(rel);
      c.strokeStyle = '#fff';
      c.lineWidth = 4;
      c.beginPath(); c.moveTo(cx - d.x * 16, cy - d.y * 16); c.lineTo(cx + d.x * 16, cy + d.y * 16); c.stroke();
      c.fillStyle = '#fff';
      c.beginPath();
      c.moveTo(cx + d.x * 22, cy + d.y * 22);
      c.lineTo(cx + d.x * 10 - d.y * 9, cy + d.y * 10 + d.x * 9);
      c.lineTo(cx + d.x * 10 + d.y * 9, cy + d.y * 10 - d.x * 9);
      c.fill();
      ui.text(c, `${spd}`, x + 100, y + 34, { size: 16, align: 'center', color: '#ffe066' });
      ui.text(c, 'MPH', x + 100, y + 58, { size: 8, align: 'center' });
    },
    // map marker colors: chosen in the shop; in multiplayer each player gets their own automatically
    mapColor() { const p = this.player(); return p.mapColor || (p.look && p.look.mapColor) || '#3d8bff'; },
    cartMapColor() { return this.cartData().mapColor || '#ffe066'; },
    drawMinimap(c) {
      const tex = this.tex, k = Math.min(116 / tex.w, 270 / tex.h);
      const w = tex.w * k, h = tex.h * k, x = 944 - w - 8, y = 112;
      ui.panel(c, x, y, w, h, { fill: '#14261d' });
      c.imageSmoothingEnabled = true;
      c.drawImage(tex.canvas, x, y, w, h);
      c.imageSmoothingEnabled = false;
      const M = (wx, wy) => ({ x: x + wx * 2 * k, y: y + wy * 2 * k });
      const pin = M(this.hole.pin.x, this.hole.pin.y), b = M(this.ball.x, this.ball.y);
      const youCol = this.mapColor(), cartCol = this.cartMapColor();
      if (this.state === 'aim' || this.state === 'swing') {
        const d = U.dirVec(this.aim), e = this.shownCarry(), l = M(this.ball.x + d.x * e, this.ball.y + d.y * e);
        c.strokeStyle = '#ffe066'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(l.x, l.y); c.stroke();
        c.beginPath(); c.arc(l.x, l.y, 4, 0, Math.PI * 2); c.stroke();
      }
      // pin flag
      c.strokeStyle = '#f4f4f4'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(pin.x, pin.y + 3); c.lineTo(pin.x, pin.y - 9); c.stroke();
      c.fillStyle = '#e74c3c'; c.beginPath(); c.moveTo(pin.x + 1, pin.y - 9); c.lineTo(pin.x + 9, pin.y - 6); c.lineTo(pin.x + 1, pin.y - 3); c.fill();
      // caddy
      if (this.cad && this.state !== 'drive') { const q = M(this.cad.x, this.cad.y); c.fillStyle = '#5fd38a'; c.beginPath(); c.arc(q.x, q.y, 2.5, 0, Math.PI * 2); c.fill(); }
      // cart: a small yellow cart pointing where it faces
      if (this.cart) {
        const q = M(this.cart.x, this.cart.y);
        c.save(); c.translate(q.x, q.y); c.rotate(this.cart.h);
        c.fillStyle = '#0b1410'; c.fillRect(-5, -7, 10, 14);
        c.fillStyle = cartCol; c.fillRect(-4, -6, 8, 12);
        c.fillStyle = '#7a5c12'; c.fillRect(-3, -5, 6, 3);
        c.restore();
      }
      // other players' balls in their colors
      if (this.mp) this.mp.forEach((o, i) => {
        if (i === this.round.turn || o.done || !o.strokes) return;
        const q = M(o.ball.x, o.ball.y);
        c.fillStyle = '#0b1410'; c.beginPath(); c.arc(q.x, q.y, 3.5, 0, Math.PI * 2); c.fill();
        c.fillStyle = this.round.players[i].mapColor; c.beginPath(); c.arc(q.x, q.y, 2.3, 0, Math.PI * 2); c.fill();
      });
      // ball
      c.fillStyle = '#0b1410'; c.beginPath(); c.arc(b.x, b.y, 4.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(b.x, b.y, 3, 0, Math.PI * 2); c.fill();
      // you: a blue arrow showing where you're facing (in the cart while driving, at the ball when aiming)
      const st = this.state;
      const me = st === 'walk' ? { x: this.walker.x, y: this.walker.y, a: this.walker.face }
        : st === 'drive' ? { x: this.cart.x, y: this.cart.y, a: this.cart.h }
        : { x: this.shotStart.x, y: this.shotStart.y, a: this.aim };
      const q = M(me.x, me.y), f = U.dirVec(me.a), rr = { x: -f.y, y: f.x };
      const pulse = 3.5 + Math.sin(TU.time * 6) * 0.8;
      c.strokeStyle = youCol; c.globalAlpha = 0.55; c.lineWidth = 1.5; c.beginPath(); c.arc(q.x, q.y, pulse + 1, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1;
      const tri = (sc, col) => {
        c.fillStyle = col; c.beginPath();
        c.moveTo(q.x + f.x * 8 * sc, q.y + f.y * 8 * sc);
        c.lineTo(q.x - f.x * 5 * sc + rr.x * 5 * sc, q.y - f.y * 5 * sc + rr.y * 5 * sc);
        c.lineTo(q.x - f.x * 2 * sc, q.y - f.y * 2 * sc);
        c.lineTo(q.x - f.x * 5 * sc - rr.x * 5 * sc, q.y - f.y * 5 * sc - rr.y * 5 * sc);
        c.fill();
      };
      tri(0.62, '#ffffff'); tri(0.45, youCol);
      // legend under the map
      const ly = y + h + 10;
      ui.panel(c, x, ly, w, 34, { fill: '#14261d' });
      const L = (lx, yy, col, label) => { c.fillStyle = col; c.fillRect(lx, yy + 1, 7, 7); ui.text(c, label, lx + 11, yy, { size: 6, color: '#e8f4ec' }); };
      L(x + 6, ly + 6, youCol, this.mp ? 'TURN' : 'YOU'); if (this.mp) L(x + w / 2 + 2, ly + 6, '#9aa', 'OTHERS'); else L(x + w / 2 + 2, ly + 6, cartCol, 'CART');
      L(x + 6, ly + 20, '#ffffff', 'BALL'); L(x + w / 2 + 2, ly + 20, '#e74c3c', 'PIN');
    },
  };
})();
