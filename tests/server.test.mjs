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

test('HTTP endpoints serve health, market, AI plans, and static files', { timeout: 30000 }, async () => {
  const stubPort = await freePort();
  const appPort = await freePort();
  const auditFile = '/tmp/opencode/tradewall-test-audit.jsonl';
  await rm(auditFile, { force: true });

  const stub = createServer((req, res) => {
    const close = Array.from({ length: 24 }, (_, index) => 100 + index);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      chart: {
        result: [{
          meta: { regularMarketPrice: close.at(-1), chartPreviousClose: close.at(-2), currency: 'USD', exchangeName: 'TEST' },
          indicators: { quote: [{ close }] },
        }],
        error: null,
      },
    }));
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
    assert.equal(health.provider, 'mock');
    assert.equal(typeof health.marketProvider, 'string');

    const market = await (await fetch(`${base}/api/market`)).json();
    assert.equal(market.provider, 'live');
    assert.deepEqual(market.items.map(item => item.symbol), ['XAU/USD', 'DXY']);

    const context = {
      selected: 'XAU/USD',
      market: 'Gold',
      timeframe: '1D',
      dataSource: 'market',
      chart: { symbol: 'XAU/USD', series: rising },
      history: [],
    };
    const aiResponse = await fetch(`${base}/api/ai`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Bina cadangan paper trading', mode: 'plan', context }),
    });
    assert.equal(aiResponse.status, 200);
    const ai = await aiResponse.json();
    assert.equal(ai.plan.bias, 'bullish');
    assert.equal(ai.risk.decision, 'pending_human_approval');
    assert.equal(ai.risk.paperOnly, true);

    const invalid = await fetch(`${base}/api/ai`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
    assert.equal(invalid.status, 400);

    const traversal = await fetch(`${base}/%2e%2e%2fserver.mjs`);
    assert.equal(traversal.status, 403);

    const index = await fetch(`${base}/`);
    assert.equal(index.status, 200);

    const audit = await readFile(auditFile, 'utf8');
    assert.match(audit, /"event":"market_snapshot"/);
    assert.match(audit, /"event":"ai_request"/);
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
