// Minimal Supabase Auth + PostgREST client for this dependency-free MVP.
(function () {
  const cfg = window.SUPABASE_CONFIG || {};
  const configured = !!(cfg.memoryEnabled && cfg.url && cfg.anonKey && !cfg.url.includes('YOUR_PROJECT'));
  const projectUrl = configured ? cfg.url.replace(/\/$/, '') : null;
  const restUrl = projectUrl ? `${projectUrl}/rest/v1` : null;
  const authUrl = projectUrl ? `${projectUrl}/auth/v1` : null;
  const sessionKey = 'tradewall_supabase_session';
  let session = null;
  let refreshPromise = null;

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
    if (!configured) throw new Error('Supabase is not configured.');
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
    if (!configured) return null;
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
    if (!configured || !session) throw new Error('Sign in to use cloud memory.');
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

  window.SupabaseMemory = {
    configured,
    get enabled() { return configured && !!session?.user?.id; },
    getUserKey() { return session?.user?.id || null; },
    getUserEmail() { return session?.user?.email || null; },
    restoreSession,
    signIn,
    signUp,
    signOut,
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
  };
})();
