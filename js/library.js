// ALMYGO — bibliothèque d'éléments constructibles (tout est généré en code, en mètres)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { material } from './materials.js';
import { weld, sculptUV } from './sculpt.js';
import { buildSpec } from './ai.js';

/* ---------- utilitaires ---------- */
// UV « métriques » par projection selon l'axe dominant de la normale : 1 unité UV = 1 mètre
function metricUV(geo) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let u, v;
    if (ny >= nx && ny >= nz) { u = x; v = z; } else if (nx >= nz) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

function box(w, h, d, r = 0) {
  const g = r > 0 ? new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
  return metricUV(g);
}
const cyl = (rt, rb, h, s = 32) => metricUV(new THREE.CylinderGeometry(rt, rb, h, s));

// Crée un mesh avec un « rôle » (sol, mur, mobilier, textile, metal, verre, corps, vetement, lumiere)
function part(geo, role, x = 0, y = 0, z = 0, opts = {}) {
  const m = new THREE.Mesh(geo, material('enduit'));
  m.position.set(x, y, z);
  m.castShadow = opts.cast ?? true; m.receiveShadow = true;
  m.userData.role = role;
  if (opts.wallNormal) m.userData.wallNormal = opts.wallNormal;
  if (opts.rot) m.rotation.set(...opts.rot);
  return m;
}

function lathe(points, segs = 48) {
  const g = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  return g;
}

/* ---------- espaces ---------- */
function piece({ w = 5, d = 4, h = 2.7, t = 0.14, plinthe = true }) {
  const g = new THREE.Group();
  g.add(part(box(w + t * 2, 0.06, d + t * 2), 'sol', 0, -0.027, 0, { cast: false }));
  const walls = [
    [box(w + t * 2, h, t), 0, h / 2, -d / 2 - t / 2, [0, 0, 1]],
    [box(w + t * 2, h, t), 0, h / 2, d / 2 + t / 2, [0, 0, -1]],
    [box(t, h, d), -w / 2 - t / 2, h / 2, 0, [1, 0, 0]],
    [box(t, h, d), w / 2 + t / 2, h / 2, 0, [-1, 0, 0]],
  ];
  for (const [geo, x, y, z, n] of walls) g.add(part(geo, 'mur', x, y, z, { wallNormal: n }));
  const ceil = part(box(w + t * 2, 0.08, d + t * 2), 'plafond', 0, h + 0.04, 0, { cast: false });
  ceil.material = new THREE.MeshStandardMaterial({ color: 0xF1ECE3, roughness: 0.95, emissive: 0xF1ECE3, emissiveIntensity: 0.22 });
  ceil.userData.ceiling = true; ceil.visible = false; g.add(ceil);
  if (plinthe) {
    const p = 0.08, e = 0.012;
    const pl = [[box(w, p, e), 0, -d / 2 + e / 2, [0, 0, 1]], [box(w, p, e), 0, d / 2 - e / 2, [0, 0, -1]], [box(e, p, d), -w / 2 + e / 2, 0, [1, 0, 0]], [box(e, p, d), w / 2 - e / 2, 0, [-1, 0, 0]]];
    for (const [geo, x, z, n] of pl) g.add(part(geo, 'mobilier', x, p / 2, z, { wallNormal: n, cast: false }));
  }
  return g;
}

function mur({ w = 3, h = 2.7, t = 0.14 }) {
  const g = new THREE.Group();
  g.add(part(box(w, h, t), 'mur', 0, h / 2, 0));
  return g;
}

function sol({ w = 4, d = 4 }) {
  const g = new THREE.Group();
  g.add(part(box(w, 0.05, d), 'sol', 0, -0.022, 0, { cast: false }));
  return g;
}

function baie({ w = 2.4, h = 2.3 }) {
  const g = new THREE.Group(); const f = 0.05, dpt = 0.08;
  g.add(part(box(w, f, dpt), 'metal', 0, f / 2, 0));
  g.add(part(box(w, f, dpt), 'metal', 0, h - f / 2, 0));
  const n = Math.max(2, Math.round(w / 1.2));
  for (let i = 0; i <= n; i++) g.add(part(box(f, h, dpt), 'metal', -w / 2 + f / 2 + (w - f) * i / n, h / 2, 0));
  g.add(part(box(w - f, h - f * 2, 0.012), 'verre', 0, h / 2, 0, { cast: false }));
  return g;
}

function porte({ w = 0.93, h = 2.1, ouverte = 0.35 }) {
  const g = new THREE.Group(); const f = 0.06;
  g.add(part(box(f, h + f, 0.16), 'mobilier', -w / 2 - f / 2, (h + f) / 2, 0));
  g.add(part(box(f, h + f, 0.16), 'mobilier', w / 2 + f / 2, (h + f) / 2, 0));
  g.add(part(box(w + f * 2, f, 0.16), 'mobilier', 0, h + f / 2, 0));
  const hinge = new THREE.Group(); hinge.position.set(-w / 2, 0, 0); hinge.rotation.y = -ouverte * Math.PI / 2;
  const leaf = part(box(w, h, 0.04, 0.005), 'mobilier', w / 2, h / 2, 0); hinge.add(leaf);
  hinge.add(part(cyl(0.012, 0.012, 0.14, 12), 'metal', w - 0.08, 1.02, 0.05, { rot: [0, 0, Math.PI / 2] }));
  g.add(hinge);
  return g;
}

function escalier({ n = 14, w = 1, rise = 0.18, run = 0.27, rampe = true }) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    g.add(part(box(w, 0.045, run + 0.02), 'mobilier', 0, rise * (i + 1) - 0.0225, -i * run - run / 2));
    g.add(part(box(w, rise - 0.045, 0.02), 'mur', 0, rise * i + (rise - 0.045) / 2, -i * run, { cast: false }));
  }
  // limon
  const L = Math.hypot(n * run, n * rise), ang = Math.atan2(n * rise, n * run);
  for (const s of [-1, 1]) {
    const lim = part(box(0.04, 0.28, L), 'mur', s * (w / 2 + 0.02), n * rise / 2 - 0.02, -n * run / 2); lim.rotation.x = ang; g.add(lim);
  }
  if (rampe) {
    const r = part(cyl(0.02, 0.02, L, 12), 'metal', w / 2 + 0.03, n * rise / 2 + 0.9, -n * run / 2, { rot: [Math.PI / 2 - ang, 0, 0] });
    // orientation : cylindre le long de la pente
    r.rotation.set(Math.PI / 2 + ang, 0, 0); g.add(r);
    for (let i = 0; i <= n; i += 3) g.add(part(cyl(0.012, 0.012, 0.9, 8), 'metal', w / 2 + 0.03, rise * i + 0.45 + 0.02, -i * run));
  }
  return g;
}

function colonne({ h = 2.7, r = 0.18 }) {
  const g = new THREE.Group();
  g.add(part(box(r * 2.6, 0.08, r * 2.6), 'mur', 0, 0.04, 0));
  g.add(part(cyl(r, r * 1.04, h - 0.16, 40), 'mur', 0, h / 2, 0));
  g.add(part(box(r * 2.6, 0.08, r * 2.6), 'mur', 0, h - 0.04, 0));
  return g;
}

function arche({ w = 1.6, h = 2.6, t = 0.3 }) {
  const shape = new THREE.Shape();
  const W = w / 2 + 0.25, r = w / 2, base = h - r;
  shape.moveTo(-W, 0); shape.lineTo(W, 0); shape.lineTo(W, h + 0.25); shape.lineTo(-W, h + 0.25); shape.lineTo(-W, 0);
  const hole = new THREE.Path();
  hole.moveTo(-r, 0); hole.lineTo(-r, base); hole.absarc(0, base, r, Math.PI, 0, true); hole.lineTo(r, 0); hole.lineTo(-r, 0);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 32 });
  geo.translate(0, 0, -t / 2); geo.computeVertexNormals();
  const g = new THREE.Group(); g.add(part(metricUV(geo), 'mur'));
  return g;
}

function estrade({ w = 4, d = 2.5, h = 0.4 }) {
  const g = new THREE.Group();
  g.add(part(box(w, h, d), 'sol', 0, h / 2, 0));
  g.add(part(box(1.2, h / 2, 0.35), 'sol', 0, h / 4, d / 2 + 0.175));
  return g;
}

