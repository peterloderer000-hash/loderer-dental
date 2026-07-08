/**
 * Interaktívna zubná mapa — premium SVG vizuál s anatomickými tvarmi zubov
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  Dimensions, Modal, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';

const { width: SCREEN_W } = Dimensions.get('window');

type ToothData = {
  tooth_number: number;
  status: string;
  notes?: string;
  last_updated?: string;
};

/* ─── Stav zubov — farby a labely ─────────────────────────────────────────── */
const STATUS_CONFIG: Record<string, { color: string; label: string; icon: string; iconName: string }> = {
  healthy:    { color: '#2E7D5E', label: 'Zdravý',      icon: '✓', iconName: 'checkmark-circle' },
  cavity:     { color: '#C0392B', label: 'Kazivosť',    icon: '!', iconName: 'warning' },
  filled:     { color: '#1A5276', label: 'Výplň',       icon: '◆', iconName: 'ellipse' },
  filling:    { color: '#1A5276', label: 'Výplň',       icon: '◆', iconName: 'ellipse' },
  crown:      { color: '#9B59B6', label: 'Korunka',     icon: '♛', iconName: 'shield' },
  missing:    { color: '#B8ACA0', label: 'Chýba',       icon: '✕', iconName: 'close-circle' },
  implant:    { color: '#5B8C8D', label: 'Implantát',   icon: '⚙', iconName: 'construct' },
  root_canal: { color: '#B87333', label: 'Endodoncia',  icon: '↓', iconName: 'arrow-down-circle' },
  bridge:     { color: '#8E44AD', label: 'Most',        icon: '═', iconName: 'git-compare' },
  unknown:    { color: '#D0D4DC', label: 'Nezistený',   icon: '?', iconName: 'help-circle' },
};

/* ─── FDI číslovanie ──────────────────────────────────────────────────────── */
const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT  = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_LEFT  = [31, 32, 33, 34, 35, 36, 37, 38];
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];

/* ─── Typ zubu podľa čísla ────────────────────────────────────────────────── */
function toothType(num: number): 'molar' | 'premolar' | 'canine' | 'incisor' {
  const n = num % 10;
  if (n >= 6) return 'molar';
  if (n >= 4) return 'premolar';
  if (n === 3) return 'canine';
  return 'incisor';
}

/* ─── SVG cesty pre anatomické tvary zubov ────────────────────────────────── */
// Horné zuby (koreň hore, korunka dole)
const UPPER_PATHS: Record<string, { path: string; w: number; h: number }> = {
  molar:    { w: 30, h: 40, path: 'M6,0 C3,0 1,4 2,12 L1,24 C0,30 4,38 8,40 L12,40 C14,40 16,40 18,40 L22,40 C26,38 30,30 29,24 L28,12 C29,4 27,0 24,0 Z' },
  premolar: { w: 24, h: 38, path: 'M5,0 C2,0 1,5 2,14 L2,24 C1,30 4,36 7,38 L12,38 L17,38 C20,36 23,30 22,24 L22,14 C23,5 22,0 19,0 Z' },
  canine:   { w: 20, h: 40, path: 'M7,0 C4,0 2,6 3,16 L3,26 C2,32 4,38 7,40 L10,40 L13,40 C16,38 18,32 17,26 L17,16 C18,6 16,0 13,0 Z' },
  incisor:  { w: 18, h: 36, path: 'M5,0 C3,0 1,5 2,14 L2,22 C1,28 3,34 6,36 L9,36 L12,36 C15,34 17,28 16,22 L16,14 C17,5 15,0 13,0 Z' },
};

