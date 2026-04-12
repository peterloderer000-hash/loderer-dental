import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../supabase';
import { COLORS, SIZES } from '../../styles/theme';

// ─── Typy ─────────────────────────────────────────────────────────────────────
type ToothStatus = 'healthy' | 'cavity' | 'filled' | 'crown' | 'extracted' | 'missing' | 'root_canal';

type ToothRecord = {
  tooth_number: number;
  status: ToothStatus;
  notes: string | null;
};

type DoctorNote = {
  appointment_date: string;
  doctor_notes: string;
  service: { name: string } | null;
};

// ─── Konfigurácia statusov ────────────────────────────────────────────────────
const STATUS_CFG: Record<ToothStatus, {
  label: string; color: string; bg: string; dot: string; emoji: string;
}> = {
  healthy:    { label: 'Zdravý',        color: '#1E8449', bg: '#EAFAF1', dot: '#2ECC71', emoji: '✅' },
  filled:     { label: 'Plomba',        color: '#9A7D0A', bg: '#FEF9E7', dot: '#F4D03F', emoji: '🟡' },
  crown:      { label: 'Korunka',       color: '#1A5276', bg: '#EBF5FB', dot: '#3498DB', emoji: '👑' },
  cavity:     { label: 'Kaz',           color: '#922B21', bg: '#FDEDEC', dot: '#E74C3C', emoji: '🔴' },
  root_canal: { label: 'Devitalizácia', color: '#6C3483', bg: '#F5EEF8', dot: '#9B59B6', emoji: '🟣' },
  extracted:  { label: 'Extrahovaný',   color: '#566573', bg: '#F2F3F4', dot: '#7F8C8D', emoji: '⚫' },
  missing:    { label: 'Chýba',         color: '#99A3A4', bg: '#FDFEFE', dot: '#BFC9CA', emoji: '⬜' },
};

// ─── Dimenzie skóre ───────────────────────────────────────────────────────────
type DimKey = 'health' | 'aesthetics' | 'hygiene' | 'prevention';

const DIMENSIONS: {
  key: DimKey; label: string; emoji: string;
  color: string; bg: string; weight: number;
  describe: (s: number) => string;
  tip: string;
}[] = [
  {
    key: 'health', label: 'Zdravie zubov', emoji: '🏥', weight: 0.40,
    color: '#1E8449', bg: '#EAFAF1',
    describe: (s) => s >= 85 ? 'Výborný stav chrupu' : s >= 70 ? 'Dobrý stav' : s >= 50 ? 'Vyžaduje pozornosť' : 'Kritický stav',
    tip: 'Kazy a chýbajúce zuby znižujú skóre. Stoličky majú vyššiu váhu ako rezáky.',
  },
  {
    key: 'aesthetics', label: 'Estetika', emoji: '😁', weight: 0.25,
    color: '#1A5276', bg: '#EBF5FB',
    describe: (s) => s >= 85 ? 'Krásny úsmev' : s >= 70 ? 'Dobrý vzhľad' : s >= 50 ? 'Viditeľné problémy' : 'Výrazné estetické problémy',
    tip: 'Hodnotí predné zuby (rezáky, špičáky). Chýbajúci predný zub výrazne znižuje skóre.',
  },
  {
    key: 'hygiene', label: 'Hygiena', emoji: '🪥', weight: 0.20,
    color: '#148F77', bg: '#E8F8F5',
    describe: (s) => s >= 85 ? 'Výborná hygiena' : s >= 70 ? 'Priemerná hygiena' : s >= 50 ? 'Slabá hygiena' : 'Zanedbané čistenie',
    tip: 'Kazy sú indikátorom hygieny. Čím viac zdravých zubov, tým vyššie skóre.',
  },
  {
    key: 'prevention', label: 'Preventíva', emoji: '📅', weight: 0.15,
    color: '#7D6608', bg: '#FEF9E7',
    describe: (s) => s >= 80 ? 'Vzorný pacient' : s >= 60 ? 'Aktívny pacient' : s >= 35 ? 'Nepravidelné návštevy' : 'Žiadna preventíva',
    tip: 'Vyplnený dotazník, naplánovaný termín a pravidelné návštevy zvyšujú skóre.',
  },
];

