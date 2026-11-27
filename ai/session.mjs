import { createHmac, timingSafeEqual } from 'node:crypto';

function text(value) {
  return String(value || '').trim();
}

function bool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return !['false', '0', 'no', 'off'].includes(text(value).toLowerCase());
}

function scalar(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return '';
}

function positiveSeconds(value, fallback, min, max) {
  if (value === undefined || value === null || text(value) === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function configValues(options = {}) {
  const env = options.env || process.env;
  const supabaseUrl = text(env.SUPABASE_URL).replace(/\/+$/, '');
  const anonKey = text(env.SUPABASE_ANON_KEY);
  const secret = text(env.SESSION_COOKIE_SECRET);
  return {
    supabaseUrl,
    anonKey,
    secret,
    cookieName: text(env.SESSION_COOKIE_NAME) || 'tradewall_session',
    secure: bool(env.SESSION_SECURE, true),
    ttlSeconds: positiveSeconds(env.SESSION_TTL_SECONDS, 3600, 300, 86400),
  };
}

function cookieName(values) {
  return values.secure && !values.cookieName.startsWith('__Host-') ? `__Host-${values.cookieName}` : values.cookieName;
}

function signature(data, secret) {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

function equalSignature(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function withExp(payload, ttlSeconds) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const exp = Number(source.exp);
  return {
    ...source,
    exp: Number.isFinite(exp) ? Math.floor(exp) : Math.floor(Date.now() / 1000) + ttlSeconds,
  };
}

const sensitiveKeys = new Set(['apikey', 'authorization', 'password', 'secret', 'sessioncookiesecret', 'cookiesecret']);

function sanitizeData(value, depth = 0) {
  if (depth > 8) return null;
  if (Array.isArray(value)) return value.map(item => sanitizeData(item, depth + 1));
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      const cleanKey = key.toLowerCase().replace(/[^a-z]/g, '');
      if (sensitiveKeys.has(cleanKey)) continue;
      result[key] = sanitizeData(item, depth + 1);
    }
    return result;
  }
  return value;
}

function invalidCredentials() {
  return { ok: false, status: 400, data: { message: 'invalid_credentials' } };
}

function validCredentials(email, password) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(email)) && text(password).length > 0;
}

export function sessionConfig(options = {}) {
  const values = configValues(options);
  return {
    supabaseUrl: values.supabaseUrl,
    cookieName: cookieName(values),
    secure: values.secure,
    ttlSeconds: values.ttlSeconds,
    configured: !!(values.supabaseUrl && values.anonKey && values.secret),
  };
}

export function signSession(payload, secret) {
  if (!secret) throw new Error('SESSION_COOKIE_SECRET is not configured on the server.');
  const body = Buffer.from(JSON.stringify(payload || {})).toString('base64url');
  return `${body}.${signature(body, secret)}`;
}

export function verifySession(token, secret) {
  if (!secret || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  if (!equalSignature(parts[1], signature(parts[0], secret))) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookieHeader(header) {
  const cookies = {};
  if (typeof header !== 'string') return cookies;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    if (!name) continue;
    let value = part.slice(separator + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

export function serializeSessionCookie(payload, options = {}) {
  const values = configValues(options);
  if (!values.secret) throw new Error('SESSION_COOKIE_SECRET is not configured on the server.');
  const token = signSession(withExp(payload, values.ttlSeconds), values.secret);
  const parts = [
    `${cookieName(values)}=${token}`,
    `Max-Age=${values.ttlSeconds}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (values.secure) parts.push('Secure');
  return parts.join('; ');
}

export function serializeClearedCookie(options = {}) {
  const values = configValues(options);
  const parts = [
    `${cookieName(values)}=`,
    'Max-Age=0',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (values.secure) parts.push('Secure');
  return parts.join('; ');
}

export async function supabaseAuthRequest(path, { method = 'POST', body, accessToken } = {}, options = {}) {
  const values = configValues(options);
  if (!values.supabaseUrl || !values.anonKey) {
    return { ok: false, status: 503, data: { message: 'auth_unconfigured' } };
  }
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    return { ok: false, status: 502, data: { message: 'auth_request_failed' } };
  }
  try {
    const response = await fetchImpl(`${values.supabaseUrl}/auth/v1${path}`, {
      method,
      headers: {
        apikey: values.anonKey,
        Authorization: `Bearer ${accessToken ? text(accessToken) : values.anonKey}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    let data;
    try {
      data = typeof response.json === 'function'
        ? await response.json()
        : JSON.parse(await response.text());
    } catch {
      data = { message: 'invalid_response' };
    }
    const status = Number(response.status) || 502;
    const ok = typeof response.ok === 'boolean' ? response.ok : status >= 200 && status < 300;
    return { ok, status, data: sanitizeData(data) };
  } catch {
    return { ok: false, status: 502, data: { message: 'auth_request_failed' } };
  }
}

export async function signInWithPassword({ email, password } = {}, options = {}) {
  if (!validCredentials(email, password)) return invalidCredentials();
  return supabaseAuthRequest('/token?grant_type=password', {
    method: 'POST',
    body: { email: text(email), password: text(password) },
  }, options);
}

export async function signUpWithPassword({ email, password } = {}, options = {}) {
  if (!validCredentials(email, password)) return invalidCredentials();
  return supabaseAuthRequest('/signup', {
    method: 'POST',
    body: { email: text(email), password: text(password) },
  }, options);
}

export async function refreshSession({ refresh_token: refreshToken } = {}, options = {}) {
  if (!text(refreshToken)) return invalidCredentials();
  return supabaseAuthRequest('/token?grant_type=refresh_token', {
    method: 'POST',
    body: { refresh_token: text(refreshToken) },
  }, options);
}

export async function signOutSession({ accessToken } = {}, options = {}) {
  if (!text(accessToken)) return invalidCredentials();
  return supabaseAuthRequest('/logout', { method: 'POST', accessToken }, options);
}

export async function getSessionUser({ accessToken } = {}, options = {}) {
  if (!text(accessToken)) return invalidCredentials();
  return supabaseAuthRequest('/user', { method: 'GET', accessToken }, options);
}

export function createSessionPayload(authData, options = {}) {
  const values = configValues(options);
  const seconds = positiveSeconds(authData?.expires_in, values.ttlSeconds, 1, 86400);
  const exp = Math.floor(Date.now() / 1000) + seconds;
  return {
    access_token: scalar(authData?.access_token),
    refresh_token: scalar(authData?.refresh_token),
    expires_at: exp,
    user_id: scalar(authData?.user?.id ?? authData?.user_id),
    email: scalar(authData?.user?.email ?? authData?.email),
    exp,
  };
}
