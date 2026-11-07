import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, GradientButton, Poster, RatingBadge, Segmented } from '../../components/ui';
import { genreEmoji, genreName } from '../../lib/genres';
import { ListName, useHaptics, useStore } from '../../lib/store';
import { year } from '../../lib/tmdb';
import { LibraryEntry } from '../../lib/types';
import { colors, gradients, radius, TAB_BAR_HEIGHT } from '../../theme';

type Sort = 'recent' | 'rating' | 'mine' | 'year' | 'title';
const SORTS: { value: Sort; label: string }[] = [
  { value: 'recent', label: 'Нещодавні' },
  { value: 'rating', label: 'Рейтинг' },
  { value: 'mine', label: 'Моя оцінка' },
  { value: 'year', label: 'Рік' },
  { value: 'title', label: 'А–Я' },
];
type View_ = 'grid' | 'list';
type Undo = { entries: LibraryEntry[]; list: ListName; text: string } | null;

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { state, dispatch, isWatched, isLiked } = useStore();
  const haptic = useHaptics();
  const [tab, setTab] = useState<ListName>('liked');
  const [sort, setSort] = useState<Sort>('recent');
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState<number | null>(null);
  const [hideWatched, setHideWatched] = useState(false);
  const [view, setView] = useState<View_>('grid');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [undo, setUndo] = useState<Undo>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cols = width > 700 ? 5 : 3;
  const gap = 10;
  const cardW = (Math.min(width, 1100) - 32 - gap * (cols - 1)) / cols;
  const bottomPad = TAB_BAR_HEIGHT + Math.max(insets.bottom, 12) + 12;

  // при зміні вкладки — скидаємо вибір і жанр
  useEffect(() => {
    setSelecting(false);
    setSelected(new Set());
    setGenre(null);
  }, [tab]);

  const source = state[tab];

  const genresHere = useMemo(() => {
    const count = new Map<number, number>();
    source.forEach((e) => e.movie.genreIds.forEach((g) => count.set(g, (count.get(g) ?? 0) + 1)));
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
  }, [source]);

  const data = useMemo(() => {
    let list = [...source];
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((e) => e.movie.title.toLowerCase().includes(q) || e.movie.originalTitle.toLowerCase().includes(q));
    if (genre) list = list.filter((e) => e.movie.genreIds.includes(genre));
    if (tab === 'liked' && hideWatched) list = list.filter((e) => !isWatched(e.movie.id));
    const by: Record<Sort, (a: LibraryEntry, b: LibraryEntry) => number> = {
      recent: (a, b) => b.at - a.at,
      rating: (a, b) => b.movie.rating - a.movie.rating,
      mine: (a, b) => (b.myRating ?? 0) - (a.myRating ?? 0) || b.movie.rating - a.movie.rating,
      year: (a, b) => (b.movie.releaseDate || '').localeCompare(a.movie.releaseDate || ''),
      title: (a, b) => a.movie.title.localeCompare(b.movie.title, 'uk'),
    };
    return list.sort(by[sort]);
  }, [source, tab, query, genre, sort, hideWatched, isWatched]);

  const showUndo = (u: NonNullable<Undo>) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo(u);
    undoTimer.current = setTimeout(() => setUndo(null), 5000);
  };

  const removeEntries = (entries: LibraryEntry[]) => {
    if (!entries.length) return;
    dispatch({ type: 'removeMany', ids: entries.map((e) => e.movie.id), list: tab });
    haptic('warning');
    showUndo({
      entries,
      list: tab,
      text: entries.length === 1 ? `«${entries[0].movie.title}» видалено` : `Видалено фільмів: ${entries.length}`,
    });
  };

  const toggleSelect = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedEntries = data.filter((e) => selected.has(e.movie.id));
  const allSelected = data.length > 0 && selectedEntries.length === data.length;

  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const pickRandom = () => {
    const pool = state.liked.filter((e) => !isWatched(e.movie.id));
    if (!pool.length) return;
    haptic('light');
    router.push(`/movie/${pool[Math.floor(Math.random() * pool.length)].movie.id}`);
  };

  const hours = Math.round(source.reduce((s, e) => s + (e.movie.runtime || 110), 0) / 60);
  const unwatchedLiked = state.liked.filter((e) => !isWatched(e.movie.id)).length;

  const onPressItem = (e: LibraryEntry) => (selecting ? toggleSelect(e.movie.id) : router.push(`/movie/${e.movie.id}`));
  const onLongItem = (e: LibraryEntry) => {
    haptic('light');
    setSelecting(true);
    toggleSelect(e.movie.id);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      {/* Заголовок */}
      <View style={styles.header}>
        <Text style={[styles.title, width < 380 && { fontSize: 24 }]}>Бібліотека</Text>
        <View style={styles.headerBtns}>
          {!selecting && unwatchedLiked > 0 ? <IconBtn icon="dice-outline" label="Випадковий фільм" onPress={pickRandom} /> : null}
          <IconBtn icon={view === 'grid' ? 'list' : 'grid-outline'} label="Вигляд" onPress={() => setView((v) => (v === 'grid' ? 'list' : 'grid'))} />
          <Pressable onPress={() => (selecting ? exitSelect() : setSelecting(true))} style={[styles.selectBtn, selecting && { backgroundColor: colors.accent }]} disabled={!source.length}>
            <Text style={[styles.selectText, !source.length && { opacity: 0.4 }]}>{selecting ? 'Готово' : 'Вибрати'}</Text>
          </Pressable>
        </View>
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
          <TextInput value={query} onChangeText={setQuery} placeholder="Пошук у бібліотеці" placeholderTextColor={colors.textMuted} style={styles.search} />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chipsRow}>
        {SORTS.filter((s) => s.value !== 'mine' || tab === 'watched').map((s) => (
          <Chip key={s.value} label={s.label} active={sort === s.value} onPress={() => setSort(s.value)} />
        ))}
        {tab === 'liked' ? <Chip label="Без переглянутих" icon="🙈" active={hideWatched} onPress={() => setHideWatched((v) => !v)} /> : null}
      </ScrollView>
      {genresHere.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chipsRow}>
          <Chip label="Усі жанри" active={!genre} onPress={() => setGenre(null)} />
          {genresHere.map((g) => (
            <Chip key={g} label={genreName(g)} icon={genreEmoji(g)} active={genre === g} onPress={() => setGenre(genre === g ? null : g)} />
          ))}
        </ScrollView>
      ) : null}

      <Text style={styles.summary}>
        {selecting ? `Вибрано: ${selected.size}` : `${data.length} ${plural(data.length)}${source.length ? ` · ≈${hours} год кіно` : ''}`}
        {!selecting && source.length ? '  ·  утримуйте, щоб вибрати кілька' : ''}
      </Text>

      <FlatList
        key={`${view}-${cols}`}
        data={data}
        numColumns={view === 'grid' ? cols : 1}
        keyExtractor={(e) => String(e.movie.id)}
        columnWrapperStyle={view === 'grid' ? { gap } : undefined}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: bottomPad + (selecting ? 80 : 20), gap }}
        ListEmptyComponent={<Empty tab={tab} filtered={!!query || !!genre || hideWatched} />}
        renderItem={({ item }) => {
          const sel = selected.has(item.movie.id);
          if (view === 'list') {
            return (
              <Pressable onPress={() => onPressItem(item)} onLongPress={() => onLongItem(item)} style={({ pressed }) => [styles.row, sel && styles.rowSelected, pressed && { opacity: 0.85 }]}>
                <Poster path={item.movie.posterPath} size="w185" rounded={10} style={{ width: 64, height: 96 }} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.movie.title}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {year(item.movie)} · {item.movie.genreIds.slice(0, 2).map(genreName).join(', ')}
                  </Text>
                  <View style={styles.rowBadges}>
                    <RatingBadge value={item.movie.rating} style={{ backgroundColor: colors.card }} />
                    {item.myRating ? <Text style={styles.mine}>моя {item.myRating}/10</Text> : null}
                    {tab === 'liked' && isWatched(item.movie.id) ? <Ionicons name="eye" size={14} color={colors.watched} /> : null}
                  </View>
                  {item.movie.overview ? (
                    <Text style={styles.rowOverview} numberOfLines={2}>
                      {item.movie.overview}
                    </Text>
                  ) : null}
                </View>
                {selecting ? (
                  <Check on={sel} />
                ) : (
                  <View style={styles.rowActions}>
                    {tab === 'liked' ? (
                      <RowAction
                        icon={isWatched(item.movie.id) ? 'eye' : 'eye-outline'}
                        color={isWatched(item.movie.id) ? colors.watched : colors.textDim}
                        onPress={() => dispatch({ type: 'toggleWatched', movie: item.movie })}
                      />
                    ) : tab === 'disliked' ? (
                      <RowAction icon="heart-outline" color={colors.accent} onPress={() => dispatch({ type: 'likeMany', movies: [item.movie] })} />
                    ) : (
                      <RowAction
                        icon={isLiked(item.movie.id) ? 'heart' : 'heart-outline'}
                        color={isLiked(item.movie.id) ? colors.accent : colors.textDim}
                        onPress={() => dispatch({ type: 'toggleLike', movie: item.movie })}
                      />
                    )}
                    <RowAction icon="trash-outline" color={colors.nope} onPress={() => removeEntries([item])} />
                  </View>
                )}
              </Pressable>
            );
          }
          return (
            <Pressable style={({ pressed }) => [{ width: cardW, opacity: pressed ? 0.8 : 1 }]} onPress={() => onPressItem(item)} onLongPress={() => onLongItem(item)}>
              <View>
                <Poster path={item.movie.posterPath} title={item.movie.title} size="w342" style={[{ width: cardW, height: cardW * 1.5 }, sel && { borderWidth: 3, borderColor: colors.accent }]} />
                <View style={styles.cardBadges}>
                  <RatingBadge value={item.movie.rating} />
                </View>
                {selecting ? (
                  <View style={styles.cardCheck}>
                    <Check on={sel} />
                  </View>
                ) : (
                  <Pressable onPress={() => removeEntries([item])} hitSlop={8} style={styles.cardDelete} accessibilityLabel="Видалити">
                    <Ionicons name="close" size={14} color="#fff" />
                  </Pressable>
                )}
                {tab === 'liked' && isWatched(item.movie.id) ? (
                  <View style={styles.watchedMark}>
                    <Ionicons name="eye" size={11} color="#fff" />
                  </View>
                ) : null}
              </View>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.movie.title}
              </Text>
              <Text style={styles.cardMeta}>
                {year(item.movie)}
                {item.myRating ? `  ·  ★ ${item.myRating}` : ''}
              </Text>
            </Pressable>
          );
        }}
      />

      {/* Панель дій для вибраних */}
      {selecting ? (
        <View style={[styles.actionBar, { bottom: bottomPad }]}>
          <BarBtn icon={allSelected ? 'checkbox' : 'square-outline'} label={allSelected ? 'Зняти' : 'Усі'} onPress={() => setSelected(allSelected ? new Set() : new Set(data.map((e) => e.movie.id)))} />
          {tab === 'liked' ? (
            <BarBtn
              icon="eye"
              label="Переглянуто"
              disabled={!selected.size}
              onPress={() => {
                dispatch({ type: 'markWatchedMany', movies: selectedEntries.map((e) => e.movie) });
                haptic('success');
                exitSelect();
              }}
            />
          ) : (
            <BarBtn
              icon="heart"
              label="В обране"
              disabled={!selected.size}
              onPress={() => {
                dispatch({ type: 'likeMany', movies: selectedEntries.map((e) => e.movie) });
                haptic('success');
                exitSelect();
              }}
            />
          )}
          <BarBtn
            icon="trash"
            label={`Видалити${selected.size ? ` (${selected.size})` : ''}`}
            danger
            disabled={!selected.size}
            onPress={() => {
              removeEntries(selectedEntries);
              exitSelect();
            }}
          />
        </View>
      ) : null}

      {/* Скасування видалення */}
      {undo ? (
        <UndoBar
          bottom={bottomPad + (selecting ? 76 : 0)}
          text={undo.text}
          onUndo={() => {
            dispatch({ type: 'restore', entries: undo.entries, list: undo.list });
            setUndo(null);
          }}
        />
      ) : null}
    </View>
  );
}

