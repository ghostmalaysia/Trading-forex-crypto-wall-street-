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
  liveStatus,
  liveProposal,
  liveApproval,
  liveResult,
  liveEvents: liveEventsProp,
  auditVerify,
  auditLogs,
  auditEvent,
  setAuditEvent,
  auditLimit,
  setAuditLimit,
  adminToken,
  setAdminToken,
  liveApproveConfirm,
  setLiveApproveConfirm,
  liveExecuteConfirm,
  setLiveExecuteConfirm,
  liveDisarmConfirm,
  setLiveDisarmConfirm,
  busy,
  error,
  onRefresh,
  onRunMonitor,
  onBacktest,
  onExecute,
  onStageLive,
  onApproveLive,
  onExecuteLive,
  onKillLive,
  onDisarmLive,
  onReconcileLive,
  onVerifyAudit,
  onLoadAuditLogs,
}) {
  const rules = Array.isArray(monitor?.rules) ? monitor.rules : [];
  const events = Array.isArray(monitor?.events) ? monitor.events : [];
  const orders = Array.isArray(paperOrders) ? paperOrders : [];
  const liveEvents = Array.isArray(liveEventsProp) ? liveEventsProp : [];
  const auditEntries = Array.isArray(auditLogs?.entries) ? auditLogs.entries : [];

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

      <Card>
        <SectionTitle>GUARDED LIVE</SectionTitle>
        <Row label="mode" value={liveStatus?.mode || 'paper'} tone={liveStatus?.liveOrdersEnabled ? 'good' : 'bad'} />
        <Row label="kill switch" value={liveStatus?.killSwitch ? 'ARMED' : 'disarmed'} tone={liveStatus?.killSwitch ? 'good' : 'bad'} />
        <Row label="circuit" value={liveStatus?.circuitBreaker?.tripped ? 'OPEN' : 'closed'} tone={liveStatus?.circuitBreaker?.tripped ? 'bad' : 'good'} />
        <Row label="adapter" value={liveStatus?.adapter?.name || 'disabled'} />
        <Row label="credentials" value={liveStatus?.vault?.configured ? 'configured' : 'missing'} />
        <Text style={styles.note}>{liveStatus?.notice || 'Live guard status is loading.'}</Text>
        <TextInput
          value={adminToken}
          onChangeText={setAdminToken}
          style={styles.input}
          placeholder="Live admin token"
          placeholderTextColor="#64748b"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.actions}>
          <Button title="STAGE PROPOSAL" color="#22d3ee" disabled={busy} onPress={onStageLive} />
          <Button title="KILL LIVE" color="#f87171" disabled={busy} onPress={onKillLive} />
          <Button title="RECONCILE" color="#64748b" disabled={busy} onPress={onReconcileLive} />
          <Button title="VERIFY AUDIT" color="#64748b" disabled={busy} onPress={onVerifyAudit} />
        </View>
        {liveProposal ? (
          <View style={styles.order}>
            <Text style={styles.eventTitle}>{liveProposal.symbol || 'ORDER'} · {liveProposal.decision}</Text>
            <Text style={styles.eventText}>entry {fmt(liveProposal.intent?.entry)} · units {liveProposal.intent?.units ?? '—'}</Text>
            <Text style={styles.eventText}>{(liveProposal.assessment?.checks || []).filter(item => !item.pass).map(item => item.name).join(', ') || 'All live risk checks passed.'}</Text>
          </View>
        ) : <Empty>Generate and approve a plan first.</Empty>}
        <TextInput
          value={liveApproveConfirm}
          onChangeText={setLiveApproveConfirm}
          style={styles.input}
          placeholder="Type APPROVE LIVE"
          placeholderTextColor="#64748b"
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <Button title="APPROVE PROPOSAL" color="#a3e635" disabled={busy} onPress={onApproveLive} />
        {liveApproval ? <Text style={styles.eventText}>Approval {liveApproval.code} issued.</Text> : null}
        <TextInput
          value={liveExecuteConfirm}
          onChangeText={setLiveExecuteConfirm}
          style={styles.input}
          placeholder="Type EXECUTE LIVE"
          placeholderTextColor="#64748b"
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <Button title="SEND GUARDED ORDER" color="#f59e0b" disabled={busy} onPress={onExecuteLive} />
        <TextInput
          value={liveDisarmConfirm}
          onChangeText={setLiveDisarmConfirm}
          style={styles.input}
          placeholder="Type DISABLE KILL SWITCH"
          placeholderTextColor="#64748b"
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <Button title="DISARM KILL SWITCH" color="#f87171" disabled={busy} onPress={onDisarmLive} />
        {liveResult ? <Text style={styles.eventText}>{liveResult.status}{liveResult.code ? ` · ${liveResult.code}` : ''}</Text> : null}
        {auditVerify ? <Text style={styles.note}>Audit chain {auditVerify.ok ? 'valid' : 'INVALID'} · {auditVerify.count || 0} entries</Text> : null}
        {liveEvents.length ? liveEvents.slice(0, 5).map((item, index) => (
          <View key={`${item.created_at || index}`} style={styles.event}>
            <Text style={styles.eventTitle}>{item.event || 'live_event'}</Text>
            <Text style={styles.eventText}>{item.status || ''}</Text>
          </View>
        )) : null}
        <Text style={styles.note}>Live orders require server credentials, a wired adapter, admin token, approval secret, explicit approval, and a disarmed kill switch.</Text>
      </Card>

      <Card>
        <SectionTitle>AUDIT TRAIL</SectionTitle>
        <TextInput
          value={auditEvent}
          onChangeText={setAuditEvent}
          style={styles.input}
          placeholder="Event filter (optional)"
          placeholderTextColor="#64748b"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          value={auditLimit}
          onChangeText={setAuditLimit}
          style={styles.input}
          placeholder="Limit 1-200"
          placeholderTextColor="#64748b"
          keyboardType="numeric"
        />
        <View style={styles.actions}>
          <Button title="LOAD AUDIT LOG" color="#22d3ee" disabled={busy} onPress={onLoadAuditLogs} />
          <Button title="VERIFY CHAIN" color="#64748b" disabled={busy} onPress={onVerifyAudit} />
        </View>
        <Text style={styles.note}>Showing {auditEntries.length} of {auditLogs?.count || 0} entries{auditLogs?.event ? ` · ${auditLogs.event}` : ''}</Text>
        {auditEntries.length ? auditEntries.map((item, index) => (
          <View key={`${item.hash || index}`} style={[styles.event, styles.auditEntry]}>
            <Text style={styles.eventTitle}>#{item.seq} {item.event || 'audit'}</Text>
            <Text style={styles.eventText}>{item.timestamp || ''} · {String(item.hash || '').slice(0, 16)}</Text>
          </View>
        )) : null}
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
  auditEntry: { borderLeftColor: '#22d3ee' },
  order: { borderColor: '#1e293b', borderLeftColor: '#64748b', borderLeftWidth: 3, borderWidth: 1, borderRadius: 8, padding: 10, marginTop: 8 },
  simulated: { borderLeftColor: '#a3e635' },
  eventTitle: { color: '#22d3ee', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 5 },
  eventText: { color: '#94a3b8', fontSize: 12, lineHeight: 17 },
  note: { color: '#64748b', fontSize: 11, lineHeight: 16, marginTop: 10 },
});
