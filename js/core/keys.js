// Rebindable controls. Each action has two key slots, saved in settings.keys.
(function () {
  const K = TU.keys = {
    ACTIONS: [
      ['swing', 'Swing / confirm'],
      ['aimLeft', 'Aim left'],
      ['aimRight', 'Aim right'],
      ['fineAim', 'Fine aim (hold)'],
      ['clubPrev', 'Longer club'],
      ['clubNext', 'Shorter club'],
      ['traj', 'Ball flight height'],
      ['view', 'Overhead view'],
      ['forward', 'Walk / gas'],
      ['back', 'Back / brake'],
      ['left', 'Turn / steer left'],
      ['right', 'Turn / steer right'],
      ['run', 'Run (hold)'],
      ['cart', 'Cart in / out'],
      ['radio', 'Cart radio on / off'],
      ['nitro', 'Cart nitro boost'],
      ['pause', 'Pause'],
    ],
    DEFAULTS: {
      swing: ['Space', 'Enter'],
      aimLeft: ['KeyA', 'ArrowLeft'],
      aimRight: ['KeyD', 'ArrowRight'],
      fineAim: ['ShiftLeft', 'ShiftRight'],
      clubPrev: ['KeyW', 'ArrowUp'],
      clubNext: ['KeyS', 'ArrowDown'],
      traj: ['KeyQ', ''],
      view: ['KeyV', ''],
      forward: ['KeyW', 'ArrowUp'],
      back: ['KeyS', 'ArrowDown'],
      left: ['KeyA', 'ArrowLeft'],
      right: ['KeyD', 'ArrowRight'],
      run: ['ShiftLeft', 'ShiftRight'],
      cart: ['KeyE', ''],
      radio: ['KeyR', ''],
      nitro: ['KeyN', ''],
      pause: ['Escape', 'KeyP'],
    },
    get(a) {
      const saved = TU.save.data.settings.keys || {};
      return saved[a] || K.DEFAULTS[a];
    },
    set(a, slot, code) {
      const s = TU.save.data.settings;
      s.keys = s.keys || {};
      const cur = [...K.get(a)];
      cur[slot] = code;
      s.keys[a] = cur;
      TU.save.write();
    },
    reset() { TU.save.data.settings.keys = {}; TU.save.write(); },
    down(a) { return TU.input.isDown(...K.get(a).filter(Boolean)); },
    pressed(a) { return TU.input.isPressed(...K.get(a).filter(Boolean)); },
    label(code) {
      if (!code) return '-';
      const named = { Space: 'SPACE', Enter: 'ENTER', Escape: 'ESC', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL', AltLeft: 'L-ALT', AltRight: 'R-ALT', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ArrowUp: 'UP', ArrowDown: 'DOWN', Tab: 'TAB', Backspace: 'BKSP' };
      if (named[code]) return named[code];
      if (code.startsWith('Key')) return code.slice(3);
      if (code.startsWith('Digit')) return code.slice(5);
      if (code.startsWith('Numpad')) return 'NUM' + code.slice(6);
      return code.toUpperCase().slice(0, 7);
    },
    // Short label for the first key of an action, for HUD hints.
    hint(a) { return K.label(K.get(a)[0] || K.get(a)[1]); },
  };
})();
