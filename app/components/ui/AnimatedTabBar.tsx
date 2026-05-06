import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, RADII } from '../../styles/theme';
import { useAppTheme } from '../../context/ThemeContext';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function TabButton({ route, isFocused, onPress, icon, label, dark }: {
  route: any;
  isFocused: boolean;
  onPress: () => void;
  icon: IoniconsName;
  label: string;
  dark: boolean;
}) {
  const scale = useSharedValue(1);
  const dotOpacity = useSharedValue(isFocused ? 1 : 0);
  const dotScale = useSharedValue(isFocused ? 1 : 0);

  React.useEffect(() => {
    scale.value = withSpring(isFocused ? 1.12 : 1, { damping: 12, stiffness: 400 });
    dotOpacity.value = withSpring(isFocused ? 1 : 0, { damping: 15, stiffness: 350 });
    dotScale.value = withSpring(isFocused ? 1 : 0, { damping: 15, stiffness: 350 });
  }, [isFocused]);

  const iconAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const dotAnimStyle = useAnimatedStyle(() => ({
    opacity: dotOpacity.value,
    transform: [{ scale: dotScale.value }],
  }));

  const activeColor = dark ? COLORS.sand : COLORS.gold;
  const inactiveColor = dark ? 'rgba(196,168,130,0.35)' : 'rgba(44,31,20,0.25)';
  const iconName: IoniconsName = isFocused ? icon : (`${icon}-outline` as IoniconsName);

  const handlePress = useCallback(() => {
    Haptics.selectionAsync();
    onPress();
  }, [onPress]);

  return (
    <TouchableOpacity
      key={route.key}
      onPress={handlePress}
      activeOpacity={0.85}
      style={styles.tabBtn}
    >
      <Animated.View style={iconAnimStyle}>
        <Ionicons name={iconName} size={22} color={isFocused ? activeColor : inactiveColor} />
      </Animated.View>
      <Text style={[styles.tabLabel, { color: isFocused ? activeColor : inactiveColor }]} numberOfLines={1}>
        {label}
      </Text>
      <Animated.View style={[styles.activeDot, { backgroundColor: activeColor }, dotAnimStyle]} />
    </TouchableOpacity>
  );
}

const ICON_MAP: Record<string, IoniconsName> = {
  index:        'list',
  patients:     'people',
  'staff-chat': 'chatbubbles',
  profile:      'person',
  admin:        'settings',
  checkin:      'walk',
  'waiting-room': 'time',
  payments:     'card',
  appointments: 'calendar',
  score:        'heart',
  family:       'people-circle',
  messages:     'chatbubble',
  'moj-zubar':       'medical',
  'health-passport': 'document-text',
  consents:          'shield-checkmark',
  prescriptions:     'medkit',
  'treatment-plan':  'clipboard',
  'payment-history': 'receipt',
};

export default function AnimatedTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { dark } = useAppTheme();

  const bgColor = dark ? 'rgba(28,22,16,0.96)' : 'rgba(255,255,255,0.96)';
  const borderColor = dark ? 'rgba(201,168,76,0.15)' : 'rgba(201,168,76,0.18)';

  const tabBarContent = (
    <View
      style={[
        styles.inner,
        { paddingBottom: Math.max(insets.bottom, 8), borderTopColor: borderColor },
      ]}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = (options.tabBarLabel as string) ?? options.title ?? route.name;
        const isFocused = state.index === index;
        const icon: IoniconsName = ICON_MAP[route.name] ?? 'ellipse';

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        return (
          <TabButton
            key={route.key}
            route={route}
            isFocused={isFocused}
            onPress={onPress}
            icon={icon}
            label={label}
            dark={dark}
          />
        );
      })}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      {tabBarContent}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  inner: {
    flexDirection: 'row',
    paddingTop: 10,
    paddingHorizontal: 4,
    borderTopWidth: 1,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 4,
    position: 'relative',
  },
  tabLabel: {
    fontSize: 9,
    fontFamily: 'DMSans_500Medium',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: RADII.full,
    marginTop: 1,
  },
});
