import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const stateFile = process.env.PAPER_STATE_FILE || resolve(root, 'data', 'paper-account.json');

function bounded(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function paperConfig() {
  return {
    startingCapital: bounded(process.env.PAPER_STARTING_CAPITAL, 100, 1, 1000000),
    maxRiskPct: bounded(process.env.PAPER_MAX_RISK_PCT, 1, 0.1, 5),
    maxDailyLossPct: bounded(process.env.PAPER_MAX_DAILY_LOSS_PCT, 3, 0.1, 20),
    maxOpenPositions: Math.round(bounded(process.env.PAPER_MAX_OPEN_POSITIONS, 2, 1, 10)),
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function freshState() {
  const config = paperConfig();
  return {
    date: today(),
    startingCapital: config.startingCapital,
    equity: config.startingCapital,
    dailyPnl: 0,
    realizedPnl: 0,
    openPositions: 0,
    orders: {},
    updatedAt: new Date().toISOString(),
  };
}

function loadState() {
  try {
    if (!existsSync(stateFile)) return freshState();
    const parsed = JSON.parse(readFileSync(stateFile, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || !Number.isFinite(Number(parsed.equity))) return freshState();
    return {
      ...freshState(),
      ...parsed,
      equity: Number(parsed.equity),
      dailyPnl: Number(parsed.dailyPnl) || 0,
      realizedPnl: Number(parsed.realizedPnl) || 0,
      openPositions: Math.max(0, Math.round(Number(parsed.openPositions) || 0)),
      orders: parsed.orders && typeof parsed.orders === 'object' ? parsed.orders : {},
    };
  } catch {
    return freshState();
  }
}

let state = loadState();

function saveState() {
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function rollDay() {
  if (state.date === today()) return;
  state = {
    ...state,
    date: today(),
    dailyPnl: 0,
    openPositions: 0,
    orders: Object.fromEntries(Object.entries(state.orders).map(([id, order]) => [id, { ...order, status: 'expired' }])),
    updatedAt: new Date().toISOString(),
  };
  saveState();
}

export function paperAccountStatus() {
  rollDay();
  const config = paperConfig();
  const dailyLossPct = state.dailyPnl < 0 ? +((-state.dailyPnl / config.startingCapital) * 100).toFixed(3) : 0;
  const blocked = dailyLossPct >= config.maxDailyLossPct || state.openPositions >= config.maxOpenPositions;
  return {
    date: state.date,
    mode: 'paper',
    startingCapital: config.startingCapital,
    equity: +Number(state.equity).toFixed(2),
    dailyPnl: +Number(state.dailyPnl).toFixed(2),
    realizedPnl: +Number(state.realizedPnl).toFixed(2),
    dailyLossPct,
    maxDailyLossPct: config.maxDailyLossPct,
    maxRiskPct: config.maxRiskPct,
    maxOpenPositions: config.maxOpenPositions,
    openPositions: state.openPositions,
    blocked,
    reason: blocked
      ? dailyLossPct >= config.maxDailyLossPct ? 'daily_loss_cap_reached' : 'max_open_positions_reached'
      : null,
    stateFile,
  };
}

export function paperRiskContext() {
  const account = paperAccountStatus();
  return {
    preferences: { paperEquity: account.equity },
    risk: {
      dailyLossPct: account.dailyLossPct,
      openPositions: account.openPositions,
      maxRiskPct: account.maxRiskPct,
      maxDailyLossPct: account.maxDailyLossPct,
    },
  };
}

export function guardPaperOrder() {
  const account = paperAccountStatus();
  if (account.blocked) throw new Error(`Paper account blocked: ${account.reason}.`);
  return account;
}

export function reservePaperOrder(order) {
  guardPaperOrder();
  rollDay();
  const riskPct = Math.min(paperConfig().maxRiskPct, Number(order?.riskPct) || paperConfig().maxRiskPct);
  state.openPositions += 1;
  state.orders[order.id] = {
    id: order.id,
    symbol: order.symbol || null,
    side: order.side || null,
    entry: Number(order.entry) || 0,
    stopLoss: Number(order.stopLoss) || 0,
    takeProfit: Number(order.takeProfit) || 0,
    units: Number(order.units) || 0,
    riskPct,
    riskAmount: +((state.equity * riskPct) / 100).toFixed(2),
    status: 'open',
    reservedAt: new Date().toISOString(),
  };
  state.updatedAt = new Date().toISOString();
  saveState();
  return paperAccountStatus();
}

export function settlePaperOrder(order, evaluation) {
  rollDay();
  const id = order?.id;
  const tracked = id ? state.orders[id] : null;
  if (!tracked || tracked.status === 'settled') return paperAccountStatus();
  const pnl = Number(evaluation?.pnl) || 0;
  state.equity = +(Number(state.equity) + pnl).toFixed(2);
  state.dailyPnl = +(Number(state.dailyPnl) + pnl).toFixed(2);
  state.realizedPnl = +(Number(state.realizedPnl) + pnl).toFixed(2);
  state.openPositions = Math.max(0, state.openPositions - 1);
  state.orders[id] = {
    ...tracked,
    status: 'settled',
    pnl,
    outcome: evaluation?.outcome || null,
    settledAt: new Date().toISOString(),
  };
  state.updatedAt = new Date().toISOString();
  saveState();
  return paperAccountStatus();
}
