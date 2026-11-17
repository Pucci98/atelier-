// Atelier — bibliothèque de matières procédurales (générées sur l'appareil, aucune image téléchargée)
import * as THREE from 'three';

/* ---------- bruit ---------- */
function makeNoise(seed = 1) {
  const p = new Uint8Array(512);
  let s = seed * 9973 + 17;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h, x, y) => ((h & 1) ? -x : x) + ((h & 2) ? -y : y);
  // bruit de Perlin 2D périodique (période P) pour des textures sans couture
  function noise(x, y, P = 256) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X0 = ((xi % P) + P) % P & 255, Y0 = ((yi % P) + P) % P & 255;
    const X1 = (((xi + 1) % P) + P) % P & 255, Y1 = (((yi + 1) % P) + P) % P & 255;
    const u = fade(xf), v = fade(yf);
    const aa = p[p[X0] + Y0], ab = p[p[X0] + Y1], ba = p[p[X1] + Y0], bb = p[p[X1] + Y1];
    const x1 = grad(aa, xf, yf) + u * (grad(ba, xf - 1, yf) - grad(aa, xf, yf));
    const x2 = grad(ab, xf, yf - 1) + u * (grad(bb, xf - 1, yf - 1) - grad(ab, xf, yf - 1));
    return x1 + v * (x2 - x1); // ~[-1,1]
  }
  function fbm(x, y, oct = 5, P = 8) {
    let a = 0, amp = 0.5, f = 1;
    for (let o = 0; o < oct; o++) { a += amp * noise(x * f, y * f, P * f); f *= 2; amp *= 0.5; }
    return a;
  }
  return { noise, fbm, rnd };
}

const clamp = (v, a = 0, b = 255) => v < a ? a : v > b ? b : v;
const hex = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Génère deux canvas : couleur et relief (niveau de gris)
function paint(size, fn) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const b = document.createElement('canvas'); b.width = b.height = size;
  const cx = c.getContext('2d'), bx = b.getContext('2d');
  const ci = cx.createImageData(size, size), bi = bx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const [r, g, bl, h] = fn(x / size, y / size, x, y);
    const i = (y * size + x) * 4;
    ci.data[i] = clamp(r); ci.data[i + 1] = clamp(g); ci.data[i + 2] = clamp(bl); ci.data[i + 3] = 255;
    const hv = clamp((h ?? 0.5) * 255);
    bi.data[i] = bi.data[i + 1] = bi.data[i + 2] = hv; bi.data[i + 3] = 255;
  }
  cx.putImageData(ci, 0, 0); bx.putImageData(bi, 0, 0);
  return { color: c, bump: b };
}

/* ---------- recettes ---------- */
const N = makeNoise(7);
const N2 = makeNoise(31);

function wood(base, dark, { planks = 12, grain = 7, size = 1024, contrast = 0.55 } = {}) {
  const A = hex(base), B = hex(dark);
  const R = makeNoise(11);
  const offs = Array.from({ length: planks }, () => R.rnd());
  const tint = Array.from({ length: planks }, () => (R.rnd() - 0.5) * 0.16);
  return paint(size, (u, v) => {
    const plank = Math.floor(u * planks), pu = u * planks - plank;
    // longueur de lame : 2 joints par tuile, décalés d'une lame à l'autre
    const lv = (v * 2 + offs[plank]) % 1, seg = Math.floor(v * 2 + offs[plank]);
    const seed = plank * 7.3 + seg * 3.1;
    const warp = N.fbm(pu * 1.5 + seed, v * 1.2, 4, 8) * 1.6;
    const lines = Math.sin((pu * grain + warp + seed) * Math.PI * 2);
    const ring = Math.pow(lines * 0.5 + 0.5, 3);
    const fibre = N2.noise(pu * 160 + seed * 10, v * 6, 256) * 0.5 + 0.5;
    const knot = Math.max(0, 1 - Math.hypot((pu - 0.5) * 3, (lv - offs[(plank + 3) % planks]) * 9)) * (offs[(plank + 5) % planks] > 0.7 ? 1 : 0);
    let t = ring * contrast + fibre * 0.18 + knot * 0.5;
    const edge = Math.min(pu, 1 - pu) < 0.012 || Math.min(lv, 1 - lv) < 0.004;
    const c = mix(A, B, clamp(t, 0, 1));
    const k = 1 + tint[plank] - (edge ? 0.35 : 0);
    return [c[0] * k, c[1] * k, c[2] * k, edge ? 0.15 : 0.55 + ring * 0.15 - fibre * 0.08];
  });
}

