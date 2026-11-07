import { DEMO_MOVIES } from './demo';
import { Filters, Movie, MovieDetails, Person, Provider, Settings, WatchProviders } from './types';

/**
 * Клієнт TMDB (The Movie Database).
 * IMDb не має безкоштовного офіційного API, тому база фільмів береться з TMDB:
 * вона безкоштовна, містить понад мільйон фільмів, IMDb id кожного фільму та трейлери з YouTube.
 * Ключ: https://www.themoviedb.org/settings/api (підходить і "API Key", і "Read Access Token").
 */
const BASE = 'https://api.themoviedb.org/3';
export const IMG = (path: string | null | undefined, size: 'w92' | 'w185' | 'w342' | 'w500' | 'w780' | 'w1280' | 'original' = 'w500') =>
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
  'vote_average.desc',
  'vote_count.desc',
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

/* ───────── «Для тебе»: підбір за смаком ───────── */

export type Taste = {
  /** фільми, від яких відштовхуємось: вподобані й високо оцінені (новіші — першими) */
  seeds: Movie[];
  /** вага жанру від -1 до 1: що частіше вподобаний — то вище, що частіше відхилений — то нижче */
  genres: Record<number, number>;
};

export function buildTaste(liked: { movie: Movie; at: number }[], watched: { movie: Movie; at: number; myRating?: number }[], disliked: { movie: Movie }[]): Taste {
  const score = new Map<number, number>();
  const add = (m: Movie, w: number) => m.genreIds.forEach((g) => score.set(g, (score.get(g) ?? 0) + w));
  liked.forEach((e) => add(e.movie, 1));
  watched.forEach((e) => e.myRating && add(e.movie, e.myRating >= 7 ? 1 : e.myRating <= 4 ? -1 : 0));
  disliked.forEach((e) => add(e.movie, -0.4));
  const max = Math.max(1, ...[...score.values()].map(Math.abs));
  const genres: Record<number, number> = {};
  score.forEach((v, g) => (genres[g] = v / max));
  const seedIds = new Set<number>();
  const seeds = [...liked, ...watched.filter((e) => (e.myRating ?? 0) >= 7)]
    .sort((a, b) => b.at - a.at)
    .map((e) => e.movie)
    .filter((m) => !seedIds.has(m.id) && (seedIds.add(m.id), true));
  return { seeds, genres };
}

/**
 * Колода «Для тебе»: рекомендації TMDB до ваших вподобаних фільмів (свіжі вподобання важать більше)
 * + добірки улюблених жанрів. Кожен фільм отримує бал: скільки ваших фільмів його «радять»,
 * рейтинг і наскільки його жанри вам до смаку. Фільтри Кастингу теж застосовуються.
 */
