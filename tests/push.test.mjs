import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pushConfig,
  normalizePushTokens,
  buildPushMessage,
  sendExpoPush,
  pushStatus,
} from '../ai/push.mjs';

function token(id) {
  return `ExpoPushToken[token-${id}]`;
}

function jsonResponse(data, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => data };
}

test('push config and status keep secrets on the server', () => {
  const env = {
    EXPO_PUSH_URL: 'https://push.example/send',
    EXPO_PUSH_ACCESS_TOKEN: 'server-secret',
    PUSH_REQUEST_TIMEOUT_MS: '999999',
  };
  const config = pushConfig({ env });
  assert.equal(config.url, env.EXPO_PUSH_URL);
  assert.equal(config.accessToken, 'server-secret');
  assert.equal(config.timeoutMs, 30000);
  assert.equal(config.configured, true);
  assert.equal(pushConfig({ env: {} }).url, 'https://exp.host/--/api/v2/push/send');
  assert.equal(pushConfig({ env: { PUSH_REQUEST_TIMEOUT_MS: '12' } }).timeoutMs, 1000);
  assert.equal(pushConfig({ env: { PUSH_REQUEST_TIMEOUT_MS: 'nope' } }).timeoutMs, 8000);

  assert.deepEqual(pushStatus({ env }), {
    configured: true,
    urlConfigured: true,
    accessTokenConfigured: true,
    secretSource: 'server_environment',
    exposedToBrowser: false,
  });
  assert.deepEqual(pushStatus({ env: {} }), {
    configured: true,
    urlConfigured: false,
    accessTokenConfigured: false,
    secretSource: 'server_environment',
    exposedToBrowser: false,
  });
});

test('normalize push tokens filters placeholders, trims, dedupes and caps at 100', () => {
  const valid = Array.from({ length: 105 }, (_, index) => `ExponentPushToken[id-${index}]`);
  const input = [
    '',
    'YOUR_EXPO_TOKEN',
    'placeholder',
    'ExpoPushToken[]',
    'ExpoPushToken[unclosed',
    null,
    42,
    valid[0],
    `  ${valid[0]}  `,
    ...valid,
  ];
  const tokens = normalizePushTokens(input);
  assert.equal(tokens.length, 100);
  assert.equal(new Set(tokens).size, 100);
  assert.equal(tokens[0], valid[0]);
  assert.equal(tokens[1], valid[1]);
  assert.ok(tokens.every(item => /^Expo(?:nent)?PushToken\[.+\]$/.test(item)));
  assert.deepEqual(normalizePushTokens(` ${valid[0]} `), [valid[0]]);
  assert.deepEqual(normalizePushTokens('YOUR_EXPO_TOKEN'), []);
});

test('build push message truncates fields and removes secret data', () => {
  const data = {
    symbol: 'XAU/USD',
    direction: 'buy',
    password: 'hunter2',
    apiKey: 'abc123',
    token: 'secret-token',
    nested: { leak: true },
    n: 3,
    ok: true,
    bad: () => {},
    ...Object.fromEntries(Array.from({ length: 25 }, (_, index) => [`k${index}`, index])),
  };
  const message = buildPushMessage({
    title: ` ${'a'.repeat(150)} `,
    body: `${'b'.repeat(300)}`,
    data,
    sound: true,
  });
  assert.equal(message.title.length, 120);
  assert.equal(message.body.length, 240);
  assert.equal(message.sound, 'default');
  assert.equal(message.data.symbol, 'XAU/USD');
  assert.equal(message.data.password, undefined);
  assert.equal(message.data.apiKey, undefined);
  assert.equal(message.data.token, undefined);
  assert.equal(message.data.nested, undefined);
  assert.equal(Object.keys(message.data).length, 20);
  const serialized = JSON.stringify(message);
  assert.ok(!serialized.includes('hunter2'));
  assert.ok(!serialized.includes('abc123'));
  assert.ok(!serialized.includes('secret-token'));
  assert.equal(buildPushMessage({}).title, 'MIM VENTURES alert');
  assert.equal(buildPushMessage({ sound: 'https://evil.example/s.wav' }).sound, undefined);
});

