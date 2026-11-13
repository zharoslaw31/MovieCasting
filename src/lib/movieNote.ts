import { bulletLines, cleanName, ID_KEY, isoDay, Note, stamp, yamlStr } from './obsidian';
import { genreName } from './genres';
import { formatRuntime, SHOW_STATUS, year } from './tmdb';
import { Movie, MovieDetails, ShowDetails, TrackEntry } from './types';

/** Стан твору так, як його розуміє Полиця в базі. */
export type Stage = 'want' | 'now' | 'done' | 'drop';
export const STAGE_WORD: Record<Stage, string> = { want: 'хочу', now: 'дивлюсь', done: 'переглянуто', drop: 'кинув' };
export const STAGE_LABEL: Record<Stage, string> = { want: 'Хочу', now: 'Дивлюсь', done: 'Переглянуто', drop: 'Кинув' };

const SITE = 'https://zharoslaw31.github.io/MovieCasting';

/** Як фільм чи серіал зараз записаний у MovieCasting → стан для бази. */
export function stageOf(m: Movie, o: { watched: boolean; liked: boolean; track?: TrackEntry }): Stage {
  if (o.track) {
    if (o.track.status === 'completed') return 'done';
    if (o.track.status === 'dropped') return 'drop';
    if (o.track.status === 'watching') return 'now';
    if (o.track.status === 'planned') return 'want';
  }
  if (o.watched) return m.id < 0 ? 'now' : 'done';
  return 'want';
}

/** Остання переглянута серія з трекера. */
export function lastEpisode(track?: TrackEntry): { s: number; e: number } | null {
  if (!track) return null;
  let best: { s: number; e: number } | null = null;
  for (const [season, eps] of Object.entries(track.watched ?? {})) {
    const s = +season;
    if (!s || !eps?.length) continue;
    const e = Math.max(...eps);
    if (!best || s > best.s || (s === best.s && e > best.e)) best = { s, e };
  }
  return best;
}

export type MovieExtra = {
  stage: Stage;
  rating?: number | null;
  impressions?: string;
  /** коли переглянув (для «закінчив») */
  watchedAt?: number | null;
  track?: TrackEntry;
};

/** Нотатка твору у форматі Полиці бази: властивості, «Про що це», «Враження», «Сенси», «Матеріал». */
export function buildMovieNote(m: Movie, det: MovieDetails | ShowDetails | null, x: MovieExtra): Note {
  const tv = m.id < 0;
  const title = cleanName(m.title) || 'Без назви';
  const y = year(m);
  const today = isoDay();
  const done = x.stage === 'done';
  const doneDay = done ? isoDay(x.watchedAt || Date.now()) : '';
  const started = x.stage === 'now' || done ? doneDay || today : '';
  const author = tv ? ((det as ShowDetails | null)?.creators ?? []).map((c) => c.name).join(', ') : (det as MovieDetails | null)?.director ?? '';
  const imdb = det?.imdbId ?? m.imdbId;
  const link = imdb ? `https://www.imdb.com/title/${imdb}/` : `https://www.themoviedb.org/${tv ? 'tv/' + -m.id : 'movie/' + m.id}`;
  const cover = m.posterPath ? `https://image.tmdb.org/t/p/w342${m.posterPath}` : '';
  const pos = tv ? lastEpisode(x.track) : null;
  const fm = [
    '---',
    'tags:',
    '  - тип/джерело',
    `  - сенс/культура/${tv ? 'серіали' : 'фільми'}`,
    `створено: ${stamp()}`,
    `формат: ${tv ? 'серіал' : 'фільм'}`,
    `статус: ${STAGE_WORD[x.stage]}`,
    `оцінка: ${x.rating ? x.rating : ''}`,
    `автор: ${yamlStr(author)}`,
    `рік: ${/^\d{4}$/.test(y) ? y : ''}`,
    `посилання: ${link}`,
    `обкладинка: ${cover}`,
    `почав: ${started}`,
    `закінчив: ${doneDay}`,
    ...(tv ? [`сезон: ${pos?.s ?? 1}`, `серія: ${pos?.e ?? 0}`] : []),
    ...(x.stage === 'now' || done ? [`востаннє: ${done ? doneDay : today}`] : []),
    `${ID_KEY}: ${m.id}`,
    ...(m.originalTitle && m.originalTitle !== m.title ? [`оригінал: ${yamlStr(m.originalTitle)}`] : []),
    '---',
  ];
  const about = (det?.overview || m.overview || '').trim();
  const mat: string[] = [];
  if (det?.tagline) mat.push(`*${det.tagline.replace(/\*/g, '')}*`, '');
  if (!tv && author) mat.push(`- Режисер: ${author}`);
  if (tv && author) mat.push(`- Автори: ${author}`);
  const cast = (det?.cast ?? []).slice(0, 6).map((c) => (c.character ? `${c.name} (${c.character})` : c.name));
  if (cast.length) mat.push(`- У ролях: ${cast.join(', ')}`);
  const genres = (m.genreIds ?? []).map(genreName).filter((g) => g && g !== '—');
  if (genres.length) mat.push(`- Жанри: ${genres.join(', ')}`);
  if (det?.countries?.length) mat.push(`- Країни: ${det.countries.join(', ')}`);
  if (tv) {
    const sd = det as ShowDetails | null;
    if (sd) mat.push(`- Сезонів: ${sd.seasonsCount}, серій: ${sd.episodesCount}${sd.status ? ` · ${SHOW_STATUS[sd.status] ?? sd.status}` : ''}${sd.networks?.length ? ` · ${sd.networks.join(', ')}` : ''}`);
  } else {
    const rt = formatRuntime((det as MovieDetails | null)?.runtime ?? m.runtime);
    if (rt) mat.push(`- Тривалість: ${rt}`);
  }
  if (m.rating) mat.push(`- TMDB: ${m.rating.toFixed(1)}${m.votes ? ` (${m.votes} голосів)` : ''}`);
  if (det?.trailerKey) mat.push(`- [Трейлер](https://www.youtube.com/watch?v=${det.trailerKey})`);
  if (det?.providers?.link) mat.push(`- [Де дивитись](${det.providers.link})`);
  mat.push(`- [У MovieCasting](${SITE}${tv ? `/tv/${-m.id}` : `/movie/${m.id}`})`);
  const body = [
    `# ${title}`,
    ...(m.originalTitle && m.originalTitle !== m.title ? [`*${m.originalTitle.replace(/\*/g, '')}*`] : []),
    '',
    '```baze',
    'твір',
    '```',
    '',
    '## Про що це (1–2 речення)',
    about.length > 600 ? about.slice(0, 600).replace(/\s+\S*$/, '') + '…' : about,
    '',
    '## Враження',
    ...bulletLines(x.impressions),
    '',
    '## Сенси: про що він насправді',
    '- ',
    '',
    '## Матеріал',
    ...mat,
    '',
    '## Що з цього виросло',
    '```baze',
    'ріст',
    '```',
    '',
  ];
  const alt = /^\d{4}$/.test(y) ? [`${title} (${y})`] : [];
  return { title, alt, id: String(m.id), md: [...fm, ...body].join('\n') };
}
