// Tiny WebAudio synth: sound effects and a looping chiptune.
(function () {
  const A = TU.audio = { ac: null };
  let noiseBuf = null;

  A.unlock = function () {
    if (!A.ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      A.ac = new AC();
      A.sfxGain = A.ac.createGain();
      A.sfxGain.connect(A.ac.destination);
      A.musGain = A.ac.createGain();
      A.musGain.connect(A.ac.destination);
      noiseBuf = A.ac.createBuffer(1, A.ac.sampleRate, A.ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      A.applyVolume();
      startMusic();
    }
    if (A.ac.state === 'suspended') A.ac.resume();
  };

  A.applyVolume = function () {
    if (!A.ac) return;
    const s = TU.save.data.settings;
    A.sfxGain.gain.value = s.sfx;
    A.musGain.gain.value = s.music * 0.3;
  };

  function tone(freq, dur, type = 'square', vol = 0.2, delay = 0, slide = 0, dest) {
    const ac = A.ac, t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest || A.sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol = 0.3, freq = 1000, delay = 0, type = 'lowpass') {
    const ac = A.ac, t = ac.currentTime + delay;
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuf;
    f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(A.sfxGain);
    src.start(t); src.stop(t + dur + 0.02);
  }

  // a crowd clapping: lots of tiny noise bursts
  function clap(len = 1.6, vol = 0.12) {
    for (let i = 0; i < 40; i++) noise(0.03, vol * (1 - i / 50), 2200 + Math.random() * 1800, Math.random() * len, 'bandpass');
  }
  function chirp(delay) {
    const f = 2600 + Math.random() * 1600;
    for (let k = 0; k < 2 + Math.floor(Math.random() * 3); k++) tone(f + Math.random() * 300, 0.07, 'sine', 0.035, delay + k * 0.1, 900);
  }
  const SFX = {
    click: () => tone(660, 0.06, 'square', 0.1),
    meter: () => tone(520, 0.05, 'square', 0.08),
    swing: () => noise(0.25, 0.25, 900, 0, 'bandpass'),
    hit: () => { tone(200, 0.12, 'triangle', 0.5, 0, -120); noise(0.05, 0.35, 4000); },
    drive: () => { tone(150, 0.16, 'triangle', 0.6, 0, -100); noise(0.07, 0.45, 2600); tone(1900, 0.05, 'square', 0.06); },
    chip: () => { tone(320, 0.08, 'triangle', 0.35, 0, -140); noise(0.12, 0.2, 900); },
    perfect: () => { tone(1568, 0.12, 'sine', 0.16, 0.02); tone(2093, 0.3, 'sine', 0.12, 0.1); },
    sand: () => noise(0.25, 0.3, 700),
    thud: () => noise(0.06, 0.25, 260),
    rattle: () => { [0, 0.06, 0.11, 0.15].forEach((d, i) => tone(1200 - i * 120, 0.04, 'square', 0.07, d)); tone(880, 0.1, 'square', 0.15, 0.2); tone(1320, 0.25, 'square', 0.15, 0.3); },
    clap: () => clap(),
    bigclap: () => { clap(2.6, 0.18); [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.25, 'square', 0.1, 0.3 + i * 0.1)); },
    step: () => noise(0.04, 0.05, 500),
    putt: () => tone(420, 0.07, 'triangle', 0.35),
    land: () => noise(0.08, 0.2, 400),
    cup: () => { tone(880, 0.1, 'square', 0.15); tone(1320, 0.25, 'square', 0.15, 0.1); },
    splash: () => { noise(0.6, 0.45, 1400); tone(300, 0.3, 'sine', 0.2, 0, -200); },
    tree: () => { tone(130, 0.15, 'square', 0.25, 0, -60); noise(0.2, 0.25, 700); },
    cheer: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'square', 0.12, i * 0.09)),
    bad: () => tone(320, 0.3, 'sawtooth', 0.12, 0, -180),
    coin: () => { tone(988, 0.08, 'square', 0.12); tone(1319, 0.22, 'square', 0.12, 0.07); },
  };
  A.play = function (name) {
    if (!A.ac || !SFX[name]) return;
    SFX[name]();
  };

  // course ambience: birds now and then plus wind noise that follows the wind speed
  let amb = null, ambOn = false, windLvl = 0;
  A.ambient = function (on, wind = 0) {
    ambOn = on; windLvl = on ? wind : 0;
    if (!A.ac) return;
    if (!amb) {
      const src = A.ac.createBufferSource(), f = A.ac.createBiquadFilter(), g = A.ac.createGain();
      src.buffer = noiseBuf; src.loop = true;
      f.type = 'lowpass'; f.frequency.value = 380;
      g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(A.sfxGain); src.start();
      amb = { g, f };
      setInterval(() => { if (ambOn && A.ac && Math.random() < 0.35) chirp(Math.random()); }, 1500);
    }
    amb.g.gain.setTargetAtTime(on ? 0.015 + windLvl * 0.004 : 0, A.ac.currentTime, 0.5);
    amb.f.frequency.setTargetAtTime(300 + windLvl * 25, A.ac.currentTime, 0.5);
  };
  // Cart radio: six stations, each with a few songs that play in turn. A song is a chord
  // progression plus patterns: drums (k kick, s snare, h hat, o open hat), a bass line written
  // as chord-relative steps (r root, 5 fifth, 8 octave, 3/4 third, 7 seventh, b flat 7, . rest),
  // and a lead melody (semitones above the key, '.' rest) or an arpeggio over the chords.
  const STATIONS = [
    { name: 'FAIRWAY FM', songs: [
      { name: 'Tee Time', key: 60, bpm: 128, prog: [0, 9, 5, 7], wave: 'square', bass: 'r.r5.5r.r.r5.8.5', k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.', lead: '12 . 15 . 19 17 15 . 12 . 10 12 . 15 . . 19 . 17 . 15 . 12 . 14 . 15 . 17 . 19 .' },
      { name: 'Sunny Fairway', key: 62, bpm: 124, prog: [0, 7, 9, 5], wave: 'square', arp: true, bass: 'r..r..r.r..r..5.', k: 'x...x...x...x...', s: '....x.......x..x', h: 'hhhhhhhhhhhhhhhh', lead: '14 . 16 . 19 . 21 19 16 . 14 . 12 . . . 14 16 19 . 23 21 19 . 16 . 19 . 21 . . .' },
    ] },
    { name: 'TURBO TEE', songs: [
      { name: 'Drive Mode', key: 57, bpm: 140, prog: [0, 0, 8, 10], wave: 'sawtooth', arp: true, bass: '.r.r.r.r.r.r.r.8', k: 'x...x...x...x...', s: '....x.......x...', h: '..o...o...o...o.', lead: '12 12 . 15 . 12 . 19 . 17 . 15 12 . 10 . 12 12 . 15 . 12 . 22 . 19 . 17 15 . 17 .' },
      { name: 'Hyper Hover', key: 54, bpm: 148, prog: [0, 5, 3, 10], wave: 'sawtooth', arp: true, bass: 'r.8.r.8.r.8.r.85', k: 'x..x..x.x..x..x.', s: '....x.......x...', h: 'hhhhhhhhhhhhhhhh', lead: '24 . 22 . 19 . 22 . 24 . 27 . 24 . 22 . 19 . 17 . 19 . 22 . 19 . 17 . 15 . 12 .' },
    ] },
    { name: 'BOGEY ROCK', songs: [
      { name: 'Slice It Up', key: 52, bpm: 150, prog: [0, 0, 3, 5], wave: 'sawtooth', power: true, bass: 'rrrrrrrr3333555r', k: 'x..xx...x..xx...', s: '....x.......x...', h: 'h.h.h.h.h.h.h.h.', lead: '12 . 15 . 17 . 15 12 . . 10 . 12 . . . 12 . 15 . 17 . 19 . 17 15 . 12 . . . .' },
      { name: 'Sand Trap Riot', key: 50, bpm: 172, prog: [0, 5, 7, 5], wave: 'sawtooth', power: true, bass: 'r.rr.rr.r.rr.r5.', k: 'x.x.x.x.x.x.x.x.', s: '....x.......x...', h: 'hhhhhhhhhhhhhhhh', lead: '19 17 15 . 12 . 15 17 19 . 22 . 19 . 17 . 15 . 12 . 15 . 17 . 19 22 24 . 22 . 19 .' },
    ] },
    { name: 'CADDY DISCO', songs: [
      { name: 'Funky Fore', key: 55, bpm: 120, prog: [0, 5, 0, 7], wave: 'square', open: true, bass: 'r8r8r8r8r8r8r8b8', k: 'x...x...x...x...', s: '....x.......x...', h: '..o...o...o...o.', lead: '. . 19 . . . 19 16 . . 21 . 19 . 16 . . . 19 . . . 21 19 . . 24 . 21 . 19 .' },
      { name: 'Mulligan Groove', key: 58, bpm: 116, prog: [0, 3, 5, 3], wave: 'square', open: true, bass: 'r..r.5.b.r..8.5.', k: 'x...x...x...x...', s: '....x..x....x...', h: 'h.oh.oh.h.oh.oh.', lead: '12 . . 15 . 17 . . 15 . 12 . 10 . 12 . . . 15 . 17 . 19 . 22 . 19 . 17 . 15 .' },
    ] },
    { name: '8-BIT BIRDIE', songs: [
      { name: 'Pixel Pin', key: 64, bpm: 160, prog: [0, 5, 7, 0], wave: 'square', arp: true, bass: 'r.5.r.5.r.5.8.5.', k: 'x.......x.......', s: '....x.......x...', h: '..h...h...h...h.', lead: '12 16 19 24 . 19 16 . 14 17 21 26 . 21 17 . 12 16 19 24 . 28 26 24 19 . 16 . 12 . . .' },
      { name: 'Level Up', key: 62, bpm: 152, prog: [0, 9, 5, 7], wave: 'square', arp: true, bass: 'rr.rr.r.rr.rr.5.', k: 'x...x...x...x...', s: '....x.......x...', h: 'hhhhhhhhhhhhhhhh', lead: '24 . 24 . 26 . 28 . 31 . 28 . 26 . 24 . 21 . 21 . 24 . 26 . 28 . 26 . 24 . 21 .' },
    ] },
    { name: 'CHILL LINKS', songs: [
      { name: 'Lazy Lie', key: 53, bpm: 84, prog: [0, 3, 8, 7], wave: 'triangle', pad: true, bass: 'r.......5.......', k: 'x.........x.....', s: '........x.......', h: 'h...h...h...h...', lead: '24 . . 27 . . 22 . . . 20 . . . . . 24 . . 27 . . 29 . . 27 . 24 . . . .' },
      { name: 'Sunday Putt', key: 57, bpm: 90, prog: [0, 5, 3, 10], wave: 'triangle', pad: true, bass: 'r...r...5...r...', k: 'x.......x.......', s: '....x.......x...', h: '..h...h...h...h.', lead: '19 . . 17 . . 15 . 12 . . . . . . . 19 . 22 . 24 . 22 . 19 . 17 . 15 . . .' },
    ] },
  ];
  A.STATIONS = ['OFF', ...STATIONS.map(st => st.name)];
  A.radioSong = () => radio && radio.on ? (STATIONS[radio.station - 1] || STATIONS[0]).songs[radio.song].name : '';
  const BASSOFF = { r: 0, 3: 3, 4: 4, 5: 7, 7: 11, b: 10, 8: 12 };
  let radio = null, radioKind = null;
  A.radio = function (on, kind = 'roof', station = 1) {
    if (!A.ac) return;
    if (!station) on = false;
    if (!radio) {
      const g = A.ac.createGain(); g.gain.value = 0; g.connect(A.sfxGain);
      radio = { g, on: false, step: 0, next: 0, station: 1, song: 0 };
      const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
      setInterval(() => {
        if (!radio.on) { radio.next = A.ac.currentTime + 0.1; return; }
        const S = STATIONS[radio.station - 1] || STATIONS[0];
        let P = S.songs[radio.song % S.songs.length];
        while (radio.next < A.ac.currentTime + 0.25) {
          const six = 60 / P.bpm / 4, s = radio.step % 16, bar = Math.floor(radio.step / 16), d = radio.next - A.ac.currentTime, big = radioKind === 'sub';
          const root = P.key - 12 + P.prog[bar % P.prog.length], minor = [3, 8, 10].includes(P.prog[bar % P.prog.length] % 12) || P.prog[bar % P.prog.length] === 9;
          const chord = [0, minor ? 3 : 4, 7];
          if (P.k[s] === 'x') tone(big ? 62 : 88, 0.15, 'sine', big ? 0.55 : 0.32, d, -50, radio.g);
          if (P.s[s] === 'x') { noiseTo(0.11, 0.2, 1700, d, radio.g); tone(190, 0.06, 'triangle', 0.08, d, -60, radio.g); }
          if (P.h[s] === 'h' || P.h[s] === 'x') noiseTo(0.03, 0.08, 7500, d, radio.g);
          if (P.h[s] === 'o' || (P.open && s % 4 === 2)) noiseTo(0.14, 0.07, 6500, d, radio.g);
          const bc = P.bass[s];
          if (bc && bc !== '.') {
            const n = root - 12 + (BASSOFF[bc] ?? 0);
            tone(mtof(n), six * (P.power ? 0.95 : 1.7), big ? 'sawtooth' : P.wave === 'triangle' ? 'triangle' : 'square', (big ? 0.15 : 0.08), d, 0, radio.g);
            if (P.power) tone(mtof(n + 19), six * 0.95, 'sawtooth', 0.03, d, 0, radio.g); // power chord
          }
          if (P.arp) tone(mtof(root + 12 + chord[s % 3] + (s % 6 > 2 ? 12 : 0)), six * 0.8, 'square', 0.022, d, 0, radio.g);
          if (P.pad && s === 0) chord.forEach(iv => tone(mtof(root + 12 + iv), six * 15, 'triangle', 0.025, d, 0, radio.g));
          const notes = P.lead.split(' '), ln = notes[(radio.step % 32)];
          if (ln && ln !== '.' && (bar % 4 !== 0 || P.pad)) tone(mtof(P.key + +ln), six * 1.7, P.pad ? 'sine' : P.wave === 'sawtooth' ? 'square' : P.wave, 0.045, d, 0, radio.g);
          radio.step++; radio.next += six;
          // after 16 bars the station moves on to its next song
          if (radio.step >= 16 * 16) {
            radio.step = 0; radio.song = (radio.song + 1) % S.songs.length; P = S.songs[radio.song];
            if (A.onSong) A.onSong(A.radioSong());
          }
        }
      }, 60);
    }
    radioKind = kind;
    if (station !== radio.station) { radio.station = station; radio.step = 0; radio.song = 0; if (on && A.onSong) setTimeout(() => A.onSong(A.radioSong()), 50); }
    if (on === radio.on) return;
    radio.on = on;
    if (on && A.onSong) setTimeout(() => A.onSong(A.radioSong()), 50);
    radio.g.gain.setTargetAtTime(on ? (kind === 'sub' ? 0.9 : 0.6) : 0, A.ac.currentTime, 0.15);
    // duck the menu music while the radio plays
    const st = TU.save.data.settings;
    A.musGain.gain.setTargetAtTime(on ? 0 : st.music * 0.3, A.ac.currentTime, 0.2);
  };
  // skip to the next song on the current station
  A.radioSkip = function () { if (!radio) return; const S = STATIONS[radio.station - 1] || STATIONS[0]; radio.song = (radio.song + 1) % S.songs.length; radio.step = 0; if (A.onSong) A.onSong(A.radioSong()); };
  function noiseTo(dur, vol, freq, delay, dest) {
    const ac = A.ac, t = ac.currentTime + delay;
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest); src.start(t); src.stop(t + dur + 0.02);
  }
  // golf cart: a soft electric whine that rises with speed (0 = silent)
  let eng = null;
  A.engine = function (speed) {
    if (!A.ac) return;
    if (!eng) {
      const o = A.ac.createOscillator(), f = A.ac.createBiquadFilter(), g = A.ac.createGain();
      o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 600; g.gain.value = 0;
      o.connect(f); f.connect(g); g.connect(A.sfxGain); o.start();
      eng = { o, g };
    }
    const s = Math.abs(speed);
    eng.o.frequency.setTargetAtTime(70 + s * 14, A.ac.currentTime, 0.1);
    eng.g.gain.setTargetAtTime(s > 0.2 ? Math.min(0.05, 0.015 + s * 0.003) : 0, A.ac.currentTime, 0.12);
  };

  function startMusic() {
    const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
    const prog = [[60, 64, 67, 72], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67]];
    const melody = [76, 0, 74, 72, 0, 74, 76, 0, 79, 0, 76, 74, 72, 0, 0, 0];
    const six = 60 / 104 / 4;
    let step = 0, next = A.ac.currentTime + 0.2;
    setInterval(() => {
      if (!A.ac || A.musGain.gain.value <= 0.0001) { next = A.ac.currentTime + 0.1; return; }
      while (next < A.ac.currentTime + 0.25) {
        const bar = Math.floor(step / 16) % 4, s = step % 16, ch = prog[bar];
        const d = next - A.ac.currentTime;
        if (s % 2 === 0) tone(mtof(ch[(s / 2) % 4]), six * 1.5, 'triangle', 0.12, d, 0, A.musGain);
        if (s % 8 === 0) tone(mtof(ch[0] - 24), six * 7, 'square', 0.05, d, 0, A.musGain);
        const mel = melody[(step + bar * 3) % 16];
        if (bar % 2 === 1 && mel) tone(mtof(mel), six * 1.8, 'square', 0.035, d, 0, A.musGain);
        step++;
        next += six;
      }
    }, 60);
  }
})();
