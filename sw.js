// Atelier — service hors ligne
// Fichiers de l'appli : réseau d'abord (toujours la dernière version), cache si pas de connexion.
// Modèle de suivi des mains et polices : cache d'abord (lourds et stables).
const CACHE = 'atelier-v24';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === location.origin;
  const heavy = url.hostname === 'storage.googleapis.com' || url.hostname.endsWith('gstatic.com') || url.hostname === 'fonts.googleapis.com' || (same && /\/lib\/(mediapipe|three)\//.test(url.pathname));
  if (!same && !heavy) return;
  if (heavy) {
    e.respondWith(caches.open(CACHE).then(async c => (await c.match(req)) || fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; })));
  } else {
    e.respondWith(fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return r; }).catch(() => caches.match(req)));
  }
});
