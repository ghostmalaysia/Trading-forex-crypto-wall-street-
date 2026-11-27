function memoryStorage() {
  const values = new Map();
  return {
    readJson: async (key, fallback = null) => values.has(key) ? values.get(key) : fallback,
    writeJson: async (key, value) => { values.set(key, value); },
    removeJson: async (key) => { values.delete(key); },
  };
}

const configKey = 'tradewall_mobile_supabase_config';
const sessionKey = 'tradewall_mobile_supabase_session';
const placeholder = /YOUR_PROJECT|YOUR_SUPABASE|example\.invalid|PROJECT_REF/i;

function normalizeConfig(value) {
  if (!value || typeof value !== 'object') return null;
  const url = typeof value.url === 'string' ? value.url.trim().replace(/\/+$/, '') : '';
  const anonKey = typeof value.anonKey === 'string' ? value.anonKey.trim() : '';
  if (!url || !anonKey || !/^https:\/\/[^\s/]+/i.test(url)) return null;
  if (placeholder.test(url) || placeholder.test(anonKey)) return null;
  if (/service_role|sb_secret_/i.test(anonKey)) return null;
  return { url, anonKey };
}

function validSession(value) {
  return !!(value?.access_token && value?.refresh_token && value?.user?.id);
}

export function createMobileSupabaseClient({ fetchImpl = fetch, storage = memoryStorage() } = {}) {
  let cfg = null;
  let projectUrl = null;
  let restUrl = null;
  let authUrl = null;
  let session = null;

  function applyConfig(next) {
    cfg = next;
    projectUrl = cfg ? cfg.url : null;
    restUrl = cfg ? `${projectUrl}/rest/v1` : null;
    authUrl = cfg ? `${projectUrl}/auth/v1` : null;
  }

  async function readResponse(res) {
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) throw new Error(data?.msg || data?.message || data?.error_description || data?.error || `Request failed (${res.status})`);
    return data;
  }

  async function authRequest(path, body, bearer) {
    if (!cfg) throw new Error('Supabase is not configured.');
    const headers = { apikey: cfg.anonKey, 'Content-Type': 'application/json' };
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    const res = await fetchImpl(`${authUrl}${path}`, { method: 'POST', headers, body: JSON.stringify(body || {}) });
    return readResponse(res);
  }

  function saveSession(value) {
    session = validSession(value) ? value : null;
    if (session) {
      session.expires_at ||= Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600);
      return storage.writeJson(sessionKey, session);
    }
    return storage.removeJson(sessionKey);
  }

  async function refreshSession() {
    if (!session?.refresh_token) return null;
    const value = await authRequest('/token?grant_type=refresh_token', { refresh_token: session.refresh_token });
    await saveSession(value);
    return session;
  }

  async function authorizedFetch(url, options = {}) {
    if (!cfg || !session) throw new Error('Sign in to use cloud sync.');
    if (Number(session.expires_at || 0) < Math.floor(Date.now() / 1000) + 60) await refreshSession();
    const res = await fetchImpl(url, {
      ...options,
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    return readResponse(res);
  }

  async function post(path, body, prefer = 'return=minimal') {
    return authorizedFetch(`${restUrl}${path}`, {
      method: 'POST',
      headers: { Prefer: prefer },
      body: JSON.stringify(body),
    });
  }

  async function update(path, body) {
    return authorizedFetch(`${restUrl}${path}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(body),
    });
  }

  return {
    async init() {
      applyConfig(normalizeConfig(await storage.readJson(configKey, null)));
      const saved = await storage.readJson(sessionKey, null);
      session = validSession(saved) ? saved : null;
      return this.getState();
    },
    getState() {
      return { configured: !!cfg, signedIn: !!session, userKey: session?.user?.id || null };
    },
    getPublicConfig() {
      return { url: projectUrl };
    },
    async configure(url, anonKey) {
      const next = normalizeConfig({ url, anonKey });
      applyConfig(next);
      if (next) await storage.writeJson(configKey, next);
      else await storage.removeJson(configKey);
      return !!next;
    },
    async clearConfig() {
      applyConfig(null);
      session = null;
      await Promise.all([storage.removeJson(configKey), storage.removeJson(sessionKey)]);
    },
    async testConnection() {
      if (!cfg) throw new Error('Supabase is not configured.');
      const res = await fetchImpl(`${authUrl}/settings`, { headers: { apikey: cfg.anonKey } });
      const data = await readResponse(res);
      return { ok: true, emailAuthEnabled: data?.email !== false, signupEnabled: data?.disable_signup !== true };
    },
    async signIn(email, password) {
      const value = await authRequest('/token?grant_type=password', { email, password });
      await saveSession(value);
      return this.getState();
    },
    async signUp(email, password) {
      const value = await authRequest('/signup', { email, password });
      if (value?.access_token) await saveSession(value);
      return this.getState();
    },
    async signOut() {
      try {
        if (session?.access_token) await authRequest('/logout', {}, session.access_token);
      } finally {
        await saveSession(null);
      }
    },
    async saveSettings(preferences) {
      if (!session?.user?.id) return { ok: false, skipped: true };
      return post('/user_profiles?on_conflict=user_key', {
        user_key: session.user.id,
        preferences,
        updated_at: new Date().toISOString(),
      }, 'resolution=merge-duplicates,return=minimal');
    },
    async loadSettings() {
      if (!session?.user?.id) return { ok: false, skipped: true };
      const query = `?user_key=eq.${encodeURIComponent(session.user.id)}&select=preferences`;
      const data = await authorizedFetch(`${restUrl}/user_profiles${query}`);
      return { ok: true, preferences: data?.[0]?.preferences || null };
    },
    async saveWatchlist(items) {
      if (!session?.user?.id) return { ok: false, skipped: true };
      const rows = items.filter(item => item?.symbol).map(item => ({
        user_key: session.user.id,
        symbol: String(item.symbol),
        market: String(item.market || 'Watchlist'),
      }));
      if (!rows.length) return { ok: true, data: null };
      return post('/watchlists?on_conflict=user_key,symbol', rows, 'resolution=merge-duplicates,return=minimal');
    },
    async loadWatchlist() {
      if (!session?.user?.id) return { ok: false, skipped: true };
      const query = `?user_key=eq.${encodeURIComponent(session.user.id)}&select=symbol,market&order=created_at.asc`;
      const data = await authorizedFetch(`${restUrl}/watchlists${query}`);
      return { ok: true, data: Array.isArray(data) ? data : [] };
    },
    async saveChat(role, content) {
      if (!session?.user?.id) return { ok: false, skipped: true };
      return post('/ai_memory', { user_key: session.user.id, role, content });
    },
    async loadChat(limit = 20) {
      if (!session?.user?.id) return { ok: false, skipped: true };
      const size = Math.min(Math.max(Number(limit) || 20, 1), 100);
      const query = `?user_key=eq.${encodeURIComponent(session.user.id)}&select=role,content,created_at&order=created_at.desc&limit=${size}`;
      const data = await authorizedFetch(`${restUrl}/ai_memory${query}`);
      return { ok: true, data: Array.isArray(data) ? data.reverse() : [] };
    },
    async savePaperOrder(order) {
      if (!session?.user?.id || !order?.id) return { ok: false, skipped: true };
      return post('/paper_orders', {
        user_key: session.user.id,
        order_ref: String(order.id),
        symbol: order.symbol,
        side: order.side,
        payload: order,
        status: order.status || 'simulated',
        executed_at: order.executedAt || new Date().toISOString(),
      });
    },
    async updatePaperOrder(orderRef, values) {
      if (!session?.user?.id || !orderRef) return { ok: false, skipped: true };
      const allowed = {};
      for (const key of ['status', 'pnl', 'outcome']) {
        if (values?.[key] != null) allowed[key] = values[key];
      }
      return update(`/paper_orders?order_ref=eq.${encodeURIComponent(orderRef)}`, allowed);
    },
    async loadPaperOrders(limit = 30) {
      if (!session?.user?.id) return { ok: false, skipped: true };
      const size = Math.min(Math.max(Number(limit) || 30, 1), 100);
      const query = `?user_key=eq.${encodeURIComponent(session.user.id)}&select=order_ref,symbol,side,payload,status,pnl,outcome,executed_at&order=created_at.desc&limit=${size}`;
      const data = await authorizedFetch(`${restUrl}/paper_orders${query}`);
      return { ok: true, data: Array.isArray(data) ? data : [] };
    },
    async saveEvaluation(evaluation) {
      if (!session?.user?.id || !evaluation?.symbol) return { ok: false, skipped: true };
      return post('/ai_evaluations', {
        user_key: session.user.id,
        order_ref: evaluation.orderId ? String(evaluation.orderId) : null,
        symbol: evaluation.symbol,
        rating: evaluation.rating ?? null,
        note: evaluation.note ? String(evaluation.note).slice(0, 500) : null,
        payload: evaluation && typeof evaluation === 'object' ? evaluation : {},
      });
    },
    async loadEvaluations(limit = 30) {
      if (!session?.user?.id) return { ok: false, skipped: true };
      const size = Math.min(Math.max(Number(limit) || 30, 1), 100);
      const query = `?user_key=eq.${encodeURIComponent(session.user.id)}&select=order_ref,symbol,rating,note,payload,created_at&order=created_at.desc&limit=${size}`;
      const data = await authorizedFetch(`${restUrl}/ai_evaluations${query}`);
      return { ok: true, data: Array.isArray(data) ? data : [] };
    },
  };
}
