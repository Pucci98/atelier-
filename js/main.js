// Atelier — application
import * as THREE from 'three';
import { Engine } from './engine.js';
import { CATALOG, CATEGORIES, getItem } from './library.js';
import { MATERIALS, PAINTS, PALETTES, renderThumbs, swatchDataURL, getMaterialDef, material, readyOf } from './materials.js';
import { setupInput, setupJoystick } from './input.js';
import { parseCommand, Voice } from './voice.js';
import { exportGLB, exportUSDZ, exportProject, exportCode, exportModule, screenshot, share, readProjectFile, autosave, restore } from './io.js';
import { hostDisplay, connectTo } from './link.js';
import { brain, askBrain, MODELS } from './ai.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

/* ---------- icônes ---------- */
const I = {
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  hand: '<path d="M18 11V6a2 2 0 0 0-4 0v1"/><path d="M14 10V4a2 2 0 0 0-4 0v2"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v5"/>',
  screen: '<rect x="2" y="4" width="14" height="10" rx="1.5"/><path d="M6 18h6M9 14v4"/><rect x="17" y="8" width="5" height="12" rx="1.2"/>',
  share: '<path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  menu: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  swatch: '<circle cx="8" cy="8" r="5"/><circle cx="16" cy="16" r="5"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  rotate: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/>',
  focus: '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/><circle cx="12" cy="12" r="3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  cube: '<path d="m12 2 9 5v10l-9 5-9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10"/>',
  ar: '<path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M8 12h8M12 8v8"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  photo: '<rect x="3" y="5" width="18" height="15" rx="2"/><circle cx="12" cy="12.5" r="3.5"/><path d="M8 5l1.5-2h5L16 5"/>',
  open: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  walk: '<circle cx="13" cy="4" r="2"/><path d="m10 22 2-7-3-3 1-5 4 3 3 1M7 12l-2 3M12 15l3 7"/>',
  frame: '<path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  bulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.9-.7-1.3-.7-2.2 0-.9.7-1.6 1.6-1.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/>',
  send: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  code: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  sculpt: '<path d="M12 3c4 0 6 3 6 6 0 4-3 5-3 8v2H9v-2c0-3-3-4-3-8 0-3 2-6 6-6z"/><path d="M9 21h6"/><path d="M10 9c1 1 3 1 4 0"/>',
  camera: '<path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/>',
};
const svg = k => `<svg viewBox="0 0 24 24">${I[k] || ''}</svg>`;
for (const [id, k] of [['btnUndo', 'undo'], ['btnRedo', 'redo'], ['btnHands', 'hand'], ['btnVoice', 'mic'], ['btnLink', 'screen'], ['btnShare', 'share'], ['btnMenu', 'menu'], ['selClose', 'close'], ['sheetClose', 'close'], ['cmdGo', 'send'], ['cmdClose', 'close']]) $('#' + id).innerHTML = svg(k);
$$('[data-i]').forEach(el => el.innerHTML = svg(el.dataset.i));

/* ---------- moteur ---------- */
let engine;
try { engine = new Engine($('#scene')); }
catch (e) {
  document.body.innerHTML = `<div style="position:fixed;inset:0;display:grid;place-content:center;text-align:center;padding:32px;gap:10px;font-family:var(--sans)"><div class="logo big" style="font-size:52px">Atelier</div><p style="color:rgba(239,234,225,.7);max-width:420px">Ce navigateur n’a pas accès à la 3D (WebGL désactivé ou indisponible). Ouvre Atelier dans Safari sur iPhone ou iPad, ou dans Chrome / Edge à jour sur ordinateur.</p></div>`;
  throw e;
}
window.atelier = engine; // pratique pour déboguer
window.atelierDire = t => runActions(parseCommand(t)); // tester une commande vocale au clavier
const isDisplay = location.hash === '#ecran' || new URLSearchParams(location.search).has('ecran');

const ROLE_LABEL = { forme: 'Matière', terrain: 'Terrain', roche: 'Roche', batiment: 'Façades', toit: 'Toit', trottoir: 'Trottoirs', route: 'Route', herbe: 'Herbe', marquage: 'Marquage', sol: 'Sol', mur: 'Murs', mobilier: 'Structure', textile: 'Tissu', metal: 'Métal', verre: 'Vitrage', corps: 'Corps', vetement: 'Vêtement' };
const DEFAULT_ROLE = { quartier: 'batiment', immeuble: 'batiment', maison: 'batiment', tour: 'verre', route: 'route', piece: 'mur', sol: 'sol', estrade: 'sol', canape: 'textile', fauteuil: 'textile', lit: 'textile', tapis: 'textile', baie: 'verre', buste: 'textile' };

/* ---------- toasts & bulles ---------- */
let toastT;
function toast(msg, ms = 2200) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms); }
function setStatus() {
  const s = []; if (hands?.active) s.push('mains'); if (voice?.on) s.push('voix'); if (link) s.push('écran lié');
  $('#status').textContent = s.join(' · ');
}

/* ---------- consentement ---------- */
const CONSENT = 'atelier:consent';
const hasConsent = () => { try { return localStorage.getItem(CONSENT) === '1'; } catch { return window._consent === true; } };
const setConsent = v => { window._consent = v; try { v ? localStorage.setItem(CONSENT, '1') : localStorage.removeItem(CONSENT); } catch { } };

/* ---------- modales ---------- */
function openModal(html, onMount) {
  $('#modalContent').innerHTML = html; $('#modal').hidden = false;
  $('#modalContent').querySelectorAll('[data-close]').forEach(b => b.onclick = closeModal);
  onMount?.($('#modalContent'));
}
function closeModal() { $('#modal').hidden = true; $('#modalContent').innerHTML = ''; }
$('#modal').addEventListener('pointerdown', e => { if (e.target.id === 'modal') closeModal(); });

function legalHTML(section) {
  const S = {
    mentions: `<h3>Mentions légales</h3><div class="legal"><p><b>Éditeur</b> : Annoh Aboidje Chris Fabius, particulier. Contact : annoh63@gmail.com</p><p><b>Directeur de la publication</b> : Annoh Aboidje Chris Fabius.</p><p><b>Hébergeur</b> : GitHub, Inc. (GitHub Pages), 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis.</p></div>`,
    confidentialite: `<h3>Politique de confidentialité</h3><div class="legal">
      <p><b>Caméra</b> : les images servent uniquement à suivre tes mains. Elles sont analysées directement sur ton appareil et ne sont ni enregistrées ni envoyées à qui que ce soit.</p>
      <p><b>Micro</b> : les commandes vocales utilisent la reconnaissance vocale de ton navigateur. Sur iPhone, Apple peut traiter l’audio sur ses serveurs selon ses propres règles (dictée Siri).</p>
      <p><b>Tes créations</b> : elles sont sauvegardées uniquement dans ton navigateur (stockage local). Elles ne quittent ton appareil que si tu les exportes ou les envoies toi-même.</p>
      <p><b>Écran lié</b> : pour relier deux écrans, un serveur de mise en relation (PeerJS) reçoit un identifiant de connexion et l’adresse IP des appareils, puis la scène circule directement entre tes appareils.</p>
      <p><b>Jarvis (facultatif)</b> : si tu actives le cerveau Jarvis avec ta clé API, tes demandes écrites ou dictées et la description de la création à modifier sont envoyées directement de ton appareil à Anthropic (Claude) pour être traitées, selon les conditions d’Anthropic. Ta clé reste stockée uniquement sur ton appareil.</p>
      <p><b>Ressources techniques</b> : les polices (Google Fonts) et le modèle de suivi des mains (Google, storage.googleapis.com) sont téléchargés depuis leurs serveurs, qui voient donc ton adresse IP.</p>
      <p><b>Aucun cookie, aucune mesure d’audience, aucune publicité.</b></p>
      <p><b>Base légale</b> : ton consentement (caméra, micro), que tu peux retirer à tout moment dans Menu → Confidentialité. <b>Tes droits</b> (accès, rectification, effacement, opposition, retrait du consentement) : écris à annoh63@gmail.com. Tu peux aussi saisir la CNIL (cnil.fr).</p></div>`,
    cgu: `<h3>Conditions générales d’utilisation</h3><div class="legal"><p>Atelier est un prototype gratuit fourni « en l’état », sans garantie de disponibilité ni d’exactitude des dimensions ou des rendus. Il ne remplace pas l’étude d’un professionnel (architecte, bureau d’études) avant des travaux.</p><p>Tu restes responsable des contenus que tu crées, exportes et partages, et tu t’engages à ne pas utiliser Atelier à des fins illicites. L’éditeur peut faire évoluer ou interrompre le service à tout moment.</p><p>Droit applicable : droit français.</p></div>`,
    pi: `<h3>Propriété intellectuelle</h3><div class="legal"><p>L’application Atelier (code, interface, design, nom et contenus de la bibliothèque) est © 2026 Annoh Aboidje Chris Fabius. Tous droits réservés. Toute reproduction ou réutilisation sans autorisation est interdite.</p><p><b>Tes créations t’appartiennent</b> : les espaces, scènes et fichiers que tu produis avec Atelier sont ta propriété.</p><p>Atelier s’appuie sur des bibliothèques libres, utilisées selon leurs licences : three.js (MIT), MediaPipe (Apache 2.0), PeerJS (MIT), polices Instrument (SIL OFL).</p></div>`,
  };
  return section ? S[section] : Object.values(S).join('');
}
function showLegal(section) { openModal(`<h2>Infos légales</h2>${legalHTML(section)}<div class="row"><button class="btn" data-close>Fermer</button></div>`); }

function askConsent() {
  return new Promise(res => {
    openModal(`<h2>Caméra & micro</h2>
      <p>Pour créer avec tes mains et ta voix, Atelier a besoin de la caméra et du micro. <b>Les images restent sur ton appareil</b> : elles servent uniquement à suivre tes mains.</p>
      <label class="check"><input type="checkbox" id="cConsent"> <span>J’accepte que la caméra et le micro soient utilisés comme décrit dans la <a class="link" href="#" id="cPriv">politique de confidentialité</a>.</span></label>
      <div class="row"><button class="btn" id="cOk" disabled>Autoriser</button><button class="btn ghost" data-close>Plus tard</button></div>`, root => {
      const cb = root.querySelector('#cConsent'), ok = root.querySelector('#cOk');
      cb.onchange = () => ok.disabled = !cb.checked;
      ok.onclick = () => { setConsent(true); closeModal(); res(true); };
      root.querySelector('#cPriv').onclick = e => { e.preventDefault(); showLegal('confidentialite'); res(false); };
      root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => res(false)));
    });
  });
}

