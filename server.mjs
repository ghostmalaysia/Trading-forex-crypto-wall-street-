import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platformKnowledge, systemPrompt, planSystemPrompt } from './ai/prompt.mjs';
import { complete, providerName, modelName } from './ai/provider.mjs';
import { analyzeChart, normalizePlan, riskGate } from './ai/plan.mjs';
import { CALENDAR, FOCUS, NEWS } from './shared/feed-data.js';
import { detectAnomalies, evaluateRules, normalizeRule } from './ai/monitor.mjs';
import { backtestSmaCross } from './ai/backtest.mjs';
import { evaluatePaperOrder, simulateFill } from './ai/execution.mjs';
import { brokerStatus, brokers } from './ai/broker.mjs';
import { auditHash, GENESIS_HASH, stripChainFields, verifyAuditChain } from './ai/audit-chain.mjs';
import { evaluateLiveRisk, livePolicy } from './ai/live-risk.mjs';
import { tokenVaultStatus } from './ai/token-vault.mjs';
import { createApproval, safeEqual, verifyApproval } from './ai/live-approval.mjs';
import { LiveCircuitBreaker } from './ai/circuit-breaker.mjs';
import { loadLiveAdapter, placeLiveOrder, reconcileLiveOrders } from './ai/live-broker.mjs';
import { summarizeReconciliation } from './ai/reconciliation.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const webRoot = resolve(root, 'web');
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '127.0.0.1';
const pending = new Map();
const aiHits = new Map();
const marketTargets = {
  'XAU/USD': { providerSymbol: 'GC=F', label: 'Gold futures proxy' },
  DXY: { providerSymbol: 'DX-Y.NYB', label: 'US Dollar Index' },
};
const marketCache = { payload: null, fetchedAt: 0 };
const monitorState = { rules: [], events: [], lastRunAt: null, running: false };
const auditFile = process.env.AUDIT_LOG_FILE || resolve(root, 'data', 'audit.jsonl');
const livePolicyConfig = livePolicy();
const liveState = {
  killSwitch: process.env.LIVE_KILL_SWITCH !== 'false',
  circuit: new LiveCircuitBreaker({
    maxFailures: livePolicyConfig.circuitFailures,
    cooldownMs: livePolicyConfig.circuitCooldownSeconds * 1000,
  }),
  proposals: new Map(),
  approvals: new Map(),
  liveOrders: [],
  lastReconciliationAt: null,
  lastReconciliation: null,
};
let auditChain = null;
let auditQueue = Promise.resolve();

try {
  const seededRules = JSON.parse(process.env.MONITOR_RULES || '[]');
  if (Array.isArray(seededRules)) monitorState.rules = seededRules.map(normalizeRule).filter(Boolean).slice(0, 20);
} catch {}
let rpcId = 0;
let rpcProcess;
let rpcBuffer = '';
let rpcReady = false;
let rpcError = 'Longbridge CLI is not installed or has not been started';

function startLongbridge() {
  const executable = process.env.LONGBRIDGE_BIN || 'longbridge';
  rpcProcess = spawn(executable, ['serve'], { stdio: ['pipe', 'pipe', 'pipe'] });
  rpcProcess.stdout.setEncoding('utf8');
  rpcProcess.stdout.on('data', chunk => {
    rpcBuffer += chunk;
    let newline;
    while ((newline = rpcBuffer.indexOf('\n')) !== -1) {
      const line = rpcBuffer.slice(0, newline).trim();
      rpcBuffer = rpcBuffer.slice(newline + 1);
      if (!line) continue;
      try {
        const message = JSON.parse(line);
        if (message.id != null && pending.has(message.id)) {
          const entry = pending.get(message.id);
          pending.delete(message.id);
          clearTimeout(entry.timer);
          if (message.error) entry.reject(new Error(message.error.message || 'Longbridge request failed'));
          else entry.resolve(message.result);
        }
      } catch {
        rpcError = 'Could not parse a response from Longbridge';
      }
    }
  });
  rpcProcess.stderr.setEncoding('utf8');
  rpcProcess.stderr.on('data', data => { rpcError = data.trim().slice(-500) || rpcError; });
  rpcProcess.on('error', error => {
    rpcReady = false;
    rpcError = `Unable to start Longbridge: ${error.message}`;
  });
  rpcProcess.stdin.on('error', error => {
    rpcReady = false;
    rpcError = `Longbridge bridge unavailable: ${error.message}`;
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error(rpcError));
    }
    pending.clear();
  });
  rpcProcess.on('exit', code => {
    rpcReady = false;
    rpcError = `Longbridge process exited${code == null ? '' : ` (${code})`}`;
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error(rpcError));
    }
    pending.clear();
  });
}

