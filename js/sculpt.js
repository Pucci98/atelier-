// Atelier — modelage : déformer la matière comme de l'argile (doigt, souris ou main)
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const TOOLS = [
  { id: 'tirer', name: 'Gonfler', hint: 'Fait sortir la matière' },
  { id: 'creuser', name: 'Creuser', hint: 'Enfonce la matière' },
  { id: 'saisir', name: 'Étirer', hint: 'Attrape une zone et tire-la' },
  { id: 'lisser', name: 'Lisser', hint: 'Adoucit les reliefs' },
  { id: 'aplatir', name: 'Aplatir', hint: 'Rabote à plat' },
  { id: 'pincer', name: 'Pincer', hint: 'Resserre en arête' },
];

// géométrie indexée « soudée » (indispensable pour déformer sans déchirer)
export function weld(geo) {
  geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
  const g = mergeVertices(geo, 1e-5);
  g.computeVertexNormals();
  return g;
}

function adjacency(geo) {
  if (geo.userData.adj) return geo.userData.adj;
  const n = geo.attributes.position.count, idx = geo.index.array;
  const sets = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    sets[a].add(b); sets[a].add(c); sets[b].add(a); sets[b].add(c); sets[c].add(a); sets[c].add(b);
  }
  return (geo.userData.adj = sets.map(s => Int32Array.from(s)));
}