/* ---------- caméra ---------- */
let stream = null, facing = 'user';
async function startCamera() {
  if (stream) return stream;
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Caméra indisponible sur ce navigateur.');
  stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 960 }, height: { ideal: 720 } }, audio: false });
  // si la caméra s'arrête toute seule, on la relance
  stream.getVideoTracks().forEach(t => t.addEventListener('ended', () => { if (hands?.active || engine.backdrop === 'camera') { stream = null; setTimeout(() => startCamera().catch(() => { }), 400); } }));
  for (const v of [$('#cam'), $('#pipVideo')]) { v.srcObject = stream; v.classList.toggle('mirror', facing === 'user'); try { await v.play(); } catch { } }
  return stream;
}
function stopCamera() { stream?.getTracks().forEach(t => t.stop()); stream = null; $('#cam').srcObject = null; $('#pipVideo').srcObject = null; }
function updatePip() { $('#camPip').hidden = !(hands?.active && engine.backdrop !== 'camera'); }

/* ---------- écran toujours allumé pendant les mains / l'écran lié (sinon l'iPhone se met en veille et tout se coupe) ---------- */
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { }
}
const needAwake = () => !!(hands?.active || link);
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  if (needAwake()) keepAwake(true);
  // au retour dans l'appli, la caméra est relancée si iOS l'a coupée
  if (hands?.active && (!stream || stream.getVideoTracks().every(t => t.readyState === 'ended'))) { stream = null; try { await startCamera(); } catch { } }
  $('#cam').play?.().catch(() => { });
});

/* ---------- mains ---------- */
let hands = null;
async function toggleHands() {
  if (hands?.active) { hands.stop(); $('#btnHands').classList.remove('on'); if (!needAwake()) keepAwake(false); if (engine.backdrop !== 'camera') stopCamera(); updatePip(); setStatus(); return; }
  if (!hasConsent() && !(await askConsent())) return;
  try {
    toast('Activation de la caméra…');
    await startCamera();
    if (!hands) { const { Hands } = await import('./hands.js'); hands = new Hands(engine, $('#cam'), $('#handsOverlay'), ui); }
    toast('Chargement du suivi des mains…', 6000);
    await hands.start(facing === 'user');
    $('#btnHands').classList.add('on'); updatePip(); setStatus(); keepAwake(true);
    toast('Mains actives : vise avec l’index, pince pouce + index pour toucher', 3200);
    if (!sessionStorageGet('handsHelp')) { sessionStorageSet('handsHelp', 1); setTimeout(showHandsHelp, 600); }
  } catch (e) {
    console.error(e); toast(e.name === 'NotAllowedError' ? 'Caméra refusée : autorise-la dans Réglages → Safari → Caméra.' : 'Impossible de lancer le suivi des mains : ' + (e.message || e), 5000);
    if (engine.backdrop !== 'camera') stopCamera();
  }
}
function sessionStorageGet(k) { try { return sessionStorage.getItem('atelier:' + k); } catch { return null; } }
function sessionStorageSet(k, v) { try { sessionStorage.setItem('atelier:' + k, v); } catch { } }
function showHandsHelp() {
  openModal(`<h2>Créer avec les mains</h2>
    <p>Pose l’iPhone debout, à environ 50 cm, caméra face à toi. <b>Seuls le pouce et l’index comptent</b> : les autres doigts peuvent faire ce qu’ils veulent. Tes deux mains sont suivies séparément.</p>
    <ul>
      <li><b>Viser</b> : le curseur suit le bout de ton index, l’objet visé s’éclaire avec son nom.</li>
      <li><b>Toucher</b> : pince pouce + index, puis relâche. Ça sélectionne l’objet, ça clique le bouton, et dans le vide ça désélectionne.</li>
      <li><b>Glisser</b> : pince, bouge, relâche. Sur un objet, tu le déplaces. Dans le vide, tu tournes la vue.</li>
      <li><b>Zoomer</b> : sans pincer, écarte ou rapproche pouce et index comme sur un téléphone. Si un objet est sélectionné, c’est lui qui change de taille.</li>
      <li><b>Deux mains</b> : pince des deux mains et écarte-les pour agrandir, tourne-les pour faire pivoter.</li>
      <li><b>Modeler</b> : en mode Modeler, pince sur la matière et glisse.</li>
    </ul>
    <div class="row"><button class="btn" data-close>C’est parti</button></div>`);
}

/* ---------- voix ---------- */
let voice = null, bubbleT;
function bubble(html, ms = 3000) { const b = $('#voiceBubble'); b.innerHTML = html; b.hidden = false; clearTimeout(bubbleT); if (ms) bubbleT = setTimeout(() => b.hidden = true, ms); }
async function toggleVoice() {
  if (voice?.on) { voice.stop(); return; }
  if (!hasConsent() && !(await askConsent())) return;
  if (!voice) voice = new Voice((text, final) => {
    if (!final) { bubble(`<span class="live">${esc(text)}</span>`, 0); return; }
    if (!parseCommand(text).length && !brain.key) { bubble(`« ${esc(text)} » <span class="live">— active Jarvis pour créer librement</span>`, 3500); return; }
    command(text, { fromVoice: true });
  }, (on, err) => { $('#btnVoice').classList.toggle('on', on); setStatus(); if (err) toast(err, 5000); if (on) bubble('Je t’écoute… <span class="live">ex. « crée une pièce de 6 sur 4 »</span>', 4000); });
  if (!voice.supported) { toast('La reconnaissance vocale n’est pas disponible ici. Sur iPhone, active Siri et utilise Safari.', 5000); return; }
  voice.start();
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// exécute les actions issues de la voix
function runActions(acts) {
  const out = [];
  for (const a of acts) {
    const s = engine.selected;
    switch (a.do) {
      case 'undo': engine.undo(); out.push('Annulé'); break;
      case 'redo': engine.redo(); out.push('Rétabli'); break;
      case 'delete': if (s) { engine.remove(s); out.push('Supprimé'); } else out.push('Rien de sélectionné'); break;
      case 'clear': engine.clear(); out.push('Scène vidée'); break;
      case 'duplicate': if (s) { engine.duplicate(s); out.push('Dupliqué'); } break;
      case 'walk': startWalk(); out.push('Visite'); break;
      case 'frame': engine.frameAll(); out.push('Vue d’ensemble'); break;
      case 'export': openExport(); out.push('Export'); break;
      case 'shot': doShare('photo'); out.push('Photo'); break;
      case 'ambiance': engine.setAmbiance(a.value); renderTray(); out.push('Ambiance ' + AMB.find(x => x[0] === a.value)?.[1]); break;
      case 'palette': engine.applyPalette(a.value); renderTray(); out.push('Style ' + PALETTES.find(p => p.id === a.value).name); break;
      case 'add': {
        let last;
        for (let i = 0; i < (a.count || 1); i++) last = engine.add(a.value, { params: a.params, silent: i < (a.count || 1) - 1 });
        if (getItem(a.value).cat === 'Espaces' && a.value === 'piece') engine.frameAll();
        out.push(`${a.count > 1 ? a.count + ' × ' : ''}${getItem(a.value).name}${Object.keys(a.params || {}).length ? ' (' + Object.values(a.params).join(' × ') + ')' : ''}`);
        break;
      }
      case 'material': {
        let t = engine.selected;
        if (a.role && (!t || !rolesOf(t).includes(a.role))) t = engine.content.children.find(g => g.userData.type === 'piece' && rolesOf(g).includes(a.role)) || engine.content.children.find(g => rolesOf(g).includes(a.role)) || t;
        if (!t) { out.push('Sélectionne d’abord un élément'); break; }
        const role = a.role && rolesOf(t).includes(a.role) ? a.role : (engine.selectedRole && rolesOf(t).includes(engine.selectedRole) ? engine.selectedRole : mainRole(t));
        engine.setPartMaterial(t, role, a.value);
        out.push(`${ROLE_LABEL[role]} → ${matName(a.value)}`);
        break;
      }
      case 'scale': if (s) { s.scale.multiplyScalar(a.value); engine.commit(); out.push(a.value > 1 ? 'Agrandi' : 'Réduit'); } break;
      case 'rotate': if (s) { s.rotation.y += a.value * Math.PI / 4; engine.commit(); out.push('Pivoté'); } break;
      case 'lift': if (s) { s.position.y = Math.max(0, s.position.y + a.value); engine.commit(); out.push(a.value > 0 ? 'Monté' : 'Descendu'); } break;
      case 'nudge': if (s) { const az = engine.orbit.az; const f = new THREE.Vector3(-Math.sin(az), 0, -Math.cos(az)), r = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az)); s.position.addScaledVector(r, a.value[0]).addScaledVector(f, a.value[1]); engine.commit(); out.push('Déplacé'); } break;
      case 'suggest': suggest(); out.push('Propositions'); break;
      case 'sculpt': if (s && engine.sculptor.canSculpt(s)) { setSculpt(true); out.push('Modelage'); } else out.push('Sélectionne une forme à modeler'); break;
      case 'tool': if (!engine.sculptor.active && s && engine.sculptor.canSculpt(s)) setSculpt(true); engine.sculptor.tool = a.value; window._sculptRefresh?.(); out.push('Outil ' + a.value); break;
    }
  }
  return out.join(' · ');
}
const matName = id => id.startsWith('#') ? (PAINTS.find(p => '#' + p[1].toString(16).padStart(6, '0') === id)?.[0] || 'Couleur ' + id) : getMaterialDef(id)?.name || id;
function rolesOf(g) { const r = new Set(); g.traverse(o => { if (o.isMesh && ROLE_LABEL[o.userData.role]) r.add(o.userData.role); }); return [...r]; }
function mainRole(g) { const rs = rolesOf(g); const d = DEFAULT_ROLE[g.userData.type]; if (d && rs.includes(d)) return d; for (const r of ['forme', 'terrain', 'roche', 'batiment', 'vetement', 'textile', 'mobilier', 'mur', 'sol', 'corps', 'metal', 'verre', 'route']) if (rs.includes(r)) return r; return rs[0]; }

