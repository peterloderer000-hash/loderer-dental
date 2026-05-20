/**
 * Dental Score™ — skóre chrupu ako kreditná karta
 * Animated ring + quadrant grid + swipeable year timeline
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator, Animated, Dimensions, Modal,
  RefreshControl, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
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

// ─── Score Ring (SVG animated) ────────────────────────────────────────────────
const RING_R    = 74;
const RING_CIRC = 2 * Math.PI * RING_R;

function ScoreRing({ score }: { score: number }) {
  const { dark } = useAppTheme();
  const info = scoreInfo(score);

  const [displayScore, setDisplayScore] = useState(0);
  const animVal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setDisplayScore(0);
    let current = 0;
    const timer = setInterval(() => {
      current += Math.ceil((score - current) / 6) || 1;
      if (current >= score) { current = score; clearInterval(timer); }
      setDisplayScore(current);
    }, 20);

    Animated.timing(animVal, {
      toValue: score,
      duration: 900,
      useNativeDriver: false,
    }).start();

    return () => clearInterval(timer);
  }, [score]);

  const offset = RING_CIRC * (1 - displayScore / 100);

  return (
    <View style={s.ringWrap}>
      <Svg width={180} height={180} viewBox="0 0 180 180">
        {/* Track */}
        <Circle cx={90} cy={90} r={RING_R}
          stroke={dark ? '#2A1F14' : '#1E1E1E'}
          strokeWidth={14} fill="none" />
        {/* Progress arc */}
        <Circle cx={90} cy={90} r={RING_R}
          stroke={info.ring}
          strokeWidth={14} fill="none"
          strokeDasharray={RING_CIRC}
          strokeDashoffset={offset}
          strokeLinecap="round"
          rotation="-90"
          origin="90, 90"
        />
      </Svg>
      {/* Center text */}
      <View style={s.ringCenter}>
        <Text style={[s.ringScore, { color: info.ring }]}>{displayScore}</Text>
        <Text style={s.ringMax}>/100</Text>
        <View style={[s.ringBadge, { backgroundColor: info.bg }]}>
          <Text style={[s.ringBadgeTxt, { color: info.ring }]}>{info.label}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Quadrant blok ────────────────────────────────────────────────────────────
