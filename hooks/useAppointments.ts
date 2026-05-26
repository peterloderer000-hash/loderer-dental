import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabase';
import { getCache, setCache, CACHE_KEYS } from '../utils/offlineCache';

export type Appointment = {
  id: string;
  appointment_date: string;
  status: 'pending' | 'scheduled' | 'arrived' | 'completed' | 'cancelled';
  arrived_at: string | null;
  custom_duration_minutes: number | null;
  notes: string | null;
  doctor_notes: string | null;
  patient_id: string;
  doctor_id: string;
  service_id: string | null;
  family_member_name: string | null;
  patient: { full_name: string | null; phone_number: string | null } | null;
  doctor:  { full_name: string | null } | null;
  service: { name: string; emoji: string | null; duration_minutes: number; price_min: number | null; price_max: number | null } | null;
  patient_rating: number | null;
  patient_review: string | null;
  is_urgent: boolean;
  payment_status: string;
  care_instructions: string | null;
};

export function useAppointments(role: 'patient' | 'doctor') {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const instanceId = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) setLoading(false); return; }

      if (tick === 0) {
        const cached = await getCache<Appointment[]>(CACHE_KEYS.appointments(user.id, role), 15 * 60 * 1000);
        if (cached && !cancelled && appointments.length === 0) {
          setAppointments(cached);
          setLoading(false);
        }
      }

      const { data, error } = await supabase
        .from('appointments')
        .select('id, appointment_date, status, arrived_at, custom_duration_minutes, notes, doctor_notes, patient_id, doctor_id, service_id, family_member_name, patient_rating, patient_review, is_urgent, payment_status, care_instructions, patient:profiles!appointments_patient_id_fkey(full_name, phone_number), doctor:profiles!appointments_doctor_id_fkey(full_name), service:services(name, emoji, duration_minutes, price_min, price_max)')
        .eq(role === 'patient' ? 'patient_id' : 'doctor_id', user.id)
        .order('appointment_date', { ascending: true })
        .limit(300);

      if (!cancelled) {
        if (error) setFetchError(error.message);
        else {
          const apptData = (data as unknown as Appointment[]) ?? [];
          setAppointments(apptData);
          setFetchError(null);
          setCache(CACHE_KEYS.appointments(user.id, role), apptData);
        }
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [tick, role]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    async function subscribe() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const filter = role === 'patient' ? `patient_id=eq.${user.id}` : `doctor_id=eq.${user.id}`;
      channel = supabase
        .channel(`appointments-rt-${role}-${instanceId.current}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter }, () => { refetch(); })
        .subscribe();
    }

    subscribe();
    return () => { cancelled = true; if (channel) void supabase.removeChannel(channel); };
  }, [role, refetch]);

  async function updateStatus(id: string, status: 'arrived' | 'completed' | 'cancelled', doctorNotes?: string, careInstructions?: string) {
    const payload: Record<string, unknown> = { status };
    if (status === 'arrived') payload.arrived_at = new Date().toISOString();
    if (doctorNotes !== undefined) payload.doctor_notes = doctorNotes.trim() || null;
    if (careInstructions !== undefined) payload.care_instructions = careInstructions.trim() || null;
    const { error } = await supabase.from('appointments').update(payload).eq('id', id);
    if (!error) {
      refetch();
      if (status === 'cancelled') {
        const appt = appointments.find(a => a.id === id);
        if (appt?.patient_id) {
          const dateStr = new Date(appt.appointment_date).toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
          supabase.from('notifications').insert({
            user_id: appt.patient_id,
            title: 'Termin zruseny',
            body: `Vas termin ${appt.service?.name ? `(${appt.service.name}) ` : ''}${dateStr} bol zruseny.`,
            type: 'warning',
            appointment_id: id,
          }).then(null, () => {});
        }
      }
    }
    return error;
  }

  async function selfCheckIn(id: string) {
    const { error } = await supabase.from('appointments').update({ status: 'arrived', arrived_at: new Date().toISOString() }).eq('id', id);
    if (!error) refetch();
    return error;
  }

  async function approvePending(id: string, customDurationMinutes?: number) {
    const payload: Record<string, unknown> = { status: 'scheduled' };
    if (customDurationMinutes != null) payload.custom_duration_minutes = customDurationMinutes;
    const { error } = await supabase.from('appointments').update(payload).eq('id', id);
    if (!error) refetch();
    return error;
  }

  return { appointments, loading, fetchError, refetch, updateStatus, selfCheckIn, approvePending };
}
