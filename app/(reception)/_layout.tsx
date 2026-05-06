import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function ReceptionLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#C9A84C',
        tabBarInactiveTintColor: '#C4A882',
        tabBarStyle: {
          backgroundColor: '#FAF6F0',
          borderTopWidth: 0.5,
          borderTopColor: 'rgba(201,168,76,0.25)',
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
          elevation: 8,
          shadowColor: '#8B6914',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen name="index" options={{
        title: 'Dnes',
        tabBarIcon: ({ color, focused }) => (
          <Ionicons name={focused ? 'today' : 'today-outline'} size={22} color={color} />
        ),
      }} />
      <Tabs.Screen name="patients" options={{
        title: 'Pacienti',
        tabBarIcon: ({ color, focused }) => (
          <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} />
        ),
      }} />
      <Tabs.Screen name="checkin" options={{
        title: 'Čakáreň',
        tabBarIcon: ({ color, focused }) => (
          <Ionicons name={focused ? 'checkmark-circle' : 'checkmark-circle-outline'} size={22} color={color} />
        ),
      }} />
      <Tabs.Screen name="payments" options={{
        title: 'Platby',
        tabBarIcon: ({ color, focused }) => (
          <Ionicons name={focused ? 'card' : 'card-outline'} size={22} color={color} />
        ),
      }} />
      <Tabs.Screen name="profile" options={{
        title: 'Profil',
        tabBarIcon: ({ color, focused }) => (
          <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
        ),
      }} />

      {/* Hidden screens */}
      <Tabs.Screen name="clinic-live" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="clinic-room" options={{ href: null, headerShown: false }} />
    </Tabs>
  );
}
