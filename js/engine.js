// ALMYGO — moteur 3D : scène, caméra, ambiances, éléments, sélection, historique
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { material, PALETTES, cloneMaterial } from './materials.js';
import { getItem } from './library.js';
import { Sculptor, packSculpt, unpackSculpt } from './sculpt.js';

const lookCache = {};
const ROLES = ['sol', 'mur', 'mobilier', 'textile', 'metal', 'verre', 'corps', 'vetement', 'forme', 'terrain', 'roche', 'batiment', 'toit', 'trottoir', 'route', 'herbe', 'marquage'];
const DEFAULT_MATS = { sol: 'chene', mur: 'enduit', mobilier: 'chene', textile: 'lin', metal: 'acier-noir', verre: 'verre', corps: 'mannequin', vetement: 'lin', forme: 'argile', terrain: 'terrain', roche: 'roche', batiment: 'platre', toit: 'argile-grise', trottoir: 'beton-cire', route: 'asphalte', herbe: 'herbe', marquage: '#ecebe6' };
export { DEFAULT_MATS };

export class Engine extends EventTarget {
  constructor(canvas) {
    super();
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.03, 12000);
    this.content = new THREE.Group(); this.content.name = 'Création'; this.scene.add(this.content);
    this.helpers = new THREE.Group(); this.scene.add(this.helpers);

    const pm = new THREE.PMREMGenerator(r);
    this.envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTex;

    // orbite
    this.orbit = { target: new THREE.Vector3(0, 0.8, 0), radius: 9, az: 0.75, pol: 1.05, goal: null };
    this.walk = null; // mode visite