/* ---------- vignettes 3D des éléments ---------- */
const itemThumbs = {};
async function renderItemThumbs(ids) {
  const size = 156;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(size, size); r.setPixelRatio(1); r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
  r.shadowMap.enabled = true;
  const sc = new THREE.Scene(); sc.environment = engine.envTex; sc.environmentIntensity = 0.9;
  sc.add(new THREE.HemisphereLight(0xfff6ea, 0x6f665c, 0.7));
  const key = new THREE.DirectionalLight(0xfff0dc, 2.4); key.position.set(3, 6, 4); key.castShadow = true; sc.add(key);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), new THREE.ShadowMaterial({ opacity: 0.25 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; sc.add(floor);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
  for (const id of ids) {
    await new Promise(r => setTimeout(r, 0));
    const g = engine.build(id); g.userData.mats = {}; engine.applyMaterials(g);
    const waits = []; g.traverse(o => { const r = readyOf(o.material); if (r) waits.push(r); }); await Promise.all(waits);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; if (o.material?.userData?.fadeable) { o.material.opacity = 1; o.material.transparent = false; } } if (o.isLight && o.userData.lamp) o.intensity *= 0.4; });
    sc.add(g);
    const b = new THREE.Box3().setFromObject(g); const s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    const R = Math.max(s.x, s.y * 1.1, s.z) * 0.5 + 0.02;
    const dist = R / Math.sin(THREE.MathUtils.degToRad(15)) * 0.95;
    const dir = new THREE.Vector3(0.9, getItem(id).cat === 'Espaces' ? 0.95 : 0.5, 1.15).normalize();
    cam.position.copy(c).addScaledVector(dir, dist); cam.lookAt(c);
    cam.near = Math.max(0.01, dist / 200); cam.far = dist * 4; cam.updateProjectionMatrix();
    key.shadow.camera.far = dist * 6;
    key.target.position.copy(c); key.position.copy(c).add(new THREE.Vector3(3, 6, 4).multiplyScalar(Math.max(1, R))); sc.add(key.target);
    key.shadow.camera.left = key.shadow.camera.bottom = -R * 2; key.shadow.camera.right = key.shadow.camera.top = R * 2; key.shadow.camera.updateProjectionMatrix();
    r.render(sc, cam);
    itemThumbs[id] = r.domElement.toDataURL('image/png');
    sc.remove(g); g.traverse(o => o.isMesh && o.geometry.dispose());
  }
  r.dispose(); r.forceContextLoss?.();
}
let matThumbs = {};

/* ---------- bibliothèque ---------- */
const TABS = [...CATEGORIES, 'Matières', 'Styles'];
let tab = 'Modeler';
const AMB = [['jour', 'Jour'], ['doree', 'Heure dorée'], ['soir', 'Soir'], ['studio', 'Studio'], ['galerie', 'Galerie']];
function renderTabs() {
  $('#tabs').innerHTML = TABS.map(t => `<button class="tab ${t === tab ? 'on' : ''}" data-tab="${t}">${t}</button>`).join('');
  $('#tabs .tab.on')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  $$('#tabs .tab').forEach(b => b.onclick = () => { tab = b.dataset.tab; renderTabs(); renderTray(); });
}
function card(id, label, img, extra = '') { return `<button class="card ${extra}" data-id="${id}">${img ? `<img src="${img}" alt="">` : `<div class="ph">${svg('cube')}</div>`}<span class="lbl">${label}</span></button>`; }

async function renderTray() {
  const tray = $('#tray');
  if (tab === 'Matières') {
    const sel = engine.selected; const curRole = sel && (engine.selectedRole && rolesOf(sel).includes(engine.selectedRole) ? engine.selectedRole : mainRole(sel));
    const curMat = sel && (sel.userData.mats?.[curRole] || engine.palette[curRole]);
    let html = ''; let lastCat = '';
    for (const m of MATERIALS) {
      if (m.cat !== lastCat) { if (lastCat) html += '<span class="sep"></span>'; html += `<span class="group-label">${m.cat}</span>`; lastCat = m.cat; }
      html += card(m.id, m.name, matThumbs[m.id], curMat === m.id ? 'on' : '');
    }
    html += '<span class="sep"></span><span class="group-label">Peinture</span>';
    for (const [n, c] of PAINTS) { const id = '#' + c.toString(16).padStart(6, '0'); html += `<button class="card color ${curMat === id ? 'on' : ''}" data-id="${id}"><span class="sw" style="background:${id}"></span><span class="lbl">${n}</span></button>`; }
    tray.innerHTML = html;
    tray.querySelectorAll('.card').forEach(c => c.onclick = () => pickMaterial(c.dataset.id));
    if (!Object.keys(matThumbs).length) loadMatThumbs();
    return;
  }
  if (tab === 'Styles') {
    let html = `<button class="card wide" data-act="suggest"><div class="ttl">Propose-moi</div><div class="dsc">Une idée d’ambiance et ce qui manque à ta scène.</div><div class="dots">${svg('sparkle').replace('<svg', '<svg style="width:22px;height:22px;stroke:#E2C48E;fill:none;stroke-width:1.6"')}</div></button>`;
    for (const P of PALETTES) {
      const dots = ['sol', 'mur', 'textile', 'metal'].map(r => `<i style="background-image:url(${matThumbs[P.map[r]] || ''});background-color:#555"></i>`).join('');
      html += `<button class="card wide ${engine.palette.sol === P.map.sol && engine.palette.mur === P.map.mur ? 'on' : ''}" data-pal="${P.id}"><div class="ttl">${P.name}</div><div class="dsc">${P.desc}</div><div class="dots">${dots}</div></button>`;
    }
    html += '<span class="sep"></span><span class="group-label">Modèles</span>';
    for (const T of TEMPLATES) html += `<button class="card wide" data-tpl="${T.id}"><div class="ttl">${T.name}</div><div class="dsc">${T.desc}</div></button>`;
    tray.innerHTML = html;
    tray.querySelector('[data-act=suggest]').onclick = suggest;
    tray.querySelectorAll('[data-pal]').forEach(c => c.onclick = () => { engine.applyPalette(c.dataset.pal); toast('Style ' + PALETTES.find(p => p.id === c.dataset.pal).name + ' appliqué'); renderTray(); });
    tray.querySelectorAll('[data-tpl]').forEach(c => c.onclick = () => { setSheet(true); loadTemplate(c.dataset.tpl); });
    if (!Object.keys(matThumbs).length) loadMatThumbs();
    return;
  }
  const items = CATALOG.filter(c => c.cat === tab);
  let html = '';
  if (tab === 'Lumières') {
    html += AMB.map(([k, n]) => `<button class="card wide ${engine.ambiance === k ? 'on' : ''}" data-amb="${k}" style="flex-basis:120px"><div class="ttl">${n}</div><div class="dsc">${{ jour: 'Lumière naturelle, ombres nettes.', doree: 'Soleil bas, chaud et rasant.', soir: 'Nuit, les lampes prennent le relais.', studio: 'Neutre et doux, pour présenter.', galerie: 'Blanc froid, éclairage zénithal.' }[k]}</div></button>`).join('') + '<span class="sep"></span>';
  }
  const tplCard = id => { const T = TEMPLATES.find(t => t.id === id); return `<button class="card wide" data-tpl="${T.id}" style="flex-basis:150px"><div class="ttl">${T.name}</div><div class="dsc">${T.desc}</div></button>`; };
  if (tab === 'Paysages') html += tplCard('paysage') + '<span class="sep"></span>';
  if (tab === 'Villes') html += tplCard('ville') + '<span class="sep"></span>';
  if (tab === 'Espaces') html += TEMPLATES.filter(t => ['salon', 'chambre'].includes(t.id)).map(T => `<button class="card wide" data-tpl="${T.id}" style="flex-basis:150px"><div class="ttl">${T.name}</div><div class="dsc">${T.desc}</div></button>`).join('') + '<span class="sep"></span>';
  if (tab === 'Mode') html += `<button class="card wide" data-tpl="showroom" style="flex-basis:150px"><div class="ttl">Showroom</div><div class="dsc">Estrade, silhouettes habillées, portants et spots.</div></button><span class="sep"></span>`;
  html += items.map(c => card(c.id, c.name, itemThumbs[c.id])).join('');
  tray.innerHTML = html;
  tray.querySelectorAll('[data-amb]').forEach(c => c.onclick = () => { engine.setAmbiance(c.dataset.amb); renderTray(); });
  tray.querySelectorAll('[data-tpl]').forEach(c => c.onclick = () => { setSheet(true); loadTemplate(c.dataset.tpl); });
  tray.querySelectorAll('.card[data-id]').forEach(c => c.onclick = () => {
    const def = getItem(c.dataset.id);
    const g = engine.add(c.dataset.id);
    setSheet(true);
    if (def.garment && !(engine.selected && engine.selected !== g)) toast('Astuce : sélectionne d’abord un personnage pour l’habiller');
    if (def.id === 'piece' || def.big) engine.frameAll();
    else if (def.sculpt) engine.focus(g);
  });
  const missing = items.filter(c => !itemThumbs[c.id]).map(c => c.id);
  if (missing.length) { await renderItemThumbs(missing); if (tab === items[0]?.cat) renderTray(); }
}
let matThumbsLoading = false;
async function loadMatThumbs() {
  if (matThumbsLoading) return; matThumbsLoading = true;
  await renderThumbs(MATERIALS.map(m => m.id), 156, (id, url) => {
    matThumbs[id] = url;
    const img = document.querySelector(`#tray .card[data-id="${id}"] img, #tray .card[data-id="${id}"] .ph`);
    if (img) img.outerHTML = `<img src="${url}" alt="">`;
  });
  if (tab === 'Styles') renderTray();
}

