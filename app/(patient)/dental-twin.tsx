/**
 * Dental Score™ — skóre chrupu ako kreditná karta
 * REDESIGN V2 — interaktívny zubný oblúk, insights, premium UX
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ActivityIndicator, Dimensions, Modal,
  RefreshControl, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, LinearGradient as SvgGrad, Stop } from 'react-native-svg';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabase';
import { useAppTheme } from '../../context/ThemeContext';
import {
  generatePredictions, ToothStatus, STATUS_CFG,
  toothName, PREVENTION_COST, RiskFactors,
} from '../../utils/dentalPrediction';

const { width: W } = Dimensions.get('window');

// ─── Uloženie snapshotov do dental_snapshots ────────────────────────────────
async function saveSnapshotsToDb(
  userId: string,
  snaps: ReturnType<typeof generatePredictions>,
  riskFactors: RiskFactors,
) {
  const today = new Date().toISOString().slice(0, 10);
  await supabase.from('dental_snapshots')
    .delete()
    .eq('patient_id', userId)
    .eq('snapshot_date', today)
    .eq('snapshot_type', 'predicted');

  const rows = snaps.map((snap, i) => ({
    patient_id:              userId,
    snapshot_date:           today,
    snapshot_type:           i === 0 ? 'real' : 'predicted',
    prediction_year_offset:  i === 0 ? null : i,
    tooth_states:            snap.teeth,
    new_issues:              snap.newIssues,
    estimated_cost:          snap.cumulativeCost,
    prevention_cost:         PREVENTION_COST * i,
    risk_factors:            riskFactors,
  }));

  await supabase.from('dental_snapshots').upsert(
    rows.filter(r => r.snapshot_type === 'real'),
    { onConflict: 'patient_id,snapshot_date,snapshot_type' },
  );
  await supabase.from('dental_snapshots').insert(
    rows.filter(r => r.snapshot_type === 'predicted'),
  );
}

// ─── FDI zuby ─────────────────────────────────────────────────────────────────
const ALL_FDI = [
  11,12,13,14,15,16,17,18,
  21,22,23,24,25,26,27,28,
  31,32,33,34,35,36,37,38,
  41,42,43,44,45,46,47,48,
];

// Horný oblúk: od 18 (pravá múdrostná) cez stred po 28 (ľavá múdrostná)
const UPPER_ARCH = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
// Dolný oblúk: od 48 cez stred po 38
const LOWER_ARCH = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];

// ─── Score výpočet ────────────────────────────────────────────────────────────
const PENALTY: Partial<Record<ToothStatus, number>> = {
  watch: 2, caries_initial: 5, caries_deep: 11, endo: 8,
  extracted: 13, missing: 6, filling: 1, crown: 2, inlay: 1, implant: 1,
};

function calcScore(teeth: Record<number, ToothStatus>): number {
  let d = 0;
  for (const st of Object.values(teeth)) d += PENALTY[st] ?? 0;
  return Math.max(0, Math.min(100, 100 - d));
}

function scoreInfo(score: number) {
  if (score >= 85) return { label: 'Výborný',  emoji: '🌟', color: '#52C896', ring: '#52C896', bg: '#1A3D2E', gradient: ['#1A4D2E', '#1A3D2E'] as string[] };
  if (score >= 70) return { label: 'Dobrý',    emoji: '👍', color: '#2E86C1', ring: '#1A5276', bg: '#0D2233', gradient: ['#143A5C', '#0D2233'] as string[] };
  if (score >= 50) return { label: 'Pozor',    emoji: '⚠️', color: '#B87333', ring: '#B8ACA0', bg: '#2D1500', gradient: ['#3D2000', '#2D1500'] as string[] };
  return                  { label: 'Kritický', emoji: '🚨', color: '#C0392B', ring: '#FF5252', bg: '#4A1010', gradient: ['#5A1515', '#4A1010'] as string[] };
}

// ─── Status farby a konfig pre zuby ─────────────────────────────────────────
type StatusVisual = { color: string; bg: string; icon: string; label: string };

const STATUS_VISUALS: Record<string, StatusVisual> = {
  healthy:        { color: '#52C896', bg: '#1A3D2E', icon: 'checkmark',         label: 'Zdravý' },
  watch:          { color: '#B8ACA0', bg: '#2D1500', icon: 'eye-outline',       label: 'Sledovanie' },
  caries_initial: { color: '#B87333', bg: '#3D2000', icon: 'alert-outline',     label: 'Počiatočný kaz' },
  caries_deep:    { color: '#C0392B', bg: '#4A1010', icon: 'alert-circle',      label: 'Hlboký kaz' },
  filling:        { color: '#3A4256', bg: '#2D2000', icon: 'shield-checkmark',  label: 'Plomba' },
  inlay:          { color: '#3A4256', bg: '#2D2000', icon: 'diamond-outline',   label: 'Inlay' },
  crown:          { color: '#2D3544', bg: '#2D1A00', icon: 'ribbon-outline',    label: 'Korunka' },
  endo:           { color: '#C0392B', bg: '#4A1010', icon: 'medical-outline',   label: 'Endodoncia' },
  implant:        { color: '#9B59B6', bg: '#2A1236', icon: 'hardware-chip',     label: 'Implantát' },
  extracted:      { color: '#B8ACA0', bg: '#1A1F20', icon: 'close-circle',      label: 'Extrahovaný' },
  missing:        { color: '#B8ACA0', bg: '#1A1C1D', icon: 'remove-outline',   label: 'Chýbajúci' },
};

function getToothVisual(status: ToothStatus): StatusVisual {
  return STATUS_VISUALS[status] ?? STATUS_VISUALS.healthy;
}

// ─── Consent Modal ───────────────────────────────────────────────────────────
function ConsentModal({ visible, onAccept }: { visible: boolean; onAccept: () => void }) {
  const { colors, dark } = useAppTheme();
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={cs.overlay}>
        <View style={[cs.card, { backgroundColor: colors.cardBg }]}>
          <View style={cs.iconWrap}>
            <View style={cs.iconCircle}>
              <Text style={{ fontSize: 36 }}>🦷</Text>
            </View>
          </View>
          <Text style={[cs.title, { color: colors.textPrimary }]}>Dental Score™</Text>
          <Text style={[cs.subtitle, { color: '#3A4256' }]}>Digitálny dvojník tvojho chrupu</Text>

          <View style={[cs.infoBox, { backgroundColor: dark ? '#1A1209' : '#EAECEE', borderColor: colors.bg3 }]}>
            <Text style={[cs.infoText, { color: colors.textPrimary }]}>
              Dental Score™ ti ukáže aktuálny stav chrupu, 5-ročnú predikciu vývoja a cenové porovnanie prevencie vs. neskoršieho ošetrenia.
            </Text>
          </View>

          <View style={[cs.warningBox, { backgroundColor: dark ? '#2D1500' : '#FDF3E7', borderColor: dark ? '#7D4800' : '#D0D4DC' }]}>
            <Ionicons name="warning-outline" size={16} color={dark ? '#F0A030' : '#B87333'} />
            <Text style={[cs.warningText, { color: dark ? '#F0A030' : '#7D4800' }]}>
              Predikcia je orientačná, založená na klinických štatistikách a tvojich rizikových faktoroch. Nenahrádza odbornú diagnostiku.
            </Text>
          </View>

          <View style={[cs.noteBox, { borderColor: colors.bg3 }]}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
            <Text style={[cs.noteText, { color: colors.textSecondary }]}>
              Presné predikcie sa aktivujú po prvej návšteve v klinike, keď doktor zadá stav tvojich zubov.
            </Text>
          </View>

          <TouchableOpacity style={cs.btn} onPress={onAccept} activeOpacity={0.88}>
            <LinearGradient colors={['#2D3544', '#3A4256']} style={cs.btnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Text style={cs.btnTxt}>Rozumiem, zobraziť skóre</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const cs = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:        { borderRadius: 24, padding: 24, width: '100%', maxWidth: 400 },
  iconWrap:    { alignItems: 'center', marginBottom: 16 },
  iconCircle:  { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(201,168,76,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(201,168,76,0.15)' },
  title:       { fontSize: 26, fontFamily: 'PlayfairDisplay_700Bold', textAlign: 'center', marginBottom: 4 },
  subtitle:    { fontSize: 13, fontFamily: 'DMSans_500Medium', textAlign: 'center', letterSpacing: 1, marginBottom: 18 },
  infoBox:     { borderRadius: 2, borderWidth: 1, padding: 14, marginBottom: 12 },
  infoText:    { fontSize: 13, lineHeight: 20, fontFamily: 'DMSans_500Medium' },
  warningBox:  { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderRadius: 2, borderWidth: 1, padding: 12, marginBottom: 12 },
  warningText: { flex: 1, fontSize: 12, lineHeight: 18 },
  noteBox:     { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 20 },
  noteText:    { flex: 1, fontSize: 11, lineHeight: 17 },
  btn:         { borderRadius: 2, overflow: 'hidden' },
  btnGrad:     { paddingVertical: 15, alignItems: 'center' },
  btnTxt:      { fontSize: 15, fontFamily: 'DMSans_500Medium', color: '#1A1209' },
});

// ─── Risk Panel (redesigned) ─────────────────────────────────────────────────
const HYGIENE_OPTS: { label: string; emoji: string; value: number }[] = [
  { label: 'Nízka',    emoji: '😬', value: 3 },
  { label: 'Stredná',  emoji: '😊', value: 7 },
  { label: 'Výborná',  emoji: '🌟', value: 9 },
];

const RiskPanel = React.memo(({
  risk, onChange,
}: { risk: RiskFactors; onChange: (patch: Partial<RiskFactors>) => void }) => {
  const [open, setOpen] = useState(false);

  const riskCount = [risk.smoking, risk.diabetes, risk.bruxism].filter(Boolean).length;
  const hygieneLabel = HYGIENE_OPTS.find(o => o.value === risk.hygiene)?.label ?? 'Stredná';

  return (
    <View style={s.riskCard}>
      <TouchableOpacity style={s.riskHeader} onPress={() => setOpen(v => !v)} activeOpacity={0.8}>
        <View style={s.riskIconWrap}>
          <Ionicons name="fitness-outline" size={16} color="#3A4256" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.riskHeaderTxt}>Rizikové faktory</Text>
          <Text style={s.riskHeaderSub}>
            {riskCount === 0 ? 'Žiadne riziká' : `${riskCount} aktívne`} · Hygiena: {hygieneLabel}
          </Text>
        </View>
        <View style={s.riskSummary}>
          {risk.smoking  && <Text style={s.riskChip}>🚬</Text>}
          {risk.diabetes && <Text style={s.riskChip}>💉</Text>}
          {risk.bruxism  && <Text style={s.riskChip}>😬</Text>}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#8B7355" />
      </TouchableOpacity>

      {open && (
        <View style={s.riskBody}>
          {([
            { key: 'smoking' as const,  label: 'Fajčenie',  emoji: '🚬', hint: 'Urýchľuje degradáciu ďasien' },
            { key: 'diabetes' as const, label: 'Diabetes',  emoji: '💉', hint: 'Zvyšuje riziko parodontozy' },
            { key: 'bruxism' as const,  label: 'Bruxizmus', emoji: '😬', hint: 'Škrípanie opotrebúva korunky' },
          ]).map(({ key, label, emoji, hint }) => (
            <TouchableOpacity
              key={key}
              style={s.riskRow}
              onPress={() => onChange({ [key]: !risk[key] })}
              activeOpacity={0.75}
            >
              <Text style={s.riskEmoji}>{emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.riskLabel}>{label}</Text>
                <Text style={s.riskHint}>{hint}</Text>
              </View>
              <View style={[s.toggle, { backgroundColor: risk[key] ? '#C0392B' : '#2A2218' }]}>
                <View style={[s.thumb, risk[key] && s.thumbOn]} />
              </View>
            </TouchableOpacity>
          ))}

          <View style={s.riskDivider} />
          <Text style={s.hygieneTitle}>🪥  Ústna hygiena</Text>
          <View style={s.hygieneRow}>
            {HYGIENE_OPTS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  s.hygieneBtn,
                  risk.hygiene === opt.value && s.hygieneBtnActive,
                ]}
                onPress={() => onChange({ hygiene: opt.value })}
                activeOpacity={0.75}
              >
                <Text style={{ fontSize: 20 }}>{opt.emoji}</Text>
                <Text style={[s.hygieneLbl, risk.hygiene === opt.value && { color: '#3A4256' }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.riskDisclaimer}>
            Faktory ovplyvňujú rýchlosť predikovaného zhoršenia, nie istý výsledok.
          </Text>
        </View>
      )}
    </View>
  );
});

// ─── Score Ring V2 — premium design s gradientom ────────────────────────────
const RING_SIZE = 180;
const RING_R    = 72;
const RING_CIRC = 2 * Math.PI * RING_R;

const ScoreRing = React.memo(({ score, info }: { score: number; info: ReturnType<typeof scoreInfo> }) => {
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    setDisplayScore(0);
    let current = 0;
    const timer = setInterval(() => {
      current += Math.ceil((score - current) / 6) || 1;
      if (current >= score) { current = score; clearInterval(timer); }
      setDisplayScore(current);
    }, 20);
    return () => clearInterval(timer);
  }, [score]);

  const offset = RING_CIRC * (1 - displayScore / 100);
  const cx = RING_SIZE / 2;

  return (
    <View style={s.ringWrap}>
      <View style={[s.ringGlow, { backgroundColor: info.ring, shadowColor: info.ring }]} />
      <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
        <Defs>
          <SvgGrad id="scoreGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={info.ring} stopOpacity="1" />
            <Stop offset="1" stopColor={info.color} stopOpacity="0.7" />
          </SvgGrad>
        </Defs>
        <Circle cx={cx} cy={cx} r={RING_R + 6}
          stroke="rgba(201,168,76,0.04)" strokeWidth={1} fill="none" />
        <Circle cx={cx} cy={cx} r={RING_R}
          stroke="#1E1610" strokeWidth={10} fill="none" />
        <Circle cx={cx} cy={cx} r={RING_R}
          stroke="url(#scoreGrad)" strokeWidth={10} fill="none"
          strokeDasharray={RING_CIRC} strokeDashoffset={offset}
          strokeLinecap="round" rotation="-90" origin={`${cx}, ${cx}`} />
        <Circle cx={cx} cy={cx} r={RING_R - 6}
          stroke="rgba(201,168,76,0.03)" strokeWidth={0.5} fill="none" />
      </Svg>
      <View style={s.ringCenter}>
        <Text style={[s.ringScore, { color: info.ring }]}>{displayScore}</Text>
        <Text style={s.ringMax}>/100</Text>
        <View style={[s.ringBadge, { backgroundColor: info.bg, borderColor: `${info.ring}33` }]}>
          <Text style={[s.ringBadgeTxt, { color: info.ring }]}>{info.emoji} {info.label}</Text>
        </View>
      </View>
    </View>
  );
});

// ─── Interactive Dental Arch — zuby v tvare oblúka ──────────────────────────
const TOOTH_SIZE = 32;
const ARCH_PAD = 8;

// Výpočet pozícií zubov v oblúku
function getArchPositions(count: number, isUpper: boolean, containerW: number): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  const archW = containerW - TOOTH_SIZE - ARCH_PAD * 2;
  const archH = isUpper ? 50 : 50; // hĺbka oblúku

  for (let i = 0; i < count; i++) {
    const t = i / (count - 1); // 0..1
    const x = ARCH_PAD + t * archW;
    // Parabola pre oblúkový efekt
    const normalizedT = (t - 0.5) * 2; // -1..1
    const y = isUpper
      ? archH * (1 - normalizedT * normalizedT) // horný oblúk — hore
      : archH * (1 - normalizedT * normalizedT); // dolný oblúk — dole (invertované v rendereri)
    positions.push({ x, y });
  }
  return positions;
}

const ToothIndicator = React.memo(({
  fdi, status, isChanged, onPress,
}: {
  fdi: number; status: ToothStatus; isChanged: boolean; onPress: () => void;
}) => {
  const visual = getToothVisual(status);
  const isHealthy = status === 'healthy';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      style={[
        s.toothIndicator,
        { backgroundColor: isHealthy ? '#162012' : visual.bg },
        { borderColor: isHealthy ? '#52C89640' : `${visual.color}60` },
        isChanged && { borderColor: '#F5F6F8', borderWidth: 2 },
      ]}
    >
      {isHealthy ? (
        <View style={[s.toothHealthyDot, { backgroundColor: visual.color }]} />
      ) : (
        <Ionicons name={visual.icon as any} size={13} color={visual.color} />
      )}
      <Text style={[s.toothFdi, { color: isHealthy ? '#4A6B3F' : `${visual.color}CC` }]}>
        {fdi}
      </Text>
    </TouchableOpacity>
  );
});

const DentalArch = React.memo(({
  teeth, baseTeeth, onPressTooth, selectedVisit, year,
}: {
  teeth: Record<number, ToothStatus>;
  baseTeeth: Record<number, ToothStatus>;
  onPressTooth: (fdi: number) => void;
  selectedVisit: number;
  year: number;
}) => {
  const archW = W - 32;
  const upperPos = getArchPositions(UPPER_ARCH.length, true, archW);
  const lowerPos = getArchPositions(LOWER_ARCH.length, false, archW);
  const changed = new Set(
    ALL_FDI.filter(f => (baseTeeth[f] ?? 'healthy') !== (teeth[f] ?? 'healthy'))
  );

  // Banner pre stav zobrazenia
  const bannerText = selectedVisit >= 0
    ? null // handled externally
    : year === 0 ? 'Aktuálny stav chrupu' : `Predikcia: Rok +${year}`;

  return (
    <View style={s.archContainer}>
      {/* Label */}
      <View style={s.archLabelRow}>
        <View style={s.archLabelDot} />
        <Text style={s.archLabel}>
          {bannerText}
        </Text>
        {year > 0 && (
          <View style={s.archPredBadge}>
            <Ionicons name="time-outline" size={10} color="#C0392B" />
            <Text style={s.archPredTxt}>+{year}R</Text>
          </View>
        )}
      </View>

      {/* Horný oblúk */}
      <View style={[s.archRow, { height: 50 + TOOTH_SIZE + 4 }]}>
        {UPPER_ARCH.map((fdi, i) => {
          const pos = upperPos[i];
          const st = teeth[fdi] ?? 'healthy';
          return (
            <View key={fdi} style={[s.toothAbsolute, { left: pos.x, top: 50 - pos.y }]}>
              <ToothIndicator
                fdi={fdi}
                status={st}
                isChanged={changed.has(fdi)}
                onPress={() => onPressTooth(fdi)}
              />
            </View>
          );
        })}
      </View>

      {/* Stredový oddeľovač — línia medzi čeľusťami */}
      <View style={s.archDivider}>
        <View style={s.archDividerLine} />
        <Text style={s.archDividerText}>HORNÁ · DOLNÁ</Text>
        <View style={s.archDividerLine} />
      </View>

      {/* Dolný oblúk — invertovaný */}
      <View style={[s.archRow, { height: 50 + TOOTH_SIZE + 4 }]}>
        {LOWER_ARCH.map((fdi, i) => {
          const pos = lowerPos[i];
          const st = teeth[fdi] ?? 'healthy';
          return (
            <View key={fdi} style={[s.toothAbsolute, { left: pos.x, bottom: 50 - pos.y }]}>
              <ToothIndicator
                fdi={fdi}
                status={st}
                isChanged={changed.has(fdi)}
                onPress={() => onPressTooth(fdi)}
              />
            </View>
          );
        })}
      </View>

      <Text style={s.tapHint}>Klepni na zub pre detail a históriu</Text>
    </View>
  );
});

