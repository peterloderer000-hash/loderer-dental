import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

import sk from './locales/sk';
import en from './locales/en';

const LANG_KEY = '@loderer_language';

// ── Init i18next (synchronous, default = Slovak) ─────────────────────────────
i18n
  .use(initReactI18next)
  .init({
    compatibilityJSON: 'v4',
    lng: 'sk',
    fallbackLng: 'sk',
    resources: {
      sk: { translation: sk },
      en: { translation: en },
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

// ── Restore persisted language ────────────────────────────────────────────────
// Runs after init so the app boots in SK first, then switches if needed.
// This delay is imperceptible (AsyncStorage is fast on device).
AsyncStorage.getItem(LANG_KEY).then(saved => {
  if (saved && saved !== i18n.language) {
    i18n.changeLanguage(saved);
  }
}).catch(() => {/* ignore */});

// ── Public API ────────────────────────────────────────────────────────────────
export async function setAppLanguage(lang: 'sk' | 'en') {
  await AsyncStorage.setItem(LANG_KEY, lang);
  await i18n.changeLanguage(lang);
}

export default i18n;
