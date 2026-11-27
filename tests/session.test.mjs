import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSessionPayload,
  getSessionUser,
  parseCookieHeader,
  refreshSession,
  serializeClearedCookie,
  serializeSessionCookie,
  sessionConfig,
  signInWithPassword,
  signOutSession,
  signUpWithPassword,
  signSession,
  supabaseAuthRequest,
  verifySession,
} from '../ai/session.mjs';

const env = {
  SUPABASE_URL: 'https://demo.supabase.co///',
  SUPABASE_ANON_KEY: 'anon-key',
  SESSION_COOKIE_SECRET: 'cookie-secret',
  SESSION_COOKIE_NAME: 'tradewall_session',
};

test('sessionConfig sanitizes configuration and hides secrets', () => {
  const config = sessionConfig({ env: { ...env, SESSION_SECURE: 'false', SESSION_TTL_SECONDS: '999999' } });
  assert.deepEqual(config, {
    supabaseUrl: 'https://demo.supabase.co',
    cookieName: 'tradewall_session',
    secure: false,
    ttlSeconds: 86400,
    configured: true,
  });
  assert.equal(JSON.stringify(config).includes('anon-key'), false);
  assert.equal(JSON.stringify(config).includes('cookie-secret'), false);
  assert.equal(sessionConfig({ env }).cookieName, '__Host-tradewall_session');
  assert.equal(sessionConfig({ env: {} }).configured, false);
  assert.equal(sessionConfig({ env: { ...env, SESSION_TTL_SECONDS: '10' } }).ttlSeconds, 300);
  assert.equal(sessionConfig({ env: { ...env, SESSION_TTL_SECONDS: '' } }).ttlSeconds, 3600);
});

test('signed sessions verify and reject tampering', () => {
  const payload = { sub: 'user-1', exp: 1900000000 };
  const token = signSession(payload, 'cookie-secret');
  assert.deepEqual(verifySession(token, 'cookie-secret'), payload);
  assert.equal(verifySession(token, 'other-secret'), null);
  const forgedBody = Buffer.from(JSON.stringify({ sub: 'user-2', exp: 1900000000 })).toString('base64url');
  assert.equal(verifySession(`${forgedBody}.${token.split('.')[1]}`, 'cookie-secret'), null);
  assert.equal(verifySession('broken.token', 'cookie-secret'), null);
  assert.equal(verifySession(token, ''), null);
});

test('session cookies carry secure flags, host prefix, expiry, and clearing rules', () => {
  const secureEnv = { ...env, SESSION_TTL_SECONDS: '600' };
  const cookie = serializeSessionCookie({ access_token: 'access', user_id: 'user-1' }, { env: secureEnv });
  assert.match(cookie, /^__Host-tradewall_session=/);
  assert.match(cookie, /Max-Age=600/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  const token = cookie.slice(cookie.indexOf('=') + 1, cookie.indexOf(';'));
  const payload = verifySession(token, 'cookie-secret');
  assert.equal(payload.access_token, 'access');
  assert.equal(payload.user_id, 'user-1');
  assert.ok(payload.exp > Date.now() / 1000);

  const insecureEnv = { ...env, SESSION_SECURE: false, SESSION_COOKIE_NAME: 'custom_session' };
  const insecureCookie = serializeSessionCookie({ sub: 'user-1' }, { env: insecureEnv });
  assert.match(insecureCookie, /^custom_session=/);
  assert.doesNotMatch(insecureCookie, /Secure/);
  assert.match(insecureCookie, /SameSite=Lax/);

  const cleared = serializeClearedCookie({ env: secureEnv });
  assert.match(cleared, /^__Host-tradewall_session=;/);
  assert.match(cleared, /Max-Age=0/);
  assert.match(cleared, /Secure/);
  const clearedInsecure = serializeClearedCookie({ env: insecureEnv });
  assert.match(clearedInsecure, /^custom_session=;/);
  assert.doesNotMatch(clearedInsecure, /Secure/);
});

test('parseCookieHeader decodes values and skips malformed pairs', () => {
  const cookies = parseCookieHeader('a=1; b=hello%20world; quoted="x=y"; broken=%ZZ; nope');
  assert.equal(cookies.a, '1');
  assert.equal(cookies.b, 'hello world');
  assert.equal(cookies.quoted, 'x=y');
  assert.equal(cookies.broken, '%ZZ');
  assert.equal(cookies.nope, undefined);
  assert.deepEqual(parseCookieHeader(undefined), {});
});

test('auth wrappers use Supabase paths, headers, and sanitized responses', async () => {
  const responses = {
    '/auth/v1/token?grant_type=password': {
      status: 200,
      data: {
        access_token: 'access',
        refresh_token: 'refresh',
        expires_in: 3600,
        user: { id: 'user-1', email: 'a@b.co' },
        apikey: 'must-not-leak',
        Authorization: 'Bearer must-not-leak',
      },
    },
    '/auth/v1/signup': { status: 200, data: { id: 'user-1' } },
    '/auth/v1/token?grant_type=refresh_token': { status: 200, data: { access_token: 'fresh' } },
    '/auth/v1/logout': { status: 204, data: {} },
    '/auth/v1/user': { status: 200, data: { id: 'user-1', email: 'a@b.co' } },
  };
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(url);
    const path = parsed.pathname + parsed.search;
    calls.push({ path, init });
    const response = responses[path];
    assert.ok(response, `unexpected path: ${path}`);
    assert.equal(parsed.origin, 'https://demo.supabase.co');
    assert.equal(init.headers.apikey, 'anon-key');
    assert.equal(init.headers['Content-Type'], 'application/json');
    assert.ok(init.signal);
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.data,
    };
  };
  const options = { env, fetchImpl };

  const signedIn = await signInWithPassword({ email: 'a@b.co', password: ' secret ' }, options);
  assert.equal(signedIn.ok, true);
  assert.equal(signedIn.status, 200);
  assert.equal(signedIn.data.user.id, 'user-1');
  assert.equal(signedIn.data.apikey, undefined);
  assert.equal(signedIn.data.Authorization, undefined);
  assert.equal(JSON.stringify(signedIn).includes('must-not-leak'), false);
  const signInCall = calls.find(call => call.path === '/auth/v1/token?grant_type=password');
  assert.equal(signInCall.init.method, 'POST');
  assert.equal(signInCall.init.headers.Authorization, 'Bearer anon-key');
  assert.deepEqual(JSON.parse(signInCall.init.body), { email: 'a@b.co', password: 'secret' });

  const signedUp = await signUpWithPassword({ email: 'a@b.co', password: 'secret' }, options);
  assert.equal(signedUp.ok, true);
  assert.ok(calls.some(call => call.path === '/auth/v1/signup' && call.init.method === 'POST'));

  const refreshed = await refreshSession({ refresh_token: 'refresh' }, options);
  assert.equal(refreshed.data.access_token, 'fresh');
  const refreshCall = calls.find(call => call.path === '/auth/v1/token?grant_type=refresh_token');
  assert.deepEqual(JSON.parse(refreshCall.init.body), { refresh_token: 'refresh' });

  const signedOut = await signOutSession({ accessToken: 'access' }, options);
  assert.equal(signedOut.ok, true);
  assert.equal(signedOut.status, 204);
  const signOutCall = calls.find(call => call.path === '/auth/v1/logout');
  assert.equal(signOutCall.init.headers.Authorization, 'Bearer access');

  const user = await getSessionUser({ accessToken: 'access' }, options);
  assert.equal(user.data.email, 'a@b.co');
  const userCall = calls.find(call => call.path === '/auth/v1/user');
  assert.equal(userCall.init.method, 'GET');
  assert.equal(userCall.init.headers.Authorization, 'Bearer access');
  assert.equal(userCall.init.body, undefined);
});

