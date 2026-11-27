(function () {
  const sessionKey = 'tradewall_supabase_session';
  const configKey = 'tradewall_supabase_config';
  const placeholder = /YOUR_PROJECT|YOUR_SUPABASE|example\.invalid|PROJECT_REF/i;
  let cfg = null;
  let projectUrl = null;
  let restUrl = null;
  let authUrl = null;
  let session = null;
  let refreshPromise = null;

  function normalizeConfig(value) {
    if (!value || typeof value !== 'object') return null;
    const url = typeof value.url === 'string' ? value.url.trim().replace(/\/+$/, '') : '';
    const anonKey = typeof value.anonKey === 'string' ? value.anonKey.trim() : '';
    if (!url || !anonKey || !/^https:\/\/[^\s/]+/i.test(url)) return null;
    if (placeholder.test(url) || placeholder.test(anonKey)) return null;
    if (/service_role|sb_secret_/i.test(anonKey)) return null;
    if (value.memoryEnabled === false) return null;
    return { url, anonKey, memoryEnabled: true };
  }

  function readStoredConfig() {
    try { return normalizeConfig(JSON.parse(localStorage.getItem(configKey) || 'null')); } catch { return null; }
  }

  function applyConfig(next) {
    cfg = next;
    projectUrl = cfg ? cfg.url : null;
    restUrl = cfg ? `${projectUrl}/rest/v1` : null;
    authUrl = cfg ? `${projectUrl}/auth/v1` : null;
  }

  applyConfig(readStoredConfig() || normalizeConfig(window.SUPABASE_CONFIG));

  function saveSession(value) {
    session = value?.access_token && value?.refresh_token && value?.user?.id ? value : null;
    if (session) {
      session.expires_at ||= Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600);
      try { sessionStorage.setItem(sessionKey, JSON.stringify(session)); } catch {}
    } else {
      try { sessionStorage.removeItem(sessionKey); } catch {}
    }
    return session;
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
    const res = await fetch(`${authUrl}${path}`, { method: 'POST', headers, body: JSON.stringify(body || {}) });
    return readResponse(res);
  }

  async function refreshSession() {
    if (!session?.refresh_token) return null;
    if (!refreshPromise) {
      refreshPromise = authRequest('/token?grant_type=refresh_token', { refresh_token: session.refresh_token })
        .then(value => saveSession(value))
        .catch(() => { saveSession(null); return null; })
        .finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
  }

  async function restoreSession() {
    if (!cfg) return null;
    try {
      const saved = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
      if (!saved?.access_token || !saved?.refresh_token || !saved?.user?.id) return null;
      session = saved;
      if (Number(saved.expires_at || 0) < Math.floor(Date.now() / 1000) + 60) return await refreshSession();
      return session;
    } catch {
      saveSession(null);
      return null;
    }
  }

  async function signIn(email, password) {
    const value = await authRequest('/token?grant_type=password', { email, password });
    return saveSession(value);
  }

  async function signUp(email, password) {
    const value = await authRequest('/signup', { email, password });
    return value?.access_token ? saveSession(value) : null;
  }

  async function signOut() {
    try {
      if (session?.access_token) await authRequest('/logout', {}, session.access_token);
    } finally {
      saveSession(null);
    }
  }

  async function authorizedFetch(url, options = {}) {
    if (!cfg || !session) throw new Error('Sign in to use cloud memory.');
    if (Number(session.expires_at || 0) < Math.floor(Date.now() / 1000) + 60) {
      if (!await refreshSession()) throw new Error('Your session expired. Sign in again.');
    }
    const headers = {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    };
    const res = await fetch(url, { ...options, headers });
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

  async function remove(path) {
    return authorizedFetch(`${restUrl}${path}`, { method: 'DELETE' });
  }

  async function testConnection() {
    if (!cfg) throw new Error('Supabase is not configured.');
    const res = await fetch(`${authUrl}/settings`, { headers: { apikey: cfg.anonKey } });
    const data = await readResponse(res);
    return { ok: true, emailAuthEnabled: data?.email !== false, signupEnabled: data?.disable_signup !== true };
  }

  window.SupabaseMemory = {
    get configured() { return !!cfg; },
    get enabled() { return !!cfg && !!session?.user?.id; },
    getUserKey() { return session?.user?.id || null; },
    getUserEmail() { return session?.user?.email || null; },
    getConfig() { return cfg ? { url: cfg.url, hasKey: true } : null; },
    configure(value) {
      const next = normalizeConfig({ url: value?.url, anonKey: value?.anonKey || cfg?.anonKey || '', memoryEnabled: true });
      if (!next) return false;
      const changed = !cfg || cfg.url !== next.url || cfg.anonKey !== next.anonKey;
      applyConfig(next);
      try { localStorage.setItem(configKey, JSON.stringify(next)); } catch {}
      if (changed) saveSession(null);
      return true;
    },
    clearConfig() {
      applyConfig(null);
      try { localStorage.removeItem(configKey); } catch {}
      saveSession(null);
      return true;
    },
    restoreSession,
    signIn,
    signUp,
    signOut,
    testConnection,
    async saveProfile(profile) {
      if (!session?.user?.id) return { ok: false, skipped: true };
      return post('/user_profiles?on_conflict=user_key', profile, 'resolution=merge-duplicates,return=minimal');
    },
    async saveChat(message) {
      if (!session?.user?.id) return { ok: false, skipped: true };
      return post('/ai_memory', message);
    },
    async loadChat(userKey, limit = 20) {
      if (!session?.user?.id || userKey !== session.user.id) return { ok: false, skipped: true };
      const query = `?user_key=eq.${encodeURIComponent(userKey)}&select=role,content,created_at&order=created_at.desc&limit=${Math.min(Math.max(Number(limit) || 20, 1), 100)}`;
      const data = await authorizedFetch(`${restUrl}/ai_memory${query}`);
      return { ok: true, data: Array.isArray(data) ? data.reverse() : [] };
    },
    async saveWatchlist(items) {
      if (!session?.user?.id) return { ok: false, skipped: true };
      const ownItems = items.map(item => ({ ...item, user_key: session.user.id }));
      return post('/watchlists?on_conflict=user_key,symbol', ownItems, 'resolution=merge-duplicates,return=minimal');
    },
    async saveLesson(insight, source = 'feedback', rating = null) {
      if (!session?.user?.id) return { ok: false, skipped: true };
      return post('/ai_learning', { user_key: session.user.id, insight, source, rating });
    },
    async loadLessons(limit = 10) {
      if (!session?.user?.id) return { ok: false, skipped: true };
      const size = Math.min(Math.max(Number(limit) || 10, 1), 50);
      const query = `?user_key=eq.${encodeURIComponent(session.user.id)}&select=insight,rating,created_at&order=created_at.desc&limit=${size}`;
      const data = await authorizedFetch(`${restUrl}/ai_learning${query}`);
      return { ok: true, data: Array.isArray(data) ? data : [] };
    },
    async savePlan(plan) {
      if (!session?.user?.id) return { ok: false, skipped: true };
      return post('/trade_plans', {
        user_key: session.user.id,
        symbol: String(plan?.symbol || ''),
        timeframe: String(plan?.timeframe || ''),
        proposal: plan?.proposal || {},
        risk: plan?.risk || {},
        decision: String(plan?.decision || 'pending'),
        decided_at: plan?.decided_at || null,
      });
    },
    async loadPlans(limit = 10) {
      if (!session?.user?.id) return { ok: false, skipped: true };
      const size = Math.min(Math.max(Number(limit) || 10, 1), 50);
      const query = `?user_key=eq.${encodeURIComponent(session.user.id)}&select=symbol,timeframe,proposal,risk,decision,decided_at,created_at&order=created_at.desc&limit=${size}`;
      const data = await authorizedFetch(`${restUrl}/trade_plans${query}`);
      return { ok: true, data: Array.isArray(data) ? data : [] };
    },
    async saveAlert(alert) {
      if (!session?.user?.id) return { ok: false, skipped: true };
      return post('/alerts', {
        user_key: session.user.id,
        symbol: String(alert?.symbol || ''),
        condition: String(alert?.condition || '>='),
        threshold: Number(alert?.threshold),
        active: alert?.active !== false,
      }, 'return=representation');
    },
    async loadAlerts(limit = 50) {
      if (!session?.user?.id) return { ok: false, skipped: true };
      const size = Math.min(Math.max(Number(limit) || 50, 1), 100);
      const query = `?user_key=eq.${encodeURIComponent(session.user.id)}&select=id,symbol,condition,threshold,active,triggered_at,created_at&order=created_at.desc&limit=${size}`;
      const data = await authorizedFetch(`${restUrl}/alerts${query}`);
      return { ok: true, data: Array.isArray(data) ? data : [] };
    },
    async triggerAlert(id) {
      if (!session?.user?.id) return { ok: false, skipped: true };
      return update(`/alerts?id=eq.${encodeURIComponent(id)}`, { triggered_at: new Date().toISOString(), active: false });
    },
    async deleteAlert(id) {
      if (!session?.user?.id) return { ok: false, skipped: true };
      return remove(`/alerts?id=eq.${encodeURIComponent(id)}`);
    },
  };
})();
