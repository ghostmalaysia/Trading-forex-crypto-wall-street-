import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { createApiClient } from '../shared/api-client.js';
import { FOCUS } from '../shared/feed-data.js';
import { createMobileSupabaseClient } from './supabase-client.js';
import { readJson, removeJson, writeJson } from './storage.js';
import { ensureNotificationPermission, getExpoPushToken, notifyAlert } from './notifications.js';
import { fmt } from './format.js';
import DashboardScreen from './screens/DashboardScreen.js';
import WatchlistScreen from './screens/WatchlistScreen.js';
import NewsScreen from './screens/NewsScreen.js';
import AiScreen from './screens/AiScreen.js';
import AgentScreen from './screens/AgentScreen.js';
import SettingsScreen from './screens/SettingsScreen.js';

const apiBaseKey = 'tradewall_mobile_api_base';
const watchlistKey = 'tradewall_mobile_watchlist';
const selectedKey = 'tradewall_mobile_selected';
const messagesKey = 'tradewall_mobile_chat';
const alertsKey = 'tradewall_mobile_alert_rules';
const firedKey = 'tradewall_mobile_fired_alerts';
const pushTokenKey = 'tradewall_mobile_push_token';

const tabs = [
  { key: 'dashboard', label: 'DASH' },
  { key: 'watchlist', label: 'WATCH' },
  { key: 'news', label: 'NEWS' },
  { key: 'ai', label: 'AI' },
  { key: 'agent', label: 'AGENT' },
  { key: 'settings', label: 'SET' },
];

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [apiBase, setApiBase] = useState(process.env.EXPO_PUBLIC_API_BASE_URL || 'http://10.0.2.2:8080');
  const apiClient = useMemo(() => createApiClient({ baseUrl: apiBase }), [apiBase]);
  const cloud = useMemo(() => createMobileSupabaseClient({
    storage: {
      readJson: (key, fallback) => readJson(key, fallback),
      writeJson: (key, value) => writeJson(key, value),
      removeJson: (key) => removeJson(key),
    },
  }), []);
  const [cloudState, setCloudState] = useState({ configured: false, signedIn: false, userKey: null, url: null });
  const [health, setHealth] = useState(null);
  const [market, setMarket] = useState(null);
  const [feed, setFeed] = useState(null);
  const [plan, setPlan] = useState(null);
  const [marketSummary, setMarketSummary] = useState(null);
  const [agentMonitor, setAgentMonitor] = useState(null);
  const [broker, setBroker] = useState(null);
  const [agentBacktest, setAgentBacktest] = useState(null);
  const [paperOrders, setPaperOrders] = useState([]);
  const [paperConfirm, setPaperConfirm] = useState('');
  const [liveStatus, setLiveStatus] = useState(null);
  const [liveProposal, setLiveProposal] = useState(null);
  const [liveApproval, setLiveApproval] = useState(null);
  const [liveResult, setLiveResult] = useState(null);
  const [liveEvents, setLiveEvents] = useState([]);
  const [auditVerify, setAuditVerify] = useState(null);
  const [auditLogs, setAuditLogs] = useState(null);
  const [auditEvent, setAuditEvent] = useState('');
  const [auditLimit, setAuditLimit] = useState('50');
  const [liveAdminToken, setLiveAdminToken] = useState('');
  const [liveApproveConfirm, setLiveApproveConfirm] = useState('');
  const [liveExecuteConfirm, setLiveExecuteConfirm] = useState('');
  const [liveDisarmConfirm, setLiveDisarmConfirm] = useState('');
  const liveHeaders = useMemo(() => ({ 'x-live-admin-token': liveAdminToken.trim() }), [liveAdminToken]);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('Bina cadangan paper trading untuk XAU/USD.');
  const [watchlist, setWatchlist] = useState([]);
  const [selected, setSelected] = useState('XAU/USD');
  const [alertRules, setAlertRules] = useState([]);
  const [alertRule, setAlertRule] = useState({ symbol: 'XAU/USD', condition: '>=', threshold: '' });
  const [notificationReady, setNotificationReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const firedRef = useRef({});

  const run = useCallback(async (action) => {
    setError('');
    try { await action(); }
    catch (requestError) { setError(requestError.message || 'Unexpected error'); }
  }, []);

  const syncCloudState = useCallback(() => {
    setCloudState({ ...cloud.getState(), url: cloud.getPublicConfig().url });
  }, [cloud]);

  const loadAgentCloud = useCallback(async () => {
    if (!cloudState.signedIn) return;
    const [orders, events] = await Promise.all([
      cloud.loadPaperOrders(20),
      cloud.loadLiveEvents(20),
    ]);
    setPaperOrders(Array.isArray(orders.data) ? orders.data : []);
    setLiveEvents(Array.isArray(events.data) ? events.data : []);
  }, [cloud, cloudState.signedIn]);

  const checkAlerts = useCallback(async (snapshot) => {
    const items = snapshot?.items || [];
    for (const rule of alertRules) {
      const item = items.find(entry => entry.symbol === rule.symbol);
      if (!item || !Number.isFinite(rule.threshold)) continue;
      const triggered = rule.condition === '>=' ? item.price >= rule.threshold : item.price <= rule.threshold;
      const key = `${rule.symbol}|${rule.condition}|${rule.threshold}`;
      if (!triggered || firedRef.current[key]) continue;
      firedRef.current[key] = true;
      await writeJson(firedKey, firedRef.current);
      await notifyAlert(`${rule.symbol} alert`, `${rule.symbol} ${rule.condition} ${fmt(rule.threshold)} — price ${fmt(item.price)}. Paper only.`);
    }
  }, [alertRules]);

  const refreshAll = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [nextHealth, nextMarket, nextFeed, nextMonitor, nextBroker, nextLiveStatus, nextAuditLogs] = await Promise.all([
        apiClient.health(),
        apiClient.market(),
        apiClient.news(),
        apiClient.monitor(),
        apiClient.brokerStatus(),
        apiClient.liveStatus(),
        apiClient.auditLogs({ limit: Number(auditLimit) || 50, event: auditEvent.trim() || null }),
      ]);
      setHealth(nextHealth);
      setMarket(nextMarket);
      setFeed(nextFeed);
      setAgentMonitor(nextMonitor);
      setBroker(nextBroker);
      setLiveStatus(nextLiveStatus);
      setAuditLogs(nextAuditLogs);
      await checkAlerts(nextMarket);
    } catch (requestError) {
      setError(requestError.message || 'Cannot reach the server');
    } finally {
      setBusy(false);
    }
  }, [apiClient, auditEvent, auditLimit, checkAlerts]);

  useEffect(() => {
    let active = true;
    (async () => {
      const [savedBase, savedWatchlist, savedSelected, savedMessages, savedRules, savedFired] = await Promise.all([
        readJson(apiBaseKey, null),
        readJson(watchlistKey, []),
        readJson(selectedKey, 'XAU/USD'),
        readJson(messagesKey, []),
        readJson(alertsKey, []),
        readJson(firedKey, {}),
      ]);
      if (!active) return;
      if (savedBase) setApiBase(savedBase);
      if (Array.isArray(savedWatchlist)) setWatchlist(savedWatchlist);
      if (typeof savedSelected === 'string') setSelected(savedSelected);
      if (Array.isArray(savedMessages)) setMessages(savedMessages);
      if (Array.isArray(savedRules)) setAlertRules(savedRules);
      firedRef.current = savedFired && typeof savedFired === 'object' ? savedFired : {};

      const state = await cloud.init();
      if (!active) return;
      setCloudState({ ...state, url: cloud.getPublicConfig().url });
      if (!state.signedIn) return;
      try {
        const [settings, list, chat] = await Promise.all([
          cloud.loadSettings(),
          cloud.loadWatchlist(),
          cloud.loadChat(20),
        ]);
        if (!active) return;
        const defaultSymbol = settings.preferences?.default_symbol;
        if (FOCUS.includes(defaultSymbol)) setSelected(defaultSymbol);
        if (Array.isArray(list.data) && list.data.length) setWatchlist(list.data);
        if (Array.isArray(chat.data) && chat.data.length) setMessages(chat.data);
      } catch {}
    })();
    return () => { active = false; };
  }, [cloud]);

  useEffect(() => { writeJson(apiBaseKey, apiBase); }, [apiBase]);
  useEffect(() => { writeJson(watchlistKey, watchlist); }, [watchlist]);
  useEffect(() => { writeJson(selectedKey, selected); }, [selected]);
  useEffect(() => { writeJson(messagesKey, messages); }, [messages]);
  useEffect(() => { writeJson(alertsKey, alertRules); }, [alertRules]);
  useEffect(() => { refreshAll(); }, [refreshAll]);
  useEffect(() => {
    loadAgentCloud().catch(() => {});
  }, [loadAgentCloud]);

  function buildContext() {
    const item = market?.items?.find(entry => entry.symbol === selected) || market?.items?.[0];
    if (!item) return null;
    return {
      selected: item.symbol,
      market: item.label,
      timeframe: '1D',
      dataSource: market.provider === 'mock' ? 'mock' : 'market',
      chart: { symbol: item.symbol, series: item.series || [] },
      history: messages.slice(-10).map(({ role, content }) => ({ role, content })),
      preferences: { paperEquity: 10000 },
      risk: { dailyLossPct: 0, openPositions: 0 },
    };
  }

  const askAi = useCallback(async (mode, override) => {
    const context = buildContext();
    if (!context) { setError('Market data is not ready yet.'); return; }
    const message = String(override ?? question).trim()
      || (mode === 'plan' ? 'Bina cadangan paper trading untuk simbol ini.' : 'Analisis keadaan semasa.');
    setBusy(true);
    setError('');
    try {
      setMessages(previous => [...previous, { role: 'user', content: message }]);
      if (cloudState.signedIn) cloud.saveChat('user', message).catch(() => {});
      const result = await apiClient.askAi(message, mode, context);
      setMessages(previous => [...previous, { role: 'ai', content: result.reply }]);
      if (mode === 'plan') setPlan(result);
      if (cloudState.signedIn) cloud.saveChat('ai', result.reply).catch(() => {});
    } catch (requestError) {
      setError(requestError.message || 'AI request failed');
    } finally {
      setBusy(false);
    }
  }, [apiClient, cloud, cloudState.signedIn, market, messages, question, selected]);

  const handlePlan = useCallback(() => {
    setTab('ai');
    askAi('plan', 'Bina cadangan paper trading untuk simbol ini.');
  }, [askAi]);

  const handleMarketSummary = useCallback(() => run(async () => {
    setMarketSummary(await apiClient.marketSummary());
  }), [apiClient, run]);

  const handleRunMonitor = useCallback(() => run(async () => {
    setAgentMonitor(await apiClient.runMonitor());
  }), [apiClient, run]);

  const handleBacktest = useCallback(() => run(async () => {
    const item = market?.items?.find(entry => entry.symbol === selected) || market?.items?.[0];
    const series = (item?.series || []).map(Number).filter(Number.isFinite);
    setAgentBacktest(await apiClient.backtest({ symbol: selected, series, fast: 20, slow: 50, feePct: 0.05 }));
  }), [apiClient, market, run, selected]);

  const handleExecutePaper = useCallback(() => run(async () => {
    const context = buildContext();
    if (!context) throw new Error('Market data is not ready yet.');
    if (!plan || plan.risk?.decision !== 'pending_human_approval' || !plan.risk?.eligible) {
      throw new Error('Generate and approve a paper plan in AI first.');
    }
    const order = await apiClient.paperOrder({
      plan: { ...plan.plan, symbol: selected },
      risk: plan.risk,
      context,
      confirmation: paperConfirm,
    });
    const evaluation = await apiClient.evaluatePaperOrder({ order, price: context.price });
    setPaperOrders(previous => [order, evaluation, ...previous].slice(0, 30));
    setPaperConfirm('');
    if (cloudState.signedIn) {
      cloud.savePaperOrder(order).catch(() => {});
      cloud.saveEvaluation(evaluation).catch(() => {});
    }
  }), [apiClient, buildContext, cloud, cloudState.signedIn, paperConfirm, plan, run, selected]);

  const persistLiveEvent = useCallback((event) => {
    if (cloudState.signedIn) cloud.saveLiveEvent(event).catch(() => {});
  }, [cloud, cloudState.signedIn]);

  const handleStageLive = useCallback(() => run(async () => {
    const context = buildContext();
    if (!context) throw new Error('Market data is not ready yet.');
    if (!plan || plan.risk?.decision !== 'pending_human_approval' || !plan.risk?.eligible) {
      throw new Error('Generate and approve a paper plan in AI first.');
    }
    const proposal = await apiClient.liveProposal({
      plan: { ...plan.plan, symbol: selected },
      risk: plan.risk,
      context: { ...context, quotedAt: new Date().toISOString(), spreadPct: 0.02 },
      account: { equity: 10000, dailyLossPct: 0, openPositions: 0 },
    });
    setLiveProposal(proposal);
    setLiveApproval(null);
    setLiveResult(null);
    persistLiveEvent({ event: 'live_proposal_staged', proposalId: proposal.id, status: proposal.decision, symbol: proposal.symbol });
    setLiveStatus(await apiClient.liveStatus());
  }), [apiClient, buildContext, persistLiveEvent, plan, run, selected]);

  const handleApproveLive = useCallback(() => run(async () => {
    if (!liveProposal) throw new Error('Stage a live proposal first.');
    const approval = await apiClient.approveLive({
      proposalId: liveProposal.id,
      confirmation: liveApproveConfirm,
    }, liveHeaders);
    setLiveApproval(approval);
    setLiveApproveConfirm('');
    persistLiveEvent({ event: 'live_approval_requested', proposalId: approval.proposalId, approvalId: approval.id, status: approval.status });
  }), [apiClient, liveApproveConfirm, liveHeaders, liveProposal, persistLiveEvent, run]);

  const handleExecuteLive = useCallback(() => run(async () => {
    if (!liveApproval) throw new Error('Approve the staged proposal first.');
    const result = await apiClient.executeLive({
      approval: liveApproval,
      confirmation: liveExecuteConfirm,
    }, liveHeaders);
    setLiveResult(result);
    setLiveApproval(null);
    setLiveExecuteConfirm('');
    persistLiveEvent({
      event: 'live_order_attempt',
      proposalId: liveProposal?.id || null,
      orderId: result.id || result.orderId || null,
      status: result.status,
      code: result.code || null,
    });
    setLiveStatus(await apiClient.liveStatus());
  }), [apiClient, liveApproval, liveExecuteConfirm, liveHeaders, liveProposal, persistLiveEvent, run]);

  const handleKillLive = useCallback(() => run(async () => {
    const status = await apiClient.setLiveKillSwitch({ enabled: true }, liveHeaders);
    setLiveStatus(status);
    setLiveApproval(null);
    persistLiveEvent({ event: 'live_kill_switch_armed', status: 'armed' });
  }), [apiClient, liveHeaders, persistLiveEvent, run]);

  const handleDisarmLive = useCallback(() => run(async () => {
    const status = await apiClient.setLiveKillSwitch({
      enabled: false,
      confirmation: liveDisarmConfirm,
    }, liveHeaders);
    setLiveStatus(status);
    setLiveDisarmConfirm('');
    persistLiveEvent({ event: 'live_kill_switch_disarmed', status: 'disarmed' });
  }), [apiClient, liveDisarmConfirm, liveHeaders, persistLiveEvent, run]);

  const handleReconcileLive = useCallback(() => run(async () => {
    const result = await apiClient.reconcileLive({}, liveHeaders);
    setLiveResult(result);
    persistLiveEvent({ event: 'live_reconciliation', status: result.status, code: result.code || null });
    setLiveStatus(await apiClient.liveStatus());
  }), [apiClient, liveHeaders, persistLiveEvent, run]);

  const handleVerifyAudit = useCallback(() => run(async () => {
    setAuditVerify(await apiClient.verifyAudit());
  }), [apiClient, run]);

  const handleLoadAuditLogs = useCallback(() => run(async () => {
    setAuditLogs(await apiClient.auditLogs({
      limit: Number(auditLimit) || 50,
      event: auditEvent.trim() || null,
    }));
  }), [apiClient, auditEvent, auditLimit, run]);

  const handleSelectSymbol = useCallback((symbol) => {
    setSelected(symbol);
    if (cloudState.signedIn) cloud.saveSettings({ theme: 'dark', default_symbol: symbol }).catch(() => {});
  }, [cloud, cloudState.signedIn]);

  const handleToggleWatchlist = useCallback((item) => {
    const next = watchlist.some(entry => entry.symbol === item.symbol)
      ? watchlist.filter(entry => entry.symbol !== item.symbol)
      : [...watchlist, item];
    setWatchlist(next);
    if (cloudState.signedIn) cloud.saveWatchlist(next).catch(() => {});
  }, [cloud, cloudState.signedIn, watchlist]);

  const handleSyncCloud = useCallback(() => run(async () => {
    await cloud.saveWatchlist(watchlist);
    await cloud.saveSettings({ theme: 'dark', default_symbol: selected });
  }), [cloud, run, selected, watchlist]);

  const handleConfigureCloud = useCallback((url, anonKey) => run(async () => {
    const ok = await cloud.configure(url, anonKey);
    if (!ok) throw new Error('Enter a valid HTTPS URL and publishable/anon key.');
    syncCloudState();
  }), [cloud, run, syncCloudState]);

  const handleTestCloud = useCallback(() => run(async () => {
    const result = await cloud.testConnection();
    setError(`Supabase OK · email ${result.emailAuthEnabled ? 'on' : 'off'}`);
  }), [cloud, run]);

  const handleSignIn = useCallback((email, password) => run(async () => {
    await cloud.signIn(email, password);
    syncCloudState();
    const pushToken = await readJson(pushTokenKey, null);
    if (pushToken) cloud.savePushToken(pushToken).catch(() => {});
    const [settings, list, chat] = await Promise.all([
      cloud.loadSettings(),
      cloud.loadWatchlist(),
      cloud.loadChat(20),
    ]);
    if (FOCUS.includes(settings.preferences?.default_symbol)) setSelected(settings.preferences.default_symbol);
    if (Array.isArray(list.data) && list.data.length) setWatchlist(list.data);
    if (Array.isArray(chat.data) && chat.data.length) setMessages(chat.data);
    await loadAgentCloud();
  }), [cloud, loadAgentCloud, run, syncCloudState]);

  const handleSignUp = handleSignIn;

  const handleSignOut = useCallback(() => run(async () => {
    await cloud.signOut();
    setPaperOrders([]);
    setLiveEvents([]);
    setLiveProposal(null);
    setLiveApproval(null);
    setLiveResult(null);
    setAuditLogs(null);
    setLiveAdminToken('');
    setLiveApproveConfirm('');
    setLiveExecuteConfirm('');
    setLiveDisarmConfirm('');
    syncCloudState();
  }), [cloud, run, syncCloudState]);

  const handleEnableNotifications = useCallback(() => run(async () => {
    const granted = await ensureNotificationPermission();
    setNotificationReady(granted);
    if (!granted) throw new Error('Notification permission was denied.');
    const token = await getExpoPushToken();
    if (!token) return;
    await writeJson(pushTokenKey, token);
    if (cloudState.signedIn) await cloud.savePushToken(token);
  }), [cloud, cloudState.signedIn, run]);

  const handleSaveAlert = useCallback(() => run(async () => {
    const symbol = String(alertRule.symbol || '').trim().toUpperCase();
    const condition = alertRule.condition === '<=' ? '<=' : '>=';
    const threshold = Number(alertRule.threshold);
    if (!FOCUS.includes(symbol) || !Number.isFinite(threshold) || threshold <= 0) {
      throw new Error('Use XAU/USD or DXY with a positive threshold.');
    }
    const next = { symbol, condition, threshold };
    setAlertRules(previous => [...previous.filter(rule => rule.symbol !== symbol), next]);
    delete firedRef.current[`${symbol}|${condition}|${threshold}`];
    await writeJson(firedKey, firedRef.current);
    setAlertRule({ symbol, condition, threshold: '' });
    setError('Alert saved. Enable notifications in Settings to receive it.');
  }), [alertRule, run]);

  let screen = null;
  if (tab === 'dashboard') {
    screen = (
      <DashboardScreen
        health={health}
        market={market}
        plan={plan}
        alerts={alertRules}
        busy={busy}
        error={error}
        onRefresh={refreshAll}
        onPlan={handlePlan}
        onSymbol={handleSelectSymbol}
        symbol={selected}
      />
    );
  } else if (tab === 'watchlist') {
    screen = (
      <WatchlistScreen
        watchlist={watchlist}
        market={market}
        selected={selected}
        onToggle={handleToggleWatchlist}
        onSelect={handleSelectSymbol}
        cloudState={cloudState}
        onSync={handleSyncCloud}
        error={error}
      />
    );
  } else if (tab === 'news') {
    screen = <NewsScreen feed={feed} busy={busy} onRefresh={refreshAll} error={error} />;
  } else if (tab === 'ai') {
    screen = (
      <AiScreen
        messages={messages}
        question={question}
        setQuestion={setQuestion}
        busy={busy}
        error={error}
        onAsk={askAi}
        onPlan={handlePlan}
        plan={plan}
        summary={marketSummary}
        onSummary={handleMarketSummary}
        onClear={() => setMessages([])}
      />
    );
  } else if (tab === 'agent') {
    screen = (
      <AgentScreen
        monitor={agentMonitor}
        broker={broker}
        backtest={agentBacktest}
        paperOrders={paperOrders}
        confirmation={paperConfirm}
        setConfirmation={setPaperConfirm}
        liveStatus={liveStatus}
        liveProposal={liveProposal}
        liveApproval={liveApproval}
        liveResult={liveResult}
        liveEvents={liveEvents}
        auditVerify={auditVerify}
        auditLogs={auditLogs}
        auditEvent={auditEvent}
        setAuditEvent={setAuditEvent}
        auditLimit={auditLimit}
        setAuditLimit={setAuditLimit}
        adminToken={liveAdminToken}
        setAdminToken={setLiveAdminToken}
        liveApproveConfirm={liveApproveConfirm}
        setLiveApproveConfirm={setLiveApproveConfirm}
        liveExecuteConfirm={liveExecuteConfirm}
        setLiveExecuteConfirm={setLiveExecuteConfirm}
        liveDisarmConfirm={liveDisarmConfirm}
        setLiveDisarmConfirm={setLiveDisarmConfirm}
        busy={busy}
        error={error}
        onRefresh={refreshAll}
        onRunMonitor={handleRunMonitor}
        onBacktest={handleBacktest}
        onExecute={handleExecutePaper}
        onStageLive={handleStageLive}
        onApproveLive={handleApproveLive}
        onExecuteLive={handleExecuteLive}
        onKillLive={handleKillLive}
        onDisarmLive={handleDisarmLive}
        onReconcileLive={handleReconcileLive}
        onVerifyAudit={handleVerifyAudit}
        onLoadAuditLogs={handleLoadAuditLogs}
      />
    );
  } else {
    screen = (
      <SettingsScreen
        apiBase={apiBase}
        setApiBase={setApiBase}
        cloud={cloudState}
        onConfigureCloud={handleConfigureCloud}
        onTestCloud={handleTestCloud}
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
        onSignOut={handleSignOut}
        onEnableNotifications={handleEnableNotifications}
        notificationReady={notificationReady}
        alertRule={alertRule}
        setAlertRule={setAlertRule}
        onSaveAlert={handleSaveAlert}
        error={error}
      />
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {screen}
      <View style={styles.nav}>
        {tabs.map(item => (
          <Pressable key={item.key} onPress={() => setTab(item.key)} style={[styles.tab, tab === item.key && styles.activeTab]}>
            <Text style={[styles.tabText, tab === item.key && styles.activeText]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020617' },
  nav: { flexDirection: 'row', borderTopColor: '#1e293b', borderTopWidth: 1, backgroundColor: '#020617', paddingBottom: 8 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  activeTab: { borderTopColor: '#22d3ee', borderTopWidth: 2 },
  tabText: { color: '#64748b', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  activeText: { color: '#22d3ee' },
});
