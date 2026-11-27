import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  buildMarketUrl,
  fetchLicensedMarketTarget,
  isLicensedAdapter,
  marketAdapterConfig,
  normalizeMarketItem,
} from '../ai/market-adapter.mjs';

const target = { symbol: 'XAU/USD', providerSymbol: 'GC=F', label: 'Gold' };

test('config defaults, trims, clamps timeout, and gates configured', () => {
  const defaults = marketAdapterConfig({ env: {} });
  assert.equal(defaults.adapter, 'indicative');
  assert.equal(defaults.endpoint, '');
  assert.equal(defaults.apiKey, '');
  assert.equal(defaults.keyHeader, 'Authorization');
  assert.equal(defaults.authScheme, 'Bearer');
  assert.equal(defaults.timeoutMs, 8000);
  assert.equal(defaults.configured, false);

  const low = marketAdapterConfig({ env: { MARKET_DATA_TIMEOUT_MS: '10' } });
  assert.equal(low.timeoutMs, 1000);
  const high = marketAdapterConfig({ env: { MARKET_DATA_TIMEOUT_MS: '999999' } });
  assert.equal(high.timeoutMs, 30000);

  const licensed = marketAdapterConfig({
    env: {
      MARKET_DATA_ADAPTER: ' licensed ',
      MARKET_DATA_ENDPOINT: ' http://127.0.0.1/quotes/{symbol} ',
      MARKET_DATA_API_KEY: ' secret-key ',
      MARKET_DATA_API_KEY_HEADER: ' X-Market-Key ',
      MARKET_DATA_AUTH_SCHEME: ' ',
      MARKET_DATA_TIMEOUT_MS: 'abc',
    },
  });
  assert.equal(licensed.adapter, 'licensed');
  assert.equal(licensed.endpoint, 'http://127.0.0.1/quotes/{symbol}');
  assert.equal(licensed.apiKey, 'secret-key');
  assert.equal(licensed.keyHeader, 'X-Market-Key');
  assert.equal(licensed.authScheme, '');
  assert.equal(licensed.timeoutMs, 8000);
  assert.equal(licensed.configured, true);
});

test('buildMarketUrl substitutes encoded symbols and never appends the key', () => {
  const endpoint = 'http://127.0.0.1/quotes/{providerSymbol}?symbol={symbol}';
  assert.equal(
    buildMarketUrl(target, { endpoint, apiKey: 'secret-key' }),
    'http://127.0.0.1/quotes/GC%3DF?symbol=XAU%2FUSD',
  );
  assert.equal(buildMarketUrl(target, { endpoint: 'http://127.0.0.1/quotes' }), 'http://127.0.0.1/quotes');
});

test('licensed fetch sends custom auth header and encoded path', async () => {
  const seen = {};
  const stub = createServer((req, res) => {
    seen.url = req.url;
    seen.key = req.headers['x-market-key'];
    seen.accept = req.headers.accept;
    const series = Array.from({ length: 70 }, (_, index) => 2000 + index);
    res.writeHead(200, { 'content-type': 'application/json', connection: 'close' });
    res.end(JSON.stringify({ price: 2500.126, previousClose: 2490.98765, series, currency: 'USD', exchange: 'TEST' }));
  });
  await new Promise(resolve => stub.listen(0, '127.0.0.1', resolve));
  const { port } = stub.address();
  const env = {
    MARKET_DATA_ADAPTER: 'licensed',
    MARKET_DATA_ENDPOINT: `http://127.0.0.1:${port}/quotes/{providerSymbol}?symbol={symbol}`,
    MARKET_DATA_API_KEY: 'secret-key',
    MARKET_DATA_API_KEY_HEADER: 'X-Market-Key',
  };
  try {
    const item = await fetchLicensedMarketTarget('XAU/USD', target, { env });
    assert.equal(seen.url, '/quotes/GC%3DF?symbol=XAU%2FUSD');
    assert.equal(seen.key, 'Bearer secret-key');
    assert.equal(seen.accept, 'application/json');
    assert.equal(item.symbol, 'XAU/USD');
    assert.equal(item.providerSymbol, 'GC=F');
    assert.equal(item.label, 'Gold');
    assert.equal(item.price, 2500.13);
    assert.equal(item.previousClose, 2490.99);
    assert.equal(item.series.length, 60);
    assert.equal(item.series[0], 2010);
    assert.equal(item.series.at(-1), 2069);
  } finally {
    await new Promise(resolve => stub.close(resolve));
  }
});