/* ---------- matières ---------- */
let pendingMat = null;
function pickMaterial(id) {
  const s = engine.selected;
  if (s) {
    const role = engine.selectedRole && rolesOf(s).includes(engine.selectedRole) ? engine.selectedRole : mainRole(s);
    engine.selectedRole = role;
    engine.setPartMaterial(s, role, id);
    renderParts(); renderTray();
  }
  if (id.startsWith('#')) { if (!s) toast('Sélectionne un élément pour le peindre'); return; }
  const d = getMaterialDef(id);
  pendingMat = id;
  const sw = d.glass ? null : swatchDataURL(id);
  $('#mdSwatch').style.backgroundImage = sw ? `url(${sw})` : `url(${matThumbs[id] || ''})`;
  $('#mdSwatch').style.backgroundSize = sw ? '160%' : 'cover';
  if (!sw && !d.glass) readyOf(material(id))?.then(() => { if (pendingMat === id) { const u = swatchDataURL(id); if (u) { $('#mdSwatch').style.backgroundImage = `url(${u})`; $('#mdSwatch').style.backgroundSize = '160%'; } } });
  $('#mdCat').textContent = d.cat + (s ? ' · appliqué sur ' + ROLE_LABEL[engine.selectedRole].toLowerCase() : '');
  $('#mdName').textContent = d.name; $('#mdDesc').textContent = d.desc;
  $('#mdApply').hidden = !!s; $('#mdApply').textContent = 'Appliquer';
  $('#matDetail').hidden = false;
  clearTimeout(pickMaterial.t); pickMaterial.t = setTimeout(() => $('#matDetail').hidden = true, s ? 4500 : 12000);
}
$('#mdClose').onclick = () => $('#matDetail').hidden = true;
$('#mdApply').onclick = () => { if (!engine.selected) { toast('Touche d’abord un élément de la scène'); return; } pickMaterial(pendingMat); };

/* ---------- panneau de sélection ---------- */
const ui = {
  showDims() {
    const s = engine.selected; if (!s) return;
    const d = engine.dims(s); const f = v => v >= 1 ? v.toFixed(2).replace('.', ',') + ' m' : Math.round(v * 100) + ' cm';
    $('#selDims').textContent = `${f(d.x)} × ${f(d.z)} × ${f(d.y)} (h)`;
  },
};
function renderParts() {
  const s = engine.selected; if (!s) return;
  const rs = rolesOf(s);
  const cur = engine.selectedRole && rs.includes(engine.selectedRole) ? engine.selectedRole : mainRole(s);
  $('#selParts').innerHTML = rs.length > 1 ? rs.map(r => `<button class="chip ${r === cur ? 'on' : ''}" data-role="${r}">${ROLE_LABEL[r]}</button>`).join('') : '';
  $$('#selParts .chip').forEach(c => c.onclick = () => { engine.selectedRole = c.dataset.role; renderParts(); if (tab === 'Matières') renderTray(); });
}
function renderParams() {
  const s = engine.selected; const def = getItem(s.userData.type);
  const keys = Object.keys(def.ranges || {});
  const box = $('#params');
  const common = `<div class="param"><label>Élévation</label><input type="range" min="0" max="4" step="0.01" value="${s.position.y.toFixed(2)}" data-k="__y"><output>${fmt(+s.position.y.toFixed(2), ' m')}</output></div>`
    + `<div class="param"><label>Orientation</label><input type="range" min="-180" max="180" step="1" value="${Math.round(THREE.MathUtils.radToDeg(THREE.MathUtils.euclideanModulo(s.rotation.y + Math.PI, Math.PI * 2) - Math.PI))}" data-k="__r"><output>${Math.round(THREE.MathUtils.radToDeg(THREE.MathUtils.euclideanModulo(s.rotation.y + Math.PI, Math.PI * 2) - Math.PI))}°</output></div>`;
  if (!keys.length) { box.innerHTML = '<div class="param"><label>Taille</label><input type="range" min="0.2" max="3" step="0.01" value="' + s.scale.x.toFixed(2) + '" data-k="__scale"><output>' + Math.round(s.scale.x * 100) + ' %</output></div>' + common; }
  else box.innerHTML = common + keys.map(k => {
    const [min, max, step = 0.01] = def.ranges[k]; const v = s.userData.params[k];
    const unit = ['n', 'places'].includes(k) ? '' : (k === 'ouverte' || k === 'longueur' || k === 'carrure' || k === 'angle') ? '' : ' m';
    return `<div class="param"><label>${def.labels[k]}</label><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-k="${k}"><output>${fmt(v, unit)}</output></div>`;
  }).join('');
  box.querySelectorAll('input').forEach(inp => {
    const unit = inp.closest('.param').querySelector('output');
    inp.oninput = () => {
      const k = inp.dataset.k, v = parseFloat(inp.value);
      if (k === '__scale') { engine.selected.scale.setScalar(v); unit.textContent = Math.round(v * 100) + ' %'; ui.showDims(); return; }
      if (k === '__y') { engine.selected.position.y = v; unit.textContent = fmt(v, ' m'); return; }
      if (k === '__r') { engine.selected.rotation.y = THREE.MathUtils.degToRad(v); unit.textContent = v + '°'; ui.showDims(); return; }
      const u = unit.textContent.endsWith(' m') ? ' m' : '';
      unit.textContent = fmt(v, u);
      throttleRebuild(k, v);
    };
    inp.onchange = () => engine.commit();
  });
}
const fmt = (v, u) => (Number.isInteger(v) ? v : v.toFixed(2)).toString().replace('.', ',') + u;
let rbT = null, rbPending = {};
function throttleRebuild(k, v) {
  rbPending[k] = v; if (rbT) return;
  rbT = requestAnimationFrame(() => { const s = engine.selected; if (s) { engine.rebuild(s, rbPending); ui.showDims(); } rbPending = {}; rbT = null; });
}

function setSheet(collapsed) {
  $('#sheet').classList.toggle('collapsed', collapsed); document.body.classList.toggle('sheet-open', !collapsed);
  $$('.dk').forEach(d => d.classList.toggle('on', !collapsed && d.dataset.dock === dockTab()));
  updateInset();
}
const dockTab = () => ({ Matières: 'matieres', Styles: 'styles', Lumières: 'lumiere' })[tab] || 'create';
function openLibrary(t) {
  const sameOpen = !$('#sheet').classList.contains('collapsed') && (!t || t === tab || (t === 'create' && !['Matières', 'Styles', 'Lumières'].includes(tab)));
  if (sameOpen) { setSheet(true); return; }
  if (t && t !== 'create') tab = t; else if (['Matières', 'Styles', 'Lumières'].includes(tab)) tab = 'Modeler';
  renderTabs(); renderTray(); setSheet(false);
}
// la scène se recentre dans la zone réellement visible (entre les panneaux du haut et du bas)
function updateInset() {
  requestAnimationFrame(() => {
    const H = window.innerHeight;
    if (isDisplay || document.body.classList.contains('walking')) { engine.setInset(0); return; }
    let top = 56, bottom = H;
    const sp = $('#selPanel'); if (!sp.hidden && window.innerWidth < 900) top = Math.max(top, sp.getBoundingClientRect().bottom);
    const sh = $('#sheet'); if (!sh.classList.contains('collapsed')) bottom = Math.min(bottom, sh.getBoundingClientRect().top);
    const cmd = $('#cmd'); if (!cmd.hidden) bottom = Math.min(bottom, cmd.getBoundingClientRect().top);
    engine.setInset(H / 2 - (top + bottom) / 2);
  });
}
new ResizeObserver(updateInset).observe($('#selPanel'));
new ResizeObserver(updateInset).observe($('#sheet'));
window.addEventListener('resize', updateInset);
$('#sheet').addEventListener('transitionend', updateInset);
$('#sheetClose').onclick = () => setSheet(true);
let lastSel = null;
engine.addEventListener('selection', e => {
  const g = e.detail.object;
  $('#selPanel').hidden = !g || isDisplay;
  document.body.classList.toggle('has-sel', !!g);
  updateInset();
  $('#params').hidden = true; $('[data-act=params]').classList.remove('on');
  const canSc = !!g && engine.sculptor.canSculpt(g);
  if (engine.sculptor.active && (!canSc || g !== lastSel)) setSculpt(false);
  lastSel = g;
  $('[data-act=sculpt]').hidden = !canSc; $('[data-act=focus]').hidden = canSc;
  if (!g) { $('#matDetail').hidden = true; if (tab === 'Matières') renderTray(); return; }
  $('#selName').textContent = nameOf(g);
  ui.showDims(); renderParts();
  if (tab === 'Matières') renderTray();
});
$('#selClose').onclick = () => engine.setSelection(null);
$$('.sel-tools button').forEach(b => b.onclick = () => {
  const s = engine.selected; if (!s) return;
  switch (b.dataset.act) {
    case 'sculpt': setSculpt(true); break;
    case 'material': openLibrary('Matières'); break;
    case 'ai': openCmd(true); break;
    case 'params': { const p = $('#params'); p.hidden = !p.hidden; b.classList.toggle('on', !p.hidden); if (!p.hidden) renderParams(); break; }
    case 'rotate': s.rotation.y -= Math.PI / 4; engine.commit(); ui.showDims(); break;
    case 'duplicate': engine.duplicate(s); break;
    case 'focus': engine.focus(s); break;
    case 'delete': engine.remove(s); break;
  }
});

const nameOf = g => g?.userData.params?.spec?.nom || getItem(g?.userData.type)?.name || 'Élément';

/* ---------- dock ---------- */
$$('.dk').forEach(b => b.onclick = () => {
  const d = b.dataset.dock;
  if (d === 'create') openLibrary('create');
  else if (d === 'matieres') openLibrary('Matières');
  else if (d === 'styles') openLibrary('Styles');
  else if (d === 'lumiere') openLibrary('Lumières');
  else if (d === 'jarvis') openCmd(false);
  else if (d === 'frame') engine.frameAll();
  else if (d === 'walk') startWalk();
});

