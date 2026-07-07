/**
 * Interaktívna zubná mapa — vizuálny diagram s farebnými stavmi zubov
 */
import React, { useState, useCallback } from 'react';
import {
  ScrollView, StyleSheet, Text, TouchableOpacity, View, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';

type ToothData = {
  tooth_number: number;
  status: string;
  notes?: string;
  last_updated?: string;
};

const STATUS_CONFIG: { [k: string]: { color: string; label: string; icon: string } } = {
  healthy: { color: '#52C896', label: 'Zdravý', icon: '✓' },
  cavity: { color: '#C0392B', label: 'Kazivosť', icon: '!' },
  filled: { color: '#3498DB', label: 'Výplň', icon: '◆' },
  filling: { color: '#3498DB', label: 'Výplň', icon: '◆' },
  crown: { color: '#9B59B6', label: 'Korunka', icon: '♛' },
  missing: { color: '#95A5A6', label: 'Chýba', icon: '✕' },
  implant: { color: '#B8ACA0', label: 'Implantát', icon: '⚙' },
  root_canal: { color: '#E67E22', label: 'Endodoncia', icon: '↓' },
  bridge: { color: '#8E44AD', label: 'Most', icon: '═' },
  unknown: { color: '#BDC3C7', label: 'Nezistený', icon: '?' },
};

// Standard dental numbering (FDI)
const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];

