import React from 'react';
import { ActivityIndicator, Button, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Card, Empty, Row, ScreenHeader, SectionTitle } from '../ui.js';
import { fmt, fmtTime } from '../format.js';

export default function DashboardScreen({ health, market, plan, alerts, busy, error, onRefresh, onPlan, onSymbol, symbol }) {
  const items = market?.items || [];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ScreenHeader
        title="MIM VENTURES"
        titleStyle={styles.brandTitle}
        subtitle="XAU/USD + DXY · paper intelligence"
        action={<Button title="REFRESH" color="#22d3ee" disabled={busy} onPress={onRefresh} />}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {busy ? <ActivityIndicator color="#22d3ee" style={styles.spinner} /> : null}

      <Card>
        <SectionTitle>SYSTEM</SectionTitle>
        <Row label="quotes" value={health?.provider || '…'} />
        <Row label="market" value={health?.marketProvider || '…'} />
        <Row label="AI" value={`${health?.aiProvider || '…'} · ${health?.aiModel || '…'}`} />
        <Row label="updated" value={fmtTime(market?.fetchedAt)} />
        <Row label="alerts" value={alerts.length ? `${alerts.length} active` : 'none'} tone={alerts.length ? 'good' : undefined} />
      </Card>

      <SectionTitle>FOCUS MARKETS</SectionTitle>
      {items.length ? items.map(item => (
        <Pressable
          key={item.symbol}
          onPress={() => onSymbol(item.symbol)}
          style={[styles.marketCard, item.symbol === symbol && styles.selectedCard]}
        >
          <Text style={styles.symbol}>{item.symbol}</Text>
          <Text style={styles.price}>{fmt(item.price)}</Text>
          <Text style={styles.label}>{item.label}</Text>
        </Pressable>
      )) : <Empty>No market data yet.</Empty>}

      <SectionTitle>AI PROPOSAL</SectionTitle>
      <Card>
        {plan ? (
          <>
            <Row label="bias" value={String(plan.plan?.bias || '').toUpperCase()} tone="good" />
            <Row label="entry" value={fmt(plan.plan?.entry)} />
            <Row label="stop" value={fmt(plan.plan?.stopLoss)} />
            <Row label="target" value={fmt(plan.plan?.takeProfit)} />
            <Row label="risk gate" value={plan.risk?.decision || '—'} tone={plan.risk?.eligible ? 'good' : 'bad'} />
            <Text style={styles.rationale}>{plan.plan?.rationale || plan.reply}</Text>
          </>
        ) : <Empty>Build a paper proposal from the AI tab or button below.</Empty>}
        <Button title="BUILD PAPER PLAN" color="#a3e635" disabled={busy || !items.length} onPress={onPlan} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  brandTitle: { color: '#e7c15a', textShadowColor: 'rgba(231,193,90,.35)', textShadowRadius: 12 },
  content: { padding: 18, paddingBottom: 40 },
  spinner: { marginVertical: 8 },
  error: { color: '#f87171', fontSize: 13, marginBottom: 12 },
  marketCard: { backgroundColor: '#0f172a', borderColor: '#1e293b', borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  selectedCard: { borderColor: '#22d3ee' },
  symbol: { color: '#e2e8f0', fontSize: 16, fontWeight: '700' },
  price: { color: '#a3e635', fontSize: 18, fontWeight: '700' },
  label: { color: '#64748b', fontSize: 11, width: '100%', marginTop: 6 },
  rationale: { color: '#94a3b8', fontSize: 12, lineHeight: 18, marginVertical: 10 },
});
