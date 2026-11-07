import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useIsFocused } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, Share, StyleSheet, Text, View, ListViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrailerPlayer } from '../../components/TrailerPlayer';
import { GradientButton } from '../../components/ui';
import { genreName } from '../../lib/genres';
import { useHaptics, useStore } from '../../lib/store';
import { feed, FeedKind, IMG, trailerKey, year } from '../../lib/tmdb';
import { Movie } from '../../lib/types';
import { colors, TAB_BAR_HEIGHT } from '../../theme';

type Item = { movie: Movie; key: string };

const KINDS: { value: FeedKind; label: string }[] = [
  { value: 'popular', label: 'Популярне' },
  { value: 'upcoming', label: 'Скоро' },
  { value: 'now_playing', label: 'У кіно' },
  { value: 'top_rated', label: 'Топ' },
];

export default function TrailersScreen() {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const { api, dispatch } = useStore();
  const [kind, setKind] = useState<FeedKind>('popular');
  const [items, setItems] = useState<Item[]>([]);
  const [height, setHeight] = useState(0);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const page = useRef(1);
  const total = useRef(1);
  const busy = useRef(false);
  const gen = useRef(0);
  const list = useRef<FlatList<Item>>(null);

  const apiKey = `${api.apiKey}|${api.language}|${api.demo}`;

  const load = useCallback(async () => {
    if (busy.current || page.current > total.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    const g = gen.current;
    try {
      const res = await feed(api, kind, page.current);
      total.current = res.totalPages;
      page.current += 1;
      const keys = await Promise.all(res.movies.map((m) => trailerKey(api, m.id).catch(() => null)));
      if (g !== gen.current) return;
      const fresh = res.movies.map((movie, i) => ({ movie, key: keys[i] })).filter((x): x is Item => !!x.key);
      setItems((prev) => {
        const ids = new Set(prev.map((p) => p.movie.id));
        return [...prev, ...fresh.filter((f) => !ids.has(f.movie.id))];
      });
    } catch (e) {
      if (g === gen.current) setError(e instanceof Error ? e.message : 'Помилка завантаження');
    } finally {
      if (g === gen.current) {
        busy.current = false;
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, apiKey]);

  useEffect(() => {
    gen.current += 1;
    busy.current = false;
    page.current = 1;
    total.current = 1;
    setItems([]);
    setActive(0);
    list.current?.scrollToOffset({ offset: 0, animated: false });
    load();
  }, [load]);

  const viewConfig = useRef({ itemVisiblePercentThreshold: 70 }).current;
  const onViewable = useRef(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setActive(first.index);
  }).current;

  useEffect(() => {
    if (items.length && active >= items.length - 3) load();
    if (items.length) dispatch({ type: 'trailerViewed' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <View style={styles.screen} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {height > 0 && items.length > 0 ? (
        <FlatList
          ref={list}
          data={items}
          keyExtractor={(i) => String(i.movie.id)}
          renderItem={({ item, index }) => (
            <TrailerItem item={item} height={height} active={focused && index === active} near={Math.abs(index - active) <= 1} bottomInset={TAB_BAR_HEIGHT + Math.max(insets.bottom, 12)} />
          )}
          pagingEnabled
          snapToInterval={height}
          snapToAlignment="start"
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={viewConfig}
          windowSize={3}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          removeClippedSubviews
          onEndReachedThreshold={2}
          onEndReached={load}
        />
      ) : (
        <View style={styles.center}>
          {error ? (
            <>
              <Text style={styles.emptyEmoji}>⚠️</Text>
              <Text style={styles.emptyText}>{error}</Text>
              <GradientButton title="Спробувати ще" icon="refresh" onPress={load} style={{ marginTop: 18 }} />
            </>
          ) : loading || !height ? (
            <>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={[styles.emptyText, { marginTop: 12 }]}>Завантажуємо трейлери…</Text>
            </>
          ) : (
            <Text style={styles.emptyText}>Трейлерів поки немає</Text>
          )}
        </View>
      )}

      <View style={[styles.tabs, { top: insets.top + 8 }]} pointerEvents="box-none">
        {KINDS.map((k) => (
          <Pressable key={k.value} onPress={() => setKind(k.value)} hitSlop={8}>
            <Text style={[styles.tab, kind === k.value && styles.tabActive]}>{k.label}</Text>
            {kind === k.value ? <View style={styles.tabLine} /> : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const TrailerItem = React.memo(function TrailerItem({
  item,
  height,
  active,
  near,
  bottomInset,
}: {
  item: Item;
  height: number;
  active: boolean;
  near: boolean;
  bottomInset: number;
}) {
  const { movie, key } = item;
  const { isLiked, isWatched, dispatch } = useStore();
  const haptic = useHaptics();
  const liked = isLiked(movie.id);
  const watched = isWatched(movie.id);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!active) setStarted(false);
    else {
      const t = setTimeout(() => setStarted(true), 350); // не вантажимо плеєр під час швидкого гортання
      return () => clearTimeout(t);
    }
  }, [active]);

  const bg = IMG(movie.backdropPath ?? movie.posterPath, 'w780');
  const thumb = `https://img.youtube.com/vi/${key}/hqdefault.jpg`;

  return (
    <View style={{ height, backgroundColor: '#000' }}>
      {near && bg ? <Image source={{ uri: bg }} style={StyleSheet.absoluteFill} blurRadius={30} contentFit="cover" /> : null}
      <LinearGradient colors={['rgba(0,0,0,0.65)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.9)']} style={StyleSheet.absoluteFill} />

      <View style={[styles.video, { top: Math.max(64, Math.min(height * 0.14, height - 560)) }]}>
        {active && started ? (
          <TrailerPlayer videoKey={key} />
        ) : (
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setStarted(true)}>
            {near ? <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
            <View style={styles.playWrap}>
              <View style={styles.play}>
                <Ionicons name="play" size={30} color="#fff" style={{ marginLeft: 4 }} />
              </View>
            </View>
          </Pressable>
        )}
      </View>

      <View style={[styles.side, { bottom: bottomInset + 24 }]}>
        <SideButton
          icon={liked ? 'heart' : 'heart-outline'}
          color={liked ? colors.accent : '#fff'}
          label={liked ? 'В обраному' : 'Подобається'}
          onPress={() => {
            dispatch({ type: 'toggleLike', movie });
            haptic(liked ? 'light' : 'success');
          }}
        />
        <SideButton icon={watched ? 'eye' : 'eye-outline'} color={watched ? colors.watched : '#fff'} label={watched ? 'Переглянуто' : 'Бачив'} onPress={() => dispatch({ type: 'toggleWatched', movie })} />
        <SideButton icon="information-circle-outline" color="#fff" label="Про фільм" onPress={() => router.push(`/movie/${movie.id}`)} />
        <SideButton
          icon="share-social-outline"
          color="#fff"
          label="Поділитись"
          onPress={() => Share.share({ message: `${movie.title} (${year(movie)}) — трейлер: https://youtu.be/${key}` }).catch(() => Linking.openURL(`https://www.youtube.com/watch?v=${key}`))}
        />
      </View>

      <View style={[styles.info, { bottom: bottomInset + 20 }]}>
        <Text style={styles.title} numberOfLines={2}>
          {movie.title}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{year(movie)}</Text>
          <Text style={styles.dot}>•</Text>
          <Ionicons name="star" size={13} color={colors.gold} />
          <Text style={styles.meta}> {movie.rating ? movie.rating.toFixed(1) : '—'}</Text>
          {movie.genreIds.slice(0, 2).map((g) => (
            <React.Fragment key={g}>
              <Text style={styles.dot}>•</Text>
              <Text style={styles.meta}>{genreName(g)}</Text>
            </React.Fragment>
          ))}
        </View>
        {movie.overview ? (
          <Text style={styles.overview} numberOfLines={3}>
            {movie.overview}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

function SideButton({ icon, color, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.sideBtn, pressed && { transform: [{ scale: 0.9 }] }]}>
      <View style={styles.sideIcon}>
        <Ionicons name={icon} size={25} color={color} />
      </View>
      <Text style={styles.sideLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  emptyEmoji: { fontSize: 48 },
  emptyText: { color: colors.textDim, fontSize: 15, textAlign: 'center', marginTop: 8 },
  tabs: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 20 },
  tab: { color: 'rgba(255,255,255,0.6)', fontSize: 16, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 },
  tabActive: { color: '#fff', fontWeight: '900' },
  tabLine: { height: 3, width: 22, borderRadius: 2, backgroundColor: colors.accent, alignSelf: 'center', marginTop: 5 },
  video: { position: 'absolute', left: 0, right: 0, aspectRatio: 16 / 9, backgroundColor: '#000', overflow: 'hidden' },
  playWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  play: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.accent + 'E6', alignItems: 'center', justifyContent: 'center' },
  side: { position: 'absolute', right: 8, alignItems: 'center', gap: 8, zIndex: 5 },
  sideBtn: { alignItems: 'center', width: 70 },
  sideIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  sideLabel: { color: '#fff', fontSize: 11, fontWeight: '700', marginTop: 4, textAlign: 'center' },
  info: { position: 'absolute', left: 16, right: 92, zIndex: 5 },
  title: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: -0.3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 6 },
  meta: { color: '#E5E5EF', fontSize: 13, fontWeight: '700' },
  dot: { color: 'rgba(255,255,255,0.5)', marginHorizontal: 6 },
  overview: { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 20, marginTop: 8 },
});

