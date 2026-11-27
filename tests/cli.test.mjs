import test from 'node:test';
import assert from 'node:assert/strict';
import { executeCommand, formatOutput, parseArgs } from '../cli/tradewall.mjs';

function fakeApi() {
  const calls = [];
  const record = name => async (...args) => {
    calls.push({ name, args });
    return { name };
  };
  return {
    calls,
    health: record('health'),
    market: record('market'),
    news: record('news'),
    monitor: record('monitor'),
    setMonitorRules: record('setMonitorRules'),
    runMonitor: record('runMonitor'),
    brokerStatus: record('brokerStatus'),
    auditLogs: record('auditLogs'),
    verifyAudit: record('verifyAudit'),
    askAi: record('askAi'),
    paperOrder: record('paperOrder'),
    evaluatePaperOrder: record('evaluatePaperOrder'),
    liveStatus: record('liveStatus'),
    liveProposal: record('liveProposal'),
    approveLive: record('approveLive'),
    executeLive: record('executeLive'),
    setLiveKillSwitch: record('setLiveKillSwitch'),
    reconcileLive: record('reconcileLive'),
  };
}

const readJson = async path => ({ path, symbol: 'XAU/USD', price: 2400 });

test('parseArgs separates commands and options', () => {
  assert.deepEqual(
    parseArgs(['live', 'approve', '--proposal-id', 'live-1', '--confirm=APPROVE LIVE', '--admin-token=secret', '--json', '--pretty']),
    {
      command: 'live approve',
      options: {
        proposalId: 'live-1',
        confirm: 'APPROVE LIVE',
        adminToken: 'secret',
        json: true,
        pretty: true,
      },
    },
  );
});

test('CLI exposes read-only commands as machine-readable output', async () => {
  const api = fakeApi();
  const commands = ['health', 'market', 'watchlist', 'news', 'monitor', 'broker', 'audit verify'];
  for (const command of commands) {
    const result = await executeCommand(command, {}, api, readJson);
    assert.equal(result.ok, true);
    assert.equal(result.command, command);
  }
  const audit = await executeCommand('audit logs', { limit: '20', event: 'paper_order_simulated' }, api, readJson);
  assert.deepEqual(audit.data, { name: 'auditLogs' });
  assert.deepEqual(api.calls.at(-1), { name: 'auditLogs', args: [{ limit: 20, event: 'paper_order_simulated' }] });
  assert.equal(formatOutput({ ok: true }, {}), '{"ok":true}');
  assert.match(formatOutput({ ok: true }, { pretty: true }), /\n/);
});

test('CLI requires exact confirmations and admin token for writes', async () => {
  const api = fakeApi();
  await assert.rejects(() => executeCommand('paper order', {}, api, readJson), /EXECUTE PAPER/);
  await assert.rejects(() => executeCommand('live approve', { proposalId: 'live-1', confirm: 'APPROVE LIVE' }, api, readJson), /admin-token/);
  await assert.rejects(() => executeCommand('live order', { approvalFile: 'approval.json', adminToken: 'secret', confirm: 'EXECUTE LIVE' }, api, async () => { throw new Error('bad file'); }), /bad file/);
  await assert.rejects(() => executeCommand('live kill-switch', { adminToken: 'secret', enabled: 'false' }, api, readJson), /DISABLE KILL SWITCH/);
  await assert.rejects(() => executeCommand('unknown', {}, api, readJson), /Unknown command/);
});

test('CLI sends guarded live commands with confirmation and admin header', async () => {
  const api = fakeApi();
  const approval = await executeCommand('live approve', {
    proposalId: 'live-1',
    confirm: 'APPROVE LIVE',
    adminToken: 'secret',
  }, api, readJson);
  assert.equal(approval.ok, true);
  assert.deepEqual(api.calls.at(-1), {
    name: 'approveLive',
    args: [
      { proposalId: 'live-1', confirmation: 'APPROVE LIVE' },
      { 'x-live-admin-token': 'secret' },
    ],
  });

  await executeCommand('live order', {
    approvalFile: 'approval.json',
    confirm: 'EXECUTE LIVE',
    adminToken: 'secret',
  }, api, readJson);
  assert.equal(api.calls.at(-1).args[0].approval.path, 'approval.json');

  await executeCommand('live kill-switch', { enabled: 'true', adminToken: 'secret' }, api, readJson);
  assert.deepEqual(api.calls.at(-1).args, [
    { enabled: true, confirmation: '' },
    { 'x-live-admin-token': 'secret' },
  ]);

  await executeCommand('live reconcile', { adminToken: 'secret' }, api, readJson);
  assert.equal(api.calls.at(-1).name, 'reconcileLive');
});