// Dolné zuby (koreň dole, korunka hore) — zrkadlový odraz
const LOWER_PATHS: Record<string, { path: string; w: number; h: number }> = {
  molar:    { w: 30, h: 40, path: 'M6,40 C3,40 1,36 2,28 L1,16 C0,10 4,2 8,0 L12,0 C14,0 16,0 18,0 L22,0 C26,2 30,10 29,16 L28,28 C29,36 27,40 24,40 Z' },
  premolar: { w: 24, h: 38, path: 'M5,38 C2,38 1,33 2,24 L2,14 C1,8 4,2 7,0 L12,0 L17,0 C20,2 23,8 22,14 L22,24 C23,33 22,38 19,38 Z' },
  canine:   { w: 20, h: 40, path: 'M7,40 C4,40 2,34 3,24 L3,14 C2,8 4,2 7,0 L10,0 L13,0 C16,2 18,8 17,14 L17,24 C18,34 16,40 13,40 Z' },
  incisor:  { w: 18, h: 36, path: 'M5,36 C3,36 1,31 2,22 L2,14 C1,8 3,2 6,0 L9,0 L12,0 C15,2 17,8 16,14 L16,22 C17,31 15,36 13,36 Z' },
};

/* ─── Hlavný komponent ────────────────────────────────────────────────────── */
export default function DentalMap() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  const [teeth, setTeeth] = useState<Map<number, ToothData>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedTooth, setSelectedTooth] = useState<ToothData | null>(null);

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('dental_charts')
        .select('tooth_number, status, notes, updated_at')
        .eq('patient_id', user.id);
      const map = new Map<number, ToothData>();
      (data ?? []).forEach(t => {
        map.set(t.tooth_number, {
          tooth_number: t.tooth_number,
          status: t.status,
          notes: t.notes,
          last_updated: t.updated_at,
        });
      });
      setTeeth(map);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const getStatus = useCallback((num: number) => teeth.get(num)?.status ?? 'unknown', [teeth]);
  const getConfig = useCallback((status: string) => STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown, []);

  /* ─── Štatistiky ──────────────────────────────────────────────────────── */
  const stats = useMemo(() => {
    const all = [...teeth.values()];
    return {
      healthy:  all.filter(t => t.status === 'healthy').length,
      issues:   all.filter(t => ['cavity', 'root_canal'].includes(t.status)).length,
      restored: all.filter(t => ['filled', 'filling', 'crown', 'bridge', 'implant'].includes(t.status)).length,
      total:    all.length,
    };
  }, [teeth]);

  /* ─── SVG Zub komponent ───────────────────────────────────────────────── */
  const TOOTH_SCALE = Math.min((SCREEN_W - 64) / 320, 1.15);

  function SvgTooth({ num, isUpper }: { num: number; isUpper: boolean }) {
    const status = getStatus(num);
    const cfg = getConfig(status);
    const type = toothType(num);
    const paths = isUpper ? UPPER_PATHS : LOWER_PATHS;
    const shape = paths[type];
    const scale = TOOTH_SCALE;
    const w = shape.w * scale;
    const h = shape.h * scale;

    const fillColor = status === 'unknown'
      ? (dark ? '#252830' : '#F0F1F4')
      : cfg.color + '30';
    const strokeColor = status === 'unknown'
      ? (dark ? '#3A4256' : '#D0D4DC')
      : cfg.color;
    const numColor = status === 'unknown'
      ? (dark ? '#B8ACA0' : '#B8ACA0')
      : cfg.color;

    return (
      <TouchableOpacity
        onPress={() => setSelectedTooth(teeth.get(num) ?? { tooth_number: num, status: 'unknown' })}
        activeOpacity={0.7}
        style={{ alignItems: 'center', marginHorizontal: 1 }}>
        {isUpper && (
          <Text style={[st.toothNum, { color: numColor, marginBottom: 2 }]}>{num}</Text>
        )}
        <Svg width={w} height={h} viewBox={`0 0 ${shape.w} ${shape.h}`}>
          <Path
            d={shape.path}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          {status !== 'unknown' && (
            <SvgText
              x={shape.w / 2}
              y={shape.h / 2 + (isUpper ? 2 : -2)}
              fontSize={type === 'molar' ? 13 : 11}
              fontWeight="800"
              fill={cfg.color}
              textAnchor="middle"
              alignmentBaseline="central"
            >
              {cfg.icon}
            </SvgText>
          )}
        </Svg>
        {!isUpper && (
          <Text style={[st.toothNum, { color: numColor, marginTop: 2 }]}>{num}</Text>
        )}
      </TouchableOpacity>
    );
  }

  /* ─── Quadrant renderer ───────────────────────────────────────────────── */
  function Quadrant({ nums, isUpper }: { nums: number[]; isUpper: boolean }) {
    return (
      <View style={st.quadrant}>
        {nums.map(n => <SvgTooth key={n} num={n} isUpper={isUpper} />)}
      </View>
    );
  }

  return (
    <View style={[st.safe, { backgroundColor: colors.esp }]}>
      <HeroHeader title="Zubná mapa" subtitle="Interaktívny diagram chrupu" icon="grid-outline" onBack={() => router.back()} />

      <ScrollView style={[st.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={st.content}
        showsVerticalScrollIndicator={false}>

        {loading ? <SkeletonList count={4} /> : (
          <>
            {/* ─── Stats ─────────────────────────────────────────── */}
            <Animated.View entering={FadeInDown.delay(100)} style={st.statsRow}>
              {[
                { num: stats.healthy,  label: 'Zdravých',   color: COLORS.success, bgColor: COLORS.successBg, iconName: 'checkmark-circle' as const },
                { num: stats.issues,   label: 'Problémov',  color: COLORS.error,   bgColor: COLORS.errorBg,   iconName: 'alert-circle' as const },
                { num: stats.restored, label: 'Ošetrených', color: COLORS.info,    bgColor: COLORS.infoBg,    iconName: 'medkit' as const },
              ].map((s, i) => (
                <View key={i} style={[st.statCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                  <View style={[st.statIconWrap, { backgroundColor: dark ? s.color + '20' : s.bgColor }]}>
                    <Ionicons name={s.iconName} size={16} color={s.color} />
                  </View>
                  <Text style={[st.statNum, { color: s.color }]}>{s.num}</Text>
                  <Text style={[st.statLabel, { color: colors.textSecondary }]}>{s.label}</Text>
                </View>
              ))}
            </Animated.View>

            {/* ─── Dental Cross ──────────────────────────────────── */}
            <Animated.View entering={FadeInDown.delay(200)} style={[st.diagramCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              {/* Horná čeľusť label */}
              <View style={st.jawLabel}>
                <View style={[st.jawLabelLine, { backgroundColor: colors.bg3 }]} />
                <Text style={[st.jawLabelText, { color: colors.textSecondary }]}>HORNÁ ČEĽUSŤ</Text>
                <View style={[st.jawLabelLine, { backgroundColor: colors.bg3 }]} />
              </View>

              {/* Horné zuby */}
              <View style={st.jawRow}>
                <Quadrant nums={UPPER_RIGHT} isUpper />
                <View style={[st.midLine, { backgroundColor: dark ? '#3A4256' : '#D0D4DC' }]} />
                <Quadrant nums={UPPER_LEFT} isUpper />
              </View>

              {/* Horizontálna oddeľovacia čiara (dental cross) */}
              <View style={st.crossDivider}>
                <View style={[st.crossLine, { backgroundColor: dark ? '#3A4256' : '#D0D4DC' }]} />
                <View style={[st.crossCenter, { backgroundColor: dark ? '#252830' : '#F0F1F4', borderColor: dark ? '#3A4256' : '#D0D4DC' }]}>
                  <Ionicons name="add" size={14} color={dark ? '#B8ACA0' : '#B8ACA0'} />
                </View>
                <View style={[st.crossLine, { backgroundColor: dark ? '#3A4256' : '#D0D4DC' }]} />
              </View>

              {/* Dolné zuby */}
              <View style={st.jawRow}>
                <Quadrant nums={LOWER_RIGHT} isUpper={false} />
                <View style={[st.midLine, { backgroundColor: dark ? '#3A4256' : '#D0D4DC' }]} />
                <Quadrant nums={LOWER_LEFT} isUpper={false} />
              </View>

              {/* Dolná čeľusť label */}
              <View style={st.jawLabel}>
                <View style={[st.jawLabelLine, { backgroundColor: colors.bg3 }]} />
                <Text style={[st.jawLabelText, { color: colors.textSecondary }]}>DOLNÁ ČEĽUSŤ</Text>
                <View style={[st.jawLabelLine, { backgroundColor: colors.bg3 }]} />
              </View>

              {/* Quadrant labels */}
              <View style={st.quadrantLabels}>
                <Text style={[st.qLabel, { color: colors.textSecondary }]}>Q1 — Pravá</Text>
                <Text style={[st.qLabel, { color: colors.textSecondary }]}>Q2 — Ľavá</Text>
              </View>
            </Animated.View>

            {/* ─── Legend ─────────────────────────────────────────── */}
            <Animated.View entering={FadeInDown.delay(300)} style={[st.legendCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <Text style={[st.legendTitle, { color: colors.textPrimary }]}>Legenda</Text>
              <View style={st.legendGrid}>
                {Object.entries(STATUS_CONFIG).filter(([k]) => k !== 'unknown' && k !== 'filling').map(([key, cfg]) => (
                  <View key={key} style={[st.legendItem, { backgroundColor: dark ? cfg.color + '12' : cfg.color + '08', borderColor: cfg.color + '30' }]}>
                    <View style={[st.legendDot, { backgroundColor: cfg.color }]} />
                    <Text style={[st.legendText, { color: dark ? '#F5F6F8' : '#3A4256' }]}>{cfg.label}</Text>
                  </View>
                ))}
              </View>
            </Animated.View>

            {/* ─── Info ──────────────────────────────────────────── */}
            <Animated.View entering={FadeInDown.delay(400)} style={[st.infoCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
              <Text style={[st.infoText, { color: colors.textSecondary }]}>
                Ťuknite na ľubovoľný zub pre zobrazenie detailu. Údaje aktualizuje Váš zubný lekár.
              </Text>
            </Animated.View>
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ─── Tooth Detail Modal ──────────────────────────────────────────── */}
      <Modal visible={!!selectedTooth} transparent animationType="fade"
        onRequestClose={() => setSelectedTooth(null)}>
        <TouchableOpacity style={st.overlay} activeOpacity={1} onPress={() => setSelectedTooth(null)}>
          <Animated.View entering={FadeInDown.duration(300)} style={[st.modal, { backgroundColor: colors.cardBg }]}>
            {selectedTooth && (() => {
              const cfg = getConfig(selectedTooth.status);
              const type = toothType(selectedTooth.tooth_number);
              const isUpper = selectedTooth.tooth_number <= 28;
              const shape = isUpper ? UPPER_PATHS[type] : LOWER_PATHS[type];
              return (
                <>
                  {/* Veľký SVG zub */}
                  <View style={[st.modalToothWrap, { backgroundColor: dark ? cfg.color + '15' : cfg.color + '10' }]}>
                    <Svg width={shape.w * 2.2} height={shape.h * 2.2} viewBox={`0 0 ${shape.w} ${shape.h}`}>
                      <Path d={shape.path} fill={cfg.color + '35'} stroke={cfg.color} strokeWidth={1.5} strokeLinejoin="round" />
                      <SvgText x={shape.w / 2} y={shape.h / 2} fontSize={16} fontWeight="800" fill={cfg.color} textAnchor="middle" alignmentBaseline="central">
                        {cfg.icon}
                      </SvgText>
                    </Svg>
                  </View>

                  <Text style={[st.modalTitle, { color: colors.textPrimary }]}>
                    Zub č. {selectedTooth.tooth_number}
                  </Text>
                  <Text style={[st.modalType, { color: colors.textSecondary }]}>
                    {type === 'molar' ? 'Stolička' : type === 'premolar' ? 'Predstolička' : type === 'canine' ? 'Očný zub' : 'Rezák'}
                    {' · '}{isUpper ? 'Horná' : 'Dolná'} čeľusť
                  </Text>

                  <View style={[st.statusBadge, { backgroundColor: cfg.color + '18' }]}>
                    <Ionicons name={cfg.iconName as any} size={16} color={cfg.color} />
                    <Text style={[st.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>

                  {selectedTooth.notes ? (
                    <View style={[st.notesWrap, { backgroundColor: dark ? '#1A1D24' : '#F5F6F8', borderColor: colors.bg3 }]}>
                      <Text style={[st.notesLabel, { color: colors.textSecondary }]}>POZNÁMKA</Text>
                      <Text style={[st.notesText, { color: colors.textPrimary }]}>{selectedTooth.notes}</Text>
                    </View>
                  ) : null}

                  {selectedTooth.last_updated ? (
                    <Text style={[st.modalDate, { color: colors.textSecondary }]}>
                      Aktualizácia: {new Date(selectedTooth.last_updated).toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </Text>
                  ) : null}

                  <TouchableOpacity style={[st.modalBtn, { backgroundColor: COLORS.wal }]} onPress={() => setSelectedTooth(null)}>
                    <Text style={st.modalBtnText}>Zavrieť</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────────── */
const st = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: SPACING.lg },

  /* Stats */
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: SPACING.lg },
  statCard: { flex: 1, borderRadius: RADII.md, borderWidth: 1, padding: 12, alignItems: 'center' },
  statIconWrap: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  statNum: { fontSize: 22, fontWeight: '800', marginBottom: 2 },
  statLabel: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.5 },

  /* Diagram card */
  diagramCard: { borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.md, paddingVertical: SPACING.lg, marginBottom: SPACING.lg },

  /* Jaw labels */
  jawLabel: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 8, paddingHorizontal: 4 },
  jawLabelLine: { flex: 1, height: 1 },
  jawLabelText: { fontSize: 9, fontWeight: '600', letterSpacing: 2, textTransform: 'uppercase' },

  /* Jaw row */
  jawRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: 2 },
  quadrant: { flexDirection: 'row', alignItems: 'flex-end' },
  midLine: { width: 1.5, height: '80%', marginHorizontal: 2, borderRadius: 1 },

  /* Cross divider */
  crossDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 6, paddingHorizontal: 4 },
  crossLine: { flex: 1, height: 1.5 },
  crossCenter: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginHorizontal: 6 },

  /* Tooth numbers */
  toothNum: { fontSize: 7, fontWeight: '700', textAlign: 'center', letterSpacing: 0.3 },

  /* Quadrant labels */
  quadrantLabels: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 4, paddingHorizontal: 16 },
  qLabel: { fontSize: 8, fontWeight: '600', letterSpacing: 1.5, textTransform: 'uppercase' },

  /* Legend */
  legendCard: { borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.lg, marginBottom: SPACING.md },
  legendTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  legendGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADII.sm, borderWidth: 1 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontSize: 11, fontWeight: '500' },

  /* Info */
  infoCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: RADII.md, borderWidth: 1, padding: SPACING.md, marginBottom: SPACING.lg },
  infoText: { flex: 1, fontSize: 12, lineHeight: 17 },

  /* Modal */
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  modal: { borderRadius: RADII.lg, padding: SPACING.xl, alignItems: 'center', width: '100%', maxWidth: 320 },
  modalToothWrap: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  modalTitle: { fontSize: 22, fontWeight: '800', marginBottom: 2 },
  modalType: { fontSize: 12, marginBottom: 12 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADII.pill, marginBottom: 14 },
  statusText: { fontSize: 14, fontWeight: '700' },
  notesWrap: { width: '100%', borderRadius: RADII.sm, borderWidth: 1, padding: 12, marginBottom: 12 },
  notesLabel: { fontSize: 8, fontWeight: '600', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 },
  notesText: { fontSize: 13, lineHeight: 18 },
  modalDate: { fontSize: 11, marginBottom: 14 },
  modalBtn: { paddingHorizontal: 36, paddingVertical: 12, borderRadius: RADII.sm },
  modalBtnText: { color: '#F5F6F8', fontWeight: '700', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
});
