// Atelier — pilotage aux mains par la caméra (MediaPipe Hand Landmarker, calcul 100 % sur l'appareil)
//
// Chaque main est suivie et interprétée séparément : on peut pointer d'une main et tourner la vue de l'autre.
// Seuls le pouce, l'index et le majeur décident du geste : l'annulaire et l'auriculaire sont ignorés,
// pour que les doigts « qui traînent » ne déclenchent rien.
//
//  • POINTER      : index tendu, majeur replié → le curseur suit le bout de l'index, ce qu'il vise s'éclaire
//  • SÉLECTIONNER : rester pointé sur la cible (l'anneau se remplit), ou pousser le doigt vers l'écran
//  • ZOOMER       : pouce et index qui s'écartent / se rapprochent, comme sur un téléphone
//                   (objet sélectionné → il grandit / rétrécit ; sinon la vue zoome)
//  • TOURNER      : main ouverte qui balaie (gauche, droite, haut, bas)
//  • PIVOTER      : objet sélectionné, main ouverte, on tourne le poignet comme un bouton
//  • DÉPLACER     : objet sélectionné, poing fermé → l'objet suit la main, on rouvre pour lâcher
//  • MODELER      : en mode modelage, on pousse le doigt vers l'écran et on le garde enfoncé pour travailler la matière
import * as THREE from 'three';

const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const CONNECTIONS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
const LABEL = { zoom: 'Zoom', scale: 'Taille', orbit: 'Rotation', twist: 'Pivoter', grab: 'Déplacer', sculpt: 'Modeler' };
const DWELL = 750;      // ms à rester pointé pour sélectionner
const STILL = 22;       // px de tolérance pendant ce temps

const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z - b.z) * 0.6);
function angle(a, b, c) {
  const v1 = [a.x - b.x, a.y - b.y, (a.z - b.z) * 0.6], v2 = [c.x - b.x, c.y - b.y, (c.z - b.z) * 0.6];
  const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  const n = Math.hypot(...v1) * Math.hypot(...v2) || 1;
  return Math.acos(Math.max(-1, Math.min(1, dot / n))) * 180 / Math.PI;
}
const straight = (lm, mcp, pip, tip) => angle(lm[mcp], lm[pip], lm[tip]);

class HandState {
  constructor(i) {
    this.i = i;
    this.el = document.createElement('div'); this.el.className = 'hand-cursor';
    this.el.innerHTML = '<svg viewBox="0 0 44 44"><circle class="ring" cx="22" cy="22" r="17"/><circle class="dwell" cx="22" cy="22" r="17" pathLength="100"/></svg><span class="hc-label"></span>';
    document.body.appendChild(this.el);
    this.reset();
  }
  reset() {
    Object.assign(this, { seen: false, lost: 0, x: 0, y: 0, palmX: 0, palmY: 0, hist: [], pose: null, candidate: null, poseCount: 0, mode: 'idle',
      ext: { index: false, middle: false }, gapHist: [], gapRef: null, zoomLastGap: null, zoomLastMove: 0, scaled: false,
      sizeHist: [], pressBase: null, pressed: false, lastTap: 0, quietUntil: 0,
      dwell: null, dwellDone: null, palm: null, wh: [], roll0: 0, rot0: 0, grabOff: null, grabY: 0, grabMoved: false, sculpting: false });
  }
}

export class Hands {
  constructor(engine, video, overlay, ui) {
    this.engine = engine; this.video = video; this.overlay = overlay; this.ui = ui;
    this.ctx = overlay.getContext('2d');
    this.active = false; this.landmarker = null; this.mirror = true;
    this.hands = [new HandState(0), new HandState(1)];
  }

  async load() {
    if (this.landmarker) return;
    const { FilesetResolver, HandLandmarker } = await import('../lib/mediapipe/vision_bundle.mjs');
    const files = await FilesetResolver.forVisionTasks(new URL('../lib/mediapipe/wasm', import.meta.url).href);
    const opts = d => ({ baseOptions: { modelAssetPath: MODEL, delegate: d }, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.55 });
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
    for (const h of this.hands) { this.endMode(h); h.el.className = 'hand-cursor'; h.reset(); }
    this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    this.engine.setHover?.(null); this.setUiHover(null);
    this.engine.sculptor.showBrush(null);
  }

