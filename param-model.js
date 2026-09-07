// <param-model> — упрощённая параметрическая аксонометрия по атрибутам
// width/depth/height(этажа)/floors/roof. Используется в чат-ассистенте:
// Ollama только извлекает эти числа из текстового описания (см. server.js
// /api/model3d), сам меш строит этот компонент — LLM геометрию не генерирует.
class ParamModel extends HTMLElement {
  connectedCallback() {
    if (this._booted) return;
    this._booted = true;
    this.style.display = 'block';
    this.style.position = 'relative';
    this.style.width = '100%';
    this.style.height = this.getAttribute('view-height') || '220px';
    this.style.touchAction = 'none';
    this._boot();
  }
  disconnectedCallback() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
  }
  _num(name, def, min, max) {
    const v = parseFloat(this.getAttribute(name));
    if (!isFinite(v)) return def;
    return Math.max(min, Math.min(max, v));
  }

  async _boot() {
    const THREE = await import('https://esm.sh/three@0.160.0');
    const line = getComputedStyle(this).getPropertyValue('--model-line').trim() || '#416180';
    const faint = getComputedStyle(this).getPropertyValue('--model-face').trim() || '#5980a6';

    const w = this._num('width', 12, 3, 60);
    const d = this._num('depth', 8, 3, 60);
    const floors = Math.round(this._num('floors', 1, 1, 20));
    const hPerFloor = this._num('height', 3.2, 2.2, 6);
    const h = hPerFloor * floors;
    const roof = (this.getAttribute('roof') || 'gable').toLowerCase();

    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -500, 500);
    const span = Math.max(w, d, h) * 0.9 + 2;
    cam.position.set(span * 0.8, span * 0.65, span);
    cam.lookAt(0, h / 2, 0);

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
    const faceMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(faint), transparent: true, opacity: 0.08, side: THREE.DoubleSide });

    const box = (bw, bh, bd, x, y, z) => {
      const g = new THREE.BoxGeometry(bw, bh, bd);
      const m = new THREE.Mesh(g, faceMat);
      m.position.set(x, y, z);
      root.add(m);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), lineMat);
      e.position.set(x, y, z);
      root.add(e);
    };

    box(w, h, d, 0, h / 2, 0);

    // разделители этажей
    if (floors > 1) {
      const hw = w / 2, hd = d / 2;
      for (let i = 1; i < floors; i++) {
        const y = i * hPerFloor;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([
          -hw, y, -hd, hw, y, -hd,
          hw, y, -hd, hw, y, hd,
          hw, y, hd, -hw, y, hd,
          -hw, y, hd, -hw, y, -hd
        ], 3));
        root.add(new THREE.LineSegments(g, softMat));
      }
    }

    // двускатная крыша
    if (roof === 'gable') {
      const apex = h + Math.min(w, d) * 0.28;
      const hw = w / 2, hd = d / 2;
      const g = new THREE.BufferGeometry();
      const v = [];
      const add = (a, b) => v.push(...a, ...b);
      add([-hw, apex, 0], [hw, apex, 0]);
      add([-hw, h, -hd], [-hw, apex, 0]); add([-hw, h, hd], [-hw, apex, 0]);
      add([hw, h, -hd], [hw, apex, 0]); add([hw, h, hd], [hw, apex, 0]);
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      root.add(new THREE.LineSegments(g, lineMat));
    }

    const grid = new THREE.GridHelper(Math.max(20, span * 2), 20, new THREE.Color(faint), new THREE.Color(faint));
    grid.material.transparent = true; grid.material.opacity = 0.18;
    root.add(grid);

    let spin = 0.6, tilt = 0.12, drag = null;
    const size = () => {
      const cw = this.clientWidth || 300, ch = this.clientHeight || 220;
      renderer.setSize(cw, ch, false);
      const s = span, a = cw / ch;
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

    const tick = () => {
      root.rotation.y = spin;
      root.rotation.x = tilt;
      renderer.render(scene, cam);
      this._raf = requestAnimationFrame(tick);
    };
    tick();
  }
}
if (!customElements.get('param-model')) customElements.define('param-model', ParamModel);
