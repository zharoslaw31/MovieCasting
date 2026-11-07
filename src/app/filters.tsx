import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, GhostButton, GradientButton, SectionTitle } from '../components/ui';
import { COUNTRIES, GENRES, LANGUAGES } from '../lib/genres';
import { useStore } from '../lib/store';
import { DEFAULT_FILTERS, Filters, SortBy } from '../lib/types';
import { colors, radius } from '../theme';

const THIS_YEAR = new Date().getFullYear();

const ERAS: { label: string; from: number | null; to: number | null }[] = [
  { label: 'Будь-які', from: null, to: null },
  { label: 'Новинки', from: THIS_YEAR - 1, to: null },
  { label: '2020-ті', from: 2020, to: 2029 },
  { label: '2010-ті', from: 2010, to: 2019 },
  { label: '2000-ні', from: 2000, to: 2009 },
  { label: '90-ті', from: 1990, to: 1999 },
  { label: '80-ті', from: 1980, to: 1989 },
  { label: 'Класика до 1980', from: null, to: 1979 },
];

const RATINGS = [0, 5, 6, 7, 7.5, 8];
const VOTES = [0, 20, 100, 500, 2000, 10000];
const RUNTIMES: { label: string; min: number | null; max: number | null }[] = [
  { label: 'Будь-яка', min: null, max: null },
  { label: 'до 90 хв', min: null, max: 90 },
  { label: '90–120 хв', min: 90, max: 120 },
  { label: '2–2.5 год', min: 120, max: 150 },
  { label: '2.5+ год', min: 150, max: null },
];
const SORTS: { value: SortBy; label: string; icon: string }[] = [
  { value: 'random', label: 'Випадково з усієї бази', icon: '🎲' },
  { value: 'popularity.desc', label: 'Популярні', icon: '🔥' },
  { value: 'vote_average.desc', label: 'Найвищий рейтинг', icon: '⭐' },
  { value: 'vote_count.desc', label: 'Найбільше оцінок', icon: '👥' },
  { value: 'primary_release_date.desc', label: 'Найновіші', icon: '🆕' },
  { value: 'revenue.desc', label: 'Касові хіти', icon: '💰' },
];

