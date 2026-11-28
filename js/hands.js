// ALMYGO — pilotage aux mains par la caméra (MediaPipe Hand Landmarker, calcul 100 % sur l'appareil)
//
// Seuls le POUCE et l'INDEX comptent ; les autres doigts sont ignorés. Chaque main a son curseur.
//
//  • VISER          : le curseur suit le bout de l'index (filtré, sans tremblement) ; un anneau 3D se pose sur l'objet visé
//  • TOUCHER        : pincer pouce + index puis relâcher → sélectionne l'objet, appuie sur le bouton, ou désélectionne
//  • GLISSER        : pincer, bouger, relâcher → objet : on le déplace · vide : on tourne la vue · liste : elle défile
//  • ZOOMER         : double pincement rapide → main droite = zoom avant, main gauche = zoom arrière
//                     (objet sélectionné → il grandit / rétrécit, sinon la vue avance / recule ; la sélection ne change pas)
//  • DEUX MAINS     : les deux pincent et s'écartent → taille / zoom ; tournent l'une autour de l'autre → rotation
//  • APPLAUDIR      : les deux mains ouvertes se rejoignent vite → tout lâcher
//  • MODELER        : en mode modelage, pincer sur la matière et glisser
import * as THREE from 'three';

const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8]]; // pouce et index seulement
const LABEL = { scale: 'Taille', orbit: 'Rotation', move: 'Déplacer', sculpt: 'Modeler', scroll: 'Défiler', two: 'Vue', twoscale: 'Taille' };

