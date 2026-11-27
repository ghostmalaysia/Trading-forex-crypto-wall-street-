import React from 'react';
import { Button, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Card, Empty, Row, ScreenHeader, SectionTitle } from '../ui.js';
import { fmt } from '../format.js';
import { FOCUS } from '../../shared/feed-data.js';

export default function WatchlistScreen({ watchlist, market, selected, onToggle, onSelect, cloudState, onSync, error }) {
  const quotes = new Map((market?.items || []).map(item => [item.symbol, item]));
  const symbols = [...new Set([...FOCUS, ...watchlist.map(item => item.symbol), ...quotes.keys()])];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ScreenHeader
        title="WATCHLIST"
        subtitle="Focus symbols stay pinned"
        action={<Button title="SYNC" color="#22d3ee" disabled={!cloudState.signedIn} onPress={onSync} />}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Card>
        <Row label="cloud" value={cloudState.signedIn ? `synced as ${cloudState.userKey?.slice(0, 8)}` : cloudState.configured ? 'sign in to sync' : 'not configured'} tone={cloudState.signedIn ? 'good' : undefined} />
      </Card>
      <SectionTitle>SYMBOLS</SectionTitle>
      {symbols.map(symbol => {
        const quote = quotes.get(symbol);
        const saved = watchlist.some(item => item.symbol === symbol);
        return (
          <Pressable key={symbol} onPress={() => onSelect(symbol)} style={[styles.item, selected === symbol && styles.selected]}>
            <Text style={styles.symbol}>{symbol}</Text>
            <Text style={styles.price}>{quote ? fmt(quote.price) : '—'}</Text>
            <Button
              title={saved ? 'REMOVE' : 'ADD'}
              color={saved ? '#f87171' : '#a3e635'}
              onPress={() => onToggle({ symbol, market: quote?.label || 'Watchlist' })}
            />
          </Pressable>
        );
      })}
      {!symbols.length ? <Empty>No symbols available.</Empty> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 40 },
  error: { color: '#f87171', fontSize: 13, marginBottom: 12 },
  item: { backgroundColor: '#0f172a', borderColor: '#1e293b', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  selected: { borderColor: '#22d3ee' },
  symbol: { color: '#e2e8f0', fontSize: 15, fontWeight: '700', flex: 1 },
  price: { color: '#a3e635', fontSize: 14, marginRight: 10 },
});
