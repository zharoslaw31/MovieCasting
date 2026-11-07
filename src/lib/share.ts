import { Platform, Share } from 'react-native';
import { year } from './tmdb';
import { Movie } from './types';

const SITE = 'https://zharoslaw31.github.io/MovieCasting';

/** Поділитись фільмом: системне меню, а якщо його немає — копіюємо посилання. */
export async function shareMovie(m: Pick<Movie, 'id' | 'title' | 'releaseDate'>): Promise<'shared' | 'copied' | 'failed'> {
  const url = `${Platform.OS === 'web' && typeof location !== 'undefined' ? location.origin + '/MovieCasting' : SITE}/movie/${m.id}`;
  const text = `${m.title} (${year(m)}) — подивись у MovieCasting`;
  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }) : null;
    if (nav?.share) {
      try {
        await nav.share({ title: m.title, text, url });
        return 'shared';
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return 'shared';
      }
    }
    try {
      await nav?.clipboard?.writeText(`${text}\n${url}`);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
  try {
    await Share.share({ message: `${text}\n${url}` });
    return 'shared';
  } catch {
    return 'failed';
  }
}
