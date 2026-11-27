import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readMetaApiCredentials } from './token-vault.mjs';

const adapterRoot = fileURLToPath(new URL('.', import.meta.url));

function blockedResult(provider, message, code = 'LIVE_PROVIDER_NOT_WIRED') {
  return { provider, status: 'blocked', code, message, liveOnly: true, paperOnly: false };
}

const disabledAdapter = {
  name: 'disabled',
  available: false,
  async placeOrder() {
    return blockedResult('disabled', 'No live broker adapter is wired. Live orders are blocked.');
  },
  async reconcile() {
    return blockedResult('disabled', 'No live broker adapter is wired. Reconciliation is unavailable.');
  },
};

export function sanitizeLiveResult(result, provider) {
  const safe = blockedResult(provider, 'Live adapter returned an invalid response.', 'LIVE_RESULT_INVALID');
  if (!result || typeof result !== 'object') return safe;
  const allowed = ['id', 'orderId', 'status', 'code', 'symbol', 'side', 'price', 'units', 'reason', 'message', 'accepted', 'brokerStatus', 'reconciledAt'];
  for (const key of allowed) {
    const value = result[key];
    if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) safe[key] = value;
  }
  if (Array.isArray(result.orders)) {
    safe.orders = result.orders.slice(0, 200).map(order => sanitizeLiveResult(order, provider));
  }
  return safe;
}

export async function loadLiveAdapter(options = {}) {
  const env = options.env || process.env;
  const requested = String(env.LIVE_ADAPTER || 'disabled').trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,40}$/.test(requested)) {
    return { ...disabledAdapter, name: 'invalid', error: 'LIVE_ADAPTER contains unsupported characters' };
  }
  if (requested === 'disabled') return disabledAdapter;
  try {
    const file = resolve(adapterRoot, 'adapters', `${requested}.mjs`);
    const imported = await import(pathToFileURL(file).href);
    const adapter = imported.default || imported;
    if (typeof adapter.placeOrder !== 'function') {
      return { ...disabledAdapter, name: requested, error: 'Adapter must export placeOrder()' };
    }
    return {
      name: requested,
      available: true,
      placeOrder: adapter.placeOrder,
      reconcile: typeof adapter.reconcile === 'function' ? adapter.reconcile : disabledAdapter.reconcile,
    };
  } catch (error) {
    return { ...disabledAdapter, name: requested, error: String(error.message).slice(0, 160) };
  }
}

export function liveCredentialProvider(options = {}) {
  return () => readMetaApiCredentials(options);
}

export async function placeLiveOrder(input = {}, options = {}) {
  const adapter = await loadLiveAdapter(options);
  const result = await adapter.placeOrder({
    ...input,
    credentials: liveCredentialProvider(options),
  });
  return sanitizeLiveResult(result, adapter.name);
}

export async function reconcileLiveOrders(input = {}, options = {}) {
  const adapter = await loadLiveAdapter(options);
  const result = await adapter.reconcile({
    ...input,
    credentials: liveCredentialProvider(options),
  });
  return sanitizeLiveResult(result, adapter.name);
}
