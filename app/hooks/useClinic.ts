import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabase';
import type { ClinicStatus, ClinicEventType } from '../utils/clinicMetrics';

type ClinicRole = 'doctor' | 'reception';

// ─── Typy ─────────────────────────────────────────────────────────────────────

export type ClinicRoom = {
  id:         string;
  name:       string;
  color:      string;
  sort_order: number;
};

export type ClinicAppointment = {
  id:                  string;
  appointment_date:    string;
  patient_id:          string;
  doctor_id:           string;
  service_id:          string | null;
  // Hlavný status (existujúci)
  status:         string;
  arrived_at:     string | null;
  started_at:     string | null;   // kedy doktor začal (bolo: chair_start_at)
  ended_at:       string | null;   // kedy výkon skončil (bolo: treatment_end_at)
  // Clinic-specific
  clinic_status:  ClinicStatus;
  room_id:        string | null;
  // Relácie
  patient:  { full_name: string | null; phone_number: string | null } | null;
  service:  { name: string; emoji: string | null; duration_minutes: number } | null;
  room:     ClinicRoom | null;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useClinic() {
  const [appointments, setAppointments] = useState<ClinicAppointment[]>([]);
  const [rooms,        setRooms]        = useState<ClinicRoom[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [doctorId,     setDoctorId]     = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [clinicRole,   setClinicRole]   = useState<ClinicRole | null>(null);
  const [tick,         setTick]         = useState(0);
  const instanceId = useRef(`clinic-${Date.now()}`);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  // ── Načítaj dnešné termíny + miestnosti ────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) { setLoading(false); return; }

      // Zisti rolu — doctor filtruje podľa doctor_id, reception vidí všetky dnešné
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      const role = profile?.role as ClinicRole | null;
      if (role !== 'doctor' && role !== 'reception') {
        // patient alebo neznáma rola — clinic hook nie je pre nich
        setLoading(false);
        return;
      }

      setClinicRole(role);
      setCurrentUserId(user.id);
      if (role === 'doctor') setDoctorId(user.id);

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      let apptQuery = supabase
        .from('appointments')
        .select(`
          id, appointment_date, patient_id, doctor_id, service_id,
          status, arrived_at, started_at, ended_at,
          clinic_status, room_id,
          patient:profiles!appointments_patient_id_fkey(full_name, phone_number),
          service:services(name, emoji, duration_minutes),
          room:clinic_rooms(id, name, color, sort_order)
        `)
        .gte('appointment_date', todayStart.toISOString())
        .lte('appointment_date', todayEnd.toISOString())
        .order('appointment_date', { ascending: true });

      // Doctor vidí len svoje termíny; reception vidí všetky dnešné
      if (role === 'doctor') apptQuery = apptQuery.eq('doctor_id', user.id);

      // Rooms: doctor vidí svoje, reception vidí všetky aktívne
      let roomsQuery = supabase
        .from('clinic_rooms')
        .select('id, name, color, sort_order')
        .eq('is_active', true)
        .order('sort_order');

      if (role === 'doctor') roomsQuery = roomsQuery.eq('doctor_id', user.id);

      const [apptRes, roomsRes] = await Promise.all([apptQuery, roomsQuery]);

      if (!cancelled) {
        setAppointments((apptRes.data ?? []) as unknown as ClinicAppointment[]);
        setRooms((roomsRes.data ?? []) as ClinicRoom[]);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [tick]);

  // ── Realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    async function subscribe() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', user.id).maybeSingle();
      const role = profile?.role;
      if (role !== 'doctor' && role !== 'reception') return;

      // Doctor subscription: filter by doctor_id
      // Reception subscription: no filter — listen to all appointment changes
      const apptFilter = role === 'doctor'
        ? { event: '*' as const, schema: 'public', table: 'appointments', filter: `doctor_id=eq.${user.id}` }
        : { event: '*' as const, schema: 'public', table: 'appointments' };

      channel = supabase
        .channel(`clinic-rt-${instanceId.current}`)
        .on('postgres_changes', apptFilter, () => refetch())
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'clinic_events' },
          () => {},
        )
        .subscribe();
    }

    subscribe();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [refetch]);

  // ── Actions ───────────────────────────────────────────────────────────────

  async function _logEvent(
    appt:      ClinicAppointment,
    eventType: ClinicEventType,
    note?:     string,
  ): Promise<void> {
    if (!currentUserId) return;

    // doctor_id vždy odkazuje na lekára vlastniaceho appointment, nie na actora.
    // Ak akciu vykonala recepcia, zaznamenáme to do note.
    const ownerDoctorId = appt.doctor_id;
    const finalNote = clinicRole === 'reception'
      ? `[actor:reception:${currentUserId}]${note ? ` ${note}` : ''}`
      : (note ?? null);

    await supabase.from('clinic_events').insert({
      appointment_id: appt.id,
      doctor_id:      ownerDoctorId,
      event_type:     eventType,
      note:           finalNote,
    });
  }

  async function _updateAppt(
    id:      string,
    payload: Record<string, unknown>,
  ): Promise<{ error: string | null }> {
    const { error } = await supabase
      .from('appointments')
      .update(payload)
      .eq('id', id);
    if (!error) refetch();
    return { error: error?.message ?? null };
  }

  // Pacient prišiel
  async function markArrived(appt: ClinicAppointment): Promise<{ error: string | null }> {
    const payload: Record<string, unknown> = {
      clinic_status: 'waiting',
    };
    if (!appt.arrived_at) {
      payload.arrived_at = new Date().toISOString();
      payload.status     = 'arrived';
    }
    const res = await _updateAppt(appt.id, payload);
    if (!res.error) await _logEvent(appt, 'patient_arrived');
    return res;
  }

  // Odoslanie do kresla (START)
  async function startTreatment(appt: ClinicAppointment): Promise<{ error: string | null }> {
    const res = await _updateAppt(appt.id, {
      clinic_status: 'in_chair',
      started_at:    new Date().toISOString(),
    });
    if (!res.error) await _logEvent(appt, 'treatment_started');
    return res;
  }

  // Výkon hotový (HOTOVO)
  async function endTreatment(appt: ClinicAppointment): Promise<{ error: string | null }> {
    const res = await _updateAppt(appt.id, {
      clinic_status: 'treatment_done',
      ended_at:      new Date().toISOString(),
    });
    if (!res.error) await _logEvent(appt, 'treatment_finished');
    return res;
  }

  // Mešká
  async function markLate(appt: ClinicAppointment): Promise<{ error: string | null }> {
    const res = await _updateAppt(appt.id, { clinic_status: 'late' });
    if (!res.error) await _logEvent(appt, 'running_late');
    return res;
  }

  // No-show
  async function markNoShow(appt: ClinicAppointment): Promise<{ error: string | null }> {
    const res = await _updateAppt(appt.id, {
      clinic_status: 'no_show',
      status:        'cancelled',
    });
    if (!res.error) await _logEvent(appt, 'no_show');
    return res;
  }

  // Potrebujem pomoc
  async function needHelp(appt: ClinicAppointment, note?: string): Promise<void> {
    await _logEvent(appt, 'need_help', note);
  }

  // Priprav účet
  async function prepareInvoice(appt: ClinicAppointment): Promise<{ error: string | null }> {
    const res = await _updateAppt(appt.id, { clinic_status: 'checkout' });
    if (!res.error) await _logEvent(appt, 'prepare_invoice');
    return res;
  }

  // Zaplatené
  async function markPaid(appt: ClinicAppointment): Promise<{ error: string | null }> {
    const res = await _updateAppt(appt.id, {
      clinic_status:  'paid',
      status:         'completed',
      payment_status: 'paid',
    });
    if (!res.error) await _logEvent(appt, 'payment_done');
    return res;
  }

  // Priradiť miestnosť
  async function assignRoom(
    appt:   ClinicAppointment,
    roomId: string | null,
  ): Promise<{ error: string | null }> {
    return _updateAppt(appt.id, { room_id: roomId });
  }

  // Generický event log
  async function logEvent(
    appt:      ClinicAppointment,
    eventType: ClinicEventType,
    note?:     string,
  ): Promise<void> {
    await _logEvent(appt, eventType, note);
  }

  return {
    appointments,
    rooms,
    loading,
    doctorId,
    clinicRole,
    refetch,
    // actions
    markArrived,
    startTreatment,
    endTreatment,
    markLate,
    markNoShow,
    needHelp,
    prepareInvoice,
    markPaid,
    assignRoom,
    logEvent,
  };
}
