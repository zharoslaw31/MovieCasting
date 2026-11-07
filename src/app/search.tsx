import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Poster, RatingBadge } from '../components/ui';
import { genreName } from '../lib/genres';
import { goBack } from '../lib/nav';
import { useHaptics, useStore } from '../lib/store';
import { search, year } from '../lib/tmdb';
import { Movie } from '../lib/types';
import { colors, radius } from '../theme';

/** Пошук будь-якого фільму в усій базі TMDB. */
export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { api, dispatch, isLiked, isWatched } = useStore();
  const haptic = useHaptics();
  const params = useLocalSearchParams<{ q?: string }>();
  const [q, setQ] = useState(typeof params.q === 'string' ? params.q : '');
  const [items, setItems] = useState<Movie[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const req = useRef(0);

  const run = async (query: string, p: number) => {
    const id = ++req.current;
    setLoading(true);
    setError(null);
    try {
      const res = await search(api, query, p);
      if (id !== req.current) return;
      setItems((prev) => {
        const base = p === 1 ? [] : prev;
        const ids = new Set(base.map((m) => m.id));
        return [...base, ...res.movies.filter((m) => !ids.has(m.id))];
      });
      setPage(p);
      setTotal(res.totalPages);
    } catch (e) {
      if (id === req.current) setError(e instanceof Error ? e.message : 'Помилка пошуку');
    } finally {
      if (id === req.current) setLoading(false);
    }
  };

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      req.current++;
      setItems([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    const t = setTimeout(() => run(query, 1), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, api.apiKey, api.language, api.demo]);

  const more = () => {
    if (!loading && page < total && q.trim().length >= 2) run(q.trim(), page + 1);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={10} accessibilityLabel="Назад">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View style={styles.input}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            autoFocus
            placeholder="Назва фільму українською або англійською"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            onSubmitEditing={() => Keyboard.dismiss()}
            autoCorrect={false}
            style={styles.inputText}
          />
          {q ? (
            <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityLabel="Очистити">
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(m) => String(m.id)}
        keyboardShouldPersistTaps="handled"
        onEndReached={more}
        onEndReachedThreshold={0.6}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 30, gap: 10 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            {loading ? (
              <ActivityIndicator color={colors.accent} />
            ) : error ? (
              <Text style={styles.emptyText}>{error}</Text>
            ) : q.trim().length >= 2 ? (
              <>
                <Text style={styles.emptyEmoji}>🤷</Text>
                <Text style={styles.emptyText}>Нічого не знайдено. Спробуйте іншу назву або англійською.</Text>
              </>
            ) : (
              <>
                <Text style={styles.emptyEmoji}>🔎</Text>
                <Text style={styles.emptyTitle}>Знайдіть будь-який фільм</Text>
                <Text style={styles.emptyText}>Додайте в обране те, що хочете подивитись, або позначте переглянуте й оцініть.</Text>
              </>
            )}
          </View>
        }
        ListFooterComponent={items.length && loading ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} /> : undefined}
        renderItem={({ item }) => {
          const liked = isLiked(item.id);
          const watched = isWatched(item.id);
          return (
            <Pressable onPress={() => router.push(`/movie/${item.id}`)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
              <Poster path={item.posterPath} size="w185" rounded={10} style={{ width: 60, height: 90 }} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.title} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {[year(item), item.originalTitle !== item.title ? item.originalTitle : null, genreName(item.genreIds[0] ?? 0) !== '—' ? genreName(item.genreIds[0]) : null].filter(Boolean).join(' · ')}
                </Text>
                <View style={{ flexDirection: 'row', marginTop: 6 }}>
                  <RatingBadge value={item.rating} style={{ backgroundColor: colors.card }} />
                </View>
              </View>
              <View style={styles.actions}>
                <Pressable
                  hitSlop={6}
                  accessibilityLabel={watched ? 'Прибрати з переглянутих' : 'Бачив'}
                  onPress={() => {
                    dispatch({ type: 'toggleWatched', movie: item });
                    haptic('light');
                  }}
                  style={[styles.act, watched && { backgroundColor: colors.watched + '33', borderColor: colors.watched }]}
                >
                  <Ionicons name={watched ? 'eye' : 'eye-outline'} size={19} color={watched ? colors.watched : colors.textDim} />
                </Pressable>
                <Pressable
                  hitSlop={6}
                  accessibilityLabel={liked ? 'Прибрати з обраного' : 'В обране'}
                  onPress={() => {
                    dispatch({ type: 'toggleLike', movie: item });
                    haptic(liked ? 'light' : 'success');
                  }}
                  style={[styles.act, liked && { backgroundColor: colors.accent + '33', borderColor: colors.accent }]}
                >
                  <Ionicons name={liked ? 'heart' : 'heart-outline'} size={19} color={liked ? colors.accent : colors.textDim} />
                </Pressable>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  input: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  inputText: { flex: 1, color: colors.text, fontSize: 15, height: '100%' },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 30 },
  emptyEmoji: { fontSize: 46 },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 10 },
  emptyText: { color: colors.textDim, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: radius.lg, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 15, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  actions: { gap: 8, marginLeft: 8 },
  act: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
});
