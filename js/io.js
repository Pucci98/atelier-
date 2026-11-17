// Atelier — exports 3D (GLB, USDZ), fichier projet, captures, partage
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
  if (data.app !== 'atelier') throw new Error('Ce fichier ne vient pas d’Atelier.');
  return data;
}

const KEY = 'atelier:autosave';
export function autosave(engine) { try { localStorage.setItem(KEY, JSON.stringify(engine.serialize())); } catch { } }
export function restore() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch { return null; } }