// ─── Pomocné funkcie ──────────────────────────────────────────────────────────
/** Váha zuba podľa pozície (1–8 v rámci kvadrantu) */
function getWeight(toothNum: number): number {
  const pos = toothNum % 10;
  if (pos === 6 || pos === 7) return 3.0;
  if (pos === 4 || pos === 5) return 2.0;
  if (pos === 3)              return 1.5;
  if (pos === 1 || pos === 2) return 1.0;
  if (pos === 8)              return 0.5;
  return 1.0;
}

/** Je zub predný (viditeľný) — pozície 1, 2, 3 */
function isFront(toothNum: number): boolean {
  const pos = toothNum % 10;
  return pos >= 1 && pos <= 3;
}

/** Slovenský názov zuba */
function getToothName(num: number): string {
  const q   = Math.floor(num / 10);
  const pos = num % 10;
  const qN = ['', 'Horný pravý', 'Horný ľavý', 'Dolný ľavý', 'Dolný pravý'];
  const pN = ['', 'centrálny rezák', 'postranný rezák', 'špičák',
    'prvá predstoličky', 'druhá predstoličky', 'prvá stolička',
    'druhá stolička', 'zub múdrosti'];
  return `${qN[q] ?? ''} ${pN[pos] ?? ''}`.trim();
}

/** Odporúčanie pre daný stav */
function getRecommendation(status: ToothStatus): string {
  switch (status) {
    case 'cavity':     return 'Odporúčame ošetrenie — plomba alebo iná rekonštrukcia.';
    case 'root_canal': return 'Devitalizovaný zub — zvážte korunkovú nadstavbu.';
    case 'extracted':  return 'Chýbajúci zub — zvážte implantát alebo mostík.';
    case 'missing':    return 'Zub chýba — konzultujte s doktorom.';
    default:           return '';
  }
}

// ─── Výpočty dimenzií ─────────────────────────────────────────────────────────

/** 🏥 Zdravie — štrukturálna integrita všetkých zubov */
function calcHealth(teeth: ToothRecord[]): number {
  if (teeth.length === 0) return 70;
  const DED: Partial<Record<ToothStatus, number>> = {
    cavity: 15, root_canal: 10, extracted: 14, missing: 10,
  };
  let deduction = 0;
  let healthyCount = 0;
  teeth.forEach((t) => {
    deduction += (DED[t.status] ?? 0) * getWeight(t.tooth_number);
    if (t.status === 'healthy') healthyCount++;
  });
  const bonus = Math.min(15, healthyCount * 0.8);
  return Math.max(0, Math.min(100, Math.round(100 - deduction + bonus)));
}

