// ONLINE lobby: host a room (friends join with its 5-letter code) or join one. Everyone brings their own
// golfer, cart (decals, tires, upgrades) and caddy from their save. The host picks the course and starts.
(function () {
  const ui = TU.ui, input = TU.input, net = TU.net, MAX = 6;

  function myProfile() {
    const s = TU.save.data;
    return { name: s.player.name || 'Player', look: s.player, cart: s.cart, caddy: s.caddyLevel || 0, mapColor: s.cart.mapColor };
  }
  function courses() {
    // your own Architect courses come right after Practice Links (they're sent to everyone when you start)
    const list = [{ label: 'Practice Links', ref: { kind: 'practice' } }];
    TU.architect.courses().forEach(c => list.push({ label: `${c.name} (your course)`, custom: c, ref: { kind: 'custom' } }));
    TU.career.TIERS.forEach((T, t) => T.events.forEach((ev, e) => list.push({ label: `${ev} (${T.name})`, ref: { kind: 'career', t, e } })));
    return list;
  }
  function courseFrom(ref) {
    if (ref.kind === 'career') return TU.career.course(ref.t, ref.e);
    if (ref.kind === 'custom') return JSON.parse(ref.json);
    return TU.courses.get('practice');
  }

  TU.scenes.online = {
    enter() {
      ui.nav = false;
      this.mode = 'menu'; // menu | typing | lobby
      this.code = '';
      this.players = [];
      this.list = courses();
      this.courseIdx = 0;
      this.courseLabel = '';
      this.msg = null;
      net.off();
      net.on('error', d => { this.msg = { text: d.message, t: 4 }; if (this.mode === 'lobby' && !net.isHost) this.mode = 'menu'; });
      net.on('hostgone', () => { if (TU.sceneName === 'online') { this.msg = { text: 'The host left the room.', t: 4 }; this.mode = 'menu'; net.leave(); } });
      // host side
      net.on('hello', (d, msg, conn) => {
        if (!net.isHost) return;
        if (this.players.length >= MAX) return net.sendTo(conn.peer, 'full', {});
        this.players.push({ ...d, peer: conn.peer });
        this.sendLobby();
      });
      net.on('gone', d => {
        if (!net.isHost) return;
        this.players = this.players.filter(p => p.peer !== d.peer);
        this.sendLobby();
      });
      // guest side
      net.on('full', () => { this.msg = { text: 'That room is full (6 players).', t: 4 }; net.leave(); this.mode = 'menu'; });
      net.on('lobby', d => { this.players = d.players; this.courseLabel = d.course; });
      net.on('start', d => this.begin(d));
    },
    sendLobby() { net.send('lobby', { players: this.players, course: this.list[this.courseIdx].label }); },

    hostRoom() {
      if (!net.available()) { this.msg = { text: 'Could not load the online library. Check your internet connection.', t: 4 }; return; }
      this.mode = 'lobby';
      this.players = [{ ...myProfile(), peer: null }];
      net.host(() => { this.players[0].peer = net.myId(); });
    },
    joinRoom() {
      if (!net.available()) { this.msg = { text: 'Could not load the online library. Check your internet connection.', t: 4 }; return; }
      if (this.code.length !== 5) { this.msg = { text: 'Room codes are 5 letters.', t: 2.5 }; return; }
      this.mode = 'lobby';
      this.players = [];
      net.join(this.code, () => net.send('hello', myProfile()));
    },
    start() {
      if (this.players.length < 2) { this.msg = { text: 'Wait for at least one friend to join.', t: 2.5 }; return; }
      const pick = this.list[this.courseIdx], ref = { ...pick.ref };
      if (pick.custom) {
        const bad = pick.custom.holes.map((h, i) => [i, TU.architect.problem(h)]).find(([, pr]) => pr);
        if (bad) { this.msg = { text: `That course needs fixing (hole ${bad[0] + 1}): ${bad[1]}`, t: 3 }; return; }
        ref.json = JSON.stringify(TU.architect.playable(pick.custom));
      }
      const d = { players: this.players, ref, seed: Math.floor(Math.random() * 1e9) };
      net.send('start', d);
      this.begin(d);
    },
    begin(d) {
      const me = d.players.findIndex(p => p.peer === net.myId());
      const players = d.players.map(p => ({ name: p.name, look: p.look, cart: p.cart, caddy: p.caddy, peer: p.peer, mapColor: p.mapColor, color: p.mapColor, scores: [], human: true }));
      TU.Round.assignMapColors(players);
      players.forEach(p => { p.color = p.mapColor; });
      const round = TU.Round.create({ course: courseFrom(d.ref), mode: 'online', players, windMax: 10 });
      round.online = { me: Math.max(0, me), seed: d.seed };
      TU.go('play', { round });
    },

    update(dt) {
      if (this.msg && (this.msg.t -= dt) <= 0) this.msg = null;
      if (this.mode === 'typing') {
        for (const k of input.typed) {
          if (k === 'Backspace') this.code = this.code.slice(0, -1);
          else if (/^[a-zA-Z]$/.test(k) && this.code.length < 5) this.code += k.toUpperCase();
        }
        if (input.isPressed('Enter')) this.joinRoom();
        if (input.isPressed('Escape')) this.mode = 'menu';
        return;
      }
      if (input.isPressed('Escape')) this.back();
    },
    back() {
      if (this.mode === 'lobby') { net.leave(); this.mode = 'menu'; this.players = []; return; }
      net.leave(); TU.go('modes');
    },

    drawUI(c) {
      c.fillStyle = '#0f1a24';
      c.fillRect(0, 0, 960, 540);
      ui.text(c, 'ONLINE', 24, 16, { size: 22, color: '#6ab8ff' });
      ui.text(c, 'Play with friends anywhere: everyone brings their own golfer, cart and caddy.', 24, 50, { size: 6, color: '#d8e8f6' });
      if (this.mode === 'menu' || this.mode === 'typing') {
        ui.panel(c, 120, 120, 330, 260, { fill: '#18283a' });
        ui.text(c, 'HOST A ROOM', 285, 140, { size: 12, align: 'center', color: '#ffe066' });
        ['You get a room code.', 'Send it to your friends,', 'pick a course, press START.'].forEach((l, i) => ui.text(c, l, 285, 180 + i * 20, { size: 8, align: 'center', color: '#cfe0ef' }));
        if (ui.button(c, 175, 300, 220, 56, 'HOST', { color: '#2e7bd0' })) this.hostRoom();
        ui.panel(c, 510, 120, 330, 260, { fill: '#18283a' });
        ui.text(c, 'JOIN A ROOM', 675, 140, { size: 12, align: 'center', color: '#ffe066' });
        ui.text(c, 'Type the code your friend sent:', 675, 180, { size: 8, align: 'center', color: '#cfe0ef' });
        const typing = this.mode === 'typing';
        if (ui.button(c, 565, 206, 220, 50, (this.code || (typing ? '' : 'CLICK TO TYPE')) + (typing && Math.floor(TU.time * 2) % 2 ? '_' : ''), { size: this.code ? 18 : 8, color: typing ? '#24405e' : '#2b3a4a' })) this.mode = 'typing';
        if (ui.button(c, 565, 300, 220, 56, 'JOIN', { color: '#2e9e5b', disabled: this.code.length !== 5 })) this.joinRoom();
      } else this.drawLobby(c);
      if (this.msg) ui.text(c, this.msg.text, 480, 410, { size: 8, align: 'center', color: '#ff8a6a' });
      if (ui.button(c, 380, 470, 200, 44, this.mode === 'lobby' ? 'LEAVE ROOM' : 'BACK', { color: '#55606a' })) this.back();
    },
    drawLobby(c) {
      const st = net.status;
      ui.panel(c, 24, 76, 912, 70, { fill: '#18283a' });
      if (net.isHost) {
        ui.text(c, 'ROOM CODE', 44, 90, { size: 8, color: '#cfe0ef' });
        ui.text(c, st === 'open' ? net.code : 'MAKING A ROOM...', 44, 108, { size: 22, color: '#ffe066' });
        ui.text(c, 'Friends pick ONLINE > JOIN and type this code.', 470, 104, { size: 8, color: '#cfe0ef' });
      } else {
        ui.text(c, `ROOM ${net.code || this.code}`, 44, 90, { size: 12, color: '#ffe066' });
        ui.text(c, st === 'open' ? 'Connected! Waiting for the host to start...' : st === 'error' ? 'Could not connect.' : 'Connecting...', 44, 116, { size: 8, color: '#cfe0ef' });
      }
      ui.text(c, `PLAYERS ${this.players.length}/${MAX}`, 24, 160, { size: 8, color: '#ffe066' });
      this.players.forEach((p, i) => {
        const x = 24 + (i % 2) * 460, y = 178 + Math.floor(i / 2) * 58;
        ui.panel(c, x, y, 452, 50, { fill: '#1e3044' });
        c.fillStyle = p.mapColor || '#ffe066'; c.fillRect(x + 10, y + 13, 24, 24);
        ui.text(c, `${p.name.toUpperCase()}${i === 0 ? '  (HOST)' : ''}${p.peer && p.peer === net.myId() ? '  - YOU' : ''}`, x + 46, y + 10, { size: 10 });
        const cd = TU.caddy.list[p.caddy] || TU.caddy.list[0], cart = p.cart || {};
        ui.text(c, `Caddy: ${cd.name}   Cart: ${(cart.size || 'standard')} ${cart.decal && cart.decal !== 'none' ? '- ' + cart.decal : ''}`, x + 46, y + 30, { size: 6, color: '#cfe0ef' });
      });
      const y = 360;
      if (net.isHost) {
        ui.text(c, 'COURSE', 24, y + 8, { size: 8, color: '#ffe066' });
        if (ui.button(c, 100, y, 30, 28, '<', { size: 8, color: '#2b3a4a' })) { this.courseIdx = (this.courseIdx + this.list.length - 1) % this.list.length; this.sendLobby(); }
        ui.text(c, this.list[this.courseIdx].label.toUpperCase(), 365, y + 8, { size: 8, align: 'center' });
        if (ui.button(c, 600, y, 30, 28, '>', { size: 8, color: '#2b3a4a' })) { this.courseIdx = (this.courseIdx + 1) % this.list.length; this.sendLobby(); }
        if (ui.button(c, 700, y - 6, 220, 44, 'START', { color: '#c0563a', disabled: this.players.length < 2 || st !== 'open' })) this.start();
      } else if (this.courseLabel) ui.text(c, `COURSE: ${this.courseLabel.toUpperCase()}`, 24, y + 8, { size: 8, color: '#cfe0ef' });
    },
  };
})();
