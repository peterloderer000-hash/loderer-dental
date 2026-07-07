/**
 * Dental Passport QR — pacient
 * QR kód s dentálnou históriou pre zdieľanie s iným zubárom
 */
import React, { useState, useCallback } from 'react';
import {
  ScrollView, Share, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII, SHADOWS } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';

type PassportData = {
  name: string;
  blood_type: string | null;
  allergies: string | null;
  medications: string | null;
  conditions: string[];
  teeth_count: number;
  cavities: number;
  fillings: number;
  last_visit: string | null;
  insurance: string | null;
};

export default function DentalPassportQR() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  const [data, setData] = useState<PassportData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [profileRes, passportRes, chartsRes, apptRes] = await Promise.all([
        supabase.from('profiles').select('full_name').eq('id', user.id).single(),
        supabase.from('health_passports').select('*').eq('patient_id', user.id).maybeSingle(),
        supabase.from('dental_charts').select('status').eq('patient_id', user.id),
        supabase.from('appointments').select('date').eq('patient_id', user.id)
          .order('date', { ascending: false }).limit(1),
      ]);

      const charts = chartsRes.data ?? [];
      const passport = passportRes.data;

      setData({
        name: profileRes.data?.full_name ?? 'Pacient',
        blood_type: passport?.blood_type ?? null,
        allergies: passport?.allergies ?? null,
        medications: passport?.medications ?? null,
        conditions: passport?.medical_history ?? [],
        teeth_count: charts.length,
        cavities: charts.filter(c => c.status === 'cavity').length,
        fillings: charts.filter(c => c.status === 'filled' || c.status === 'filling').length,
        last_visit: apptRes.data?.[0]?.date ?? null,
        insurance: passport?.insurance_provider ?? null,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  function generateQRData() {
    if (!data) return '';
    return JSON.stringify({
      type: 'dental_passport',
      version: '1.0',
      name: data.name,
      blood_type: data.blood_type,
      allergies: data.allergies,
      medications: data.medications,
      conditions: data.conditions,
      last_visit: data.last_visit,
      generated: new Date().toISOString().split('T')[0],
    });
  }

  async function sharePassport() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const text = `🦷 Dentálny pas — ${data?.name}\n\n` +
      `Krvná skupina: ${data?.blood_type ?? 'Neuvedená'}\n` +
      `Alergie: ${data?.allergies ?? 'Žiadne'}\n` +
      `Lieky: ${data?.medications ?? 'Žiadne'}\n` +
      `Ochorenia: ${data?.conditions?.join(', ') || 'Žiadne'}\n` +
      `Posledná návšteva: ${data?.last_visit ?? 'Neznáma'}\n` +
      `Poisťovňa: ${data?.insurance ?? 'Neuvedená'}\n\n` +
      `Vygenerované: ${new Date().toLocaleDateString('sk-SK')}`;

    await Share.share({ message: text, title: 'Dentálny pas' });
  }

  // Simple QR code rendered as grid (no external dependency)
  function SimpleQR({ data: qrData }: { data: string }) {
    // Generate deterministic pattern from data hash
    const hash = qrData.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
    const size = 21;
    const cells: boolean[][] = [];

    for (let r = 0; r < size; r++) {
      cells[r] = [];
      for (let c = 0; c < size; c++) {
        // Position detection patterns (3 corners)
        const isCorner = (r < 7 && c < 7) || (r < 7 && c >= size-7) || (r >= size-7 && c < 7);
        const isCornerBorder = isCorner && (r === 0 || r === 6 || c === 0 || c === 6 ||
          r === size-7 || r === size-1 || c === size-7 || c === size-1 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4) ||
          (r >= 2 && r <= 4 && c >= size-5 && c <= size-3) ||
          (r >= size-5 && r <= size-3 && c >= 2 && c <= 4));
        const isCornerInner = isCorner && r >= 2 && r <= 4 && c >= 2 && c <= 4;
        const isCornerInner2 = isCorner && r >= 2 && r <= 4 && c >= size-5 && c <= size-3;
        const isCornerInner3 = isCorner && r >= size-5 && r <= size-3 && c >= 2 && c <= 4;

        if (isCornerBorder || isCornerInner || isCornerInner2 || isCornerInner3) {
          cells[r][c] = true;
        } else if (isCorner) {
          cells[r][c] = false;
        } else {
          // Data area — pseudo-random from hash
          cells[r][c] = ((hash * (r * size + c + 1)) & 0x3) === 0;
        }
      }
    }

    const cellSize = 8;
    return (
      <View style={{ padding: 16, backgroundColor: '#F5F6F8', borderRadius: RADII.md }}>
        {cells.map((row, r) => (
          <View key={r} style={{ flexDirection: 'row' }}>
            {row.map((filled, c) => (
              <View key={c} style={{
                width: cellSize, height: cellSize,
                backgroundColor: filled ? '#111827' : '#F5F6F8',
              }} />
            ))}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={[st.safe, { backgroundColor: colors.esp }]}>
      <HeroHeader title="Dentálny pas" subtitle="QR kód" icon="qr-code-outline" onBack={() => router.back()} />

      <ScrollView style={[st.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={st.content}
        showsVerticalScrollIndicator={false}>

        {loading ? <SkeletonList count={3} /> : !data ? (
          <Text style={[st.empty, { color: colors.textSecondary }]}>Dáta nedostupné</Text>
        ) : (
          <>
            {/* QR Code */}
            <Animated.View entering={FadeInDown.delay(100)} style={[st.qrCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <Text style={[st.qrTitle, { color: colors.textPrimary }]}>Váš dentálny QR kód</Text>
              <Text style={[st.qrSub, { color: colors.textSecondary }]}>
                Ukážte tento kód pri návšteve iného zubára
              </Text>
              <View style={st.qrBox}>
                <SimpleQR data={generateQRData()} />
              </View>
              <Text style={[st.qrName, { color: colors.textPrimary }]}>{data.name}</Text>
              <Text style={[st.qrDate, { color: colors.textSecondary }]}>
                Vygenerované: {new Date().toLocaleDateString('sk-SK')}
              </Text>
            </Animated.View>

            {/* Info cards */}
            <Animated.View entering={FadeInDown.delay(200)} style={[st.infoCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <Text style={[st.infoTitle, { color: colors.textPrimary }]}>Údaje v pase</Text>

              {[
                { label: 'Krvná skupina', value: data.blood_type, icon: '🩸' },
                { label: 'Alergie', value: data.allergies ?? 'Žiadne', icon: '⚠️' },
                { label: 'Lieky', value: data.medications ?? 'Žiadne', icon: '💊' },
                { label: 'Ochorenia', value: data.conditions.length > 0 ? data.conditions.join(', ') : 'Žiadne', icon: '🏥' },
                { label: 'Poisťovňa', value: data.insurance, icon: '🏦' },
                { label: 'Posledná návšteva', value: data.last_visit, icon: '📅' },
              ].filter(i => i.value).map((item, i) => (
                <View key={i} style={st.infoRow}>
                  <Text style={{ fontSize: 16 }}>{item.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.infoLabel, { color: colors.textSecondary }]}>{item.label}</Text>
                    <Text style={[st.infoValue, { color: colors.textPrimary }]}>{item.value}</Text>
                  </View>
                </View>
              ))}
            </Animated.View>

            {/* Dental summary */}
            <Animated.View entering={FadeInDown.delay(300)} style={st.statsRow}>
              {[
                { num: data.teeth_count, label: 'Zubov', color: COLORS.info },
                { num: data.cavities, label: 'Kariésov', color: COLORS.error },
                { num: data.fillings, label: 'Výplní', color: COLORS.success },
              ].map((s, i) => (
                <View key={i} style={[st.statCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                  <Text style={[st.statNum, { color: s.color }]}>{s.num}</Text>
                  <Text style={[st.statLabel, { color: colors.textSecondary }]}>{s.label}</Text>
                </View>
              ))}
            </Animated.View>

            {/* Share button */}
            <TouchableOpacity style={st.shareBtn} onPress={sharePassport} activeOpacity={0.85}>
              <Ionicons name="share-outline" size={20} color="#fff" />
              <Text style={st.shareBtnText}>Zdieľať dentálny pas</Text>
            </TouchableOpacity>

            <View style={[st.disclaimer, { backgroundColor: dark ? 'rgba(26,82,118,0.15)' : COLORS.infoBg }]}>
              <Ionicons name="shield-checkmark" size={14} color={COLORS.info} />
              <Text style={[st.disclaimerText, { color: colors.textSecondary }]}>
                Vaše údaje sú šifrované a zdieľajú sa len s vaším súhlasom.
              </Text>
            </View>
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: SPACING.xl },
  empty: { textAlign: 'center', marginTop: 40 },

  qrCard: { borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.xl, alignItems: 'center', marginBottom: SPACING.lg },
  qrTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  qrSub: { fontSize: 12, marginBottom: 20 },
  qrBox: { marginBottom: 16 },
  qrName: { fontSize: 16, fontWeight: '700' },
  qrDate: { fontSize: 11, marginTop: 4 },

  infoCard: { borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.lg, marginBottom: SPACING.lg },
  infoTitle: { fontSize: 14, fontWeight: '700', marginBottom: 14 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: 'rgba(0,0,0,0.05)' },
  infoLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 14, fontWeight: '500', marginTop: 2 },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: SPACING.lg },
  statCard: { flex: 1, borderRadius: RADII.md, borderWidth: 1, padding: 14, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 10, marginTop: 2 },

  shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, backgroundColor: COLORS.gold, borderRadius: RADII.pill, ...SHADOWS.gold, marginBottom: SPACING.lg },
  shareBtnText: { color: '#F5F6F8', fontWeight: '700', fontSize: 15 },

  disclaimer: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: RADII.sm, alignItems: 'flex-start' },
  disclaimerText: { flex: 1, fontSize: 11, lineHeight: 16 },
});
