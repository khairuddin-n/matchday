// Halaman: network-first (supaya HP tidak tertahan di versi lama). Aset: cache-first per versi.
// Data ESPN tidak lewat cache SW (app.js menyimpan data terakhir sendiri). Logo klub di-cache.
const VERSION = '1.0.1';
const CACHE = 'md-' + VERSION;
const IMG = 'md-img';
const SHELL = ['./', 'index.html', 'app.css?v=' + VERSION, 'app.js?v=' + VERSION, 'espn.js', 'manifest.webmanifest', 'icons/logo.svg', 'icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== IMG).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'a.espncdn.com') {
    e.respondWith(caches.open(IMG).then(c => c.match(req).then(hit => hit || fetch(req).then(r => { c.put(req, r.clone()); return r; }))));
    return;
  }
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put('./', cp)); return r; })
      .catch(() => caches.match('./')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
