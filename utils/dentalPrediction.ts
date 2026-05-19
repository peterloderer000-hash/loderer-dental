// ─── Dental Twin — Prediction Engine ─────────────────────────────────────────
// Rule-based MVP engine — čisto TypeScript, bez Edge Function

export type ToothStatus =
  | 'healthy' | 'caries_initial' | 'caries_deep'
  | 'filling' | 'inlay' | 'crown' | 'endo' | 'implant'
  | 'extracted' | 'missing' | 'watch';

export interface RiskFactors {
  smoking:      boolean;
  diabetes:     boolean;
  bruxism:      boolean;
  hygiene:      number;  // 0-10 (10 = perfektná)
}

export interface ToothPrediction {
  tooth:       number;
  fromStatus:  ToothStatus;
  toStatus:    ToothStatus;
  probability: number; // 0-1
  cost:        number; // EUR
}

export interface YearSnapshot {
  year:          number;  // 0 = dnes, +N = predikcia
  teeth:         Record<number, ToothStatus>;
  newIssues:     ToothPrediction[];
  totalCost:     number;
  cumulativeCost:number;
}

// ─── Cenník (priemerné SK ceny) ───────────────────────────────────────────────
export const PROCEDURE_COSTS: Partial<Record<ToothStatus, number>> = {
  caries_initial: 80,   // konzultácia + remineralizácia
  caries_deep:    150,  // plomba
  filling:        150,  // výmena plomby
  endo:           380,  // devitalizácia
  crown:          550,  // korunka
  implant:        1400, // implantát (vrátane korunky)
  extracted:      120,  // extrakcia
};

export const PREVENTION_COST = 60; // ročná preventívna prehliadka + čistenie

// ─── Pravidlá progresie ───────────────────────────────────────────────────────
interface ProgressionRule {
  to:          ToothStatus;
  minMonths:   number;
  maxMonths:   number;
  baseProbPerYear: number; // 0-1 (bez rizikových faktorov)
  cost:        number;
}

const PROGRESSION_RULES: Partial<Record<ToothStatus, ProgressionRule[]>> = {
  healthy: [
    { to: 'caries_initial', minMonths: 36, maxMonths: 84, baseProbPerYear: 0.06, cost: 80 },
  ],
  watch: [
    { to: 'caries_initial', minMonths: 12, maxMonths: 36, baseProbPerYear: 0.25, cost: 80 },
  ],
  caries_initial: [
    { to: 'caries_deep', minMonths: 12, maxMonths: 30, baseProbPerYear: 0.40, cost: 150 },
  ],
  caries_deep: [
    { to: 'endo', minMonths: 12, maxMonths: 36, baseProbPerYear: 0.55, cost: 380 },
  ],
  filling: [
    { to: 'caries_initial', minMonths: 96, maxMonths: 144, baseProbPerYear: 0.12, cost: 150 },
  ],
  crown: [
    { to: 'endo', minMonths: 120, maxMonths: 240, baseProbPerYear: 0.08, cost: 550 },
  ],
  endo: [
    { to: 'extracted', minMonths: 36, maxMonths: 84, baseProbPerYear: 0.10, cost: 120 },
  ],
  extracted: [
    { to: 'implant', minMonths: 0, maxMonths: 0, baseProbPerYear: 0, cost: 1400 }, // odporúčanie, nie progresia
  ],
};

// ─── Risk factor modifier ─────────────────────────────────────────────────────
function riskModifier(risk: RiskFactors): number {
  let mod = 1.0;
  if (risk.smoking)  mod *= 1.4;  // fajčenie urýchľuje
  if (risk.diabetes) mod *= 1.25;
  if (risk.bruxism)  mod *= 1.2;
  if (risk.hygiene >= 8) mod *= 0.65; // dobrá hygiena spomaľuje
  else if (risk.hygiene <= 3) mod *= 1.5;
  return mod;
}

// ─── Hlavný prediction engine ─────────────────────────────────────────────────
export function generatePredictions(
  currentTeeth: Record<number, ToothStatus>,
  risk: RiskFactors = { smoking: false, diabetes: false, bruxism: false, hygiene: 7 },
  horizonYears = 5,
): YearSnapshot[] {
  const mod = riskModifier(risk);
  const snapshots: YearSnapshot[] = [];

  // Rok 0 = dnešný stav
  let teeth: Record<number, ToothStatus> = { ...currentTeeth };
  snapshots.push({ year: 0, teeth: { ...teeth }, newIssues: [], totalCost: 0, cumulativeCost: 0 });

  let cumulative = 0;

  for (let y = 1; y <= horizonYears; y++) {
    const newIssues: ToothPrediction[] = [];
    const nextTeeth: Record<number, ToothStatus> = { ...teeth };

    for (const [toothStr, status] of Object.entries(teeth)) {
      const tooth = parseInt(toothStr);
      const rules = PROGRESSION_RULES[status as ToothStatus];
      if (!rules || status === 'extracted' || status === 'missing' || status === 'implant') continue;

      for (const rule of rules) {
        const adjProb = Math.min(rule.baseProbPerYear * mod, 0.95);
        const rand = deterministicRand(tooth, y, rule.to);

        if (rand < adjProb) {
          nextTeeth[tooth] = rule.to;
          newIssues.push({
            tooth,
            fromStatus: status as ToothStatus,
            toStatus:   rule.to,
            probability: adjProb,
            cost:        rule.cost,
          });
          break; // len jedna progresia za rok
        }
      }
    }

    const yearCost = newIssues.reduce((s, i) => s + i.cost, 0);
    cumulative += yearCost;
    teeth = nextTeeth;
    snapshots.push({ year: y, teeth: { ...teeth }, newIssues, totalCost: yearCost, cumulativeCost: cumulative });
  }

  return snapshots;
}

