import { DEMO_MOVIES } from './demo';
import { Filters, Movie, MovieDetails, Settings } from './types';

/**
 * Клієнт TMDB (The Movie Database).
 * IMDb не має безкоштовного офіційного API, тому база фільмів береться з TMDB:
 * вона безкоштовна, містить понад мільйон фільмів, IMDb id кожного фільму та трейлери з YouTube.
 * Ключ: https://www.themoviedb.org/settings/api (підходить і "API Key", і "Read Access Token").
 */
const BASE = 'https://api.themoviedb.org/3';
export const IMG = (path: string | null | undefined, size: 'w185' | 'w342' | 'w500' | 'w780' | 'w1280' | 'original' = 'w500') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

export const ENV_API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY ?? '';

export type ApiCtx = Pick<Settings, 'apiKey' | 'language' | 'demo'>;

export class TmdbError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

export const isDemo = (ctx: ApiCtx) => ctx.demo || !effectiveKey(ctx);
const effectiveKey = (ctx: ApiCtx) => (ctx.apiKey || ENV_API_KEY).trim();

async function request<T>(ctx: ApiCtx, path: string, params: Record<string, string | number | undefined | null> = {}): Promise<T> {
  const key = effectiveKey(ctx);
  const isBearer = key.startsWith('eyJ'); // v4 "Read Access Token"
  const qs = new URLSearchParams();
  qs.set('language', ctx.language);
  if (!isBearer) qs.set('api_key', key);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const res = await fetch(`${BASE}${path}?${qs.toString()}`, {
    headers: isBearer ? { Authorization: `Bearer ${key}`, accept: 'application/json' } : { accept: 'application/json' },
  });
  if (res.status === 401) throw new TmdbError('Невірний API ключ TMDB. Перевірте його в Профілі.', 401);
  if (!res.ok) throw new TmdbError(`Помилка TMDB (${res.status})`, res.status);
  return (await res.json()) as T;
}

type RawMovie = {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  vote_average: number;
  vote_count: number;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  original_language: string;
  runtime?: number | null;
  imdb_id?: string | null;
};

const mapMovie = (m: RawMovie): Movie => ({
  id: m.id,
  title: m.title,
  originalTitle: m.original_title,
  overview: m.overview ?? '',
  posterPath: m.poster_path,
  backdropPath: m.backdrop_path,
  releaseDate: m.release_date ?? '',
  rating: Math.round((m.vote_average ?? 0) * 10) / 10,
  votes: m.vote_count ?? 0,
  genreIds: m.genre_ids ?? m.genres?.map((g) => g.id) ?? [],
  language: m.original_language,
  runtime: m.runtime ?? null,
  imdbId: m.imdb_id ?? null,
});

type Page = { page: number; total_pages: number; results: RawMovie[] };

type Slice = { sort?: string; year?: number | null };

export async function discover(ctx: ApiCtx, f: Filters, page: number, slice: Slice = {}): Promise<{ movies: Movie[]; totalPages: number }> {
  if (isDemo(ctx)) {
    const list = DEMO_MOVIES.filter((m) => matchesFilters(m, f));
    return { movies: page === 1 ? shuffle(list) : [], totalPages: 1 };
  }
  const yFrom = slice.year ?? f.yearFrom;
  const yTo = slice.year ?? f.yearTo;
  const data = await request<Page>(ctx, '/discover/movie', {
    page,
    sort_by: slice.sort ?? (f.sortBy === 'random' ? 'popularity.desc' : f.sortBy),
    include_adult: 'false',
    include_video: 'false',
    with_genres: f.genres.length ? f.genres.join(',') : undefined,
    without_genres: f.excludeGenres.length ? f.excludeGenres.join(',') : undefined,
    'primary_release_date.gte': yFrom ? `${yFrom}-01-01` : undefined,
    'primary_release_date.lte': yTo ? `${yTo}-12-31` : todayIso(),
    'vote_average.gte': f.minRating || undefined,
    'vote_count.gte': f.minVotes || undefined,
    'with_runtime.gte': f.runtimeMin ?? undefined,
    'with_runtime.lte': f.runtimeMax ?? undefined,
    with_original_language: f.language ?? undefined,
    with_origin_country: f.country ?? undefined,
  });
  return {
    movies: data.results.map(mapMovie).filter((m) => m.posterPath),
    totalPages: Math.min(data.total_pages, 500),
  };
}

