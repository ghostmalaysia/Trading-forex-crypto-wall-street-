const DEFAULT_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const PUSH_TOKEN_PATTERN = /^Expo(?:nent)?PushToken\[.+\]$/;
const TOKEN_IN_TEXT_PATTERN = /\bExpo(?:nent)?PushToken\[[^\]]*\]/gi;
const BEARER_IN_TEXT_PATTERN = /\bBearer\s+\S+/gi;
const knownPushErrors = new Set([
  'DeviceNotRegistered',
  'InvalidCredentials',
  'InvalidPushToken',
  'MessageRateExceeded',
  'MessageTooBig',
  'NetworkError',
  'InternalServerError',
]);
const sensitiveKeys = new Set([
  'authorization',
  'apikey',
  'accesstoken',
  'refreshtoken',
  'sessiontoken',
  'password',
  'secret',
  'clientsecret',
  'cookie',
  'credential',
  'credentials',
  'privatekey',
  'push token',
]);

function text(value) {
  return value == null ? '' : String(value).trim();
}

function readEnv(env, name) {
  return text(env?.[name]);
}

function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

function isSensitiveKey(key) {
  const normalized = key.toLowerCase().replace(/[^a-z]/g, '');
  return sensitiveKeys.has(key.toLowerCase()) || sensitiveKeys.has(normalized)
    || /token|secret|password|apikey|authorization|credential|cookie|private/i.test(key);
}

function safeScalar(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return value.slice(0, 200);
  return null;
}

function safePushData(value) {
  const result = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  let count = 0;
  for (const [key, item] of Object.entries(value)) {
    if (count >= 20) break;
    const name = text(key).slice(0, 40);
    if (!name || isSensitiveKey(name)) continue;
    const scalar = safeScalar(item);
    if (scalar === null) continue;
    result[name] = scalar;
    count += 1;
  }
  return result;
}

function safeSound(value) {
  if (value === true) return 'default';
  if (typeof value !== 'string') return null;
  const sound = text(value);
  if (!sound || /^https?:\/\//i.test(sound)) return null;
  return sound.slice(0, 64);
}

function shortCode(value) {
  const raw = text(value);
  if (knownPushErrors.has(raw)) return raw;
  if (/^[A-Z][A-Z0-9_]{2,39}$/.test(raw) && !/SECRET|TOKEN|PASSWORD|BEARER/.test(raw)) return raw;
  return '';
}

function ticketError(ticket) {
  return shortCode(ticket?.details?.error)
    || shortCode(ticket?.error?.code)
    || shortCode(ticket?.code)
    || shortCode(ticket?.details?.code)
    || shortCode(ticket?.message)
    || 'PUSH_ERROR';
}

function topLevelCodes(payload) {
  const codes = [];
  if (payload && typeof payload === 'object' && Array.isArray(payload.errors)) {
    for (const item of payload.errors) {
      const code = shortCode(item?.code) || shortCode(item?.details?.error) || shortCode(item?.message);
      if (code && !codes.includes(code)) codes.push(code);
    }
  }
  return codes;
}

function safeTicketMessage(value, secrets) {
  let message = text(value).replace(TOKEN_IN_TEXT_PATTERN, '[push-token]');
  message = message.replace(BEARER_IN_TEXT_PATTERN, 'Bearer [redacted]');
  for (const secret of secrets) {
    if (secret && message.includes(secret)) message = message.split(secret).join('[redacted]');
  }
  return message.slice(0, 160);
}

export function pushConfig(options = {}) {
  const env = options.env || process.env;
  const url = readEnv(env, 'EXPO_PUSH_URL') || DEFAULT_PUSH_URL;
  const accessToken = readEnv(env, 'EXPO_PUSH_ACCESS_TOKEN');
  const timeoutMs = boundedNumber(readEnv(env, 'PUSH_REQUEST_TIMEOUT_MS') || 8000, 8000, 1000, 30000);
  return { url, accessToken, timeoutMs, configured: !!url };
}

export function normalizePushTokens(tokens) {
  const values = Array.isArray(tokens) ? tokens : [tokens];
  const seen = new Set();
  const result = [];
  for (const item of values) {
    const token = text(item);
    if (!PUSH_TOKEN_PATTERN.test(token) || seen.has(token)) continue;
    seen.add(token);
    result.push(token);
    if (result.length >= 100) break;
  }
  return result;
}

export function buildPushMessage({ title, body, data, sound } = {}) {
  const message = {
    title: text(title).slice(0, 120) || 'MIM VENTURES alert',
    body: text(body).slice(0, 240),
    data: safePushData(data),
  };
  const normalizedSound = safeSound(sound);
  if (normalizedSound) message.sound = normalizedSound;
  return message;
}

export async function sendExpoPush({ tokens, title, body, data, sound } = {}, options = {}) {
  const tokenList = normalizePushTokens(tokens);
  if (!tokenList.length) return { sent: 0, results: [], errors: ['NO_VALID_TOKENS'] };

  const config = pushConfig(options);
  const fetchImpl = options.fetchImpl || options.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') return { sent: 0, results: [], errors: ['FETCH_UNAVAILABLE'] };

  const message = buildPushMessage({ title, body, data, sound });
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (config.accessToken) headers.Authorization = `Bearer ${config.accessToken}`;
  const secrets = [config.accessToken, ...tokenList];

  try {
    const response = await fetchImpl(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(tokenList.map(to => ({ ...message, to }))),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    const status = Number(response?.status);
    const ok = typeof response?.ok === 'boolean'
      ? response.ok
      : Number.isFinite(status) && status >= 200 && status < 300;
    if (!ok) {
      return { sent: 0, results: [], errors: [Number.isFinite(status) && status > 0 ? `HTTP_${status}` : 'HTTP_ERROR'] };
    }

    const payload = typeof response?.json === 'function'
      ? await response.json()
      : JSON.parse(await response.text());
    if (!payload || !Array.isArray(payload.data)) {
      const codes = topLevelCodes(payload);
      return { sent: 0, results: [], errors: codes.length ? codes : ['INVALID_RESPONSE'] };
    }

    const results = [];
    const errors = [];
    let sent = 0;
    for (const ticket of payload.data) {
      const ticketStatus = text(ticket?.status).slice(0, 32) || 'unknown';
      results.push({
        status: ticketStatus,
        id: text(ticket?.id).slice(0, 120),
        message: safeTicketMessage(ticket?.message, secrets),
      });
      if (ticketStatus === 'ok') sent += 1;
      else errors.push(ticketError(ticket));
    }
    for (const code of topLevelCodes(payload)) {
      if (!errors.includes(code)) errors.push(code);
    }
    return { sent, results, errors };
  } catch {
    return { sent: 0, results: [], errors: ['PUSH_REQUEST_FAILED'] };
  }
}

export function pushStatus(options = {}) {
  const env = options.env || process.env;
  return {
    configured: pushConfig(options).configured,
    urlConfigured: !!readEnv(env, 'EXPO_PUSH_URL'),
    accessTokenConfigured: !!readEnv(env, 'EXPO_PUSH_ACCESS_TOKEN'),
    secretSource: 'server_environment',
    exposedToBrowser: false,
  };
}
