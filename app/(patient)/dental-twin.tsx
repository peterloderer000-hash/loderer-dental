/**
 * Dental Score™ — skóre chrupu ako kreditná karta
 * Animated ring + quadrant grid + swipeable year timeline
 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ActivityIndicator, Animated, Dimensions, Modal,
  RefreshControl, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabase';
import { useAppTheme } from '../../context/ThemeContext';
import {
  generatePredictions, ToothStatus, STATUS_CFG,
  toothName, PREVENTION_COST, RiskFactors,
} from '../../utils/dentalPrediction';

const { width: W } = Dimensions.get('window');

// ─── Uloženie snapshotov do dental_snapshots (background, fire-and-forget) ────
async function saveSnapshotsToDb(
  userId: string,
  snaps: ReturnType<typeof generatePredictions>,
  riskFactors: RiskFactors,
) {
  const today = new Date().toISOString().slice(0, 10);
  // Vymaž dnešné predikované snapshoty (re-generujeme aktuálne)
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

  // Upsert real snapshot (rok 0), insert predicted (roky 1-5)
  await supabase.from('dental_snapshots').upsert(
    rows.filter(r => r.snapshot_type === 'real'),
    { onConflict: 'patient_id,snapshot_date,snapshot_type' },
  );
  await supabase.from('dental_snapshots').insert(
    rows.filter(r => r.snapshot_type === 'predicted'),
  );
}

// ─── Všetky FDI zuby dospelého ───────────────────────────────────────────────
const ALL_FDI = [
  11,12,13,14,15,16,17,18,
  21,22,23,24,25,26,27,28,
  31,32,33,34,35,36,37,38,
  41,42,43,44,45,46,47,48,
];

// ─── Quadranty (FDI) — usporiadanie pre vizuál ───────────────────────────────
const Q2 = [28,27,26,25,24,23,22,21]; // upper left  → right to center
const Q1 = [11,12,13,14,15,16,17,18]; // upper right → center to right
const Q3 = [38,37,36,35,34,33,32,31]; // lower left
const Q4 = [41,42,43,44,45,46,47,48]; // lower right

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
  if (score >= 85) return { label: 'Výborný',  color: '#27AE60', ring: '#2ECC71', bg: '#0D3B1F' };
  if (score >= 70) return { label: 'Dobrý',    color: '#2E86C1', ring: '#3498DB', bg: '#0D2233' };
  if (score >= 50) return { label: 'Pozor',    color: '#E67E22', ring: '#F39C12', bg: '#2D1500' };
  return                  { label: 'Kritický', color: '#E74C3C', ring: '#FF5252', bg: '#4A1010' };
}

// ─── Farba bodky zubu ─────────────────────────────────────────────────────────
function dotColor(status: ToothStatus): string {
  if (status === 'healthy')  return '#27AE60';
  if (['watch'].includes(status)) return '#F39C12';
  if (['caries_initial'].includes(status)) return '#E67E22';
  if (['caries_deep', 'endo', 'extracted', 'missing'].includes(status)) return '#E74C3C';
  return '#C9A84C'; // filling, crown, implant, inlay
}

// ─── Consent Modal ───────────────────────────────────────────────────────────
function ConsentModal({ visible, onAccept }: { visible: boolean; onAccept: () => void }) {
  const { colors, dark } = useAppTheme();
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={cs.overlay}>
        <View style={[cs.card, { backgroundColor: colors.cardBg }]}>

          {/* Ikona */}
          <View style={cs.iconWrap}>
            <Text style={{ fontSize: 40 }}>🦷</Text>
          </View>

          {/* Nadpis */}
          <Text style={[cs.title, { color: colors.textPrimary }]}>
            Dental Score™
          </Text>
          <Text style={[cs.subtitle, { color: '#C9A84C' }]}>
            Digitálny dvojník tvojho chrupu
          </Text>

          {/* Čo to je */}
          <View style={[cs.infoBox, { backgroundColor: dark ? '#1A1209' : '#F5F0EA', borderColor: colors.bg3 }]}>
            <Text style={[cs.infoText, { color: colors.textPrimary }]}>
              Dental Score™ ti ukáže aktuálny stav chrupu, 5-ročnú predikciu vývoja a cenové porovnanie prevencie vs. neskoršieho ošetrenia.
            </Text>
          </View>

          {/* Disclaimer — povinný podľa spec */}
          <View style={[cs.warningBox, { backgroundColor: dark ? '#2D1500' : '#FEF9E7', borderColor: dark ? '#7D4800' : '#F9E79F' }]}>
            <Ionicons name="warning-outline" size={16} color={dark ? '#F0A030' : '#B87333'} />
            <Text style={[cs.warningText, { color: dark ? '#F0A030' : '#7D4800' }]}>
              Predikcia je orientačná, založená na klinických štatistikách a tvojich rizikových faktoroch. Nenahrádza odbornú diagnostiku zubného lekára.
            </Text>
          </View>

          {/* Aktivácia po návšteve */}
          <View style={[cs.noteBox, { borderColor: colors.bg3 }]}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
            <Text style={[cs.noteText, { color: colors.textSecondary }]}>
              Presné predikcie sa aktivujú po prvej návšteve v klinike, keď doktor zadá stav tvojich zubov.
            </Text>
          </View>

          {/* Tlačidlo */}
          <TouchableOpacity style={cs.btn} onPress={onAccept} activeOpacity={0.88}>
            <LinearGradient colors={['#B8973A', '#C9A84C']} style={cs.btnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
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
  iconWrap:    { alignItems: 'center', marginBottom: 12 },
  title:       { fontSize: 26, fontFamily: 'PlayfairDisplay_700Bold', textAlign: 'center', marginBottom: 4 },
  subtitle:    { fontSize: 13, fontFamily: 'DMSans_500Medium', textAlign: 'center', letterSpacing: 1, marginBottom: 18 },
  infoBox:     { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 12 },
  infoText:    { fontSize: 13, lineHeight: 20, fontFamily: 'DMSans_500Medium' },
  warningBox:  { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 12 },
  warningText: { flex: 1, fontSize: 12, lineHeight: 18 },
  noteBox:     { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 20 },
  noteText:    { flex: 1, fontSize: 11, lineHeight: 17 },
  btn:         { borderRadius: 14, overflow: 'hidden' },
  btnGrad:     { paddingVertical: 15, alignItems: 'center' },
  btnTxt:      { fontSize: 15, fontFamily: 'DMSans_500Medium', color: '#1A1209' },
});