/**
 * Випадковий обхід усієї бази TMDB.
 * TMDB віддає максимум 500 сторінок на один запит-фільтр, тому ми щоразу беремо
 * випадковий «зріз»: випадкове сортування + (часто) випадковий рік + випадкову сторінку.
 * Так доступні всі фільми бази, а не лише перші 10 000 популярних.
 */
const RANDOM_SORTS = [
  'popularity.desc',
  'popularity.asc',
  'vote_average.desc',
  'vote_average.asc',
  'vote_count.desc',
  'vote_count.asc',
  'revenue.desc',
  'primary_release_date.desc',
  'primary_release_date.asc',
  'original_title.asc',
  'original_title.desc',
];

const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

export type Pager = { next: () => Promise<Movie[]>; exhausted: () => boolean };

export function createPager(ctx: ApiCtx, f: Filters): Pager {
  const totals = new Map<string, number>();
  const used = new Set<string>();
  const thisYear = new Date().getFullYear();
  const yFrom = f.yearFrom ?? 1930;
  const yTo = Math.min(f.yearTo ?? thisYear, thisYear);
  let seqPage = 1;
  let done = false;

  const randomNext = async (): Promise<Movie[]> => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const sort = pick(RANDOM_SORTS);
      // 60% запитів — випадковий рік (ближчі роки трохи ймовірніші), решта — весь діапазон
      const useYear = yTo - yFrom >= 2 && Math.random() < 0.6;
      const year = useYear ? yTo - Math.floor(Math.pow(Math.random(), 1.4) * (yTo - yFrom + 1)) : null;
      const key = year ? `y${year}` : 'all';
      const total = totals.get(key);
      if (total === 0) continue;
      const page = total ? randInt(1, total) : 1;
      const id = `${key}|${sort}|${page}`;
      if (used.has(id)) continue;
      used.add(id);
      const res = await discover(ctx, f, page, { sort, year });
      totals.set(key, res.totalPages);
      if (key === 'all' && res.totalPages === 0) {
        done = true;
        return [];
      }
      if (res.movies.length) return shuffle(res.movies);
    }
    return [];
  };

  const sequentialNext = async (): Promise<Movie[]> => {
    const total = totals.get('all');
    if (total !== undefined && seqPage > total) {
      done = true;
      return [];
    }
    const res = await discover(ctx, f, seqPage++);
    totals.set('all', res.totalPages);
    return shuffle(res.movies);
  };

  return {
    next: () => (isDemo(ctx) ? (done ? Promise.resolve([]) : ((done = true), discover(ctx, f, 1).then((r) => r.movies))) : f.sortBy === 'random' ? randomNext() : sequentialNext()),
    exhausted: () => done,
  };
}

export type FeedKind = 'mix' | 'popular' | 'upcoming' | 'now_playing' | 'top_rated';

const MIX_FILTERS: Filters = {
  genres: [],
  excludeGenres: [],
  yearFrom: 1970,
  yearTo: null,
  minRating: 0,
  minVotes: 80,
  runtimeMin: 60,
  runtimeMax: null,
  language: null,
  country: null,
  sortBy: 'random',
};

/** Стрічка трейлерів: «Мікс» — випадкові фільми з усієї бази, інші вкладки — випадкові сторінки своїх списків. */
export function createFeedPager(ctx: ApiCtx, kind: FeedKind): Pager {
  if (kind === 'mix') return createPager(ctx, MIX_FILTERS);
  let total: number | null = null;
  const used = new Set<number>();
  let done = false;
  return {
    exhausted: () => done,
    next: async () => {
      if (isDemo(ctx)) {
        if (done) return [];
        done = true;
        return shuffle(DEMO_MOVIES);
      }
      if (total !== null && used.size >= total) {
        done = true;
        return [];
      }
      let page = 1;
      if (total !== null) {
        do page = randInt(1, total);
        while (used.has(page));
      }
      used.add(page);
      const data = await request<Page>(ctx, `/movie/${kind}`, { page });
      total = Math.min(data.total_pages, 500);
      return shuffle(data.results.map(mapMovie).filter((m) => m.posterPath));
    },
  };
}