function concrete(base, { spots = true, polish = false } = {}) {
  const A = hex(base);
  return paint(512, (u, v, x, y) => {
    const n = N.fbm(u * 4, v * 4, 6, 4);
    const m = N2.fbm(u * 1.5, v * 1.5, 3, 2);
    let k = 1 + n * 0.22 + m * 0.18;
    let h = 0.5 + n * 0.25;
    if (spots) {
      const s = N2.noise(u * 90, v * 90, 90);
      if (s > 0.62) { k *= 0.72; h -= 0.35; }
    }
    if (polish) k = 1 + (k - 1) * 0.7;
    return [A[0] * k, A[1] * k, A[2] * k, h];
  });
}

function marble(base, vein, { sharp = 9 } = {}) {
  const A = hex(base), B = hex(vein);
  return paint(1024, (u, v) => {
    // veines par déformation de domaine : grandes ondulations + détail fin
    const wx = N.fbm(u * 2, v * 2, 5, 2), wy = N2.fbm(u * 2 + 5.2, v * 2 + 1.3, 5, 2);
    const t = N.fbm(u * 2 + wx * 0.9, v * 2 + wy * 0.9, 6, 2);
    const main = Math.pow(1 - Math.min(1, Math.abs(t) * 9), sharp);
    const t2 = N2.fbm(u * 4 + wy * 1.5, v * 4 + wx * 1.5, 5, 4);
    const fine = Math.pow(1 - Math.min(1, Math.abs(t2) * 14), 14) * 0.45;
    const cloud = N2.fbm(u * 2, v * 2, 4, 2) * 0.07;
    const c = mix(A, B, clamp(main + fine, 0, 1));
    return [c[0] * (1 + cloud), c[1] * (1 + cloud), c[2] * (1 + cloud), 0.5];
  });
}

function brick(base, mortar) {
  const A = hex(base), M = hex(mortar);
  const rows = 8, cols = 4;
  return paint(512, (u, v) => {
    const r = Math.floor(v * rows);
    const uu = u * cols + (r % 2) * 0.5;
    const c = Math.floor(uu);
    const fu = uu - c, fv = v * rows - r;
    const joint = fu < 0.035 || fu > 0.965 || fv < 0.07 || fv > 0.93;
    if (joint) { const n = N.noise(u * 200, v * 200) * 12; return [M[0] + n, M[1] + n, M[2] + n, 0.15]; }
    const id = (r * 7 + c * 13) % 11 / 11;
    const n = N.fbm(u * 16, v * 16, 4, 16) * 0.25;
    const k = 0.82 + id * 0.3 + n;
    const burn = N2.noise(u * 6 + id * 9, v * 6, 256) > 0.35 ? 0.78 : 1;
    return [A[0] * k * burn, A[1] * k * burn, A[2] * k * burn, 0.75 + n];
  });
}

function terrazzo(base, chips) {
  const A = hex(base); const C = chips.map(hex);
  const pts = []; const R = makeNoise(5);
  for (let i = 0; i < 420; i++) pts.push([R.rnd(), R.rnd(), 0.004 + R.rnd() * 0.018, C[i % C.length], R.rnd() * 6]);
  return paint(512, (u, v) => {
    for (const [px, py, r, col, a] of pts) {
      let dx = Math.abs(u - px); dx = Math.min(dx, 1 - dx);
      let dy = Math.abs(v - py); dy = Math.min(dy, 1 - dy);
      const ca = Math.cos(a), sa = Math.sin(a);
      const rx = dx * ca - dy * sa, ry = dx * sa + dy * ca;
      if ((rx * rx) / (r * r) + (ry * ry) / (r * r * 0.45) < 1) return [...col, 0.5];
    }
    const n = N.fbm(u * 8, v * 8, 4, 8) * 10;
    return [A[0] + n, A[1] + n, A[2] + n, 0.5];
  });
}

