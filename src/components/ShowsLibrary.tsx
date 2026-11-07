import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { openTitle } from '../lib/nav';
import {
  airedCount,
  effectiveStatus,
  epCode,
  formatAirDate,
  formatDuration,
  hasNewEpisode,
  nextToWatch,
  plural,
  progressOf,
  watchedCount,
} from '../lib/series';
import { useHaptics, useStore } from '../lib/store';
import { year } from '../lib/tmdb';
import { EpisodeRef, Movie, TrackEntry } from '../lib/types';
import { colors, gradients, radius } from '../theme';
import { GhostButton, GradientButton, Poster } from './ui';

type Row = { e: TrackEntry; next: (EpisodeRef & { aired: boolean }) | null };
type Done = { show: Movie; season: number; episode: number } | null;

/** Вкладка «Серіали» в Бібліотеці: що дивитись далі, нові серії, плани й переглянуте. */
export function ShowsLibrary({ query, bottomPad }: { query: string; bottomPad: number }) {
  const { state, dispatch, isWatched } = useStore();
  const haptic = useHaptics();
  const [done, setDone] = useState<Done>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const g = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (m: Movie) => !q || m.title.toLowerCase().includes(q) || m.originalTitle.toLowerCase().includes(q);
    const tracked = new Set(state.tracking.map((e) => e.show.id));
    const watching: Row[] = [];
    const waiting: Row[] = [];
    const planned: Movie[] = [];
    const completed: Movie[] = [];
    const dropped: Movie[] = [];
    state.tracking.forEach((e) => {
      if (!match(e.show)) return;
      const st = effectiveStatus(e);
      if (st === 'watching') {
        const next = nextToWatch(e);
        if (!e.meta || next?.aired) watching.push({ e, next });
        else waiting.push({ e, next });
      } else if (st === 'planned') planned.push(e.show);
      else if (st === 'completed') completed.push(e.show);
      else dropped.push(e.show);
    });
    // серіали з Обраного й «Бачив», які ще не відстежуєте
    state.liked.forEach((x) => x.movie.id < 0 && !tracked.has(x.movie.id) && !isWatched(x.movie.id) && match(x.movie) && planned.push(x.movie));
    state.watched.forEach((x) => x.movie.id < 0 && !tracked.has(x.movie.id) && match(x.movie) && completed.push(x.movie));
    const last = (r: Row) => r.e.lastWatchedAt ?? r.e.updatedAt;
    watching.sort((a, b) => Number(hasNewEpisode(b.e)) - Number(hasNewEpisode(a.e)) || last(b) - last(a));
    const airAt = (r: Row) => (r.next?.airDate ? new Date(r.next.airDate).getTime() : Infinity);
    waiting.sort((a, b) => airAt(a) - airAt(b));
    const eps = state.tracking.reduce((s, e) => s + watchedCount(e), 0);
    const minutes = state.tracking.reduce((s, e) => s + watchedCount(e) * (e.meta?.runtime ?? e.show.runtime ?? 45), 0);
    return { watching, waiting, planned, completed, dropped, eps, minutes };
  }, [state.tracking, state.liked, state.watched, query, isWatched]);

  const markNext = (r: Row) => {
    if (!r.next?.aired) return;
    const { season, episode } = r.next;
    dispatch({ type: 'episodes', show: r.e.show, changes: [{ season, episodes: [episode], on: true }], meta: r.e.meta });
    haptic('success');
    setDone({ show: r.e.show, season, episode });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(null), 4500);
  };

  const undo = () => {
    if (!done) return;
    const e = state.tracking.find((x) => x.show.id === done.show.id);
    dispatch({ type: 'episodes', show: done.show, changes: [{ season: done.season, episodes: [done.episode], on: false }], meta: e?.meta });
    setDone(null);
  };

  const total = g.watching.length + g.waiting.length + g.planned.length + g.completed.length + g.dropped.length;

  if (!total) {
    return (
      <View style={styles.empty}>
        <Text style={{ fontSize: 46 }}>{query.trim() ? '🔍' : '📺'}</Text>
        <Text style={styles.emptyText}>
          {query.trim()
            ? 'Серед ваших серіалів такого немає.'
            : 'Тут будуть ваші серіали. Відкрийте серіал і відмічайте переглянуті серії — підкажемо, що дивитись далі, і покажемо, коли вийде нова серія.'}
        </Text>
        <GradientButton
          title="Серіали в Кастингу"
          icon="flame"
          small
          onPress={() => {
            dispatch({ type: 'filters', filters: { ...state.filters, contentType: 'tv' } });
            router.push('/');
          }}
          style={{ marginTop: 16 }}
        />
        <GhostButton
          title={query.trim() ? `Шукати «${query.trim()}» у всій базі` : 'Знайти серіал'}
          icon="search"
          onPress={() => router.push(query.trim() ? `/search?q=${encodeURIComponent(query.trim())}` : '/search')}
          style={{ marginTop: 10 }}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: bottomPad + 30 }} showsVerticalScrollIndicator={false}>
        {g.eps ? (
          <Text style={styles.summary}>
            {plural(g.eps, 'серія переглянута', 'серії переглянуті', 'серій переглянуто')} · ≈{formatDuration(g.minutes)}
          </Text>
        ) : null}

        {g.watching.length ? (
          <>
            <Section title="Дивлюсь" count={g.watching.length} />
            {g.watching.map((r) => (
              <ShowRow key={r.e.show.id} r={r} onCheck={() => markNext(r)} />
            ))}
          </>
        ) : null}

        {g.waiting.length ? (
          <>
            <Section title="Чекаємо нові серії" count={g.waiting.length} />
            {g.waiting.map((r) => (
              <ShowRow key={r.e.show.id} r={r} />
            ))}
          </>
        ) : null}

        <Shelf title="Хочу подивитись" items={g.planned} />
        <Shelf title="Переглянуто" items={g.completed} rating={(id) => state.watched.find((x) => x.movie.id === id)?.myRating} />
        <Shelf title="Кинув" items={g.dropped} />
      </ScrollView>

      {done ? (
        <View style={[styles.undo, { bottom: bottomPad }]}>
          <Ionicons name="checkmark-circle" size={20} color={colors.like} />
          <Text style={styles.undoText} numberOfLines={1}>
            {epCode(done.season, done.episode)} · {done.show.title}
          </Text>
          <Pressable onPress={undo} hitSlop={10}>
            <Text style={styles.undoBtn}>Скасувати</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Section({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionCount}>{count}</Text>
    </View>
  );
}

function ShowRow({ r, onCheck }: { r: Row; onCheck?: () => void }) {
  const { e, next } = r;
  const aired = airedCount(e.meta);
  const watched = watchedCount(e);
  const progress = progressOf(e);
  const fresh = hasNewEpisode(e);
  const left = Math.max(0, Math.round(aired - progress * aired));
  let line: string;
  if (!e.meta) line = 'Оновлюємо дані про сезони…';
  else if (next?.aired) line = `Далі: ${epCode(next.season, next.episode)}${next.name ? ` · ${next.name}` : ''}`;
  else if (next) line = next.airDate ? `${epCode(next.season, next.episode)} вийде ${formatAirDate(next.airDate, true)}` : `${epCode(next.season, next.episode)} · дата ще невідома`;
  else line = 'Нових серій ще не анонсовано';
  return (
    <Pressable onPress={() => openTitle(e.show.id)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
      <Poster path={e.show.posterPath} title={e.show.title} size="w185" rounded={10} style={{ width: 58, height: 87 }} />
      <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {e.show.title}
          </Text>
          {fresh ? (
            <View style={styles.fresh}>
              <Text style={styles.freshText}>НОВА СЕРІЯ</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.rowNext, !next?.aired && { color: colors.watched }]} numberOfLines={1}>
          {line}
        </Text>
        {aired ? (
          <>
            <View style={styles.track}>
              <LinearGradient colors={progress >= 1 ? gradients.like : gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.fill, { width: `${Math.max(progress > 0 ? 3 : 0, progress * 100)}%` }]} />
            </View>
            <Text style={styles.rowMeta}>
              {watched}/{aired}
              {left ? ` · ще ${plural(left, 'серія', 'серії', 'серій')}` : ' · усе, що вийшло'}
            </Text>
          </>
        ) : null}
      </View>
      {onCheck && next?.aired ? (
        <Pressable onPress={onCheck} hitSlop={8} style={({ pressed }) => [styles.check, pressed && { transform: [{ scale: 0.92 }] }]} accessibilityLabel={`Переглянув ${epCode(next.season, next.episode)}`}>
          <Ionicons name="checkmark" size={22} color={colors.like} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function Shelf({ title, items, rating }: { title: string; items: Movie[]; rating?: (id: number) => number | undefined }) {
  if (!items.length) return null;
  return (
    <>
      <Section title={title} count={items.length} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }} style={{ marginHorizontal: -16, paddingHorizontal: 16 }}>
        {items.map((m) => {
          const r = rating?.(m.id);
          return (
            <Pressable key={m.id} style={({ pressed }) => [{ width: 104 }, pressed && { opacity: 0.8 }]} onPress={() => openTitle(m.id)}>
              <Poster path={m.posterPath} title={m.title} size="w342" style={{ width: 104, height: 156 }} />
              <Text style={styles.shelfTitle} numberOfLines={1}>
                {m.title}
              </Text>
              <Text style={styles.shelfMeta}>
                {year(m)}
                {r ? `  ·  ★ ${r}` : ''}
              </Text>
            </Pressable>
          );
        })}
        <View style={{ width: 16 }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  summary: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 2 },
  section: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 16, marginBottom: 10 },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '900' },
  sectionCount: { color: colors.textMuted, fontSize: 14, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 10, marginBottom: 8, borderRadius: radius.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '800', flexShrink: 1 },
  rowNext: { color: colors.textDim, fontSize: 13, fontWeight: '700', marginTop: 3 },
  rowMeta: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 4 },
  track: { height: 5, borderRadius: 3, backgroundColor: colors.card, overflow: 'hidden', marginTop: 8 },
  fill: { height: '100%', borderRadius: 3 },
  fresh: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.accent },
  freshText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 0.4 },
  check: { width: 44, height: 44, borderRadius: 22, marginLeft: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.like + '1F', borderWidth: 1, borderColor: colors.like + '66' },
  shelfTitle: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 6 },
  shelfMeta: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  empty: { alignItems: 'center', paddingTop: 50, paddingHorizontal: 30 },
  emptyText: { color: colors.textDim, fontSize: 15, textAlign: 'center', marginTop: 10, lineHeight: 21 },
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
});
