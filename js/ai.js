// ALMIGO — le « cerveau » façon Verbe : on décrit ce qu'on veut, Claude le construit en 3D.
// La demande part directement de l'appareil vers l'API d'Anthropic, avec la clé personnelle de l'utilisateur.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MATERIALS } from './materials.js';

const KEY = 'atelier:cle-ia', MODEL = 'atelier:modele-ia';
export const MODELS = [['claude-sonnet-5-5', 'Rapide (Sonnet)'], ['claude-opus-5-5', 'Le plus précis (Opus)']];
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { } } };
export const brain = {
  get key() { return store.get(KEY) || ''; }, set key(v) { store.set(KEY, v.trim()); },
  get model() { return store.get(MODEL) || MODELS[0][0]; }, set model(v) { store.set(MODEL, v); },
};

const MAT_IDS = MATERIALS.map(m => m.id).join(', ');
function systemPrompt(library) {
  return `Tu es le moteur de création 3D de l'application « ALMIGO ». L'utilisateur décrit en français ce qu'il veut créer ou modifier. Tu réponds UNIQUEMENT par un objet JSON valide (aucun texte autour, pas de bloc de code).

Repère : unités en mètres, Y vers le haut, le sol est à y = 0. Un objet doit reposer sur le sol (son point le plus bas à y = 0) sauf demande contraire. Rotations en degrés. Dimensions réalistes (une chaise ≈ 0,45 m d'assise, une porte ≈ 2,1 m, une voiture ≈ 4,5 m).

Format :
{
  "nom": "nom court de la création",
  "message": "une phrase pour l'utilisateur (ce que tu as fait)",
  "parties": [ ... formes qui composent l'objet, coordonnées relatives au centre de l'objet au sol ... ],
  "elements": [ ... facultatif : éléments de la bibliothèque à poser dans la scène ... ]
}

Formes possibles dans "parties" (toutes acceptent "pos":[x,y,z], "rot":[rx,ry,rz], "matiere": id OU "couleur": "#rrggbb", et facultativement "rugosite" 0-1, "metal" 0-1, "emissif": "#rrggbb") :
- {"forme":"boite","taille":[largeur,hauteur,profondeur],"arrondi":0.01}
- {"forme":"sphere","rayon":r,"echelle":[sx,sy,sz]}
- {"forme":"cylindre","rayon_haut":r1,"rayon_bas":r2,"hauteur":h,"faces":32}
- {"forme":"cone","rayon":r,"hauteur":h}
- {"forme":"tore","rayon":R,"epaisseur":r,"arc":360}
- {"forme":"capsule","rayon":r,"longueur":l}
- {"forme":"profil","points":[[rayon,y],...]}  → surface de révolution autour de Y (vase, verre, bouteille, lampe, colonne tournée)
- {"forme":"extrusion","contour":[[x,y],...],"profondeur":d,"biseau":0.005} → contour dans le plan XY extrudé selon Z (centré en Z)
- {"forme":"tube","chemin":[[x,y,z],...],"rayon":r} → tube lisse le long d'une courbe (cadre de vélo, câble, accoudoir cintré)
- {"forme":"plan","taille":[largeur,profondeur]}

Matières disponibles (id) : ${MAT_IDS}. Utilise "couleur" pour une teinte unie (peinture, plastique, carrosserie).

Éléments de bibliothèque possibles dans "elements" (pour composer des scènes : paysages, villes, pièces) : {"type": id, "params": {...}, "pos":[x,y,z], "rotY": degrés}. Ids : ${library}.

Règles :
- Sois généreux en détails : 10 à 150 parties selon l'objet, proportions justes, pièces qui se touchent (pas d'éléments qui flottent).
- Pour une scène (« une place de village », « un jardin japonais »), combine "elements" et "parties".
- Si on te donne une création existante à modifier, renvoie la création COMPLÈTE modifiée (même format).
- Jamais de texte hors du JSON.`;
}

export async function askBrain({ prompt, current, library, signal }) {
  if (!brain.key) throw Object.assign(new Error('Aucune clé'), { code: 'nokey' });
  const content = current
    ? `Création actuelle à modifier :\n${JSON.stringify(current)}\n\nModification demandée : ${prompt}`
    : `Crée : ${prompt}`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', 'x-api-key': brain.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: brain.model, max_tokens: 12000, system: systemPrompt(library), messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) {
    let msg = 'Erreur ' + res.status;
    try { const j = await res.json(); msg = j.error?.message || msg; } catch { }
    if (res.status === 401) msg = 'Clé refusée : vérifie ta clé API.';
    if (res.status === 429) msg = 'Trop de demandes d’un coup, réessaie dans un instant.';
    if (res.status === 400 && /credit/i.test(msg)) msg = 'Crédit épuisé sur ton compte Anthropic.';
    throw new Error(msg);
  }
  const data = await res.json();
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  return parseSpec(text);
}

