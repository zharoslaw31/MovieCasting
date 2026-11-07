import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, ScrollViewInstance, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GhostButton, GradientButton } from '../components/ui';
import { genreName } from '../lib/genres';
import { goBack, openTitle } from '../lib/nav';
import { useHaptics, useStore } from '../lib/store';
import { effectiveStatus, epCode, nextToWatch } from '../lib/series';
import { buildTaste, IMG, isTv, MediaKind, tonightCandidates, TonightQuery, year } from '../lib/tmdb';
import { Movie } from '../lib/types';
import { colors, gradients, radius } from '../theme';

const THIS_YEAR = new Date().getFullYear();

type Mood = { id: string; emoji: string; label: string; genres: number[]; any?: boolean; without?: number[]; minRating?: number };
const MOODS: Mood[] = [
  { id: 'fun', emoji: '😂', label: 'Посміятись', genres: [35], without: [27, 18] },
  { id: 'thrill', emoji: '😱', label: 'Полоскотати нерви', genres: [27, 53], any: true },
  { id: 'mind', emoji: '🤯', label: 'Щось закручене', genres: [9648, 878, 53], any: true },
  { id: 'action', emoji: '💥', label: 'Драйв і екшн', genres: [28, 12], any: true },
  { id: 'love', emoji: '💘', label: 'Романтика', genres: [10749], without: [27] },
  { id: 'feel', emoji: '🥹', label: 'Зворушливе', genres: [18], without: [27, 53] },
  { id: 'kids', emoji: '👨‍👩‍👧', label: 'З дітьми', genres: [10751, 16], any: true, without: [27, 53, 80], minRating: 6.3 },
  { id: 'any', emoji: '🎲', label: 'Будь-що', genres: [] },
];
const KINDS = [
  { id: 'movie', label: '🎬 Фільм' },
  { id: 'tv', label: '📺 Серіал' },
  { id: 'any', label: 'Будь-що' },
];
const TIMES = [
  { id: 'short', label: 'До 1,5 год', max: 95 },
  { id: 'mid', label: 'До 2 год', max: 125 },
  { id: 'any', label: 'Не важливо', max: null },
];
const ERAS = [
  { id: 'new', label: 'Новинки', from: THIS_YEAR - 3, to: null },
  { id: 'modern', label: 'Після 2000', from: 2000, to: null },
  { id: 'classic', label: 'Класика', from: null, to: 1999 },
  { id: 'any', label: 'Будь-що', from: null, to: null },
];

type Pick = { movie: Movie; reason: string };

