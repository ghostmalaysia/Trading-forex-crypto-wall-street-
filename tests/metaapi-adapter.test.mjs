import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import adapter, { metaApiHttpConfig, normalizeMetaApiResponse } from '../ai/adapters/metaapi-http.mjs';

function startStub(handler) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    let json = null;
    try { json = body ? JSON.parse(body) : null; } catch { json = null; }
    const entry = { method: req.method, url: req.url, headers: req.headers, body: json };
    requests.push(entry);
    const out = await handler(entry, res);
    if (res.writableEnded) return;
    const status = out && typeof out.status === 'number' ? out.status : 200;
    const payload = out && Object.prototype.hasOwnProperty.call(out, 'body') ? out.body : out;
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ requests, server, url: `http://127.0.0.1:${port}` });
    });
  });
}

function stopStub(stub) {
  return new Promise((resolve, reject) => stub.server.close(err => err ? reject(err) : resolve()));
}

test('metaapi-http adapter exports contract and normalizes responses', async () => {
  assert.equal(adapter.name, 'metaapi-http');
  assert.equal(typeof adapter.placeOrder, 'function');
  assert.equal(typeof adapter.reconcile, 'function');
  assert.equal(typeof metaApiHttpConfig, 'function');
  assert.equal(typeof normalizeMetaApiResponse, 'function');

  const normalized = normalizeMetaApiResponse({
    id: 'o1',
    status: 'filled',
    token: 'secret-token',
    accountId: 'account-123',
    nested: { secret: 'x' },
    orders: [{ orderId: 'o2', status: 'ok', secret: 'leak' }, 'bad'],
    ignored: 'drop',
  });
  assert.deepEqual(normalized, {
    id: 'o1',
    status: 'filled',
    orders: [{ orderId: 'o2', status: 'ok' }, {}],
  });
  assert.equal(JSON.stringify(normalized).includes('secret-token'), false);
  assert.equal(JSON.stringify(normalized).includes('leak'), false);
});

test('placeOrder posts scalar payload with auth and account substitution', async () => {
  const stub = await startStub(() => ({
    id: 'broker-1',
    status: 'accepted',
    symbol: 'EURUSD',
    side: 'buy',
    units: 1,
    secret: 'should-not-leak',
  }));
  try {
    const env = {
      METAAPI_ORDER_URL: `${stub.url}/users/{accountId}/orders`,
      METAAPI_AUTH_SCHEME: 'Bearer',
      METAAPI_REQUEST_TIMEOUT_MS: '5000',
    };
    const result = await adapter.placeOrder({
      proposal: { symbol: 'EURUSD', side: 'buy', units: 1, price: 1.1, type: 'market', clientOrderId: 'c1', reason: 'signal', secret: 'nope' },
      approval: { id: 'approval-1' },
      assessment: { reason: 'approved' },
      credentials: () => ({ token: 'secret-token', accountId: 'account-123' }),
    }, { env });

    assert.equal(stub.requests.length, 1);
    const req = stub.requests[0];
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/users/account-123/orders');
    assert.equal(req.headers.authorization, 'Bearer secret-token');
    assert.deepEqual(req.body, {
      accountId: 'account-123',
      symbol: 'EURUSD',
      side: 'buy',
      units: 1,
      price: 1.1,
      type: 'market',
      approvalId: 'approval-1',
      clientOrderId: 'c1',
      reason: 'approved',
    });
    assert.deepEqual(result, {
      id: 'broker-1',
      status: 'accepted',
      symbol: 'EURUSD',
      side: 'buy',
      units: 1,
    });
    assert.equal(JSON.stringify(result).includes('should-not-leak'), false);
  } finally {
    await stopStub(stub);
  }
});

test('missing endpoint returns blocked result and no fetch occurs', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (...args) => {
    calls += 1;
    return originalFetch(...args);
  };
  try {
    const result = await adapter.placeOrder({
      proposal: { symbol: 'EURUSD' },
      credentials: () => ({ token: 'secret-token', accountId: 'account-123' }),
    }, { env: {} });
    assert.deepEqual(result, {
      status: 'blocked',
      code: 'METAAPI_ENDPOINT_NOT_CONFIGURED',
      message: 'MetaApi order endpoint or credentials are not configured.',
    });
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
