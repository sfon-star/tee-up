// Head-and-shoulders portraits of a 3D golfer model, rendered once into a small canvas and cached.
// Used for the caddy's speech card and the shop, so the face always matches the character.
(function () {
  const T = THREE, SIZE = 128, cache = {};
  let renderer = null, scene = null, camera = null;

  function setup() {
    renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(SIZE, SIZE, false);
    scene = new T.Scene();
    scene.add(new T.HemisphereLight(0xffffff, 0x6a7a60, 0.75));
    const key = new T.DirectionalLight(0xffffff, 0.75); key.position.set(1.5, 2.5, 3); scene.add(key);
    camera = new T.PerspectiveCamera(26, 1, 0.05, 20);
  }

  TU.Portrait = {
    // key identifies the look (e.g. 'caddy3'); pass the look object to build it the first time
    get(key, look) {
      if (cache[key]) return cache[key];
      if (!renderer) setup();
      const g = TU.Golfer3D.build(look);
      g.pose({ mode: 'stand' });
      scene.add(g.root);
      g.root.updateMatrixWorld(true);
      // frame the whole head (hair and hat included) plus a bit of collar, from slightly to one side
      const box = new T.Box3().setFromObject(g.head), ctr = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3());
      const span = Math.max(size.y, size.x) * 1.35, dist = span / (2 * Math.tan(13 * Math.PI / 180));
      ctr.y -= size.y * 0.08;
      camera.position.set(ctr.x + dist * 0.2, ctr.y + dist * 0.06, ctr.z + dist * 0.98);
      camera.lookAt(ctr);
      renderer.render(scene, camera);
      const cv = document.createElement('canvas');
      cv.width = cv.height = SIZE;
      cv.getContext('2d').drawImage(renderer.domElement, 0, 0);
      scene.remove(g.root);
      g.root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      return (cache[key] = cv);
    },
    clear(key) { if (key) delete cache[key]; else for (const k in cache) delete cache[k]; },
    // draw a portrait filling a square frame (x, y = top-left, s = size) with a colored border
    draw(c, key, look, x, y, s, ring = '#3a2e1a') {
      const img = TU.Portrait.get(key, look);
      c.fillStyle = ring; c.fillRect(x - 3, y - 3, s + 6, s + 6);
      const gr = c.createLinearGradient(0, y, 0, y + s); gr.addColorStop(0, '#cdeeff'); gr.addColorStop(1, '#8fc7e0');
      c.fillStyle = gr; c.fillRect(x, y, s, s);
      c.imageSmoothingEnabled = true;
      c.drawImage(img, x, y, s, s);
      c.imageSmoothingEnabled = false;
    },
  };
})();
