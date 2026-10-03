/* Repair logs are saved on the phone and sent to this URL when signal returns.
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
