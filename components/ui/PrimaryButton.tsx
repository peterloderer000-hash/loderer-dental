import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, GRADIENTS, RADII, TYPO } from '../../styles/theme';

type Variant = 'gold' | 'dark' | 'outline' | 'ghost';

interface Props {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  fullWidth?: boolean;
  style?: ViewStyle;
  small?: boolean;
}

export default function PrimaryButton({
  title, onPress, variant = 'gold', loading, disabled, icon, fullWidth, style, small,
}: Props) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function handlePressIn() {
    scale.value = withSpring(0.96, { damping: 15, stiffness: 180 });
  }
  function handlePressOut() {
    scale.value = withSpring(1, { damping: 15, stiffness: 180 });
  }
  function handlePress() {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  }

  const height = small ? 44 : 52;
  const textColor = variant === 'outline' || variant === 'ghost' ? COLORS.gold : '#fff';

  const inner = loading
    ? <ActivityIndicator color={textColor} />
    : (
      <View style={s.row}>
        {icon && <Ionicons name={icon} size={18} color={textColor} style={{ marginRight: 6 }} />}
        <Text style={[s.label, { color: textColor }]}>{title}</Text>
      </View>
    );

  if (variant === 'gold') {
    return (
      <Animated.View style={[animStyle, fullWidth && { width: '100%' }, style]}>
        <TouchableOpacity
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={disabled || loading}
          activeOpacity={1}
        >
          <LinearGradient
            colors={GRADIENTS.gold as [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[s.base, { height }, disabled && s.disabled]}
          >
            {inner}
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  const bgStyle = variant === 'dark'
    ? { backgroundColor: COLORS.esp }
    : variant === 'outline'
    ? { borderWidth: 2, borderColor: COLORS.gold, backgroundColor: 'transparent' }
    : {};

  return (
    <Animated.View style={[animStyle, fullWidth && { width: '100%' }, style]}>
      <TouchableOpacity
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        activeOpacity={1}
        style={[s.base, bgStyle, { height }, disabled && s.disabled]}
      >
        {inner}
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  base:     { borderRadius: RADII.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  disabled: { opacity: 0.45 },
  row:      { flexDirection: 'row', alignItems: 'center' },
  label:    { ...TYPO.btnText },
});