export function createForYouPager(ctx: ApiCtx, getTaste: () => Taste, f: Filters): Pager {
  // смак читаємо щоразу заново — нові свайпи одразу впливають на наступні картки
  if (isDemo(ctx) || !getTaste().seeds.length) return createPager(ctx, { ...f, sortBy: 'random' });
  const usedSeeds = new Map<number, number>(); // id → скільки сторінок рекомендацій уже взяли
  const usedDiscover = new Set<string>();
  const recCount = new Map<number, number>();
  const topGenresOf = (taste: Taste) =>
    Object.entries(taste.genres)
      .filter(([, w]) => w > 0.25)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([g]) => Number(g));
  let rounds = 0;

  const pickSeeds = (taste: Taste, n: number) => {
    const out: Movie[] = [];
    const pool = taste.seeds.slice(0, 40);
    for (let tries = 0; tries < 30 && out.length < n; tries++) {
      // перевага свіжим вподобанням: індекс зі зміщенням до початку списку
      const m = pool[Math.floor(Math.pow(Math.random(), 1.6) * pool.length)];
      if (!m || out.includes(m) || (usedSeeds.get(m.id) ?? 0) >= 2) continue;
      out.push(m);
    }
    return out;
  };

  const scoreOf = (taste: Taste, m: Movie) => {
    const g = m.genreIds.length ? m.genreIds.reduce((s, id) => s + (taste.genres[id] ?? 0), 0) / m.genreIds.length : 0;
    const votesBoost = Math.min(1, Math.log10(Math.max(10, m.votes)) / 4);
    return (recCount.get(m.id) ?? 0) * 2.2 + m.rating * 0.45 + g * 3 + votesBoost + Math.random() * 1.6;
  };

  return {
    exhausted: () => false,
    next: async () => {
      rounds++;
      const taste = getTaste();
      const topGenres = topGenresOf(taste);
      const seeds = pickSeeds(taste, 3);
      const calls: Promise<Movie[]>[] = seeds.map(async (seed) => {
        const page = (usedSeeds.get(seed.id) ?? 0) + 1;
        usedSeeds.set(seed.id, page);
        const d = await request<Page>(ctx, `/movie/${seed.id}/recommendations`, { page }).catch(() => null);
        return (d?.results ?? []).map(mapMovie);
      });
      // кожен другий раунд — ще й добірка улюблених жанрів (щоб колода не замкнулась на кількох фільмах)
      if (topGenres.length && (rounds % 2 === 1 || !seeds.length)) {
        const g = topGenres.slice(0, randInt(1, Math.min(2, topGenres.length)));
        const page = randInt(1, 15);
        const key = `${g.join('|')}:${page}`;
        if (!usedDiscover.has(key)) {
          usedDiscover.add(key);
          calls.push(
            request<Page>(ctx, '/discover/movie', {
              page,
              sort_by: pick(['vote_average.desc', 'popularity.desc', 'vote_count.desc']),
              with_genres: g.join('|'),
              'vote_count.gte': 400,
              include_adult: 'false',
            })
              .then((d) => d.results.map(mapMovie))
              .catch(() => []),
          );
        }
      }
      const all = (await Promise.all(calls)).flat();
      const unique = new Map<number, Movie>();
      all.forEach((m) => {
        recCount.set(m.id, (recCount.get(m.id) ?? 0) + 1);
        if (!unique.has(m.id)) unique.set(m.id, m);
      });
      return [...unique.values()]
        .filter((m) => m.posterPath && m.votes >= 80 && matchesFilters(m, f))
        .map((m) => ({ m, s: scoreOf(taste, m) }))
        .sort((a, b) => b.s - a.s)
        .map((x) => x.m);
    },
  };
}

/* ───────── «Що подивитись сьогодні» ───────── */

export type TonightQuery = {
  genres: number[];
  anyGenre: boolean; // true — будь-який із жанрів, false — усі разом
  without: number[];
  runtimeMax: number | null;
  yearFrom: number | null;
  yearTo: number | null;
  minRating: number;
};

/** Кандидати з усієї бази під настрій: добрі фільми (≥800 оцінок), випадкові сторінки, щоб щоразу було різне. */
export async function tonightCandidates(ctx: ApiCtx, q: TonightQuery): Promise<Movie[]> {
  if (isDemo(ctx)) return DEMO_MOVIES.filter((m) => (!q.genres.length || q.genres.some((g) => m.genreIds.includes(g))) && !q.without.some((g) => m.genreIds.includes(g)));
  const params = (page: number, sort: string) => ({
    page,
    sort_by: sort,
    include_adult: 'false',
    with_genres: q.genres.length ? q.genres.join(q.anyGenre ? '|' : ',') : undefined,
    without_genres: q.without.length ? q.without.join(',') : undefined,
    'with_runtime.gte': 60,
    'with_runtime.lte': q.runtimeMax ?? undefined,
    'primary_release_date.gte': q.yearFrom ? `${q.yearFrom}-01-01` : undefined,
    'primary_release_date.lte': q.yearTo ? `${q.yearTo}-12-31` : todayIso(),
    'vote_count.gte': 800,
    'vote_average.gte': q.minRating,
  });
  const first = await request<Page>(ctx, '/discover/movie', params(1, 'popularity.desc'));
  const total = Math.min(first.total_pages, 25);
  const pages = new Set<number>();
  while (pages.size < Math.min(3, Math.max(0, total - 1))) pages.add(randInt(2, total));
  const more = await Promise.all(
    [...pages].map((pg, i) =>
      request<Page>(ctx, '/discover/movie', params(pg, i === 0 ? 'vote_average.desc' : 'popularity.desc'))
        .then((d) => d.results)
        .catch(() => [] as RawMovie[]),
    ),
  );
  const seen = new Set<number>();
  return [...first.results, ...more.flat()]
    .map(mapMovie)
    .filter((m) => m.posterPath && !seen.has(m.id) && (seen.add(m.id), true));
}

export type FeedKind = 'mix' | 'popular' | 'upcoming' | 'now_playing' | 'top_rated';

