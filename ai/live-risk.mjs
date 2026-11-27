import { FOCUS } from '../shared/feed-data.js';

function number(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

export function livePolicy(env = process.env) {
  const text = value => String(value || '').trim();
  const adapter = text(env.LIVE_ADAPTER || 'disabled').toLowerCase();
  return {
    liveTradingEnabled: text(env.ENABLE_LIVE_TRADING) === 'true',
    approvalSecretConfigured: !!text(env.LIVE_APPROVAL_SECRET),
    adminTokenConfigured: !!text(env.LIVE_ADMIN_TOKEN),
    adapter: /^[a-z0-9_-]{1,40}$/.test(adapter) ? adapter : 'invalid',
    maxRiskPct: Math.min(1, Math.max(0.1, number(env.LIVE_MAX_RISK_PCT, 1))),
    minRewardRisk: Math.max(1, number(env.LIVE_MIN_REWARD_RISK, 1.5)),
    maxDailyLossPct: Math.max(0.5, number(env.LIVE_MAX_DAILY_LOSS_PCT, 3)),
    maxOpenPositions: Math.max(1, number(env.LIVE_MAX_OPEN_POSITIONS, 2)),
    maxStaleSeconds: Math.max(10, number(env.LIVE_MAX_STALE_SECONDS, 120)),
    maxSpreadPct: Math.max(0, number(env.LIVE_MAX_SPREAD_PCT, 0.1)),
    maxNotional: Math.max(100, number(env.LIVE_MAX_NOTIONAL, 50000)),
    minEquity: Math.max(100, number(env.LIVE_MIN_EQUITY, 100)),
    approvalTtlSeconds: Math.max(30, Math.min(600, number(env.LIVE_APPROVAL_TTL_SECONDS, 120))),
    circuitFailures: Math.max(1, number(env.LIVE_CIRCUIT_FAILURES, 3)),
    circuitCooldownSeconds: Math.max(30, number(env.LIVE_CIRCUIT_COOLDOWN_SECONDS, 300)),
    reconcileIntervalSeconds: Math.max(60, number(env.LIVE_RECONCILE_INTERVAL_SECONDS, 300)),
  };
}

export function evaluateLiveRisk(input = {}) {
  const plan = input.plan && typeof input.plan === 'object' ? input.plan : {};
  const risk = input.risk && typeof input.risk === 'object' ? input.risk : {};
  const context = input.context && typeof input.context === 'object' ? input.context : {};
  const account = input.account && typeof input.account === 'object' ? input.account : {};
  const config = input.config && typeof input.config === 'object' ? input.config : {};
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass: !!pass, detail });

  const liveEnabled = config.liveTradingEnabled === true;
  const killSwitch = config.killSwitch !== false;
  const credentialsConfigured = config.credentialsConfigured === true;
  const circuitTripped = config.circuitTripped === true;
  add('live_opt_in', liveEnabled, 'ENABLE_LIVE_TRADING must be true on the server');
  add('kill_switch', !killSwitch, 'kill switch must be disarmed');
  add('credentials', credentialsConfigured, 'server-side MetaApi credentials must be configured');
  add('circuit_breaker', !circuitTripped, 'circuit breaker must be closed');
  add('source_plan_gate', risk.decision === 'pending_human_approval' && risk.eligible === true, 'plan must pass the paper risk gate');

  const symbol = String(context.selected || plan.symbol || '').trim().toUpperCase();
  add('focus_symbol', FOCUS.includes(symbol), `symbol=${symbol || 'none'} (XAU/USD or DXY only)`);

  const entry = number(plan.entry);
  const stopLoss = number(plan.stopLoss);
  const takeProfit = number(plan.takeProfit);
  const side = takeProfit > entry ? 'buy' : 'sell';
  const aligned = entry > 0 && stopLoss > 0 && takeProfit > 0
    && (side === 'buy' ? stopLoss < entry && takeProfit > entry : stopLoss > entry && takeProfit < entry);
  add('levels', aligned, `entry=${entry} stop=${stopLoss} target=${takeProfit}`);

  const rewardRisk = aligned ? +((Math.abs(takeProfit - entry) / Math.abs(entry - stopLoss))).toFixed(2) : 0;
  const planRiskPct = number(plan.riskPct);
  const maxRiskPct = number(config.maxRiskPct, 1);
  add('risk_cap', planRiskPct > 0 && planRiskPct <= maxRiskPct, `riskPct=${planRiskPct} (max ${maxRiskPct})`);
  add('reward_risk', rewardRisk >= number(config.minRewardRisk, 1.5), `R:R=${rewardRisk}`);

  const equity = number(account.equity);
  const maxNotional = number(config.maxNotional, 50000);
  const stopDistance = aligned ? Math.abs(entry - stopLoss) : 0;
  const riskBudget = equity * Math.min(planRiskPct || maxRiskPct, maxRiskPct) / 100;
  const sizedUnits = stopDistance > 0 ? riskBudget / stopDistance : 0;
  const cappedUnits = entry > 0 ? Math.min(sizedUnits, maxNotional / entry) : 0;
  const units = +Math.max(0, cappedUnits).toFixed(2);
  const notional = +(units * entry).toFixed(2);
  add('equity', equity >= number(config.minEquity, 100), `equity=${equity}`);
  add('position_size', units > 0 && notional <= maxNotional, `units=${units} notional=${notional}`);

  const dailyLossPct = number(account.dailyLossPct);
  const openPositions = number(account.openPositions);
  add('daily_loss', dailyLossPct < number(config.maxDailyLossPct, 3), `dailyLossPct=${dailyLossPct}`);
  add('exposure', openPositions < number(config.maxOpenPositions, 2), `openPositions=${openPositions}`);

  const quotedAt = context.quotedAt ?? context.asOf ?? context.fetchedAt;
  const quoteMs = typeof quotedAt === 'number' ? quotedAt : Date.parse(String(quotedAt || ''));
  const ageSeconds = Number.isFinite(quoteMs) ? Math.max(0, (Date.now() - quoteMs) / 1000) : Infinity;
  add('fresh_quote', ageSeconds <= number(config.maxStaleSeconds, 120), `quoteAge=${Number.isFinite(ageSeconds) ? ageSeconds.toFixed(1) : 'unknown'}s`);

  const spreadPct = context.spreadPct == null ? 0 : number(context.spreadPct);
  add('spread', spreadPct >= 0 && spreadPct <= number(config.maxSpreadPct, 0.1), `spreadPct=${spreadPct}`);

  const eligible = checks.every(item => item.pass);
  return {
    eligible,
    decision: eligible ? 'pending_live_approval' : 'blocked',
    symbol,
    side,
    rewardRisk,
    units,
    notional,
    quoteAgeSeconds: Number.isFinite(ageSeconds) ? +ageSeconds.toFixed(1) : null,
    checks,
    liveOnly: true,
  };
}