function cimaise({ w = 2, h = 2.4 }) {
  const g = new THREE.Group();
  g.add(part(box(w, h, 0.08), 'mur', 0, h / 2 + 0.05, 0));
  g.add(part(box(w * 0.9, 0.05, 0.4), 'metal', 0, 0.025, 0));
  return g;
}

/* ---------- mobilier ---------- */
function table({ w = 1.8, d = 0.9, h = 0.75, ronde = false }) {
  const g = new THREE.Group(); const top = 0.04;
  if (ronde) {
    g.add(part(cyl(w / 2, w / 2, top, 64), 'mobilier', 0, h - top / 2, 0));
    g.add(part(cyl(0.05, 0.06, h - top, 24), 'metal', 0, (h - top) / 2, 0));
    g.add(part(cyl(0.28, 0.3, 0.03, 48), 'metal', 0, 0.015, 0));
  } else {
    g.add(part(box(w, top, d, 0.006), 'mobilier', 0, h - top / 2, 0));
    const lx = w / 2 - 0.08, lz = d / 2 - 0.08;
    for (const [x, z] of [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]]) g.add(part(box(0.05, h - top, 0.05), 'mobilier', x, (h - top) / 2, z));
  }
  return g;
}

function chaise({ h = 0.82 }) {
  const g = new THREE.Group(); const s = 0.45;
  g.add(part(box(0.44, 0.03, 0.42, 0.01), 'mobilier', 0, s, 0));
  for (const [x, z] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) g.add(part(cyl(0.014, 0.012, s, 12), 'metal', x, s / 2, z));
  for (const x of [-0.19, 0.19]) g.add(part(cyl(0.012, 0.012, h - s, 12), 'metal', x, s + (h - s) / 2, -0.2));
  g.add(part(box(0.42, 0.16, 0.02, 0.008), 'mobilier', 0, h - 0.1, -0.2));
  return g;
}

function tabouret({ h = 0.65 }) {
  const g = new THREE.Group();
  g.add(part(cyl(0.18, 0.18, 0.04, 40), 'mobilier', 0, h - 0.02, 0));
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3;
    const l = part(cyl(0.016, 0.014, h, 12), 'mobilier', Math.cos(a) * 0.12, h / 2, Math.sin(a) * 0.12);
    l.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12); g.add(l);
  }
  return g;
}

function canape({ w = 2.2, d = 0.95, places = 3 }) {
  const g = new THREE.Group(); const base = 0.16, seatH = 0.42, arm = 0.18;
  g.add(part(box(w, base, d), 'textile', 0, base / 2 + 0.06, 0));
  for (const x of [-1, 1]) {
    g.add(part(box(arm, 0.62, d, 0.06), 'textile', x * (w / 2 - arm / 2), 0.31 + 0.06, 0));
    g.add(part(box(0.05, 0.06, 0.05), 'metal', x * (w / 2 - 0.1), 0.03, d / 2 - 0.1));
    g.add(part(box(0.05, 0.06, 0.05), 'metal', x * (w / 2 - 0.1), 0.03, -d / 2 + 0.1));
  }
  const iw = (w - arm * 2) / places;
  for (let i = 0; i < places; i++) {
    const x = -w / 2 + arm + iw * (i + 0.5);
    g.add(part(box(iw - 0.01, seatH - base - 0.06, d - 0.22, 0.07), 'textile', x, base + 0.06 + (seatH - base - 0.06) / 2 + 0.02, 0.09));
    const b = part(box(iw - 0.02, 0.48, 0.2, 0.08), 'textile', x, seatH + 0.2, -d / 2 + 0.14); b.rotation.x = -0.12; g.add(b);
  }
  return g;
}

function fauteuil() {
  const g = canape({ w: 0.86, d: 0.88, places: 1 });
  return g;
}

function lit({ w = 1.6, l = 2 }) {
  const g = new THREE.Group();
  g.add(part(box(w + 0.1, 0.28, l + 0.08, 0.02), 'mobilier', 0, 0.14, 0));
  g.add(part(box(w + 0.1, 1.0, 0.08, 0.03), 'textile', 0, 0.5, -l / 2 - 0.04));
  g.add(part(box(w, 0.22, l, 0.06), 'textile', 0, 0.39, 0));
  const duvet = part(box(w + 0.04, 0.09, l * 0.62, 0.04), 'textile', 0, 0.53, l * 0.19); g.add(duvet);
  for (const x of [-w / 4, w / 4]) g.add(part(box(w / 2 - 0.08, 0.13, 0.4, 0.06), 'textile', x, 0.56, -l / 2 + 0.3));
  return g;
}

function etagere({ w = 1.2, h = 1.9, d = 0.35, n = 5 }) {
  const g = new THREE.Group();
  for (const x of [-w / 2, w / 2]) g.add(part(box(0.025, h, d), 'mobilier', x, h / 2, 0));
  for (let i = 0; i < n; i++) g.add(part(box(w, 0.025, d), 'mobilier', 0, 0.06 + i * (h - 0.08) / (n - 1), 0));
  return g;
}

function lampe({ h = 1.6 }) {
  const g = new THREE.Group();
  g.add(part(cyl(0.16, 0.17, 0.025, 40), 'metal', 0, 0.0125, 0));
  g.add(part(cyl(0.011, 0.011, h - 0.2, 12), 'metal', 0, (h - 0.2) / 2, 0));
  const shade = part(metricUV(new THREE.CylinderGeometry(0.17, 0.22, 0.28, 48, 1, true)), 'textile', 0, h - 0.1, 0);
  shade.material = material('lin'); shade.userData.role = 'textile'; g.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd9a0, emissiveIntensity: 3 }));
  bulb.position.y = h - 0.12; bulb.userData.role = 'ampoule'; g.add(bulb);
  const L = new THREE.PointLight(0xffc98a, 6, 6, 1.6); L.position.y = h - 0.12; L.userData.lamp = true; g.add(L);
  return g;
}

function suspension({ h = 0.4, r = 0.25 }) {
  const g = new THREE.Group(); const y = 2.25;
  g.add(part(cyl(0.004, 0.004, 0.45, 6), 'metal', 0, y + 0.22, 0));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), material('laiton'));
  dome.material = material('laiton'); dome.userData.role = 'metal'; dome.position.y = y - h / 2 + r * 0.6; dome.castShadow = true;
  const inner = dome.clone(); inner.material = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.BackSide, emissive: 0xffe3b8, emissiveIntensity: 0.6 }); inner.userData.role = 'ampoule';
  g.add(dome, inner);
  const L = new THREE.SpotLight(0xffd29a, 18, 8, 0.9, 0.6, 1.4); L.position.y = y - 0.05; L.target.position.set(0, 0, 0); L.userData.lamp = true; g.add(L, L.target);
  return g;
}

function plante({ h = 1.4 }) {
  const g = new THREE.Group();
  g.add(part(lathe([[0, 0], [0.16, 0], [0.2, 0.36], [0.19, 0.38], [0, 0.38]]), 'mur', 0, 0, 0));
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3E5A36, roughness: 0.55, side: THREE.DoubleSide });
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x4A3B2A, roughness: 0.9 });
  const rnd = (() => { let s = 3; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const leafGeo = new THREE.SphereGeometry(1, 12, 8); leafGeo.scale(0.07, 0.006, 0.16); leafGeo.translate(0, 0, 0.15);
  for (let i = 0; i < 7; i++) {
    const a = rnd() * Math.PI * 2, tilt = 0.15 + rnd() * 0.35, len = h * (0.55 + rnd() * 0.45);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, len, 6), stemMat);
    stem.position.set(Math.cos(a) * tilt * len / 2, 0.36 + len / 2 * Math.cos(tilt), Math.sin(a) * tilt * len / 2);
    stem.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt); stem.castShadow = true; g.add(stem);
    const top = new THREE.Vector3(Math.cos(a) * Math.sin(tilt) * len, 0.36 + Math.cos(tilt) * len, Math.sin(a) * Math.sin(tilt) * len);
    for (let k = 0; k < 9; k++) {
      const lf = new THREE.Mesh(leafGeo, leafMat);
      const t = 0.35 + k / 9 * 0.65;
      lf.position.set(top.x * t, 0.36 + (top.y - 0.36) * t, top.z * t);
      lf.rotation.set(-0.5 + rnd() * 0.8, rnd() * Math.PI * 2, rnd() * 0.4);
      const s = 0.6 + t * 0.6 + rnd() * 0.3; lf.scale.setScalar(s); lf.castShadow = true; g.add(lf);
    }
  }
  return g;
}

