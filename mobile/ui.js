import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function ScreenHeader({ title, subtitle, action, titleStyle }) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={[styles.headerTitle, titleStyle]}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children }) {
  return <Text style={styles.section}>{children}</Text>;
}

export function Row({ label, value, tone }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, tone === 'good' && styles.good, tone === 'bad' && styles.bad]}>{value}</Text>
    </View>
  );
}

export function Empty({ children }) {
  return <Text style={styles.empty}>{children}</Text>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  headerTitle: { color: '#22d3ee', fontSize: 24, fontWeight: '800', letterSpacing: 1 },
  headerSubtitle: { color: '#64748b', fontSize: 12, marginTop: 4 },
  card: { backgroundColor: '#0f172a', borderColor: '#1e293b', borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12 },
  section: { color: '#94a3b8', fontSize: 12, fontWeight: '700', letterSpacing: 2, marginTop: 10, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 4 },
  label: { color: '#64748b', fontSize: 12 },
  value: { color: '#cbd5e1', fontSize: 12, flexShrink: 1, textAlign: 'right' },
  good: { color: '#a3e635' },
  bad: { color: '#f87171' },
  empty: { color: '#64748b', fontSize: 12, fontStyle: 'italic', paddingVertical: 8 },
});
