import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { openTitle } from '../lib/nav';
import { plural } from '../lib/series';
import { IMG, year } from '../lib/tmdb';
import { Movie, Provider, WatchProviders } from '../lib/types';
import { colors, radius } from '../theme';
import { Poster } from './ui';

/** Спільні блоки сторінок фільму і серіалу. */

export function Heading({ children }: { children: React.ReactNode }) {
  return <Text style={styles.h}>{children}</Text>;
}

export function Providers({ providers }: { providers: WatchProviders | null | undefined }) {
  if (!providers) return null;
  return (
    <>
      <Heading>Де подивитись в Україні</Heading>
      <ProviderRow label="Підписка" list={providers.stream} />
      <ProviderRow label="Оренда" list={providers.rent} />
      <ProviderRow label="Купівля" list={providers.buy} />
      {providers.link ? (
        <Pressable onPress={() => Linking.openURL(providers.link!)} style={styles.moreLink}>
          <Text style={styles.link}>Усі варіанти перегляду</Text>
          <Ionicons name="open-outline" size={14} color={colors.accent} />
        </Pressable>
      ) : null}
    </>
  );
}

function ProviderRow({ label, list }: { label: string; list: Provider[] }) {
  if (!list.length) return null;
  return (
    <View style={styles.provRow}>
      <Text style={styles.provLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {list.map((p) => (
          <View key={p.id} style={styles.prov}>
            {p.logoPath ? <Image source={{ uri: IMG(p.logoPath, 'w92') ?? undefined }} style={styles.provLogo} /> : null}
            <Text style={styles.provName} numberOfLines={1}>
              {p.name}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export function Score({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <View style={styles.score}>
      <Text style={[styles.scoreLabel, { color }]}>{label}</Text>
      <Text style={styles.scoreValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.scoreSub} numberOfLines={1}>
        {sub}
      </Text>
    </View>
  );
}

export function Info({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  return (
    <Pressable style={styles.info} disabled={!onPress} onPress={onPress}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, !!onPress && { color: colors.accent }]} numberOfLines={2}>
        {value}
      </Text>
    </Pressable>
  );
}

export function InfoGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.infoGrid}>{children}</View>;
}

export function CastRow({ cast }: { cast: { id: number; name: string; character: string; profilePath: string | null; episodes?: number }[] }) {
  if (!cast.length) return null;
  return (
    <>
      <Heading>У ролях</Heading>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
        {cast.map((c) => (
          <Pressable key={c.id} style={{ width: 82 }} onPress={() => router.push(`/person/${c.id}`)}>
            <Poster path={c.profilePath} size="w185" rounded={41} style={{ width: 82, height: 82 }} />
            <Text style={styles.castName} numberOfLines={2}>
              {c.name}
            </Text>
            <Text style={styles.castRole} numberOfLines={1}>
              {c.character}
            </Text>
            {c.episodes ? <Text style={styles.castEps}>{plural(c.episodes, 'серія', 'серії', 'серій')}</Text> : null}
          </Pressable>
        ))}
      </ScrollView>
    </>
  );
}

export function SimilarRow({ title, items, mark }: { title: string; items: Movie[]; mark: (id: number) => 'heart' | 'eye' | 'tv' | null }) {
  if (!items.length) return null;
  return (
    <>
      <Heading>{title}</Heading>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {items.map((s) => {
          const icon = mark(s.id);
          return (
            <Pressable key={s.id} style={{ width: 112 }} onPress={() => openTitle(s.id)}>
              <Poster path={s.posterPath} title={s.title} size="w342" style={{ width: 112, height: 168 }} />
              {icon ? (
                <View style={styles.simMark}>
                  <Ionicons name={icon} size={12} color="#fff" />
                </View>
              ) : null}
              <Text style={styles.castName} numberOfLines={2}>
                {s.title}
              </Text>
              <Text style={styles.castRole}>
                {year(s)} · ★ {s.rating ? s.rating.toFixed(1) : '—'}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  h: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 24, marginBottom: 12 },
  provRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  provLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '800', width: 70 },
  prov: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 12, paddingLeft: 4, height: 40, borderRadius: radius.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, maxWidth: 180 },
  provLogo: { width: 30, height: 30, borderRadius: 8 },
  provName: { color: colors.text, fontSize: 13, fontWeight: '700' },
  moreLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  link: { color: colors.accent, fontWeight: '800', fontSize: 14 },
  score: { flex: 1, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.border },
  scoreLabel: { fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  scoreValue: { color: colors.text, fontSize: 18, fontWeight: '900', marginTop: 4 },
  scoreSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 },
  info: { width: '48%', flexGrow: 1, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.border },
  infoLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  infoValue: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 4 },
  castName: { color: colors.text, fontSize: 12, fontWeight: '700', marginTop: 6, textAlign: 'center' },
  castRole: { color: colors.textMuted, fontSize: 11, textAlign: 'center' },
  castEps: { color: colors.textMuted, fontSize: 10, textAlign: 'center', marginTop: 1 },
  simMark: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
});
