import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCandlePatterns, explainCandlePatterns, normalizeCandleSeries, toCandles } from '../shared/candle-patterns.js';

const bullishEngulfing = [
  { open: 100, high: 101, low: 99.5, close: 101 },
  { open: 101, high: 101.5, low: 100, close: 100.5 },
  { open: 100.5, high: 101, low: 99.5, close: 100 },
  { open: 100, high: 106, low: 99.5, close: 105.5 },
];

const hammer = [
  { open: 110, high: 111, low: 109, close: 109 },
  { open: 109, high: 109.5, low: 107, close: 107 },
  { open: 107, high: 107.5, low: 105, close: 105 },
  { open: 105, high: 105.5, low: 100, close: 105.5 },
];

const shootingStar = [
  { open: 100, high: 101, low: 99, close: 100 },
  { open: 100, high: 104, low: 99, close: 103 },
  { open: 103, high: 107, low: 102, close: 106 },
  { open: 106, high: 112, low: 105.5, close: 105.5 },
];

test('numeric series produce deterministic candles with body and wicks', () => {
  const candles = toCandles([100, 102, 101]);
  assert.equal(candles.length, 3);
  assert.equal(candles[1].open, 100);
  assert.equal(candles[1].close, 102);
  assert.equal(candles[1].direction, 'bullish');
  assert.ok(candles[1].body > 0);
  assert.ok(candles[1].range >= candles[1].body);
  assert.ok(candles[1].high >= candles[1].close);
  assert.ok(candles[1].low <= candles[1].open);
});

test('normalization keeps only safe numeric OHLC fields', () => {
  const series = normalizeCandleSeries([
    { open: 100, high: 105, low: 98, close: 102, secret: 'ignore' },
    '104',
    'bad',
  ]);
  assert.equal(series.length, 2);
  assert.deepEqual(series[0], { open: 100, high: 105, low: 98, close: 102 });
  assert.equal(series[1], 104);
});

test('bullish engulfing produces a high-confidence BUY signal', () => {
  const result = detectCandlePatterns(bullishEngulfing, { symbol: 'XAU/USD', timeframe: '1D' });
  assert.equal(result.insufficient, false);
  assert.ok(result.patterns.some(item => item.id === 'bullish_engulfing'));
  assert.equal(result.signal.action, 'BUY');
  assert.equal(result.signal.confidence, 'high');
  assert.equal(result.signal.pattern, 'bullish_engulfing');
  assert.match(result.signal.signature, /XAU\/USD:1D:BUY:bullish_engulfing/);
});

test('hammer after a decline explains the lower wick rejection', () => {
  const result = detectCandlePatterns(hammer, { symbol: 'XAU/USD', timeframe: '4H' });
  const pattern = result.patterns.find(item => item.id === 'hammer');
  assert.ok(pattern);
  assert.equal(pattern.bias, 'bullish');
  assert.ok(pattern.explanation.includes('sumbu bawah'));
  assert.equal(result.signal.action, 'BUY');
});

test('shooting star after a rise produces a SELL signal', () => {
  const result = detectCandlePatterns(shootingStar, { symbol: 'DXY', timeframe: '1H' });
  assert.ok(result.patterns.some(item => item.id === 'shooting_star'));
  assert.equal(result.signal.action, 'SELL');
});

test('doji and short series stay neutral', () => {
  const doji = detectCandlePatterns([
    { open: 100, high: 101, low: 99, close: 101 },
    { open: 101, high: 101.5, low: 100, close: 100 },
    { open: 100, high: 103, low: 99.5, close: 102 },
    { open: 102, high: 104, low: 100, close: 102.02 },
  ], { symbol: 'XAU/USD', timeframe: '1D' });
  assert.ok(doji.patterns.some(item => item.id === 'doji'));
  assert.equal(doji.signal.action, 'NO TRADE');

  const short = detectCandlePatterns([100, 101], { symbol: 'XAU/USD', timeframe: '1D' });
  assert.equal(short.insufficient, true);
  assert.equal(short.signal.action, 'NO TRADE');
});

test('explanation names the pattern, evidence, confirmation, and risk gate', () => {
  const text = explainCandlePatterns(detectCandlePatterns(bullishEngulfing, { symbol: 'XAU/USD', timeframe: '1D' }));
  assert.ok(text.includes('Bullish Engulfing'));
  assert.ok(text.includes('Pengesahan'));
  assert.ok(text.includes('BUY'));
  assert.ok(text.includes('bukan order'));
  assert.ok(text.includes('gate risiko'));
});