export async function search(ctx: ApiCtx, query: string): Promise<Movie[]> {
  if (isDemo(ctx)) {
    const q = query.toLowerCase();
    return DEMO_MOVIES.filter((m) => m.title.toLowerCase().includes(q) || m.originalTitle.toLowerCase().includes(q));
  }
  const data = await request<Page>(ctx, '/search/movie', { query, include_adult: 'false' });
  return data.results.map(mapMovie);
}

type RawVideo = { key: string; site: string; type: string; official: boolean; iso_639_1: string; size: number };

const pickTrailer = (videos: RawVideo[], lang: string): string | null => {
  const yt = videos.filter((v) => v.site === 'YouTube');
  const score = (v: RawVideo) =>
    (v.type === 'Trailer' ? 100 : v.type === 'Teaser' ? 50 : 0) +
    (v.iso_639_1 === lang ? 20 : v.iso_639_1 === 'en' ? 10 : 0) +
    (v.official ? 5 : 0) +
    v.size / 1000;
  const best = yt.sort((a, b) => score(b) - score(a))[0];
  return best && (best.type === 'Trailer' || best.type === 'Teaser') ? best.key : null;
};

export async function trailerKey(ctx: ApiCtx, id: number): Promise<string | null> {
  if (isDemo(ctx)) return DEMO_MOVIES.find((m) => m.id === id)?.trailerKey ?? null;
  const lang = ctx.language.slice(0, 2);
  const data = await request<{ results: RawVideo[] }>(ctx, `/movie/${id}/videos`, {
    include_video_language: `${lang},en,null`,
  });
  return pickTrailer(data.results, lang);
}

export async function details(ctx: ApiCtx, id: number): Promise<MovieDetails> {
  if (isDemo(ctx)) {
    const m = DEMO_MOVIES.find((x) => x.id === id);
    if (m) return m;
    throw new TmdbError('Фільм недоступний у демо-режимі');
  }
  const lang = ctx.language.slice(0, 2);
  const d = await request<
    RawMovie & {
      tagline: string;
      budget: number;
      revenue: number;
      production_countries: { iso_3166_1: string; name: string }[];
      videos: { results: RawVideo[] };
      credits: {
        cast: { id: number; name: string; character: string; profile_path: string | null }[];
        crew: { name: string; job: string }[];
      };
    }
  >(ctx, `/movie/${id}`, { append_to_response: 'videos,credits', include_video_language: `${lang},en,null` });
  return {
    ...mapMovie(d),
    tagline: d.tagline ?? '',
    runtime: d.runtime ?? null,
    imdbId: d.imdb_id ?? null,
    countries: d.production_countries?.map((c) => c.name) ?? [],
    director: d.credits?.crew.find((c) => c.job === 'Director')?.name ?? null,
    cast: (d.credits?.cast ?? []).slice(0, 15).map((c) => ({ id: c.id, name: c.name, character: c.character, profilePath: c.profile_path })),
    trailerKey: pickTrailer(d.videos?.results ?? [], lang),
    budget: d.budget ?? 0,
    revenue: d.revenue ?? 0,
  };
}

export async function validateKey(key: string): Promise<boolean> {
  try {
    await request({ apiKey: key, language: 'en-US', demo: false }, '/configuration');
    return true;
  } catch {
    return false;
  }
}

/* helpers */
export const year = (m: Pick<Movie, 'releaseDate'>) => (m.releaseDate ? m.releaseDate.slice(0, 4) : '—');
const todayIso = () => new Date().toISOString().slice(0, 10);

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function matchesFilters(m: Movie, f: Filters): boolean {
  const y = Number(year(m));
  if (f.genres.length && !f.genres.every((g) => m.genreIds.includes(g))) return false;
  if (f.excludeGenres.some((g) => m.genreIds.includes(g))) return false;
  if (f.yearFrom && y < f.yearFrom) return false;
  if (f.yearTo && y > f.yearTo) return false;
  if (f.minRating && m.rating < f.minRating) return false;
  if (f.runtimeMin && (m.runtime ?? 0) < f.runtimeMin) return false;
  if (f.runtimeMax && (m.runtime ?? 0) > f.runtimeMax) return false;
  if (f.language && m.language !== f.language) return false;
  return true;
}

export const formatRuntime = (min?: number | null) => {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} год ${m ? `${m} хв` : ''}`.trim() : `${m} хв`;
};
