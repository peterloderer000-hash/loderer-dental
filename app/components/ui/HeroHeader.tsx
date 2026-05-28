import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, GRADIENTS, SPACING, TYPO } from '../../styles/theme';

interface Props {
  /** Main heading — use `greeting` or `title` (alias) */
  greeting?: string;
  title?: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onBack?: () => void;
  rightElement?: React.ReactNode;
  rightAction?: React.ReactNode;
  bottomElement?: React.ReactNode;
  style?: ViewStyle;
}

function HeroHeader({ greeting, title, subtitle, icon, onBack, rightElement, rightAction, bottomElement, style }: Props) {
  const heading = title ?? greeting ?? '';
  const right = rightAction ?? rightElement;

  return (
    <LinearGradient
      colors={GRADIENTS.hero as [string, string, ...string[]]}
      style={[s.hero, style]}
    >
      {/* Decorative circles */}
      <View style={s.circle1} />
      <View style={s.circle2} />
      <View style={s.circle3} />

      {/* Top row */}
      <View style={s.topRow}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={s.backBtn} activeOpacity={0.8}>
            <Ionicons name="chevron-back" size={22} color={COLORS.cream} />
          </TouchableOpacity>
        ) : null}
        {icon ? (
          <View style={s.iconCircle}>
            <Ionicons name={icon} size={20} color={COLORS.gold} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={s.greeting} numberOfLines={3}>{heading}</Text>
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        </View>
        {right ? <View style={s.rightEl}>{right}</View> : null}
      </View>

      {/* Gold accent lines */}
      <View style={s.goldLineWrap}>
        <View style={s.goldLine} />
        <View style={[s.goldLine, { opacity: 0.2, marginTop: 3 }]} />
      </View>

      {bottomElement ? <View style={s.bottom}>{bottomElement}</View> : null}
    </LinearGradient>
  );
}

export default React.memo(HeroHeader);

const s = StyleSheet.create({
  hero: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xxl + SPACING.lg,
    overflow: 'hidden',
  },
  circle1: {
    position: 'absolute', top: -80, right: -50,
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: COLORS.gold, opacity: 0.06,
  },
  circle2: {
    position: 'absolute', bottom: -40, left: -60,
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: COLORS.gold, opacity: 0.04,
  },
  circle3: {
    position: 'absolute', top: 60, right: 80,
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: COLORS.sand, opacity: 0.08,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  iconCircle: {
    width: 40, height: 40, borderRadius: 14,
    backgroundColor: 'rgba(201,168,76,0.12)',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md },
  greeting: {
    ...TYPO.heroItalic,
    color: COLORS.cream,
  },
  subtitle: {
    ...TYPO.bodySm,
    color: COLORS.sand,
    marginTop: SPACING.xs,
  },
  rightEl: { alignItems: 'flex-end', marginTop: 4 },
  goldLineWrap: { marginTop: SPACING.xl, marginBottom: SPACING.md },
  goldLine: { height: 1, backgroundColor: COLORS.gold, opacity: 0.4 },
  bottom: { marginTop: SPACING.sm },
});
