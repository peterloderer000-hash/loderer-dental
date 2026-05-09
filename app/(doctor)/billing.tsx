/**
 * Fakturačná obrazovka — doktor
 * Celkový prehľad platieb, dlžôb a príjmov
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  Alert, RefreshControl, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../supabase';
import { COLORS, SIZES } from '../../styles/theme';
import { useAppTheme } from '../../context/ThemeContext';
import { SkeletonList } from '../../components/Skeleton';
import { pluralizeAppointments } from '../../utils/pluralize';
import { exportInvoice } from '../../utils/exportPDF';

type BillingAppt = {
  id: string;
  appointment_date: string;
  payment_status: string;
  patient_id: string;
  service_id: string | null;
  doctor_notes: string | null;
  notes: string | null;
  patient: { id: string; full_name: string | null } | null;
  service: { name: string; emoji: string | null; price_min: number | null; price_max: number | null } | null;
};

const PAY_CFG: Record<string, { label: string; icon: string; color: string; bg: string; border: string; next: string }> = {
  unpaid:  { label: 'Nezaplatené', icon: '💸', color: '#922B21', bg: '#FDEDEC', border: '#F5B7B1', next: 'paid'    },
  paid:    { label: 'Zaplatené',   icon: '✅', color: '#1E8449', bg: '#EAFAF1', border: '#A9DFBF', next: 'partial' },
  partial: { label: 'Čiastočne',   icon: '⚠️', color: '#7D6608', bg: '#FEF9E7', border: '#F9E79F', next: 'unpaid'  },
};

type Period = 'month' | 'last_month' | 'year' | 'all';
type PayFilter = 'all' | 'unpaid' | 'partial' | 'paid';

const PERIOD_LABELS: Record<Period, string> = {
  month:      'Tento mesiac',
  last_month: 'Minulý mesiac',
  year:       'Tento rok',
  all:        'Všetko',
};

function getPeriodRange(period: Period): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (period === 'month') {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
  }
  if (period === 'last_month') {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to   = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from, to };
  }
  if (period === 'year') {
    return { from: new Date(now.getFullYear(), 0, 1), to: now };
  }
  return { from: null, to: null };
}

export default function BillingScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const [appts,      setAppts]      = useState<BillingAppt[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [doctorName, setDoctorName] = useState('MDDr. Loderer');
  const [period,     setPeriod]     = useState<Period>('month');
  const [payFilter,  setPayFilter]  = useState<PayFilter>('all');

  async function load() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
      if (prof?.full_name) setDoctorName(prof.full_name);

      const { data } = await supabase
        .from('appointments')
        .select('id, appointment_date, payment_status, patient_id, service_id, doctor_notes, notes, patient:profiles!appointments_patient_id_fkey(id, full_name), service:services(name, emoji, price_min, price_max)')
        .eq('doctor_id', user.id)
        .eq('status', 'completed')
        .order('appointment_date', { ascending: false })
        .limit(500);

      setAppts((data ?? []) as unknown as BillingAppt[]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  // ── Filtrovanie ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const { from, to } = getPeriodRange(period);
    return appts.filter(a => {
      const d = new Date(a.appointment_date);
      if (from && d < from) return false;
      if (to   && d > to)   return false;
      if (payFilter !== 'all' && a.payment_status !== payFilter) return false;
      return true;
    });
  }, [appts, period, payFilter]);

  // ── Súhrn ──────────────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const { from, to } = getPeriodRange(period);
    const inPeriod = appts.filter(a => {
      const d = new Date(a.appointment_date);
      if (from && d < from) return false;
      if (to   && d > to)   return false;
      return true;
    });
    const paid    = inPeriod.filter(a => a.payment_status === 'paid');
    const unpaid  = inPeriod.filter(a => a.payment_status === 'unpaid');
    const partial = inPeriod.filter(a => a.payment_status === 'partial');
    const sum = (list: BillingAppt[]) => list.reduce((s, a) => s + (a.service?.price_min ?? 0), 0);
    return {
      total:        inPeriod.length,
      paidTotal:    sum(paid),
      unpaidTotal:  sum(unpaid) + sum(partial),
      paidCount:    paid.length,
      unpaidCount:  unpaid.length + partial.length,
    };
  }, [appts, period]);

  // ── Toggle platby ───────────────────────────────────────────────────────────
  async function handleTogglePayment(appt: BillingAppt) {
    const next = PAY_CFG[appt.payment_status]?.next ?? 'paid';
    const { error } = await supabase.from('appointments').update({ payment_status: next }).eq('id', appt.id);
    if (error) { Alert.alert('Chyba', error.message); return; }
    setAppts(prev => prev.map(a => a.id === appt.id ? { ...a, payment_status: next } : a));
    // Notifikuj pacienta pri potvrdení platby
    if (next === 'paid') {
      const dateStr = new Date(appt.appointment_date).toLocaleDateString('sk-SK', { day: 'numeric', month: 'long' });
      const priceStr = appt.service?.price_min ? ` · ${appt.service.price_min} €` : '';
      supabase.from('notifications').insert({
        user_id:        appt.patient_id,
        title:          '🧾 Platba potvrdená',
        body:           `Platba za termín (${dateStr}${appt.service ? ` — ${appt.service.name}` : ''}${priceStr}) bola potvrdená. Ďakujeme!`,
        type:           'success',
        appointment_id: appt.id,
      }).then(null, () => {});
    }
  }

  if (loading) return <SkeletonList count={5} />;

  const PAY_FILTERS: { key: PayFilter; label: string }[] = [
    { key: 'all',     label: `Všetky (${summary.total})` },
    { key: 'unpaid',  label: `Nezapl. (${summary.unpaidCount})` },
    { key: 'paid',    label: `Zapl. (${summary.paidCount})` },
  ];

  const dyn = {
    bg:   { backgroundColor: colors.bg2 },
    card: { backgroundColor: colors.cardBg, borderColor: colors.bg3 },
    text: { color: colors.textPrimary },
    sub:  { color: colors.textSecondary },
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Hlavička ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerSub}>FINANCIE</Text>
          <Text style={styles.headerTitle}>Fakturácia & Platby</Text>
        </View>
      </View>

      <ScrollView style={[styles.scroll, dyn.bg]} contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.wal} />}>

        {/* ── Súhrn ── */}
        <View style={[styles.summaryCard, dyn.card]}>
          <View style={styles.summaryRow}>
            {/* Príjem */}
            <View style={[styles.summaryBox, { backgroundColor: '#EAFAF1', borderColor: '#A9DFBF' }]}>
              <Text style={styles.summaryIcon}>💰</Text>
              <Text style={[styles.summaryAmt, { color: '#1E8449' }]}>{summary.paidTotal} €</Text>
              <Text style={[styles.summaryLabel, { color: '#1E8449' }]}>Príjem</Text>
              <Text style={[styles.summaryCount, { color: '#1E8449' }]}>{summary.paidCount} {pluralizeAppointments(summary.paidCount)}</Text>
            </View>
            {/* Pohľadávky */}
            <View style={[styles.summaryBox, { backgroundColor: '#FDEDEC', borderColor: '#F5B7B1' }]}>
              <Text style={styles.summaryIcon}>💸</Text>
              <Text style={[styles.summaryAmt, { color: '#922B21' }]}>{summary.unpaidTotal} €</Text>
              <Text style={[styles.summaryLabel, { color: '#922B21' }]}>Pohľadávky</Text>
              <Text style={[styles.summaryCount, { color: '#922B21' }]}>{summary.unpaidCount} {pluralizeAppointments(summary.unpaidCount)}</Text>
            </View>
          </View>

          {/* Celková miera úhrady */}
          {summary.total > 0 && (
            <View style={styles.rateRow}>
              <Text style={[styles.rateLabel, dyn.sub]}>Miera úhrady</Text>
              <View style={styles.rateTrack}>
                <View style={[styles.rateFill, {
                  width: `${Math.round((summary.paidCount / summary.total) * 100)}%` as any
                }]} />
              </View>
              <Text style={styles.ratePct}>
                {Math.round((summary.paidCount / summary.total) * 100)} %
              </Text>
            </View>
          )}
        </View>

        {/* ── Obdobie ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={styles.tabsScroll} contentContainerStyle={styles.tabsContent}>
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <TouchableOpacity key={p}
              style={[styles.periodTab, dyn.card, period === p && styles.periodTabActive]}
              onPress={() => setPeriod(p)} activeOpacity={0.8}>
              <Text style={[styles.periodTabText, dyn.sub, period === p && styles.periodTabTextActive]}>
                {PERIOD_LABELS[p]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Platobný filter ── */}
        <View style={styles.payFilters}>
          {PAY_FILTERS.map(f => {
            const active = payFilter === f.key;
            const cfg = f.key === 'all' ? null : PAY_CFG[f.key];
            return (
              <TouchableOpacity key={f.key}
                style={[styles.payFilterTab, dyn.card, active && { backgroundColor: cfg?.color ?? COLORS.wal, borderColor: cfg?.color ?? COLORS.wal }]}
                onPress={() => setPayFilter(f.key)} activeOpacity={0.8}>
                <Text style={[styles.payFilterText, dyn.sub, active && { color: '#fff' }]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Zoznam ── */}
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📄</Text>
            <Text style={[styles.emptyTitle, dyn.text]}>Žiadne záznamy</Text>
            <Text style={[styles.emptySub, dyn.sub]}>Vyber iné obdobie alebo filter</Text>
          </View>
        ) : (
          filtered.map((a, i) => {
            const d   = new Date(a.appointment_date);
            const cfg = PAY_CFG[a.payment_status] ?? PAY_CFG.unpaid;
            const price = a.service?.price_min ?? null;

            return (
              <View key={a.id} style={[styles.row, dyn.card, i === filtered.length - 1 && { borderBottomWidth: 0 }]}>
                {/* Dátum */}
                <View style={styles.dateBox}>
                  <Text style={[styles.dateDay, dyn.text]}>{d.getDate()}</Text>
                  <Text style={[styles.dateMon, dyn.sub]}>{d.toLocaleDateString('sk-SK', { month: 'short' })}</Text>
                </View>

                {/* Info */}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowPatient, dyn.text]} numberOfLines={1}>
                    {a.patient?.full_name ?? 'Pacient'}
                  </Text>
                  <Text style={[styles.rowService, dyn.sub]} numberOfLines={1}>
                    {a.service?.emoji ?? '🦷'} {a.service?.name ?? 'Termín'}
                  </Text>
                </View>

                {/* Cena */}
                {price !== null && (
                  <Text style={[styles.rowPrice, a.payment_status !== 'paid' && { color: '#922B21' }]}>
                    {price} €
                  </Text>
                )}

                {/* Platba badge — kliknuteľné */}
                <TouchableOpacity
                  style={[styles.payBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}
                  onPress={() => handleTogglePayment(a)}
                  activeOpacity={0.75}>
                  <Text style={styles.payBadgeIcon}>{cfg.icon}</Text>
                  <Ionicons name="swap-horizontal" size={9} color={cfg.color} style={{ marginLeft: 1 }} />
                </TouchableOpacity>

                {/* Faktúra */}
                <TouchableOpacity
                  onPress={() => exportInvoice(doctorName, a.patient?.full_name ?? 'Pacient', a as any)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ paddingLeft: 6 }}>
                  <Ionicons name="receipt-outline" size={16} color="#7D3C98" />
                </TouchableOpacity>
              </View>
            );
          })
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },
  content:{ paddingBottom: 120 },
  center: { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center' },

  header:      { backgroundColor: COLORS.esp, paddingHorizontal: SIZES.padding, paddingTop: 14, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerSub:   { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 3 },
  headerTitle: { fontSize: 19, fontWeight: '700', color: '#fff' },

  summaryCard: { backgroundColor: '#fff', margin: SIZES.padding, marginBottom: 0, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: COLORS.bg3 },
  summaryRow:  { flexDirection: 'row', gap: 10, marginBottom: 14 },
  summaryBox:  { flex: 1, borderRadius: 12, borderWidth: 1.5, padding: 12, alignItems: 'center' },
  summaryIcon: { fontSize: 22, marginBottom: 4 },
  summaryAmt:  { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  summaryLabel:{ fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 3 },
  summaryCount:{ fontSize: 10, fontWeight: '500', marginTop: 2 },

  rateRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rateLabel: { fontSize: 10, fontWeight: '600', color: COLORS.wal, width: 90 },
  rateTrack: { flex: 1, height: 8, backgroundColor: COLORS.bg3, borderRadius: 4, overflow: 'hidden' },
  rateFill:  { height: 8, backgroundColor: '#1E8449', borderRadius: 4 },
  ratePct:   { fontSize: 11, fontWeight: '800', color: '#1E8449', width: 36, textAlign: 'right' },

  tabsScroll:  { maxHeight: 46, marginTop: 12, marginBottom: 0 },
  tabsContent: { paddingHorizontal: SIZES.padding, gap: 8, alignItems: 'center' },
  periodTab:      { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.bg3, backgroundColor: '#fff' },
  periodTabActive:{ backgroundColor: COLORS.esp, borderColor: COLORS.esp },
  periodTabText:     { fontSize: 11, fontWeight: '600', color: COLORS.wal },
  periodTabTextActive:{ color: '#fff' },

  payFilters:    { flexDirection: 'row', gap: 8, paddingHorizontal: SIZES.padding, marginTop: 10, marginBottom: 10 },
  payFilterTab:  { flex: 1, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.bg3, backgroundColor: '#fff', alignItems: 'center' },
  payFilterText: { fontSize: 10, fontWeight: '700', color: COLORS.wal },

  empty:      { alignItems: 'center', paddingVertical: 50 },
  emptyIcon:  { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.esp, marginBottom: 6 },
  emptySub:   { fontSize: 13, color: COLORS.wal },

  row:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: SIZES.padding, borderBottomWidth: 1, borderBottomColor: COLORS.bg3, backgroundColor: '#fff' },
  dateBox:    { width: 36, alignItems: 'center' },
  dateDay:    { fontSize: 17, fontWeight: '800', color: COLORS.esp, lineHeight: 20 },
  dateMon:    { fontSize: 9,  fontWeight: '600', color: COLORS.wal, textTransform: 'uppercase' },
  rowPatient: { fontSize: 13, fontWeight: '700', color: COLORS.esp, marginBottom: 1 },
  rowService: { fontSize: 11, color: COLORS.wal },
  rowPrice:   { fontSize: 13, fontWeight: '800', color: '#1E8449', minWidth: 42, textAlign: 'right' },
  payBadge:   { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 8, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 4 },
  payBadgeIcon:{ fontSize: 12 },
});
