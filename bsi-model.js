// <bsi-model> — axonometric wireframe of an industrial facility.
// Wheel over the panel spins the model; drag orbits; page scroll tilts it.
class BsiModel extends HTMLElement {
  connectedCallback() {
    if (this._booted) return;
    this._booted = true;
    this.style.display = 'block';
    this.style.position = 'relative';
    this.style.width = '100%';
    this.style.height = this.getAttribute('height') || '360px';
    this.style.touchAction = 'none';
    this._boot();
  }
  disconnectedCallback() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('scroll', this._onScroll);
    window.removeEventListener('resize', this._onResize);
  }

  async _boot() {
    const THREE = await import('https://esm.sh/three@0.160.0');
    const line = getComputedStyle(this).getPropertyValue('--model-line').trim() || '#416180';
    const faint = getComputedStyle(this).getPropertyValue('--model-face').trim() || '#5980a6';

    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -500, 500);
    cam.position.set(9, 7.5, 11);
    cam.lookAt(0, 1.2, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.cursor = 'grab';
    this.appendChild(renderer.domElement);

    const root = new THREE.Group();
    scene.add(root);

    const lineMat = new THREE.LineBasicMaterial({ color: new THREE.Color(line) });
    const softMat = new THREE.LineBasicMaterial({ color: new THREE.Color(faint), transparent: true, opacity: 0.35 });
    const faceMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(faint), transparent: true, opacity: 0.07, side: THREE.DoubleSide });

    const box = (w, h, d, x, y, z, soft) => {
      const g = new THREE.BoxGeometry(w, h, d);
      const m = new THREE.Mesh(g, faceMat);
      m.position.set(x, y, z);
      root.add(m);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), soft ? softMat : lineMat);
      e.position.set(x, y, z);
      root.add(e);
      return e;
    };
    const cyl = (r, h, x, z, seg) => {
      const g = new THREE.CylinderGeometry(r, r, h, seg || 12);
      const m = new THREE.Mesh(g, faceMat);
      m.position.set(x, h / 2, z);
      root.add(m);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), lineMat);
      e.position.set(x, h / 2, z);
      root.add(e);
    };

    // main hall
    box(7, 3, 4.4, 0, 1.5, 0);
    // gabled roof
    const roof = new THREE.BufferGeometry();
    const rv = [];
    const apex = 4.35, ry = 3, hw = 3.5, hd = 2.2;
    const pts = [[-hw, ry, -hd], [hw, ry, -hd], [hw, ry, hd], [-hw, ry, hd]];
    const ridge = [[-hw, apex, 0], [hw, apex, 0]];
    const add = (a, b) => rv.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    add(ridge[0], ridge[1]);
    add(pts[0], ridge[0]); add(pts[3], ridge[0]);
    add(pts[1], ridge[1]); add(pts[2], ridge[1]);
    roof.setAttribute('position', new THREE.Float32BufferAttribute(rv, 3));
    root.add(new THREE.LineSegments(roof, lineMat));

    // annex + silos + conveyor
    box(2.6, 1.8, 3, 4.9, 0.9, 0.6);
    cyl(0.85, 5.2, -5.2, -0.4);
    cyl(0.85, 5.2, -5.2, 1.9);
    box(4.6, 0.42, 0.42, -2.6, 4.6, 0.75, true);
    // structural bay grid inside the hall
    for (let i = -3; i <= 3; i += 1.5) box(0.16, 3, 0.16, i, 1.5, -2.2, true);
    // ground plate
    const grid = new THREE.GridHelper(20, 20, new THREE.Color(faint), new THREE.Color(faint));
    grid.material.transparent = true; grid.material.opacity = 0.18;
    root.add(grid);

    let spin = 0.5, tilt = 0, drag = null, scrollT = 0;
    const size = () => {
      const w = this.clientWidth || 600, h = this.clientHeight || 380;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      const s = 6.2, a = w / h;
      cam.left = -s * a; cam.right = s * a; cam.top = s; cam.bottom = -s;
      cam.updateProjectionMatrix();
    };
    this._onResize = size;
    window.addEventListener('resize', size);
    size();
    new ResizeObserver(size).observe(this);

    this.addEventListener('wheel', (e) => {
      e.preventDefault();
      spin += e.deltaY * 0.0022;
    }, { passive: false });

    this.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY };
      renderer.domElement.style.cursor = 'grabbing';
      this.setPointerCapture(e.pointerId);
    });
    this.addEventListener('pointermove', (e) => {
      if (!drag) return;
      spin += (e.clientX - drag.x) * 0.006;
      tilt = Math.max(-0.5, Math.min(0.6, tilt + (e.clientY - drag.y) * 0.004));
      drag = { x: e.clientX, y: e.clientY };
    });
    const up = () => { drag = null; renderer.domElement.style.cursor = 'grab'; };
    this.addEventListener('pointerup', up);
    this.addEventListener('pointercancel', up);

    this._onScroll = () => { scrollT = window.scrollY || 0; };
    window.addEventListener('scroll', this._onScroll, { passive: true });

    let idle = 0;
    const tick = () => {
      idle += 0.0012;
      root.rotation.y = spin + idle + scrollT * 0.0009;
      root.rotation.x = tilt + Math.min(0.18, scrollT * 0.00012);
      renderer.render(scene, cam);
      this._raf = requestAnimationFrame(tick);
    };
    tick();
  }
}
if (!customElements.get('bsi-model')) customElements.define('bsi-model', BsiModel);
