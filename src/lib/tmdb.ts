import { DEMO_MOVIES } from './demo';
import { MOVIE_TO_TV_GENRE, TV_EXCLUDED_GENRES, TV_TO_MOVIE_GENRE } from './genres';
import { ContentType, Episode, EpisodeRef, Filters, Movie, MovieDetails, Person, Provider, Settings, ShowDetails, ShowMeta, WatchProviders } from './types';

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

type RawTv = {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date?: string;
  vote_average: number;
  vote_count: number;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  original_language: string;
  episode_run_time?: number[];
};

/** Жанри серіалу → жанри фільмів (спільна система жанрів у додатку). */
export const normalizeTvGenres = (ids: number[]) => [...new Set(ids.flatMap((g) => TV_TO_MOVIE_GENRE[g] ?? [g]))];

/** Серіал у форматі картки. id від’ємний — щоб не перетинатися з фільмами. */
export const mapTv = (t: RawTv): Movie => ({
  id: -t.id,
  title: t.name,
  originalTitle: t.original_name,
  overview: t.overview ?? '',
  posterPath: t.poster_path,
  backdropPath: t.backdrop_path,
  releaseDate: t.first_air_date ?? '',
  rating: Math.round((t.vote_average ?? 0) * 10) / 10,
  votes: t.vote_count ?? 0,
  genreIds: normalizeTvGenres(t.genre_ids ?? t.genres?.map((g) => g.id) ?? []),
  language: t.original_language,
  runtime: t.episode_run_time?.[0] ?? null,
});

export const isTv = (m: Pick<Movie, 'id'>) => m.id < 0;

/** Лише базові поля — щоб у бібліотеку (і в хмару) не потрапляли актори, схожі фільми тощо з повних деталей. */
export const toMovie = (m: Movie): Movie => ({
  id: m.id,
  title: m.title,
  originalTitle: m.originalTitle,
  overview: m.overview,
  posterPath: m.posterPath,
  backdropPath: m.backdropPath,
  releaseDate: m.releaseDate,
  rating: m.rating,
  votes: m.votes,
  genreIds: m.genreIds,
  language: m.language,
  ...(m.runtime ? { runtime: m.runtime } : {}),
  ...(m.imdbId ? { imdbId: m.imdbId } : {}),
});
export const tmdbId = (m: Pick<Movie, 'id'>) => Math.abs(m.id);
/** Серіал у TMDB не вважаємо «поганим» лише через жанр, але ток-шоу, новини, реаліті й мильні опери відсіюємо. */
const okTv = (t: RawTv) => !(t.genre_ids ?? []).some((g) => TV_EXCLUDED_GENRES.includes(g));

type TvPage = { page: number; total_pages: number; results: RawTv[] };

type Page = { page: number; total_pages: number; results: RawMovie[] };

type Slice = { sort?: string; year?: number | null };

/** Жанри фільтра → жанри серіалів. null — у серіалів такого жанру немає (тоді серіалів під фільтр немає). */
const tvGenresFor = (ids: number[]): number[] | null => {
  const out = new Set<number>();
  for (const g of ids) {
    const t = g in MOVIE_TO_TV_GENRE ? MOVIE_TO_TV_GENRE[g] : g;
    if (t === null) return null;
    out.add(t);
  }
  return [...out];
};

const TV_SORT: Record<string, string> = {
  'primary_release_date.desc': 'first_air_date.desc',
  'primary_release_date.asc': 'first_air_date.asc',
  'revenue.desc': 'vote_count.desc',
  'original_title.asc': 'original_name.asc',
  'original_title.desc': 'original_name.desc',
};

export type MediaKind = 'movie' | 'tv';

