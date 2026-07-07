import React, { useCallback } from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { GRADIENTS, SHADOWS, RADII, TYPO, COLORS } from '../../styles/theme';

type Variant = 'gold' | 'hero' | 'ghost' | 'success' | 'danger';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  iconRight?: React.ComponentProps<typeof Ionicons>['name'];
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
}

const VARIANT_GRADIENTS: Record<Variant, string[]> = {
  gold:    GRADIENTS.gold,
  hero:    GRADIENTS.hero,
  ghost:   ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.06)'],
  success: GRADIENTS.success,
  danger:  GRADIENTS.danger,
};

const VARIANT_TEXT: Record<Variant, string> = {
  gold:    '#0A0F1A',
  hero:    '#F5F6F8',
  ghost:   COLORS.cream,
  success: '#F5F6F8',
  danger:  '#F5F6F8',
};

const AnimTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export default function GradientButton({
  label, onPress, variant = 'gold', icon, iconRight, loading, disabled, style, textStyle, fullWidth,
}: Props) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.96, { damping: 15, stiffness: 400 });
  }, []);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 300 });
  }, []);

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  }, [onPress]);

  const textColor = VARIANT_TEXT[variant];
  const shadowStyle = variant === 'gold' ? SHADOWS.gold : SHADOWS.md;

  return (
    <Animated.View style={[animStyle, fullWidth && { width: '100%' }, style]}>
      <TouchableOpacity
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        activeOpacity={1}
        style={[styles.base, shadowStyle, disabled && { opacity: 0.45 }]}
      >
        <LinearGradient
          colors={VARIANT_GRADIENTS[variant] as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          {loading ? (
            <ActivityIndicator color={textColor} size="small" />
          ) : (
            <>
              {icon && <Ionicons name={icon} size={18} color={textColor} style={{ marginRight: 6 }} />}
              <Text style={[styles.label, { color: textColor }, textStyle]}>{label}</Text>
              {iconRight && <Ionicons name={iconRight} size={18} color={textColor} style={{ marginLeft: 6 }} />}
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: RADII.lg,
    overflow: 'hidden',
  },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  label: {
    ...TYPO.bodyMedium,
    fontSize: 15,
    fontFamily: 'DMSans_500Medium',
    letterSpacing: 0.3,
  },
});