/** 😁 Estetika — stav predných viditeľných zubov (pozície 1–3) */
function calcAesthetics(teeth: ToothRecord[]): number {
  const front = teeth.filter((t) => isFront(t.tooth_number));
  if (front.length === 0) return 75; // žiadne dáta o predných zuboch
  const DED: Partial<Record<ToothStatus, number>> = {
    cavity: 18, extracted: 22, missing: 20, root_canal: 12,
    filled: 4, crown: 3,
  };
  let score = 100;
  let healthyBonus = 0;
  front.forEach((t) => {
    score -= DED[t.status] ?? 0;
    if (t.status === 'healthy') healthyBonus++;
  });
  score += Math.min(8, healthyBonus * 1.5);
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** 🪥 Hygiena — pomer zdravých zubov + kazy ako indikátor hygieny */
function calcHygiene(teeth: ToothRecord[], hasPassport: boolean, completedCount: number): number {
  let base: number;
  if (teeth.length === 0) {
    base = 55;
  } else {
    const total         = teeth.length;
    const healthyCount  = teeth.filter((t) => t.status === 'healthy').length;
    const cavityCount   = teeth.filter((t) => t.status === 'cavity' || t.status === 'root_canal').length;
    const healthyRatio  = healthyCount / total;
    const problemRatio  = cavityCount / total;
    base = Math.round(60 + healthyRatio * 30 - problemRatio * 40);
  }
  if (hasPassport)       base += 5;
  if (completedCount > 0) base += Math.min(10, completedCount * 3);
  return Math.max(0, Math.min(100, base));
}

/** 📅 Preventíva — aktívna starostlivosť o chrup */
function calcPrevention(
  hasPassport: boolean,
  hasAppointment: boolean,
  completedCount: number,
  hasChartData: boolean,
): number {
  let score = 0;
  if (hasChartData)     score += 25; // doktor vyplnil kartu
  if (hasPassport)      score += 25; // vyplnený zdravotný dotazník
  if (hasAppointment)   score += 25; // naplánovaný termín
  score += Math.min(25, completedCount * 8); // absolvované návštevy
  return Math.min(100, score);
}

/** Celkové vážené skóre */
function calcOverall(scores: Record<DimKey, number>): number {
  return Math.round(
    DIMENSIONS.reduce((acc, d) => acc + scores[d.key] * d.weight, 0)
  );
}

// ─── Zubná mapa (FDI) ─────────────────────────────────────────────────────────
const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT  = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];
const LOWER_LEFT  = [31, 32, 33, 34, 35, 36, 37, 38];

function ToothDot({ num, chart }: { num: number; chart: Record<number, ToothRecord> }) {
  const rec   = chart[num];
  const color = rec ? STATUS_CFG[rec.status].dot : '#D5D8DC';
  const isBad = rec && ['cavity', 'root_canal', 'extracted', 'missing'].includes(rec.status);
  return (
    <View style={[
      styles.toothDot,
      { backgroundColor: color },
      isFront(num) && styles.toothDotFront,
      isBad && { borderColor: color, borderWidth: 1.5 },
    ]}>
      {isBad && <View style={styles.toothDotInner} />}
    </View>
  );
}

function DentalMap({ chart }: { chart: Record<number, ToothRecord> }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>ZUBNÁ MAPA</Text>
      <Text style={styles.jawLabel}>▲ Horná čeľusť</Text>
      <View style={styles.jawRow}>
        <View style={styles.halfRow}>{UPPER_RIGHT.map((n) => <ToothDot key={n} num={n} chart={chart} />)}</View>
        <View style={styles.midLine} />
        <View style={styles.halfRow}>{UPPER_LEFT.map((n) => <ToothDot key={n} num={n} chart={chart} />)}</View>
      </View>
      <View style={styles.jawRow}>
        <View style={styles.halfRow}>{LOWER_RIGHT.map((n) => <ToothDot key={n} num={n} chart={chart} />)}</View>
        <View style={styles.midLine} />
        <View style={styles.halfRow}>{LOWER_LEFT.map((n) => <ToothDot key={n} num={n} chart={chart} />)}</View>
      </View>
      <Text style={styles.jawLabel}>▼ Dolná čeľusť</Text>
      <View style={styles.mapLegend}>
        {(['healthy', 'cavity', 'filled', 'crown', 'root_canal', 'extracted'] as ToothStatus[]).map((s) => (
          <View key={s} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: STATUS_CFG[s].dot }]} />
            <Text style={styles.legendText}>{STATUS_CFG[s].label}</Text>
          </View>
        ))}
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#D5D8DC', borderWidth: 1, borderColor: COLORS.bg3 }]} />
          <Text style={styles.legendText}>Predné zuby</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Dimenzionálna karta ──────────────────────────────────────────────────────
