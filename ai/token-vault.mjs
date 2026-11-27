import { createHash } from 'node:crypto';

function text(value) {
  return String(value || '').trim();
}

export function tokenVaultStatus(options = {}) {
  const env = options.env || process.env;
  const token = text(env.METAAPI_TOKEN);
  const accountId = text(env.METAAPI_ACCOUNT_ID);
  return {
    provider: token && accountId ? 'metaapi' : 'unconfigured',
    tokenConfigured: !!token,
    accountConfigured: !!accountId,
    configured: !!(token && accountId),
    accountFingerprint: accountId ? createHash('sha256').update(accountId).digest('hex').slice(0, 12) : null,
    secretSource: 'server_environment',
    exposedToBrowser: false,
  };
}

export function readMetaApiCredentials(options = {}) {
  const env = options.env || process.env;
  const token = text(env.METAAPI_TOKEN);
  const accountId = text(env.METAAPI_ACCOUNT_ID);
  if (!token || !accountId) throw new Error('MetaApi credentials are not configured on the server.');
  return { token, accountId };
}