function tiles(base, grout, { n = 6, vary = 0.12 } = {}) {
  const A = hex(base), G = hex(grout);
  return paint(512, (u, v) => {
    const fu = u * n % 1, fv = v * n % 1;
    const iu = Math.floor(u * n), iv = Math.floor(v * n);
    if (fu < 0.03 || fv < 0.03) return [...G, 0.1];
    const id = ((iu * 17 + iv * 31) % 13) / 13 - 0.5;
    const edge = Math.min(fu, fv, 1 - fu, 1 - fv);
    const glaze = N.noise(u * 30, v * 30) * 0.06 + (edge < 0.08 ? (0.08 - edge) * 1.2 : 0);
    const k = 1 + id * vary * 2 - glaze;
    return [A[0] * k, A[1] * k, A[2] * k, 0.6 - (edge < 0.06 ? 0.2 : 0)];
  });
}

function weave(base, { tight = 140, contrast = 0.12 } = {}) {
  const A = hex(base);
  return paint(512, (u, v) => {
    const a = Math.sin(u * tight * Math.PI), b = Math.sin(v * tight * Math.PI);
    const over = (Math.floor(u * tight) + Math.floor(v * tight)) % 2 ? a : b;
    const slub = N.noise(u * 6, v * 120, 256) * 0.08 + N2.noise(u * 120, v * 6, 256) * 0.08;
    const k = 1 + over * contrast + slub;
    return [A[0] * k, A[1] * k, A[2] * k, 0.5 + over * 0.3];
  });
}

function leather(base) {
  const A = hex(base);
  return paint(512, (u, v) => {
    const cell = N.noise(u * 70, v * 70, 70);
    const crease = Math.abs(N2.noise(u * 22, v * 22, 22));
    const k = 1 + cell * 0.08 - (crease < 0.04 ? 0.18 : 0) + N.fbm(u * 3, v * 3, 3, 3) * 0.15;
    return [A[0] * k, A[1] * k, A[2] * k, 0.5 + cell * 0.3 - (crease < 0.04 ? 0.3 : 0)];
  });
}

function brushed(base) {
  const A = hex(base);
  return paint(512, (u, v) => {
    const s = N.noise(u * 2, v * 260, 256) * 0.1 + N2.noise(u * 6, v * 600, 256) * 0.06;
    const k = 1 + s;
    return [A[0] * k, A[1] * k, A[2] * k, 0.5 + s * 2];
  });
}

function plaster(base) {
  const A = hex(base);
  return paint(512, (u, v) => {
    const n = N.fbm(u * 3, v * 3, 6, 3);
    const trowel = Math.abs(N2.fbm(u * 1.2 + n, v * 2.5, 3, 2)) * 0.12;
    const k = 1 + n * 0.08 - trowel;
    return [A[0] * k, A[1] * k, A[2] * k, 0.5 + n * 0.3];
  });
}

function charred() {
  return paint(512, (u, v) => {
    const cracks = Math.abs(N.noise(u * 9, v * 30, 9));
    const scale = N2.noise(u * 40, v * 14, 40);
    const k = 18 + scale * 10 + (cracks < 0.05 ? -10 : 0);
    const sheen = cracks > 0.3 ? 6 : 0;
    return [k + sheen, k + sheen, k + sheen + 2, 0.5 + scale * 0.4 - (cracks < 0.05 ? 0.4 : 0)];
  });
}

