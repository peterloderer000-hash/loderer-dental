import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../context/ThemeContext';
import { COLORS } from '../../styles/theme';

export default function PatientLayout() {
  const { dark, colors } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.gold,
        tabBarInactiveTintColor: dark ? COLORS.sand : '#B8A090',
        tabBarStyle: {
          backgroundColor: dark ? colors.cardBg : '#FAF6F0',
          borderTopWidth: 0.5,
          borderTopColor: dark ? colors.bg3 : 'rgba(201,168,76,0.25)',
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
          fontWeight: '600',
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen name="index" options={{
        title: 'Domov',
        tabBarIcon: ({ color, focused }) => (
          <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
        ),
      }} />
      <Tabs.Screen name="appointments" options={{
        title: 'Termíny',
        tabBarIcon: ({ color, focused }) => (
          <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={22} color={color} />
        ),
      }} />
      <Tabs.Screen name="score" options={{
        title: 'Skóre',
        tabBarIcon: ({ color, focused }) => (
          <Ionicons name={focused ? 'star' : 'star-outline'} size={22} color={color} />
        ),
      }} />
      <Tabs.Screen name="chat" options={{
        title: 'AI Chat',
        tabBarIcon: ({ color, focused }) => (
          <Ionicons name={focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'} size={22} color={color} />
        ),
      }} />
      <Tabs.Screen name="profile" options={{
        title: 'Profil',
        tabBarIcon: ({ color, focused }) => (
          <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
        ),
      }} />

      {/* Skryté obrazovky */}
      <Tabs.Screen name="health-passport"  options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="book-appointment" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="calculator"       options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="notifications"    options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="booking-success"  options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="messages"         options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="payment-history"  options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="family"           options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="consents"         options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="treatment-plan"   options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="prescriptions"    options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="moj-zubar"          options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="pre-questionnaire" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="dental-twin"       options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="shop"             options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="forms"            options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="reviews"          options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="my-photos"        options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="loyalty"          options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="qr-checkin"      options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="components/UpcomingAppointmentCard" options={{ href: null }} />
      <Tabs.Screen name="components/QuickActionsGrid"        options={{ href: null }} />
    </Tabs>
  );
}
