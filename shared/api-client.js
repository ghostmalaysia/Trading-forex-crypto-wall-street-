export function normalizeBaseUrl(value, fallback = 'http://127.0.0.1:8080') {
  const source = String(value || '').trim();
  if (!source) return fallback;
  const withProtocol = /^https?:\/\//i.test(source) ? source : `http://${source}`;
  return withProtocol.replace(/\/+$/, '');
}

export function createApiClient({ baseUrl, fetchImpl = fetch } = {}) {
  const base = normalizeBaseUrl(baseUrl);

  async function request(path, options = {}) {
    const response = await fetchImpl(`${base}${path}`, {
      ...options,
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
    });
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    return data;
  }

  return {
    baseUrl: base,
    health: () => request('/api/health'),
    market: () => request('/api/market'),
    news: () => request('/api/news'),
    askAi: (message, mode, context) => request('/api/ai', {
      method: 'POST',
      body: JSON.stringify({ message, mode, context }),
    }),
  };
}
