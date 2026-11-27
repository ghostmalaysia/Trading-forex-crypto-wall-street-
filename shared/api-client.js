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
    monitor: () => request('/api/monitor'),
    brokerStatus: () => request('/api/broker/status'),
    runMonitor: () => request('/api/monitor/run', { method: 'POST' }),
    setMonitorRules: rules => request('/api/monitor/rules', {
      method: 'POST',
      body: JSON.stringify({ rules }),
    }),
    backtest: input => request('/api/backtest', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
    paperOrder: input => request('/api/paper/order', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
    evaluatePaperOrder: input => request('/api/paper/evaluate', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
    liveStatus: () => request('/api/live/status'),
    liveProposal: (input, headers) => request('/api/live/proposal', {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    }),
    approveLive: (input, headers) => request('/api/live/approve', {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    }),
    executeLive: (input, headers) => request('/api/live/order', {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    }),
    setLiveKillSwitch: (input, headers) => request('/api/live/kill-switch', {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    }),
    reconcileLive: (input, headers) => request('/api/live/reconcile', {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    }),
    verifyAudit: () => request('/api/audit/verify'),
    askAi: (message, mode, context) => request('/api/ai', {
      method: 'POST',
      body: JSON.stringify({ message, mode, context }),
    }),
  };
}