/** «Що подивитись сьогодні»: фільм чи серіал + настрій + час + епоха → 5 варіантів з вашого Обраного і з усієї бази. */
export default function TonightScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { api, state, dispatch, isLiked, isWatched, isDisliked } = useStore();
  const haptic = useHaptics();
  const [kind, setKind] = useState<string>('any');
  const [mood, setMood] = useState<string>('any');
  const [time, setTime] = useState<string>('any');
  const [era, setEra] = useState<string>('any');
  const [picks, setPicks] = useState<Pick[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const pool = useRef<Pick[]>([]);
  const scroll = useRef<ScrollViewInstance>(null);
  const cardTops = useRef<Record<number, number>>({});
  const taste = useMemo(() => buildTaste(state.liked, state.watched, state.disliked), [state.liked, state.watched, state.disliked]);

  // серіали, які ви зараз дивитесь і в яких уже вийшла наступна серія
  const continueShows = useMemo(
    () =>
      state.tracking
        .filter((e) => effectiveStatus(e) === 'watching')
        .map((e) => ({ e, next: nextToWatch(e) }))
        .filter((x) => x.next?.aired)
        .sort((a, b) => (b.e.lastWatchedAt ?? b.e.updatedAt) - (a.e.lastWatchedAt ?? a.e.updatedAt))
        .slice(0, 8),
    [state.tracking],
  );

  const query = (k: MediaKind): TonightQuery => {
    const m = MOODS.find((x) => x.id === mood)!;
    const t = TIMES.find((x) => x.id === time)!;
    const e = ERAS.find((x) => x.id === era)!;
    return { kind: k, genres: m.genres, anyGenre: !!m.any, without: m.without ?? [], runtimeMax: t.max, yearFrom: e.from, yearTo: e.to, minRating: m.minRating ?? (k === 'tv' ? 7 : 6.6) };
  };
  const kindOk = (mv: Movie) => kind === 'any' || (kind === 'tv') === isTv(mv);

  const fits = (mv: Movie, q: TonightQuery) => {
    const y = Number(year(mv));
    if (q.genres.length && !(q.anyGenre ? q.genres.some((g) => mv.genreIds.includes(g)) : q.genres.every((g) => mv.genreIds.includes(g)))) return false;
    if (q.without.some((g) => mv.genreIds.includes(g))) return false;
    if (q.runtimeMax && mv.runtime && mv.runtime > q.runtimeMax) return false;
    if (q.yearFrom && y < q.yearFrom) return false;
    if (q.yearTo && y > q.yearTo) return false;
    return true;
  };

  const tasteScore = (mv: Movie) => (mv.genreIds.length ? mv.genreIds.reduce((s, g) => s + (taste.genres[g] ?? 0), 0) / mv.genreIds.length : 0);

  const find = async () => {
    setLoading(true);
    setError(null);
    setChosen(null);
    haptic('light');
    try {
      const q = query('movie');
      // 1) з вашого Обраного — те, що ще не бачили і підходить під настрій
      const fromLiked: Pick[] = state.liked
        .filter((e) => kindOk(e.movie) && !isWatched(e.movie.id) && !state.tracking.some((t) => t.show.id === e.movie.id && t.status !== 'planned') && fits(e.movie, q))
        .sort(() => Math.random() - 0.5)
        .slice(0, 6)
        .map((e) => ({ movie: e.movie, reason: '❤️ З вашого Обраного' }));
      // 2) з усієї бази — найкраще під ваш смак
      const kinds: MediaKind[] = kind === 'any' ? ['movie', 'tv'] : [kind as MediaKind];
      const lists = await Promise.all(
        kinds.map((k) =>
          tonightCandidates(api, query(k))
            .then((l) => l.filter((mv) => !isWatched(mv.id) && !isDisliked(mv.id) && !isLiked(mv.id) && !state.tracking.some((t) => t.show.id === mv.id)))
            .catch((err) => {
              if (kinds.length === 1) throw err;
              return [] as Movie[];
            }),
        ),
      );
      const hasTaste = Object.keys(taste.genres).length > 0;
      const ranked = lists.map((l) =>
        l
          .map((mv) => ({ mv, s: mv.rating * 0.6 + tasteScore(mv) * 2.5 + Math.random() * 1.8 }))
          .sort((a, b) => b.s - a.s)
          .map(({ mv }) => mv),
      );
      // «Будь-що»: фільми й серіали впереміш (приблизно 3 : 2)
      const merged: Movie[] = [];
      if (ranked.length === 2) {
        const [mv, tv] = ranked;
        const pattern = [0, 1, 0, 0, 1];
        let i = 0;
        while (mv.length || tv.length) {
          const from = pattern[i++ % pattern.length] === 0 ? (mv.length ? mv : tv) : tv.length ? tv : mv;
          merged.push(from.shift()!);
        }
      } else merged.push(...ranked[0]);
      const fromBase: Pick[] = merged.map((mv) => ({
          movie: mv,
          reason: hasTaste && tasteScore(mv) > 0.35 ? '✨ Схоже на ваш смак' : mv.rating >= 7.8 ? `⭐ Високий рейтинг ${mv.rating.toFixed(1)}` : mv.votes > 8000 ? '🔥 Популярний вибір' : '🎬 Добрий вибір',
        }));
      // 5 карток: до 2 з Обраного, решта з бази; запас — для кнопки «Інший»
      const first = [...fromLiked.slice(0, 2), ...fromBase.slice(0, 5 - Math.min(2, fromLiked.length))];
      pool.current = [...fromLiked.slice(2), ...fromBase.slice(5 - Math.min(2, fromLiked.length))];
      setPicks(first);
      if (!first.length) setError('Під ці побажання нічого не знайшлось. Спробуйте інший настрій чи епоху.');
      setTimeout(() => scroll.current?.scrollTo({ y: 0, animated: true }), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалося нічого підібрати');
    } finally {
      setLoading(false);
    }
  };

  const replace = (i: number) => {
    const next = pool.current.shift();
    if (!next || !picks) return;
    haptic('light');
    setPicks(picks.map((p, k) => (k === i ? next : p)));
    if (chosen === i) setChosen(null);
  };

  const more = () => {
    if (pool.current.length < 3) return find();
    const next = pool.current.splice(0, 5);
    setPicks(next);
    setChosen(null);
    scroll.current?.scrollTo({ y: 0, animated: true });
  };

  const decideForMe = () => {
    if (!picks?.length) return;
    // кілька «перебирань», щоб було видно, що обирається
    let n = 0;
    const steps = 9 + Math.floor(Math.random() * picks.length);
    const tick = () => {
      setChosen(n % picks.length);
      haptic('light');
      n++;
      if (n <= steps) setTimeout(tick, 70 + n * 12);
      else {
        const idx = (n - 1) % picks.length;
        haptic('success');
        const y = cardTops.current[idx];
        if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, y - 20), animated: true });
      }
    };
    tick();
  };

  const watchThis = (mv: Movie) => {
    // серіал — одразу в «Дивлюсь», щоб відмічати серії; фільм — в Обране
    if (isTv(mv)) {
      if (!state.tracking.some((t) => t.show.id === mv.id)) dispatch({ type: 'trackStatus', show: mv, status: 'watching' });
    } else if (!isLiked(mv.id)) dispatch({ type: 'toggleLike', movie: mv });
    haptic('success');
    openTitle(mv.id);
  };

  const cardW = Math.min(width, 640) - 32;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={picks ? () => setPicks(null) : goBack} hitSlop={10} accessibilityLabel="Назад">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{picks ? 'Ваші варіанти на сьогодні' : 'Що подивитись сьогодні?'}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView ref={scroll} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 120, alignItems: 'center' }} showsVerticalScrollIndicator={false}>
        <View style={{ width: '100%', maxWidth: 640 }}>
          {!picks ? (
            <>
              {continueShows.length ? (
                <>
                  <Text style={[styles.q, { marginTop: 8 }]}>▶ Продовжити серіал</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }} style={{ marginHorizontal: -16, paddingLeft: 16 }}>
                    {continueShows.map(({ e, next }) => (
                      <Pressable key={e.show.id} onPress={() => openTitle(e.show.id)} style={({ pressed }) => [styles.cont, pressed && { opacity: 0.85 }]}>
                        <Image source={{ uri: IMG(e.show.backdropPath ?? e.show.posterPath, 'w500') ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" />
                        <LinearGradient colors={['transparent', 'rgba(10,10,18,0.92)']} style={StyleSheet.absoluteFill} />
                        <View style={styles.contBody}>
                          <Text style={styles.contTitle} numberOfLines={1}>
                            {e.show.title}
                          </Text>
                          <Text style={styles.contEp} numberOfLines={1}>
                            {epCode(next!.season, next!.episode)}
                            {next!.name ? ` · ${next!.name}` : ''}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              ) : null}

              <Text style={[styles.lead, continueShows.length ? { marginTop: 18 } : null]}>Кілька швидких питань — і ми запропонуємо 5 варіантів: з вашого Обраного та з усієї бази, з урахуванням вашого смаку.</Text>

              <Text style={styles.q}>Фільм чи серіал?</Text>
              <Options items={KINDS} value={kind} onChange={setKind} />

              <Text style={styles.q}>Який настрій?</Text>
              <View style={styles.moodGrid}>
                {MOODS.map((m) => {
                  const on = mood === m.id;
                  return (
                    <Pressable key={m.id} onPress={() => setMood(m.id)} style={({ pressed }) => [styles.mood, on && styles.moodOn, pressed && { opacity: 0.8 }]}>
                      {on ? <LinearGradient colors={[colors.accent + '40', colors.accent2 + '30']} style={[StyleSheet.absoluteFill, { borderRadius: radius.md }]} /> : null}
                      <Text style={styles.moodEmoji}>{m.emoji}</Text>
                      <Text style={[styles.moodLabel, on && { color: colors.text }]}>{m.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.q}>{kind === 'tv' ? 'Яка тривалість серії?' : 'Скільки є часу?'}</Text>
              <Options items={TIMES} value={time} onChange={setTime} />

              <Text style={styles.q}>Новинка чи перевірене часом?</Text>
              <Options items={ERAS} value={era} onChange={setEra} />
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </>
          ) : (
            <>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {picks.map((p, i) => (
                <View
                  key={p.movie.id}
                  onLayout={(e) => (cardTops.current[i] = e.nativeEvent.layout.y)}
                  style={[styles.card, { width: cardW }, chosen === i && styles.cardChosen]}
                >
                  <Pressable onPress={() => openTitle(p.movie.id)}>
                    <View style={{ height: cardW * 0.5 }}>
                      <Image source={{ uri: IMG(p.movie.backdropPath ?? p.movie.posterPath, 'w780') ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" />
                      <LinearGradient colors={['transparent', 'rgba(18,18,29,0.95)']} style={StyleSheet.absoluteFill} />
                      <View style={styles.reason}>
                        <Text style={styles.reasonText}>{p.reason}</Text>
                      </View>
                      {chosen === i ? (
                        <View style={styles.chosenBadge}>
                          <Text style={styles.chosenText}>🎯 {isTv(p.movie) ? 'Ваш серіал на вечір' : 'Ваш фільм на вечір'}</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.cardBody}>
                      <Text style={styles.title} numberOfLines={2}>
                        {p.movie.title}
                      </Text>
                      <Text style={styles.meta}>
                        {isTv(p.movie) ? '📺 Серіал · ' : ''}★ {p.movie.rating ? p.movie.rating.toFixed(1) : '—'} · {year(p.movie)} · {p.movie.genreIds.slice(0, 3).map(genreName).join(', ')}
                      </Text>
                      {p.movie.overview ? (
                        <Text style={styles.overview} numberOfLines={3}>
                          {p.movie.overview}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                  <View style={styles.cardActions}>
                    <Pressable onPress={() => replace(i)} style={[styles.smallBtn, styles.iconBtn]} disabled={!pool.current.length} accessibilityLabel="Інший варіант">
                      <Ionicons name="refresh" size={18} color={pool.current.length ? colors.textDim : colors.textMuted} />
                    </Pressable>
                    <Pressable onPress={() => openTitle(p.movie.id)} style={styles.smallBtn}>
                      <Ionicons name="play-circle-outline" size={16} color={colors.textDim} />
                      <Text style={styles.smallText}>Трейлер</Text>
                    </Pressable>
                    <GradientButton title="Дивлюсь цей!" icon="checkmark" small onPress={() => watchThis(p.movie)} style={{ flex: 1 }} colorsPair={chosen === i ? gradients.like : gradients.brand} />
                  </View>
                </View>
              ))}
            </>
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        {picks ? (
          <>
            <GhostButton title="Ще варіанти" icon="refresh" onPress={more} style={{ flex: 1 }} tight />
            <GradientButton title="Обери за мене" icon="dice-outline" onPress={decideForMe} style={{ flex: 1.2 }} tight />
          </>
        ) : (
          <GradientButton title={loading ? 'Підбираємо…' : kind === 'tv' ? 'Підібрати серіали' : kind === 'movie' ? 'Підібрати фільми' : 'Підібрати'} icon="sparkles" onPress={loading ? undefined : find} style={{ flex: 1 }} />
        )}
      </View>
      {loading && picks ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : null}
    </View>
  );
}

function Options<T extends { id: string; label: string }>({ items, value, onChange }: { items: T[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.options}>
      {items.map((it) => {
        const on = value === it.id;
        return (
          <Pressable key={it.id} onPress={() => onChange(it.id)} style={[styles.option, on && styles.optionOn]}>
            <Text style={[styles.optionText, on && { color: colors.text }]}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 10 },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  lead: { color: colors.textDim, fontSize: 14, lineHeight: 20, marginTop: 4 },
  q: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 22, marginBottom: 12 },
  moodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  mood: { width: '47.5%', flexGrow: 1, height: 74, borderRadius: radius.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', paddingHorizontal: 14, overflow: 'hidden' },
  moodOn: { borderColor: colors.accent },
  moodEmoji: { fontSize: 24 },
  moodLabel: { color: colors.textDim, fontSize: 14, fontWeight: '800', marginTop: 4 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: radius.pill, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  optionOn: { borderColor: colors.accent, backgroundColor: colors.accent + '26' },
  optionText: { color: colors.textDim, fontWeight: '700', fontSize: 14 },
  error: { color: colors.nope, fontSize: 14, marginTop: 16, textAlign: 'center' },
  card: { alignSelf: 'center', marginTop: 14, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  cardChosen: { borderColor: colors.like, borderWidth: 2 },
  reason: { position: 'absolute', top: 10, left: 10, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: 'rgba(10,10,18,0.78)' },
  reasonText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  chosenBadge: { position: 'absolute', top: 10, right: 10, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.like },
  chosenText: { color: '#06281D', fontSize: 12, fontWeight: '900' },
  cardBody: { paddingHorizontal: 14, marginTop: -26 },
  title: { color: colors.text, fontSize: 21, fontWeight: '900', letterSpacing: -0.3 },
  meta: { color: colors.textMuted, fontSize: 13, fontWeight: '700', marginTop: 4 },
  overview: { color: colors.textDim, fontSize: 14, lineHeight: 20, marginTop: 8 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 40, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  iconBtn: { width: 40, paddingHorizontal: 0, justifyContent: 'center' },
  smallText: { color: colors.textDim, fontWeight: '700', fontSize: 13 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.bg + 'F2', borderTopWidth: 1, borderTopColor: colors.border },
  cont: { width: 200, height: 112, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  contBody: { position: 'absolute', left: 10, right: 10, bottom: 8 },
  contTitle: { color: '#fff', fontSize: 15, fontWeight: '900' },
  contEp: { color: colors.accent, fontSize: 12, fontWeight: '800', marginTop: 2 },
  loading: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10,10,18,0.6)', alignItems: 'center', justifyContent: 'center' },
});