function toothShape(num: number): 'molar' | 'premolar' | 'canine' | 'incisor' {
  const n = num % 10;
  if (n >= 6) return 'molar';
  if (n >= 4) return 'premolar';
  if (n === 3) return 'canine';
  return 'incisor';
}

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

  function getStatus(num: number) {
    return teeth.get(num)?.status ?? 'unknown';
  }

  function getConfig(status: string) {
    return STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;
  }

  // Stats
  const allTeeth = [...teeth.values()];
  const healthyCount = allTeeth.filter(t => t.status === 'healthy').length;
  const issueCount = allTeeth.filter(t => ['cavity', 'root_canal'].includes(t.status)).length;
  const restoredCount = allTeeth.filter(t => ['filled', 'filling', 'crown', 'bridge', 'implant'].includes(t.status)).length;

  function ToothCell({ num }: { num: number }) {
    const status = getStatus(num);
    const cfg = getConfig(status);
    const shape = toothShape(num);
    const size = shape === 'molar' ? 36 : shape === 'premolar' ? 32 : 28;

    return (
      <TouchableOpacity
        onPress={() => setSelectedTooth(teeth.get(num) ?? { tooth_number: num, status: 'unknown' })}
        style={[st.toothCell, { width: size, height: size + 10 }]}
        activeOpacity={0.7}>
        <View style={[st.toothBody, {
          width: size, height: size,
          backgroundColor: cfg.color + '25',
          borderColor: cfg.color,
          borderRadius: shape === 'molar' ? 8 : shape === 'premolar' ? 7 : shape === 'canine' ? 10 : 6,
        }]}>
          <Text style={[st.toothIcon, { color: cfg.color }]}>{cfg.icon}</Text>
        </View>
        <Text style={[st.toothNum, { color: colors.textSecondary }]}>{num}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[st.safe, { backgroundColor: colors.esp }]}>
      <HeroHeader title="Zubná mapa" subtitle="Interaktívny diagram" icon="grid-outline" onBack={() => router.back()} />

      <ScrollView style={[st.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={st.content}
        showsVerticalScrollIndicator={false}>

        {loading ? <SkeletonList count={4} /> : (
          <>
            {/* Stats */}
            <Animated.View entering={FadeInDown.delay(100)} style={st.statsRow}>
              {[
                { num: healthyCount, label: 'Zdravých', color: COLORS.success },
                { num: issueCount, label: 'Problémov', color: COLORS.error },
                { num: restoredCount, label: 'Ošetrených', color: COLORS.info },
              ].map((s, i) => (
                <View key={i} style={[st.statCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                  <Text style={[st.statNum, { color: s.color }]}>{s.num}</Text>
                  <Text style={[st.statLabel, { color: colors.textSecondary }]}>{s.label}</Text>
                </View>
              ))}
            </Animated.View>

            {/* Dental diagram */}
            <Animated.View entering={FadeInDown.delay(200)} style={[st.diagramCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <Text style={[st.diagramTitle, { color: colors.textPrimary }]}>Horná čeľusť</Text>
              <View style={st.jawRow}>
                <View style={st.quadrant}>
                  {UPPER_RIGHT.map(n => <ToothCell key={n} num={n} />)}
                </View>
                <View style={[st.midLine, { backgroundColor: colors.bg3 }]} />
                <View style={st.quadrant}>
                  {UPPER_LEFT.map(n => <ToothCell key={n} num={n} />)}
                </View>
              </View>

              <View style={[st.jawDivider, { borderColor: colors.bg3 }]}>
                <Text style={[st.jawDividerText, { color: colors.textSecondary }]}>— — —</Text>
              </View>

              <Text style={[st.diagramTitle, { color: colors.textPrimary }]}>Dolná čeľusť</Text>
              <View style={st.jawRow}>
                <View style={st.quadrant}>
                  {LOWER_RIGHT.map(n => <ToothCell key={n} num={n} />)}
                </View>
                <View style={[st.midLine, { backgroundColor: colors.bg3 }]} />
                <View style={st.quadrant}>
                  {LOWER_LEFT.map(n => <ToothCell key={n} num={n} />)}
                </View>
              </View>
            </Animated.View>

            {/* Legend */}
            <Animated.View entering={FadeInDown.delay(300)} style={[st.legendCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <Text style={[st.legendTitle, { color: colors.textPrimary }]}>Legenda</Text>
              <View style={st.legendGrid}>
                {Object.entries(STATUS_CONFIG).filter(([k]) => k !== 'unknown').map(([key, cfg]) => (
                  <View key={key} style={st.legendItem}>
                    <View style={[st.legendDot, { backgroundColor: cfg.color }]} />
                    <Text style={[st.legendText, { color: colors.textSecondary }]}>{cfg.label}</Text>
                  </View>
                ))}
              </View>
            </Animated.View>
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Tooth detail modal */}
      <Modal visible={!!selectedTooth} transparent animationType="fade"
        onRequestClose={() => setSelectedTooth(null)}>
        <TouchableOpacity style={st.overlay} activeOpacity={1} onPress={() => setSelectedTooth(null)}>
          <View style={[st.modal, { backgroundColor: colors.cardBg }]}>
            {selectedTooth && (() => {
              const cfg = getConfig(selectedTooth.status);
              return (
                <>
                  <View style={[st.modalIcon, { backgroundColor: cfg.color + '20' }]}>
                    <Text style={{ fontSize: 32, color: cfg.color }}>{cfg.icon}</Text>
                  </View>
                  <Text style={[st.modalTitle, { color: colors.textPrimary }]}>
                    Zub č. {selectedTooth.tooth_number}
                  </Text>
                  <View style={[st.statusBadge, { backgroundColor: cfg.color + '15' }]}>
                    <Text style={[st.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                  {selectedTooth.notes && (
                    <Text style={[st.modalNotes, { color: colors.textSecondary }]}>
                      {selectedTooth.notes}
                    </Text>
                  )}
                  {selectedTooth.last_updated && (
                    <Text style={[st.modalDate, { color: colors.textSecondary }]}>
                      Posledná aktualizácia: {new Date(selectedTooth.last_updated).toLocaleDateString('sk-SK')}
                    </Text>
                  )}
                  <TouchableOpacity style={st.modalBtn} onPress={() => setSelectedTooth(null)}>
                    <Text style={st.modalBtnText}>Zavrieť</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: SPACING.lg },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: SPACING.lg },
  statCard: { flex: 1, borderRadius: RADII.md, borderWidth: 1, padding: 12, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', marginTop: 2 },

  diagramCard: { borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.md, marginBottom: SPACING.lg },
  diagramTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', marginBottom: 8 },

  jawRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start' },
  quadrant: { flexDirection: 'row', gap: 2, flexWrap: 'nowrap' },
  midLine: { width: 2, height: 50, marginHorizontal: 4, borderRadius: 1 },
  jawDivider: { borderTopWidth: 1, borderStyle: 'dashed', marginVertical: 12, alignItems: 'center' },
  jawDividerText: { fontSize: 10, marginTop: -8, paddingHorizontal: 8 },

  toothCell: { alignItems: 'center' },
  toothBody: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  toothIcon: { fontSize: 12, fontWeight: '800' },
  toothNum: { fontSize: 8, marginTop: 2 },

  legendCard: { borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.lg, marginBottom: SPACING.lg },
  legendTitle: { fontSize: 13, fontWeight: '700', marginBottom: 10 },
  legendGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, width: '45%' },
  legendDot: { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontSize: 11 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  modal: { borderRadius: RADII.lg, padding: SPACING.xl, alignItems: 'center', width: '100%', maxWidth: 320 },
  modalIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  statusBadge: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: RADII.pill, marginTop: 8 },
  statusText: { fontSize: 14, fontWeight: '700' },
  modalNotes: { fontSize: 13, textAlign: 'center', marginTop: 12, lineHeight: 18 },
  modalDate: { fontSize: 11, marginTop: 8 },
  modalBtn: { marginTop: 20, paddingHorizontal: 32, paddingVertical: 12, backgroundColor: COLORS.gold, borderRadius: RADII.pill },
  modalBtnText: { color: '#F5F6F8', fontWeight: '700', fontSize: 14 },
});
