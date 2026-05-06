/**
 * Loderer Dental App — Téma / Dark mode
 *
 * Používanie:
 *   const { colors, dark, toggle } = useAppTheme();
 *   style={[styles.container, { backgroundColor: colors.bg2 }]}
 */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Farebné palety ───────────────────────────────────────────────────────────
export type AppColors = {
  esp:           string; // tmavý header / brand pozadie
  wal:           string; // walnut — ikony, sekundárny text
  sand:          string; // piesok — terciárne popisky
  cream:         string; // krémová — svetlý text na tmavom
  bg2:           string; // scroll pozadie
  bg3:           string; // border / oddeľovač
  cardBg:        string; // pozadie kariet
  inputBg:       string; // pozadie inputov
  textPrimary:   string; // hlavný text
  textSecondary: string; // sekundárny text
  statusBarStyle:'light' | 'dark';
};

export const LIGHT_COLORS: AppColors = {
  esp:           '#2C1F14',
  wal:           '#6B4F3A',
  sand:          '#C4A882',
  cream:         '#FAF6F0',
  bg2:           '#F4EDE4',
  bg3:           '#EDE4D8',
  cardBg:        '#FFFDF9',
  inputBg:       '#F4EDE4',
  textPrimary:   '#2C1F14',
  textSecondary: '#6B4F3A',
  statusBarStyle:'light',
};

export const DARK_COLORS: AppColors = {
  esp:           '#2C1F14', // espresso header
  wal:           '#C4A882', // sand — legible on dark
  sand:          '#8B6F4E',
  cream:         '#FAF6F0',
  bg2:           '#2C1F14', // espresso background (not black)
  bg3:           '#5A4535', // warm border
  cardBg:        '#3A2A1E', // dark card
  inputBg:       '#3A2A1E',
  textPrimary:   '#FAF6F0', // cream text
  textSecondary: '#C4A882', // sand text
  statusBarStyle:'light',
};

// ─── Kontext ──────────────────────────────────────────────────────────────────
type ThemeCtx = {
  colors:    AppColors;
  dark:      boolean;
  toggle:    () => void;
};

const ThemeContext = createContext<ThemeCtx>({
  colors: LIGHT_COLORS,
  dark:   false,
  toggle: () => {},
});

const STORAGE_KEY = '@loderer_theme';

// ─── Provider ─────────────────────────────────────────────────────────────────
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system   = useColorScheme();                         // 'light' | 'dark' | null
  const [override, setOverride] = useState<'light' | 'dark' | null>(null);
  const [loaded,   setLoaded]   = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === 'light' || v === 'dark') setOverride(v);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  // Kým sa načíta AsyncStorage, použi systémové nastavenie
  const dark = loaded && override !== null
    ? override === 'dark'
    : system === 'dark';

  function toggle() {
    const next: 'light' | 'dark' = dark ? 'light' : 'dark';
    setOverride(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }

  return (
    <ThemeContext.Provider value={{ colors: dark ? DARK_COLORS : LIGHT_COLORS, dark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAppTheme() {
  return useContext(ThemeContext);
}
