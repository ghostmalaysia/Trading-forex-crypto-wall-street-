import React, { useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { Card, Row, ScreenHeader, SectionTitle } from '../ui.js';

export default function SettingsScreen({
  apiBase,
  setApiBase,
  cloud,
  onConfigureCloud,
  onTestCloud,
  onSignIn,
  onSignUp,
  onSignOut,
  onEnableNotifications,
  notificationReady,
  alertRule,
  setAlertRule,
  onSaveAlert,
  error,
}) {
  const [url, setUrl] = useState(cloud.configured ? cloud.url || '' : '');
  const [anonKey, setAnonKey] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="SETTINGS" subtitle="Server, cloud sync, notifications" />
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <SectionTitle>API SERVER</SectionTitle>
      <Card>
        <TextInput
          value={apiBase}
          onChangeText={setApiBase}
          style={styles.input}
          placeholder="http://10.0.2.2:8080"
          placeholderTextColor="#64748b"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.hint}>Use your LAN address or deployed HTTPS URL on a physical device.</Text>
      </Card>

      <SectionTitle>SUPABASE</SectionTitle>
      <Card>
        <Row label="status" value={cloud.signedIn ? 'signed in' : cloud.configured ? 'configured' : 'not configured'} tone={cloud.signedIn ? 'good' : undefined} />
        <TextInput value={url} onChangeText={setUrl} style={styles.input} placeholder="https://project.supabase.co" placeholderTextColor="#64748b" autoCapitalize="none" autoCorrect={false} />
        <TextInput value={anonKey} onChangeText={setAnonKey} style={styles.input} placeholder="publishable/anon key" placeholderTextColor="#64748b" secureTextEntry autoCapitalize="none" autoCorrect={false} />
        <View style={styles.actions}>
          <Button title="SAVE" color="#22d3ee" onPress={() => onConfigureCloud(url, anonKey)} />
          <Button title="TEST" color="#64748b" onPress={onTestCloud} />
        </View>
      </Card>

      {cloud.configured && !cloud.signedIn ? (
        <Card>
          <TextInput value={email} onChangeText={setEmail} style={styles.input} placeholder="email" placeholderTextColor="#64748b" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
          <TextInput value={password} onChangeText={setPassword} style={styles.input} placeholder="password" placeholderTextColor="#64748b" secureTextEntry />
          <View style={styles.actions}>
            <Button title="SIGN IN" color="#a3e635" onPress={() => onSignIn(email, password)} />
            <Button title="SIGN UP" color="#64748b" onPress={() => onSignUp(email, password)} />
          </View>
        </Card>
      ) : null}

      {cloud.signedIn ? (
        <Card>
          <Row label="user" value={cloud.userKey?.slice(0, 12) || '—'} />
          <Button title="SIGN OUT" color="#f87171" onPress={onSignOut} />
        </Card>
      ) : null}

      <SectionTitle>NOTIFICATIONS</SectionTitle>
      <Card>
        <Row label="local alerts" value={notificationReady ? 'enabled' : 'enable to notify'} tone={notificationReady ? 'good' : undefined} />
        <Button title="ENABLE" color="#22d3ee" disabled={notificationReady} onPress={onEnableNotifications} />
      </Card>

      <SectionTitle>ALERT RULE</SectionTitle>
      <Card>
        <TextInput value={alertRule.symbol} onChangeText={symbol => setAlertRule({ ...alertRule, symbol })} style={styles.input} placeholder="XAU/USD or DXY" placeholderTextColor="#64748b" autoCapitalize="characters" />
        <TextInput value={alertRule.condition} onChangeText={condition => setAlertRule({ ...alertRule, condition })} style={styles.input} placeholder=">= or <=" placeholderTextColor="#64748b" />
        <TextInput value={alertRule.threshold} onChangeText={threshold => setAlertRule({ ...alertRule, threshold })} style={styles.input} placeholder="threshold" placeholderTextColor="#64748b" keyboardType="decimal-pad" />
        <Button title="SAVE ALERT" color="#a3e635" onPress={onSaveAlert} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 40 },
  error: { color: '#f87171', fontSize: 13, marginBottom: 12 },
  input: { color: '#e2e8f0', backgroundColor: '#020617', borderColor: '#1e293b', borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 13 },
  hint: { color: '#64748b', fontSize: 11, lineHeight: 16 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 4 },
});
