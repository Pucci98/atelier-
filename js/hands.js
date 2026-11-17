// Atelier — pilotage aux mains par la caméra (MediaPipe Hand Landmarker, calcul 100 % sur l'appareil)
import * as THREE from 'three';

const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const CONNECTIONS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];

export class Hands {
  constructor(engine, video, overlay, ui) {
    this.engine = engine; this.video = video; this.overlay = overlay; this.ui = ui;
    this.ctx = overlay.getContext('2d');
    this.active = false; this.landmarker = null; this.mirror = true;
    this.state = [this.newHand(), this.newHand()];
    this.cursors = [0, 1].map(i => { const d = document.createElement('div'); d.className = 'hand-cursor'; d.dataset.i = i; document.body.appendChild(d); return d; });
    this.lastTs = -1;
  }
  newHand() { return { x: 0, y: 0, sx: 0, sy: 0, pinch: false, t0: 0, mode: null, moved: 0, off: null, planeY: 0, seen: false }; }

  async load() {
    if (this.landmarker) return;
    const { FilesetResolver, HandLandmarker } = await import('../lib/mediapipe/vision_bundle.mjs');
    const files = await FilesetResolver.forVisionTasks(new URL('../lib/mediapipe/wasm', import.meta.url).href);
    const opts = d => ({ baseOptions: { modelAssetPath: MODEL, delegate: d }, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: 0.55, minHandPresenceConfidence: 0.55, minTrackingConfidence: 0.5 });
    try { this.landmarker = await HandLandmarker.createFromOptions(files, opts('GPU')); }
    catch { this.landmarker = await HandLandmarker.createFromOptions(files, opts('CPU')); }
  }

  async start(mirror) {
    this.mirror = mirror;
    await this.load();
    this.active = true; document.body.classList.add('hands-on');
    const loop = () => { if (!this.active) return; this.tick(); requestAnimationFrame(loop); };
    loop();
  }
  stop() {
    this.active = false; document.body.classList.remove('hands-on');
    this.cursors.forEach(c => c.classList.remove('on', 'pinch'));
    this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    this.state = [this.newHand(), this.newHand()];
  }

  // coordonnées normalisées de la vidéo → pixels écran (vidéo en object-fit: cover)
  toScreen(nx, ny) {
    const W = window.innerWidth, H = window.innerHeight;
    const vw = this.video.videoWidth || 640, vh = this.video.videoHeight || 480;
    const va = vw / vh, sa = W / H;
    let dw, dh, ox, oy;
    if (va > sa) { dh = H; dw = H * va; ox = (W - dw) / 2; oy = 0; } else { dw = W; dh = W / va; ox = 0; oy = (H - dh) / 2; }
    if (this.mirror) nx = 1 - nx;
    // marge : on étire un peu pour atteindre les bords de l'écran sans sortir du champ
    const m = 0.12; nx = (nx - m) / (1 - 2 * m); ny = (ny - m) / (1 - 2 * m);
    return { x: ox + nx * dw, y: oy + ny * dh };
  }

