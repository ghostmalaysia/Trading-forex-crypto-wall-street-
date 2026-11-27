const focusSymbols = ['XAU/USD', 'DXY'];

function inFocus(context) {
  const symbol = String(context?.selected || context?.chart?.symbol || '').toUpperCase();
  return focusSymbols.includes(symbol);
}

function round(value) {
  if (!Number.isFinite(value)) return null;
  return +value.toFixed(value > 1000 ? 2 : value > 10 ? 2 : 5);
}

function outOfFocusPlan(context) {
  return {
    bias: 'neutral', entry: null, stopLoss: null, takeProfit: null, riskPct: 0, units: 0,
    rationale: `AI focus is limited to XAU/USD and DXY. ${context?.selected || 'The selected symbol'} is outside scope.`,
    conditions: ['Select XAU/USD or DXY for an analysis'], confidence: 'low', paperOnly: true, source: 'focus',
  };
}

function rsi(values, period = 14) {
  if (values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  return +(100 - 100 / (1 + gains / losses)).toFixed(2);
}

export function analyzeChart(context) {
  const chart = context?.chart || {};
  const series = (Array.isArray(chart.series) ? chart.series : [])
    .map(Number)
    .filter(Number.isFinite)
    .slice(-120);
  const base = {
    symbol: chart.symbol || context?.selected || '',
    timeframe: chart.timeframe || context?.timeframe || '',
    points: series.length,
    dataSource: context?.dataSource || 'mock',
  };
  if (series.length < 15) return { ...base, insufficient: true };
  const last = series[series.length - 1];
  const previous = series[series.length - 2];
  const avg = (slice) => slice.reduce((sum, value) => sum + value, 0) / slice.length;
  const sma20 = avg(series.slice(-20));
  const sma50 = avg(series.slice(-Math.min(50, series.length)));
  const recent = series.slice(-20);
  const diffs = series.slice(-14).map((value, index, arr) => index ? Math.abs(value - arr[index - 1]) : 0).slice(1);
  const atr = avg(diffs);
  const older = series[Math.max(0, series.length - 10)];
  const slopePct = older ? +(((last / older) - 1) * 100).toFixed(3) : 0;
  const shortHistory = series.length < 50;
  const trend = last > sma20 && (shortHistory ? slopePct > 0 : sma20 > sma50)
    ? 'bullish'
    : last < sma20 && (shortHistory ? slopePct < 0 : sma20 < sma50)
      ? 'bearish'
      : 'mixed';
  return {
    ...base,
    insufficient: false,
    last: round(last),
    previous: round(previous),
    changePct: +(((last / previous) - 1) * 100).toFixed(3),
    sma20: round(sma20),
    sma50: round(sma50),
    rsi14: rsi(series),
    atr: round(atr),
    recentHigh: round(Math.max(...recent)),
    recentLow: round(Math.min(...recent)),
    slopePct,
    volatilityPct: last ? +((atr / last) * 100).toFixed(3) : 0,
    trend,
  };
}

export function buildPlan(analysis, context) {
  if (!inFocus(context)) return outOfFocusPlan(context);
  if (!analysis || analysis.insufficient || !Number.isFinite(analysis.last)) {
    return {
      bias: 'neutral', entry: null, stopLoss: null, takeProfit: null, riskPct: 0, units: 0,
      rationale: 'Not enough chart history to form a proposal. Collect at least 15 price points.',
      conditions: ['Wait for sufficient chart data'], confidence: 'low', paperOnly: true, source: 'deterministic',
    };
  }
  const text = `${context?.selected || ''} ${context?.market || ''}`.toLowerCase();
  const isCrypto = /crypto|btc|eth|sol/.test(text);
  const isGold = /gold|xau/.test(text);
  const stopFloor = isCrypto ? 1.5 : isGold ? 0.6 : 0.25;
  const stopCap = isCrypto ? 4 : isGold ? 2 : 1.2;
  const stopPct = Math.min(stopCap, Math.max(stopFloor, analysis.volatilityPct || stopFloor));
  const direction = analysis.trend === 'bullish' ? 1 : analysis.trend === 'bearish' ? -1 : 0;
  const entry = analysis.last;
  if (!direction) {
    return {
      bias: 'neutral', entry, stopLoss: null, takeProfit: null, riskPct: 0, units: 0,
      rationale: `Chart is mixed: last ${entry} vs SMA20 ${analysis.sma20} and SMA50 ${analysis.sma50}; RSI14 ${analysis.rsi14 ?? 'n/a'}. No directional edge yet.`,
      conditions: ['Wait for a clear trend or range break'], confidence: 'low', paperOnly: true, source: 'deterministic',
    };
  }
  const stopLoss = round(entry * (1 - direction * stopPct / 100));
  const takeProfit = round(entry * (1 + direction * stopPct * 2 / 100));
  const riskPct = 1;
  const equity = Number(context?.preferences?.paperEquity) || 100;
  const stopDistance = Math.abs(entry - stopLoss);
  const units = stopDistance > 0 ? round(equity * riskPct / 100 / stopDistance) : 0;
  return {
    bias: analysis.trend,
    entry,
    stopLoss,
    takeProfit,
    riskPct,
    units,
    rationale: `${analysis.trend === 'bullish' ? 'Price holds above rising averages' : 'Price sits below falling averages'}: last ${entry}, SMA20 ${analysis.sma20}, SMA50 ${analysis.sma50}, RSI14 ${analysis.rsi14 ?? 'n/a'}, ATR ${analysis.atr}. Stop uses ${stopPct.toFixed(2)}% chart volatility.`,
    conditions: [
      'Confirm the structure on the selected timeframe',
      'Avoid entry during high-impact news',
      analysis.dataSource === 'longbridge' ? 'Live quotes active' : 'Simulated data: paper review only',
    ],
    confidence: analysis.rsi14 != null && analysis.rsi14 > 30 && analysis.rsi14 < 70 ? 'medium' : 'low',
    paperOnly: true,
    source: 'deterministic',
  };
}

export function normalizePlan(raw, analysis, context) {
  if (!inFocus(context)) return outOfFocusPlan(context);
  const fallback = buildPlan(analysis, context);
  if (!raw || typeof raw !== 'object') return fallback;
  const bias = ['bullish', 'bearish', 'neutral'].includes(raw.bias) ? raw.bias : fallback.bias;
  if (bias === 'neutral') return fallback;
  const entry = Number(raw.entry);
  const stopLoss = Number(raw.stopLoss);
  const takeProfit = Number(raw.takeProfit);
  const direction = bias === 'bullish' ? 1 : -1;
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(stopLoss) || !Number.isFinite(takeProfit)) return fallback;
  if ((stopLoss - entry) * direction >= 0 || (takeProfit - entry) * direction <= 0) return fallback;
  const riskPct = Math.min(1, Math.max(0, Number(raw.riskPct) || 0));
  const equity = Number(context?.preferences?.paperEquity) || 100;
  const stopDistance = Math.abs(entry - stopLoss);
  const units = stopDistance > 0 ? round(equity * riskPct / 100 / stopDistance) : 0;
  const conditions = Array.isArray(raw.conditions)
    ? raw.conditions.slice(0, 5).map(value => String(value).slice(0, 160))
    : fallback.conditions;
  return {
    bias,
    entry: round(entry),
    stopLoss: round(stopLoss),
    takeProfit: round(takeProfit),
    riskPct,
    units,
    rationale: String(raw.rationale || fallback.rationale).slice(0, 700),
    conditions,
    confidence: ['low', 'medium', 'high'].includes(raw.confidence) ? raw.confidence : 'medium',
    paperOnly: true,
    source: 'model',
  };
}

