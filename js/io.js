// ALMYGO — exports 3D (GLB, USDZ), fichier projet, captures, partage
import * as THREE from 'three';

function stamp() { const d = new Date(); return d.toISOString().slice(0, 16).replace(/[-:T]/g, ''); }

// copie propre de la création (murs opaques, sans aides visuelles ni lumières de travail)
function exportable(engine) {
  const root = engine.content.clone(true);
  root.traverse(o => {
    if (o.isMesh && o.material?.userData?.fadeable) { o.material = o.material.clone(); o.material.opacity = 1; o.material.transparent = false; o.material.depthWrite = true; }
  });
  root.updateMatrixWorld(true);
  return root;
}

export async function exportGLB(engine) {
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const root = exportable(engine);
  const buf = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true, maxTextureSize: 1024 });
  return new File([buf], `atelier-${stamp()}.glb`, { type: 'model/gltf-binary' });
}

export async function exportUSDZ(engine) {
  const { USDZExporter } = await import('three/addons/exporters/USDZExporter.js');
  const root = exportable(engine);
  // l'export USDZ ne gère pas les lumières ni les matériaux physiques avancés : on simplifie
  root.traverse(o => {
    if (o.isMesh && o.material && o.material.isMeshPhysicalMaterial) {
      const m = o.material; const s = new THREE.MeshStandardMaterial({ color: m.color, map: m.map, roughness: m.roughness, metalness: m.metalness, transparent: m.transmission > 0, opacity: m.transmission > 0 ? 0.35 : 1 });
      o.material = s;
    }
  });
  const toRemove = []; root.traverse(o => { if (o.isLight) toRemove.push(o); }); toRemove.forEach(o => o.parent.remove(o));
  const data = await new USDZExporter().parse(root, { quickLookCompatible: true, maxTextureSize: 1024 });
  return new File([data], `atelier-${stamp()}.usdz`, { type: 'model/vnd.usdz+zip' });
}

export function exportProject(engine) {
  const json = JSON.stringify(engine.serialize());
  return new File([json], `creation-${stamp()}.atelier`, { type: 'application/json' });
}

export function screenshot(engine) {
  const sel = [engine.selBox.visible, engine.selRing.visible, engine.grid.visible];
  engine.selBox.visible = engine.selRing.visible = engine.grid.visible = false;
  engine.renderer.render(engine.scene, engine.camera);
  return new Promise(res => engine.canvas.toBlob(b => {
    [engine.selBox.visible, engine.selRing.visible, engine.grid.visible] = sel;
    res(new File([b], `atelier-${stamp()}.png`, { type: 'image/png' }));
  }, 'image/png'));
}

// partage natif (Mail, Messages, AirDrop…) ou téléchargement
export async function share(file, title) {
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title, text: title }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancel'; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a'); a.href = url; a.download = file.name; a.rel = 'noopener';
  if (file.name.endsWith('.usdz')) a.rel = 'ar';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'downloaded';
}

export async function readProjectFile(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (data.app !== 'atelier') throw new Error('Ce fichier ne vient pas d’ALMYGO.');
  return data;
}

const KEY = 'atelier:autosave';
export function autosave(engine) { try { localStorage.setItem(KEY, JSON.stringify(engine.serialize())); } catch { } }
export function restore() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch { return null; } }

// Export en code : une page web autonome (HTML + JavaScript three.js) qui affiche la création,
// prête à être ouverte, modifiée ou intégrée à un site
export async function exportCode(engine) {
  const glb = await exportGLB(engine);
  const buf = new Uint8Array(await glb.arrayBuffer());
  let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  const b64 = btoa(bin);
  const sky = '#' + (engine.skyColor?.getHexString() || 'f3f6f9');
  const ground = '#' + (engine.ground.material.color.getHexString());
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ma création — ALMYGO</title>
<style>html,body{margin:0;height:100%;background:${sky};overflow:hidden}canvas{display:block}</style>
<script type="importmap">{ "imports": { "three": "https://unpkg.com/three@0.160.0/build/three.module.js", "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/" } }</script>
</head>
<body>
<script type="module">
// Scène créée avec ALMYGO — modifie librement ce code.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// --- rendu
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// --- scène, ambiance et lumière
const scene = new THREE.Scene();
scene.background = new THREE.Color('${sky}');
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.7));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(6, 12, 7); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);
const floor = new THREE.Mesh(new THREE.CircleGeometry(4000, 96), new THREE.MeshStandardMaterial({ color: '${ground}', roughness: 1 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

// --- caméra
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.03, 12000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// --- la création (modèle 3D intégré au fichier, format glTF binaire)
const MODELE = '${b64}';
const bytes = Uint8Array.from(atob(MODELE), c => c.charCodeAt(0));
new GLTFLoader().parse(bytes.buffer, '', gltf => {
  const creation = gltf.scene;
  creation.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(creation);
  // cadrage automatique
  const box = new THREE.Box3().setFromObject(creation), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z) * 1.4 + 0.5;
  camera.position.set(center.x + r * 0.8, center.y + r * 0.6, center.z + r);
  controls.target.copy(center);
  const s = Math.max(size.x, size.z); const sc = sun.shadow.camera; sc.left = sc.bottom = -s; sc.right = sc.top = s; sc.far = s * 8; sc.updateProjectionMatrix();
  sun.position.set(center.x + s, center.y + s * 2, center.z + s); sun.target.position.copy(center); scene.add(sun.target);
});

addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
</script>
</body>
</html>
`;
  return new File([html], glb.name.replace('.glb', '.html'), { type: 'text/html' });
}

// Export en code three.js « pur » : un module JavaScript qui recrée la scène depuis sa description ALMYGO
export function exportModule(engine) {
  const data = engine.serialize();
  const js = `// Scène ALMYGO — description complète, réutilisable dans un projet web
// Chaque élément : type (bibliothèque ALMYGO), paramètres, position (m), rotation (rad), échelle, matières.
export const scene = ${JSON.stringify({ ambiance: data.ambiance, palette: data.palette, items: data.items.map(({ sculpt, ...it }) => it) }, null, 2)};
`;
  return new File([js], `atelier-scene-${Date.now()}.js`, { type: 'text/javascript' });
}
