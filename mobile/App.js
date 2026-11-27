import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { createApiClient } from '../shared/api-client.js';
import { FOCUS } from '../shared/feed-data.js';
import { createMobileSupabaseClient } from './supabase-client.js';
import { readJson, removeJson, writeJson } from './storage.js';
import { ensureNotificationPermission, notifyAlert } from './notifications.js';
import { fmt } from './format.js';
import DashboardScreen from './screens/DashboardScreen.js';
import WatchlistScreen from './screens/WatchlistScreen.js';
import NewsScreen from './screens/NewsScreen.js';
import AiScreen from './screens/AiScreen.js';
import SettingsScreen from './screens/SettingsScreen.js';

const apiBaseKey = 'tradewall_mobile_api_base';
const watchlistKey = 'tradewall_mobile_watchlist';
const selectedKey = 'tradewall_mobile_selected';
const messagesKey = 'tradewall_mobile_chat';
const alertsKey = 'tradewall_mobile_alert_rules';
const firedKey = 'tradewall_mobile_fired_alerts';

const tabs = [
  { key: 'dashboard', label: 'DASH' },
  { key: 'watchlist', label: 'WATCH' },
  { key: 'news', label: 'NEWS' },
  { key: 'ai', label: 'AI' },
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
      const [nextHealth, nextMarket, nextFeed] = await Promise.all([
        apiClient.health(),
        apiClient.market(),
        apiClient.news(),
      ]);
      setHealth(nextHealth);
      setMarket(nextMarket);
      setFeed(nextFeed);
      await checkAlerts(nextMarket);
    } catch (requestError) {
      setError(requestError.message || 'Cannot reach the server');
    } finally {
      setBusy(false);
    }
  }, [apiClient, checkAlerts]);

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
    const [settings, list, chat] = await Promise.all([
      cloud.loadSettings(),
      cloud.loadWatchlist(),
      cloud.loadChat(20),
    ]);
    if (FOCUS.includes(settings.preferences?.default_symbol)) setSelected(settings.preferences.default_symbol);
    if (Array.isArray(list.data) && list.data.length) setWatchlist(list.data);
    if (Array.isArray(chat.data) && chat.data.length) setMessages(chat.data);
  }), [cloud, run, syncCloudState]);

  const handleSignUp = handleSignIn;

  const handleSignOut = useCallback(() => run(async () => {
    await cloud.signOut();
    syncCloudState();
  }), [cloud, run, syncCloudState]);

  const handleEnableNotifications = useCallback(() => run(async () => {
    const granted = await ensureNotificationPermission();
    setNotificationReady(granted);
    if (!granted) throw new Error('Notification permission was denied.');
  }), [run]);

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
        onClear={() => setMessages([])}
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