// ─── Status Legend ────────────────────────────────────────────────────────────
const LEGEND_ITEMS: { status: string; label: string; color: string }[] = [
  { status: 'healthy',        label: 'Zdravý',       color: '#52C896' },
  { status: 'watch',          label: 'Sledovanie',   color: '#B8ACA0' },
  { status: 'caries_initial', label: 'Kaz',          color: '#B87333' },
  { status: 'caries_deep',    label: 'Hlboký kaz',   color: '#C0392B' },
  { status: 'filling',        label: 'Plomba',       color: '#3A4256' },
  { status: 'crown',          label: 'Korunka',      color: '#2D3544' },
  { status: 'endo',           label: 'Endo',         color: '#C0392B' },
  { status: 'implant',        label: 'Implantát',    color: '#9B59B6' },
  { status: 'extracted',      label: 'Extrahovaný',  color: '#B8ACA0' },
];

const StatusLegend = React.memo(() => (
  <View style={s.legendWrap}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.legendScroll}>
      {LEGEND_ITEMS.map(item => (
        <View key={item.status} style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: item.color }]} />
          <Text style={s.legendText}>{item.label}</Text>
        </View>
      ))}
    </ScrollView>
  </View>
));

// ─── Insights Section — actionable odporúčania ──────────────────────────────
const InsightsSection = React.memo(({
  rawTeeth, snapshots, score,
}: {
  rawTeeth: Record<number, ToothStatus>;
  snapshots: ReturnType<typeof generatePredictions>;
  score: number;
}) => {
  const insights: { icon: string; color: string; text: string; priority: number }[] = [];

  // Count statuses
  const counts: Partial<Record<ToothStatus, number>> = {};
  for (const st of Object.values(rawTeeth)) {
    counts[st] = (counts[st] ?? 0) + 1;
  }

  // Generate insights based on dental state
  if ((counts.caries_initial ?? 0) > 0) {
    insights.push({
      icon: 'alert-circle',
      color: '#B87333',
      text: `Máš ${counts.caries_initial} ${(counts.caries_initial ?? 0) === 1 ? 'počiatočný kaz' : 'počiatočné kazy'}. Včasné ošetrenie zabráni hlbšiemu poškodeniu.`,
      priority: 2,
    });
  }
  if ((counts.caries_deep ?? 0) > 0) {
    insights.push({
      icon: 'warning',
      color: '#C0392B',
      text: `${counts.caries_deep} ${(counts.caries_deep ?? 0) === 1 ? 'zub vyžaduje' : 'zuby vyžadujú'} urgentné ošetrenie hlbokého kazu.`,
      priority: 1,
    });
  }
  if ((counts.watch ?? 0) > 0) {
    insights.push({
      icon: 'eye',
      color: '#B8ACA0',
      text: `${counts.watch} ${(counts.watch ?? 0) === 1 ? 'zub je' : 'zuby sú'} v sledovaní — pravidelné kontroly sú kľúčové.`,
      priority: 3,
    });
  }

  // 5-year prediction insight
  const totalFutureIssues = snapshots.slice(1).reduce((a, snap) => a + snap.newIssues.length, 0);
  if (totalFutureIssues > 0 && snapshots[5]?.cumulativeCost > 0) {
    const savings = Math.max(0, snapshots[5].cumulativeCost - PREVENTION_COST * 5);
    if (savings > 100) {
      insights.push({
        icon: 'trending-down',
        color: '#52C896',
        text: `Prevenciou môžeš ušetriť až ${savings} € za 5 rokov oproti neskorším zákrokom.`,
        priority: 4,
      });
    }
  }

  if (score >= 85 && insights.length === 0) {
    insights.push({
      icon: 'star',
      color: '#52C896',
      text: 'Výborný stav chrupu! Pokračuj v pravidelných prehliadkach a kvalitnej ústnej hygiene.',
      priority: 5,
    });
  }

  // Sort by priority
  insights.sort((a, b) => a.priority - b.priority);

  if (insights.length === 0) return null;

  return (
    <View style={s.insightsWrap}>
      <View style={s.insightsHeader}>
        <Ionicons name="bulb-outline" size={14} color="#3A4256" />
        <Text style={s.insightsTitle}>Odporúčania</Text>
      </View>
      {insights.slice(0, 3).map((ins, i) => (
        <View key={i} style={s.insightRow}>
          <View style={[s.insightIcon, { backgroundColor: `${ins.color}15` }]}>
            <Ionicons name={ins.icon as any} size={14} color={ins.color} />
          </View>
          <Text style={s.insightText}>{ins.text}</Text>
        </View>
      ))}
    </View>
  );
});

