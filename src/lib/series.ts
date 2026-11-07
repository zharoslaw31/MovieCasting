import { EpisodeRef, ShowMeta, TrackEntry, TrackStatus } from './types';

/**
 * Логіка трекінгу серіалів: що вже вийшло, що переглянуто, яка серія наступна.
 * Сезон 0 («Спецвипуски») у прогрес не входить.
 */

export const watchedIn = (e: TrackEntry | undefined, season: number) => new Set(e?.watched[String(season)] ?? []);

export const isWatchedEp = (e: TrackEntry | undefined, season: number, episode: number) => !!e?.watched[String(season)]?.includes(episode);

/** Чи вже вийшла серія (за останньою показаною серією; якщо даних немає — за датою). */
export function isAired(meta: ShowMeta | undefined, season: number, episode: number, airDate?: string | null): boolean {
  if (airDate) return new Date(airDate).getTime() <= Date.now();
  const last = meta?.last;
  if (!last) return false;
  return season < last.season || (season === last.season && episode <= last.episode);
}

export function airedCount(meta: ShowMeta | undefined): number {
  if (!meta?.last) return 0;
  const last = meta.last;
  return meta.seasons.reduce((sum, s) => sum + (s.n < last.season ? s.count : s.n === last.season ? Math.min(last.episode, s.count) : 0), 0);
}

export const totalCount = (meta: ShowMeta | undefined) => meta?.seasons.reduce((s, x) => s + x.count, 0) ?? 0;

export function watchedCount(e: TrackEntry | undefined): number {
  if (!e) return 0;
  return Object.entries(e.watched).reduce((sum, [s, eps]) => sum + (Number(s) > 0 ? eps.length : 0), 0);
}

/** Наступна непереглянута серія (по порядку сезонів). aired=false — ще не вийшла. */
export function nextToWatch(e: TrackEntry | undefined, meta = e?.meta): (EpisodeRef & { aired: boolean }) | null {
  if (!meta) return null;
  for (const s of [...meta.seasons].sort((a, b) => a.n - b.n)) {
    if (s.n === 0) continue;
    const done = watchedIn(e, s.n);
    for (let ep = 1; ep <= s.count; ep++) {
      if (done.has(ep)) continue;
      const isNextAir = meta.next && meta.next.season === s.n && meta.next.episode === ep;
      return {
        season: s.n,
        episode: ep,
        name: isNextAir ? meta.next!.name : '',
        airDate: isNextAir ? meta.next!.airDate : null,
        aired: isAired(meta, s.n, ep),
      };
    }
  }
  // усе відоме переглянуто — можливо, анонсовано новий сезон
  if (meta.next && !isWatchedEp(e, meta.next.season, meta.next.episode)) return { ...meta.next, aired: false };
  return null;
}

/** Частка переглянутого серед того, що вже вийшло (0..1). */
export function progressOf(e: TrackEntry | undefined): number {
  const aired = airedCount(e?.meta);
  if (!aired) return 0;
  const meta = e!.meta!;
  let w = 0;
  Object.entries(e!.watched).forEach(([s, eps]) => {
    const n = Number(s);
    if (n > 0) w += eps.filter((ep) => isAired(meta, n, ep)).length;
  });
  return Math.min(1, w / aired);
}

export const isEnded = (meta?: ShowMeta) => meta?.status === 'Ended' || meta?.status === 'Canceled';

/** Усе, що вийшло, переглянуто. */
export const caughtUp = (e: TrackEntry | undefined) => !!e?.meta && airedCount(e.meta) > 0 && progressOf(e) >= 1;

/** Статус з урахуванням прогресу: дивитесь і все переглянули в закритому серіалі → «Переглянуто». */
export function effectiveStatus(e: TrackEntry): TrackStatus {
  if (e.status === 'dropped') return e.status;
  // серіал продовжили — вийшли нові серії після того, як ви все переглянули
  if (e.status === 'completed') return !isEnded(e.meta) && e.meta && watchedCount(e) > 0 && !caughtUp(e) && airedCount(e.meta) > 0 ? 'watching' : 'completed';
  if (caughtUp(e) && isEnded(e.meta)) return 'completed';
  if (e.status === 'planned' && watchedCount(e) > 0) return 'watching';
  return e.status;
}

export const epCode = (season: number, episode: number) => `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;

export const STATUS_LABEL: Record<TrackStatus, string> = {
  watching: 'Дивлюсь',
  planned: 'Планую',
  completed: 'Переглянуто',
  dropped: 'Кинув',
};

/** «сьогодні», «завтра», «через 3 дн. (12 листопада)», «12 листопада»; short — без дати в дужках. */
export const formatAirDate = (d: string | null | undefined, short = false) => {
  if (!d) return '';
  const date = new Date(d);
  const days = Math.ceil((date.getTime() - Date.now()) / 86400000);
  const txt = date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
  if (days === 0) return 'сьогодні';
  if (days === 1) return 'завтра';
  if (days > 1 && days < 7) return short ? `через ${days} дн.` : `через ${days} дн. (${txt})`;
  return txt;
};

/** Скільки днів тому вийшла серія (для позначки «Нова серія»). */
export const daysSince = (d: string | null | undefined) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : Infinity);

/** 1 серія, 2 серії, 5 серій. */
export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  const w = m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  return `${n} ${w}`;
}

export type EpisodeChange = { season: number; episodes: number[]; on: boolean };

/** Непереглянуті серії, що вийшли раніше за вказану (щоб запропонувати «позначити й попередні»). */
export function unwatchedBefore(e: TrackEntry | undefined, meta: ShowMeta | undefined, season: number, episode: number): { changes: EpisodeChange[]; count: number } {
  if (!meta || season <= 0) return { changes: [], count: 0 };
  const changes: EpisodeChange[] = [];
  let count = 0;
  [...meta.seasons]
    .filter((s) => s.n > 0 && s.n <= season)
    .sort((a, b) => a.n - b.n)
    .forEach((s) => {
      const done = watchedIn(e, s.n);
      const last = s.n < season ? s.count : episode - 1;
      const eps: number[] = [];
      for (let ep = 1; ep <= last; ep++) if (!done.has(ep) && isAired(meta, s.n, ep)) eps.push(ep);
      if (eps.length) {
        changes.push({ season: s.n, episodes: eps, on: true });
        count += eps.length;
      }
    });
  return { changes, count };
}

/** «12 год 30 хв» / «45 хв» / «3 дн. 4 год». */
export function formatDuration(min: number) {
  if (min < 60) return `${Math.round(min)} хв`;
  const h = Math.floor(min / 60);
  if (h >= 48) return `${Math.floor(h / 24)} дн. ${h % 24} год`;
  const m = Math.round(min % 60);
  return m ? `${h} год ${m} хв` : `${h} год`;
}

/** Вийшла свіжа серія (за останній тиждень), яку ви ще не бачили — для позначки «Нова серія». */
export function hasNewEpisode(e: TrackEntry): boolean {
  const last = e.meta?.last;
  if (!last || effectiveStatus(e) !== 'watching') return false;
  const d = daysSince(last.airDate);
  return d >= -1 && d <= 7 && !isWatchedEp(e, last.season, last.episode);
}
