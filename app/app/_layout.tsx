import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { supabase } from '../supabase';

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    // Pri štarte skontroluj aktívnu session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) return; // Nech zostane na login screene
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();
      if (data?.role === 'doctor')       router.replace('/(doctor)');
      else if (data?.role === 'patient') router.replace('/(patient)');
      else                               router.replace('/setup-role');
    });
  }, []);

  return (
    <>
      <Stack>
        <Stack.Screen name="index"      options={{ headerShown: false }} />
        <Stack.Screen name="setup-role" options={{ headerShown: false }} />
        <Stack.Screen name="(patient)"  options={{ headerShown: false }} />
        <Stack.Screen name="(doctor)"   options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}