function tapis({ w = 2.4, d = 1.7, rond = false }) {
  const g = new THREE.Group();
  g.add(part(rond ? cyl(w / 2, w / 2, 0.015, 64) : box(w, 0.015, d, 0.006), 'textile', 0, 0.0075, 0, { cast: false }));
  return g;
}

function miroir({ r = 0.45 }) {
  const g = new THREE.Group(); const y = 1.5;
  g.add(part(metricUV(new THREE.TorusGeometry(r, 0.018, 12, 64)), 'metal', 0, y, 0));
  const glass = new THREE.Mesh(new THREE.CircleGeometry(r, 64), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.02 }));
  glass.position.set(0, y, 0.003); glass.userData.role = 'miroir'; g.add(glass);
  return g;
}

function ilot({ w = 2.4, d = 1, h = 0.92 }) {
  const g = new THREE.Group();
  g.add(part(box(w - 0.04, h - 0.04, d - 0.08), 'mobilier', 0, (h - 0.04) / 2, 0));
  g.add(part(box(w, 0.04, d), 'sol', 0, h - 0.02, 0));
  return g;
}

function portant({ w = 1.4, h = 1.65 }) {
  const g = new THREE.Group();
  for (const x of [-w / 2, w / 2]) {
    g.add(part(cyl(0.014, 0.014, h, 12), 'metal', x, h / 2, 0));
    g.add(part(box(0.04, 0.02, 0.5), 'metal', x, 0.01, 0));
  }
  g.add(part(cyl(0.014, 0.014, w, 12), 'metal', 0, h, 0, { rot: [0, 0, Math.PI / 2] }));
  // cintres
  for (let i = 0; i < 6; i++) {
    const x = -w / 2 + 0.2 + i * (w - 0.4) / 5;
    const hg = part(metricUV(new THREE.TorusGeometry(0.2, 0.006, 6, 24, Math.PI)), 'mobilier', x, h - 0.17, 0, { rot: [0, Math.PI / 2, 0] });
    g.add(hg);
  }
  return g;
}

/* ---------- formes ---------- */
const forme = geoFn => p => { const g = new THREE.Group(); const m = part(geoFn(p), 'forme'); g.add(m); return g; };
const formes = {
  cube: forme(({ s = 0.6 }) => { const b = box(s, s, s, 0.004); b.translate(0, s / 2, 0); return b; }),
  sphere: forme(({ s = 0.6 }) => { const b = new THREE.SphereGeometry(s / 2, 64, 48); b.translate(0, s / 2, 0); return b; }),
  cylindre: forme(({ s = 0.6 }) => { const b = cyl(s / 2, s / 2, s, 64); b.translate(0, s / 2, 0); return b; }),
  cone: forme(({ s = 0.6 }) => { const b = metricUV(new THREE.ConeGeometry(s / 2, s, 64)); b.translate(0, s / 2, 0); return b; }),
  pyramide: forme(({ s = 0.6 }) => { const b = metricUV(new THREE.ConeGeometry(s / 1.6, s, 4)); b.rotateY(Math.PI / 4); b.translate(0, s / 2, 0); return b; }),
  tore: forme(({ s = 0.6 }) => { const b = new THREE.TorusGeometry(s / 2.6, s / 8, 32, 96); b.translate(0, s / 2.6 + s / 8, 0); return b; }),
  plaque: forme(({ s = 1.2 }) => { const b = box(s, 0.02, s); b.translate(0, 0.01, 0); return b; }),
};

/* ---------- personnages ---------- */
const POSES = {
  debout: { hip: [0, 0], knee: [0, 0], sh: [0.05, 0.05], el: [0.1, 0.1], shZ: [0.08, -0.08], y: 0 },
  marche: { hip: [-0.38, 0.32], knee: [0.15, 0.55], sh: [0.35, -0.3], el: [0.25, 0.35], shZ: [0.06, -0.06], y: -0.015 },
  assis: { hip: [-1.57, -1.57], knee: [1.57, 1.57], sh: [0.2, 0.2], el: [0.9, 0.9], shZ: [0.12, -0.12], y: -0.44 },
  pense: { hip: [0, 0.08], knee: [0, 0.12], sh: [0.45, 0.55], el: [1.5, 2.45], shZ: [0.5, -0.38], y: 0 },
  presente: { hip: [0, 0], knee: [0, 0], sh: [0.05, 1.3], el: [0.1, 0.25], shZ: [0.08, -0.5], y: 0 },
};

function personnage({ pose = 'debout', taille = 1.75, carrure = 1 }) {
  const P = POSES[pose] || POSES.debout;
  const g = new THREE.Group();
  const root = new THREE.Group(); const k = taille / 1.75; root.scale.set(k * carrure, k, k * carrure); g.add(root);
  const body = new THREE.Group(); body.position.y = P.y; root.add(body);
  const C = (r, l) => new THREE.CapsuleGeometry(r, l, 8, 20);
  const add = (parent, geo, x, y, z, role = 'corps', sx = 1, sy = 1, sz = 1) => { const m = part(geo, role, x, y, z); m.scale.set(sx, sy, sz); parent.add(m); return m; };
  // bassin, buste, tête
  add(body, C(0.13, 0.08), 0, 0.98, 0, 'corps', 1.25, 1, 0.8);
  add(body, C(0.145, 0.28), 0, 1.24, 0, 'corps', 1.18, 1, 0.72);
  add(body, C(0.05, 0.06), 0, 1.5, 0.005);
  const head = add(body, new THREE.SphereGeometry(0.1, 32, 24), 0, 1.63, 0.01, 'corps', 0.86, 1.12, 0.95);
  add(head, new THREE.SphereGeometry(0.06, 16, 12), 0, -0.06, 0.035, 'corps', 1, 0.9, 1);
  // jambes
  for (const [i, s] of [[0, -1], [1, 1]]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.095, 0.93, 0); hip.rotation.x = P.hip[i]; body.add(hip);
    add(hip, C(0.072, 0.34), 0, -0.22, 0);
    const knee = new THREE.Group(); knee.position.y = -0.45; knee.rotation.x = P.knee[i]; hip.add(knee);
    add(knee, C(0.055, 0.34), 0, -0.22, 0);
    add(knee, box(0.09, 0.06, 0.24, 0.025), 0, -0.44, 0.05);
  }
  // bras
  for (const [i, s] of [[0, -1], [1, 1]]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.215, 1.42, 0); sh.rotation.set(-P.sh[i], 0, P.shZ[i]); body.add(sh);
    add(sh, C(0.048, 0.22), 0, -0.15, 0);
    const el = new THREE.Group(); el.position.y = -0.3; el.rotation.x = -P.el[i]; sh.add(el);
    add(el, C(0.04, 0.2), 0, -0.13, 0);
    add(el, new THREE.SphereGeometry(0.045, 16, 12), 0, -0.29, 0.005, 'corps', 0.8, 1.3, 0.55);
  }
  g.userData.figure = true;
  return g;
}

function groupe() {
  const g = new THREE.Group();
  const a = personnage({ pose: 'debout' }); a.position.set(-0.6, 0, 0); a.rotation.y = 0.4;
  const b = personnage({ pose: 'presente', taille: 1.68 }); b.position.set(0.1, 0, -0.25); b.rotation.y = -0.2;
  const c = personnage({ pose: 'pense', taille: 1.82 }); c.position.set(0.75, 0, 0.15); c.rotation.y = -0.6;
  g.add(a, b, c);
  return g;
}