/* ---------- repère sur l'objet visé / sélectionné ---------- */
const label = $('#objLabel'); let labelBox = null, labelFor = null, labelN = 0;
engine.addEventListener('frame', () => {
  const g = engine.hovered || engine.selected;
  if (!g || engine.walk || isDisplay || !g.parent) { label.hidden = true; labelFor = null; return; }
  if (g !== labelFor || ++labelN % 12 === 0) { labelBox = new THREE.Box3().setFromObject(g); labelFor = g; label.querySelector('b').textContent = nameOf(g); label.querySelector('span').textContent = g === engine.selected ? '' : 'pointer pour choisir'; }
  const c = labelBox.getCenter(new THREE.Vector3()); c.y = labelBox.max.y;
  c.project(engine.camera);
  if (c.z > 1) { label.hidden = true; return; }
  const r = engine.canvas.getBoundingClientRect();
  const x = (c.x + 1) / 2 * r.width, y = (1 - c.y) / 2 * r.height - 10;
  label.hidden = false; label.style.transform = `translate(${x}px, ${Math.max(70, y)}px) translate(-50%, -100%)`;
});

/* ---------- Jarvis : commande libre ---------- */
let cmdForSel = false, cmdAbort = null;
function openCmd(forSel) {
  cmdForSel = !!forSel && !!engine.selected;
  $('#cmd').hidden = false; setSheet(true);
  $('#cmdInput').placeholder = cmdForSel ? `Que changer sur « ${nameOf(engine.selected)} » ?` : 'Que veux-tu créer ? ex. « une chaise design en bois courbé »';
  setTimeout(() => $('#cmdInput').focus(), 50);
  $('.dk[data-dock=jarvis]').classList.add('on'); updateInset();
}
function closeCmd() { $('#cmd').hidden = true; $('#cmdInput').blur(); $('.dk[data-dock=jarvis]').classList.remove('on'); cmdAbort?.abort(); updateInset(); }
$('#cmdClose').onclick = closeCmd;
$('#cmd').onsubmit = e => { e.preventDefault(); const t = $('#cmdInput').value.trim(); if (!t) return; $('#cmdInput').value = ''; command(t, { forceAI: cmdForSel }); };

// une phrase : d'abord les commandes connues (instantané), sinon le cerveau
async function command(text, { forceAI = false, fromVoice = false } = {}) {
  // phrases courtes et connues → exécution immédiate ; descriptions libres → Jarvis
  const wantsAI = forceAI || (brain.key && text.trim().split(/\s+/).length > 5);
  if (!wantsAI) {
    const acts = parseCommand(text);
    if (acts.length) { const done = runActions(acts); bubble(`<span class="ok">✓</span> ${esc(done || text)}`, 2600); return; }
  }
  if (!brain.key) { brainSetup(text); return; }
  const target = engine.selected?.userData.type === 'ia' && (forceAI || cmdForSel) ? engine.selected : null;
  $('#cmd').classList.add('busy'); bubble(`<span class="live">Jarvis construit : ${esc(text)}…</span>`, 0);
  cmdAbort = new AbortController();
  try {
    const lib = CATALOG.filter(c => c.cat !== 'Créations').map(c => c.id).join(', ');
    const spec = await askBrain({ prompt: text, current: target ? target.userData.params.spec : null, library: lib, signal: cmdAbort.signal });
    let g;
    if (target) g = engine.rebuild(target, { spec });
    else if (spec.parties.length) g = engine.add('ia', { params: { spec }, silent: true });
    for (const el of spec.elements) {
      if (!getItem(el.type) || el.type === 'ia') continue;
      engine.add(el.type, { params: el.params, pos: el.pos, rotY: el.rotY != null ? el.rotY * Math.PI / 180 : undefined, silent: true });
    }
    if (target) engine.commit(); else { engine.commit(); if (g) engine.setSelection(g); }
    if (g && !target) engine.focus(g, 2.6); else if (!g) engine.frameAll();
    bubble(`<span class="ok">✓</span> ${esc(spec.message || spec.nom || 'C’est fait')}`, 4000);
    playTick(880);
  } catch (e) {
    if (e.name === 'AbortError') { bubble('Annulé', 1500); }
    else if (e.code === 'nokey') brainSetup(text);
    else { console.error(e); bubble(`<span class="live">${esc(e.message || 'Jarvis n’a pas pu répondre')}</span>`, 5000); }
  } finally { $('#cmd').classList.remove('busy'); cmdAbort = null; }
}

function brainSetup(pending) {
  openModal(`<h2>Cerveau Jarvis</h2>
    <p>Pour créer <b>n’importe quoi</b> à partir d’une phrase, Atelier s’appuie sur Claude, l’IA d’Anthropic, avec ta propre clé API. Tu paies directement à l’usage, en général quelques centimes par création.</p>
    <p>1. Crée une clé sur <a class="link" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a> (Réglages → API Keys).<br>2. Colle-la ici. Elle reste uniquement sur cet appareil.</p>
    <input class="field" id="kKey" type="password" placeholder="sk-ant-…" autocomplete="off" style="font-size:15px;letter-spacing:0;text-transform:none;text-align:left" value="${esc(brain.key)}">
    <div class="optrow"><span>Modèle</span><div class="seg" id="kModel">${MODELS.map(([id, n]) => `<button data-v="${id}" class="${brain.model === id ? 'on' : ''}">${n}</button>`).join('')}</div></div>
    <label class="check"><input type="checkbox" id="kOk"> <span>J’accepte que mes demandes et la description de mes créations soient envoyées à Anthropic pour être traitées (voir la <a class="link" href="#" id="kPriv">confidentialité</a>).</span></label>
    <div class="row"><button class="btn" id="kSave" disabled>Activer Jarvis</button>${brain.key ? '<button class="btn ghost" id="kDel">Retirer la clé</button>' : ''}<button class="btn ghost" data-close>Plus tard</button></div>`, root => {
    const ok = root.querySelector('#kOk'), save = root.querySelector('#kSave'), key = root.querySelector('#kKey');
    const upd = () => save.disabled = !(ok.checked && key.value.trim().length > 20);
    ok.onchange = upd; key.oninput = upd;
    root.querySelectorAll('#kModel button').forEach(b => b.onclick = () => { root.querySelectorAll('#kModel button').forEach(x => x.classList.toggle('on', x === b)); brain.model = b.dataset.v; });
    root.querySelector('#kPriv').onclick = e => { e.preventDefault(); showLegal('confidentialite'); };
    root.querySelector('#kDel')?.addEventListener('click', () => { brain.key = ''; closeModal(); toast('Clé retirée de cet appareil'); });
    save.onclick = () => { brain.key = key.value; closeModal(); toast('Jarvis est prêt'); if (pending) command(pending, { forceAI: true }); };
  });
}

/* ---------- petit son de confirmation (gestes, créations) ---------- */
let actx = null, soundOn = true;
try { soundOn = localStorage.getItem('atelier:son') !== '0'; } catch { }
function playTick(f = 660) {
  if (!soundOn) return;
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine'; o.frequency.value = f; g.gain.value = 0.0001;
    o.connect(g); g.connect(actx.destination);
    const t = actx.currentTime; g.gain.exponentialRampToValueAtTime(0.06, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.start(t); o.stop(t + 0.14);
  } catch { }
}
window.atelierTick = playTick;

/* ---------- modelage ---------- */
import('./sculpt.js').then(({ TOOLS }) => {
  const sc = engine.sculptor;
  $('#sculptTools').innerHTML = TOOLS.map(t => `<button class="chip" data-tool="${t.id}">${t.name}</button>`).join('');
  const refresh = () => {
    $$('#sculptTools .chip').forEach(c => c.classList.toggle('on', c.dataset.tool === sc.tool));
    $('#scSym').classList.toggle('on', sc.sym);
    $('#scHint').textContent = TOOLS.find(t => t.id === sc.tool).hint;
    $('#scRadiusO').textContent = sc.radius < 1 ? Math.round(sc.radius * 100) + ' cm' : sc.radius.toFixed(1).replace('.', ',') + ' m';
    $('#scForceO').textContent = Math.round(sc.strength * 100) + ' %';
  };
  $$('#sculptTools .chip').forEach(c => c.onclick = () => { sc.tool = c.dataset.tool; refresh(); });
  $('#scSym').onclick = () => { sc.sym = !sc.sym; refresh(); };
  const rr = $('#scRadius'), ff = $('#scForce');
  rr.oninput = () => { sc.radius = +rr.value * rr._k; refresh(); };
  ff.oninput = () => { sc.strength = +ff.value; refresh(); };
  $('#scDone').onclick = () => setSculpt(false);
  window._sculptRefresh = () => {
    // la taille du pinceau suit la taille de l'objet (une boule de 70 cm ou une montagne de 300 m)
    const s = engine.selected; if (!s) return;
    const size = new THREE.Box3().setFromObject(s).getSize(new THREE.Vector3()); const big = Math.max(size.x, size.y, size.z);
    rr._k = big; rr.value = (sc.radius / big).toFixed(2);
    if (sc.radius > big * 0.9 || sc.radius < big * 0.02) { sc.radius = big * 0.18; rr.value = 0.18; }
    ff.value = sc.strength; refresh();
  };
});
function setSculpt(on) {
  const sc = engine.sculptor;
  if (on && !(engine.selected && sc.canSculpt(engine.selected))) on = false;
  sc.active = on; sc.showBrush(null);
  $('#sculptBar').hidden = !on;
  $('.sel-tools').hidden = on; $('#selParts').hidden = on; $('#params').hidden = true;
  $('[data-act=params]').classList.remove('on');
  document.body.classList.toggle('sculpting', on);
  if (on) { window._sculptRefresh?.(); setSheet(true); engine.focus(engine.selected, 3.2); toast('Glisse le doigt sur la matière pour la modeler', 2600); }
  updateInset();
}

/* ---------- feuille ---------- */


