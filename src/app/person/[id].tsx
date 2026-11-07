import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GhostButton, GradientButton, Poster, RatingBadge } from '../../components/ui';
import { goBack, openTitle } from '../../lib/nav';
import { useStore } from '../../lib/store';
import { person as loadPerson, year } from '../../lib/tmdb';
import { Person } from '../../lib/types';
import { colors, radius } from '../../theme';

/** Актор / режисер: коротка біографія і фільмографія. */
export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { api, isLiked, isWatched } = useStore();
  const [p, setP] = useState<Person | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bioOpen, setBioOpen] = useState(false);

  const load = () => {
    setError(null);
    loadPerson(api, Number(id))
      .then(setP)
      .catch((e) => setError(e instanceof Error ? e.message : 'Помилка'));
  };
  useEffect(load, [id, api.apiKey, api.language, api.demo]); // eslint-disable-line react-hooks/exhaustive-deps

  const cols = width > 700 ? 5 : 3;
  const gap = 10;
  const cardW = (Math.min(width, 1100) - 32 - gap * (cols - 1)) / cols;

  if (!p) {
    return (
      <View style={[styles.screen, styles.center]}>
        {error ? (
          <>
            <Text style={styles.muted}>{error}</Text>
            <GradientButton title="Спробувати ще" icon="refresh" onPress={load} style={{ marginTop: 18 }} />
          </>
        ) : (
          <ActivityIndicator color={colors.accent} size="large" />
        )}
        <GhostButton title="Назад" icon="chevron-back" onPress={goBack} style={{ marginTop: 12 }} />
      </View>
    );
  }

  const born = [p.birthday ? new Date(p.birthday).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }) : null, p.placeOfBirth].filter(Boolean).join(' · ');

  return (
    <View style={styles.screen}>
      <FlatList
        data={p.movies}
        key={cols}
        numColumns={cols}
        keyExtractor={(m) => String(m.id)}
        columnWrapperStyle={{ gap }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40, gap }}
        ListHeaderComponent={
          <View style={{ marginBottom: 8 }}>
            <View style={styles.head}>
              <Poster path={p.profilePath} size="w342" rounded={radius.lg} style={styles.photo} />
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={styles.name}>{p.name}</Text>
                {p.knownFor ? <Text style={styles.meta}>{p.knownFor === 'Acting' ? 'Актор / акторка' : p.knownFor === 'Directing' ? 'Режисер' : p.knownFor}</Text> : null}
                {born ? <Text style={styles.meta}>{born}</Text> : null}
                <Text style={styles.meta}>Фільмів: {p.movies.length}</Text>
              </View>
            </View>
            {p.biography ? (
              <Pressable onPress={() => setBioOpen((v) => !v)}>
                <Text style={styles.bio} numberOfLines={bioOpen ? undefined : 4}>
                  {p.biography}
                </Text>
                <Text style={styles.more}>{bioOpen ? 'Згорнути' : 'Читати далі'}</Text>
              </Pressable>
            ) : null}
            <Text style={styles.h}>Фільмографія</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={{ width: cardW }} onPress={() => openTitle(item.id)}>
            <View>
              <Poster path={item.posterPath} title={item.title} size="w342" style={{ width: cardW, height: cardW * 1.5 }} />
              <View style={styles.badge}>
                <RatingBadge value={item.rating} />
              </View>
              {item.id < 0 ? (
                <View style={styles.tv}>
                  <Text style={styles.tvText}>СЕРІАЛ</Text>
                </View>
              ) : null}
              {isLiked(item.id) || isWatched(item.id) ? (
                <View style={styles.mark}>
                  <Ionicons name={isLiked(item.id) ? 'heart' : 'eye'} size={12} color="#fff" />
                </View>
              ) : null}
            </View>
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.role} numberOfLines={1}>
              {year(item)}
              {item.role ? ` · ${item.role}` : ''}
            </Text>
          </Pressable>
        )}
      />
      <Pressable onPress={goBack} style={[styles.back, { top: insets.top + 8 }]} hitSlop={10} accessibilityLabel="Назад">
        <Ionicons name="chevron-back" size={24} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  head: { flexDirection: 'row', alignItems: 'flex-end' },
  photo: { width: 120, height: 180, borderWidth: 1, borderColor: colors.border },
  name: { color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.4 },
  meta: { color: colors.textMuted, fontSize: 13, fontWeight: '600', marginTop: 4 },
  bio: { color: '#D6D6E2', fontSize: 14, lineHeight: 21, marginTop: 16 },
  more: { color: colors.accent, fontWeight: '800', fontSize: 13, marginTop: 4 },
  h: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 22, marginBottom: 4 },
  badge: { position: 'absolute', top: 6, left: 6 },
  tv: { position: 'absolute', bottom: 6, left: 6, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5, backgroundColor: 'rgba(77,163,255,0.92)' },
  tvText: { color: '#fff', fontSize: 8.5, fontWeight: '900', letterSpacing: 0.4 },
  mark: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 6 },
  role: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
  back: { position: 'absolute', left: 14, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(10,10,18,0.7)', alignItems: 'center', justifyContent: 'center' },
});
