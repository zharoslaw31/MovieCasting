import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { effectiveStatus, watchedCount } from '../../lib/series';
import { AccountCard } from '../../components/AccountCard';
import { ObsidianLink } from '../../components/ObsidianSheet';
import { GradientButton, Segmented, SectionTitle } from '../../components/ui';
import { genreEmoji, genreName } from '../../lib/genres';
import { syncDataOf, useStore } from '../../lib/store';
import { backupSupported, downloadBackup, pickBackup } from '../../lib/backup';
import { ENV_API_KEY, validateKey } from '../../lib/tmdb';
import { colors, gradients, radius, TAB_BAR_HEIGHT } from '../../theme';

const AVATARS = ['🍿', '🎬', '🎥', '🦄', '🐼', '🦊', '👽', '🤖', '🧛', '🦸', '🧙', '🐱'];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { state, dispatch, api } = useStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(state.profile.name);
  const [key, setKey] = useState(state.settings.apiKey);
  const [checking, setChecking] = useState(false);
  const [keyStatus, setKeyStatus] = useState<'ok' | 'bad' | null>(null);
  // ключ TMDB уже вбудовано в сайт — поле для власного ключа ховаємо в «додатково»
  const [showKey, setShowKey] = useState(!ENV_API_KEY || !!state.settings.apiKey);

  const stats = useMemo(() => {
    const likes = state.liked.length;
    const nopes = state.disliked.length;
    const swipes = state.history.length;
    const totalDecisions = likes + nopes;
    const minutes = state.watched.filter((e) => e.movie.id > 0).reduce((s, e) => s + (e.movie.runtime || 110), 0);
    // серіали
    const episodes = state.tracking.reduce((s, e) => s + watchedCount(e), 0);
    const tvMinutes = state.tracking.reduce((s, e) => s + watchedCount(e) * (e.meta?.runtime ?? e.show.runtime ?? 45), 0);
    const watchingNow = state.tracking.filter((e) => effectiveStatus(e) === 'watching').length;
    const showsDone = new Set([...state.tracking.filter((e) => effectiveStatus(e) === 'completed').map((e) => e.show.id), ...state.watched.filter((e) => e.movie.id < 0).map((e) => e.movie.id)]).size;
    const moviesWatched = state.watched.filter((e) => e.movie.id > 0).length;
    const avgLiked = likes ? state.liked.reduce((s, e) => s + e.movie.rating, 0) / likes : 0;

    const genreCount = new Map<number, number>();
    state.liked.forEach((e) => e.movie.genreIds.forEach((g) => genreCount.set(g, (genreCount.get(g) ?? 0) + 1)));
    const topGenres = [...genreCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

    const decades = new Map<string, number>();
    state.liked.forEach((e) => {
      const y = Number(e.movie.releaseDate.slice(0, 4));
      if (y) decades.set(`${Math.floor(y / 10) * 10}-ті`, (decades.get(`${Math.floor(y / 10) * 10}-ті`) ?? 0) + 1);
    });
    const decadeList = [...decades.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    const days: { label: string; count: number }[] = [];
    const dayNames = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const start = d.getTime();
      const end = start + 86400000;
      days.push({ label: dayNames[d.getDay()], count: state.history.filter((h) => h.at >= start && h.at < end).length });
    }

    const rated = state.watched.filter((e) => e.myRating);
    const myAvg = rated.length ? rated.reduce((s, e) => s + (e.myRating ?? 0), 0) / rated.length : 0;

    return {
      likes,
      nopes,
      swipes,
      likeRate: totalDecisions ? Math.round((likes / totalDecisions) * 100) : 0,
      hours: Math.round(minutes / 60),
      avgLiked,
      topGenres,
      decadeList,
      days,
      myAvg,
      episodes,
      tvHours: Math.round(tvMinutes / 60),
      watchingNow,
      showsDone,
      moviesWatched,
    };
  }, [state]);

  const level = levelFor(stats.swipes + state.watched.length * 3 + stats.episodes);

  const saveKey = async () => {
    const k = key.trim();
    if (!k) {
      dispatch({ type: 'settings', settings: { apiKey: '' } });
      setKeyStatus(null);
      return;
    }
    setChecking(true);
    const ok = await validateKey(k);
    setChecking(false);
    setKeyStatus(ok ? 'ok' : 'bad');
    if (ok) dispatch({ type: 'settings', settings: { apiKey: k, demo: false } });
  };

  const reset = () => {
    const doReset = () => dispatch({ type: 'resetLibrary' });
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.('Очистити бібліотеку та статистику?\n\nЯкщо ви увійшли в акаунт, бібліотеку буде очищено й у хмарі. Спершу можна зберегти резервну копію.')) doReset();
      return;
    }
    Alert.alert('Очистити бібліотеку?', 'Буде видалено всі вподобані, переглянуті фільми та статистику.', [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Очистити', style: 'destructive', onPress: doReset },
    ]);
  };

  const [backupMsg, setBackupMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const restore = async () => {
    const r = await pickBackup();
    if (!r) return;
    if (typeof r === 'string') return setBackupMsg({ text: r, ok: false });
    dispatch({ type: 'importData', data: r });
    setBackupMsg({ text: `Додано з копії: ${r.liked.length} в обраному, ${r.watched.length} переглянутих`, ok: true });
  };

  const since = new Date(state.profile.createdAt).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
  const maxDay = Math.max(1, ...stats.days.map((d) => d.count));
  const maxGenre = Math.max(1, ...stats.topGenres.map((g) => g[1]));
  const maxDecade = Math.max(1, ...stats.decadeList.map((d) => d[1]));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top + 6, paddingHorizontal: 16, paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Профіль</Text>

      {/* Акаунт */}
      <LinearGradient colors={['#2A1530', '#1A1426', '#121220']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroRow}>
          <LinearGradient colors={gradients.brand} style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={{ fontSize: 40 }}>{state.profile.avatar}</Text>
            </View>
          </LinearGradient>
          <View style={{ flex: 1, marginLeft: 16 }}>
            {editing ? (
              <TextInput
                value={name}
                onChangeText={setName}
                autoFocus
                maxLength={24}
                style={styles.nameInput}
                onSubmitEditing={() => {
                  dispatch({ type: 'profile', profile: { name: name.trim() || 'Кіноман' } });
                  setEditing(false);
                }}
                onBlur={() => {
                  dispatch({ type: 'profile', profile: { name: name.trim() || 'Кіноман' } });
                  setEditing(false);
                }}
              />
            ) : (
              <Pressable
                onPress={() => {
                  setName(state.profile.name);
                  setEditing(true);
                }}
                accessibilityLabel="Змінити ім'я"
                style={{ flexDirection: 'row', alignItems: 'center' }}
              >
                <Text style={styles.name} numberOfLines={1}>
                  {state.profile.name}
                </Text>
                <Ionicons name="pencil" size={15} color={colors.textMuted} style={{ marginLeft: 8 }} />
              </Pressable>
            )}
            <Text style={styles.since}>З нами з {since}</Text>
            <View style={styles.level}>
              <Text style={styles.levelText}>
                {level.emoji} {level.name}
              </Text>
            </View>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 16 }} contentContainerStyle={{ gap: 8 }}>
          {AVATARS.map((a) => (
            <Pressable key={a} onPress={() => dispatch({ type: 'profile', profile: { avatar: a } })} style={[styles.avatarOpt, state.profile.avatar === a && { borderColor: colors.accent, backgroundColor: colors.accent + '22' }]}>
              <Text style={{ fontSize: 22 }}>{a}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.progressTrack}>
          <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.progressFill, { width: `${Math.round(level.progress * 100)}%` }]} />
        </View>
        <Text style={styles.progressText}>{level.next ? `До рівня «${level.next}»: ${level.left} дій` : 'Максимальний рівень 🏆'}</Text>
      </LinearGradient>

      <AccountCard />
      <ObsidianLink />

      {/* Статистика */}
      <SectionTitle>Статистика</SectionTitle>
      <View style={styles.grid}>
        <Stat icon="flame" color={colors.accent} value={stats.swipes} label="Свайпів" />
        <Stat icon="heart" color={colors.like} value={stats.likes} label="Подобається" />
        <Stat icon="close-circle" color={colors.nope} value={stats.nopes} label="Не цікаво" />
        <Stat icon="eye" color={colors.watched} value={stats.moviesWatched} label="Фільмів переглянуто" />
        <Stat icon="time" color={colors.gold} value={`≈${stats.hours}`} label="Годин кіно" />
        <Stat icon="play-circle" color={colors.accent2} value={state.trailersViewed} label="Трейлерів" />
        <Stat icon="pie-chart" color="#B57BFF" value={`${stats.likeRate}%`} label="Вподобань" />
        <Stat icon="star" color={colors.gold} value={stats.myAvg ? stats.myAvg.toFixed(1) : stats.avgLiked ? stats.avgLiked.toFixed(1) : '—'} label={stats.myAvg ? 'Моя сер. оцінка' : 'Сер. рейтинг ❤️'} />
      </View>

      {stats.episodes || stats.watchingNow || stats.showsDone ? (
        <>
          <SectionTitle>Серіали</SectionTitle>
          <View style={styles.grid}>
            <Stat icon="play-circle" color={colors.accent} value={stats.watchingNow} label="Дивлюсь зараз" />
            <Stat icon="checkmark-done-circle" color={colors.like} value={stats.showsDone} label="Серіалів переглянуто" />
            <Stat icon="tv" color={colors.watched} value={stats.episodes} label="Серій переглянуто" />
            <Stat icon="time" color={colors.gold} value={`≈${stats.tvHours}`} label="Годин серіалів" />
          </View>
        </>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Активність за тиждень</Text>
        <View style={styles.week}>
          {stats.days.map((d, i) => (
            <View key={i} style={styles.weekCol}>
              <Text style={styles.weekCount}>{d.count || ''}</Text>
              <View style={styles.weekTrack}>
                <LinearGradient colors={gradients.brand} style={{ height: `${Math.max(4, (d.count / maxDay) * 100)}%`, borderRadius: 6, opacity: d.count ? 1 : 0.25 }} />
              </View>
              <Text style={styles.weekLabel}>{d.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Улюблені жанри</Text>
        {stats.topGenres.length ? (
          stats.topGenres.map(([g, c]) => (
            <View key={g} style={styles.barRow}>
              <Text style={styles.barLabel} numberOfLines={1}>
                {genreEmoji(g)} {genreName(g)}
              </Text>
              <View style={styles.barTrack}>
                <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.barFill, { width: `${(c / maxGenre) * 100}%` }]} />
              </View>
              <Text style={styles.barValue}>{c}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.muted}>Вподобайте кілька фільмів, і тут з’явиться ваш смак.</Text>
        )}
      </View>

      {stats.decadeList.length ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Улюблені епохи</Text>
          {stats.decadeList.map(([d, c]) => (
            <View key={d} style={styles.barRow}>
              <Text style={styles.barLabel}>{d}</Text>
              <View style={styles.barTrack}>
                <LinearGradient colors={gradients.watched} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.barFill, { width: `${(c / maxDecade) * 100}%` }]} />
              </View>
              <Text style={styles.barValue}>{c}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Налаштування */}
      <SectionTitle>База фільмів</SectionTitle>
      <View style={styles.card}>
        <View style={styles.dbHeader}>
          <View style={[styles.dot, { backgroundColor: api.demo ? colors.gold : colors.like }]} />
          <Text style={styles.cardTitleInline}>{api.demo ? 'Демо-режим (12 фільмів)' : 'Підключено до TMDB'}</Text>
        </View>
        <Text style={styles.muted}>
          {api.demo
            ? 'Дані фільмів беруться з TMDB — безкоштовної бази з понад мільйоном фільмів, IMDb-ідентифікаторами та трейлерами. Отримайте безкоштовний ключ і вставте його нижче.'
            : 'Понад мільйон фільмів з TMDB: описи, рейтинги, трейлери, актори й посилання на IMDb.'}
        </Text>
        {showKey ? (
          <>
          <View style={styles.keyRow}>
            <TextInput
              value={key}
              onChangeText={(t) => {
                setKey(t);
                setKeyStatus(null);
              }}
              placeholder={ENV_API_KEY ? 'Власний ключ (необов’язково)' : 'TMDB API Key або Read Access Token'}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!!key && keyStatus === 'ok'}
              style={styles.keyInput}
            />
            {keyStatus === 'ok' ? <Ionicons name="checkmark-circle" size={22} color={colors.like} /> : keyStatus === 'bad' ? <Ionicons name="alert-circle" size={22} color={colors.nope} /> : null}
          </View>
          {keyStatus === 'bad' ? <Text style={[styles.muted, { color: colors.nope }]}>Ключ не підходить або немає з’єднання.</Text> : null}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <GradientButton title={checking ? 'Перевіряємо…' : 'Зберегти ключ'} icon="key" small onPress={saveKey} style={{ flex: 1 }} />
            <Pressable style={styles.linkBtn} onPress={() => Linking.openURL('https://www.themoviedb.org/settings/api')}>
              <Text style={styles.link}>Отримати ключ</Text>
              <Ionicons name="open-outline" size={14} color={colors.accent} />
            </Pressable>
          </View>
          </>
        ) : (
          <Pressable onPress={() => setShowKey(true)} style={{ marginTop: 10 }} hitSlop={6}>
            <Text style={styles.link}>Використати власний ключ TMDB</Text>
          </Pressable>
        )}
        {checking ? <ActivityIndicator color={colors.accent} style={{ marginTop: 10 }} /> : null}
      </View>

      <SectionTitle>Налаштування</SectionTitle>
      <View style={styles.card}>
        <Text style={styles.settingLabel}>Мова назв і описів</Text>
        <View style={{ marginTop: 10 }}>
          <Segmented
            value={state.settings.language}
            onChange={(v) => dispatch({ type: 'settings', settings: { language: v } })}
            options={[
              { value: 'uk-UA', label: '🇺🇦 Українська' },
              { value: 'en-US', label: '🇬🇧 English' },
            ]}
          />
        </View>
        {Platform.OS !== 'web' ? <Row label="Вібровідгук" value={state.settings.haptics} onChange={(v) => dispatch({ type: 'settings', settings: { haptics: v } })} /> : null}
        <Row label="Демо-режим" value={api.demo} disabled={!(state.settings.apiKey || ENV_API_KEY)} onChange={(v) => dispatch({ type: 'settings', settings: { demo: v } })} />
        {backupSupported ? (
          <>
            <Text style={[styles.settingLabel, { marginTop: 20 }]}>Резервна копія</Text>
            <Text style={[styles.muted, { marginTop: 4 }]}>Збережіть бібліотеку у файл або відновіть її з файлу — дані з копії додаються до наявних.</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Pressable onPress={() => downloadBackup(syncDataOf(state))} style={({ pressed }) => [styles.backupBtn, pressed && { opacity: 0.7 }]}>
                <Ionicons name="download-outline" size={17} color={colors.text} />
                <Text style={styles.backupText}>Зберегти</Text>
              </Pressable>
              <Pressable onPress={restore} style={({ pressed }) => [styles.backupBtn, pressed && { opacity: 0.7 }]}>
                <Ionicons name="push-outline" size={17} color={colors.text} />
                <Text style={styles.backupText}>Відновити</Text>
              </Pressable>
            </View>
            {backupMsg ? <Text style={[styles.muted, { marginTop: 8, color: backupMsg.ok ? colors.like : colors.nope }]}>{backupMsg.text}</Text> : null}
          </>
        ) : null}
        <Pressable onPress={reset} style={styles.danger}>
          <Ionicons name="trash-outline" size={18} color={colors.nope} />
          <Text style={styles.dangerText}>Очистити бібліотеку і статистику</Text>
        </Pressable>
      </View>
      <Text style={styles.footer}>MovieCasting 1.0 · Дані: TMDB · Цей продукт використовує TMDB API, але не схвалений і не сертифікований TMDB.</Text>
    </ScrollView>
  );
}

function Stat({ icon, color, value, label }: { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; value: string | number; label: string }) {
  return (
    <View style={styles.stat}>
      <View style={[styles.statIcon, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Row({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.settingLabel, disabled && { color: colors.textMuted }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: colors.accent, false: colors.border }} thumbColor="#fff" />
    </View>
  );
}

const LEVELS = [
  { at: 0, name: 'Новачок', emoji: '🌱' },
  { at: 20, name: 'Глядач', emoji: '🎟️' },
  { at: 75, name: 'Кіноман', emoji: '🍿' },
  { at: 200, name: 'Критик', emoji: '🧐' },
  { at: 500, name: 'Режисер', emoji: '🎬' },
  { at: 1200, name: 'Легенда', emoji: '🏆' },
];
function levelFor(points: number) {
  let i = 0;
  while (i < LEVELS.length - 1 && points >= LEVELS[i + 1].at) i++;
  const cur = LEVELS[i];
  const nxt = LEVELS[i + 1];
  return {
    ...cur,
    next: nxt?.name,
    left: nxt ? nxt.at - points : 0,
    progress: nxt ? (points - cur.at) / (nxt.at - cur.at) : 1,
  };
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -0.5, marginBottom: 14, marginLeft: 4 },
  hero: { borderRadius: radius.lg, padding: 18, borderWidth: 1, borderColor: colors.border },
  heroRow: { flexDirection: 'row', alignItems: 'center' },
  avatarRing: { width: 84, height: 84, borderRadius: 42, padding: 3 },
  avatar: { flex: 1, borderRadius: 40, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.text, fontSize: 22, fontWeight: '800', flexShrink: 1 },
  nameInput: { color: colors.text, fontSize: 22, fontWeight: '800', borderBottomWidth: 1, borderBottomColor: colors.accent, paddingVertical: 2 },
  since: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  level: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.08)' },
  levelText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  avatarOpt: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent', backgroundColor: 'rgba(255,255,255,0.05)' },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 16, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressText: { color: colors.textMuted, fontSize: 12, marginTop: 6, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { width: '48%', flexGrow: 1, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.border },
  statIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statValue: { color: colors.text, fontSize: 24, fontWeight: '900', marginTop: 10 },
  statLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: 2 },
  card: { backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: colors.border, marginTop: 12 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 12 },
  cardTitleInline: { color: colors.text, fontSize: 15, fontWeight: '800' },
  week: { flexDirection: 'row', justifyContent: 'space-between', height: 130 },
  weekCol: { flex: 1, alignItems: 'center' },
  weekCount: { color: colors.textDim, fontSize: 11, fontWeight: '700', height: 16 },
  weekTrack: { flex: 1, width: 18, justifyContent: 'flex-end', marginVertical: 4 },
  weekLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  barLabel: { color: colors.textDim, fontSize: 13, fontWeight: '700', width: 128 },
  barTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 5 },
  barValue: { color: colors.text, fontSize: 13, fontWeight: '800', width: 30, textAlign: 'right' },
  muted: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  dbHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingHorizontal: 12, height: 46, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  keyInput: { flex: 1, color: colors.text, fontSize: 14, height: '100%' },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8 },
  link: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  settingLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  backupBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  backupText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  danger: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  dangerText: { color: colors.nope, fontSize: 15, fontWeight: '700' },
  footer: { color: colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: 24, lineHeight: 16, paddingHorizontal: 20 },
});
