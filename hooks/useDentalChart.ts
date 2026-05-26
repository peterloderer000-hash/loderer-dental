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
  photo_url: string | null;
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
      // Try with photo_url first; fall back without it if column doesn't exist yet
      let result = await supabase
        .from('dental_charts')
        .select('tooth_number, status, notes, photo_url')
        .eq('patient_id', patientId);

      if (result.error?.message?.includes('photo_url')) {
        result = await supabase
          .from('dental_charts')
          .select('tooth_number, status, notes')
          .eq('patient_id', patientId);
      }

      if (!cancelled && result.data) {
        const map: Record<number, ToothRecord> = {};
        result.data.forEach((r: any) => { map[r.tooth_number] = { ...r, photo_url: r.photo_url ?? null } as ToothRecord; });
        setChart(map);
      }
      if (!cancelled) setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [patientId, tick]);

  async function saveTooth(toothNumber: number, status: ToothStatus, notes: string, photoUrl?: string | null) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Error('Nie si prihlásený.');

    const payload: Record<string, unknown> = {
      patient_id:   patientId,
      doctor_id:    user.id,
      tooth_number: toothNumber,
      status,
      notes:        notes.trim() || null,
      updated_at:   new Date().toISOString(),
    };
    if (photoUrl !== undefined) payload.photo_url = photoUrl;

    let { error } = await supabase.from('dental_charts').upsert(
      payload,
      { onConflict: 'patient_id,tooth_number' },
    );

    // If photo_url column doesn't exist yet, retry without it
    if (error?.message?.includes('photo_url')) {
      delete payload.photo_url;
      ({ error } = await supabase.from('dental_charts').upsert(
        payload,
        { onConflict: 'patient_id,tooth_number' },
      ));
    }

    if (!error) {
      await supabase.from('dental_records').insert({
        patient_id:   patientId,
        doctor_id:    user.id,
        tooth_number: toothNumber,
        status,
        notes: notes.trim() || null,
      });
      refetch();
    }
    return error;
  }

  const stats = Object.values(chart).reduce(
    (acc, t) => { acc[t.status] = (acc[t.status] ?? 0) + 1; return acc; },
    {} as Partial<Record<ToothStatus, number>>,
  );

  return { chart, loading, saveTooth, refetch, stats };
}