export async function discover(ctx: ApiCtx, f: Filters, page: number, slice: Slice = {}, kind: MediaKind = 'movie'): Promise<{ movies: Movie[]; totalPages: number }> {
  if (isDemo(ctx)) {
    if (kind === 'tv') return { movies: [], totalPages: 0 };
    const list = DEMO_MOVIES.filter((m) => matchesFilters(m, f));
    return { movies: page === 1 ? shuffle(list) : [], totalPages: 1 };
  }
  const yFrom = slice.year ?? f.yearFrom;
  const yTo = slice.year ?? f.yearTo;
  const sort = slice.sort ?? (f.sortBy === 'random' ? 'popularity.desc' : f.sortBy);
  if (kind === 'tv') {
    const withG = tvGenresFor(f.genres);
    if (!withG) return { movies: [], totalPages: 0 };
    const withoutG = [...new Set([...TV_EXCLUDED_GENRES, ...(tvGenresFor(f.excludeGenres.filter((g) => MOVIE_TO_TV_GENRE[g] !== null)) ?? [])])];
    const data = await request<TvPage>(ctx, '/discover/tv', {
      page,
      sort_by: TV_SORT[sort] ?? sort,
      include_adult: 'false',
      include_null_first_air_dates: 'false',
      with_genres: withG.length ? withG.join(',') : undefined,
      without_genres: withoutG.join(','),
      'first_air_date.gte': yFrom ? `${yFrom}-01-01` : undefined,
      'first_air_date.lte': yTo ? `${yTo}-12-31` : todayIso(),
      'vote_average.gte': f.minRating || undefined,
      // у серіалів оцінок помітно менше, ніж у фільмів
      'vote_count.gte': f.minVotes ? Math.max(20, Math.round(f.minVotes * 0.4)) : undefined,
      with_original_language: f.language ?? undefined,
      with_origin_country: f.country ?? undefined,
    });
    return { movies: data.results.filter(okTv).map(mapTv).filter((m) => m.posterPath), totalPages: Math.min(data.total_pages, 500) };
  }
  const data = await request<Page>(ctx, '/discover/movie', {
    page,
    sort_by: sort,
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

/** Які типи контенту беремо: фільми, серіали чи обидва (тоді ~60% фільмів і ~40% серіалів). */
export const kindsOf = (t: ContentType | undefined): MediaKind[] => (t === 'tv' ? ['tv'] : t === 'all' ? ['movie', 'tv'] : ['movie']);

export function createPager(ctx: ApiCtx, f: Filters): Pager {
  const kinds = kindsOf(f.contentType);
  const totals = new Map<string, number>();
  const used = new Set<string>();
  const dead = new Set<MediaKind>(); // під фільтр немає жодного серіалу / фільму
  const thisYear = new Date().getFullYear();
  const seqPage: Record<MediaKind, number> = { movie: 1, tv: 1 };
  let done = false;

  const pickKind = (): MediaKind | null => {
    const alive = kinds.filter((k) => !dead.has(k));
    if (!alive.length) return null;
    if (alive.length === 1) return alive[0];
    return Math.random() < 0.6 ? 'movie' : 'tv';
  };

  const randomNext = async (): Promise<Movie[]> => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const kind = pickKind();
      if (!kind) {
        done = true;
        return [];
      }
      // серіали в TMDB — переважно з 1950-х
      const yFrom = f.yearFrom ?? (kind === 'tv' ? 1960 : 1930);
      const yTo = Math.min(f.yearTo ?? thisYear, thisYear);
      const sort = pick(RANDOM_SORTS);
      // 60% запитів — випадковий рік (ближчі роки трохи ймовірніші), решта — весь діапазон
      const useYear = yTo - yFrom >= 2 && Math.random() < 0.6;
      const year = useYear ? yTo - Math.floor(Math.pow(Math.random(), 1.4) * (yTo - yFrom + 1)) : null;
      const key = `${kind}|${year ? `y${year}` : 'all'}`;
      const total = totals.get(key);
      if (total === 0) continue;
      const page = total ? randInt(1, total) : 1;
      const id = `${key}|${sort}|${page}`;
      if (used.has(id)) continue;
      used.add(id);
      const res = await discover(ctx, f, page, { sort, year }, kind);
      totals.set(key, res.totalPages);
      if (!year && res.totalPages === 0) {
        dead.add(kind);
        continue;
      }
      if (res.movies.length) return shuffle(res.movies);
    }
    return [];
  };

  const sequentialNext = async (): Promise<Movie[]> => {
    const alive = kinds.filter((k) => !dead.has(k));
    if (!alive.length) {
      done = true;
      return [];
    }
    // фільми й серіали — по сторінці кожного
    const res = await Promise.all(
      alive.map(async (k) => {
        const total = totals.get(`${k}|all`);
        if (total !== undefined && seqPage[k] > total) {
          dead.add(k);
          return [];
        }
        const r = await discover(ctx, f, seqPage[k]++, {}, k);
        totals.set(`${k}|all`, r.totalPages);
        return r.movies;
      }),
    );
    return shuffle(res.flat());
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
  const kinds = kindsOf(f.contentType);
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
    const pool = taste.seeds.filter((m) => kinds.includes(isTv(m) ? 'tv' : 'movie')).slice(0, 40);
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
        if (isTv(seed)) {
          const d = await request<TvPage>(ctx, `/tv/${tmdbId(seed)}/recommendations`, { page }).catch(() => null);
          return (d?.results ?? []).filter(okTv).map(mapTv);
        }
        const d = await request<Page>(ctx, `/movie/${seed.id}/recommendations`, { page }).catch(() => null);
        return (d?.results ?? []).map(mapMovie);
      });
      // кожен другий раунд — ще й добірка улюблених жанрів (щоб колода не замкнулась на кількох фільмах)
      if (topGenres.length && (rounds % 2 === 1 || !seeds.length)) {
        const g = topGenres.slice(0, randInt(1, Math.min(2, topGenres.length)));
        const page = randInt(1, 15);
        const kind = pick(kinds);
        const key = `${kind}:${g.join('|')}:${page}`;
        if (!usedDiscover.has(key)) {
          usedDiscover.add(key);
          const sort = pick(['vote_average.desc', 'popularity.desc', 'vote_count.desc']);
          if (kind === 'tv') {
            const tg = [...new Set(g.map((x) => (x in MOVIE_TO_TV_GENRE ? MOVIE_TO_TV_GENRE[x] : x)).filter((x): x is number => x !== null))];
            calls.push(
              request<TvPage>(ctx, '/discover/tv', { page, sort_by: sort, with_genres: tg.join('|') || undefined, without_genres: TV_EXCLUDED_GENRES.join(','), 'vote_count.gte': 150 })
                .then((d) => d.results.filter(okTv).map(mapTv))
                .catch(() => []),
            );
          } else {
            calls.push(
              request<Page>(ctx, '/discover/movie', { page, sort_by: sort, with_genres: g.join('|'), 'vote_count.gte': 400, include_adult: 'false' })
                .then((d) => d.results.map(mapMovie))
                .catch(() => []),
            );
          }
        }
      }
      const all = (await Promise.all(calls)).flat();
      const unique = new Map<number, Movie>();
      all.forEach((m) => {
        recCount.set(m.id, (recCount.get(m.id) ?? 0) + 1);
        if (!unique.has(m.id)) unique.set(m.id, m);
      });
      return [...unique.values()]
        .filter((m) => m.posterPath && m.votes >= (isTv(m) ? 40 : 80) && kinds.includes(isTv(m) ? 'tv' : 'movie') && matchesFilters(m, f))
        .map((m) => ({ m, s: scoreOf(taste, m) }))
        .sort((a, b) => b.s - a.s)
        .map((x) => x.m);
    },
  };
}