  toScreen(nx, ny) {
    const W = window.innerWidth, H = window.innerHeight;
    const vw = this.video.videoWidth || 640, vh = this.video.videoHeight || 480;
    const va = vw / vh, sa = W / H;
    let dw, dh, ox, oy;
    if (va > sa) { dh = H; dw = H * va; ox = (W - dw) / 2; oy = 0; } else { dw = W; dh = W / va; ox = 0; oy = (H - dh) / 2; }
    if (this.mirror) nx = 1 - nx;
    const m = 0.12; nx = (nx - m) / (1 - 2 * m); ny = (ny - m) / (1 - 2 * m);
    return { x: ox + nx * dw, y: oy + ny * dh };
  }

  // posture : seuls pouce, index et majeur comptent ; seuils à hystérésis pour éviter les clignotements
  readPose(h, lm) {
    const size = d3(lm[0], lm[9]) || 0.1;
    const fing = (name, mcp, pip, tip) => {
      const a = straight(lm, mcp, pip, tip), far = d3(lm[0], lm[tip]) > d3(lm[0], lm[pip]) * 1.08;
      if (h.ext[name]) { if (a < 135 || !far) h.ext[name] = false; } else if (a > 158 && far) h.ext[name] = true;
      return a;
    };
    const idxAngle = fing('index', 5, 6, 8);
    fing('middle', 9, 10, 12);
    const ring = straight(lm, 13, 14, 16) > 150; // seulement pour reconnaître la main grande ouverte
    const gap = d3(lm[4], lm[8]) / size;
    const thumbOut = d3(lm[4], lm[9]) / size > 0.7;
    let pose;
    if (h.ext.index && h.ext.middle && ring) pose = 'open';
    else if (h.ext.index && !h.ext.middle) pose = 'point';
    else if (!h.ext.index && !h.ext.middle && idxAngle < 100) pose = 'fist';
    else if (!h.ext.middle && gap < 0.35) pose = 'point'; // pince fermée (début de zoom) : on reste en mode pointer
    else pose = 'other';
    return { pose, size, gap, idxAngle, thumbOut };
  }

  tick() {
    const v = this.video;
    if (!this.landmarker || v.readyState < 2) return;
    const now = performance.now(); if (now <= (this.lastTs || 0)) return; this.lastTs = now;
    let res; try { res = this.landmarker.detectForVideo(v, now); } catch { return; }
    const dpr = devicePixelRatio;
    this.overlay.width = window.innerWidth * dpr; this.overlay.height = window.innerHeight * dpr;
    const ctx = this.ctx;
    const found = (res.landmarks || []).slice(0, 2).map(lm => ({ lm, P: lm.map(p => this.toScreen(p.x, p.y)) }));
    // chaque main garde « son » curseur : appariement par proximité avec la position précédente
    const slots = [null, null]; const [h0, h1] = this.hands;
    const dist = (f, h) => h.seen ? Math.hypot(f.P[9].x - h.palmX, f.P[9].y - h.palmY) : 1e5 + (h.i ? -f.P[9].x : f.P[9].x);
    if (found.length === 2) {
      const [a, b] = found;
      if (dist(a, h0) + dist(b, h1) <= dist(b, h0) + dist(a, h1)) { slots[0] = a; slots[1] = b; } else { slots[0] = b; slots[1] = a; }
    } else if (found.length === 1) slots[h1.seen && (!h0.seen || dist(found[0], h1) < dist(found[0], h0)) ? 1 : 0] = found[0];
    let hovered = null, uiHover = null, brush = null;
    for (let k = 0; k < 2; k++) {
      const h = this.hands[k], f = slots[k];
      if (!f) {
        if (h.seen && ++h.lost > 6) { this.endMode(h); h.seen = false; h.el.classList.remove('on'); h.pose = null; h.candidate = null; }
        continue;
      }
      h.lost = 0;
      this.draw(ctx, f.P, dpr, k);
      const r = this.update(h, f.lm, f.P, now);
      if (r?.hover) hovered = r.hover; if (r?.ui) uiHover = r.ui; if (r?.brush) brush = r.brush;
    }
    this.engine.setHover?.(hovered);
    this.setUiHover(uiHover);
    const sc = this.engine.sculptor;
    if (sc.active && !sc.stroke) sc.showBrush(brush);
  }

