const $ = s => document.querySelector(s);
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