// ─── Year Card (timeline) — vylepšený dizajn ────────────────────────────────
const YearCard = React.memo(({
  year, newIssues, cumCost, active, onPress, isToday,
}: {
  year: number; newIssues: number; cumCost: number;
  active: boolean; onPress: () => void; isToday: boolean;
}) => {
  const color = newIssues === 0 ? '#52C896' : newIssues <= 2 ? '#B87333' : '#C0392B';

  return (
    <TouchableOpacity
      style={[
        s.yearCard,
        active && { borderColor: color, backgroundColor: `${color}15` },
        isToday && !active && { borderColor: '#3A425640' },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {isToday && <View style={[s.yearTodayDot, { backgroundColor: '#3A4256' }]} />}
      <Text style={[s.yearCardLabel, active ? { color } : undefined]}>
        {year === 0 ? 'DNES' : `+${year}R`}
      </Text>
      <Text style={[s.yearCardIssues, { color }]}>
        {newIssues === 0 ? '✓' : newIssues}
      </Text>
      <Text style={[s.yearCardSub, active ? { color: `${color}99` } : undefined]}>
        {newIssues === 0 ? 'OK' : `${cumCost} €`}
      </Text>
    </TouchableOpacity>
  );
});

// ─── Past Visit Card ────────────────────────────────────────────────────────
const PastVisitCard = React.memo(({
  date, active, onPress,
}: { date: string; active: boolean; onPress: () => void }) => {
  const label = new Date(date).toLocaleDateString('sk-SK', { month: 'short', year: '2-digit' });
  return (
    <TouchableOpacity
      style={[s.pastCard, active && s.pastCardActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Ionicons name="time-outline" size={11} color={active ? '#3A4256' : '#B8ACA0'} />
      <Text style={[s.pastCardLabel, active && { color: '#3A4256' }]}>{label}</Text>
    </TouchableOpacity>
  );
});

// ─── Tooth Detail Modal — vylepšený dizajn ──────────────────────────────────
type HistoryRecord = { status: string; notes: string | null; created_at: string };

function ToothModal({
  fdi, snapshots, visible, onClose, onBook,
}: {
  fdi: number; snapshots: ReturnType<typeof generatePredictions>;
  visible: boolean; onClose: () => void; onBook: () => void;
}) {
  const { colors, dark } = useAppTheme();
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  useEffect(() => {
    if (!visible || !fdi) return;
    setHistLoading(true);
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setHistLoading(false); return; }
      supabase
        .from('dental_records')
        .select('status, notes, created_at')
        .eq('patient_id', user.id)
        .eq('tooth_number', fdi)
        .order('created_at', { ascending: false })
        .limit(8)
        .then(({ data }) => {
          setHistory(data ?? []);
          setHistLoading(false);
        });
    });
  }, [visible, fdi]);

  if (!fdi) return null;
  const present = snapshots[0]?.teeth[fdi] ?? 'healthy';
  const cfg = STATUS_CFG[present] ?? { label: present, color: '#FFE082', darkColor: '#FFB300', glowColor: '#FF9800', emoji: '🟠', severity: 2 };
  const visual = getToothVisual(present);
  const name = toothName(fdi);
  const future = snapshots.slice(1).filter(snap => snap.newIssues.some(i => i.tooth === fdi));

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.sheet, { backgroundColor: colors.cardBg }]}>
          <View style={[s.handle, { backgroundColor: colors.bg3 }]} />

          {/* Hlavička s veľkou ikonou */}
          <View style={s.sheetHeaderV2}>
            <View style={[s.sheetToothIcon, { backgroundColor: visual.bg, borderColor: `${visual.color}40` }]}>
              <Ionicons name={visual.icon as any} size={22} color={visual.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.sheetTitle, { color: colors.textPrimary }]}>Zub {fdi}</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: 'DMSans_400Regular' }}>{name}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[s.closeBtn, { backgroundColor: dark ? '#1A1209' : '#EAECEE' }]}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
            {/* Súčasný stav — banner */}
            <View style={[s.statusBanner, { backgroundColor: `${visual.color}10`, borderColor: `${visual.color}30` }]}>
              <Text style={{ fontSize: 24 }}>{cfg.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.statusBannerLabel}>SÚČASNÝ STAV</Text>
                <Text style={[s.statusBannerValue, { color: visual.color }]}>{cfg.label}</Text>
              </View>
            </View>

            {/* História ošetrení */}
            <View style={{ marginBottom: 16 }}>
              <Text style={[s.modalSectionLabel, { color: colors.textSecondary }]}>HISTÓRIA OŠETRENÍ</Text>
              {histLoading ? (
                <ActivityIndicator size="small" color={colors.textSecondary} style={{ marginVertical: 12 }} />
              ) : history.length === 0 ? (
                <View style={[s.histEmpty, { backgroundColor: dark ? '#1A1209' : '#EAECEE', borderColor: colors.bg3 }]}>
                  <Ionicons name="document-outline" size={15} color={colors.textSecondary} />
                  <Text style={{ fontSize: 12, color: colors.textSecondary, flex: 1, fontFamily: 'DMSans_400Regular' }}>
                    Zatiaľ žiadny záznam pre tento zub
                  </Text>
                </View>
              ) : (
                history.map((rec, i) => {
                  const recCfg = Object.values(STATUS_CFG).find(c => c.label.toLowerCase() === rec.status.toLowerCase());
                  return (
                    <View key={i} style={[s.histRow, { borderColor: colors.bg3 }]}>
                      <View style={[s.histDot, { backgroundColor: recCfg?.glowColor ?? colors.bg3 }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontFamily: 'DMSans_500Medium', color: colors.textPrimary }}>
                          {rec.status}
                        </Text>
                        {rec.notes && (
                          <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2, fontFamily: 'DMSans_400Regular' }} numberOfLines={2}>
                            {rec.notes}
                          </Text>
                        )}
                      </View>
                      <Text style={{ fontSize: 10, color: colors.textSecondary, marginLeft: 8, fontFamily: 'DMSans_400Regular' }}>
                        {formatDate(rec.created_at)}
                      </Text>
                    </View>
                  );
                })
              )}
            </View>

            {/* Predikcia */}
            {future.length > 0 ? (
              <View style={{ marginBottom: 16 }}>
                <Text style={[s.modalSectionLabel, { color: colors.textSecondary }]}>PREDIKCIA NA 5 ROKOV</Text>
                {future.map(snap => {
                  const issue = snap.newIssues.find(i => i.tooth === fdi)!;
                  const nextCfg = STATUS_CFG[issue.toStatus];
                  return (
                    <View key={snap.year} style={[s.predRow, { borderColor: colors.bg3 }]}>
                      <View style={s.predYearBadge}>
                        <Text style={s.predYearTxt}>+{snap.year}r</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontFamily: 'DMSans_500Medium', color: colors.textPrimary }}>
                          {nextCfg?.label ?? issue.toStatus}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: 'DMSans_400Regular' }}>
                          Pravdepodobnosť: {Math.round(issue.probability * 100)}%
                        </Text>
                      </View>
                      <Text style={{ fontSize: 13, color: '#C0392B', fontFamily: 'DMSans_500Medium' }}>
                        ~{issue.cost} €
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={[s.okBanner, { backgroundColor: dark ? '#1A3D2E' : '#EDF7F3', borderColor: dark ? '#52C89644' : '#A3D4BE' }]}>
                <Ionicons name="checkmark-circle" size={17} color={dark ? '#58D68D' : '#2E7D5E'} />
                <Text style={{ flex: 1, fontSize: 13, fontFamily: 'DMSans_500Medium', color: dark ? '#58D68D' : '#2E7D5E' }}>
                  V horizonte 5 rokov bez predpokladanej zmeny
                </Text>
              </View>
            )}
          </ScrollView>

          {/* CTA tlačidlo */}
          <TouchableOpacity style={s.modalCTA} onPress={onBook} activeOpacity={0.88}>
            <LinearGradient colors={['#2D3544', '#3A4256']} style={s.modalCTAGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name="calendar-outline" size={16} color="#1A1209" />
              <Text style={s.modalCTATxt}>Rezervovať prehliadku</Text>
            </LinearGradient>
          </TouchableOpacity>
          <Text style={s.modalDisclaimer}>
            Predikcia je orientačná. Nenahrádza odbornú diagnostiku.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

// ─── Hlavná obrazovka ─────────────────────────────────────────────────────────
export default function DentalTwinScreen() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();

  const [rawTeeth, setRawTeeth] = useState<Record<number, ToothStatus>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [year, setYear] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [pastVisits, setPastVisits] = useState<{ date: string; teeth: Record<number, ToothStatus> }[]>([]);
  const [selectedVisit, setSelectedVisit] = useState<number>(-1);

  const [risk, setRisk] = useState<RiskFactors>({
    smoking: false, diabetes: false, bruxism: false, hygiene: 7,
  });

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem('dentalRisk'),
      AsyncStorage.getItem('dentalTwinConsent'),
    ]).then(([riskVal, consentVal]) => {
      if (riskVal) { try { setRisk(JSON.parse(riskVal)); } catch {} }
      if (!consentVal) setShowConsent(true);
    });
  }, []);

  function handleAcceptConsent() {
    AsyncStorage.setItem('dentalTwinConsent', '1');
    setShowConsent(false);
  }

  const updateRisk = useCallback((patch: Partial<RiskFactors>) => {
    setRisk(prev => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem('dentalRisk', JSON.stringify(next));
      return next;
    });
  }, []);

  const snapshots = useMemo(
    () => generatePredictions(rawTeeth, risk, 5),
    [rawTeeth, risk],
  );

  useEffect(() => {
    if (loading || Object.keys(rawTeeth).length === 0) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) saveSnapshotsToDb(user.id, snapshots, risk).catch(() => {});
    });
  }, [snapshots]);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || cancelled) return;
      supabase
        .from('dental_snapshots')
        .select('snapshot_date, tooth_states')
        .eq('patient_id', user.id)
        .eq('snapshot_type', 'real')
        .order('snapshot_date', { ascending: false })
        .limit(6)
        .then(({ data }) => {
          if (cancelled || !data) return;
          const seen = new Set<string>();
          const visits = data
            .filter(r => { if (seen.has(r.snapshot_date)) return false; seen.add(r.snapshot_date); return true; })
            .map(r => ({ date: r.snapshot_date, teeth: r.tooth_states as Record<number, ToothStatus> }));
          setPastVisits(visits);
        });
    });
    return () => { cancelled = true; };
  }, [rawTeeth]);

  const currentTeeth = selectedVisit >= 0
    ? (pastVisits[selectedVisit]?.teeth ?? rawTeeth)
    : (snapshots[year]?.teeth ?? rawTeeth);
  const score = useMemo(() => calcScore(rawTeeth), [rawTeeth]);
  const info = scoreInfo(score);

  const stats = useMemo(() => {
    const all = Object.values(rawTeeth);
    return {
      healthy: all.filter(st => st === 'healthy').length,
      issues: all.filter(st => ['caries_deep', 'caries_initial', 'endo', 'extracted'].includes(st)).length,
      watch: all.filter(st => st === 'watch').length,
      treated: all.filter(st => ['filling', 'crown', 'inlay', 'implant'].includes(st)).length,
    };
  }, [rawTeeth]);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); setRefreshing(false); return; }

    const { data: charts } = await supabase
      .from('dental_charts')
      .select('tooth_number, status')
      .eq('patient_id', user.id);

    const STATUS_MAP: Record<string, ToothStatus> = {
      cavity: 'caries_deep', early_cavity: 'caries_initial',
      root_canal: 'endo', filled: 'filling', large_filling: 'filling',
      replace_filling: 'caries_initial', bridge: 'crown', veneer: 'crown',
      sealant: 'healthy', fracture: 'caries_deep', erosion: 'watch',
      abrasion: 'watch', hypoplasia: 'watch', hypomineralization: 'watch',
      periodontal: 'watch', mobility: 'watch',
      improve_hygiene: 'watch', treatment_needed: 'caries_initial',
    };
    const map: Record<number, ToothStatus> = {};
    (charts ?? []).forEach((c: any) => {
      const raw = c.status as string;
      map[c.tooth_number] = (STATUS_MAP[raw] ?? raw) as ToothStatus;
    });

    if (Object.keys(map).length === 0) {
      ALL_FDI.forEach(fdi => { map[fdi] = 'healthy'; });
    }

    setRawTeeth(map);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { load(); }, []);

  function handleToothPress(fdi: number) {
    setSelected(fdi);
    setShowModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  // ─── Loading state ───
  if (loading) {
    return (
      <View style={[s.safe, { backgroundColor: '#0A0806', alignItems: 'center', justifyContent: 'center' }]}>
        <View style={s.loadingCircle}>
          <ActivityIndicator color="#3A4256" size="large" />
        </View>
        <Text style={s.loadingTitle}>Analyzujem tvoj chrup...</Text>
        <Text style={s.loadingSub}>Pripravujem 5-ročnú predikciu</Text>
      </View>
    );
  }

  // ─── Výpočet pre cost comparison ───
  const totalFutureIssues = snapshots.slice(1).reduce((a, snap) => a + snap.newIssues.length, 0);
  const hasCostData = snapshots[5]?.cumulativeCost > 0;

  return (
    <View style={[s.safe, { backgroundColor: '#0A0806' }]}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* ── Header ── */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.8}>
            <Ionicons name="chevron-back" size={20} color="#3A4256" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerSub}>DENTAL SCORE™</Text>
            <Text style={s.headerTitle}>Digitálny dvojník</Text>
          </View>
          <View style={[s.headerScorePill, { backgroundColor: info.bg, borderColor: `${info.ring}33` }]}>
            <Text style={[s.headerScoreVal, { color: info.ring }]}>{score}</Text>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor="#3A4256" />}
        >

          {/* ── Score Ring + Stats ── */}
          <View style={s.scoreSection}>
            <ScoreRing score={score} info={info} />
            <Text style={s.scoreSubtext}>
              {score >= 85 ? 'Tvoj chrup je vo výbornom stave' :
               score >= 70 ? 'Tvoj chrup je v dobrom stave' :
               score >= 50 ? 'Chrup potrebuje pozornosť' :
               'Chrup vyžaduje urgentné ošetrenie'}
            </Text>
          </View>

          {/* ── Quick Stats ── */}
          <View style={s.statsRow}>
            {[
              { val: stats.healthy, lbl: 'Zdravých',  color: '#52C896', icon: 'checkmark-circle' as const },
              { val: stats.issues,  lbl: 'Problémov', color: '#C0392B', icon: 'alert-circle' as const },
              { val: stats.watch,   lbl: 'Sledovanie', color: '#B8ACA0', icon: 'eye' as const },
              { val: stats.treated, lbl: 'Ošetrených', color: '#3A4256', icon: 'shield-checkmark' as const },
            ].map(({ val, lbl, color, icon }) => (
              <View key={lbl} style={s.statPill}>
                <Ionicons name={icon} size={13} color={color} />
                <Text style={[s.statNum, { color }]}>{val}</Text>
                <Text style={s.statLbl}>{lbl}</Text>
              </View>
            ))}
          </View>

          {/* ── Insights / Odporúčania ── */}
          <InsightsSection rawTeeth={rawTeeth} snapshots={snapshots} score={score} />

          {/* ── Dental Arch — interaktívna vizualizácia ── */}
          <DentalArch
            teeth={currentTeeth}
            baseTeeth={rawTeeth}
            onPressTooth={handleToothPress}
            selectedVisit={selectedVisit}
            year={year}
          />

          {/* ── Status Legend ── */}
          <StatusLegend />

          {/* ── Risk Panel ── */}
          <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
            <RiskPanel risk={risk} onChange={updateRisk} />
          </View>

          {/* ── Timeline: minulosť + predikcia ── */}
          <View style={s.section}>
            <View style={s.sectionHeaderRow}>
              <Ionicons name="time-outline" size={14} color="#3A4256" />
              <Text style={s.sectionLabel}>ČASOVÁ OS</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
            >
              {pastVisits.length > 0 && (
                <>
                  {[...pastVisits].reverse().map((visit, i) => (
                    <PastVisitCard
                      key={visit.date}
                      date={visit.date}
                      active={selectedVisit === (pastVisits.length - 1 - i)}
                      onPress={() => {
                        const idx = pastVisits.length - 1 - i;
                        setSelectedVisit(idx === selectedVisit ? -1 : idx);
                        setYear(0);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                    />
                  ))}
                  <View style={s.timelineSep}>
                    <View style={s.timelineLine} />
                    <View style={s.timelineDotGold} />
                    <View style={s.timelineLine} />
                  </View>
                </>
              )}

              {snapshots.map((snap, i) => (
                <YearCard
                  key={i}
                  year={i}
                  newIssues={snap.newIssues.length}
                  cumCost={snap.cumulativeCost}
                  active={selectedVisit === -1 && year === i}
                  isToday={i === 0}
                  onPress={() => {
                    setSelectedVisit(-1);
                    setYear(i);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                />
              ))}
            </ScrollView>

            {/* Aktívny rok — detail panel */}
            {year > 0 && snapshots[year].newIssues.length > 0 && (() => {
              const snap = snapshots[year];
              const prevCost = PREVENTION_COST * year;
              const savings = Math.max(0, snap.cumulativeCost - prevCost);

              const grouped = snap.newIssues.reduce((acc, iss) => {
                if (!acc[iss.toStatus]) acc[iss.toStatus] = { teeth: [], cost: 0 };
                acc[iss.toStatus].teeth.push(iss.tooth);
                acc[iss.toStatus].cost += iss.cost;
                return acc;
              }, {} as Record<string, { teeth: number[]; cost: number }>);

              return (
                <View style={s.counterPanel}>
                  <Text style={s.counterTitle}>
                    Rok +{year} — predikované zmeny
                  </Text>

                  {Object.entries(grouped).map(([status, { teeth, cost }]) => {
                    const statusCfg = STATUS_CFG[status as ToothStatus];
                    const label = statusCfg?.label ?? status;
                    const emoji = statusCfg?.emoji ?? '🔴';
                    return (
                      <TouchableOpacity
                        key={status}
                        style={s.counterRow}
                        onPress={() => handleToothPress(teeth[0])}
                        activeOpacity={0.75}
                      >
                        <Text style={s.counterEmoji}>{emoji}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={s.counterLabel}>{teeth.length}× {label}</Text>
                          <Text style={s.counterTeeth}>
                            {teeth.length === 1 ? `zub: ${teeth[0]}` : `zuby: ${teeth.join(', ')}`}
                          </Text>
                        </View>
                        <Text style={s.counterCost}>~{cost} €</Text>
                      </TouchableOpacity>
                    );
                  })}

                  <View style={s.counterDivider} />
                  <View style={s.counterSummary}>
                    <View style={s.counterSummaryRow}>
                      <Text style={{ fontSize: 14, width: 22 }}>💰</Text>
                      <Text style={s.counterSummaryLabel}>Odhad ošetrenia:</Text>
                      <Text style={[s.counterSummaryVal, { color: '#C0392B' }]}>{snap.cumulativeCost} €</Text>
                    </View>
                    <View style={s.counterSummaryRow}>
                      <Text style={{ fontSize: 14, width: 22 }}>💚</Text>
                      <Text style={s.counterSummaryLabel}>Cena prevencie:</Text>
                      <Text style={[s.counterSummaryVal, { color: '#58D68D' }]}>{prevCost} €</Text>
                    </View>
                    {savings > 0 && (
                      <View style={s.counterSavingsRow}>
                        <Ionicons name="trending-down" size={14} color="#58D68D" />
                        <Text style={s.savingsLabel}>Úspora pri prevencii:</Text>
                        <Text style={s.savingsVal}>{savings} €</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })()}
            {year > 0 && snapshots[year].newIssues.length === 0 && (
              <View style={s.yearOK}>
                <Ionicons name="checkmark-circle" size={17} color="#58D68D" />
                <Text style={s.yearOKText}>
                  Rok +{year} bez predpokladaných nových komplikácií
                </Text>
              </View>
            )}
          </View>

          {/* ── 5-ročné porovnanie ── */}
          {hasCostData && (
            <View style={s.section}>
              <View style={s.sectionHeaderRow}>
                <Ionicons name="bar-chart-outline" size={14} color="#3A4256" />
                <Text style={s.sectionLabel}>5-ROČNÉ POROVNANIE</Text>
              </View>
              <View style={s.compareCard}>
                {/* Prevencia */}
                <View style={s.compareItem}>
                  <View style={[s.compareIconWrap, { backgroundColor: '#1A3D2E' }]}>
                    <Ionicons name="shield-checkmark" size={20} color="#58D68D" />
                  </View>
                  <Text style={s.compareLabel}>Prevencia</Text>
                  <Text style={[s.compareVal, { color: '#58D68D' }]}>{PREVENTION_COST * 5} €</Text>
                  <Text style={s.compareSub}>5× ročná prehliadka</Text>
                </View>

                {/* VS divider */}
                <View style={s.compareVsWrap}>
                  <View style={s.compareVsLine} />
                  <Text style={s.compareVsTxt}>vs</Text>
                  <View style={s.compareVsLine} />
                </View>

                {/* Bez prevencie */}
                <View style={s.compareItem}>
                  <View style={[s.compareIconWrap, { backgroundColor: '#3A0E0E' }]}>
                    <Ionicons name="warning" size={20} color="#F1948A" />
                  </View>
                  <Text style={s.compareLabel}>Bez prevencie</Text>
                  <Text style={[s.compareVal, { color: '#F1948A' }]}>{snapshots[5].cumulativeCost} €</Text>
                  <Text style={s.compareSub}>{totalFutureIssues} problémov</Text>
                </View>
              </View>

              {/* Savings banner */}
              {snapshots[5].cumulativeCost > PREVENTION_COST * 5 && (
                <View style={s.savingsBanner}>
                  <Ionicons name="trending-down" size={16} color="#58D68D" />
                  <Text style={s.savingsBannerTxt}>
                    Ušetríš {snapshots[5].cumulativeCost - PREVENTION_COST * 5} € s pravidelnou prevenciou
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ── CTA ── */}
          <TouchableOpacity
            style={s.ctaWrap}
            onPress={() => router.push('/(patient)/book-appointment')}
            activeOpacity={0.88}
          >
            <LinearGradient colors={['#2D3544', '#3A4256']} style={s.ctaGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name="calendar" size={17} color="#1A1209" />
              <Text style={s.ctaTxt}>Rezervovať preventívnu prehliadku</Text>
            </LinearGradient>
          </TouchableOpacity>

          <Text style={s.footerDisclaimer}>
            Dental Score™ je orientačný nástroj. Nenahrádza odbornú diagnostiku zubného lekára.
          </Text>
        </ScrollView>
      </SafeAreaView>

      {selected !== null && (
        <ToothModal
          fdi={selected}
          snapshots={snapshots}
          visible={showModal}
          onClose={() => { setShowModal(false); setSelected(null); }}
          onBook={() => { setShowModal(false); setSelected(null); router.push('/(patient)/book-appointment'); }}
        />
      )}

      <ConsentModal visible={showConsent} onAccept={handleAcceptConsent} />
    </View>
  );
}

// ─── Styles — premium dark theme V2 ──────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1 },

  // Loading
  loadingCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(201,168,76,0.06)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(201,168,76,0.1)' },
  loadingTitle: { fontSize: 14, fontFamily: 'DMSans_500Medium', color: '#3A4256', letterSpacing: 0.5 },
  loadingSub: { fontSize: 11, fontFamily: 'DMSans_400Regular', color: '#B8ACA0', marginTop: 4 },

  // Header
  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10, gap: 12 },
  backBtn:        { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(201,168,76,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(201,168,76,0.12)' },
  headerSub:      { fontSize: 9, letterSpacing: 2.5, color: '#3A4256', fontFamily: 'DMSans_500Medium' },
  headerTitle:    { fontSize: 22, fontFamily: 'PlayfairDisplay_700Bold', color: '#F5F6F8', marginTop: 1 },
  headerScorePill:{ borderRadius: 2, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  headerScoreVal: { fontSize: 16, fontFamily: 'PlayfairDisplay_700Bold' },

  // Score section
  scoreSection:  { alignItems: 'center', paddingVertical: 8, paddingBottom: 4 },
  scoreSubtext:  { fontSize: 13, fontFamily: 'DMSans_400Regular', color: '#8B7355', marginTop: 4, textAlign: 'center' },
  ringWrap:      { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  ringGlow:      { position: 'absolute', width: 80, height: 80, borderRadius: 40, opacity: 0.08, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 60, elevation: 0 },
  ringCenter:    { position: 'absolute', alignItems: 'center' },
  ringScore:     { fontSize: 42, fontFamily: 'PlayfairDisplay_700Bold', lineHeight: 48 },
  ringMax:       { fontSize: 12, color: '#B8ACA0', fontFamily: 'DMSans_500Medium', marginTop: -4 },
  ringBadge:     { borderRadius: 2, paddingHorizontal: 12, paddingVertical: 5, marginTop: 4, borderWidth: 1 },
  ringBadgeTxt:  { fontSize: 11, fontFamily: 'DMSans_500Medium', letterSpacing: 1 },

  // Stats row
  statsRow:  { flexDirection: 'row', gap: 6, paddingHorizontal: 16, marginTop: 12, marginBottom: 16 },
  statPill:  { flex: 1, flexDirection: 'column', alignItems: 'center', gap: 3, backgroundColor: '#110E09', borderRadius: 2, paddingVertical: 10, borderWidth: 1, borderColor: '#1E1610' },
  statNum:   { fontSize: 18, fontFamily: 'PlayfairDisplay_700Bold' },
  statLbl:   { fontSize: 7, fontFamily: 'DMSans_500Medium', letterSpacing: 0.5, textTransform: 'uppercase', color: '#B8ACA0' },

  // Insights
  insightsWrap:   { marginHorizontal: 16, marginBottom: 16, backgroundColor: '#110E09', borderRadius: 4, borderWidth: 1, borderColor: '#1E1610', padding: 14 },
  insightsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  insightsTitle:  { fontSize: 12, fontFamily: 'DMSans_500Medium', color: '#3A4256', letterSpacing: 0.5 },
  insightRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  insightIcon:    { width: 28, height: 28, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
  insightText:    { flex: 1, fontSize: 12, fontFamily: 'DMSans_400Regular', color: '#B8ACA0', lineHeight: 18 },

  // Dental Arch
  archContainer: { marginHorizontal: 16, marginBottom: 8, backgroundColor: '#0D0B08', borderRadius: 4, borderWidth: 1, borderColor: '#1E1610', padding: 16, paddingBottom: 12 },
  archLabelRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  archLabelDot:  { width: 4, height: 4, borderRadius: 2, backgroundColor: '#3A4256' },
  archLabel:     { flex: 1, fontSize: 11, fontFamily: 'DMSans_500Medium', color: '#8B7355', letterSpacing: 0.5 },
  archPredBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(231,76,60,0.1)', borderRadius: 2, paddingHorizontal: 6, paddingVertical: 2 },
  archPredTxt:   { fontSize: 9, fontFamily: 'DMSans_500Medium', color: '#C0392B' },
  archRow:       { position: 'relative', width: '100%' },
  archDivider:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6, paddingHorizontal: 4 },
  archDividerLine: { flex: 1, height: 1, backgroundColor: '#1E1610' },
  archDividerText: { fontSize: 8, fontFamily: 'DMSans_500Medium', color: '#3A4256', letterSpacing: 1.5 },
  toothAbsolute: { position: 'absolute' },
  toothIndicator: { width: TOOTH_SIZE, height: TOOTH_SIZE, borderRadius: TOOTH_SIZE / 2, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  toothHealthyDot: { width: 6, height: 6, borderRadius: 3 },
  toothFdi:       { fontSize: 7, fontFamily: 'DMSans_500Medium', marginTop: 1 },
  tapHint:        { fontSize: 10, color: '#3A4256', textAlign: 'center', marginTop: 8, fontFamily: 'DMSans_400Regular' },

  // Legend
  legendWrap:  { marginBottom: 16 },
  legendScroll:{ paddingHorizontal: 16, gap: 12 },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:   { width: 8, height: 8, borderRadius: 4 },
  legendText:  { fontSize: 10, fontFamily: 'DMSans_400Regular', color: '#B8ACA0' },

  // Sections
  section:          { marginBottom: 20 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, marginBottom: 12 },
  sectionLabel:     { fontSize: 9, letterSpacing: 2, color: '#8B7355', fontFamily: 'DMSans_500Medium' },

  // Year cards
  yearCard:      { width: 72, borderRadius: 2, borderWidth: 1.5, borderColor: '#1E1610', backgroundColor: '#110E09', padding: 10, alignItems: 'center', gap: 3 },
  yearTodayDot:  { width: 5, height: 5, borderRadius: 2.5, position: 'absolute', top: 5, right: 5 },
  yearCardLabel: { fontSize: 9, fontFamily: 'DMSans_500Medium', letterSpacing: 1, color: '#B8ACA0' },
  yearCardIssues:{ fontSize: 20, fontFamily: 'PlayfairDisplay_700Bold', lineHeight: 24 },
  yearCardSub:   { fontSize: 8, fontFamily: 'DMSans_400Regular', color: '#B8ACA0' },

  // Past visit cards
  pastCard:       { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 2, borderWidth: 1.5, borderColor: '#1E1610', backgroundColor: '#110E09', paddingHorizontal: 10, paddingVertical: 10, minWidth: 58 },
  pastCardActive: { borderColor: '#3A4256', backgroundColor: '#2D1800' },
  pastCardLabel:  { fontSize: 10, fontFamily: 'DMSans_500Medium', color: '#B8ACA0' },
  timelineSep:    { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 2 },
  timelineLine:   { width: 10, height: 1, backgroundColor: '#2A1F14' },
  timelineDotGold:{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#3A4256' },

  // Counter panel
  counterPanel:       { marginHorizontal: 16, marginTop: 12, borderRadius: 4, borderWidth: 1, borderColor: '#1E1610', backgroundColor: '#0D0B08', overflow: 'hidden' },
  counterTitle:       { fontSize: 12, fontFamily: 'DMSans_500Medium', color: '#8B7355', letterSpacing: 0.3, padding: 14, paddingBottom: 10 },
  counterRow:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#1E1610' },
  counterEmoji:       { fontSize: 18, width: 26, textAlign: 'center' },
  counterLabel:       { fontSize: 13, fontFamily: 'DMSans_500Medium', color: '#F5F6F8' },
  counterTeeth:       { fontSize: 10, color: '#B8ACA0', marginTop: 1, fontFamily: 'DMSans_400Regular' },
  counterCost:        { fontSize: 12, color: '#C0392B', fontFamily: 'DMSans_500Medium' },
  counterDivider:     { height: 1, backgroundColor: '#1E1610', marginHorizontal: 14, marginVertical: 4 },
  counterSummary:     { paddingHorizontal: 14, paddingBottom: 14, gap: 6 },
  counterSummaryRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  counterSummaryLabel:{ flex: 1, fontSize: 12, color: '#B8ACA0', fontFamily: 'DMSans_500Medium' },
  counterSummaryVal:  { fontSize: 14, fontFamily: 'PlayfairDisplay_700Bold' },
  counterSavingsRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 2, backgroundColor: '#1A3D2E', padding: 12, marginTop: 4 },
  savingsLabel:       { flex: 1, fontSize: 12, color: '#58D68D', fontFamily: 'DMSans_500Medium' },
  savingsVal:         { fontSize: 16, color: '#58D68D', fontFamily: 'PlayfairDisplay_700Bold' },
  yearOK:             { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, borderRadius: 2, padding: 14, backgroundColor: '#1A3D2E' },
  yearOKText:         { flex: 1, fontSize: 13, fontFamily: 'DMSans_500Medium', color: '#58D68D' },

  // Compare
  compareCard:    { marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D0B08', borderRadius: 4, borderWidth: 1, borderColor: '#1E1610', padding: 16, gap: 8 },
  compareItem:    { flex: 1, alignItems: 'center', gap: 6 },
  compareIconWrap:{ width: 44, height: 44, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  compareLabel:   { fontSize: 11, color: '#B8ACA0', fontFamily: 'DMSans_500Medium' },
  compareVal:     { fontSize: 20, fontFamily: 'PlayfairDisplay_700Bold' },
  compareSub:     { fontSize: 9, color: '#B8ACA0', fontFamily: 'DMSans_400Regular', textAlign: 'center' },
  compareVsWrap:  { alignItems: 'center', gap: 4, width: 30 },
  compareVsLine:  { width: 1, height: 14, backgroundColor: '#1E1610' },
  compareVsTxt:   { fontSize: 10, color: '#B8ACA0', fontFamily: 'DMSans_500Medium' },
  savingsBanner:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 8, backgroundColor: '#1A3D2E', borderRadius: 2, padding: 12, borderWidth: 1, borderColor: '#52C89633' },
  savingsBannerTxt:{ flex: 1, fontSize: 12, fontFamily: 'DMSans_500Medium', color: '#58D68D' },

  // CTA
  ctaWrap: { marginHorizontal: 16, marginTop: 4, borderRadius: 2, overflow: 'hidden' },
  ctaGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
  ctaTxt:  { fontSize: 14, fontFamily: 'DMSans_500Medium', color: '#1A1209' },

  // Footer
  footerDisclaimer: { fontSize: 10, color: '#3A4256', textAlign: 'center', margin: 16, lineHeight: 15, fontFamily: 'DMSans_400Regular' },

  // Modal
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  sheet:      { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 40 },
  handle:     { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  sheetHeaderV2: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  sheetToothIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  sheetTitle: { fontSize: 20, fontFamily: 'PlayfairDisplay_700Bold' },
  closeBtn:   { width: 32, height: 32, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },

  statusBanner:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 2, borderWidth: 1, padding: 14, marginBottom: 16 },
  statusBannerLabel: { fontSize: 9, fontFamily: 'DMSans_500Medium', letterSpacing: 1, color: '#8B7355', marginBottom: 2 },
  statusBannerValue: { fontSize: 15, fontFamily: 'DMSans_500Medium' },

  modalSectionLabel: { fontSize: 9, letterSpacing: 1.5, fontFamily: 'DMSans_500Medium', marginBottom: 8 },
  histEmpty: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 2, borderWidth: 1, padding: 12 },
  histRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  histDot:   { width: 10, height: 10, borderRadius: 2, marginTop: 3 },

  predRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  predYearBadge:{ backgroundColor: '#3A0E0E', borderRadius: 2, paddingHorizontal: 6, paddingVertical: 2 },
  predYearTxt:  { fontSize: 11, fontFamily: 'DMSans_500Medium', color: '#C0392B' },

  okBanner:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 2, borderWidth: 1, padding: 12, marginBottom: 14 },

  modalCTA:    { borderRadius: 2, overflow: 'hidden', marginTop: 12 },
  modalCTAGrad:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15 },
  modalCTATxt: { fontSize: 14, fontFamily: 'DMSans_500Medium', color: '#1A1209' },
  modalDisclaimer: { fontSize: 10, textAlign: 'center', color: '#B8ACA0', lineHeight: 14, marginTop: 8 },

  // Risk panel
  riskCard:       { backgroundColor: '#0D0B08', borderRadius: 4, borderWidth: 1, borderColor: '#1E1610' },
  riskHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  riskIconWrap:   { width: 32, height: 32, borderRadius: 4, backgroundColor: 'rgba(201,168,76,0.08)', alignItems: 'center', justifyContent: 'center' },
  riskHeaderTxt:  { fontSize: 13, fontFamily: 'DMSans_500Medium', color: '#F5F6F8' },
  riskHeaderSub:  { fontSize: 10, fontFamily: 'DMSans_400Regular', color: '#B8ACA0', marginTop: 1 },
  riskSummary:    { flexDirection: 'row', gap: 4 },
  riskChip:       { fontSize: 14 },
  riskBody:       { paddingHorizontal: 14, paddingBottom: 14 },
  riskRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#1E1610' },
  riskEmoji:      { fontSize: 20, width: 28, textAlign: 'center' },
  riskLabel:      { fontSize: 13, fontFamily: 'DMSans_500Medium', color: '#F5F6F8' },
  riskHint:       { fontSize: 10, color: '#B8ACA0', marginTop: 1, fontFamily: 'DMSans_400Regular' },
  riskDisclaimer: { fontSize: 9, color: '#3A4256', marginTop: 12, lineHeight: 14, fontFamily: 'DMSans_400Regular' },
  riskDivider:    { height: 1, backgroundColor: '#1E1610', marginVertical: 8 },
  hygieneTitle:   { fontSize: 12, fontFamily: 'DMSans_500Medium', color: '#F5F6F8', marginBottom: 8 },
  toggle:         { width: 42, height: 24, borderRadius: 2, justifyContent: 'center', paddingHorizontal: 2 },
  thumb:          { width: 20, height: 20, borderRadius: 2, backgroundColor: '#F5F6F8', alignSelf: 'flex-start' },
  thumbOn:        { alignSelf: 'flex-end' },
  hygieneRow:     { flexDirection: 'row', gap: 8, marginBottom: 8 },
  hygieneBtn:     { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 2, borderWidth: 1.5, borderColor: '#1E1610', backgroundColor: '#110E09', gap: 4 },
  hygieneBtnActive: { borderColor: '#3A4256', backgroundColor: '#2D2000' },
  hygieneLbl:     { fontSize: 10, fontFamily: 'DMSans_500Medium', color: '#B8ACA0' },
});