test('send expo push posts an array payload with safe headers and counts tickets', async () => {
  const calls = [];
  const env = {
    EXPO_PUSH_URL: 'https://push.example/send',
    EXPO_PUSH_ACCESS_TOKEN: 'server-secret',
    PUSH_REQUEST_TIMEOUT_MS: '1234',
  };
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({
      data: [
        { status: 'ok', id: 'ticket-1', message: 'sent' },
        {
          status: 'error',
          id: 'ticket-2',
          message: `failed for ExponentPushToken[token-2] Bearer server-secret`,
          details: { error: 'DeviceNotRegistered' },
        },
      ],
    });
  };
  const result = await sendExpoPush({
    tokens: [token('1'), ` ${token('1')} `, 'placeholder', 'ExponentPushToken[token-2]'],
    title: 'Alert',
    body: 'Move',
    data: { symbol: 'BTC' },
  }, { env, fetchImpl });

  assert.equal(result.sent, 1);
  assert.deepEqual(result.errors, ['DeviceNotRegistered']);
  assert.deepEqual(result.results.map(item => item.status), ['ok', 'error']);
  for (const item of result.results) {
    assert.deepEqual(Object.keys(item).sort(), ['id', 'message', 'status']);
  }
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes('server-secret'));
  assert.ok(!serialized.includes('ExponentPushToken[token-2]'));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, env.EXPO_PUSH_URL);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Accept, 'application/json');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer server-secret');
  assert.ok(calls[0].init.signal);
  assert.equal(typeof calls[0].init.signal.aborted, 'boolean');
  const payload = JSON.parse(calls[0].init.body);
  assert.ok(Array.isArray(payload));
  assert.equal(payload.length, 2);
  assert.deepEqual(payload.map(item => item.to), [token('1'), 'ExponentPushToken[token-2]']);
  assert.ok(payload.every(item => item.title === 'Alert' && item.data.symbol === 'BTC'));
  assert.ok(!JSON.stringify(payload).includes('server-secret'));
});

test('send expo push caps the stub payload at 100 tokens', async () => {
  let payload;
  const tokens = Array.from({ length: 105 }, (_, index) => token(index));
  const fetchImpl = async (url, init) => {
    payload = JSON.parse(init.body);
    return jsonResponse({ data: payload.map((item, index) => ({ status: 'ok', id: `id-${index}` })) });
  };
  const result = await sendExpoPush({ tokens }, { fetchImpl });
  assert.equal(payload.length, 100);
  assert.equal(result.sent, 100);
  assert.deepEqual(result.errors, []);
});

test('send expo push skips fetch without valid tokens', async () => {
  let called = false;
  const result = await sendExpoPush({
    tokens: ['YOUR_EXPO_TOKEN', 'ExpoPushToken[]', 42],
  }, {
    fetchImpl: async () => {
      called = true;
      throw new Error('unexpected fetch');
    },
  });
  assert.deepEqual(result, { sent: 0, results: [], errors: ['NO_VALID_TOKENS'] });
  assert.equal(called, false);
});

test('send expo push sanitizes transport, HTTP and parse errors', async () => {
  const network = await sendExpoPush({ tokens: [token('x')] }, {
    env: { EXPO_PUSH_ACCESS_TOKEN: 'server-secret' },
    fetchImpl: async () => {
      throw new Error('network failure Bearer server-secret ExponentPushToken[token-x]');
    },
  });
  assert.deepEqual(network, { sent: 0, results: [], errors: ['PUSH_REQUEST_FAILED'] });

  const parse = await sendExpoPush({ tokens: [token('x')] }, {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('bad json server-secret');
      },
    }),
  });
  assert.deepEqual(parse, { sent: 0, results: [], errors: ['PUSH_REQUEST_FAILED'] });

  const unauthorized = await sendExpoPush({ tokens: [token('x')] }, {
    fetchImpl: async () => jsonResponse({ errors: [{ message: 'Bearer server-secret' }] }, { ok: false, status: 401 }),
  });
  assert.deepEqual(unauthorized, { sent: 0, results: [], errors: ['HTTP_401'] });

  const invalid = await sendExpoPush({ tokens: [token('x')] }, {
    fetchImpl: async () => jsonResponse({ errors: [{ message: 'Bearer server-secret' }] }),
  });
  assert.deepEqual(invalid.errors, ['INVALID_RESPONSE']);
});

test('send expo push omits authorization when no access token is configured', async () => {
  let headers;
  await sendExpoPush({ tokens: [token('plain')] }, {
    env: {},
    fetchImpl: async (url, init) => {
      headers = init.headers;
      return jsonResponse({ data: [{ status: 'ok', id: 'id' }] });
    },
  });
  assert.equal(headers.Authorization, undefined);
  assert.equal(headers.Accept, 'application/json');
});
