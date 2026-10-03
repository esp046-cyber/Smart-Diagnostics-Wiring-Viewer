const CORE = ['./', 'index.html', 'manifest.json', 'css/style.css', 'js/app.js', 'js/api.js', 'js/db.js',
  'data/kb.json', 'data/logs.json', 'data/diagrams.json', 'data/manifest.json', 'icons/icon-192.png', 'icons/icon-512.png'];
async function getManifest() {
  try { return await (await fetch('data/manifest.json', { cache: 'no-store' })).json(); }
  catch (e) { const h = await caches.match('data/manifest.json'); return h ? h.json() : null; }
}
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const m = (await getManifest()) || { version: '0', files: [] };
    const c = await caches.open('sdw-' + m.version);
    await Promise.allSettled([...CORE, ...m.files].map(u => c.add(new Request(u, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const m = await getManifest();
    if (m) for (const k of await caches.keys()) if (k !== 'sdw-' + m.version) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.keys().then(ks => ks.length && caches.open(ks[ks.length - 1]).then(c => c.put(req, copy))); }
      return res;
    }).catch(() => hit || caches.match('index.html'));
    return hit || net;
  }));
});
