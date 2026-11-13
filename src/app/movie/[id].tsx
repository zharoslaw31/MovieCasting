import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, ScrollViewInstance, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CastRow, Info, InfoGrid, Providers, Score, SimilarRow } from '../../components/DetailParts';
import { TrailerPlayer } from '../../components/TrailerPlayer';
import { GhostButton, GradientButton, Poster, Toast } from '../../components/ui';
import { genreName, languageName } from '../../lib/genres';
import { goBack, openTitle } from '../../lib/nav';
import { shareMovie } from '../../lib/share';
import { ObsidianSheet } from '../../components/ObsidianSheet';
import { buildMovieNote, Stage, stageOf } from '../../lib/movieNote';
import { obsidianOf, saveToObsidian } from '../../lib/obsidian';
import { useHaptics, useStore } from '../../lib/store';
import { details, formatRuntime, IMG, toMovie, year } from '../../lib/tmdb';
import { Movie, MovieDetails } from '../../lib/types';
import { colors, gradients, radius } from '../../theme';

export default function MovieScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Number(rawId);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { api, state, isLiked, isWatched, isDisliked, dispatch } = useStore();
  const haptic = useHaptics();
  const [m, setM] = useState<MovieDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [solidHeader, setSolidHeader] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);

  // поки вантажимо деталі — показуємо те, що вже є в бібліотеці
  const cached: Movie | undefined = [...state.liked, ...state.watched, ...state.disliked].find((e) => e.movie.id === id)?.movie;

  const load = () => {
    setError(null);
    let alive = true;
    details(api, id)
      .then((d) => alive && setM(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Помилка'));
    return () => {
      alive = false;
    };
  };

  useEffect(() => {
    setM(null);
    setPlaying(false);
    scroll.current?.scrollTo({ y: 0, animated: false });
    return load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, api.apiKey, api.language, api.demo]);

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2200);
  };

  const movie: Movie | undefined = m ?? cached;
  const liked = isLiked(id);
  const watched = isWatched(id);
  const disliked = isDisliked(id);
  const myRating = state.watched.find((e) => e.movie.id === id)?.myRating;
  const heroH = Math.min(width * 1.1, 520);
  const inLibrary = liked || watched || disliked;

  if (!movie) {
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

  const full: Movie = toMovie(m ?? movie);
  const facts = [year(movie), formatRuntime(m?.runtime ?? movie.runtime), languageName(movie.language)].filter(Boolean);

  const share = async () => {
    const res = await shareMovie(full);
    if (res === 'copied') flash('Посилання скопійовано');
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={64}
        onScroll={(e) => {
          const solid = e.nativeEvent.contentOffset.y > heroH - 140;
          if (solid !== solidHeader) setSolidHeader(solid);
        }}
      >
        <View style={{ height: heroH }}>
          {playing && m?.trailerKey ? (
            <View style={{ position: 'absolute', left: 0, right: 0, top: insets.top + 56, aspectRatio: 16 / 9 }}>
              {/* користувач сам натиснув «Дивитись» — тож можна зі звуком */}
              <TrailerPlayer videoKey={m.trailerKey} muted={false} />
            </View>
          ) : (
            <>
              <Image source={{ uri: IMG(movie.backdropPath ?? movie.posterPath, 'w1280') ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <LinearGradient colors={['rgba(10,10,18,0.3)', 'rgba(10,10,18,0.1)', colors.bg]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
              {m?.trailerKey ? (
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
            <Poster path={movie.posterPath} size="w342" style={styles.poster} />
            <View style={{ flex: 1, marginLeft: 14, justifyContent: 'flex-end' }}>
              <Text style={styles.title}>{movie.title}</Text>
              {movie.originalTitle && movie.originalTitle !== movie.title ? <Text style={styles.original}>{movie.originalTitle}</Text> : null}
              <Text style={styles.facts}>{facts.join('  ·  ')}</Text>
            </View>
          </View>

          {m?.tagline ? <Text style={styles.tagline}>«{m.tagline}»</Text> : null}

          <View style={styles.scores}>
            <Score label="TMDB" value={movie.rating ? movie.rating.toFixed(1) : '—'} sub={`${movie.votes.toLocaleString('uk-UA')} оцінок`} color={colors.gold} />
            {m?.imdbId ? (
              <Pressable style={{ flex: 1 }} onPress={() => Linking.openURL(`https://www.imdb.com/title/${m.imdbId}/`)}>
                <Score label="IMDb ↗" value="Відкрити" sub="рейтинг і відгуки" color="#F5C518" />
              </Pressable>
            ) : null}
            {watched ? <Score label="Моя оцінка" value={myRating ? `${myRating}/10` : '—'} sub="переглянуто" color={colors.watched} /> : null}
          </View>

          <View style={styles.genres}>
            {movie.genreIds.map((g) => (
              <View key={g} style={styles.genre}>
                <Text style={styles.genreText}>{genreName(g)}</Text>
              </View>
            ))}
          </View>

          {movie.overview ? <Text style={styles.overview}>{movie.overview}</Text> : <Text style={[styles.muted, { marginTop: 16 }]}>Опис відсутній.</Text>}

          {watched ? (
            <View style={styles.rateBox}>
              <Text style={styles.h}>Ваша оцінка</Text>
              <View style={styles.stars}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <Pressable
                    key={n}
                    hitSlop={4}
                    accessibilityLabel={`Оцінка ${n}`}
                    onPress={() => {
                      dispatch({ type: 'rate', id: movie.id, rating: n });
                      haptic('light');
                    }}
                  >
                    <Ionicons name={myRating && n <= myRating ? 'star' : 'star-outline'} size={26} color={colors.gold} />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {m ? <Providers providers={m.providers} /> : null}

          {m?.director || m?.countries.length ? (
            <InfoGrid>
              {m?.director ? <Info label="Режисер" value={m.director} onPress={m.directorId ? () => router.push(`/person/${m.directorId}`) : undefined} /> : null}
              {m?.countries.length ? <Info label="Країна" value={m.countries.slice(0, 2).join(', ')} /> : null}
              {m?.budget ? <Info label="Бюджет" value={`$${(m.budget / 1e6).toFixed(0)} млн`} /> : null}
              {m?.revenue ? <Info label="Збори" value={`$${(m.revenue / 1e6).toFixed(0)} млн`} /> : null}
            </InfoGrid>
          ) : null}

          {m ? <CastRow cast={m.cast} /> : null}
          {m ? <SimilarRow title="Схожі фільми" items={m.similar} mark={(sid) => (isLiked(sid) ? 'heart' : isWatched(sid) ? 'eye' : null)} /> : null}
        </View>
      </ScrollView>

      {solidHeader ? (
        <View style={[styles.header, { height: insets.top + 56, paddingTop: insets.top }]}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {movie.title}
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

      {toast ? <Toast text={toast} bottom={Math.max(insets.bottom, 14) + 84} /> : null}

      <ObsidianSheet<Stage>
        visible={saveOpen}
        onClose={() => setSaveOpen(false)}
        heading={full.title}
        stages={[
          { value: 'want', label: 'Хочу подивитись' },
          { value: 'done', label: 'Переглянуто' },
        ]}
        initial={{ stage: stageOf(full, { watched, liked }), rating: myRating ?? null, notes: '' }}
        ratingMax={10}
        notesLabel="Враження"
        notesPlaceholder="Що зачепило, що запамʼятати (кожен рядок — окремий пункт)"
        onSave={async (v) => {
          const entry = state.watched.find((e) => e.movie.id === id);
          const r = await saveToObsidian(obsidianOf(state.settings.obsidian), buildMovieNote(full, m, { stage: v.stage, rating: v.rating, impressions: v.notes, watchedAt: entry?.at }));
          if (r.ok) {
            // застосунок і база кажуть одне й те саме
            if (v.stage === 'done' && !watched) dispatch({ type: 'toggleWatched', movie: full });
            if (v.stage === 'want' && !liked && !watched) dispatch({ type: 'toggleLike', movie: full });
            if (v.stage === 'done' && v.rating && v.rating !== myRating) dispatch({ type: 'rate', id, rating: v.rating });
            haptic('success');
          } else haptic('warning');
          return r;
        }}
      />

      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Pressable
          accessibilityLabel={disliked ? 'Прибрати з «Не цікаво»' : 'Не цікаво'}
          onPress={() => {
            dispatch({ type: 'toggleDislike', movie: full });
            haptic('light');
            if (!disliked) flash('Більше не покажемо в Кастингу');
          }}
          style={[styles.nopeBtn, disliked && { backgroundColor: colors.nope + '33', borderColor: colors.nope }]}
        >
          <Ionicons name="close" size={24} color={colors.nope} />
        </Pressable>
        <GhostButton
          title="Бачив"
          icon={watched ? 'eye' : 'eye-outline'}
          tight
          onPress={() => {
            dispatch({ type: 'toggleWatched', movie: full });
            haptic('light');
            if (!watched) setTimeout(() => scroll.current?.scrollTo({ y: heroH - 40, animated: true }), 50);
          }}
          style={[{ flex: 1 }, watched && { borderColor: colors.watched, backgroundColor: colors.watched + '22' }]}
        />
        <GradientButton
          title={liked ? 'В обраному' : width < 420 ? 'В обране' : 'Подобається'}
          icon={liked ? 'heart' : 'heart-outline'}
          colorsPair={liked ? gradients.like : gradients.brand}
          tight
          onPress={() => {
            dispatch({ type: 'toggleLike', movie: full });
            haptic(liked ? 'light' : 'success');
          }}
          style={{ flex: 1.5 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  emptyEmoji: { fontSize: 44, marginBottom: 8 },
  muted: { color: colors.textMuted, fontSize: 14 },
  playCenter: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  playBtn: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  playText: { color: '#fff', fontWeight: '800', marginTop: 10, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 8 },
  body: { paddingHorizontal: 18, marginTop: -90 },
  titleRow: { flexDirection: 'row' },
  poster: { width: 110, height: 165, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.4 },
  original: { color: colors.textDim, fontSize: 14, marginTop: 2 },
  facts: { color: colors.textMuted, fontSize: 13, fontWeight: '700', marginTop: 6 },
  tagline: { color: colors.textDim, fontStyle: 'italic', fontSize: 15, marginTop: 16 },
  scores: { flexDirection: 'row', gap: 10, marginTop: 18 },
  genres: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  genre: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.accent + '1F', borderWidth: 1, borderColor: colors.accent + '55' },
  genreText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  overview: { color: '#D6D6E2', fontSize: 15, lineHeight: 23, marginTop: 16 },
  rateBox: { marginTop: 8 },
  stars: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  h: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 24, marginBottom: 12 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.bg + 'F5', borderBottomWidth: 1, borderBottomColor: colors.border, justifyContent: 'center', paddingLeft: 66, paddingRight: 110 },
  headerTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  circle: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(10,10,18,0.6)', alignItems: 'center', justifyContent: 'center' },
  topBtn: { position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(10,10,18,0.6)', alignItems: 'center', justifyContent: 'center' },
  topRight: { position: 'absolute', right: 14, flexDirection: 'row', gap: 8 },
  nopeBtn: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 14, backgroundColor: colors.bg + 'F2', borderTopWidth: 1, borderTopColor: colors.border },
});