/* ---------- mode ---------- */
function buste({ h = 1.55 }) {
  const g = new THREE.Group();
  g.add(part(cyl(0.2, 0.22, 0.03, 40), 'metal', 0, 0.015, 0));
  g.add(part(cyl(0.012, 0.012, 0.85, 12), 'metal', 0, 0.45, 0));
  const torso = part(lathe([[0, 0.86], [0.12, 0.86], [0.17, 0.92], [0.19, 1.0], [0.17, 1.1], [0.15, 1.18], [0.17, 1.28], [0.18, 1.36], [0.16, 1.44], [0.07, 1.5], [0.055, 1.53], [0.05, 1.6], [0, 1.6]], 48), 'textile', 0, 0, 0);
  torso.scale.set(1, 1, 0.74); g.add(torso);
  g.add(part(cyl(0.03, 0.03, 0.05, 16), 'mobilier', 0, 1.625, 0));
  return g;
}

// plis réguliers (jupes plissées, robes longues) et léger tombé irrégulier de l'ourlet
function pleat(geo, n, amp, yTop) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (y > yTop) continue;
    const a = Math.atan2(z, x), k = Math.min(1, (yTop - y) / 0.4);
    const f = 1 + (Math.sin(a * n) * amp + Math.sin(a * 3 + y * 7) * 0.012) * k;
    p.setXYZ(i, x * f, y + Math.sin(a * 5) * 0.008 * k, z * f);
  }
  geo.computeVertexNormals();
}

// vêtements dimensionnés pour le personnage standard de 1,75 m (debout)
function vetement({ modele = 'robe', longueur = 1 }) {
  const g = new THREE.Group();
  const flat = 0.74;
  const L = (pts) => { const m = part(lathe(pts, 64), 'vetement'); m.material = material('lin'); m.scale.z = flat; m.userData.double = true; return m; };
  const sleeve = (len, rTop, rBot, s) => {
    // la manche suit l'inclinaison du bras (pose debout) et l'épouse au plus près
    const sh = new THREE.Group(); sh.position.set(s * 0.215, 1.42, 0); sh.rotation.z = -s * 0.08;
    const m = part(metricUV(new THREE.CylinderGeometry(Math.min(rTop, 0.058), Math.min(rBot, 0.054), len, 24, 1, false)), 'vetement', 0, -len / 2 + 0.02, 0);
    m.material = material('lin'); sh.add(m); return sh;
  };
  if (modele === 'robe') {
    const bas = 1.45 - 0.95 * longueur;
    g.add(L([[0.19, bas], [0.2 + 0.12 * longueur, bas + 0.02], [0.2, 0.9], [0.165, 1.06], [0.18, 1.24], [0.185, 1.36], [0.16, 1.45], [0.07, 1.49]]));
  } else if (modele === 'jupe') {
    const bas = 0.98 - 0.5 * longueur;
    g.add(L([[0.24 + 0.08 * longueur, bas], [0.2, 0.9], [0.165, 0.99], [0.16, 1.03]]));
  } else if (modele === 'manteau') {
    const bas = 1.45 - 1.05 * longueur;
    g.add(L([[0.25, bas], [0.23, 0.9], [0.2, 1.06], [0.205, 1.24], [0.21, 1.38], [0.19, 1.46], [0.09, 1.52]]));
    for (const s of [-1, 1]) g.add(sleeve(0.6, 0.065, 0.055, s));
  } else if (modele === 'haut') {
    g.add(L([[0.19, 0.92], [0.175, 1.06], [0.185, 1.24], [0.19, 1.36], [0.165, 1.45], [0.07, 1.49]]));
    for (const s of [-1, 1]) g.add(sleeve(0.2 + 0.35 * (longueur - 0.5), 0.065, 0.058, s));
  } else if (modele === 'robe-longue') {
    const m = L([[0.36 + 0.1 * longueur, 0.06], [0.3, 0.3], [0.22, 0.72], [0.17, 0.98], [0.165, 1.06], [0.18, 1.24], [0.185, 1.36], [0.16, 1.45], [0.07, 1.49]]);
    pleat(m.geometry, 18, 0.05, 0.95); g.add(m);
  } else if (modele === 'jupe-plissee') {
    const bas = 0.98 - 0.55 * longueur;
    const m = L([[0.28 + 0.08 * longueur, bas], [0.22, 0.86], [0.168, 0.98], [0.163, 1.03]]); pleat(m.geometry, 28, 0.035, 0.97); g.add(m);
  } else if (modele === 'chemise') {
    g.add(L([[0.2, 0.86], [0.19, 0.95], [0.18, 1.06], [0.188, 1.24], [0.192, 1.36], [0.168, 1.45], [0.075, 1.5]]));
    for (const s of [-1, 1]) g.add(sleeve(0.56 * longueur + 0.1, 0.06, 0.045, s));
    const col = part(new THREE.TorusGeometry(0.07, 0.014, 10, 32), 'vetement', 0, 1.49, 0.01, { rot: [Math.PI / 2.3, 0, 0] }); col.material = material('lin'); g.add(col);
  } else if (modele === 'veste') {
    g.add(L([[0.215, 0.9 + 0.2 * (1 - longueur)], [0.205, 1.06], [0.21, 1.24], [0.215, 1.38], [0.195, 1.46], [0.09, 1.52]]));
    for (const s of [-1, 1]) g.add(sleeve(0.6, 0.068, 0.056, s));
    for (const s of [-1, 1]) { const rv = part(box(0.08, 0.28, 0.01), 'vetement', s * 0.06, 1.33, 0.155, { rot: [0.15, 0, s * 0.35] }); rv.material = material('lin'); g.add(rv); }
  } else if (modele === 'sweat') {
    g.add(L([[0.205, 0.86], [0.2, 0.92], [0.195, 1.06], [0.205, 1.24], [0.21, 1.36], [0.18, 1.45], [0.085, 1.5]]));
    for (const s of [-1, 1]) g.add(sleeve(0.6, 0.075, 0.05, s));
    const hood = part(new THREE.SphereGeometry(0.13, 24, 16, 0, Math.PI * 2, 0, Math.PI / 1.7), 'vetement', 0, 1.52, -0.07, { rot: [-0.9, 0, 0] }); hood.material = material('lin'); hood.scale.set(1, 0.9, 1.1); g.add(hood);
  } else if (modele === 'short') {
    g.add(L([[0.165, 0.86], [0.17, 0.94], [0.165, 1.02], [0.16, 1.04]]));
    for (const s of [-1, 1]) { const leg = part(metricUV(new THREE.CylinderGeometry(0.1, 0.095 + 0.02 * longueur, 0.22, 24, 1, true)), 'vetement', s * 0.095, 0.8, 0); leg.material = material('lin'); g.add(leg); }
  } else if (modele === 'pantalon') {
    g.add(L([[0.165, 0.86], [0.17, 0.94], [0.165, 1.02], [0.16, 1.04]]));
    for (const s of [-1, 1]) {
      const leg = part(metricUV(new THREE.CylinderGeometry(0.09, 0.07 + 0.02 * longueur, 0.82, 24, 1, true)), 'vetement', s * 0.095, 0.5, 0);
      leg.material = material('lin'); g.add(leg);
    }
  }
  g.userData.garment = modele;
  return g;
}

/* ---------- lumières ---------- */
function spot({ angle = 0.5 }) {
  const g = new THREE.Group(); const y = 2.6;
  g.add(part(cyl(0.05, 0.07, 0.16, 24), 'metal', 0, y, 0));
  const L = new THREE.SpotLight(0xfff1dc, 30, 10, angle, 0.45, 1.3); L.position.y = y - 0.08; L.castShadow = true; L.shadow.mapSize.set(512, 512);
  L.target.position.set(0, 0, 0); L.userData.lamp = true; g.add(L, L.target);
  return g;
}

function neon({ w = 1.2, couleur = 0xffb36b }) {
  const g = new THREE.Group(); const y = 1.6;
  const tube = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, w, 6, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: couleur, emissiveIntensity: 4 }));
  tube.rotation.z = Math.PI / 2; tube.position.y = y; tube.userData.role = 'ampoule'; g.add(tube);
  const L = new THREE.PointLight(couleur, 5, 5, 1.5); L.position.y = y; L.userData.lamp = true; g.add(L);
  return g;
}


