import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, ScrollViewInstance, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CastRow, Heading, Info, InfoGrid, Providers, Score, SimilarRow } from '../../components/DetailParts';
import { TrailerPlayer } from '../../components/TrailerPlayer';
import { GhostButton, GradientButton, Poster, Toast } from '../../components/ui';
import { genreName, languageName } from '../../lib/genres';
import { goBack } from '../../lib/nav';
import {
  airedCount,
  daysSince,
  effectiveStatus,
  epCode,
  EpisodeChange,
  formatAirDate,
  formatDuration,
  isAired,
  isWatchedEp,
  nextToWatch,
  plural,
  progressOf,
  totalCount,
  unwatchedBefore,
  watchedCount,
  watchedIn,
} from '../../lib/series';
import { shareMovie } from '../../lib/share';
import { ObsidianSheet } from '../../components/ObsidianSheet';
import { buildMovieNote, Stage } from '../../lib/movieNote';
import { obsidianOf, saveToObsidian } from '../../lib/obsidian';
import { useHaptics, useStore } from '../../lib/store';
import { IMG, metaOf, seasonEpisodes, SHOW_STATUS, showDetails, toMovie } from '../../lib/tmdb';
import { Episode, Movie, Season, ShowDetails, TrackStatus } from '../../lib/types';
import { colors, gradients, radius } from '../../theme';

const STATUSES: { value: TrackStatus; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string }[] = [
  { value: 'watching', label: 'Дивлюсь', icon: 'play-circle', color: colors.accent },
  { value: 'planned', label: 'Планую', icon: 'bookmark', color: colors.gold },
  { value: 'completed', label: 'Бачив усе', icon: 'checkmark-done-circle', color: colors.like },
  { value: 'dropped', label: 'Кинув', icon: 'close-circle', color: colors.textMuted },
];

const statusColor = (s: string) => (s === 'Returning Series' ? colors.like : s === 'Canceled' ? colors.nope : s === 'Ended' ? colors.textDim : colors.gold);

type EpState = Episode[] | 'loading' | 'error';