function stone(base) {
  const A = hex(base);
  return paint(1024, (u, v) => {
    const w = N.fbm(u * 3, v * 3, 5, 3);
    const strata = Math.sin((v * 9 + w * 0.8) * Math.PI * 2) * 0.5 + 0.5;
    const band = N2.fbm(u * 1, v * 6 + w, 4, 1) * 0.12;
    // alvéoles allongées dans le sens des strates
    const pit = N.noise(u * 26, (v + w * 0.05) * 150, 26);
    const hole = pit > 0.48 ? Math.min(1, (pit - 0.48) * 6) : 0;
    const k = 1 + strata * 0.06 + band - hole * 0.28 + N2.noise(u * 90, v * 90, 90) * 0.03;
    return [A[0] * k, A[1] * k * 0.99, A[2] * k * 0.97, 0.55 + strata * 0.1 - hole * 0.5];
  });
}

function rattan(base) {
  const A = hex(base);
  return paint(512, (u, v) => {
    const t = 24;
    const a = (u + v) * t, b = (u - v) * t;
    const fa = a - Math.floor(a), fb = b - Math.floor(b);
    const hole = Math.hypot((u * t * 1.414) % 1 - 0.5, (v * t * 1.414) % 1 - 0.5) < 0.12;
    const s = Math.sin(fa * Math.PI) * 0.5 + Math.sin(fb * Math.PI) * 0.5;
    const k = hole ? 0.25 : 0.75 + s * 0.35 + N.noise(u * 80, v * 80) * 0.05;
    return [A[0] * k, A[1] * k, A[2] * k, hole ? 0 : 0.4 + s * 0.4];
  });
}