function DimCard({ dim, score }: { dim: typeof DIMENSIONS[0]; score: number }) {
  const pct   = score / 100;
  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D';
  const gradeColor = score >= 85 ? '#1E8449' : score >= 70 ? '#9A7D0A' : score >= 50 ? '#E67E22' : '#922B21';
  return (
    <View style={[styles.dimCard, { borderLeftColor: dim.color }]}>
      {/* Hlavička */}
      <View style={styles.dimHeader}>
        <View style={[styles.dimEmojiBox, { backgroundColor: dim.bg }]}>
          <Text style={styles.dimEmoji}>{dim.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.dimLabel}>{dim.label}</Text>
          <Text style={[styles.dimDesc, { color: dim.color }]}>{dim.describe(score)}</Text>
        </View>
        <View style={styles.dimScoreBox}>
          <Text style={[styles.dimScore, { color: gradeColor }]}>{score}</Text>
          <Text style={styles.dimScoreMax}>/100</Text>
        </View>
        <View style={[styles.gradeBox, { backgroundColor: gradeColor }]}>
          <Text style={styles.gradeText}>{grade}</Text>
        </View>
      </View>
      {/* Progress bar */}
      <View style={styles.dimTrack}>
        <View style={[styles.dimFill, { width: `${pct * 100}%`, backgroundColor: dim.color }]} />
        {/* Marker kvality */}
        {[25, 50, 75].map((m) => (
          <View key={m} style={[styles.dimMarker, { left: `${m}%` as any }]} />
        ))}
      </View>
      <View style={styles.dimScaleRow}>
        <Text style={styles.dimScaleTxt}>Slabý</Text>
        <Text style={styles.dimScaleTxt}>Priemerný</Text>
        <Text style={styles.dimScaleTxt}>Dobrý</Text>
        <Text style={styles.dimScaleTxt}>Výborný</Text>
      </View>
    </View>
  );
}

