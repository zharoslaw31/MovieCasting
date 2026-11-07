import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SwipeDeck, SwipeDeckHandle } from '../../components/SwipeDeck';
import { GradientButton, GhostButton, RoundButton } from '../../components/ui';
import { countActiveFilters, useHaptics, useStore } from '../../lib/store';
import { createPager, Pager } from '../../lib/tmdb';
import { Movie, SwipeKind } from '../../lib/types';
import { colors, gradients, radius, TAB_BAR_HEIGHT } from '../../theme';

export default function CastingScreen() {
  const insets = useSafeAreaInsets();
  const { state, seen, swipe, dispatch, api } = useStore();
  const haptic = useHaptics();
  const deck = useRef<SwipeDeckHandle>(null);
  const [queue, setQueue] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const pager = useRef<Pager | null>(null);
  const loadingRef = useRef(false);
  const seenRef = useRef(seen);
  seenRef.current = seen;
  const generation = useRef(0);
  const [shuffleTick, setShuffleTick] = useState(0);

  const filtersKey = JSON.stringify(state.filters) + api.language + String(api.demo) + api.apiKey + shuffleTick;

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !pager.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    const gen = generation.current;
    const p = pager.current;
    try {
      let added: Movie[] = [];
      let emptyRounds = 0;
      // тягнемо по 3 випадкові сторінки паралельно, доки не наберемо нових фільмів
      while (added.length < 12 && emptyRounds < 3 && !p.exhausted()) {
        const batches = await Promise.all([p.next(), p.next(), p.next()]);
        if (gen !== generation.current) return;
        const fresh = batches.flat().filter((m) => !seenRef.current.has(m.id) && !added.some((x) => x.id === m.id));
        if (fresh.length) {
          added = added.concat(fresh);
          emptyRounds = 0;
        } else emptyRounds++;
      }
      setQueue((q) => {
        const ids = new Set(q.map((m) => m.id));
        return [...q, ...shuffleArr(added.filter((m) => !ids.has(m.id)))];
      });
      if (!added.length && (p.exhausted() || emptyRounds >= 3)) setExhausted(true);
    } catch (e) {
      if (gen === generation.current) setError(e instanceof Error ? e.message : 'Не вдалося завантажити фільми');
    } finally {
      if (gen === generation.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, []);

  // Нова колода при зміні фільтрів / ключа / натисканні «Перемішати»
  useEffect(() => {
    if (!state.ready) return;
    generation.current += 1;
    loadingRef.current = false;
    pager.current = createPager(api, state.filters);
    setQueue([]);
    setExhausted(false);
    loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, state.ready, loadMore]);

  useEffect(() => {
    if (state.ready && queue.length < 6 && !exhausted && !error) loadMore();
  }, [queue.length, exhausted, error, loadMore, state.ready]);

  const onSwipe = useCallback(
    (movie: Movie, kind: SwipeKind) => {
      swipe(movie, kind);
      haptic(kind === 'like' ? 'success' : 'light');
      setQueue((q) => q.filter((m) => m.id !== movie.id));
    },
    [swipe, haptic],
  );

  const lastMovie = useRef<Movie[]>([]);
  const handleSwipe = (movie: Movie, kind: SwipeKind) => {
    lastMovie.current = [movie, ...lastMovie.current].slice(0, 30);
    onSwipe(movie, kind);
  };

  const undo = () => {
    const m = lastMovie.current.shift();
    if (!m) return;
    dispatch({ type: 'undo' });
    haptic('warning');
    setQueue((q) => [m, ...q.filter((x) => x.id !== m.id)]);
  };

  // клавіатура на комп'ютері: ← ні, → подобається, ↑ бачив, Backspace — скасувати
  const undoRef = useRef(undo);
  undoRef.current = undo;
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (!location.pathname.replace(/\/+$/, '').endsWith('/MovieCasting') && location.pathname !== '/') return;
      if (e.key === 'ArrowRight') deck.current?.swipe('like');
      else if (e.key === 'ArrowLeft') deck.current?.swipe('nope');
      else if (e.key === 'ArrowUp') deck.current?.swipe('watched');
      else if (e.key === 'Backspace') undoRef.current();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { width } = useWindowDimensions();
  const activeFilters = countActiveFilters(state.filters);
  const bottomPad = TAB_BAR_HEIGHT + Math.max(insets.bottom, 12) + 12;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.logo, width < 380 && { fontSize: 22 }]}>
            Movie<Text style={{ color: colors.accent }}>Casting</Text>
          </Text>
          <Text style={styles.sub}>{api.demo ? 'Демо-режим · додайте ключ у Профілі' : state.filters.sortBy === 'random' ? 'Випадкові фільми з усієї бази' : 'Свайпай і знаходь своє кіно'}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable accessibilityLabel="Пошук фільму" onPress={() => router.push('/search')} style={({ pressed }) => [styles.filterBtn, pressed && { opacity: 0.7 }]}>
          <Ionicons name="search" size={21} color={colors.text} />
        </Pressable>
        <Pressable
          accessibilityLabel="Перемішати"
          onPress={() => {
            haptic('light');
            setShuffleTick((t) => t + 1);
          }}
          style={({ pressed }) => [styles.filterBtn, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="shuffle" size={22} color={colors.text} />
        </Pressable>
        <Pressable accessibilityLabel="Фільтри" onPress={() => router.push('/filters')} style={({ pressed }) => [styles.filterBtn, pressed && { opacity: 0.7 }]}>
          <Ionicons name="options-outline" size={22} color={colors.text} />
          {activeFilters ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilters}</Text>
            </View>
          ) : null}
        </Pressable>
        </View>
      </View>

      <View style={{ flex: 1, marginTop: 12 }}>
        {queue.length ? (
          <SwipeDeck ref={deck} movies={queue} onSwipe={handleSwipe} onOpen={(m) => router.push(`/movie/${m.id}`)} />
        ) : (
          <View style={styles.empty}>
            {error ? (
              <>
                <Text style={styles.emptyEmoji}>⚠️</Text>
                <Text style={styles.emptyTitle}>Щось пішло не так</Text>
                <Text style={styles.emptyText}>{error}</Text>
                <GradientButton title="Спробувати ще" icon="refresh" onPress={loadMore} style={{ marginTop: 20 }} />
                <GhostButton title="Відкрити профіль" icon="key-outline" onPress={() => router.push('/profile')} style={{ marginTop: 10 }} />
              </>
            ) : loading || !state.ready ? (
              <>
                <ActivityIndicator color={colors.accent} size="large" />
                <Text style={[styles.emptyText, { marginTop: 14 }]}>Підбираємо фільми…</Text>
              </>
            ) : (
              <>
                <Text style={styles.emptyEmoji}>🎬</Text>
                <Text style={styles.emptyTitle}>Фільми закінчились</Text>
                <Text style={styles.emptyText}>
                  {api.demo
                    ? 'У демо-режимі лише 12 фільмів. Додайте безкоштовний ключ TMDB у Профілі, щоб відкрити всю базу.'
                    : 'Під ці фільтри більше нічого немає. Спробуйте розширити пошук.'}
                </Text>
                <GradientButton title="Змінити фільтри" icon="options-outline" onPress={() => router.push('/filters')} style={{ marginTop: 20 }} />
              </>
            )}
          </View>
        )}
      </View>

      {state.ready && !state.settings.onboarded && queue.length ? (
        <Pressable style={styles.tipWrap} onPress={() => dispatch({ type: 'settings', settings: { onboarded: true } })}>
          <View style={styles.tip}>
            <Text style={styles.tipTitle}>Як це працює</Text>
            <TipRow icon="arrow-forward" color={colors.like} text="Свайп вправо — подобається, фільм піде в Обране" />
            <TipRow icon="arrow-back" color={colors.nope} text="Свайп вліво — не цікаво, більше не покажемо" />
            <TipRow icon="arrow-up" color={colors.watched} text="Свайп вгору — вже бачив, можна оцінити" />
            <TipRow icon="information-circle-outline" color={colors.textDim} text="Тап по картці — опис, трейлер, актори, де подивитись" />
            <GradientButton title="Зрозуміло" icon="checkmark" onPress={() => dispatch({ type: 'settings', settings: { onboarded: true } })} style={{ marginTop: 16 }} />
          </View>
        </Pressable>
      ) : null}

      <View style={[styles.actions, { paddingBottom: bottomPad }]}>
        <RoundButton icon="arrow-undo" size={48} color={colors.gold} onPress={undo} disabled={!lastMovie.current.length} />
        <RoundButton icon="close" size={66} color={colors.nope} onPress={() => deck.current?.swipe('nope')} disabled={!queue.length} iconSize={34} />
        <RoundButton icon="eye" size={52} color={colors.watched} onPress={() => deck.current?.swipe('watched')} disabled={!queue.length} />
        <RoundButton icon="heart" size={66} color={colors.like} filled={gradients.brand} onPress={() => deck.current?.swipe('like')} disabled={!queue.length} iconSize={32} />
      </View>
    </View>
  );
}

function TipRow({ icon, color, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; text: string }) {
  return (
    <View style={styles.tipRow}>
      <View style={[styles.tipIcon, { backgroundColor: color + '26' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.tipText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tipWrap: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(5,5,10,0.72)', alignItems: 'center', justifyContent: 'center', padding: 22, zIndex: 30 },
  tip: { width: '100%', maxWidth: 420, backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: 20, borderWidth: 1, borderColor: colors.border },
  tipTitle: { color: colors.text, fontSize: 20, fontWeight: '900', marginBottom: 12 },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  tipIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  tipText: { flex: 1, color: colors.textDim, fontSize: 14, lineHeight: 19, fontWeight: '600' },
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  logo: { color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  sub: { color: colors.textMuted, fontSize: 13, marginTop: 2, fontWeight: '600' },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, paddingTop: 16 },
  empty: {
    flex: 1,
    marginHorizontal: 14,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 12 },
  emptyText: { color: colors.textDim, fontSize: 15, textAlign: 'center', marginTop: 8, lineHeight: 21 },
});

function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
