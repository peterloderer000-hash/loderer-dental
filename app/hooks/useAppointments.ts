import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

export type Appointment = {
  id: string;
  appointment_date: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  notes: string | null;
  patient_id: string;
  doctor_id: string;
  patient: { full_name: string | null; phone_number: string | null } | null;
  doctor:  { full_name: string | null } | null;
};

export function useAppointments(role: 'patient' | 'doctor') {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

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
          doctor:doctor_id  ( full_name )
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

  /** Zmena statusu termínu */
  async function updateStatus(id: string, status: 'completed' | 'cancelled') {
    const { error } = await supabase.from('appointments').update({ status }).eq('id', id);
    if (!error) refetch();
    return error;
  }

  return { appointments, loading, fetchError, refetch, updateStatus };
}
