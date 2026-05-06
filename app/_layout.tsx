import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { KeyboardAvoidingView, Platform, LogBox } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Updates from 'expo-updates';
import { useFonts, PlayfairDisplay_700Bold, PlayfairDisplay_700Bold_Italic } from '@expo-google-fonts/playfair-display';
import { DMSans_400Regular, DMSans_500Medium } from '@expo-google-fonts/dm-sans';
import { ErrorBoundary } from '../components/ErrorBoundary';
import '../i18n';
import { ThemeProvider, useAppTheme } from '../context/ThemeContext';
import { ToastProvider } from '../components/ui/ToastNotification';
import { usePushNotifications } from '../hooks/usePushNotifications';

SplashScreen.preventAutoHideAsync();

// Potlač known Expo Go development warningy — v produkcii (EAS build) sa nevyskytnú
LogBox.ignoreLogs([
  'expo-notifications functionality is not fully supported in Expo Go',
  'expo-notifications: Android Push notifications',
  'expo-notifications: iOS Push notifications',
]);

// Vnútorný komponent — musí byť vo vnútri ThemeProvider, aby mohol čítať kontext
function InnerLayout() {
  const { colors } = useAppTheme();
  usePushNotifications(); // registruje push token + nastaví listenery

  const [fontsLoaded, fontError] = useFonts({
    PlayfairDisplay_700Bold,
    PlayfairDisplay_700Bold_Italic,
    DMSans_400Regular,
    DMSans_500Medium,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    async function checkUpdate() {
      try {
        if (!__DEV__) {
          const update = await Updates.checkForUpdateAsync();
          if (update.isAvailable) {
            await Updates.fetchUpdateAsync();
            await Updates.reloadAsync();
          }
        }
      } catch (e) {
        console.warn('Update check failed:', e);
      }
    }
    checkUpdate();
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ToastProvider>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <Stack screenOptions={{ animation: 'fade', animationDuration: 220 }}>
          <Stack.Screen name="index"       options={{ headerShown: false }} />
          <Stack.Screen name="onboarding"  options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="setup-role"         options={{ headerShown: false }} />
          <Stack.Screen name="accept-invitation"  options={{ headerShown: false }} />
          <Stack.Screen name="doctor-onboarding" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="(patient)"   options={{ headerShown: false }} />
          <Stack.Screen name="(doctor)"    options={{ headerShown: false }} />
          <Stack.Screen name="(reception)" options={{ headerShown: false }} />
        </Stack>
      </KeyboardAvoidingView>
      <StatusBar style={colors.statusBarStyle} />
    </ToastProvider>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <InnerLayout />
      </ThemeProvider>
    </ErrorBoundary>
  );
}
