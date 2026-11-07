import { router } from 'expo-router';

/**
 * «Назад», який працює завжди: якщо сторінку відкрили напряму (за посиланням
 * чи після автооновлення сайту), історії немає — тоді повертаємось на головну.
 */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * Серіали в бібліотеці зберігаються з від’ємним id (щоб не плутати з фільмами, у TMDB їхні номери перетинаються).
 * Відкриває сторінку фільму або серіалу.
 */
export const isTvId = (id: number) => id < 0;
export const titlePath = (id: number) => (id < 0 ? `/tv/${-id}` : `/movie/${id}`);
export function openTitle(id: number) {
  router.push(titlePath(id) as never);
}
