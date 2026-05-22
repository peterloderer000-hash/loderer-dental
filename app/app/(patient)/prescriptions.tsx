import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../supabase';
import { COLORS, SIZES } from '../../styles/theme';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';

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

function formatDate(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString('sk-SK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const SEVERITY_CONFIG: Record<Severity, { label: string; bg: string; color: string; border: string }> = {
  mild:     { label: 'Mierna',  bg: '#EAFAF1', color: '#1E8449', border: '#A9DFBF' },
  moderate: { label: 'Stredná', bg: '#FEF9E7', color: '#7D6608', border: '#F9E79F' },
  severe:   { label: 'Ťažká',   bg: '#FDEDEC', color: '#922B21', border: '#F1948A' },
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function DiagnosisCard({ item }: { item: Diagnosis }) {
  const { colors } = useAppTheme();
  const sev = item.severity ? SEVERITY_CONFIG[item.severity] : null;

  return (
    <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
      {/* Top row */}
      <View style={styles.cardTopRow}>
        <View style={styles.cardTopLeft}>
          {item.icd_code ? (
            <View style={[styles.icdChip, { backgroundColor: colors.bg3 }]}>
              <Text style={[styles.icdChipText, { color: colors.textPrimary }]}>{item.icd_code}</Text>
            </View>
          ) : null}
          {sev ? (
            <View style={[styles.severityBadge, { backgroundColor: sev.bg, borderColor: sev.border }]}>
              <Text style={[styles.severityText, { color: sev.color }]}>{sev.label}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.cardDate, { color: colors.textSecondary }]}>{formatDate(item.created_at)}</Text>
      </View>

      {/* Description */}
      <Text style={[styles.cardDescription, { color: colors.textPrimary }]}>{item.description}</Text>

      {/* Doctor */}
      {item.doctor?.full_name ? (
        <View style={styles.cardFooter}>
          <Ionicons name="person-circle-outline" size={12} color={COLORS.sand} />
          <Text style={[styles.cardDoctorName, { color: colors.textSecondary }]}>MUDr. {item.doctor.full_name}</Text>
        </View>
      ) : null}
    </View>
  );
}

function PrescriptionCard({ item }: { item: Prescription }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
      {/* Top row */}
      <View style={styles.cardTopRow}>
        <Text style={[styles.medicationName, { color: colors.textPrimary }]} numberOfLines={1}>{item.medication}</Text>
        <View style={[
          styles.activeBadge,
          item.is_active ? styles.activeBadgeOn : styles.activeBadgeOff,
        ]}>
          <Text style={[
            styles.activeBadgeText,
            item.is_active ? styles.activeBadgeTextOn : styles.activeBadgeTextOff,
          ]}>
            {item.is_active ? 'Aktívny' : 'Neaktívny'}
          </Text>
        </View>
      </View>

      {/* Date under title */}
      <Text style={[styles.cardDateSub, { color: colors.textSecondary }]}>{formatDate(item.created_at)}</Text>

      {/* Dosage */}
      {item.dosage ? (
        <View style={styles.rxInfoRow}>
          <Text style={styles.rxInfoEmoji}>💊</Text>
          <Text style={[styles.rxInfoText, { color: colors.textPrimary }]}>{item.dosage}</Text>
        </View>
      ) : null}

      {/* Instructions */}
      {item.instructions ? (
        <View style={styles.rxInfoRow}>
          <Text style={styles.rxInfoEmoji}>📋</Text>
          <Text style={[styles.rxInfoTextMulti, { color: colors.textPrimary }]}>{item.instructions}</Text>
        </View>
      ) : null}

      {/* Valid until */}
      {item.valid_until ? (
        <View style={styles.rxInfoRow}>
          <Text style={styles.rxInfoEmoji}>📅</Text>
          <Text style={[styles.rxInfoText, { color: colors.textPrimary }]}>Platné do: {item.valid_until}</Text>
        </View>
      ) : null}

      {/* Doctor */}
      {item.doctor?.full_name ? (
        <View style={styles.cardFooter}>
          <Ionicons name="person-circle-outline" size={12} color={COLORS.sand} />
          <Text style={[styles.cardDoctorName, { color: colors.textSecondary }]}>MUDr. {item.doctor.full_name}</Text>
        </View>
      ) : null}
    </View>
  );
}

function EmptyState({ emoji, subtitle }: { emoji: string; subtitle: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>{emoji}</Text>
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Žiadne záznamy</Text>
      <Text style={[styles.emptySub, { color: colors.textSecondary }]}>{subtitle}</Text>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

type Tab = 'diagnoses' | 'prescriptions';

export default function PrescriptionsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();

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

  // ── Loading ──
  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
            <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerSub}>MÔJ ZDRAVOTNÝ ZÁZNAM</Text>
            <Text style={styles.headerTitle}>Recepty & Diagnózy</Text>
          </View>
        </View>
        <View style={{ flex: 1, backgroundColor: colors.bg2, padding: SIZES.padding, paddingTop: 16 }}>
          <SkeletonList count={5} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Content ──
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerSub}>MÔJ ZDRAVOTNÝ ZÁZNAM</Text>
          <Text style={styles.headerTitle}>Recepty & Diagnózy</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={[styles.tabBar, { backgroundColor: colors.bg3 }]}>
        <TouchableOpacity
          style={[styles.tabBtn, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, tab === 'diagnoses' && styles.tabBtnActive]}
          onPress={() => setTab('diagnoses')}
          activeOpacity={0.75}
        >
          <Text style={[styles.tabBtnText, { color: colors.textSecondary }, tab === 'diagnoses' && styles.tabBtnTextActive]}>
            {'🩺 Diagnózy (' + diagnoses.length + ')'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, tab === 'prescriptions' && styles.tabBtnActive]}
          onPress={() => setTab('prescriptions')}
          activeOpacity={0.75}
        >
          <Text style={[styles.tabBtnText, { color: colors.textSecondary }, tab === 'prescriptions' && styles.tabBtnTextActive]}>
            {'💊 Recepty (' + prescriptions.length + ')'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView
        style={[styles.scroll, { backgroundColor: colors.bg2 }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.wal}
            colors={[COLORS.wal]}
          />
        }
      >
        {tab === 'diagnoses' ? (
          diagnoses.length === 0 ? (
            <EmptyState
              emoji="🩺"
              subtitle="Váš lekár tu pridá diagnózy po vyšetrení."
            />
          ) : (
            diagnoses.map((item) => <DiagnosisCard key={item.id} item={item} />)
          )
        ) : (
          prescriptions.length === 0 ? (
            <EmptyState
              emoji="💊"
              subtitle="Váš lekár tu pridá recepty po vyšetrení."
            />
          ) : (
            prescriptions.map((item) => <PrescriptionCard key={item.id} item={item} />)
          )
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.esp },

  // Header
  header: {
    backgroundColor: COLORS.esp,
    paddingHorizontal: SIZES.padding,
    paddingTop: 14,
    paddingBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.wal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSub: {
    fontSize: 9,
    letterSpacing: 2,
    color: COLORS.sand,
    fontWeight: '500',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '600',
    color: '#fff',
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.bg3,
    paddingHorizontal: SIZES.padding,
    paddingVertical: 10,
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: SIZES.radius,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: COLORS.bg3,
  },
  tabBtnActive: {
    backgroundColor: COLORS.esp,
    borderColor: COLORS.wal,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.wal,
  },
  tabBtnTextActive: {
    color: COLORS.cream,
  },

  // Scroll
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },
  scrollContent: { padding: SIZES.padding, paddingTop: 12, paddingBottom: 120 },

  // Card shared
  card: {
    backgroundColor: '#fff',
    borderRadius: SIZES.radius,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.bg3,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    gap: 8,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTopLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  cardDate: {
    fontSize: 11,
    color: COLORS.wal,
    fontWeight: '500',
    flexShrink: 0,
  },
  cardDateSub: {
    fontSize: 11,
    color: COLORS.wal,
    marginTop: -4,
  },
  cardDescription: {
    fontSize: 14,
    color: COLORS.esp,
    lineHeight: 21,
    fontWeight: '500',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-end',
    marginTop: 2,
  },
  cardDoctorName: {
    fontSize: 11,
    color: COLORS.wal,
    fontStyle: 'italic',
  },

  // ICD chip
  icdChip: {
    backgroundColor: COLORS.bg3,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  icdChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.esp,
    letterSpacing: 0.5,
  },

  // Severity badge
  severityBadge: {
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  severityText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Prescription: medication name + active badge
  medicationName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.esp,
    flex: 1,
  },
  activeBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 3,
    flexShrink: 0,
  },
  activeBadgeOn:  { backgroundColor: '#EAFAF1', borderColor: '#A9DFBF' },
  activeBadgeOff: { backgroundColor: COLORS.bg3, borderColor: COLORS.bg3 },
  activeBadgeText: { fontSize: 11, fontWeight: '700' },
  activeBadgeTextOn:  { color: '#1E8449' },
  activeBadgeTextOff: { color: COLORS.wal },

  // Prescription info rows
  rxInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  rxInfoEmoji: { fontSize: 13, marginTop: 1 },
  rxInfoText: {
    fontSize: 13,
    color: COLORS.esp,
    lineHeight: 19,
    flex: 1,
  },
  rxInfoTextMulti: {
    fontSize: 13,
    color: COLORS.esp,
    lineHeight: 19,
    flex: 1,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  emptyEmoji: { fontSize: 52, marginBottom: 14 },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.esp,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13,
    color: COLORS.wal,
    textAlign: 'center',
    lineHeight: 20,
  },
});
