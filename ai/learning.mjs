import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const stateFile = process.env.PAPER_LEARNING_FILE || resolve(root, 'data', 'paper-learning.json');
const symbols = ['XAU/USD', 'DXY'];

function emptyEntry(symbol) {
  return {
    symbol,
    samples: 0,
    wins: 0,
    losses: 0,
    flat: 0,
    totalPnl: 0,
    avgPnl: 0,
    byBias: {
      bullish: { samples: 0, wins: 0, pnl: 0 },
      bearish: { samples: 0, wins: 0, pnl: 0 },
    },
    lessons: [],
  };
}

function freshState() {
  return {
    updatedAt: null,
    entries: Object.fromEntries(symbols.map(symbol => [symbol, emptyEntry(symbol)])),
  };
}

function loadState() {
  try {
    if (!existsSync(stateFile)) return freshState();
    const parsed = JSON.parse(readFileSync(stateFile, 'utf8'));
    const base = freshState();
    if (!parsed || typeof parsed !== 'object') return base;
    for (const symbol of symbols) {
      const entry = parsed.entries?.[symbol];
      if (!entry || typeof entry !== 'object') continue;
      base.entries[symbol] = {
        ...emptyEntry(symbol),
        ...entry,
        samples: Math.max(0, Math.round(Number(entry.samples) || 0)),
        wins: Math.max(0, Math.round(Number(entry.wins) || 0)),
        losses: Math.max(0, Math.round(Number(entry.losses) || 0)),
        flat: Math.max(0, Math.round(Number(entry.flat) || 0)),
        totalPnl: Number(entry.totalPnl) || 0,
        byBias: { ...emptyEntry(symbol).byBias, ...(entry.byBias || {}) },
        lessons: Array.isArray(entry.lessons) ? entry.lessons.slice(0, 5).map(String) : [],
      };
      base.entries[symbol].avgPnl = base.entries[symbol].samples
        ? +(base.entries[symbol].totalPnl / base.entries[symbol].samples).toFixed(2) : 0;
    }
    base.updatedAt = parsed.updatedAt || null;
    return base;
  } catch {
    return freshState();
  }
}

let state = loadState();

function saveState() {
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function money(value) {
  return `${value >= 0 ? '+' : '-'}$${Math.abs(value).toFixed(2)}`;
}

function domainLesson(symbol) {
  return symbol === 'XAU/USD'
    ? 'Gold lesson: check DXY direction and US real yields first; a USD rally often caps XAU/USD even when the local chart looks bullish.'
    : 'USD lesson: rate differentials, Fed/FOMC expectations and CPI/NFP/PCE dominate DXY; avoid chasing a move immediately after a high-impact release.';
}

function buildLessons(entry) {
  const lessons = [];
  if (!entry.samples) return lessons;
  const winRate = +((entry.wins / entry.samples) * 100).toFixed(1);
  lessons.push(`${entry.symbol}: ${entry.samples} evaluated paper samples, win rate ${winRate}%, average PnL ${money(entry.avgPnl)}.`);
  if (entry.samples >= 3 && entry.losses > entry.wins) {
    lessons.push(`${entry.symbol}: stop-outs exceed wins in paper review. Require R:R >= 1.5 and avoid entries after an extended RSI move without confirmation.`);
  } else if (entry.samples >= 3 && entry.wins > entry.losses) {
    lessons.push(`${entry.symbol}: current paper filter is working. Keep the stop discipline and continue logging every outcome.`);
  }
  const biases = Object.entries(entry.byBias).filter(([, value]) => value.samples > 0);
  if (biases.length > 1) {
    const weakest = biases.sort((a, b) => a[1].pnl - b[1].pnl)[0];
    if (weakest && weakest[1].pnl < 0) {
      lessons.push(`${entry.symbol}: ${weakest[0]} setups average ${money(weakest[1].pnl / weakest[1].samples)} in paper; review this bias before repeating it.`);
    }
  }
  lessons.push(domainLesson(entry.symbol));
  return lessons.slice(0, 5);
}

export function learningStatus() {
  const snapshot = JSON.parse(JSON.stringify(state));
  const gold = snapshot.entries['XAU/USD'];
  const dxy = snapshot.entries.DXY;
  if (gold.samples >= 3 && dxy.samples >= 3) {
    snapshot.crossAsset = `Cross-asset paper note: XAU/USD averages ${money(gold.avgPnl)} vs DXY ${money(dxy.avgPnl)}. Treat gold longs with extra caution when DXY samples favour USD strength.`;
  } else {
    snapshot.crossAsset = 'Cross-asset note: collect at least 3 evaluated paper outcomes for both XAU/USD and DXY before comparing them.';
  }
  return snapshot;
}

export function learningDigest(limit = 6) {
  const status = learningStatus();
  const items = [];
  for (const symbol of symbols) items.push(...status.entries[symbol].lessons);
  items.push(status.crossAsset);
  return items.slice(0, Math.max(1, Math.min(limit, 10)));
}

export function recordPaperOutcome(order, evaluation, plan = {}) {
  const symbol = String(order?.symbol || plan?.symbol || '').toUpperCase();
  if (!symbols.includes(symbol) || !evaluation || typeof evaluation !== 'object') return learningStatus();
  const entry = state.entries[symbol] || emptyEntry(symbol);
  const pnl = Number(evaluation.pnl) || 0;
  const won = evaluation.outcome === 'take_profit' || pnl > 0;
  const lost = evaluation.outcome === 'stop_loss' || pnl < 0;
  const bias = plan.bias === 'bullish' || plan.bias === 'bearish'
    ? plan.bias
    : order.side === 'sell' ? 'bearish' : 'bullish';

  entry.samples += 1;
  entry.wins += won ? 1 : 0;
  entry.losses += lost ? 1 : 0;
  entry.flat += !won && !lost ? 1 : 0;
  entry.totalPnl = +(entry.totalPnl + pnl).toFixed(2);
  entry.avgPnl = +(entry.totalPnl / entry.samples).toFixed(2);
  entry.byBias[bias].samples += 1;
  entry.byBias[bias].wins += won ? 1 : 0;
  entry.byBias[bias].pnl = +(entry.byBias[bias].pnl + pnl).toFixed(2);
  entry.lessons = buildLessons(entry);

  state.entries[symbol] = entry;
  state.updatedAt = new Date().toISOString();
  saveState();
  return learningStatus();
}