export function riskGate(plan, analysis, context) {
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass: !!pass, detail });
  const entry = Number(plan?.entry);
  const stop = Number(plan?.stopLoss);
  const target = Number(plan?.takeProfit);
  const rr = Number.isFinite(entry) && Number.isFinite(stop) && Number.isFinite(target) && entry !== stop
    ? +((Math.abs(target - entry) / Math.abs(entry - stop))).toFixed(2)
    : 0;
  add('risk_cap', (Number(plan?.riskPct) || 0) <= 1, `riskPct=${plan?.riskPct ?? 0} (max 1)`);
  add('reward_risk', rr >= 1.5, `R:R=${rr}`);
  add('daily_loss', (Number(context?.risk?.dailyLossPct) || 0) < 3, 'daily loss cap 3%');
  add('exposure', (Number(context?.risk?.openPositions) || 0) < 2, 'max 2 open positions');
  add('fresh_data', !analysis?.insufficient, `chart points=${analysis?.points ?? 0}`);
  add('human_approval', true, 'approval required before any simulated execution');
  const eligible = plan?.bias !== 'neutral' && checks.every(item => item.pass);
  return {
    eligible,
    decision: eligible ? 'pending_human_approval' : 'blocked',
    rewardRisk: rr,
    checks,
    paperOnly: true,
  };
}