const PINCH_ON = 0.4, PINCH_OFF = 0.62; // écart pouce-index / taille de la main : fermé / rouvert (hystérésis)
const TAP_MAX = 700;                    // ms : au-delà, un pincement immobile n'est plus un toucher
const UI_MAX = 2500;                    // ms : un bouton accepte un appui tenu plus longtemps
const DOUBLE = 800;                     // ms entre deux touchers pour un double pincement
const LOST_MS = 320;                    // ms sans voir la main avant de la considérer partie
const FIXED = '#top, #selPanel, #modal, #cmd';
const SCROLLS = '#dock, #sheet, #inspector, #modal';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z - b.z) * 0.5);
const canScroll = (n, cs = getComputedStyle(n)) => ({
  x: /(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 2,
  y: /(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 2,
});
function scrollerOf(el) {
  for (let n = el; n && n !== document.body; n = n.parentElement) { const c = canScroll(n); if (c.x || c.y) return n; }
  return null;
}

// filtre « One Euro » : très lisse quand la main est posée, réactif quand elle bouge vite
class OneEuro {
  constructor(minCut = 1.3, beta = 0.012, dCut = 1) { Object.assign(this, { minCut, beta, dCut, x: null, dx: 0, t: 0 }); }
  a(cut, dt) { const r = 2 * Math.PI * cut * dt; return r / (r + 1); }
  f(v, t) {
    if (this.x == null) { this.x = v; this.t = t; return v; }
    const dt = Math.max(1e-3, (t - this.t) / 1000); this.t = t;
    const d = (v - this.x) / dt; this.dx += this.a(this.dCut, dt) * (d - this.dx);
    this.x += this.a(this.minCut + this.beta * Math.abs(this.dx), dt) * (v - this.x);
    return this.x;
  }
  reset() { this.x = null; this.dx = 0; }
}

class Hand {
  constructor(i) {
    this.i = i;
    this.el = document.createElement('div'); this.el.className = 'hand-cursor';
    this.el.innerHTML = '<svg viewBox="0 0 44 44"><circle class="ring" cx="22" cy="22" r="17"/><circle class="core" cx="22" cy="22" r="5"/></svg><span class="hc-label"></span>';
    document.body.appendChild(this.el);
    this.f = { tx: new OneEuro(), ty: new OneEuro(), mx: new OneEuro(), my: new OneEuro() };
    this.reset();
  }
  reset() {
    Object.assign(this, { seen: false, last: 0, x: 0, y: 0, offX: 0, offY: 0, gap: null, pinched: false, pf: 0,
      press: null, mode: 'aim', hist: [], palmX: 0, palmY: 0, sizePx: 80 });
    for (const k in this.f) this.f[k].reset();
  }
}

export class Hands {
  constructor(engine, video, overlay, ui) {
    this.engine = engine; this.video = video; this.overlay = overlay; this.ui = ui;
    this.ctx = overlay.getContext('2d');
    this.active = false; this.landmarker = null; this.mirror = true;
    this.hands = [new Hand(0), new Hand(1)];
    this.two = null; this.lastTap = null; this.dh = []; this.clapT = 0;
    this.diag = false; this.diagT = 0; this.fps = 0; this.lastVT = -1;
    this.makeReticle();
  }

  // anneau 3D posé à la surface de l'objet visé (suit la face, garde la même taille à l'écran)
  makeReticle() {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.78, 1, 48), new THREE.MeshBasicMaterial({ color: 0x9ad6ff, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20), m.material); m.add(dot);
    m.renderOrder = 999; dot.renderOrder = 999; m.visible = false; m.userData.helper = true;
    this.reticle = m; this.engine.scene?.add(m);
  }
  showReticle(hit, pressed) {
    const r = this.reticle; if (!r) return;
    if (!hit?.point) { r.visible = false; return; }
    const cam = this.engine.camera, n = hit.normal || cam.position.clone().sub(hit.point).normalize();
    r.position.copy(hit.point).addScaledVector(n, 0.004);
    r.lookAt(hit.point.clone().add(n));
    r.scale.setScalar(cam.position.distanceTo(hit.point) * (pressed ? 0.014 : 0.02));
    r.material.color.set(pressed ? 0xffc46b : 0x9ad6ff); r.visible = true;
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
    const v = this.video;
    if (v.requestVideoFrameCallback) { // on ne détecte que sur une vraie nouvelle image de la caméra
      this.rvfc = true; const cb = () => { if (!this.active) return; this.fresh = true; v.requestVideoFrameCallback(cb); };
      v.requestVideoFrameCallback(cb);
    }
    const loop = () => { if (!this.active) return; try { this.tick(); } catch (e) { console.error(e); } requestAnimationFrame(loop); };
    loop();
  }
  stop() {
    this.active = false; document.body.classList.remove('hands-on');
    for (const h of this.hands) { this.release(h, true); h.el.className = 'hand-cursor'; h.reset(); }
    this.endTwo(); this.clear();
    this.engine.setHover?.(null); this.setUiHover(null); this.showReticle(null);
    this.engine.sculptor?.showBrush(null);
    document.getElementById('handsDiag')?.remove();
  }

  toScreen(nx, ny) {
    const W = innerWidth, H = innerHeight;
    const vw = this.video.videoWidth || 640, vh = this.video.videoHeight || 480, va = vw / vh;
    let dw, dh, ox, oy;
    if (va > W / H) { dh = H; dw = H * va; ox = (W - dw) / 2; oy = 0; } else { dw = W; dh = W / va; ox = 0; oy = (H - dh) / 2; }
    if (this.mirror) nx = 1 - nx;
    const m = 0.12; nx = (nx - m) / (1 - 2 * m); ny = (ny - m) / (1 - 2 * m); // le bord de l'image atteint le bord de l'écran
    return { x: ox + nx * dw, y: oy + ny * dh };
  }

  // une image caméra : détection seulement quand une NOUVELLE image arrive (économise batterie et chauffe)
  tick() {
    const v = this.video, now = performance.now();
    this.engine.touch();
    // filet de sécurité : si le navigateur ne signale plus les images (vidéo masquée…), on revient au temps de lecture
    const fresh = this.rvfc && now - (this.lastDet || 0) < 250 ? this.fresh : this.fresh || v.currentTime !== this.lastVT;
    if (!this.landmarker || v.readyState < 2 || !fresh) { this.frame([], now, false); return; }
    this.fresh = false; this.lastVT = v.currentTime;
    let res; try { res = this.landmarker.detectForVideo(v, now); } catch { return; }
    this.fps += ((1000 / Math.max(1, now - (this.lastDet || now - 33))) - this.fps) * 0.1; this.lastDet = now;
    this.frame((res.landmarks || []).slice(0, 2).map(lm => ({ lm, P: lm.map(p => this.toScreen(p.x, p.y)) })), now, true);
  }

  clear() {
    const c = this.overlay, dpr = devicePixelRatio, W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; } else this.ctx.clearRect(0, 0, W, H);
  }

  // cœur testable : reçoit les mains détectées (repères + positions écran) et fait vivre les gestes
  frame(found, now, fresh = true) {
    const e = this.engine;
    if (fresh) {
      this.clear();
      // chaque main garde son curseur : appariement par proximité avec la position précédente
      const slots = [null, null], [h0, h1] = this.hands;
      const d = (f, h) => h.seen ? Math.hypot(f.P[5].x - h.palmX, f.P[5].y - h.palmY) : 1e5 + (h.i ? -f.P[5].x : f.P[5].x);
      if (found.length === 2) {
        const [a, b] = found;
        if (d(a, h0) + d(b, h1) <= d(b, h0) + d(a, h1)) { slots[0] = a; slots[1] = b; } else { slots[0] = b; slots[1] = a; }
      } else if (found.length === 1) slots[h1.seen && (!h0.seen || d(found[0], h1) < d(found[0], h0)) ? 1 : 0] = found[0];
      for (let k = 0; k < 2; k++) {
        const h = this.hands[k], f = slots[k];
        if (f) { h.last = now; this.draw(f.P, h); this.update(h, f.lm, f.P, now); }
      }
    }
    let hover = null, uiHover = null, brush = null, ret = null;
    for (const h of this.hands) {
      if (h.seen && now - h.last > LOST_MS) { this.release(h, true, now); h.el.classList.remove('on'); h.reset(); } // main repartie : tout repart de zéro (pas de curseur qui glisse depuis l'ancienne place)
      if (!h.seen) continue;
      if (h.pinched) this.pinchMove(h, now);
      if (h.out) { hover ||= h.out.hover; uiHover ||= h.out.ui; brush ||= h.out.brush; ret ||= h.out.ret; }
      if (h.press?.mode === 'move' && h.press.drag) ret = null;
    }
    this.updateTwo(now);
    this.checkClap(now);
    e.setHover?.(hover);
    this.setUiHover(uiHover);
    this.showReticle(brush || e.sculptor?.active ? null : ret, ret?.pressed);
    const sc = e.sculptor; if (sc?.active && !sc.stroke) sc.showBrush(brush);
    this.diagnose(now);
  }

  draw(P, h) {
    const ctx = this.ctx, dpr = devicePixelRatio, k = h.gap == null ? 0 : THREE.MathUtils.clamp((1.1 - h.gap) / (1.1 - PINCH_ON), 0, 1);
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.2 * dpr; ctx.strokeStyle = h.pinched ? 'rgba(255,196,107,.95)' : 'rgba(205,230,250,.55)';
    ctx.beginPath(); for (const [a, b] of BONES) { ctx.moveTo(P[a].x * dpr, P[a].y * dpr); ctx.lineTo(P[b].x * dpr, P[b].y * dpr); } ctx.stroke();
    // trait pouce-index : il s'allume à mesure que les doigts se rapprochent (on voit le pincement arriver)
    if (!h.pinched && k > 0.15) { ctx.lineWidth = 1.6 * dpr; ctx.strokeStyle = `rgba(154,214,255,${k * 0.9})`; ctx.beginPath(); ctx.moveTo(P[4].x * dpr, P[4].y * dpr); ctx.lineTo(P[8].x * dpr, P[8].y * dpr); ctx.stroke(); }
    ctx.fillStyle = h.pinched ? 'rgba(255,196,107,1)' : 'rgba(238,244,250,.95)';
    for (const i of [4, 8]) { ctx.beginPath(); ctx.arc(P[i].x * dpr, P[i].y * dpr, 4.2 * dpr, 0, 7); ctx.fill(); }
  }

  update(h, lm, P, now) {
    const size = dist(lm[0], lm[5]) || 0.1, raw = dist(lm[4], lm[8]) / size;
    h.gap = h.gap == null ? raw : h.gap + (raw - h.gap) * 0.65;
    h.palmX = P[5].x; h.palmY = P[5].y; h.sizePx = Math.hypot(P[0].x - P[5].x, P[0].y - P[5].y) || 80;

    // pincement : fermé net (1 image si franc, sinon 2), rouvert sur 2 images
    const was = h.pinched;
    if (!h.pinched) { if (h.gap < PINCH_ON) { if (h.gap < 0.3 || ++h.pf >= 2) { h.pinched = true; h.pf = 0; } } else h.pf = 0; }
    else if (h.gap > PINCH_OFF) { if (++h.pf >= 2) { h.pinched = false; h.pf = 0; } } else h.pf = 0;

    // curseur : bout de l'index ouvert, milieu pouce-index pincé ; deux filtres tenus à jour → aucun saut
    const tx = h.f.tx.f(P[8].x, now), ty = h.f.ty.f(P[8].y, now);
    const mx = h.f.mx.f((P[4].x + P[8].x) / 2, now), my = h.f.my.f((P[4].y + P[8].y) / 2, now);
    const bx = h.pinched ? mx : tx, by = h.pinched ? my : ty;
    if (!h.seen) { h.seen = true; h.x = bx; h.y = by; h.offX = h.offY = 0; }
    if (h.pinched && !was) {
      // le geste de pincer fait bouger le doigt : on revient au point visé juste avant
      const ref = h.hist.find(p => now - p.t < 140) || { x: h.x, y: h.y };
      h.anchor = { x: ref.x, y: ref.y, t: now };
    }
    if (h.pinched && h.anchor && now - h.anchor.t < 130) { h.offX = h.anchor.x - bx; h.offY = h.anchor.y - by; } // curseur figé le temps que le pincement se pose
    else if (!h.pinched && was) { h.offX = h.x - bx; h.offY = h.y - by; }
    if (!h.pinched) { h.offX *= 0.82; h.offY *= 0.82; }
    h.x = bx + h.offX; h.y = by + h.offY;
    if (!h.pinched) { h.hist.push({ t: now, x: h.x, y: h.y }); while (h.hist.length && now - h.hist[0].t > 400) h.hist.shift(); }

    if (h.pinched && !was) this.pinchStart(h, now);
    if (!h.pinched && was) this.release(h, false, now);
    h.out = h.pinched ? this.pressOut(h) : this.aim(h);

    h.el.classList.add('on'); h.el.classList.toggle('pinch', h.pinched);
    h.el.style.transform = `translate(${h.x}px, ${h.y}px)`;
    h.el.style.setProperty('--k', h.pinched ? 1 : THREE.MathUtils.clamp((1.1 - h.gap) / (1.1 - PINCH_ON), 0, 1).toFixed(2));
    h.el.dataset.mode = h.mode;
    const shown = h.mode === 'two' && this.two?.obj ? 'twoscale' : h.mode;
    h.el.querySelector('.hc-label').textContent = LABEL[shown] || '';
  }

  // main ouverte : on vise (bouton, objet, matière à modeler)
  aim(h) {
    const e = this.engine;
    h.mode = 'aim';
    const ui = this.uiTarget(h.x, h.y);
    const hit = ui ? null : e.pick(h.x, h.y);
    h.el.classList.toggle('over-ui', !!ui); h.el.classList.toggle('over-obj', !!hit);
    const brush = !ui && e.sculptor?.active && e.selected ? e.sculptor.hit(e.selected, h.x, h.y) : null;
    return { hover: hit?.object && hit.object !== e.selected ? hit.object : null, ui, brush, ret: hit };
  }
  pressOut(h) {
    const p = h.press; if (!p) return null;
    return { ui: p.ui, ret: p.hit && !p.dragging ? { ...p.hit, pressed: true } : null };
  }

  pinchStart(h, now) {
    const e = this.engine, x = h.x, y = h.y;
    const ui = this.uiTarget(x, y), hit = ui ? null : e.pick(x, y);
    h.press = { t: now, x, y, ui, hit, dragging: false, mode: null, vx: 0, vy: 0, prev: { obj: e.selected, role: e.selectedRole } };
    h.mode = 'pinch';
    window.atelierTick?.(520);
    // boutons des barres fixes (et du dock quand il ne défile pas) : appui immédiat, comme un doigt sur l'écran
    const dock = ui?.closest('#dock');
    if (ui && ui.tagName !== 'INPUT' && (ui.closest(FIXED) || (dock && !scrollerOf(ui)))) { h.press.clicked = true; this.press(ui); }
  }

  pinchMove(h, now) {
    const e = this.engine, p = h.press; if (!p || this.two) return;
    if (!p.dragging) {
      const moved = Math.hypot(h.x - p.x, h.y - p.y), lim = p.ui ? 18 : Math.max(20, h.sizePx * 0.22);
      if (moved < lim) return;
      if (!p.ui && !p.hit && now - p.t < 160) return; // geste trop vif pour être voulu : pas de rotation fantôme
      p.dragging = true; p.lx = p.x; p.ly = p.y;
      if (p.ui?.type === 'range') p.mode = 'range';
      else if (p.ui) {
        p.scroller = p.ui.closest(SCROLLS) ? scrollerOf(p.ui) : null; p.mode = p.scroller ? 'scroll' : 'none';
        if (p.scroller) p.scroller.style.scrollSnapType = 'none'; // l'aimantation des cartes bloquerait le défilement pas à pas
      }
      else if (e.sculptor?.active && e.selected && e.sculptor.begin(e.selected, p.x, p.y)) p.mode = 'sculpt';
      else if (p.hit) {
        if (e.selected !== p.hit.object) e.setSelection(p.hit.object, p.hit.role);
        p.mode = 'move'; p.drag = e.dragStart(e.selected, p.x, p.y);
      } else p.mode = 'orbit';
    }
    const dx = h.x - p.lx, dy = h.y - p.ly;
    h.mode = { move: 'move', orbit: 'orbit', sculpt: 'sculpt', scroll: 'scroll' }[p.mode] || 'pinch';
    if (p.mode === 'move') { if (e.dragMove(p.drag, h.x, h.y)) p.moved = true; }
    else if (p.mode === 'orbit') e.orbitBy(dx * 0.008, dy * 0.007);
    else if (p.mode === 'sculpt') e.sculptor.move(h.x, h.y);
    else if (p.mode === 'scroll') {
      const sc = p.scroller, c = canScroll(sc), G = 1.4; // la liste suit la main, un peu amplifiée
      if (c.x && Math.abs(dx) >= Math.abs(dy) * 0.6) sc.scrollLeft -= dx * G;
      if (c.y) sc.scrollTop -= dy * G;
      p.vx = p.vx * 0.6 + dx * G * 0.4; p.vy = p.vy * 0.6 + dy * G * 0.4; p.cx = c.x; p.cy = c.y;
    } else if (p.mode === 'range') {
      const r = p.ui.getBoundingClientRect(), t = THREE.MathUtils.clamp((h.x - r.left) / r.width, 0, 1);
      p.ui.value = +p.ui.min + (+p.ui.max - +p.ui.min) * t; p.ui.dispatchEvent(new Event('input', { bubbles: true }));
    }
    p.lx = h.x; p.ly = h.y;
  }

  release(h, lost, now = performance.now()) {
    const e = this.engine, p = h.press;
    if (!p) return;
    h.press = null; h.mode = 'aim';
    if (p.dragging || lost) {
      if (p.mode === 'move' && p.moved) e.commit();
      else if (p.mode === 'sculpt') { if (e.sculptor.end()) e.commit(); }
      else if (p.mode === 'range') p.ui.dispatchEvent(new Event('change', { bubbles: true }));
      else if (p.mode === 'scroll') this.coast(p.scroller, lost ? 0 : p.cx ? p.vx : 0, lost ? 0 : p.cy ? p.vy : 0);
      return;
    }
    if (p.clicked) return;
    if (p.ui) { if (now - p.t < UI_MAX) this.press(p.ui); return; }
    if (now - p.t > TAP_MAX) return; // pincement tenu immobile : on ne fait rien
    h.el.classList.remove('tap'); void h.el.offsetWidth; h.el.classList.add('tap');
    window.atelierTick?.(760);
    // double pincement au même endroit, même main : zoom (la sélection d'avant est remise telle quelle)
    const L = this.lastTap;
    if (L && L.i === h.i && now - L.t < DOUBLE && Math.hypot(p.x - L.x, p.y - L.y) < 90) {
      this.lastTap = null;
      const prev = L.prev; if (e.selected !== prev.obj) e.setSelection(prev.obj?.parent ? prev.obj : null, prev.role);
      this.zoom(L.right ? 1.25 : 0.8);
      return;
    }
    this.lastTap = { t: now, i: h.i, x: p.x, y: p.y, prev: p.prev, right: this.isRight(h) };
    if (p.hit) e.setSelection(p.hit.object, p.hit.role); else e.setSelection(null);
  }

  // main droite ou gauche : caméra avant (image miroir) comme arrière (main vue de dos), la droite de l'écran = la main droite
  isRight(h) {
    const o = this.hands[1 - h.i];
    return o.seen ? h.palmX > o.palmX : h.palmX > innerWidth / 2;
  }
  zoom(f) {
    const e = this.engine, s = e.selected;
    if (s) {
      const from = s.scale.clone(), to = from.clone().multiplyScalar(f), t0 = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / 180), q = 1 - (1 - k) ** 3;
        s.scale.lerpVectors(from, to, q); e.updateSelectionHelper?.(); this.ui.showDims?.(); e.touch();
        if (k < 1) requestAnimationFrame(step); else e.commit();
      };
      step();
    } else {
      const o = e.orbit, r = (o.goal?.radius ?? o.radius) / f;
      o.goal = { target: (o.goal?.target ?? o.target).clone(), radius: THREE.MathUtils.clamp(r, 0.3, 4000) };
      e.touch();
    }
    window.atelierTick?.(880); this.ui.toast?.(f > 1 ? 'Zoom +' : 'Zoom −');
  }
  // une liste lâchée en plein mouvement continue sur sa lancée
  coast(sc, vx, vy) {
    if (!sc) return;
    const done = () => { if (!this.hands.some(h => h.press?.scroller === sc)) sc.style.scrollSnapType = ''; }; // la liste se recale sur la carte la plus proche
    if (Math.hypot(vx, vy) < 2) { done(); return; }
    const step = () => {
      if (this.hands.some(h => h.press?.scroller === sc)) return; // repris en main
      sc.scrollLeft -= vx; sc.scrollTop -= vy; vx *= 0.92; vy *= 0.92;
      if (Math.hypot(vx, vy) > 0.4) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  }
  press(ui) {
    ui.click(); ui.classList.add('hand-clicked'); setTimeout(() => ui.classList.remove('hand-clicked'), 220);
  }

  // applaudissement : deux mains bien ouvertes, franchement écartées, qui se rejoignent vite → tout lâcher
  checkClap(now) {
    const [a, b] = this.hands, e = this.engine;
    if (!(a.seen && b.seen) || a.pinched || b.pinched || (a.gap ?? 0) < 0.55 || (b.gap ?? 0) < 0.55) { this.dh = []; return; }
    const d = Math.hypot(a.palmX - b.palmX, a.palmY - b.palmY);
    this.dh.push({ t: now, d }); while (this.dh.length && now - this.dh[0].t > 450) this.dh.shift();
    const far = Math.max(...this.dh.map(x => x.d)), u = (a.sizePx + b.sizePx) / 2; // mesuré en tailles de main : marche de près, de loin, en paysage
    if (d < u * 1.1 && far > u * 3 && now - this.clapT > 1500) {
      this.clapT = now; this.dh = []; e.setSelection(null); window.atelierTick?.(520); this.ui.toast?.('👏 Tout lâché');
    }
  }
  // deux mains qui pincent ensemble (hors boutons) : taille + rotation de l'objet, ou zoom + rotation de la vue
  updateTwo() {
    const [a, b] = this.hands, e = this.engine;
    const both = a.seen && b.seen && a.press && b.press && !a.press.ui && !b.press.ui;
    if (both && !this.two) {
      this.two = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), obj: e.sculptor?.active ? null : e.selected, radius: e.orbit.radius, az: e.orbit.az };
      if (this.two.obj) { this.two.scale = this.two.obj.scale.clone(); this.two.rot = this.two.obj.rotation.y; }
      for (const h of this.hands) { if (h.press.mode === 'sculpt') e.sculptor.end(); if (h.press.mode === 'move' && h.press.moved) e.commit(); Object.assign(h.press, { dragging: true, mode: 'none' }); }
    } else if (both) {
      const t = this.two, d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
      const k = THREE.MathUtils.clamp(d / Math.max(t.d, 1), 0.05, 20);
      let da = ang - t.ang; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (t.obj?.parent) { t.obj.scale.copy(t.scale).multiplyScalar(k); t.obj.rotation.y = t.rot - da; e.updateSelectionHelper?.(); this.ui.showDims?.(); }
      else { e.orbit.goal = null; e.orbit.radius = THREE.MathUtils.clamp(t.radius / k, 0.3, 4000); e.orbit.az = t.az + da; }
      for (const h of this.hands) h.mode = 'two';
    } else if (this.two) this.endTwo();
  }
  endTwo() {
    if (!this.two) return;
    if (this.two.obj?.parent) this.engine.commit();
    this.two = null;
  }

  uiTarget(x, y) {
    const SEL = 'button, a, [data-hand], .card, .chip, summary, input[type=range]';
    const at = (px, py) => { const el = document.elementFromPoint(px, py); return !el || el.tagName === 'CANVAS' ? null : el.closest(SEL); };
    const t = at(x, y); if (t) return t;
    // marge de visée : les boutons sont petits et la main tremble → le plus proche dans ~26 px
    for (let i = 0; i < 8; i++) { const r = at(x + Math.cos(i * Math.PI / 4) * 26, y + Math.sin(i * Math.PI / 4) * 26); if (r) return r; }
    return null;
  }
  setUiHover(t) {
    if (this._hov && this._hov !== t) this._hov.classList.remove('hand-hover');
    if (t) t.classList.add('hand-hover'); this._hov = t;
  }

  diagnose(now) {
    if (now - this.diagT > 500) { this.diagT = now; try { this.diag = localStorage.getItem('atelier:diag') === '1'; } catch { this.diag = false; } }
    let d = document.getElementById('handsDiag');
    if (!this.diag) { d?.remove(); return; }
    if (!d) { d = document.createElement('pre'); d.id = 'handsDiag'; document.body.append(d); }
    d.textContent = this.hands.map((h, i) => h.seen
      ? `main ${i + 1} (${this.isRight(h) ? 'droite' : 'gauche'}) : écart ${h.gap.toFixed(2)} · ${h.pinched ? 'PINCÉ' : 'ouvert'} · ${h.mode}`
      : `main ${i + 1} : non vue`).join('\n') + `\ncaméra ${Math.round(this.fps)} img/s · pince < ${PINCH_ON} · lâche > ${PINCH_OFF}`;
  }
}
