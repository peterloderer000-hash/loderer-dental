import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// ─── Android notification channel ─────────────────────────────────────────────
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name:             'Dental App',
    importance:       Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor:       '#6B4F35',
    sound:            'default',
  });
}

// ─── registerForPushNotificationsAsync ────────────────────────────────────────
// Požiada o povolenie, vytvorí Android channel a vráti Expo push token.
// Vracia null ak: Expo Go bez projectId, povolenie odmietnuté, iná chyba.
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
    await ensureAndroidChannel();

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    const projectId: string | undefined =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      undefined;
    if (!projectId) return null;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    return token ?? null;
  } catch {
    return null;
  }
}

// ─── schedulePushNotification ─────────────────────────────────────────────────
// Naplánuje lokálnu notifikáciu.
// delaySeconds = 0 → zobrazí okamžite (trigger: null)
// delaySeconds > 0 → zobrazí po N sekundách
export async function schedulePushNotification(
  title:        string,
  body:         string,
  delaySeconds: number                  = 0,
  data?:        Record<string, unknown>,
): Promise<string | null> {
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        data:  data ?? {},
      },
      trigger: delaySeconds > 0
        ? {
            type:    Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: delaySeconds,
          }
        : null,
    });
    return id;
  } catch {
    return null;
  }
}

// ─── cancelScheduledNotification ──────────────────────────────────────────────
export async function cancelScheduledNotification(notificationId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // ticho ignoruj
  }
}