/* ---------- modèles (pièces composées) ---------- */
const P2 = Math.PI / 2;
const TEMPLATES = [
  { id: 'sculpture', name: 'Boule d’argile', desc: 'Une sphère blanche à modeler, dans le studio vide.', palette: 'japandi', ambiance: 'studio', items: [['argile', { s: 0.7 }, [0, 0, 0]]] },
  { id: 'paysage', name: 'Paysage', desc: 'Collines, lac, forêt et rochers, à remodeler.', palette: 'japandi', ambiance: 'jour', items: [
    ['terrain', { taille: 170, relief: 30, variante: 4 }], ['eau', { taille: 50 }, [18, 0.6, 22]], ['foret', { taille: 60, densite: 70, variante: 2 }, [-45, 0, -30]],
    ['rocher', { s: 4, variante: 3 }, [8, 0, 40]], ['rocher', { s: 2.5, variante: 7 }, [14, 0, 44]], ['arbre', { h: 11 }, [-5, 0, 30]], ['pin', { h: 14 }, [30, 0, -10]]] },
  { id: 'ville', name: 'Ville', desc: 'Un quartier généré, rues et îlots, façon maquette.', palette: 'atelier', ambiance: 'studio', items: [['quartier', { blocs: 5, hauteur: 14, variante: 3 }], ['tour', { w: 24, etages: 42 }, [0, 0, 0]]] },
  { id: 'salon', name: 'Salon', desc: 'Pièce de 6 × 4,5 m meublée, prête à retoucher.', palette: 'japandi', items: [
    ['piece', { w: 6, d: 4.5, h: 2.8 }], ['tapis', { w: 2.6, d: 1.8 }, [0, 0, 0.1]], ['canape', { w: 2.3, places: 3 }, [0, 0, -1.35]],
    ['table', { w: 1.1, d: 0.6, h: 0.38 }, [0, 0, 0.2]], ['fauteuil', {}, [1.75, 0, 0.35], -P2], ['lampe', {}, [-1.75, 0, -1.6]], ['plante', { h: 1.5 }, [2.55, 0, -1.8]],
    ['etagere', { w: 1.6, h: 2.1 }, [-2.82, 0, 0.6], P2], ['suspension', { r: 0.28 }, [0, 0, 0.2]], ['perso-pense', {}, [-0.9, 0, 1.4], 2.6]] },
  { id: 'chambre', name: 'Chambre', desc: 'Chambre de 4,5 × 4 m, lit double et coin lecture.', palette: 'riviera', items: [
    ['piece', { w: 4.5, d: 4, h: 2.7 }], ['tapis', { w: 2.4, d: 1.6 }, [0, 0, -0.5]], ['lit', { w: 1.6 }, [0, 0, -0.95]], ['tabouret', { h: 0.5 }, [-1.2, 0, -1.65]], ['tabouret', { h: 0.5 }, [1.2, 0, -1.65]],
    ['fauteuil', {}, [1.55, 0, 1.2], -2.4], ['lampe', { h: 1.5 }, [2, 0, 1.75]], ['plante', { h: 1.2 }, [-1.95, 0, 1.6]], ['miroir', { r: 0.5 }, [-2.23, 0, 0.6], P2]] },
  { id: 'showroom', name: 'Showroom mode', desc: 'Estrade, silhouettes habillées, portants et spots.', palette: 'galerie', ambiance: 'studio', items: [
    ['piece', { w: 9, d: 7, h: 3.4 }], ['estrade', { w: 5.2, d: 2, h: 0.3 }, [0, 0, -2.2]],
    ['perso-debout', {}, [-1.6, 0.3, -2.3], 0.25, { corps: 'mannequin-noir' }], ['robe', { longueur: 1 }, [-1.6, 0.3, -2.3], 0.25, { vetement: 'velours-rouille' }, [1.04, 1, 1.04]],
    ['perso-presente', {}, [0, 0.3, -2.45], 0, { corps: 'mannequin-noir' }], ['manteau', { longueur: 1 }, [0, 0.3, -2.45], 0, { vetement: 'laine-gris' }, [1.04, 1, 1.04]], ['pantalon', { longueur: 0.3 }, [0, 0.3, -2.45], 0, { vetement: 'denim' }, [1.04, 1, 1.04]],
    ['perso-marche', {}, [1.6, 0.3, -2.3], -0.25, { corps: 'mannequin-noir' }], ['haut', { longueur: 0.7 }, [1.6, 0.3, -2.3], -0.25, { vetement: 'lin' }, [1.04, 1, 1.04]], ['jupe', { longueur: 1.1 }, [1.6, 0.3, -2.3], -0.25, { vetement: 'cuir-noir' }, [1.04, 1, 1.04]],
    ['portant', { w: 1.6 }, [-3.4, 0, 0.6], P2], ['portant', { w: 1.6 }, [3.4, 0, 0.6], -P2], ['buste', {}, [-1.3, 0, 1.4], 0.5], ['robe', { longueur: 0.6 }, [-1.3, 0, 1.4], 0.5, { vetement: 'velours-vert' }, [0.98, 0.95, 0.98]],
    ['spot', { angle: 0.42 }, [-1.6, 0.4, -1.4]], ['spot', { angle: 0.42 }, [0, 0.4, -1.4]], ['spot', { angle: 0.42 }, [1.6, 0.4, -1.4]], ['plante', { h: 1.8 }, [3.9, 0, -2.9]]] },
  { id: 'galerie', name: 'Galerie', desc: 'Espace d’exposition, cimaises, socles et visiteurs.', palette: 'galerie', ambiance: 'galerie', items: [
    ['piece', { w: 10, d: 7, h: 3.6 }], ['cimaise', { w: 2.4, h: 2.6 }, [-2.2, 0, 0]], ['cimaise', { w: 2.4, h: 2.6 }, [2.2, 0, 0.6], 0.3],
    ['cube', { s: 0.9 }, [0, 0, -2.2], 0, { mobilier: 'enduit' }], ['tore', { s: 0.7 }, [0, 0.9, -2.2], 0, { mobilier: 'laiton' }], ['cube', { s: 0.7 }, [-3.6, 0, -2.4], 0, { mobilier: 'marbre-noir' }], ['sphere', { s: 0.55 }, [-3.6, 0.7, -2.4], 0, { mobilier: 'cuivre' }],
    ['colonne', { h: 3.6, r: 0.25 }, [3.8, 0, -2.6]], ['perso-pense', {}, [-0.9, 0, -0.9], 2.6], ['perso-debout', { taille: 1.68 }, [1.3, 0, 2.1], -2.6], ['spot', { angle: 0.35 }, [0, 0.9, -2.2]], ['spot', { angle: 0.35 }, [-3.6, 0.9, -2.4]]] },
];
function dropOnGround() {
  engine.content.updateMatrixWorld(true);
  for (const g of engine.content.children) {
    const t = getItem(g.userData.type); if (t?.sculpt && g.userData.type !== 'rocher') continue;
    if (g.userData.type === 'eau') { g.position.y = engine.groundY(g.position.x, g.position.z, g) + 0.8; continue; } // le lac remplit le creux
    if (g.userData.type === 'foret') { g.children.forEach(tr => { const w = tr.getWorldPosition(new THREE.Vector3()); tr.position.y = engine.groundY(w.x, w.z, g) - g.position.y; }); continue; }
    g.position.y = engine.groundY(g.position.x, g.position.z, g);
  }
}

function loadTemplate(id, { quiet = false } = {}) {
  const T = TEMPLATES.find(t => t.id === id); if (!T) return;
  engine.clear(false);
  if (T.palette) engine.palette = { ...engine.palette, ...PALETTES.find(p => p.id === T.palette).map };
  for (const [type, params, pos, rotY, mats, scale] of T.items) {
    const g = engine.add(type, { params, pos: pos || [0, 0, 0], rotY: rotY ?? 0, mats, scale, silent: true });
    // les éléments posés sur un relief suivent le sol
    if (g && pos && pos[1] > 0 && pos[1] < 1) g.position.y = 0;
  }
  if (T.id === 'paysage') dropOnGround();
  engine.setAmbiance(T.ambiance || 'jour', false);
  engine.setSelection(null); engine.commit(); engine.frameAll();
  if (!quiet) toast(T.name + ' composé : touche un élément pour le modifier');
  renderTray();
}

/* ---------- propositions ---------- */
function suggest() {
  const types = engine.content.children.map(g => g.userData.type);
  const cur = PALETTES.find(p => p.map.sol === engine.palette.sol && p.map.mur === engine.palette.mur);
  const pool = PALETTES.filter(p => p !== cur); const P = pool[Math.floor(Math.random() * pool.length)];
  const ideas = [];
  const has = t => types.includes(t);
  if (!types.length) ideas.push(['salon', 'Commencer par un salon composé', 'tpl']);
  if (has('piece') && !has('tapis')) ideas.push(['tapis', 'Un tapis pour ancrer le coin salon', 'add']);
  if (has('piece') && !has('plante')) ideas.push(['plante', 'Une plante pour faire vivre la pièce', 'add']);
  if ((has('table') || has('table-ronde')) && !has('suspension')) ideas.push(['suspension', 'Une suspension au-dessus de la table', 'add']);
  if (has('piece') && !types.some(t => t.startsWith('perso'))) ideas.push(['perso-debout', 'Une silhouette pour juger l’échelle', 'add']);
  if (has('buste') && !types.some(t => ['robe', 'jupe', 'manteau', 'haut'].includes(t))) ideas.push(['robe', 'Habiller le buste d’une robe', 'add']);
  if (engine.ambiance === 'jour') ideas.push(['doree', 'Voir la scène à l’heure dorée', 'amb']);
  else ideas.push(['soir', 'Passer en ambiance du soir, lampes allumées', 'amb']);
  openModal(`<h2>Propositions</h2>
    <h3>Ambiance matières</h3>
    <button class="item" data-pal="${P.id}">${svg('swatch')}<div><div class="t">Esprit ${P.name}</div><div class="s">${P.desc}</div></div></button>
    <h3>Pour ta scène</h3><div class="list">${ideas.slice(0, 4).map(([v, t, k]) => `<button class="item" data-k="${k}" data-v="${v}">${svg(k === 'amb' ? 'bulb' : 'plus')}<div><div class="t">${t}</div></div></button>`).join('')}</div>
    <div class="row"><button class="btn ghost" data-close>Fermer</button></div>`, root => {
    root.querySelector('[data-pal]').onclick = () => { engine.applyPalette(P.id); closeModal(); toast('Esprit ' + P.name + ' appliqué'); renderTray(); };
    root.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
      const { k, v } = b.dataset; closeModal();
      if (k === 'add') { const sel = engine.selected; if (v === 'robe') { const bu = engine.content.children.find(g => g.userData.type === 'buste'); if (bu) engine.setSelection(bu); } engine.add(v); }
      else if (k === 'amb') { engine.setAmbiance(v); renderTray(); }
      else if (k === 'tpl') loadTemplate(v);
    });
  });
}

