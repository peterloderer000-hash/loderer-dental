/**
 * Insurance Estimator — kalkulačka poistného krytia
 */
import React, { useState } from 'react';
import {
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { COLORS, SPACING, RADII, SHADOWS } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { useAppTheme } from '../../context/ThemeContext';

type Treatment = {
  key: string;
  name: string;
  icon: string;
  avgPrice: number;
  coveragePct: { [k: string]: number };
};

const INSURERS = [
  { key: 'vszp', name: 'VšZP' },
  { key: 'dovera', name: 'Dôvera' },
  { key: 'union', name: 'Union' },
];

const TREATMENTS: Treatment[] = [
  { key: 'preventivna', name: 'Preventívna prehliadka', icon: '🔍', avgPrice: 0, coveragePct: { vszp: 100, dovera: 100, union: 100 } },
  { key: 'cistenie', name: 'Dentálna hygiena', icon: '🪥', avgPrice: 45, coveragePct: { vszp: 50, dovera: 60, union: 55 } },
  { key: 'vypln', name: 'Zubná výplň (plomba)', icon: '🦷', avgPrice: 60, coveragePct: { vszp: 70, dovera: 75, union: 65 } },
  { key: 'korunka', name: 'Zubná korunka', icon: '👑', avgPrice: 350, coveragePct: { vszp: 40, dovera: 50, union: 45 } },
  { key: 'most', name: 'Zubný most', icon: '🌉', avgPrice: 800, coveragePct: { vszp: 35, dovera: 45, union: 40 } },
  { key: 'extrakcia', name: 'Extrakcia zuba', icon: '🔧', avgPrice: 80, coveragePct: { vszp: 80, dovera: 85, union: 75 } },
  { key: 'rtg', name: 'Panoramatický RTG', icon: '📷', avgPrice: 35, coveragePct: { vszp: 90, dovera: 95, union: 85 } },
  { key: 'implant', name: 'Zubný implantát', icon: '🔩', avgPrice: 1200, coveragePct: { vszp: 0, dovera: 10, union: 5 } },
  { key: 'bielenie', name: 'Bielenie zubov', icon: '✨', avgPrice: 250, coveragePct: { vszp: 0, dovera: 0, union: 0 } },
  { key: 'ortodontia', name: 'Ortodontia (rovnátka)', icon: '😬', avgPrice: 2500, coveragePct: { vszp: 15, dovera: 20, union: 10 } },
];

export default function InsuranceCalc() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();

  const [insurer, setInsurer] = useState('vszp');
  const [selected, setSelected] = useState<string[]>([]);

  function toggleTreatment(key: string) {
    Haptics.selectionAsync();
    setSelected(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  const selectedTreatments = TREATMENTS.filter(t => selected.includes(t.key));
  const totalPrice = selectedTreatments.reduce((s, t) => s + t.avgPrice, 0);
  const totalCovered = selectedTreatments.reduce((s, t) => s + (t.avgPrice * (t.coveragePct[insurer] ?? 0) / 100), 0);
  const totalOOP = totalPrice - totalCovered;

  return (
    <View style={[st.safe, { backgroundColor: colors.esp }]}>
      <HeroHeader title="Poisťovňa" subtitle="Odhad nákladov" icon="calculator-outline" onBack={() => router.back()} />

      <ScrollView style={[st.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={st.content}
        showsVerticalScrollIndicator={false}>

        {/* Insurer picker */}
        <Animated.View entering={FadeInDown.delay(100)} style={[st.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
          <Text style={[st.cardTitle, { color: colors.textPrimary }]}>Vaša poisťovňa</Text>
          <View style={st.insurerRow}>
            {INSURERS.map(ins => {
              const sel = insurer === ins.key;
              return (
                <TouchableOpacity key={ins.key}
                  style={[st.insurerChip, { backgroundColor: sel ? COLORS.gold : colors.bg2, borderColor: sel ? COLORS.gold : colors.bg3 }]}
                  onPress={() => { setInsurer(ins.key); Haptics.selectionAsync(); }}>
                  <Text style={[st.insurerText, { color: sel ? '#F5F6F8' : colors.textPrimary }]}>{ins.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>

        {/* Treatment list */}
        <Animated.View entering={FadeInDown.delay(200)} style={[st.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
          <Text style={[st.cardTitle, { color: colors.textPrimary }]}>Vyberte zákroky</Text>
          {TREATMENTS.map((t, i) => {
            const sel = selected.includes(t.key);
            const pct = t.coveragePct[insurer] ?? 0;
            return (
              <TouchableOpacity key={t.key}
                style={[st.treatRow, sel && { backgroundColor: COLORS.gold + '08' }, i > 0 && { borderTopWidth: 0.5, borderTopColor: colors.bg3 }]}
                onPress={() => toggleTreatment(t.key)} activeOpacity={0.7}>
                <View style={[st.checkBox, { borderColor: sel ? COLORS.gold : colors.bg3, backgroundColor: sel ? COLORS.gold : 'transparent' }]}>
                  {sel && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={{ fontSize: 20 }}>{t.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[st.treatName, { color: colors.textPrimary }]}>{t.name}</Text>
                  <View style={st.treatMeta}>
                    <Text style={[st.treatPrice, { color: colors.textSecondary }]}>~{t.avgPrice}€</Text>
                    <View style={[st.coverBadge, {
                      backgroundColor: pct >= 70 ? COLORS.success + '15' : pct >= 30 ? COLORS.warning + '15' : COLORS.error + '15',
                    }]}>
                      <Text style={[st.coverText, {
                        color: pct >= 70 ? COLORS.success : pct >= 30 ? COLORS.warning : COLORS.error,
                      }]}>Krytie {pct}%</Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </Animated.View>

        {/* Result */}
        {selected.length > 0 && (
          <Animated.View entering={FadeInDown.delay(100)} style={[st.resultCard, { backgroundColor: colors.cardBg, borderColor: COLORS.gold }]}>
            <Text style={[st.resultTitle, { color: colors.textPrimary }]}>Odhad nákladov</Text>

            {selectedTreatments.map(t => {
              const pct = t.coveragePct[insurer] ?? 0;
              const covered = t.avgPrice * pct / 100;
              return (
                <View key={t.key} style={st.resultRow}>
                  <Text style={[st.resultLabel, { color: colors.textSecondary, flex: 1 }]}>{t.icon} {t.name}</Text>
                  <Text style={[st.resultVal, { color: COLORS.success }]}>-{covered.toFixed(0)}€</Text>
                  <Text style={[st.resultVal, { color: colors.textPrimary }]}>{(t.avgPrice - covered).toFixed(0)}€</Text>
                </View>
              );
            })}

            <View style={[st.divider, { backgroundColor: colors.bg3 }]} />

            <View style={st.totalRow}>
              <View style={{ flex: 1 }}>
                <Text style={[st.totalLabel, { color: colors.textSecondary }]}>Celková cena</Text>
                <Text style={[st.totalVal, { color: colors.textPrimary }]}>{totalPrice}€</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={[st.totalLabel, { color: COLORS.success }]}>Poisťovňa hradí</Text>
                <Text style={[st.totalVal, { color: COLORS.success }]}>-{totalCovered.toFixed(0)}€</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[st.totalLabel, { color: COLORS.gold }]}>Vy platíte</Text>
                <Text style={[st.totalBig, { color: COLORS.gold }]}>{totalOOP.toFixed(0)}€</Text>
              </View>
            </View>
          </Animated.View>
        )}

        <View style={[st.disclaimer, { backgroundColor: dark ? 'rgba(26,82,118,0.15)' : COLORS.infoBg }]}>
          <Ionicons name="information-circle" size={14} color={COLORS.info} />
          <Text style={[st.disclaimerText, { color: colors.textSecondary }]}>
            Toto je orientačný odhad. Skutočné krytie závisí od vášho poistného plánu a zmluvných podmienok.
          </Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: SPACING.xl },

  card: { borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.lg, marginBottom: SPACING.lg },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 14 },

  insurerRow: { flexDirection: 'row', gap: 8 },
  insurerChip: { flex: 1, paddingVertical: 12, borderRadius: RADII.pill, borderWidth: 1, alignItems: 'center' },
  insurerText: { fontWeight: '700', fontSize: 14 },

  treatRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 4 },
  checkBox: { width: 22, height: 22, borderRadius: 2, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  treatName: { fontSize: 13, fontWeight: '600' },
  treatMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  treatPrice: { fontSize: 12 },
  coverBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  coverText: { fontSize: 10, fontWeight: '700' },

  resultCard: { borderRadius: RADII.lg, borderWidth: 2, padding: SPACING.lg, marginBottom: SPACING.lg },
  resultTitle: { fontSize: 16, fontWeight: '800', marginBottom: 14 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  resultLabel: { fontSize: 12 },
  resultVal: { fontSize: 12, fontWeight: '700', width: 50, textAlign: 'right' },

  divider: { height: 1, marginVertical: 12 },
  totalRow: { flexDirection: 'row', alignItems: 'flex-end' },
  totalLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase' },
  totalVal: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  totalBig: { fontSize: 24, fontWeight: '800', marginTop: 2 },

  disclaimer: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: RADII.sm, alignItems: 'flex-start' },
  disclaimerText: { flex: 1, fontSize: 11, lineHeight: 16 },
});