/* ---------- catalogue ---------- */
// cat : sol, mur, mobilier, textile, metal, verre
export const MATERIALS = [
  { id: 'chene', name: 'Chêne clair', cat: 'Bois', desc: 'Parquet chêne huilé, lames larges, veinage naturel.', tex: () => wood(0xD2B08A, 0xA37E58), rough: 0.62, world: 2.2 },
  { id: 'noyer', name: 'Noyer', cat: 'Bois', desc: 'Noyer américain, chaud et profond, finition satinée.', tex: () => wood(0x7B5338, 0x4A2E1D, { grain: 6 }), rough: 0.5, world: 2.2 },
  { id: 'chene-fume', name: 'Chêne fumé', cat: 'Bois', desc: 'Chêne fumé brossé, tonalité brun-gris contemporaine.', tex: () => wood(0x75665A, 0x4E4239, { grain: 8 }), rough: 0.66, world: 2.2 },
  { id: 'bois-brule', name: 'Bois brûlé', cat: 'Bois', desc: 'Shou sugi ban : bois carbonisé, texture écaillée, noir profond.', tex: () => charred(), rough: 0.85, world: 1.5 },
  { id: 'beton-cire', name: 'Béton ciré', cat: 'Minéral', desc: 'Surface continue, lissée à la main, légèrement nuancée.', tex: () => concrete(0xA8A39B, { spots: false, polish: true }), rough: 0.38, world: 3 },
  { id: 'beton-brut', name: 'Béton brut', cat: 'Minéral', desc: 'Béton de coffrage avec bullage, esprit brutaliste.', tex: () => concrete(0x8F8C86), rough: 0.9, world: 2.5 },
  { id: 'marbre-blanc', name: 'Marbre Carrara', cat: 'Minéral', desc: 'Blanc de Carrare, veines grises fines, poli.', tex: () => marble(0xEDEBE6, 0x8D8F94), rough: 0.12, world: 1.6 },
  { id: 'marbre-noir', name: 'Nero Marquina', cat: 'Minéral', desc: 'Marbre noir veiné de blanc, très graphique.', tex: () => marble(0x17171B, 0xE8E6E1, { sharp: 12 }), rough: 0.1, world: 1.6 },
  { id: 'travertin', name: 'Travertin', cat: 'Minéral', desc: 'Pierre beige alvéolée, strates douces, méditerranéen.', tex: () => stone(0xD5C3A5), rough: 0.7, world: 1.8 },
  { id: 'terrazzo', name: 'Terrazzo', cat: 'Minéral', desc: 'Liant clair et éclats de marbre colorés.', tex: () => terrazzo(0xE6E1D8, [0xB06A4F, 0x6E7C6A, 0x2A2A2A, 0xC9B79C, 0xF4F1EA]), rough: 0.3, world: 1.6 },
  { id: 'brique', name: 'Brique', cat: 'Minéral', desc: 'Brique de terre cuite nuancée, joints chaux.', tex: () => brick(0x9A4E35, 0xCFC6B8), rough: 0.85, world: 1.6 },
  { id: 'enduit', name: 'Enduit chaux', cat: 'Mur', desc: 'Enduit à la chaux taloché, mat, lumière douce.', tex: () => plaster(0xEAE4D8), rough: 0.95, world: 3 },
  { id: 'enduit-terre', name: 'Enduit terre', cat: 'Mur', desc: 'Argile ocre rosée, chaleureux et mat.', tex: () => plaster(0xC79B7E), rough: 0.95, world: 3 },
  { id: 'zellige', name: 'Zellige vert', cat: 'Mur', desc: 'Carreaux émaillés faits main, reflets irréguliers.', tex: () => tiles(0x3F6B5C, 0xD9D3C7, { n: 8, vary: 0.18 }), rough: 0.08, world: 1.2 },
  { id: 'carreau-blanc', name: 'Carreau blanc', cat: 'Mur', desc: 'Faïence blanche brillante, joint fin.', tex: () => tiles(0xF2F0EB, 0xBDB8AF, { n: 6, vary: 0.04 }), rough: 0.1, world: 1.2 },
  { id: 'lin', name: 'Lin naturel', cat: 'Textile', desc: 'Lin lavé, tissage visible, fibres irrégulières.', tex: () => weave(0xCDBFA8), rough: 0.95, world: 0.6 },
  { id: 'laine-gris', name: 'Laine chinée', cat: 'Textile', desc: 'Laine bouillie gris chiné, toucher dense.', tex: () => weave(0x76736E, { tight: 90, contrast: 0.18 }), rough: 1, world: 0.6 },
  { id: 'velours-vert', name: 'Velours bouteille', cat: 'Textile', desc: 'Velours côtelé vert profond, reflets satinés.', tex: () => weave(0x234235, { tight: 60, contrast: 0.06 }), rough: 0.85, sheen: 1, sheenColor: 0x5E8C74, world: 0.6 },
  { id: 'velours-rouille', name: 'Velours rouille', cat: 'Textile', desc: 'Velours terracotta, chaud, lumineux sous la lumière rasante.', tex: () => weave(0x8E4128, { tight: 60, contrast: 0.06 }), rough: 0.85, sheen: 1, sheenColor: 0xD07A55, world: 0.6 },
  { id: 'cuir-cognac', name: 'Cuir cognac', cat: 'Textile', desc: 'Cuir pleine fleur, patine naturelle.', tex: () => leather(0x8B4A22), rough: 0.55, world: 0.8 },
  { id: 'cuir-noir', name: 'Cuir noir', cat: 'Textile', desc: 'Cuir noir grainé, élégant et sobre.', tex: () => leather(0x1C1A19), rough: 0.5, world: 0.8 },
  { id: 'denim', name: 'Denim brut', cat: 'Textile', desc: 'Toile sergé indigo, effet brut.', tex: () => weave(0x26344F, { tight: 160, contrast: 0.2 }), rough: 0.9, world: 0.5 },
  { id: 'cannage', name: 'Cannage', cat: 'Textile', desc: 'Rotin tressé, motif ajouré traditionnel.', tex: () => rattan(0xC8A26B), rough: 0.7, world: 0.5 },
  { id: 'laiton', name: 'Laiton brossé', cat: 'Métal', desc: 'Laiton satiné, reflets dorés chauds.', tex: () => brushed(0xC9A15A), rough: 0.32, metal: 1, world: 0.8 },
  { id: 'acier-noir', name: 'Acier noir', cat: 'Métal', desc: 'Acier thermolaqué noir mat, esprit atelier.', tex: () => brushed(0x2A2A2C), rough: 0.55, metal: 0.8, world: 0.8 },
  { id: 'inox', name: 'Inox brossé', cat: 'Métal', desc: 'Acier inoxydable brossé, cuisine pro.', tex: () => brushed(0xB8BABD), rough: 0.28, metal: 1, world: 0.8 },
  { id: 'cuivre', name: 'Cuivre', cat: 'Métal', desc: 'Cuivre poli, teinte rosée.', tex: () => brushed(0xB8734A), rough: 0.25, metal: 1, world: 0.8 },
  { id: 'mannequin', name: 'Mannequin mat', cat: 'Corps', desc: 'Finition mate gris chaud, comme un mannequin de galerie.', tex: () => plaster(0xC9C2B8), rough: 0.6, world: 2 },
  { id: 'mannequin-noir', name: 'Mannequin noir', cat: 'Corps', desc: 'Noir satiné, silhouette graphique.', tex: () => plaster(0x222224), rough: 0.4, world: 2 },
  { id: 'platre', name: 'Plâtre sculpté', cat: 'Corps', desc: 'Plâtre blanc, rendu de maquette d’architecte.', tex: () => plaster(0xF1EEE8), rough: 0.9, world: 2 },
  { id: 'verre', name: 'Verre clair', cat: 'Verre', desc: 'Verre extra-clair, transparent.', glass: { color: 0xffffff, rough: 0.02 } },
  { id: 'verre-fume', name: 'Verre fumé', cat: 'Verre', desc: 'Verre bronze fumé, ambiance feutrée.', glass: { color: 0x8a7a66, rough: 0.05 } },
  { id: 'verre-depoli', name: 'Verre dépoli', cat: 'Verre', desc: 'Verre sablé, lumière diffuse.', glass: { color: 0xffffff, rough: 0.45 } },
];