// ─── Risk Panel ───────────────────────────────────────────────────────────────
const HYGIENE_OPTS: { label: string; emoji: string; value: number }[] = [
  { label: 'Nízka',    emoji: '😬', value: 3 },
  { label: 'Stredná',  emoji: '😊', value: 7 },
  { label: 'Výborná',  emoji: '🌟', value: 9 },
];

const RiskPanel = React.memo(({
  risk, onChange,
}: { risk: RiskFactors; onChange: (patch: Partial<RiskFactors>) => void }) => {
  const { dark } = useAppTheme();
  const [open, setOpen] = useState(false);

  const toggleRow = (
    key: 'smoking' | 'diabetes' | 'bruxism',
    label: string,
    emoji: string,
    hint: string,
  ) => (
    <TouchableOpacity
      style={[s.riskRow, { borderColor: dark ? '#2A1F14' : '#222' }]}
      onPress={() => onChange({ [key]: !risk[key] })}
      activeOpacity={0.75}
    >
      <Text style={s.riskEmoji}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[s.riskLabel, { color: dark ? '#FAF6F0' : '#FAF6F0' }]}>{label}</Text>
        <Text style={s.riskHint}>{hint}</Text>
      </View>
      <View style={[s.toggle, { backgroundColor: risk[key] ? '#E74C3C' : '#333' }]}>
        <View style={[s.thumb, risk[key] && s.thumbOn]} />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[s.riskCard, { borderColor: dark ? '#2A1F14' : '#222' }]}>
      {/* Header — vždy viditeľný */}
      <TouchableOpacity
        style={s.riskHeader}
        onPress={() => setOpen(v => !v)}
        activeOpacity={0.8}
      >
        <Ionicons name="options-outline" size={15} color="#C9A84C" />
        <Text style={s.riskHeaderTxt}>Moje rizikové faktory</Text>
        <View style={s.riskSummary}>
          {risk.smoking  && <Text style={s.riskChip}>🚬</Text>}
          {risk.diabetes && <Text style={s.riskChip}>💉</Text>}
          {risk.bruxism  && <Text style={s.riskChip}>😬</Text>}
          <Text style={s.riskChip}>
            {HYGIENE_OPTS.find(o => o.value === risk.hygiene)?.emoji ?? '😊'}
          </Text>
        </View>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={15} color="#555"
        />
      </TouchableOpacity>

      {/* Rozbalený panel */}
      {open && (
        <View style={s.riskBody}>
          {toggleRow('smoking',  'Fajčenie',   '🚬', 'Urýchľuje degradáciu ďasien a zubov')}
          {toggleRow('diabetes', 'Diabetes',   '💉', 'Zvyšuje riziko parodontozy')}
          {toggleRow('bruxism',  'Bruxizmus',  '😬', 'Škrípanie zubami opotrebúva korunky')}

          {/* Hygiena — 3 tlačidlá */}
          <View style={[s.riskRow, { borderColor: dark ? '#2A1F14' : '#222' }]}>
            <Text style={s.riskEmoji}>🪥</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.riskLabel, { color: '#FAF6F0' }]}>Ústna hygiena</Text>
              <Text style={s.riskHint}>Frekvencia a kvalita čistenia</Text>
            </View>
          </View>
          <View style={s.hygieneRow}>
            {HYGIENE_OPTS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  s.hygieneBtn,
                  { borderColor: risk.hygiene === opt.value ? '#C9A84C' : '#333',
                    backgroundColor: risk.hygiene === opt.value ? '#2D2000' : '#1A1A1A' },
                ]}
                onPress={() => onChange({ hygiene: opt.value })}
                activeOpacity={0.75}
              >
                <Text style={{ fontSize: 18 }}>{opt.emoji}</Text>
                <Text style={[s.hygieneLbl, {
                  color: risk.hygiene === opt.value ? '#C9A84C' : '#555',
                }]}>{opt.label}</Text>
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

// ─── Score Ring (SVG animated) — premium design ─────────────────────────────
const RING_SIZE = 200;
const RING_R    = 82;
const RING_CIRC = 2 * Math.PI * RING_R;

