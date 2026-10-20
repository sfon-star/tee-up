// Caddies: each reads the yardage, the wind and the club with a different amount of error.
// Level 0 is a hopeless rookie, level 5 is perfect. Hired caddies are kept; you can switch between them.
(function () {
  const U = TU.util, DEG = Math.PI / 180;
  const look = (o) => Object.assign({
    name: '', hair: 'short', hairColor: '#4a2c17', eyes: 'round', eyeColor: '#2b5d8a', skin: '#e8b48a', height: 1, body: 1,
    shirt: { style: 'tee', color: '#ffffff' }, pants: { style: 'long', color: '#555555' },
    shoes: { style: 'classic', color: '#3a2a1e' }, hat: { style: 'none', color: '#ffffff' }, gloves: { style: 'none', color: '#ffffff' },
  }, o);

  TU.caddy = {
    list: [
      {
        name: 'Dusty', title: 'Rookie Caddy', price: 0, err: { dist: 0.35, wdir: 110, wspd: 1.0, clubP: 0.8, clubOff: 3, aim: 10, flip: 0.3, pDist: 0.4, pBreak: 1.0, pAng: 40 },
        color: '#a0522d', blurb: 'Means well. Counts on his fingers.',
        look: look({ hair: 'long', hairColor: '#b07a3c', skin: '#f5c9a6', body: 0, shirt: { style: 'tee', color: '#a0522d' }, pants: { style: 'shorts', color: '#7f8c8d' }, hat: { style: 'bucket', color: '#e9e2cf' } }),
        hi: ['Uh, okay!', 'Hey there!', 'Lemme think...'],
        lines: ['Pretty sure that\'s right.', 'Give or take. Mostly give.', 'Trust me! Probably.', 'My math is... creative.'],
        good: ['Whoa, did I do that?', 'Nailed it! You, I mean.', 'Wow!'], bad: ['Oops. My bad?', 'Was that my fault?', 'Hmm. Weird.'],
      },
      {
        name: 'Marge', title: 'Weekend Caddy', price: 150, err: { dist: 0.22, wdir: 70, wspd: 0.7, clubP: 0.55, clubOff: 2, aim: 7, flip: 0.15, pDist: 0.25, pBreak: 0.65, pAng: 25 },
        color: '#e67e22', blurb: 'Loves golf. Hates math.',
        look: look({ hair: 'bob', hairColor: '#e3c27a', skin: '#fde0c8', shirt: { style: 'polo', color: '#e67e22' }, pants: { style: 'skirt', color: '#34495e' }, hat: { style: 'visor', color: '#ffffff' } }),
        hi: ['Alright, hon.', 'Here we go!', 'Ooh, pretty hole.'],
        lines: ['Close enough for a Sunday.', 'Swing easy, dear.', 'That\'s my best guess.'],
        good: ['Lovely shot!', 'Ooh, look at that!', 'Wonderful!'], bad: ['Oh dear.', 'Shake it off, hon.', 'Next one, sweetie.'],
      },
      {
        name: 'Hank', title: 'Club Regular', price: 400, err: { dist: 0.12, wdir: 40, wspd: 0.4, clubP: 0.3, clubOff: 1, aim: 4, flip: 0.05, pDist: 0.14, pBreak: 0.38, pAng: 14 },
        color: '#27ae60', blurb: 'Thirty years on this course. Mostly awake.',
        look: look({ hair: 'buzz', hairColor: '#9b9b9b', skin: '#d49a6a', body: 2, shirt: { style: 'polo', color: '#27ae60' }, pants: { style: 'long', color: '#e9e2cf' }, hat: { style: 'cap', color: '#1d1d1d' } }),
        hi: ['Right then.', 'Seen this one before.', 'Okay, listen up.'],
        lines: ['Played it a thousand times.', 'Don\'t overthink it.', 'Keep it simple, kid.'],
        good: ['Now we\'re talking.', 'That\'ll play.', 'Good ball!'], bad: ['Seen worse.', 'We can recover.', 'Breathe, kid.'],
      },
      {
        name: 'Rosa', title: 'Seasoned Pro', price: 900, err: { dist: 0.05, wdir: 18, wspd: 0.15, clubP: 0.08, clubOff: 1, aim: 1.5, flip: 0, pDist: 0.06, pBreak: 0.18, pAng: 6 },
        color: '#c0392b', blurb: 'Former tour player. Very little patience.',
        look: look({ hair: 'ponytail', hairColor: '#1b1209', skin: '#b57a4f', shirt: { style: 'sweater', color: '#c0392b' }, pants: { style: 'long', color: '#1d1d1d' }, hat: { style: 'cap', color: '#c0392b' }, gloves: { style: 'left', color: '#ffffff' } }),
        hi: ['Focus.', 'Listen to me.', 'Here\'s the play.'],
        lines: ['Commit to it.', 'No doubts now.', 'Smooth tempo.'],
        good: ['That\'s the shot.', 'Exactly.', 'Textbook.'], bad: ['Reset. Next shot.', 'Tempo, tempo.', 'Not your best.'],
      },
      {
        name: 'Bones', title: 'Tour Veteran', price: 1800, err: { dist: 0.015, wdir: 6, wspd: 0.06, clubP: 0, clubOff: 0, aim: 0.4, flip: 0, pDist: 0.02, pBreak: 0.06, pAng: 2 },
        color: '#2f80ed', blurb: 'Carried bags for three majors. Never misses.',
        look: look({ hair: 'bald', skin: '#6b4226', height: 2, body: 0, shirt: { style: 'stripes', color: '#2f80ed' }, pants: { style: 'long', color: '#e9e2cf' }, hat: { style: 'cap', color: '#ffffff' } }),
        hi: ['Okay, partner.', 'Here\'s the number.', 'I\'ve got you.'],
        lines: ['That\'s the number.', 'Trust the read.', 'Just make your swing.'],
        good: ['Pure.', 'That\'s money.', 'Right where we wanted.'], bad: ['No worries, partner.', 'We\'ll get it back.', 'Shake it off.'],
      },
      {
        name: 'Ace', title: 'Legend', price: 3500, err: { dist: 0, wdir: 0, wspd: 0, clubP: 0, clubOff: 0, aim: 0, flip: 0, pDist: 0, pBreak: 0, pAng: 0 },
        color: '#f1c40f', blurb: 'Reads the wind like a book. Exact, every time.',
        look: look({ hair: 'short', hairColor: '#f0e2b6', skin: '#e8b48a', shirt: { style: 'polo', color: '#1d1d1d' }, pants: { style: 'long', color: '#1d1d1d' }, shoes: { style: 'spikes', color: '#ffffff' }, hat: { style: 'cowboy', color: '#f1c40f' } }),
        hi: ['Easy one.', 'Here\'s exactly what to do.', 'Watch this.'],
        lines: ['Exact number. Go.', 'This is the shot.', 'Perfect conditions for it.'],
        good: ['Legendary.', 'As planned.', 'Beautiful.'], bad: ['Even legends miss.', 'Next one drops.', 'Patience.'],
      },
    ],
    // during a round the caddy who was paid for is on the bag (Dusty if the fee couldn't be paid)
    current() { return this.list[this.roundLevel != null ? this.roundLevel : TU.save.data.caddyLevel] || this.list[0]; },
    // Tees per round: the better the caddy, the higher the fee
    FEES: [0, 10, 25, 50, 90, 150],
    fee(i = TU.save.data.caddyLevel) { return this.FEES[i] || 0; },
    // charged once at the first tee of a career event or practice round (multiplayer and test rounds are free)
    payFee(round) {
      if (round.caddyLevel != null) return;
      const s = TU.save.data, lvl = s.caddyLevel || 0, fee = this.fee(lvl);
      round.caddyLevel = lvl; round.fee = 0;
      if (!fee || (round.mode !== 'career' && round.mode !== 'quick')) return;
      if (s.tees >= fee) { s.tees -= fee; round.fee = fee; }
      else { round.caddyLevel = 0; round.feeShort = this.list[lvl].name; }
      TU.save.write();
    },
    hired(i) { return i === 0 || !!TU.save.data.owned['caddy:' + i]; },
    pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },

    // Wind direction in words, relative to the line of play.
    windWords(windDir, aim, speed) {
      if (speed < 2) return 'calm';
      const rel = U.wrap(windDir - aim);
      const a = Math.abs(rel);
      if (a < 0.6) return 'helping, at your back';
      if (a > Math.PI - 0.6) return 'into your face';
      return rel > 0 ? 'left to right' : 'right to left';
    },

    // The caddy's read of a full shot: yardage, wind, club and a suggested aim nudge (radians).
    read(scene) {
      const c = this.current(), e = c.err, Ph = TU.physics, bag = TU.clubs.bag, set = TU.clubs.currentSet();
      const trueD = U.dist(scene.ball, scene.hole.pin), aimPin = U.angleTo(scene.ball, scene.hole.pin);
      const dist = Math.max(1, Math.round(trueD * (1 + U.gauss() * e.dist)));
      const wspd = Math.max(0, Math.round(scene.wind.speed * (1 + U.gauss() * e.wspd)));
      const wdir = scene.wind.dir + U.gauss() * e.wdir * DEG + (Math.random() < e.flip ? Math.PI : 0); // rookies sometimes call it backwards
      // pick the club for the distance the caddy believes, adjusted for the wind they believe
      const head = -Math.cos(U.wrap(wdir - aimPin)) * wspd; // + = into the wind
      const plays = dist + head * 1.1;
      let club = -1;
      for (let i = 0; i < bag.length - 1; i++) {
        if (scene.validClub(i) && Ph.expectedCarry(bag[i], set, scene.lie) >= plays * 0.97) club = i;
      }
      if (club < 0) club = scene.validClub(0) ? 0 : 1;
      if (Math.random() < e.clubP) {
        const off = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * e.clubOff));
        for (let k = 0; k < 4; k++) { const j = U.clamp(club + off, 0, bag.length - 2); if (scene.validClub(j)) { club = j; break; } }
      }
      const aimErr = U.gauss() * e.aim * DEG;
      const words = this.windWords(wdir, aimPin, wspd);
      const text = `${this.pick(c.hi)} ${dist} yards to the pin, wind ${wspd ? wspd + ' mph ' : ''}${words}. Hit the ${bag[club].name}. ${this.pick(c.lines)}`;
      return { dist, wspd, wdir, club, aimErr, text, exact: e.dist === 0 };
    },

    // The caddy's read of a putt: distance, and how they think the green breaks.
    // slope(x, y) returns the slope the caddy believes (scaled and turned from the real one).
    readPutt(scene) {
      const c = this.current(), e = c.err, Ph = TU.physics, hole = scene.hole;
      const trueD = U.dist(scene.ball, hole.pin);
      const dist = Math.max(0.3, trueD * (1 + U.gauss() * e.pDist));
      const scale = 1 + U.gauss() * e.pBreak, ang = U.gauss() * e.pAng * DEG, ca = Math.cos(ang), sa = Math.sin(ang);
      const slope = (x, y) => { const s = Ph.slopeAt(hole, x, y); return { x: (s.x * ca - s.y * sa) * scale, y: (s.x * sa + s.y * ca) * scale }; };
      // which way they think it breaks, from their own simulated line
      const aim = U.angleTo(scene.ball, hole.pin), pts = Ph.simulatePutt(hole, scene.ball, aim, dist, slope);
      const end = pts[pts.length - 1] || scene.ball, dv = U.dirVec(aim);
      const side = (end.x - scene.ball.x) * -dv.y + (end.y - scene.ball.y) * dv.x; // + = right of the line
      const amount = Math.abs(side) < 0.15 ? 'Pretty straight.' : `Breaks ${Math.abs(side) < 0.6 ? 'a little' : 'a lot'} ${side > 0 ? 'right' : 'left'}.`;
      const text = `${this.pick(c.hi)} About ${Math.round(dist * 3)} feet. ${amount} ${this.pick(c.lines)}`;
      return { dist, slope, text, exact: e.pDist === 0 };
    },
  };
})();
