import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshControl, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabase';
import { COLORS, RADII, SPACING, GRADIENTS } from '../../styles/theme';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';
import HeroHeader from '../../components/ui/HeroHeader';
import AppCard from '../../components/ui/AppCard';

// ─── Types ────────────────────────────────────────────────────────────────────
type Severity = 'mild' | 'moderate' | 'severe';

type Diagnosis = {
  id: string;
  icd_code: string | null;
  description: string;
  severity: Severity | null;
  created_at: string;
  appointment_id: string | null;
  doctor: { full_name: string } | null;
};

type Prescription = {
  id: string;
  medication: string;
  dosage: string | null;
  instructions: string | null;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
  doctor: { full_name: string } | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' });
}

const SEV_CFG: Record<Severity, { label: string; color: string; bg: string; darkBg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  mild:     { label: 'Mierna',  color: '#2E7D5E', bg: '#EDF7F3', darkBg: '#1A3D2E', icon: 'shield-checkmark-outline' },
  moderate: { label: 'Stredná', color: '#3A4256', bg: '#FDF3E7', darkBg: '#2D2000', icon: 'alert-circle-outline' },
  severe:   { label: 'Ťažká',   color: '#C0392B', bg: '#FDEDEC', darkBg: '#3A0E0E', icon: 'warning-outline' },
};

