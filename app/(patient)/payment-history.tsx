import React, { useState, useMemo, useCallback } from 'react';
import {
  Alert, RefreshControl, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabase';
import { COLORS, RADII, SHADOWS, TYPO, GRADIENTS } from '../../styles/theme';
import { useAppTheme } from '../../context/ThemeContext';
import { SkeletonList } from '../../components/Skeleton';

type PayAppt = {
  id: string;
  appointment_date: string;
  payment_status: string;
  payment_method: string | null;
  service: { name: string; emoji: string | null; price_min: number | null; price_max: number | null } | null;
  doctor: { full_name: string | null } | null;
};

type Filter = 'all' | 'unpaid' | 'paid';

const PAY_CFG: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  paid:    { label: 'Zaplatené',   color: COLORS.success, bg: COLORS.successBg, border: '#A9DFBF', icon: 'checkmark-circle' },
  unpaid:  { label: 'Nezaplatené', color: COLORS.error,   bg: COLORS.errorBg,   border: '#F5B7B1', icon: 'alert-circle' },
  partial: { label: 'Čiastočne',   color: COLORS.warning, bg: COLORS.warningBg, border: '#F0C78A', icon: 'warning' },
};

const METHOD_CFG: Record<string, { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string }> = {
  cash:   { label: 'Hotovosť', icon: 'cash-outline',   color: COLORS.success },
  card:   { label: 'Karta',    icon: 'card-outline',   color: COLORS.info },
  online: { label: 'Online',   icon: 'phone-portrait-outline', color: '#7D3C98' },
};

function fmtPrice(min: number | null, max: number | null): string {
  if (!min && !max) return '—';
  if (!max || min === max) return `${min ?? 0} €`;
  return `${min}–${max} €`;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return {
    day:   d.getDate(),
    month: d.toLocaleDateString('sk-SK', { month: 'short' }),
    year:  d.getFullYear(),
    time:  d.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' }),
  };
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (diff === 0) return 'dnes';
  if (diff === 1) return 'včera';
  if (diff < 7)  return `pred ${diff} dňami`;
  return new Date(iso).toLocaleDateString('sk-SK', { day: 'numeric', month: 'long' });
}

