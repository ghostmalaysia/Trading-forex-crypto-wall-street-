import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'mim-ai-test-'));
process.env.PAPER_STATE_FILE = join(dir, 'paper-account.json');
process.env.PAPER_LEARNING_FILE = join(dir, 'paper-learning.json');

const { paperAccountStatus, paperConfig, guardPaperOrder, reservePaperOrder, settlePaperOrder } = await import('../ai/paper-account.mjs');
const { learningDigest, learningStatus, recordPaperOutcome } = await import('../ai/learning.mjs');
const { analyzeChart, buildPlan, riskGate } = await import('../ai/plan.mjs');
const { buildResearchInput, localResearch } = await import('../ai/research.mjs');
const { decisionAction, decisionExplanation } = await import('../ai/decision.mjs');

const rising = Array.from({ length: 24 }, (_, index) => 2300 + index * 4);
const context = { selected: 'XAU/USD', chart: { symbol: 'XAU/USD', series: rising } };

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test('paper account starts with $100 and 1%/3% caps', () => {
  const config = paperConfig();
  assert.equal(config.startingCapital, 100);
  assert.equal(config.maxRiskPct, 1);
  assert.equal(config.maxDailyLossPct, 3);
  const status = paperAccountStatus();
  assert.equal(status.equity, 100);
  assert.equal(status.blocked, false);
});

test('paper account blocks after daily loss cap', () => {
  const order = { id: 'paper-test-1', symbol: 'XAU/USD', side: 'buy', entry: 2300, stopLoss: 2280, takeProfit: 2340, units: 1, riskPct: 1 };
  reservePaperOrder(order);
  assert.equal(paperAccountStatus().openPositions, 1);
  settlePaperOrder(order, { pnl: -4, outcome: 'stop_loss' });
  const status = paperAccountStatus();
  assert.equal(status.equity, 96);
  assert.equal(status.dailyPnl, -4);
  assert.equal(status.dailyLossPct, 4);
  assert.equal(status.blocked, true);
  assert.throws(() => guardPaperOrder(), /daily_loss_cap_reached/);
});

test('paper outcomes create self-learning lessons including gold domain context', () => {
  recordPaperOutcome(
    { id: 'paper-learn-1', symbol: 'XAU/USD', side: 'buy' },
    { pnl: 2, outcome: 'take_profit' },
    { bias: 'bullish' },
  );
  recordPaperOutcome(
    { id: 'paper-learn-2', symbol: 'DXY', side: 'sell' },
    { pnl: -1, outcome: 'stop_loss' },
    { bias: 'bearish' },
  );
  const status = learningStatus();
  assert.equal(status.entries['XAU/USD'].samples, 1);
  assert.equal(status.entries.DXY.samples, 1);
  const digest = learningDigest();
  assert.ok(digest.some(item => item.includes('XAU/USD')));
  assert.ok(digest.some(item => item.includes('real yields')));
});

test('research report explains evidence, capital and scenarios in Malay', () => {
  const analysis = analyzeChart(context);
  const account = paperAccountStatus();
  const input = buildResearchInput(analysis, { ...context, paperAccount: account });
  assert.equal(input.focus, 'XAU/USD (emas)');
  assert.equal(input.capital.startingCapital, '$100.00');
  const report = localResearch(analysis, { ...context, paperAccount: account, researchInput: input });
  for (const heading of ['RINGKASAN', 'BUKTI DARI DATA', 'TAFSIR STRUKTUR', 'SENARIO', 'CADANGAN PAPER', 'RISIKO', 'KEPUTUSAN']) {
    assert.ok(report.includes(heading), `missing ${heading}`);
  }
  assert.ok(report.includes('$1.00'));
});

test('decision room explains BUY or NO TRADE with risk checks', () => {
  const analysis = analyzeChart(context);
  const plan = buildPlan(analysis, context);
  const risk = riskGate(plan, analysis, context);
  const action = decisionAction(plan, risk);
  assert.equal(action.action, 'BUY');
  const explanation = decisionExplanation(analysis, plan, risk, context);
  assert.ok(explanation.includes('Keputusan AI: BUY'));
  assert.ok(explanation.includes('Semakan risiko'));
  assert.ok(explanation.includes('risk_cap'));
  assert.ok(explanation.includes('manusia'));
});
