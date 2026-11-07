import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GradientButton, Poster, RatingBadge, Segmented } from '../../components/ui';
import { useStore } from '../../lib/store';
import { year } from '../../lib/tmdb';
import { LibraryEntry } from '../../lib/types';
import { colors, radius, TAB_BAR_HEIGHT } from '../../theme';

type Tab = 'liked' | 'watched' | 'disliked';
type Sort = 'recent' | 'rating' | 'year' | 'title';
const SORTS: { value: Sort; label: string }[] = [
  { value: 'recent', label: 'Нещодавні' },
  { value: 'rating', label: 'Рейтинг' },
  { value: 'year', label: 'Рік' },
  { value: 'title', label: 'Назва' },
];

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { state, dispatch, isWatched } = useStore();
  const [tab, setTab] = useState<Tab>('liked');
  const [sort, setSort] = useState<Sort>('recent');
  const [query, setQuery] = useState('');
  const [hideWatched, setHideWatched] = useState(false);

  const cols = width > 700 ? 5 : 3;
  const gap = 10;
  const cardW = (Math.min(width, 1100) - 32 - gap * (cols - 1)) / cols;

  const data = useMemo(() => {
    let list = [...state[tab]];
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((e) => e.movie.title.toLowerCase().includes(q) || e.movie.originalTitle.toLowerCase().includes(q));
    if (tab === 'liked' && hideWatched) list = list.filter((e) => !isWatched(e.movie.id));
    const by: Record<Sort, (a: LibraryEntry, b: LibraryEntry) => number> = {
      recent: (a, b) => b.at - a.at,
      rating: (a, b) => (b.myRating ?? b.movie.rating) - (a.myRating ?? a.movie.rating),
      year: (a, b) => (b.movie.releaseDate || '').localeCompare(a.movie.releaseDate || ''),
      title: (a, b) => a.movie.title.localeCompare(b.movie.title, 'uk'),
    };
    return list.sort(by[sort]);
  }, [state, tab, query, sort, hideWatched, isWatched]);

  const pickRandom = () => {
    const pool = state.liked.filter((e) => !isWatched(e.movie.id));
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    router.push(`/movie/${pick.movie.id}`);
  };

  const onLong = (e: LibraryEntry) => {
    const remove = () => dispatch({ type: 'remove', id: e.movie.id, list: tab });
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (globalThis.confirm?.(`Прибрати «${e.movie.title}» зі списку?`)) remove();
      return;
    }
    Alert.alert(e.movie.title, undefined, [
      ...(tab === 'liked' ? [{ text: isWatched(e.movie.id) ? 'Позначити непереглянутим' : 'Позначити переглянутим', onPress: () => dispatch({ type: 'toggleWatched', movie: e.movie }) }] : []),
      { text: 'Прибрати зі списку', style: 'destructive' as const, onPress: remove },
      { text: 'Скасувати', style: 'cancel' as const },
    ]);
  };

  const unwatchedLiked = state.liked.filter((e) => !isWatched(e.movie.id)).length;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Бібліотека</Text>
        {unwatchedLiked > 0 ? (
          <GradientButton title="Що подивитись?" icon="dice-outline" small onPress={pickRandom} />
        ) : null}
      </View>

      <View style={{ paddingHorizontal: 16 }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'liked', label: '❤️ Обране', count: state.liked.length },
            { value: 'watched', label: '👁 Бачив', count: state.watched.length },
            { value: 'disliked', label: '✕ Ні', count: state.disliked.length },
          ]}
        />
        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Пошук у бібліотеці"
            placeholderTextColor={colors.textMuted}
            style={styles.search}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.sortRow}>
          {SORTS.map((s) => (
            <Pressable key={s.value} onPress={() => setSort(s.value)} hitSlop={6}>
              <Text style={[styles.sort, sort === s.value && styles.sortActive]}>{s.label}</Text>
            </Pressable>
          ))}
          {tab === 'liked' ? (
            <Pressable onPress={() => setHideWatched((v) => !v)} style={styles.toggle} hitSlop={6}>
              <Ionicons name={hideWatched ? 'checkbox' : 'square-outline'} size={16} color={hideWatched ? colors.accent : colors.textMuted} />
              <Text style={[styles.sort, hideWatched && styles.sortActive]}>Без переглянутих</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList
        key={cols}
        data={data}
        numColumns={cols}
        keyExtractor={(e) => String(e.movie.id)}
        columnWrapperStyle={{ gap }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 30, gap }}
        ListEmptyComponent={<Empty tab={tab} filtered={!!query} />}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [{ width: cardW, opacity: pressed ? 0.8 : 1 }]}
            onPress={() => router.push(`/movie/${item.movie.id}`)}
            onLongPress={() => onLong(item)}
          >
            <Poster path={item.movie.posterPath} title={item.movie.title} size="w342" style={{ width: cardW, height: cardW * 1.5 }} />
            <View style={styles.cardBadges}>
              <RatingBadge value={item.movie.rating} />
            </View>
            {tab === 'liked' && isWatched(item.movie.id) ? (
              <View style={styles.watchedMark}>
                <Ionicons name="eye" size={12} color="#fff" />
              </View>
            ) : null}
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.movie.title}
            </Text>
            <Text style={styles.cardMeta}>
              {year(item.movie)}
              {item.myRating ? `  ·  моя ${item.myRating}/10` : ''}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

function Empty({ tab, filtered }: { tab: Tab; filtered: boolean }) {
  const text = filtered
    ? 'Нічого не знайдено'
    : tab === 'liked'
      ? 'Свайпайте вправо в «Кастингу» або ставте ❤️ у трейлерах — фільми з’являться тут.'
      : tab === 'watched'
        ? 'Свайп вгору або кнопка 👁 позначає фільм як переглянутий.'
        : 'Тут зберігаються фільми, які ви відхилили.';
  return (
    <View style={styles.empty}>
      <Text style={{ fontSize: 46 }}>{tab === 'liked' ? '💘' : tab === 'watched' ? '🍿' : '🗑️'}</Text>
      <Text style={styles.emptyText}>{text}</Text>
      {!filtered && tab !== 'disliked' ? <GradientButton title="До кастингу" icon="flame" small onPress={() => router.push('/')} style={{ marginTop: 16 }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 14, minHeight: 44 },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -0.5 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  search: { flex: 1, color: colors.text, fontSize: 15, height: '100%' },
  sortRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginTop: 12, marginBottom: 4 },
  sort: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  sortActive: { color: colors.text },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardBadges: { position: 'absolute', top: 6, left: 6 },
  watchedMark: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.watched, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 6 },
  cardMeta: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 30 },
  emptyText: { color: colors.textDim, fontSize: 15, textAlign: 'center', marginTop: 10, lineHeight: 21 },
});