function rpc(method, params = {}) {
  if (!rpcProcess?.stdin?.writable || rpcProcess.exitCode !== null) return Promise.reject(new Error(rpcError || 'Longbridge unavailable'));
  const id = ++rpcId;
  return new Promise((resolveRpc, rejectRpc) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      rejectRpc(new Error('Longbridge quote request timed out'));
    }, 10000);
    pending.set(id, { resolve: resolveRpc, reject: rejectRpc, timer });
    rpcProcess.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`, error => {
      if (error && pending.has(id)) {
        clearTimeout(timer);
        pending.delete(id);
        rejectRpc(error);
      }
    });
  });
}

async function auditChainState() {
  if (auditChain) return auditChain;
  try {
    const rows = String(await readFile(auditFile, 'utf8')).split('\n').filter(Boolean);
    const last = rows.length ? JSON.parse(rows[rows.length - 1]) : null;
    auditChain = {
      sequence: Number(last?.seq) || 0,
      hash: String(last?.hash || GENESIS_HASH),
    };
  } catch {
    auditChain = { sequence: 0, hash: GENESIS_HASH };
  }
  return auditChain;
}

function writeAudit(event, detail) {
  const task = auditQueue.then(async () => {
    try {
      const chain = await auditChainState();
      const seq = chain.sequence + 1;
      const entry = { ...stripChainFields(detail), timestamp: new Date().toISOString(), event };
      const hash = auditHash(chain.hash, seq, entry);
      await mkdir(dirname(auditFile), { recursive: true });
      await appendFile(auditFile, `${JSON.stringify({ ...entry, seq, prev: chain.hash, hash })}\n`);
      chain.sequence = seq;
      chain.hash = hash;
    } catch {}
  });
  auditQueue = task.catch(() => {});
  return task;
}

async function appendAudit(event, detail = {}) {
  await writeAudit(event, detail);
}

function clientHash(req) {
  const value = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'local';
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

function parseQuote(quote) {
  const price = Number(quote.last_done);
  const previousClose = Number(quote.prev_close);
  if (!quote.symbol || !Number.isFinite(price) || price <= 0) return null;
  return {
    symbol: quote.symbol,
    price,
    previousClose: Number.isFinite(previousClose) && previousClose > 0 ? previousClose : null,
    timestamp: quote.timestamp ?? null,
  };
}

async function readBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 32768) { rejectBody(new Error('Request body too large')); req.destroy(); }
      else chunks.push(chunk);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', rejectBody);
  });
}

async function readJsonBody(req) {
  let payload;
  try { payload = JSON.parse(await readBody(req)); }
  catch (error) {
    throw new Error(error.message === 'Request body too large' ? error.message : 'Invalid JSON body');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Expected a JSON object');
  return payload;
}

async function fetchMarketTarget(symbol, target) {
  const base = process.env.MARKET_DATA_BASE_URL || 'https://query1.finance.yahoo.com';
  const interval = process.env.MARKET_DATA_INTERVAL || '1d';
  const range = process.env.MARKET_DATA_RANGE || '1mo';
  const endpoint = `${base.replace(/\/$/, '')}/v8/finance/chart/${encodeURIComponent(target.providerSymbol)}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`;
  const response = await fetch(endpoint, {
    headers: { 'User-Agent': 'TradeWall/1.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Market feed HTTP ${response.status}`);
  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  if (payload?.chart?.error || !result) throw new Error(payload?.chart?.error?.description || 'Market feed returned no result');
  const meta = result.meta || {};
  const closes = (result.indicators?.quote?.[0]?.close || []).map(Number).filter(value => Number.isFinite(value) && value > 0);
  const price = Number(meta.regularMarketPrice ?? closes[closes.length - 1]);
  const previousClose = Number(meta.chartPreviousClose ?? meta.previousClose ?? closes[closes.length - 2]);
  if (!Number.isFinite(price) || price <= 0) throw new Error('Market feed returned no usable price');
  return {
    symbol,
    providerSymbol: target.providerSymbol,
    label: target.label,
    price: +price.toFixed(price > 100 ? 2 : 5),
    previousClose: Number.isFinite(previousClose) && previousClose > 0 ? +previousClose.toFixed(previousClose > 100 ? 2 : 5) : null,
    series: closes.slice(-60),
    currency: meta.currency || null,
    exchange: meta.exchangeName || null,
  };
}

