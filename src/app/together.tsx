import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SwipeDeck, SwipeDeckHandle } from '../components/SwipeDeck';
import { GhostButton, GradientButton, Poster, RoundButton, Segmented, Toast } from '../components/ui';
import { useCloud } from '../lib/cloud';
import { goBack } from '../lib/nav';
import { appendDeck, buildDeck, createRoom, fetchActivity, fetchRoom, joinRoom, leaveRoom, matchesOf, normalizeCode, Room, RoomMember, RoomSwipe, sendSwipe, undoSwipe } from '../lib/rooms';
import { shareLink } from '../lib/share';
import { useHaptics, useStore } from '../lib/store';
import { year } from '../lib/tmdb';
import { Filters, Movie, SwipeKind } from '../lib/types';
import { colors, gradients, radius } from '../theme';

const THIS_YEAR = new Date().getFullYear();
const ROOM_GENRES: { id: number | null; label: string; emoji: string }[] = [
  { id: null, label: 'Будь-що', emoji: '🎲' },
  { id: 35, label: 'Комедія', emoji: '😂' },
  { id: 28, label: 'Бойовик', emoji: '💥' },
  { id: 27, label: 'Жахи', emoji: '😱' },
  { id: 53, label: 'Трилер', emoji: '🔪' },
  { id: 10749, label: 'Романтика', emoji: '💘' },
  { id: 878, label: 'Фантастика', emoji: '🚀' },
  { id: 18, label: 'Драма', emoji: '🎭' },
  { id: 80, label: 'Кримінал', emoji: '🕵️' },
  { id: 16, label: 'Анімація', emoji: '🎨' },
];
const ROOM_ERAS = [
  { id: 'any', label: 'Будь-які роки', from: null, to: null },
  { id: 'new', label: 'Новинки', from: THIS_YEAR - 5, to: null },
  { id: 'modern', label: 'Після 2000', from: 2000, to: null },
  { id: 'classic', label: 'Класика', from: null, to: 1999 },
];
const POLL_MS = 3500;