/* ---------- matière à modeler ---------- */
function argile({ s = 0.7, forme: f = 'boule' }) {
  let geo;
  if (f === 'boule') geo = new THREE.IcosahedronGeometry(s / 2, 40);
  else if (f === 'bloc') geo = new THREE.BoxGeometry(s, s, s, 28, 28, 28);
  else if (f === 'cylindre') geo = new THREE.CylinderGeometry(s / 2, s / 2, s * 1.2, 72, 36, false);
  else geo = new THREE.TorusGeometry(s / 2.6, s / 7, 40, 120);
  geo = weld(geo);
  const b = new THREE.Box3().setFromBufferAttribute(geo.attributes.position);
  geo.translate(0, -b.min.y, 0);
  sculptUV(geo, 'box');
  const g = new THREE.Group(); const m = part(geo, 'forme'); m.userData.sculpt = 'libre'; g.add(m);
  return g;
}

/* ---------- paysages ---------- */
function fbm2(x, y, oct, seed) {
  let a = 0, amp = 0.5, f = 1;
  for (let o = 0; o < oct; o++) { a += amp * vnoise(x * f + seed * 17.1, y * f - seed * 9.7); f *= 2.03; amp *= 0.5; }
  return a;
}
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

// couleurs naturelles selon l'altitude et la pente : sable, herbe, terre, roche, neige
function terrainColors(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  let minY = Infinity, maxY = -Infinity; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const span = Math.max(maxY - minY, 1e-3);
  const col = new Float32Array(p.count * 3);
  const C = { sable: [0.80, 0.73, 0.58], herbe: [0.30, 0.38, 0.20], herbe2: [0.42, 0.45, 0.25], terre: [0.42, 0.34, 0.25], roche: [0.47, 0.45, 0.42], neige: [0.94, 0.95, 0.96] };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const h = (y - minY) / span, slope = 1 - Math.abs(n.getY(i));
    const v = vnoise(x * 0.08, z * 0.08) * 0.5 + 0.5, fine = vnoise(x * 0.9, z * 0.9) * 0.06;
    let c = mix(C.herbe, C.herbe2, v);
    if (h < 0.04 && span > 2) c = mix(mix(C.herbe, C.terre, 0.25), c, h / 0.04);
    if (slope > 0.35) c = mix(c, C.terre, Math.min(1, (slope - 0.35) * 4));
    if (slope > 0.55) c = mix(c, C.roche, Math.min(1, (slope - 0.55) * 4));
    if (h > 0.78 && span > 60) c = mix(c, C.neige, Math.min(1, (h - 0.72) * 6) * (1 - Math.min(1, slope * 1.3)));
    // couleurs données en sRGB → espace linéaire du rendu
    col[i * 3] = Math.pow(Math.max(0, c[0] + fine), 2.2); col[i * 3 + 1] = Math.pow(Math.max(0, c[1] + fine), 2.2); col[i * 3 + 2] = Math.pow(Math.max(0, c[2] + fine), 2.2);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

function terrain({ taille = 120, relief = 18, style = 1, variante = 1 }) {
  const seg = 180;
  const geo = new THREE.PlaneGeometry(taille, taille, seg, seg); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position; const k = 3.2 / taille * (style >= 2 ? 1.6 : 1);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    let h = fbm2(x * k, z * k, 6, variante);
    if (style >= 2) h = 1 - Math.abs(h) * 2.2;            // crêtes de montagnes
    else if (style <= 0) h = h * 0.25;                      // plaine
    // bords qui descendent doucement pour un paysage « posé »
    // les bords redescendent en douceur jusqu'au sol du studio
    const r = Math.max(Math.abs(x), Math.abs(z)) / (taille / 2); const t = Math.min(1, Math.max(0, (1 - r) / 0.3)); const edge = t * t * (3 - 2 * t);
    p.setY(i, Math.max(0, (h * 0.5 + 0.5) * relief) * edge);
  }
  const g = weld(geo); g.computeVertexNormals(); terrainColors(g); sculptUV(g, 'plan');
  const grp = new THREE.Group(); const m = part(g, 'terrain', 0, 0, 0, { cast: false }); m.castShadow = true; m.userData.sculpt = 'y'; m.userData.recolor = terrainColors;
  grp.add(m); return grp;
}

function eau({ taille = 60 }) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CircleGeometry(taille / 2, 96), new THREE.MeshPhysicalMaterial({ color: 0x29505c, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.86, clearcoat: 1, clearcoatRoughness: 0.08 }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.receiveShadow = true; m.userData.role = 'eau'; g.add(m);
  return g;
}

// feuillage : amas de sphères déformées, teintes variées, fusionnés en un seul objet
const LEAF = [0x2F4A2A, 0x3B5631, 0x4A6338, 0x55703F];
function feuillage(r, rnd, n = 7) {
  const geos = [];
  for (let i = 0; i < n; i++) {
    const s = r * (0.45 + rnd() * 0.4);
    const geo = new THREE.IcosahedronGeometry(s, 3);
    const pos = geo.attributes.position;
    for (let j = 0; j < pos.count; j++) { const x = pos.getX(j), y = pos.getY(j), z = pos.getZ(j); const f = 1 + (hash(x * 13 + i, z * 7 + y) - 0.5) * 0.35; pos.setXYZ(j, x * f, y * f * 0.85, z * f); }
    const a = rnd() * Math.PI * 2, d = r * 0.55 * rnd();
    geo.translate(Math.cos(a) * d, (rnd() - 0.3) * r * 0.7, Math.sin(a) * d);
    const c = new THREE.Color(LEAF[Math.floor(rnd() * LEAF.length)]).offsetHSL(0, 0, (rnd() - 0.5) * 0.05);
    const col = new Float32Array(pos.count * 3); for (let j = 0; j < pos.count; j++) { col[j * 3] = c.r; col[j * 3 + 1] = c.g; col[j * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.deleteAttribute('uv');
    geo.computeVertexNormals();
    geos.push(geo.index ? geo.toNonIndexed() : geo);
  }
  return mergeGeos(geos);
}
function mergeGeos(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); col.set(g.attributes.color.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('color', new THREE.BufferAttribute(col, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return m;
}
const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
const barkMat = new THREE.MeshStandardMaterial({ color: 0x4B3C2E, roughness: 0.95 });
const pineMat = new THREE.MeshStandardMaterial({ color: 0x24392B, roughness: 0.9 });

function unArbre(h, essence, seed) {
  const rnd = (() => { let s = seed * 9301 + 49297; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const g = new THREE.Group();
  if (essence === 'pin') {
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.02, h * 0.035, h * 0.45, 8), barkMat); tr.position.y = h * 0.22; tr.castShadow = true; g.add(tr);
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(h * (0.24 - i * 0.045), h * 0.34, 9), pineMat);
      c.position.y = h * (0.38 + i * 0.16); c.rotation.y = rnd() * 3; c.castShadow = true; g.add(c);
    }
  } else {
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.025, h * 0.045, h * 0.55, 8), barkMat); tr.position.y = h * 0.27; tr.castShadow = true; g.add(tr);
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.008, h * 0.018, h * 0.3, 6), barkMat);
      const a = i * 2.1 + rnd(); b.position.set(Math.cos(a) * h * 0.06, h * 0.55, Math.sin(a) * h * 0.06); b.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); g.add(b);
    }
    const f = new THREE.Mesh(feuillage(h * 0.32, rnd, 6 + Math.floor(rnd() * 3)), leafMat); f.position.y = h * 0.72; f.castShadow = true; g.add(f);
  }
  return g;
}
function arbre({ h = 7, essence = 0, variante = 1 }) { const g = new THREE.Group(); g.add(unArbre(h, essence >= 1 ? 'pin' : 'feuillu', variante)); return g; }

function foret({ taille = 40, densite = 40, variante = 1 }) {
  const g = new THREE.Group(); const rnd = (() => { let s = variante * 7919 + 13; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const n = Math.round(densite);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * taille / 2;
    const t = unArbre(5 + rnd() * 7, rnd() > 0.55 ? 'pin' : 'feuillu', i + variante * 100);
    t.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); t.rotation.y = rnd() * 6; g.add(t);
  }
  return g;
}