    // sol studio + ombre
    this.ground = new THREE.Mesh(new THREE.CircleGeometry(6000, 128), new THREE.MeshStandardMaterial({ color: 0xEFEDE9, roughness: 1 }));
    this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true; this.ground.name = 'sol-studio';
    this.scene.add(this.ground);
    this.shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.ShadowMaterial({ opacity: 0.32 }));
    this.shadowCatcher.rotation.x = -Math.PI / 2; this.shadowCatcher.position.y = 0.001; this.shadowCatcher.receiveShadow = true; this.shadowCatcher.visible = false;
    this.scene.add(this.shadowCatcher);
    this.grid = new THREE.GridHelper(40, 40, 0x000000, 0x000000); this.grid.material.opacity = 0.06; this.grid.material.transparent = true; this.grid.position.y = 0.002; this.showGrid = false;
    this.scene.add(this.grid);

    // lumières
    this.hemi = new THREE.HemisphereLight(0xfff6ea, 0x8a8174, 0.6); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0dc, 2.6);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = sc.bottom = -14; sc.right = sc.top = 14; sc.near = 1; sc.far = 60;
    this.sun.shadow.bias = -0.0003; this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    // sélection
    this.selected = null; this.selectedRole = null;
    this.selBox = new THREE.Box3Helper(new THREE.Box3(), 0x3FA9EE); this.selBox.visible = false; this.helpers.add(this.selBox);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.98, 1, 96), new THREE.MeshBasicMaterial({ color: 0x3FA9EE, transparent: true, opacity: 0.9, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; ring.visible = false; this.selRing = ring; this.helpers.add(ring);
    this.hoverBox = new THREE.Box3Helper(new THREE.Box3(), 0x7CCBFF); this.hoverBox.material.transparent = true; this.hoverBox.material.opacity = 0.55; this.hoverBox.visible = false; this.helpers.add(this.hoverBox);
    this.hovered = null;

    this.palette = { ...DEFAULT_MATS };
    this.ambiance = 'jour'; this.backdrop = 'studio';
    this.history = []; this.future = []; this.uid = 1;
    this.raycaster = new THREE.Raycaster();
    this.clock = new THREE.Clock();
    this.cutaway = true;
    this.layers = [{ id: 'l1', name: 'Calque 1', visible: true, locked: false }]; this.activeLayer = 'l1';
    this.lastActivity = performance.now();
    this.sculptor = new Sculptor(this);

    this.setAmbiance('soir', false);
    this.setBackdrop('studio');
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    r.setAnimationLoop(() => this.frame());
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.vw = w; this.vh = h; this.applyOffset(true);
  }
  // décale le centre de l'image pour que la scène reste visible au-dessus des panneaux
  setInset(px) { this.insetGoal = px; }
  applyOffset(force) {
    this.inset ??= 0; this.insetGoal ??= 0;
    const prev = this.inset;
    this.inset += (this.insetGoal - this.inset) * 0.18;
    if (Math.abs(this.insetGoal - this.inset) < 0.5) this.inset = this.insetGoal;
    if (!force && prev === this.inset) return;
    if (Math.abs(this.inset) < 0.5) { this.camera.clearViewOffset(); this.camera.updateProjectionMatrix(); return; }
    else this.camera.setViewOffset(this.vw, this.vh, 0, this.inset, this.vw, this.vh);
    this.camera.updateProjectionMatrix();
  }

  /* ---------- caméra ---------- */
  orbitBy(dAz, dPol) { const o = this.orbit; o.goal = null; o.az -= dAz; o.pol = THREE.MathUtils.clamp(o.pol - dPol, 0.08, 1.52); }
  zoomBy(f) { const o = this.orbit; o.goal = null; o.radius = THREE.MathUtils.clamp(o.radius * f, 0.3, 4000); }
  panBy(dx, dy) {
    const o = this.orbit; o.goal = null;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0);
    const fwd = new THREE.Vector3(-Math.sin(o.az), 0, -Math.cos(o.az));
    const k = o.radius * 0.0016;
    o.target.addScaledVector(right, -dx * k).addScaledVector(fwd, dy * k);
  }
  frameAll() {
    const b = new THREE.Box3().setFromObject(this.content);
    if (b.isEmpty()) { this.orbit.goal = { target: new THREE.Vector3(0, 0.8, 0), radius: 9 }; return; }
    const s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    this.orbit.goal = { target: new THREE.Vector3(c.x, Math.min(c.y, Math.max(1.2, s.y * 0.3)), c.z), radius: THREE.MathUtils.clamp(Math.max(s.x, s.z, s.y * 1.4) * 1.45 / Math.min(1, Math.pow(this.camera.aspect, 0.75)), 1.2, 4000) };
  }
  focus(obj, k = 2.4) {
    const b = new THREE.Box3().setFromObject(obj); const s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    this.orbit.goal = { target: c, radius: THREE.MathUtils.clamp(Math.max(s.x, s.y, s.z) * k, 0.8, 4000) };
  }

  updateCamera(dt) {
    const o = this.orbit;
    if (this.walk) {
      const w = this.walk;
      const sp = (w.speed || 1.8) * dt * (Math.hypot(w.move.x, w.move.y) > 0.92 ? 2.2 : 1);
      const fwd = new THREE.Vector3(-Math.sin(w.yaw), 0, -Math.cos(w.yaw)), right = new THREE.Vector3(Math.cos(w.yaw), 0, -Math.sin(w.yaw));
      w.pos.addScaledVector(fwd, w.move.y * sp).addScaledVector(right, w.move.x * sp);
      // on suit le sol : terrain, routes, sols (pas les meubles)
      if (!w.ground || performance.now() - w.groundT > 1500) { w.groundT = performance.now(); w.ground = []; this.content.traverse(o => { if (o.isMesh && (o.userData.sculpt === 'y' || ['sol', 'terrain', 'route', 'trottoir', 'herbe'].includes(o.userData.role))) w.ground.push(o); }); }
      if (w.ground.length) {
        this.raycaster.set(new THREE.Vector3(w.pos.x, 5000, w.pos.z), new THREE.Vector3(0, -1, 0));
        const h = this.raycaster.intersectObjects(w.ground, false)[0];
        const gy = h ? h.point.y : 0; w.pos.y += (gy + 1.62 - w.pos.y) * 0.25;
      }
      this.camera.position.lerp(w.pos, 0.35);
      const look = new THREE.Vector3(-Math.sin(w.yaw) * Math.cos(w.pitch), Math.sin(w.pitch), -Math.cos(w.yaw) * Math.cos(w.pitch));
      this.camera.lookAt(this.camera.position.clone().add(look));
      return;
    }
    if (o.goal) {
      o.target.lerp(o.goal.target, 0.12); o.radius += (o.goal.radius - o.radius) * 0.12;
      if (o.target.distanceTo(o.goal.target) < 0.01 && Math.abs(o.radius - o.goal.radius) < 0.01) o.goal = null;
    }
    const p = new THREE.Vector3(
      o.target.x + o.radius * Math.sin(o.pol) * Math.sin(o.az),
      o.target.y + o.radius * Math.cos(o.pol),
      o.target.z + o.radius * Math.sin(o.pol) * Math.cos(o.az));
    this.camera.position.lerp(p, 0.5);
    this.camera.lookAt(o.target);
  }

  startWalk() {
    const o = this.orbit;
    const b = new THREE.Box3().setFromObject(this.content);
    const c = b.isEmpty() ? new THREE.Vector3() : b.getCenter(new THREE.Vector3());
    const sz = b.isEmpty() ? new THREE.Vector3(4, 0, 4) : b.getSize(new THREE.Vector3());
    // on entre par le côté d'où l'on regardait, face au centre
    const ext = Math.max(0.5, Math.abs(Math.sin(o.az)) * sz.x / 2 + Math.abs(Math.cos(o.az)) * sz.z / 2 - 0.8);
    const start = new THREE.Vector3(c.x + Math.sin(o.az) * ext, 1.62, c.z + Math.cos(o.az) * ext);
    this.walk = { pos: start, yaw: o.az, pitch: -0.08, move: { x: 0, y: 0 }, speed: THREE.MathUtils.clamp(Math.max(sz.x, sz.z) / 12, 1.8, 25) };
    this.camera.position.copy(start);
    this.setCeilings(true);
    this.camera.fov = 68; this.camera.updateProjectionMatrix();
    this.setSelection(null);
  }
  setCeilings(v) { this.content.traverse(o => { if (o.userData.ceiling) o.visible = v; }); }
  stopWalk() { this.setCeilings(false); this.walk = null; this.camera.fov = 50; this.camera.updateProjectionMatrix(); }

  /* ---------- ambiances ---------- */
  setAmbiance(name, record = true) {
    this.ambiance = name;
    const A = {
      jour: { sky: 0xEEF2F6, ground: 0xD3E3EF, sun: [0xfff0dc, 2.6], dir: [6, 11, 5], hemi: 0.65, env: 0.9, exp: 1.0, lamps: 0.6 },
      doree: { sky: 0xE7C9A2, sun: [0xffb46b, 3.2], dir: [10, 3.2, 2], hemi: 0.35, env: 0.55, exp: 1.05, lamps: 0.9 },
      soir: { sky: 0x16233A, ground: 0x203353, sun: [0x8FB0F0, 1.1], dir: [-4, 9, -3], hemi: 0.42, env: 0.45, exp: 1.1, lamps: 1.6 },
      studio: { sky: 0xF3F6F9, ground: 0xCFE1F0, sun: [0xffffff, 1.7], dir: [4, 12, 7], hemi: 0.85, env: 1.1, exp: 1.0, lamps: 0.5 },
      galerie: { sky: 0xDADCDE, sun: [0xf4f7ff, 1.2], dir: [0, 14, 2], hemi: 0.5, env: 0.8, exp: 1.0, lamps: 1.2 },
    }[name] || {};
    this.sun.color.set(A.sun[0]); this.sun.intensity = A.sun[1];
    this.sunDir = new THREE.Vector3(...A.dir).normalize();
    this.hemi.intensity = A.hemi; this.scene.environmentIntensity = A.env;
    this.renderer.toneMappingExposure = A.exp;
    this.lampFactor = A.lamps;
    this.skyColor = new THREE.Color(A.sky); this.groundColor = A.ground != null ? new THREE.Color(A.ground) : null;
    this.applyBackdrop();
    this.updateLamps();
    if (record) this.commit();
  }
  setBackdrop(kind) { this.backdrop = kind; this.applyBackdrop(); }
  applyBackdrop() {
    const cam = this.backdrop === 'camera';
    this.scene.background = cam ? null : this.skyColor;
    this.scene.fog = cam ? null : new THREE.Fog(this.skyColor, 60, 400);
    this.ground.visible = !cam; this.shadowCatcher.visible = cam;
    this.grid.visible = !cam && this.showGrid !== false;
    if (!cam) {
      // sol et ciel de la même teinte : un studio sans horizon, sans limite
      // sol bleu clair : les créations (souvent blanches) s'en détachent nettement
      const g = this.groundColor ? this.groundColor.clone() : this.skyColor.clone().offsetHSL(0, 0, this.ambiance === 'soir' ? 0.02 : -0.012);
      this.ground.material.color.copy(g);
    }
  }
  updateLamps() {
    this.content.traverse(o => { if (o.isLight && o.userData.lamp) { o.userData.base ??= o.intensity; o.intensity = o.userData.base * this.lampFactor; } });
  }

  /* ---------- éléments ---------- */
  build(type, params) {
    const def = getItem(type);
    const p = { ...def.params, ...(params || {}) };
    const g = def.build(p);
    g.userData.type = type; g.userData.params = p;
    return g;
  }

  add(type, opts = {}) {
    const def = getItem(type); if (!def) return null;
    const g = this.build(type, opts.params);
    g.userData.id = opts.id ?? this.uid++;
    if (opts.id && opts.id >= this.uid) this.uid = opts.id + 1;
    g.userData.mats = { ...(opts.mats || {}) };
    g.userData.layer = opts.layer && this.layers.some(l => l.id === opts.layer) ? opts.layer : this.activeLayer;
    g.userData.free = !!opts.free;
    if (opts.pos) g.position.fromArray(opts.pos);
    else {
      // placer au centre de la vue, sur le sol, en évitant d'empiler exactement
      const t = this.orbit.target; g.position.set(t.x, 0, t.z);
    }
    if (opts.rotY != null) g.rotation.y = opts.rotY;
    else if (def.cat !== 'Espaces') g.rotation.y = Math.round(this.orbit.az / (Math.PI / 2)) * (Math.PI / 2);
    if (!opts.pos && def.cat !== 'Espaces' && !def.big && !def.garment && !['tapis', 'suspension', 'spot'].includes(type)) this.findFreeSpot(g);
    if (opts.scale) g.scale.fromArray(opts.scale);
    // vêtement : s'ajuste sur le personnage ou le buste sélectionné
    if (def.garment && !opts.pos && this.selected) {
      const s = this.selected; const st = s.userData.type || '';
      if (st.startsWith('perso') || st === 'buste') {
        g.position.copy(s.position); g.rotation.y = s.rotation.y;
        const k = (s.userData.params?.taille || 1.75) / 1.75, c = s.userData.params?.carrure || 1;
        g.scale.set(k * c * 1.04, k, k * c * 1.04);
        if (st === 'buste') { g.scale.multiplyScalar(1); }
      }
    }
    if (!opts.pos && !def.big) { this.content.updateMatrixWorld(true); g.position.y = this.groundY(g.position.x, g.position.z); }
    if (opts.sculpt) { const m = this.sculptor.meshOf(g); if (m && unpackSculpt(m, opts.sculpt)) m.userData.sculpted = true; }
    this.applyMaterials(g);
    this.content.add(g);
    this.updateLamps();
    this.applyLayer(g);
    if (!opts.silent) { this.setSelection(g); this.commit(); }
    return g;
  }

  // altitude du relief (terrains, montagnes) sous un point
  groundY(x, z, except) {
    const ground = []; this.content.traverse(o => { if (o.isMesh && o.userData.sculpt === 'y') { let r = o; while (r.parent && r.parent !== this.content) r = r.parent; if (r !== except) ground.push(o); } });
    if (!ground.length) return 0;
    this.raycaster.set(new THREE.Vector3(x, 10000, z), new THREE.Vector3(0, -1, 0));
    const h = this.raycaster.intersectObjects(ground, false)[0];
    return h ? Math.max(0, h.point.y) : 0;
  }

  // cherche une place libre autour du centre de la vue, sans chevaucher les autres éléments et si possible dans la pièce
  findFreeSpot(g) {
    const FLOORS = ['piece', 'sol', 'tapis', 'estrade', 'plaque'];
    const boxes = [], rooms = [];
    for (const o of this.content.children) {
      const t = o.userData.type; const b = new THREE.Box3().setFromObject(o);
      if (t === 'piece') rooms.push(b);
      if (FLOORS.includes(t) || getItem(t)?.garment || t === 'suspension' || t === 'spot') continue;
      boxes.push(b.expandByScalar(0.06));
    }
    g.updateMatrixWorld(true);
    const own = new THREE.Box3().setFromObject(g); const c0 = g.position.clone();
    const half = own.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const room = rooms.find(r => c0.x > r.min.x && c0.x < r.max.x && c0.z > r.min.z && c0.z < r.max.z);
    const fits = p => {
      const b = new THREE.Box3(new THREE.Vector3(p.x - half.x, 0.01, p.z - half.z), new THREE.Vector3(p.x + half.x, half.y * 2, p.z + half.z));
      if (room && (b.min.x < room.min.x + 0.16 || b.max.x > room.max.x - 0.16 || b.min.z < room.min.z + 0.16 || b.max.z > room.max.z - 0.16)) return false;
      return !boxes.some(o => o.intersectsBox(b));
    };
    if (fits(c0)) return;
    for (let r = 0.3; r < 12; r += 0.3) {
      const n = Math.max(8, Math.round(r * 10));
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2;
        const p = new THREE.Vector3(c0.x + Math.cos(a) * r, 0, c0.z + Math.sin(a) * r);
        if (fits(p)) { g.position.x = Math.round(p.x * 20) / 20; g.position.z = Math.round(p.z * 20) / 20; return; }
      }
    }
  }

  rebuild(g, params) {
    const n = this.build(g.userData.type, { ...g.userData.params, ...params });
    n.userData.id = g.userData.id; n.userData.mats = g.userData.mats;
    n.position.copy(g.position); n.rotation.copy(g.rotation); n.scale.copy(g.scale);
    this.applyMaterials(n);
    this.content.remove(g); this.dispose(g);
    this.content.add(n); this.updateLamps();
    if (this.selected === g) this.setSelection(n, this.selectedRole);
    return n;
  }

  applyMaterials(g) {
    g.traverse(o => {
      if (!o.isMesh || !ROLES.includes(o.userData.role)) return;
      const role = o.userData.role;
      const id = g.userData.mats?.[role] || o.userData.fixedMat || this.palette[role] || DEFAULT_MATS[role];
      let m = material(id);
      if (o.userData.look && !g.userData.mats?.[role]) { // finition demandée par Logos (brillant, métal, lumineux)
        const L = o.userData.look, key = id + '|' + [L.r, L.m, L.e].join('|');
        lookCache[key] ||= Object.assign(cloneMaterial(m), {}, L.r != null ? { roughness: L.r } : {}, L.m != null ? { metalness: L.m } : {});
        if (L.e && !lookCache[key].emissive?.getHex()) { lookCache[key].emissive = new THREE.Color(L.e); lookCache[key].emissiveIntensity = 1.5; }
        m = lookCache[key];
      }
      if (o.userData.double && m.side !== THREE.DoubleSide) {
        const key = id + ':double';
        m = material.double?.[key] || (material.double = material.double || {}, material.double[key] = Object.assign(cloneMaterial(m), { side: THREE.DoubleSide }));
      }
      o.material = m;
      if (o.userData.wallNormal) {
        // les murs ont leur propre instance pour pouvoir s'effacer (vue maison de poupée)
        o.material = cloneMaterial(m); o.material.transparent = true; o.material.userData.fadeable = true;
      }
    });
  }

  setPartMaterial(g, role, matId) {
    g.userData.mats = { ...g.userData.mats, [role]: matId };
    this.applyMaterials(g); this.commit();
  }

  applyPalette(pid) {
    const P = PALETTES.find(p => p.id === pid); if (!P) return;
    this.palette = { ...DEFAULT_MATS, ...P.map };
    for (const g of this.content.children) { g.userData.mats = {}; this.applyMaterials(g); }
    this.commit();
  }

  remove(g) {
    if (!g) return;
    this.content.remove(g); this.dispose(g);
    if (this.selected === g) this.setSelection(null);
    this.commit();
  }

  duplicate(g) {
    if (!g) return;
    const d = this.serializeItem(g);
    const off = new THREE.Vector3(0.5, 0, 0.5);
    const n = this.add(d.type, { params: d.params, mats: d.mats, pos: [d.pos[0] + off.x, d.pos[1], d.pos[2] + off.z], rotY: d.rotY, scale: d.scale });
    return n;
  }

  dispose(g) {
    g.traverse(o => { if (o.isMesh) { o.geometry?.dispose(); if (o.material?.userData?.fadeable) o.material.dispose(); } });
  }

  clear(record = true) {
    for (const g of [...this.content.children]) { this.content.remove(g); this.dispose(g); }
    this.setSelection(null);
    if (record) this.commit();
  }

  /* ---------- sélection ---------- */
  // objet visé (pointé du doigt) : simple contour clair
  setHover(g) {
    if (g === this.hovered) { if (g) this.hoverBox.box.setFromObject(g); return; }
    this.hovered = g; this.hoverBox.visible = !!g;
    if (g) this.hoverBox.box.setFromObject(g);
  }
  setSelection(g, role = null) {
    this.touch();
    this.selected = g; this.selectedRole = role;
    this.updateSelectionHelper();
    this.dispatchEvent(new CustomEvent('selection', { detail: { object: g, role } }));
  }
  updateSelectionHelper() {
    const g = this.selected;
    const show = !!g && !this.walk && !this.sculptor?.active;
    this.selBox.visible = show; this.selRing.visible = show;
    if (!g) return;
    this.selBox.box.setFromObject(g);
    const s = this.selBox.box.getSize(new THREE.Vector3()), c = this.selBox.box.getCenter(new THREE.Vector3());
    const r = Math.max(s.x, s.z) * 0.62 + 0.08;
    this.selRing.scale.setScalar(r); this.selRing.position.set(c.x, this.selBox.box.min.y + 0.012, c.z);
  }
  dims(g) {
    const sav = g.rotation.y; g.rotation.y = 0; g.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(g); g.rotation.y = sav; g.updateMatrixWorld(true);
    return b.getSize(new THREE.Vector3());
  }

  /* ---------- lancer de rayon ---------- */
  ndc(x, y) { const r = this.canvas.getBoundingClientRect(); return new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1); }
  layerOf(g) { return this.layers.find(l => l.id === g.userData.layer) || this.layers[0]; }
  applyLayer(g) { g.visible = this.layerOf(g).visible; }
  refreshLayers() { for (const g of this.content.children) this.applyLayer(g); if (this.selected && !this.selected.visible) this.setSelection(null); this.dispatchEvent(new Event('layers')); }
  addLayer(name) { const id = 'l' + Date.now().toString(36); this.layers.push({ id, name: name || 'Calque ' + (this.layers.length + 1), visible: true, locked: false }); this.activeLayer = id; this.commit(); this.refreshLayers(); return id; }
  removeLayer(id) {
    if (this.layers.length < 2) return;
    const fallback = this.layers.find(l => l.id !== id).id;
    for (const g of this.content.children) if (g.userData.layer === id) g.userData.layer = fallback;
    this.layers = this.layers.filter(l => l.id !== id); if (this.activeLayer === id) this.activeLayer = fallback;
    this.commit(); this.refreshLayers();
  }
  moveLayer(id, dir) { const i = this.layers.findIndex(l => l.id === id), j = i + dir; if (j < 0 || j >= this.layers.length) return; [this.layers[i], this.layers[j]] = [this.layers[j], this.layers[i]]; this.commit(); this.refreshLayers(); }
  pick(x, y) {
    this.raycaster.setFromCamera(this.ndc(x, y), this.camera);
    const hits = this.raycaster.intersectObjects(this.content.children, true);
    for (const h of hits) {
      if (!h.object.isMesh || !h.object.visible) continue;
      const m = h.object.material; if (m?.userData?.fadeable && m.opacity < 0.5) continue;
      let o = h.object; while (o.parent && o.parent !== this.content) o = o.parent;
      if (!o.visible || this.layerOf(o).locked) continue; // calque masqué ou verrouillé
      return { object: o, role: h.object.userData.role || null, point: h.point };
    }
    return null;
  }
  // glisser un objet : posé au sol → il glisse sur le sol ; détaché → il suit le doigt dans l'espace (plan face à la caméra)
  dragStart(g, x, y) {
    let plane;
    if (g.userData.free) { const n = this.camera.getWorldDirection(new THREE.Vector3()).negate(); plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, g.position); }
    else plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -g.position.y);
    this.raycaster.setFromCamera(this.ndc(x, y), this.camera);
    const p = new THREE.Vector3(); if (!this.raycaster.ray.intersectPlane(plane, p)) return null;
    return { g, plane, off: g.position.clone().sub(p) };
  }
  dragMove(d, x, y) {
    if (!d) return false;
    this.raycaster.setFromCamera(this.ndc(x, y), this.camera);
    const p = new THREE.Vector3(); if (!this.raycaster.ray.intersectPlane(d.plane, p)) return false;
    const np = p.add(d.off), sn = v => Math.round(v * 20) / 20;
    d.g.position.x = sn(np.x); d.g.position.z = sn(np.z);
    if (d.g.userData.free) d.g.position.y = Math.max(0, sn(np.y));
    this.touch(); return true;
  }
  floorPoint(x, y, height = 0) {
    this.raycaster.setFromCamera(this.ndc(x, y), this.camera);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -height), p) ? p : null;
  }

  /* ---------- historique & sérialisation ---------- */
  serializeItem(g) {
    const it = { id: g.userData.id, type: g.userData.type, params: g.userData.params, mats: g.userData.mats, pos: g.position.toArray().map(v => +v.toFixed(4)), rotY: +g.rotation.y.toFixed(4), scale: g.scale.toArray().map(v => +v.toFixed(4)), layer: g.userData.layer };
    if (g.userData.free) it.free = true;
    const m = this.sculptor.meshOf(g); if (m?.userData.sculpted) it.sculpt = m.userData.packed || (m.userData.packed = packSculpt(m));
    return it;
  }
  serialize() {
    return { app: 'atelier', v: 2, ambiance: this.ambiance, palette: this.palette, layers: this.layers, activeLayer: this.activeLayer, items: this.content.children.map(g => this.serializeItem(g)), camera: { target: this.orbit.target.toArray(), radius: this.orbit.radius, az: this.orbit.az, pol: this.orbit.pol } };
  }
  load(data, { record = true, keepCamera = false } = {}) {
    if (!data || data.app !== 'atelier') throw new Error('Fichier non reconnu');
    const selId = this.selected?.userData.id;
    this.clear(false);
    this.palette = { ...DEFAULT_MATS, ...(data.palette || {}) };
    this.layers = Array.isArray(data.layers) && data.layers.length ? data.layers.map(l => ({ id: String(l.id), name: String(l.name).slice(0, 40), visible: l.visible !== false, locked: !!l.locked })) : [{ id: 'l1', name: 'Calque 1', visible: true, locked: false }];
    this.activeLayer = this.layers.some(l => l.id === data.activeLayer) ? data.activeLayer : this.layers[0].id;
    for (const it of data.items || []) this.add(it.type, { ...it, silent: true });
    this.dispatchEvent(new Event('layers'));
    this.setAmbiance(data.ambiance || 'jour', false);
    if (data.camera && !keepCamera) { const c = data.camera; this.orbit.target.fromArray(c.target); this.orbit.radius = c.radius; this.orbit.az = c.az; this.orbit.pol = c.pol; }
    if (selId != null) { const s = this.content.children.find(g => g.userData.id === selId); if (s) this.setSelection(s); }
    if (record) this.commit();
    else this.dispatchEvent(new Event('change'));
  }
  touch() { this.lastActivity = performance.now(); }
  commit() {
    this.touch();
    const s = JSON.stringify(this.serialize());
    if (this.history[this.history.length - 1] !== s) { this.history.push(s); if (this.history.length > 40) this.history.shift(); this.future = []; }
    this.dispatchEvent(new Event('change'));
  }
  undo() {
    if (this.history.length < 2) return false;
    this.future.push(this.history.pop());
    this.load(JSON.parse(this.history[this.history.length - 1]), { record: false, keepCamera: true });
    return true;
  }
  redo() {
    if (!this.future.length) return false;
    const s = this.future.pop(); this.history.push(s);
    this.load(JSON.parse(s), { record: false, keepCamera: true });
    return true;
  }

  /* ---------- boucle ---------- */
  frame() {
    const idle = performance.now() - this.lastActivity > 2500 && !this.orbit.goal && !this.walk && !document.body.classList.contains('hands-on');
    if (idle && (this._skip = (this._skip || 0) + 1) % 4) return; // au repos : ~15 images/s au lieu de 60
    const raw = this.clock.getDelta(), dt = Math.min(raw, 0.05);
    this.applyOffset();
    // qualité adaptative : on baisse la résolution si l'appareil peine, on la remonte s'il a de la marge
    const Q = this.quality ||= { t: 0, n: 0, pr: Math.min(window.devicePixelRatio, 2), max: Math.min(window.devicePixelRatio, 2) };
    Q.t += raw; Q.n++;
    if (Q.t > 2) {
      const ms = Q.t / Q.n * 1000; let pr = Q.pr;
      if (ms > 26 && pr > 1) pr = Math.max(1, pr - 0.25); else if (ms < 15 && pr < Q.max) pr = Math.min(Q.max, pr + 0.25);
      if (pr !== Q.pr && !document.hidden) { Q.pr = pr; this.renderer.setPixelRatio(pr); this.resize(); }
      Q.t = 0; Q.n = 0;
    }
    this.updateCamera(dt);
    // soleil qui suit la zone de travail (ombres nettes)
    const t = this.walk ? this.camera.position : this.orbit.target;
    this.sun.target.position.set(t.x, 0, t.z);
    const R = this.walk ? 30 : this.orbit.radius;
    const span = THREE.MathUtils.clamp(R * 0.9, 8, 900);
    const sc = this.sun.shadow.camera;
    if (Math.abs(sc.right - span) / span > 0.15) { sc.left = sc.bottom = -span; sc.right = sc.top = span; sc.far = span * 6; sc.updateProjectionMatrix(); }
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDir, span * 2.5);
    if (this.scene.fog) { this.scene.fog.near = Math.max(60, R * 2.2); this.scene.fog.far = Math.max(400, R * 9); }
    // murs qui s'effacent face à la caméra (vue maison de poupée)
    const camDir = new THREE.Vector3(); this.camera.getWorldDirection(camDir);
    const q = new THREE.Quaternion(), n = new THREE.Vector3();
    this.content.traverse(o => {
      const m = o.material; if (!o.isMesh || !m?.userData?.fadeable) return;
      let target = 1;
      if (this.cutaway && !this.walk) {
        o.getWorldQuaternion(q); n.fromArray(o.userData.wallNormal).applyQuaternion(q);
        const wp = o.getWorldPosition(new THREE.Vector3());
        const toCam = this.camera.position.clone().sub(wp);
        if (n.dot(toCam) < 0 && toCam.y < 8 + this.orbit.radius) target = 0.12;
      }
      m.opacity += (target - m.opacity) * 0.2;
      m.depthWrite = m.opacity > 0.95; o.castShadow = m.opacity > 0.5;
    });
    if (this.selected) this.updateSelectionHelper(); else if (this.selBox.visible) this.selBox.visible = this.selRing.visible = false;
    this.dispatchEvent(new CustomEvent('frame', { detail: dt }));
    this.renderer.render(this.scene, this.camera);
  }
}
