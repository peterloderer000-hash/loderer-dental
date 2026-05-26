import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

export type Patient = {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  email: string | null;
  avatar_url: string | null;
  has_passport: boolean;
  appointment_count: number;
  last_appointment_date: string | null;
  recall_needed: boolean; // last completed visit > 6 months ago
  date_of_birth: string | null;
  days_until_birthday: number | null; // null if no dob
};

function daysUntilBirthday(dob: string): number {
  const now = new Date();
  const d   = new Date(dob);
  let next  = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (next < now) next = new Date(now.getFullYear() + 1, d.getMonth(), d.getDate());
  return Math.floor((next.getTime() - now.getTime()) / 86400000);
}

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
        .select('id, full_name, phone_number, avatar_url, date_of_birth')
        .eq('role', 'patient')
        .order('full_name', { ascending: true });

      if (error || !profiles) {
        if (!cancelled) setLoading(false);
        return;
      }

      // Fetch passports + appointment stats paralelne
      const ids = profiles.map((p) => p.id);
      const [passportsRes, apptRes] = ids.length
        ? await Promise.all([
            supabase.from('health_passports').select('patient_id').in('patient_id', ids),
            supabase.from('appointments')
              .select('patient_id, appointment_date, status')
              .in('patient_id', ids)
              .neq('status', 'cancelled'),
          ])
        : [{ data: [] }, { data: [] }];

      const passportSet = new Set((passportsRes.data ?? []).map((pp: any) => pp.patient_id));
      const apptData = apptRes.data;

      // Compute per-patient stats
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const apptMap = new Map<string, { count: number; lastDate: string | null; recallNeeded: boolean }>();
      (apptData ?? []).forEach((a: any) => {
        const existing = apptMap.get(a.patient_id) ?? { count: 0, lastDate: null, recallNeeded: false };
        existing.count++;
        if (!existing.lastDate || a.appointment_date > existing.lastDate) {
          existing.lastDate = a.appointment_date;
        }
        apptMap.set(a.patient_id, existing);
      });
      // Compute recall_needed: only completed visits matter
      const completedApptMap = new Map<string, string>(); // patient_id → last completed date
      (apptData ?? []).filter((a: any) => a.status === 'completed').forEach((a: any) => {
        const existing = completedApptMap.get(a.patient_id);
        if (!existing || a.appointment_date > existing) {
          completedApptMap.set(a.patient_id, a.appointment_date);
        }
      });

      // Načítaj emaily z auth cez profiles (email nie je v profiles, iba v auth)
      // Použijeme placeholder — email nie je dostupný bez admin API
      const result: Patient[] = profiles.map((p) => {
        const stats = apptMap.get(p.id);
        const lastCompleted = completedApptMap.get(p.id);
        const recallNeeded = lastCompleted
          ? new Date(lastCompleted) < sixMonthsAgo
          : false;
        return {
          id:                    p.id,
          full_name:             p.full_name,
          phone_number:          p.phone_number,
          email:                 null,
          avatar_url:            p.avatar_url ?? null,
          has_passport:          passportSet.has(p.id),
          appointment_count:     stats?.count ?? 0,
          last_appointment_date: stats?.lastDate ?? null,
          recall_needed:         recallNeeded,
          date_of_birth:         p.date_of_birth ?? null,
          days_until_birthday:   p.date_of_birth ? daysUntilBirthday(p.date_of_birth) : null,
        };
      });

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
