import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SwipeDeck, SwipeDeckHandle } from '../../components/SwipeDeck';
import { GradientButton, GhostButton, RoundButton } from '../../components/ui';
import { countActiveFilters, useHaptics, useStore } from '../../lib/store';
import { discover } from '../../lib/tmdb';
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
  const page = useRef(1);
  const totalPages = useRef(1);
  const loadingRef = useRef(false);
  const seenRef = useRef(seen);
  seenRef.current = seen;
  const generation = useRef(0);

  const filtersKey = JSON.stringify(state.filters) + api.language + String(api.demo) + api.apiKey;

  const loadMore = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    const gen = generation.current;
    try {
      let added: Movie[] = [];
      // гортаємо сторінки, доки не знайдемо непереглянуті фільми
      for (let tries = 0; tries < 6 && added.length < 8 && page.current <= totalPages.current; tries++) {
        const res = await discover(api, state.filters, page.current);
        if (gen !== generation.current) return;
        totalPages.current = res.totalPages;
        page.current += 1;
        added = added.concat(res.movies.filter((m) => !seenRef.current.has(m.id)));
      }
      setQueue((q) => {
        const ids = new Set(q.map((m) => m.id));
        return [...q, ...added.filter((m) => !ids.has(m.id))];
      });
      if (page.current > totalPages.current && added.length === 0) setExhausted(true);
    } catch (e) {
      if (gen === generation.current) setError(e instanceof Error ? e.message : 'Не вдалося завантажити фільми');
    } finally {
      if (gen === generation.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  // Скидання колоди при зміні фільтрів / ключа
  useEffect(() => {
    if (!state.ready) return;
    generation.current += 1;
    loadingRef.current = false;
    page.current = 1;
    totalPages.current = 1;
    setQueue([]);
    setExhausted(false);
    loadMore();
  }, [filtersKey, state.ready, loadMore]);

  useEffect(() => {
    if (state.ready && queue.length < 5 && !exhausted && !error) loadMore();
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

  const activeFilters = countActiveFilters(state.filters);
  const bottomPad = TAB_BAR_HEIGHT + Math.max(insets.bottom, 12) + 12;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>
            Movie<Text style={{ color: colors.accent }}>Casting</Text>
          </Text>
          <Text style={styles.sub}>{api.demo ? 'Демо-режим · додайте ключ у Профілі' : 'Свайпай і знаходь своє кіно'}</Text>
        </View>
        <Pressable onPress={() => router.push('/filters')} style={({ pressed }) => [styles.filterBtn, pressed && { opacity: 0.7 }]}>
          <Ionicons name="options-outline" size={22} color={colors.text} />
          {activeFilters ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilters}</Text>
            </View>
          ) : null}
        </Pressable>
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

      <View style={[styles.actions, { paddingBottom: bottomPad }]}>
        <RoundButton icon="arrow-undo" size={48} color={colors.gold} onPress={undo} disabled={!lastMovie.current.length} />
        <RoundButton icon="close" size={66} color={colors.nope} onPress={() => deck.current?.swipe('nope')} disabled={!queue.length} iconSize={34} />
        <RoundButton icon="eye" size={52} color={colors.watched} onPress={() => deck.current?.swipe('watched')} disabled={!queue.length} />
        <RoundButton icon="heart" size={66} color={colors.like} filled={gradients.brand} onPress={() => deck.current?.swipe('like')} disabled={!queue.length} iconSize={32} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  logo: { color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  sub: { color: colors.textMuted, fontSize: 13, marginTop: 2, fontWeight: '600' },
  filterBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
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
