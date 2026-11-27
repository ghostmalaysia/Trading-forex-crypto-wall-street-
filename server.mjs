import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platformKnowledge, systemPrompt, planSystemPrompt } from './ai/prompt.mjs';
import { complete, providerName, modelName } from './ai/provider.mjs';
import { analyzeChart, normalizePlan, riskGate } from './ai/plan.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const webRoot = resolve(root, 'web');
const port = Number(process.env.PORT || 8080);
const host = '127.0.0.1';
const pending = new Map();
const aiHits = new Map();
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
  if (!rpcProcess?.stdin?.writable) return Promise.reject(new Error(rpcError));
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
  };
}

function parseJsonPlan(text) {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
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
    });
  }
  if (url.pathname === '/api/ai') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    const client = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'local';
    const now = Date.now();
    const hits = (aiHits.get(client) || []).filter(time => now - time < 60000);
    if (hits.length >= 20) return sendJson(res, 429, { error: 'Too many AI requests. Try again shortly.' });
    hits.push(now);
    aiHits.set(client, hits);
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
      return sendJson(res, 200, response);
    } catch (error) { return sendJson(res, 502, { error: error.message }); }
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
