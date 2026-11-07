import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { genreName, languageName } from '../lib/genres';
import { year } from '../lib/tmdb';
import { Movie, SwipeKind } from '../lib/types';
import { colors, gradients, radius } from '../theme';
import { Poster, RatingBadge } from './ui';

export type SwipeDeckHandle = { swipe: (kind: SwipeKind) => void };

type Props = {
  movies: Movie[]; // movies[0] — верхня картка
  onSwipe: (movie: Movie, kind: SwipeKind) => void;
  onOpen: (movie: Movie) => void;
};

// На вебі забороняємо браузеру прокручувати сторінку, коли тягнемо картку пальцем.
const WEB_NO_SCROLL = { dataSet: { swipeCard: 'true' } } as object;

const SWIPE_X = 110;
const SWIPE_Y = 120;

export const SwipeDeck = forwardRef<SwipeDeckHandle, Props>(function SwipeDeck({ movies, onSwipe, onOpen }, ref) {
  const { width, height } = useWindowDimensions();
  const pan = useRef(new Animated.ValueXY()).current;
  const busy = useRef(false);
  const top = movies[0];
  const latest = useRef({ top, onSwipe });
  latest.current = { top, onSwipe };

  // Нова верхня картка завжди стартує з центру (до відмальовування кадру).
  useLayoutEffect(() => {
    pan.setValue({ x: 0, y: 0 });
    busy.current = false;
  }, [top?.id, pan]);

  const fling = (kind: SwipeKind, vx = 0) => {
    const current = latest.current.top;
    if (!current || busy.current) return;
    busy.current = true;
    const to =
      kind === 'like' ? { x: width * 1.5, y: 40 } : kind === 'nope' ? { x: -width * 1.5, y: 40 } : { x: 0, y: -height * 1.2 };
    Animated.timing(pan, {
      toValue: to,
      duration: Math.max(160, 300 - Math.abs(vx) * 60),
      useNativeDriver: false,
    }).start(() => latest.current.onSwipe(current, kind));
  };

  useImperativeHandle(ref, () => ({ swipe: (k) => fling(k) }));

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6,
        onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
        onPanResponderRelease: (_, g) => {
          if (g.dx > SWIPE_X || g.vx > 1.2) return fling('like', g.vx);
          if (g.dx < -SWIPE_X || g.vx < -1.2) return fling('nope', g.vx);
          if (g.dy < -SWIPE_Y || g.vy < -1.4) return fling('watched', g.vy);
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, friction: 6, tension: 60, useNativeDriver: false }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [width, height],
  );

  const rotate = pan.x.interpolate({ inputRange: [-width, 0, width], outputRange: ['-14deg', '0deg', '14deg'] });
  const likeOpacity = pan.x.interpolate({ inputRange: [20, SWIPE_X], outputRange: [0, 1], extrapolate: 'clamp' });
  const nopeOpacity = pan.x.interpolate({ inputRange: [-SWIPE_X, -20], outputRange: [1, 0], extrapolate: 'clamp' });
  const watchedOpacity = pan.y.interpolate({ inputRange: [-SWIPE_Y, -20], outputRange: [1, 0], extrapolate: 'clamp' });
  const nextScale = pan.x.interpolate({ inputRange: [-width / 2, 0, width / 2], outputRange: [1, 0.93, 1], extrapolate: 'clamp' });

  const visible = movies.slice(0, 3);

  return (
    <View style={styles.deck} {...WEB_NO_SCROLL}>
      {visible
        .map((m, i) => {
          if (i === 0) {
            return (
              <Animated.View
                key={m.id}
                {...responder.panHandlers}
                style={[styles.card, { transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }] }]}
              >
                <Card movie={m} onOpen={() => onOpen(m)} />
                <Stamp label="ПОДОБАЄТЬСЯ" color={colors.like} style={{ left: 24, transform: [{ rotate: '-14deg' }] }} opacity={likeOpacity} />
                <Stamp label="НІ" color={colors.nope} style={{ right: 24, transform: [{ rotate: '14deg' }] }} opacity={nopeOpacity} />
                <Stamp label="ВЖЕ БАЧИВ" color={colors.watched} style={{ alignSelf: 'center', top: '40%' }} opacity={watchedOpacity} />
              </Animated.View>
            );
          }
          return (
            <Animated.View
              key={m.id}
              pointerEvents="none"
              style={[styles.card, { transform: [{ scale: i === 1 ? nextScale : 0.88 }, { translateY: i === 1 ? 0 : 18 }], opacity: i === 1 ? 1 : 0.6 }]}
            >
              <Card movie={m} />
            </Animated.View>
          );
        })
        .reverse()}
    </View>
  );
});