export const PAINTS = [
  ['Blanc cassé', 0xEEEAE2], ['Craie', 0xDCD6CB], ['Grège', 0xB8AC9A], ['Sable', 0xD9C2A0], ['Terracotta', 0xB5603F],
  ['Ocre', 0xC8963E], ['Olive', 0x6F7046], ['Sauge', 0x9AA690], ['Vert forêt', 0x2F4A3A], ['Bleu nuit', 0x1E2A3D],
  ['Bleu ardoise', 0x51606F], ['Bordeaux', 0x5C1F25], ['Rose poudré', 0xD8B2A5], ['Anthracite', 0x2E2F31], ['Noir', 0x111111],
];

export const PALETTES = [
  { id: 'japandi', name: 'Japandi', desc: 'Chêne clair, lin, enduit chaux. Calme et lumineux.', map: { sol: 'chene', mur: 'enduit', mobilier: 'chene', textile: 'lin', metal: 'acier-noir', corps: 'mannequin', vetement: 'lin' } },
  { id: 'loft', name: 'Loft industriel', desc: 'Béton brut, acier noir, cuir cognac.', map: { sol: 'beton-cire', mur: 'brique', mobilier: 'acier-noir', textile: 'cuir-cognac', metal: 'acier-noir', corps: 'mannequin-noir', vetement: 'denim' } },
  { id: 'riviera', name: 'Riviera', desc: 'Travertin, laiton, velours rouille.', map: { sol: 'travertin', mur: 'enduit-terre', mobilier: 'noyer', textile: 'velours-rouille', metal: 'laiton', corps: 'mannequin', vetement: 'lin' } },
  { id: 'galerie', name: 'Galerie', desc: 'Béton ciré, murs blancs, inox. Neutre pour exposer.', map: { sol: 'beton-cire', mur: 'enduit', mobilier: 'marbre-blanc', textile: 'laine-gris', metal: 'inox', corps: 'platre', vetement: 'laine-gris' } },
  { id: 'nuit', name: 'Club privé', desc: 'Marbre noir, bois brûlé, velours bouteille, laiton.', map: { sol: 'marbre-noir', mur: 'bois-brule', mobilier: 'noyer', textile: 'velours-vert', metal: 'laiton', corps: 'mannequin-noir', vetement: 'velours-vert' } },
  { id: 'medina', name: 'Médina', desc: 'Terrazzo, zellige, cannage et cuivre.', map: { sol: 'terrazzo', mur: 'zellige', mobilier: 'chene-fume', textile: 'cannage', metal: 'cuivre', corps: 'mannequin', vetement: 'velours-rouille' } },
];

