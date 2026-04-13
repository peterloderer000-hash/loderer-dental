import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

export type ToothStatus =
  | 'healthy' | 'cavity' | 'early_cavity' | 'watch'
  | 'filled' | 'large_filling' | 'replace_filling'
  | 'crown' | 'bridge' | 'implant' | 'veneer' | 'sealant'
  | 'root_canal' | 'extracted' | 'missing'
  | 'fracture' | 'erosion' | 'abrasion'
  | 'hypoplasia' | 'hypomineralization'
  | 'periodontal' | 'mobility'
  | 'improve_hygiene' | 'treatment_needed';

export type ToothRecord = {
  tooth_number: number;
  status: ToothStatus;
  notes: string | null;
};

export function useDentalChart(patientId: string) {
  const [chart, setChart] = useState<Record<number, ToothRecord>>({});
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!patientId) { setLoading(false); return; }
    let cancelled = false;

    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from('dental_charts')
        .select('tooth_number, status, notes')
        .eq('patient_id', patientId);

      if (!cancelled && data) {
        const map: Record<number, ToothRecord> = {};
        data.forEach((r) => { map[r.tooth_number] = r as ToothRecord; });
        setChart(map);
      }
      if (!cancelled) setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [patientId, tick]);

  async function saveTooth(toothNumber: number, status: ToothStatus, notes: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Error('Nie si prihlásený.');

    const { error } = await supabase.from('dental_charts').upsert(
      {
        patient_id:   patientId,
        doctor_id:    user.id,
        tooth_number: toothNumber,
        status,
        notes:        notes.trim() || null,
        updated_at:   new Date().toISOString(),
      },
      { onConflict: 'patient_id,tooth_number' },
    );

    if (!error) refetch();
    return error;
  }

  const stats = Object.values(chart).reduce(
    (acc, t) => { acc[t.status] = (acc[t.status] ?? 0) + 1; return acc; },
    {} as Partial<Record<ToothStatus, number>>,
  );

  return { chart, loading, saveTooth, refetch, stats };
}
