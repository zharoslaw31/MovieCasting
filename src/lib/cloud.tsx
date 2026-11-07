import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { mergeSync, SyncData, syncDataOf, useStore } from './store';

if (Platform.OS !== 'web') {
  // supabase-js на Android/iOS потребує повноцінного URL
  require('react-native-url-polyfill/auto');
}

/**
 * Хмарний акаунт (Supabase): email + пароль, бібліотека зберігається в таблиці `libraries`
 * (один рядок на користувача, доступ лише до власного рядка через RLS).
 */
const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const cloudEnabled = !!(URL_ && KEY);

const supabase: SupabaseClient | null = cloudEnabled
  ? createClient(URL_, KEY, {
      auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    })
  : null;

type Row = { data: SyncData; updated_at: string };

async function pull(userId: string): Promise<Row | null> {
  const { data, error } = await supabase!.from('libraries').select('data, updated_at').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return (data as Row) ?? null;
}

async function push(userId: string, data: SyncData): Promise<number> {
  const now = new Date();
  const { error } = await supabase!.from('libraries').upsert({ user_id: userId, data, updated_at: now.toISOString() });
  if (error) throw error;
  return now.getTime();
}

type Status = 'off' | 'idle' | 'syncing' | 'synced' | 'error';

type AuthCtx = {
  enabled: boolean;
  email: string | null;
  status: Status;
  error: string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  syncNow: () => void;
};

const Ctx = createContext<AuthCtx | null>(null);

const humanError = (msg: string) => {
  if (/invalid login/i.test(msg)) return 'Невірний email або пароль';
  if (/already registered|already been registered/i.test(msg)) return 'Такий email уже зареєстровано — увійдіть';
  if (/password should be at least/i.test(msg)) return 'Пароль має містити щонайменше 6 символів';
  if (/email.*invalid|invalid.*email/i.test(msg)) return 'Перевірте email';
  if (/confirm/i.test(msg)) return 'Підтвердьте email за посиланням у листі';
  if (/fetch|network/i.test(msg)) return 'Немає з’єднання з сервером';
  return msg;
};

export function CloudProvider({ children }: { children: React.ReactNode }) {
  const { state, dispatch } = useStore();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>(cloudEnabled ? 'idle' : 'off');
  const [error, setError] = useState<string | null>(null);
  const userId = session?.user.id ?? null;
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastPushedJson = useRef<string>('');
  const linking = useRef(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  /** Перший вхід на пристрої: об'єднуємо гостьові дані з хмарою; повторний — підтягуємо свіжіше. */
  const link = useCallback(async () => {
    if (!supabase || !userId || linking.current) return;
    const s = stateRef.current;
    if (!s.ready) return;
    linking.current = true;
    setStatus('syncing');
    try {
      const row = await pull(userId);
      const local = syncDataOf(s);
      let next: SyncData;
      if (!row) next = local;
      else if (s.cloudUserId === userId) {
        // дані цього акаунта вже на пристрої: беремо новіші
        next = new Date(row.updated_at).getTime() > (s.lastSyncAt ?? 0) ? row.data : local;
      } else if (s.cloudUserId) next = row.data; // на пристрої були дані іншого акаунта
      else next = mergeSync(local, row.data); // гостьові дані + акаунт
      const at = JSON.stringify(next) === JSON.stringify(row?.data) ? new Date(row!.updated_at).getTime() : await push(userId, next);
      lastPushedJson.current = JSON.stringify(next);
      dispatch({ type: 'applyCloud', data: next, userId, at });
      setStatus('synced');
      setError(null);
    } catch (e) {
      setStatus('error');
      setError(humanError(e instanceof Error ? e.message : String(e)));
    } finally {
      linking.current = false;
    }
  }, [userId, dispatch]);

  useEffect(() => {
    if (userId && state.ready) link();
  }, [userId, state.ready, link]);

  // повернулись у додаток — перевіряємо, чи не змінилось на іншому пристрої
  useEffect(() => {
    if (!userId) return;
    const sub = AppState.addEventListener('change', (st) => st === 'active' && link());
    const onVis = () => typeof document !== 'undefined' && document.visibilityState === 'visible' && link();
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', onVis);
    return () => {
      sub.remove();
      if (Platform.OS === 'web') document.removeEventListener('visibilitychange', onVis);
    };
  }, [userId, link]);

  // будь-яка зміна бібліотеки → зберігаємо в хмару (з невеликою затримкою)
  const syncJson = JSON.stringify(syncDataOf(state));
  useEffect(() => {
    if (!supabase || !userId || state.cloudUserId !== userId || syncJson === lastPushedJson.current) return;
    const t = setTimeout(async () => {
      if (linking.current) return;
      setStatus('syncing');
      try {
        const data = JSON.parse(syncJson) as SyncData;
        const at = await push(userId, data);
        lastPushedJson.current = syncJson;
        dispatch({ type: 'cloudLinked', userId, at });
        setStatus('synced');
        setError(null);
      } catch (e) {
        setStatus('error');
        setError(humanError(e instanceof Error ? e.message : String(e)));
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [syncJson, userId, state.cloudUserId, dispatch]);

  const value: AuthCtx = {
    enabled: cloudEnabled,
    email: session?.user.email ?? null,
    status,
    error,
    signIn: async (email, password) => {
      if (!supabase) return 'Хмара не налаштована';
      const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      return e ? humanError(e.message) : null;
    },
    signUp: async (email, password) => {
      if (!supabase) return 'Хмара не налаштована';
      const { data, error: e } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        // посилання з листа веде назад на сайт
        options: Platform.OS === 'web' ? { emailRedirectTo: `${location.origin}/MovieCasting/` } : undefined,
      });
      if (e) return humanError(e.message);
      if (!data.session) return 'Ми надіслали лист — натисніть посилання в ньому, потім поверніться сюди й увійдіть';
      return null;
    },
    signOut: async () => {
      // перед виходом — останнє збереження
      if (supabase && userId && stateRef.current.cloudUserId === userId) {
        try {
          await push(userId, syncDataOf(stateRef.current));
        } catch {}
      }
      await supabase?.auth.signOut();
      lastPushedJson.current = '';
      dispatch({ type: 'signedOut' });
      setStatus('idle');
    },
    syncNow: () => link(),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCloud() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCloud must be used inside CloudProvider');
  return c;
}