function rocher({ s = 1.2, variante = 1 }) {
  const geo = new THREE.IcosahedronGeometry(s / 2, 5); const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = fbm2(x * 2.2 / s + variante, z * 2.2 / s + y * 1.7 / s, 4, variante) * 0.45 + 1;
    p.setXYZ(i, x * n * 1.15, y * n * 0.75, z * n);
  }
  const w = weld(geo); const b = new THREE.Box3().setFromBufferAttribute(w.attributes.position); w.translate(0, -b.min.y - s * 0.08, 0); sculptUV(w, 'box');
  const g = new THREE.Group(); const m = part(w, 'roche'); m.userData.sculpt = 'libre'; g.add(m); return g;
}

function montagne({ h = 60, variante = 1 }) {
  const r = h * 1.6, geo = new THREE.CircleGeometry(r, 120, 0, Math.PI * 2);
  const seg = new THREE.PlaneGeometry(r * 2, r * 2, 140, 140); seg.rotateX(-Math.PI / 2);
  const p = seg.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i); const d = Math.hypot(x, z) / r;
    const base = Math.max(0, 1 - d); const ridge = 1 - Math.abs(fbm2(x / r * 2.5, z / r * 2.5, 5, variante)) * 1.6;
    p.setY(i, Math.max(0, Math.pow(base, 1.5) * h * (0.65 + ridge * 0.45)));
  }
  geo.dispose();
  const w = weld(seg); w.computeVertexNormals(); terrainColors(w); sculptUV(w, 'plan');
  const g = new THREE.Group(); const m = part(w, 'terrain'); m.userData.sculpt = 'y'; m.userData.recolor = terrainColors; g.add(m); return g;
}

/* ---------- villes ---------- */
function immeuble({ w = 18, d = 14, etages = 6, toit = 1 }) {
  const g = new THREE.Group(); const H = etages * 3.1;
  g.add(part(box(w, H, d), 'batiment', 0, H / 2, 0));
  // bandeaux d'étages et fenêtres en creux suggérés par des lames
  for (let i = 1; i < etages; i++) g.add(part(box(w + 0.12, 0.18, d + 0.12), 'batiment', 0, i * 3.1, 0, { cast: false }));
  const nx = Math.max(2, Math.round(w / 3)), nz = Math.max(2, Math.round(d / 3));
  const glass = (geo, x, y, z) => g.add(part(geo, 'verre', x, y, z, { cast: false }));
  for (let i = 0; i < etages; i++) {
    const y = i * 3.1 + 1.65;
    for (let k = 0; k < nx; k++) { const x = -w / 2 + (k + 0.5) * w / nx; glass(box(w / nx * 0.55, 1.6, 0.06), x, y, d / 2 + 0.01); glass(box(w / nx * 0.55, 1.6, 0.06), x, y, -d / 2 - 0.01); }
    for (let k = 0; k < nz; k++) { const z = -d / 2 + (k + 0.5) * d / nz; glass(box(0.06, 1.6, d / nz * 0.55), w / 2 + 0.01, y, z); glass(box(0.06, 1.6, d / nz * 0.55), -w / 2 - 0.01, y, z); }
  }
  if (toit) g.add(part(box(w * 0.4, 2.4, d * 0.4), 'batiment', w * 0.15, H + 1.2, -d * 0.1));
  return g;
}

function tour({ w = 22, etages = 30 }) {
  const g = new THREE.Group(); const H = etages * 3.6;
  g.add(part(box(w, H, w), 'verre', 0, H / 2, 0));
  g.add(part(box(w * 0.94, H + 0.4, w * 0.94), 'batiment', 0, H / 2, 0, { cast: false }));
  for (let i = 0; i <= etages; i += 1) g.add(part(box(w + 0.2, 0.25, w + 0.2), 'metal', 0, i * 3.6, 0, { cast: false }));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(part(box(0.5, H, 0.5), 'metal', x * w / 2, H / 2, z * w / 2, { cast: false }));
  return g;
}

function maison({ w = 9, d = 11 }) {
  const g = new THREE.Group(); const H = 3;
  g.add(part(box(w, H, d), 'batiment', 0, H / 2, 0));
  const roof = new THREE.Shape(); roof.moveTo(-w / 2 - 0.4, 0); roof.lineTo(0, w * 0.42); roof.lineTo(w / 2 + 0.4, 0); roof.lineTo(-w / 2 - 0.4, 0);
  const rg = new THREE.ExtrudeGeometry(roof, { depth: d + 0.6, bevelEnabled: false }); rg.translate(0, 0, -(d + 0.6) / 2); rg.computeVertexNormals();
  g.add(part(metricUV(rg), 'toit', 0, H, 0));
  g.add(part(box(1.1, 2.2, 0.08), 'mobilier', 0, 1.1, d / 2 + 0.02, { cast: false }));
  for (const x of [-w / 3, w / 3]) g.add(part(box(1.3, 1.3, 0.06), 'verre', x, 1.7, d / 2 + 0.02, { cast: false }));
  return g;
}

function quartier({ blocs = 4, hauteur = 12, variante = 1 }) {
  const g = new THREE.Group(); const B = 44, rue = 14; const n = Math.round(blocs);
  const rnd = (() => { let s = variante * 104729 + 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const tot = n * B + (n + 1) * rue;
  g.add(part(box(tot, 0.08, tot), 'route', 0, 0.04, 0, { cast: false }));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const cx = -tot / 2 + rue + B / 2 + i * (B + rue), cz = -tot / 2 + rue + B / 2 + j * (B + rue);
    g.add(part(box(B + 3, 0.18, B + 3), 'trottoir', cx, 0.09, cz, { cast: false })); // trottoir
    const center = 1 - Math.hypot(i - (n - 1) / 2, j - (n - 1) / 2) / n;
    if (rnd() < 0.12) { // parc
      g.add(part(box(B - 2, 0.1, B - 2), 'herbe', cx, 0.2, cz, { cast: false }));
      for (let t = 0; t < 7; t++) { const tr = unArbre(6 + rnd() * 5, 'feuillu', t + i * 9 + j); tr.position.set(cx + (rnd() - 0.5) * (B - 8), 0.2, cz + (rnd() - 0.5) * (B - 8)); g.add(tr); }
      continue;
    }
    const k = 2; const lot = B / k;
    for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) {
      const et = Math.max(2, Math.round(hauteur * (0.35 + center * 0.9) * (0.5 + rnd())));
      const bw = lot - 2 - rnd() * 4, bd = lot - 2 - rnd() * 4;
      const H = et * 3.1;
      const x = cx - B / 2 + lot * (a + 0.5), z = cz - B / 2 + lot * (b + 0.5);
      g.add(part(box(bw, H, bd), 'batiment', x, 0.18 + H / 2, z));
      if (et > 8 && rnd() > 0.4) g.add(part(box(bw * 0.6, H * 0.35, bd * 0.6), 'batiment', x, 0.18 + H + H * 0.175, z));
    }
  }
  return g;
}

function route({ l = 60, w = 12 }) {
  const g = new THREE.Group();
  g.add(part(box(w, 0.08, l), 'route', 0, 0.04, 0, { cast: false }));
  for (let z = -l / 2 + 2; z < l / 2 - 2; z += 6) g.add(part(box(0.18, 0.01, 3), 'marquage', 0, 0.085, z + 1.5, { cast: false }));
  return g;
}