/* ---------- export / partage ---------- */
function openExport() {
  openModal(`<h2>Exporter</h2><p>Envoie ta création par mail, Messages ou AirDrop, ou garde-la dans Fichiers.</p>
    <div class="list">
      <button class="item" data-x="usdz">${svg('ar')}<div><div class="t">Réalité augmentée (USDZ)</div><div class="s">S’ouvre d’un tap sur iPhone et iPad, pour poser la création dans la pièce.</div></div></button>
      <button class="item" data-x="glb">${svg('cube')}<div><div class="t">Modèle 3D (GLB)</div><div class="s">Format universel : Blender, sites 3D, logiciels pros.</div></div></button>
      <button class="item" data-x="code">${svg('code')}<div><div class="t">Code — page web (HTML)</div><div class="s">Un fichier .html qui affiche ta création en 3D : à ouvrir, modifier ou mettre sur un site.</div></div></button>
      <button class="item" data-x="module">${svg('code')}<div><div class="t">Code — description JavaScript</div><div class="s">La scène sous forme de code, pour un développeur ou une autre appli.</div></div></button>
      <button class="item" data-x="project">${svg('file')}<div><div class="t">Projet Atelier</div><div class="s">Pour rouvrir et continuer dans Atelier, chez toi ou chez quelqu’un d’autre.</div></div></button>
      <button class="item" data-x="photo">${svg('photo')}<div><div class="t">Photo du rendu</div><div class="s">Image de la vue actuelle, pour Insta ou un client.</div></div></button>
    </div><div class="row"><button class="btn ghost" data-close>Fermer</button></div>`, root => {
    root.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { closeModal(); doShare(b.dataset.x); });
  });
}
async function doShare(kind) {
  if (!engine.content.children.length && kind !== 'photo') { toast('La scène est vide'); return; }
  let file;
  try {
    toast('Préparation du fichier…', 15000);
    await new Promise(r => setTimeout(r, 30));
    file = kind === 'glb' ? await exportGLB(engine) : kind === 'usdz' ? await exportUSDZ(engine) : kind === 'project' ? exportProject(engine) : kind === 'code' ? await exportCode(engine) : kind === 'module' ? exportModule(engine) : await screenshot(engine);
    $('#toast').hidden = true;
  } catch (e) { console.error(e); toast('Export impossible : ' + (e.message || e), 5000); return; }
  // le partage doit partir d'un nouveau geste (exigence de Safari) : on propose les actions dans une fenêtre
  const url = URL.createObjectURL(file);
  const sizeMo = (file.size / 1048576).toFixed(1).replace('.', ',');
  const isImg = kind === 'photo';
  const preview = kind === 'usdz' ? URL.createObjectURL(await screenshot(engine)) : '';
  openModal(`<h2>Fichier prêt</h2><p><b>${esc(file.name)}</b> · ${sizeMo} Mo</p>
    ${isImg ? `<img src="${url}" alt="" style="width:100%;max-height:34vh;object-fit:cover;border-radius:14px;margin:6px 0 4px;display:block">` : ''}
    ${kind === 'usdz' ? `<p style="margin-bottom:6px">Touche l’image pour poser ta création dans ta pièce, en réalité augmentée :</p><a rel="ar" href="${url}" style="display:block"><img src="${preview}" alt="Voir en réalité augmentée" style="width:100%;max-height:30vh;object-fit:cover;border-radius:14px;display:block;border:1px solid rgba(226,196,142,.5)"></a>` : ''}
    <div class="list">
      ${navigator.canShare?.({ files: [file] }) ? `<button class="item" id="xShare">${svg('share')}<div><div class="t">Envoyer…</div><div class="s">Mail, Messages, AirDrop, WhatsApp, Fichiers</div></div></button>` : ''}
      <a class="item" id="xSave" href="${url}" download="${esc(file.name)}">${svg('file')}<div><div class="t">Enregistrer</div><div class="s">Dans Fichiers ou Téléchargements</div></div></a>
    </div><div class="row"><button class="btn ghost" data-close>Fermer</button></div>`, root => {
    root.querySelector('#xShare')?.addEventListener('click', async () => {
      try { await navigator.share({ files: [file], title: 'Ma création Atelier' }); closeModal(); }
      catch (e) { if (e.name !== 'AbortError') toast('Partage impossible, utilise Enregistrer', 3500); }
    });
  });
  setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
}

/* ---------- menu ---------- */
function openMenu() {
  openModal(`<h2>Atelier</h2>
    <div class="optrow"><span>Fond</span><div class="seg" id="mBg"><button data-v="studio">Studio</button><button data-v="camera">Caméra</button></div></div>
    <div class="optrow"><span>Caméra</span><div class="seg" id="mFacing"><button data-v="user">Avant</button><button data-v="environment">Arrière</button></div></div>
    <div class="optrow"><span>Murs qui s’effacent</span><div class="seg" id="mCut"><button data-v="1">Oui</button><button data-v="0">Non</button></div></div>
    <div class="optrow"><span>Sons de confirmation</span><div class="seg" id="mSound"><button data-v="1">Oui</button><button data-v="0">Non</button></div></div>
    <div class="optrow"><span>Grille au sol</span><div class="seg" id="mGrid"><button data-v="1">Oui</button><button data-v="0">Non</button></div></div>
    <div class="list" style="margin-top:14px">
      <button class="item" data-m="jarvis">${svg('sparkle')}<div><div class="t">Cerveau Jarvis</div><div class="s">${brain.key ? 'Actif. Changer de clé ou de modèle.' : 'Créer n’importe quoi à partir d’une phrase.'}</div></div></button>
      <button class="item" data-m="walk">${svg('walk')}<div><div class="t">Visiter</div><div class="s">Te promener dans ta création à hauteur d’yeux.</div></div></button>
      <button class="item" data-m="frame">${svg('frame')}<div><div class="t">Vue d’ensemble</div></div></button>
      <button class="item" data-m="open">${svg('open')}<div><div class="t">Ouvrir un projet</div><div class="s">Un fichier .atelier reçu ou enregistré.</div></div></button>
      <button class="item" data-m="new">${svg('plus')}<div><div class="t">Nouveau projet</div><div class="s">Repartir d’une scène vide.</div></div></button>
      <button class="item" data-m="help">${svg('help')}<div><div class="t">Mode d’emploi</div></div></button>
      <button class="item" data-m="legal">${svg('info')}<div><div class="t">Infos légales & confidentialité</div></div></button>
      ${hasConsent() ? `<button class="item" data-m="revoke">${svg('camera')}<div><div class="t">Retirer mon consentement caméra & micro</div></div></button>` : ''}
    </div><div class="row"><button class="btn ghost" data-close>Fermer</button></div>`, root => {
    const seg = (id, val, fn) => { const s = root.querySelector(id); s.querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.dataset.v === String(val)); b.onclick = () => { s.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); fn(b.dataset.v); }; }); };
    seg('#mBg', engine.backdrop, v => setBackdrop(v));
    seg('#mFacing', facing, async v => { facing = v; const had = !!stream; stopCamera(); if (had) { try { await startCamera(); if (hands?.active) hands.mirror = facing === 'user'; } catch (e) { toast(e.message); } } });
    seg('#mCut', engine.cutaway ? 1 : 0, v => engine.cutaway = v === '1');
    seg('#mSound', soundOn ? 1 : 0, v => { soundOn = v === '1'; try { localStorage.setItem('atelier:son', v); } catch { } if (soundOn) playTick(); });
    seg('#mGrid', engine.showGrid === false ? 0 : 1, v => { engine.showGrid = v === '1'; engine.applyBackdrop(); });
    root.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
      const m = b.dataset.m; closeModal();
      if (m === 'jarvis') brainSetup();
      else if (m === 'walk') startWalk(); else if (m === 'frame') engine.frameAll();
      else if (m === 'open') $('#fileInput').click();
      else if (m === 'new') { engine.clear(); toast('Nouveau projet'); }
      else if (m === 'help') showHelp(); else if (m === 'legal') showLegal();
      else if (m === 'revoke') { setConsent(false); if (hands?.active) toggleHands(); voice?.stop(); stopCamera(); setBackdrop('studio'); toast('Consentement retiré, caméra et micro coupés'); }
    });
  });
}
async function setBackdrop(v) {
  if (v === 'camera') {
    if (!hasConsent() && !(await askConsent())) return;
    try { await startCamera(); } catch (e) { toast(e.name === 'NotAllowedError' ? 'Caméra refusée dans les réglages.' : e.message); return; }
  } else if (!hands?.active) stopCamera();
  engine.setBackdrop(v); document.body.classList.toggle('backdrop-camera', v === 'camera'); updatePip();
}
function showHelp() {
  openModal(`<h2>Mode d’emploi</h2>
    <h3>Au doigt</h3><ul><li><b>Touche</b> un élément pour le sélectionner, puis <b>glisse-le</b> pour le déplacer.</li><li><b>Deux doigts</b> sur un élément sélectionné : agrandir et pivoter. Sans sélection : zoomer et déplacer la vue.</li><li><b>Un doigt dans le vide</b> : tourner autour de la scène.</li><li>Touche une <b>partie</b> précise (le tissu d’un canapé, le sol d’une pièce) pour lui donner une matière.</li></ul>
    <h3>Aux mains</h3><ul><li>Bouton ${svg('hand').replace('<svg', '<svg style="width:16px;height:16px;vertical-align:-3px;stroke:#E2C48E;fill:none;stroke-width:1.6"')} : pouce et index uniquement. Viser avec l’index, pincer-relâcher pour toucher, pincer-glisser pour déplacer ou tourner la vue, écarter pouce et index pour zoomer, deux mains qui pincent pour la taille et la rotation.</li>
      <li><b>Modeler</b> : sélectionne une forme d’argile, un rocher ou un terrain, puis <b>Modeler</b>. Glisse le doigt sur la matière : gonfler, creuser, étirer, lisser, aplatir, pincer, avec symétrie.</li></ul>
    <h3>À la voix</h3><ul><li>« Crée une pièce de 6 sur 4 », « ajoute un canapé », « en velours vert », « le sol en marbre noir »</li><li>« Plus grand », « tourne », « duplique », « supprime », « annule »</li><li>« Ambiance soir », « style Riviera », « propose-moi quelque chose », « visite »</li></ul>
    <h3>Écran lié</h3><p>Sur l’ordi, ouvre l’adresse d’Atelier suivie de <span class="kbd">#ecran</span>. Un code s’affiche : tape-le dans ${svg('screen').replace('<svg', '<svg style="width:16px;height:16px;vertical-align:-3px;stroke:#E2C48E;fill:none;stroke-width:1.6"')} sur l’iPhone. Tout ce que tu crées s’affiche en direct.</p>
    <h3>Installer</h3><p>Dans Safari : bouton Partager → <b>Sur l’écran d’accueil</b>. Atelier s’ouvre alors en plein écran comme une vraie appli.</p>
    <div class="row"><button class="btn" data-close>Compris</button></div>`);
}

