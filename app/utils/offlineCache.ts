/**
 * Offline Cache Utility
 * Používa AsyncStorage na cachovanie Supabase dát
 * pre rýchlejší štart a offline prístup.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = '@loderer_cache_';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min default

type CacheEntry<T> = {
  data: T;
  timestamp: number;
  version: number;
};

const CACHE_VERSION = 1;

/**
 * Uloží dáta do cache
 */
export async function setCache<T>(key: string, data: T): Promise<void> {
  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now(), version: CACHE_VERSION };
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch (e) {
    // Ticho — cache je best-effort
    console.warn('[Cache] write failed:', key, e);
  }
}

/**
 * Načíta dáta z cache (ak nie sú expired)
 */
export async function getCache<T>(key: string, ttlMs: number = CACHE_TTL_MS): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (entry.version !== CACHE_VERSION) return null;
    if (Date.now() - entry.timestamp > ttlMs) return null;
    return entry.data;
  } catch (e) {
    return null;
  }
}

/**
 * Vymaže konkrétny kľúč z cache
 */
export async function clearCache(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_PREFIX + key);
  } catch (e) {
    // noop
  }
}

/**
 * Vymaže všetky cache dáta (napr. pri logout)
 */
export async function clearAllCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(k => k.startsWith(CACHE_PREFIX));
    if (cacheKeys.length > 0) await AsyncStorage.multiRemove(cacheKeys);
  } catch (e) {
    console.warn('[Cache] clearAll failed:', e);
  }
}

// ── Cache Keys ──────────────────────────────────────────────────────
export const CACHE_KEYS = {
  profile: (userId: string) => `profile_${userId}`,
  appointments: (userId: string, role: string) => `appointments_${role}_${userId}`,
  services: 'services',
  patients: (doctorId: string) => `patients_${doctorId}`,
  notifications: (userId: string) => `notifications_${userId}`,
} as const;
