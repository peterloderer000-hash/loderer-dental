import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const SHIMMER_W = 200;

export function Skeleton({ width = '100%', height = 16, borderRadius = 4 }: SkeletonProps) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(anim, { toValue: 1, duration: 1500, useNativeDriver: true })
    ).start();
  }, [anim]);

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-SHIMMER_W, SCREEN_WIDTH + SHIMMER_W],
  });
  const opacity = anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 0.8, 0.3],
  });

  return (
    <View style={[s.base, { width, height, borderRadius } as any]}>
      <Animated.View style={[s.shimmer, { width: SHIMMER_W, opacity, transform: [{ translateX }] }]} />
    </View>
  );
}

export function SkeletonCard() {
  return <View style={{ marginBottom: 10 }}><Skeleton height={80} borderRadius={12} /></View>;
}

export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ marginBottom: 10, gap: 8 }}>
          <Skeleton height={80} borderRadius={12} />
        </View>
      ))}
    </>
  );
}

const s = StyleSheet.create({
  base:    { backgroundColor: '#EDE4D8', overflow: 'hidden' },
  shimmer: { position: 'absolute', top: 0, bottom: 0, backgroundColor: '#C4A882' },
});