// ─── DiagnosisCard ───────────────────────────────────────────────────────────
const DiagnosisCard = React.memo(function DiagnosisCard({ item, dark, colors }: { item: Diagnosis; dark: boolean; colors: any }) {
  const sev = item.severity ? SEV_CFG[item.severity] : null;

  return (
    <AppCard style={st.card} shadow="sm">
      {/* Header row */}
      <View style={st.cardRow}>
        <View style={[st.cardIcon, { backgroundColor: dark ? '#1E1610' : COLORS.bg2 }]}>
          <Ionicons name="medkit-outline" size={18} color={COLORS.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[st.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>{item.description}</Text>
          <Text style={[st.cardDate, { color: colors.textSecondary }]}>{fmtDate(item.created_at)}</Text>
        </View>
      </View>

      {/* Chips */}
      <View style={st.chipRow}>
        {item.icd_code ? (
          <View style={[st.chip, { backgroundColor: dark ? '#1E1610' : COLORS.bg2 }]}>
            <Text style={[st.chipText, { color: colors.textPrimary }]}>{item.icd_code}</Text>
          </View>
        ) : null}
        {sev ? (
          <View style={[st.chip, { backgroundColor: dark ? sev.darkBg : sev.bg }]}>
            <Ionicons name={sev.icon} size={11} color={sev.color} />
            <Text style={[st.chipText, { color: sev.color }]}>{sev.label}</Text>
          </View>
        ) : null}
      </View>

      {/* Doctor */}
      {item.doctor?.full_name ? (
        <View style={[st.doctorRow, { borderTopColor: dark ? '#1E1610' : COLORS.bg3 }]}>
          <Ionicons name="person-circle-outline" size={13} color={COLORS.sand} />
          <Text style={[st.doctorName, { color: colors.textSecondary }]}>MUDr. {item.doctor.full_name}</Text>
        </View>
      ) : null}
    </AppCard>
  );
});

// ─── PrescriptionCard ────────────────────────────────────────────────────────
const PrescriptionCard = React.memo(function PrescriptionCard({ item, dark, colors }: { item: Prescription; dark: boolean; colors: any }) {
  const isExpired = item.valid_until ? new Date(item.valid_until) < new Date() : false;
  const active = item.is_active && !isExpired;

  return (
    <AppCard style={st.card} shadow="sm">
      {/* Header */}
      <View style={st.cardRow}>
        <View style={[st.cardIcon, { backgroundColor: active ? (dark ? '#1A3D2E' : '#EDF7F3') : (dark ? '#1A1C1D' : COLORS.bg2) }]}>
          <Ionicons name="medical-outline" size={18} color={active ? '#2E7D5E' : '#7F8C8D'} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[st.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>{item.medication}</Text>
          <Text style={[st.cardDate, { color: colors.textSecondary }]}>{fmtDate(item.created_at)}</Text>
        </View>
        <View style={[st.statusBadge, { backgroundColor: active ? (dark ? '#1A3D2E' : '#EDF7F3') : (dark ? '#1A1C1D' : COLORS.bg3) }]}>
          <View style={[st.statusDot, { backgroundColor: active ? '#2E7D5E' : '#7F8C8D' }]} />
          <Text style={[st.statusText, { color: active ? '#2E7D5E' : '#7F8C8D' }]}>
            {active ? 'Aktívny' : isExpired ? 'Expirovaný' : 'Neaktívny'}
          </Text>
        </View>
      </View>

      {/* Details */}
      <View style={st.detailsWrap}>
        {item.dosage ? (
          <View style={st.detailRow}>
            <Ionicons name="fitness-outline" size={14} color={COLORS.gold} />
            <Text style={[st.detailText, { color: colors.textPrimary }]}>{item.dosage}</Text>
          </View>
        ) : null}
        {item.instructions ? (
          <View style={st.detailRow}>
            <Ionicons name="document-text-outline" size={14} color={COLORS.gold} />
            <Text style={[st.detailText, { color: colors.textPrimary }]}>{item.instructions}</Text>
          </View>
        ) : null}
        {item.valid_until ? (
          <View style={st.detailRow}>
            <Ionicons name="calendar-outline" size={14} color={isExpired ? '#C0392B' : COLORS.gold} />
            <Text style={[st.detailText, { color: isExpired ? '#C0392B' : colors.textPrimary }]}>
              Platné do: {item.valid_until}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Doctor */}
      {item.doctor?.full_name ? (
        <View style={[st.doctorRow, { borderTopColor: dark ? '#1E1610' : COLORS.bg3 }]}>
          <Ionicons name="person-circle-outline" size={13} color={COLORS.sand} />
          <Text style={[st.doctorName, { color: colors.textSecondary }]}>MUDr. {item.doctor.full_name}</Text>
        </View>
      ) : null}
    </AppCard>
  );
});

// ─── Main screen ─────────────────────────────────────────────────────────────
type Tab = 'diagnoses' | 'prescriptions';

export default function PrescriptionsScreen() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();

  const [tab, setTab] = useState<Tab>('diagnoses');
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [diagResult, rxResult] = await Promise.all([
        supabase
          .from('diagnoses')
          .select('id, icd_code, description, severity, created_at, appointment_id, doctor:profiles!diagnoses_doctor_id_fkey(full_name)')
          .eq('patient_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('prescriptions')
          .select('id, medication, dosage, instructions, valid_until, is_active, created_at, doctor:profiles!prescriptions_doctor_id_fkey(full_name)')
          .eq('patient_id', user.id)
          .order('created_at', { ascending: false }),
      ]);

      if (diagResult.data) {
        setDiagnoses(
          diagResult.data.map((r: any) => ({
            ...r,
            doctor: Array.isArray(r.doctor) ? (r.doctor[0] ?? null) : (r.doctor ?? null),
          }))
        );
      }
      if (rxResult.data) {
        setPrescriptions(
          rxResult.data.map((r: any) => ({
            ...r,
            doctor: Array.isArray(r.doctor) ? (r.doctor[0] ?? null) : (r.doctor ?? null),
          }))
        );
      }
    } catch (e) {
      console.warn('[PrescriptionsScreen] fetchData error:', e);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchData().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const activeRx = prescriptions.filter(p => p.is_active).length;

  return (
    <View style={[st.safe, { backgroundColor: dark ? '#0A0806' : colors.bg2 }]}>
      <HeroHeader
        title="Recepty & Diagnózy"
        subtitle={`${diagnoses.length} diagnóz · ${activeRx} aktívnych receptov`}
        icon="medkit-outline"
        onBack={() => router.back()}
      />

      {/* Premium tabs */}
      <View style={[st.tabBar, { backgroundColor: dark ? '#110E09' : COLORS.bg2 }]}>
        {(['diagnoses', 'prescriptions'] as Tab[]).map(t => {
          const active = tab === t;
          const label = t === 'diagnoses'
            ? `Diagnózy (${diagnoses.length})`
            : `Recepty (${prescriptions.length})`;
          const icon = t === 'diagnoses' ? 'medkit-outline' : 'medical-outline';
          return (
            <TouchableOpacity
              key={t}
              style={[st.tabBtn, active && st.tabBtnActive]}
              onPress={() => { setTab(t); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              activeOpacity={0.8}
            >
              {active && (
                <LinearGradient
                  colors={[COLORS.goldDark, COLORS.gold]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={st.tabBtnGrad}
                />
              )}
              <Ionicons name={icon as any} size={15} color={active ? '#1A1209' : colors.textSecondary} style={{ zIndex: 1 }} />
              <Text style={[st.tabBtnText, active ? st.tabBtnTextActive : { color: colors.textSecondary }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={{ flex: 1, padding: SPACING.xl, paddingTop: 16 }}>
          <SkeletonList count={5} />
        </View>
      ) : (
        <ScrollView
          style={st.scroll}
          contentContainerStyle={{ paddingTop: SPACING.lg, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} />}
        >
          {tab === 'diagnoses' ? (
            diagnoses.length === 0 ? (
              <View style={st.empty}>
                <View style={[st.emptyCircle, { backgroundColor: dark ? '#1E1610' : COLORS.bg2 }]}>
                  <Ionicons name="medkit-outline" size={44} color={COLORS.gold} />
                </View>
                <Text style={[st.emptyTitle, { color: colors.textPrimary }]}>Žiadne diagnózy</Text>
                <Text style={[st.emptySub, { color: colors.textSecondary }]}>
                  Váš lekár tu pridá diagnózy po vyšetrení.
                </Text>
              </View>
            ) : (
              diagnoses.map(item => <DiagnosisCard key={item.id} item={item} dark={dark} colors={colors} />)
            )
          ) : (
            prescriptions.length === 0 ? (
              <View style={st.empty}>
                <View style={[st.emptyCircle, { backgroundColor: dark ? '#1E1610' : COLORS.bg2 }]}>
                  <Ionicons name="medical-outline" size={44} color={COLORS.gold} />
                </View>
                <Text style={[st.emptyTitle, { color: colors.textPrimary }]}>Žiadne recepty</Text>
                <Text style={[st.emptySub, { color: colors.textSecondary }]}>
                  Váš lekár tu pridá recepty po vyšetrení.
                </Text>
              </View>
            ) : (
              prescriptions.map(item => <PrescriptionCard key={item.id} item={item} dark={dark} colors={colors} />)
            )
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  safe:   { flex: 1 },
  scroll: { flex: 1 },

  // Tabs
  tabBar: { flexDirection: 'row', gap: 10, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 11, borderRadius: RADII.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: 'transparent',
  },
  tabBtnActive: { borderColor: 'transparent' },
  tabBtnGrad: { ...StyleSheet.absoluteFillObject, borderRadius: RADII.lg },
  tabBtnText: { fontSize: 12, fontWeight: '600', zIndex: 1 },
  tabBtnTextActive: { color: '#1A1209', fontWeight: '700', zIndex: 1 },

  // Card
  card: { marginHorizontal: SPACING.xl, marginBottom: SPACING.md },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardIcon: { width: 38, height: 38, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  cardDate: { fontSize: 11 },

  // Chips
  chipRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADII.sm },
  chipText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

  // Status badge (prescription)
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADII.sm },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },

  // Details
  detailsWrap: { marginTop: 10, gap: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  detailText: { fontSize: 13, lineHeight: 19, flex: 1 },

  // Doctor
  doctorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1 },
  doctorName: { fontSize: 11, fontStyle: 'italic' },

  // Empty state
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64, paddingHorizontal: 32 },
  emptyCircle: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 20, maxWidth: 260 },
});
