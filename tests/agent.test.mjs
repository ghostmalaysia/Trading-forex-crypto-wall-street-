import test from 'node:test';
import assert from 'node:assert/strict';
import { detectAnomalies, evaluateRules, normalizeRule } from '../ai/monitor.mjs';
import { backtestSmaCross } from '../ai/backtest.mjs';
import { evaluatePaperOrder, simulateFill } from '../ai/execution.mjs';
import { brokerStatus, brokers } from '../ai/broker.mjs';
import { analyzeChart, buildPlan, riskGate } from '../ai/plan.mjs';

const rising = Array.from({ length: 24 }, (_, index) => 2300 + index * 4);

test('monitor rules are limited to focus symbols and evaluate thresholds', () => {
  assert.equal(normalizeRule({ symbol: 'BTC/USD', condition: '>=', threshold: 1 }), null);
  const rule = normalizeRule({ symbol: 'xau/usd', condition: '<=', threshold: 2300 });
  assert.equal(rule.symbol, 'XAU/USD');
  assert.equal(rule.condition, '<=');
  const events = evaluateRules([{ symbol: 'XAU/USD', price: 2295 }, { symbol: 'DXY', price: 104 }], [rule]);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'threshold');
});

test('monitor detects an unusual price move', () => {
  const series = Array.from({ length: 25 }, () => 100);
  series[series.length - 1] = 130;
  const events = detectAnomalies([{ symbol: 'DXY', price: 130, series }], { zScore: 2 });
  assert.equal(events.length, 1);
  assert.equal(events[0].direction, 'up');
  assert.equal(events[0].symbol, 'DXY');
});

test('backtest reports insufficient data and educational metrics', () => {
  assert.equal(backtestSmaCross([1, 2, 3]).insufficient, true);
  const series = [
    ...Array.from({ length: 30 }, () => 100),
    ...Array.from({ length: 30 }, (_, index) => 100 + index),
    ...Array.from({ length: 30 }, (_, index) => 130 - index),
  ];
  const result = backtestSmaCross(series, { fast: 5, slow: 20, feePct: 0.05 });
  assert.equal(result.insufficient, false);
  assert.equal(result.educational, true);
  assert.ok(result.tradeCount >= 1);
  assert.ok(Number.isFinite(result.totalReturnPct));
  assert.ok(result.maxDrawdownPct >= 0);
});

test('paper simulation requires confirmation and passes gate', async () => {
  const context = { selected: 'XAU/USD', market: 'Gold', preferences: { paperEquity: 10000 } };
  const analysis = analyzeChart({ ...context, chart: { symbol: 'XAU/USD', series: rising } });
  const plan = buildPlan(analysis, context);
  const risk = riskGate(plan, analysis, context);
  await assert.rejects(async () => simulateFill({ plan, risk, context }), /EXECUTE PAPER/);
  const order = simulateFill({ plan, risk, context, confirmation: 'EXECUTE PAPER' });
  assert.equal(order.status, 'simulated');
  assert.equal(order.paperOnly, true);
  assert.equal(order.side, 'buy');
  assert.ok(order.slippagePct > 0);
});

test('paper order evaluation reports pnl and outcome', () => {
  const buy = { id: 'paper-1', symbol: 'XAU/USD', side: 'buy', entry: 2400, stopLoss: 2380, takeProfit: 2440, units: 5 };
  assert.equal(evaluatePaperOrder(buy, 2450).outcome, 'take_profit');
  assert.equal(evaluatePaperOrder(buy, 2370).outcome, 'stop_loss');
  assert.ok(evaluatePaperOrder(buy, 2420).pnl > 0);
});

test('broker status keeps live orders disabled', async () => {
  const status = brokerStatus();
  assert.equal(status.liveOrdersEnabled, false);
  assert.equal(status.capabilities.paperOrders, true);
  await assert.rejects(() => brokers.metaapi.placeOrder({}), /disabled/);
});
