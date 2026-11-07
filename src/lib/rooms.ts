import { supabase } from './cloud';
import { createPager, ApiCtx } from './tmdb';
import { DEFAULT_FILTERS, Filters, Movie } from './types';

/**
 * «Кастинг удвох»: кімната зі спільною колодою фільмів. Кожен свайпає у себе,
 * а метч — це фільм, який сподобався всім учасникам кімнати.
 * Таблиці й правила доступу: supabase/rooms.sql.
 */
export type RoomMember = { user_id: string; name: string | null; avatar: string | null };
export type RoomSwipe = { user_id: string; movie_id: number; liked: boolean };
export type Room = { code: string; host: string; title: string | null; filters: Partial<Filters> | null; deck: Movie[] };

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // без схожих 0/O, 1/I/L
const newCode = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
export const normalizeCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

const db = () => {
  if (!supabase) throw new Error('Хмарний акаунт не підключено');
  return supabase;
};

/** Колоду зберігаємо компактно — лише те, що потрібно для картки. */
const compact = (m: Movie): Movie => ({
  id: m.id,
  title: m.title,
  originalTitle: m.originalTitle,
  overview: m.overview.length > 400 ? m.overview.slice(0, 397) + '…' : m.overview,
  posterPath: m.posterPath,
  backdropPath: m.backdropPath,
  releaseDate: m.releaseDate,
  rating: m.rating,
  votes: m.votes,
  genreIds: m.genreIds,
  language: m.language,
});

const humanize = (e: { message?: string; code?: string } | null): Error => {
  const msg = e?.message ?? 'Помилка';
  if (/relation .*does not exist|Could not find the table/i.test(msg)) return new Error('Кімнати ще не налаштовані в Supabase (потрібно виконати SQL з інструкції)');
  if (/fetch|network/i.test(msg)) return new Error('Немає з’єднання з сервером');
  return new Error(msg);
};

export async function createRoom(deck: Movie[], title: string | null, filters: Partial<Filters>, me: { name: string; avatar: string }, userId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    const { error } = await db().from('rooms').insert({ code, host: userId, title, filters, deck: deck.map(compact) });
    if (error) {
      if (error.code === '23505') continue; // такий код уже є — генеруємо інший
      throw humanize(error);
    }
    const { error: e2 } = await db().from('room_members').upsert({ code, user_id: userId, name: me.name, avatar: me.avatar });
    if (e2) throw humanize(e2);
    return code;
  }
  throw new Error('Не вдалося створити кімнату, спробуйте ще раз');
}

export async function joinRoom(rawCode: string, me: { name: string; avatar: string }, userId: string): Promise<Room> {
  const code = normalizeCode(rawCode);
  const { data, error } = await db().from('rooms').select('code, host, title, filters, deck').eq('code', code).maybeSingle();
  if (error) throw humanize(error);
  if (!data) throw new Error('Кімнату з таким кодом не знайдено');
  const { error: e2 } = await db().from('room_members').upsert({ code, user_id: userId, name: me.name, avatar: me.avatar });
  if (e2) throw humanize(e2);
  return data as Room;
}

export async function fetchRoom(code: string): Promise<Room | null> {
  const { data, error } = await db().from('rooms').select('code, host, title, filters, deck').eq('code', code).maybeSingle();
  if (error) throw humanize(error);
  return (data as Room) ?? null;
}

export async function fetchActivity(code: string): Promise<{ members: RoomMember[]; swipes: RoomSwipe[] }> {
  const [m, s] = await Promise.all([
    db().from('room_members').select('user_id, name, avatar').eq('code', code),
    db().from('room_swipes').select('user_id, movie_id, liked').eq('code', code),
  ]);
  if (m.error) throw humanize(m.error);
  if (s.error) throw humanize(s.error);
  return { members: (m.data ?? []) as RoomMember[], swipes: (s.data ?? []) as RoomSwipe[] };
}

export async function sendSwipe(code: string, userId: string, movieId: number, liked: boolean) {
  const { error } = await db().from('room_swipes').upsert({ code, user_id: userId, movie_id: movieId, liked });
  if (error) throw humanize(error);
}

export async function undoSwipe(code: string, userId: string, movieId: number) {
  await db().from('room_swipes').delete().eq('code', code).eq('user_id', userId).eq('movie_id', movieId);
}

/** Дописуємо нові фільми в кінець спільної колоди (беремо свіжу версію, щоб не затерти чужі). */
export async function appendDeck(code: string, movies: Movie[]): Promise<Movie[]> {
  const room = await fetchRoom(code);
  if (!room) throw new Error('Кімнату видалено');
  const have = new Set(room.deck.map((m) => m.id));
  const deck = [...room.deck, ...movies.filter((m) => !have.has(m.id)).map(compact)];
  const { error } = await db().from('rooms').update({ deck }).eq('code', code);
  if (error) throw humanize(error);
  return deck;
}

export async function leaveRoom(code: string, userId: string) {
  await db().from('room_members').delete().eq('code', code).eq('user_id', userId);
}

/** Нова порція колоди: випадкові добрі фільми під фільтри кімнати. */
export async function buildDeck(api: ApiCtx, filters: Partial<Filters> | null, exclude: Set<number>, size = 40): Promise<Movie[]> {
  const pager = createPager(api, { ...DEFAULT_FILTERS, minVotes: 800, minRating: 6, ...(filters ?? {}), sortBy: 'random' });
  const out = new Map<number, Movie>();
  for (let round = 0; round < 6 && out.size < size && !pager.exhausted(); round++) {
    const batches = await Promise.all([pager.next(), pager.next(), pager.next()]);
    batches.flat().forEach((m) => !exclude.has(m.id) && m.posterPath && out.set(m.id, m));
  }
  const list = [...out.values()];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, size);
}

/** Метчі: фільми з колоди, які вподобали всі учасники (коли їх щонайменше двоє). */
export function matchesOf(deck: Movie[], members: RoomMember[], swipes: RoomSwipe[]): Movie[] {
  if (members.length < 2) return [];
  const likes = new Map<number, Set<string>>();
  swipes.forEach((s) => {
    if (!s.liked) return;
    if (!likes.has(s.movie_id)) likes.set(s.movie_id, new Set());
    likes.get(s.movie_id)!.add(s.user_id);
  });
  return deck.filter((m) => members.every((mb) => likes.get(m.id)?.has(mb.user_id)));
}