const MIX_FILTERS: Filters = {
  genres: [],
  excludeGenres: [],
  yearFrom: 1970,
  yearTo: null,
  minRating: 0,
  minVotes: 500,
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

export async function search(ctx: ApiCtx, query: string, page = 1): Promise<{ movies: Movie[]; totalPages: number }> {
  if (isDemo(ctx)) {
    const q = query.toLowerCase();
    return { movies: DEMO_MOVIES.filter((m) => m.title.toLowerCase().includes(q) || m.originalTitle.toLowerCase().includes(q)), totalPages: 1 };
  }
  const data = await request<Page>(ctx, '/search/movie', { query, page, include_adult: 'false' });
  return { movies: data.results.map(mapMovie), totalPages: Math.min(data.total_pages, 500) };
}

type RawProvider = { provider_id: number; provider_name: string; logo_path: string | null };
type RawProviders = { results?: Record<string, { link?: string; flatrate?: RawProvider[]; free?: RawProvider[]; ads?: RawProvider[]; rent?: RawProvider[]; buy?: RawProvider[] }> };

/** Де подивитись (дані JustWatch через TMDB) — спершу Україна. */
const mapProviders = (raw: RawProviders | undefined): WatchProviders | null => {
  const r = raw?.results?.UA;
  if (!r) return null;
  const map = (l?: RawProvider[]): Provider[] => (l ?? []).map((p) => ({ id: p.provider_id, name: p.provider_name, logoPath: p.logo_path }));
  const out = { link: r.link ?? null, stream: map([...(r.flatrate ?? []), ...(r.free ?? []), ...(r.ads ?? [])]), rent: map(r.rent), buy: map(r.buy) };
  return out.stream.length || out.rent.length || out.buy.length ? out : null;
};

export async function person(ctx: ApiCtx, id: number): Promise<Person> {
  if (isDemo(ctx)) throw new TmdbError('Недоступно в демо-режимі');
  const d = await request<{
    id: number;
    name: string;
    biography: string;
    profile_path: string | null;
    birthday: string | null;
    place_of_birth: string | null;
    known_for_department: string;
    movie_credits: { cast: (RawMovie & { character?: string; popularity?: number })[]; crew: (RawMovie & { job?: string; popularity?: number })[] };
  }>(ctx, `/person/${id}`, { append_to_response: 'movie_credits' });
  const seen = new Set<number>();
  const all = [
    ...(d.movie_credits?.cast ?? []).map((m) => ({ m, role: m.character ?? '' })),
    ...(d.movie_credits?.crew ?? []).map((m) => ({ m, role: m.job === 'Director' ? 'Режисер' : m.job ?? '' })),
  ]
    .filter(({ m }) => m.poster_path && !seen.has(m.id) && (seen.add(m.id), true))
    .sort((a, b) => (b.m.vote_count ?? 0) - (a.m.vote_count ?? 0));
  return {
    id: d.id,
    name: d.name,
    biography: d.biography ?? '',
    profilePath: d.profile_path,
    birthday: d.birthday,
    placeOfBirth: d.place_of_birth,
    knownFor: d.known_for_department,
    movies: all.map(({ m, role }) => ({ ...mapMovie(m), role })),
  };
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
    if (m) return { ...m, similar: DEMO_MOVIES.filter((x) => x.id !== id).slice(0, 8) };
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
      recommendations?: Page;
      similar?: Page;
      'watch/providers'?: RawProviders;
      credits: {
        cast: { id: number; name: string; character: string; profile_path: string | null }[];
        crew: { id: number; name: string; job: string }[];
      };
    }
  >(ctx, `/movie/${id}`, { append_to_response: 'videos,credits,recommendations,similar,watch/providers', include_video_language: `${lang},en,null` });
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
    directorId: d.credits?.crew.find((c) => c.job === 'Director')?.id ?? null,
    providers: mapProviders(d['watch/providers']),
    similar: (d.recommendations?.results?.length ? d.recommendations.results : d.similar?.results ?? [])
      .map(mapMovie)
      .filter((x) => x.posterPath)
      .slice(0, 16),
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
  if (f.runtimeMin && m.runtime && m.runtime < f.runtimeMin) return false;
  if (f.runtimeMax && m.runtime && m.runtime > f.runtimeMax) return false;
  if (f.language && m.language !== f.language) return false;
  return true;
}

export const formatRuntime = (min?: number | null) => {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} год ${m ? `${m} хв` : ''}`.trim() : `${m} хв`;
};
