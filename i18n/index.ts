import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import sk from './sk.json';
import en from './en.json';

const LANG_KEY = '@loderer_lang';

i18n.use(initReactI18next).init({
  compatibilityJSON: 'v3',
  lng: 'sk',
  fallbackLng: 'sk',
  resources: {
    sk: { translation: sk },
    en: { translation: en },
  },
  interpolation: { escapeValue: false },
});

// Load saved language preference async (after init, triggers re-render if different)
AsyncStorage.getItem(LANG_KEY).then((saved) => {
  if (saved === 'en' || saved === 'sk') i18n.changeLanguage(saved);
}).catch(() => {});

export async function setLanguage(lang: 'sk' | 'en') {
  await i18n.changeLanguage(lang);
  try { await AsyncStorage.setItem(LANG_KEY, lang); } catch {}
}

export function getLanguage(): 'sk' | 'en' {
  return (i18n.language ?? 'sk') as 'sk' | 'en';
}

export default i18n;
