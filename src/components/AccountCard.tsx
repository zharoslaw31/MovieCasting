import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useCloud } from '../lib/cloud';
import { useStore } from '../lib/store';
import { colors, radius } from '../theme';
import { GradientButton, Segmented } from './ui';

/** Вхід / реєстрація і стан синхронізації бібліотеки з хмарою. */
export function AccountCard() {
  const cloud = useCloud();
  const { state } = useStore();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!cloud.enabled) {
    return (
      <View style={styles.card}>
        <Row icon="cloud-offline-outline" color={colors.gold} title="Хмарний акаунт ще не підключено" />
        <Text style={styles.muted}>Поки що бібліотека зберігається лише на цьому пристрої.</Text>
      </View>
    );
  }

  if (cloud.email) {
    const when = state.lastSyncAt ? new Date(state.lastSyncAt).toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;
    const statusText =
      cloud.status === 'syncing' ? 'Синхронізація…' : cloud.status === 'error' ? cloud.error ?? 'Помилка синхронізації' : when ? `Збережено в хмарі · ${when}` : 'Збережено в хмарі';
    return (
      <View style={styles.card}>
        <Row icon="person-circle" color={colors.like} title={cloud.email} />
        <View style={styles.statusRow}>
          {cloud.status === 'syncing' ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Ionicons name={cloud.status === 'error' ? 'alert-circle' : 'cloud-done'} size={16} color={cloud.status === 'error' ? colors.nope : colors.like} />
          )}
          <Text style={[styles.muted, { flex: 1 }, cloud.status === 'error' && { color: colors.nope }]}>{statusText}</Text>
          {cloud.status === 'error' ? (
            <Pressable onPress={cloud.syncNow} hitSlop={8}>
              <Text style={styles.link}>Повторити</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.muted}>Бібліотека, оцінки та статистика зберігаються у вашому акаунті й доступні з будь-якого телефону.</Text>
        <Pressable onPress={cloud.signOut} style={styles.signOut}>
          <Ionicons name="log-out-outline" size={18} color={colors.nope} />
          <Text style={styles.signOutText}>Вийти з акаунта</Text>
        </Pressable>
      </View>
    );
  }

  const submit = async () => {
    if (!email.trim() || password.length < 6) {
      setMsg('Введіть email і пароль (мінімум 6 символів)');
      return;
    }
    setBusy(true);
    setMsg(null);
    const err = mode === 'in' ? await cloud.signIn(email, password) : await cloud.signUp(email, password);
    setBusy(false);
    if (err) setMsg(err);
  };

  return (
    <View style={styles.card}>
      <Row icon="cloud-upload-outline" color={colors.accent} title="Збережіть бібліотеку в акаунті" />
      <Text style={styles.muted}>Увійдіть, щоб вподобані й переглянуті фільми не зникли і були на всіх ваших пристроях. Те, що вже є на цьому телефоні, додасться до акаунта.</Text>
      <View style={{ marginTop: 14 }}>
        <Segmented
          value={mode}
          onChange={(v) => {
            setMode(v);
            setMsg(null);
          }}
          options={[
            { value: 'in', label: 'Вхід' },
            { value: 'up', label: 'Реєстрація' },
          ]}
        />
      </View>
      <View style={styles.input}>
        <Ionicons name="mail-outline" size={18} color={colors.textMuted} />
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          style={styles.inputText}
        />
      </View>
      <View style={styles.input}>
        <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Пароль (від 6 символів)"
          placeholderTextColor={colors.textMuted}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          onSubmitEditing={submit}
          style={styles.inputText}
        />
        <Pressable onPress={() => setShow((v) => !v)} hitSlop={8}>
          <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textMuted} />
        </Pressable>
      </View>
      {msg ? <Text style={[styles.muted, { color: colors.nope, marginTop: 8 }]}>{msg}</Text> : null}
      <GradientButton
        title={busy ? 'Зачекайте…' : mode === 'in' ? 'Увійти' : 'Створити акаунт'}
        icon={mode === 'in' ? 'log-in-outline' : 'person-add-outline'}
        onPress={busy ? undefined : submit}
        style={{ marginTop: 14 }}
      />
    </View>
  );
}

function Row({ icon, color, title }: { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; title: string }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: colors.border, marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  title: { color: colors.text, fontSize: 16, fontWeight: '800', flex: 1 },
  muted: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  link: { color: colors.accent, fontWeight: '800', fontSize: 13 },
  input: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, paddingHorizontal: 12, height: 48, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  inputText: { flex: 1, color: colors.text, fontSize: 15, height: '100%' },
  signOut: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border },
  signOutText: { color: colors.nope, fontWeight: '700', fontSize: 15 },
});
