import React from 'react';
import { Button, ScrollView, StyleSheet, Text } from 'react-native';
import { Card, Empty, ScreenHeader, SectionTitle } from '../ui.js';

export default function NewsScreen({ feed, busy, onRefresh, error }) {
  const items = feed?.items || [];
  const calendar = feed?.calendar || [];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ScreenHeader
        title="NEWS"
        subtitle="Curated mock catalysts"
        action={<Button title="REFRESH" color="#22d3ee" disabled={busy} onPress={onRefresh} />}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <SectionTitle>HEADLINES</SectionTitle>
      {items.length ? items.map((item, index) => (
        <Card key={`${item.title}-${index}`}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.meta}>{item.meta}</Text>
        </Card>
      )) : <Empty>No headlines available.</Empty>}

      <SectionTitle>ECONOMIC CALENDAR</SectionTitle>
      {calendar.length ? calendar.map((item, index) => (
        <Card key={`${item.title}-${index}`}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.meta}>{new Date(item.date).toLocaleString()}</Text>
          <Text style={[styles.impact, item.impact === 'high' ? styles.high : styles.medium]}>{item.impact.toUpperCase()} · {item.tags}</Text>
        </Card>
      )) : <Empty>No events available.</Empty>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 40 },
  error: { color: '#f87171', fontSize: 13, marginBottom: 12 },
  title: { color: '#e2e8f0', fontSize: 14, fontWeight: '700', lineHeight: 20 },
  meta: { color: '#64748b', fontSize: 11, marginTop: 6 },
  impact: { color: '#94a3b8', fontSize: 11, fontWeight: '700', marginTop: 8 },
  high: { color: '#f87171' },
  medium: { color: '#fbbf24' },
});
