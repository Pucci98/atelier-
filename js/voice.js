// Atelier — commandes vocales en français
import { CATALOG } from './library.js';
import { MATERIALS, PAINTS, PALETTES } from './materials.js';

const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'\-]/g, ' ').replace(/[^a-z0-9,. -]/g, ' ').replace(/\s+/g, ' ').trim();
const NUM = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, quinze: 15, vingt: 20, trente: 30 };

// synonymes → identifiant de la bibliothèque
const ITEM_WORDS = [
  ['piece', ['piece', 'salle', 'chambre vide', 'salon vide', 'espace', 'appartement', 'maison', 'studio']],
  ['mur', ['mur', 'cloison', 'paroi']], ['sol', ['sol', 'plancher', 'dalle']], ['baie', ['baie', 'fenetre', 'verriere', 'vitre']],
  ['porte', ['porte']], ['escalier', ['escalier', 'marches']], ['colonne', ['colonne', 'pilier', 'poteau']], ['arche', ['arche', 'arcade', 'voute']],
  ['estrade', ['estrade', 'scene', 'podium']], ['cimaise', ['cimaise', 'panneau', 'expo']],
  ['canape', ['canape', 'sofa']], ['fauteuil', ['fauteuil']], ['table-ronde', ['table ronde', 'gueridon']], ['table', ['table', 'bureau']],
  ['chaise', ['chaise']], ['tabouret', ['tabouret']], ['lit', ['lit']], ['etagere', ['etagere', 'bibliotheque', 'rayonnage']], ['ilot', ['ilot', 'cuisine', 'comptoir', 'bar']],
  ['tapis', ['tapis']], ['lampe', ['lampadaire', 'lampe']], ['suspension', ['suspension', 'lustre', 'plafonnier']], ['miroir', ['miroir']], ['plante', ['plante', 'arbre', 'vegetal']],
  ['groupe', ['groupe', 'foule', 'des gens', 'plusieurs personnes']],
  ['perso-assis', ['assis', 'personne assise']], ['perso-marche', ['qui marche', 'marcheur', 'en marche']], ['perso-pense', ['pensif', 'qui pense']], ['perso-presente', ['qui presente', 'presentateur', 'guide']],
  ['perso-debout', ['personnage', 'personne', 'homme', 'femme', 'mannequin', 'silhouette', 'humain', 'figurant', 'modele']],
  ['buste', ['buste', 'mannequin couture', 'mannequin de couture']], ['portant', ['portant', 'penderie', 'rack']],
  ['robe', ['robe']], ['jupe', ['jupe']], ['haut', ['haut', 't shirt', 'tshirt', 'tee shirt', 'chemise', 'top', 'pull']], ['manteau', ['manteau', 'veste', 'trench', 'blouson', 'parka']], ['pantalon', ['pantalon', 'jean', 'jogging']],
  ['cube', ['cube', 'boite', 'bloc']], ['sphere', ['sphere', 'boule', 'balle']], ['cylindre', ['cylindre', 'tube']], ['cone', ['cone']], ['pyramide', ['pyramide']], ['tore', ['anneau', 'tore', 'donut']], ['plaque', ['plaque', 'plateau']],
  ['spot', ['spot', 'projecteur']], ['neon', ['neon', 'neons', 'bandeau lumineux']],
];

const MAT_WORDS = MATERIALS.map(m => [m.id, [norm(m.name), ...({ 'chene': ['chene', 'bois clair', 'parquet', 'bois'], 'noyer': ['noyer', 'bois fonce'], 'beton-cire': ['beton cire', 'beton'], 'beton-brut': ['beton brut', 'brutaliste'], 'marbre-blanc': ['marbre blanc', 'carrara', 'marbre'], 'marbre-noir': ['marbre noir', 'marquina'], 'brique': ['brique', 'briques'], 'enduit': ['enduit', 'chaux', 'platre mur'], 'zellige': ['zellige'], 'carreau-blanc': ['carrelage', 'faience'], 'lin': ['lin'], 'laine-gris': ['laine'], 'velours-vert': ['velours vert', 'velours'], 'velours-rouille': ['velours rouille', 'velours orange'], 'cuir-cognac': ['cuir'], 'cuir-noir': ['cuir noir'], 'denim': ['denim', 'jean brut', 'toile de jean'], 'laiton': ['laiton', 'or', 'dore'], 'acier-noir': ['acier', 'metal noir', 'fer'], 'inox': ['inox', 'metal', 'chrome'], 'cuivre': ['cuivre'], 'verre': ['verre'], 'verre-fume': ['verre fume'], 'verre-depoli': ['verre depoli', 'verre sable'], 'travertin': ['travertin', 'pierre'], 'terrazzo': ['terrazzo', 'granito'], 'bois-brule': ['bois brule', 'bois noir'], 'cannage': ['cannage', 'rotin'] }[m.id] || [])]]);

