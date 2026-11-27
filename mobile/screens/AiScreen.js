import React from 'react';
import { Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Card, Empty, Row, ScreenHeader, SectionTitle } from '../ui.js';
import { fmt } from '../format.js';

export default function AiScreen({ messages, question, setQuestion, busy, error, onAsk, onPlan, plan, onClear, summary, onSummary }) {
  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader
        title="AI DESK"
        subtitle="XAU/USD + DXY only"
        action={<Button title="CLEAR" color="#64748b" disabled={busy} onPress={onClear} />}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <SectionTitle>CONVERSATION</SectionTitle>
      {messages.length ? messages.map((item, index) => (
        <View key={`${item.role}-${index}`} style={[styles.bubble, item.role === 'user' ? styles.user : styles.assistant]}>
          <Text style={styles.role}>{item.role.toUpperCase()}</Text>
          <Text style={styles.message}>{item.content}</Text>
        </View>
      )) : <Empty>Ask about gold or the dollar to begin.</Empty>}

      <Card>
        <TextInput
          multiline
          value={question}
          onChangeText={setQuestion}
          style={styles.input}
          placeholder="Tanya tentang XAU/USD atau DXY"
          placeholderTextColor="#64748b"
        />
        <View style={styles.actions}>
          <Button title="ANALYSE" color="#22d3ee" disabled={busy} onPress={() => onAsk('chat')} />
          <Button title="SUMMARY" color="#fbbf24" disabled={busy} onPress={onSummary} />
          <Button title="BUILD PLAN" color="#a3e635" disabled={busy} onPress={onPlan} />
        </View>
      </Card>

      {summary ? (
        <Card>
          <SectionTitle>MARKET SUMMARY</SectionTitle>
          {(summary.bullets || []).map((bullet, index) => (
            <Text key={`${index}-${bullet}`} style={styles.rationale}>• {bullet}</Text>
          ))}
          {summary.aiSummary ? <Text style={styles.rationale}>{summary.aiSummary}</Text> : null}
        </Card>
      ) : null}

      {plan ? (
        <Card>
          <SectionTitle>PAPER PROPOSAL</SectionTitle>
          <Row label="bias" value={String(plan.plan?.bias || '').toUpperCase()} tone="good" />
          <Row label="entry" value={fmt(plan.plan?.entry)} />
          <Row label="stop" value={fmt(plan.plan?.stopLoss)} />
          <Row label="target" value={fmt(plan.plan?.takeProfit)} />
          <Row label="risk gate" value={plan.risk?.decision || '—'} tone={plan.risk?.eligible ? 'good' : 'bad'} />
          <Text style={styles.rationale}>{plan.plan?.rationale || plan.reply}</Text>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 40 },
  error: { color: '#f87171', fontSize: 13, marginBottom: 12 },
  bubble: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 10 },
  user: { backgroundColor: '#082f49', borderColor: '#0e7490', alignSelf: 'flex-end', maxWidth: '90%' },
  assistant: { backgroundColor: '#0f172a', borderColor: '#1e293b' },
  role: { color: '#22d3ee', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 6 },
  message: { color: '#cbd5e1', fontSize: 13, lineHeight: 19 },
  input: { minHeight: 80, color: '#e2e8f0', backgroundColor: '#020617', borderColor: '#1e293b', borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 12, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  rationale: { color: '#94a3b8', fontSize: 12, lineHeight: 18, marginTop: 10 },
});
