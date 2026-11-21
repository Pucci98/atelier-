// ALMYGO — interactions tactiles / souris (sélection, déplacement, rotation, échelle, caméra)
import * as THREE from 'three';

export function setupInput(engine, canvas, ui) {
  const pts = new Map();
  let mode = null; // 'drag' | 'orbit' | 'two' | 'look'
  let start = null, dragPlaneY = 0, dragOffset = new THREE.Vector3(), moved = false, downTime = 0;
  let two = null;
  const snap = v => Math.round(v * 20) / 20; // 5 cm

  function centroid() { const a = [...pts.values()]; return { x: a.reduce((s, p) => s + p.x, 0) / a.length, y: a.reduce((s, p) => s + p.y, 0) / a.length }; }
  function twoState() { const [a, b] = [...pts.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), c: centroid() }; }

  for (const ev of ['pointerdown', 'pointermove', 'wheel']) canvas.addEventListener(ev, () => engine.touch(), { passive: true });
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    moved = false; downTime = performance.now();
    if (engine.walk) { mode = 'look'; return; }
    const sc = engine.sculptor;
    if (pts.size === 1 && sc.active && engine.selected && e.button !== 2) {
      if (sc.begin(engine.selected, e.clientX, e.clientY)) { mode = 'sculpt'; return; }
    }
    if (pts.size === 2 && mode === 'sculpt') { sc.end(); engine.commit(); }
    if (pts.size === 1) {
      const hit = engine.pick(e.clientX, e.clientY);
      const btn = e.button;
      if (btn === 2 || e.shiftKey) { mode = 'pan'; return; }
      if (hit && hit.object === engine.selected) {
        mode = 'drag';
        start = engine.dragStart(engine.selected, e.clientX, e.clientY);
        start = engine.selected.position.clone();
      } else {
        mode = 'orbit'; start = hit;
      }
    } else if (pts.size === 2) {
      mode = 'two';
      const s = twoState();
      two = { ...s, scale: engine.selected?.scale.clone(), rotY: engine.selected?.rotation.y, radius: engine.orbit.radius, onSel: !!engine.selected && !engine.sculptor.active };
    }
  });

  canvas.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 6) moved = true;
    if (mode === 'look' && engine.walk) {
      engine.walk.yaw -= dx * 0.005; engine.walk.pitch = THREE.MathUtils.clamp(engine.walk.pitch - dy * 0.004, -1.2, 1.2); return;
    }
    if (mode === 'sculpt') { engine.sculptor.move(e.clientX, e.clientY); return; }
    if (mode === 'orbit' && moved) engine.orbitBy(dx * 0.006, dy * 0.006);
    else if (mode === 'pan') engine.panBy(dx, dy);
    else if (mode === 'drag' && engine.selected) {
      engine.dragMove(start, e.clientX, e.clientY);
    } else if (mode === 'two' && pts.size === 2 && two) {
      const s = twoState();
      if (two.onSel && engine.selected) {
        const k = s.d / two.d;
        engine.selected.scale.copy(two.scale).multiplyScalar(THREE.MathUtils.clamp(k, 0.05, 20));
        let r = two.rotY - (s.ang - two.ang);
        const step = Math.PI / 12; const near = Math.round(r / step) * step; if (Math.abs(r - near) < 0.05) r = near;
        engine.selected.rotation.y = r;
        ui.showDims?.();
      } else {
        engine.orbit.goal = null;
        engine.orbit.radius = THREE.MathUtils.clamp(two.radius * two.d / s.d, 0.3, 4000);
        engine.panBy(s.c.x - two.c.x, s.c.y - two.c.y); two.c = s.c;
      }
    }
  });

  function end(e) {
    const p = pts.get(e.pointerId); pts.delete(e.pointerId);
    if (!p) return;
    if (mode === 'sculpt') { if (engine.sculptor.end()) engine.commit(); if (!pts.size) mode = null; return; }
    const tap = !moved && performance.now() - downTime < 400;
    if (mode === 'look') { if (!pts.size) mode = null; return; }
    if (tap && mode !== 'two') {
      const hit = engine.pick(e.clientX, e.clientY);
      if (hit) engine.setSelection(hit.object, hit.role); else engine.setSelection(null);
    } else if (mode === 'drag' || mode === 'two') {
      if (engine.selected) engine.commit();
    }
    if (pts.size === 0) { mode = null; two = null; }
    else if (pts.size === 1 && mode === 'two') { mode = 'orbit'; }
  }
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (engine.selected && e.altKey) { engine.selected.rotation.y += e.deltaY * 0.004; return; }
    engine.zoomBy(Math.exp(e.deltaY * 0.0012));
  }, { passive: false });

  // clavier (ordinateur)
  window.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea')) return;
    const s = engine.selected;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? engine.redo() : engine.undo(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); window.atelierSave?.(); return; }
    if (e.key.toLowerCase() === 'l' && !e.metaKey && !e.ctrlKey) { window.atelierLayers?.(); return; }
    if (e.key === ' ' || e.key.toLowerCase() === 'j') { if (e.key === ' ' && !e.shiftKey) return; e.preventDefault(); window.atelierVerbe?.(); return; }
    if (!s) return;
    if (e.key === 'Delete' || e.key === 'Backspace') engine.remove(s);
    else if (e.key.toLowerCase() === 'd') engine.duplicate(s);
    else if (e.key.toLowerCase() === 'r') { s.rotation.y += Math.PI / 4; engine.commit(); }
    else if (e.key === 'Escape') engine.setSelection(null);
    else if (e.key.startsWith('Arrow')) { // flèches : déplacer (Maj = grand pas), haut/bas avec Alt = élévation
      e.preventDefault(); const st = e.shiftKey ? 0.5 : 0.05, az = engine.orbit.az;
      const f = new THREE.Vector3(-Math.sin(az), 0, -Math.cos(az)), r = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) s.position.y = Math.max(0, s.position.y + (e.key === 'ArrowUp' ? st : -st));
      else s.position.addScaledVector({ ArrowUp: f, ArrowDown: f.clone().negate(), ArrowLeft: r.clone().negate(), ArrowRight: r }[e.key], st);
      clearTimeout(engine._kc); engine._kc = setTimeout(() => engine.commit(), 400); engine.touch();
    }
    else if (e.key === '+' || e.key === '=') { s.scale.multiplyScalar(1.1); engine.commit(); }
    else if (e.key === '-') { s.scale.multiplyScalar(1 / 1.1); engine.commit(); }
  });
}

// Joystick du mode visite
export function setupJoystick(engine, el) {
  const knob = el.querySelector('.knob');
  let id = null, cx = 0, cy = 0;
  el.addEventListener('pointerdown', e => {
    id = e.pointerId; el.setPointerCapture(id);
    const r = el.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; move(e);
  });
  function move(e) {
    if (e.pointerId !== id || !engine.walk) return;
    let dx = e.clientX - cx, dy = e.clientY - cy; const R = 44; const L = Math.hypot(dx, dy);
    if (L > R) { dx *= R / L; dy *= R / L; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    engine.walk.move.x = dx / R; engine.walk.move.y = -dy / R;
  }
  el.addEventListener('pointermove', move);
  const up = e => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; if (engine.walk) engine.walk.move = { x: 0, y: 0 }; };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
