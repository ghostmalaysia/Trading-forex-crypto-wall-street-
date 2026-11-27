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

  assert.deepEqual(calls.map(call => call.url), [
    'https://trade.example/api/health',
    'https://trade.example/api/market',
    'https://trade.example/api/news',
    'https://trade.example/api/ai',
  ]);
  const aiCall = calls.at(-1);
  assert.equal(aiCall.options.method, 'POST');
  assert.equal(aiCall.options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(aiCall.options.body), {
    message: 'Bina plan',
    mode: 'plan',
    context: { selected: 'XAU/USD' },
  });
});

test('createApiClient surfaces server error messages', async () => {
  const client = createApiClient({
    baseUrl: 'http://localhost:8080',
    fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ error: 'Too many AI requests.' }) }),
  });
  await assert.rejects(() => client.health(), /Too many AI requests/);
});
