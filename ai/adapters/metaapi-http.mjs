const ALLOWED_SCALAR_KEYS = ['id', 'orderId', 'status', 'code', 'symbol', 'side', 'price', 'units', 'reason', 'message', 'accepted', 'brokerStatus', 'reconciledAt'];
const SCALAR_TYPES = new Set(['string', 'number', 'boolean']);

function text(value) {
  return String(value == null ? '' : value).trim();
}

function clampTimeout(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 8000;
  return Math.min(30000, Math.max(1000, Math.trunc(n)));
}

function blocked(code, message) {
  return { status: 'blocked', code, message };
}

function isScalar(value) {
  return value == null || SCALAR_TYPES.has(typeof value);
}

function pickScalar(source, key) {
  if (!source || typeof source !== 'object') return undefined;
  const value = source[key];
  return isScalar(value) ? value : undefined;
}

function sanitizeScalarRecord(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const key of ALLOWED_SCALAR_KEYS) {
    const value = input[key];
    if (isScalar(value) && value !== undefined) out[key] = value;
  }
  return out;
}

function normalizeOrders(orders) {
  if (!Array.isArray(orders)) return undefined;
  return orders.slice(0, 200).map(order => normalizeMetaApiResponse(order));
}

export function normalizeMetaApiResponse(input) {
  const normalized = sanitizeScalarRecord(input);
  if (input && typeof input === 'object' && Array.isArray(input.orders)) {
    normalized.orders = normalizeOrders(input.orders);
  }
  return normalized;
}

function resolveUrl(template, accountId) {
  const raw = text(template);
  if (!raw) return '';
  return raw.replaceAll('{accountId}', encodeURIComponent(accountId));
}

export function metaApiHttpConfig(options = {}) {
  const env = options.env || process.env;
  const orderUrl = text(env.METAAPI_ORDER_URL);
  const reconcileUrl = text(env.METAAPI_RECONCILE_URL);
  const authScheme = text(env.METAAPI_AUTH_SCHEME) || 'Bearer';
  const apiKeyHeader = text(env.METAAPI_API_KEY_HEADER) || 'Authorization';
  const timeoutMs = clampTimeout(env.METAAPI_REQUEST_TIMEOUT_MS);
  return { orderUrl, reconcileUrl, authScheme, apiKeyHeader, timeoutMs };
}

function resolveCredentials(input = {}) {
  try {
    const creds = typeof input.credentials === 'function' ? input.credentials() : null;
    const token = text(creds && creds.token);
    const accountId = text(creds && creds.accountId);
    if (!token || !accountId) return null;
    return { token, accountId };
  } catch {
    return null;
  }
}

function buildHeaders(config, token) {
  const headers = { 'content-type': 'application/json', accept: 'application/json' };
  const scheme = text(config.authScheme);
  headers[config.apiKeyHeader] = scheme ? `${scheme} ${token}` : token;
  return headers;
}

function safeErrorMessage(error) {
  const name = text(error && error.name);
  if (name === 'TimeoutError' || name === 'AbortError') return 'MetaApi request timed out.';
  return 'MetaApi request failed.';
}

async function postJson(url, body, headers, timeoutMs) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return { ok: false, error: safeErrorMessage(error) };
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const normalized = normalizeMetaApiResponse(data);
    return {
      ok: false,
      status: response.status,
      normalized,
    };
  }
  return { ok: true, data };
}

function buildOrderPayload(input, accountId) {
  const proposal = input && typeof input.proposal === 'object' ? input.proposal : {};
  const approval = input && typeof input.approval === 'object' ? input.approval : {};
  const assessment = input && typeof input.assessment === 'object' ? input.assessment : {};
  const payload = { accountId };
  const fields = [
    ['symbol', proposal.symbol],
    ['side', proposal.side],
    ['units', proposal.units],
    ['price', proposal.price],
    ['type', proposal.type],
    ['approvalId', approval.id ?? approval.approvalId],
    ['clientOrderId', proposal.clientOrderId ?? approval.clientOrderId],
    ['reason', assessment.reason ?? proposal.reason],
  ];
  for (const [key, value] of fields) {
    if (isScalar(value) && value !== undefined) payload[key] = value;
  }
  return payload;
}

async function placeOrder(input = {}, options = {}) {
  const config = metaApiHttpConfig(options);
  const creds = resolveCredentials(input);
  if (!config.orderUrl || !creds) {
    return blocked('METAAPI_ENDPOINT_NOT_CONFIGURED', 'MetaApi order endpoint or credentials are not configured.');
  }
  const url = resolveUrl(config.orderUrl, creds.accountId);
  if (!url) {
    return blocked('METAAPI_ENDPOINT_NOT_CONFIGURED', 'MetaApi order endpoint or credentials are not configured.');
  }
  const payload = buildOrderPayload(input, creds.accountId);
  const result = await postJson(url, payload, buildHeaders(config, creds.token), config.timeoutMs);
  if (!result.ok) {
    if (result.status) {
      return {
        status: 'blocked',
        code: 'METAAPI_ORDER_REJECTED',
        message: `MetaApi order request failed with status ${result.status}.`,
        ...sanitizeScalarRecord(result.normalized),
      };
    }
    return blocked('METAAPI_REQUEST_FAILED', result.error || 'MetaApi request failed.');
  }
  return normalizeMetaApiResponse(result.data);
}

async function reconcile(input = {}, options = {}) {
  const config = metaApiHttpConfig(options);
  const creds = resolveCredentials(input);
  if (!config.reconcileUrl || !creds) {
    return blocked('METAAPI_ENDPOINT_NOT_CONFIGURED', 'MetaApi reconcile endpoint or credentials are not configured.');
  }
  const url = resolveUrl(config.reconcileUrl, creds.accountId);
  if (!url) {
    return blocked('METAAPI_ENDPOINT_NOT_CONFIGURED', 'MetaApi reconcile endpoint or credentials are not configured.');
  }
  const result = await postJson(url, { accountId: creds.accountId }, buildHeaders(config, creds.token), config.timeoutMs);
  if (!result.ok) {
    if (result.status) {
      return {
        status: 'blocked',
        code: 'METAAPI_RECONCILE_REJECTED',
        message: `MetaApi reconcile request failed with status ${result.status}.`,
        ...sanitizeScalarRecord(result.normalized),
      };
    }
    return blocked('METAAPI_REQUEST_FAILED', result.error || 'MetaApi request failed.');
  }
  const normalized = normalizeMetaApiResponse(result.data);
  if (normalized.reconciledAt == null) normalized.reconciledAt = new Date().toISOString();
  return normalized;
}

const metaApiHttpAdapter = {
  name: 'metaapi-http',
  placeOrder,
  reconcile,
};

export default metaApiHttpAdapter;
