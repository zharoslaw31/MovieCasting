import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { isEnded } from './series';
import { useStore } from './store';
import { showMeta, tmdbId } from './tmdb';

const HOUR = 3600e3;

/**
 * Оновлює дані про сезони серіалів, які ви відстежуєте (раз на 12 годин, для закінчених — раз на тиждень),
 * щоб Бібліотека знала про нові серії. Запускається при старті і коли повертаєтесь у додаток.
 */
export function useShowRefresh() {
  const { state, api, dispatch } = useStore();
  const tracking = useRef(state.tracking);
  tracking.current = state.tracking;
  const apiRef = useRef(api);
  apiRef.current = api;
  const running = useRef(false);

  useEffect(() => {
    if (!state.ready || api.demo || !api.apiKey) return;
    const run = async () => {
      if (running.current) return;
      running.current = true;
      try {
        const now = Date.now();
        const stale = tracking.current
          .filter((e) => e.status !== 'dropped')
          .filter((e) => !e.meta || now - e.meta.fetchedAt > (isEnded(e.meta) ? 7 * 24 * HOUR : 12 * HOUR))
          .slice(0, 30);
        for (const e of stale) {
          try {
            const { show, meta } = await showMeta(apiRef.current, tmdbId(e.show));
            dispatch({ type: 'trackMeta', show, meta });
          } catch {
            // мережа чи TMDB недоступні — спробуємо наступного разу
          }
        }
      } finally {
        running.current = false;
      }
    };
    const t = setTimeout(run, 1500);
    const sub = AppState.addEventListener('change', (st) => st === 'active' && run());
    return () => {
      clearTimeout(t);
      sub.remove();
    };
  }, [state.ready, api.apiKey, api.demo, api.language, dispatch]);
}
