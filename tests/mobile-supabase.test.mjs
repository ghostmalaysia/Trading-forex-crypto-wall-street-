import test from 'node:test';
import assert from 'node:assert/strict';
import { createMobileSupabaseClient } from '../mobile/supabase-client.js';

function memoryStorage() {
  const values = new Map();
  return {
    readJson: async (key, fallback = null) => values.has(key) ? values.get(key) : fallback,
    writeJson: async (key, value) => { values.set(key, value); },
    removeJson: async (key) => { values.delete(key); },
  };
}

function json(value, ok = true, status = 200) {
  return { ok, status, text: async () => JSON.stringify(value) };
}

test('mobile cloud client validates config and rejects secret keys', async () => {
  const client = createMobileSupabaseClient({ storage: memoryStorage(), fetchImpl: async () => json({}) });
  assert.equal(await client.configure('http://demo.supabase.co', 'anon'), false);
  assert.equal(await client.configure('https://demo.supabase.co', 'service_role_bad'), false);
  assert.equal(await client.configure('https://demo.supabase.co', 'sb_publishable_ok'), true);
  assert.equal(client.getState().configured, true);
  assert.equal(client.getPublicConfig().url, 'https://demo.supabase.co');
  await client.clearConfig();
  assert.equal(client.getState().configured, false);
});

test('mobile cloud client signs in and syncs per-user data', async () => {
  const calls = [];
  const storage = memoryStorage();
  const session = {
    access_token: 'access',
    refresh_token: 'refresh',
    expires_in: 3600,
    user: { id: 'user-1', email: 'a@b.co' },
  };
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes('/token?grant_type=password')) return json(session);
    if (url.includes('/rest/v1/user_profiles?')) return json([{ preferences: { theme: 'dark', default_symbol: 'DXY' } }]);
    if (url.includes('/rest/v1/user_profiles')) return json({});
    if (url.includes('/rest/v1/watchlists?')) return json([{ symbol: 'XAU/USD', market: 'Gold futures proxy' }]);
    if (url.includes('/rest/v1/ai_memory?')) return json([{ role: 'ai', content: 'newer', created_at: '2026-01-02' }]);
    if (url.includes('/rest/v1/ai_memory')) return json({});
    throw new Error(`unexpected request: ${url}`);
  };
  const client = createMobileSupabaseClient({ storage, fetchImpl });
  await client.configure('https://demo.supabase.co', 'sb_publishable_ok');
  await client.signIn('a@b.co', 'password123');

  assert.equal(client.getState().signedIn, true);
  assert.equal(client.getState().userKey, 'user-1');
  await client.saveSettings({ theme: 'dark', default_symbol: 'XAU/USD' });
  const settings = await client.loadSettings();
  assert.equal(settings.preferences.default_symbol, 'DXY');
  const list = await client.loadWatchlist();
  assert.equal(list.data[0].symbol, 'XAU/USD');
  const chat = await client.loadChat(5);
  assert.equal(chat.data[0].content, 'newer');

  const profilePost = calls.find(call => call.url.includes('/rest/v1/user_profiles?') && call.options.method === 'POST');
  assert.equal(profilePost.options.headers.Authorization, 'Bearer access');
  assert.equal(profilePost.options.headers.apikey, 'sb_publishable_ok');
  assert.equal(JSON.parse(profilePost.options.body).user_key, 'user-1');

  const restored = createMobileSupabaseClient({ storage, fetchImpl });
  await restored.init();
  assert.equal(restored.getState().signedIn, true);
});
