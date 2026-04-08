import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

export type Patient = {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  email: string | null;
  has_passport: boolean;
};

export function usePatients() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tick, setTick]         = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      // Načítaj všetkých pacientov
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, full_name, phone_number')
        .eq('role', 'patient')
        .order('full_name', { ascending: true });

      if (error || !profiles) {
        if (!cancelled) setLoading(false);
        return;
      }

      // Zisti, ktorí majú zdravotný pas
      const ids = profiles.map((p) => p.id);
      const { data: passports } = ids.length
        ? await supabase.from('health_passports').select('patient_id').in('patient_id', ids)
        : { data: [] };

      const passportSet = new Set((passports ?? []).map((pp: any) => pp.patient_id));

      // Načítaj emaily z auth cez profiles (email nie je v profiles, iba v auth)
      // Použijeme placeholder — email nie je dostupný bez admin API
      const result: Patient[] = profiles.map((p) => ({
        id:           p.id,
        full_name:    p.full_name,
        phone_number: p.phone_number,
        email:        null,
        has_passport: passportSet.has(p.id),
      }));

      if (!cancelled) {
        setPatients(result);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [tick]);

  return { patients, loading, refetch };
}
