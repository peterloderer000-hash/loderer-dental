import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, withTiming, Easing } from 'react-native-reanimated';
import { TYPO } from '../../styles/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Size = 'sm' | 'md' | 'lg';

interface Props {
  value: number;
  max?: number;
  size?: Size;
  color?: string;
  trackColor?: string;
  label?: string;
  sublabel?: string;
  style?: ViewStyle;
}

const SIZES: Record<Size, { dim: number; stroke: number; fontSize: number }> = {
  sm: { dim: 60,  stroke: 5,  fontSize: 16 },
  md: { dim: 90,  stroke: 7,  fontSize: 22 },
  lg: { dim: 120, stroke: 9,  fontSize: 28 },
};

export default function ProgressRing({
  value, max = 100, size = 'md', color = '#C9A84C', trackColor = 'rgba(201,168,76,0.15)',
  label, sublabel, style,
}: Props) {
  const { dim, stroke, fontSize } = SIZES[size];
  const r = (dim - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(Math.max(value / max, 0), 1);

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(pct, { duration: 1200, easing: Easing.out(Easing.cubic) });
  }, [pct]);

  const animProps = useAnimatedProps(() => ({
    strokeDashoffset: circ * (1 - progress.value),
  }));

  const displayValue = Math.round(value);
  const cx = dim / 2;
  const cy = dim / 2;

  return (
    <View style={[styles.container, { width: dim, height: dim }, style]}>
      <Svg width={dim} height={dim} style={styles.svg}>
        <Defs>
          <LinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#D4B85E" />
            <Stop offset="1" stopColor="#B8973A" />
          </LinearGradient>
        </Defs>
        {/* Track */}
        <Circle
          cx={cx} cy={cy} r={r}
          stroke={trackColor}
          strokeWidth={stroke}
          fill="none"
        />
        {/* Progress */}
        <AnimatedCircle
          cx={cx} cy={cy} r={r}
          stroke="url(#ringGrad)"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circ}
          animatedProps={animProps}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </Svg>
      <View style={styles.center}>
        <Text style={[styles.value, { fontSize }]}>{displayValue}</Text>
        {label && <Text style={styles.label}>{label}</Text>}
        {sublabel && <Text style={styles.sublabel}>{sublabel}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  svg: {
    position: 'absolute',
  },
  center: {
    alignItems: 'center',
  },
  value: {
    fontFamily: 'PlayfairDisplay_700Bold',
    color: '#2C1F14',
    lineHeight: 34,
  },
  label: {
    ...TYPO.caption,
    color: '#6B4F35',
    marginTop: 1,
  },
  sublabel: {
    ...TYPO.overline,
    color: '#C4A882',
    fontSize: 8,
    marginTop: 1,
  },
});
