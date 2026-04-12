// ─── Shared time/date utilities ──────────────────────────────────────────────

export const SK_DAYS_SHORT   = ['Ne', 'Po', 'Ut', 'St', 'Št', 'Pi', 'So'];
export const SK_MONTHS_SHORT = ['jan','feb','mar','apr','máj','jún','júl','aug','sep','okt','nov','dec'];

/**
 * Konvertuj JS deň (0=Ne … 6=So) na DB formát (1=Po … 7=Ne).
 * Supabase tabuľka opening_hours používa 1=Pondelok, 7=Nedeľa.
 */
export function jsDayToDb(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay;
}

/** Vygeneruj pracovné dni (bez So/Ne). includeToday=true pre doktora. */
export function getNextWorkingDays(count: number, includeToday = false): Date[] {
  const result: Date[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);

  if (includeToday && d.getDay() !== 0 && d.getDay() !== 6) {
    result.push(new Date(d));
  }

  while (result.length < count) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) result.push(new Date(d));
  }
  return result;
}

/**
 * Vygeneruj nasledujúce dni, kde doktor má otvorené.
 * @param count       Počet dní na vrátenie
 * @param openDbDays  Set DB čísel dní (1=Po … 7=Ne), ktoré sú otvorené
 */
export function getNextOpenDays(count: number, openDbDays: Set<number>): Date[] {
  const result: Date[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);

  // Maximálne 120 dní dopredu aby sme predišli nekonečnej slučke
  let safety = 0;
  while (result.length < count && safety < 120) {
    d.setDate(d.getDate() + 1);
    if (openDbDays.has(jsDayToDb(d.getDay()))) result.push(new Date(d));
    safety++;
  }
  return result;
}

/**
 * Vygeneruj časové sloty pre danú dĺžku služby — s dynamickým rozsahom hodín.
 * Krok startu: 30 min. Posledný slot musí skončiť do closeTime.
 */
export function generateTimeSlotsForDay(
  durationMinutes: number,
  openTime:  string,   // 'HH:MM'
  closeTime: string,   // 'HH:MM'
): { start: string; end: string }[] {
  const slots: { start: string; end: string }[] = [];
  const startLimit = timeToMinutes(openTime);
  const endLimit   = timeToMinutes(closeTime);
  let current = startLimit;

  while (current + durationMinutes <= endLimit) {
    slots.push({ start: toHHMM(current), end: toHHMM(current + durationMinutes) });
    current += 30;
  }
  return slots;
}

/**
 * Vygeneruj časové sloty pre danú dĺžku služby.
 * Začiatok: 08:00, krok startu: 30 min, koniec: posledný slot kde start + duration <= 17:00
 * @deprecated Použi generateTimeSlotsForDay so skutočnými hodinami doktora.
 */
export function generateTimeSlots(durationMinutes: number): { start: string; end: string }[] {
  return generateTimeSlotsForDay(durationMinutes, '08:00', '17:00');
}

function toHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Skonvertuj "HH:MM" na minúty od polnoci */
export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
