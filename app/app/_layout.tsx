import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { supabase } from '../supabase';

export default function RootLayout() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // getSession() číta AsyncStorage — okamžite, bez čakania na sieť
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        setLoading(false);
        return; // zobraziť login
      }

      // Session existuje — zisti rolu
      try {
        const { data } = await Promise.race([
          supabase.from('profiles').select('role').eq('id', session.user.id).single(),
          new Promise<{ data: null }>((res) => setTimeout(() => res({ data: null }), 3000)),
        ]);

        setLoading(false);

        if (data?.role === 'doctor')       router.replace('/(doctor)');
        else if (data?.role === 'patient') router.replace('/(patient)');
        else                               router.replace('/setup-role');
      } catch {
        setLoading(false);
      }
    });

    // Počúvaj zmeny (odhlásenie / prihlásenie)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        router.replace('/');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#2C1F14', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#C4A882" size="large" />
      </View>
    );
  }

  return (
    <>
      <Stack>
        <Stack.Screen name="index"      options={{ headerShown: false }} />
        <Stack.Screen name="setup-role" options={{ headerShown: false }} />
        <Stack.Screen name="(patient)"  options={{ headerShown: false }} />
        <Stack.Screen name="(doctor)"   options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}