const COLOR_WORDS = [...PAINTS.map(([n, c]) => [c, [norm(n)]]),
  [0xB03A2E, ['rouge']], [0x2C4A7A, ['bleu']], [0x3D6B45, ['vert']], [0xE0B83C, ['jaune']], [0xD9772F, ['orange']], [0x6B4C8A, ['violet']], [0xD99AA8, ['rose']], [0x8A6A4C, ['marron']], [0xF4F2EE, ['blanc']], [0x7F7F7F, ['gris']], [0x111111, ['noir']], [0xC9A15A, ['dore']]];

const ROLE_WORDS = [['sol', ['sol', 'le sol', 'parquet', 'plancher']], ['mur', ['mur', 'murs']], ['textile', ['tissu', 'coussin', 'assise', 'textile']], ['metal', ['pied', 'pieds', 'structure', 'metal']], ['vetement', ['vetement', 'tenue']], ['corps', ['corps', 'peau']]];

function findLongest(t, table) {
  let best = null, len = 0;
  for (const [id, words] of table) for (const w of words) {
    const re = new RegExp(`(^| )${w.replace(/ /g, ' ')}( |$|s )`);
    if (w.length > len && re.test(t + ' ')) { best = id; len = w.length; }
  }
  return best;
}

function numbers(t) {
  const out = [];
  for (const tok of t.replace(/,/g, '.').split(' ')) {
    if (/^\d+(\.\d+)?$/.test(tok)) out.push(parseFloat(tok));
    else if (NUM[tok] != null && tok !== 'un' && tok !== 'une') out.push(NUM[tok]);
  }
  return out;
}

