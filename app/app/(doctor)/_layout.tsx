import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { COLORS } from '../../styles/theme';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

function TabIcon(name: IoniconsName, focused: boolean) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Ionicons
        name={focused ? name : (`${name}-outline` as IoniconsName)}
        size={20}
        color={focused ? '#fff' : '#aaa'}
      />
    </View>
  );
}

export default function DoctorLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: COLORS.wal,
      tabBarInactiveTintColor: '#aaa',
      tabBarStyle: styles.tabBar,
      tabBarLabelStyle: styles.tabLabel,
    }}>
      <Tabs.Screen name="index"    options={{ title: 'Termíny',  tabBarIcon: ({ focused }) => TabIcon('list',     focused) }} />
      <Tabs.Screen name="patients" options={{ title: 'Pacienti', tabBarIcon: ({ focused }) => TabIcon('people',   focused) }} />
      <Tabs.Screen name="calendar" options={{ title: 'Kalendár', tabBarIcon: ({ focused }) => TabIcon('calendar', focused) }} />
      <Tabs.Screen name="profile"  options={{ title: 'Profil',   tabBarIcon: ({ focused }) => TabIcon('person',   focused) }} />
      {/* Skryté obrazovky — nie sú taby */}
      <Tabs.Screen name="dental-chart"      options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="patient-passport"  options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="add-appointment"   options={{ href: null, headerShown: false }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#fff',
    borderTopWidth: 0,
    height: 68,
    paddingBottom: 10,
    paddingTop: 8,
    paddingHorizontal: 4,
    // Shadow iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    // Shadow Android
    elevation: 12,
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  iconWrap: {
    width: 40,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: COLORS.wal,
  },
});