/** «Кастинг удвох»: спільна колода, кожен свайпає у себе, метч — коли фільм сподобався всім. */
export default function TogetherScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const focused = useIsFocused();
  const cloud = useCloud();
  const { api, state, dispatch, isLiked } = useStore();
  const haptic = useHaptics();
  const params = useLocalSearchParams<{ code?: string }>();
  const userId = cloud.userId;
  const roomCode = state.settings.roomCode ?? null;
  const me = { name: state.profile.name, avatar: state.profile.avatar };

  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [swipes, setSwipes] = useState<RoomSwipe[]>([]);
  const [local, setLocal] = useState<Map<number, boolean>>(new Map()); // мої свайпи, ще не підтверджені сервером
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<'swipe' | 'matches'>('swipe');
  const [celebrate, setCelebrate] = useState<Movie | null>(null);
  const [genre, setGenre] = useState<number | null>(null);
  const [era, setEra] = useState('any');
  const [joinCode, setJoinCode] = useState(typeof params.code === 'string' ? normalizeCode(params.code) : '');
  const deck = useRef<SwipeDeckHandle>(null);
  const seenMatches = useRef<Set<number> | null>(null);
  const history = useRef<Movie[]>([]);
  const extending = useRef(false);
  const autoJoined = useRef(false);

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2400);
  };

  const setRoomCode = (code: string | null) => dispatch({ type: 'settings', settings: { roomCode: code } });

  /* ───── завантаження кімнати та опитування ───── */
  const loadRoom = useCallback(async () => {
    if (!roomCode || !userId) return;
    try {
      const r = await fetchRoom(roomCode);
      if (!r) {
        setRoomCode(null);
        setRoom(null);
        setError('Кімнату видалено');
        return;
      }
      setRoom(r);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, userId]);

  const poll = useCallback(async () => {
    if (!roomCode || !userId) return;
    try {
      const a = await fetchActivity(roomCode);
      setMembers(a.members);
      setSwipes(a.swipes);
    } catch {
      /* тимчасова помилка мережі — спробуємо наступного разу */
    }
  }, [roomCode, userId]);

  useEffect(() => {
    seenMatches.current = null;
    history.current = [];
    setLocal(new Map());
    setMembers([]);
    setSwipes([]);
    setRoom(null);
    if (roomCode && userId) {
      loadRoom();
      poll();
    }
  }, [roomCode, userId, loadRoom, poll]);

  useEffect(() => {
    if (!roomCode || !userId || !focused) return;
    const t = setInterval(poll, POLL_MS);
    // колоду (вона більша) — рідше
    const d = setInterval(loadRoom, POLL_MS * 6);
    return () => {
      clearInterval(t);
      clearInterval(d);
    };
  }, [roomCode, userId, focused, poll, loadRoom]);

  // посилання-запрошення: одразу приєднуємось, коли користувач увійшов
  useEffect(() => {
    const code = typeof params.code === 'string' ? normalizeCode(params.code) : '';
    if (!code || !userId || autoJoined.current || code === roomCode) return;
    autoJoined.current = true;
    join(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.code, userId]);

  /* ───── похідні дані ───── */
  const mySwipes = useMemo(() => {
    const m = new Map<number, boolean>();
    swipes.forEach((s) => s.user_id === userId && m.set(s.movie_id, s.liked));
    local.forEach((v, k) => m.set(k, v));
    return m;
  }, [swipes, local, userId]);

  const allSwipes = useMemo(() => {
    const list = swipes.filter((s) => !(s.user_id === userId && local.has(s.movie_id)));
    local.forEach((liked, movie_id) => userId && list.push({ user_id: userId, movie_id, liked }));
    return list;
  }, [swipes, local, userId]);

  const roster = useMemo(() => {
    const list = [...members];
    if (userId && !list.some((m) => m.user_id === userId)) list.push({ user_id: userId, name: me.name, avatar: me.avatar });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, userId]);

  const matches = useMemo(() => (room ? matchesOf(room.deck, roster, allSwipes) : []), [room, roster, allSwipes]);
  const remaining = useMemo(() => (room ? room.deck.filter((m) => !mySwipes.has(m.id)) : []), [room, mySwipes]);

  // новий метч від друга — святкуємо
  useEffect(() => {
    if (!room || !members.length) return;
    if (seenMatches.current === null) {
      seenMatches.current = new Set(matches.map((m) => m.id));
      return;
    }
    const fresh = matches.find((m) => !seenMatches.current!.has(m.id));
    matches.forEach((m) => seenMatches.current!.add(m.id));
    if (fresh) {
      setCelebrate(fresh);
      haptic('success');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches]);

  // колода закінчується — непомітно додаємо ще фільмів
  useEffect(() => {
    if (!room || remaining.length > 5 || extending.current || !roomCode) return;
    extending.current = true;
    buildDeck(api, room.filters, new Set(room.deck.map((m) => m.id)), 40)
      .then((more) => (more.length ? appendDeck(roomCode, more) : room.deck))
      .then((d) => setRoom((r) => (r ? { ...r, deck: d } : r)))
      .catch(() => {})
      .finally(() => setTimeout(() => (extending.current = false), 4000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining.length, room?.code]);

  /* ───── дії ───── */
  const create = async () => {
    if (!userId) return;
    setBusy('create');
    setError(null);
    try {
      const e = ROOM_ERAS.find((x) => x.id === era)!;
      const filters: Partial<Filters> = { genres: genre ? [genre] : [], yearFrom: e.from, yearTo: e.to };
      const first = await buildDeck(api, filters, new Set(), 50);
      if (!first.length) throw new Error('Під ці побажання не знайшлося фільмів');
      const g = ROOM_GENRES.find((x) => x.id === genre)!;
      const title = `${g.emoji} ${g.label} · ${e.label}`;
      const code = await createRoom(first, title, filters, me, userId);
      setRoomCode(code);
      haptic('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не вдалося створити кімнату');
    } finally {
      setBusy(null);
    }
  };

  const join = async (raw: string) => {
    if (!userId) return;
    const code = normalizeCode(raw);
    if (code.length !== 6) return setError('Код кімнати — 6 символів');
    setBusy('join');
    setError(null);
    try {
      await joinRoom(code, me, userId);
      setRoomCode(code);
      haptic('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не вдалося приєднатися');
    } finally {
      setBusy(null);
    }
  };

  const invite = async () => {
    if (!roomCode) return;
    const res = await shareLink('MovieCasting удвох', `Обираймо фільм разом у MovieCasting! Код кімнати: ${roomCode}`, `/together?code=${roomCode}`);
    if (res === 'copied') flash('Запрошення скопійовано — надішліть другу');
  };

  const leave = () => {
    const doLeave = async () => {
      if (roomCode && userId) await leaveRoom(roomCode, userId).catch(() => {});
      setRoomCode(null);
    };
    const text = 'Метчі цієї кімнати зникнуть з цього екрана. Повернутися можна за тим самим кодом.';
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`Вийти з кімнати?\n\n${text}`)) doLeave();
      return;
    }
    Alert.alert('Вийти з кімнати?', text, [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Вийти', style: 'destructive', onPress: doLeave },
    ]);
  };

  const onSwipe = (movie: Movie, kind: SwipeKind) => {
    if (!roomCode || !userId) return;
    const liked = kind === 'like';
    history.current = [movie, ...history.current].slice(0, 30);
    setLocal((prev) => new Map(prev).set(movie.id, liked));
    haptic(liked ? 'success' : 'light');
    // якщо всі інші вже вподобали — метч одразу, не чекаючи сервера
    if (liked && roster.length >= 2) {
      const others = roster.filter((m) => m.user_id !== userId);
      const ok = others.every((o) => swipes.some((s) => s.user_id === o.user_id && s.movie_id === movie.id && s.liked));
      if (ok) {
        seenMatches.current?.add(movie.id);
        setCelebrate(movie);
      }
    }
    sendSwipe(roomCode, userId, movie.id, liked).catch((e) => {
      setLocal((prev) => {
        const n = new Map(prev);
        n.delete(movie.id);
        return n;
      });
      flash(e instanceof Error ? e.message : 'Не вдалося зберегти свайп');
    });
  };

  const undo = () => {
    const m = history.current.shift();
    if (!m || !roomCode || !userId) return;
    haptic('warning');
    setLocal((prev) => {
      const n = new Map(prev);
      n.delete(m.id);
      return n;
    });
    setSwipes((prev) => prev.filter((s) => !(s.user_id === userId && s.movie_id === m.id)));
    undoSwipe(roomCode, userId, m.id).catch(() => {});
  };

  /* ───── екрани ───── */
  const header = (title: string, right?: React.ReactNode) => (
    <View style={styles.header}>
      <Pressable onPress={goBack} hitSlop={10} accessibilityLabel="Назад">
        <Ionicons name="chevron-back" size={26} color={colors.text} />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={{ minWidth: 26, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );

  if (!cloud.enabled || !userId) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
        {header('Кастинг удвох')}
        <ScrollView contentContainerStyle={styles.pad}>
          <Intro />
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Потрібен акаунт</Text>
            <Text style={styles.muted}>
              {cloud.enabled
                ? 'Щоб свайпати разом, увійдіть або зареєструйтесь у Профілі — це хвилина. Друг теж має увійти у своєму телефоні.'
                : 'Хмарний акаунт ще не підключено, тому спільні кімнати поки недоступні.'}
            </Text>
            {cloud.enabled ? <GradientButton title="Увійти в Профілі" icon="log-in-outline" onPress={() => router.push('/profile')} style={{ marginTop: 14 }} /> : null}
            {joinCode ? <Text style={[styles.muted, { marginTop: 10 }]}>Після входу поверніться за посиланням — ми одразу додамо вас у кімнату {joinCode}.</Text> : null}
          </View>
        </ScrollView>
      </View>
    );
  }

  if (!roomCode) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
        {header('Кастинг удвох')}
        <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
          <Intro />

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Приєднатися до друга</Text>
            <Text style={styles.muted}>Введіть код, який вам надіслали.</Text>
            <View style={styles.codeRow}>
              <TextInput
                value={joinCode}
                onChangeText={(t) => setJoinCode(normalizeCode(t))}
                placeholder="КОД"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={6}
                onSubmitEditing={() => join(joinCode)}
                style={styles.codeInput}
              />
              <GradientButton title={busy === 'join' ? '…' : 'Увійти'} icon="enter-outline" small onPress={busy ? undefined : () => join(joinCode)} style={{ flexShrink: 0 }} />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Створити кімнату</Text>
            <Text style={styles.muted}>Що будемо дивитись? Колода з добрих фільмів (рейтинг 6+), однакова для всіх у кімнаті.</Text>
            <View style={styles.chips}>
              {ROOM_GENRES.map((g) => (
                <Pressable key={String(g.id)} onPress={() => setGenre(g.id)} style={[styles.chip, genre === g.id && styles.chipOn]}>
                  <Text style={[styles.chipText, genre === g.id && { color: colors.text }]}>
                    {g.emoji} {g.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={[styles.chips, { marginTop: 4 }]}>
              {ROOM_ERAS.map((e) => (
                <Pressable key={e.id} onPress={() => setEra(e.id)} style={[styles.chip, era === e.id && styles.chipOn]}>
                  <Text style={[styles.chipText, era === e.id && { color: colors.text }]}>{e.label}</Text>
                </Pressable>
              ))}
            </View>
            <GradientButton title={busy === 'create' ? 'Збираємо колоду…' : 'Створити й запросити'} icon="people" onPress={busy ? undefined : create} style={{ marginTop: 14 }} />
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>
      </View>
    );
  }

  if (!room) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
        {header('Кастинг удвох')}
        <View style={styles.center}>
          {error ? (
            <>
              <Text style={styles.error}>{error}</Text>
              <GradientButton title="Спробувати ще" icon="refresh" onPress={loadRoom} style={{ marginTop: 14 }} />
              <GhostButton title="Вийти з кімнати" onPress={() => setRoomCode(null)} style={{ marginTop: 10 }} />
            </>
          ) : (
            <ActivityIndicator color={colors.accent} size="large" />
          )}
        </View>
      </View>
    );
  }

  const alone = roster.length < 2;
  const counts = new Map<string, number>();
  allSwipes.forEach((s) => counts.set(s.user_id, (counts.get(s.user_id) ?? 0) + 1));
  const cols = width > 700 ? 5 : 3;
  const cardW = (Math.min(width, 900) - 32 - 10 * (cols - 1)) / cols;
  const newMatches = matches.filter((m) => !isLiked(m.id));

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      {header(
        'Кастинг удвох',
        <Pressable onPress={leave} hitSlop={10} accessibilityLabel="Вийти з кімнати">
          <Ionicons name="exit-outline" size={24} color={colors.textDim} />
        </Pressable>,
      )}

      <View style={styles.roomBar}>
        <Pressable onPress={invite} style={styles.codePill} accessibilityLabel="Запросити друга">
          <Text style={styles.codeLabel}>КОД</Text>
          <Text style={styles.codeValue}>{room.code}</Text>
          <Ionicons name="share-outline" size={16} color={colors.accent} />
        </Pressable>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center' }} style={{ flex: 1 }}>
          {roster.map((m) => (
            <View key={m.user_id} style={styles.member}>
              <Text style={{ fontSize: 16 }}>{m.avatar ?? '🙂'}</Text>
              <Text style={styles.memberName} numberOfLines={1}>
                {m.user_id === userId ? 'Ви' : m.name ?? 'Друг'} · {counts.get(m.user_id) ?? 0}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>
      {room.title ? <Text style={styles.roomTitle}>{room.title}</Text> : null}

      {alone ? (
        <Pressable onPress={invite} style={styles.waiting}>
          <Ionicons name="person-add-outline" size={18} color={colors.gold} />
          <Text style={styles.waitingText}>Чекаємо на друга. Натисніть, щоб надіслати запрошення, а поки можна свайпати.</Text>
        </Pressable>
      ) : null}

      <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'swipe', label: '🃏 Свайпи', count: remaining.length },
            { value: 'matches', label: '💞 Метчі', count: matches.length },
          ]}
        />
      </View>

      {tab === 'swipe' ? (
        <>
          <View style={{ flex: 1, marginTop: 12 }}>
            {remaining.length ? (
              <SwipeDeck ref={deck} movies={remaining} onSwipe={onSwipe} onOpen={(m) => router.push(`/movie/${m.id}`)} />
            ) : (
              <View style={styles.center}>
                <ActivityIndicator color={colors.accent} />
                <Text style={[styles.muted, { marginTop: 10 }]}>Додаємо ще фільмів у колоду…</Text>
              </View>
            )}
          </View>
          <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 14) + 4 }]}>
            <RoundButton icon="arrow-undo" size={48} color={colors.gold} onPress={undo} disabled={!history.current.length} />
            <RoundButton icon="close" size={66} color={colors.nope} onPress={() => deck.current?.swipe('nope')} disabled={!remaining.length} iconSize={34} />
            <RoundButton icon="heart" size={66} color={colors.like} filled={gradients.brand} onPress={() => deck.current?.swipe('like')} disabled={!remaining.length} iconSize={32} />
          </View>
        </>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
          {matches.length ? (
            <>
              {newMatches.length ? (
                <GhostButton
                  title={`Додати в Обране (${newMatches.length})`}
                  icon="heart-outline"
                  onPress={() => {
                    dispatch({ type: 'likeMany', movies: newMatches });
                    flash('Метчі додано в Обране');
                  }}
                  style={{ marginBottom: 14 }}
                />
              ) : null}
              <View style={styles.grid}>
                {matches.map((m) => (
                  <Pressable key={m.id} style={{ width: cardW }} onPress={() => router.push(`/movie/${m.id}`)}>
                    <Poster path={m.posterPath} title={m.title} size="w342" style={{ width: cardW, height: cardW * 1.5 }} />
                    <Text style={styles.gridTitle} numberOfLines={1}>
                      {m.title}
                    </Text>
                    <Text style={styles.gridMeta}>
                      {year(m)} · ★ {m.rating ? m.rating.toFixed(1) : '—'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <View style={[styles.center, { paddingTop: 50 }]}>
              <Text style={{ fontSize: 46 }}>💞</Text>
              <Text style={[styles.muted, { textAlign: 'center', marginTop: 8 }]}>
                {alone ? 'Метчі з’являться, коли друг приєднається і вам обом сподобається той самий фільм.' : 'Поки збігів немає — свайпайте далі, вони з’являться тут.'}
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {toast ? <Toast text={toast} bottom={Math.max(insets.bottom, 14) + 90} /> : null}

      {celebrate ? (
        <View style={styles.celebrate}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,10,18,0.985)' }]} />
          <LinearGradient colors={['rgba(255,61,113,0.32)', 'rgba(10,10,18,0)']} style={StyleSheet.absoluteFill} />
          <Text style={styles.celebrateTitle}>Це метч! 🎉</Text>
          <Text style={styles.celebrateText}>Вам обом сподобався фільм</Text>
          <Poster path={celebrate.posterPath} title={celebrate.title} size="w500" rounded={radius.lg} style={styles.celebratePoster} />
          <Text style={styles.celebrateMovie}>{celebrate.title}</Text>
          <Text style={styles.muted}>
            {year(celebrate)} · ★ {celebrate.rating ? celebrate.rating.toFixed(1) : '—'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 22, width: '100%', maxWidth: 420 }}>
            <GhostButton title="Свайпати далі" onPress={() => setCelebrate(null)} style={{ flex: 1 }} tight />
            <GradientButton
              title="Відкрити"
              icon="film-outline"
              onPress={() => {
                const m = celebrate;
                setCelebrate(null);
                router.push(`/movie/${m.id}`);
              }}
              style={{ flex: 1 }}
              tight
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Intro() {
  return (
    <View style={styles.intro}>
      <Text style={styles.introEmoji}>👫🍿</Text>
      <Text style={styles.introTitle}>Оберіть фільм разом</Text>
      <Step n={1} text="Створіть кімнату й надішліть другові код або посилання" />
      <Step n={2} text="Кожен свайпає ту саму колоду у своєму телефоні" />
      <Step n={3} text="Фільм, що сподобався обом, — це метч. Ось і кіно на вечір!" />
    </View>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepN}>
        <Text style={styles.stepNText}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: 16, paddingBottom: 60, width: '100%', maxWidth: 640, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 6, gap: 10 },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: '800', flex: 1, textAlign: 'center' },
  intro: { alignItems: 'center', paddingVertical: 10 },
  introEmoji: { fontSize: 44 },
  introTitle: { color: colors.text, fontSize: 24, fontWeight: '900', marginTop: 6, marginBottom: 10 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'stretch', marginTop: 8 },
  stepN: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent + '33', alignItems: 'center', justifyContent: 'center' },
  stepNText: { color: colors.accent, fontWeight: '900' },
  stepText: { flex: 1, color: colors.textDim, fontSize: 14, lineHeight: 19, fontWeight: '600' },
  card: { backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: 16, borderWidth: 1, borderColor: colors.border, marginTop: 16 },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 6 },
  muted: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  error: { color: colors.nope, fontSize: 14, textAlign: 'center', marginTop: 14 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  codeInput: { flex: 1, minWidth: 0, height: 46, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: 20, fontWeight: '900', letterSpacing: 4, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.accent + '26' },
  chipText: { color: colors.textDim, fontWeight: '700', fontSize: 13 },
  roomBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, marginTop: 4 },
  codePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36, borderRadius: radius.pill, backgroundColor: colors.accent + '1F', borderWidth: 1, borderColor: colors.accent + '66' },
  codeLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '900' },
  codeValue: { color: colors.text, fontSize: 15, fontWeight: '900', letterSpacing: 2 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 32, borderRadius: radius.pill, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, maxWidth: 160 },
  memberName: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
  roomTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '700', paddingHorizontal: 16, marginTop: 8 },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 10, padding: 10, borderRadius: radius.md, backgroundColor: colors.gold + '1A', borderWidth: 1, borderColor: colors.gold + '55' },
  waitingText: { flex: 1, color: colors.textDim, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22, paddingTop: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridTitle: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 6 },
  gridMeta: { color: colors.textMuted, fontSize: 11 },
  celebrate: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 50 },
  celebrateTitle: { color: '#fff', fontSize: 36, fontWeight: '900' },
  celebrateText: { color: colors.textDim, fontSize: 15, marginTop: 4, marginBottom: 18 },
  celebratePoster: { width: 180, height: 270, borderWidth: 2, borderColor: colors.accent },
  celebrateMovie: { color: colors.text, fontSize: 22, fontWeight: '900', marginTop: 14, textAlign: 'center' },
});
