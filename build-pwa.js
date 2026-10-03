#!/usr/bin/env node
// Smart Diagnostics & Wiring Viewer - project generator. Zero dependencies (Node 16+).
// Usage: node build-pwa.js  ->  ./Smart-Diagnostics-PWA/  and  ./Smart-Diagnostics-PWA.zip
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const OUT = 'Smart-Diagnostics-PWA';

/* ---------- helpers: crc, png, zip ---------- */
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = ~0; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0; };
function png(w, h, [r, g, b]) {
  const row = w * 3 + 1, raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * row + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; }
  const ch = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', ihdr), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))]);
}
function makeZip(files) {
  const parts = [], central = []; let off = 0;
  for (const f of files) {
    const n = Buffer.from(f.name), d = zlib.deflateRawSync(f.data), c = crc(f.data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8); h.writeUInt16LE(0x21, 12);
    h.writeUInt32LE(c, 14); h.writeUInt32LE(d.length, 18); h.writeUInt32LE(f.data.length, 22); h.writeUInt16LE(n.length, 26);
    parts.push(h, n, d);
    const e = Buffer.alloc(46);
    e.writeUInt32LE(0x02014b50, 0); e.writeUInt16LE(20, 4); e.writeUInt16LE(20, 6); e.writeUInt16LE(0x0800, 8); e.writeUInt16LE(8, 10); e.writeUInt16LE(0x21, 14);
    e.writeUInt32LE(c, 16); e.writeUInt32LE(d.length, 20); e.writeUInt32LE(f.data.length, 24); e.writeUInt16LE(n.length, 28); e.writeUInt32LE(off, 42);
    central.push(e, n); off += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}

/* ---------- file contents (no backticks or dollar-braces inside) ---------- */
const F = {};

F['index.html'] = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Smart Diagnostics &amp; Wiring Viewer</title>
<meta name="description" content="Offline wiring diagrams, P&amp;IDs and an AI troubleshooting assistant for water and wastewater field engineers.">
<meta name="theme-color" content="#0F4C5C">
<link rel="manifest" href="manifest.json">
<link rel="icon" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/icon-192.png">
<!-- Open Graph: replace YOUR_USER / YOUR_REPO after first deploy -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="Smart Diagnostics">
<meta property="og:title" content="Smart Diagnostics &amp; Wiring Viewer">
<meta property="og:description" content="Offline schematics, P&amp;IDs and an AI fault-finding assistant for pumps, MCCs and telemetry.">
<meta property="og:url" content="https://YOUR_USER.github.io/YOUR_REPO/">
<meta property="og:image" content="https://YOUR_USER.github.io/YOUR_REPO/og-image.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="css/style.css">
</head>
<body>
<header>
  <h1>Smart Diagnostics</h1>
  <span id="net" class="net">online</span>
</header>
<main>
  <section id="tab-diagrams" class="tab active">
    <ul id="diagram-list" class="list"></ul>
    <div id="viewer" class="viewer" hidden>
      <div class="vbar">
        <button id="v-close">Close</button>
        <strong id="v-title"></strong>
        <button id="v-out" aria-label="Zoom out">-</button>
        <button id="v-in" aria-label="Zoom in">+</button>
      </div>
      <div class="vscroll"><img id="v-img" alt=""></div>
    </div>
  </section>
  <section id="tab-assistant" class="tab">
    <div id="chat" class="chat" aria-live="polite"></div>
    <form id="chat-form" class="chat-form">
      <input id="chat-input" autocomplete="off" placeholder="Describe the fault, e.g. macerator high torque alarm">
      <button type="submit">Ask</button>
    </form>
  </section>
</main>
<nav>
  <button data-tab="diagrams" class="on">Diagrams</button>
  <button data-tab="assistant">Assistant</button>
</nav>
<script src="js/api.js"></script>
<script src="js/app.js"></script>
</body>
</html>
`;

F['manifest.json'] = JSON.stringify({
  name: 'Smart Diagnostics & Wiring Viewer', short_name: 'Diagnostics',
  description: 'Offline wiring diagrams and AI diagnostics for field engineers',
  start_url: './index.html', scope: './', display: 'standalone',
  background_color: '#EEF3F4', theme_color: '#0F4C5C',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }]
}, null, 2);

F['sw.js'] = String.raw`const CACHE = 'sdw-v1';
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
`;

F['css/style.css'] = String.raw`:root{--bg:#EEF3F4;--ink:#10242B;--pri:#0F4C5C;--sig:#E8A317;--card:#fff;--line:#C5D3D6;--bad:#B3261E}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{display:flex;flex-direction:column;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding-top:env(safe-area-inset-top)}
header{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:var(--pri);color:#fff}
h1{font-size:1.15rem;margin:0}
.net{font-size:.85rem;padding:2px 10px;border-radius:99px;background:#1c7a5b}
.net.off{background:var(--sig);color:#10242B}
main{flex:1;overflow:hidden;position:relative}
.tab{display:none;height:100%;overflow:auto;padding:12px}
.tab.active{display:flex;flex-direction:column}
#tab-diagrams{display:none}#tab-diagrams.active{display:block}
.list{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.list button{width:100%;text-align:left;background:var(--card);border:1px solid var(--line);border-left:6px solid var(--sig);border-radius:6px;padding:14px;font:inherit;color:inherit}
.list small{display:block;color:#4a6670}
.viewer{position:absolute;inset:0;background:var(--bg);display:flex;flex-direction:column}
.viewer[hidden]{display:none}
.vbar{display:flex;gap:8px;align-items:center;padding:8px;background:var(--card);border-bottom:1px solid var(--line)}
.vbar strong{flex:1;font-size:.95rem}
.vscroll{flex:1;overflow:auto;background:#fff}
.vscroll img{width:100%;display:block;transform-origin:0 0}
button{font:inherit;min-height:44px;min-width:44px;padding:0 14px;border-radius:6px;border:1px solid var(--pri);background:var(--pri);color:#fff}
.vbar button{background:#fff;color:var(--pri)}
.chat{flex:1;overflow:auto;display:flex;flex-direction:column;gap:10px}
.msg{max-width:92%;padding:10px 12px;border-radius:8px;background:var(--card);border:1px solid var(--line)}
.msg.me{align-self:flex-end;background:var(--pri);color:#fff;border-color:var(--pri)}
.msg h3{margin:0 0 4px;font-size:1rem}
.msg h4{margin:8px 0 2px;font-size:.9rem;color:var(--pri)}
.msg ol,.msg ul{margin:2px 0;padding-left:20px}
.tag{display:inline-block;font-size:.75rem;background:var(--sig);padding:0 8px;border-radius:99px;margin-bottom:4px}
.chat-form{display:flex;gap:8px;padding-top:8px}
.chat-form input{flex:1;min-height:44px;padding:0 12px;border:1px solid var(--line);border-radius:6px;font:inherit}
nav{display:flex;background:var(--card);border-top:2px solid var(--pri);padding-bottom:env(safe-area-inset-bottom)}
nav button{flex:1;border:0;border-radius:0;background:transparent;color:var(--ink)}
nav button.on{background:var(--pri);color:#fff}
button:focus-visible,input:focus-visible{outline:3px solid var(--sig);outline-offset:2px}
`;

F['js/api.js'] = String.raw`/* Diagnostic sub-agent connector.
 * mode 'local'   : keyword search over data/kb.json (fully offline).
 * mode 'webhook' : POST to your n8n webhook, which calls Claude and returns JSON.
 * Keep the Anthropic API key inside n8n (or a server). Anything in this file is public once deployed.
 */
const CONFIG = {
  mode: 'local',                 // change to 'webhook' when ready
  webhookUrl: '',                // e.g. https://n8n.example.com/webhook/diagnose
  headers: { 'Content-Type': 'application/json' /* , 'X-Api-Key': 'shared-secret' */ },
  timeoutMs: 20000
};

const Api = {
  kb: null, logs: null,
  async load() {
    if (!this.kb) this.kb = await (await fetch('data/kb.json')).json();
    if (!this.logs) this.logs = await (await fetch('data/logs.json')).json();
  },
  search(query) {
    const q = query.toLowerCase();
    const scored = this.kb.map(e => ({
      e, s: e.keywords.reduce((n, k) => n + (q.includes(k) ? 1 : 0), 0)
    })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 2);
    return scored.map(x => ({ ...x.e, logs: this.logs.filter(l => l.kb === x.e.id) }));
  },
  /* Expected webhook reply: { text?: string, matches?: [same shape as local matches] } */
  async ask(query) {
    await this.load();
    const local = this.search(query);
    if (CONFIG.mode === 'webhook' && CONFIG.webhookUrl && navigator.onLine) {
      try {
        const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), CONFIG.timeoutMs);
        const res = await fetch(CONFIG.webhookUrl, {
          method: 'POST', headers: CONFIG.headers, signal: ctl.signal,
          body: JSON.stringify({ query, context: local })
        });
        clearTimeout(t);
        if (res.ok) { const j = await res.json(); return { source: 'agent', text: j.text, matches: j.matches || local }; }
      } catch (err) { /* fall through to offline answer */ }
    }
    return { source: 'offline', matches: local };
  }
};
`;

F['js/app.js'] = String.raw`const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Service worker + connectivity badge */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
function net() { const n = $('#net'); n.textContent = navigator.onLine ? 'online' : 'offline'; n.classList.toggle('off', !navigator.onLine); }
addEventListener('online', net); addEventListener('offline', net); net();

/* Tabs */
document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
});

/* Diagram repository */
let zoom = 1;
const setZoom = z => { zoom = Math.min(4, Math.max(1, z)); $('#v-img').style.width = (zoom * 100) + '%'; };
fetch('data/diagrams.json').then(r => r.json()).then(list => {
  $('#diagram-list').innerHTML = list.map((d, i) =>
    '<li><button data-i="' + i + '">' + esc(d.title) + '<small>' + esc(d.type) + ' - ' + esc(d.rev) + '</small></button></li>').join('');
  $('#diagram-list').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    const d = list[b.dataset.i];
    $('#v-title').textContent = d.title; $('#v-img').src = d.file; $('#v-img').alt = d.title;
    setZoom(1); $('#viewer').hidden = false;
  };
});
$('#v-close').onclick = () => $('#viewer').hidden = true;
$('#v-in').onclick = () => setZoom(zoom + 0.5);
$('#v-out').onclick = () => setZoom(zoom - 0.5);

/* Assistant */
const chat = $('#chat');
function add(html, me) {
  const d = document.createElement('div'); d.className = 'msg' + (me ? ' me' : ''); d.innerHTML = html;
  chat.appendChild(d); chat.scrollTop = chat.scrollHeight;
}
function render(r) {
  let h = '<span class="tag">' + (r.source === 'agent' ? 'Claude agent' : 'Offline library') + '</span>';
  if (r.text) h += '<p>' + esc(r.text) + '</p>';
  if (!r.matches.length) return h + '<p>No match. Try the equipment name and the alarm, e.g. "air valve not seating" or "level transmitter drift".</p>';
  r.matches.forEach(m => {
    h += '<h3>' + esc(m.title) + '</h3><h4>Likely causes</h4><ul>' + m.causes.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul>' +
      '<h4>Steps</h4><ol>' + m.steps.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol>' +
      '<h4>Calibration / check</h4><p>' + esc(m.calibration) + '</p>';
    if (m.logs && m.logs.length) h += '<h4>Past maintenance</h4><ul>' + m.logs.map(l => '<li>' + esc(l.date) + ' - ' + esc(l.site) + ': ' + esc(l.note) + '</li>').join('') + '</ul>';
  });
  return h;
}
$('#chat-form').onsubmit = async e => {
  e.preventDefault();
  const i = $('#chat-input'), q = i.value.trim(); if (!q) return;
  i.value = ''; add(esc(q), true);
  add(render(await Api.ask(q)));
};
add('Describe a symptom and I will pull up causes, steps and past work orders. Works offline.');
`;

F['data/diagrams.json'] = JSON.stringify([
  { id: 'dol', title: 'Macerator DOL starter - MCC bucket', type: 'Electrical schematic', rev: 'Rev C', file: 'assets/diagrams/starter-dol.svg' },
  { id: 'pid', title: 'Pump station P&ID - wet well PS-04', type: 'P&ID', rev: 'Rev B', file: 'assets/diagrams/pump-station-pid.svg' }
], null, 2);

F['data/kb.json'] = JSON.stringify([
  { id: 'mac-torque', title: 'Macerator high torque alarm', keywords: ['macerator', 'torque', 'jam', 'overload', 'grinder', 'rag'],
    causes: ['Rag or debris jam on cutter stack', 'Worn cutters or loose cutter bolts', 'Phase imbalance or low supply voltage', 'Bearing or seal failure'],
    steps: ['Isolate and lock out at the MCC; confirm zero energy.', 'Rotate the shaft by hand and check for binding.', 'Pull the unit and clear the cutter stack; inspect cutter wear.', 'Megger motor windings (should be above 1 MOhm) and check the three phase currents at the overload relay.', 'Restart and compare running current to nameplate FLA.'],
    calibration: 'Torque/overload trip: set the relay to 105-110% FLA, class 10. Verify the PLC torque alarm threshold against the nameplate.' },
  { id: 'air-valve', title: 'Air valve not seating / pressure surge', keywords: ['air valve', 'pressure', 'surge', 'water hammer', 'leak', 'seating', 'vent'],
    causes: ['Debris on the float or seat', 'Damaged seal or float', 'Isolation valve left closed', 'Surge from fast pump stop'],
    steps: ['Confirm the isolation valve is open.', 'Depressurise the line, open the valve and clean the seat and float.', 'Replace the seal if scored or hardened.', 'Check the pump stop ramp time in the VSD or soft starter.'],
    calibration: 'Check set pressure on the pressure transmitter against a calibrated gauge at 0, 50 and 100% span.' },
  { id: 'hyd-slow', title: 'Hydraulic actuator slow or drifting', keywords: ['hydraulic', 'actuator', 'slow', 'drift', 'cylinder', 'oil', 'hpu'],
    causes: ['Low reservoir level or aerated oil', 'Clogged return filter', 'Worn pump or internal cylinder leakage', 'Relief valve set too low'],
    steps: ['Check reservoir level and oil condition.', 'Check filter differential indicator and replace if tripped.', 'Hold the actuator at mid-stroke; drift indicates internal leakage.', 'Measure system pressure against the setpoint at the test point.'],
    calibration: 'Re-set the relief valve with a calibrated gauge; record the pressure and stroke time in the log.' },
  { id: 'level-drift', title: 'Level or flow instrument reading drifts', keywords: ['level', 'flow', 'transmitter', 'ultrasonic', 'radar', 'flowmeter', 'drift', 'instrument', '4-20', 'fit', 'lit'],
    causes: ['Fouled sensor face or foam', 'Wrong empty/span configuration', 'Loop wiring fault or high loop resistance', 'Flowmeter with partial pipe or air entrainment'],
    steps: ['Clean the sensor; check for foam or condensation.', 'Measure loop current at the terminal (4 mA = empty, 20 mA = full).', 'Compare the reading with a dip or tape measurement.', 'For flow, confirm the pipe is full and the earthing rings are intact.'],
    calibration: 'Re-set empty and span distances; simulate 4/12/20 mA at the PLC input to confirm scaling.' },
  { id: 'solar-rtu', title: 'Solar RTU offline / low battery', keywords: ['solar', 'battery', 'rtu', 'telemetry', 'offline', 'comms', 'geoscada', 'charge', 'panel', 'voltage'],
    causes: ['Dirty or shaded panel', 'Charge controller fault or loose terminal', 'Aged battery', 'Modem or antenna fault'],
    steps: ['Measure panel open-circuit voltage and charge current.', 'Check battery rest voltage (12.6 V for a healthy 12 V battery).', 'Tighten fuse and terminal connections.', 'Check modem signal and RTU link status in GeoSCADA.'],
    calibration: 'Verify the controller low-voltage disconnect and float settings against the battery datasheet.' }
], null, 2);

F['data/logs.json'] = JSON.stringify([
  { kb: 'mac-torque', date: '2025-11-14', site: 'PS-04 Al Quoz', note: 'Rags jammed cutter; cleared. Running amps back to 11.2 A.' },
  { kb: 'mac-torque', date: '2026-02-03', site: 'PS-11 Jebel Ali', note: 'Cutters replaced; overload relay reset to 106% FLA.' },
  { kb: 'air-valve', date: '2026-01-22', site: 'RM-02 Rising Main', note: 'Debris on seat; cleaned and re-seated. Soft-stop ramp extended to 8 s.' },
  { kb: 'hyd-slow', date: '2025-12-09', site: 'WTP-01 Gate G3', note: 'Return filter blocked; replaced. Stroke time 41 s down to 28 s.' },
  { kb: 'level-drift', date: '2026-03-18', site: 'PS-07 Wet well', note: 'Ultrasonic fouled by grease; cleaned and span re-set.' },
  { kb: 'solar-rtu', date: '2026-04-27', site: 'RTU-15 Remote', note: 'Battery rest voltage 11.4 V; replaced. Panel cleaned.' }
], null, 2);

F['assets/diagrams/starter-dol.svg'] = String.raw`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 560" font-family="monospace" font-size="14">
<rect width="800" height="560" fill="#fff"/><g stroke="#10242B" stroke-width="2" fill="none">
<text x="20" y="30" fill="#10242B" stroke="none" font-size="18">DOL STARTER - MACERATOR M1 (placeholder)</text>
<path d="M120 60V120M260 60V120M400 60V120"/>
<text x="110" y="52" stroke="none" fill="#10242B">L1</text><text x="250" y="52" stroke="none" fill="#10242B">L2</text><text x="390" y="52" stroke="none" fill="#10242B">L3</text>
<rect x="90" y="120" width="340" height="50"/><text x="200" y="150" stroke="none" fill="#10242B">Q1 MCCB 16A</text>
<path d="M120 170V230M260 170V230M400 170V230"/>
<rect x="90" y="230" width="340" height="50"/><text x="200" y="260" stroke="none" fill="#10242B">K1 CONTACTOR</text>
<path d="M120 280V340M260 280V340M400 280V340"/>
<rect x="90" y="340" width="340" height="50"/><text x="200" y="370" stroke="none" fill="#10242B">F2 OVERLOAD</text>
<path d="M120 390V440M260 390V440M400 390V440"/>
<circle cx="260" cy="480" r="38"/><text x="244" y="486" stroke="none" fill="#10242B">M1 3~</text>
<path d="M520 60V500M700 60V500" stroke="#0F4C5C"/>
<text x="500" y="52" stroke="none" fill="#0F4C5C">24VDC</text><text x="690" y="52" stroke="none" fill="#0F4C5C">0V</text>
<path d="M520 120H560M600 120H640" stroke="#0F4C5C"/><text x="545" y="108" stroke="none" fill="#0F4C5C">S0 STOP</text>
<path d="M520 220H560M600 220H640" stroke="#0F4C5C"/><text x="545" y="208" stroke="none" fill="#0F4C5C">S1 START</text>
<path d="M520 320H560M600 320H640" stroke="#0F4C5C"/><text x="540" y="308" stroke="none" fill="#0F4C5C">F2 95-96</text>
<rect x="640" y="400" width="60" height="40" stroke="#0F4C5C"/><text x="650" y="425" stroke="none" fill="#0F4C5C">K1 A1</text>
</g></svg>
`;

F['assets/diagrams/pump-station-pid.svg'] = String.raw`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 460" font-family="monospace" font-size="14">
<rect width="800" height="460" fill="#fff"/><g stroke="#10242B" stroke-width="2" fill="none">
<text x="20" y="30" fill="#10242B" stroke="none" font-size="18">P&amp;ID - PUMP STATION PS-04 (placeholder)</text>
<path d="M60 200V400H220V200"/><text x="100" y="380" stroke="none" fill="#10242B">WET WELL</text>
<path d="M60 300H220" stroke-dasharray="6 4" stroke="#0F4C5C"/>
<rect x="110" y="120" width="26" height="60"/><text x="90" y="112" stroke="none" fill="#10242B">LIT-101</text>
<path d="M190 350H300"/><circle cx="330" cy="350" r="30"/><text x="312" y="355" stroke="none" fill="#10242B">P-1</text>
<path d="M330 320V200H420"/><path d="M420 185V215L450 200Z"/><text x="408" y="175" stroke="none" fill="#10242B">NRV-1</text>
<path d="M450 200H520"/><path d="M520 185V215L550 200L520 185M550 185V215L520 200" /><text x="508" y="175" stroke="none" fill="#10242B">XV-1</text>
<path d="M550 200H620"/><circle cx="620" cy="200" r="18"/><text x="602" y="165" stroke="none" fill="#10242B">FIT-201</text>
<path d="M638 200H760"/><text x="680" y="190" stroke="none" fill="#10242B">TO RISING MAIN</text>
<path d="M590 200V140"/><rect x="570" y="100" width="40" height="40" rx="18"/><text x="560" y="92" stroke="none" fill="#10242B">AV-1</text>
<path d="M370 200V150"/><circle cx="370" cy="130" r="18"/><text x="345" y="100" stroke="none" fill="#10242B">PIT-202</text>
</g></svg>
`;

F['.github/workflows/deploy.yml'] = String.raw`name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${'$'}{{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: .
      - id: deployment
        uses: actions/deploy-pages@v4
`.replace("${'$'}", '$');

F['README.md'] = '# Smart Diagnostics & Wiring Viewer\n\nStatic PWA. Edit `js/api.js` to connect an n8n webhook. Replace placeholder SVGs in `assets/diagrams/` and update `data/diagrams.json`. Bump `CACHE` in `sw.js` after every content change.\n';

/* ---------- write everything ---------- */
const BIN = {
  'icons/icon-192.png': png(192, 192, [15, 76, 92]),
  'icons/icon-512.png': png(512, 512, [15, 76, 92]),
  // 1x1 placeholder JPEG. Replace with a real 1200x630 JPG before sharing on Messenger.
  'og-image.jpg': Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64')
};
const all = [];
for (const [p, c] of Object.entries(F)) all.push({ name: p, data: Buffer.from(c, 'utf8') });
for (const [p, d] of Object.entries(BIN)) all.push({ name: p, data: d });
fs.rmSync(OUT, { recursive: true, force: true });
for (const f of all) {
  const full = path.join(OUT, f.name);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, f.data);
}
fs.writeFileSync(OUT + '.zip', makeZip(all));
console.log('Created ' + OUT + '/ (' + all.length + ' files) and ' + OUT + '.zip');