test('normalization handles flat and nested payloads with rounding and 60-point clamp', () => {
  const flatSeries = [0, -2, 'bad', ...Array.from({ length: 65 }, (_, index) => 100 + index)];
  const flat = normalizeMarketItem('EUR/USD', target, {
    price: 1.2345678,
    previousClose: 0.9876543,
    series: flatSeries,
    currency: 'EUR',
    exchange: 'FX',
  });
  assert.equal(flat.price, 1.23457);
  assert.equal(flat.previousClose, 0.98765);
  assert.equal(flat.series.length, 60);
  assert.equal(flat.series[0], 105);
  assert.equal(flat.series.at(-1), 164);
  assert.equal(flat.currency, 'EUR');
  assert.equal(flat.exchange, 'FX');

  const nestedSeries = [NaN, 0, ...Array.from({ length: 61 }, (_, index) => 2 + index / 10)];
  const nested = normalizeMarketItem('XAU/USD', target, {
    meta: { regularMarketPrice: 125.126, chartPreviousClose: 99.123456, currency: 'USD', exchange: 'TEST' },
    indicators: { quote: [{ close: nestedSeries }] },
  });
  assert.equal(nested.price, 125.13);
  assert.equal(nested.previousClose, 99.12346);
  assert.equal(nested.series.length, 60);
  assert.equal(nested.series[0], 2.1);
  assert.equal(nested.series.at(-1), 8);
  assert.equal(nested.label, 'Gold');
  assert.equal(nested.currency, 'USD');
  assert.equal(nested.exchange, 'TEST');

  assert.throws(() => normalizeMarketItem('XAU/USD', target, { price: 0 }), /usable price/);
  assert.throws(() => normalizeMarketItem('XAU/USD', target, { price: 'bad' }), /usable price/);
});

test('missing config and non-OK responses produce safe errors', async () => {
  assert.equal(isLicensedAdapter({ env: {} }), false);
  assert.equal(isLicensedAdapter({ env: { MARKET_DATA_ADAPTER: 'licensed' } }), true);
  await assert.rejects(
    fetchLicensedMarketTarget('XAU/USD', target, {
      env: {
        MARKET_DATA_ADAPTER: 'licensed',
        MARKET_DATA_ENDPOINT: 'http://secret.invalid/{symbol}?key=supersecret',
      },
    }),
    error => {
      assert.ok(!error.message.includes('supersecret'));
      assert.ok(!error.message.includes('secret.invalid'));
      return true;
    },
  );
  await assert.rejects(
    fetchLicensedMarketTarget('XAU/USD', target, {
      env: {
        MARKET_DATA_ADAPTER: 'indicative',
        MARKET_DATA_ENDPOINT: 'http://secret.invalid/{symbol}',
        MARKET_DATA_API_KEY: 'supersecret',
      },
    }),
    error => !error.message.includes('supersecret') && !error.message.includes('secret.invalid'),
  );

  const stub = createServer((req, res) => {
    res.writeHead(401, { 'content-type': 'text/plain', connection: 'close' });
    res.end('leaked body with supersecret');
  });
  await new Promise(resolve => stub.listen(0, '127.0.0.1', resolve));
  const { port } = stub.address();
  try {
    await assert.rejects(
      fetchLicensedMarketTarget('XAU/USD', target, {
        env: {
          MARKET_DATA_ADAPTER: 'licensed',
          MARKET_DATA_ENDPOINT: `http://127.0.0.1:${port}/quotes/{symbol}`,
          MARKET_DATA_API_KEY: 'supersecret',
        },
      }),
      error => {
        assert.match(error.message, /HTTP 401/);
        assert.ok(!error.message.includes('supersecret'));
        assert.ok(!error.message.includes('leaked body'));
        return true;
      },
    );
  } finally {
    await new Promise(resolve => stub.close(resolve));
  }
});