  tick() {
    const v = this.video;
    if (!this.landmarker || v.readyState < 2) return;
    const ts = performance.now(); if (ts <= this.lastTs) return; this.lastTs = ts;
    let res; try { res = this.landmarker.detectForVideo(v, ts); } catch { return; }
    const W = this.overlay.width = window.innerWidth * devicePixelRatio, H = this.overlay.height = window.innerHeight * devicePixelRatio;
    const ctx = this.ctx; ctx.clearRect(0, 0, W, H);
    const hands = (res.landmarks || []).slice(0, 2);
    // ordre stable : main la plus à gauche à l'écran = 0
    const withX = hands.map(lm => ({ lm, x: this.toScreen(lm[9].x, lm[9].y).x })).sort((a, b) => a.x - b.x);
    for (let i = 0; i < 2; i++) {
      const h = this.state[i], c = this.cursors[i];
      const lm = withX[i]?.lm;
      if (!lm) { if (h.seen) this.release(h, true); h.seen = false; c.classList.remove('on', 'pinch'); continue; }
      // squelette lumineux
      const P = lm.map(p => this.toScreen(p.x, p.y));
      ctx.lineWidth = 2 * devicePixelRatio; ctx.strokeStyle = 'rgba(232,214,180,0.75)'; ctx.lineCap = 'round';
      ctx.beginPath(); for (const [a, b] of CONNECTIONS) { ctx.moveTo(P[a].x * devicePixelRatio, P[a].y * devicePixelRatio); ctx.lineTo(P[b].x * devicePixelRatio, P[b].y * devicePixelRatio); } ctx.stroke();
      ctx.fillStyle = 'rgba(255,244,222,0.95)';
      for (const p of P) { ctx.beginPath(); ctx.arc(p.x * devicePixelRatio, p.y * devicePixelRatio, 2.6 * devicePixelRatio, 0, 7); ctx.fill(); }
      // pincement pouce-index, normalisé par la taille de la main
      const size = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) || 0.1;
      const pd = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) / size;
      const mid = this.toScreen((lm[4].x + lm[8].x) / 2, (lm[4].y + lm[8].y) / 2);
      if (!h.seen) { h.x = mid.x; h.y = mid.y; h.seen = true; }
      const px = h.x, py = h.y;
      h.x += (mid.x - h.x) * 0.5; h.y += (mid.y - h.y) * 0.5;
      c.classList.add('on'); c.style.transform = `translate(${h.x}px, ${h.y}px)`;
      const pinching = h.pinch ? pd < 0.42 : pd < 0.27;
      c.style.setProperty('--p', Math.max(0, Math.min(1, (0.6 - pd) / 0.35)).toFixed(2));
      this.hover(c, h);
      if (pinching && !h.pinch) this.press(h, i);
      else if (!pinching && h.pinch) this.release(h, false);
      else if (pinching) this.drag(h, h.x - px, h.y - py);
      c.classList.toggle('pinch', h.pinch);
    }
    this.twoHands();
  }

  uiTarget(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el || el.tagName === 'CANVAS') return null;
    return el.closest('button, [data-hand], .card, .chip, input[type=range], summary');
  }
  hover(c, h) {
    const t = this.uiTarget(h.x, h.y);
    if (this._hov && this._hov !== t) this._hov.classList.remove('hand-hover');
    if (t) t.classList.add('hand-hover'); this._hov = t;
    c.classList.toggle('over-ui', !!t);
  }

  press(h, i) {
    h.pinch = true; h.t0 = performance.now(); h.moved = 0; h.sx = h.x; h.sy = h.y;
    const ui = this.uiTarget(h.x, h.y);
    if (ui) { h.mode = 'ui'; h.uiEl = ui; return; }
    const e = this.engine;
    const hit = e.pick(h.x, h.y);
    if (hit) {
      if (e.selected !== hit.object) e.setSelection(hit.object, hit.role);
      h.mode = 'grab'; h.planeY = hit.object.position.y;
      const fp = e.floorPoint(h.x, h.y, h.planeY);
      h.off = fp ? hit.object.position.clone().sub(fp) : new THREE.Vector3();
    } else h.mode = 'orbit';
  }
  drag(h, dx, dy) {
    h.moved += Math.hypot(dx, dy);
    const e = this.engine;
    if (this.two) return;
    if (h.mode === 'grab' && e.selected) {
      const fp = e.floorPoint(h.x, h.y, h.planeY);
      if (fp) { const p = fp.add(h.off); e.selected.position.x = Math.round(p.x * 20) / 20; e.selected.position.z = Math.round(p.z * 20) / 20; }
    } else if (h.mode === 'orbit') e.orbitBy(dx * 0.007, dy * 0.006);
    else if (h.mode === 'ui' && h.uiEl?.type === 'range') {
      const r = h.uiEl.getBoundingClientRect(); const t = Math.max(0, Math.min(1, (h.x - r.left) / r.width));
      const min = +h.uiEl.min, max = +h.uiEl.max; h.uiEl.value = min + (max - min) * t; h.uiEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  release(h, lost) {
    const e = this.engine;
    const quick = performance.now() - h.t0 < 450 && h.moved < 18;
    if (!lost) {
      if (h.mode === 'ui' && quick && h.uiEl) { h.uiEl.click(); h.uiEl.classList.add('hand-clicked'); setTimeout(() => h.uiEl?.classList.remove('hand-clicked'), 250); }
      else if (h.mode === 'ui' && h.uiEl?.type === 'range') h.uiEl.dispatchEvent(new Event('change', { bubbles: true }));
      else if (h.mode === 'orbit' && quick) e.setSelection(null);
      else if (h.mode === 'grab' && h.moved > 4) e.commit();
    } else if (h.mode === 'grab') e.commit();
    h.pinch = false; h.mode = null; h.uiEl = null;
  }

  // deux mains qui pincent : agrandir/réduire + tourner l'objet, ou zoomer la vue
  twoHands() {
    const [a, b] = this.state; const e = this.engine;
    const both = a.pinch && b.pinch && a.mode !== 'ui' && b.mode !== 'ui';
    if (both && !this.two) {
      this.two = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), scale: e.selected?.scale.clone(), rotY: e.selected?.rotation.y, radius: e.orbit.radius, sel: !!e.selected };
    } else if (both && this.two) {
      const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
      const k = d / Math.max(this.two.d, 1);
      if (this.two.sel && e.selected) {
        e.selected.scale.copy(this.two.scale).multiplyScalar(THREE.MathUtils.clamp(k, 0.05, 30));
        e.selected.rotation.y = this.two.rotY - (ang - this.two.ang);
        this.ui.showDims?.();
      } else { e.orbit.goal = null; e.orbit.radius = THREE.MathUtils.clamp(this.two.radius / k, 0.6, 120); }
    } else if (!both && this.two) {
      if (this.two.sel) e.commit();
      this.two = null; a.moved = b.moved = 99; // évite un « clic » au relâchement
    }
  }
}