/** Сторінка серіалу: опис, де дивитись, і трекер — сезони, серії, прогрес, наступна серія. */
export default function TvScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const tvId = Number(rawId);
  const id = -tvId; // у бібліотеці серіали з від’ємним id
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { api, state, isLiked, isWatched, isDisliked, trackOf, dispatch } = useStore();
  const haptic = useHaptics();
  const [d, setD] = useState<ShowDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [solidHeader, setSolidHeader] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [eps, setEps] = useState<Record<number, EpState>>({});
  const [openEp, setOpenEp] = useState<string | null>(null);
  const [ask, setAsk] = useState<{ changes: EpisodeChange[]; count: number; label: string } | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);
  const trackerY = useRef(0);
  const autoOpened = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const entry = trackOf(id);
  const cached: Movie | undefined = entry?.show ?? [...state.liked, ...state.watched, ...state.disliked].find((e) => e.movie.id === id)?.movie;

  const load = () => {
    setError(null);
    let alive = true;
    showDetails(api, tvId)
      .then((det) => alive && setD(det))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Помилка'));
    return () => {
      alive = false;
    };
  };

  useEffect(() => {
    setD(null);
    setPlaying(false);
    setOpen({});
    setEps({});
    setAsk(null);
    autoOpened.current = false;
    scroll.current?.scrollTo({ y: 0, animated: false });
    return load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tvId, api.apiKey, api.language, api.demo]);

  const meta = useMemo(() => (d ? metaOf(d) : entry?.meta), [d, entry?.meta]);

  // свіжі дані про сезони — у трекер (щоб бібліотека знала про нові серії)
  useEffect(() => {
    if (d && trackOf(id)) dispatch({ type: 'trackMeta', show: toMovie(d), meta: metaOf(d) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  const loadSeason = (n: number) => {
    if (eps[n] && eps[n] !== 'error') return;
    setEps((x) => ({ ...x, [n]: 'loading' }));
    seasonEpisodes(api, tvId, n)
      .then((list) => setEps((x) => ({ ...x, [n]: list })))
      .catch(() => setEps((x) => ({ ...x, [n]: 'error' })));
  };

  const toggleSeasonOpen = (n: number) => {
    const willOpen = !open[n];
    setOpen((x) => ({ ...x, [n]: willOpen }));
    if (willOpen) loadSeason(n);
  };

  // відкриваємо сезон, у якому наступна серія
  useEffect(() => {
    if (!d || autoOpened.current) return;
    autoOpened.current = true;
    const nx = entry ? nextToWatch(entry, metaOf(d)) : null;
    const n = nx?.aired ? nx.season : null;
    if (n && d.seasons.some((s) => s.n === n)) {
      setOpen({ [n]: true });
      loadSeason(n);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  useEffect(() => {
    if (!ask) return;
    const t = setTimeout(() => setAsk(null), 8000);
    return () => clearTimeout(t);
  }, [ask]);

  const flash = (t: string) => {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  const show: Movie | undefined = d ?? cached;

  if (!show) {
    return (
      <View style={[styles.screen, styles.center]}>
        {error ? (
          <>
            <Text style={styles.emptyEmoji}>⚠️</Text>
            <Text style={[styles.muted, { textAlign: 'center', paddingHorizontal: 30 }]}>{error}</Text>
            <GradientButton title="Спробувати ще" icon="refresh" onPress={load} style={{ marginTop: 18 }} />
          </>
        ) : (
          <ActivityIndicator color={colors.accent} size="large" />
        )}
        <GhostButton title="Назад" icon="chevron-back" onPress={goBack} style={{ marginTop: 12 }} />
      </View>
    );
  }

  const base = toMovie(show);
  const liked = isLiked(id);
  const watchedList = isWatched(id);
  const disliked = isDisliked(id);
  // без трекінгу: «Бачив» → переглянуто, Обране → планую (так само, як у Бібліотеці)
  const status: TrackStatus | null = entry ? effectiveStatus({ ...entry, meta }) : watchedList ? 'completed' : liked ? 'planned' : null;
  const myRating = state.watched.find((e) => e.movie.id === id)?.myRating;
  const heroH = Math.min(width * 1.1, 520);
  const inLibrary = liked || watchedList || disliked || !!entry;

  const tracked = entry ? { ...entry, meta } : undefined;
  const watchedN = watchedCount(tracked);
  const aired = airedCount(meta);
  const total = totalCount(meta);
  const progress = progressOf(tracked);
  const next = meta ? nextToWatch(tracked, meta) : null;
  const epRuntime = meta?.runtime ?? d?.episodeRuntime ?? 45;
  const leftMin = Math.max(0, Math.round(aired - progress * aired)) * epRuntime;
  const ended = meta?.status === 'Ended' || meta?.status === 'Canceled';

  const firstYear = show.releaseDate ? show.releaseDate.slice(0, 4) : '';
  const lastYear = d?.lastAirDate ? d.lastAirDate.slice(0, 4) : '';
  const years = firstYear ? (ended && lastYear && lastYear !== firstYear ? `${firstYear}–${lastYear}` : ended || !d ? firstYear : `${firstYear} – …`) : '';
  const facts = [
    years,
    d?.seasonsCount ? plural(d.seasonsCount, 'сезон', 'сезони', 'сезонів') : null,
    d?.episodesCount ? plural(d.episodesCount, 'серія', 'серії', 'серій') : null,
    epRuntime && (d?.episodeRuntime || show.runtime) ? `${d?.episodeRuntime ?? show.runtime} хв` : null,
    languageName(show.language),
  ].filter(Boolean);

  const scrollToTracker = () => scroll.current?.scrollTo({ y: Math.max(0, trackerY.current - 70), animated: true });

  const setStatus = (st: TrackStatus) => {
    if (st === status && entry) return;
    dispatch({ type: 'trackStatus', show: base, status: st, meta });
    haptic(st === 'completed' ? 'success' : 'light');
    flash(st === 'completed' ? 'Серіал переглянуто 🎉' : st === 'watching' ? 'Додано в «Дивлюсь»' : st === 'planned' ? 'Додано в «Планую»' : 'Позначено як «Кинув»');
  };

  const untrack = () => {
    dispatch({ type: 'trackStatus', show: base, status: null });
    haptic('warning');
    flash('Прибрано з трекінгу');
  };

  const mark = (changes: EpisodeChange[]) => dispatch({ type: 'episodes', show: base, changes, meta });

  const epAired = (season: number, ep: number) => {
    const list = eps[season];
    const airDate = Array.isArray(list) ? list.find((e) => e.n === ep)?.airDate : undefined;
    return isAired(meta, season, ep, airDate);
  };

  const toggleEp = (season: number, ep: number) => {
    const on = !isWatchedEp(entry, season, ep);
    mark([{ season, episodes: [ep], on }]);
    haptic('light');
    setAsk(null);
    if (on && season > 0) {
      const before = unwatchedBefore(entry, meta, season, ep);
      if (before.count) setAsk({ ...before, label: `Позначити й ${plural(before.count, 'попередню серію', 'попередні серії', 'попередніх серій')}?` });
    }
  };

  const markUpTo = (season: number, ep: number) => {
    const before = unwatchedBefore(entry, meta, season, ep);
    mark([...before.changes, { season, episodes: [ep], on: true }]);
    haptic('success');
    flash(`Позначено все до ${epCode(season, ep)}`);
  };

  const toggleSeason = (s: Season) => {
    const list = eps[s.n];
    const all = Array.from({ length: s.count }, (_, i) => i + 1);
    const airedEps = all.filter((ep) => (Array.isArray(list) ? isAired(meta, s.n, ep, list.find((e) => e.n === ep)?.airDate) : isAired(meta, s.n, ep)));
    if (!airedEps.length) return flash('Серії цього сезону ще не вийшли');
    const done = watchedIn(entry, s.n);
    const allDone = airedEps.every((ep) => done.has(ep));
    mark([{ season: s.n, episodes: airedEps, on: !allDone }]);
    haptic(allDone ? 'light' : 'success');
    if (!allDone) flash(`${s.n ? `Сезон ${s.n}` : 'Спецвипуски'} переглянуто`);
  };

  const markNext = () => {
    if (!next?.aired) return;
    mark([{ season: next.season, episodes: [next.episode], on: true }]);
    haptic('success');
    flash(`✓ ${epCode(next.season, next.episode)} переглянуто`);
  };

  const share = async () => {
    const res = await shareMovie(base);
    if (res === 'copied') flash('Посилання скопійовано');
  };

  // головна кнопка внизу
  let primary: { title: string; icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; pair: readonly [string, string] };
  if (!status || status === 'planned' || status === 'dropped') {
    primary = {
      title: status === 'dropped' ? 'Повернутись' : 'Почати дивитись',
      icon: 'play',
      pair: gradients.brand,
      onPress: () => {
        setStatus('watching');
        setTimeout(scrollToTracker, 60);
      },
    };
  } else if (entry && next?.aired) {
    const code = epCode(next.season, next.episode);
    primary = { title: width < 420 ? code : `Переглянув ${code}`, icon: 'checkmark', pair: gradients.brand, onPress: markNext };
  } else if (status === 'completed') {
    primary = { title: 'Переглянуто', icon: 'checkmark-done', pair: gradients.like, onPress: scrollToTracker };
  } else if (entry && next) {
    primary = { title: `Чекаємо ${epCode(next.season, next.episode)}`, icon: 'time-outline', pair: gradients.watched, onPress: scrollToTracker };
  } else {
    primary = { title: 'Мій прогрес', icon: 'list', pair: gradients.brand, onPress: scrollToTracker };
  }

  const newEp = d?.lastEpisode && daysSince(d.lastEpisode.airDate) <= 10 ? d.lastEpisode : null;

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 130 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={64}
        onScroll={(e) => {
          const solid = e.nativeEvent.contentOffset.y > heroH - 140;
          if (solid !== solidHeader) setSolidHeader(solid);
        }}
      >
        <View style={{ height: heroH }}>
          {playing && d?.trailerKey ? (
            <View style={{ position: 'absolute', left: 0, right: 0, top: insets.top + 56, aspectRatio: 16 / 9 }}>
              <TrailerPlayer videoKey={d.trailerKey} muted={false} />
            </View>
          ) : (
            <>
              <Image source={{ uri: IMG(show.backdropPath ?? show.posterPath, 'w1280') ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <LinearGradient colors={['rgba(10,10,18,0.3)', 'rgba(10,10,18,0.1)', colors.bg]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
              {d?.trailerKey ? (
                <Pressable onPress={() => setPlaying(true)} style={styles.playCenter} accessibilityLabel="Дивитись трейлер">
                  <LinearGradient colors={gradients.brand} style={styles.playBtn}>
                    <Ionicons name="play" size={30} color="#fff" style={{ marginLeft: 4 }} />
                  </LinearGradient>
                  <Text style={styles.playText}>Дивитись трейлер</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Poster path={show.posterPath} size="w342" style={styles.poster} />
            <View style={{ flex: 1, marginLeft: 14, justifyContent: 'flex-end' }}>
              <View style={styles.kindRow}>
                <View style={styles.kind}>
                  <Text style={styles.kindText}>📺 Серіал</Text>
                </View>
                {d?.status ? (
                  <View style={[styles.kind, { borderColor: statusColor(d.status) + '88', backgroundColor: statusColor(d.status) + '1A' }]}>
                    <Text style={[styles.kindText, { color: statusColor(d.status) }]}>{SHOW_STATUS[d.status] ?? d.status}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.title}>{show.title}</Text>
              {show.originalTitle && show.originalTitle !== show.title ? <Text style={styles.original}>{show.originalTitle}</Text> : null}
              <Text style={styles.facts}>{facts.join('  ·  ')}</Text>
            </View>
          </View>

          {d?.tagline ? <Text style={styles.tagline}>«{d.tagline}»</Text> : null}

          {newEp ? (
            <View style={styles.newEp}>
              <Text style={styles.newEpText}>
                🔥 Нова серія {epCode(newEp.season, newEp.episode)}
                {newEp.name ? ` «${newEp.name}»` : ''} вийшла {daysSince(newEp.airDate) === 0 ? 'сьогодні' : daysSince(newEp.airDate) === 1 ? 'вчора' : `${daysSince(newEp.airDate)} дн. тому`}
              </Text>
            </View>
          ) : null}

          <View style={styles.scores}>
            <Score label="TMDB" value={show.rating ? show.rating.toFixed(1) : '—'} sub={`${show.votes.toLocaleString('uk-UA')} оцінок`} color={colors.gold} />
            {d?.imdbId ? (
              <Pressable style={{ flex: 1 }} onPress={() => Linking.openURL(`https://www.imdb.com/title/${d.imdbId}/`)}>
                <Score label="IMDb ↗" value="Відкрити" sub="рейтинг і відгуки" color="#F5C518" />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.genres}>
            {show.genreIds.map((g) => (
              <View key={g} style={styles.genre}>
                <Text style={styles.genreText}>{genreName(g)}</Text>
              </View>
            ))}
          </View>

          {show.overview ? <Text style={styles.overview}>{show.overview}</Text> : <Text style={[styles.muted, { marginTop: 16 }]}>Опис відсутній.</Text>}

          {/* ───── Трекер ───── */}
          <View style={styles.tracker} onLayout={(e) => (trackerY.current = e.nativeEvent.layout.y)}>
            <View style={styles.trackerHead}>
              <Text style={styles.trackerTitle}>Мій перегляд</Text>
              {entry ? (
                <Pressable onPress={untrack} hitSlop={8}>
                  <Text style={styles.untrack}>Прибрати</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.statusRow}>
              {STATUSES.map((s) => {
                const on = status === s.value;
                return (
                  <Pressable
                    key={s.value}
                    onPress={() => setStatus(s.value)}
                    style={({ pressed }) => [styles.statusChip, on && { borderColor: s.color, backgroundColor: s.color + '24' }, pressed && { opacity: 0.8 }]}
                    accessibilityState={{ selected: on }}
                  >
                    <Ionicons name={s.icon} size={18} color={on ? s.color : colors.textMuted} />
                    <Text style={[styles.statusText, width < 420 && { fontSize: 11 }, on && { color: colors.text }]} numberOfLines={1}>
                      {s.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {!status ? (
              <Text style={styles.trackerHint}>Відмічайте переглянуті серії — підкажемо, що дивитись далі, і нагадаємо про нові серії в Бібліотеці.</Text>
            ) : !entry ? (
              <Text style={styles.trackerHint}>
                {watchedList
                  ? 'Серіал у списку «Бачив». Відмітьте серії нижче, якщо хочете стежити за прогресом і новими сезонами.'
                  : 'Серіал в Обраному — «Хочу подивитись». Почніть дивитись, і ми підказуватимемо наступну серію.'}
              </Text>
            ) : null}

            {entry && status && meta && aired ? (
              <View style={{ marginTop: 14 }}>
                <View style={styles.progressTrack}>
                  <LinearGradient colors={progress >= 1 ? gradients.like : gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.progressFill, { width: `${Math.max(progress > 0 ? 3 : 0, progress * 100)}%` }]} />
                </View>
                <View style={styles.progressRow}>
                  <Text style={styles.progressText}>
                    {watchedN} з {aired} {aired < total ? `(вийшло ${aired} з ${total})` : 'серій'}
                  </Text>
                  <Text style={styles.progressText}>{leftMin > 0 ? `залишилось ≈ ${formatDuration(leftMin)}` : progress >= 1 ? 'усе переглянуто' : ''}</Text>
                </View>
              </View>
            ) : null}

            {entry && status && next ? (
              next.aired ? (
                <View style={styles.nextBox}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nextLabel}>Наступна серія</Text>
                    <Text style={styles.nextTitle} numberOfLines={2}>
                      {epCode(next.season, next.episode)}
                      {epName(eps, next.season, next.episode) ? ` · ${epName(eps, next.season, next.episode)}` : ''}
                    </Text>
                  </View>
                  <GradientButton title="Переглянув" icon="checkmark" small onPress={markNext} />
                </View>
              ) : (
                <View style={[styles.nextBox, { borderColor: colors.watched + '66' }]}>
                  <Ionicons name="time-outline" size={22} color={colors.watched} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.nextLabel, { color: colors.watched }]}>Ви все переглянули — чекаємо</Text>
                    <Text style={styles.nextTitle} numberOfLines={2}>
                      {epCode(next.season, next.episode)}
                      {next.airDate ? ` · ${formatAirDate(next.airDate)}` : ' · дата ще невідома'}
                    </Text>
                  </View>
                </View>
              )
            ) : entry && status && meta && aired && progress >= 1 ? (
              <View style={[styles.nextBox, { borderColor: colors.like + '66' }]}>
                <Text style={{ fontSize: 22 }}>🎉</Text>
                <Text style={[styles.nextTitle, { flex: 1 }]}>{ended ? 'Ви переглянули весь серіал' : 'Ви переглянули все, що вийшло. Нові серії ще не анонсовано.'}</Text>
              </View>
            ) : null}

            {watchedList ? (
              <View style={{ marginTop: 14 }}>
                <Text style={styles.nextLabel}>Ваша оцінка серіалу</Text>
                <View style={styles.stars}>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <Pressable
                      key={n}
                      hitSlop={4}
                      accessibilityLabel={`Оцінка ${n}`}
                      onPress={() => {
                        dispatch({ type: 'rate', id, rating: n });
                        haptic('light');
                      }}
                    >
                      <Ionicons name={myRating && n <= myRating ? 'star' : 'star-outline'} size={24} color={colors.gold} />
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </View>

          {/* ───── Сезони ───── */}
          {d?.seasons.length ? (
            <>
              <Heading>Сезони</Heading>
              <Text style={styles.hint}>Торкніться сезону, щоб побачити серії. Утримуйте серію — позначимо всі до неї.</Text>
              {d.seasons.map((s) => {
                const done = watchedIn(entry, s.n);
                const list = eps[s.n];
                const airedEps = Array.from({ length: s.count }, (_, i) => i + 1).filter((ep) => (Array.isArray(list) ? isAired(meta, s.n, ep, list.find((e) => e.n === ep)?.airDate) : isAired(meta, s.n, ep)));
                const watchedHere = airedEps.filter((ep) => done.has(ep)).length;
                const full = airedEps.length > 0 && watchedHere === airedEps.length;
                const notYet = !airedEps.length;
                return (
                  <View key={s.n} style={styles.season}>
                    <Pressable onPress={() => toggleSeasonOpen(s.n)} style={({ pressed }) => [styles.seasonRow, pressed && { opacity: 0.85 }]} accessibilityLabel={`${s.name}, ${open[s.n] ? 'згорнути' : 'розгорнути'}`}>
                      <Poster path={s.posterPath ?? show.posterPath} size="w185" rounded={8} style={styles.seasonPoster} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.seasonTitle} numberOfLines={1}>
                          {s.n === 0 ? 'Спецвипуски' : s.name && !/^(Season|Сезон) \d+$/i.test(s.name) ? `Сезон ${s.n} · ${s.name}` : `Сезон ${s.n}`}
                        </Text>
                        <Text style={styles.seasonSub}>
                          {plural(s.count, 'серія', 'серії', 'серій')}
                          {s.airDate ? ` · ${notYet ? `вийде ${formatAirDate(s.airDate)}` : s.airDate.slice(0, 4)}` : notYet ? ' · ще не вийшов' : ''}
                        </Text>
                        {done.size && airedEps.length ? (
                          <View style={[styles.progressTrack, { height: 4, marginTop: 7 }]}>
                            <View style={[styles.progressFill, { width: `${(watchedHere / airedEps.length) * 100}%`, backgroundColor: full ? colors.like : colors.accent }]} />
                          </View>
                        ) : null}
                      </View>
                      {done.size ? <Text style={[styles.seasonCount, full && { color: colors.like }]}>{`${watchedHere}/${airedEps.length}`}</Text> : null}
                      <Pressable
                        onPress={() => toggleSeason(s)}
                        hitSlop={8}
                        disabled={notYet}
                        style={[styles.check, full && styles.checkOn, notYet && { opacity: 0.35 }]}
                        accessibilityLabel={full ? 'Зняти позначки з сезону' : 'Позначити сезон переглянутим'}
                      >
                        <Ionicons name={full ? 'checkmark-done' : 'checkmark'} size={18} color={full ? '#06281D' : colors.textDim} />
                      </Pressable>
                      <Ionicons name={open[s.n] ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
                    </Pressable>

                    {open[s.n] ? (
                      <View style={styles.epList}>
                        {list === 'loading' || !list ? (
                          <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} />
                        ) : list === 'error' ? (
                          <Pressable onPress={() => loadSeason(s.n)} style={{ padding: 14 }}>
                            <Text style={[styles.muted, { textAlign: 'center' }]}>Не вдалося завантажити серії. Торкніться, щоб спробувати ще.</Text>
                          </Pressable>
                        ) : (
                          list.map((ep) => {
                            const key = `${s.n}:${ep.n}`;
                            const w = done.has(ep.n);
                            const isOut = epAired(s.n, ep.n);
                            const isNext = !!next && next.season === s.n && next.episode === ep.n && next.aired && !!status;
                            return (
                              <Pressable
                                key={key}
                                onPress={() => setOpenEp(openEp === key ? null : key)}
                                onLongPress={isOut ? () => markUpTo(s.n, ep.n) : undefined}
                                delayLongPress={450}
                                style={({ pressed }) => [styles.ep, isNext && styles.epNext, pressed && { backgroundColor: colors.card }]}
                              >
                                <Pressable
                                  onPress={() => toggleEp(s.n, ep.n)}
                                  disabled={!isOut && !w}
                                  hitSlop={10}
                                  style={[styles.check, w && styles.checkOn, !isOut && !w && { opacity: 0.3 }]}
                                  accessibilityLabel={w ? `Зняти позначку з ${epCode(s.n, ep.n)}` : `Позначити ${epCode(s.n, ep.n)} переглянутою`}
                                >
                                  <Ionicons name="checkmark" size={18} color={w ? '#06281D' : colors.textDim} />
                                </Pressable>
                                {width >= 360 ? (
                                  <View style={styles.still}>
                                    {ep.stillPath ? <Image source={{ uri: IMG(ep.stillPath, 'w185') ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name="tv-outline" size={18} color={colors.textMuted} />}
                                  </View>
                                ) : null}
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <Text style={[styles.epTitle, !isOut && { color: colors.textMuted }, w && { color: colors.textDim }]} numberOfLines={openEp === key ? 3 : 1}>
                                    {ep.n}. {ep.name || `Серія ${ep.n}`}
                                  </Text>
                                  <Text style={styles.epSub} numberOfLines={1}>
                                    {isNext ? '▶ наступна · ' : ''}
                                    {isOut ? [ep.airDate ? new Date(ep.airDate).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' }) : null, ep.runtime ? `${ep.runtime} хв` : null, ep.rating ? `★ ${ep.rating.toFixed(1)}` : null].filter(Boolean).join(' · ') : ep.airDate ? `вийде ${formatAirDate(ep.airDate)}` : 'дата ще невідома'}
                                  </Text>
                                  {openEp === key && ep.overview ? <Text style={styles.epOverview}>{ep.overview}</Text> : null}
                                </View>
                              </Pressable>
                            );
                          })
                        )}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </>
          ) : !d && !error ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
          ) : null}

          {d ? <Providers providers={d.providers} /> : null}

          {d && (d.creators.length || d.networks.length || d.countries.length) ? (
            <InfoGrid>
              {d.creators.length ? <Info label={d.creators.length > 1 ? 'Автори' : 'Автор'} value={d.creators.slice(0, 2).map((c) => c.name).join(', ')} onPress={() => router.push(`/person/${d.creators[0].id}`)} /> : null}
              {d.networks.length ? <Info label="Канал" value={d.networks.slice(0, 2).join(', ')} /> : null}
              {d.countries.length ? <Info label="Країна" value={d.countries.slice(0, 2).join(', ')} /> : null}
              {d.lastEpisode ? <Info label="Остання серія" value={`${epCode(d.lastEpisode.season, d.lastEpisode.episode)}${d.lastEpisode.airDate ? ` · ${new Date(d.lastEpisode.airDate).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}`} /> : null}
              {d.nextEpisode ? <Info label="Наступна серія" value={`${epCode(d.nextEpisode.season, d.nextEpisode.episode)}${d.nextEpisode.airDate ? ` · ${formatAirDate(d.nextEpisode.airDate)}` : ''}`} /> : null}
            </InfoGrid>
          ) : null}

          {d ? <CastRow cast={d.cast} /> : null}
          {d ? <SimilarRow title="Схожі серіали" items={d.similar} mark={(sid) => (trackOf(sid) ? 'tv' : isLiked(sid) ? 'heart' : isWatched(sid) ? 'eye' : null)} /> : null}
        </View>
      </ScrollView>

      {solidHeader ? (
        <View style={[styles.header, { height: insets.top + 56, paddingTop: insets.top }]}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {show.title}
          </Text>
        </View>
      ) : null}

      <Pressable onPress={goBack} style={[styles.topBtn, { top: insets.top + 8, left: 14 }]} hitSlop={10} accessibilityLabel="Назад">
        <Ionicons name="chevron-down" size={24} color="#fff" />
      </Pressable>

      <View style={[styles.topRight, { top: insets.top + 8 }]}>
        <Pressable onPress={() => setSaveOpen(true)} style={styles.circle} hitSlop={8} accessibilityLabel="Зберегти в Obsidian">
          <Ionicons name="diamond-outline" size={19} color="#fff" />
        </Pressable>
        <Pressable onPress={share} style={styles.circle} hitSlop={8} accessibilityLabel="Поділитись">
          <Ionicons name="share-outline" size={20} color="#fff" />
        </Pressable>
        {inLibrary ? (
          <Pressable
            accessibilityLabel="Прибрати з бібліотеки"
            onPress={() => {
              dispatch({ type: 'removeEverywhere', id });
              haptic('warning');
              flash('Прибрано з бібліотеки');
            }}
            style={styles.circle}
            hitSlop={8}
          >
            <Ionicons name="trash-outline" size={19} color="#fff" />
          </Pressable>
        ) : null}
      </View>

      {ask ? (
        <View style={[styles.ask, { bottom: Math.max(insets.bottom, 14) + 80 }]}>
          <Text style={styles.askText} numberOfLines={2}>
            {ask.label}
          </Text>
          <Pressable
            onPress={() => {
              mark(ask.changes);
              haptic('success');
              setAsk(null);
            }}
            style={styles.askYes}
          >
            <Text style={styles.askYesText}>Так</Text>
          </Pressable>
          <Pressable onPress={() => setAsk(null)} hitSlop={8} accessibilityLabel="Ні">
            <Ionicons name="close" size={20} color={colors.textDim} />
          </Pressable>
        </View>
      ) : null}

      {toast && !ask ? <Toast text={toast} bottom={Math.max(insets.bottom, 14) + 84} /> : null}

      <ObsidianSheet<Stage>
        visible={saveOpen}
        onClose={() => setSaveOpen(false)}
        heading={base.title}
        stages={[
          { value: 'want', label: 'Хочу' },
          { value: 'now', label: 'Дивлюсь' },
          { value: 'done', label: 'Переглянуто' },
          { value: 'drop', label: 'Кинув' },
        ]}
        initial={{ stage: status === 'completed' ? 'done' : status === 'watching' ? 'now' : status === 'dropped' ? 'drop' : 'want', rating: myRating ?? null, notes: '' }}
        ratingMax={10}
        notesLabel="Враження"
        notesPlaceholder="Що зачепило, яка серія найкраща (кожен рядок — окремий пункт)"
        onSave={async (v) => {
          const w = state.watched.find((e) => e.movie.id === id);
          const r = await saveToObsidian(obsidianOf(state.settings.obsidian), buildMovieNote(base, d, { stage: v.stage, rating: v.rating, impressions: v.notes, watchedAt: w?.at ?? entry?.lastWatchedAt, track: entry }));
          if (r.ok) {
            // застосунок і база кажуть одне й те саме
            const st: TrackStatus = v.stage === 'done' ? 'completed' : v.stage === 'now' ? 'watching' : v.stage === 'drop' ? 'dropped' : 'planned';
            if (st !== status) dispatch({ type: 'trackStatus', show: base, status: st, meta });
            if (v.rating && v.rating !== myRating && (w || v.stage === 'done')) dispatch({ type: 'rate', id, rating: v.rating });
            haptic('success');
          } else haptic('warning');
          return r;
        }}
      />

      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Pressable
          accessibilityLabel={disliked ? 'Прибрати з «Не цікаво»' : 'Не цікаво'}
          onPress={() => {
            dispatch({ type: 'toggleDislike', movie: base });
            haptic('light');
            if (!disliked) flash('Більше не покажемо в Кастингу');
          }}
          style={[styles.roundBtn, disliked && { backgroundColor: colors.nope + '33', borderColor: colors.nope }]}
        >
          <Ionicons name="close" size={24} color={colors.nope} />
        </Pressable>
        <Pressable
          accessibilityLabel={liked ? 'Прибрати з Обраного' : 'В Обране'}
          onPress={() => {
            dispatch({ type: 'toggleLike', movie: base });
            haptic(liked ? 'light' : 'success');
            if (!liked) flash('Додано в Обране');
          }}
          style={[styles.roundBtn, liked && { backgroundColor: colors.accent + '2E', borderColor: colors.accent }]}
        >
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={23} color={colors.accent} />
        </Pressable>
        <GradientButton title={primary.title} icon={primary.icon} colorsPair={primary.pair} tight onPress={primary.onPress} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

function epName(eps: Record<number, EpState>, season: number, ep: number) {
  const list = eps[season];
  return Array.isArray(list) ? list.find((e) => e.n === ep)?.name ?? '' : '';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  emptyEmoji: { fontSize: 44, marginBottom: 8 },
  muted: { color: colors.textMuted, fontSize: 14 },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: -6, marginBottom: 10 },
  playCenter: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  playBtn: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  playText: { color: '#fff', fontWeight: '800', marginTop: 10, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 8 },
  body: { paddingHorizontal: 18, marginTop: -90 },
  titleRow: { flexDirection: 'row' },
  poster: { width: 110, height: 165, borderWidth: 1, borderColor: colors.border },
  kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  kind: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.watched + '88', backgroundColor: colors.watched + '1A' },
  kindText: { color: colors.watched, fontSize: 11, fontWeight: '900' },
  title: { color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.4 },
  original: { color: colors.textDim, fontSize: 14, marginTop: 2 },
  facts: { color: colors.textMuted, fontSize: 13, fontWeight: '700', marginTop: 6 },
  tagline: { color: colors.textDim, fontStyle: 'italic', fontSize: 15, marginTop: 16 },
  newEp: { marginTop: 14, paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.md, backgroundColor: colors.accent + '1C', borderWidth: 1, borderColor: colors.accent + '55' },
  newEpText: { color: colors.text, fontSize: 13, fontWeight: '800' },
  scores: { flexDirection: 'row', gap: 10, marginTop: 18 },
  genres: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  genre: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.accent + '1F', borderWidth: 1, borderColor: colors.accent + '55' },
  genreText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  overview: { color: '#D6D6E2', fontSize: 15, lineHeight: 23, marginTop: 16 },
  tracker: { marginTop: 22, padding: 14, borderRadius: radius.lg, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  trackerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  trackerTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  untrack: { color: colors.textMuted, fontSize: 13, fontWeight: '800' },
  trackerHint: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 12 },
  statusRow: { flexDirection: 'row', gap: 5 },
  statusChip: { flex: 1, minWidth: 0, alignItems: 'center', gap: 4, paddingVertical: 9, paddingHorizontal: 2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  statusText: { color: colors.textDim, fontSize: 12, fontWeight: '800' },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.card, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, gap: 8 },
  progressText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  nextBox: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, padding: 12, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.accent + '55' },
  nextLabel: { color: colors.accent, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },
  nextTitle: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 2 },
  stars: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  season: { marginBottom: 8, borderRadius: radius.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  seasonRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 },
  seasonPoster: { width: 40, height: 60 },
  seasonTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  seasonSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  seasonCount: { color: colors.textDim, fontSize: 13, fontWeight: '800' },
  check: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  checkOn: { backgroundColor: colors.like, borderColor: colors.like },
  epList: { borderTopWidth: 1, borderTopColor: colors.border },
  ep: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 9 },
  epNext: { backgroundColor: colors.accent + '14' },
  still: { width: 80, height: 45, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  epTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  epSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  epOverview: { color: colors.textDim, fontSize: 13, lineHeight: 18, marginTop: 6 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.bg + 'F5', borderBottomWidth: 1, borderBottomColor: colors.border, justifyContent: 'center', paddingLeft: 66, paddingRight: 110 },
  headerTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  circle: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(10,10,18,0.6)', alignItems: 'center', justifyContent: 'center' },
  topBtn: { position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(10,10,18,0.6)', alignItems: 'center', justifyContent: 'center' },
  topRight: { position: 'absolute', right: 14, flexDirection: 'row', gap: 8 },
  roundBtn: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  ask: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 12, paddingVertical: 10, borderRadius: radius.lg, backgroundColor: 'rgba(30,30,46,0.98)', borderWidth: 1, borderColor: colors.border, zIndex: 20, maxWidth: 560, alignSelf: 'center' },
  askText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '700' },
  askYes: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.like },
  askYesText: { color: '#06281D', fontWeight: '900', fontSize: 14 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 14, backgroundColor: colors.bg + 'F2', borderTopWidth: 1, borderTopColor: colors.border },
});