export default function PaymentHistoryScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [appts,      setAppts]      = useState<PayAppt[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter,     setFilter]     = useState<Filter>('all');

  async function load() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('appointments')
        .select('id, appointment_date, payment_status, payment_method, service:services(name, emoji, price_min, price_max), doctor:profiles!appointments_doctor_id_fkey(full_name)')
        .eq('patient_id', user.id)
        .eq('status', 'completed')
        .order('appointment_date', { ascending: false });
      setAppts((data ?? []) as unknown as PayAppt[]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  const summary = useMemo(() => {
    const paid   = appts.filter(a => a.payment_status === 'paid');
    const unpaid = appts.filter(a => a.payment_status !== 'paid');
    const paidTotal   = paid.reduce((s, a) => s + (a.service?.price_min ?? 0), 0);
    const unpaidTotal = unpaid.reduce((s, a) => s + (a.service?.price_min ?? 0), 0);
    const now  = new Date();
    const thisMonth = paid.filter(a => {
      const d = new Date(a.appointment_date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const lastPaid = paid[0]?.appointment_date ?? null;
    return { paidTotal, unpaidTotal, paidCount: paid.length, unpaidCount: unpaid.length, thisMonthTotal: thisMonth.reduce((s, a) => s + (a.service?.price_min ?? 0), 0), lastPaid };
  }, [appts]);

  const filtered = useMemo(() => {
    if (filter === 'paid')   return appts.filter(a => a.payment_status === 'paid');
    if (filter === 'unpaid') return appts.filter(a => a.payment_status !== 'paid');
    return appts;
  }, [appts, filter]);

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all',    label: 'Všetky' },
    { key: 'paid',   label: 'Zaplatené' },
    { key: 'unpaid', label: 'Čakajúce' },
  ];

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.esp }} edges={['top']}>
        <View style={{ flex: 1, backgroundColor: colors.bg2, padding: 16, paddingTop: 20 }}>
          <SkeletonList count={5} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.esp }} edges={['top']}>
      {/* Hero */}
      <LinearGradient colors={GRADIENTS.hero as [string, string, ...string[]]} style={s.hero}>
        <View style={[s.circle, { width: 200, height: 200, right: -60, top: -60, opacity: 0.05 }]} />

        <View style={s.heroRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.75}>
            <Ionicons name="arrow-back" size={20} color={COLORS.sand} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.heroLabel}>MÔJ ÚČET</Text>
            <Text style={s.heroTitle}>Moje platby</Text>
          </View>
        </View>

        {/* Total amount */}
        <Text style={s.totalAmount}>{summary.paidTotal} €</Text>
        <Text style={s.totalSub}>Celkovo zaplatené od začiatku</Text>

        {/* Summary chips */}
        <View style={s.chipsRow}>
          <View style={s.chip}>
            <Text style={s.chipValue}>{summary.thisMonthTotal} €</Text>
            <Text style={s.chipLabel}>Tento mesiac</Text>
          </View>
          <View style={s.chipSep} />
          <View style={s.chip}>
            <Text style={[s.chipValue, summary.unpaidTotal > 0 && { color: '#F1948A' }]}>
              {summary.unpaidTotal > 0 ? `${summary.unpaidTotal} €` : '0 €'}
            </Text>
            <Text style={s.chipLabel}>Čakajúce</Text>
          </View>
          <View style={s.chipSep} />
          <View style={s.chip}>
            <Text style={s.chipValue}>
              {summary.lastPaid ? timeAgo(summary.lastPaid) : '—'}
            </Text>
            <Text style={s.chipLabel}>Posledná platba</Text>
          </View>
        </View>

        {/* Filter tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filtersRow}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[s.filterTab, filter === f.key && s.filterTabActive]}
              onPress={() => { setFilter(f.key); Haptics.selectionAsync(); }}
              activeOpacity={0.8}
            >
              <Text style={[s.filterLabel, filter === f.key ? { color: '#fff' } : { color: 'rgba(196,168,130,0.7)' }]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg2 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.gold} />}
      >
        {/* Pending banner */}
        {summary.unpaidTotal > 0 && filter !== 'paid' && (
          <TouchableOpacity
            style={s.pendingBanner}
            onPress={() => Alert.alert('Nezaplatené faktúry', `Máte nezaplatené faktúry v celkovej výške ${summary.unpaidTotal} €.\n\nProsím uhraďte platbu priamo v ambulancii alebo kontaktujte recepciu.`)}
            activeOpacity={0.85}
          >
            <Ionicons name="warning" size={18} color={COLORS.warning} />
            <Text style={s.pendingBannerText}>
              Nezaplatená faktúra: <Text style={{ fontFamily: 'DMSans_500Medium' }}>{summary.unpaidTotal} €</Text>
            </Text>
            <View style={s.pendingBtn}>
              <Text style={s.pendingBtnText}>Zaplatiť v ambulancii</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Empty state */}
        {filtered.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>💰</Text>
            <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
              {filter === 'unpaid' ? 'Všetky platby sú uhradené!' : 'Žiadne platby'}
            </Text>
            <Text style={[s.emptySub, { color: colors.textSecondary }]}>
              {appts.length === 0 ? 'Prvý termín je na teba 😄' : 'Skús iný filter'}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {filtered.map(a => {
              const dt  = fmtDate(a.appointment_date);
              const cfg = PAY_CFG[a.payment_status] ?? PAY_CFG.unpaid;
              const method = a.payment_method ? METHOD_CFG[a.payment_method] : null;
              const price = fmtPrice(a.service?.price_min ?? null, a.service?.price_max ?? null);

              return (
                <View
                  key={a.id}
                  style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, SHADOWS.sm]}
                >
                  {/* Left accent bar */}
                  <View style={[s.accent, { backgroundColor: cfg.color }]} />

                  <View style={s.cardContent}>
                    {/* Date box */}
                    <View style={s.dateBox}>
                      <Text style={s.dateDay}>{dt.day}</Text>
                      <Text style={s.dateMonth}>{dt.month}</Text>
                      <Text style={s.dateYear}>{dt.year}</Text>
                    </View>

                    {/* Middle */}
                    <View style={{ flex: 1 }}>
                      <Text style={[s.serviceName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {a.service?.emoji ?? '🦷'} {a.service?.name ?? 'Termín'}
                      </Text>
                      <Text style={[s.doctorName, { color: colors.textSecondary }]} numberOfLines={1}>
                        {a.doctor?.full_name ?? 'MDDr. Loderer'}
                      </Text>
                      <View style={s.tagsRow}>
                        <View style={[s.statusPill, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                          <Ionicons name={cfg.icon} size={11} color={cfg.color} />
                          <Text style={[s.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                        {method && (
                          <View style={s.methodPill}>
                            <Ionicons name={method.icon} size={11} color={method.color} />
                            <Text style={[s.methodText, { color: method.color }]}>{method.label}</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Price */}
                    <Text style={[s.price, a.payment_status !== 'paid' && { color: COLORS.error }]}>
                      {price}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  hero:    { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 0, overflow: 'hidden' },
  circle:  { position: 'absolute', borderRadius: 999, backgroundColor: '#FAF6F0' },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  heroLabel: { ...TYPO.overline, color: COLORS.sand, marginBottom: 2 },
  heroTitle: { ...TYPO.h1, color: '#FAF6F0' },

  totalAmount: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 42, color: '#FAF6F0', lineHeight: 48, marginBottom: 2 },
  totalSub:    { fontFamily: 'DMSans_400Regular', fontSize: 12, color: 'rgba(196,168,130,0.65)', marginBottom: 16 },

  chipsRow: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: RADII.md, paddingVertical: 12, paddingHorizontal: 8, marginBottom: 16 },
  chip:     { flex: 1, alignItems: 'center' },
  chipSep:  { width: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
  chipValue:{ fontFamily: 'DMSans_500Medium', fontSize: 14, color: '#FAF6F0', marginBottom: 2 },
  chipLabel:{ fontFamily: 'DMSans_400Regular', fontSize: 10, color: 'rgba(196,168,130,0.6)', textAlign: 'center' },

  filtersRow:      { flexDirection: 'row', gap: 8, paddingBottom: 14 },
  filterTab:       { borderRadius: RADII.full, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: 'rgba(255,255,255,0.08)' },
  filterTabActive: { backgroundColor: COLORS.gold },
  filterLabel:     { fontFamily: 'DMSans_500Medium', fontSize: 12, letterSpacing: 0.3 },

  pendingBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.warningBg, borderRadius: RADII.md, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#F0C78A' },
  pendingBannerText: { flex: 1, fontFamily: 'DMSans_400Regular', fontSize: 12, color: COLORS.warning },
  pendingBtn:     { backgroundColor: COLORS.warning, borderRadius: RADII.sm, paddingHorizontal: 10, paddingVertical: 5 },
  pendingBtnText: { fontFamily: 'DMSans_500Medium', fontSize: 10, color: '#fff' },

  empty:      { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { ...TYPO.h2, textAlign: 'center' },
  emptySub:   { ...TYPO.body, textAlign: 'center' },

  card:        { borderRadius: RADII.lg, borderWidth: 1, overflow: 'hidden' },
  accent:      { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  cardContent: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, paddingLeft: 18 },

  dateBox:   { width: 44, alignItems: 'center', backgroundColor: COLORS.esp, borderRadius: RADII.sm, paddingVertical: 6 },
  dateDay:   { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 18, color: '#fff', lineHeight: 22 },
  dateMonth: { fontFamily: 'DMSans_500Medium', fontSize: 9, color: COLORS.sand, textTransform: 'uppercase' },
  dateYear:  { fontFamily: 'DMSans_400Regular', fontSize: 9, color: 'rgba(196,168,130,0.6)' },

  serviceName: { fontFamily: 'DMSans_500Medium', fontSize: 13, marginBottom: 2 },
  doctorName:  { fontFamily: 'DMSans_400Regular', fontSize: 11, marginBottom: 6 },
  tagsRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },

  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: RADII.sm, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  statusText: { fontFamily: 'DMSans_500Medium', fontSize: 10 },

  methodPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: RADII.sm, backgroundColor: 'rgba(0,0,0,0.04)', paddingHorizontal: 7, paddingVertical: 3 },
  methodText: { fontFamily: 'DMSans_400Regular', fontSize: 10 },

  price: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 18, color: COLORS.esp },
});
