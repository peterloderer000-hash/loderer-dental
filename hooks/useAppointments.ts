import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabase';

export type Appointment = {
  id: string;
  appointment_date: string;
  status: 'pending' | 'scheduled' | 'completed' | 'cancelled';
  custom_duration_minutes: number | null;
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
          patient:profiles!appointments_patient_id_fkey ( full_name, phone_number ),
          doctor:profiles!appointments_doctor_id_fkey   ( full_name ),
          service:services ( name, emoji, duration_minutes, price_min, price_max )
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
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    async function subscribe() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const filter = role === 'patient'
        ? `patient_id=eq.${user.id}`
        : `doctor_id=eq.${user.id}`;

      channel = supabase
        .channel(`appointments-rt-${role}-${instanceId.current}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'appointments', filter },
          () => { refetch(); }
        )
        .subscribe();
    }

    subscribe();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [role, refetch]);

  /** Zmena statusu termínu */
  async function updateStatus(id: string, status: 'completed' | 'cancelled', doctorNotes?: string) {
    const payload: Record<string, unknown> = { status };
    if (doctorNotes !== undefined) payload.doctor_notes = doctorNotes.trim() || null;
    const { error } = await supabase.from('appointments').update(payload).eq('id', id);
    if (!error) refetch();
    return error;
  }

  /** Schválenie čakajúceho termínu doktorom (nastaví status=scheduled + voliteľnú dĺžku) */
  async function approvePending(id: string, customDurationMinutes?: number) {
    const payload: Record<string, unknown> = { status: 'scheduled' };
    if (customDurationMinutes != null) payload.custom_duration_minutes = customDurationMinutes;
    const { error } = await supabase.from('appointments').update(payload).eq('id', id);
    if (!error) refetch();
    return error;
  }

  return { appointments, loading, fetchError, refetch, updateStatus, approvePending };
}
