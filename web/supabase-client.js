// Minimal Supabase REST client for static MVP (no build step).
(function () {
  const cfg = window.SUPABASE_CONFIG || {};
  const enabled = !!(cfg.memoryEnabled && cfg.url && cfg.anonKey && !cfg.url.includes('YOUR_PROJECT'));
  const base = enabled ? cfg.url.replace(/\/$/, '') + '/rest/v1' : null;
  const headers = enabled ? {
    apikey: cfg.anonKey,
    Authorization: `Bearer ${cfg.anonKey}`,
    'Content-Type': 'application/json',
  } : {};

  async function request(path, { method = 'GET', body, query = '' } = {}) {
    if (!enabled) return { ok: false, skipped: true, reason: 'Supabase not configured' };
    const res = await fetch(`${base}${path}${query}`, {
      method,
      headers: { ...headers, Prefer: method === 'POST' ? 'return=representation' : headers.Prefer },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) return { ok: false, status: res.status, error: data };
    return { ok: true, data };
  }

  function getUserKey() {
    const k = 'tradewall_user_key';
    let v = localStorage.getItem(k);
    if (!v) { v = 'anon_' + crypto.randomUUID(); localStorage.setItem(k, v); }
    return v;
  }

  async function upsertProfile(profile) {
    return request('/user_profiles?on_conflict=user_key', {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
      body: profile,
    });
  }
  // request() sets Prefer for POST; override by passing headers not supported - simple patch below
  async function post(path, body, prefer) {
    if (!enabled) return { ok: false, skipped: true };
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { ...headers, Prefer: prefer || 'return=representation' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    return res.ok ? { ok: true, data } : { ok: false, status: res.status, error: data };
  }

  window.SupabaseMemory = {
    enabled,
    getUserKey,
    async saveProfile(p) { return post('/user_profiles?on_conflict=user_key', p, 'resolution=merge-duplicates,return=representation'); },
    async saveChat(msg) { return post('/ai_memory', msg, 'return=representation'); },
    async loadChat(userKey, limit = 20) {
      if (!enabled) return { ok: false, skipped: true };
      const q = `?user_key=eq.${encodeURIComponent(userKey)}&select=role,content,created_at&order=created_at.desc&limit=${limit}`;
      const res = await request('/ai_memory', { query: q });
      if (res.ok && Array.isArray(res.data)) res.data = res.data.reverse();
      return res;
    },
    async saveWatchlist(items) {
      if (!enabled) return { ok: false, skipped: true };
      // upsert by (user_key,symbol)
      return post('/watchlists?on_conflict=user_key,symbol', items, 'resolution=merge-duplicates,return=representation');
    },
  };
})();