  draw(ctx, P, dpr, k) {
    ctx.lineWidth = 2 * dpr; ctx.lineCap = 'round';
    ctx.strokeStyle = k ? 'rgba(196,212,232,0.7)' : 'rgba(232,214,180,0.75)';
    ctx.beginPath(); for (const [a, b] of CONNECTIONS) { ctx.moveTo(P[a].x * dpr, P[a].y * dpr); ctx.lineTo(P[b].x * dpr, P[b].y * dpr); } ctx.stroke();
    ctx.fillStyle = 'rgba(255,244,222,0.95)';
    for (const i of [4, 8, 12]) { ctx.beginPath(); ctx.arc(P[i].x * dpr, P[i].y * dpr, 3.2 * dpr, 0, 7); ctx.fill(); }
  }

  update(h, lm, P, now) {
    const info = this.readPose(h, lm);
    h.palmX = P[9].x; h.palmY = P[9].y;
    if (info.pose === h.candidate) h.poseCount++; else { h.candidate = info.pose; h.poseCount = 1; }
    const need = h.mode === 'zoom' || h.mode === 'grab' || h.mode === 'twist' || h.sculpting ? 6 : 4; // un geste en cours tient bon
    const stable = h.poseCount >= need ? h.candidate : h.pose;
    if (stable !== h.pose) { this.endMode(h); h.pose = stable; this.beginMode(h, P); }

    // curseur au bout de l'index, lissé (plus fort quand on bouge peu → visée précise)
    const tip = P[8];
    if (!h.seen) { h.x = tip.x; h.y = tip.y; h.seen = true; }
    if (h.mode !== 'zoom') {
      const sp = Math.hypot(tip.x - h.x, tip.y - h.y);
      const k = Math.min(0.6, 0.12 + sp / 110);
      h.x += (tip.x - h.x) * k; h.y += (tip.y - h.y) * k;
    }
    h.hist.push({ t: now, x: h.x, y: h.y }); while (h.hist.length && now - h.hist[0].t > 800) h.hist.shift();

    let out = null;
    if (h.pose === 'point') out = this.doPoint(h, info, now);
    else if (h.pose === 'open') this.doOpen(h, P, now);
    else if (h.pose === 'fist') this.doGrab(h, P);
    else h.mode = 'idle';

    const pos = h.pose === 'open' || h.pose === 'fist' ? P[9] : { x: h.x, y: h.y };
    h.el.classList.add('on');
    h.el.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    const shown = h.mode === 'zoom' && this.engine.selected ? 'scale' : h.mode;
    h.el.dataset.mode = h.mode; h.el.dataset.pose = h.pose || '';
    h.el.querySelector('.hc-label').textContent = LABEL[shown] || '';
    return out;
  }

  beginMode(h, P) {
    h.mode = { point: 'point', open: 'orbit', fist: 'grab' }[h.pose] || 'idle';
    h.gapHist = []; h.dwell = null; h.palm = null; h.wh = []; h.sizeHist = []; h.pressed = false; h.pressBase = null;
    h.el.style.setProperty('--dwell', 0);
    if (h.pose === 'fist') {
      const e = this.engine;
      if (e.selected && !e.sculptor.active) {
        h.grabY = e.selected.position.y;
        const fp = e.floorPoint(P[9].x, P[9].y, h.grabY);
        h.grabOff = fp ? e.selected.position.clone().sub(fp) : null; h.grabMoved = false;
      } else h.grabOff = null;
    }
  }
  endMode(h) {
    const e = this.engine;
    if (h.mode === 'grab' && h.grabOff && h.grabMoved) e.commit();
    if (h.mode === 'zoom') { if (h.scaled) e.commit(); h.scaled = false; h.quietUntil = performance.now() + 700; }
    if (h.mode === 'twist') e.commit();
    if (h.sculpting) { h.sculpting = false; if (e.sculptor.end()) e.commit(); }
    h.grabOff = null; h.palm = null; h.pressed = false;
    h.el.style.setProperty('--dwell', 0);
  }

