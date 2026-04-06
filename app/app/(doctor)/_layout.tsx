import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../styles/theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon(name: IoniconsName, focused: boolean) {
  return (
    <Ionicons
      name={focused ? name : (`${name}-outline` as IoniconsName)}
      size={22}
      color={focused ? COLORS.wal : '#bbb'}
    />
  );
}

export default function DoctorLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: COLORS.wal,
      tabBarInactiveTintColor: '#bbb',
      tabBarStyle: {
        backgroundColor: '#fff',
        borderTopColor: COLORS.bg3,
        borderTopWidth: 1,
        paddingBottom: 8,
        paddingTop: 6,
        height: 62,
      },
      tabBarLabelStyle: {
        fontSize: 9,
        fontWeight: '500',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
      },
    }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Termíny', tabBarIcon: ({ focused }) => TabIcon('list', focused) }}
      />
      <Tabs.Screen
        name="calendar"
        options={{ title: 'Kalendár', tabBarIcon: ({ focused }) => TabIcon('calendar', focused) }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profil', tabBarIcon: ({ focused }) => TabIcon('person', focused) }}
      />
      {/* Skryté obrazovky — nie sú taby */}
      <Tabs.Screen name="dental-chart"      options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="patient-passport"  options={{ href: null, headerShown: false }} />
    </Tabs>
  );
}
