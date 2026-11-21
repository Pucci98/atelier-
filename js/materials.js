// Atelier — bibliothèque de matières procédurales (générées sur l'appareil, aucune image téléchargée)
import * as THREE from 'three';
import { generate } from './texgen.js';

/* ---------- catalogue ---------- */
// cat : sol, mur, mobilier, textile, metal, verre
export const MATERIALS = [
  { id: 'argile', name: 'Argile blanche', cat: 'Argile', desc: 'Terre à modeler blanche, mate, légèrement marquée par les doigts.', tex: ['clay', 0xEEEAE3], rough: 0.88, world: 0.8 },
  { id: 'argile-grise', name: 'Argile grise', cat: 'Argile', desc: 'Grès gris brut, l’aspect d’une sculpture en cours.', tex: ['clay', 0x9A958D], rough: 0.9, world: 0.8 },
  { id: 'terre-cuite', name: 'Terre cuite', cat: 'Argile', desc: 'Argile rouge cuite, chaude et mate.', tex: ['clay', 0xB0654A], rough: 0.85, world: 0.8 },
  { id: 'bronze', name: 'Bronze patiné', cat: 'Argile', desc: 'Bronze de fonderie, patine sombre, reflets dorés.', tex: ['brushed', 0x6E5236], rough: 0.38, metal: 1, world: 0.8 },
  { id: 'chene', name: 'Chêne clair', cat: 'Bois', desc: 'Parquet chêne huilé, lames larges, veinage naturel.', tex: ['wood', 0xD2B08A, 0xA37E58], rough: 0.62, world: 2.2 },
  { id: 'noyer', name: 'Noyer', cat: 'Bois', desc: 'Noyer américain, chaud et profond, finition satinée.', tex: ['wood', 0x7B5338, 0x4A2E1D, { grain: 6 }], rough: 0.5, world: 2.2 },
  { id: 'chene-fume', name: 'Chêne fumé', cat: 'Bois', desc: 'Chêne fumé brossé, tonalité brun-gris contemporaine.', tex: ['wood', 0x75665A, 0x4E4239, { grain: 8 }], rough: 0.66, world: 2.2 },
  { id: 'bois-brule', name: 'Bois brûlé', cat: 'Bois', desc: 'Shou sugi ban : bois carbonisé, texture écaillée, noir profond.', tex: ['charred'], rough: 0.85, world: 1.5 },
  { id: 'beton-cire', name: 'Béton ciré', cat: 'Minéral', desc: 'Surface continue, lissée à la main, légèrement nuancée.', tex: ['concrete', 0xA8A39B, { spots: false, polish: true }], rough: 0.38, world: 3 },
  { id: 'beton-brut', name: 'Béton brut', cat: 'Minéral', desc: 'Béton de coffrage avec bullage, esprit brutaliste.', tex: ['concrete', 0x8F8C86], rough: 0.9, world: 2.5 },
  { id: 'marbre-blanc', name: 'Marbre Carrara', cat: 'Minéral', desc: 'Blanc de Carrare, veines grises fines, poli.', tex: ['marble', 0xEDEBE6, 0x8D8F94], rough: 0.12, world: 1.6 },
  { id: 'marbre-noir', name: 'Nero Marquina', cat: 'Minéral', desc: 'Marbre noir veiné de blanc, très graphique.', tex: ['marble', 0x17171B, 0xE8E6E1, { sharp: 12 }], rough: 0.1, world: 1.6 },
  { id: 'travertin', name: 'Travertin', cat: 'Minéral', desc: 'Pierre beige alvéolée, strates douces, méditerranéen.', tex: ['stone', 0xD5C3A5], rough: 0.7, world: 1.8 },
  { id: 'terrazzo', name: 'Terrazzo', cat: 'Minéral', desc: 'Liant clair et éclats de marbre colorés.', tex: ['terrazzo', 0xE6E1D8, [0xB06A4F, 0x6E7C6A, 0x2A2A2A, 0xC9B79C, 0xF4F1EA]], rough: 0.3, world: 1.6 },
  { id: 'roche', name: 'Granit', cat: 'Minéral', desc: 'Roche grise grenue, naturelle.', tex: ['stone', 0x8A8782], rough: 0.85, world: 2 },
  { id: 'herbe', name: 'Herbe', cat: 'Nature', desc: 'Pelouse dense, quelques zones sèches.', tex: ['grass'], rough: 1, world: 4 },
  { id: 'sable', name: 'Sable', cat: 'Nature', desc: 'Sable fin et clair.', tex: ['concrete', 0xD8C6A2, { spots: false }], rough: 1, world: 3 },
  { id: 'asphalte', name: 'Asphalte', cat: 'Nature', desc: 'Enrobé routier gris anthracite.', tex: ['asphalt'], rough: 0.9, world: 4 },
  { id: 'brique', name: 'Brique', cat: 'Minéral', desc: 'Brique de terre cuite nuancée, joints chaux.', tex: ['brick', 0x9A4E35, 0xCFC6B8], rough: 0.85, world: 1.6 },
  { id: 'enduit', name: 'Enduit chaux', cat: 'Mur', desc: 'Enduit à la chaux taloché, mat, lumière douce.', tex: ['plaster', 0xEAE4D8], rough: 0.95, world: 3 },
  { id: 'enduit-terre', name: 'Enduit terre', cat: 'Mur', desc: 'Argile ocre rosée, chaleureux et mat.', tex: ['plaster', 0xC79B7E], rough: 0.95, world: 3 },
  { id: 'zellige', name: 'Zellige vert', cat: 'Mur', desc: 'Carreaux émaillés faits main, reflets irréguliers.', tex: ['tiles', 0x3F6B5C, 0xD9D3C7, { n: 8, vary: 0.18 }], rough: 0.08, world: 1.2 },
  { id: 'carreau-blanc', name: 'Carreau blanc', cat: 'Mur', desc: 'Faïence blanche brillante, joint fin.', tex: ['tiles', 0xF2F0EB, 0xBDB8AF, { n: 6, vary: 0.04 }], rough: 0.1, world: 1.2 },
  { id: 'lin', name: 'Lin naturel', cat: 'Textile', desc: 'Lin lavé, tissage visible, fibres irrégulières.', tex: ['weave', 0xCDBFA8], rough: 0.95, world: 0.6 },
  { id: 'laine-gris', name: 'Laine chinée', cat: 'Textile', desc: 'Laine bouillie gris chiné, toucher dense.', tex: ['weave', 0x76736E, { tight: 90, contrast: 0.18 }], rough: 1, world: 0.6 },
  { id: 'velours-vert', name: 'Velours bouteille', cat: 'Textile', desc: 'Velours côtelé vert profond, reflets satinés.', tex: ['weave', 0x234235, { tight: 60, contrast: 0.06 }], rough: 0.85, sheen: 1, sheenColor: 0x5E8C74, world: 0.6 },
  { id: 'velours-rouille', name: 'Velours rouille', cat: 'Textile', desc: 'Velours terracotta, chaud, lumineux sous la lumière rasante.', tex: ['weave', 0x8E4128, { tight: 60, contrast: 0.06 }], rough: 0.85, sheen: 1, sheenColor: 0xD07A55, world: 0.6 },
  { id: 'cuir-cognac', name: 'Cuir cognac', cat: 'Textile', desc: 'Cuir pleine fleur, patine naturelle.', tex: ['leather', 0x8B4A22], rough: 0.55, world: 0.8 },
  { id: 'cuir-noir', name: 'Cuir noir', cat: 'Textile', desc: 'Cuir noir grainé, élégant et sobre.', tex: ['leather', 0x1C1A19], rough: 0.5, world: 0.8 },
  { id: 'denim', name: 'Denim brut', cat: 'Textile', desc: 'Toile sergé indigo, effet brut.', tex: ['weave', 0x26344F, { tight: 160, contrast: 0.2 }], rough: 0.9, world: 0.5 },
  { id: 'cannage', name: 'Cannage', cat: 'Textile', desc: 'Rotin tressé, motif ajouré traditionnel.', tex: ['rattan', 0xC8A26B], rough: 0.7, world: 0.5 },
  { id: 'laiton', name: 'Laiton brossé', cat: 'Métal', desc: 'Laiton satiné, reflets dorés chauds.', tex: ['brushed', 0xC9A15A], rough: 0.32, metal: 1, world: 0.8 },
  { id: 'acier-noir', name: 'Acier noir', cat: 'Métal', desc: 'Acier thermolaqué noir mat, esprit atelier.', tex: ['brushed', 0x2A2A2C], rough: 0.55, metal: 0.8, world: 0.8 },
  { id: 'inox', name: 'Inox brossé', cat: 'Métal', desc: 'Acier inoxydable brossé, cuisine pro.', tex: ['brushed', 0xB8BABD], rough: 0.28, metal: 1, world: 0.8 },
  { id: 'cuivre', name: 'Cuivre', cat: 'Métal', desc: 'Cuivre poli, teinte rosée.', tex: ['brushed', 0xB8734A], rough: 0.25, metal: 1, world: 0.8 },
  { id: 'mannequin', name: 'Mannequin mat', cat: 'Corps', desc: 'Finition mate gris chaud, comme un mannequin de galerie.', tex: ['plaster', 0xC9C2B8], rough: 0.6, world: 2 },
  { id: 'mannequin-noir', name: 'Mannequin noir', cat: 'Corps', desc: 'Noir satiné, silhouette graphique.', tex: ['plaster', 0x222224], rough: 0.4, world: 2 },
  { id: 'platre', name: 'Plâtre sculpté', cat: 'Corps', desc: 'Plâtre blanc, rendu de maquette d’architecte.', tex: ['plaster', 0xF1EEE8], rough: 0.9, world: 2 },
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
  { id: 'atelier', name: 'Atelier blanc', desc: 'Tout en plâtre et argile blanche, comme une maquette d’atelier.', map: { sol: 'platre', mur: 'platre', mobilier: 'platre', textile: 'platre', metal: 'platre', corps: 'platre', vetement: 'platre', forme: 'argile', batiment: 'platre', toit: 'platre', trottoir: 'platre', route: 'argile-grise', herbe: 'platre', roche: 'argile', terrain: 'argile' } },
  { id: 'japandi', name: 'Japandi', desc: 'Chêne clair, lin, enduit chaux. Calme et lumineux.', map: { sol: 'chene', mur: 'enduit', mobilier: 'chene', textile: 'lin', metal: 'acier-noir', corps: 'mannequin', vetement: 'lin' } },
  { id: 'loft', name: 'Loft industriel', desc: 'Béton brut, acier noir, cuir cognac.', map: { sol: 'beton-cire', mur: 'brique', mobilier: 'acier-noir', textile: 'cuir-cognac', metal: 'acier-noir', corps: 'mannequin-noir', vetement: 'denim' } },
  { id: 'riviera', name: 'Riviera', desc: 'Travertin, laiton, velours rouille.', map: { sol: 'travertin', mur: 'enduit-terre', mobilier: 'noyer', textile: 'velours-rouille', metal: 'laiton', corps: 'mannequin', vetement: 'lin' } },
  { id: 'galerie', name: 'Galerie', desc: 'Béton ciré, murs blancs, inox. Neutre pour exposer.', map: { sol: 'beton-cire', mur: 'enduit', mobilier: 'marbre-blanc', textile: 'laine-gris', metal: 'inox', corps: 'platre', vetement: 'laine-gris' } },
  { id: 'nuit', name: 'Club privé', desc: 'Marbre noir, bois brûlé, velours bouteille, laiton.', map: { sol: 'marbre-noir', mur: 'bois-brule', mobilier: 'noyer', textile: 'velours-vert', metal: 'laiton', corps: 'mannequin-noir', vetement: 'velours-vert' } },
  { id: 'medina', name: 'Médina', desc: 'Terrazzo, zellige, cannage et cuivre.', map: { sol: 'terrazzo', mur: 'zellige', mobilier: 'chene-fume', textile: 'cannage', metal: 'cuivre', corps: 'mannequin', vetement: 'velours-rouille' } },
];

