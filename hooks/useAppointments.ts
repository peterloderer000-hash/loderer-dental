import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabase';

export type Appointment = {
  id: string;
  appointment_date: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  notes: string | null;
  doctor_notes: string | null;
  patient_id: string;
  doctor_id: string;
  service_id: string | null;
  patient: { full_name: string | null; phone_number: string | null } | null;
  doctor:  { full_name: string | null } | null;
  service: { name: string; emoji: string | null; duration_minutes: number; price_min: number | null; price_max: number | null } | null;
  patient_rating: number | null;
  patient_review: string | null;
};

export function useAppointments(role: 'patient' | 'doctor') {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // Unikátny ID pre každú inštanciu hooku — zabraňuje konfliktu názvov kanálov
  const instanceId = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) setLoading(false); return; }

      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          patient:patient_id ( full_name, phone_number ),
          doctor:doctor_id   ( full_name ),
          service:service_id ( name, emoji, duration_minutes, price_min, price_max )
        `)
        .eq(role === 'patient' ? 'patient_id' : 'doctor_id', user.id)
        .order('appointment_date', { ascending: true });

      if (!cancelled) {
        if (error) setFetchError(error.message);
        else { setAppointments((data as Appointment[]) ?? []); setFetchError(null); }
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [tick, role]);

  // ── Realtime subscription ─────────────────────────────────────────────────
  // Každá inštancia hooku dostane unikátny názov kanála (instanceId),
  // aby nedošlo ku konfliktu keď je hook použitý na viacerých obrazovkách naraz.
  useEffect(() => {
    const channel = supabase
      .channel(`appointments-rt-${role}-${instanceId.current}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' },
        () => { refetch(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [role, refetch]);

  /** Zmena statusu termínu */
  async function updateStatus(id: string, status: 'completed' | 'cancelled', doctorNotes?: string) {
    const payload: Record<string, unknown> = { status };
    if (doctorNotes !== undefined) payload.doctor_notes = doctorNotes.trim() || null;
    const { error } = await supabase.from('appointments').update(payload).eq('id', id);
    if (!error) refetch();
    return error;
  }

  return { appointments, loading, fetchError, refetch, updateStatus };
}
