/**
 * Dental Twin — Digitálny dvojník chrupu
 * SVG arch mapa + 5-ročná predikcia + cenové porovnanie
 * Optimalizované pre telefón — bez PanResponder slidera
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  ActivityIndicator, Dimensions, Modal, RefreshControl,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Ellipse, G, Text as SvgText } from 'react-native-svg';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabase';
import { useAppTheme } from '../../context/ThemeContext';
import {
  generatePredictions, YearSnapshot, ToothStatus, STATUS_CFG,
  toothName, getPredictionSummary, PREVENTION_COST, RiskFactors,
} from '../../utils/dentalPrediction';

const { width: W } = Dimensions.get('window');
const CHART_W  = W - 32;
const ARCH_H   = 130;
const DISCLAIMER = 'Predikcia je orientačná. Nenahrádza odbornú diagnostiku.';

// ─── FDI arch pozície ─────────────────────────────────────────────────────────
interface ToothPos { fdi: number; x: number; y: number; rx: number; ry: number }

function buildUpperArch(): ToothPos[] {
  const CW = CHART_W;
  return [
    { fdi:18, x:14,    y:14,  rx:13, ry:11 },
    { fdi:17, x:33,    y:22,  rx:12, ry:10 },
    { fdi:16, x:52,    y:30,  rx:12, ry:10 },
    { fdi:15, x:70,    y:39,  rx:10, ry:9  },
    { fdi:14, x:86,    y:48,  rx:10, ry:9  },
    { fdi:13, x:100,   y:58,  rx:8,  ry:9  },
    { fdi:12, x:112,   y:67,  rx:7,  ry:9  },
    { fdi:11, x:121,   y:73,  rx:7,  ry:9  },
    { fdi:21, x:CW-121,y:73,  rx:7,  ry:9  },
    { fdi:22, x:CW-112,y:67,  rx:7,  ry:9  },
    { fdi:23, x:CW-100,y:58,  rx:8,  ry:9  },
    { fdi:24, x:CW-86, y:48,  rx:10, ry:9  },
    { fdi:25, x:CW-70, y:39,  rx:10, ry:9  },
    { fdi:26, x:CW-52, y:30,  rx:12, ry:10 },
    { fdi:27, x:CW-33, y:22,  rx:12, ry:10 },
    { fdi:28, x:CW-14, y:14,  rx:13, ry:11 },
  ];
}

function buildLowerArch(): ToothPos[] {
  const CW = CHART_W;
  const B  = ARCH_H;
  return [
    { fdi:48, x:14,    y:B-14, rx:13, ry:11 },
    { fdi:47, x:33,    y:B-22, rx:12, ry:10 },
    { fdi:46, x:52,    y:B-30, rx:12, ry:10 },
    { fdi:45, x:70,    y:B-39, rx:10, ry:9  },
    { fdi:44, x:86,    y:B-48, rx:10, ry:9  },
    { fdi:43, x:100,   y:B-58, rx:8,  ry:9  },
    { fdi:42, x:112,   y:B-67, rx:7,  ry:9  },
    { fdi:41, x:121,   y:B-73, rx:7,  ry:9  },
    { fdi:31, x:CW-121,y:B-73, rx:7,  ry:9  },
    { fdi:32, x:CW-112,y:B-67, rx:7,  ry:9  },
    { fdi:33, x:CW-100,y:B-58, rx:8,  ry:9  },
    { fdi:34, x:CW-86, y:B-48, rx:10, ry:9  },
    { fdi:35, x:CW-70, y:B-39, rx:10, ry:9  },
    { fdi:36, x:CW-52, y:B-30, rx:12, ry:10 },
    { fdi:37, x:CW-33, y:B-22, rx:12, ry:10 },
    { fdi:38, x:CW-14, y:B-14, rx:13, ry:11 },
  ];
}

const UPPER_ARCH = buildUpperArch();
const LOWER_ARCH = buildLowerArch();

// ─── Tooth shape ─────────────────────────────────────────────────────────────
function ToothShape({
  pos, status, selected, isPredicted, onPress,
}: {
  pos: ToothPos; status: ToothStatus; selected: boolean;
  isPredicted: boolean; onPress: () => void;
}) {
  const { dark } = useAppTheme();
  const cfg    = STATUS_CFG[status] ?? STATUS_CFG.healthy;
  const fill   = dark ? cfg.darkColor : cfg.color;
  const stroke = selected ? '#C9A84C' : isPredicted && cfg.glowColor ? cfg.glowColor : (dark ? '#444' : '#bbb');
  const sw     = selected ? 2.5 : isPredicted && cfg.glowColor ? 1.5 : 0.8;

  return (
    <G onPress={onPress}>
      {(selected || (isPredicted && cfg.severity >= 2)) && (
        <Ellipse cx={pos.x} cy={pos.y} rx={pos.rx + 5} ry={pos.ry + 5}
          fill={selected ? '#C9A84C' : (cfg.glowColor ?? '#FF9800')} opacity={0.25} />
      )}
      <Ellipse cx={pos.x} cy={pos.y} rx={pos.rx} ry={pos.ry}
        fill={fill} stroke={stroke} strokeWidth={sw}
        opacity={status === 'missing' || status === 'extracted' ? 0.35 : 1} />
      <Ellipse cx={pos.x} cy={pos.y - pos.ry * 0.28}
        rx={pos.rx * 0.45} ry={pos.ry * 0.22}
        fill="rgba(255,255,255,0.38)" />
    </G>
  );
}

// ─── SVG Arch Map ─────────────────────────────────────────────────────────────
function ArchMap({
  teeth, selected, predictedTeeth, onSelect,
}: {
  teeth: Record<number, ToothStatus>; selected: number | null;
  predictedTeeth: Set<number>; onSelect: (fdi: number) => void;
}) {
  const { dark } = useAppTheme();
  const svgH    = ARCH_H * 2 + 28;
  const bgColor = dark ? '#1A1209' : '#111';
  const divClr  = dark ? '#3D3010' : '#2A1F0A';

  return (
    <View style={[s.archWrap, { backgroundColor: bgColor }]}>
      <Svg width={CHART_W} height={svgH}>
        <SvgText x={CHART_W / 2} y={10} textAnchor="middle" fontSize={8}
          fill={dark ? '#A08060' : '#7B6040'} fontFamily="DMSans_500Medium">
          HORNÁ ČEĽUSŤ
        </SvgText>
        {UPPER_ARCH.map(pos => (
          <ToothShape key={pos.fdi} pos={{ ...pos, y: pos.y + 14 }}
            status={teeth[pos.fdi] ?? 'healthy'}
            selected={selected === pos.fdi}
            isPredicted={predictedTeeth.has(pos.fdi)}
            onPress={() => onSelect(pos.fdi)} />
        ))}

        <Ellipse cx={CHART_W / 2} cy={ARCH_H + 16} rx={CHART_W / 2 - 8} ry={1}
          fill={divClr} opacity={0.6} />
        <SvgText x={CHART_W / 2} y={ARCH_H + 24} textAnchor="middle" fontSize={8}
          fill={dark ? '#A08060' : '#7B6040'} fontFamily="DMSans_500Medium">
          DOLNÁ ČEĽUSŤ
        </SvgText>

        {LOWER_ARCH.map(pos => (
          <ToothShape key={pos.fdi} pos={{ ...pos, y: pos.y + ARCH_H + 28 }}
            status={teeth[pos.fdi] ?? 'healthy'}
            selected={selected === pos.fdi}
            isPredicted={predictedTeeth.has(pos.fdi)}
            onPress={() => onSelect(pos.fdi)} />
        ))}
      </Svg>
    </View>
  );
}

// ─── Year selector (náhrada za PanResponder slider) ───────────────────────────
const YEAR_LABELS = ['Dnes', '+1r', '+2r', '+3r', '+4r', '+5r'];

function YearSelector({ year, onChange }: { year: number; onChange: (y: number) => void }) {
  const { colors, dark } = useAppTheme();
  return (
    <View style={s.yearRow}>
      {YEAR_LABELS.map((lbl, i) => {
        const active = i === year;
        const past   = i < year && i > 0;
        return (
          <TouchableOpacity
            key={i}
            style={[
              s.yearBtn,
              { backgroundColor: active
                  ? (i === 0 ? '#C9A84C' : '#E74C3C')
                  : past
                  ? (dark ? '#3A1010' : '#FCE4E4')
                  : (dark ? '#2A1F14' : '#F0E8DE'),
                borderColor: active
                  ? (i === 0 ? '#C9A84C' : '#E74C3C')
                  : (dark ? '#4A3020' : '#D8CCBE'),
              },
            ]}
            onPress={() => {
              onChange(i);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            activeOpacity={0.75}
          >
            <Text style={[s.yearBtnTxt, {
              color: active ? '#fff' : past ? (dark ? '#E07070' : '#C0392B') : colors.textSecondary,
              fontWeight: active ? '700' : '500',
            }]}>{lbl}</Text>
          </TouchableOpacity>
        );
      })}
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
              <Text style={[s.sheetSub, { color: colors.textSecondary }]}>{name}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={[s.statusCard, { backgroundColor: dark ? '#1A1209' : '#F8F5F0', borderColor: colors.bg3 }]}>
            <Text style={{ fontSize: 28 }}>{cfg.emoji}</Text>
            <View>
              <Text style={[{ fontSize: 10, fontFamily: 'DMSans_500Medium', letterSpacing: 1, marginBottom: 2 }, { color: colors.textSecondary }]}>SÚČASNÝ STAV</Text>
              <Text style={[{ fontSize: 15, fontFamily: 'DMSans_500Medium' }, { color: colors.textPrimary }]}>{cfg.label}</Text>
            </View>
          </View>

          {future.length > 0 ? (
            <View style={{ marginBottom: 14 }}>
              <Text style={[{ fontSize: 9, letterSpacing: 1.5, fontFamily: 'DMSans_500Medium', marginBottom: 8 }, { color: colors.textSecondary }]}>🔮 PREDIKCIA</Text>
              {future.map(snap => {
                const issue   = snap.newIssues.find(i => i.tooth === fdi)!;
                const nextCfg = STATUS_CFG[issue.toStatus];
                return (
                  <View key={snap.year} style={[s.issueRow, { borderColor: colors.bg3 }]}>
                    <Text style={[s.issueYear, { color: '#E74C3C' }]}>+{snap.year}r</Text>
                    <Text style={[s.issueTxt, { color: colors.textPrimary }]}>{nextCfg?.label ?? issue.toStatus}</Text>
                    <Text style={[s.issuePct, { color: '#E74C3C' }]}>{Math.round(issue.probability * 100)}%</Text>
                    <Text style={[s.issueCost, { color: colors.textSecondary }]}>~{issue.cost} €</Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={[s.okBanner, { backgroundColor: dark ? '#0D3B1F' : '#EAFAF1', borderColor: dark ? '#27AE6044' : '#A9DFBF' }]}>
              <Ionicons name="checkmark-circle" size={17} color={dark ? '#58D68D' : '#1E8449'} />
              <Text style={[s.okTxt, { color: dark ? '#58D68D' : '#1E8449' }]}>
                V horizonte 5 rokov bez predpokladanej zmeny ✓
              </Text>
            </View>
          )}

          <TouchableOpacity style={s.bookBtn} onPress={onBook} activeOpacity={0.88}>
            <Ionicons name="calendar-outline" size={15} color="#fff" />
            <Text style={s.bookBtnTxt}>Rezervovať prehliadku</Text>
          </TouchableOpacity>
          <Text style={[s.disclaimer, { color: colors.textSecondary }]}>{DISCLAIMER}</Text>
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
    const healthy = Object.values(snap.teeth).filter(s => s === 'healthy').length;
    const issues  = Object.values(snap.teeth).filter(s => s !== 'healthy' && s !== 'missing' && s !== 'extracted').length;
    return (
      <View style={[s.panel, { backgroundColor: dark ? '#1A1209' : '#F8F5F0', borderColor: dark ? '#3D2E22' : '#E0D4C4' }]}>
        <Text style={[s.panelTitle, { color: dark ? '#FAF6F0' : '#2C1F14' }]}>📊 Dnešný stav</Text>
        <View style={s.panelRow}>
          <View style={[s.panelBadge, { backgroundColor: dark ? '#0D3B1F' : '#EAFAF1' }]}>
            <Text style={[s.panelNum, { color: '#1E8449' }]}>{healthy}</Text>
            <Text style={[s.panelLbl, { color: '#1E8449' }]}>Zdravých</Text>
          </View>
          <View style={[s.panelBadge, { backgroundColor: issues > 0 ? (dark ? '#4A1010' : '#FDEDEC') : (dark ? '#0D3B1F' : '#EAFAF1') }]}>
            <Text style={[s.panelNum, { color: issues > 0 ? '#E74C3C' : '#1E8449' }]}>{issues}</Text>
            <Text style={[s.panelLbl, { color: issues > 0 ? '#E74C3C' : '#1E8449' }]}>Problémov</Text>
          </View>
        </View>
        <Text style={[s.panelHint, { color: dark ? '#888' : '#999' }]}>Klepni na zub pre detail</Text>
      </View>
    );
  }

  return (
    <View style={[s.panel, { backgroundColor: dark ? '#1A1209' : '#F8F5F0', borderColor: dark ? '#3D2E22' : '#E0D4C4' }]}>
      <Text style={[s.panelTitle, { color: dark ? '#FAF6F0' : '#2C1F14' }]}>🔮 Predikcia rok +{year}</Text>
      {snap.newIssues.length === 0 ? (
        <View style={[s.panelOK, { backgroundColor: dark ? '#0D3B1F' : '#EAFAF1' }]}>
          <Ionicons name="checkmark-circle" size={15} color="#1E8449" />
          <Text style={[s.panelOKTxt, { color: '#1E8449' }]}>Žiadne nové komplikácie</Text>
        </View>
      ) : (
        <>
          {snap.newIssues.slice(0, 5).map((iss, i) => (
            <View key={i} style={[s.issueRow, { borderColor: dark ? '#3A2A1A' : '#E8DDD0' }]}>
              <Text style={{ fontSize: 15, width: 22 }}>{STATUS_CFG[iss.toStatus]?.emoji ?? '🔴'}</Text>
              <Text style={[s.issueTxt, { color: dark ? '#FAF6F0' : '#2C1F14', flex: 1 }]}>
                Zub {iss.tooth} — {STATUS_CFG[iss.toStatus]?.label}
              </Text>
              <Text style={[s.issueCost, { color: '#E74C3C' }]}>~{iss.cost} €</Text>
            </View>
          ))}
          <View style={[s.costBox, { backgroundColor: dark ? '#4A1010' : '#FDEDEC', borderColor: dark ? '#C0392B33' : '#F5B7B1' }]}>
            <Text style={[s.costLbl, { color: '#E74C3C' }]}>Kumulatívne náklady</Text>
            <Text style={[s.costVal, { color: '#E74C3C' }]}>{snap.cumulativeCost} €</Text>
          </View>
          <View style={[s.savingsRow, { backgroundColor: dark ? '#0D3B1F' : '#EAFAF1', borderColor: dark ? '#27AE6044' : '#A9DFBF' }]}>
            <Ionicons name="shield-checkmark" size={13} color="#1E8449" />
            <Text style={[s.savingsTxt, { color: '#1E8449' }]}>
              Prevencia {PREVENTION_COST * year} € · Úspora {Math.max(0, snap.cumulativeCost - PREVENTION_COST * year)} €
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

// ─── Legenda ─────────────────────────────────────────────────────────────────
const LEGEND_ITEMS = Object.entries(STATUS_CFG).slice(0, 8) as [ToothStatus, typeof STATUS_CFG[ToothStatus]][];

function Legend() {
  const { dark } = useAppTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.legend} contentContainerStyle={{ paddingRight: 8 }}>
      {LEGEND_ITEMS.map(([k, v]) => (
        <View key={k} style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: v.glowColor ?? (dark ? v.darkColor : v.color) }]} />
          <Text style={[s.legendTxt, { color: dark ? '#888' : '#777' }]}>{v.label}</Text>
        </View>
      ))}
    </ScrollView>
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

  const [risk] = useState<RiskFactors>({ smoking: false, diabetes: false, bruxism: false, hygiene: 7 });

  const snapshots = useMemo(
    () => generatePredictions(rawTeeth, risk, 5),
    [rawTeeth, risk],
  );

  const currentSnap   = snapshots[year] ?? snapshots[0];
  const displayTeeth  = currentSnap?.teeth ?? rawTeeth;

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
    setSelected(fdi);
    setShowModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  if (loading) {
    return (
      <View style={[s.safe, { backgroundColor: '#0D0D0D', alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color="#C9A84C" size="large" />
        <Text style={[s.loadingTxt, { color: '#C9A84C' }]}>Načítavam digitálny dvojník...</Text>
      </View>
    );
  }

  return (
    <View style={[s.safe, { backgroundColor: '#0D0D0D' }]}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <LinearGradient colors={['#1A1209', '#0D0D0D']} style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.8}>
            <Ionicons name="chevron-back" size={22} color="#C9A84C" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerLabel}>DIGITAL TWIN</Text>
            <Text style={s.headerTitle}>Tvoj chrup</Text>
          </View>
          {summary.totalCost > 0 && (
            <View style={s.riskPill}>
              <Text style={s.riskTxt}>⚠ {summary.totalCost} €</Text>
            </View>
          )}
        </LinearGradient>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor="#C9A84C" />}
        >
          {/* Prediction banner */}
          {year > 0 && (
            <View style={s.predBanner}>
              <Ionicons name="warning-outline" size={13} color="#E74C3C" />
              <Text style={s.predBannerTxt}>Zobrazujem predikciu roku +{year} — orientačná</Text>
            </View>
          )}

          {/* Arch map */}
          <View style={{ marginHorizontal: 16, marginBottom: 10 }}>
            <Text style={s.archTitle}>
              {year === 0 ? '📍 Aktuálny stav' : `🔮 Predikcia: rok +${year}`}
            </Text>
            <ArchMap
              teeth={displayTeeth}
              selected={selected}
              predictedTeeth={year > 0 ? predictedTeeth : new Set()}
              onSelect={handleToothPress}
            />
            <Legend />
          </View>

          {/* Year selector */}
          <View style={[s.yearCard, { borderColor: dark ? '#3D2E22' : '#2A1F0A' }]}>
            <Text style={s.yearCardLabel}>ČASOVÁ OS</Text>
            <YearSelector year={year} onChange={setYear} />
          </View>

          {/* Year panel */}
          <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
            <YearPanel snap={currentSnap} year={year} colors={colors} dark={dark} />
          </View>

          {/* Cost comparison */}
          {summary.totalCost > 0 && (
            <View style={[s.compCard, { borderColor: dark ? '#3D2E22' : '#2A1F0A' }]}>
              <Text style={s.compTitle}>💰 5-ROČNÉ POROVNANIE</Text>
              <View style={s.compRow}>
                <View style={[s.compBox, { backgroundColor: '#0D3B1F' }]}>
                  <Text style={s.compBoxLbl}>Prevencia dnes</Text>
                  <Text style={[s.compBoxVal, { color: '#58D68D' }]}>{PREVENTION_COST * 5} €</Text>
                  <Text style={s.compBoxSub}>5× ročná prehliadka</Text>
                </View>
                <View style={s.vsCol}>
                  <Text style={s.vsTxt}>vs</Text>
                  <Text style={[s.savingsBig, { color: '#58D68D' }]}>
                    úspora{'\n'}{Math.max(0, summary.totalCost - PREVENTION_COST * 5)} €
                  </Text>
                </View>
                <View style={[s.compBox, { backgroundColor: '#4A1010' }]}>
                  <Text style={s.compBoxLbl}>Bez prevencie</Text>
                  <Text style={[s.compBoxVal, { color: '#F1948A' }]}>{summary.totalCost} €</Text>
                  <Text style={s.compBoxSub}>{summary.issueCount} nových problémov</Text>
                </View>
              </View>
            </View>
          )}

          {/* CTA */}
          <TouchableOpacity
            style={{ marginHorizontal: 16, marginBottom: 12, borderRadius: 14, overflow: 'hidden' }}
            onPress={() => router.push('/(patient)/book-appointment')}
            activeOpacity={0.88}
          >
            <LinearGradient colors={['#B8973A', '#C9A84C']} style={s.ctaGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name="calendar" size={17} color="#1A1209" />
              <Text style={s.ctaTxt}>Rezervovať preventívnu prehliadku</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Disclaimer */}
          <View style={s.disclaimerRow}>
            <Ionicons name="information-circle-outline" size={13} color="#444" />
            <Text style={s.disclaimerTxt}>{DISCLAIMER}</Text>
          </View>
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
  safe:        { flex: 1 },
  loadingTxt:  { marginTop: 14, fontSize: 13, fontFamily: 'DMSans_500Medium' },

  // Header
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 14, gap: 12 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(201,168,76,0.12)', alignItems: 'center', justifyContent: 'center' },
  headerLabel: { fontSize: 9, letterSpacing: 2.5, color: '#C9A84C', fontFamily: 'DMSans_500Medium' },
  headerTitle: { fontSize: 22, fontFamily: 'PlayfairDisplay_700Bold', color: '#FAF6F0' },
  riskPill:    { backgroundColor: 'rgba(231,76,60,0.16)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(231,76,60,0.4)' },
  riskTxt:     { fontSize: 11, fontFamily: 'DMSans_500Medium', color: '#E74C3C' },

  // Prediction banner
  predBanner:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginBottom: 8, backgroundColor: 'rgba(231,76,60,0.1)', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: 'rgba(231,76,60,0.3)' },
  predBannerTxt: { fontSize: 11, color: '#E74C3C', fontFamily: 'DMSans_500Medium', flex: 1 },

  // Arch
  archTitle: { fontSize: 11, fontFamily: 'DMSans_500Medium', color: '#C9A84C', letterSpacing: 1.5, marginBottom: 8 },
  archWrap:  { borderRadius: 14, overflow: 'hidden', padding: 6 },

  // Legend
  legend:     { marginTop: 10, marginBottom: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 12 },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },
  legendTxt:  { fontSize: 9, fontFamily: 'DMSans_500Medium' },

  // Year selector
  yearCard:      { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#141414', borderRadius: 14, borderWidth: 1, padding: 14 },
  yearCardLabel: { fontSize: 9, letterSpacing: 2, color: '#555', fontFamily: 'DMSans_500Medium', marginBottom: 12 },
  yearRow:       { flexDirection: 'row', gap: 6 },
  yearBtn:       { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1.5 },
  yearBtnTxt:    { fontSize: 11, fontFamily: 'DMSans_500Medium' },

  // Panel
  panel:      { borderRadius: 14, borderWidth: 1, padding: 14 },
  panelTitle: { fontSize: 13, fontFamily: 'DMSans_500Medium', marginBottom: 12 },
  panelRow:   { flexDirection: 'row', gap: 10 },
  panelBadge: { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center' },
  panelNum:   { fontSize: 28, fontFamily: 'PlayfairDisplay_700Bold', lineHeight: 32 },
  panelLbl:   { fontSize: 11, fontFamily: 'DMSans_500Medium', marginTop: 2 },
  panelHint:  { fontSize: 11, textAlign: 'center', marginTop: 10 },
  panelOK:    { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10 },
  panelOKTxt: { fontSize: 13, fontFamily: 'DMSans_500Medium' },

  // Issue rows
  issueRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1 },
  issueYear: { fontSize: 12, fontFamily: 'DMSans_500Medium', width: 36 },
  issueTxt:  { flex: 1, fontSize: 12, fontFamily: 'DMSans_500Medium' },
  issuePct:  { fontSize: 11, width: 36, textAlign: 'right' },
  issueCost: { fontSize: 11, width: 52, textAlign: 'right' },

  // Cost / savings in panel
  costBox:    { borderRadius: 10, borderWidth: 1, padding: 10, marginTop: 10, alignItems: 'center' },
  costLbl:    { fontSize: 10, fontFamily: 'DMSans_500Medium', marginBottom: 2 },
  costVal:    { fontSize: 24, fontFamily: 'PlayfairDisplay_700Bold' },
  savingsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, padding: 10, marginTop: 8 },
  savingsTxt: { flex: 1, fontSize: 11, fontFamily: 'DMSans_500Medium' },

  // Comparison card
  compCard:    { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#141414', borderRadius: 14, borderWidth: 1, padding: 14 },
  compTitle:   { fontSize: 9, letterSpacing: 2, color: '#555', fontFamily: 'DMSans_500Medium', marginBottom: 12 },
  compRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  compBox:     { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center', gap: 4 },
  compBoxLbl:  { fontSize: 10, color: '#aaa', fontFamily: 'DMSans_500Medium', textAlign: 'center' },
  compBoxVal:  { fontSize: 20, fontFamily: 'PlayfairDisplay_700Bold' },
  compBoxSub:  { fontSize: 9, color: '#666', textAlign: 'center' },
  vsCol:       { alignItems: 'center', gap: 4 },
  vsTxt:       { fontSize: 11, color: '#555', fontFamily: 'DMSans_500Medium' },
  savingsBig:  { fontSize: 11, fontFamily: 'DMSans_500Medium', textAlign: 'center' },

  // CTA
  ctaGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 15 },
  ctaTxt:  { fontSize: 14, fontFamily: 'DMSans_500Medium', color: '#1A1209' },

  // Disclaimer
  disclaimerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginHorizontal: 16, marginBottom: 8 },
  disclaimerTxt: { flex: 1, fontSize: 10, color: '#444', lineHeight: 15 },

  // Modal
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  handle:     { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  sheetHeader:{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  statusDot:  { width: 14, height: 14, borderRadius: 7 },
  sheetTitle: { fontSize: 20, fontFamily: 'PlayfairDisplay_700Bold' },
  sheetSub:   { fontSize: 12 },
  closeBtn:   { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 14 },
  okBanner:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 14 },
  okTxt:      { flex: 1, fontSize: 13, fontFamily: 'DMSans_500Medium' },
  bookBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2C1F14', borderRadius: 12, paddingVertical: 14, marginBottom: 12 },
  bookBtnTxt: { fontSize: 14, fontFamily: 'DMSans_500Medium', color: '#FAF6F0' },
  disclaimer: { fontSize: 10, textAlign: 'center', lineHeight: 14 },
});
