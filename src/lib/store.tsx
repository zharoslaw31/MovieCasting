import AsyncStorage from '@react-native-async-storage/async-storage';
import * as H from 'expo-haptics';
import { Platform } from 'react-native';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { ENV_API_KEY } from './tmdb';
import { DEFAULT_FILTERS, Filters, LibraryEntry, Movie, Profile, Settings, SwipeKind } from './types';

const STORAGE_KEY = 'moviecasting/state/v1';
// Підвищуємо, коли змінюються типові фільтри — старі збережені фільтри скидаються.
const FILTERS_VERSION = 3;

type State = {
  ready: boolean;
  profile: Profile;
  settings: Settings;
  filters: Filters;
  liked: LibraryEntry[];
  watched: LibraryEntry[];
  disliked: LibraryEntry[];
  history: { id: number; kind: SwipeKind; at: number }[]; // для «скасувати» та статистики
  trailersViewed: number;
  filtersV?: number;
  cloudUserId?: string | null; // з яким акаунтом пов'язані дані на цьому пристрої
  lastSyncAt?: number;
};

const initial: State = {
  ready: false,
  profile: { name: 'Кіноман', avatar: '🍿', createdAt: Date.now() },
  settings: { apiKey: '', language: 'uk-UA', demo: false, haptics: true },
  filters: DEFAULT_FILTERS,
  liked: [],
  watched: [],
  disliked: [],
  history: [],
  trailersViewed: 0,
  filtersV: FILTERS_VERSION,
};

export type ListName = 'liked' | 'watched' | 'disliked';

type Action =
  | { type: 'hydrate'; state: Partial<State> }
  | { type: 'swipe'; movie: Movie; kind: SwipeKind }
  | { type: 'undo' }
  | { type: 'toggleLike'; movie: Movie }
  | { type: 'toggleWatched'; movie: Movie }
  | { type: 'rate'; id: number; rating: number }
  | { type: 'remove'; id: number; list: ListName }
  | { type: 'removeMany'; ids: number[]; list: ListName }
  | { type: 'removeEverywhere'; id: number }
  | { type: 'restore'; entries: LibraryEntry[]; list: ListName }
  | { type: 'markWatchedMany'; movies: Movie[] }
  | { type: 'likeMany'; movies: Movie[] }
  | { type: 'filters'; filters: Filters }
  | { type: 'settings'; settings: Partial<Settings> }
  | { type: 'profile'; profile: Partial<Profile> }
  | { type: 'trailerViewed' }
  | { type: 'resetLibrary' }
  | { type: 'applyCloud'; data: SyncData; userId: string; at: number }
  | { type: 'cloudLinked'; userId: string; at: number }
  | { type: 'signedOut' };

/** Те, що зберігається в хмарі для акаунта. */
export type SyncData = Pick<State, 'profile' | 'liked' | 'watched' | 'disliked' | 'history' | 'trailersViewed'>;

export const syncDataOf = (s: State): SyncData => ({
  profile: s.profile,
  liked: s.liked,
  watched: s.watched,
  disliked: s.disliked,
  history: s.history,
  trailersViewed: s.trailersViewed,
});

const mergeList = (a: LibraryEntry[], b: LibraryEntry[]) => {
  const map = new Map<number, LibraryEntry>();
  [...a, ...b].forEach((e) => {
    const cur = map.get(e.movie.id);
    if (!cur || e.at > cur.at) map.set(e.movie.id, { ...e, myRating: e.myRating ?? cur?.myRating });
  });
  return [...map.values()].sort((x, y) => y.at - x.at);
};

