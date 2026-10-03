/* Diagnostic sub-agent connector.
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
