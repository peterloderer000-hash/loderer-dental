import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

export default function PatientLayout() {
  const { t } = useTranslation();

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
        title: t('tab.home'),
        tabBarIcon: ({ color, focused }) => (
          <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
        ),
      }} />
      <Tabs.Screen name="profile" options={{
        title: t('tab.profile'),
        tabBarIcon: ({ color, focused }) => (
          <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
        ),
      }} />
      <Tabs.Screen name="score" options={{
        title: t('tab.score'),
        tabBarIcon: ({ color, focused }) => (
          <Ionicons name={focused ? 'star' : 'star-outline'} size={22} color={color} />
        ),
      }} />
      <Tabs.Screen name="chat" options={{
        title: t('tab.chat'),
        tabBarIcon: ({ color, focused }) => (
          <Ionicons name={focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'} size={22} color={color} />
        ),
      }} />
      <Tabs.Screen name="shop" options={{
        title: t('tab.shop'),
        tabBarIcon: ({ color, focused }) => (
          <Ionicons name={focused ? 'bag' : 'bag-outline'} size={22} color={color} />
        ),
      }} />
      {/* Skryté obrazovky */}
      <Tabs.Screen name="health-passport"  options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="book-appointment" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="appointments"     options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="calculator"       options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="notifications"    options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="booking-success"  options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="messages"         options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="payment-history"  options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="family"           options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="consents"         options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="treatment-plan"   options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="prescriptions"    options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="moj-zubar"        options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="components/UpcomingAppointmentCard" options={{ href: null }} />
      <Tabs.Screen name="components/QuickActionsGrid"        options={{ href: null }} />
    </Tabs>
  );
}
