// ─── Clinic status / event types ─────────────────────────────────────────────

export type ClinicStatus =
  | 'scheduled'
  | 'arrived'
  | 'waiting'
  | 'in_chair'
  | 'treatment_done'
  | 'checkout'
  | 'paid'
  | 'late'
  | 'cancelled'
  | 'no_show';

export type ClinicEventType =
  | 'patient_arrived'
  | 'sent_to_chair'
  | 'treatment_started'
  | 'treatment_finished'
  | 'running_late'
  | 'need_help'
  | 'prepare_invoice'
  | 'patient_wants_treatment_plan'
  | 'checkout_started'
  | 'payment_done'
  | 'cancelled'
  | 'no_show'
  | 'note';

// ─── Metric helpers ───────────────────────────────────────────────────────────

export function diffMinutes(
  start?: Date | string | null,
  end?:   Date | string | null,
): number | null {
  if (!start || !end) return null;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return null;
  return Math.max(0, Math.round((e - s) / 60000));
}

export function getWaitingMinutes(appt: {
  arrived_at?:    Date | string | null;
  chair_start_at?: Date | string | null;
}): number | null {
  if (!appt.arrived_at) return null;
  return diffMinutes(appt.arrived_at, appt.chair_start_at ?? new Date());
}

export function getTreatmentMinutes(appt: {
  chair_start_at?:   Date | string | null;
  treatment_end_at?: Date | string | null;
}): number | null {
  if (!appt.chair_start_at) return null;
  return diffMinutes(appt.chair_start_at, appt.treatment_end_at ?? new Date());
}

export function isWaitingTooLong(appt: {
  arrived_at?:    Date | string | null;
  chair_start_at?: Date | string | null;
}): boolean {
  const w = getWaitingMinutes(appt);
  return w !== null && w > 15;
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export function fmtMins(mins: number | null): string {
  if (mins === null) return '—';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} hod` : `${h} h ${m} min`;
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
}

// ─── Status config ────────────────────────────────────────────────────────────

export type StatusCfg = {
  label:  string;
  color:  string;
  bg:     string;
  border: string;
  emoji:  string;
};

export const CLINIC_STATUS_CFG: Record<ClinicStatus, StatusCfg> = {
  scheduled:      { label: 'Naplánovaný',    color: '#1A5276', bg: '#EBF5FB', border: '#AED6F1', emoji: '📅' },
  arrived:        { label: 'Prišiel',         color: '#117A65', bg: '#E8F8F5', border: '#A2D9CE', emoji: '🟢' },
  waiting:        { label: 'Čaká',            color: '#7D6608', bg: '#FEF9E7', border: '#F9E79F', emoji: '⏳' },
  in_chair:       { label: 'V kresle',        color: '#1E8449', bg: '#EAFAF1', border: '#A9DFBF', emoji: '🦷' },
  treatment_done: { label: 'Výkon hotový',    color: '#7D3C98', bg: '#F5EEF8', border: '#D7BDE2', emoji: '✅' },
  checkout:       { label: 'Účet',            color: '#E67E22', bg: '#FEF3E2', border: '#FAD7A0', emoji: '🧾' },
  paid:           { label: 'Zaplatené',       color: '#1E8449', bg: '#EAFAF1', border: '#A9DFBF', emoji: '💳' },
  late:           { label: 'Mešká',           color: '#922B21', bg: '#FDEDEC', border: '#F1948A', emoji: '⚠️' },
  cancelled:      { label: 'Zrušený',         color: '#7F8C8D', bg: '#F4F6F7', border: '#D5D8DC', emoji: '❌' },
  no_show:        { label: 'Neprišiel',       color: '#922B21', bg: '#FDEDEC', border: '#F1948A', emoji: '🚫' },
};

// ─── Dashboard metrics ────────────────────────────────────────────────────────

export type ClinicDayMetrics = {
  totalToday:       number;
  waitingNow:       number;
  inChairNow:       number;
  completedToday:   number;
  noShowToday:      number;
  cancelledToday:   number;
  waitingTooLong:   number;   // > 15 min
  avgWaitingMins:   number | null;
  avgTreatmentMins: number | null;
  utilizationPct:   number | null; // dokončené / celkom (bez cancelled/no_show)
};

export function computeDayMetrics(appointments: Array<{
  clinic_status:     ClinicStatus;
  arrived_at?:       string | null;
  chair_start_at?:   string | null;
  treatment_end_at?: string | null;
}>): ClinicDayMetrics {
  const total       = appointments.length;
  const waitingNow  = appointments.filter(a => a.clinic_status === 'waiting').length;
  const inChairNow  = appointments.filter(a => a.clinic_status === 'in_chair').length;
  const completed   = appointments.filter(a => ['treatment_done','checkout','paid'].includes(a.clinic_status)).length;
  const noShow      = appointments.filter(a => a.clinic_status === 'no_show').length;
  const cancelled   = appointments.filter(a => a.clinic_status === 'cancelled').length;

  const waitingTooLong = appointments.filter(a =>
    ['waiting','arrived','in_chair'].includes(a.clinic_status) && isWaitingTooLong(a)
  ).length;

  // Avg waiting — len pre tých čo prišli
  const waitMins = appointments
    .filter(a => a.arrived_at && a.chair_start_at)
    .map(a => diffMinutes(a.arrived_at, a.chair_start_at))
    .filter((m): m is number => m !== null);
  const avgWaiting = waitMins.length ? Math.round(waitMins.reduce((s, v) => s + v, 0) / waitMins.length) : null;

  // Avg treatment — len pre dokončené
  const treatMins = appointments
    .filter(a => a.chair_start_at && a.treatment_end_at)
    .map(a => diffMinutes(a.chair_start_at, a.treatment_end_at))
    .filter((m): m is number => m !== null);
  const avgTreat = treatMins.length ? Math.round(treatMins.reduce((s, v) => s + v, 0) / treatMins.length) : null;

  // Utilization: dokončené / (celkom - zrušené - no_show)
  const eligible = total - cancelled - noShow;
  const utilizationPct = eligible > 0 ? Math.round((completed / eligible) * 100) : null;

  return {
    totalToday:       total,
    waitingNow,
    inChairNow,
    completedToday:   completed,
    noShowToday:      noShow,
    cancelledToday:   cancelled,
    waitingTooLong,
    avgWaitingMins:   avgWaiting,
    avgTreatmentMins: avgTreat,
    utilizationPct,
  };
}
