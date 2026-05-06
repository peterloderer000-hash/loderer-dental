import React from 'react';
import { StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { COLORS, RADII, SHADOWS } from '../../styles/theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  shadow?: 'sm' | 'md' | 'lg' | 'card';
  noPad?: boolean;
}

export default function AppCard({ children, style, onPress, shadow = 'card', noPad }: Props) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function handlePressIn() {
    scale.value = withSpring(0.98, { damping: 15, stiffness: 180 });
  }
  function handlePressOut() {
    scale.value = withSpring(1, { damping: 15, stiffness: 180 });
  }
  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.();
  }

  const shadowStyle = SHADOWS[shadow];
  const cardStyle = [s.card, shadowStyle, !noPad && s.pad, style];

  if (onPress) {
    return (
      <Animated.View style={[animStyle]}>
        <TouchableOpacity
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          activeOpacity={1}
          style={cardStyle}
        >
          {children}
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return <View style={cardStyle}>{children}</View>;
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#FFFDF9',
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: COLORS.bg3,
  },
  pad: { padding: 16 },
});