// Analyse une phrase et renvoie une liste d'actions
export function parseCommand(raw) {
  const t = norm(raw);
  if (!t) return [];
  const has = (...w) => w.some(x => new RegExp(`(^| )${x}( |$)`).test(t));
  if (has('annule', 'annuler', 'retour', 'defais')) return [{ do: 'undo' }];
  if (has('retablis', 'refais')) return [{ do: 'redo' }];
  if (has('supprime', 'efface', 'enleve', 'retire', 'jette') && !has('tout')) return [{ do: 'delete' }];
  if (has('efface tout', 'vide tout', 'nouveau projet', 'recommence')) return [{ do: 'clear' }];
  if (has('duplique', 'copie', 'clone', 'encore un', 'encore une')) return [{ do: 'duplicate' }];
  if (has('visite', 'visiter', 'promene', 'entre dans')) return [{ do: 'walk' }];
  if (has('vue d ensemble', 'recentre', 'vue globale', 'montre tout', 'cadre')) return [{ do: 'frame' }];
  if (has('exporte', 'envoie', 'partage')) return [{ do: 'export' }];
  if (has('photo', 'capture', 'rendu')) return [{ do: 'shot' }];

  for (const [k, words] of [['jour', ['jour', 'journee', 'midi', 'lumiere naturelle']], ['doree', ['golden', 'coucher de soleil', 'heure doree', 'fin de journee']], ['soir', ['soir', 'nuit', 'tamise']], ['studio', ['studio']], ['galerie', ['galerie', 'musee']]])
    if (has('ambiance', 'lumiere', 'eclairage', 'mode') && words.some(w => t.includes(w))) return [{ do: 'ambiance', value: k }];

  const pal = PALETTES.find(p => t.includes(norm(p.name)) || (p.id !== 'nuit' && t.includes(p.id)));
  if (pal && has('style', 'palette', 'ambiance', 'facon', 'esprit', 'en', 'tout en')) return [{ do: 'palette', value: pal.id }];

  const acts = [];
  const item = findLongest(t, ITEM_WORDS);
  const definite = item && new RegExp(`(^| )(le|la|les|l|du|des murs|ce|cette) (${(ITEM_WORDS.find(x => x[0] === item) || [0, []])[1].join('|')})`).test(t) && (findLongest(t, MAT_WORDS) || findLongest(t, COLOR_WORDS) != null);
  const creating = !definite && has('habille', 'habiller', 'cree', 'creer', 'ajoute', 'ajouter', 'mets', 'met', 'place', 'pose', 'construis', 'fais', 'fait', 'dessine', 'genere', 'imagine', 'installe', 'il me faut', 'je veux', 'donne') || /^(un|une|des|deux|trois|quatre|cinq|six|sept|huit|\d+) /.test(t);
  if (item && creating) {
    const def = CATALOG.find(c => c.id === item);
    let count = 1; const m = t.match(/^(?:\S+ )?(deux|trois|quatre|cinq|six|sept|huit|\d+) /); if (m) { const n = NUM[m[1]] ?? parseInt(m[1]); if (n > 1 && n <= 12 && item !== 'escalier') count = n; }
    const nums = numbers(t); if (count > 1) nums.shift();
    const params = {};
    if (def && nums.length) {
      const keys = Object.keys(def.ranges || {});
      if (item === 'piece' || item === 'sol' || item === 'estrade') { if (nums[0]) params.w = nums[0]; if (nums[1]) params.d = nums[1]; if (nums[2]) params.h = nums[2]; if (/m2|metres? carres?/.test(t) && nums.length === 1) { const s = Math.sqrt(nums[0]); params.w = +(s * 1.25).toFixed(2); params.d = +(nums[0] / params.w).toFixed(2); } }
      else if (item === 'escalier') params.n = nums[0];
      else if (item === 'canape') params.places = nums[0] <= 5 ? nums[0] : 3;
      else if (keys[0]) params[keys[0]] = nums[0];
      for (const k of Object.keys(params)) { const r = def.ranges?.[k]; if (r) params[k] = Math.min(r[1], Math.max(r[0], params[k])); }
    }
    acts.push({ do: 'add', value: item, params, count });
  }

  const mat = findLongest(t, MAT_WORDS);
  // « mets le mur en brique » : rôle désigné par le nom de l'élément
  const itemRole = definite ? ({ mur: 'mur', sol: 'sol', piece: 'mur' })[item] : null;
  const col = findLongest(t, COLOR_WORDS);
  const role = findLongest(t, ROLE_WORDS);
  if (mat && (has('en', 'matiere', 'materiau', 'texture', 'finition', 'habille', 'recouvre', 'passe', 'mets du', 'mets le') || acts.length)) acts.push({ do: 'material', value: mat, role: role || itemRole });
  else if (col != null && (has('couleur', 'peins', 'peint', 'peinture', 'en', 'passe', 'teinte') || acts.length)) acts.push({ do: 'material', value: '#' + col.toString(16).padStart(6, '0'), role: role || itemRole });

  if (!acts.length) {
    if (has('plus grand', 'agrandis', 'grossis', 'plus gros', 'augmente')) acts.push({ do: 'scale', value: 1.25 });
    else if (has('plus petit', 'reduis', 'retrecis', 'diminue')) acts.push({ do: 'scale', value: 0.8 });
    else if (has('tourne', 'pivote', 'rotation')) acts.push({ do: 'rotate', value: has('gauche') ? 1 : -1 });
    else if (has('monte', 'leve', 'souleve')) acts.push({ do: 'lift', value: 0.1 });
    else if (has('descends', 'baisse', 'abaisse')) acts.push({ do: 'lift', value: -0.1 });
    else if (has('avance', 'rapproche')) acts.push({ do: 'nudge', value: [0, 0.3] });
    else if (has('recule', 'eloigne')) acts.push({ do: 'nudge', value: [0, -0.3] });
    else if (has('a gauche')) acts.push({ do: 'nudge', value: [-0.3, 0] });
    else if (has('a droite')) acts.push({ do: 'nudge', value: [0.3, 0] });
    else if (has('propose', 'suggere', 'idee', 'inspire')) acts.push({ do: 'suggest' });
  }
  return acts;
}

export class Voice {
  constructor(onText, onState) {
    this.onText = onText; this.onState = onState;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = !!SR; this.on = false;
    if (!SR) return;
    const r = this.rec = new SR();
    r.lang = 'fr-FR'; r.interimResults = true; r.continuous = true; r.maxAlternatives = 1;
    r.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        this.onText(res[0].transcript, res.isFinal);
      }
    };
    r.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { this.on = false; this.onState(false, 'Micro refusé : autorise-le dans les réglages de Safari.'); } };
    r.onend = () => { if (this.on) { try { r.start(); } catch { } } else this.onState(false); };
  }
  start() { if (!this.rec) return false; this.on = true; try { this.rec.start(); } catch { } this.onState(true); return true; }
  stop() { this.on = false; try { this.rec?.stop(); } catch { } this.onState(false); }
}