async function marketSnapshot() {
  const now = Date.now();
  const ttl = Math.max(15, Number(process.env.MARKET_DATA_TTL_SECONDS) || 60) * 1000;
  if (marketCache.payload && now - marketCache.fetchedAt < ttl) return marketCache.payload;
  const entries = await Promise.all(Object.entries(marketTargets).map(async ([symbol, target]) => {
    try { return await fetchMarketTarget(symbol, target); }
    catch (error) { return { symbol, error: error.message }; }
  }));
  const items = entries.filter(item => !item.error);
  const payload = {
    provider: items.length === Object.keys(marketTargets).length ? 'live' : items.length ? 'partial' : 'mock',
    fetchedAt: new Date(now).toISOString(),
    items,
    errors: entries.filter(item => item.error),
    note: 'XAU/USD uses GC=F futures as a proxy; DXY uses DX-Y.NYB. Prices are indicative only.',
  };
  marketCache.payload = payload;
  marketCache.fetchedAt = now;
  return payload;
}

function monitorSnapshot() {
  return {
    enabled: true,
    intervalSeconds: Math.max(30, Number(process.env.MONITOR_INTERVAL_SECONDS) || 60),
    lastRunAt: monitorState.lastRunAt,
    rules: monitorState.rules,
    events: monitorState.events.slice(0, 50),
    paperOnly: true,
  };
}

async function runMonitorCycle() {
  if (monitorState.running) return monitorSnapshot();
  monitorState.running = true;
  try {
    const snapshot = await marketSnapshot();
    const thresholdEvents = evaluateRules(snapshot.items, monitorState.rules);
    const anomalies = detectAnomalies(snapshot.items, { zScore: Number(process.env.MONITOR_ZSCORE) || 2.5 });
    const events = [...thresholdEvents, ...anomalies].map(event => ({ ...event, at: new Date().toISOString() }));
    monitorState.events = [...events, ...monitorState.events].slice(0, 100);
    monitorState.lastRunAt = new Date().toISOString();
    if (events.length) {
      await appendAudit('monitor_event', { count: events.length, symbols: [...new Set(events.map(event => event.symbol))] });
    }
    return monitorSnapshot();
  } finally {
    monitorState.running = false;
  }
}

function sanitizeContext(value) {
  if (!value || typeof value !== 'object') return {};
  const text = (item, length = 160) => typeof item === 'string' ? item.slice(0, length) : '';
  const number = item => Number.isFinite(Number(item)) ? Number(item) : null;
  const series = Array.isArray(value.chart?.series) ? value.chart.series.map(Number).filter(Number.isFinite).slice(-120) : [];
  return {
    selected: text(value.selected, 32),
    market: text(value.market, 32),
    price: number(value.price),
    change: number(value.change),
    timeframe: text(value.timeframe, 8),
    dataSource: text(value.dataSource, 24),
    focus: Array.isArray(value.focus) ? value.focus.slice(0, 5).map(item => text(item, 32)) : [],
    chart: { symbol: text(value.chart?.symbol, 32), timeframe: text(value.chart?.timeframe, 8), series },
    watchlist: Array.isArray(value.watchlist) ? value.watchlist.slice(0, 20).map(item => ({ symbol: text(item?.symbol, 32), market: text(item?.market, 32), price: number(item?.price), change: number(item?.change) })) : [],
    news: Array.isArray(value.news) ? value.news.slice(0, 10).map(item => text(item, 300)) : [],
    lessons: Array.isArray(value.lessons) ? value.lessons.slice(0, 10).map(item => text(item, 400)) : [],
    history: Array.isArray(value.history) ? value.history.slice(-8).filter(item => item && ['user', 'assistant', 'ai'].includes(item.role)).map(item => ({ role: item.role === 'ai' ? 'assistant' : item.role, content: text(item.content, 1200) })) : [],
    preferences: value.preferences && typeof value.preferences === 'object' ? value.preferences : {},
    risk: value.risk && typeof value.risk === 'object' ? value.risk : {},
    quotedAt: value.quotedAt == null ? null : String(value.quotedAt).slice(0, 40),
    spreadPct: number(value.spreadPct),
  };
}

