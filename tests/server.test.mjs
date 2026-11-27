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
      MONITOR_DISABLED: 'true',
      ENABLE_LIVE_TRADING: 'true',
      LIVE_ADMIN_TOKEN: 'test-admin-token',
      LIVE_APPROVAL_SECRET: 'test-approval-secret',
      LIVE_ADAPTER: 'disabled',
      LIVE_KILL_SWITCH: 'true',
      METAAPI_TOKEN: 'test-token',
      METAAPI_ACCOUNT_ID: 'test-account',
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

    const news = await (await fetch(`${base}/api/news`)).json();
    assert.equal(news.provider, 'curated-mock');
    assert.deepEqual(news.focus, ['XAU/USD', 'DXY']);
    assert.ok(news.items.length > 0);
    assert.ok(news.calendar.length > 0);

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

    const broker = await (await fetch(`${base}/api/broker/status`)).json();
    assert.equal(broker.liveOrdersEnabled, false);
    assert.equal(broker.capabilities.paperOrders, true);

    const rulesResponse = await fetch(`${base}/api/monitor/rules`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rules: [{ symbol: 'XAU/USD', condition: '>=', threshold: 100 }] }),
    });
    assert.equal(rulesResponse.status, 200);
    const monitorRun = await (await fetch(`${base}/api/monitor/run`, { method: 'POST' })).json();
    assert.ok(monitorRun.events.some(event => event.type === 'threshold'));
    assert.equal(monitorRun.paperOnly, true);

    const backtestResponse = await fetch(`${base}/api/backtest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symbol: 'XAU/USD', series: rising, fast: 5, slow: 20 }),
    });
    assert.equal(backtestResponse.status, 200);
    assert.equal((await backtestResponse.json()).educational, true);

    const paperResponse = await fetch(`${base}/api/paper/order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plan: ai.plan, risk: ai.risk, context, confirmation: 'EXECUTE PAPER' }),
    });
    assert.equal(paperResponse.status, 200);
    const order = await paperResponse.json();
    assert.equal(order.status, 'simulated');
    assert.equal(order.paperOnly, true);

    const rejectedPaper = await fetch(`${base}/api/paper/order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plan: ai.plan, risk: ai.risk, context, confirmation: 'WRONG' }),
    });
    assert.equal(rejectedPaper.status, 400);

    const evaluationResponse = await fetch(`${base}/api/paper/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ order, price: order.takeProfit }),
    });
    assert.equal(evaluationResponse.status, 200);
    assert.equal((await evaluationResponse.json()).outcome, 'take_profit');

    const liveHeaders = { 'content-type': 'application/json', 'x-live-admin-token': 'test-admin-token' };
    const liveStatusInitial = await (await fetch(`${base}/api/live/status`)).json();
    assert.equal(liveStatusInitial.killSwitch, true);
    assert.equal(liveStatusInitial.liveOrdersEnabled, false);
    assert.equal(liveStatusInitial.vault.tokenConfigured, true);
    assert.equal(liveStatusInitial.vault.exposedToBrowser, false);

    const disarm = await fetch(`${base}/api/live/kill-switch`, {
      method: 'POST',
      headers: liveHeaders,
      body: JSON.stringify({ enabled: false, confirmation: 'DISABLE KILL SWITCH' }),
    });
    assert.equal(disarm.status, 200);
    assert.equal((await disarm.json()).killSwitch, false);

    const proposalResponse = await fetch(`${base}/api/live/proposal`, {
      method: 'POST',
      headers: liveHeaders,
      body: JSON.stringify({
        plan: ai.plan,
        risk: ai.risk,
        context: { ...context, quotedAt: new Date().toISOString(), spreadPct: 0.02 },
        account: { equity: 10000, dailyLossPct: 0, openPositions: 0 },
      }),
    });
    assert.equal(proposalResponse.status, 200);
    const proposal = await proposalResponse.json();
    assert.equal(proposal.decision, 'pending_live_approval');
    assert.equal(proposal.requiresApproval, true);
    assert.equal(proposal.liveOnly, true);

    const approvalResponse = await fetch(`${base}/api/live/approve`, {
      method: 'POST',
      headers: liveHeaders,
      body: JSON.stringify({ proposalId: proposal.id, confirmation: 'APPROVE LIVE' }),
    });
    assert.equal(approvalResponse.status, 200);
    const approval = await approvalResponse.json();
    assert.equal(approval.proposalId, proposal.id);
    assert.equal(typeof approval.code, 'string');

    const liveOrderResponse = await fetch(`${base}/api/live/order`, {
      method: 'POST',
      headers: liveHeaders,
      body: JSON.stringify({ approval, confirmation: 'EXECUTE LIVE' }),
    });
    assert.equal(liveOrderResponse.status, 200);
    const liveOrder = await liveOrderResponse.json();
    assert.equal(liveOrder.status, 'blocked');
    assert.equal(liveOrder.code, 'LIVE_PROVIDER_NOT_WIRED');

    const kill = await fetch(`${base}/api/live/kill-switch`, {
      method: 'POST',
      headers: liveHeaders,
      body: JSON.stringify({ enabled: true }),
    });
    assert.equal(kill.status, 200);
    assert.equal((await kill.json()).killSwitch, true);

    const reconcile = await fetch(`${base}/api/live/reconcile`, {
      method: 'POST',
      headers: liveHeaders,
      body: JSON.stringify({}),
    });
    assert.equal(reconcile.status, 200);
    assert.equal((await reconcile.json()).status, 'blocked');

    const auditVerify = await (await fetch(`${base}/api/audit/verify`)).json();
    assert.equal(auditVerify.ok, true);
    assert.ok(auditVerify.count > 0);

    const invalid = await fetch(`${base}/api/ai`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
    assert.equal(invalid.status, 400);

    const traversal = await fetch(`${base}/%2e%2e%2fserver.mjs`);
    assert.equal(traversal.status, 403);

    const index = await fetch(`${base}/`);
    assert.equal(index.status, 200);

    const audit = await readFile(auditFile, 'utf8');
    assert.match(audit, /"event":"market_snapshot"/);
    assert.match(audit, /"event":"ai_request"/);
    assert.match(audit, /"event":"monitor_event"/);
    assert.match(audit, /"event":"backtest_run"/);
    assert.match(audit, /"event":"paper_order_simulated"/);
    assert.match(audit, /"event":"live_proposal_created"/);
    assert.match(audit, /"event":"live_approval_issued"/);
    assert.match(audit, /"event":"live_order_result"/);
    assert.match(audit, /"event":"live_kill_switch_updated"/);
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