/* ───────── «Що подивитись сьогодні» ───────── */

export type TonightQuery = {
  kind: MediaKind;
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
  if (isDemo(ctx)) {
    if (q.kind === 'tv') return [];
    return DEMO_MOVIES.filter((m) => (!q.genres.length || q.genres.some((g) => m.genreIds.includes(g))) && !q.without.some((g) => m.genreIds.includes(g)));
  }
  const tv = q.kind === 'tv';
  let genres = q.genres;
  if (tv) {
    const mapped = q.genres.map((g) => (g in MOVIE_TO_TV_GENRE ? MOVIE_TO_TV_GENRE[g] : g)).filter((g): g is number => g !== null);
    // у серіалів немає, наприклад, жахів чи романтики — тоді беремо найближче: драму / детектив
    genres = [...new Set(mapped.length ? mapped : q.genres.length ? [18] : [])];
  }
  const without = tv ? [...new Set([...TV_EXCLUDED_GENRES, ...q.without.map((g) => (g in MOVIE_TO_TV_GENRE ? MOVIE_TO_TV_GENRE[g] : g)).filter((g): g is number => g !== null)])] : q.without;
  const params = (page: number, sort: string) => ({
    page,
    sort_by: tv ? (TV_SORT[sort] ?? sort) : sort,
    include_adult: 'false',
    with_genres: genres.length ? genres.join(q.anyGenre || tv ? '|' : ',') : undefined,
    without_genres: without.length ? without.join(',') : undefined,
    ...(tv
      ? {
          'first_air_date.gte': q.yearFrom ? `${q.yearFrom}-01-01` : undefined,
          'first_air_date.lte': q.yearTo ? `${q.yearTo}-12-31` : todayIso(),
          'vote_count.gte': 300,
        }
      : {
          'with_runtime.gte': 60,
          'with_runtime.lte': q.runtimeMax ?? undefined,
          'primary_release_date.gte': q.yearFrom ? `${q.yearFrom}-01-01` : undefined,
          'primary_release_date.lte': q.yearTo ? `${q.yearTo}-12-31` : todayIso(),
          'vote_count.gte': 800,
        }),
    'vote_average.gte': q.minRating,
  });
  const path = tv ? '/discover/tv' : '/discover/movie';
  const conv = (r: RawMovie | RawTv) => (tv ? (okTv(r as RawTv) ? mapTv(r as RawTv) : null) : mapMovie(r as RawMovie));
  const first = await request<{ total_pages: number; results: (RawMovie | RawTv)[] }>(ctx, path, params(1, 'popularity.desc'));
  const total = Math.min(first.total_pages, 25);
  const pages = new Set<number>();
  while (pages.size < Math.min(3, Math.max(0, total - 1))) pages.add(randInt(2, total));
  const more = await Promise.all(
    [...pages].map((pg, i) =>
      request<{ results: (RawMovie | RawTv)[] }>(ctx, path, params(pg, i === 0 ? 'vote_average.desc' : 'popularity.desc'))
        .then((d) => d.results)
        .catch(() => [] as (RawMovie | RawTv)[]),
    ),
  );
  const seen = new Set<number>();
  return [...first.results, ...more.flat()]
    .map(conv)
    .filter((m): m is Movie => !!m && !!m.posterPath && !seen.has(m.id) && (seen.add(m.id), true));
}

