import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, normalizeBaseUrl } from '../shared/api-client.js';

test('normalizeBaseUrl accepts blank, bare host, and trailing slash', () => {
  assert.equal(normalizeBaseUrl('', 'http://fallback:8080'), 'http://fallback:8080');
  assert.equal(normalizeBaseUrl('example.com:9000/'), 'http://example.com:9000');
  assert.equal(normalizeBaseUrl('https://api.example.com//'), 'https://api.example.com');
});

test('createApiClient builds health, market, news, and AI requests', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    const body = url.endsWith('/api/news')
      ? { items: [], calendar: [], focus: ['XAU/USD', 'DXY'] }
      : { ok: true };
    return { ok: true, status: 200, json: async () => body };
  };
  const client = createApiClient({ baseUrl: 'https://trade.example', fetchImpl });

  assert.equal((await client.health()).ok, true);
  assert.equal((await client.market()).ok, true);
  assert.deepEqual((await client.news()).focus, ['XAU/USD', 'DXY']);
  await client.askAi('Bina plan', 'plan', { selected: 'XAU/USD' });
  await client.monitor();
  await client.brokerStatus();
  await client.runMonitor();
  await client.setMonitorRules([{ symbol: 'XAU/USD', condition: '>=', threshold: 1 }]);
  await client.backtest({ series: [1, 2, 3] });
  await client.paperOrder({ confirmation: 'EXECUTE PAPER' });
  await client.evaluatePaperOrder({ order: {}, price: 1 });
  await client.liveStatus();
  await client.liveProposal({ symbol: 'XAU/USD' });
  const adminHeaders = { 'x-live-admin-token': 'test-admin-token' };
  await client.approveLive({ proposalId: 'live-1', confirmation: 'APPROVE LIVE' }, adminHeaders);
  await client.executeLive({ approval: { id: 'apr-1' }, confirmation: 'EXECUTE LIVE' }, adminHeaders);
  await client.setLiveKillSwitch({ enabled: true }, adminHeaders);
  await client.reconcileLive({}, adminHeaders);
  await client.verifyAudit();

  assert.deepEqual(calls.map(call => call.url), [
    'https://trade.example/api/health',
    'https://trade.example/api/market',
    'https://trade.example/api/news',
    'https://trade.example/api/ai',
    'https://trade.example/api/monitor',
    'https://trade.example/api/broker/status',
    'https://trade.example/api/monitor/run',
    'https://trade.example/api/monitor/rules',
    'https://trade.example/api/backtest',
    'https://trade.example/api/paper/order',
    'https://trade.example/api/paper/evaluate',
    'https://trade.example/api/live/status',
    'https://trade.example/api/live/proposal',
    'https://trade.example/api/live/approve',
    'https://trade.example/api/live/order',
    'https://trade.example/api/live/kill-switch',
    'https://trade.example/api/live/reconcile',
    'https://trade.example/api/audit/verify',
  ]);
  const aiCall = calls[3];
  assert.equal(aiCall.options.method, 'POST');
  assert.equal(aiCall.options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(aiCall.options.body), {
    message: 'Bina plan',
    mode: 'plan',
    context: { selected: 'XAU/USD' },
  });
  assert.deepEqual(JSON.parse(calls[7].options.body), {
    rules: [{ symbol: 'XAU/USD', condition: '>=', threshold: 1 }],
  });
  for (const index of [13, 14, 15, 16]) {
    assert.equal(calls[index].options.headers['x-live-admin-token'], 'test-admin-token');
  }
});

test('createApiClient surfaces server error messages', async () => {
  const client = createApiClient({
    baseUrl: 'http://localhost:8080',
    fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ error: 'Too many AI requests.' }) }),
  });
  await assert.rejects(() => client.health(), /Too many AI requests/);
});
