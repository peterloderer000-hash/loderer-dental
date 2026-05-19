/**
 * usePushNotifications — Push notifikácie pre Loderer Dental App
 *
 * V Expo Go (SDK 53+) sú push notifikácie na Androide odstránené.
 * Warningy sú potlačené cez LogBox.ignoreLogs v _layout.tsx.
 * Lokálne plánované notifikácie a listeners stále fungujú aj v Expo Go.
 *
 * V produkčnom EAS builde fungujú push notifikácie plnohodnotne.
 */

import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { supabase } from '../supabase';
import {
  registerForPushNotificationsAsync,
  schedulePushNotification,
  cancelScheduledNotification,
} from '../utils/notifications';

// Re-exporty pre spätú kompatibilitu — ostatné moduly ich môžu importovať odtiaľto
export { schedulePushNotification, cancelScheduledNotification };

// Typ subscription — SDK 51+ používa .remove() nie removeNotificationSubscription()
type Subscription = { remove: () => void };

// ─── Foreground handler ────────────────────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldPlaySound:  true,
    shouldSetBadge:   true,
    shouldShowBanner: true,
    shouldShowList:   true,
  }),
});

// ─── Lokálna pripomienka 1 hodinu pred termínom ────────────────────────────────
export async function scheduleAppointmentReminder(
  appointmentDate: Date,
  patientName:     string,
  serviceName:     string,
): Promise<string | null> {
  const reminderTime = new Date(appointmentDate.getTime() - 60 * 60 * 1000);
  if (reminderTime <= new Date()) return null;

  const delaySeconds = Math.floor((reminderTime.getTime() - Date.now()) / 1000);
  return schedulePushNotification(
    '📅 Blížiaci sa termín',
    `O hodinu: ${patientName} — ${serviceName}`,
    delaySeconds,
    { patientName, serviceName, appointmentDate: appointmentDate.toISOString() },
  );
}

// ─── Zruš naplánovanú notifikáciu ─────────────────────────────────────────────
export { cancelScheduledNotification as cancelAppointmentReminder };

// ─── Registrácia a uloženie tokenu do Supabase ────────────────────────────────
async function registerAndSaveToken(): Promise<void> {
  const token = await registerForPushNotificationsAsync();
  if (!token) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('profiles').update({ push_token: token }).eq('id', user.id);
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function usePushNotifications(): void {
  const notifSub    = useRef<Subscription | null>(null);
  const responseSub = useRef<Subscription | null>(null);

  useEffect(() => {
    // Pokus pri štarte (ak už je user prihlásený)
    registerAndSaveToken();

    // Znovu zaregistruje token hneď po prihlásení
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        registerAndSaveToken();
      }
    });

    notifSub.current    = Notifications.addNotificationReceivedListener(() => {});
    responseSub.current = Notifications.addNotificationResponseReceivedListener(() => {});

    return () => {
      authSub.unsubscribe();
      notifSub.current?.remove();
      responseSub.current?.remove();
    };
  }, []);
}