// UV sphériques (formes) ou planes (terrain), recalculées après déformation pour garder une matière propre
export function sculptUV(geo, mode = 'box') {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = geo.attributes.uv?.array.length === p.count * 2 ? geo.attributes.uv.array : new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (mode === 'plan') { uv[i * 2] = x; uv[i * 2 + 1] = z; continue; }
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    if (ny >= nx && ny >= nz) { uv[i * 2] = x; uv[i * 2 + 1] = z; } else if (nx >= nz) { uv[i * 2] = z; uv[i * 2 + 1] = y; } else { uv[i * 2] = x; uv[i * 2 + 1] = y; }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export class Sculptor {
  constructor(engine) {
    this.engine = engine;
    this.active = false; this.tool = 'tirer'; this.radius = 0.25; this.strength = 0.5; this.sym = true;
    this.stroke = null;
    // pinceau visible sur la surface
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 64), new THREE.MeshBasicMaterial({ color: 0x5DB7F0, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }));
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), ring.material);
    this.brush = new THREE.Group(); this.brush.add(ring, dot); this.brush.visible = false; this.brush.renderOrder = 10;
    engine.helpers.add(this.brush);
  }

  meshOf(g) { let m = null; g?.traverse(o => { if (!m && o.isMesh && o.userData.sculpt) m = o; }); return m; }
  canSculpt(g) { return !!this.meshOf(g); }

  // rayon écran → point sur la forme
  hit(g, x, y) {
    const m = this.meshOf(g); if (!m) return null;
    const e = this.engine; e.raycaster.setFromCamera(e.ndc(x, y), e.camera);
    const h = e.raycaster.intersectObject(m, false)[0];
    if (!h) return null;
    const n = h.face.normal.clone().transformDirection(m.matrixWorld).normalize();
    return { mesh: m, point: h.point, normal: n };
  }

  showBrush(h) {
    if (!h) { this.brush.visible = false; return; }
    this.brush.visible = true;
    this.brush.position.copy(h.point).addScaledVector(h.normal, 0.005);
    this.brush.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), h.normal);
    this.brush.scale.setScalar(this.radius);
  }

  begin(g, x, y) {
    const h = this.hit(g, x, y); if (!h) return false;
    const m = h.mesh; m.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(m.matrixWorld).invert();
    const scale = new THREE.Vector3().setFromMatrixScale(m.matrixWorld);
    const ls = (scale.x + scale.y + scale.z) / 3;
    this.stroke = { g, m, inv, ls, last: h.point.clone(), lastXY: [x, y], axisY: m.userData.sculpt === 'y' };
    if (this.tool === 'saisir') {
      // on mémorise la zone attrapée et son poids
      const lp = h.point.clone().applyMatrix4(inv), r = this.radius / ls;
      const pos = m.geometry.attributes.position; const sel = [];
      for (const [px] of this.mirrorPoints(lp, m)) {
        for (let i = 0; i < pos.count; i++) {
          const dx = pos.getX(i) - px.x, dy = pos.getY(i) - px.y, dz = pos.getZ(i) - px.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d < r) sel.push([i, falloff(d / r), pos.getX(i), pos.getY(i), pos.getZ(i), px === lp ? 1 : -1]);
        }
      }
      this.stroke.sel = sel;
      this.stroke.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(this.engine.camera.getWorldDirection(new THREE.Vector3()).negate(), h.point);
      this.stroke.start = h.point.clone();
    } else this.apply(h);
    this.showBrush(h);
    return true;
  }

  move(x, y) {
    const s = this.stroke; if (!s) return;
    if (this.tool === 'saisir') {
      const e = this.engine; e.raycaster.setFromCamera(e.ndc(x, y), e.camera);
      const p = new THREE.Vector3(); if (!e.raycaster.ray.intersectPlane(s.plane, p)) return;
      const dW = p.clone().sub(s.start);
      const d0 = s.start.clone().applyMatrix4(s.inv), d1 = p.clone().applyMatrix4(s.inv), d = d1.sub(d0);
      if (s.axisY) { d.x = d.z = 0; }
      const pos = s.m.geometry.attributes.position;
      for (const [i, w, x0, y0, z0, side] of s.sel) pos.setXYZ(i, x0 + d.x * w * side, y0 + d.y * w, z0 + d.z * w);
      this.finishGeometry(s.m, false);
      this.brush.position.copy(s.start).add(dW);
      return;
    }
    const h = this.hit(s.g, x, y); if (!h) { this.brush.visible = false; return; }
    // espacement régulier des touches le long du trait
    const step = this.radius * 0.18;
    const dist = h.point.distanceTo(s.last);
    if (dist < step) { this.showBrush(h); return; }
    const n = Math.min(8, Math.floor(dist / step));
    for (let k = 1; k <= n; k++) this.apply({ ...h, point: s.last.clone().lerp(h.point, k / n) }, k === n);
    s.last.copy(h.point);
    this.showBrush(h);
  }

  end() {
    if (!this.stroke) return false;
    const m = this.stroke.m; this.stroke = null;
    this.finishGeometry(m, true);
    m.userData.sculpted = true; m.userData.packed = null;
    this.brush.visible = false;
    return true;
  }

  mirrorPoints(lp, m) {
    const out = [[lp, 1]];
    if (this.sym && m.userData.sculpt !== 'y' && Math.abs(lp.x) > 1e-3) out.push([new THREE.Vector3(-lp.x, lp.y, lp.z), -1]);
    return out;
  }

  apply(h, last = true) {
    const s = this.stroke, m = s.m, geo = m.geometry;
    const pos = geo.attributes.position, nor = geo.attributes.normal;
    const lp = h.point.clone().applyMatrix4(s.inv);
    const ln = h.normal.clone().transformDirection(s.inv).normalize();
    const r = this.radius / s.ls, r2 = r * r;
    const k = this.strength * r * 0.12;
    const adj = this.tool === 'lisser' ? adjacency(geo) : null;
    for (const [c, side] of this.mirrorPoints(lp, m)) {
      const nrm = side === 1 ? ln : new THREE.Vector3(-ln.x, ln.y, ln.z);
      const planeD = nrm.dot(c);
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const dx = x - c.x, dy = y - c.y, dz = z - c.z; const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > r2) continue;
        const w = falloff(Math.sqrt(d2) / r);
        let nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
        if (s.axisY) { nx = 0; ny = 1; nz = 0; }
        switch (this.tool) {
          case 'tirer': pos.setXYZ(i, x + nx * k * w, y + ny * k * w, z + nz * k * w); break;
          case 'creuser': pos.setXYZ(i, x - nx * k * w, y - ny * k * w, z - nz * k * w); break;
          case 'pincer': { const f = 0.25 * this.strength * w; pos.setXYZ(i, x - dx * f, s.axisY ? y : y - dy * f, z - dz * f); break; }
          case 'aplatir': {
            const dist = (s.axisY ? y - c.y : nrm.x * x + nrm.y * y + nrm.z * z - planeD) * 0.35 * this.strength * w;
            if (s.axisY) pos.setY(i, y - dist); else pos.setXYZ(i, x - nrm.x * dist, y - nrm.y * dist, z - nrm.z * dist);
            break;
          }
          case 'lisser': {
            const a = adj[i]; if (!a.length) break;
            let ax = 0, ay = 0, az = 0; for (const j of a) { ax += pos.getX(j); ay += pos.getY(j); az += pos.getZ(j); }
            ax /= a.length; ay /= a.length; az /= a.length;
            const f = 0.6 * this.strength * w;
            if (s.axisY) pos.setY(i, y + (ay - y) * f); else pos.setXYZ(i, x + (ax - x) * f, y + (ay - y) * f, z + (az - z) * f);
            break;
          }
        }
      }
    }
    this.finishGeometry(m, false, last);
  }

  finishGeometry(m, final, normals = true) {
    const geo = m.geometry;
    geo.attributes.position.needsUpdate = true;
    if (normals || final) geo.computeVertexNormals();
    if (final) {
      sculptUV(geo, m.userData.sculpt === 'y' ? 'plan' : 'box');
      if (m.userData.sculpt === 'y' && m.userData.recolor) m.userData.recolor(geo);
      geo.computeBoundingBox(); geo.computeBoundingSphere();
    }
  }
}

function falloff(t) { const u = 1 - t * t; return u * u; }

// sauvegarde compacte des formes modelées (positions quantifiées en 16 bits)
export function packSculpt(m) {
  const p = m.geometry.attributes.position.array;
  let R = 0; for (let i = 0; i < p.length; i++) R = Math.max(R, Math.abs(p[i]));
  R = R || 1;
  const q = new Int16Array(p.length); for (let i = 0; i < p.length; i++) q[i] = Math.round(p[i] / R * 32767);
  const bytes = new Uint8Array(q.buffer); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return { n: p.length / 3, R: +R.toFixed(5), d: btoa(bin) };
}
export function unpackSculpt(m, data) {
  const pos = m.geometry.attributes.position;
  if (!data || data.n !== pos.count) return false;
  const bin = atob(data.d); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const q = new Int16Array(bytes.buffer);
  for (let i = 0; i < q.length; i++) pos.array[i] = q[i] / 32767 * data.R;
  pos.needsUpdate = true; m.geometry.computeVertexNormals();
  sculptUV(m.geometry, m.userData.sculpt === 'y' ? 'plan' : 'box');
  if (m.userData.sculpt === 'y' && m.userData.recolor) m.userData.recolor(m.geometry);
  m.geometry.computeBoundingBox(); m.geometry.computeBoundingSphere();
  return true;
}
