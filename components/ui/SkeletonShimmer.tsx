import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle, DimensionValue } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, interpolate } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { RADII } from '../../styles/theme';

type Variant = 'text' | 'card' | 'avatar' | 'list';

interface Props {
  variant?: Variant;
  width?: number | string;
  height?: number;
  style?: ViewStyle;
  lines?: number;
}

function ShimmerStrip({ width, height = 16, style }: { width?: number | string; height?: number; style?: ViewStyle }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.linear }),
      -1,
      false,
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [-300, 300]) }],
  }));

  return (
    <View style={[{ width: width as DimensionValue, height, borderRadius: RADII.sm, backgroundColor: '#D0D4DC', overflow: 'hidden' }, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, animStyle]}>
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.6)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

export default function SkeletonShimmer({ variant = 'card', width, height, style, lines = 3 }: Props) {
  if (variant === 'text') {
    return (
      <View style={[styles.textContainer, style]}>
        {Array.from({ length: lines }).map((_, i) => (
          <ShimmerStrip key={i} width={i === lines - 1 ? '60%' : '100%'} height={14} style={{ marginBottom: 8 }} />
        ))}
      </View>
    );
  }

  if (variant === 'avatar') {
    const size = height ?? 48;
    return <ShimmerStrip width={size} height={size} style={{ borderRadius: size / 2, ...style }} />;
  }

  if (variant === 'list') {
    return (
      <View style={[styles.listContainer, style]}>
        {Array.from({ length: lines }).map((_, i) => (
          <View key={i} style={styles.listItem}>
            <ShimmerStrip width={40} height={40} style={{ borderRadius: RADII.md }} />
            <View style={{ flex: 1, gap: 8 }}>
              <ShimmerStrip width="80%" height={13} />
              <ShimmerStrip width="50%" height={11} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={[styles.card, style]}>
      <ShimmerStrip width="40%" height={12} style={{ marginBottom: 12 }} />
      <ShimmerStrip width="80%" height={28} style={{ marginBottom: 8 }} />
      <ShimmerStrip width="60%" height={12} />
    </View>
  );
}

const styles = StyleSheet.create({
  textContainer: { gap: 0 },
  listContainer: { gap: 12 },
  listItem: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: '#F5F6F8',
    borderRadius: RADII.lg,
    padding: 14,
  },
  card: {
    backgroundColor: '#F5F6F8',
    borderRadius: RADII.xl,
    padding: 20,
    ...require('../../styles/theme').SHADOWS.sm,
  },
});
