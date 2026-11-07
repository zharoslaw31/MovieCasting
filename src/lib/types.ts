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
};

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
};