// ─── Celkové skóre kruh ───────────────────────────────────────────────────────
function ScoreCircle({ score, hasData }: { score: number; hasData: boolean }) {
  const color = score >= 80 ? '#1E8449' : score >= 65 ? '#9A7D0A' : score >= 45 ? '#E67E22' : '#922B21';
  const label = score >= 80 ? 'Výborný' : score >= 65 ? 'Dobrý' : score >= 45 ? 'Priemerný' : 'Slabý';
  return (
    <View style={styles.circleSection}>
      <View style={[styles.circleWrap, { borderColor: color }]}>
        <Text style={[styles.scoreNum, { color }]}>{score}</Text>
        <Text style={[styles.scoreMax, { color }]}>/100</Text>
        <Text style={[styles.scoreLabel, { color }]}>{label}</Text>
      </View>
      {!hasData && (
        <Text style={styles.noDataNote}>
          Skóre bude presnejšie po tom, čo doktor vyplní vašu zubnú kartu.
        </Text>
      )}
      {hasData && (
        <View style={styles.weightRow}>
          {DIMENSIONS.map((d) => (
            <View key={d.key} style={styles.weightChip}>
              <Text style={styles.weightEmoji}>{d.emoji}</Text>
              <Text style={styles.weightPct}>{Math.round(d.weight * 100)}%</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Hlavná obrazovka ─────────────────────────────────────────────────────────
export default function ScoreScreen() {
  const [chart,           setChart]           = useState<Record<number, ToothRecord>>({});
  const [hasPassport,     setHasPassport]     = useState(false);
  const [hasAppointment,  setHasAppointment]  = useState(false);
  const [completedCount,  setCompletedCount]  = useState(0);
  const [doctorNotes,     setDoctorNotes]     = useState<DoctorNote[]>([]);
  const [loading,         setLoading]         = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) { if (!cancelled) setLoading(false); return; }

      // Zubná karta
      const { data: teeth } = await supabase
        .from('dental_charts').select('tooth_number, status, notes').eq('patient_id', user.id);
      if (!cancelled && teeth) {
        const map: Record<number, ToothRecord> = {};
        teeth.forEach((t) => { map[t.tooth_number] = t as ToothRecord; });
        setChart(map);
      }

      // Zdravotný pas
      const { data: pp } = await supabase
        .from('health_passports').select('patient_id').eq('patient_id', user.id).maybeSingle();
      if (!cancelled) setHasPassport(!!pp);

      // Naplánované termíny
      const { data: scheduled } = await supabase
        .from('appointments').select('id').eq('patient_id', user.id).eq('status', 'scheduled').limit(1);
      if (!cancelled) setHasAppointment((scheduled?.length ?? 0) > 0);

      // Počet dokončených termínov
      const { count } = await supabase
        .from('appointments').select('id', { count: 'exact', head: true })
        .eq('patient_id', user.id).eq('status', 'completed');
      if (!cancelled) setCompletedCount(count ?? 0);

      // Doktorove poznámky
      const { data: notes } = await supabase
        .from('appointments')
        .select('appointment_date, doctor_notes, service:service_id(name)')
        .eq('patient_id', user.id).eq('status', 'completed')
        .not('doctor_notes', 'is', null)
        .order('appointment_date', { ascending: false }).limit(3);
      if (!cancelled && notes) setDoctorNotes((notes as any[]).filter((n) => n.doctor_notes));

      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // ── Výpočty ───────────────────────────────────────────────────────────────
  const { dimScores, overall, problemTeeth, stats } = useMemo(() => {
    const records = Object.values(chart);
    const hasData = records.length > 0;

    // Štatistiky
    const st: Partial<Record<ToothStatus, number>> = {};
    records.forEach((r) => { st[r.status] = (st[r.status] ?? 0) + 1; });

    // Dimenzionálne skóre
    const scores: Record<DimKey, number> = {
      health:     calcHealth(records),
      aesthetics: calcAesthetics(records),
      hygiene:    calcHygiene(records, hasPassport, completedCount),
      prevention: calcPrevention(hasPassport, hasAppointment, completedCount, hasData),
    };

    // Celkové skóre
    const ov = hasData
      ? calcOverall(scores)
      : Math.round(
          scores.health * 0.40 + scores.aesthetics * 0.25 +
          scores.hygiene * 0.20 + scores.prevention * 0.15
        );

    // Problematické zuby (zoradené podľa váhy)
    const problems = records
      .filter((r) => ['cavity', 'root_canal', 'extracted', 'missing'].includes(r.status))
      .map((r) => ({
        ...r,
        name: getToothName(r.tooth_number),
        weight: getWeight(r.tooth_number),
        rec: r.notes ? r.notes : getRecommendation(r.status),
        isFrontTooth: isFront(r.tooth_number),
      }))
      .sort((a, b) => b.weight - a.weight || b.tooth_number - a.tooth_number);

    return { dimScores: scores, overall: ov, problemTeeth: problems, stats: st };
  }, [chart, hasPassport, hasAppointment, completedCount]);

  const hasChartData = Object.keys(chart).length > 0;

  // ── Odznaky ──────────────────────────────────────────────────────────────
  const badges = useMemo(() => {
    const list: { emoji: string; title: string; sub: string; color: string }[] = [];
    if (hasPassport)    list.push({ emoji: '📋', title: 'Dotazník vyplnený',   sub: 'Zdravotná anamnéza kompletná',     color: '#1E8449' });
    if (hasAppointment) list.push({ emoji: '📅', title: 'Termín naplánovaný', sub: 'Máš nadchádzajúcu návštevu',       color: '#1A5276' });
    if (hasChartData && !stats.cavity && !stats.root_canal)
      list.push({ emoji: '🌟', title: 'Čistý chrup',     sub: 'Žiadne kazy ani devitalizácie',  color: '#9A7D0A' });
    if (hasChartData)   list.push({ emoji: '🦷', title: 'Karta vyplnená',     sub: 'Doktor zaznamenal tvoj chrup',    color: '#6C3483' });
    if (completedCount >= 3) list.push({ emoji: '🏅', title: 'Verný pacient', sub: `${completedCount} absolvovaných návštev`,    color: '#D4A017' });
    if (overall >= 85)  list.push({ emoji: '🏆', title: 'Skóre 85+',          sub: 'Výnimočná starostlivosť o chrup!', color: '#D4A017' });
    return list;
  }, [hasPassport, hasAppointment, hasChartData, stats, completedCount, overall]);

  // ── Dynamické tipy ────────────────────────────────────────────────────────
  const tips = useMemo(() => {
    const t: { emoji: string; tip: string }[] = [];
    if (stats.cavity)     t.push({ emoji: '🔴', tip: `${stats.cavity} zub${stats.cavity === 1 ? '' : 'y'} s kazom — navštívte zubára čo najskôr.` });
    if (stats.root_canal) t.push({ emoji: '🟣', tip: `${stats.root_canal} devitalizovaný zub — zvážte korunkovú ochranu.` });
    if (stats.extracted)  t.push({ emoji: '⚫', tip: `${stats.extracted} extrahovaný zub — zvážte implantologické riešenie.` });
    if (dimScores.aesthetics < 70) t.push({ emoji: '😁', tip: 'Problémy na predných zuboch ovplyvňujú estetiku. Konzultujte s doktorom.' });
    if (dimScores.prevention < 50) t.push({ emoji: '📅', tip: 'Naplánujte si termín a vyplňte zdravotný dotazník pre vyššie preventívne skóre.' });
    t.push({ emoji: '🪥', tip: 'Čisť zuby 2× denne aspoň 2 minúty s fluóridovou pastou.' });
    t.push({ emoji: '🧵', tip: 'Zubná niť odstraňuje plak medzi zubami — používaj ju denne.' });
    t.push({ emoji: '📅', tip: 'Preventívna prehliadka každých 6 mesiacov predchádza komplikáciám.' });
    return t.slice(0, 5);
  }, [stats, dimScores]);

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={COLORS.wal} size="large" /></View>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Hlavička ── */}
      <View style={styles.header}>
        <Text style={styles.headerSub}>TVOJE</Text>
        <Text style={styles.headerTitle}>Dentálne skóre</Text>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}>

        {/* ── Celkové skóre ── */}
        <ScoreCircle score={overall} hasData={hasChartData} />

        {/* ── 4 dimenzie ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>HODNOTENIE PODĽA DIMENZIÍ</Text>
          {DIMENSIONS.map((d) => (
            <DimCard key={d.key} dim={d} score={dimScores[d.key]} />
          ))}
        </View>

        {/* ── Metodika ── */}
        <View style={styles.methodCard}>
          <Text style={styles.methodTitle}>💡 Ako sa skóre počíta?</Text>
          {DIMENSIONS.map((d) => (
            <View key={d.key} style={styles.methodRow}>
              <Text style={styles.methodEmoji}>{d.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.methodLabel}>{d.label} <Text style={{ color: d.color, fontWeight: '700' }}>({Math.round(d.weight * 100)}%)</Text></Text>
                <Text style={styles.methodTip}>{d.tip}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── Zubná mapa ── */}
        {hasChartData && <DentalMap chart={chart} />}

        {/* ── Problematické zuby ── */}
        {problemTeeth.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>PROBLEMATICKÉ ZUBY</Text>
            {problemTeeth.map((t) => {
              const cfg = STATUS_CFG[t.status];
              return (
                <View key={t.tooth_number} style={[styles.problemRow, { borderLeftColor: cfg.color }]}>
                  <View style={styles.problemLeft}>
                    <Text style={styles.problemNum}>Zub {t.tooth_number}</Text>
                    <Text style={styles.problemName}>{t.name}</Text>
                    {t.isFrontTooth && (
                      <Text style={styles.frontBadge}>Predný</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                      <Text style={styles.problemEmoji}>{cfg.emoji}</Text>
                      <Text style={[styles.problemStatus, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                    {t.rec ? <Text style={styles.problemRec}>{t.rec}</Text> : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Rozklad štatistík ── */}
        {hasChartData && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>ROZKLAD CHRUPU</Text>
            <View style={styles.statsGrid}>
              {(Object.keys(STATUS_CFG) as ToothStatus[]).map((key) => {
                const count = stats[key] ?? 0;
                if (!count) return null;
                const s = STATUS_CFG[key];
                return (
                  <View key={key} style={[styles.statItem, { backgroundColor: s.bg, borderColor: s.color }]}>
                    <Text style={styles.statEmoji}>{s.emoji}</Text>
                    <Text style={[styles.statCount, { color: s.color }]}>{count}</Text>
                    <Text style={[styles.statLabel, { color: s.color }]}>{s.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ── Poznámky od doktora ── */}
        {doctorNotes.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>ZÁZNAMY OD DOKTORA</Text>
            {doctorNotes.map((n, i) => (
              <View key={i} style={styles.noteRow}>
                <View style={styles.noteIcon}>
                  <Ionicons name="document-text" size={16} color={COLORS.wal} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.noteService}>
                    {n.service?.name ?? 'Návšteva'} · {new Date(n.appointment_date).toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </Text>
                  <Text style={styles.noteText}>{n.doctor_notes}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Odznaky ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>ODZNAKY</Text>
          {badges.length === 0 ? (
            <Text style={styles.noBadges}>Zatiaľ žiadne odznaky. Vyplň dotazník a rezervuj termín!</Text>
          ) : (
            <View style={styles.badgesGrid}>
              {badges.map((b, i) => (
                <View key={i} style={[styles.badge, { borderColor: b.color }]}>
                  <Text style={styles.badgeEmoji}>{b.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.badgeTitle, { color: b.color }]}>{b.title}</Text>
                    <Text style={styles.badgeSub}>{b.sub}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Tipy ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>ODPORÚČANIA</Text>
          {tips.map((t, i) => (
            <View key={i} style={styles.tipRow}>
              <Text style={styles.tipEmoji}>{t.emoji}</Text>
              <Text style={styles.tipText}>{t.tip}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: COLORS.esp },
  scroll:  { flex: 1, backgroundColor: COLORS.bg2 },
  content: { padding: SIZES.padding, paddingTop: 10 },
  center:  { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center' },

  header:      { backgroundColor: COLORS.esp, paddingHorizontal: SIZES.padding, paddingTop: 18, paddingBottom: 20 },
  headerSub:   { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 3 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },

  // Celkové skóre
  circleSection: { alignItems: 'center', paddingVertical: 24 },
  circleWrap:    { width: 160, height: 160, borderRadius: 80, borderWidth: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', marginBottom: 12 },
  scoreNum:      { fontSize: 52, fontWeight: '800', lineHeight: 58 },
  scoreMax:      { fontSize: 14, fontWeight: '600', marginTop: -4 },
  scoreLabel:    { fontSize: 13, fontWeight: '700', marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 },
  noDataNote:    { fontSize: 11, color: COLORS.wal, textAlign: 'center', paddingHorizontal: 30, fontStyle: 'italic', marginTop: 8 },
  weightRow:     { flexDirection: 'row', gap: 8, marginTop: 10 },
  weightChip:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: COLORS.bg3 },
  weightEmoji:   { fontSize: 13 },
  weightPct:     { fontSize: 10, fontWeight: '700', color: COLORS.esp },

  // Karta
  card:      { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: COLORS.bg3 },
  cardTitle: { fontSize: 9, letterSpacing: 2, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 14 },

  // Dimenzionálna karta
  dimCard:      { marginBottom: 14, paddingLeft: 10, borderLeftWidth: 3, borderRadius: 2 },
  dimHeader:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  dimEmojiBox:  { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dimEmoji:     { fontSize: 20 },
  dimLabel:     { fontSize: 13, fontWeight: '700', color: COLORS.esp, marginBottom: 1 },
  dimDesc:      { fontSize: 10, fontWeight: '600' },
  dimScoreBox:  { alignItems: 'flex-end' },
  dimScore:     { fontSize: 24, fontWeight: '800', lineHeight: 26 },
  dimScoreMax:  { fontSize: 9, color: COLORS.wal, fontWeight: '500' },
  gradeBox:     { width: 26, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  gradeText:    { fontSize: 12, fontWeight: '800', color: '#fff' },
  dimTrack:     { height: 10, backgroundColor: COLORS.bg3, borderRadius: 5, overflow: 'visible', position: 'relative', marginBottom: 4 },
  dimFill:      { height: 10, borderRadius: 5, position: 'absolute', top: 0, left: 0 },
  dimMarker:    { position: 'absolute', top: -2, width: 1, height: 14, backgroundColor: 'rgba(0,0,0,0.12)' },
  dimScaleRow:  { flexDirection: 'row', justifyContent: 'space-between' },
  dimScaleTxt:  { fontSize: 8, color: '#bbb', fontWeight: '500' },

  // Metodika
  methodCard:  { backgroundColor: COLORS.esp, borderRadius: 14, padding: 14, marginBottom: 14 },
  methodTitle: { fontSize: 12, fontWeight: '700', color: '#fff', marginBottom: 12 },
  methodRow:   { flexDirection: 'row', gap: 10, marginBottom: 10, alignItems: 'flex-start' },
  methodEmoji: { fontSize: 18, width: 26, textAlign: 'center', marginTop: 1 },
  methodLabel: { fontSize: 12, color: COLORS.cream, fontWeight: '600', marginBottom: 2 },
  methodTip:   { fontSize: 11, color: COLORS.sand, lineHeight: 15 },

  // Zubná mapa
  jawLabel:  { fontSize: 9, color: COLORS.wal, fontWeight: '600', textAlign: 'center', marginVertical: 4, letterSpacing: 1 },
  jawRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 3 },
  halfRow:   { flexDirection: 'row', gap: 3 },
  midLine:   { width: 1, height: 14, backgroundColor: COLORS.bg3, marginHorizontal: 4 },
  toothDot:      { width: 14, height: 14, borderRadius: 7, backgroundColor: '#D5D8DC', alignItems: 'center', justifyContent: 'center' },
  toothDotFront: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: COLORS.sand },
  toothDotInner: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(255,255,255,0.6)' },
  mapLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12, justifyContent: 'center' },
  legendItem:{ flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText:{ fontSize: 9, color: COLORS.wal, fontWeight: '500' },

  // Problematické zuby
  problemRow:   { flexDirection: 'row', gap: 10, marginBottom: 10, paddingLeft: 10, borderLeftWidth: 3, borderRadius: 2 },
  problemLeft:  { width: 76 },
  problemNum:   { fontSize: 13, fontWeight: '700', color: COLORS.esp },
  problemName:  { fontSize: 9, color: COLORS.wal, marginTop: 1, lineHeight: 12 },
  frontBadge:   { fontSize: 8, fontWeight: '700', color: '#1A5276', backgroundColor: '#EBF5FB', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, alignSelf: 'flex-start', marginTop: 3 },
  statusBadge:  { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 4 },
  problemEmoji: { fontSize: 10 },
  problemStatus:{ fontSize: 10, fontWeight: '700' },
  problemRec:   { fontSize: 11, color: COLORS.wal, lineHeight: 15 },

  // Štatistiky
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statItem:  { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', minWidth: 78 },
  statEmoji: { fontSize: 16, marginBottom: 2 },
  statCount: { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  statLabel: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2 },

  // Poznámky doktora
  noteRow:     { flexDirection: 'row', gap: 10, marginBottom: 10, padding: 10, backgroundColor: COLORS.bg2, borderRadius: 10 },
  noteIcon:    { width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.bg3, alignItems: 'center', justifyContent: 'center' },
  noteService: { fontSize: 10, color: COLORS.wal, fontWeight: '600', marginBottom: 3, textTransform: 'capitalize' },
  noteText:    { fontSize: 12, color: COLORS.esp, lineHeight: 17, fontStyle: 'italic' },

  // Odznaky
  noBadges:   { fontSize: 12, color: COLORS.wal, fontStyle: 'italic' },
  badgesGrid: { gap: 8 },
  badge:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 10, borderWidth: 1.5, padding: 12, backgroundColor: COLORS.bg2 },
  badgeEmoji: { fontSize: 26 },
  badgeTitle: { fontSize: 13, fontWeight: '700' },
  badgeSub:   { fontSize: 11, color: COLORS.wal, marginTop: 1 },

  // Tipy
  tipRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  tipEmoji: { fontSize: 18, width: 24, textAlign: 'center' },
  tipText:  { flex: 1, fontSize: 13, color: COLORS.esp, lineHeight: 19 },
});