/* ---------- visite ---------- */
function startWalk() { engine.startWalk(); document.body.classList.add('walking'); $('#walkUI').hidden = false; updateInset(); }
$('#walkExit').onclick = () => { engine.stopWalk(); document.body.classList.remove('walking'); $('#walkUI').hidden = true; updateInset(); };
setupJoystick(engine, $('#joystick'));

/* ---------- import ---------- */
$('#fileInput').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { engine.load(await readProjectFile(f)); engine.frameAll(); toast('Projet ouvert'); renderTray(); }
  catch (err) { toast(err.message || 'Fichier illisible', 4000); }
};

/* ---------- écran lié ---------- */
let link = null, linkT = null, camT = 0, linkCode = null, linkManualOff = false;
// connexion qui se rétablit toute seule si le réseau ou la veille la coupe
async function linkConnect(c, quiet) {
  link = await connectTo(c, st => {
    if (st !== 'closed') return;
    link = null; setStatus();
    if (linkManualOff) return;
    toast('Écran lié perdu, reconnexion…', 2500);
    let n = 0; const retry = async () => { if (link || linkManualOff || ++n > 20) { if (!link && !linkManualOff) toast('Écran déconnecté'); return; } try { await linkConnect(c, true); toast('Écran reconnecté'); } catch { setTimeout(retry, 3000); } };
    setTimeout(retry, 1200);
  });
  linkCode = c; linkManualOff = false; setStatus(); keepAwake(true); sendScene();
  clearInterval(linkConnect.ping); linkConnect.ping = setInterval(() => link?.send({ t: 'ping' }), 4000);
}
function openLink() {
  const url = location.origin + location.pathname + '#ecran';
  if (link) {
    openModal(`<h2>Écran lié</h2><p>Connecté. Tout ce que tu crées s’affiche en direct sur l’autre écran.</p><div class="row"><button class="btn ghost" id="lkOff">Déconnecter</button><button class="btn" data-close>OK</button></div>`, r => r.querySelector('#lkOff').onclick = () => { linkManualOff = true; link.peer.destroy(); link = null; setStatus(); closeModal(); toast('Écran délié'); if (!needAwake()) keepAwake(false); });
    return;
  }
  openModal(`<h2>Lier un écran</h2>
    <p>1. Sur l’ordinateur, la TV ou une tablette, ouvre :<br><b style="user-select:all;-webkit-user-select:all;word-break:break-all">${esc(url)}</b></p>
    <p>2. Un code de 4 caractères s’affiche. Tape-le ici :</p>
    <input class="field" id="lkCode" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="····">
    <div class="row"><button class="btn" id="lkGo">Connecter</button><button class="btn ghost" id="lkCopy">Copier l’adresse</button><button class="btn ghost" data-close>Fermer</button></div>`, root => {
    const inp = root.querySelector('#lkCode'); setTimeout(() => inp.focus(), 100);
    root.querySelector('#lkCopy').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Adresse copiée'); } catch { toast(url, 6000); } };
    root.querySelector('#lkGo').onclick = async () => {
      const c = inp.value.trim(); if (c.length !== 4) { toast('Le code fait 4 caractères'); return; }
      const btn = root.querySelector('#lkGo'); btn.disabled = true; btn.textContent = 'Connexion…';
      try {
        await linkConnect(c);
        closeModal(); toast('Écran lié : il affiche ta création en direct');
      } catch (e) { btn.disabled = false; btn.textContent = 'Connecter'; toast(e.message || 'Connexion impossible', 4500); }
    };
  });
}
function sendScene() { if (!link) return; clearTimeout(linkT); linkT = setTimeout(() => link?.send({ t: 'scene', data: engine.serialize() }), 120); }
engine.addEventListener('frame', () => {
  if (!link) return;
  const now = performance.now();
  if (now - camT > 90) {
    camT = now; const c = engine.camera;
    link.send({ t: 'cam', p: c.position.toArray(), q: c.quaternion.toArray(), fov: c.fov });
    // pendant un déplacement continu (main, doigt), on envoie aussi la transformation de l'élément
    const s = engine.selected; if (s) link.send({ t: 'xf', id: s.userData.id, p: s.position.toArray(), r: s.rotation.y, s: s.scale.toArray() });
  }
});

/* ---------- autosauvegarde ---------- */
let saveT;
engine.addEventListener('change', () => {
  $('#btnUndo').disabled = engine.history.length < 2; $('#btnRedo').disabled = !engine.future.length;
  if (isDisplay) return;
  clearTimeout(saveT); saveT = setTimeout(() => autosave(engine), 400);
  sendScene();
});

/* ---------- boutons ---------- */
$('#btnUndo').onclick = () => engine.undo();
$('#btnRedo').onclick = () => engine.redo();
$('#btnHands').onclick = toggleHands;
$('#btnVoice').onclick = toggleVoice;
$('#btnLink').onclick = openLink;
$('#btnShare').onclick = openExport;
$('#btnMenu').onclick = openMenu;

/* ---------- démarrage ---------- */
function welcome() {
  openModal(`<div class="logo big" style="font-size:52px">Atelier</div>
    <p style="margin-top:10px">Un studio blanc, sans limite. Modèle la matière comme de l’argile, fais naître des paysages, des villes, des personnages, des vêtements… <b>au doigt, à la main ou à la voix</b>.</p>
    <p>Une boule d’argile t’attend : touche-la, puis <b>Modeler</b> pour la travailler. Tout le reste est dans la bibliothèque en bas.</p>
    <div class="row"><button class="btn" data-close>Entrer dans l’atelier</button><button class="btn ghost" id="wHelp">Mode d’emploi</button></div>
    <p style="font-size:12px;color:rgba(239,234,225,.38);margin-top:16px">En continuant, tu acceptes les <a class="link" href="#" data-legal="cgu">CGU</a>. La caméra et le micro ne seront activés qu’avec ton accord. <a class="link" href="#" data-legal="mentions">Mentions légales</a> · <a class="link" href="#" data-legal="confidentialite">Confidentialité</a> · <a class="link" href="#" data-legal="pi">Propriété intellectuelle</a></p>`, root => {
    root.querySelector('#wHelp').onclick = showHelp;
    root.querySelectorAll('[data-legal]').forEach(a => a.onclick = e => { e.preventDefault(); showLegal(a.dataset.legal); });
  });
}

if (isDisplay) startDisplay();
else {
  setupInput(engine, $('#scene'), ui);
  renderTabs(); renderTray();
  const saved = restore();
  if (saved && saved.items?.length) { try { engine.load(saved, { record: false }); engine.history = [JSON.stringify(engine.serialize())]; } catch { loadTemplate('sculpture', { quiet: true }); } }
  else loadTemplate('sculpture', { quiet: true });
  engine.dispatchEvent(new Event('change'));
  let first = true; try { first = !localStorage.getItem('atelier:seen'); localStorage.setItem('atelier:seen', '1'); } catch { }
  if (first) welcome();
}

async function startDisplay() {
  document.body.classList.add('display');
  $('#displayUI').hidden = false; keepAwake(true);
  setupInput(engine, $('#scene'), ui);
  engine.selBox.visible = false;
  let follow = true, remote = null;
  $('#displayFollow').onclick = () => { follow = !follow; $('#displayFollow').textContent = 'Suivre la vue de l’iPhone : ' + (follow ? 'oui' : 'non'); };
  const baseUpdate = engine.updateCamera.bind(engine);
  engine.updateCamera = dt => {
    if (follow && remote) {
      engine.camera.position.lerp(new THREE.Vector3(...remote.p), 0.35);
      engine.camera.quaternion.slerp(new THREE.Quaternion(...remote.q), 0.35);
      if (Math.abs(engine.camera.fov - remote.fov) > 0.1) { engine.camera.fov = remote.fov; engine.camera.updateProjectionMatrix(); }
    } else baseUpdate(dt);
  };
  try {
    await hostDisplay(c => $('#displayCode').textContent = c, msg => {
      if (msg.t === 'scene') { engine.load(msg.data, { record: false, keepCamera: true }); engine.setSelection(null); $('#displayWait').hidden = true; $('#displayLive').hidden = false; }
      else if (msg.t === 'cam') remote = msg;
      else if (msg.t === 'xf') { const g = engine.content.children.find(x => x.userData.id === msg.id); if (g) { g.position.fromArray(msg.p); g.rotation.y = msg.r; g.scale.fromArray(msg.s); } }
    }, st => { if (st === 'waiting') { $('#displayWait').hidden = false; $('#displayLive').hidden = true; } });
  } catch (e) { $('#displayCode').textContent = '—'; $('#displayWait').querySelector('.muted').textContent = 'Connexion au service de liaison impossible : ' + (e.message || e) + '. Recharge la page.'; }
}

// enregistrement du service hors ligne (installation sur l'écran d'accueil)
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
