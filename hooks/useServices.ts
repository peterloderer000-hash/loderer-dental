import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

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
    supabase
      .from('services')
      .select('*')
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
        setServices((data ?? []) as Service[]);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Zoskup podľa kategórie
  const grouped = services.reduce<Record<string, Service[]>>((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {});

  return { services, flat: services, grouped, loading };
}

/** Formátuj cenu podľa cenníka (slovenský štandard) */
export function formatPrice(min: number | null, max: number | null): string {
  if (min === null && max === null) return 'Cena na vyžiadanie';
  if (min === 0   && max === 0)    return 'Zadarmo';
  if (min === 0)                   return `do ${max} €`;
  if (min === max || max === null) return `${min} €`;
  return `od ${min} €`;   // pohyblivá cena — zobraz iba minimum (štandard "od")
}

/** Formátuj cenu s celým rozsahom (pre detail, napr. card v booking) */
export function formatPriceRange(min: number | null, max: number | null): string {
  if (min === null && max === null) return 'Cena na vyžiadanie';
  if (min === 0   && max === 0)    return 'Zadarmo';
  if (min === 0)                   return `do ${max} €`;
  if (min === max || max === null) return `${min} €`;
  return `${min} – ${max} €`;
}

/** Formátuj dĺžku: "30 min" / "1 hod" / "1 hod 30 min" */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hod` : `${h} hod ${m} min`;
}