export default function FiltersScreen() {
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useStore();
  const [f, setF] = useState<Filters>(state.filters);
  const set = (patch: Partial<Filters>) => setF((p) => ({ ...p, ...patch }));

  const toggleGenre = (id: number) => {
    // тап: увімкнути → виключити → нейтрально
    if (f.genres.includes(id)) set({ genres: f.genres.filter((g) => g !== id), excludeGenres: [...f.excludeGenres, id] });
    else if (f.excludeGenres.includes(id)) set({ excludeGenres: f.excludeGenres.filter((g) => g !== id) });
    else set({ genres: [...f.genres, id] });
  };

  const apply = () => {
    dispatch({ type: 'filters', filters: f });
    router.back();
  };

  const stepYear = (key: 'yearFrom' | 'yearTo', delta: number) => {
    const base = f[key] ?? (key === 'yearFrom' ? 2000 : THIS_YEAR);
    const next = Math.min(THIS_YEAR + 2, Math.max(1900, base + delta));
    set({ [key]: next } as Partial<Filters>);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={28} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Фільтри</Text>
        <Pressable onPress={() => setF(DEFAULT_FILTERS)} hitSlop={12}>
          <Text style={styles.reset}>Скинути</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <SectionTitle>Сортування</SectionTitle>
        <View style={styles.wrap}>
          {SORTS.map((s) => (
            <Chip key={s.value} label={s.label} icon={s.icon} active={f.sortBy === s.value} onPress={() => set({ sortBy: s.value })} />
          ))}
        </View>

        <SectionTitle>Жанри</SectionTitle>
        <Text style={styles.hint}>Тап — включити, ще тап — виключити, ще — скинути</Text>
        <View style={styles.wrap}>
          {GENRES.map((g) => (
            <Chip
              key={g.id}
              label={f.excludeGenres.includes(g.id) ? `без: ${g.name}` : g.name}
              icon={g.emoji}
              active={f.genres.includes(g.id) || f.excludeGenres.includes(g.id)}
              tone={f.excludeGenres.includes(g.id) ? 'nope' : 'brand'}
              onPress={() => toggleGenre(g.id)}
            />
          ))}
        </View>

        <SectionTitle>Роки виходу</SectionTitle>
        <View style={styles.wrap}>
          {ERAS.map((e) => (
            <Chip key={e.label} label={e.label} active={f.yearFrom === e.from && f.yearTo === e.to} onPress={() => set({ yearFrom: e.from, yearTo: e.to })} />
          ))}
        </View>
        <View style={styles.yearRow}>
          <Stepper label="Від" value={f.yearFrom ? String(f.yearFrom) : '—'} onMinus={() => stepYear('yearFrom', -1)} onPlus={() => stepYear('yearFrom', 1)} onLongMinus={() => stepYear('yearFrom', -10)} onLongPlus={() => stepYear('yearFrom', 10)} />
          <Stepper label="До" value={f.yearTo ? String(f.yearTo) : '—'} onMinus={() => stepYear('yearTo', -1)} onPlus={() => stepYear('yearTo', 1)} onLongMinus={() => stepYear('yearTo', -10)} onLongPlus={() => stepYear('yearTo', 10)} />
        </View>

        <SectionTitle>Мінімальний рейтинг</SectionTitle>
        <View style={styles.wrap}>
          {RATINGS.map((r) => (
            <Chip key={r} label={r ? `${r}+ ★` : 'Будь-який'} active={f.minRating === r} onPress={() => set({ minRating: r })} />
          ))}
        </View>

        <SectionTitle>Кількість оцінок</SectionTitle>
        <Text style={styles.hint}>Відсікає маловідомі фільми з випадковими рейтингами</Text>
        <View style={styles.wrap}>
          {VOTES.map((v) => (
            <Chip key={v} label={v ? `${v.toLocaleString('uk-UA')}+` : 'Будь-яка'} active={f.minVotes === v} onPress={() => set({ minVotes: v })} />
          ))}
        </View>

        <SectionTitle>Тривалість</SectionTitle>
        <View style={styles.wrap}>
          {RUNTIMES.map((r) => (
            <Chip key={r.label} label={r.label} active={f.runtimeMin === r.min && f.runtimeMax === r.max} onPress={() => set({ runtimeMin: r.min, runtimeMax: r.max })} />
          ))}
        </View>

        <SectionTitle>Мова оригіналу</SectionTitle>
        <View style={styles.wrap}>
          <Chip label="Будь-яка" active={!f.language} onPress={() => set({ language: null })} />
          {LANGUAGES.map((l) => (
            <Chip key={l.code} label={l.name} active={f.language === l.code} onPress={() => set({ language: l.code })} />
          ))}
        </View>

        <SectionTitle>Країна виробництва</SectionTitle>
        <View style={styles.wrap}>
          <Chip label="Будь-яка" active={!f.country} onPress={() => set({ country: null })} />
          {COUNTRIES.map((c) => (
            <Chip key={c.code} label={c.name} icon={c.flag} active={f.country === c.code} onPress={() => set({ country: c.code })} />
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <GhostButton title="Скасувати" onPress={() => router.back()} style={{ flex: 1 }} />
        <GradientButton title="Показати фільми" icon="sparkles" onPress={apply} style={{ flex: 2 }} />
      </View>
    </View>
  );
}

function Stepper(props: { label: string; value: string; onMinus: () => void; onPlus: () => void; onLongMinus: () => void; onLongPlus: () => void }) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepLabel}>{props.label}</Text>
      <View style={styles.stepRow}>
        <Pressable onPress={props.onMinus} onLongPress={props.onLongMinus} style={styles.stepBtn} hitSlop={6}>
          <Ionicons name="remove" size={18} color={colors.text} />
        </Pressable>
        <Text style={styles.stepValue}>{props.value}</Text>
        <Pressable onPress={props.onPlus} onLongPress={props.onLongPlus} style={styles.stepBtn} hitSlop={6}>
          <Ionicons name="add" size={18} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  reset: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  hint: { color: colors.textMuted, fontSize: 13, marginTop: -6, marginBottom: 10 },
  yearRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  stepper: { flex: 1, backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12 },
  stepLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  stepBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  stepValue: { color: colors.text, fontSize: 20, fontWeight: '800' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 14,
    backgroundColor: colors.bg + 'F2',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
