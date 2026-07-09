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

/* ─── SVG cesty pre anatomické tvary zubov s koreňmi ─────────────────────── */
// Horné zuby (korene hore, korunka dole) — výrazné anatomické tvary
const UPPER_PATHS: Record<string, { path: string; w: number; h: number }> = {
  // Stolička — široká korunka, 3 korene (2 bukálne + 1 palatinálny)
  molar: {
    w: 32, h: 48,
    path: 'M5,0 C4,0 3,2 4,6 L6,16 C5,18 4,18 3,16 L2,6 C1,2 0,2 0,4 L1,16 C1,18 2,19 3,19 L4,19 C5,20 5,22 5,24 L3,28 C1,32 1,38 4,44 C6,47 10,48 16,48 C22,48 26,47 28,44 C31,38 31,32 29,28 L27,24 C27,22 27,20 28,19 L29,19 C30,19 31,18 31,16 L32,4 C32,2 31,2 30,6 L29,16 C28,18 27,18 26,16 L28,6 C29,2 28,0 27,0 C26,0 25,2 25,6 L24,14 C23,16 22,17 21,16 L21,12 C21,8 20,4 18,2 L16,0 L14,2 C12,4 11,8 11,12 L11,16 C10,17 9,16 8,14 L7,6 C7,2 6,0 5,0 Z',
  },
  // Predstolička — stredná korunka, 1-2 korene
  premolar: {
    w: 24, h: 46,
    path: 'M8,0 C7,0 6,2 7,8 L8,16 C7,18 6,18 5,16 L4,8 C3,4 2,2 2,4 L3,16 C3,18 4,19 5,20 L5,24 C3,28 2,34 4,40 C5,43 8,46 12,46 C16,46 19,43 20,40 C22,34 21,28 19,24 L19,20 C20,19 21,18 21,16 L22,4 C22,2 21,4 20,8 L19,16 C18,18 17,18 16,16 L17,8 C18,2 17,0 16,0 C15,0 14,3 14,8 L13,14 C13,16 12,17 12,17 C12,17 11,16 11,14 L10,8 C10,3 9,0 8,0 Z',
  },
  // Očný zub — úzky, dlhý, 1 koreň (najdlhší)
  canine: {
    w: 18, h: 50,
    path: 'M9,0 C7,0 6,4 6,10 L6,18 C5,20 4,20 4,18 L4,14 C3,10 2,10 2,12 L3,18 C3,20 4,22 5,22 L5,26 C4,30 3,36 3,42 C4,46 6,50 9,50 C12,50 14,46 15,42 C15,36 14,30 13,26 L13,22 C14,22 15,20 15,18 L16,12 C16,10 15,10 14,14 L14,18 C14,20 13,20 12,18 L12,10 C12,4 11,0 9,0 Z',
  },
  // Rezák — široká plochá korunka, 1 koreň
  incisor: {
    w: 18, h: 42,
    path: 'M9,0 C7,0 6,3 6,8 L6,16 C5,18 4,18 4,16 L4,12 C3,8 2,8 2,10 L3,16 C3,18 4,20 5,20 L4,24 C3,28 2,32 3,36 C4,39 6,42 9,42 C12,42 14,39 15,36 C16,32 15,28 14,24 L13,20 C14,20 15,18 15,16 L16,10 C16,8 15,8 14,12 L14,16 C14,18 13,18 12,16 L12,8 C12,3 11,0 9,0 Z',
  },
};

