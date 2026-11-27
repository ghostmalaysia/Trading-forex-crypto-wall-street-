function round(value, digits = 2) {
  return Number.isFinite(value) ? +value.toFixed(digits) : null;
}

function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((sum, value) => sum + value, 0) / period;
}

export function backtestSmaCross(series, options = {}) {
  const values = (Array.isArray(series) ? series : [])
    .map(Number)
    .filter(value => Number.isFinite(value) && value > 0)
    .slice(-300);
  const fast = Math.min(60, Math.max(2, Number(options.fast) || 20));
  const slow = Math.min(150, Math.max(fast + 1, Number(options.slow) || 50));
  const feePct = Math.max(0, Math.min(1, Number(options.feePct) || 0));
  if (values.length < slow + 2) {
    return {
      strategy: 'sma_cross',
      insufficient: true,
      points: values.length,
      required: slow + 2,
      educational: true,
    };
  }

  let position = false;
  let entry = 0;
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  const trades = [];
  let previousFast = sma(values.slice(0, slow - 1), fast);
  let previousSlow = sma(values.slice(0, slow - 1), slow);

  function close(exit, exitedAt) {
    const gross = (exit / entry - 1) * 100;
    const net = gross - feePct * 2;
    equity *= 1 + net / 100;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, (peak - equity) / peak * 100);
    trades.push({
      entry: round(entry, 5),
      exit: round(exit, 5),
      grossPct: round(gross),
      netPct: round(net),
      exitedAt,
    });
    position = false;
    entry = 0;
  }

  for (let index = slow - 1; index < values.length; index++) {
    const window = values.slice(0, index + 1);
    const fastNow = sma(window, fast);
    const slowNow = sma(window, slow);
    if (!position && previousFast != null && previousSlow != null && previousFast <= previousSlow && fastNow > slowNow) {
      position = true;
      entry = values[index];
    } else if (position && previousFast != null && previousSlow != null && previousFast >= previousSlow && fastNow < slowNow) {
      close(values[index], index);
    }
    previousFast = fastNow;
    previousSlow = slowNow;
  }
  if (position) close(values[values.length - 1], values.length - 1);

  const wins = trades.filter(trade => trade.netPct > 0).length;
  return {
    strategy: 'sma_cross',
    insufficient: false,
    fast,
    slow,
    feePct,
    points: values.length,
    tradeCount: trades.length,
    winRate: trades.length ? round(wins / trades.length * 100) : 0,
    totalReturnPct: round((equity - 1) * 100),
    maxDrawdownPct: round(maxDrawdown),
    trades: trades.slice(-20),
    educational: true,
    disclaimer: 'Historical simulation only. No real order is placed and past performance is not predictive.',
  };
}
