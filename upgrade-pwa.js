// Smart Diagnostics v2 upgrade. Run from the repo root: node upgrade-pwa.js
const fs = require('fs'), path = require('path'), cp = require('child_process');
if (!fs.existsSync('index.html') || !fs.existsSync('js/app.js')) { console.log('Run this inside the repo folder (index.html and js/ must exist).'); process.exit(1); }
const W = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

/* ---- Auto index: any file dropped in assets/diagrams appears in the app ---- */
W('scripts/build-index.js', String.raw`const fs = require('fs');
const dir = 'assets/diagrams', ok = /\.(svg|png|jpe?g|webp|pdf)$/i;
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => ok.test(f)).sort() : [];
const human = f => f.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const type = f => /\.pdf$/i.test(f) ? 'PDF drawing' : /\.svg$/i.test(f) ? 'Schematic' : 'Image';
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/diagrams.json', JSON.stringify(files.map(f => ({ id: f, title: human(f), type: type(f), rev: '', file: dir + '/' + f })), null, 2));
const version = (process.env.GITHUB_SHA || String(Date.now())).slice(0, 10);
fs.writeFileSync('data/manifest.json', JSON.stringify({ version, files: files.map(f => dir + '/' + f) }));
console.log('Indexed ' + files.length + ' drawings, version ' + version);
`);

W('.github/workflows/deploy.yml', ['name: Deploy to GitHub Pages', 'on:', '  push:', '    branches: [main]', '  workflow_dispatch:',
  'permissions:', '  contents: read', '  pages: write', '  id-token: write', 'concurrency:', '  group: pages', '  cancel-in-progress: true',
  'jobs:', '  deploy:', '    runs-on: ubuntu-latest', '    environment:', '      name: github-pages',
  '      url: ' + '$' + '{{ steps.deployment.outputs.page_url }}', '    steps:', '      - uses: actions/checkout@v4',
  '      - uses: actions/setup-node@v4', '        with:', '          node-version: 20', '      - run: node scripts/build-index.js',
  '      - uses: actions/configure-pages@v5', '      - uses: actions/upload-pages-artifact@v3', '        with:', '          path: .',
  '      - id: deployment', '        uses: actions/deploy-pages@v4', ''].join('\n'));

/* ---- Service worker: caches whatever the index lists, versioned per deploy ---- */
W('sw.js', String.raw`const CORE = ['./', 'index.html', 'manifest.json', 'css/style.css', 'js/app.js', 'js/api.js', 'js/db.js',
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
`);

/* ---- On-phone storage + repair log sync ---- */
W('js/db.js', String.raw`/* Repair logs are saved on the phone and sent to this URL when signal returns.
 * Paste an n8n webhook or Google Apps Script web app URL here. Empty = logs stay on the phone only. */
const LOG_SYNC = { url: '', headers: { 'Content-Type': 'application/json' } };

const DB = {
  _db: null,
  open() {
    return this._db || (this._db = new Promise((res, rej) => {
      const r = indexedDB.open('sdw', 1);
      r.onupgradeneeded = () => { ['files', 'logs'].forEach(s => r.result.createObjectStore(s, { keyPath: 'id' })); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
  },
  async run(s, m, f) {
    const d = await this.open();
    return new Promise((res, rej) => { const t = d.transaction(s, m), q = f(t.objectStore(s)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); });
  },
  put(s, v) { return this.run(s, 'readwrite', o => o.put(v)); },
  all(s) { return this.run(s, 'readonly', o => o.getAll()); },
  del(s, k) { return this.run(s, 'readwrite', o => o.delete(k)); }
};

async function syncLogs() {
  if (!LOG_SYNC.url || !navigator.onLine) return 0;
  const todo = (await DB.all('logs')).filter(l => !l.synced); let n = 0;
  for (const l of todo) {
    try {
      const r = await fetch(LOG_SYNC.url, { method: 'POST', headers: LOG_SYNC.headers, body: JSON.stringify({ id: l.id, date: l.date, site: l.site, asset: l.asset, note: l.note }) });
      if (r.ok) { l.synced = true; await DB.put('logs', l); n++; }
    } catch (e) { break; }
  }
  return n;
}
`);

