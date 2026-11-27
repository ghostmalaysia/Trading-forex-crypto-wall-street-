import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL || 'http://10.0.2.2:8080').replace(/\/$/, '');

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function fmt(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : '—';
}

export default function App() {
  const [health, setHealth] = useState(null);
  const [market, setMarket] = useState(null);
  const [symbol, setSymbol] = useState('XAU/USD');
  const [question, setQuestion] = useState('Bina cadangan paper trading untuk simbol ini.');
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setError('');
      const [nextHealth, nextMarket] = await Promise.all([api('/api/health'), api('/api/market')]);
      setHealth(nextHealth);
      setMarket(nextMarket);
    } catch (requestError) {
      setError(requestError.message);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function askAI(mode) {
    const item = market?.items?.find(entry => entry.symbol === symbol) || market?.items?.[0];
    if (!item) return;
    setBusy(true);
    setError('');
    try {
      const context = {
        selected: item.symbol,
        market: item.label,
        timeframe: '1D',
        dataSource: market.provider === 'mock' ? 'mock' : 'market',
        chart: { symbol: item.symbol, series: item.series || [] },
        history: [],
        preferences: { paperEquity: 10000 },
        risk: { dailyLossPct: 0, openPositions: 0 },
      };
      const result = await api('/api/ai', {
        method: 'POST',
        body: JSON.stringify({ message: question, mode, context }),
      });
      if (mode === 'plan') setPlan(result);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const items = market?.items || [];

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>TRADEWALL</Text>
        <Text style={styles.tagline}>XAU/USD + DXY · paper intelligence</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.card}>
          <Text style={styles.label}>SYSTEM</Text>
          <Text style={styles.value}>quotes: {health?.provider || '…'}</Text>
          <Text style={styles.value}>market: {health?.marketProvider || '…'}</Text>
          <Text style={styles.value}>AI: {health?.aiProvider || '…'} · {health?.aiModel || '…'}</Text>
        </View>

        <Text style={styles.section}>MARKET</Text>
        {items.map(item => (
          <Pressable
            key={item.symbol}
            onPress={() => setSymbol(item.symbol)}
            style={[styles.card, styles.marketCard, item.symbol === symbol && styles.selectedCard]}
          >
            <Text style={styles.symbol}>{item.symbol}</Text>
            <Text style={styles.price}>{fmt(item.price)}</Text>
            <Text style={styles.value}>{item.label}</Text>
          </Pressable>
        ))}

        <Text style={styles.section}>ANALYST</Text>
        <View style={styles.card}>
          <TextInput
            multiline
            value={question}
            onChangeText={setQuestion}
            style={styles.input}
            placeholder="Tanya tentang emas atau DXY"
            placeholderTextColor="#64748b"
          />
          {busy ? <ActivityIndicator color="#22d3ee" /> : null}
          <View style={styles.actions}>
            <Button title="ANALYSE" color="#22d3ee" disabled={busy} onPress={() => askAI('chat')} />
            <Button title="BUILD PLAN" color="#a3e635" disabled={busy} onPress={() => askAI('plan')} />
          </View>
        </View>

        {plan ? (
          <View style={styles.card}>
            <Text style={styles.label}>PAPER PROPOSAL</Text>
            <Text style={[styles.value, styles.bias]}>{String(plan.plan?.bias || '').toUpperCase()}</Text>
            <Text style={styles.value}>entry {fmt(plan.plan?.entry)}</Text>
            <Text style={styles.value}>SL {fmt(plan.plan?.stopLoss)} · TP {fmt(plan.plan?.takeProfit)}</Text>
            <Text style={styles.value}>risk gate: {plan.risk?.decision || '—'}</Text>
            <Text style={styles.rationale}>{plan.plan?.rationale || plan.reply}</Text>
          </View>
        ) : null}

        <Text style={styles.disclaimer}>Informational only. No real order is placed.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020617' },
  content: { padding: 18, paddingBottom: 40 },
  brand: { color: '#22d3ee', fontSize: 26, fontWeight: '800', letterSpacing: 2 },
  tagline: { color: '#64748b', fontSize: 12, marginBottom: 18 },
  card: { backgroundColor: '#0f172a', borderColor: '#1e293b', borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12 },
  section: { color: '#94a3b8', fontSize: 12, fontWeight: '700', letterSpacing: 2, marginTop: 8, marginBottom: 8 },
  label: { color: '#22d3ee', fontSize: 11, fontWeight: '700', marginBottom: 8 },
  value: { color: '#cbd5e1', fontSize: 13, lineHeight: 20 },
  error: { color: '#f87171', fontSize: 13, marginBottom: 12 },
  marketCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  selectedCard: { borderColor: '#22d3ee' },
  symbol: { color: '#e2e8f0', fontSize: 16, fontWeight: '700' },
  price: { color: '#a3e635', fontSize: 18, fontWeight: '700' },
  input: { minHeight: 80, color: '#e2e8f0', backgroundColor: '#020617', borderColor: '#1e293b', borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 12, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  bias: { color: '#a3e635', fontSize: 18, fontWeight: '800' },
  rationale: { color: '#94a3b8', fontSize: 12, lineHeight: 18, marginTop: 10 },
  disclaimer: { color: '#64748b', fontSize: 11, textAlign: 'center', marginTop: 18 },
});
