import test from 'node:test';
import assert from 'node:assert/strict';
import { auditHash, GENESIS_HASH, verifyAuditChain } from '../ai/audit-chain.mjs';
import { evaluateLiveRisk, livePolicy } from '../ai/live-risk.mjs';
import { createApproval, safeEqual, verifyApproval } from '../ai/live-approval.mjs';
import { LiveCircuitBreaker } from '../ai/circuit-breaker.mjs';
import { placeLiveOrder, reconcileLiveOrders } from '../ai/live-broker.mjs';
import { readMetaApiCredentials, tokenVaultStatus } from '../ai/token-vault.mjs';
import { summarizeReconciliation } from '../ai/reconciliation.mjs';

const plan = {
  symbol: 'XAU/USD',
  bias: 'bullish',
  entry: 2400,
  stopLoss: 2380,
  takeProfit: 2440,
  riskPct: 0.5,
  units: 2.5,
  paperOnly: true,
};
const risk = { decision: 'pending_human_approval', eligible: true };
const context = {
  selected: 'XAU/USD',
  quotedAt: new Date().toISOString(),
  spreadPct: 0.02,
};
const account = { equity: 10000, dailyLossPct: 0.5, openPositions: 0 };
const config = {
  liveTradingEnabled: true,
  killSwitch: false,
  credentialsConfigured: true,
  circuitTripped: false,
  maxRiskPct: 1,
  minRewardRisk: 1.5,
  maxDailyLossPct: 3,
  maxOpenPositions: 2,
  maxStaleSeconds: 120,
  maxSpreadPct: 0.1,
  maxNotional: 50000,
  minEquity: 100,
};

function chainLine(seq, prev, entry) {
  return JSON.stringify({ ...entry, seq, prev, hash: auditHash(prev, seq, entry) });
}

test('audit chain verifies valid logs and detects tampering', () => {
  const first = { timestamp: '2026-01-01T00:00:00.000Z', event: 'live_proposal_created', proposalId: 'live-1' };
  const second = { timestamp: '2026-01-01T00:00:01.000Z', event: 'live_order_result', status: 'blocked' };
  const firstHash = auditHash(GENESIS_HASH, 1, first);
  const log = [chainLine(1, GENESIS_HASH, first), chainLine(2, firstHash, second)].join('\n');
  assert.equal(verifyAuditChain(log).ok, true);
  assert.equal(verifyAuditChain(log).count, 2);
  const tampered = log.replace('"status":"blocked"', '"status":"filled"');
  assert.equal(verifyAuditChain(tampered).ok, false);
});

test('token vault reports configuration without exposing secrets', () => {
  const env = { METAAPI_TOKEN: 'token-value', METAAPI_ACCOUNT_ID: 'account-value' };
  const status = tokenVaultStatus({ env });
  assert.equal(status.configured, true);
  assert.equal(status.tokenConfigured, true);
  assert.equal(status.exposedToBrowser, false);
  assert.equal(JSON.stringify(status).includes('token-value'), false);
  assert.deepEqual(readMetaApiCredentials({ env }), { token: 'token-value', accountId: 'account-value' });
  assert.throws(() => readMetaApiCredentials({ env: {} }), /not configured/);
});

test('live risk gate blocks kill switch and sizes positions deterministically', () => {
  const blocked = evaluateLiveRisk({ plan, risk, context, account, config: { ...config, killSwitch: true } });
  assert.equal(blocked.decision, 'blocked');
  assert.equal(blocked.checks.find(item => item.name === 'kill_switch').pass, false);
  const passed = evaluateLiveRisk({ plan, risk, context, account, config });
  assert.equal(passed.decision, 'pending_live_approval');
  assert.equal(passed.symbol, 'XAU/USD');
  assert.equal(passed.side, 'buy');
  assert.ok(passed.units > 0);
  assert.ok(passed.notional <= config.maxNotional);
  const stale = evaluateLiveRisk({ plan, risk, context: { ...context, quotedAt: new Date(Date.now() - 200000).toISOString() }, account, config });
  assert.equal(stale.checks.find(item => item.name === 'fresh_quote').pass, false);
  const spread = evaluateLiveRisk({ plan, risk, context: { ...context, spreadPct: 0.5 }, account, config });
  assert.equal(spread.checks.find(item => item.name === 'spread').pass, false);
});

test('approval token is bound to a proposal and expires', () => {
  const policy = livePolicy({ LIVE_APPROVAL_SECRET: 'approval-secret' });
  assert.equal(policy.liveTradingEnabled, false);
  const proposal = { id: 'live-1', hash: 'abc123' };
  const approval = createApproval(proposal, 'approval-secret', 60);
  assert.equal(verifyApproval(approval, proposal, 'approval-secret').ok, true);
  assert.equal(verifyApproval(approval, proposal, 'other-secret').ok, false);
  assert.equal(verifyApproval(approval, { ...proposal, hash: 'changed' }, 'approval-secret').ok, false);
  const expired = { ...approval, expiresAt: new Date(Date.now() - 1000).toISOString() };
  assert.equal(verifyApproval(expired, proposal, 'approval-secret').reason, 'APPROVAL_EXPIRED');
  assert.equal(safeEqual('same', 'same'), true);
  assert.equal(safeEqual('same', 'different'), false);
});

test('circuit breaker trips after repeated failures and resets after cooldown', async () => {
  const breaker = new LiveCircuitBreaker({ maxFailures: 2, cooldownMs: 10 });
  breaker.recordFailure('first');
  assert.equal(breaker.snapshot().tripped, false);
  breaker.recordFailure('second');
  assert.equal(breaker.snapshot().tripped, true);
  assert.throws(() => breaker.assertClosed(), /circuit breaker/);
  await new Promise(resolve => setTimeout(resolve, 1100));
  breaker.assertClosed();
  assert.equal(breaker.snapshot().tripped, false);
});

test('default live adapter blocks orders and reconciliation', async () => {
  const env = { LIVE_ADAPTER: 'disabled' };
  const order = await placeLiveOrder({ proposal: { id: 'live-1' } }, { env });
  assert.equal(order.status, 'blocked');
  assert.equal(order.code, 'LIVE_PROVIDER_NOT_WIRED');
  assert.equal(JSON.stringify(order).includes('token'), false);
  const reconciliation = await reconcileLiveOrders({ orders: [] }, { env });
  assert.equal(reconciliation.status, 'blocked');
});

test('reconciliation summary detects missing and mismatched orders', () => {
  const summary = summarizeReconciliation(
    [{ id: 'a', status: 'filled' }, { id: 'b', status: 'filled' }],
    [{ id: 'a', status: 'filled' }, { id: 'c', status: 'filled' }],
  );
  assert.deepEqual(summary.missing, ['b']);
  assert.deepEqual(summary.unexpected, ['c']);
  assert.equal(summary.matched, false);
});
