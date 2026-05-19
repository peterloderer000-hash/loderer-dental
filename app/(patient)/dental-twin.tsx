/**
 * Dental Twin — Digitálny dvojník chrupu
 * Interaktívna SVG mapa + 5-ročná predikcia vývoja + cenové porovnanie
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ActivityIndicator, Alert, Animated, Dimensions, Modal, PanResponder,
  RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Ellipse, Rect, Text as SvgText, Defs, RadialGradient, Stop, G, Circle,
} from 'react-native-svg';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabase';
import { useAppTheme } from '../../context/ThemeContext';
import {
  generatePredictions, YearSnapshot, ToothStatus, STATUS_CFG,
  toothName, getPredictionSummary, PROCEDURE_COSTS, PREVENTION_COST, RiskFactors,
} from '../../utils/dentalPrediction';

const { width: W } = Dimensions.get('window');
const CHART_W = W - 32;
const DISCLAIMER = 'Predikcia je orientačná, založená na klinických štatistikách. Nenahrádza odbornú diagnostiku.';

// ─── FDI tooth layout (arch shape) ───────────────────────────────────────────
// Pozície pre hornú a dolnú čeľusť — arch tvar (percentá šírky a výšky)
const ARCH_H = 120;

interface ToothPos { fdi: number; x: number; y: number; rx: number; ry: number }

function buildUpperArch(): ToothPos[] {
  // Q1 (upper right, patient view): 18,17,16,15,14,13,12,11
  // Q2 (upper left):  21,22,23,24,25,26,27,28
  const W2 = CHART_W;
  return [
    // Right side (Q1) — back to front
    { fdi:18, x:14,  y:12, rx:12, ry:10 },
    { fdi:17, x:32,  y:18, rx:11, ry:9  },
    { fdi:16, x:50,  y:25, rx:11, ry:9  },
    { fdi:15, x:67,  y:33, rx:9,  ry:8  },
    { fdi:14, x:82,  y:40, rx:9,  ry:8  },
    { fdi:13, x:96,  y:49, rx:7,  ry:8  },
    { fdi:12, x:107, y:57, rx:6,  ry:8  },
    { fdi:11, x:116, y:62, rx:6,  ry:8  },
    // Left side (Q2) — front to back
    { fdi:21, x:W2-116, y:62, rx:6,  ry:8  },
    { fdi:22, x:W2-107, y:57, rx:6,  ry:8  },
    { fdi:23, x:W2-96,  y:49, rx:7,  ry:8  },
    { fdi:24, x:W2-82,  y:40, rx:9,  ry:8  },
    { fdi:25, x:W2-67,  y:33, rx:9,  ry:8  },
    { fdi:26, x:W2-50,  y:25, rx:11, ry:9  },
    { fdi:27, x:W2-32,  y:18, rx:11, ry:9  },
    { fdi:28, x:W2-14,  y:12, rx:12, ry:10 },
  ];
}

function buildLowerArch(): ToothPos[] {
  const W2 = CHART_W;
  return [
    // Q4 (lower right): 48,47,46,45,44,43,42,41
    { fdi:48, x:14,  y:ARCH_H-12, rx:12, ry:10 },
    { fdi:47, x:32,  y:ARCH_H-18, rx:11, ry:9  },
    { fdi:46, x:50,  y:ARCH_H-25, rx:11, ry:9  },
    { fdi:45, x:67,  y:ARCH_H-33, rx:9,  ry:8  },
    { fdi:44, x:82,  y:ARCH_H-40, rx:9,  ry:8  },
    { fdi:43, x:96,  y:ARCH_H-49, rx:7,  ry:8  },
    { fdi:42, x:107, y:ARCH_H-57, rx:6,  ry:8  },
    { fdi:41, x:116, y:ARCH_H-62, rx:6,  ry:8  },
    // Q3 (lower left): 31,32,33,34,35,36,37,38
    { fdi:31, x:W2-116, y:ARCH_H-62, rx:6,  ry:8  },
    { fdi:32, x:W2-107, y:ARCH_H-57, rx:6,  ry:8  },
    { fdi:33, x:W2-96,  y:ARCH_H-49, rx:7,  ry:8  },
    { fdi:34, x:W2-82,  y:ARCH_H-40, rx:9,  ry:8  },
    { fdi:35, x:W2-67,  y:ARCH_H-33, rx:9,  ry:8  },
    { fdi:36, x:W2-50,  y:ARCH_H-25, rx:11, ry:9  },
    { fdi:37, x:W2-32,  y:ARCH_H-18, rx:11, ry:9  },
    { fdi:38, x:W2-14,  y:ARCH_H-12, rx:12, ry:10 },
  ];
}

const UPPER_ARCH = buildUpperArch();
const LOWER_ARCH = buildLowerArch();

// ─── Animated tooth color ─────────────────────────────────────────────────────
function toothFill(status: ToothStatus, isDark: boolean, isPredicted: boolean): string {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.healthy;
  const base = isDark ? cfg.darkColor : cfg.color;
  if (!isPredicted) return base;
  return base; // predikcia — rovnaká farba, ale s efektom
}

function ToothShape({
  pos, status, selected, isPredicted, onPress, pulseAnim,
}: {
  pos: ToothPos;
  status: ToothStatus;
  selected: boolean;
  isPredicted: boolean;
  onPress: () => void;
  pulseAnim?: Animated.Value;
}) {
  const { dark } = useAppTheme();
  const cfg    = STATUS_CFG[status] ?? STATUS_CFG.healthy;
  const fill   = toothFill(status, dark, isPredicted);
  const border = selected ? '#C9A84C' : (isPredicted && cfg.glowColor ? cfg.glowColor : (dark ? '#555' : '#ccc'));
  const bw     = selected ? 2.5 : (isPredicted && cfg.glowColor ? 1.5 : 1);

  return (
    <G onPress={onPress}>
      {/* Glow effect for selected or predicted issues */}
      {(selected || (isPredicted && cfg.severity >= 2)) && (
        <Ellipse
          cx={pos.x} cy={pos.y}
          rx={pos.rx + 4} ry={pos.ry + 4}
          fill={selected ? '#C9A84C' : (cfg.glowColor ?? '#FF9800')}
          opacity={0.3}
        />
      )}
      <Ellipse
        cx={pos.x} cy={pos.y}
        rx={pos.rx} ry={pos.ry}
        fill={fill}
        stroke={border}
        strokeWidth={bw}
        opacity={status === 'missing' || status === 'extracted' ? 0.4 : 1}
      />
      {/* Tooth highlight (top gloss effect) */}
      <Ellipse
        cx={pos.x} cy={pos.y - pos.ry * 0.3}
        rx={pos.rx * 0.5} ry={pos.ry * 0.25}
        fill="rgba(255,255,255,0.45)"
      />
    </G>
  );
}