/** Об'єднання гостьових даних пристрою з даними акаунта (при першому вході). */
export const mergeSync = (local: SyncData, cloud: SyncData): SyncData => {
  const seen = new Set<string>();
  return {
    profile: cloud.profile ?? local.profile,
    liked: mergeList(local.liked, cloud.liked ?? []),
    watched: mergeList(local.watched, cloud.watched ?? []),
    disliked: mergeList(local.disliked, cloud.disliked ?? []),
    history: [...(cloud.history ?? []), ...local.history]
      .filter((h) => {
        const k = `${h.id}|${h.at}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((x, y) => x.at - y.at)
      .slice(-2000),
    trailersViewed: Math.max(local.trailersViewed, cloud.trailersViewed ?? 0),
  };
};

const without = (list: LibraryEntry[], id: number) => list.filter((e) => e.movie.id !== id);
const has = (list: LibraryEntry[], id: number) => list.some((e) => e.movie.id === id);

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'hydrate':
      return {
        ...s,
        ...a.state,
        filters: a.state.filtersV === FILTERS_VERSION ? { ...DEFAULT_FILTERS, ...(a.state.filters ?? {}) } : DEFAULT_FILTERS,
        filtersV: FILTERS_VERSION,
        ready: true,
      };
    case 'swipe': {
      const entry = { movie: a.movie, at: Date.now() };
      const id = a.movie.id;
      const history = [...s.history, { id, kind: a.kind, at: entry.at }].slice(-2000);
      if (a.kind === 'like') return { ...s, history, liked: [entry, ...without(s.liked, id)], disliked: without(s.disliked, id) };
      if (a.kind === 'nope') return { ...s, history, disliked: [entry, ...without(s.disliked, id)], liked: without(s.liked, id) };
      return { ...s, history, watched: [entry, ...without(s.watched, id)] };
    }
    case 'undo': {
      const last = s.history[s.history.length - 1];
      if (!last) return s;
      const history = s.history.slice(0, -1);
      const list = last.kind === 'like' ? 'liked' : last.kind === 'nope' ? 'disliked' : 'watched';
      return { ...s, history, [list]: without(s[list], last.id) };
    }
    case 'toggleLike':
      return has(s.liked, a.movie.id)
        ? { ...s, liked: without(s.liked, a.movie.id) }
        : { ...s, liked: [{ movie: a.movie, at: Date.now() }, ...s.liked], disliked: without(s.disliked, a.movie.id) };
    case 'toggleWatched':
      return has(s.watched, a.movie.id)
        ? { ...s, watched: without(s.watched, a.movie.id) }
        : { ...s, watched: [{ movie: a.movie, at: Date.now() }, ...s.watched] };
    case 'rate':
      return { ...s, watched: s.watched.map((e) => (e.movie.id === a.id ? { ...e, myRating: a.rating } : e)) };
    case 'remove':
      return { ...s, [a.list]: without(s[a.list], a.id) };
    case 'removeMany': {
      const ids = new Set(a.ids);
      return { ...s, [a.list]: s[a.list].filter((e) => !ids.has(e.movie.id)) };
    }
    case 'removeEverywhere':
      return { ...s, liked: without(s.liked, a.id), watched: without(s.watched, a.id), disliked: without(s.disliked, a.id) };
    case 'restore': {
      const ids = new Set(a.entries.map((e) => e.movie.id));
      return { ...s, [a.list]: [...a.entries, ...s[a.list].filter((e) => !ids.has(e.movie.id))].sort((x, y) => y.at - x.at) };
    }
    case 'markWatchedMany': {
      const have = new Set(s.watched.map((e) => e.movie.id));
      const now = Date.now();
      return { ...s, watched: [...a.movies.filter((m) => !have.has(m.id)).map((movie) => ({ movie, at: now })), ...s.watched] };
    }
    case 'likeMany': {
      const have = new Set(s.liked.map((e) => e.movie.id));
      const ids = new Set(a.movies.map((m) => m.id));
      const now = Date.now();
      return {
        ...s,
        liked: [...a.movies.filter((m) => !have.has(m.id)).map((movie) => ({ movie, at: now })), ...s.liked],
        disliked: s.disliked.filter((e) => !ids.has(e.movie.id)),
      };
    }
    case 'filters':
      return { ...s, filters: a.filters };
    case 'settings':
      return { ...s, settings: { ...s.settings, ...a.settings } };
    case 'profile':
      return { ...s, profile: { ...s.profile, ...a.profile } };
    case 'trailerViewed':
      return { ...s, trailersViewed: s.trailersViewed + 1 };
    case 'resetLibrary':
      return { ...s, liked: [], watched: [], disliked: [], history: [], trailersViewed: 0 };
    case 'applyCloud':
      return { ...s, ...a.data, cloudUserId: a.userId, lastSyncAt: a.at };
    case 'cloudLinked':
      return { ...s, cloudUserId: a.userId, lastSyncAt: a.at };
    case 'signedOut':
      return {
        ...s,
        liked: [],
        watched: [],
        disliked: [],
        history: [],
        trailersViewed: 0,
        profile: { name: 'Кіноман', avatar: '🍿', createdAt: Date.now() },
        cloudUserId: null,
        lastSyncAt: undefined,
      };
  }
}

type Ctx = {
  state: State;
  dispatch: React.Dispatch<Action>;
  seen: Set<number>;
  isLiked: (id: number) => boolean;
  isWatched: (id: number) => boolean;
  hasKey: boolean;
  api: { apiKey: string; language: Settings['language']; demo: boolean };
  swipe: (movie: Movie, kind: SwipeKind) => void;
};

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => dispatch({ type: 'hydrate', state: raw ? JSON.parse(raw) : {} }))
      .catch(() => dispatch({ type: 'hydrate', state: {} }));
  }, []);

  useEffect(() => {
    if (!state.ready) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const { ready, ...persist } = state;
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persist)).catch(() => {});
    }, 400);
  }, [state]);

  const value = useMemo<Ctx>(() => {
    const likedIds = new Set(state.liked.map((e) => e.movie.id));
    const watchedIds = new Set(state.watched.map((e) => e.movie.id));
    const seen = new Set<number>([...likedIds, ...watchedIds, ...state.disliked.map((e) => e.movie.id)]);
    const hasKey = !!(state.settings.apiKey || ENV_API_KEY);
    return {
      state,
      dispatch,
      seen,
      isLiked: (id) => likedIds.has(id),
      isWatched: (id) => watchedIds.has(id),
      hasKey,
      api: { apiKey: state.settings.apiKey, language: state.settings.language, demo: state.settings.demo || !hasKey },
      swipe: (movie, kind) => dispatch({ type: 'swipe', movie, kind }),
    };
  }, [state]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

export const countActiveFilters = (f: Filters) =>
  (f.genres.length ? 1 : 0) +
  (f.excludeGenres.length ? 1 : 0) +
  (f.yearFrom || f.yearTo ? 1 : 0) +
  (f.minRating ? 1 : 0) +
  (f.minVotes !== DEFAULT_FILTERS.minVotes ? 1 : 0) +
  (f.runtimeMin || f.runtimeMax ? 1 : 0) +
  (f.language ? 1 : 0) +
  (f.country ? 1 : 0) +
  (f.sortBy !== DEFAULT_FILTERS.sortBy ? 1 : 0);

export function useHaptics() {
  const { state } = useStore();
  return useCallback(
    async (kind: 'light' | 'success' | 'warning' = 'light') => {
      if (!state.settings.haptics || Platform.OS === 'web') return;
      try {
        if (kind === 'light') await H.impactAsync(H.ImpactFeedbackStyle.Light);
        else await H.notificationAsync(kind === 'success' ? H.NotificationFeedbackType.Success : H.NotificationFeedbackType.Warning);
      } catch {}
    },
    [state.settings.haptics],
  );
}
