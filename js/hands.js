// Atelier — pilotage à une seule main par la caméra (MediaPipe Hand Landmarker, calcul 100 % sur l'appareil)
//
// Gestes (une seule main) :
//  • POINTER  : index tendu (les autres doigts repliés) → le curseur suit le bout de l'index, l'objet visé s'illumine
//  • APPUYER  : geste d'appui avec l'index (on « enfonce » le doigt vers l'écran, ou on le plie et le retend)
//               → sélectionne l'objet visé, ou clique sur le bouton visé, ou désélectionne dans le vide
//  • ZOOMER   : comme sur un téléphone, pouce + index qui s'écartent (zoom avant) ou se rapprochent (zoom arrière)
//  • TOURNER  : main ouverte, on balaie à gauche / à droite / en haut / en bas
//  • DÉPLACER : poing fermé quand un objet est sélectionné → l'objet suit la main ; on rouvre la main pour le lâcher
import * as THREE from 'three';

const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const CONNECTIONS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
const FINGERS = { index: [5, 6, 8], middle: [9, 10, 12], ring: [13, 14, 16], pinky: [17, 18, 20] };
const LABEL = { point: '', zoom: 'Zoom', orbit: 'Rotation', grab: 'Déplacer' };

const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z - b.z) * 0.6);
function angle(a, b, c) { // angle en degrés au point b
  const v1 = [a.x - b.x, a.y - b.y, (a.z - b.z) * 0.6], v2 = [c.x - b.x, c.y - b.y, (c.z - b.z) * 0.6];
  const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  const n = Math.hypot(...v1) * Math.hypot(...v2) || 1;
  return Math.acos(Math.max(-1, Math.min(1, dot / n))) * 180 / Math.PI;
}

export class Hands {
  constructor(engine, video, overlay, ui) {
    this.engine = engine; this.video = video; this.overlay = overlay; this.ui = ui;
    this.ctx = overlay.getContext('2d');
    this.active = false; this.landmarker = null; this.mirror = true;
    this.cursor = document.createElement('div'); this.cursor.className = 'hand-cursor';
    this.cursor.innerHTML = '<span class="hc-label"></span>';
    document.body.appendChild(this.cursor);
    this.reset();
  }
  reset() {
    this.s = { seen: false, x: 0, y: 0, hist: [], pose: null, poseCount: 0, mode: 'point', candidate: null,
      dip: null, push: null, scaleHist: [], lastTap: 0, gapRef: null, gapHist: [], palm: null, grabOff: null, grabY: 0, lost: 0 };
  }

  async load() {
    if (this.landmarker) return;
    const { FilesetResolver, HandLandmarker } = await import('../lib/mediapipe/vision_bundle.mjs');
    const files = await FilesetResolver.forVisionTasks(new URL('../lib/mediapipe/wasm', import.meta.url).href);
    const opts = d => ({ baseOptions: { modelAssetPath: MODEL, delegate: d }, runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.55 });
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
    this.cursor.className = 'hand-cursor';
    this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    this.engine.setHover?.(null);
    this.setUiHover(null);
    this.reset();
  }

  // coordonnées normalisées de la vidéo → pixels écran (vidéo en object-fit: cover)
  toScreen(nx, ny) {
    const W = window.innerWidth, H = window.innerHeight;
    const vw = this.video.videoWidth || 640, vh = this.video.videoHeight || 480;
    const va = vw / vh, sa = W / H;
    let dw, dh, ox, oy;
    if (va > sa) { dh = H; dw = H * va; ox = (W - dw) / 2; oy = 0; } else { dw = W; dh = W / va; ox = 0; oy = (H - dh) / 2; }
    if (this.mirror) nx = 1 - nx;
    // marge : on étire un peu pour atteindre les bords de l'écran sans sortir du champ de la caméra
    const m = 0.12; nx = (nx - m) / (1 - 2 * m); ny = (ny - m) / (1 - 2 * m);
    return { x: ox + nx * dw, y: oy + ny * dh };
  }

  // lecture de la posture de la main
  readPose(lm) {
    const size = d3(lm[0], lm[9]) || 0.1;
    const ext = {};
    for (const [f, [mcp, pip, tip]] of Object.entries(FINGERS)) {
      ext[f] = angle(lm[mcp], lm[pip], lm[tip]) > 150 && d3(lm[0], lm[tip]) > d3(lm[0], lm[pip]) * 1.05;
    }
    const idxAngle = angle(lm[5], lm[6], lm[8]);
    const gap = d3(lm[4], lm[8]) / size;              // écart pouce-index
    const others = ext.middle + ext.ring + ext.pinky;
    let pose;
    if (others >= 3 && ext.index) pose = 'open';
    else if (others === 0 && !ext.index && idxAngle < 90) pose = 'fist';
    else if (others <= 1) pose = 'point';             // index (et éventuellement pouce) en avant
    else pose = 'other';
    return { pose, size, gap, idxAngle };
  }

