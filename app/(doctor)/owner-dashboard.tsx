import React, { useState, useEffect, useMemo } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View,
  Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { useAppTheme } from '../../context/ThemeContext';

const SCREEN_W = Dimensions.get('window').width;

type PeriodKey = 'thisMonth' | 'lastMonth' | 'thisWeek';

function getPeriodRange(key: PeriodKey): { start: Date; end: Date; label: string } {
  const now = new Date();
  if (key === 'thisMonth') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return { start, end, label: now.toLocaleDateString('sk-SK', { month: 'long', year: 'numeric' }) };
  }
  if (key === 'lastMonth') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    return { start, end, label: start.toLocaleDateString('sk-SK', { month: 'long', year: 'numeric' }) };
  }
  // thisWeek
  const day = now.getDay() || 7;
  const start = new Date(now);
  start.setDate(now.getDate() - day + 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end, label: 'Tento týždeň' };
}

type DoctorPerf = {
  id: string;
  name: string;
  completed: number;
  cancelled: number;
  revenue: number;
  avgRating: number | null;
};

export default function OwnerDashboard() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  const [period, setPeriod] = useState<PeriodKey>('thisMonth');
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<{ id: string; full_name: string }[]>([]);
  const [prevRevenue, setPrevRevenue] = useState(0);

  const { start, end, label: periodLabel } = useMemo(() => getPeriodRange(period), [period]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      const [apptRes, payRes, docRes, prevPayRes] = await Promise.all([
        supabase
          .from('appointments')
          .select('id, doctor_id, status, appointment_date, patient_rating, service:services(price_min)')
          .gte('appointment_date', start.toISOString())
          .lte('appointment_date', end.toISOString()),
        supabase
          .from('payments')
          .select('id, amount_cents, method, status, paid_at')
          .eq('status', 'paid')
          .gte('paid_at', start.toISOString())
          .lte('paid_at', end.toISOString()),
        supabase
          .from('profiles')
          .select('id, full_name')
          .in('role', ['doctor', 'owner']),
        // Previous period revenue for comparison
        (() => {
          const prevStart = new Date(start);
          const prevEnd = new Date(end);
          const diff = end.getTime() - start.getTime();
          prevStart.setTime(prevStart.getTime() - diff);
          prevEnd.setTime(prevEnd.getTime() - diff);
          return supabase
            .from('payments')
            .select('amount_cents')
            .eq('status', 'paid')
            .gte('paid_at', prevStart.toISOString())
            .lte('paid_at', prevEnd.toISOString());
        })(),
      ]);

      if (cancelled) return;
      setAppointments(apptRes.data ?? []);
      setPayments(payRes.data ?? []);
      setDoctors((docRes.data ?? []) as any);
      const prevTotal = (prevPayRes.data ?? []).reduce((s: number, p: any) => s + (p.amount_cents ?? 0), 0);
      setPrevRevenue(prevTotal);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [period]);

  // KPI computations
  const kpi = useMemo(() => {
    const totalRevenue = payments.reduce((s, p) => s + (p.amount_cents ?? 0), 0);
    const completed = appointments.filter(a => a.status === 'completed').length;
    const cancelled = appointments.filter(a => a.status === 'cancelled').length;
    const noShow = appointments.filter(a => a.status === 'no_show').length;
    const total = appointments.length;
    const ratings = appointments.filter(a => a.patient_rating).map(a => a.patient_rating);
    const avgRating = ratings.length > 0 ? ratings.reduce((s: number, r: number) => s + r, 0) / ratings.length : null;
    const revenueChange = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;
    const cashPayments = payments.filter(p => p.method === 'cash').reduce((s: number, p: any) => s + (p.amount_cents ?? 0), 0);
    const cardPayments = payments.filter(p => p.method === 'card').reduce((s: number, p: any) => s + (p.amount_cents ?? 0), 0);
    const transferPayments = payments.filter(p => p.method === 'transfer').reduce((s: number, p: any) => s + (p.amount_cents ?? 0), 0);
    return { totalRevenue, completed, cancelled, noShow, total, avgRating, revenueChange, cashPayments, cardPayments, transferPayments };
  }, [appointments, payments, prevRevenue]);

  // Doctor performance
  const doctorPerf = useMemo((): DoctorPerf[] => {
    return doctors.map(doc => {
      const docAppts = appointments.filter(a => a.doctor_id === doc.id);
      const completed = docAppts.filter(a => a.status === 'completed').length;
      const cancelled = docAppts.filter(a => a.status === 'cancelled').length;
      const revenue = docAppts
        .filter(a => a.status === 'completed')
        .reduce((s: number, a: any) => s + ((a.service as any)?.price_min ?? 0), 0);
      const ratings = docAppts.filter(a => a.patient_rating).map(a => a.patient_rating);
      const avgRating = ratings.length > 0 ? ratings.reduce((s: number, r: number) => s + r, 0) / ratings.length : null;
      return { id: doc.id, name: doc.full_name ?? 'Neznámy', completed, cancelled, revenue, avgRating };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [doctors, appointments]);

  // Payment method breakdown
  const paymentBreakdown = useMemo(() => {
    const total = kpi.totalRevenue || 1;
    return [
      { label: 'Hotovosť', amount: kpi.cashPayments, pct: (kpi.cashPayments / total) * 100, color: '#52C896' },
      { label: 'Karta', amount: kpi.cardPayments, pct: (kpi.cardPayments / total) * 100, color: '#1A5276' },
      { label: 'Prevod', amount: kpi.transferPayments, pct: (kpi.transferPayments / total) * 100, color: '#9B59B6' },
    ];
  }, [kpi]);

  const fmtEur = (cents: number) => `${(cents / 100).toLocaleString('sk-SK', { minimumFractionDigits: 0 })} €`;

  return (
    <View style={styles.safe}>
      <HeroHeader
        title="Dashboard kliniky"
        subtitle="Vlastník"
        icon="business-outline"
        onBack={() => router.back()}
      />

      <ScrollView style={[styles.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Period picker */}
        <View style={styles.periodRow}>
          {([
            { key: 'thisWeek', label: 'Týždeň' },
            { key: 'thisMonth', label: 'Mesiac' },
            { key: 'lastMonth', label: 'Minulý mes.' },
          ] as const).map(opt => (
            <TouchableOpacity key={opt.key}
              style={[styles.periodChip, { backgroundColor: colors.cardBg, borderColor: colors.bg3 },
                period === opt.key && { backgroundColor: COLORS.esp, borderColor: COLORS.sand }]}
              onPress={() => setPeriod(opt.key)} activeOpacity={0.75}>
              <Text style={[styles.periodText, { color: colors.textSecondary },
                period === opt.key && { color: COLORS.cream }]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[styles.periodLabel, { color: colors.textSecondary }]}>{periodLabel}</Text>

        {loading ? (
          <ActivityIndicator color={COLORS.wal} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Revenue KPI */}
            <View style={[styles.revenueCard, { backgroundColor: dark ? '#1A3D2E' : '#EDF7F3', borderColor: dark ? '#52C89644' : '#A3D4BE' }]}>
              <View style={styles.revenueTop}>
                <Text style={[styles.revenueLabel, { color: dark ? '#52C896' : '#2E7D5E' }]}>CELKOVÉ TRŽBY</Text>
                {kpi.revenueChange !== 0 && (
                  <View style={[styles.changeBadge, { backgroundColor: kpi.revenueChange > 0 ? (dark ? '#52C89622' : '#EDF7F3') : (dark ? '#C0392B22' : '#FDEDEC') }]}>
                    <Ionicons name={kpi.revenueChange > 0 ? 'trending-up' : 'trending-down'} size={12}
                      color={kpi.revenueChange > 0 ? '#52C896' : '#C0392B'} />
                    <Text style={{ fontSize: 10, fontWeight: '700', color: kpi.revenueChange > 0 ? '#52C896' : '#C0392B' }}>
                      {kpi.revenueChange > 0 ? '+' : ''}{kpi.revenueChange.toFixed(0)}%
                    </Text>
                  </View>
                )}
              </View>
              <Text style={[styles.revenueAmount, { color: dark ? '#52C896' : '#2E7D5E' }]}>
                {fmtEur(kpi.totalRevenue)}
              </Text>
            </View>

            {/* KPI grid */}
            <View style={styles.kpiGrid}>
              <View style={[styles.kpiBox, { backgroundColor: dark ? '#0D2233' : '#EBF5FB', borderColor: dark ? '#5DADE244' : '#AED6F1' }]}>
                <Text style={[styles.kpiVal, { color: dark ? '#5DADE2' : '#1A5276' }]}>{kpi.completed}</Text>
                <Text style={[styles.kpiLabel, { color: dark ? '#5DADE2' : '#2E86C1' }]}>Dokončených</Text>
              </View>
              <View style={[styles.kpiBox, { backgroundColor: dark ? '#2D1F10' : '#FDF3E7', borderColor: dark ? '#B8ACA044' : '#D0D4DC' }]}>
                <Text style={[styles.kpiVal, { color: dark ? '#B87333' : '#B87333' }]}>{kpi.cancelled}</Text>
                <Text style={[styles.kpiLabel, { color: dark ? '#B87333' : '#B7950B' }]}>Zrušených</Text>
              </View>
              <View style={[styles.kpiBox, { backgroundColor: dark ? '#4A1010' : '#FDEDEC', borderColor: dark ? '#C0392B44' : '#F5B7B1' }]}>
                <Text style={[styles.kpiVal, { color: dark ? '#C0392B' : '#922B21' }]}>{kpi.noShow}</Text>
                <Text style={[styles.kpiLabel, { color: dark ? '#C0392B' : '#C0392B' }]}>No-show</Text>
              </View>
              <View style={[styles.kpiBox, { backgroundColor: dark ? '#1E0D33' : '#F5EEF8', borderColor: dark ? '#AF7AC544' : '#D7BDE2' }]}>
                <Text style={[styles.kpiVal, { color: dark ? '#AF7AC5' : '#6C3483' }]}>{kpi.avgRating ? kpi.avgRating.toFixed(1) : '—'}</Text>
                <Text style={[styles.kpiLabel, { color: dark ? '#AF7AC5' : '#7D3C98' }]}>Ø Hodnotenie</Text>
              </View>
            </View>

            {/* Payment breakdown */}
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Rozpad platieb</Text>
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              {/* Bar */}
              <View style={styles.payBar}>
                {paymentBreakdown.map(p => p.pct > 0 ? (
                  <View key={p.label} style={{ flex: p.pct, height: 8, backgroundColor: p.color, borderRadius: 4 }} />
                ) : null)}
              </View>
              {/* Legend */}
              <View style={styles.payLegend}>
                {paymentBreakdown.map(p => (
                  <View key={p.label} style={styles.payLegendItem}>
                    <View style={[styles.payDot, { backgroundColor: p.color }]} />
                    <Text style={[styles.payLegendText, { color: colors.textSecondary }]}>{p.label}</Text>
                    <Text style={[styles.payLegendAmt, { color: colors.textPrimary }]}>{fmtEur(p.amount)}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Doctor performance */}
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Výkon doktorov</Text>
            {doctorPerf.map((doc, i) => (
              <View key={doc.id} style={[styles.docCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <View style={styles.docRank}>
                  <Text style={[styles.docRankText, { color: i === 0 ? COLORS.gold : colors.textSecondary }]}>#{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.docName, { color: colors.textPrimary }]}>{doc.name}</Text>
                  <View style={styles.docStats}>
                    <Text style={[styles.docStat, { color: colors.textSecondary }]}>✓ {doc.completed}</Text>
                    <Text style={[styles.docStat, { color: colors.textSecondary }]}>✗ {doc.cancelled}</Text>
                    {doc.avgRating && <Text style={[styles.docStat, { color: colors.textSecondary }]}>⭐ {doc.avgRating.toFixed(1)}</Text>}
                  </View>
                </View>
                <Text style={[styles.docRevenue, { color: dark ? '#52C896' : '#2E7D5E' }]}>{fmtEur(doc.revenue * 100)}</Text>
              </View>
            ))}

            {/* Utilization summary */}
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Súhrn</Text>
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Celkom termínov</Text>
                <Text style={[styles.summaryVal, { color: colors.textPrimary }]}>{kpi.total}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Úspešnosť</Text>
                <Text style={[styles.summaryVal, { color: colors.textPrimary }]}>
                  {kpi.total > 0 ? ((kpi.completed / kpi.total) * 100).toFixed(0) : 0}%
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>No-show rate</Text>
                <Text style={[styles.summaryVal, { color: kpi.noShow > 0 ? '#C0392B' : colors.textPrimary }]}>
                  {kpi.total > 0 ? ((kpi.noShow / kpi.total) * 100).toFixed(1) : 0}%
                </Text>
              </View>
              <View style={[styles.summaryRow, { borderBottomWidth: 0 }]}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Priemerná tržba / termín</Text>
                <Text style={[styles.summaryVal, { color: colors.textPrimary }]}>
                  {kpi.completed > 0 ? fmtEur(Math.round(kpi.totalRevenue / kpi.completed)) : '—'}
                </Text>
              </View>
            </View>

            <View style={{ height: 80 }} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: COLORS.esp },
  scroll:  { flex: 1 },
  content: { padding: SPACING.xl, paddingTop: 16 },
  header:  { backgroundColor: COLORS.esp, paddingHorizontal: SPACING.xl, paddingTop: 14, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerLabel: { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '500', textTransform: 'uppercase', marginBottom: 3 },
  headerTitle: { fontSize: 19, fontWeight: '600', color: '#F5F6F8' },

  periodRow:   { flexDirection: 'row', gap: 8, marginBottom: 8 },
  periodChip:  { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 4, borderWidth: 1.5 },
  periodText:  { fontSize: 12, fontWeight: '600' },
  periodLabel: { fontSize: 11, fontStyle: 'italic', marginBottom: 16 },

  revenueCard: { borderRadius: 4, borderWidth: 1.5, padding: 20, marginBottom: 16 },
  revenueTop:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  revenueLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  revenueAmount: { fontSize: 32, fontWeight: '800' },
  changeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 2 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  kpiBox:  { width: (SCREEN_W - SPACING.xl * 2 - 10) / 2 - 0.5, borderRadius: 2, borderWidth: 1.5, padding: 14, alignItems: 'center' },
  kpiVal:  { fontSize: 22, fontWeight: '800', marginBottom: 4 },
  kpiLabel: { fontSize: 10, fontWeight: '600' },

  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },

  card: { borderRadius: 2, borderWidth: 1.5, padding: 16, marginBottom: 16 },

  payBar:       { flexDirection: 'row', gap: 3, marginBottom: 12, borderRadius: 4, overflow: 'hidden' },
  payLegend:    { gap: 8 },
  payLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  payDot:       { width: 10, height: 10, borderRadius: 2 },
  payLegendText: { fontSize: 12, flex: 1 },
  payLegendAmt: { fontSize: 13, fontWeight: '700' },

  docCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 2, borderWidth: 1.5, padding: 14, marginBottom: 8 },
  docRank: { width: 28, height: 28, borderRadius: 2, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center' },
  docRankText: { fontSize: 12, fontWeight: '800' },
  docName: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  docStats: { flexDirection: 'row', gap: 10 },
  docStat: { fontSize: 11 },
  docRevenue: { fontSize: 14, fontWeight: '800' },

  summaryRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#D0D4DC' },
  summaryLabel: { fontSize: 13 },
  summaryVal:   { fontSize: 14, fontWeight: '700' } });
