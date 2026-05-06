import React from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { SHADOWS, RADII } from '../../styles/theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  intensity?: number;
  tint?: 'light' | 'dark' | 'default';
  padding?: number;
  borderRadius?: number;
}

export default function GlassCard({
  children, style, intensity = 40, tint = 'light', padding = 20, borderRadius = RADII.xl,
}: Props) {
  if (Platform.OS === 'android') {
    return (
      <View style={[styles.androidFallback, { padding, borderRadius }, SHADOWS.md, style]}>
        {children}
      </View>
    );
  }

  return (
    <BlurView intensity={intensity} tint={tint} style={[styles.blur, { borderRadius }, style]}>
      <View style={[styles.inner, { padding }]}>
        {children}
      </View>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  blur: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    ...SHADOWS.md,
  },
  inner: {
    flex: 1,
  },
  androidFallback: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
});