test('auth request maps invalid responses and missing configuration without leaking keys', async () => {
  const invalid = await supabaseAuthRequest('/user', { method: 'GET', accessToken: 'access' }, {
    env,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } }),
  });
  assert.deepEqual(invalid, { ok: true, status: 200, data: { message: 'invalid_response' } });
  const unconfigured = await signInWithPassword({ email: 'a@b.co', password: 'secret' }, {
    env: {},
    fetchImpl: async () => { throw new Error('should not be called'); },
  });
  assert.equal(unconfigured.ok, false);
  assert.equal(unconfigured.status, 503);
  assert.equal(JSON.stringify(unconfigured).includes('anon'), false);
});

test('invalid credentials are rejected before any auth request', async () => {
  let called = false;
  const options = { env, fetchImpl: async () => { called = true; return {}; } };
  assert.deepEqual(await signInWithPassword({ email: 'invalid', password: 'secret' }, options), {
    ok: false,
    status: 400,
    data: { message: 'invalid_credentials' },
  });
  assert.deepEqual(await signUpWithPassword({ email: 'a@b.co', password: '' }, options), {
    ok: false,
    status: 400,
    data: { message: 'invalid_credentials' },
  });
  assert.equal((await refreshSession({}, options)).status, 400);
  assert.equal((await signOutSession({}, options)).status, 400);
  assert.equal((await getSessionUser({}, options)).status, 400);
  assert.equal(called, false);
});

test('createSessionPayload returns scalar fields with an exp derived from expires_in', () => {
  const before = Math.floor(Date.now() / 1000);
  const payload = createSessionPayload({
    access_token: 'access',
    refresh_token: 'refresh',
    expires_in: 120,
    user: { id: 'user-1', email: 'a@b.co', app_metadata: { role: 'admin' } },
  }, { env });
  assert.deepEqual(Object.keys(payload).sort(), [
    'access_token', 'email', 'exp', 'expires_at', 'refresh_token', 'user_id',
  ].sort());
  assert.equal(payload.access_token, 'access');
  assert.equal(payload.refresh_token, 'refresh');
  assert.equal(payload.expires_at, payload.exp);
  assert.equal(payload.user_id, 'user-1');
  assert.equal(payload.email, 'a@b.co');
  assert.ok(payload.exp >= before + 120 && payload.exp <= before + 121);
  assert.equal(Object.values(payload).every(value => ['string', 'number', 'boolean'].includes(typeof value)), true);
  const fallback = createSessionPayload({ access_token: 'access' }, { env: { ...env, SESSION_TTL_SECONDS: '300' } });
  assert.ok(fallback.exp >= before + 300 && fallback.exp <= before + 301);
});
