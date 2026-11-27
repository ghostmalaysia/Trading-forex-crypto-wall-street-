import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeChart, buildPlan, normalizePlan, riskGate } from '../ai/plan.mjs';
import { platformKnowledge, systemPrompt, planSystemPrompt } from '../ai/prompt.mjs';

const rising = Array.from({ length: 24 }, (_, index) => 2300 + index * 4);

test('analyzeChart detects a bullish gold series', () => {
  const analysis = analyzeChart({ selected: 'XAU/USD', chart: { symbol: 'XAU/USD', series: rising } });
  assert.equal(analysis.insufficient, false);
  assert.equal(analysis.trend, 'bullish');
  assert.equal(analysis.points, 24);
  assert.ok(analysis.rsi14 > 50);
});

test('buildPlan produces a paper-only plan with valid levels for gold', () => {
  const context = { selected: 'XAU/USD', market: 'Gold', preferences: { paperEquity: 10000 } };
  const analysis = analyzeChart({ ...context, chart: { symbol: 'XAU/USD', series: rising } });
  const plan = buildPlan(analysis, context);
  assert.equal(plan.bias, 'bullish');
  assert.ok(plan.stopLoss < plan.entry);
  assert.ok(plan.takeProfit > plan.entry);
  assert.equal(plan.riskPct, 1);
  assert.equal(plan.paperOnly, true);
});

test('buildPlan refuses symbols outside the gold/USD focus', () => {
  const context = { selected: 'BTC/USD', market: 'Crypto' };
  const analysis = analyzeChart({ ...context, chart: { symbol: 'BTC/USD', series: rising } });
  const plan = buildPlan(analysis, context);
  assert.equal(plan.bias, 'neutral');
  assert.equal(plan.riskPct, 0);
});

test('normalizePlan rejects wrong-side stop and target', () => {
  const context = { selected: 'XAU/USD', market: 'Gold' };
  const analysis = analyzeChart({ ...context, chart: { symbol: 'XAU/USD', series: rising } });
  const plan = normalizePlan({ bias: 'bullish', entry: 2400, stopLoss: 2450, takeProfit: 2500 }, analysis, context);
  assert.ok(plan.stopLoss < plan.entry);
  assert.ok(plan.takeProfit > plan.entry);
});

test('riskGate blocks neutral or over-risk plans', () => {
  const context = { selected: 'XAU/USD', market: 'Gold', risk: { dailyLossPct: 0, openPositions: 0 } };
  const analysis = analyzeChart({ ...context, chart: { symbol: 'XAU/USD', series: rising } });
  const good = riskGate(buildPlan(analysis, context), analysis, context);
  assert.equal(good.decision, 'pending_human_approval');
  assert.equal(good.paperOnly, true);
  const overRisk = riskGate({ ...buildPlan(analysis, context), riskPct: 2 }, analysis, context);
  assert.equal(overRisk.decision, 'blocked');
});

test('prompts carry the focus and JSON plan contract', async () => {
  const knowledge = await platformKnowledge();
  const chat = systemPrompt(knowledge, { selected: 'XAU/USD' });
  const plan = planSystemPrompt(knowledge, { selected: 'XAU/USD' });
  assert.match(chat, /XAU\/USD/);
  assert.match(chat, /DXY/);
  assert.match(plan, /JSON/);
  assert.match(plan, /stopLoss/);
});
