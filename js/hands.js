// Atelier — pilotage aux mains par la caméra (MediaPipe Hand Landmarker, calcul 100 % sur l'appareil)
//
// UNIQUEMENT LE POUCE ET L'INDEX. Les trois autres doigts sont totalement ignorés : ils peuvent être
// repliés, tendus, bouger… rien ne se déclenche. Chaque main est suivie séparément.
//
//  • VISER            : le curseur suit le bout de l'index ; ce qu'il vise s'éclaire avec son nom
//  • TOUCHER (clic)   : pincer pouce + index puis relâcher → sélectionne l'objet, clique le bouton, ou désélectionne
//  • GLISSER          : pincer, bouger, relâcher → sur un objet : on le déplace ; dans le vide : on tourne la vue
//  • ZOOMER           : sans pincer, écarter / rapprocher pouce et index, comme sur un téléphone
//                       (objet sélectionné → il grandit / rétrécit ; sinon la vue zoome)
//  • DEUX MAINS       : les deux pincent et s'écartent → taille / zoom ; elles tournent l'une autour de l'autre → rotation
//  • MODELER          : en mode modelage, pincer sur la matière et glisser
import * as THREE from 'three';

const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8]]; // pouce et index seulement
const LABEL = { zoom: 'Zoom', scale: 'Taille', orbit: 'Rotation', move: 'Déplacer', sculpt: 'Modeler', two: 'Deux mains', twoscale: 'Taille', pinch: '' };
const PINCH_ON = 0.3, PINCH_OFF = 0.55;   // écart pouce-index / taille de la main : fermé / rouvert (marqué, avec hystérésis)
const DRAG = 26;                          // px de déplacement avant que le pincement devienne un glisser

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z - b.z) * 0.5);

class HandState {
  constructor(i) {
    this.i = i;
    this.el = document.createElement('div'); this.el.className = 'hand-cursor';
    this.el.innerHTML = '<svg viewBox="0 0 44 44"><circle class="ring" cx="22" cy="22" r="17"/><circle class="dwell" cx="22" cy="22" r="17" pathLength="100"/></svg><span class="hc-label"></span>';
    document.body.appendChild(this.el);
    this.reset();
  }
  reset() {
    Object.assign(this, { seen: false, lost: 0, x: 0, y: 0, ox: 0, oy: 0, palmX: 0, palmY: 0, hist: [], pinched: false, pinchFrames: 0, mode: 'aim',
      press: null, gapHist: [], zoom: null, quietUntil: 0, lastPinch: 0 });
  }
}

export class Hands {
  constructor(engine, video, overlay, ui) {
    this.engine = engine; this.video = video; this.overlay = overlay; this.ui = ui;
    this.ctx = overlay.getContext('2d');
    this.active = false; this.landmarker = null; this.mirror = true;
    this.hands = [new HandState(0), new HandState(1)];
    this.two = null;
  }

