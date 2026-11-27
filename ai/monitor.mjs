import { FOCUS } from '../shared/feed-data.js';

export function normalizeRule(rule) {
  if (!rule || typeof rule !== 'object') return null;
  const symbol = String(rule.symbol || '').trim().toUpperCase();
  const condition = rule.condition === '<=' ? '<=' : '>=';
  const threshold = Number(rule.threshold);
  if (!FOCUS.includes(symbol) || !Number.isFinite(threshold) || threshold <= 0) return null;
  return {
    id: String(rule.id || `${symbol}-${condition}-${threshold}`).slice(0, 80),
    symbol,
    condition,
    threshold,
  };
}

export function evaluateRules(items, rules) {
  const quotes = new Map((Array.isArray(items) ? items : []).map(item => [item.symbol, item]));
  return rules.flatMap(rule => {
    const item = quotes.get(rule.symbol);
    if (!item || !Number.isFinite(item.price)) return [];
    const triggered = rule.condition === '>=' ? item.price >= rule.threshold : item.price <= rule.threshold;
    if (!triggered) return [];
    return [{
      type: 'threshold',
      ruleId: rule.id,
      symbol: rule.symbol,
      condition: rule.condition,
      threshold: rule.threshold,
      price: item.price,
      reason: `${rule.symbol} ${rule.condition} ${rule.threshold} at ${item.price}`,
    }];
  });
}

export function detectAnomalies(items, options = {}) {
  const zScoreLimit = Math.max(1.5, Number(options.zScore) || 2.5);
  const minPoints = Math.max(5, Number(options.minPoints) || 10);
  return (Array.isArray(items) ? items : []).flatMap(item => {
    const series = (Array.isArray(item.series) ? item.series : []).map(Number).filter(Number.isFinite).slice(-30);
    if (series.length < minPoints) return [];
    const mean = series.reduce((sum, value) => sum + value, 0) / series.length;
    const variance = series.reduce((sum, value) => sum + (value - mean) ** 2, 0) / series.length;
    const deviation = Math.sqrt(variance);
    const last = series[series.length - 1];
    const score = deviation > 0 ? (last - mean) / deviation : 0;
    if (Math.abs(score) < zScoreLimit) return [];
    return [{
      type: 'anomaly',
      symbol: item.symbol,
      price: last,
      score: +score.toFixed(2),
      direction: score > 0 ? 'up' : 'down',
      reason: `${item.symbol} price is ${Math.abs(score).toFixed(2)} standard deviations ${score > 0 ? 'above' : 'below'} its 30-point mean`,
    }];
  });
}
