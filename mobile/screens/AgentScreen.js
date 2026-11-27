import React from 'react';
import { Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Card, Empty, Row, ScreenHeader, SectionTitle } from '../ui.js';
import { fmt } from '../format.js';

export default function AgentScreen({
  monitor,
  broker,
  backtest,
  paperOrders,
  confirmation,
  setConfirmation,
  busy,
  error,
  onRefresh,
  onRunMonitor,
  onBacktest,
  onExecute,
}) {
  const rules = Array.isArray(monitor?.rules) ? monitor.rules : [];
  const events = Array.isArray(monitor?.events) ? monitor.events : [];
  const orders = Array.isArray(paperOrders) ? paperOrders : [];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ScreenHeader
        title="AGENT LAB"
        subtitle="Monitor · backtest · paper execution"
        action={<Button title="REFRESH" color="#64748b" disabled={busy} onPress={onRefresh} />}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Card>
        <SectionTitle>MONITOR</SectionTitle>
        <Row label="interval" value={`${monitor?.intervalSeconds || 60}s`} />
        <Row label="rules" value={String(rules.length)} />
        <Row label="last run" value={monitor?.lastRunAt ? new Date(monitor.lastRunAt).toLocaleTimeString() : 'not run yet'} />
        <Row label="mode" value="PAPER ONLY" tone="good" />
        {events.length ? events.map((event, index) => (
          <View key={`${event.at || index}-${index}`} style={[styles.event, event.type === 'anomaly' && styles.anomaly]}>
            <Text style={styles.eventTitle}>{event.symbol || 'MARKET'} · {String(event.type || 'event').toUpperCase()}</Text>
            <Text style={styles.eventText}>{event.reason || 'No detail supplied.'}</Text>
          </View>
        )) : <Empty>No monitor events yet.</Empty>}
        <View style={styles.actions}>
          <Button title="RUN MONITOR" color="#22d3ee" disabled={busy} onPress={onRunMonitor} />
        </View>
      </Card>

      <Card>
        <SectionTitle>BACKTEST</SectionTitle>
        {backtest ? backtest.insufficient ? (
          <Empty>Need {backtest.required} points; got {backtest.points}.</Empty>
        ) : (
          <>
            <Row label="strategy" value={`SMA ${backtest.fast}/${backtest.slow}`} />
            <Row label="trades" value={String(backtest.tradeCount)} />
            <Row label="win rate" value={`${backtest.winRate}%`} tone={backtest.winRate >= 50 ? 'good' : 'bad'} />
            <Row label="return" value={`${backtest.totalReturnPct}%`} tone={backtest.totalReturnPct >= 0 ? 'good' : 'bad'} />
            <Row label="drawdown" value={`${backtest.maxDrawdownPct}%`} />
            <Text style={styles.note}>Educational simulation only.</Text>
          </>
        ) : <Empty>Uses the selected chart series.</Empty>}
        <Button title="RUN SMA CROSS" color="#a3e635" disabled={busy} onPress={onBacktest} />
      </Card>

      <Card>
        <SectionTitle>PAPER EXECUTION</SectionTitle>
        <Row label="broker" value={broker?.provider || 'paper-simulator'} />
        <Row label="live orders" value={broker?.liveOrdersEnabled ? 'disabled' : 'disabled'} tone="bad" />
        <TextInput
          value={confirmation}
          onChangeText={setConfirmation}
          style={styles.input}
          placeholder="Type EXECUTE PAPER"
          placeholderTextColor="#64748b"
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <Button title="SIMULATE ORDER" color="#f59e0b" disabled={busy} onPress={onExecute} />
        {orders.length ? orders.map((item, index) => (
          <View key={`${item.id || item.order_ref || index}`} style={[styles.order, item.status === 'simulated' && styles.simulated]}>
            <Text style={styles.eventTitle}>{item.symbol || item.payload?.symbol || 'ORDER'} · {item.side || item.payload?.side || ''}</Text>
            <Text style={styles.eventText}>entry {fmt(item.entry ?? item.payload?.entry)} · {item.status || item.payload?.status || 'recorded'}</Text>
            {item.outcome ? <Text style={styles.eventText}>{item.outcome} · pnl {fmt(item.pnl)}</Text> : null}
          </View>
        )) : <Empty>Generate and approve a plan in AI, then simulate it here.</Empty>}
        <Text style={styles.note}>No broker order is placed. Live adapters are scaffolded but disabled.</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 40 },
  error: { color: '#f87171', fontSize: 13, marginBottom: 12 },
  actions: { marginTop: 10 },
  input: { color: '#e2e8f0', backgroundColor: '#020617', borderColor: '#1e293b', borderWidth: 1, borderRadius: 8, padding: 10, marginVertical: 10 },
  event: { borderColor: '#1e293b', borderLeftColor: '#f59e0b', borderLeftWidth: 3, borderWidth: 1, borderRadius: 8, padding: 10, marginTop: 8 },
  anomaly: { borderLeftColor: '#f87171' },
  order: { borderColor: '#1e293b', borderLeftColor: '#64748b', borderLeftWidth: 3, borderWidth: 1, borderRadius: 8, padding: 10, marginTop: 8 },
  simulated: { borderLeftColor: '#a3e635' },
  eventTitle: { color: '#22d3ee', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 5 },
  eventText: { color: '#94a3b8', fontSize: 12, lineHeight: 17 },
  note: { color: '#64748b', fontSize: 11, lineHeight: 16, marginTop: 10 },
});