// Dolné zuby (korene dole, korunka hore) — zrkadlové anatomické tvary
const LOWER_PATHS: Record<string, { path: string; w: number; h: number }> = {
  // Stolička — široká korunka, 2 korene
  molar: {
    w: 32, h: 48,
    path: 'M4,4 C1,10 1,16 3,20 L5,24 C5,26 5,28 4,29 L3,29 C2,29 1,30 1,32 L0,44 C0,46 1,46 2,42 L3,32 C4,30 5,30 6,32 L7,42 C8,46 9,48 10,48 C11,48 12,44 11,38 L10,32 C10,30 11,29 12,30 L14,32 C16,34 18,36 20,32 L22,30 C23,29 24,30 24,32 L23,38 C22,44 23,48 24,48 C25,48 26,46 27,42 L28,32 C29,30 30,30 31,32 L32,44 C32,46 33,46 32,42 L31,32 C31,30 30,29 29,29 L28,29 C27,28 27,26 27,24 L29,20 C31,16 31,10 28,4 C26,1 22,0 16,0 C10,0 6,1 4,4 Z',
  },
  // Predstolička — 1 koreň
  premolar: {
    w: 24, h: 46,
    path: 'M4,6 C2,12 2,18 4,22 L5,24 C5,26 5,28 4,29 L3,30 C2,30 2,32 3,34 L5,40 C6,42 7,44 8,46 C9,48 10,46 10,42 L10,36 C10,34 11,33 12,33 C13,33 14,34 14,36 L14,42 C14,46 15,48 16,46 L17,44 C18,42 19,40 20,36 L21,32 C21,30 21,30 20,29 L19,28 C19,26 19,24 20,22 C22,18 22,12 20,6 C19,3 16,0 12,0 C8,0 5,3 4,6 Z',
  },
  // Očný zub — 1 dlhý koreň
  canine: {
    w: 18, h: 50,
    path: 'M3,8 C3,14 4,20 5,24 L5,26 C4,28 3,28 3,26 L3,22 C2,20 1,20 2,22 L3,28 C3,30 4,30 5,30 L5,34 C4,38 4,42 6,46 C7,48 8,50 9,50 C10,50 11,48 12,46 C14,42 14,38 13,34 L13,30 C14,30 15,30 15,28 L16,22 C17,20 16,20 15,22 L15,26 C15,28 14,28 13,26 L13,24 C14,20 15,14 15,8 C14,4 12,0 9,0 C6,0 4,4 3,8 Z',
  },
  // Rezák — 1 koreň
  incisor: {
    w: 18, h: 42,
    path: 'M3,6 C2,10 2,16 3,20 L4,22 C4,24 3,24 3,22 L3,18 C2,16 1,16 2,18 L3,24 C3,26 4,26 5,26 L4,30 C3,34 3,36 5,38 C6,40 8,42 9,42 C10,42 12,40 13,38 C15,36 15,34 14,30 L13,26 C14,26 15,26 15,24 L16,18 C17,16 16,16 15,18 L15,22 C15,24 14,24 14,22 L15,20 C16,16 16,10 15,6 C14,2 12,0 9,0 C6,0 4,2 3,6 Z',
  },
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
  const TOOTH_SCALE = Math.min((SCREEN_W - 48) / 380, 0.85);

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
              y={isUpper ? shape.h * 0.72 : shape.h * 0.28}
              fontSize={type === 'molar' ? 12 : 10}
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
                    <Svg width={shape.w * 1.8} height={shape.h * 1.8} viewBox={`0 0 ${shape.w} ${shape.h}`}>
                      <Path d={shape.path} fill={cfg.color + '35'} stroke={cfg.color} strokeWidth={1.5} strokeLinejoin="round" />
                      <SvgText x={shape.w / 2} y={isUpper ? shape.h * 0.72 : shape.h * 0.28} fontSize={14} fontWeight="800" fill={cfg.color} textAnchor="middle" alignmentBaseline="central">
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
  jawRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: 0 },
  quadrant: { flexDirection: 'row', alignItems: 'flex-end' },
  midLine: { width: 1.5, height: '70%', marginHorizontal: 1, borderRadius: 1 },

  /* Cross divider */
  crossDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 6, paddingHorizontal: 4 },
  crossLine: { flex: 1, height: 1.5 },
  crossCenter: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginHorizontal: 6 },

  /* Tooth numbers */
  toothNum: { fontSize: 