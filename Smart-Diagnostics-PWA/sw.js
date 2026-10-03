const CACHE = 'sdw-v1';
const ASSETS = ['./', 'index.html', 'manifest.json', 'css/style.css', 'js/app.js', 'js/api.js',
  'data/kb.json', 'data/logs.json', 'data/diagrams.json',
  'assets/diagrams/starter-dol.svg', 'assets/diagrams/pump-station-pid.svg',
  'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // webhook/API calls bypass the cache
  // Cache-first, refresh in background (stale-while-revalidate); offline falls back to the shell.
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => hit || caches.match('index.html'));
    return hit || net;
  }));
});