const ScoreRing = React.memo(({ score }: { score: number }) => {
  const { dark } = useAppTheme();
  const info = scoreInfo(score);

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
      {/* Glow efekt pod ringom */}
      <View style={[s.ringGlow, { backgroundColor: info.ring, shadowColor: info.ring }]} />
      <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
        {/* Vonkajší track — tenký accent */}
        <Circle cx={cx} cy={cx} r={RING_R + 8}
          stroke={dark ? 'rgba(201,168,76,0.06)' : 'rgba(30,30,30,0.08)'}
          strokeWidth={1} fill="none" />
        {/* Hlavný track */}
        <Circle cx={cx} cy={cx} r={RING_R}
          stroke={dark ? '#1E1610' : '#1E1E1E'}
          strokeWidth={12} fill="none" />
        {/* Progress arc */}
        <Circle cx={cx} cy={cx} r={RING_R}
          stroke={info.ring}
          strokeWidth={12} fill="none"
          strokeDasharray={RING_CIRC}
          strokeDashoffset={offset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${cx}, ${cx}`}
        />
        {/* Vnútorný accent ring */}
        <Circle cx={cx} cy={cx} r={RING_R - 8}
          stroke={dark ? 'rgba(201,168,76,0.04)' : 'rgba(30,30,30,0.05)'}
          strokeWidth={0.5} fill="none" />
      </Svg>
      {/* Center text */}
      <View style={s.ringCenter}>
        <Text style={[s.ringScore, { color: info.ring }]}>{displayScore}</Text>
        <Text style={s.ringMax}>/100</Text>
        <View style={[s.ringBadge, { backgroundColor: info.bg, borderColor: `${info.ring}33` }]}>
          <Text style={[s.ringBadgeTxt, { color: info.ring }]}>{info.label}</Text>
        </View>
      </View>
    </View>
  );
});

// ─── Quadrant blok — premium design ──────────────────────────────────────────
const QuadrantBlock = React.memo(({
  label, fdis, teeth, baseTeeth, side, onPressTooth,
}: {
  label: string; fdis: number[];
  teeth: Record<number, ToothStatus>;
  baseTeeth: Record<number, ToothStatus>;
  side: 'left' | 'right';
  onPressTooth: (fdi: number) => void;
}) => {
  const { dark } = useAppTheme();
  const issues  = fdis.filter(f => (teeth[f] ?? 'healthy') !== 'healthy').length;
  const changed = new Set(fdis.filter(f => (baseTeeth[f] ?? 'healthy') !== (teeth[f] ?? 'healthy')));

  const statusColor = issues === 0 ? '#27AE60' : issues <= 2 ? '#F39C12' : '#E74C3C';
  const statusBg    = issues === 0 ? '#0D3B1F' : issues <= 2 ? '#2D1500' : '#3A0E0E';

  return (
    <View style={[s.quadrant, { backgroundColor: dark ? '#110E09' : '#141414', borderColor: `${statusColor}30` }]}>
      {/* Hlavička */}
      <View style={s.quadHeader}>
        <Text style={[s.quadLabel, { color: dark ? '#8B7355' : '#777' }]}>{label}</Text>
        <View style={[s.quadBadge, { backgroundColor: statusBg }]}>
          <View style={[s.quadBadgeDot, { backgroundColor: statusColor }]} />
          <Text style={[s.quadBadgeTxt, { color: statusColor }]}>
            {issues === 0 ? 'OK' : `${issues}`}
          </Text>
        </View>
      </View>

      {/* Tooth dots — 2 riadky po 4 */}
      <View style={s.dotGrid}>
        {fdis.map(fdi => {
          const st        = teeth[fdi] ?? 'healthy';
          const isChanged = changed.has(fdi);
          const color     = dotColor(st);
          return (
            <TouchableOpacity key={fdi} onPress={() => onPressTooth(fdi)} activeOpacity={0.6} style={s.toothWrap}>
              <View style={[
                s.toothDot,
                { backgroundColor: color },
                isChanged && [s.toothDotChanged, { borderColor: '#fff', shadowColor: color }],
              ]} />
              <Text style={[s.toothNum, { color: st === 'healthy' ? (dark ? '#444' : '#666') : color }]}>
                {fdi}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
});

// ─── Year Card (horizontal timeline) — premium ──────────────────────────────
const YearCard = React.memo(({
  year, newIssues, cumCost, active, onPress,
}: {
  year: number; newIssues: number; cumCost: number;
  active: boolean; onPress: () => void;
}) => {
  const { dark } = useAppTheme();
  const color = newIssues === 0 ? '#27AE60' : newIssues <= 2 ? '#E67E22' : '#E74C3C';
  const bg    = active
    ? (newIssues === 0 ? '#0D3B1F' : newIssues <= 2 ? '#2D1500' : '#4A1010')
    : (dark ? '#110E09' : '#1A1A1A');

  return (
    <TouchableOpacity
      style={[s.yearCard, { backgroundColor: bg, borderColor: active ? color : (dark ? '#2A1F14' : '#333') }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[s.yearCardLabel, { color: active ? color : (dark ? '#8B7355' : '#666') }]}>
        {year === 0 ? 'DNES' : `+${year}R`}
      </Text>
      <Text style={[s.yearCardIssues, { color }]}>
        {newIssues === 0 ? '✓' : newIssues}
      </Text>
      {cumCost > 0 && (
        <Text style={[s.yearCardCost, { color: active ? color : '#666' }]}>
          {cumCost} €
        </Text>
      )}
    </TouchableOpacity>
  );
});

// ─── Tooth Detail Modal ───────────────────────────────────────────────────────
type HistoryRecord = { status: string; notes: string | null; created_at: string };

function ToothModal({
  fdi, snapshots, visible, onClose, onBook,
}: {
  fdi: number; snapshots: ReturnType<typeof generatePredictions>;
  visible: boolean; onClose: () => void; onBook: () => void;
}) {
  const { colors, dark } = useAppTheme();
  const [history,     setHistory]     = useState<HistoryRecord[]>([]);
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
  const cfg     = STATUS_CFG[present] ?? { label: present, color: '#FFE082', darkColor: '#FFB300', glowColor: '#FF9800', emoji: '🟠', severity: 2 };
  const name    = toothName(fdi);
  const future  = snapshots.slice(1).filter(s => s.newIssues.some(i => i.tooth === fdi));

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('sk-SK', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.sheet, { backgroundColor: colors.cardBg }]}>
          <View style={[s.handle, { backgroundColor: colors.bg3 }]} />

          {/* Hlavička */}
          <View style={s.sheetHeader}>
            <View style={[s.statusDot, { backgroundColor: cfg.glowColor ?? cfg.darkColor }]} />
            <View style={{ flex: 1 }}>
              <Text style={[s.sheetTitle, { color: colors.textPrimary }]}>Zub {fdi}</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary }}>{name}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
            {/* Súčasný stav */}
            <View style={[s.statusCard, { backgroundColor: dark ? '#1A1209' : '#F8F5F0', borderColor: colors.bg3 }]}>
              <Text style={{ fontSize: 26 }}>{cfg.emoji}</Text>
              <View>
                <Text style={{ fontSize: 9, fontFamily: 'DMSans_500Medium', letterSpacing: 1, color: colors.textSecondary, marginBottom: 2 }}>SÚČASNÝ STAV</Text>
                <Text style={{ fontSize: 15, fontFamily: 'DMSans_500Medium', color: colors.textPrimary }}>{cfg.label}</Text>
              </View>
            </View>

            {/* História z dental_records */}
            <View style={{ marginBottom: 14 }}>
              <Text style={[s.modalSectionLabel, { color: colors.textSecondary }]}>📅 HISTÓRIA OŠETRENÍ</Text>
              {histLoading ? (
                <ActivityIndicator size="small" color={colors.textSecondary} style={{ marginVertical: 8 }} />
              ) : history.length === 0 ? (
                <View style={[s.histEmpty, { backgroundColor: dark ? '#1A1209' : '#F5F0EA', borderColor: colors.bg3 }]}>
                  <Ionicons name="document-outline" size={15} color={colors.textSecondary} />
                  <Text style={{ fontSize: 12, color: colors.textSecondary, flex: 1 }}>
                    Zatiaľ žiadny doktorský záznam pre tento zub
                  </Text>
                </View>
              ) : (
                history.map((rec, i) => {
                  const recCfg = Object.values(STATUS_CFG).find(c => c.label.toLowerCase() === rec.status.toLowerCase());
                  return (
                    <View key={i} style={[s.histRow, { borderColor: colors.bg3 }]}>
                      <View style={[s.histDot, { backgroundColor: recCfg?.glowColor ?? colors.bg3 }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, fontFamily: 'DMSans_500Medium', color: colors.textPrimary }}>
                          {rec.status}
                        </Text>
                        {rec.notes ? (
                          <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 1 }} numberOfLines={2}>
                            {rec.notes}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={{ fontSize: 10, color: colors.textSecondary, marginLeft: 8 }}>
                        {formatDate(rec.created_at)}
                      </Text>
                    </View>
                  );
                })
              )}
            </View>

            {/* Predikcia */}
            {future.length > 0 ? (
              <View style={{ marginBottom: 14 }}>
                <Text style={[s.modalSectionLabel, { color: colors.textSecondary }]}>🔮 PREDIKCIA</Text>
                {future.map(snap => {
                  const issue   = snap.newIssues.find(i => i.tooth === fdi)!;
                  const nextCfg = STATUS_CFG[issue.toStatus];
                  return (
                    <View key={snap.year} style={[s.issueRow, { borderColor: colors.bg3 }]}>
                      <Text style={{ fontSize: 12, fontFamily: 'DMSans_500Medium', width: 36, color: '#E74C3C' }}>+{snap.year}r</Text>
                      <Text style={{ flex: 1, fontSize: 12, fontFamily: 'DMSans_500Medium', color: colors.textPrimary }}>{nextCfg?.label ?? issue.toStatus}</Text>
                      <Text style={{ fontSize: 11, width: 36, textAlign: 'right', color: '#E74C3C' }}>{Math.round(issue.probability * 100)}%</Text>
                      <Text style={{ fontSize: 11, width: 52, textAlign: 'right', color: colors.textSecondary }}>~{issue.cost} €</Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={[s.okBanner, { backgroundColor: dark ? '#0D3B1F' : '#EAFAF1', borderColor: dark ? '#27AE6044' : '#A9DFBF' }]}>
                <Ionicons name="checkmark-circle" size={17} color={dark ? '#58D68D' : '#1E8449'} />
                <Text style={{ flex: 1, fontSize: 13, fontFamily: 'DMSans_500Medium', color: dark ? '#58D68D' : '#1E8449' }}>
                  V horizonte 5 rokov bez predpokladanej zmeny ✓
                </Text>
              </View>
            )}

          </ScrollView>

          <TouchableOpacity style={[s.bookBtn, { marginTop: 12 }]} onPress={onBook} activeOpacity={0.88}>
            <Ionicons name="calendar-outline" size={15} color="#fff" />
            <Text style={s.bookBtnTxt}>Rezervovať prehliadku</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 10, textAlign: 'center', color: colors.textSecondary, lineHeight: 14, marginTop: 8 }}>
            Predikcia je orientačná. Nenahrádza odbornú diagnostiku.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

// ─── Past Visit Card ─────────────────────────────────────────────────────────
const PastVisitCard = React.memo(({
  date, active, onPress,
}: { date: string; active: boolean; onPress: () => void }) => {
  const { dark } = useAppTheme();
  const label = new Date(date).toLocaleDateString('sk-SK', { month: 'short', year: '2-digit' });
  return (
    <TouchableOpacity
      style={[s.pastCard, {
        backgroundColor: active ? '#2D1800' : (dark ? '#1A1209' : '#1A1A1A'),
        borderColor: active ? '#C9A84C' : (dark ? '#3D2E22' : '#333'),
      }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Ionicons name="time-outline" size={11} color={active ? '#C9A84C' : '#555'} />
      <Text style={[s.pastCardLabel, { color: active ? '#C9A84C' : '#555' }]}>{label}</Text>
      <Ionicons name="checkmark-circle" size={10} color={active ? '#C9A84C' : '#333'} />
    </TouchableOpacity>
  );
});

// ─── Hlavná obrazovka ─────────────────────────────────────────────────────────
export default function DentalTwinScreen() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();

  const [rawTeeth,      setRawTeeth]      = useState<Record<number, ToothStatus>>({});
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [year,          setYear]          = useState(0);
  const [selected,      setSelected]      = useState<number | null>(null);
  const [showModal,     setShowModal]     = useState(false);
  const [showConsent,   setShowConsent]   = useState(false);
  const [pastVisits,    setPastVisits]    = useState<{ date: string; teeth: Record<number, ToothStatus> }[]>([]);
  const [selectedVisit, setSelectedVisit] = useState<number>(-1); // -1 = current/predicted

  const [risk, setRisk] = useState<RiskFactors>({
    smoking: false, diabetes: false, bruxism: false, hygiene: 7,
  });

  // Načítaj uložené rizikové faktory + consent flag
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

  // Krok 4 — uložiť predikcie do dental_snapshots (background)
  useEffect(() => {
    if (loading || Object.keys(rawTeeth).length === 0) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) saveSnapshotsToDb(user.id, snapshots, risk).catch(() => {});
    });
  }, [snapshots]);

  // Krok 5 — načítať reálne historické snapshoty (minulé návštevy)
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
          // De-duplikuj podľa dátumu — berieme len najnovší snapshot za deň
          const seen = new Set<string>();
          const visits = data
            .filter(r => { if (seen.has(r.snapshot_date)) return false; seen.add(r.snapshot_date); return true; })
            .map(r => ({ date: r.snapshot_date, teeth: r.tooth_states as Record<number, ToothStatus> }));
          setPastVisits(visits);
        });
    });
    return () => { cancelled = true; };
  }, [rawTeeth]);

  // displayTeeth: historická návšteva > predikovaný rok > aktuálny stav
  const currentTeeth = selectedVisit >= 0
    ? (pastVisits[selectedVisit]?.teeth ?? rawTeeth)
    : (snapshots[year]?.teeth ?? rawTeeth);
  const score        = useMemo(() => calcScore(rawTeeth), [rawTeeth]);
  const info         = scoreInfo(score);

  // Quick stats
  const stats = useMemo(() => {
    const all = Object.values(rawTeeth);
    return {
      healthy:  all.filter(s => s === 'healthy').length,
      issues:   all.filter(s => ['caries_deep','caries_initial','endo','extracted'].includes(s)).length,
      watch:    all.filter(s => s === 'watch').length,
      treated:  all.filter(s => ['filling','crown','inlay','implant'].includes(s)).length,
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

    // Map chart statuses to prediction engine statuses
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

    // Ak doktor ešte nezaznamenal žiadne zuby — defaultuj všetkých 32 ako zdravé
    // Toto zaistí, že predikcia má na čom pracovať
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

  if (loading) {
    return (
      <View style={[s.safe, { backgroundColor: '#0A0806', alignItems: 'center', justifyContent: 'center' }]}>
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(201,168,76,0.06)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(201,168,76,0.1)' }}>
          <ActivityIndicator color="#C9A84C" size="large" />
        </View>
        <Text style={{ fontSize: 14, fontFamily: 'DMSans_500Medium', color: '#C9A84C', letterSpacing: 0.5 }}>
          Analyzujem tvoj chrup...
        </Text>
        <Text style={{ fontSize: 11, fontFamily: 'DMSans_500Medium', color: '#555', marginTop: 4 }}>
          Pripravujem 5-ročnú predikciu
        </Text>
      </View>
    );
  }

  return (
    <View style={[s.safe, { backgroundColor: '#0A0806' }]}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.8}>
            <Ionicons name="chevron-back" size={20} color="#C9A84C" />
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
          contentContainerStyle={{ paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor="#C9A84C" />}
        >

          {/* ── Score Ring ── */}
          <View style={s.scoreSection}>
            <ScoreRing score={score} />
          </View>

          {/* ── Quick Stats — card row ── */}
          <View style={s.statsRow}>
            {[
              { val: stats.healthy, lbl: 'Zdravých',    icon: 'checkmark-circle' as const, color: '#27AE60', bg: '#0D3B1F' },
              { val: stats.issues,  lbl: 'Problémov',   icon: 'alert-circle' as const,     color: '#E74C3C', bg: '#3A0E0E' },
              { val: stats.watch,   lbl: 'Sledovanie',  icon: 'eye' as const,              color: '#F39C12', bg: '#2D1500' },
              { val: stats.treated, lbl: 'Ošetrených',  icon: 'shield-checkmark' as const, color: '#C9A84C', bg: '#2D2000' },
            ].map(({ val, lbl, icon, color, bg }) => (
              <View key={lbl} style={[s.statCard, { backgroundColor: bg, borderColor: `${color}20` }]}>
                <Ionicons name={icon} size={14} color={color} />
                <Text style={[s.statNum, { color }]}>{val}</Text>
                <Text style={[s.statLbl, { color: `${color}99` }]}>{lbl}</Text>
              </View>
            ))}
          </View>

          {/* ── Risk Panel ── */}
          <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
            <RiskPanel risk={risk} onChange={updateRisk} />
          </View>

          {/* ── Quadrant Grid ── */}
          <View style={s.section}>
            {/* Banner: história / aktuálny stav / predikcia */}
            {selectedVisit >= 0 ? (
              <View style={[s.yearBanner, { borderColor: 'rgba(201,168,76,0.3)', backgroundColor: 'rgba(201,168,76,0.08)' }]}>
                <Ionicons name="time-outline" size={13} color="#C9A84C" />
                <Text style={[s.yearBannerTxt, { color: '#C9A84C' }]}>
                  HISTÓRIA: {new Date(pastVisits[selectedVisit]?.date ?? '').toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' })}
                </Text>
              </View>
            ) : year === 0 ? (
              <Text style={s.sectionLabel}>VÁŠ CHRUP — AKTUÁLNY STAV</Text>
            ) : (
              <View style={s.yearBanner}>
                <Ionicons name="time-outline" size={13} color="#E74C3C" />
                <Text style={s.yearBannerTxt}>
                  PREDIKCIA: ROK +{year} — zmenené zuby svietia bielym krúžkom
                </Text>
              </View>
            )}
            <View style={s.quadGrid}>
              <QuadrantBlock label="Q2 • Ľavý horný"  fdis={Q2} teeth={currentTeeth} baseTeeth={rawTeeth} side="left"  onPressTooth={handleToothPress} />
              <QuadrantBlock label="Q1 • Pravý horný" fdis={Q1} teeth={currentTeeth} baseTeeth={rawTeeth} side="right" onPressTooth={handleToothPress} />
              <QuadrantBlock label="Q3 • Ľavý dolný"  fdis={Q3} teeth={currentTeeth} baseTeeth={rawTeeth} side="left"  onPressTooth={handleToothPress} />
              <QuadrantBlock label="Q4 • Pravý dolný" fdis={Q4} teeth={currentTeeth} baseTeeth={rawTeeth} side="right" onPressTooth={handleToothPress} />
            </View>
            <Text style={s.tapHint}>Klepni na bodku pre detail zuba</Text>
          </View>

          {/* ── Timeline: minulosť ← DNES → predikcia ── */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>ČASOVÁ OS</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
            >
              {/* Minulosť — reálne snapshoty z návštev */}
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
                  {/* Oddeľovač minulosť / prítomnosť */}
                  <View style={s.timelineSep}>
                    <View style={s.timelineLine} />
                    <Ionicons name="radio-button-on" size={10} color="#C9A84C" />
                    <View style={s.timelineLine} />
                  </View>
                </>
              )}

              {/* Prítomnosť + predikcia */}
              {snapshots.map((snap, i) => (
                <YearCard
                  key={i}
                  year={i}
                  newIssues={snap.newIssues.length}
                  cumCost={snap.cumulativeCost}
                  active={selectedVisit === -1 && year === i}
                  onPress={() => {
                    setSelectedVisit(-1);
                    setYear(i);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                />
              ))}
            </ScrollView>

            {/* Aktívny rok — side panel s counterom (podľa spec) */}
            {year > 0 && snapshots[year].newIssues.length > 0 && (() => {
              const snap        = snapshots[year];
              const prevCost    = PREVENTION_COST * year;
              const savings     = Math.max(0, snap.cumulativeCost - prevCost);

              // Grupuj problémy podľa toStatus
              const grouped = snap.newIssues.reduce((acc, iss) => {
                if (!acc[iss.toStatus]) acc[iss.toStatus] = { teeth: [], cost: 0 };
                acc[iss.toStatus].teeth.push(iss.tooth);
                acc[iss.toStatus].cost += iss.cost;
                return acc;
              }, {} as Record<string, { teeth: number[]; cost: number }>);

              return (
                <View style={[s.counterPanel, { borderColor: dark ? '#3D2E22' : '#222' }]}>
                  {/* Hlavička */}
                  <Text style={s.counterTitle}>
                    📋 Rok +{year} — predikované zmeny
                  </Text>

                  {/* Grupované problémy */}
                  {Object.entries(grouped).map(([status, { teeth, cost }]) => {
                    const cfg   = STATUS_CFG[status as ToothStatus];
                    const label = cfg?.label ?? status;
                    const emoji = cfg?.emoji ?? '🔴';
                    const teethStr = teeth.length === 1
                      ? `zub: ${teeth[0]}`
                      : `zuby: ${teeth.join(', ')}`;
                    return (
                      <TouchableOpacity
                        key={status}
                        style={[s.counterRow, { borderColor: dark ? '#2A1F14' : '#1E1E1E' }]}
                        onPress={() => handleToothPress(teeth[0])}
                        activeOpacity={0.75}
                      >
                        <Text style={s.counterEmoji}>{emoji}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={s.counterLabel}>
                            {teeth.length}× {label}
                          </Text>
                          <Text style={s.counterTeeth}>({teethStr})</Text>
                        </View>
                        <Text style={s.counterCost}>~{cost} €</Text>
                      </TouchableOpacity>
                    );
                  })}

                  {/* Divider */}
                  <View style={[s.counterDivider, { backgroundColor: dark ? '#2A1F14' : '#222' }]} />

                  {/* Súhrnné riadky — spec formát */}
                  <View style={s.counterSummary}>
                    <View style={s.counterSummaryRow}>
                      <Text style={s.counterSummaryEmoji}>💰</Text>
                      <Text style={s.counterSummaryLabel}>Odhad ošetrenia:</Text>
                      <Text style={[s.counterSummaryVal, { color: '#E74C3C' }]}>
                        {snap.cumulativeCost} €
                      </Text>
                    </View>
                    <View style={s.counterSummaryRow}>
                      <Text style={s.counterSummaryEmoji}>💚</Text>
                      <Text style={s.counterSummaryLabel}>Cena prevencie dnes:</Text>
                      <Text style={[s.counterSummaryVal, { color: '#58D68D' }]}>
                        {prevCost} €
                      </Text>
                    </View>
                    {savings > 0 && (
                      <View style={[s.counterSavingsRow, { backgroundColor: '#0D3B1F' }]}>
                        <Text style={s.counterSummaryEmoji}>📊</Text>
                        <Text style={[s.counterSummaryLabel, { color: '#58D68D' }]}>
                          Úspora pri prevencii:
                        </Text>
                        <Text style={[s.counterSummaryVal, { color: '#58D68D', fontSize: 16 }]}>
                          {savings} €
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })()}
            {year > 0 && snapshots[year].newIssues.length === 0 && (
              <View style={[s.yearOK, { backgroundColor: dark ? '#0D3B1F' : '#0D3B1F' }]}>
                <Ionicons name="checkmark-circle" size={17} color="#58D68D" />
                <Text style={{ flex: 1, fontSize: 13, fontFamily: 'DMSans_500Medium', color: '#58D68D' }}>
                  Rok +{year} bez predpokladaných nových komplikácií ✓
                </Text>
              </View>
            )}
          </View>

          {/* ── Cenové porovnanie ── */}
          {snapshots[5]?.cumulativeCost > 0 && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>5-ROČNÉ POROVNANIE</Text>
              <View style={s.compareRow}>
                <View style={[s.compareBox, { backgroundColor: '#0D3B1F', borderColor: 'rgba(39,174,96,0.2)' }]}>
                  <Ionicons name="shield-checkmark" size={24} color="#58D68D" />
                  <Text style={[s.compareVal, { color: '#58D68D' }]}>{PREVENTION_COST * 5} €</Text>
                  <Text style={s.compareLbl}>Prevencia{'\n'}5× ročná prehliadka</Text>
                </View>
                <View style={s.compareVs}>
                  <Text style={{ fontSize: 11, color: '#555', fontFamily: 'DMSans_500Medium' }}>vs</Text>
                  <Text style={{ fontSize: 12, color: '#58D68D', fontFamily: 'DMSans_500Medium', textAlign: 'center' }}>
                    úspora{'\n'}{Math.max(0, snapshots[5].cumulativeCost - PREVENTION_COST * 5)} €
                  </Text>
                </View>
                <View style={[s.compareBox, { backgroundColor: '#3A0E0E', borderColor: 'rgba(231,76,60,0.2)' }]}>
                  <Ionicons name="warning" size={24} color="#F1948A" />
                  <Text style={[s.compareVal, { color: '#F1948A' }]}>{snapshots[5].cumulativeCost} €</Text>
                  <Text style={s.compareLbl}>Bez prevencie{'\n'}{snapshots.slice(1).reduce((a,snap)=>a+snap.newIssues.length,0)} problémov</Text>
                </View>
              </View>
            </View>
          )}

          {/* ── CTA ── */}
          <TouchableOpacity
            style={{ marginHorizontal: 16, marginTop: 4, borderRadius: 14, overflow: 'hidden' }}
            onPress={() => router.push('/(patient)/book-appointment')}
            activeOpacity={0.88}
          >
            <LinearGradient colors={['#B8973A', '#C9A84C']} style={s.ctaGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name="calendar" size={17} color="#1A1209" />
              <Text style={s.ctaTxt}>Rezervovať preventívnu prehliadku</Text>
            </LinearGradient>
          </TouchableOpacity>

          <Text style={{ fontSize: 10, color: '#333', textAlign: 'center', margin: 16, lineHeight: 15 }}>
            ⚠ Dental Score™ je orientačný nástroj. Nenahrádza odbornú diagnostiku zubného lekára.
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

// ─── Styles — premium dark theme ─────────────────────────────────────────────
const QUAD_W = (W - 32 - 8) / 2;
const s = StyleSheet.create({
  safe: { flex: 1 },

  // Header
  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10, gap: 12 },
  backBtn:        { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(201,168,76,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(201,168,76,0.15)' },
  headerSub:      { fontSize: 9, letterSpacing: 2.5, color: '#C9A84C', fontFamily: 'DMSans_500Medium' },
  headerTitle:    { fontSize: 22, fontFamily: 'PlayfairDisplay_700Bold', color: '#FAF6F0', marginTop: 1 },
  headerScorePill:{ borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  headerScoreVal: { fontSize: 16, fontFamily: 'PlayfairDisplay_700Bold' },

  // Score
  scoreSection: { alignItems: 'center', paddingVertical: 12, paddingBottom: 16 },
  ringWrap:     { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  ringGlow:     { position: 'absolute', width: 100, height: 100, borderRadius: 50, opacity: 0.08, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 60, elevation: 0 },
  ringCenter:   { position: 'absolute', alignItems: 'center' },
  ringScore:    { fontSize: 48, fontFamily: 'PlayfairDisplay_700Bold', lineHeight: 54 },
  ringMax:      { fontSize: 13, color: '#666', fontFamily: 'DMSans_500Medium', marginTop: -4 },
  ringBadge:    { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5, marginTop: 6, borderWidth: 1 },
  ringBadgeTxt: { fontSize: 11, fontFamily: 'DMSans_500Medium', letterSpacing: 1.5 },

  // Stats row — card-based
  statsRow:  { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 16 },
  statCard:  { flex: 1, alignItems: 'center', gap: 4, borderRadius: 12, paddingVertical: 12, borderWidth: 1 },
  statNum:   { fontSize: 20, fontFamily: 'PlayfairDisplay_700Bold' },
  statLbl:   { fontSize: 8, fontFamily: 'DMSans_500Medium', letterSpacing: 0.5, textTransform: 'uppercase' },

  // Sections
  section:      { marginBottom: 20 },
  sectionLabel: { fontSize: 9, letterSpacing: 2, color: '#8B7355', fontFamily: 'DMSans_500Medium', marginBottom: 12, paddingHorizontal: 16 },
  tapHint:      { fontSize: 10, color: '#555', textAlign: 'center', marginTop: 10, fontFamily: 'DMSans_500Medium' },

  // Year-change banner
  yearBanner:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, paddingHorizontal: 14, backgroundColor: 'rgba(231,76,60,0.08)', borderRadius: 10, paddingVertical: 8, marginHorizontal: 16, borderWidth: 1, borderColor: 'rgba(231,76,60,0.2)' },
  yearBannerTxt: { flex: 1, fontSize: 10, color: '#E74C3C', fontFamily: 'DMSans_500Medium', letterSpacing: 0.3 },

  // Quadrant grid — larger dots with FDI numbers
  quadGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  quadrant:        { width: QUAD_W, borderRadius: 14, borderWidth: 1, padding: 12, paddingBottom: 14 },
  quadHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  quadLabel:       { fontSize: 9, fontFamily: 'DMSans_500Medium', letterSpacing: 0.5 },
  quadBadge:       { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  quadBadgeDot:    { width: 6, height: 6, borderRadius: 3 },
  quadBadgeTxt:    { fontSize: 10, fontFamily: 'DMSans_500Medium' },
  dotGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  toothWrap:       { alignItems: 'center', gap: 2, width: (QUAD_W - 24 - 6 * 3) / 4 },
  toothDot:        { width: 22, height: 22, borderRadius: 11 },
  toothDotChanged: { borderWidth: 2.5, transform: [{ scale: 1.1 }], shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 6, elevation: 4 },
  toothNum:        { fontSize: 7, fontFamily: 'DMSans_500Medium' },

  // Year cards
  yearCard:      { width: 76, borderRadius: 14, borderWidth: 1.5, padding: 10, alignItems: 'center', gap: 4 },
  yearCardLabel: { fontSize: 9, fontFamily: 'DMSans_500Medium', letterSpacing: 1 },
  yearCardIssues:{ fontSize: 22, fontFamily: 'PlayfairDisplay_700Bold', lineHeight: 26 },
  yearCardCost:  { fontSize: 9, fontFamily: 'DMSans_500Medium' },

  // Past visit cards + timeline
  pastCard:      { alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 10, minWidth: 58 },
  pastCardLabel: { fontSize: 10, fontFamily: 'DMSans_500Medium' },
  timelineSep:   { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 2 },
  timelineLine:  { width: 12, height: 1, backgroundColor: '#2A1F14' },

  // Year detail / Counter panel
  yearOK:            { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, borderRadius: 14, padding: 14 },
  counterPanel:      { marginHorizontal: 16, marginTop: 12, borderRadius: 16, borderWidth: 1, backgroundColor: '#0D0B08', overflow: 'hidden' },
  counterTitle:      { fontSize: 11, fontFamily: 'DMSans_500Medium', color: '#8B7355', letterSpacing: 0.5, padding: 14, paddingBottom: 10 },
  counterRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1 },
  counterEmoji:      { fontSize: 18, width: 26, textAlign: 'center' },
  counterLabel:      { fontSize: 13, fontFamily: 'DMSans_500Medium', color: '#FAF6F0' },
  counterTeeth:      { fontSize: 10, color: '#666', marginTop: 1 },
  counterCost:       { fontSize: 12, color: '#E74C3C', fontFamily: 'DMSans_500Medium' },
  counterDivider:    { height: 1, marginHorizontal: 14, marginVertical: 4 },
  counterSummary:    { paddingHorizontal: 14, paddingBottom: 14, gap: 6 },
  counterSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  counterSavingsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 12, marginTop: 4 },
  counterSummaryEmoji:{ fontSize: 14, width: 22 },
  counterSummaryLabel:{ flex: 1, fontSize: 12, color: '#888', fontFamily: 'DMSans_500Medium' },
  counterSummaryVal:  { fontSize: 14, fontFamily: 'PlayfairDisplay_700Bold' },

  issueRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1 },
  issueTxt:  { flex: 1, fontSize: 12, fontFamily: 'DMSans_500Medium' },
  cumCostRow:{ borderRadius: 10, padding: 12, marginTop: 12, alignItems: 'center', gap: 4 },

  // Compare
  compareRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  compareBox:  { flex: 1, borderRadius: 14, padding: 16, alignItems: 'center', gap: 8, borderWidth: 1 },
  compareVal:  { fontSize: 22, fontFamily: 'PlayfairDisplay_700Bold' },
  compareLbl:  { fontSize: 9, color: '#888', textAlign: 'center', lineHeight: 14, fontFamily: 'DMSans_500Medium' },
  compareVs:   { alignItems: 'center', gap: 4, width: 50 },

  // CTA
  ctaGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
  ctaTxt:  { fontSize: 14, fontFamily: 'DMSans_500Medium', color: '#1A1209' },

  // Modal
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  sheet:      { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 40 },
  handle:     { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  sheetHeader:{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  statusDot:  { width: 14, height: 14, borderRadius: 7 },
  sheetTitle: { fontSize: 20, fontFamily: 'PlayfairDisplay_700Bold' },
  closeBtn:   { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 14 },
  okBanner:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 14 },
  bookBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2C1F14', borderRadius: 14, paddingVertical: 14, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(201,168,76,0.15)' },
  bookBtnTxt: { fontSize: 14, fontFamily: 'DMSans_500Medium', color: '#FAF6F0' },

  // Modal — história
  modalSectionLabel: { fontSize: 9, letterSpacing: 1.5, fontFamily: 'DMSans_500Medium', marginBottom: 8 },
  histEmpty: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, padding: 12 },
  histRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  histDot:   { width: 10, height: 10, borderRadius: 5, marginTop: 3 },

  // Risk panel
  riskCard:       { backgroundColor: '#0D0B08', borderRadius: 14, borderWidth: 1 },
  riskHeader:     { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
  riskHeaderTxt:  { flex: 1, fontSize: 12, fontFamily: 'DMSans_500Medium', color: '#C9A84C' },
  riskSummary:    { flexDirection: 'row', gap: 4 },
  riskChip:       { fontSize: 14 },
  riskBody:       { paddingHorizontal: 14, paddingBottom: 14 },
  riskRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1 },
  riskEmoji:      { fontSize: 20, width: 28, textAlign: 'center' },
  riskLabel:      { fontSize: 13, fontFamily: 'DMSans_500Medium' },
  riskHint:       { fontSize: 10, color: '#555', marginTop: 1 },
  riskDisclaimer: { fontSize: 9, color: '#555', marginTop: 12, lineHeight: 14 },
  toggle:         { width: 42, height: 24, borderRadius: 12, justifyContent: 'center', paddingHorizontal: 2 },
  thumb:          { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignSelf: 'flex-start' },
  thumbOn:        { alignSelf: 'flex-end' },
  hygieneRow:     { flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 8 },
  hygieneBtn:     { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, gap: 4 },
  hygieneLbl:     { fontSize: 10, fontFamily: 'DMSans_500Medium' },
});