export function parseSpec(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('Réponse illisible, reformule ta demande.');
  const spec = JSON.parse(text.slice(a, b + 1));
  if (!Array.isArray(spec.parties)) spec.parties = [];
  if (!Array.isArray(spec.elements)) spec.elements = [];
  spec.parties = spec.parties.slice(0, 500);
  return spec;
}

/* ---------- construction de l'objet à partir de la description ---------- */
const deg = v => (v || 0) * Math.PI / 180;
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
const V2 = a => a.map(p => new THREE.Vector2(num(p[0], 0), num(p[1], 0)));

function geometryOf(p) {
  switch (p.forme) {
    case 'boite': { const [w, h, d] = (p.taille || [1, 1, 1]).map(v => Math.max(0.001, num(v, 1))); const r = num(p.arrondi, 0); return r > 0 ? new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d); }
    case 'sphere': { const g = new THREE.SphereGeometry(Math.max(0.001, num(p.rayon, 0.5)), 48, 32); if (p.echelle) g.scale(...p.echelle.map(v => num(v, 1))); return g; }
    case 'cylindre': return new THREE.CylinderGeometry(Math.max(0, num(p.rayon_haut, num(p.rayon, 0.5))), Math.max(0, num(p.rayon_bas, num(p.rayon, 0.5))), Math.max(0.001, num(p.hauteur, 1)), Math.min(96, Math.max(3, num(p.faces, 40))));
    case 'cone': return new THREE.ConeGeometry(Math.max(0.001, num(p.rayon, 0.5)), Math.max(0.001, num(p.hauteur, 1)), 48);
    case 'tore': return new THREE.TorusGeometry(Math.max(0.001, num(p.rayon, 0.5)), Math.max(0.001, num(p.epaisseur, 0.1)), 24, 96, deg(num(p.arc, 360)));
    case 'capsule': return new THREE.CapsuleGeometry(Math.max(0.001, num(p.rayon, 0.2)), Math.max(0, num(p.longueur, 0.5)), 8, 24);
    case 'profil': { const pts = V2(p.points || []); if (pts.length < 2) return null; return new THREE.LatheGeometry(pts, 64); }
    case 'extrusion': {
      const c = p.contour || []; if (c.length < 3) return null;
      const sh = new THREE.Shape(V2(c)); const d = Math.max(0.001, num(p.profondeur, 0.1)), b = Math.max(0, num(p.biseau, 0));
      const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: b > 0, bevelSize: b, bevelThickness: b, bevelSegments: 3, curveSegments: 24 });
      g.translate(0, 0, -d / 2); return g;
    }
    case 'tube': {
      const pts = (p.chemin || []).map(q => new THREE.Vector3(num(q[0], 0), num(q[1], 0), num(q[2], 0))); if (pts.length < 2) return null;
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.min(400, pts.length * 24), Math.max(0.001, num(p.rayon, 0.02)), 16, false);
    }
    case 'plan': { const [w, d] = (p.taille || [1, 1]).map(v => num(v, 1)); const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); return g; }
  }
  return null;
}

export function buildSpec(spec, part) {
  const g = new THREE.Group();
  for (const p of spec.parties || []) {
    let geo; try { geo = geometryOf(p); } catch { geo = null; }
    if (!geo) continue;
    const m = part(geo, 'forme');
    if (p.pos) m.position.set(...p.pos.map(v => num(v, 0)));
    if (p.rot) m.rotation.set(deg(p.rot[0]), deg(p.rot[1]), deg(p.rot[2]));
    if (p.couleur) m.userData.fixedMat = String(p.couleur).startsWith('#') ? p.couleur : '#' + p.couleur;
    else if (p.matiere) m.userData.fixedMat = p.matiere;
    if (p.rugosite != null || p.metal != null || p.emissif) m.userData.look = { r: p.rugosite, m: p.metal, e: p.emissif };
    if (p.forme === 'plan' || p.forme === 'profil' || p.forme === 'tube') m.userData.double = true;
    g.add(m);
  }
  // l'objet repose sur le sol
  const b = new THREE.Box3().setFromObject(g);
  if (!b.isEmpty() && Math.abs(b.min.y) > 0.001) g.children.forEach(c => c.position.y -= b.min.y);
  return g;
}
