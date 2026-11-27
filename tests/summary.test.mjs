import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSummaryInput, summarizeMarket, summarySystemPrompt } from '../ai/summary.mjs';

const at = '2026-11-27T12:00:00.000Z';

function fixture() {
  return {
    market: {
      items: [
        { symbol: 'xau/usd', price: '2400', previousClose: '2350', series: [1, 2], apiKey: 'LEAK_MARKET' },
        { symbol: 'DXY', price: 103.8, previousClose: 104, password: 'LEAK_DXY' },
        { symbol: 'BTC/USD', price: 60000, previousClose: 59000 },
        { symbol: 'XAU/USD', price: NaN, previousClose: 2350 },
        { price: 1 },
      ],
      provider: 'live',
      fetchedAt: at,
      errors: [{ message: 'LEAK_ERROR' }],
    },
    monitor: {
      events: Array.from({ length: 12 }, (_, index) => ({
        symbol: index % 2 ? 'DXY' : 'XAU/USD',
        type: index % 3 === 0 ? 'anomaly' : 'threshold',
        reason: `event ${index}`,
        at,
        token: `LEAK_MONITOR_${index}`,
      })),
    },
    audit: Array.from({ length: 12 }, (_, index) => ({
      event: index === 0 ? 'live_error' : `audit_${index}`,
      timestamp: at,
      detail: { secret: `LEAK_AUDIT_${index}` },
    })),
    alerts: Array.from({ length: 12 }, (_, index) => ({
      symbol: 'xau/usd',
      condition: '>=',
      threshold: 2400 + index,
      triggeredAt: at,
      authorization: `Bearer LEAK_ALERT_${index}`,
    })),
  };
}

test('buildSummaryInput sanitizes, normalizes and caps data without leaking secrets', () => {
  const input = buildSummaryInput(fixture());
  assert.deepEqual(Object.keys(input), ['market', 'provider', 'fetchedAt', 'monitor', 'audit', 'alerts']);
  assert.equal(input.provider, 'live');
  assert.equal(input.fetchedAt, at);
  assert.equal(input.market.length, 3);
  assert.deepEqual(input.market[0], { symbol: 'XAU/USD', price: 2400, previousClose: 2350, changePct: 2.13 });
  assert.deepEqual(input.market[1], { symbol: 'DXY', price: 103.8, previousClose: 104, changePct: -0.19 });
  assert.equal(input.monitor.length, 10);
  assert.deepEqual(Object.keys(input.monitor[0]), ['symbol', 'type', 'message', 'at']);
  assert.equal(input.monitor[0].message, 'event 0');
  assert.equal(input.audit.length, 10);
  assert.deepEqual(input.audit[0], { event: 'live_error', at });
  assert.equal(input.alerts.length, 10);
  assert.deepEqual(input.alerts[0], { symbol: 'XAU/USD', message: '>= 2400', at });
  assert.ok(!JSON.stringify(input).includes('LEAK_'));
});

test('summarizeMarket produces deterministic Malay bullets for both focus symbols', () => {
  const summary = summarizeMarket(buildSummaryInput(fixture()));
  assert.equal(summary.scope, 'XAU/USD + DXY');
  assert.equal(summary.provider, 'deterministic');
  assert.equal(summary.confidence, 'rule-based');
  assert.ok(!Number.isNaN(Date.parse(summary.generatedAt)));
  assert.ok(summary.bullets.length > 0 && summary.bullets.length <= 6);
  assert.ok(summary.bullets.every(bullet => typeof bullet === 'string'));

  const text = summary.bullets.join(' ');
  assert.match(text, /XAU\/USD/);
  assert.match(text, /DXY/);
  assert.match(text, /\+2\.13%/);
  assert.match(text, /-0\.19%/);
  assert.match(text, /naik \(up\)/);
  assert.match(text, /turun \(down\)/);
  assert.match(text, /10 event monitor\/anomali \(4 anomali\)/);
  assert.match(text, /attention\/perhatian/);
  assert.ok(!JSON.stringify(summary).includes('LEAK_'));
});

test('summarizeMarket treats unchanged prices as flat', () => {
  const summary = summarizeMarket({
    market: [
      { symbol: 'XAU/USD', price: 100, previousClose: 100 },
      { symbol: 'DXY', price: 100, previousClose: 100 },
    ],
  });
  const text = summary.bullets.join(' ');
  assert.match(text, /XAU\/USD: malar \(flat\)/);
  assert.match(text, /DXY: malar \(flat\)/);
  assert.equal(summary.aiError, undefined);
});

test('summarySystemPrompt enforces scope, data-only input and no live trading instructions', () => {
  const prompt = summarySystemPrompt('knowledge block', buildSummaryInput(fixture()));
  assert.match(prompt, /XAU\/USD/);
  assert.match(prompt, /DXY/);
  assert.match(prompt, /No live trading instructions/i);
  assert.match(prompt, /data only/i);
  assert.ok(prompt.includes('knowledge block'));
  assert.ok(!prompt.includes('LEAK_'));
});

test('summarizeMarket includes injected AI text without overriding deterministic bullets', async () => {
  let messages;
  const complete = async pair => {
    messages = pair;
    return { text: 'Ringkasan AI yang pendek.', provider: 'mock' };
  };
  const expected = summarizeMarket(buildSummaryInput(fixture())).bullets;
  const summary = await summarizeMarket(buildSummaryInput(fixture()), { complete });
  assert.equal(messages.length, 2);
  assert.deepEqual(messages.map(message => message.role), ['system', 'user']);
  assert.match(messages[1].content, /Melayu/);
  assert.equal(summary.aiSummary, 'Ringkasan AI yang pendek.');
  assert.equal(summary.aiProvider, 'mock');
  assert.deepEqual(summary.bullets, expected);
  assert.equal(summary.provider, 'deterministic');
});

test('summarizeMarket accepts a string reply from a synchronous injector', () => {
  const summary = summarizeMarket(buildSummaryInput(fixture()), {
    complete: () => 'Ringkasan dari string.',
  });
  assert.equal(summary.aiSummary, 'Ringkasan dari string.');
  assert.equal(summary.aiProvider, 'injected');
  assert.equal(summary.aiError, undefined);
});

test('summarizeMarket falls back silently when the injector fails', async () => {
  const thrown = summarizeMarket(buildSummaryInput(fixture()), {
    complete: () => {
      throw new Error('provider unavailable');
    },
  });
  assert.equal(thrown.aiError, 'fallback');
  assert.equal(thrown.aiSummary, undefined);
  assert.ok(thrown.bullets.length > 0);

  const rejected = await summarizeMarket(buildSummaryInput(fixture()), {
    complete: async () => {
      throw new Error('provider unavailable');
    },
  });
  assert.equal(rejected.aiError, 'fallback');
  assert.equal(rejected.aiSummary, undefined);
  assert.deepEqual(rejected.bullets, thrown.bullets);
});