const cache = new Map();
export function getMaterialDef(id) { return MATERIALS.find(m => m.id === id); }

// Matériau partagé par id (les textures sont générées une seule fois)
export function material(id) {
  if (cache.has(id)) return cache.get(id);
  let m;
  if (id && id.startsWith('#')) {
    m = new THREE.MeshStandardMaterial({ color: new THREE.Color(id), roughness: 0.85 });
  } else {
    const d = getMaterialDef(id) || getMaterialDef('enduit');
    if (d.glass) {
      m = new THREE.MeshPhysicalMaterial({ color: d.glass.color, roughness: d.glass.rough, metalness: 0, transmission: 1, thickness: 0.02, ior: 1.5, transparent: true, opacity: 1 });
    } else {
      const t = d.tex();
      const map = new THREE.CanvasTexture(t.color); map.colorSpace = THREE.SRGBColorSpace;
      const rep = 1 / (d.world || 1);
      map.repeat.set(rep, rep);
      const bump = new THREE.CanvasTexture(t.bump);
      bump.repeat.set(rep, rep);
      for (const tx of [map, bump]) { tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.anisotropy = 8; }
      const P = d.sheen ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
      m = new P({ map, bumpMap: bump, bumpScale: 1.2, roughness: d.rough ?? 0.7, metalness: d.metal ?? 0 });
      if (d.cat === 'Textile') m.side = THREE.DoubleSide;
      if (d.sheen) { m.sheen = d.sheen; m.sheenColor = new THREE.Color(d.sheenColor); m.sheenRoughness = 0.5; }
      m.userData.canvas = t.color;
    }
    m.userData.world = d.world || 1;
  }
  m.userData.id = id;
  m.name = id;
  cache.set(id, m);
  return m;
}

// Vignettes : sphère + plan éclairés, rendues une fois
export async function renderThumbs(list, size = 160, onEach) {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(size, size); r.setPixelRatio(1);
  r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
  const sc = new THREE.Scene();
  const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
  const pm = new THREE.PMREMGenerator(r);
  sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 10); cam.position.set(0, 0.35, 2.4); cam.lookAt(0, 0, 0);
  const key = new THREE.DirectionalLight(0xfff2e0, 2.2); key.position.set(-2, 3, 2); sc.add(key);
  const geo = new THREE.SphereGeometry(0.62, 64, 48);
  const mesh = new THREE.Mesh(geo); sc.add(mesh);
  const out = {};
  for (const id of list) {
    await new Promise(r => setTimeout(r, 0));
    const m = material(id).clone();
    if (m.map) { m.map = m.map.clone(); m.map.repeat.set(1.6, 1); m.map.needsUpdate = true; }
    if (m.bumpMap) { m.bumpMap = m.bumpMap.clone(); m.bumpMap.repeat.set(1.6, 1); m.bumpMap.needsUpdate = true; }
    if (m.transmission) { sc.background = new THREE.Color(0x3a3833); } else sc.background = null;
    mesh.material = m;
    r.render(sc, cam);
    out[id] = r.domElement.toDataURL('image/png');
    onEach?.(id, out[id]);
    m.dispose();
  }
  pm.dispose(); r.dispose(); r.forceContextLoss?.();
  return out;
}

// Grand aperçu « à plat » de la texture (pour bien voir la matière)
export function swatchDataURL(id) {
  const d = getMaterialDef(id);
  if (!d || d.glass) return null;
  return material(id).userData.canvas.toDataURL('image/jpeg', 0.86);
}