const cache = new Map();
const listeners = new Set();
// données de travail des matières, hors userData (que three.js recopie en JSON à chaque clonage)
const META = new WeakMap();
const meta = m => { let x = META.get(m); if (!x) META.set(m, x = {}); return x; };
export const readyOf = m => (m && META.get(m)?.ready) || null;
export const onTextureReady = f => listeners.add(f);

// fabrique de textures : un Worker en arrière-plan (repli sur le fil principal si indisponible)
let worker = null, wid = 0; const pending = new Map();
try {
  worker = new Worker(new URL('./texworker.js', import.meta.url), { type: 'module' });
  worker.onmessage = e => { const p = pending.get(e.data.id); pending.delete(e.data.id); p?.(e.data); };
  worker.onerror = () => { worker = null; for (const [, p] of pending) p(null); pending.clear(); };
} catch { worker = null; }
function texture(recipe) {
  const local = () => new Promise(res => setTimeout(() => res(generate(recipe[0], recipe.slice(1))), 0));
  if (!worker) return local();
  return new Promise(res => { const id = ++wid; pending.set(id, d => res(d || generate(recipe[0], recipe.slice(1)))); worker.postMessage({ id, recipe }); });
}
export function getMaterialDef(id) { return MATERIALS.find(m => m.id === id) || (id === 'terrain' ? { id, name: 'Terrain naturel', cat: 'Nature', desc: 'Couleurs selon l’altitude et la pente.' } : null); }

