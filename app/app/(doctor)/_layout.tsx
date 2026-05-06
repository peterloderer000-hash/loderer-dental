import { useState, useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../supabase';

export default function DoctorLayout() {
  const [role, setRole] = useState<string>('doctor');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('profiles').select('role').eq('id', user.id).single()
        .then(({ data }) => { if (data?.role) setRole(data.role); });
    });
  }, []);

  const isReception = role === 'reception';
  const isHygienist = role === 'hygienist';
  const isOwner     = role === 'owner';

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
        title: 'Termíny',
        tabBarIcon: ({ color, focused }) => (
          <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={22} color={color} />
        ),
      }} />
      <Tabs.Screen name="patients" options={{
        title: 'Pacienti',
        tabBarIcon: ({ color, focused }) => (
          <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} />
        ),
      }} />
      <Tabs.Screen name="calendar" options={{
        title: 'Kalendár',
        tabBarIcon: ({ color, focused }) => (
          <Ionicons name={focused ? 'calendar-number' : 'calendar-number-outline'} size={22} color={color} />
        ),
      }} />
      <Tabs.Screen name="stats" options={{
        title: 'Štatistiky',
        tabBarIcon: ({ color, focused }) => (
          <Ionicons name={focused ? 'bar-chart' : 'bar-chart-outline'} size={22} color={color} />
        ),
      }} />
      <Tabs.Screen name="broadcast" options={{
        title: 'Broadcast',
        href: isHygienist ? null : undefined,
        tabBarIcon: ({ color, focused }) => (
          <Ionicons name={focused ? 'megaphone' : 'megaphone-outline'} size={22} color={color} />
        ),
      }} />

      <Tabs.Screen name="checkin" options={{
        title: 'Check-in',
        href: isReception ? undefined : null,
        tabBarIcon: ({ color, focused }) => (
          <Ionicons name={focused ? 'checkmark-circle' : 'checkmark-circle-outline'} size={22} color={color} />
        ),
      }} />
      <Tabs.Screen name="waiting-room" options={{
        title: 'Čakáreň',
        href: isReception ? undefined : null,
        tabBarIcon: ({ color, focused }) => (
          <Ionicons name={focused ? 'time' : 'time-outline'} size={22} color={color} />
        ),
      }} />

      <Tabs.Screen name="payments" options={{
        title: 'Platby',
        href: isHygienist ? null : undefined,
        tabBarIcon: ({ color, focused }) => (
          <Ionicons name={focused ? 'card' : 'card-outline'} size={22} color={color} />
        ),
      }} />
      <Tabs.Screen name="staff-chat" options={{
        title: 'Správy',
        href: isHygienist ? null : undefined,
        tabBarIcon: ({ color, focused }) => (
          <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={22} color={color} />
        ),
      }} />

      <Tabs.Screen name="admin" options={{
        title: 'Admin',
        href: isOwner ? undefined : null,
        tabBarIcon: ({ color, focused }) => (
          <Ionicons name={focused ? 'settings' : 'settings-outline'} size={22} color={color} />
        ),
      }} />
      <Tabs.Screen name="profile" options={{
        title: 'Profil',
        tabBarIcon: ({ color, focused }) => (
          <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
        ),
      }} />

      {/* Hidden screens */}
      <Tabs.Screen name="dental-chart"        options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="patient-passport"    options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="add-appointment"     options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="patient-detail"      options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="opening-hours"       options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="notifications"       options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="services"            options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="messages"            options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="treatment-plan"      options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="waitlist"            options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="recall"              options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="search"              options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="patient-attachments" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="consent-forms"       options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="time-blocks"         options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="prescriptions"       options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="clinic-live"         options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="clinic-room"         options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="clinic-dashboard"    options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="clinic-ai"           options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="billing"             options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="doctor-onboarding"   options={{ href: null, headerShown: false }} />
    </Tabs>
  );
}
