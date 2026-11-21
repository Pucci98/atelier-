// Atelier — génération des textures de matières (sans DOM : utilisable dans un Worker, donc sans figer l'écran)

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

// Génère deux images : couleur (RVB) et relief (niveaux de gris)
function paint(size, fn) {
  const color = new Uint8ClampedArray(size * size * 4), bump = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const [r, g, bl, h] = fn(x / size, y / size, x, y);
    const i = (y * size + x) * 4;
    color[i] = clamp(r); color[i + 1] = clamp(g); color[i + 2] = clamp(bl); color[i + 3] = 255;
    const hv = clamp((h ?? 0.5) * 255);
    bump[i] = bump[i + 1] = bump[i + 2] = hv; bump[i + 3] = 255;
  }
  return { size, color, bump };
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

function clay(base) {
  const A = hex(base);
  return paint(512, (u, v) => {
    const n = N.fbm(u * 6, v * 6, 5, 6) * 0.05, prints = N2.noise(u * 40, v * 40, 40) * 0.02;
    const k = 1 + n + prints;
    return [A[0] * k, A[1] * k, A[2] * k, 0.5 + n * 3 + prints * 4];
  });
}
function grass() {
  return paint(512, (u, v) => {
    const n = N.fbm(u * 6, v * 6, 5, 6), blades = N2.noise(u * 220, v * 60, 256);
    const dry = N2.fbm(u * 2, v * 2, 3, 2) > 0.2 ? 0.25 : 0;
    const g = [62 + dry * 120, 92 + dry * 60, 44 + dry * 20];
    const k = 1 + n * 0.25 + blades * 0.12;
    return [g[0] * k, g[1] * k, g[2] * k, 0.5 + blades * 0.4];
  });
}
function asphalt() {
  return paint(512, (u, v) => {
    const n = N.fbm(u * 8, v * 8, 5, 8) * 0.12, grain = N2.noise(u * 300, v * 300, 256) * 0.1;
    const k = 52 * (1 + n + grain);
    return [k, k, k * 1.02, 0.5 + grain * 2];
  });
}


const RECIPES = { wood, concrete, marble, brick, terrazzo, tiles, weave, leather, brushed, plaster, charred, stone, rattan, clay, grass, asphalt };
export function generate(name, args) { return RECIPES[name](...args); }
