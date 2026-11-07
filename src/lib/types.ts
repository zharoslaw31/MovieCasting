/**
 * Фільм або серіал. Серіали мають від’ємний id (−id з TMDB), бо номери фільмів і серіалів у TMDB перетинаються,
 * а в бібліотеці вони живуть разом. Для серіалу releaseDate — дата першого показу, runtime — тривалість серії.
 */
export type Movie = {
  id: number;
  title: string;
  originalTitle: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string; // YYYY-MM-DD or ''
  rating: number; // 0..10 (TMDB vote average)
  votes: number;
  genreIds: number[];
  language: string;
  runtime?: number | null;
  imdbId?: string | null;
};

export type MovieDetails = Movie & {
  tagline: string;
  runtime: number | null;
  imdbId: string | null;
  countries: string[];
  director: string | null;
  directorId?: number | null;
  cast: { id: number; name: string; character: string; profilePath: string | null }[];
  trailerKey: string | null;
  budget: number;
  revenue: number;
  providers: WatchProviders | null;
  similar: Movie[];
};

export type Provider = { id: number; name: string; logoPath: string | null };
export type WatchProviders = { link: string | null; stream: Provider[]; rent: Provider[]; buy: Provider[] };

export type Person = {
  id: number;
  name: string;
  biography: string;
  profilePath: string | null;
  birthday: string | null;
  placeOfBirth: string | null;
  knownFor: string;
  movies: (Movie & { role: string })[];
};

export type SortBy =
  | 'random'
  | 'popularity.desc'
  | 'vote_average.desc'
  | 'primary_release_date.desc'
  | 'revenue.desc'
  | 'vote_count.desc';

export type Filters = {
  genres: number[];
  excludeGenres: number[];
  yearFrom: number | null;
  yearTo: number | null;
  minRating: number; // 0 = any
  minVotes: number;
  runtimeMin: number | null;
  runtimeMax: number | null;
  language: string | null; // original language ISO 639-1
  country: string | null; // origin country ISO 3166-1
  sortBy: SortBy;
  /** що показувати в Кастингу */
  contentType?: ContentType;
};

export type ContentType = 'movie' | 'tv' | 'all';

export const DEFAULT_FILTERS: Filters = {
  genres: [],
  excludeGenres: [],
  yearFrom: null,
  yearTo: null,
  minRating: 0,
  minVotes: 500,
  runtimeMin: null,
  runtimeMax: null,
  language: null,
  country: null,
  sortBy: 'random',
  contentType: 'all',
};

export type SwipeKind = 'like' | 'nope' | 'watched';

export type LibraryEntry = { movie: Movie; at: number; myRating?: number };

export type Profile = {
  name: string;
  avatar: string; // emoji
  createdAt: number;
};

export type Settings = {
  apiKey: string;
  language: 'uk-UA' | 'en-US';
  demo: boolean;
  haptics: boolean;
  onboarded?: boolean;
  /** Кастинг: уся база або підбір «Для тебе» */
  castingMode?: 'all' | 'foryou';
  /** кімната «Кастингу удвох», у якій ви зараз */
  roomCode?: string | null;
};

/* ───────── Серіали ───────── */

export type EpisodeRef = { season: number; episode: number; name: string; airDate: string | null };

export type Season = { n: number; name: string; count: number; airDate: string | null; posterPath: string | null };

export type Episode = { n: number; name: string; overview: string; airDate: string | null; runtime: number | null; stillPath: string | null; rating: number };

export type ShowDetails = Movie & {
  tagline: string;
  lastAirDate: string | null;
  status: string; // Returning Series | Ended | Canceled | In Production | Planned
  seasonsCount: number;
  episodesCount: number;
  episodeRuntime: number | null;
  seasons: Season[];
  networks: string[];
  creators: { id: number; name: string }[];
  countries: string[];
  cast: { id: number; name: string; character: string; profilePath: string | null; episodes: number }[];
  trailerKey: string | null;
  providers: WatchProviders | null;
  similar: Movie[];
  imdbId: string | null;
  nextEpisode: EpisodeRef | null;
  lastEpisode: EpisodeRef | null;
};

/** Кешовані дані про серіал для трекінгу (оновлюються раз на кілька годин). */
export type ShowMeta = {
  seasons: { n: number; count: number }[];
  status: string;
  next: EpisodeRef | null;
  last: EpisodeRef | null;
  runtime: number | null;
  fetchedAt: number;
};

export type TrackStatus = 'watching' | 'planned' | 'completed' | 'dropped';

export type TrackEntry = {
  show: Movie; // id < 0
  status: TrackStatus;
  /** переглянуті серії: номер сезону → номери серій */
  watched: Record<string, number[]>;
  updatedAt: number;
  lastWatchedAt?: number;
  meta?: ShowMeta;
};