  async load() {
    if (this.landmarker) return;
    const { FilesetResolver, HandLandmarker } = await import('../lib/mediapipe/vision_bundle.mjs');
    const files = await FilesetResolver.forVisionTasks(new URL('../lib/mediapipe/wasm', import.meta.url).href);
    const opts = d => ({ baseOptions: { modelAssetPath: MODEL, delegate: d }, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: 0.55, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
    try { this.landmarker = await HandLandmarker.createFromOptions(files, opts('GPU')); }
    catch { this.landmarker = await HandLandmarker.createFromOptions(files, opts('CPU')); }
  }
  async start(mirror) {
    this.mirror = mirror;
    await this.load();
    this.active = true; document.body.classList.add('hands-on');
    const loop = () => { if (!this.active) return; this.engine.touch(); try { this.tick(); } catch (e) { console.error(e); } requestAnimationFrame(loop); };
    loop();
  }
  stop() {
    this.active = false; document.body.classList.remove('hands-on');
    for (const h of this.hands) { this.release(h, true); h.el.className = 'hand-cursor'; h.reset(); }
    this.endTwo();
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

  tick() {
    const v = this.video;
    if (!this.landmarker || v.readyState < 2) return;
    const now = performance.now(); if (now <= (this.lastTs || 0)) return; this.lastTs = now;
    let res; try { res = this.landmarker.detectForVideo(v, now); } catch { return; }
    const dpr = devicePixelRatio;
    this.overlay.width = window.innerWidth * dpr; this.overlay.height = window.innerHeight * dpr;
    const found = (res.landmarks || []).slice(0, 2).map(lm => ({ lm, P: lm.map(p => this.toScreen(p.x, p.y)) }));
    // chaque main garde son curseur : appariement par proximité avec la position précédente
    const slots = [null, null]; const [h0, h1] = this.hands;
    const d = (f, h) => h.seen ? Math.hypot(f.P[5].x - h.palmX, f.P[5].y - h.palmY) : 1e5 + (h.i ? -f.P[5].x : f.P[5].x);
    if (found.length === 2) {
      const [a, b] = found;
      if (d(a, h0) + d(b, h1) <= d(b, h0) + d(a, h1)) { slots[0] = a; slots[1] = b; } else { slots[0] = b; slots[1] = a; }
    } else if (found.length === 1) slots[h1.seen && (!h0.seen || d(found[0], h1) < d(found[0], h0)) ? 1 : 0] = found[0];

    let hovered = null, uiHover = null, brush = null;
    for (let k = 0; k < 2; k++) {
      const h = this.hands[k], f = slots[k];
      if (!f) {
        if (h.seen && ++h.lost > 15) { this.release(h, true); h.seen = false; h.el.classList.remove('on'); }
        continue;
      }
      h.lost = 0;
      this.draw(f.P, dpr, k, h.pinched);
      const r = this.update(h, f.lm, f.P, now);
      if (r?.hover) hovered = r.hover; if (r?.ui) uiHover = r.ui; if (r?.brush) brush = r.brush;
    }
    this.updateTwo();
    this.engine.setHover?.(hovered);
    this.setUiHover(uiHover);
    const sc = this.engine.sculptor;
    if (sc.active && !sc.stroke) sc.showBrush(brush);
  }

  draw(P, dpr, k, pinched) {
    const ctx = this.ctx;
    ctx.lineWidth = 2.4 * dpr; ctx.lineCap = 'round';
    ctx.strokeStyle = pinched ? 'rgba(154,214,255,0.95)' : (k ? 'rgba(170,205,235,0.6)' : 'rgba(205,230,250,0.7)');
    ctx.beginPath(); for (const [a, b] of BONES) { ctx.moveTo(P[a].x * dpr, P[a].y * dpr); ctx.lineTo(P[b].x * dpr, P[b].y * dpr); } ctx.stroke();
    ctx.fillStyle = pinched ? 'rgba(154,214,255,1)' : 'rgba(238,244,250,0.95)';
    for (const i of [4, 8]) { ctx.beginPath(); ctx.arc(P[i].x * dpr, P[i].y * dpr, 4.5 * dpr, 0, 7); ctx.fill(); }
  }

  update(h, lm, P, now) {
    const e = this.engine;
    const size = dist(lm[0], lm[5]) || 0.1;
    const gap = dist(lm[4], lm[8]) / size;
    h.palmX = P[5].x; h.palmY = P[5].y;

    // pincement franc, confirmé sur 2 images, avec hystérésis
    const want = h.pinched ? gap < PINCH_OFF : gap < PINCH_ON;
    if (want !== h.pinched) { if (++h.pinchFrames >= 2) { h.pinchFrames = 0; h.pinched = want; } } else h.pinchFrames = 0;

    // curseur : bout de l'index (point milieu pouce-index pendant le pincement), sans saut au changement
    const raw = h.pinched ? { x: (P[4].x + P[8].x) / 2, y: (P[4].y + P[8].y) / 2 } : P[8];
    if (!h.seen) { h.x = raw.x; h.y = raw.y; h.seen = true; }
    if (h.wasPinched !== h.pinched) { h.ox += h.x - raw.x - h.ox; h.oy += h.y - raw.y - h.oy; h.wasPinched = h.pinched; }
    h.ox *= 0.85; h.oy *= 0.85;
    const tx = raw.x + h.ox, ty = raw.y + h.oy;
    if (!h.zoom) {
      const sp = Math.hypot(tx - h.x, ty - h.y);
      const k = Math.min(0.65, 0.16 + sp / 100);
      h.x += (tx - h.x) * k; h.y += (ty - h.y) * k;
    }
    h.hist.push({ t: now, x: h.x, y: h.y }); while (h.hist.length && now - h.hist[0].t > 600) h.hist.shift();

    let out = null;
    if (h.pinched && !h.press) this.pinchStart(h, now);
    if (!h.pinched && h.press) this.release(h, false, now);
    if (h.pinched) this.pinchMove(h, now);
    else out = this.aim(h, gap, now);

    h.el.classList.add('on');
    h.el.classList.toggle('pinch', h.pinched);
    h.el.style.transform = `translate(${h.x}px, ${h.y}px)`;
    const shown = h.mode === 'zoom' && e.selected ? 'scale' : h.mode;
    h.el.dataset.mode = h.mode;
    h.el.querySelector('.hc-label').textContent = LABEL[shown] || '';
    return out;
  }

  // main ouverte (pas de pincement) : viser + zoom façon téléphone
  aim(h, gap, now) {
    const e = this.engine;
    h.gapHist.push({ t: now, g: gap, x: h.x, y: h.y }); while (h.gapHist.length && now - h.gapHist[0].t > 380) h.gapHist.shift();
    const first = h.gapHist[0];
    if (!h.zoom && now > h.quietUntil && h.gapHist.length > 4) {
      const dg = gap - first.g, minG = Math.min(...h.gapHist.map(s => s.g));
      const still = Math.hypot(h.x - first.x, h.y - first.y) < 70;
      if (Math.abs(dg) > 0.5 && minG > PINCH_ON + 0.05 && still) {
        // on mémorise l'état de départ : si c'était en fait un pincement qui se prépare, on annulera
        h.zoom = { gap: first.g, t: now, last: now, lastGap: gap, start: e.selected ? { obj: e.selected, scale: e.selected.scale.clone() } : { radius: e.orbit.radius }, changed: false };
      }
    }
    if (h.zoom) {
      const z = h.zoom, f = (z.gap + 0.2) / (gap + 0.2); z.gap = gap;
      if (Math.abs(f - 1) > 0.003) {
        if (e.selected) { const k = THREE.MathUtils.clamp(e.selected.scale.x / f, 0.02, 400) / e.selected.scale.x; e.selected.scale.multiplyScalar(k); this.ui.showDims?.(); }
        else { e.orbit.goal = null; e.orbit.radius = THREE.MathUtils.clamp(e.orbit.radius * f, 0.3, 4000); }
        z.changed = true;
      }
      if (Math.abs(gap - z.lastGap) > 0.04) { z.lastGap = gap; z.last = now; }
      h.mode = 'zoom';
      if (now - z.last > 500) this.endZoom(h, true);
      return null;
    }
    h.mode = 'aim';

    const ui = this.uiTarget(h.x, h.y);
    const hit = ui ? null : e.pick(h.x, h.y);
    h.el.classList.toggle('over-ui', !!ui); h.el.classList.toggle('over-obj', !!hit);
    const brush = !ui && e.sculptor.active && e.selected ? e.sculptor.hit(e.selected, h.x, h.y) : null;
    return { hover: hit?.object && hit.object !== e.selected ? hit.object : null, ui, brush };
  }
  endZoom(h, keep) {
    const z = h.zoom; if (!z) return;
    const e = this.engine;
    if (!keep) { // le « zoom » était le début d'un pincement : on remet tout comme avant
      if (z.start.obj) z.start.obj.scale.copy(z.start.scale); else if (z.start.radius) e.orbit.radius = z.start.radius;
      this.ui.showDims?.();
    } else if (z.changed && z.start.obj) e.commit();
    h.zoom = null; h.gapHist = []; h.quietUntil = performance.now() + 350; h.mode = 'aim';
  }

  pinchStart(h, now) {
    const e = this.engine; h.pinchT0 = now;
    if (h.zoom) this.endZoom(h, now - h.zoom.t > 600); // un vrai zoom déjà avancé est gardé, sinon annulé
    // point visé juste avant de pincer (le geste de pincer fait bouger le doigt)
    const ref = h.hist.find(p => now - p.t < 160) || { x: h.x, y: h.y };
    const ui = this.uiTarget(ref.x, ref.y);
    const hit = ui ? null : e.pick(ref.x, ref.y);
    h.press = { t: now, x: ref.x, y: ref.y, ui, hit, dragging: false, mode: null };
    h.mode = 'pinch';
    window.atelierTick?.(520);
  }

  pinchMove(h) {
    const e = this.engine, p = h.press; if (!p) return;
    if (this.two) return; // les deux mains travaillent ensemble
    const moved = Math.hypot(h.x - p.x, h.y - p.y);
    if (!p.dragging && moved > DRAG) {
      p.dragging = true; p.lx = h.x; p.ly = h.y;
      if (p.ui?.type === 'range') p.mode = 'range';
      else if (p.ui) p.mode = p.ui.closest('#dock, #sheet, #inspector') ? 'scroll' : 'none';
      else if (e.sculptor.active && e.selected && e.sculptor.begin(e.selected, p.x, p.y)) p.mode = 'sculpt';
      else if (p.hit) {
        if (e.selected !== p.hit.object) e.setSelection(p.hit.object, p.hit.role);
        p.mode = 'move'; p.drag = e.dragStart(e.selected, p.x, p.y);
      } else if (now - (h.pinchT0 || 0) < 220) { p.dragging = false; return; } // pincement fantôme : pas de rotation sans geste tenu
      else p.mode = 'orbit';
    }
    if (!p.dragging) return;
    h.mode = p.mode === 'none' || p.mode === 'range' || p.mode === 'scroll' ? 'pinch' : p.mode;
    if (p.mode === 'move' && p.drag) {
      if (e.dragMove(p.drag, h.x, h.y)) p.moved = true;
    } else if (p.mode === 'orbit') {
      e.orbitBy((h.x - p.lx) * 0.008, (h.y - p.ly) * 0.007);
    } else if (p.mode === 'sculpt') e.sculptor.move(h.x, h.y);
    else if (p.mode === 'scroll') { const sc = p.ui.closest('#dock, #sheet, #inspector'); const horiz = sc.id === 'sheet' && sc.scrollWidth > sc.clientWidth + 4; if (horiz) sc.scrollLeft -= h.x - p.lx; else sc.scrollTop -= h.y - p.ly; p.moved = true; }
    else if (p.mode === 'range') {
      const r = p.ui.getBoundingClientRect(); const t = Math.max(0, Math.min(1, (h.x - r.left) / r.width));
      p.ui.value = +p.ui.min + (+p.ui.max - +p.ui.min) * t; p.ui.dispatchEvent(new Event('input', { bubbles: true }));
    }
    p.lx = h.x; p.ly = h.y;
  }

  release(h, lost, now = performance.now()) {
    const e = this.engine, p = h.press;
    if (h.zoom) this.endZoom(h, true);
    if (!p) return;
    h.press = null; h.mode = 'aim';
    if (lost) { if (p.mode === 'sculpt' && e.sculptor.end()) e.commit(); else if (p.moved) e.commit(); return; }
    if (p.dragging) {
      if (p.mode === 'move' && p.moved) e.commit();
      else if (p.mode === 'sculpt') { if (e.sculptor.end()) e.commit(); }
      else if (p.mode === 'range') p.ui.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if (now - p.t > 900) return; // pincement tenu longtemps sans bouger : on ne fait rien
    // pincer-relâcher = toucher
    h.el.classList.remove('tap'); void h.el.offsetWidth; h.el.classList.add('tap');
    window.atelierTick?.(760);
    if (p.ui) { p.ui.click(); p.ui.classList.add('hand-clicked'); setTimeout(() => p.ui.classList.remove('hand-clicked'), 250); return; }
    if (p.hit) e.setSelection(p.hit.object, p.hit.role);
    else e.setSelection(null);
  }

  // deux mains qui pincent en même temps : taille / zoom et rotation
  // applaudissement : les deux mains ouvertes se rejoignent → tout lâcher
  checkClap(now) {
    const [a, b] = this.hands, e = this.engine;
    if (!(a.seen && b.seen) || a.pinched || b.pinched) { this.apart = 0; return; }
    const d = Math.hypot(a.palmX - b.palmX, a.palmY - b.palmY), ref = Math.min(innerWidth, innerHeight);
    if (d > ref * 0.42) { this.apart = this.apart || now; return; }
    if (this.apart && now - this.apart > 250 && d < ref * 0.2 && now - (this.clapT || 0) > 1200) {
      this.clapT = now; this.apart = 0; e.setSelection(null); window.atelierTick?.(520); this.ui.toast?.('👏 Tout lâché');
    }
  }
  updateTwo() {
    const [a, b] = this.hands, e = this.engine;
    this.checkClap(performance.now());
    const both = a.seen && b.seen && a.pinched && b.pinched && a.press && b.press && !a.press.ui && !b.press.ui;
    if (both && !this.two) {
      this.two = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), obj: e.sculptor.active ? null : e.selected, radius: e.orbit.radius, az: e.orbit.az };
      if (this.two.obj) { this.two.scale = this.two.obj.scale.clone(); this.two.rot = this.two.obj.rotation.y; }
      for (const h of this.hands) { if (h.press?.mode === 'sculpt') e.sculptor.end(); h.press.dragging = true; h.press.mode = 'none'; }
    } else if (both && this.two) {
      const t = this.two, d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
      const k = THREE.MathUtils.clamp(d / Math.max(t.d, 1), 0.05, 20);
      let da = ang - t.ang; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (t.obj && t.obj.parent) { t.obj.scale.copy(t.scale).multiplyScalar(k); t.obj.rotation.y = t.rot - da; this.ui.showDims?.(); }
      else { e.orbit.goal = null; e.orbit.radius = THREE.MathUtils.clamp(t.radius / k, 0.3, 4000); e.orbit.az = t.az + da; }
      for (const h of this.hands) h.mode = t.obj ? 'twoscale' : 'two';
    } else if (!both && this.two) this.endTwo();
  }
  endTwo() {
    if (!this.two) return;
    if (this.two.obj) this.engine.commit();
    this.two = null;
  }

  uiTarget(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el || el.tagName === 'CANVAS') return null;
    return el.closest('button, a, [data-hand], .card, .chip, summary, input[type=range]');
  }
  setUiHover(t) {
    if (this._hov && this._hov !== t) this._hov.classList.remove('hand-hover');
    if (t) t.classList.add('hand-hover'); this._hov = t;
  }
}
