// Home screen: PLAY, SETTINGS, SHOP over a slow 3D flyover of the course.
(function () {
  const ui = TU.ui, R3 = TU.R3;
  TU.scenes.home = {
    enter() {
      ui.nav = true;
      this.t = 0;
      this.hole = TU.courses.get('practice').holes[0];
      R3.loadHole(this.hole);
      this.golfer = TU.Golfer3D.build(TU.save.data.player);
      R3.scene.add(this.golfer.root);
    },
    exit() {
      R3.scene.remove(this.golfer.root);
      this.golfer.root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    },
    update(dt) { this.t += dt; },
    render3D() {
      const h = this.hole, tee = h.tee;
      R3.update(TU.time);
      R3.setBall(tee.x + 0.6, tee.y - 0.6, 0);
      R3.setDots([]); R3.setRing(0, 0, false); R3.showArrows(false); R3.setMarker(0, 0, false);
      R3.clearTrees(tee.x, tee.y, 6);
      R3.sign.visible = false;
      // golfer stands on the tee looking at the camera, idly shifting weight
      TU.Golfer3D.placeAt(this.golfer, tee.x, tee.y, Math.PI - 0.3);
      this.golfer.pose({ mode: 'walk', walk: Math.sin(this.t * 0.8) * 0.15 });
      const sway = Math.sin(this.t * 0.15) * 1.2;
      R3.look(tee.x - 2.4 + sway, tee.y + 4.4, 1.5, tee.x - 1.4, tee.y - 6, 1.5);
    },
    drawUI(c) {
      const bob = Math.round(Math.sin(this.t * 2) * 4);
      c.fillStyle = 'rgba(8,24,16,0.35)';
      c.fillRect(0, 0, 440, 540);
      ui.text(c, 'TEE UP', 72, 70 + bob, { size: 72, color: '#ffe066', shadowColor: '#7a4b12' });
      ui.text(c, 'quick rounds, big swings', 76, 160, { size: 12, color: '#e8f4ec' });
      ui.text(c, `TEES: ${TU.save.data.tees}`, 76, 190, { size: 12, color: '#ffe066' });
      if (ui.button(c, 76, 240, 300, 64, 'PLAY', { size: 24 })) TU.go('modes');
      if (ui.button(c, 76, 330, 300, 52, 'SETTINGS', { color: '#3d6fb0' })) TU.go('settings');
      if (ui.button(c, 76, 408, 300, 52, 'SHOP', { color: '#c07a1e' })) TU.go('shop');
      ui.text(c, 'Mouse or Arrows + Enter', 76, 516, { size: 8, color: '#cfe8d8' });
    },
  };
})();
