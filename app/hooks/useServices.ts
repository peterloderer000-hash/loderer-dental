import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
import { getCache, setCache, CACHE_KEYS } from '../utils/offlineCache';

export type Service = {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_min: number | null;
  price_max: number | null;
  category: string;
  emoji: string | null;
  is_active: boolean;
};

export function useServices() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    let cancelled = false;

    getCache<Service[]>(CACHE_KEYS.services, 60 * 60 * 1000).then(cached => {
      if (cached && !cancelled && services.length === 0) {
        setServices(cached);
        setLoading(false);
      }
    });

    supabase
      .from('services')
      .select('id, name, description, duration_minutes, price_min, price_max, category, emoji, is_active')
      .eq('is_active', true)
      .order('category')
      .order('duration_minutes')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('[useServices] Failed to load services:', error);
          setLoading(false);
          return;
        }
        const svcs = (data ?? []) as Service[];
        setServices(svcs);
        setLoading(false);
        setCache(CACHE_KEYS.services, svcs);
      });
    return () => { cancelled = true; };
  }, []);

  const grouped = useMemo(() => services.reduce<Record<string, Service[]>>((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {}), [services]);

  return { services, flat: services, grouped, loading };
}

export function formatPrice(min: number | null, max: number | null): string {
  if (min === null && max === null) return 'Cena na vyžiadanie';
  if (min === 0   && max === 0)    return 'Zadarmo';
  if (min === 0)                   return `do ${max} €`;
  if (min === max || max === null)  return `${min} €`;
  return `od ${min} €`;
}

export function formatPriceRange(min: number | null, max: number | null): string {
  if (min === null && max === null) return 'Cena na vyžiadanie';
  if (min === 0   && max === 0)    return 'Zadarmo';
  if (min === 0)                   return `do ${max} €`;
  if (min === max || max === null)  return `${min} €`;
  return `${min} – ${max} €`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hod` : `${h} hod ${m} min`;
}
