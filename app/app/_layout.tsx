import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ErrorBoundary } from '../components/ErrorBoundary';

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <Stack>
        <Stack.Screen name="index"       options={{ headerShown: false }} />
        <Stack.Screen name="onboarding"  options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="setup-role"  options={{ headerShown: false }} />
        <Stack.Screen name="(patient)"   options={{ headerShown: false }} />
        <Stack.Screen name="(doctor)"    options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="light" />
    </ErrorBoundary>
  );
}