// ─── SVG Arch Map ─────────────────────────────────────────────────────────────
function ArchMap({
  teeth, selected, predictedTeeth, onSelect,
}: {
  teeth: Record<number, ToothStatus>;
  selected: number | null;
  predictedTeeth: Set<number>;
  onSelect: (fdi: number) => void;
}) {
  const { dark } = useAppTheme();
  const svgH = ARCH_H * 2 + 24;
  const bgColor = dark ? '#1A1209' : '#0D0D0D';
  const divColor = dark ? '#3D3010' : '#2A1F0A';

  return (
    <View style={[s.archWrap, { backgroundColor: bgColor }]}>
      <Svg width={CHART_W} height={svgH}>
        {/* Upper jaw label */}
        <SvgText x={CHART_W / 2} y={8} textAnchor="middle" fontSize={7}
          fill={dark ? '#A08060' : '#6B4F3A'} fontFamily="DMSans_500Medium">
          HORNÁ ČEĽUSŤ
        </SvgText>
        {UPPER_ARCH.map(pos => (
          <ToothShape
            key={pos.fdi}
            pos={{ ...pos, y: pos.y + 12 }}
            status={teeth[pos.fdi] ?? 'healthy'}
            selected={selected === pos.fdi}
            isPredicted={predictedTeeth.has(pos.fdi)}
            onPress={() => onSelect(pos.fdi)}
          />
        ))}

        {/* Divider */}
        <Rect x={0} y={ARCH_H + 14} width={CHART_W} height={1} fill={divColor} />
        <SvgText x={CHART_W / 2} y={ARCH_H + 21} textAnchor="middle" fontSize={7}
          fill={dark ? '#A08060' : '#6B4F3A'} fontFamily="DMSans_500Medium">
          DOLNÁ ČEĽUSŤ
        </SvgText>

        {LOWER_ARCH.map(pos => (
          <ToothShape
            key={pos.fdi}
            pos={{ ...pos, y: pos.y + ARCH_H + 24 }}
            status={teeth[pos.fdi] ?? 'healthy'}
            selected={selected === pos.fdi}
            isPredicted={predictedTeeth.has(pos.fdi)}
            onPress={() => onSelect(pos.fdi)}
          />
        ))}
      </Svg>
    </View>
  );
}

