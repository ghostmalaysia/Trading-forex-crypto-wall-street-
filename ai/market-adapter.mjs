function readEnv(env, name) {
  return env[name] == null ? '' : String(env[name]).trim();
}

export function marketAdapterConfig(options = {}) {
  const env = options.env || process.env;
  const adapter = readEnv(env, 'MARKET_DATA_ADAPTER') || 'indicative';
  const endpoint = readEnv(env, 'MARKET_DATA_ENDPOINT');
  const apiKey = readEnv(env, 'MARKET_DATA_API_KEY');
  const keyHeader = readEnv(env, 'MARKET_DATA_API_KEY_HEADER') || 'Authorization';
  const authScheme = env.MARKET_DATA_AUTH_SCHEME == null ? 'Bearer' : readEnv(env, 'MARKET_DATA_AUTH_SCHEME');
  const timeoutInput = Number(readEnv(env, 'MARKET_DATA_TIMEOUT_MS') || 8000);
  const timeoutMs = Math.min(30000, Math.max(1000, Number.isFinite(timeoutInput) ? timeoutInput : 8000));
  return {
    adapter,
    endpoint,
    apiKey,
    keyHeader,
    authScheme,
    timeoutMs,
    configured: adapter === 'licensed' && Boolean(endpoint && apiKey),
  };
}

export function isLicensedAdapter(options = {}) {
  return marketAdapterConfig(options).adapter === 'licensed';
}

export function buildMarketUrl(target, config) {
  const endpoint = String(config?.endpoint || '');
  const providerSymbol = String(target?.providerSymbol ?? target?.symbol ?? '');
  const symbol = String(target?.symbol ?? '');
  return endpoint
    .replaceAll('{providerSymbol}', encodeURIComponent(providerSymbol))
    .replaceAll('{symbol}', encodeURIComponent(symbol));
}

function rounded(value) {
  return +value.toFixed(value > 100 ? 2 : 5);
}

function positiveNumbers(values) {
  if (!Array.isArray(values)) return [];
  return values.map(Number).filter(value => Number.isFinite(value) && value > 0).slice(-60);
}

export function normalizeMarketItem(symbol, target, payload) {
  const meta = payload?.meta && typeof payload.meta === 'object' ? payload.meta : null;
  const nested = meta || payload?.indicators;
  const close = nested ? payload?.indicators?.quote?.[0]?.close : payload?.series;
  const rawPrice = nested ? meta?.regularMarketPrice ?? meta?.price ?? close?.[close.length - 1] : payload?.price;
  const price = Number(rawPrice);
  if (!Number.isFinite(price) || price <= 0) throw new Error('Market feed returned no usable price');
  const rawPreviousClose = nested
    ? meta?.chartPreviousClose ?? meta?.previousClose ?? close?.[close.length - 2]
    : payload?.previousClose;
  const previousClose = Number(rawPreviousClose);
  return {
    symbol,
    providerSymbol: target?.providerSymbol ?? symbol,
    label: target?.label ?? null,
    price: rounded(price),
    previousClose: Number.isFinite(previousClose) && previousClose > 0 ? rounded(previousClose) : null,
    series: positiveNumbers(close),
    currency: (nested ? meta?.currency : payload?.currency) || null,
    exchange: (nested ? meta?.exchange ?? meta?.exchangeName : payload?.exchange) || null,
  };
}

export async function fetchLicensedMarketTarget(symbol, target, options = {}) {
  const config = marketAdapterConfig(options);
  if (config.adapter !== 'licensed' || !config.configured) {
    throw new Error('Licensed market adapter is not configured');
  }
  const url = buildMarketUrl(target, config);
  const authorization = config.authScheme ? `${config.authScheme} ${config.apiKey}` : config.apiKey;
  const response = await fetch(url, {
    headers: { [config.keyHeader]: authorization, Accept: 'application/json' },
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  if (!response.ok) throw new Error(`Market adapter HTTP ${response.status}`);
  const payload = await response.json();
  return normalizeMarketItem(symbol, target, payload);
}