function Stamp({ label, color, style, opacity }: { label: string; color: string; style: object; opacity: Animated.AnimatedInterpolation<number> }) {
  return (
    <Animated.View pointerEvents="none" style={[styles.stamp, { borderColor: color, opacity }, style]}>
      <Text style={[styles.stampText, { color }]}>{label}</Text>
    </Animated.View>
  );
}

const Card = React.memo(function Card({ movie, onOpen }: { movie: Movie; onOpen?: () => void }) {
  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={onOpen} disabled={!onOpen}>
      <Poster path={movie.posterPath} size="w780" rounded={radius.xl} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={gradients.cardFade} locations={[0.45, 0.68, 1]} style={[StyleSheet.absoluteFill, { borderRadius: radius.xl }]} />
      <View style={styles.topRow}>
        <RatingBadge value={movie.rating} />
        {movie.votes ? (
          <View style={styles.votes}>
            <Ionicons name="people" size={11} color={colors.textDim} />
            <Text style={styles.votesText}>{formatVotes(movie.votes)}</Text>
          </View>
        ) : null}
        {movie.id < 0 ? (
          <View style={styles.tvBadge}>
            <Text style={styles.tvBadgeText}>📺 СЕРІАЛ</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {movie.title}
        </Text>
        <Text style={styles.meta}>
          {year(movie)} · {languageName(movie.language)}
          {movie.originalTitle && movie.originalTitle !== movie.title ? ` · ${movie.originalTitle}` : ''}
        </Text>
        <View style={styles.genres}>
          {movie.genreIds.slice(0, 3).map((g) => (
            <View key={g} style={styles.genre}>
              <Text style={styles.genreText}>{genreName(g)}</Text>
            </View>
          ))}
        </View>
        {movie.overview ? (
          <Text style={styles.overview} numberOfLines={3}>
            {movie.overview}
          </Text>
        ) : null}
        {onOpen ? (
          <View style={styles.more}>
            <Text style={styles.moreText}>Детальніше</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textDim} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

const formatVotes = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n));

const styles = StyleSheet.create({
  deck: { flex: 1, marginHorizontal: 14 },
  card: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  topRow: { position: 'absolute', top: 16, left: 16, right: 16, flexDirection: 'row', gap: 8 },
  tvBadge: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(77,163,255,0.9)' },
  tvBadgeText: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  votes: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: 'rgba(10,10,18,0.75)' },
  votesText: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
  info: { position: 'absolute', left: 20, right: 20, bottom: 20 },
  title: { color: '#fff', fontSize: 30, fontWeight: '900', letterSpacing: -0.5, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 8 },
  meta: { color: colors.textDim, fontSize: 14, marginTop: 4, fontWeight: '600' },
  genres: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  genre: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  genreText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  overview: { color: '#D8D8E4', fontSize: 14, lineHeight: 20, marginTop: 10 },
  more: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  moreText: { color: colors.textDim, fontSize: 13, fontWeight: '700' },
  stamp: { position: 'absolute', top: 70, borderWidth: 4, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: 'rgba(10,10,18,0.35)' },
  stampText: { fontSize: 24, fontWeight: '900', letterSpacing: 1 },
});