// ─── Timeline Slider ──────────────────────────────────────────────────────────
const HORIZON = 5;
const TRACK_W = W - 64;
const DOT_STEP = TRACK_W / (HORIZON + 1);

function TimelineSlider({
  year, onYearChange,
}: { year: number; onYearChange: (y: number) => void }) {
  const { colors, dark } = useAppTheme();
  const xAnim = useRef(new Animated.Value(year * DOT_STEP)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderMove: (_, g) => {
        const raw  = Math.max(0, Math.min(g.moveX - 32, TRACK_W));
        xAnim.setValue(raw);
        const newY = Math.round(raw / DOT_STEP);
        onYearChange(Math.min(newY, HORIZON));
      },
      onPanResponderRelease: (_, g) => {
        const raw  = Math.max(0, Math.min(g.moveX - 32, TRACK_W));
        const snap = Math.round(raw / DOT_STEP);
        const clamped = Math.min(snap, HORIZON);
        Animated.spring(xAnim, { toValue: clamped * DOT_STEP, useNativeDriver: false }).start();
        onYearChange(clamped);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
    })
  ).current;

  useEffect(() => {
    Animated.spring(xAnim, { toValue: year * DOT_STEP, useNativeDriver: false }).start();
  }, [year]);

  return (
    <View style={s.sliderWrap}>
      <Text style={[s.sliderLabel, { color: colors.textSecondary }]}>Minulosť</Text>
      <View style={s.sliderTrack}>
        {/* Background track */}
        <View style={[s.track, { backgroundColor: dark ? '#3D2E22' : '#E8DDD0' }]} />
        {/* Filled portion */}
        <Animated.View style={[s.trackFill, {
          width: xAnim,
          backgroundColor: year === 0 ? COLORS_TW.gold : '#E74C3C',
        }]} />
        {/* Year dots */}
        {Array.from({ length: HORIZON + 1 }, (_, i) => (
          <TouchableOpacity
            key={i}
            style={[s.dot, {
              left: i * DOT_STEP - 8,
              backgroundColor: i === 0 ? COLORS_TW.gold : i <= year ? '#E74C3C' : (dark ? '#3D2E22' : '#D5C9C0'),
              borderColor:     i === year ? '#fff' : 'transparent',
            }]}
            onPress={() => { onYearChange(i); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            activeOpacity={0.8}
          >
            <Text style={[s.dotLabel, { color: i === year ? '#fff' : (dark ? '#888' : '#999') }]}>
              {i === 0 ? 'Dnes' : `+${i}r`}
            </Text>
          </TouchableOpacity>
        ))}
        {/* Thumb */}
        <Animated.View
          {...panResponder.panHandlers}
          style={[s.thumb, { left: Animated.subtract(xAnim, 14), backgroundColor: year === 0 ? COLORS_TW.gold : '#E74C3C' }]}
        />
      </View>
      <Text style={[s.sliderLabel, { color: colors.textSecondary }]}>+5 rokov</Text>
    </View>
  );
}

// ─── Tooth Detail Modal ───────────────────────────────────────────────────────
function ToothModal({
  fdi, snapshots, visible, onClose, onBook,
}: {
  fdi: number; snapshots: YearSnapshot[]; visible: boolean;
  onClose: () => void; onBook: () => void;
}) {
  const { colors, dark } = useAppTheme();
  if (!fdi) return null;
  const present  = snapshots[0]?.teeth[fdi] ?? 'healthy';
  const cfg      = STATUS_CFG[present];
  const name     = toothName(fdi);

  const future = snapshots.slice(1).filter(s => s.newIssues.some(i => i.tooth === fdi));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={[s.modalSheet, { backgroundColor: colors.cardBg }]}>
          <View style={[s.modalHandle, { backgroundColor: colors.bg3 }]} />

          {/* Header */}
          <View style={s.modalHeader}>
            <View style={[s.modalStatusDot, { backgroundColor: cfg.glowColor ?? cfg.darkColor }]} />
            <View style={{ flex: 1 }}>
              <Text style={[s.modalTitle, { color: colors.textPrimary }]}>Zub {fdi}</Text>
              <Text style={[s.modalSub, { color: colors.textSecondary }]}>{name}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.modalCloseBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Current status */}
          <View style={[s.modalStatusCard, { backgroundColor: dark ? '#1A1209' : '#F8F5F0', borderColor: colors.bg3 }]}>
            <Text style={[s.modalStatusEmoji]}>{cfg.emoji}</Text>
            <View>
              <Text style={[s.modalStatusLabel, { color: colors.textSecondary }]}>SÚČASNÝ STAV</Text>
              <Text style={[s.modalStatusVal, { color: colors.textPrimary }]}>{cfg.label}</Text>
            </View>
          </View>

          {/* Future prediction */}
          {future.length > 0 ? (
            <View style={s.modalSection}>
              <Text style={[s.modalSectionTitle, { color: colors.textSecondary }]}>🔮 PREDIKCIA</Text>
              {future.map(snap => {
                const issue = snap.newIssues.find(i => i.tooth === fdi)!;
                const nextCfg = STATUS_CFG[issue.toStatus];
                return (
                  <View key={snap.year} style={[s.modalIssueRow, { borderColor: colors.bg3 }]}>
                    <Text style={[s.modalIssueYear, { color: COLORS_TW.red }]}>+{snap.year} rok</Text>
                    <Text style={[s.modalIssueText, { color: colors.textPrimary }]}>
                      {nextCfg?.label ?? issue.toStatus}
                    </Text>
                    <Text style={[s.modalIssuePct, { color: COLORS_TW.red }]}>
                      {Math.round(issue.probability * 100)}%
                    </Text>
                    <Text style={[s.modalIssueCost, { color: colors.textSecondary }]}>
                      ~{issue.cost} €
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={[s.modalOKBanner, { backgroundColor: dark ? '#0D3B1F' : '#EAFAF1', borderColor: dark ? '#27AE6044' : '#A9DFBF' }]}>
              <Ionicons name="checkmark-circle" size={18} color={dark ? '#58D68D' : '#1E8449'} />
              <Text style={[s.modalOKText, { color: dark ? '#58D68D' : '#1E8449' }]}>
                V horizonte 5 rokov bez predpokladanej zmeny ✓
              </Text>
            </View>
          )}

          {/* Book button */}
          <TouchableOpacity style={s.modalBookBtn} onPress={onBook} activeOpacity={0.88}>
            <Ionicons name="calendar-outline" size={16} color="#fff" />
            <Text style={s.modalBookText}>Rezervovať prehliadku</Text>
          </TouchableOpacity>

          {/* Disclaimer */}
          <Text style={[s.modalDisclaimer, { color: colors.textSecondary }]}>{DISCLAIMER}</Text>
        </View>
      </View>
    </Modal>
  );
}

// ─── Year Panel ───────────────────────────────────────────────────────────────
function YearPanel({ snap, year, colors, dark }: {
  snap: YearSnapshot; year: number; colors: any; dark: boolean;
}) {
  if (year === 0) {
    const healthy  = Object.values(snap.teeth).filter(s => s === 'healthy').length;
    const issues   = Object.values(snap.teeth).filter(s => s !== 'healthy' && s !== 'missing').length;
    return (
      <View style={[s.panel, { backgroundColor: dark ? '#1A1209' : '#F8F5F0', borderColor: colors.bg3 }]}>
        <Text style={[s.panelTitle, { color: colors.textPrimary }]}>📊 Dnešný stav</Text>
        <View style={s.panelRow}>
          <View style={[s.panelBadge, { backgroundColor: dark ? '#0D3B1F' : '#EAFAF1' }]}>
            <Text style={[s.panelBadgeNum, { color: '#1E8449' }]}>{healthy}</Text>
            <Text style={[s.panelBadgeLabel, { color: '#1E8449' }]}>Zdravých zubov</Text>
          </View>
          <View style={[s.panelBadge, { backgroundColor: issues > 0 ? (dark ? '#4A1010' : '#FDEDEC') : (dark ? '#0D3B1F' : '#EAFAF1') }]}>
            <Text style={[s.panelBadgeNum, { color: issues > 0 ? '#E74C3C' : '#1E8449' }]}>{issues}</Text>
            <Text style={[s.panelBadgeLabel, { color: issues > 0 ? '#E74C3C' : '#1E8449' }]}>Problémov</Text>
          </View>
        </View>
        <Text style={[s.panelHint, { color: colors.textSecondary }]}>Klepni na zub pre detail</Text>
      </View>
    );
  }

  return (
    <View style={[s.panel, { backgroundColor: dark ? '#1A1209' : '#F8F5F0', borderColor: colors.bg3 }]}>
      <Text style={[s.panelTitle, { color: colors.textPrimary }]}>🔮 Rok +{year} (predikcia)</Text>
      {snap.newIssues.length === 0 ? (
        <View style={[s.panelOK, { backgroundColor: dark ? '#0D3B1F' : '#EAFAF1' }]}>
          <Ionicons name="checkmark-circle" size={16} color="#1E8449" />
          <Text style={[s.panelOKText, { color: '#1E8449' }]}>Žiadne nové komplikácie v tomto roku</Text>
        </View>
      ) : (
        <>
          {snap.newIssues.slice(0, 4).map((iss, i) => (
            <View key={i} style={[s.panelIssueRow, { borderColor: colors.bg3 }]}>
              <Text style={s.panelIssueEmoji}>{STATUS_CFG[iss.toStatus]?.emoji ?? '🔴'}</Text>
              <Text style={[s.panelIssueName, { color: colors.textPrimary }]}>
                Zub {iss.tooth} — {STATUS_CFG[iss.toStatus]?.label}
              </Text>
              <Text style={[s.panelIssueCost, { color: COLORS_TW.red }]}>~{iss.cost} €</Text>
            </View>
          ))}
          <View style={[s.panelCostBox, { backgroundColor: dark ? '#4A1010' : '#FDEDEC', borderColor: dark ? '#C0392B33' : '#F5B7B1' }]}>
            <Text style={[s.panelCostLabel, { color: COLORS_TW.red }]}>Kumulatívne náklady</Text>
            <Text style={[s.panelCostVal, { color: COLORS_TW.red }]}>{snap.cumulativeCost} €</Text>
          </View>
          <View style={[s.panelSavings, { backgroundColor: dark ? '#0D3B1F' : '#EAFAF1', borderColor: dark ? '#27AE6044' : '#A9DFBF' }]}>
            <Ionicons name="shield-checkmark" size={14} color="#1E8449" />
            <Text style={[s.panelSavingsText, { color: '#1E8449' }]}>
              Prevencia dnes: {PREVENTION_COST * year} € · Úspora: {Math.max(0, snap.cumulativeCost - PREVENTION_COST * year)} €
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

// ─── Konštanty ────────────────────────────────────────────────────────────────
const COLORS_TW = {
  bg:    '#0D0D0D',
  card:  '#141414',
  gold:  '#C9A84C',
  red:   '#E74C3C',
  green: '#27AE60',
};

// ─── Hlavná obrazovka ─────────────────────────────────────────────────────────
export default function DentalTwinScreen() {
  const router  = useRouter();
  const { colors, dark } = useAppTheme();

  const [rawTeeth,   setRawTeeth]   = useState<Record<number, ToothStatus>>({});
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [year,       setYear]       = useState(0);
  const [selected,   setSelected]   = useState<number | null>(null);
  const [showModal,  setShowModal]  = useState(false);

  // Rizikové faktory (z health passport, defaulty)
  const [risk] = useState<RiskFactors>({ smoking: false, diabetes: false, bruxism: false, hygiene: 7 });

  // Predikcia (memoized)
  const snapshots = useMemo(
    () => generatePredictions(rawTeeth, risk, HORIZON),
    [rawTeeth, risk],
  );

  const currentSnap  = snapshots[year] ?? snapshots[0];
  const displayTeeth = currentSnap?.teeth ?? rawTeeth;

  // Zuby ktoré sa zmenili v aktuálnom roku voči dnešku
  const predictedTeeth = useMemo(() => {
    const changed = new Set<number>();
    snapshots.slice(1, year + 1).forEach(s => s.newIssues.forEach(i => changed.add(i.tooth)));
    return changed;
  }, [snapshots, year]);

  const summary = useMemo(() => getPredictionSummary(snapshots), [snapshots]);

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
    setRawTeeth(map);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { load(); }, []);

  function handleToothPress(fdi: number) {
    setSelected(fdi === selected ? null : fdi);
    if (fdi !== selected) {
      setShowModal(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }

  if (loading) {
    return (
      <View style={[s.safe, { backgroundColor: COLORS_TW.bg, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={COLORS_TW.gold} size="large" />
        <Text style={[s.loadingText, { color: COLORS_TW.gold }]}>Načítavam tvoj digitálny dvojník...</Text>
      </View>
    );
  }

  return (
    <View style={[s.safe, { backgroundColor: COLORS_TW.bg }]}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <LinearGradient colors={['#1A1209', COLORS_TW.bg]} style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.8}>
            <Ionicons name="chevron-back" size={22} color={COLORS_TW.gold} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerLabel}>DIGITAL TWIN</Text>
            <Text style={s.headerTitle}>Tvoj chrup</Text>
          </View>
          {/* Summary pill */}
          {summary.totalCost > 0 && (
            <View style={s.costPill}>
              <Text style={s.costPillText}>Risk: {summary.totalCost} €</Text>
            </View>
          )}
        </LinearGradient>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={COLORS_TW.gold} />}
        >
          {/* Prediction banner */}
          {year > 0 && (
            <View style={s.predBanner}>
              <Ionicons name="warning-outline" size={14} color={COLORS_TW.red} />
              <Text style={s.predBannerText}>Predikcia roku +{year} — orientačná</Text>
            </View>
          )}

          {/* Arch Map */}
          <View style={s.archContainer}>
            <Text style={s.archTitle}>
              {year === 0 ? '📍 Aktuálny stav' : `🔮 Predikcia: rok +${year}`}
            </Text>
            <ArchMap
              teeth={displayTeeth}
              selected={selected}
              predictedTeeth={year > 0 ? predictedTeeth : new Set()}
              onSelect={handleToothPress}
            />
            {/* Legend */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.legend}>
              {Object.entries(STATUS_CFG).slice(0, 7).map(([k, v]) => (
                <View key={k} style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: v.glowColor ?? v.darkColor }]} />
                  <Text style={s.legendText}>{v.label}</Text>
                </View>
              ))}
            </ScrollView>
          </View>

          {/* Timeline Slider */}
          <View style={[s.sliderCard, { borderColor: dark ? '#3D2E22' : '#2A1F0A' }]}>
            <Text style={s.sliderTitle}>ČASOVÁ OS</Text>
            <TimelineSlider year={year} onYearChange={setYear} />
          </View>

          {/* Year Panel */}
          <YearPanel snap={currentSnap} year={year} colors={colors} dark={dark} />

          {/* Cost comparison (len pri predikcii) */}
          {summary.totalCost > 0 && (
            <View style={[s.compCard, { borderColor: dark ? '#3D2E22' : '#2A1F0A' }]}>
              <Text style={s.compTitle}>💰 5-ROČNÉ POROVNANIE</Text>
              <View style={s.compRow}>
                <View style={[s.compBox, { backgroundColor: '#0D3B1F' }]}>
                  <Text style={s.compBoxLabel}>Prevencia dnes</Text>
                  <Text style={[s.compBoxVal, { color: '#58D68D' }]}>{PREVENTION_COST * HORIZON} €</Text>
                  <Text style={s.compBoxSub}>{HORIZON}× ročná prehliadka</Text>
                </View>
                <View style={s.compArrow}>
                  <Text style={s.compArrowText}>vs</Text>
                  <Text style={s.compSavings}>úspora{'\n'}{Math.max(0, summary.totalCost - PREVENTION_COST * HORIZON)} €</Text>
                </View>
                <View style={[s.compBox, { backgroundColor: '#4A1010' }]}>
                  <Text style={s.compBoxLabel}>Bez prevencie</Text>
                  <Text style={[s.compBoxVal, { color: '#F1948A' }]}>{summary.totalCost} €</Text>
                  <Text style={s.compBoxSub}>{summary.issueCount} nových problémov</Text>
                </View>
              </View>
            </View>
          )}

          {/* CTA */}
          <TouchableOpacity
            style={s.ctaBtn}
            onPress={() => router.push('/(patient)/book-appointment')}
            activeOpacity={0.88}
          >
            <LinearGradient colors={['#B8973A', '#C9A84C']} style={s.ctaGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name="calendar" size={18} color="#1A1209" />
              <Text style={s.ctaText}>Rezervovať preventívnu prehliadku</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Disclaimer */}
          <View style={s.disclaimerBox}>
            <Ionicons name="information-circle-outline" size={14} color="#555" />
            <Text style={s.disclaimerText}>⚠️ {DISCLAIMER}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Tooth Detail Modal */}
      {selected && (
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
  safe:        { flex: 1 },
  loadingText: { marginTop: 16, fontSize: 14, fontFamily: 'DMSans_500Medium' },
  scroll:      { paddingBottom: 120 },

  // Header
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 12 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(201,168,76,0.12)', alignItems: 'center', justifyContent: 'center' },
  headerLabel: { fontSize: 9, letterSpacing: 2.5, color: COLORS_TW.gold, fontFamily: 'DMSans_500Medium' },
  headerTitle: { fontSize: 22, fontFamily: 'PlayfairDisplay_700Bold', color: '#FAF6F0' },
  costPill:    { backgroundColor: 'rgba(231,76,60,0.18)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(231,76,60,0.4)' },
  costPillText:{ fontSize: 11, fontFamily: 'DMSans_500Medium', color: COLORS_TW.red },

  // Prediction banner
  predBanner:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, backgroundColor: 'rgba(231,76,60,0.1)', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: 'rgba(231,76,60,0.3)' },
  predBannerText: { fontSize: 12, color: COLORS_TW.red, fontFamily: 'DMSans_500Medium' },

  // Arch map
  archContainer: { marginHorizontal: 16, marginBottom: 12 },
  archTitle:     { fontSize: 11, fontFamily: 'DMSans_500Medium', color: COLORS_TW.gold, letterSpacing: 1.5, marginBottom: 8 },
  archWrap:      { borderRadius: 16, overflow: 'hidden', padding: 8 },

  // Legend
  legend:     { marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 12 },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 9, color: '#888', fontFamily: 'DMSans_400Regular' },

  // Timeline slider
  sliderCard:   { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#141414', borderRadius: 14, borderWidth: 1, padding: 16 },
  sliderTitle:  { fontSize: 9, letterSpacing: 2, color: '#666', fontFamily: 'DMSans_500Medium', marginBottom: 14 },
  sliderWrap:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sliderLabel:  { fontSize: 9, color: '#666', width: 46, textAlign: 'center' },
  sliderTrack:  { flex: 1, height: 40, justifyContent: 'center', position: 'relative' },
  track:        { position: 'absolute', left: 0, right: 0, height: 3, borderRadius: 2 },
  trackFill:    { position: 'absolute', left: 0, height: 3, borderRadius: 2 },
  dot:          { position: 'absolute', width: 16, height: 16, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center', top: 12 },
  dotLabel:     { position: 'absolute', top: 16, fontSize: 8, fontFamily: 'DMSans_500Medium', width: 32, textAlign: 'center', left: -8 },
  thumb:        { position: 'absolute', width: 28, height: 28, borderRadius: 14, top: 6, borderWidth: 2, borderColor: '#fff', elevation: 4 },

  // Year Panel
  panel:          { marginHorizontal: 16, marginBottom: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  panelTitle:     { fontSize: 13, fontFamily: 'DMSans_500Medium', marginBottom: 12 },
  panelRow:       { flexDirection: 'row', gap: 10 },
  panelBadge:     { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center' },
  panelBadgeNum:  { fontSize: 28, fontFamily: 'PlayfairDisplay_700Bold', lineHeight: 32 },
  panelBadgeLabel:{ fontSize: 11, fontFamily: 'DMSans_500Medium', marginTop: 2 },
  panelHint:      { fontSize: 11, textAlign: 'center', marginTop: 10 },
  panelOK:        { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10 },
  panelOKText:    { fontSize: 13, fontFamily: 'DMSans_500Medium' },
  panelIssueRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1 },
  panelIssueEmoji:{ fontSize: 16, width: 24 },
  panelIssueName: { flex: 1, fontSize: 12, fontFamily: 'DMSans_500Medium' },
  panelIssueCost: { fontSize: 12, fontFamily: 'DMSans_500Medium' },
  panelCostBox:   { borderRadius: 10, borderWidth: 1, padding: 10, marginTop: 10, alignItems: 'center' },
  panelCostLabel: { fontSize: 10, fontFamily: 'DMSans_500Medium' },
  panelCostVal:   { fontSize: 24, fontFamily: 'PlayfairDisplay_700Bold' },
  panelSavings:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, padding: 10, marginTop: 8 },
  panelSavingsText:{ flex: 1, fontSize: 11, fontFamily: 'DMSans_500Medium' },

  // Cost comparison
  compCard:    { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#141414', borderRadius: 14, borderWidth: 1, padding: 14 },
  compTitle:   { fontSize: 9, letterSpacing: 2, color: '#666', fontFamily: 'DMSans_500Medium', marginBottom: 12 },
  compRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  compBox:     { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center', gap: 4 },
  compBoxLabel:{ fontSize: 10, color: '#aaa', fontFamily: 'DMSans_500Medium', textAlign: 'center' },
  compBoxVal:  { fontSize: 20, fontFamily: 'PlayfairDisplay_700Bold' },
  compBoxSub:  { fontSize: 9, color: '#666', textAlign: 'center' },
  compArrow:   { alignItems: 'center', gap: 4 },
  compArrowText:{ fontSize: 12, color: '#666', fontFamily: 'DMSans_500Medium' },
  compSavings: { fontSize: 10, color: COLORS_TW.green, fontFamily: 'DMSans_500Medium', textAlign: 'center' },

  // CTA
  ctaBtn:   { marginHorizontal: 16, marginBottom: 12, borderRadius: 14, overflow: 'hidden' },
  ctaGrad:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
  ctaText:  { fontSize: 15, fontFamily: 'DMSans_500Medium', color: '#1A1209' },

  // Disclaimer
  disclaimerBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginHorizontal: 16, marginBottom: 8 },
  disclaimerText: { flex: 1, fontSize: 10, color: '#444', lineHeight: 15 },

  // Modal
  modalOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalSheet:       { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  modalHandle:      { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  modalHeader:      { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  modalStatusDot:   { width: 14, height: 14, borderRadius: 7 },
  modalTitle:       { fontSize: 20, fontFamily: 'PlayfairDisplay_700Bold' },
  modalSub:         { fontSize: 12 },
  modalCloseBtn:    { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  modalStatusCard:  { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 14 },
  modalStatusEmoji: { fontSize: 28 },
  modalStatusLabel: { fontSize: 10, fontFamily: 'DMSans_500Medium', letterSpacing: 1, marginBottom: 3 },
  modalStatusVal:   { fontSize: 16, fontFamily: 'DMSans_500Medium' },
  modalSection:     { marginBottom: 14 },
  modalSectionTitle:{ fontSize: 9, letterSpacing: 1.5, fontFamily: 'DMSans_500Medium', marginBottom: 8 },
  modalIssueRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1 },
  modalIssueYear:   { fontSize: 12, fontFamily: 'DMSans_500Medium', width: 48 },
  modalIssueText:   { flex: 1, fontSize: 13, fontFamily: 'DMSans_500Medium' },
  modalIssuePct:    { fontSize: 11, width: 36, textAlign: 'right' },
  modalIssueCost:   { fontSize: 11, width: 52, textAlign: 'right' },
  modalOKBanner:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 14 },
  modalOKText:      { flex: 1, fontSize: 13, fontFamily: 'DMSans_500Medium' },
  modalBookBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2C1F14', borderRadius: 12, paddingVertical: 14, marginBottom: 12 },
  modalBookText:    { fontSize: 14, fontFamily: 'DMSans_500Medium', color: '#FAF6F0' },
  modalDisclaimer:  { fontSize: 10, textAlign: 'center', lineHeight: 15 },
});