  tick() {
    const v = this.video;
    if (!this.landmarker || v.readyState < 2) return;
    const now = performance.now(); if (now <= (this.lastTs || 0)) return; this.lastTs = now;
    let res; try { res = this.landmarker.detectForVideo(v, now); } catch { return; }
    const dpr = devicePixelRatio;
    const W = this.overlay.width = window.innerWidth * dpr, H = this.overlay.height = window.innerHeight * dpr;
    const ctx = this.ctx; ctx.clearRect(0, 0, W, H);
    const lm = res.landmarks?.[0];
    const s = this.s, c = this.cursor;
    if (!lm) {
      if (s.seen && ++s.lost > 6) { this.endMode(); s.seen = false; c.classList.remove('on'); this.engine.setHover?.(null); this.setUiHover(null); }
      return;
    }
    s.lost = 0;

    // squelette lumineux
    const P = lm.map(p => this.toScreen(p.x, p.y));
    ctx.lineWidth = 2 * dpr; ctx.strokeStyle = 'rgba(232,214,180,0.7)'; ctx.lineCap = 'round';
    ctx.beginPath(); for (const [a, b] of CONNECTIONS) { ctx.moveTo(P[a].x * dpr, P[a].y * dpr); ctx.lineTo(P[b].x * dpr, P[b].y * dpr); } ctx.stroke();
    ctx.fillStyle = 'rgba(255,244,222,0.95)';
    for (const p of P) { ctx.beginPath(); ctx.arc(p.x * dpr, p.y * dpr, 2.4 * dpr, 0, 7); ctx.fill(); }

    const info = this.readPose(lm);
    // la posture doit être stable quelques images avant de changer de mode (évite les à-coups)
    if (info.pose === s.candidate) s.poseCount++; else { s.candidate = info.pose; s.poseCount = 1; }
    const stable = s.poseCount >= 3 ? s.candidate : s.pose;
    if (stable !== s.pose) { this.endMode(); s.pose = stable; this.beginMode(stable, info, P); }

    // curseur : bout de l'index, lissage adaptatif (lent = précis, rapide = réactif)
    const tip = P[8];
    if (!s.seen) { s.x = tip.x; s.y = tip.y; s.seen = true; }
    const frozen = s.mode === 'zoom' || s.dip || s.push;
    if (!frozen) {
      const sp = Math.hypot(tip.x - s.x, tip.y - s.y);
      const k = Math.min(0.65, 0.18 + sp / 90);
      s.x += (tip.x - s.x) * k; s.y += (tip.y - s.y) * k;
    }
    s.hist.push({ t: now, x: s.x, y: s.y }); while (s.hist.length && now - s.hist[0].t > 600) s.hist.shift();

    // modes
    if (s.pose === 'point') this.doPoint(info, now);
    else if (s.pose === 'open') this.doOrbit(P, now);
    else if (s.pose === 'fist') this.doGrab(P);

    // affichage du curseur
    const pos = s.pose === 'open' || s.pose === 'fist' ? P[9] : { x: s.x, y: s.y };
    c.classList.add('on');
    c.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    c.dataset.mode = s.mode;
    c.querySelector('.hc-label').textContent = LABEL[s.mode] || '';
  }

  beginMode(pose, info, P) {
    const s = this.s;
    s.mode = { point: 'point', open: 'orbit', fist: 'grab' }[pose] || 'idle';
    s.gapHist = []; s.gapRef = null; s.dip = null; s.push = null; s.scaleHist = [];
    if (pose === 'open') s.palm = { x: P[9].x, y: P[9].y };
    if (pose === 'fist') {
      const e = this.engine;
      if (e.selected) {
        s.grabY = e.selected.position.y;
        const fp = e.floorPoint(P[9].x, P[9].y, s.grabY);
        s.grabOff = fp ? e.selected.position.clone().sub(fp) : null;
        s.grabMoved = false;
      } else s.grabOff = null;
      this.engine.setHover?.(null); this.setUiHover(null);
    }
  }
  endMode() {
    const s = this.s;
    if (s.mode === 'grab' && s.grabOff && s.grabMoved) this.engine.commit();
    if (s.mode === 'zoom') s.mode = 'point';
    s.grabOff = null; s.palm = null;
  }

