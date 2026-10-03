const $ = s => document.querySelector(s);
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