/* ---------- catalogue ---------- */
// roles : rôles présents → matière par défaut prise dans la palette active
export const CATALOG = [
  // créations de Almy (objet décrit par l'IA, reconstruit à partir de sa description)
  { id: 'ia', cat: 'Créations', name: 'Création', build: p => buildSpec(p.spec || { parties: [] }, part), params: { spec: null } },
  // Modeler
  { id: 'argile', cat: 'Modeler', name: 'Boule d’argile', build: p => argile({ ...p, forme: 'boule' }), params: { s: 0.7 }, sculpt: true },
  { id: 'argile-bloc', cat: 'Modeler', name: 'Bloc d’argile', build: p => argile({ ...p, forme: 'bloc' }), params: { s: 0.6 }, sculpt: true },
  { id: 'argile-cylindre', cat: 'Modeler', name: 'Colonne d’argile', build: p => argile({ ...p, forme: 'cylindre' }), params: { s: 0.6 }, sculpt: true },
  { id: 'argile-anneau', cat: 'Modeler', name: 'Anneau d’argile', build: p => argile({ ...p, forme: 'anneau' }), params: { s: 0.7 }, sculpt: true },
  // Paysages
  { id: 'terrain', cat: 'Paysages', name: 'Collines', build: p => terrain({ ...p, style: 1 }), params: { taille: 120, relief: 16, variante: 1 }, ranges: { taille: [20, 1500], relief: [0, 200], variante: [1, 50, 1] }, labels: { taille: 'Étendue', relief: 'Relief', variante: 'Variante' }, sculpt: true, big: true },
  { id: 'terrain-montagnes', cat: 'Paysages', name: 'Massif', build: p => terrain({ ...p, style: 2 }), params: { taille: 300, relief: 70, variante: 3 }, ranges: { taille: [40, 2000], relief: [5, 400], variante: [1, 50, 1] }, labels: { taille: 'Étendue', relief: 'Relief', variante: 'Variante' }, sculpt: true, big: true },
  { id: 'plaine', cat: 'Paysages', name: 'Plaine', build: p => terrain({ ...p, style: 0 }), params: { taille: 200, relief: 4, variante: 2 }, ranges: { taille: [20, 2000], relief: [0, 40], variante: [1, 50, 1] }, labels: { taille: 'Étendue', relief: 'Relief', variante: 'Variante' }, sculpt: true, big: true },
  { id: 'montagne', cat: 'Paysages', name: 'Montagne', build: montagne, params: { h: 60, variante: 1 }, ranges: { h: [5, 600], variante: [1, 50, 1] }, labels: { h: 'Hauteur', variante: 'Variante' }, sculpt: true, big: true },
  { id: 'eau', cat: 'Paysages', name: 'Lac', build: eau, params: { taille: 60 }, ranges: { taille: [2, 2000] }, labels: { taille: 'Diamètre' }, big: true },
  { id: 'arbre', cat: 'Paysages', name: 'Arbre', build: p => arbre({ ...p, essence: 0 }), params: { h: 8, variante: 1 }, ranges: { h: [1, 40], variante: [1, 50, 1] }, labels: { h: 'Hauteur', variante: 'Variante' } },
  { id: 'pin', cat: 'Paysages', name: 'Pin', build: p => arbre({ ...p, essence: 1 }), params: { h: 10, variante: 1 }, ranges: { h: [1, 50], variante: [1, 50, 1] }, labels: { h: 'Hauteur', variante: 'Variante' } },
  { id: 'foret', cat: 'Paysages', name: 'Forêt', build: foret, params: { taille: 40, densite: 40, variante: 1 }, ranges: { taille: [8, 400], densite: [5, 220, 1], variante: [1, 50, 1] }, labels: { taille: 'Étendue', densite: 'Arbres', variante: 'Variante' }, big: true },
  { id: 'rocher', cat: 'Paysages', name: 'Rocher', build: rocher, params: { s: 1.4, variante: 1 }, ranges: { s: [0.2, 40], variante: [1, 50, 1] }, labels: { s: 'Taille', variante: 'Variante' }, sculpt: true },
  // Villes
  { id: 'quartier', cat: 'Villes', name: 'Quartier', build: quartier, params: { blocs: 4, hauteur: 12, variante: 1 }, ranges: { blocs: [1, 10, 1], hauteur: [2, 60, 1], variante: [1, 50, 1] }, labels: { blocs: 'Îlots', hauteur: 'Étages', variante: 'Variante' }, big: true },
  { id: 'immeuble', cat: 'Villes', name: 'Immeuble', build: immeuble, params: { w: 18, d: 14, etages: 6 }, ranges: { w: [6, 80], d: [6, 80], etages: [1, 40, 1] }, labels: { w: 'Largeur', d: 'Profondeur', etages: 'Étages' }, big: true },
  { id: 'tour', cat: 'Villes', name: 'Tour', build: tour, params: { w: 22, etages: 30 }, ranges: { w: [8, 80], etages: [5, 160, 1] }, labels: { w: 'Largeur', etages: 'Étages' }, big: true },
  { id: 'maison', cat: 'Villes', name: 'Maison', build: maison, params: { w: 9, d: 11 }, ranges: { w: [5, 30], d: [5, 30] }, labels: { w: 'Largeur', d: 'Longueur' }, big: true },
  { id: 'route', cat: 'Villes', name: 'Route', build: route, params: { l: 60, w: 12 }, ranges: { l: [6, 1000], w: [3, 40] }, labels: { l: 'Longueur', w: 'Largeur' }, big: true },
  // Espaces
  { id: 'piece', cat: 'Espaces', name: 'Pièce', build: piece, params: { w: 5, d: 4, h: 2.7 }, ranges: { w: [1.5, 20], d: [1.5, 20], h: [2.1, 6] }, labels: { w: 'Largeur', d: 'Profondeur', h: 'Hauteur' } },
  { id: 'mur', cat: 'Espaces', name: 'Mur', build: mur, params: { w: 3, h: 2.7 }, ranges: { w: [0.3, 20], h: [0.3, 8] }, labels: { w: 'Longueur', h: 'Hauteur' } },
  { id: 'sol', cat: 'Espaces', name: 'Sol', build: sol, params: { w: 4, d: 4 }, ranges: { w: [0.5, 30], d: [0.5, 30] }, labels: { w: 'Largeur', d: 'Profondeur' } },
  { id: 'baie', cat: 'Espaces', name: 'Baie vitrée', build: baie, params: { w: 2.4, h: 2.3 }, ranges: { w: [0.6, 8], h: [0.6, 5] }, labels: { w: 'Largeur', h: 'Hauteur' } },
  { id: 'porte', cat: 'Espaces', name: 'Porte', build: porte, params: { w: 0.93, h: 2.1, ouverte: 0.35 }, ranges: { w: [0.6, 2], h: [1.8, 3.2], ouverte: [0, 1] }, labels: { w: 'Largeur', h: 'Hauteur', ouverte: 'Ouverture' } },
  { id: 'escalier', cat: 'Espaces', name: 'Escalier', build: escalier, params: { n: 14, w: 1 }, ranges: { n: [2, 24, 1], w: [0.6, 3] }, labels: { n: 'Marches', w: 'Largeur' } },
  { id: 'colonne', cat: 'Espaces', name: 'Colonne', build: colonne, params: { h: 2.7, r: 0.18 }, ranges: { h: [0.5, 8], r: [0.08, 0.8] }, labels: { h: 'Hauteur', r: 'Rayon' } },
  { id: 'arche', cat: 'Espaces', name: 'Arche', build: arche, params: { w: 1.6, h: 2.6 }, ranges: { w: [0.6, 6], h: [1.6, 6] }, labels: { w: 'Ouverture', h: 'Hauteur' } },
  { id: 'estrade', cat: 'Espaces', name: 'Estrade', build: estrade, params: { w: 4, d: 2.5, h: 0.4 }, ranges: { w: [1, 15], d: [1, 10], h: [0.1, 1.5] }, labels: { w: 'Largeur', d: 'Profondeur', h: 'Hauteur' } },
  { id: 'cimaise', cat: 'Espaces', name: 'Cimaise', build: cimaise, params: { w: 2, h: 2.4 }, ranges: { w: [0.5, 6], h: [1, 4] }, labels: { w: 'Largeur', h: 'Hauteur' } },
  // Mobilier
  { id: 'canape', cat: 'Mobilier', name: 'Canapé', build: canape, params: { w: 2.2, places: 3 }, ranges: { w: [1.2, 4], places: [1, 5, 1] }, labels: { w: 'Largeur', places: 'Places' } },
  { id: 'fauteuil', cat: 'Mobilier', name: 'Fauteuil', build: fauteuil, params: {} },
  { id: 'table', cat: 'Mobilier', name: 'Table', build: table, params: { w: 1.8, d: 0.9, h: 0.75 }, ranges: { w: [0.6, 4], d: [0.5, 1.6], h: [0.35, 1.1] }, labels: { w: 'Longueur', d: 'Largeur', h: 'Hauteur' } },
  { id: 'table-ronde', cat: 'Mobilier', name: 'Table ronde', build: p => table({ ...p, ronde: true }), params: { w: 1.2, h: 0.75 }, ranges: { w: [0.5, 2.4], h: [0.35, 1.1] }, labels: { w: 'Diamètre', h: 'Hauteur' } },
  { id: 'chaise', cat: 'Mobilier', name: 'Chaise', build: chaise, params: {} },
  { id: 'tabouret', cat: 'Mobilier', name: 'Tabouret', build: tabouret, params: { h: 0.65 }, ranges: { h: [0.4, 0.85] }, labels: { h: 'Hauteur' } },
  { id: 'lit', cat: 'Mobilier', name: 'Lit', build: lit, params: { w: 1.6 }, ranges: { w: [0.9, 2] }, labels: { w: 'Largeur' } },
  { id: 'etagere', cat: 'Mobilier', name: 'Étagère', build: etagere, params: { w: 1.2, h: 1.9, n: 5 }, ranges: { w: [0.4, 4], h: [0.6, 3], n: [2, 9, 1] }, labels: { w: 'Largeur', h: 'Hauteur', n: 'Tablettes' } },
  { id: 'ilot', cat: 'Mobilier', name: 'Îlot', build: ilot, params: { w: 2.4, d: 1 }, ranges: { w: [1, 4], d: [0.6, 1.4] }, labels: { w: 'Longueur', d: 'Profondeur' } },
  { id: 'tapis', cat: 'Mobilier', name: 'Tapis', build: tapis, params: { w: 2.4, d: 1.7 }, ranges: { w: [0.6, 5], d: [0.6, 4] }, labels: { w: 'Longueur', d: 'Largeur' } },
  { id: 'lampe', cat: 'Mobilier', name: 'Lampadaire', build: lampe, params: { h: 1.6 }, ranges: { h: [0.4, 2] }, labels: { h: 'Hauteur' } },
  { id: 'suspension', cat: 'Mobilier', name: 'Suspension', build: suspension, params: { r: 0.25 }, ranges: { r: [0.1, 0.6] }, labels: { r: 'Rayon' } },
  { id: 'miroir', cat: 'Mobilier', name: 'Miroir', build: miroir, params: { r: 0.45 }, ranges: { r: [0.15, 1] }, labels: { r: 'Rayon' } },
  { id: 'plante', cat: 'Mobilier', name: 'Plante', build: plante, params: { h: 1.4 }, ranges: { h: [0.4, 2.4] }, labels: { h: 'Hauteur' } },
  // Personnages
  { id: 'perso-debout', cat: 'Personnages', name: 'Debout', build: p => personnage({ ...p, pose: 'debout' }), params: { taille: 1.75, carrure: 1 }, ranges: { taille: [1.2, 2.1], carrure: [0.8, 1.3] }, labels: { taille: 'Taille', carrure: 'Carrure' } },
  { id: 'perso-marche', cat: 'Personnages', name: 'Marche', build: p => personnage({ ...p, pose: 'marche' }), params: { taille: 1.75, carrure: 1 }, ranges: { taille: [1.2, 2.1], carrure: [0.8, 1.3] }, labels: { taille: 'Taille', carrure: 'Carrure' } },
  { id: 'perso-assis', cat: 'Personnages', name: 'Assis', build: p => personnage({ ...p, pose: 'assis' }), params: { taille: 1.75, carrure: 1 }, ranges: { taille: [1.2, 2.1], carrure: [0.8, 1.3] }, labels: { taille: 'Taille', carrure: 'Carrure' } },
  { id: 'perso-pense', cat: 'Personnages', name: 'Pensif', build: p => personnage({ ...p, pose: 'pense' }), params: { taille: 1.75, carrure: 1 }, ranges: { taille: [1.2, 2.1], carrure: [0.8, 1.3] }, labels: { taille: 'Taille', carrure: 'Carrure' } },
  { id: 'perso-presente', cat: 'Personnages', name: 'Présente', build: p => personnage({ ...p, pose: 'presente' }), params: { taille: 1.75, carrure: 1 }, ranges: { taille: [1.2, 2.1], carrure: [0.8, 1.3] }, labels: { taille: 'Taille', carrure: 'Carrure' } },
  { id: 'groupe', cat: 'Personnages', name: 'Groupe', build: groupe, params: {} },
  // Mode
  { id: 'buste', cat: 'Mode', name: 'Buste couture', build: buste, params: {} },
  { id: 'portant', cat: 'Mode', name: 'Portant', build: portant, params: { w: 1.4 }, ranges: { w: [0.8, 3] }, labels: { w: 'Largeur' } },
  { id: 'robe', cat: 'Mode', name: 'Robe', build: p => vetement({ ...p, modele: 'robe' }), params: { longueur: 1 }, ranges: { longueur: [0.4, 1.4] }, labels: { longueur: 'Longueur' }, garment: true },
  { id: 'jupe', cat: 'Mode', name: 'Jupe', build: p => vetement({ ...p, modele: 'jupe' }), params: { longueur: 1 }, ranges: { longueur: [0.3, 1.6] }, labels: { longueur: 'Longueur' }, garment: true },
  { id: 'haut', cat: 'Mode', name: 'Haut', build: p => vetement({ ...p, modele: 'haut' }), params: { longueur: 0.5 }, ranges: { longueur: [0.5, 1.6] }, labels: { longueur: 'Manches' }, garment: true },
  { id: 'manteau', cat: 'Mode', name: 'Manteau', build: p => vetement({ ...p, modele: 'manteau' }), params: { longueur: 1 }, ranges: { longueur: [0.5, 1.2] }, labels: { longueur: 'Longueur' }, garment: true },
  { id: 'robe-longue', cat: 'Mode', name: 'Robe longue', build: p => vetement({ ...p, modele: 'robe-longue' }), params: { longueur: 1 }, ranges: { longueur: [0.5, 1.6] }, labels: { longueur: 'Ampleur' }, garment: true },
  { id: 'jupe-plissee', cat: 'Mode', name: 'Jupe plissée', build: p => vetement({ ...p, modele: 'jupe-plissee' }), params: { longueur: 0.9 }, ranges: { longueur: [0.3, 1.6] }, labels: { longueur: 'Longueur' }, garment: true },
  { id: 'chemise', cat: 'Mode', name: 'Chemise', build: p => vetement({ ...p, modele: 'chemise' }), params: { longueur: 1 }, ranges: { longueur: [0.3, 1] }, labels: { longueur: 'Manches' }, garment: true },
  { id: 'veste', cat: 'Mode', name: 'Veste', build: p => vetement({ ...p, modele: 'veste' }), params: { longueur: 0.6 }, ranges: { longueur: [0, 1] }, labels: { longueur: 'Longueur' }, garment: true },
  { id: 'sweat', cat: 'Mode', name: 'Sweat à capuche', build: p => vetement({ ...p, modele: 'sweat' }), params: {}, garment: true },
  { id: 'short', cat: 'Mode', name: 'Short', build: p => vetement({ ...p, modele: 'short' }), params: { longueur: 0.5 }, ranges: { longueur: [0, 1] }, labels: { longueur: 'Évasé' }, garment: true },
  { id: 'pantalon', cat: 'Mode', name: 'Pantalon', build: p => vetement({ ...p, modele: 'pantalon' }), params: { longueur: 1 }, ranges: { longueur: [0, 1] }, labels: { longueur: 'Évasé' }, garment: true },
  // Formes
  ...Object.entries(formes).map(([id, build]) => ({ id, cat: 'Formes', name: { cube: 'Cube', sphere: 'Sphère', cylindre: 'Cylindre', cone: 'Cône', pyramide: 'Pyramide', tore: 'Anneau', plaque: 'Plaque' }[id], build, params: { s: id === 'plaque' ? 1.2 : 0.6 }, ranges: { s: [0.05, 60] }, labels: { s: 'Taille' } })),
  // Lumières
  { id: 'spot', cat: 'Lumières', name: 'Spot', build: spot, params: { angle: 0.5 }, ranges: { angle: [0.15, 1.2] }, labels: { angle: 'Faisceau' } },
  { id: 'neon', cat: 'Lumières', name: 'Néon', build: neon, params: { w: 1.2 }, ranges: { w: [0.3, 4] }, labels: { w: 'Longueur' } },
];

export const CATEGORIES = ['Modeler', 'Formes', 'Paysages', 'Villes', 'Personnages', 'Mode', 'Espaces', 'Mobilier', 'Lumières'];
export const getItem = id => CATALOG.find(c => c.id === id);