/* ---- UI ---- */
let html = fs.readFileSync('index.html', 'utf8');
if (!html.includes('js/db.js')) {
  html = html.replace('<ul id="diagram-list" class="list"></ul>',
    '<ul id="diagram-list" class="list"></ul>\n    <label class="add">Add drawing or photo<input id="add-file" type="file" accept="image/*,application/pdf" hidden></label>');
  html = html.replace('</main>', '  <section id="tab-logs" class="tab">\n    <form id="log-form" class="log-form">\n      <input id="l-site" placeholder="Site, e.g. PS-04" required>\n      <input id="l-asset" placeholder="Equipment and fault" required>\n      <textarea id="l-note" placeholder="What did you find and fix?" required></textarea>\n      <button type="submit">Save repair log</button>\n    </form>\n    <p id="sync-state" class="muted"></p>\n    <ul id="log-list" class="list"></ul>\n  </section>\n</main>');
  html = html.replace('</nav>', '  <button data-tab="logs">Logs</button>\n</nav>');
  html = html.replace('<script src="js/api.js"></script>', '<script src="js/db.js"></script>\n<script src="js/api.js"></script>');
  fs.writeFileSync('index.html', html);
}
fs.appendFileSync('css/style.css', String.raw`
.add{display:block;margin:12px 0;padding:14px;border:2px dashed var(--pri);border-radius:6px;text-align:center;color:var(--pri);font-weight:600}
.row{display:flex;gap:8px}.row button:first-child{flex:1}
.list .row .del{width:auto;background:#fff;color:var(--bad);border:1px solid var(--bad)}
.log-form{display:grid;gap:8px}
.log-form input,.log-form textarea{padding:10px 12px;border:1px solid var(--line);border-radius:6px;font:inherit;min-height:44px}
.log-form textarea{min-height:96px}
.muted{color:#4a6670;font-size:.9rem}
.logit{margin-top:8px;min-height:36px;background:#fff;color:var(--pri)}
`);

