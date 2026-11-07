import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { IMG } from '../lib/tmdb';
import { colors, gradients, radius } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Poster({
  path,
  title,
  size = 'w500',
  style,
  rounded = radius.md,
}: {
  path: string | null;
  title?: string;
  size?: Parameters<typeof IMG>[1];
  style?: StyleProp<ViewStyle>;
  rounded?: number;
}) {
  const uri = IMG(path, size);
  return (
    <View style={[{ borderRadius: rounded, overflow: 'hidden', backgroundColor: colors.card }, style]}>
      <LinearGradient colors={['#2B2140', '#141422']} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Ionicons name="film-outline" size={28} color={colors.textMuted} />
        {title ? (
          <Text numberOfLines={2} style={styles.posterFallback}>
            {title}
          </Text>
        ) : null}
      </View>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} /> : null}
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  icon,
  tone = 'brand',
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: string;
  tone?: 'brand' | 'nope';
}) {
  const activeBg = tone === 'nope' ? colors.nope : colors.accent;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && { backgroundColor: activeBg + '26', borderColor: activeBg },
        pressed && { opacity: 0.7 },
      ]}
    >
      {icon ? <Text style={{ marginRight: 6 }}>{icon}</Text> : null}
      <Text style={[styles.chipText, active && { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export function RoundButton({
  icon,
  size = 60,
  color,
  onPress,
  filled,
  disabled,
  iconSize,
}: {
  icon: IconName;
  size?: number;
  color: string;
  onPress?: () => void;
  filled?: readonly [string, string];
  disabled?: boolean;
  iconSize?: number;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          transform: [{ scale: pressed ? 0.9 : 1 }],
          opacity: disabled ? 0.35 : 1,
        },
        styles.round,
        !filled && { borderColor: color + '55' },
      ]}
    >
      {filled ? <LinearGradient colors={filled} style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} /> : null}
      <Ionicons name={icon} size={iconSize ?? size * 0.45} color={filled ? '#fff' : color} />
    </Pressable>
  );
}

export function GradientButton({
  title,
  onPress,
  icon,
  colorsPair = gradients.brand,
  style,
  small,
}: {
  title: string;
  onPress?: () => void;
  icon?: IconName;
  colorsPair?: readonly [string, string];
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ borderRadius: radius.pill, overflow: 'hidden', opacity: pressed ? 0.85 : 1 }, style]}>
      <LinearGradient colors={colorsPair} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.gbtn, small && { paddingVertical: 10, paddingHorizontal: 16 }]}>
        {icon ? <Ionicons name={icon} size={small ? 16 : 18} color="#fff" style={{ marginRight: 8 }} /> : null}
        <Text style={[styles.gbtnText, small && { fontSize: 14 }]}>{title}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export function GhostButton({ title, onPress, icon, style }: { title: string; onPress?: () => void; icon?: IconName; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.ghost, pressed && { opacity: 0.7 }, style]}>
      {icon ? <Ionicons name={icon} size={18} color={colors.text} style={{ marginRight: 8 }} /> : null}
      <Text style={styles.gbtnText}>{title}</Text>
    </Pressable>
  );
}

export function RatingBadge({ value, style }: { value: number; style?: StyleProp<ViewStyle> }) {
  const c = value >= 7.5 ? colors.like : value >= 6 ? colors.gold : colors.nope;
  return (
    <View style={[styles.badge, style]}>
      <Ionicons name="star" size={12} color={c} />
      <Text style={[styles.badgeText, { color: c }]}>{value ? value.toFixed(1) : '—'}</Text>
    </View>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.section}>{children}</Text>
      {right}
    </View>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.seg}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segItem]}>
            {active ? <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]} /> : null}
            <Text style={[styles.segText, active && { color: '#fff' }]}>
              {o.label}
              {o.count !== undefined ? `  ${o.count}` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: 8 },
  posterFallback: { color: colors.textMuted, fontSize: 12, marginTop: 6, textAlign: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    marginRight: 8,
    marginBottom: 8,
  },
  chipText: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
  round: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
    borderWidth: 1.5,
    borderColor: 'transparent',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  gbtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15, paddingHorizontal: 22 },
  gbtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  ghost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(10,10,18,0.75)',
  },
  badgeText: { fontSize: 12, fontWeight: '800' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 12 },
  section: { color: colors.text, fontSize: 18, fontWeight: '800', letterSpacing: 0.2 },
  seg: { flexDirection: 'row', backgroundColor: colors.bgElevated, borderRadius: radius.pill, padding: 4, borderWidth: 1, borderColor: colors.border },
  segItem: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radius.pill },
  segText: { color: colors.textDim, fontWeight: '700', fontSize: 14 },
});
