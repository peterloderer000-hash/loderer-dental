import React, { useCallback } from 'react';
import { Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { RADII, SHADOWS, TYPO, SPACING } from '../../styles/theme';

type Variant = 'small' | 'medium' | 'large' | 'featured';

interface Props {
  title: string;
  value?: string | number;
  subtitle?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  iconColor?: string;
  colors: [string, string, ...string[]];
  textColor?: string;
  onPress?: () => void;
  variant?: Variant;
  style?: ViewStyle;
  badge?: number;
}

const HEIGHT: Record<Variant, number> = { small: 100, medium: 130, large: 160, featured: 200 };

export default function BentoCard({
  title, value, subtitle, icon, iconColor = '#fff', colors, textColor = '#fff',
  onPress, variant = 'medium', style, badge,
}: Props) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    if (!onPress) return;
    scale.value = withSpring(0.97, { damping: 15, stiffness: 400 });
  }, [onPress]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 300 });
  }, []);

  const handlePress = useCallback(() => {
    if (!onPress) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }, [onPress]);

  const height = HEIGHT[variant];

  return (
    <Animated.View style={[animStyle, style]}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={!onPress}
        style={[styles.container, SHADOWS.md, { minHeight: height }]}
      >
        <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
          {icon && (
            <Ionicons name={icon} size={variant === 'featured' ? 28 : 22} color={iconColor} style={styles.icon} />
          )}
          {badge !== undefined && badge > 0 && (
            <Animated.View style={styles.badge}>
              <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
            </Animated.View>
          )}
          <Text style={[styles.title, { color: textColor, opacity: 0.75 }]} numberOfLines={1}>{title}</Text>
          {value !== undefined && (
            <Text style={[styles.value, { color: textColor }]} numberOfLines={1}>{value}</Text>
          )}
          {subtitle && (
            <Text style={[styles.subtitle, { color: textColor, opacity: 0.6 }]} numberOfLines={2}>{subtitle}</Text>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: RADII.xl,
    overflow: 'hidden',
    flex: 1,
  },
  gradient: {
    flex: 1,
    padding: SPACING.lg,
    justifyContent: 'flex-end',
  },
  icon: {
    marginBottom: SPACING.sm,
    alignSelf: 'flex-start',
  },
  title: {
    ...TYPO.overline,
    marginBottom: 4,
  },
  value: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.5,
  },
  subtitle: {
    ...TYPO.caption,
    marginTop: 2,
  },
  badge: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
    backgroundColor: '#E74C3C',
    borderRadius: RADII.full,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: 'DMSans_500Medium',
  },
});
