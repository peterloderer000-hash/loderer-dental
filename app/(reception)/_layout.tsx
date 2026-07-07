import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../context/ThemeContext';
import { COLORS } from '../../styles/theme';

export default function ReceptionLayout() {
  const { dark, colors } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.gold,
        tabBarInactiveTintColor: dark ? COLORS.sand : '#B8A090',
        tabBarStyle: {
          backgroundColor: dark ? colors.cardBg : '#F5F6F8',
          borderTopWidth: 0.5,
          borderTopColor: dark ? colors.bg3 : 'rgba(201,168,76,0.25)',
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
          elevation: 4,
          shadowColor: '#1A2030',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dnes',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'today' : 'today-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="patients"
        options={{
          title: 'Pacienti',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="checkin"
        options={{
          title: 'Čakáreň',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'checkmark-circle' : 'checkmark-circle-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          title: 'Platby',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'card' : 'card-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="clinic-live" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="clinic-room" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="reports" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="shop-orders" options={{ href: null, headerShown: false }} />
    </Tabs>
  );
}
