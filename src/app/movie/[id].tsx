import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrailerPlayer } from '../../components/TrailerPlayer';
import { GhostButton, GradientButton, Poster } from '../../components/ui';
import { genreName, languageName } from '../../lib/genres';
import { useHaptics, useStore } from '../../lib/store';
import { details, formatRuntime, IMG, year } from '../../lib/tmdb';
import { Movie, MovieDetails } from '../../lib/types';
import { colors, gradients, radius } from '../../theme';

export default function MovieScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { api, state, isLiked, isWatched, dispatch } = useStore();
  const haptic = useHaptics();
  const [m, setM] = useState<MovieDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  // поки вантажимо деталі — показуємо те, що вже є в бібліотеці
  const cached: Movie | undefined = [...state.liked, ...state.watched, ...state.disliked].find((e) => e.movie.id === Number(id))?.movie;

  useEffect(() => {
    let alive = true;
    details(api, Number(id))
      .then((d) => alive && setM(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Помилка'));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, api.apiKey, api.language, api.demo]);

  const movie: Movie | undefined = m ?? cached;
  const liked = isLiked(Number(id));
  const watched = isWatched(Number(id));
  const myRating = state.watched.find((e) => e.movie.id === Number(id))?.myRating;
  const heroH = Math.min(width * 1.1, 520);

  if (!movie) {
    return (
      <View style={[styles.screen, styles.center]}>
        {error ? <Text style={styles.muted}>{error}</Text> : <ActivityIndicator color={colors.accent} size="large" />}
        <GhostButton title="Назад" icon="chevron-back" onPress={() => router.back()} style={{ marginTop: 20 }} />
      </View>
    );
  }

  const facts = [
    year(movie),
    formatRuntime(m?.runtime ?? movie.runtime),
    languageName(movie.language),
  ].filter(Boolean);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }} showsVerticalScrollIndicator={false}>
        <View style={{ height: heroH }}>
          {playing && m?.trailerKey ? (
            <View style={{ position: 'absolute', left: 0, right: 0, top: insets.top + 50, aspectRatio: 16 / 9 }}>
              <TrailerPlayer videoKey={m.trailerKey} />
            </View>
          ) : (
            <>
              <Image source={{ uri: IMG(movie.backdropPath ?? movie.posterPath, 'w1280') ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <LinearGradient colors={['rgba(10,10,18,0.3)', 'rgba(10,10,18,0.1)', colors.bg]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
              {m?.trailerKey ? (
                <Pressable onPress={() => setPlaying(true)} style={styles.playCenter}>
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
              {movie.originalTitle !== movie.title ? <Text style={styles.original}>{movie.originalTitle}</Text> : null}
              <Text style={styles.facts}>{facts.join('  ·  ')}</Text>
            </View>
          </View>

          {m?.tagline ? <Text style={styles.tagline}>«{m.tagline}»</Text> : null}

          <View style={styles.scores}>
            <Score label="TMDB" value={movie.rating ? movie.rating.toFixed(1) : '—'} sub={`${movie.votes.toLocaleString('uk-UA')} оцінок`} color={colors.gold} />
            {m?.imdbId ? (
              <Pressable style={{ flex: 1 }} onPress={() => Linking.openURL(`https://www.imdb.com/title/${m.imdbId}/`)}>
                <Score label="IMDb" value="Відкрити" sub={m.imdbId} color="#F5C518" />
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

          {movie.overview ? <Text style={styles.overview}>{movie.overview}</Text> : <Text style={styles.muted}>Опис відсутній.</Text>}

          {watched ? (
            <View style={styles.rateBox}>
              <Text style={styles.h}>Ваша оцінка</Text>
              <View style={styles.stars}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <Pressable key={n} hitSlop={4} onPress={() => { dispatch({ type: 'rate', id: movie.id, rating: n }); haptic('light'); }}>
                    <Ionicons name={myRating && n <= myRating ? 'star' : 'star-outline'} size={26} color={colors.gold} />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {m?.director || m?.countries.length ? (
            <View style={styles.infoGrid}>
              {m?.director ? <Info label="Режисер" value={m.director} /> : null}
              {m?.countries.length ? <Info label="Країна" value={m.countries.slice(0, 2).join(', ')} /> : null}
              {m?.budget ? <Info label="Бюджет" value={`$${(m.budget / 1e6).toFixed(0)} млн`} /> : null}
              {m?.revenue ? <Info label="Збори" value={`$${(m.revenue / 1e6).toFixed(0)} млн`} /> : null}
            </View>
          ) : null}

          {m?.cast.length ? (
            <>
              <Text style={styles.h}>У ролях</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                {m.cast.map((c) => (
                  <View key={c.id} style={{ width: 82 }}>
                    <Poster path={c.profilePath} size="w185" rounded={41} style={{ width: 82, height: 82 }} />
                    <Text style={styles.castName} numberOfLines={2}>{c.name}</Text>
                    <Text style={styles.castRole} numberOfLines={1}>{c.character}</Text>
                  </View>
                ))}
              </ScrollView>
            </>
          ) : null}
        </View>
      </ScrollView>

      <Pressable onPress={() => router.back()} style={[styles.back, { top: insets.top + 8 }]} hitSlop={10}>
        <Ionicons name="chevron-down" size={24} color="#fff" />
      </Pressable>

      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <GhostButton
          title={watched ? 'Переглянуто' : 'Бачив'}
          icon={watched ? 'eye' : 'eye-outline'}
          onPress={() => dispatch({ type: 'toggleWatched', movie: m ?? movie })}
          style={[{ flex: 1 }, watched && { borderColor: colors.watched }]}
        />
        <GradientButton
          title={liked ? 'В обраному' : 'Подобається'}
          icon={liked ? 'heart' : 'heart-outline'}
          colorsPair={liked ? gradients.like : gradients.brand}
          onPress={() => {
            dispatch({ type: 'toggleLike', movie: m ?? movie });
            haptic(liked ? 'light' : 'success');
          }}
          style={{ flex: 1.3 }}
        />
      </View>
    </View>
  );
}

function Score({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <View style={styles.score}>
      <Text style={[styles.scoreLabel, { color }]}>{label}</Text>
      <Text style={styles.scoreValue}>{value}</Text>
      <Text style={styles.scoreSub} numberOfLines={1}>{sub}</Text>
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.info}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
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
  score: { flex: 1, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.border },
  scoreLabel: { fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  scoreValue: { color: colors.text, fontSize: 20, fontWeight: '900', marginTop: 4 },
  scoreSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  genres: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  genre: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.accent + '1F', borderWidth: 1, borderColor: colors.accent + '55' },
  genreText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  overview: { color: '#D6D6E2', fontSize: 15, lineHeight: 23, marginTop: 16 },
  rateBox: { marginTop: 8 },
  stars: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  h: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 24, marginBottom: 12 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 },
  info: { width: '48%', flexGrow: 1, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.border },
  infoLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  infoValue: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 4 },
  castName: { color: colors.text, fontSize: 12, fontWeight: '700', marginTop: 6, textAlign: 'center' },
  castRole: { color: colors.textMuted, fontSize: 11, textAlign: 'center' },
  back: { position: 'absolute', left: 14, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(10,10,18,0.6)', alignItems: 'center', justifyContent: 'center' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 12, paddingHorizontal: 18, paddingTop: 14, backgroundColor: colors.bg + 'F2', borderTopWidth: 1, borderTopColor: colors.border },
});