export type FeedKind = 'mix' | 'tv' | 'popular' | 'upcoming' | 'now_playing' | 'top_rated';

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
  contentType: 'all',
};

/** Стрічка трейлерів: «Мікс» — випадкові фільми з усієї бази, інші вкладки — випадкові сторінки своїх списків. */
export function createFeedPager(ctx: ApiCtx, kind: FeedKind): Pager {
  if (kind === 'mix') return createPager(ctx, MIX_FILTERS);
  if (kind === 'tv') return createTvFeedPager(ctx);
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

/** Серіали для трейлерів: популярні, найкращі та ті, що виходять зараз — випадкові сторінки. */
function createTvFeedPager(ctx: ApiCtx): Pager {
  const lists = ['popular', 'top_rated', 'on_the_air'];
  const totals = new Map<string, number>();
  const used = new Set<string>();
  return {
    exhausted: () => isDemo(ctx),
    next: async () => {
      if (isDemo(ctx)) return [];
      for (let attempt = 0; attempt < 6; attempt++) {
        const list = pick(lists);
        const total = totals.get(list);
        const page = total ? randInt(1, Math.min(total, 40)) : 1;
        const key = `${list}|${page}`;
        if (used.has(key)) continue;
        used.add(key);
        const data = await request<TvPage>(ctx, `/tv/${list}`, { page });
        totals.set(list, data.total_pages);
        return shuffle(data.results.filter((t) => okTv(t) && t.vote_count >= 50).map(mapTv).filter((m) => m.posterPath));
      }
      return [];
    },
  };
}

/** Пошук фільмів і серіалів разом (актори не потрапляють). */
export async function search(ctx: ApiCtx, query: string, page = 1): Promise<{ movies: Movie[]; totalPages: number }> {
  if (isDemo(ctx)) {
    const q = query.toLowerCase();
    return { movies: DEMO_MOVIES.filter((m) => m.title.toLowerCase().includes(q) || m.originalTitle.toLowerCase().includes(q)), totalPages: 1 };
  }
  const data = await request<{ total_pages: number; results: ((RawMovie | RawTv) & { media_type: string; popularity?: number })[] }>(ctx, '/search/multi', {
    query,
    page,
    include_adult: 'false',
  });
  const movies = data.results
    .filter((r) => r.media_type === 'movie' || (r.media_type === 'tv' && okTv(r as RawTv)))
    .map((r) => (r.media_type === 'tv' ? mapTv(r as RawTv) : mapMovie(r as RawMovie)));
  return { movies, totalPages: Math.min(data.total_pages, 500) };
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
    combined_credits?: { cast: Credit[]; crew: Credit[] };
    movie_credits?: { cast: Credit[]; crew: Credit[] };
  }>(ctx, `/person/${id}`, { append_to_response: 'combined_credits' });
  type Credit = (RawMovie | RawTv) & { media_type?: string; character?: string; job?: string; episode_count?: number };
  const credits = d.combined_credits ?? d.movie_credits ?? { cast: [], crew: [] };
  const toMovie = (c: Credit) => (c.media_type === 'tv' ? mapTv(c as RawTv) : mapMovie(c as RawMovie));
  const seen = new Set<number>();
  const all = [
    ...(credits.cast ?? []).filter((c) => c.media_type !== 'tv' || (okTv(c as RawTv) && (c.episode_count ?? 2) > 1)).map((c) => ({ m: toMovie(c), role: c.character ?? '' })),
    ...(credits.crew ?? [])
      .filter((c) => ['Director', 'Creator', 'Screenplay', 'Writer', 'Executive Producer'].includes(c.job ?? '') && (c.media_type !== 'tv' || okTv(c as RawTv)))
      .map((c) => ({ m: toMovie(c), role: c.job === 'Director' ? 'Режисер' : c.job === 'Creator' ? 'Автор серіалу' : c.job === 'Executive Producer' ? 'Продюсер' : 'Сценарист' })),
  ]
    .filter(({ m }) => m.posterPath && !seen.has(m.id) && (seen.add(m.id), true))
    .sort((a, b) => b.m.votes - a.m.votes);
  return {
    id: d.id,
    name: d.name,
    biography: d.biography ?? '',
    profilePath: d.profile_path,
    birthday: d.birthday,
    placeOfBirth: d.place_of_birth,
    knownFor: d.known_for_department,
    movies: all.map(({ m, role }) => ({ ...m, role })),
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
  const data = await request<{ results: RawVideo[] }>(ctx, id < 0 ? `/tv/${-id}/videos` : `/movie/${id}/videos`, {
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

type RawEpisodeRef = { season_number: number; episode_number: number; name: string; air_date: string | null } | null;
const mapRef = (e: RawEpisodeRef | undefined): EpisodeRef | null =>
  e ? { season: e.season_number, episode: e.episode_number, name: e.name ?? '', airDate: e.air_date ?? null } : null;

export const SHOW_STATUS: Record<string, string> = {
  'Returning Series': 'Триває',
  Ended: 'Завершено',
  Canceled: 'Закрито',
  'In Production': 'Знімається',
  Planned: 'Анонсовано',
  Pilot: 'Пілот',
};

/** Повна інформація про серіал: сезони, наступна серія, актори, де дивитись, схожі. */
export async function showDetails(ctx: ApiCtx, tvId: number): Promise<ShowDetails> {
  if (isDemo(ctx)) throw new TmdbError('Серіали недоступні в демо-режимі');
  const lang = ctx.language.slice(0, 2);
  const d = await request<
    RawTv & {
      tagline: string;
      last_air_date: string | null;
      status: string;
      number_of_seasons: number;
      number_of_episodes: number;
      seasons: { season_number: number; name: string; episode_count: number; air_date: string | null; poster_path: string | null }[];
      networks: { name: string }[];
      created_by: { id: number; name: string }[];
      origin_country: string[];
      production_countries?: { name: string }[];
      next_episode_to_air: RawEpisodeRef;
      last_episode_to_air: RawEpisodeRef;
      videos: { results: RawVideo[] };
      aggregate_credits?: { cast: { id: number; name: string; profile_path: string | null; roles: { character: string; episode_count: number }[]; total_episode_count: number }[] };
      recommendations?: TvPage;
      similar?: TvPage;
      'watch/providers'?: RawProviders;
      external_ids?: { imdb_id: string | null };
    }
  >(ctx, `/tv/${tvId}`, { append_to_response: 'videos,aggregate_credits,recommendations,similar,watch/providers,external_ids', include_video_language: `${lang},en,null` });
  return {
    ...mapTv(d),
    tagline: d.tagline ?? '',
    lastAirDate: d.last_air_date ?? null,
    status: d.status ?? '',
    seasonsCount: d.number_of_seasons ?? 0,
    episodesCount: d.number_of_episodes ?? 0,
    episodeRuntime: d.episode_run_time?.[0] ?? null,
    seasons: (d.seasons ?? [])
      .filter((x) => x.episode_count > 0)
      .map((x) => ({ n: x.season_number, name: x.name, count: x.episode_count, airDate: x.air_date, posterPath: x.poster_path }))
      .sort((a, b) => (a.n === 0 ? 1 : b.n === 0 ? -1 : a.n - b.n)), // «Спецвипуски» (сезон 0) — в кінці
    networks: (d.networks ?? []).map((n) => n.name),
    creators: (d.created_by ?? []).map((c) => ({ id: c.id, name: c.name })),
    countries: d.production_countries?.map((c) => c.name) ?? d.origin_country ?? [],
    cast: (d.aggregate_credits?.cast ?? []).slice(0, 15).map((c) => ({
      id: c.id,
      name: c.name,
      character: c.roles?.[0]?.character ?? '',
      profilePath: c.profile_path,
      episodes: c.total_episode_count ?? c.roles?.[0]?.episode_count ?? 0,
    })),
    trailerKey: pickTrailer(d.videos?.results ?? [], lang),
    providers: mapProviders(d['watch/providers']),
    similar: (d.recommendations?.results?.length ? d.recommendations.results : d.similar?.results ?? [])
      .filter(okTv)
      .map(mapTv)
      .filter((x) => x.posterPath)
      .slice(0, 16),
    imdbId: d.external_ids?.imdb_id ?? null,
    nextEpisode: mapRef(d.next_episode_to_air),
    lastEpisode: mapRef(d.last_episode_to_air),
  };
}

/** Що потрібно трекеру з деталей серіалу. */
export const metaOf = (d: ShowDetails): ShowMeta => ({
  seasons: d.seasons.filter((x) => x.n > 0).map((x) => ({ n: x.n, count: x.count })),
  status: d.status,
  next: d.nextEpisode,
  last: d.lastEpisode,
  runtime: d.episodeRuntime,
  fetchedAt: Date.now(),
});

/** Легкий запит для трекера: лише сезони й наступна/остання серія (без акторів і рекомендацій). */
export async function showMeta(ctx: ApiCtx, tvId: number): Promise<{ show: Movie; meta: ShowMeta }> {
  const d = await request<
    RawTv & {
      status: string;
      seasons: { season_number: number; episode_count: number }[];
      next_episode_to_air: RawEpisodeRef;
      last_episode_to_air: RawEpisodeRef;
    }
  >(ctx, `/tv/${tvId}`);
  return {
    show: mapTv(d),
    meta: {
      seasons: (d.seasons ?? []).filter((x) => x.season_number > 0 && x.episode_count > 0).map((x) => ({ n: x.season_number, count: x.episode_count })),
      status: d.status ?? '',
      next: mapRef(d.next_episode_to_air),
      last: mapRef(d.last_episode_to_air),
      runtime: d.episode_run_time?.[0] ?? null,
      fetchedAt: Date.now(),
    },
  };
}

export async function seasonEpisodes(ctx: ApiCtx, tvId: number, n: number): Promise<Episode[]> {
  const d = await request<{ episodes: { episode_number: number; name: string; overview: string; air_date: string | null; runtime: number | null; still_path: string | null; vote_average: number }[] }>(
    ctx,
    `/tv/${tvId}/season/${n}`,
  );
  return (d.episodes ?? []).map((e) => ({
    n: e.episode_number,
    name: e.name ?? '',
    overview: e.overview ?? '',
    airDate: e.air_date,
    runtime: e.runtime,
    stillPath: e.still_path,
    rating: Math.round((e.vote_average ?? 0) * 10) / 10,
  }));
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
