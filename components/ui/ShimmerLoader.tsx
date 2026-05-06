import React, { useEffect } from 'react';
import { StyleSheet, View, ViewStyle, useWindowDimensions } from 'react-native';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

type Props = {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
};

export function ShimmerLoader({ width, height = 20, borderRadius = 8, style }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const resolvedWidth = typeof width === 'number' ? width : screenWidth * 0.8;
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Reanimated.View
      style={[
        styles.bar,
        { width: resolvedWidth, height, borderRadius },
        animatedStyle,
        style,
      ]}
    />
  );
}

export function ShimmerCard({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.card, style]}>
      <ShimmerLoader width="70%" height={18} borderRadius={6} style={styles.row} />
      <ShimmerLoader width="45%" height={14} borderRadius={6} style={styles.row} />
      <ShimmerLoader width="90%" height={14} borderRadius={6} style={styles.row} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: '#E8DFD0',
  },
  card: {
    backgroundColor: '#FAF7F2',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  row: {
    marginBottom: 10,
  },
});
