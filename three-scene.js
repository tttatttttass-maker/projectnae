/* 3D-вьювер. Подгружается из ui.js динамически, поэтому сбой CDN/WebGL не ломает остальной сайт.
   Модель параметрическая: Viewer.layout() считает позиции узлов из текущих параметров P,
   а P плавно «догоняет» целевые T при смене сборки, поэтому корпус морфится, а не прыгает.
   Точка расширения для .glb: поле glb у сборки + loadGLB(). Якоря хотспотов (this.anch) остаются на месте. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const { lerp, smoothstep } = THREE.MathUtils;
const tmp = new THREE.Color(), v3 = new THREE.Vector3();

export class Viewer {
  constructor(host, { hotspots = [], onHotspot = () => {} } = {}) {
    this.host = host;
    Object.assign(this, { parts: [], glows: [], spin: [], anch: {}, hot: [], neon: false, nk: 0, air: false, panel: false, pk: 0, vis: true, ext: null });
    this.P = { D: 4.4, H: 4.6, W: 2, gh: .3, glow: 1, fan: 1, accent: new THREE.Color('#00e5ff'), body: new THREE.Color('#e6ebf0') };
    this.T = { ...this.P, accent: this.P.accent.clone(), body: this.P.body.clone() };

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    host.prepend(r.domElement);

    this.scene = new THREE.Scene();
    this.scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), .04).texture;
    this.cam = new THREE.PerspectiveCamera(32, 1, .1, 100);
    this.cam.position.set(-7.5, 3.4, 10);

    const o = (this.ctl = new OrbitControls(this.cam, r.domElement));
    Object.assign(o, { enableDamping: true, dampingFactor: .06, enablePan: false, minDistance: 7, maxDistance: 22, maxPolarAngle: Math.PI * .53, autoRotate: true, autoRotateSpeed: .9 });
    let idle;
    o.addEventListener('start', () => { clearTimeout(idle); o.autoRotate = false; });
    o.addEventListener('end', () => { idle = setTimeout(() => (o.autoRotate = true), 6000); });

    this.key = new THREE.DirectionalLight(0xffffff, 2.4); this.key.position.set(6, 9, 7);
    this.rim = new THREE.DirectionalLight(0xffffff, 1.2); this.rim.position.set(-7, 3, -6);
    this.pl = new THREE.PointLight(0xffffff, 0, 0, 2); this.pl.position.set(0, .2, .2);
    this.scene.add(this.key, this.rim, this.pl);

    this.root = new THREE.Group(); this.scene.add(this.root);
    this.shell = new THREE.Group(); this.root.add(this.shell);
    this.build(); this.buildAir();

    const layer = host.querySelector('.hotspots') || host;
    for (const h of hotspots) {
      const a = new THREE.Object3D(); this.root.add(a); this.anch[h.id] = a;
      const el = document.createElement('button');
      el.className = 'hs'; el.setAttribute('aria-label', h.title); el.innerHTML = `<i></i><span>${h.title}</span>`;
      el.onclick = () => onHotspot(h.id);
      layer.append(el); this.hot.push({ el, a });
    }

    new ResizeObserver(() => this.resize()).observe(host);
    new IntersectionObserver(([e]) => (this.vis = e.isIntersecting)).observe(host);
    this.clock = new THREE.Clock(); this.resize();
    r.setAnimationLoop(() => this.tick());
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.cam.aspect = w / h; this.cam.fov = w / h < 1 ? 48 : 32;
    this.cam.updateProjectionMatrix();
  }

  part(o, fn) { this.shell.add(o); this.parts.push([o, fn]); return o; }
  glow() { const m = new THREE.MeshBasicMaterial(); this.glows.push([m, this.glows.length * .071]); return m; }

  fan(s = 1) {
    const g = new THREE.Group(), bl = new THREE.Group(), bg = new THREE.BoxGeometry(.36, .15, .012);
    g.add(new THREE.Mesh(new THREE.TorusGeometry(.5, .028, 8, 48), this.glow()));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(.5, 40), this.mDark); disc.position.z = -.03; g.add(disc);
    for (let i = 0; i < 7; i++) {
      const p = new THREE.Group(), b = new THREE.Mesh(bg, this.mDark);
      p.rotation.z = (i / 7) * Math.PI * 2; b.position.x = .27; b.rotation.x = .6; p.add(b); bl.add(p);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, .05, 24), this.mDark); hub.rotation.x = Math.PI / 2; bl.add(hub);
    g.add(bl); g.scale.setScalar(s); this.spin.push(bl);
    return g;
  }

  build() {
    const M = (o) => new THREE.MeshStandardMaterial({ roughness: .5, metalness: .4, ...o });
    const body = (this.mBody = M({ roughness: .38, metalness: .55 }));
    const dark = (this.mDark = M({ color: 0x0d0f13, roughness: .5, metalness: .65 }));
    const pcb = M({ color: 0x1b2028, roughness: .7, metalness: .3 });
    this.mGlass = new THREE.MeshPhysicalMaterial({ color: 0x9fb4c8, transparent: true, opacity: .14, roughness: .05, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
    const smoke = new THREE.MeshStandardMaterial({ color: 0x05070a, transparent: true, opacity: .3, roughness: .2, depthWrite: false });
    const BG = new THREE.BoxGeometry(1, 1, 1);
    const box = (m, fn) => this.part(new THREE.Mesh(BG, m), fn);
    const cyl = (r, h, m, fn) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 40), m); c.rotation.x = Math.PI / 2; return this.part(c, fn); };

    // корпус
    box(dark, (o, L) => { o.scale.set(L.D, L.H, .06); o.position.set(0, 0, L.Z0 - .03); });
    box(body, (o, L) => { o.scale.set(L.D, .1, L.W); o.position.set(0, -L.H / 2 + .05, 0); });
    box(body, (o, L) => { o.scale.set(L.D, .1, L.W); o.position.set(0, L.H / 2 - .05, 0); });
    box(body, (o, L) => { o.scale.set(.08, L.H, L.W); o.position.set(L.D / 2 - .04, 0, 0); });
    box(smoke, (o, L) => { o.scale.set(.06, L.H, L.W); o.position.set(-L.D / 2 + .03, 0, 0); });
    box(this.mGlass, (o, L) => { o.scale.set(L.D, L.H, .03); o.position.set(0, 0, L.W / 2 + this.pk * 2.6); o.visible = this.pk < .97; });
    // плата, кожух БП, радиатор СЖО
    box(pcb, (o, L) => { o.scale.set(L.bw, L.bh, .05); o.position.set(L.mx, L.by, L.Z0 + .045); });
    box(dark, (o, L) => { o.scale.set(L.bw, L.shH, L.W * .78); o.position.set(L.mx, L.shY, L.Z0 + L.W * .39); });
    box(this.glow(), (o, L) => { o.scale.set(L.bw - .5, .035, .02); o.position.set(L.mx, L.shY + .12, L.Z0 + L.W * .78 + .01); });
    box(dark, (o, L) => { o.scale.set(.28, L.H - .9, 1.15); o.position.set(-L.D / 2 + .62, 0, 0); });
    // видеокарта (вертикальная установка, вентиляторы к стеклу)
    box(dark, (o, L) => { o.scale.set(L.gL, L.gH, .5); o.position.set(L.mx, L.gY, L.gZ); });
    box(body, (o, L) => { o.scale.set(L.gL - .1, L.gH - .12, .02); o.position.set(L.mx, L.gY, L.gF + .005); });
    box(this.glow(), (o, L) => { o.scale.set(L.gL - .3, .035, .02); o.position.set(L.mx, L.gY - L.gH / 2 + .1, L.gF + .02); });
    for (let i = 0; i < 3; i++) this.part(this.fan(.78), (o, L) => o.position.set(L.mx + ((i - 1) * L.gL) / 3, L.gY, L.gF + .05));
    // помпа СЖО и шланги
    cyl(.38, .3, dark, (o, L) => o.position.set(L.px, L.py, L.Z0 + .22));
    this.part(new THREE.Mesh(new THREE.TorusGeometry(.3, .022, 8, 48), this.glow()), (o, L) => o.position.set(L.px, L.py, L.Z0 + .38));
    for (const d of [.12, -.12]) box(dark, (o, L) => { const x1 = -L.D / 2 + .76, x2 = L.px - .38; o.scale.set(x2 - x1, .09, .09); o.position.set((x1 + x2) / 2, L.py + d, L.Z0 + .25); });
    // память
    for (let i = 0; i < 4; i++) {
      box(dark, (o, L) => { o.scale.set(.06, 1.3, .32); o.position.set(L.mx + L.bw * .2 + i * .15, L.py, L.Z0 + .23); });
      box(this.glow(), (o, L) => { o.scale.set(.03, 1.15, .02); o.position.set(L.mx + L.bw * .2 + i * .15, L.py, L.Z0 + .4); });
    }
    // вентиляторы: 3 фронтальных (радиатор) и 1 задний
    for (let i = 0; i < 3; i++) { const f = this.fan(1); f.rotation.y = Math.PI / 2; this.part(f, (o, L) => o.position.set(-L.D / 2 + .35, L.H / 2 - .9 - (i * (L.H - 1.8)) / 2, 0)); }
    const rf = this.fan(.9); rf.rotation.y = Math.PI / 2; this.part(rf, (o, L) => o.position.set(L.D / 2 - .2, L.H / 2 - .9, 0));
    // ножки
    for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) this.part(new THREE.Mesh(new THREE.CylinderGeometry(.2, .24, .16, 24), dark), (o, L) => o.position.set(a * (L.D / 2 - .5), -L.H / 2 - .08, b * (L.W / 2 - .3)));
    // мягкая тень на полу
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    ground.rotation.x = -Math.PI / 2;
    this.part(ground, (o, L) => { o.scale.set(L.D * 2.2, L.W * 3.4, 1); o.position.y = -L.H / 2 - .158; });
  }

  buildAir() {
    const N = 240, g = new THREE.BufferGeometry();
    this.afP = new Float32Array(N * 3); this.afC = new Float32Array(N * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.afP, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.afC, 3));
    this.seed = Array.from({ length: N }, () => ({ t: Math.random(), y: Math.random() * 2 - 1, z: Math.random(), u: Math.random(), v: .6 + Math.random() * .8 }));
    this.airPts = new THREE.Points(g, new THREE.PointsMaterial({ size: .08, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.airPts.visible = false; this.airPts.frustumCulled = false; this.root.add(this.airPts);
  }

  layout() {
    const { D, H, W, gh } = this.P;
    const xl = -D / 2 + .95, xr = D / 2 - .2, bw = xr - xl, bh = H * .76, shH = .9, gH = H * gh;
    const mx = (xl + xr) / 2, by = H / 2 - .15 - bh / 2, shY = -H / 2 + .1 + shH / 2, gZ = W / 2 - .45;
    return { D, H, W, bw, bh, shH, gH, mx, by, shY, gZ, Z0: -W / 2 + .06, gY: shY + shH / 2 + .12 + gH / 2, gL: bw - .15, gF: gZ + .25, px: mx - bw * .18, py: by + bh * .2 };
  }

  flow(dt, { D, H, W }) {
    const a = this.afP, c = this.afC;
    this.seed.forEach((s, i) => {
      s.t += dt * s.v * .22;
      if (s.t > 1) Object.assign(s, { t: 0, y: Math.random() * 2 - 1, z: Math.random(), u: Math.random() });
      const hot = smoothstep(s.t, .3, .75);
      a[i * 3] = -D / 2 + .2 + s.t * (D - .4);
      a[i * 3 + 1] = s.y * (H / 2 - .7) * (1 - hot * .3) + hot * hot * s.u * H * .22;
      a[i * 3 + 2] = -W / 2 + .3 + s.z * (W - .6);
      c[i * 3] = hot; c[i * 3 + 1] = .85 - .45 * hot; c[i * 3 + 2] = 1 - hot;
    });
    const g = this.airPts.geometry; g.attributes.position.needsUpdate = g.attributes.color.needsUpdate = true;
  }

  /* ---- публичное API ---- */
  setModel(m, instant = false) {
    const [D, H, W] = m.size, T = this.T;
    Object.assign(T, { D, H, W, gh: m.gpuH, glow: m.glow, fan: m.fan });
    T.accent.set(m.accent); T.body.set(m.body);
    this.rim.color.set(m.accent); this.pl.color.set(m.accent);
    if (instant) for (const k in T) T[k].isColor ? this.P[k].copy(T[k]) : (this.P[k] = T[k]);
    m.glb ? this.loadGLB(m.glb) : this.clearGLB();
  }
  setLook(name) { this.neon = name === 'neon'; }
  setAirflow(on) { this.air = on; this.airPts.visible = on; }
  setPanel(open) { this.panel = open; }

  async loadGLB(url) {
    try {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader().loadAsync(url);
      this.clearGLB(false); this.ext = gltf.scene; this.scene.add(this.ext); this.shell.visible = false;
    } catch (e) { console.warn('GLB не загружен, показываем процедурную модель:', e); this.clearGLB(); }
  }
  clearGLB(show = true) { this.ext?.removeFromParent(); this.ext = null; if (show) this.shell.visible = true; }

  tick() {
    const dt = Math.min(this.clock.getDelta(), .05), t = this.clock.elapsedTime;
    if (!this.vis) return;
    const { P, T } = this, k = 1 - Math.exp(-dt * 4.5);
    for (const key in T) T[key].isColor ? P[key].lerp(T[key], k) : (P[key] = lerp(P[key], T[key], k));
    this.nk = lerp(this.nk, this.neon ? 1 : 0, k);
    this.pk = lerp(this.pk, this.panel ? 1 : 0, k);
    const L = this.layout(), nk = this.nk;
    this.mBody.color.copy(P.body);
    this.mGlass.opacity = .14 * (1 - this.pk);
    for (const [o, fn] of this.parts) fn(o, L);

    const A = this.anch;
    A.gpu?.position.set(L.mx, L.gY, L.gF + .05);
    A.cpu?.position.set(L.px, L.py, L.Z0 + .5);
    A.psu?.position.set(L.mx + L.bw * .28, L.shY, L.Z0 + L.W * .78 + .05);

    const g = P.glow * (.55 + .95 * nk);
    for (const [m, ph] of this.glows) { tmp.setHSL((t * .1 + ph) % 1, .85, .55); m.color.copy(P.accent).lerp(tmp, nk * .85).multiplyScalar(g); }
    this.key.intensity = 2.4 - 1.9 * nk; this.rim.intensity = 1.2 + 2.4 * nk; this.pl.intensity = 26 * P.glow * nk;
    this.scene.environmentIntensity = .85 - .6 * nk;
    for (const b of this.spin) b.rotation.z -= dt * 7 * P.fan * (this.air ? 1.5 : 1) * (1 + nk * .3);
    if (this.air) this.flow(dt, L);

    const w = this.host.clientWidth, h = this.host.clientHeight;
    for (const { el, a } of this.hot) {
      a.getWorldPosition(v3).project(this.cam);
      const off = v3.z > 1;
      el.style.transform = `translate(${(v3.x * .5 + .5) * w}px,${(-v3.y * .5 + .5) * h}px)`;
      el.style.opacity = off ? 0 : 1; el.style.pointerEvents = off ? 'none' : 'auto';
    }
    this.ctl.update();
    this.renderer.render(this.scene, this.cam);
  }
}
