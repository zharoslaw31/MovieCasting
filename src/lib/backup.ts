import { Platform } from 'react-native';
import { SyncData } from './store';

/**
 * Резервна копія бібліотеки у файл (лише сайт): працює і без акаунта —
 * можна перенести дані на інший телефон чи зберегти про всяк випадок.
 */
export const backupSupported = Platform.OS === 'web' && typeof document !== 'undefined';

export function downloadBackup(data: SyncData) {
  const json = JSON.stringify({ app: 'MovieCasting', version: 1, exportedAt: new Date().toISOString(), data }, null, 1);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `moviecasting-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Відкриває вибір файлу і повертає дані з копії (або текст помилки). */
export function pickBackup(): Promise<SyncData | string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        const raw = JSON.parse(await file.text());
        const d = raw?.data ?? raw;
        if (!d || !Array.isArray(d.liked) || !Array.isArray(d.watched) || !Array.isArray(d.disliked)) return resolve('Це не схоже на копію MovieCasting');
        resolve({
          profile: d.profile,
          liked: d.liked,
          watched: d.watched,
          disliked: d.disliked,
          history: Array.isArray(d.history) ? d.history : [],
          trailersViewed: Number(d.trailersViewed) || 0,
          tracking: Array.isArray(d.tracking) ? d.tracking : [],
        });
      } catch {
        resolve('Не вдалося прочитати файл');
      }
    };
    input.click();
  });
}
