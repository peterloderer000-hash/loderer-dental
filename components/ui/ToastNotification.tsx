import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, StyleSheet, ViewStyle, TouchableOpacity } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RADII, SHADOWS, TYPO } from '../../styles/theme';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastConfig {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

const TYPE_CONFIG: Record<ToastType, { bg: string; icon: React.ComponentProps<typeof Ionicons>['name']; accent: string }> = {
  success: { bg: '#1C4A36', icon: 'checkmark-circle',  accent: '#52C896' },
  error:   { bg: '#4A1C1C', icon: 'close-circle',       accent: '#E88379' },
  info:    { bg: '#1C2C4A', icon: 'information-circle', accent: '#4A90E2' },
  warning: { bg: '#4A3A1C', icon: 'warning',            accent: '#F4C95D' },
};

interface ToastItemProps {
  config: ToastConfig;
  onDismiss: (id: string) => void;
}

function ToastItem({ config, onDismiss }: ToastItemProps) {
  const insets = useSafeAreaInsets();
  const ty = useSharedValue(-120);
  const opacity = useSharedValue(0);
  const cfg = TYPE_CONFIG[config.type];

  const dismiss = useCallback(() => {
    ty.value = withSpring(-120, { damping: 20, stiffness: 300 });
    opacity.value = withTiming(0, { duration: 250 }, () => {
      runOnJS(onDismiss)(config.id);
    });
  }, [config.id, onDismiss]);

  useEffect(() => {
    ty.value = withSpring(0, { damping: 18, stiffness: 350 });
    opacity.value = withTiming(1, { duration: 200 });

    const t = setTimeout(dismiss, config.duration ?? 4000);
    return () => clearTimeout(t);
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.toast, animStyle, { marginTop: insets.top + 8 }, SHADOWS.lg]}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={dismiss}
        style={[styles.inner, { backgroundColor: cfg.bg }]}
      >
        <Ionicons name={cfg.icon} size={20} color={cfg.accent} style={styles.icon} />
        <Text style={styles.message} numberOfLines={2}>{config.message}</Text>
        <Ionicons name="close" size={14} color="rgba(255,255,255,0.4)" />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Global toast manager ─────────────────────────────────────────────────────

type Listener = (toast: ToastConfig) => void;
let listener: Listener | null = null;
let idCounter = 0;

export const toast = {
  success: (message: string, duration?: number) =>
    listener?.({ id: String(++idCounter), message, type: 'success', duration }),
  error: (message: string, duration?: number) =>
    listener?.({ id: String(++idCounter), message, type: 'error', duration }),
  info: (message: string, duration?: number) =>
    listener?.({ id: String(++idCounter), message, type: 'info', duration }),
  warning: (message: string, duration?: number) =>
    listener?.({ id: String(++idCounter), message, type: 'warning', duration }),
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastConfig[]>([]);

  useEffect(() => {
    listener = (t) => setToasts(prev => [...prev.slice(-2), t]);
    return () => { listener = null; };
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <>
      {children}
      <Animated.View style={styles.container} pointerEvents="box-none">
        {toasts.map(t => (
          <ToastItem key={t.id} config={t} onDismiss={dismiss} />
        ))}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    alignItems: 'center',
    pointerEvents: 'box-none',
  } as ViewStyle,
  toast: {
    width: '92%',
    borderRadius: RADII.lg,
    overflow: 'hidden',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  icon: {
    flexShrink: 0,
  },
  message: {
    flex: 1,
    ...TYPO.bodyMedium,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
  },
});