// Deterministický "random" — rovnaké výsledky pre rovnaké vstupy (reprodukovateľné)
function deterministicRand(tooth: number, year: number, status: string): number {
  const seed = tooth * 1000 + year * 100 + status.charCodeAt(0);
  return ((seed * 9301 + 49297) % 233280) / 233280;
}

// ─── Status config (farby + labely) ───────────────────────────────────────────
export const STATUS_CFG: Record<ToothStatus, {
  label: string;
  color: string;
  darkColor: string;
  glowColor: string | null;
  emoji: string;
  severity: number; // 0-5
}> = {
  healthy:        { label: 'Zdravý',          color: '#F0F8FF', darkColor: '#DDEEFF', glowColor: null,      emoji: '⚪', severity: 0 },
  watch:          { label: 'Sledovanie',       color: '#FFF8E1', darkColor: '#FFEEA0', glowColor: '#FFC107', emoji: '🟡', severity: 1 },
  caries_initial: { label: 'Počiatok kazu',   color: '#FFE082', darkColor: '#FFB300', glowColor: '#FF9800', emoji: '🟠', severity: 2 },
  caries_deep:    { label: 'Hlboký kaz',      color: '#FF8A65', darkColor: '#E64A19', glowColor: '#FF5722', emoji: '🔴', severity: 3 },
  filling:        { label: 'Plomba',           color: '#C8E6C9', darkColor: '#81C784', glowColor: null,      emoji: '🟢', severity: 1 },
  inlay:          { label: 'Inlay/Onlay',      color: '#B3E5FC', darkColor: '#4FC3F7', glowColor: null,      emoji: '🔵', severity: 1 },
  crown:          { label: 'Korunka',          color: '#FFF176', darkColor: '#F9A825', glowColor: '#FFD600', emoji: '🟡', severity: 1 },
  endo:           { label: 'Devitalizácia',    color: '#E1BEE7', darkColor: '#AB47BC', glowColor: '#9C27B0', emoji: '🟣', severity: 3 },
  implant:        { label: 'Implantát',        color: '#B3E5FC', darkColor: '#0288D1', glowColor: '#03A9F4', emoji: '🔵', severity: 0 },
  extracted:      { label: 'Extrahovaný',      color: '#CFD8DC', darkColor: '#546E7A', glowColor: null,      emoji: '⚫', severity: 4 },
  missing:        { label: 'Chýba',            color: '#ECEFF1', darkColor: '#B0BEC5', glowColor: null,      emoji: '⬜', severity: 2 },
};

// ─── FDI tooth names ─────────────────────────────────────────────────────────
export function toothName(fdi: number): string {
  const names: Record<number, string> = {
    11:'Centrálny rezák P',  12:'Laterálny rezák P',  13:'Špičák P',
    14:'Prvý preolár P',     15:'Druhý premolár P',    16:'Prvý molár P',
    17:'Druhý molár P',      18:'Múdrostný P',
    21:'Centrálny rezák Ľ',  22:'Laterálny rezák Ľ',  23:'Špičák Ľ',
    24:'Prvý premolár Ľ',    25:'Druhý premolár Ľ',    26:'Prvý molár Ľ',
    27:'Druhý molár Ľ',      28:'Múdrostný Ľ',
    31:'Centrálny rezák Ľ',  32:'Laterálny rezák Ľ',  33:'Špičák Ľ',
    34:'Prvý premolár Ľ',    35:'Druhý premolár Ľ',    36:'Prvý molár Ľ',
    37:'Druhý molár Ľ',      38:'Múdrostný Ľ',
    41:'Centrálny rezák P',  42:'Laterálny rezák P',  43:'Špičák P',
    44:'Prvý premolár P',    45:'Druhý premolár P',    46:'Prvý molár P',
    47:'Druhý molár P',      48:'Múdrostný P',
  };
  return names[fdi] ?? `Zub ${fdi}`;
}

// ─── Sumarizácia predikcie ────────────────────────────────────────────────────
export function getPredictionSummary(snapshots: YearSnapshot[]) {
  const present = snapshots[0];
  const last    = snapshots[snapshots.length - 1];
  const horizon = snapshots.length - 1;

  const issueCount = snapshots.slice(1).reduce((s, snap) => s + snap.newIssues.length, 0);
  const totalCost  = last.cumulativeCost;
  const savings    = totalCost - PREVENTION_COST * horizon;

  return { issueCount, totalCost, savings, horizon };
}
