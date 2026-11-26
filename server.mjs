import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const webRoot = resolve(root, 'web');
const port = Number(process.env.PORT || 8080);
const host = '127.0.0.1';
const pending = new Map();
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

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);
  if (url.pathname === '/api/health') {
    return sendJson(res, 200, { provider: rpcReady ? 'longbridge' : 'mock', longbridgeAvailable: rpcReady, detail: rpcReady ? null : rpcError });
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