function parseJsonPlan(text) {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

function liveRiskConfig() {
  return {
    ...livePolicyConfig,
    killSwitch: liveState.killSwitch,
    credentialsConfigured: tokenVaultStatus().configured,
    circuitTripped: liveState.circuit.snapshot().tripped,
  };
}

function liveAccount(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    equity: Number(source.equity),
    dailyLossPct: Number(source.dailyLossPct) || 0,
    openPositions: Number(source.openPositions) || 0,
  };
}

function liveContext(value) {
  const context = sanitizeContext(value);
  context.quotedAt = context.quotedAt || (marketCache.fetchedAt ? new Date(marketCache.fetchedAt).toISOString() : new Date().toISOString());
  if (context.spreadPct == null) context.spreadPct = marketCache.payload?.provider === 'live' ? 0.05 : 0.01;
  return context;
}

function pruneLiveStores() {
  const now = Date.now();
  for (const [id, proposal] of liveState.proposals) {
    if (!proposal.expiresAt || Date.parse(proposal.expiresAt) <= now) liveState.proposals.delete(id);
  }
  for (const [id, approval] of liveState.approvals) {
    if (!approval.expiresAt || Date.parse(approval.expiresAt) <= now) liveState.approvals.delete(id);
  }
}

function publicProposal(proposal) {
  if (!proposal) return null;
  const { _input, ...publicFields } = proposal;
  return publicFields;
}

function liveAdmin(req, payload = {}) {
  if (!livePolicyConfig.adminTokenConfigured) {
    return { ok: false, status: 503, error: 'LIVE_ADMIN_TOKEN is not configured on the server' };
  }
  const fromHeader = String(req.headers['x-live-admin-token'] || '');
  const supplied = fromHeader || String(payload.adminToken || '');
  if (!safeEqual(supplied, String(process.env.LIVE_ADMIN_TOKEN || ''))) {
    return { ok: false, status: 401, error: 'Live admin token is invalid' };
  }
  return { ok: true, source: fromHeader ? 'header' : 'body' };
}

async function liveStatus() {
  const vault = tokenVaultStatus();
  const adapter = await loadLiveAdapter();
  const circuit = liveState.circuit.snapshot();
  const ready = livePolicyConfig.liveTradingEnabled
    && !liveState.killSwitch
    && vault.configured
    && adapter.available
    && !circuit.tripped
    && livePolicyConfig.approvalSecretConfigured
    && livePolicyConfig.adminTokenConfigured;
  return {
    mode: ready ? 'guarded-live' : 'paper',
    liveOrdersEnabled: ready,
    killSwitch: liveState.killSwitch,
    circuitBreaker: circuit,
    vault,
    adapter: { name: adapter.name, available: !!adapter.available, error: adapter.error || null },
    policy: livePolicyConfig,
    proposalCount: liveState.proposals.size,
    approvalCount: liveState.approvals.size,
    lastReconciliationAt: liveState.lastReconciliationAt,
    lastReconciliation: liveState.lastReconciliation,
    notice: ready
      ? 'Guarded live adapter is ready. Every order still requires explicit approval and a fresh risk check.'
      : 'Live orders are blocked. Configure server credentials, an adapter, admin token, approval secret, and disarm the kill switch.',
  };
}