// Matériau partagé par id (les textures sont générées une seule fois)
export function material(id) {
  if (cache.has(id)) return cache.get(id);
  let m;
  if (id === 'terrain') {
    m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    m.userData.world = 1;
  } else if (id && id.startsWith('#')) {
    m = new THREE.MeshStandardMaterial({ color: new THREE.Color(id), roughness: 0.85 });
  } else {
    const d = getMaterialDef(id) || getMaterialDef('enduit');
    if (d.glass) {
      m = new THREE.MeshPhysicalMaterial({ color: d.glass.color, roughness: d.glass.rough, metalness: 0, transmission: 1, thickness: 0.02, ior: 1.5, transparent: true, opacity: 1 });
    } else {
      // matière posée tout de suite avec sa teinte de base, la texture arrive dès qu'elle est prête (sans figer l'écran)
      const P = d.sheen ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
      const base = typeof d.tex[1] === 'number' ? d.tex[1] : 0x8a8a84;
      m = new P({ color: base, roughness: d.rough ?? 0.7, metalness: d.metal ?? 0 });
      if (d.cat === 'Textile') m.side = THREE.DoubleSide;
      if (d.sheen) { m.sheen = d.sheen; m.sheenColor = new THREE.Color(d.sheenColor); m.sheenRoughness = 0.5; }
      meta(m).ready = texture(d.tex).then(t => {
        const mk = (data, srgb) => {
          const c = document.createElement('canvas'); c.width = c.height = t.size;
          c.getContext('2d').putImageData(new ImageData(data, t.size, t.size), 0, 0);
          const tx = new THREE.CanvasTexture(c); if (srgb) tx.colorSpace = THREE.SRGBColorSpace;
          tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.anisotropy = 8;
          const rep = 1 / (d.world || 1); tx.repeat.set(rep, rep);
          return tx;
        };
        const map = mk(t.color, true), bump = mk(t.bump, false);
        for (const mm of [m, ...(meta(m).clones || [])]) {
          mm.map = map; mm.bumpMap = bump; mm.bumpScale = 1.2; mm.color.set(0xffffff); mm.needsUpdate = true;
        }
        meta(m).canvas = map.image; meta(m).clones = null;
        listeners.forEach(f => f(id));
        return m;
      });
    }
    m.userData.world = d.world || 1;
  }
  m.userData.id = id;
  m.name = id;
  cache.set(id, m);
  return m;
}

// copie d'une matière qui suivra l'arrivée de sa texture
export function cloneMaterial(m) {
  const c = m.clone();
  const x = META.get(m);
  if (!m.map && x?.ready) { (x.clones ||= []).push(c); meta(c).ready = x.ready; }
  return c;
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
    await (readyOf(material(id)) || Promise.resolve());
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
  return META.get(material(id))?.canvas?.toDataURL('image/jpeg', 0.86) || null;
}
