import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createApiClient } from '../shared/api-client.js';

const commands = [
  'help',
  'health',
  'market',
  'watchlist',
  'screener',
  'summary',
  'news',
  'monitor',
  'monitor rules',
  'monitor run',
  'broker',
  'audit logs',
  'audit verify',
  'push status',
  'push send',
  'session status',
  'ai',
  'paper order',
  'paper evaluate',
  'live status',
  'live proposal',
  'live approve',
  'live order',
  'live kill-switch',
  'live reconcile',
];

function kebabToCamel(key) {
  return String(key).replace(/-([a-z0-9])/g, (_, char) => char.toUpperCase());
}

export function parseArgs(argv = []) {
  const parts = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index]);
    if (!token.startsWith('--')) {
      parts.push(token);
      continue;
    }
    const raw = token.slice(2);
    const separator = raw.indexOf('=');
    const key = separator === -1 ? raw : raw.slice(0, separator);
    const name = kebabToCamel(key);
    if (separator !== -1) {
      options[name] = raw.slice(separator + 1);
    } else if (name === 'json' || name === 'pretty' || name === 'help') {
      options[name] = true;
    } else {
      const next = argv[index + 1];
      if (next == null || String(next).startsWith('--')) options[name] = true;
      else { options[name] = next; index += 1; }
    }
  }
  return { command: parts.join(' ').trim(), options };
}

async function loadJson(path) {
  if (!path) throw new Error('Provide a JSON file path.');
  const text = path === '-' ? await readStdin() : await readFile(path, 'utf8');
  return JSON.parse(text);
}

async function readStdin() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

function requireOption(options, name, label) {
  const value = options[name];
  if (value == null || value === true || String(value).trim() === '') {
    throw new Error(`Provide ${label || `--${name}`}.`);
  }
  return value;
}

function requireConfirmation(options, expected) {
  if (String(options.confirm || '') !== expected) throw new Error(`Requires --confirm "${expected}".`);
}

function liveHeaders(options) {
  const token = options.adminToken || process.env.TRADEWALL_LIVE_ADMIN_TOKEN || '';
  if (!String(token).trim()) throw new Error('Provide --admin-token or set TRADEWALL_LIVE_ADMIN_TOKEN.');
  return { 'x-live-admin-token': String(token).trim() };
}

function pushHeaders(options) {
  const token = options.adminToken || options.pushAdminToken || process.env.TRADEWALL_PUSH_ADMIN_TOKEN || '';
  if (!String(token).trim()) throw new Error('Provide --admin-token or set TRADEWALL_PUSH_ADMIN_TOKEN.');
  return { 'x-push-admin-token': String(token).trim() };
}

function asNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a number.`);
  return number;
}

export async function executeCommand(command, options, api, readJson = loadJson) {
  switch (command) {
    case 'help':
    case '':
      return { ok: true, command: 'help', commands };
    case 'health':
      return { ok: true, command, data: await api.health() };
    case 'market':
      return { ok: true, command, data: await api.market() };
    case 'watchlist': {
      const market = await api.market();
      return {
        ok: true,
        command,
        data: (market.items || []).map(item => ({
          symbol: item.symbol,
          name: item.name || item.symbol,
          market: item.market || null,
          price: item.price ?? null,
          changePct: item.changePct ?? null,
        })),
      };
    }
    case 'screener':
      return { ok: true, command, data: await api.screener() };
    case 'summary':
      return { ok: true, command, data: await api.marketSummary() };
    case 'news':
      return { ok: true, command, data: await api.news() };
    case 'monitor':
      return { ok: true, command, data: await api.monitor() };
    case 'monitor rules':
      return { ok: true, command, data: await api.setMonitorRules(await readJson(requireOption(options, 'rulesFile', '--rules-file'))) };
    case 'monitor run':
      return { ok: true, command, data: await api.runMonitor() };
    case 'broker':
      return { ok: true, command, data: await api.brokerStatus() };
    case 'audit logs':
      return {
        ok: true,
        command,
        data: await api.auditLogs({ limit: Number(options.limit) || 50, event: options.event || null }),
      };
    case 'audit verify':
      return { ok: true, command, data: await api.verifyAudit() };
    case 'push status':
      return { ok: true, command, data: await api.pushStatus() };
    case 'push send': {
      requireConfirmation(options, 'SEND PUSH');
      const tokens = options.tokensFile
        ? await readJson(options.tokensFile)
        : String(options.tokens || '').split(',').map(token => token.trim()).filter(Boolean);
      const input = {
        tokens,
        title: options.title || 'TradeWall alert',
        body: requireOption(options, 'body', '--body'),
        data: options.dataFile ? await readJson(options.dataFile) : {},
      };
      return { ok: true, command, data: await api.sendPush(input, pushHeaders(options)) };
    }
    case 'session status':
      return { ok: true, command, data: await api.sessionStatus() };
    case 'ai': {
      const message = requireOption(options, 'message', '--message');
      const context = options.contextFile ? await readJson(options.contextFile) : {};
      return { ok: true, command, data: await api.askAi(message, options.mode || 'chat', context) };
    }
    case 'paper order': {
      requireConfirmation(options, 'EXECUTE PAPER');
      const input = {
        plan: await readJson(requireOption(options, 'planFile', '--plan-file')),
        risk: await readJson(requireOption(options, 'riskFile', '--risk-file')),
        context: await readJson(requireOption(options, 'contextFile', '--context-file')),
        confirmation: 'EXECUTE PAPER',
      };
      return { ok: true, command, data: await api.paperOrder(input) };
    }
    case 'paper evaluate': {
      const order = await readJson(requireOption(options, 'orderFile', '--order-file'));
      const price = asNumber(requireOption(options, 'price', '--price'), '--price');
      return { ok: true, command, data: await api.evaluatePaperOrder({ order, price }) };
    }
    case 'live status':
      return { ok: true, command, data: await api.liveStatus() };
    case 'live proposal': {
      const input = {
        plan: await readJson(requireOption(options, 'planFile', '--plan-file')),
        risk: await readJson(requireOption(options, 'riskFile', '--risk-file')),
        context: await readJson(requireOption(options, 'contextFile', '--context-file')),
        account: await readJson(requireOption(options, 'accountFile', '--account-file')),
      };
      return { ok: true, command, data: await api.liveProposal(input) };
    }
    case 'live approve': {
      requireConfirmation(options, 'APPROVE LIVE');
      const proposalId = requireOption(options, 'proposalId', '--proposal-id');
      const input = { proposalId, confirmation: 'APPROVE LIVE' };
      return { ok: true, command, data: await api.approveLive(input, liveHeaders(options)) };
    }
    case 'live order': {
      requireConfirmation(options, 'EXECUTE LIVE');
      const approval = await readJson(requireOption(options, 'approvalFile', '--approval-file'));
      const input = { approval, confirmation: 'EXECUTE LIVE' };
      return { ok: true, command, data: await api.executeLive(input, liveHeaders(options)) };
    }
    case 'live kill-switch': {
      const enabled = String(requireOption(options, 'enabled', '--enabled')).toLowerCase() === 'true';
      if (!enabled) requireConfirmation(options, 'DISABLE KILL SWITCH');
      const input = { enabled, confirmation: enabled ? '' : 'DISABLE KILL SWITCH' };
      return { ok: true, command, data: await api.setLiveKillSwitch(input, liveHeaders(options)) };
    }
    case 'live reconcile':
      return { ok: true, command, data: await api.reconcileLive({}, liveHeaders(options)) };
    default:
      throw new Error(`Unknown command "${command || ''}". Run help for the command list.`);
  }
}

export function formatOutput(data, options = {}) {
  return JSON.stringify(data, null, options.pretty ? 2 : 0);
}

export async function runCli(argv = [], deps = {}) {
  const { command, options } = parseArgs(argv);
  const output = deps.stdout || console.log;
  try {
    const api = deps.apiClient || createApiClient({
      baseUrl: options.base || options.baseUrl || process.env.TRADEWALL_API_BASE_URL,
    });
    const result = await executeCommand(command, options, api, deps.readJson || loadJson);
    output(formatOutput(result, options));
  } catch (error) {
    output(formatOutput({ ok: false, error: error.message || 'CLI failed' }, options));
    if (deps.setExitCode) deps.setExitCode(1);
    else process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2));
}
