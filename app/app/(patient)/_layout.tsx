import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../styles/theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon(name: IoniconsName, focused: boolean) {
  return <Ionicons name={focused ? name : (`${name}-outline` as IoniconsName)} size={22} color={focused ? COLORS.wal : '#bbb'} />;
}

export default function PatientLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: COLORS.wal,
      tabBarInactiveTintColor: '#bbb',
      tabBarStyle: { backgroundColor: '#fff', borderTopColor: COLORS.bg3, borderTopWidth: 1, paddingBottom: 8, paddingTop: 6, height: 62 },
      tabBarLabelStyle: { fontSize: 9, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.8 },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Domov', tabBarIcon: ({ focused }) => TabIcon('home', focused) }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarIcon: ({ focused }) => TabIcon('person', focused) }} />
      <Tabs.Screen name="score" options={{ title: 'Skóre', tabBarIcon: ({ focused }) => TabIcon('bar-chart', focused) }} />
      <Tabs.Screen name="chat" options={{ title: 'AI Chat', tabBarIcon: ({ focused }) => TabIcon('chatbubble', focused) }} />
      <Tabs.Screen name="shop" options={{ title: 'Shop', tabBarIcon: ({ focused }) => TabIcon('bag', focused) }} />
      {/* Skryté obrazovky — nie sú taby */}
      <Tabs.Screen name="health-passport" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="book-appointment" options={{ href: null, headerShown: false }} />
    </Tabs>
  );
}