const plural = (n: number) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'фільм';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'фільми';
  return 'фільмів';
};

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function IconBtn({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={20} color={colors.text} />
    </Pressable>
  );
}

function RowAction({ icon, color, onPress }: { icon: IconName; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.rowAction, pressed && { transform: [{ scale: 0.9 }] }]}>
      <Ionicons name={icon} size={20} color={color} />
    </Pressable>
  );
}

function Check({ on }: { on: boolean }) {
  return (
    <View style={[styles.check, on && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
      {on ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
    </View>
  );
}

function BarBtn({ icon, label, onPress, danger, disabled }: { icon: IconName; label: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  const c = danger ? colors.nope : colors.text;
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.barBtn, { opacity: disabled ? 0.35 : pressed ? 0.7 : 1 }]}>
      <Ionicons name={icon} size={20} color={c} />
      <Text style={[styles.barText, { color: c }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function UndoBar({ bottom, text, onUndo }: { bottom: number; text: string; onUndo: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
  }, [anim]);
  return (
    <Animated.View style={[styles.undo, { bottom, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] }]}>
      <Ionicons name="trash-outline" size={18} color={colors.textDim} />
      <Text style={styles.undoText} numberOfLines={1}>
        {text}
      </Text>
      <Pressable onPress={onUndo} hitSlop={10}>
        <Text style={styles.undoBtn}>Скасувати</Text>
      </Pressable>
    </Animated.View>
  );
}

function Empty({ tab, filtered }: { tab: ListName; filtered: boolean }) {
  const text = filtered
    ? 'Нічого не знайдено. Спробуйте змінити пошук або фільтр.'
    : tab === 'liked'
      ? 'Свайпайте вправо в «Кастингу» або ставте ❤️ у трейлерах — фільми з’являться тут.'
      : tab === 'watched'
        ? 'Свайп вгору або кнопка 👁 позначає фільм як переглянутий.'
        : 'Тут зберігаються фільми, які ви відхилили.';
  return (
    <View style={styles.empty}>
      <Text style={{ fontSize: 46 }}>{filtered ? '🔍' : tab === 'liked' ? '💘' : tab === 'watched' ? '🍿' : '🗑️'}</Text>
      <Text style={styles.emptyText}>{text}</Text>
      {!filtered && tab !== 'disliked' ? <GradientButton title="До кастингу" icon="flame" small onPress={() => router.push('/')} style={{ marginTop: 16 }} colorsPair={gradients.brand} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 14, minHeight: 44 },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -0.5 },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  selectBtn: { height: 40, paddingHorizontal: 14, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  selectText: { color: colors.text, fontWeight: '800', fontSize: 14 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingHorizontal: 14, height: 44, borderRadius: radius.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  search: { flex: 1, color: colors.text, fontSize: 15, height: '100%' },
  chipsScroll: { flexGrow: 0, marginTop: 10 },
  chipsRow: { paddingHorizontal: 16 },
  summary: { color: colors.textMuted, fontSize: 12, fontWeight: '700', paddingHorizontal: 16, marginTop: 2, marginBottom: 4 },
  cardBadges: { position: 'absolute', top: 6, left: 6 },
  cardDelete: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(10,10,18,0.75)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  cardCheck: { position: 'absolute', top: 6, right: 6 },
  watchedMark: { position: 'absolute', bottom: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.watched, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 6 },
  cardMeta: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: radius.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  rowSelected: { borderColor: colors.accent, backgroundColor: colors.accent + '14' },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  rowMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  rowBadges: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  mine: { color: colors.gold, fontSize: 12, fontWeight: '800' },
  rowOverview: { color: colors.textDim, fontSize: 12, lineHeight: 17, marginTop: 6 },
  rowActions: { marginLeft: 8, gap: 10 },
  rowAction: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)', backgroundColor: 'rgba(10,10,18,0.6)', alignItems: 'center', justifyContent: 'center' },
  actionBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 560,
    alignSelf: 'center',
  },
  barBtn: { alignItems: 'center', gap: 3, flex: 1 },
  barText: { fontSize: 11, fontWeight: '800' },
  undo: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#26263A',
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 560,
    alignSelf: 'center',
  },
  undoText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
  undoBtn: { color: colors.accent, fontSize: 14, fontWeight: '900' },
  empty: { alignItems: 'center', paddingTop: 50, paddingHorizontal: 30 },
  emptyText: { color: colors.textDim, fontSize: 15, textAlign: 'center', marginTop: 10, lineHeight: 21 },
});