function QuadrantBlock({
  label, fdis, teeth, baseTeeth, side, onPressTooth,
}: {
  label: string; fdis: number[];
  teeth: Record<number, ToothStatus>;
  baseTeeth: Record<number, ToothStatus>;
  side: 'left' | 'right';
  onPressTooth: (fdi: number) => void;
}) {
  const { dark } = useAppTheme();
  const issues  = fdis.filter(f => (teeth[f] ?? 'healthy') !== 'healthy').length;
  const changed = new Set(fdis.filter(f => (baseTeeth[f] ?? 'healthy') !== (teeth[f] ?? 'healthy')));
  const align   = side === 'right' ? 'flex-end' : 'flex-start';

  // Farba rámu kvadrantu podľa závažnosti
  const borderColor = issues === 0
    ? (dark ? '#1A3D1F' : '#1A3D1F')
    : issues <= 2
    ? '#7D4800'
    : '#6B1010';

  return (
    <View style={[s.quadrant, { backgroundColor: dark ? '#141209' : '#141414', borderColor }]}>
      {/* Hlavička — label + počet problémov */}
      <View style={[s.quadHeader, { alignItems: align }]}>
        <Text style={[s.quadLabel, { color: dark ? '#666' : '#555' }]}>{label}</Text>
        <View style={[s.quadBadge, {
          backgroundColor: issues === 0 ? '#0D3B1F' : issues <= 2 ? '#2D1800' : '#4A0E0E',
        }]}>
          <Text style={[s.quadBadgeTxt, {
            color: issues === 0 ? '#58D68D' : issues <= 2 ? '#F39C12' : '#E74C3C',
          }]}>
            {issues === 0 ? '✓ OK' : `${issues} ${issues === 1 ? 'problém' : issues < 5 ? 'problémy' : 'problémov'}`}
          </Text>
        </View>
      </View>

      {/* Dots — väčšie, zmenené zuby majú biely ring */}
      <View style={[s.dotRow, { flexDirection: side === 'right' ? 'row-reverse' : 'row' }]}>
        {fdis.map(fdi => {
          const st        = teeth[fdi] ?? 'healthy';
          const isChanged = changed.has(fdi);
          return (
            <TouchableOpacity key={fdi} onPress={() => onPressTooth(fdi)} activeOpacity={0.65}>
              <View style={[
                s.toothDot,
                { backgroundColor: dotColor(st) },
                isChanged && s.toothDotChanged,
              ]}>
                {isChanged && <View style={s.toothDotPulse} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── Year Card (horizontal timeline) ─────────────────────────────────────────
function YearCard({
  year, newIssues, cumCost, active, onPress,
}: {
  year: number; newIssues: number; cumCost: number;
  active: boolean; onPress: () => void;
}) {
  const { dark } = useAppTheme();
  const color = newIssues === 0 ? '#27AE60' : newIssues <= 2 ? '#E67E22' : '#E74C3C';
  const bg    = active
    ? (newIssues === 0 ? '#0D3B1F' : newIssues <= 2 ? '#2D1500' : '#4A1010')
    : (dark ? '#1A1209' : '#1A1A1A');

  return (
    <TouchableOpacity
      style={[s.yearCard, { backgroundColor: bg, borderColor: active ? color : (dark ? '#3D2E22' : '#333') }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[s.yearCardLabel, { color: active ? color : (dark ? '#888' : '#666') }]}>
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
}

// ─── Tooth Detail Modal ───────────────────────────────────────────────────────
function ToothModal({
  fdi, snapshots, visible, onClose, onBook,
}: {
  fdi: number; snapshots: ReturnType<typeof generatePredictions>;
  visible: boolean; onClose: () => void; onBook: () => void;
}) {
  const { colors, dark } = useAppTheme();
  if (!fdi) return null;
  const present = snapshots[0]?.teeth[fdi] ?? 'healthy';
  const cfg     = STATUS_CFG[present];
  const name    = toothName(fdi);
  const future  = snapshots.slice(1).filter(s => s.newIssues.some(i => i.tooth === fdi));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.sheet, { backgroundColor: colors.cardBg }]}>
          <View style={[s.handle, { backgroundColor: colors.bg3 }]} />
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

          <View style={[s.statusCard, { backgroundColor: dark ? '#1A1209' : '#F8F5F0', borderColor: colors.bg3 }]}>
            <Text style={{ fontSize: 26 }}>{cfg.emoji}</Text>
            <View>
              <Text style={{ fontSize: 9, fontFamily: 'DMSans_500Medium', letterSpacing: 1, color: colors.textSecondary, marginBottom: 2 }}>SÚČASNÝ STAV</Text>
              <Text style={{ fontSize: 15, fontFamily: 'DMSans_500Medium', color: colors.textPrimary }}>{cfg.label}</Text>
            </View>
          </View>

          {future.length > 0 ? (
            <View style={{ marginBottom: 14 }}>
              <Text style={{ fontSize: 9, letterSpacing: 1.5, fontFamily: 'DMSans_500Medium', color: colors.textSecondary, marginBottom: 8 }}>🔮 PREDIKCIA</Text>
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

          <TouchableOpacity style={s.bookBtn} onPress={onBook} activeOpacity={0.88}>
            <Ionicons name="calendar-outline" size={15} color="#fff" />
            <Text style={s.bookBtnTxt}>Rezervovať prehliadku</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 10, textAlign: 'center', color: colors.textSecondary, lineHeight: 14 }}>
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

  const [rawTeeth,   setRawTeeth]   = useState<Record<number, ToothStatus>>({});
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [year,       setYear]       = useState(0);
  const [selected,   setSelected]   = useState<number | null>(null);
  const [showModal,  setShowModal]  = useState(false);

  const [risk] = useState<RiskFactors>({
    smoking: false, diabetes: false, bruxism: false, hygiene: 7,
  });

  const snapshots = useMemo(
    () => generatePredictions(rawTeeth, risk, 5),
    [rawTeeth, risk],
  );

  const currentTeeth = snapshots[year]?.teeth ?? rawTeeth;
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

    const map: Record<number, ToothStatus> = {};
    (charts ?? []).forEach((c: any) => { map[c.tooth_number] = c.status as ToothStatus; });

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
      <View style={[s.safe, { backgroundColor: '#080808', alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color="#C9A84C" size="large" />
        <Text style={{ marginTop: 14, fontSize: 13, fontFamily: 'DMSans_500Medium', color: '#C9A84C' }}>
          Počítam tvoje skóre...
        </Text>
      </View>
    );
  }

  return (
    <View style={[s.safe, { backgroundColor: '#080808' }]}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.8}>
            <Ionicons name="chevron-back" size={22} color="#C9A84C" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerSub}>DENTAL SCORE™</Text>
            <Text style={s.headerTitle}>Tvoj chrup</Text>
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
            {/* Quick stats */}
            <View style={s.statsRow}>
              {[
                { val: stats.healthy, lbl: 'Zdravých', color: '#27AE60' },
                { val: stats.issues,  lbl: 'Problémov', color: '#E74C3C' },
                { val: stats.watch,   lbl: 'Sledovanie', color: '#F39C12' },
                { val: stats.treated, lbl: 'Ošetrených', color: '#C9A84C' },
              ].map(({ val, lbl, color }) => (
                <View key={lbl} style={s.statItem}>
                  <Text style={[s.statNum, { color }]}>{val}</Text>
                  <Text style={s.statLbl}>{lbl}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── Quadrant Grid ── */}
          <View style={s.section}>
            {/* Year-change banner — viditeľný keď nie sme v roku 0 */}
            {year === 0 ? (
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

          {/* ── 5-ročný výhľad (horizontal cards) ── */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>5-ROČNÝ VÝHĽAD</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
            >
              {snapshots.map((snap, i) => (
                <YearCard
                  key={i}
                  year={i}
                  newIssues={snap.newIssues.length}
                  cumCost={snap.cumulativeCost}
                  active={year === i}
                  onPress={() => {
                    setYear(i);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                />
              ))}
            </ScrollView>

            {/* Aktívny rok — zoznam zmien */}
            {year > 0 && snapshots[year].newIssues.length > 0 && (
              <View style={[s.yearDetail, { backgroundColor: dark ? '#1A1209' : '#111', borderColor: dark ? '#3D2E22' : '#222' }]}>
                <Text style={s.yearDetailTitle}>Predikované zmeny v roku +{year}</Text>
                {snapshots[year].newIssues.map((iss, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[s.issueRow, { borderColor: dark ? '#3A2A1A' : '#2A2A2A' }]}
                    onPress={() => handleToothPress(iss.tooth)}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 15, width: 24 }}>{STATUS_CFG[iss.toStatus]?.emoji ?? '🔴'}</Text>
                    <Text style={[s.issueTxt, { color: dark ? '#FAF6F0' : '#FAF6F0' }]}>
                      Zub {iss.tooth} — {STATUS_CFG[iss.toStatus]?.label}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#E74C3C', fontFamily: 'DMSans_500Medium' }}>
                      ~{iss.cost} €
                    </Text>
                  </TouchableOpacity>
                ))}
                <View style={[s.cumCostRow, { backgroundColor: '#4A1010' }]}>
                  <Text style={{ fontSize: 11, color: '#F1948A', fontFamily: 'DMSans_500Medium' }}>Kumulatívne náklady bez prevencie</Text>
                  <Text style={{ fontSize: 20, color: '#E74C3C', fontFamily: 'PlayfairDisplay_700Bold' }}>
                    {snapshots[year].cumulativeCost} €
                  </Text>
                </View>
              </View>
            )}
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
                <View style={[s.compareBox, { backgroundColor: '#0D3B1F' }]}>
                  <Ionicons name="shield-checkmark" size={22} color="#58D68D" />
                  <Text style={[s.compareVal, { color: '#58D68D' }]}>{PREVENTION_COST * 5} €</Text>
                  <Text style={s.compareLbl}>Prevencia{'\n'}5× ročná prehliadka</Text>
                </View>
                <View style={s.compareVs}>
                  <Text style={{ fontSize: 11, color: '#555', fontFamily: 'DMSans_500Medium' }}>vs</Text>
                  <Text style={{ fontSize: 11, color: '#58D68D', fontFamily: 'DMSans_500Medium', textAlign: 'center' }}>
                    úspora{'\n'}{Math.max(0, snapshots[5].cumulativeCost - PREVENTION_COST * 5)} €
                  </Text>
                </View>
                <View style={[s.compareBox, { backgroundColor: '#4A1010' }]}>
                  <Ionicons name="warning" size={22} color="#F1948A" />
                  <Text style={[s.compareVal, { color: '#F1948A' }]}>{snapshots[5].cumulativeCost} €</Text>
                  <Text style={s.compareLbl}>Bez prevencie{'\n'}{snapshots.slice(1).reduce((a,s)=>a+s.newIssues.length,0)} problémov</Text>
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
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1 },

  // Header
  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 14, gap: 12 },
  backBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(201,168,76,0.12)', alignItems: 'center', justifyContent: 'center' },
  headerSub:  { fontSize: 9, letterSpacing: 2.5, color: '#C9A84C', fontFamily: 'DMSans_500Medium' },
  headerTitle:{ fontSize: 22, fontFamily: 'PlayfairDisplay_700Bold', color: '#FAF6F0' },

  // Score
  scoreSection: { alignItems: 'center', paddingVertical: 8, paddingBottom: 20 },
  ringWrap:     { width: 180, height: 180, alignItems: 'center', justifyContent: 'center' },
  ringCenter:   { position: 'absolute', alignItems: 'center' },
  ringScore:    { fontSize: 44, fontFamily: 'PlayfairDisplay_700Bold', lineHeight: 50 },
  ringMax:      { fontSize: 12, color: '#555', fontFamily: 'DMSans_500Medium', marginTop: -4 },
  ringBadge:    { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginTop: 6 },
  ringBadgeTxt: { fontSize: 11, fontFamily: 'DMSans_500Medium', letterSpacing: 1 },

  // Stats row
  statsRow: { flexDirection: 'row', gap: 24, marginTop: 8 },
  statItem: { alignItems: 'center', gap: 2 },
  statNum:  { fontSize: 22, fontFamily: 'PlayfairDisplay_700Bold' },
  statLbl:  { fontSize: 9, color: '#555', fontFamily: 'DMSans_500Medium' },

  // Sections
  section:      { marginBottom: 20 },
  sectionLabel: { fontSize: 9, letterSpacing: 2, color: '#555', fontFamily: 'DMSans_500Medium', marginBottom: 12, paddingHorizontal: 16 },
  tapHint:      { fontSize: 10, color: '#444', textAlign: 'center', marginTop: 8 },

  // Year-change banner
  yearBanner:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, paddingHorizontal: 16, backgroundColor: 'rgba(231,76,60,0.1)', borderRadius: 8, paddingVertical: 7, marginHorizontal: 16, borderWidth: 1, borderColor: 'rgba(231,76,60,0.25)' },
  yearBannerTxt: { flex: 1, fontSize: 10, color: '#E74C3C', fontFamily: 'DMSans_500Medium', letterSpacing: 0.3 },

  // Quadrant grid
  quadGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingHorizontal: 16 },
  quadrant:        { width: (W - 32 - 4) / 2, borderRadius: 12, borderWidth: 1.5, padding: 12 },
  quadHeader:      { marginBottom: 10, gap: 4 },
  quadLabel:       { fontSize: 9, fontFamily: 'DMSans_500Medium', letterSpacing: 0.5, color: '#666' },
  quadBadge:       { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start' },
  quadBadgeTxt:    { fontSize: 10, fontFamily: 'DMSans_500Medium' },
  dotRow:          { flexDirection: 'row', gap: 4, flexWrap: 'nowrap' },
  toothDot:        { width: 15, height: 15, borderRadius: 8 },
  toothDotChanged: { borderWidth: 2.5, borderColor: '#fff', transform: [{ scale: 1.15 }] },
  toothDotPulse:   { position: 'absolute', width: 21, height: 21, borderRadius: 11, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)', top: -3, left: -3 },

  // Year cards
  yearCard:      { width: 72, borderRadius: 12, borderWidth: 1.5, padding: 10, alignItems: 'center', gap: 4 },
  yearCardLabel: { fontSize: 9, fontFamily: 'DMSans_500Medium', letterSpacing: 1 },
  yearCardIssues:{ fontSize: 22, fontFamily: 'PlayfairDisplay_700Bold', lineHeight: 26 },
  yearCardCost:  { fontSize: 9, fontFamily: 'DMSans_500Medium' },

  // Year detail
  yearDetail:      { marginHorizontal: 16, marginTop: 12, borderRadius: 12, borderWidth: 1, padding: 14 },
  yearDetailTitle: { fontSize: 11, fontFamily: 'DMSans_500Medium', color: '#888', marginBottom: 10, letterSpacing: 0.5 },
  yearOK:          { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, borderRadius: 12, padding: 12 },

  issueRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1 },
  issueTxt:  { flex: 1, fontSize: 12, fontFamily: 'DMSans_500Medium' },
  cumCostRow:{ borderRadius: 10, padding: 12, marginTop: 12, alignItems: 'center', gap: 4 },

  // Compare
  compareRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  compareBox:  { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center', gap: 6 },
  compareVal:  { fontSize: 20, fontFamily: 'PlayfairDisplay_700Bold' },
  compareLbl:  { fontSize: 9, color: '#888', textAlign: 'center', lineHeight: 14 },
  compareVs:   { alignItems: 'center', gap: 4, width: 50 },

  // CTA
  ctaGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 15 },
  ctaTxt:  { fontSize: 14, fontFamily: 'DMSans_500Medium', color: '#1A1209' },

  // Modal
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  handle:     { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  sheetHeader:{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  statusDot:  { width: 14, height: 14, borderRadius: 7 },
  sheetTitle: { fontSize: 20, fontFamily: 'PlayfairDisplay_700Bold' },
  closeBtn:   { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 14 },
  okBanner:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 14 },
  bookBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2C1F14', borderRadius: 12, paddingVertical: 14, marginBottom: 12 },
  bookBtnTxt: { fontSize: 14, fontFamily: 'DMSans_500Medium', color: '#FAF6F0' },
});
