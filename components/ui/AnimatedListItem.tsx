import React from 'react';
import { ViewStyle } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';

type Props = {
  children: React.ReactNode;
  index: number;
  style?: ViewStyle;
};

/**
 * Wraps a FlatList renderItem with a staggered fade-in + slide-from-right animation.
 * Usage:
 *   renderItem={({ item, index }) => (
 *     <AnimatedListItem index={index}>
 *       <YourCard ... />
 *     </AnimatedListItem>
 *   )}
 *
 * Max delay is capped at 8 items (320ms) so long lists don't feel sluggish.
 */
export function AnimatedListItem({ children, index, style }: Props) {
  const cappedIndex = Math.min(index, 8);

  return (
    <Animated.View
      entering={FadeInRight.delay(cappedIndex * 40).duration(350).springify().damping(18)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}