  // pointer, appuyer, zoomer
  doPoint(info, now) {
    const s = this.s, e = this.engine;
    // --- zoom façon téléphone : l'écart pouce-index change vite alors que la main reste en place
    s.gapHist.push({ t: now, g: info.gap }); while (s.gapHist.length && now - s.gapHist[0].t > 350) s.gapHist.shift();
    const g0 = s.gapHist[0].g, dg = info.gap - g0;
    if (s.mode !== 'zoom' && !s.dip && !s.push && info.idxAngle > 140 && Math.abs(dg) > 0.32 && s.gapHist.length > 3) { s.mode = 'zoom'; s.gapRef = g0; e.setHover?.(null); } // on reprend depuis le début du geste
    if (s.mode === 'zoom') {
      const prev = s.gapRef; s.gapRef = info.gap;
      const f = (prev + 0.15) / (info.gap + 0.15); // écarter → on se rapproche
      if (Math.abs(f - 1) > 0.002) { e.orbit.goal = null; e.orbit.radius = THREE.MathUtils.clamp(e.orbit.radius * f, 0.6, 120); }
      // on sort du zoom quand l'écart ne bouge plus pendant un moment
      if (Math.abs(info.gap - (s.zoomLastGap ?? info.gap)) > 0.03) { s.zoomLastGap = info.gap; s.zoomLastMove = now; }
      if (now - (s.zoomLastMove ?? now) > 450) { s.mode = 'point'; s.gapHist = []; s.zoomLastGap = null; s.zoomLastMove = null; }
      else s.zoomLastMove ??= now;
      return;
    }

    // --- survol
    const ui = this.uiTarget(s.x, s.y);
    this.setUiHover(ui);
    const hit = ui ? null : e.pick(s.x, s.y);
    e.setHover?.(hit?.object && hit.object !== e.selected ? hit.object : null);
    this.cursor.classList.toggle('over-ui', !!ui);
    this.cursor.classList.toggle('over-obj', !!hit);

    // --- appui n°1 : l'index se plie puis se retend
    if (!s.dip && info.idxAngle < 128) {
      const ref = s.hist.find(h => now - h.t < 260) || s.hist[0];
      s.dip = { t: now, x: ref?.x ?? s.x, y: ref?.y ?? s.y };
    }
    if (s.dip) {
      if (info.idxAngle > 150) { const d = s.dip; s.dip = null; if (now - d.t < 650) this.tap(d.x, d.y, now); }
      else if (now - s.dip.t > 900) s.dip = null; // doigt resté plié : ce n'était pas un appui
    }
    // --- appui n°2 : on « enfonce » le doigt vers l'écran (la main grossit puis revient)
    s.scaleHist.push({ t: now, v: info.size }); while (s.scaleHist.length && now - s.scaleHist[0].t > 700) s.scaleHist.shift();
    if (!s.dip && s.scaleHist.length > 5) {
      const base = Math.min(...s.scaleHist.slice(0, 4).map(h => h.v));
      if (!s.push && info.size > base * 1.12) {
        const ref = s.hist.find(h => now - h.t < 260) || s.hist[0];
        s.push = { t: now, base, x: ref?.x ?? s.x, y: ref?.y ?? s.y };
      }
      if (s.push) {
        if (info.size < s.push.base * 1.05) { const p = s.push; s.push = null; if (now - p.t < 700) this.tap(p.x, p.y, now); s.scaleHist = []; }
        else if (now - s.push.t > 900) { s.push = null; s.scaleHist = []; } // la main s'est juste rapprochée
      }
    }
  }

  tap(x, y, now) {
    const s = this.s, e = this.engine;
    if (now - s.lastTap < 450) return; s.lastTap = now;
    this.cursor.classList.remove('tap'); void this.cursor.offsetWidth; this.cursor.classList.add('tap');
    const ui = this.uiTarget(x, y);
    if (ui) { ui.click(); ui.classList.add('hand-clicked'); setTimeout(() => ui.classList.remove('hand-clicked'), 250); return; }
    const hit = e.pick(x, y);
    if (hit) e.setSelection(hit.object, hit.role); else e.setSelection(null);
    e.setHover?.(null);
  }

  // main ouverte qui balaie : tourner autour de la scène
  doOrbit(P) {
    const s = this.s, p = P[9];
    if (!s.palm) { s.palm = { x: p.x, y: p.y }; return; }
    const dx = p.x - s.palm.x, dy = p.y - s.palm.y;
    s.palm.x += dx * 0.6; s.palm.y += dy * 0.6;
    if (Math.hypot(dx, dy) > 0.8) this.engine.orbitBy(dx * 0.006, dy * 0.005);
  }

  // poing fermé : l'objet sélectionné suit la main
  doGrab(P) {
    const s = this.s, e = this.engine;
    if (!e.selected || !s.grabOff) return;
    const fp = e.floorPoint(P[9].x, P[9].y, s.grabY);
    if (!fp) return;
    const np = fp.add(s.grabOff);
    const nx = Math.round(np.x * 20) / 20, nz = Math.round(np.z * 20) / 20;
    if (nx !== e.selected.position.x || nz !== e.selected.position.z) { e.selected.position.x = nx; e.selected.position.z = nz; s.grabMoved = true; }
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
