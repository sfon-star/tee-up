// Online play: browsers talk to each other directly (WebRTC). PeerJS's free broker only introduces them.
// The host is the hub: guests send to the host, and the host passes every message on to everyone else.
(function () {
  const PREFIX = 'teeup-room-', LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

  TU.net = {
    peer: null, conns: [], isHost: false, code: null, status: 'off', error: null,
    handlers: {},
    available() { return typeof window.Peer === 'function'; },
    on(type, fn) { this.handlers[type] = fn; },
    off() { this.handlers = {}; },
    dispatch(msg, conn) { const fn = this.handlers[msg.type]; if (fn) fn(msg.data, msg, conn); },

    // HOST: make a room with a short code friends can type in
    host(onReady) {
      this.leave();
      this.isHost = true;
      this.status = 'connecting';
      const tryCode = (left) => {
        this.code = Array.from({ length: 5 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
        const peer = this.peer = new Peer(PREFIX + this.code);
        peer.on('open', id => { this.id = id; this.status = 'open'; onReady && onReady(this.code); });
        peer.on('connection', conn => {
          conn.on('open', () => { this.conns.push(conn); });
          conn.on('data', msg => {
            // pass it on to the other guests, then handle it here
            for (const c of this.conns) if (c !== conn && c.open) c.send(msg);
            this.dispatch(msg, conn);
          });
          conn.on('close', () => { this.conns = this.conns.filter(c => c !== conn); this.dispatch({ type: 'gone', data: { peer: conn.peer } }, conn); });
        });
        peer.on('error', e => {
          if (e.type === 'unavailable-id' && left > 0) { peer.destroy(); return tryCode(left - 1); }
          if (this.brokerOnly(e)) return;
          this.fail(e);
        });
        this.keepBroker(peer);
      };
      tryCode(3);
    },

    // GUEST: join a room by its code
    join(code, onOpen, tries = 2) {
      this.leave();
      this.isHost = false;
      this.code = code.toUpperCase();
      this.status = 'connecting';
      const peer = this.peer = new Peer();
      peer.on('open', id => {
        this.id = id;
        const conn = peer.connect(PREFIX + this.code, { reliable: true });
        conn.on('open', () => { this.conns = [conn]; this.status = 'open'; onOpen && onOpen(); });
        conn.on('data', msg => this.dispatch(msg, conn));
        conn.on('close', () => { this.status = 'closed'; this.dispatch({ type: 'hostgone', data: {} }); });
      });
      peer.on('error', e => {
        // a brand-new room can take a moment to show up: try again before giving up
        if (e.type === 'peer-unavailable' && tries > 0 && !this.conns.length) { const c = this.code; setTimeout(() => { if (this.peer === peer) this.join(c, onOpen, tries - 1); }, 1500); return; }
        if (this.brokerOnly(e)) return;
        this.fail(e.type === 'peer-unavailable' ? { message: `No room called ${this.code}` } : e);
      });
      this.keepBroker(peer);
    },
    // once everyone's connected the broker isn't needed any more: losing it (a tab in the background, say) is fine
    brokerOnly(e) { return this.conns.length > 0 && ['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected'].includes(e.type); },
    keepBroker(peer) { peer.on('disconnected', () => { if (this.peer === peer && !peer.destroyed) try { peer.reconnect(); } catch (e) { /* offline */ } }); },
    fail(e) { this.status = 'error'; this.error = (e && e.message) || String(e); this.dispatch({ type: 'error', data: { message: this.error } }); },

    myId() { return this.peer ? this.peer.id || this.id : null; },
    // send to everyone else in the room
    send(type, data) {
      const msg = { type, data, from: this.myId() };
      for (const c of this.conns) if (c.open) c.send(msg);
    },
    // host only: send to one guest
    sendTo(peerId, type, data) {
      const c = this.conns.find(k => k.peer === peerId);
      if (c && c.open) c.send({ type, data, from: this.myId() });
    },
    leave() {
      for (const c of this.conns) try { c.close(); } catch (e) { /* already closed */ }
      this.conns = [];
      if (this.peer) try { this.peer.destroy(); } catch (e) { /* already gone */ }
      this.peer = null; this.id = null; this.status = 'off'; this.error = null; this.code = null;
    },
  };
})();