  // pointer, sélectionner, zoomer, modeler
  doPoint(h, info, now) {
    const e = this.engine;
    // --- zoom façon téléphone : l'écart pouce-index change franchement, la main reste en place
    h.gapHist.push({ t: now, g: info.gap, out: info.thumbOut, x: h.x, y: h.y }); while (h.gapHist.length && now - h.gapHist[0].t > 350) h.gapHist.shift();
    const first = h.gapHist[0], dg = info.gap - first.g;
    const handStill = Math.hypot(h.x - first.x, h.y - first.y) < 70;
    const zoomOk = (dg > 0 ? info.thumbOut : first.out) && handStill && !h.pressed && !h.sculpting;
    if (h.mode !== 'zoom' && zoomOk && Math.abs(dg) > 0.3 && h.gapHist.length > 3) {
      h.mode = 'zoom'; h.gapRef = first.g; h.zoomLastGap = info.gap; h.zoomLastMove = now; h.dwell = null; h.el.style.setProperty('--dwell', 0);
    }
    if (h.mode === 'zoom') {
      const prev = h.gapRef; h.gapRef = info.gap;
      const f = (prev + 0.15) / (info.gap + 0.15);
      if (Math.abs(f - 1) > 0.002) {
        if (e.selected) {
          const k = THREE.MathUtils.clamp(e.selected.scale.x / f, 0.02, 400) / e.selected.scale.x;
          e.selected.scale.multiplyScalar(k); h.scaled = true; this.ui.showDims?.();
        } else { e.orbit.goal = null; e.orbit.radius = THREE.MathUtils.clamp(e.orbit.radius * f, 0.3, 4000); }
      }
      if (Math.abs(info.gap - h.zoomLastGap) > 0.03) { h.zoomLastGap = info.gap; h.zoomLastMove = now; }
      if (now - h.zoomLastMove > 500) { if (h.scaled) { h.scaled = false; e.commit(); } h.mode = 'point'; h.gapHist = []; h.quietUntil = now + 500; }
      return null;
    }
    if (!h.sculpting) h.mode = 'point';

    // --- appui « pousser le doigt » : la main grossit nettement et vite
    h.sizeHist.push({ t: now, v: info.size }); while (h.sizeHist.length && now - h.sizeHist[0].t > 1200) h.sizeHist.shift();
    if (!h.pressed) {
      const old = h.sizeHist.filter(s => now - s.t > 250);
      if (old.length > 3 && now > h.quietUntil) {
        const base = old.reduce((a, s) => a + s.v, 0) / old.length;
        const moved = Math.hypot(h.x - h.hist[0].x, h.y - h.hist[0].y);
        if (info.size > base * 1.12 && moved < 90) {
          h.pressed = true; h.pressBase = base;
          const ref = h.hist.find(p => now - p.t < 300) || { x: h.x, y: h.y };
          if (e.sculptor.active && e.selected && e.sculptor.begin(e.selected, ref.x, ref.y)) { h.sculpting = true; h.mode = 'sculpt'; }
          else this.tap(h, ref.x, ref.y, now);
        }
      }
    } else {
      if (h.sculpting) e.sculptor.move(h.x, h.y);
      if (info.size < h.pressBase * 1.05) { // doigt revenu
        h.pressed = false; h.sizeHist = []; h.quietUntil = now + 250;
        if (h.sculpting) { h.sculpting = false; if (e.sculptor.end()) e.commit(); h.mode = 'point'; }
      }
    }
    if (h.sculpting) return null;

    // --- survol
    const ui = this.uiTarget(h.x, h.y);
    const hit = ui ? null : e.pick(h.x, h.y);
    const target = ui || hit?.object || null;
    h.el.classList.toggle('over-ui', !!ui); h.el.classList.toggle('over-obj', !!hit);
    const brush = !ui && e.sculptor.active && e.selected ? e.sculptor.hit(e.selected, h.x, h.y) : null;

    // --- sélection en restant pointé (sur la forme en cours de modelage, c'est l'appui qui modèle)
    const dwellAllowed = now > h.quietUntil && !brush && target && h.dwellDone !== target;
    if (!dwellAllowed) { h.dwell = null; h.el.style.setProperty('--dwell', 0); }
    else if (!h.dwell || h.dwell.target !== target || Math.hypot(h.x - h.dwell.x, h.y - h.dwell.y) > STILL) h.dwell = { target, t: now, x: h.x, y: h.y };
    else {
      const p = (now - h.dwell.t) / DWELL; h.el.style.setProperty('--dwell', Math.min(1, p).toFixed(3));
      if (p >= 1) { this.tap(h, h.dwell.x, h.dwell.y, now); h.dwell = null; h.el.style.setProperty('--dwell', 0); }
    }
    if (h.dwellDone && h.dwellDone !== target) h.dwellDone = null; // on a quitté la cible : elle redevient sélectionnable
    return { hover: hit?.object && hit.object !== e.selected ? hit.object : null, ui, brush };
  }