W('js/app.js', String.raw`const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
function net() { const n = $('#net'); n.textContent = navigator.onLine ? 'online' : 'offline'; n.classList.toggle('off', !navigator.onLine); }
addEventListener('offline', net); addEventListener('online', () => { net(); syncLogs().then(renderLogs); }); net();

function show(t) {
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x.dataset.tab === t));
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.id === 'tab-' + t));
}
document.querySelectorAll('nav button').forEach(b => b.onclick = () => show(b.dataset.tab));

/* Diagrams: shared library (auto-indexed) + drawings added on this phone */
let zoom = 1, items = [];
const setZoom = z => { zoom = Math.min(4, Math.max(1, z)); $('#v-img').style.width = (zoom * 100) + '%'; };
async function loadDiagrams() {
  items = [];
  try { (await (await fetch('data/diagrams.json')).json()).forEach(d => items.push(d)); } catch (e) {}
  (await DB.all('files')).forEach(f => items.push({ id: f.id, title: f.title, type: 'Added on this phone', blob: f.blob, mime: f.mime, mine: 1 }));
  $('#diagram-list').innerHTML = items.length ? items.map((d, i) =>
    '<li class="row"><button data-o="' + i + '">' + esc(d.title) + '<small>' + esc([d.type, d.rev].filter(Boolean).join(' - ')) + '</small></button>' +
    (d.mine ? '<button class="del" data-d="' + i + '">Delete</button>' : '') + '</li>').join('') : '<li class="muted">No drawings yet. Tap Add drawing or photo below.</li>';
}
$('#diagram-list').onclick = async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.d) { const d = items[b.dataset.d]; if (confirm('Delete ' + d.title + '?')) { await DB.del('files', d.id); loadDiagrams(); } return; }
  const d = items[b.dataset.o], src = d.blob ? URL.createObjectURL(d.blob) : d.file;
  if (/pdf/i.test(d.mime || d.file)) { window.open(src, '_blank'); return; }
  $('#v-title').textContent = d.title; $('#v-img').src = src; $('#v-img').alt = d.title; setZoom(1); $('#viewer').hidden = false;
};
$('#add-file').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  const t = prompt('Name this drawing', f.name.replace(/\.[^.]+$/, '')); e.target.value = '';
  if (!t) return;
  await DB.put('files', { id: 'f' + Date.now(), title: t, mime: f.type, blob: f });
  loadDiagrams();
};
$('#v-close').onclick = () => $('#viewer').hidden = true;
$('#v-in').onclick = () => setZoom(zoom + 0.5);
$('#v-out').onclick = () => setZoom(zoom - 0.5);

/* Assistant */
const chat = $('#chat');
function add(html, me) { const d = document.createElement('div'); d.className = 'msg' + (me ? ' me' : ''); d.innerHTML = html; chat.appendChild(d); chat.scrollTop = chat.scrollHeight; }
function render(r) {
  let h = '<span class="tag">' + (r.source === 'agent' ? 'Claude agent' : 'Offline library') + '</span>';
  if (r.text) h += '<p>' + esc(r.text) + '</p>';
  if (!r.matches.length) return h + '<p>No match. Try the equipment name and the alarm, e.g. "air valve not seating" or "level transmitter drift".</p>';
  r.matches.forEach(m => {
    h += '<h3>' + esc(m.title) + '</h3><h4>Likely causes</h4><ul>' + m.causes.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul>' +
      '<h4>Steps</h4><ol>' + m.steps.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol>' +
      '<h4>Calibration / check</h4><p>' + esc(m.calibration) + '</p>';
    if (m.logs && m.logs.length) h += '<h4>Past maintenance</h4><ul>' + m.logs.map(l => '<li>' + esc(l.date) + ' - ' + esc(l.site) + ': ' + esc(l.note) + '</li>').join('') + '</ul>';
    h += '<button class="logit" data-t="' + esc(m.title) + '">Log this repair</button>';
  });
  return h;
}
chat.onclick = e => { const b = e.target.closest('.logit'); if (!b) return; $('#l-asset').value = b.dataset.t; show('logs'); $('#l-note').focus(); };
$('#chat-form').onsubmit = async e => {
  e.preventDefault();
  const i = $('#chat-input'), q = i.value.trim(); if (!q) return;
  i.value = ''; add(esc(q), true); add(render(await Api.ask(q)));
};
add('Describe a symptom and I will pull up causes, steps and past work orders. Works offline.');

/* Repair logs: saved on the phone, sent automatically when signal returns */
async function renderLogs() {
  const l = (await DB.all('logs')).sort((a, b) => b.id < a.id ? -1 : 1), p = l.filter(x => !x.synced).length;
  $('#sync-state').textContent = !LOG_SYNC.url ? 'Logs are saved on this phone. Sync is not set up yet.' : p ? p + ' log(s) waiting for signal.' : 'All logs synced.';
  $('#log-list').innerHTML = l.map(x => '<li class="msg"><strong>' + esc(x.site) + ' - ' + esc(x.asset) + '</strong><br>' + esc(x.note) + '<br><small>' + esc(x.date) + (x.synced ? ' - synced' : '') + '</small></li>').join('');
}
$('#log-form').onsubmit = async e => {
  e.preventDefault();
  await DB.put('logs', { id: 'l' + Date.now(), date: new Date().toISOString().slice(0, 16).replace('T', ' '), site: $('#l-site').value.trim(), asset: $('#l-asset').value.trim(), note: $('#l-note').value.trim(), synced: false });
  e.target.reset(); await renderLogs(); await syncLogs(); renderLogs();
};
loadDiagrams(); renderLogs(); syncLogs().then(renderLogs);
`);

/* ---- Build index now, then publish ---- */
cp.execSync('node scripts/build-index.js', { stdio: 'inherit' });
try {
  cp.execSync('git add -A', { stdio: 'inherit' });
  cp.execSync('git commit -m "v2: phone upload, auto index, repair log"', { stdio: 'inherit' });
  cp.execSync('git push', { stdio: 'inherit' });
  console.log('Done. Wait for the green tick in the Actions tab, then reload the app.');
} catch (e) { console.log('Files written. Commit and push manually: git add -A, git commit, git push'); }