import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const rising = Array.from({ length: 24 }, (_, index) => 2300 + index * 4);

function freePort() {
  const server = createServer();
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(url, child, logs) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early: ${logs()}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  throw new Error(`server did not become ready: ${logs()}`);
}

function sendJson(res, value, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(value));
}

test('HTTP endpoints serve screener, summaries, push, and sessions', { timeout: 30000 }, async () => {
  const stubPort = await freePort();
  const appPort = await freePort();
  const auditFile = '/tmp/opencode/tradewall-test-integrations-audit.jsonl';
  const paperStateFile = '/tmp/opencode/tradewall-test-integrations-paper.json';
  const learningFile = '/tmp/opencode/tradewall-test-integrations-learning.json';
  await rm(auditFile, { force: true });
  await rm(paperStateFile, { force: true });
  await rm(learningFile, { force: true });

  const seen = { push: [], auth: [] };
  const stub = createServer((req, res) => {
    const url = new URL(req.url, 'http://stub');
    if (url.pathname === '/push') {
      let raw = '';
      req.on('data', chunk => { raw += chunk.toString(); });
      req.on('end', () => {
        seen.push.push({ headers: req.headers, body: JSON.parse(raw || 'null') });
        sendJson(res, { data: [{ status: 'ok', id: 'ticket-1' }] });
      });
      return;
    }
    if (url.pathname.startsWith('/auth/v1/')) {
      let raw = '';
      req.on('data', chunk => { raw += chunk.toString(); });
      req.on('end', () => {
        seen.auth.push({ url: req.url, headers: req.headers, body: raw ? JSON.parse(raw) : null });
        if (url.pathname === '/auth/v1/token') {
          const refreshed = url.searchParams.get('grant_type') === 'refresh_token';
          sendJson(res, {
            access_token: refreshed ? 'stub-access-refreshed' : 'stub-access-token',
            refresh_token: refreshed ? 'stub-refresh-2' : 'stub-refresh-token',
            expires_in: 3600,
            token_type: 'bearer',
            user: { id: 'user-1', email: 'trader@example.com' },
          });
          return;
        }
        if (url.pathname === '/auth/v1/user') {
          sendJson(res, { user: { id: 'user-1', email: 'trader@example.com' } });
          return;
        }
        sendJson(res, {});
      });
      return;
    }
    const close = Array.from({ length: 24 }, (_, index) => 100 + index);
    sendJson(res, {
      chart: {
        result: [{
          meta: { regularMarketPrice: close.at(-1), chartPreviousClose: close.at(-2), currency: 'USD', exchangeName: 'TEST' },
          indicators: { quote: [{ close }] },
        }],
        error: null,
      },
    });
  });
  await new Promise(resolve => stub.listen(stubPort, '127.0.0.1', resolve));

  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(appPort),
      HOST: '127.0.0.1',
      GROQ_API_KEY: '',
      LONGBRIDGE_BIN: '/bin/false',
      MARKET_DATA_BASE_URL: `http://127.0.0.1:${stubPort}`,
      AUDIT_LOG_FILE: auditFile,
      PAPER_STATE_FILE: paperStateFile,
      PAPER_LEARNING_FILE: learningFile,
      MONITOR_DISABLED: 'true',
      EXPO_PUSH_URL: `http://127.0.0.1:${stubPort}/push`,
      PUSH_ADMIN_TOKEN: 'test-push-token',
      SUPABASE_URL: `http://127.0.0.1:${stubPort}`,
      SUPABASE_ANON_KEY: 'test-anon-key',
      SESSION_COOKIE_SECRET: 'test-cookie-secret',
      SESSION_SECURE: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });

  const base = `http://127.0.0.1:${appPort}`;
  try {
    await waitForHealth(`${base}/api/health`, child, () => output);

    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.marketAdapter, 'indicative');
    assert.equal(health.push.exposedToBrowser, false);
    assert.equal(health.session.configured, true);
    assert.equal(health.session.cookieName, '__Host-tradewall_session');

    const screenerResponse = await fetch(`${base}/api/screener`);
    assert.equal(screenerResponse.status, 200);
    const screener = await screenerResponse.json();
    assert.deepEqual(screener.rows.map(row => row.symbol), ['XAU/USD', 'DXY']);
    assert.ok(screener.rows.every(row => Number.isFinite(row.price)));
    assert.ok(screener.rows.every(row => ['above-mean', 'below-mean', 'at-mean', 'unavailable'].includes(row.bias)));
    assert.match(screener.note, /not financial advice/i);

    const summaryResponse = await fetch(`${base}/api/summary`);
    assert.equal(summaryResponse.status, 200);
    const summary = await summaryResponse.json();
    assert.equal(summary.scope, 'XAU/USD + DXY');
    assert.equal(summary.adapter, 'indicative');
    assert.ok(summary.bullets.some(bullet => bullet.startsWith('XAU/USD:')));
    assert.ok(summary.bullets.some(bullet => bullet.startsWith('DXY:')));

    const pushStatus = await (await fetch(`${base}/api/notifications/status`)).json();
    assert.equal(pushStatus.urlConfigured, true);
    assert.equal(pushStatus.exposedToBrowser, false);

    const pushBody = JSON.stringify({
      tokens: ['ExpoPushToken[test-device]'],
      title: 'Gold alert',
      body: 'XAU/USD moved',
      data: { symbol: 'XAU/USD' },
    });
    const unauthenticatedPush = await fetch(`${base}/api/notifications/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: pushBody,
    });
    assert.equal(unauthenticatedPush.status, 401);
    const wrongPushToken = await fetch(`${base}/api/notifications/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-push-admin-token': 'wrong' },
      body: pushBody,
    });
    assert.equal(wrongPushToken.status, 401);
    const crossOriginPush = await fetch(`${base}/api/notifications/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-push-admin-token': 'test-push-token', origin: 'http://evil.example' },
      body: pushBody,
    });
    assert.equal(crossOriginPush.status, 403);
    const authorizedPush = await fetch(`${base}/api/notifications/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-push-admin-token': 'test-push-token' },
      body: pushBody,
    });
    assert.equal(authorizedPush.status, 200);
    const pushResult = await authorizedPush.json();
    assert.equal(pushResult.sent, 1);
    assert.ok(!JSON.stringify(pushResult).includes('test-push-token'));
    assert.ok(!JSON.stringify(pushResult).includes('ExpoPushToken[test-device]'));
    assert.equal(seen.push.length, 1);
    assert.ok(Object.entries(seen.push[0].headers).every(([name]) => name.toLowerCase() !== 'x-push-admin-token'));
    assert.equal(seen.push[0].body[0].to, 'ExpoPushToken[test-device]');

    const sessionStatus = await (await fetch(`${base}/api/session`)).json();
    assert.equal(sessionStatus.configured, true);
    assert.equal(sessionStatus.authenticated, false);
    assert.equal(sessionStatus.cookieName, '__Host-tradewall_session');

    const crossOriginSignIn = await fetch(`${base}/api/session/signin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://evil.example' },
      body: JSON.stringify({ email: 'trader@example.com', password: 'secret-password' }),
    });
    assert.equal(crossOriginSignIn.status, 403);

    const signIn = await fetch(`${base}/api/session/signin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: base },
      body: JSON.stringify({ email: 'trader@example.com', password: 'secret-password' }),
    });
    assert.equal(signIn.status, 200);
    const signInBody = await signIn.json();
    assert.equal(signInBody.authenticated, true);
    const setCookie = signIn.headers.get('set-cookie') || '';
    assert.match(setCookie, /^__Host-tradewall_session=/);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /Secure/);
    assert.match(setCookie, /SameSite=Lax/);
    assert.equal(signInBody.user.email, 'trader@example.com');
    assert.ok(!JSON.stringify(signInBody).includes('stub-access-token'));
    assert.ok(!JSON.stringify(signInBody).includes('secret-password'));

    const cookie = setCookie.split(';')[0];
    const sessionUser = await fetch(`${base}/api/session/user`, { headers: { cookie } });
    assert.equal(sessionUser.status, 200);
    assert.equal((await sessionUser.json()).user.email, 'trader@example.com');

    const refresh = await fetch(`${base}/api/session/refresh`, {
      method: 'POST',
      headers: { cookie, origin: base },
    });
    assert.equal(refresh.status, 200);
    const refreshedCookie = (refresh.headers.get('set-cookie') || '').split(';')[0];
    assert.match(refreshedCookie, /^__Host-tradewall_session=/);
    assert.ok(!JSON.stringify(await refresh.json()).includes('stub-access-refreshed'));

    const refreshedUser = await fetch(`${base}/api/session/user`, { headers: { cookie: refreshedCookie } });
    assert.equal(refreshedUser.status, 200);

    const signOut = await fetch(`${base}/api/session`, {
      method: 'DELETE',
      headers: { cookie: refreshedCookie, origin: base },
    });
    assert.equal(signOut.status, 200);
    assert.match(signOut.headers.get('set-cookie') || '', /Max-Age=0/);

    assert.ok(seen.auth.some(call => call.url.includes('grant_type=password')));
    assert.ok(seen.auth.some(call => call.url.includes('grant_type=refresh_token')));
    assert.ok(seen.auth.some(call => call.url.endsWith('/auth/v1/user')));
    assert.ok(seen.auth.some(call => call.url.endsWith('/auth/v1/logout')));

    const audit = await readFile(auditFile, 'utf8');
    assert.match(audit, /"event":"market_summary_generated"/);
    assert.match(audit, /"event":"push_sent"/);
    assert.match(audit, /"event":"session_signin"/);
    assert.match(audit, /"event":"session_refreshed"/);
    assert.match(audit, /"event":"session_signout"/);
    assert.ok(!audit.includes('stub-access-token'));
    assert.ok(!audit.includes('stub-access-refreshed'));
    assert.ok(!audit.includes('test-push-token'));
    assert.ok(!audit.includes('secret-password'));
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', resolve);
      setTimeout(resolve, 2000).unref();
    });
    await new Promise(resolve => stub.close(resolve));
  }
});