  tap(h, x, y, now) {
    const e = this.engine;
    if (now - h.lastTap < 500) return; h.lastTap = now;
    h.el.classList.remove('tap'); void h.el.offsetWidth; h.el.classList.add('tap');
    const ui = this.uiTarget(x, y);
    if (ui) { ui.click(); ui.classList.add('hand-clicked'); setTimeout(() => ui.classList.remove('hand-clicked'), 250); h.dwellDone = ui; return; }
    const hit = e.pick(x, y);
    if (hit) { e.setSelection(hit.object, hit.role); h.dwellDone = hit.object; }
    else e.setSelection(null);
  }

  // main ouverte : balayer pour tourner la vue, tourner le poignet pour pivoter l'objet sélectionné
  doOpen(h, P, now) {
    const e = this.engine, p = P[0];
    const roll = Math.atan2(P[9].x - P[0].x, -(P[9].y - P[0].y));
    h.wh = h.wh.filter(s => now - s.t < 400); h.wh.push({ t: now, x: p.x, y: p.y, r: roll });
    if (!h.palm) { h.palm = { x: p.x, y: p.y }; return; }
    if (e.selected && h.mode !== 'twist' && h.wh.length > 3) {
      const h0 = h.wh[0];
      let dr = roll - h0.r; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      const drift = Math.max(...h.wh.map(s => Math.hypot(s.x - h0.x, s.y - h0.y)));
      if (Math.abs(dr) > 0.3 && drift < 45) { h.mode = 'twist'; h.roll0 = h0.r; h.rot0 = e.selected.rotation.y; }
    }
    if (h.mode === 'twist' && e.selected) {
      let dr = roll - h.roll0; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      let r = h.rot0 - dr * 1.4; const step = Math.PI / 12, near = Math.round(r / step) * step; if (Math.abs(r - near) < 0.05) r = near;
      e.selected.rotation.y = r; this.ui.showDims?.();
      h.palm.x = p.x; h.palm.y = p.y;
      return;
    }
    h.mode = 'orbit';
    const dx = p.x - h.palm.x, dy = p.y - h.palm.y;
    h.palm.x += dx * 0.6; h.palm.y += dy * 0.6;
    if (Math.hypot(dx, dy) > 0.8) e.orbitBy(dx * 0.006, dy * 0.005);
  }

  doGrab(h, P) {
    const e = this.engine;
    if (!e.selected || !h.grabOff) return;
    const fp = e.floorPoint(P[9].x, P[9].y, h.grabY);
    if (!fp) return;
    const np = fp.add(h.grabOff);
    const nx = Math.round(np.x * 20) / 20, nz = Math.round(np.z * 20) / 20;
    if (nx !== e.selected.position.x || nz !== e.selected.position.z) { e.selected.position.x = nx; e.selected.position.z = nz; h.grabMoved = true; }
  }

  uiTarget(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el || el.tagName === 'CANVAS') return null;
    return el.closest('button, a, [data-hand], .card, .chip, summary');
  }
  setUiHover(t) {
    if (this._hov && this._hov !== t) this._hov.classList.remove('hand-hover');
    if (t) t.classList.add('hand-hover'); this._hov = t;
  }
}