async function runReconciliation() {
  try {
    const result = await reconcileLiveOrders({ orders: liveState.liveOrders });
    const remoteOrders = Array.isArray(result.orders) ? result.orders : [];
    const summary = summarizeReconciliation(liveState.liveOrders, remoteOrders);
    const snapshot = {
      status: result.status,
      code: result.code || null,
      provider: result.provider,
      summary,
      at: new Date().toISOString(),
    };
    liveState.lastReconciliationAt = snapshot.at;
    liveState.lastReconciliation = snapshot;
    await appendAudit('live_reconciliation', { status: snapshot.status, code: snapshot.code, matched: summary.matched });
    return snapshot;
  } catch (error) {
    const snapshot = {
      status: 'error',
      code: 'LIVE_RECONCILIATION_ERROR',
      reason: String(error.message).slice(0, 160),
      at: new Date().toISOString(),
    };
    liveState.lastReconciliationAt = snapshot.at;
    liveState.lastReconciliation = snapshot;
    await appendAudit('live_reconciliation', { status: snapshot.status, code: snapshot.code });
    return snapshot;
  }
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);
  if (url.pathname === '/api/health') {
    return sendJson(res, 200, {
      provider: rpcReady ? 'longbridge' : 'mock',
      longbridgeAvailable: rpcReady,
      detail: rpcReady ? null : rpcError,
      aiProvider: providerName(),
      aiModel: modelName(),
      marketProvider: marketCache.payload?.provider || 'mock',
    });
  }
  if (url.pathname === '/api/market') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
    const snapshot = await marketSnapshot();
    await appendAudit('market_snapshot', { provider: snapshot.provider, symbols: snapshot.items.map(item => item.symbol) });
    return sendJson(res, 200, snapshot);
  }
  if (url.pathname === '/api/news') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
    return sendJson(res, 200, { items: NEWS, calendar: CALENDAR, focus: FOCUS, provider: 'curated-mock', fetchedAt: new Date().toISOString() });
  }
  if (url.pathname === '/api/monitor') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
    return sendJson(res, 200, monitorSnapshot());
  }
  if (url.pathname === '/api/monitor/rules') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    let payload;
    try { payload = await readJsonBody(req); }
    catch (error) { return sendJson(res, 400, { error: error.message }); }
    if (!Array.isArray(payload.rules)) return sendJson(res, 400, { error: 'Provide a rules array' });
    const rules = payload.rules.map(normalizeRule).filter(Boolean).slice(0, 20);
    monitorState.rules = rules;
    await appendAudit('monitor_rules_updated', { count: rules.length, symbols: rules.map(rule => rule.symbol) });
    return sendJson(res, 200, monitorSnapshot());
  }
  if (url.pathname === '/api/monitor/run') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    return sendJson(res, 200, await runMonitorCycle());
  }
  if (url.pathname === '/api/backtest') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    let payload;
    try { payload = await readJsonBody(req); }
    catch (error) { return sendJson(res, 400, { error: error.message }); }
    const series = Array.isArray(payload.series) ? payload.series.slice(-300) : [];
    if (series.length < 5) return sendJson(res, 400, { error: 'Provide at least 5 price points' });
    const result = backtestSmaCross(series, { fast: payload.fast, slow: payload.slow, feePct: payload.feePct });
    await appendAudit('backtest_run', { symbol: payload.symbol || null, points: series.length, tradeCount: result.tradeCount || 0 });
    return sendJson(res, 200, result);
  }
  if (url.pathname === '/api/broker/status') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
    return sendJson(res, 200, brokerStatus());
  }
  if (url.pathname === '/api/live/status') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
    pruneLiveStores();
    return sendJson(res, 200, await liveStatus());
  }
  if (url.pathname === '/api/live/kill-switch') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    let payload;
    try { payload = await readJsonBody(req); }
    catch (error) { return sendJson(res, 400, { error: error.message }); }
    const admin = liveAdmin(req, payload);
    if (!admin.ok) return sendJson(res, admin.status, { error: admin.error });
    const enabled = payload.enabled === true ? true : payload.enabled === false ? false : null;
    if (enabled == null) return sendJson(res, 400, { error: 'Provide enabled as true or false' });
    if (!enabled && payload.confirmation !== 'DISABLE KILL SWITCH') {
      return sendJson(res, 400, { error: 'Type DISABLE KILL SWITCH to disarm live trading' });
    }
    liveState.killSwitch = enabled;
    if (enabled) liveState.approvals.clear();
    await appendAudit('live_kill_switch_updated', { enabled, adminSource: admin.source });
    return sendJson(res, 200, await liveStatus());
  }
  if (url.pathname === '/api/live/proposal') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    let payload;
    try { payload = await readJsonBody(req); }
    catch (error) { return sendJson(res, 400, { error: error.message }); }
    pruneLiveStores();
    const context = liveContext(payload.context);
    const account = liveAccount(payload.account);
    const assessment = evaluateLiveRisk({
      plan: payload.plan,
      risk: payload.risk,
      context,
      account,
      config: liveRiskConfig(),
    });
    const id = `live-${randomUUID()}`;
    const hash = createHash('sha256').update(JSON.stringify({
      id,
      plan: payload.plan,
      risk: payload.risk,
      context,
      account,
      assessment,
    })).digest('hex');
    const proposal = {
      id,
      hash,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + livePolicyConfig.approvalTtlSeconds * 1000).toISOString(),
      decision: assessment.decision,
      symbol: assessment.symbol,
      side: assessment.side,
      intent: {
        symbol: assessment.symbol,
        side: assessment.side,
        entry: Number(payload.plan?.entry) || null,
        stopLoss: Number(payload.plan?.stopLoss) || null,
        takeProfit: Number(payload.plan?.takeProfit) || null,
        units: assessment.units,
        notional: assessment.notional,
        riskPct: Number(payload.plan?.riskPct) || 0,
      },
      assessment,
      requiresApproval: assessment.eligible,
      liveOnly: true,
      _input: { plan: payload.plan, risk: payload.risk, context, account },
    };
    if (assessment.eligible) liveState.proposals.set(id, proposal);
    await appendAudit('live_proposal_created', { proposalId: id, symbol: proposal.symbol, decision: proposal.decision });
    return sendJson(res, 200, publicProposal(proposal));
  }
  if (url.pathname === '/api/live/approve') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    let payload;
    try { payload = await readJsonBody(req); }
    catch (error) { return sendJson(res, 400, { error: error.message }); }
    const admin = liveAdmin(req, payload);
    if (!admin.ok) return sendJson(res, admin.status, { error: admin.error });
    if (!livePolicyConfig.approvalSecretConfigured) {
      return sendJson(res, 503, { error: 'LIVE_APPROVAL_SECRET is not configured on the server' });
    }
    if (payload.confirmation !== 'APPROVE LIVE') {
      return sendJson(res, 400, { error: 'Type APPROVE LIVE to approve this proposal' });
    }
    pruneLiveStores();
    const proposal = liveState.proposals.get(String(payload.proposalId || ''));
    if (!proposal) return sendJson(res, 400, { error: 'Proposal is unknown or expired' });
    const assessment = evaluateLiveRisk({ ...proposal._input, config: liveRiskConfig() });
    if (!assessment.eligible) {
      proposal.decision = 'blocked';
      proposal.assessment = assessment;
      await appendAudit('live_approval_blocked', { proposalId: proposal.id, checks: assessment.checks.filter(item => !item.pass).map(item => item.name) });
      return sendJson(res, 400, { error: 'Proposal no longer passes the live risk gate', assessment });
    }
    const approval = createApproval(proposal, String(process.env.LIVE_APPROVAL_SECRET), livePolicyConfig.approvalTtlSeconds);
    liveState.approvals.set(approval.id, approval);
    await appendAudit('live_approval_issued', { proposalId: proposal.id, approvalId: approval.id, code: approval.code, adminSource: admin.source });
    return sendJson(res, 200, approval);
  }
  if (url.pathname === '/api/live/order') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    let payload;
    try { payload = await readJsonBody(req); }
    catch (error) { return sendJson(res, 400, { error: error.message }); }
    const admin = liveAdmin(req, payload);
    if (!admin.ok) return sendJson(res, admin.status, { error: admin.error });
    if (!livePolicyConfig.approvalSecretConfigured) {
      return sendJson(res, 503, { error: 'LIVE_APPROVAL_SECRET is not configured on the server' });
    }
    if (payload.confirmation !== 'EXECUTE LIVE') {
      return sendJson(res, 400, { error: 'Type EXECUTE LIVE to send the approved proposal' });
    }
    pruneLiveStores();
    const approval = payload.approval && typeof payload.approval === 'object' ? payload.approval : null;
    const proposal = approval?.proposalId ? liveState.proposals.get(String(approval.proposalId)) : null;
    const verified = verifyApproval(approval, proposal, String(process.env.LIVE_APPROVAL_SECRET));
    if (!verified.ok || !liveState.approvals.has(verified.approvalId || approval?.id)) {
      liveState.circuit.recordFailure(verified.reason || 'APPROVAL_NOT_FOUND');
      await appendAudit('live_order_rejected', { reason: verified.reason || 'APPROVAL_NOT_FOUND' });
      return sendJson(res, 400, { error: verified.reason || 'Approval is unknown or expired' });
    }
    liveState.approvals.delete(verified.approvalId);
    try {
      liveState.circuit.assertClosed();
    } catch (error) {
      await appendAudit('live_order_rejected', { reason: 'CIRCUIT_OPEN' });
      return sendJson(res, 400, { error: error.message });
    }
    const assessment = evaluateLiveRisk({ ...proposal._input, config: liveRiskConfig() });
    if (!assessment.eligible) {
      liveState.circuit.recordFailure('RISK_GATE_CHANGED');
      await appendAudit('live_order_rejected', { reason: 'RISK_GATE_CHANGED' });
      return sendJson(res, 400, { error: 'Live risk gate changed before execution', assessment });
    }
    try {
      const result = await placeLiveOrder({
        proposal: publicProposal(proposal),
        approval: { id: approval.id, code: approval.code, expiresAt: approval.expiresAt },
        assessment,
      });
      if (result.status === 'blocked') liveState.circuit.recordFailure(result.code || 'LIVE_ORDER_BLOCKED');
      else {
        liveState.circuit.recordSuccess();
        if (result.id || result.orderId) liveState.liveOrders.push(result);
      }
      await appendAudit('live_order_result', {
        proposalId: proposal.id,
        approvalId: approval.id,
        status: result.status,
        code: result.code || null,
        orderRef: result.id || result.orderId || null,
      });
      return sendJson(res, 200, result);
    } catch (error) {
      liveState.circuit.recordFailure(error.message);
      await appendAudit('live_order_error', { proposalId: proposal.id, reason: String(error.message).slice(0, 160) });
      return sendJson(res, 400, { error: String(error.message).slice(0, 160) });
    }
  }
  if (url.pathname === '/api/live/reconcile') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    let payload;
    try { payload = await readJsonBody(req); }
    catch (error) { return sendJson(res, 400, { error: error.message }); }
    const admin = liveAdmin(req, payload);
    if (!admin.ok) return sendJson(res, admin.status, { error: admin.error });
    return sendJson(res, 200, await runReconciliation());
  }
  if (url.pathname === '/api/audit/verify') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
    await auditQueue;
    const text = await readFile(auditFile, 'utf8').catch(() => '');
    return sendJson(res, 200, verifyAuditChain(text));
  }
  if (url.pathname === '/api/paper/order') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    let payload;
    try { payload = await readJsonBody(req); }
    catch (error) { return sendJson(res, 400, { error: error.message }); }
    const broker = payload.broker === 'metaapi' ? brokers.metaapi : brokers.paper;
    try {
      const order = await broker.placeOrder({
        plan: payload.plan,
        risk: payload.risk,
        context: payload.context,
        confirmation: payload.confirmation,
      });
      await appendAudit('paper_order_simulated', { orderId: order.id, symbol: order.symbol, side: order.side, provider: 'paper-simulator' });
      return sendJson(res, 200, order);
    } catch (error) {
      await appendAudit('paper_order_rejected', { reason: String(error.message).slice(0, 160) });
      return sendJson(res, 400, { error: error.message });
    }
  }
  if (url.pathname === '/api/paper/evaluate') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    let payload;
    try { payload = await readJsonBody(req); }
    catch (error) { return sendJson(res, 400, { error: error.message }); }
    try {
      const result = evaluatePaperOrder(payload.order, payload.price);
      await appendAudit('paper_order_evaluated', { orderId: result.orderId, outcome: result.outcome, pnl: result.pnl });
      return sendJson(res, 200, result);
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }
  if (url.pathname === '/api/ai') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    const clientKey = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'local';
    const client = clientHash(req);
    const now = Date.now();
    const hits = (aiHits.get(clientKey) || []).filter(time => now - time < 60000);
    if (hits.length >= 20) return sendJson(res, 429, { error: 'Too many AI requests. Try again shortly.' });
    hits.push(now);
    aiHits.set(clientKey, hits);
    let payload;
    try { payload = JSON.parse(await readBody(req)); }
    catch (error) { return sendJson(res, 400, { error: error.message === 'Request body too large' ? error.message : 'Invalid JSON body' }); }
    const message = typeof payload.message === 'string' ? payload.message.trim().slice(0, 2000) : '';
    if (!message) return sendJson(res, 400, { error: 'Provide a message' });
    const mode = payload.mode === 'plan' ? 'plan' : 'chat';
    const context = sanitizeContext(payload.context);
    const analysis = analyzeChart(context);
    const knowledge = await platformKnowledge();
    const enriched = { ...context, chartAnalysis: analysis };
    const system = mode === 'plan' ? planSystemPrompt(knowledge, enriched) : systemPrompt(knowledge, enriched);
    const messages = [{ role: 'system', content: system }, ...context.history, { role: 'user', content: message }];
    try {
      const result = await complete(messages);
      const response = { reply: result.reply, provider: result.provider, model: result.model, disclaimer: 'Informational only; not financial advice.' };
      if (mode === 'plan') {
        const raw = result.provider === 'groq' ? parseJsonPlan(result.reply) : null;
        const plan = normalizePlan(raw, analysis, context);
        const risk = riskGate(plan, analysis, context);
        response.plan = plan;
        response.risk = risk;
        response.analysis = analysis;
        response.reply = plan.bias === 'neutral'
          ? `${plan.rationale}\n\n${result.reply}`
          : `Cadangan ${plan.bias} untuk ${context.selected || analysis.symbol}: entry ${plan.entry}, SL ${plan.stopLoss}, TP ${plan.takeProfit}, risiko ${plan.riskPct}%. Semakan risiko: ${risk.decision}. Kelulusan manusia diperlukan; paper sahaja.\n\n${result.reply}`;
      }
      await appendAudit('ai_request', {
        client,
        mode,
        provider: result.provider,
        model: result.model,
        symbol: context.selected || analysis.symbol || null,
        decision: response.risk?.decision || null,
      });
      return sendJson(res, 200, response);
    } catch (error) {
      await appendAudit('ai_error', { client, mode, error: error.message.slice(0, 200) });
      return sendJson(res, 502, { error: error.message });
    }
  }
  if (url.pathname === '/api/quotes') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
    if (!rpcReady) return sendJson(res, 503, { error: rpcError });
    const symbols = [...new Set((url.searchParams.get('symbols') || '').split(',').filter(Boolean))];
    if (!symbols.length || symbols.length > 20 || symbols.some(symbol => !/^[A-Z0-9.]{1,20}$/.test(symbol))) {
      return sendJson(res, 400, { error: 'Provide 1–20 valid Longbridge symbols' });
    }
    try {
      const result = await rpc('quote.quote', { symbols });
      const quotes = (Array.isArray(result) ? result : []).map(parseQuote).filter(Boolean);
      return sendJson(res, 200, { provider: 'longbridge', quotes });
    } catch (error) {
      return sendJson(res, 502, { error: error.message });
    }
  }

  const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const file = resolve(webRoot, `.${requested}`);
  if (!file.startsWith(`${webRoot}${sep}`)) return sendJson(res, 403, { error: 'Forbidden' });
  try {
    const body = await readFile(file);
    const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': contentTypes[extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
  }
}

if (process.env.MONITOR_DISABLED !== 'true') {
  const monitorInterval = setInterval(() => {
    runMonitorCycle().catch(() => {});
  }, monitorSnapshot().intervalSeconds * 1000);
  monitorInterval.unref();
}

if (livePolicyConfig.liveTradingEnabled && process.env.LIVE_RECONCILE_INTERVAL_SECONDS) {
  const reconciliationInterval = setInterval(() => {
    runReconciliation().catch(() => {});
  }, livePolicyConfig.reconcileIntervalSeconds * 1000);
  reconciliationInterval.unref();
}

startLongbridge();
createServer((req, res) => { handle(req, res).catch(() => sendJson(res, 500, { error: 'Unexpected server error' })); })
  .listen(port, host, () => console.log(`TradeWall is running at http://${host}:${port}`));

rpc('initialize').then(() => {
  rpcReady = true;
  rpcError = '';
  console.log('Longbridge quote provider connected');
}).catch(error => {
  rpcReady = false;
  rpcError = error.message;
  console.log(`Longbridge is unavailable; using mock data (${rpcError})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    try { rpcProcess?.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method: 'shutdown' })}\n`); } catch {}
    rpcProcess?.kill();
    process.exit(0);
  });
}
