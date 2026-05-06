import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { supabase } from '../../supabase';
import { COLORS, SIZES } from '../../styles/theme';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';
import { pluralizeAppointments } from '../../utils/pluralize';
import { exportMonthlyInvoices, type ClinicInfo } from '../../utils/exportPDF';
import { ScreenWrapper } from '../../components/ScreenWrapper';

// ─── Typy ─────────────────────────────────────────────────────────────────────
type ApptRow = {
  id: string;
  appointment_date: string;
  status: 'pending' | 'scheduled' | 'completed' | 'cancelled';
  patient_id: string;
  patient_rating: number | null;
  service: { name: string; emoji: string | null; price_min: number | null } | null;
  patient: { full_name: string | null } | null;
};

const SK_MONTHS_FULL = [
  'Január','Február','Marec','Apríl','Máj','Jún',
  'Júl','August','September','Október','November','December',
];

// ─── Pomocné funkcie ──────────────────────────────────────────────────────────
function startOfDay(d: Date) {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
}
function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay(); // 0=ned
  const diff = day === 0 ? -6 : 1 - day; // pondelok = 1
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addDays(d: Date, n: number) {
  const x = new Date(d); x.setDate(x.getDate() + n); return x;
}
function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

const SK_DAYS = ['Nedeľa','Pondelok','Utorok','Streda','Štvrtok','Piatok','Sobota'];
const SK_MONTHS = ['jan','feb','mar','apr','máj','jún','júl','aug','sep','okt','nov','dec'];

// ─── Mini progress bar ────────────────────────────────────────────────────────
function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <View style={bar.track}>
      <View style={[bar.fill, { width: `${pct * 100}%`, backgroundColor: color }]} />
    </View>
  );
}
const bar = StyleSheet.create({
  track: { height: 6, backgroundColor: COLORS.bg3, borderRadius: 3, overflow: 'hidden', flex: 1 },
  fill:  { height: 6, borderRadius: 3 },
});

// ─── Štatistická karta ────────────────────────────────────────────────────────
function StatCard({ emoji, label, value, sub, color = COLORS.esp, bg = '#fff' }: {
  emoji: string; label: string; value: string | number; sub?: string;
  color?: string; bg?: string;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: bg }]}>
      <Text style={styles.statEmoji}>{emoji}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

// ─── Trend chip ───────────────────────────────────────────────────────────────
function TrendChip({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return null;
  const diff = current - previous;
  const pct  = previous > 0 ? Math.round((diff / previous) * 100) : null;
  const up   = diff >= 0;
  return (
    <View style={[styles.trendChip, { backgroundColor: up ? '#EAFAF1' : '#FDEDEC' }]}>
      <Ionicons name={up ? 'trending-up' : 'trending-down'} size={11} color={up ? '#1E8449' : '#922B21'} />
      <Text style={[styles.trendText, { color: up ? '#1E8449' : '#922B21' }]}>
        {diff >= 0 ? '+' : ''}{pct !== null ? `${pct}%` : `${diff}`}
      </Text>
    </View>
  );
}

// ─── Horizontálny revenue graf (príjem po mesiacoch) ─────────────────────────
function RevenueBarChart({ data }: { data: { label: string; revenue: number; isCurrent: boolean }[] }) {
  const maxR = Math.max(...data.map((d) => d.revenue), 1);
  return (
    <View style={{ gap: 9 }}>
      {data.map((d, i) => {
        const pct = maxR > 0 ? (d.revenue / maxR) * 100 : 0;
        return (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[revenueBarStyles.label, d.isCurrent && { color: COLORS.wal, fontWeight: '700' }]}>
              {d.label}
            </Text>
            <View style={revenueBarStyles.track}>
              <View style={[
                revenueBarStyles.fill,
                { width: `${Math.max(pct, d.revenue > 0 ? 4 : 0)}%`, backgroundColor: d.isCurrent ? COLORS.wal : '#C4A882' },
              ]}>
                {d.revenue > 0 && pct >= 15 && (
                  <Text style={revenueBarStyles.fillLabel}>
                    {d.revenue >= 1000 ? `${(d.revenue / 1000).toFixed(1)}k` : `${d.revenue}`}€
                  </Text>
                )}
              </View>
            </View>
            <Text style={[revenueBarStyles.value, d.isCurrent && { color: COLORS.wal, fontWeight: '700' }]}>
              {d.revenue > 0 ? (d.revenue >= 1000 ? `${(d.revenue / 1000).toFixed(1)}k€` : `${d.revenue}€`) : '—'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
const revenueBarStyles = StyleSheet.create({
  label:     { width: 28, fontSize: 9, color: COLORS.wal },
  track:     { flex: 1, height: 22, backgroundColor: COLORS.bg3, borderRadius: 5, overflow: 'hidden' },
  fill:      { height: 22, borderRadius: 5, justifyContent: 'center', paddingLeft: 6 },
  fillLabel: { fontSize: 9, color: '#fff', fontWeight: '700' },
  value:     { fontSize: 9, color: COLORS.wal, width: 38, textAlign: 'right' },
});

// ─── Service pie-like breakdown (percentage bars) ────────────────────────────
function ServiceBreakdown({ services, total }: {
  services: { name: string; emoji: string | null; count: number }[];
  total: number;
}) {
  const colors = ['#2C1F14', '#6B4F35', '#C4A882', '#1A5276', '#1E8449', '#7D3C98'];
  return (
    <View style={{ gap: 8 }}>
      {services.slice(0, 6).map((svc, i) => {
        const pct = total > 0 ? Math.round((svc.count / total) * 100) : 0;
        return (
          <View key={svc.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 14, width: 22 }}>{svc.emoji ?? '🦷'}</Text>
            <Text style={svcBreakdownStyles.name} numberOfLines={1}>{svc.name}</Text>
            <View style={svcBreakdownStyles.track}>
              <View style={[svcBreakdownStyles.fill, { width: `${pct}%`, backgroundColor: colors[i % colors.length] }]} />
            </View>
            <Text style={svcBreakdownStyles.pct}>{pct}%</Text>
          </View>
        );
      })}
    </View>
  );
}
const svcBreakdownStyles = StyleSheet.create({
  name:  { width: 100, fontSize: 11, color: COLORS.esp, fontWeight: '500' },
  track: { flex: 1, height: 10, backgroundColor: COLORS.bg3, borderRadius: 5, overflow: 'hidden' },
  fill:  { height: 10, borderRadius: 5 },
  pct:   { fontSize: 10, fontWeight: '700', color: COLORS.wal, width: 30, textAlign: 'right' },
});

// ─── Mesačný stĺpcový graf ────────────────────────────────────────────────────
function MonthChart({ data }: { data: { label: string; count: number; revenue: number; isCurrent: boolean }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <View style={styles.weekChart}>
      {data.map((d, i) => (
        <View key={i} style={styles.weekCol}>
          <Text style={[styles.weekCount, d.count === 0 && { opacity: 0 }]}>{d.count}</Text>
          <View style={styles.weekBarWrap}>
            <View style={[
              styles.weekBar,
              { height: Math.max(4, (d.count / max) * 80), backgroundColor: d.isCurrent ? COLORS.wal : COLORS.bg3 },
              d.isCurrent && styles.weekBarToday,
            ]} />
          </View>
          <Text style={[styles.weekDay, d.isCurrent && { color: COLORS.wal, fontWeight: '700' }]}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Týždenný stĺpcový graf ───────────────────────────────────────────────────
function WeekChart({ data }: { data: { label: string; count: number; isToday: boolean }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <View style={styles.weekChart}>
      {data.map((d, i) => (
        <View key={i} style={styles.weekCol}>
          <Text style={[styles.weekCount, d.count === 0 && { opacity: 0 }]}>{d.count}</Text>
          <View style={styles.weekBarWrap}>
            <View style={[
              styles.weekBar,
              { height: Math.max(4, (d.count / max) * 80), backgroundColor: d.isToday ? COLORS.wal : COLORS.bg3 },
              d.isToday && styles.weekBarToday,
            ]} />
          </View>
          <Text style={[styles.weekDay, d.isToday && { color: COLORS.wal, fontWeight: '700' }]}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Hlavná obrazovka ─────────────────────────────────────────────────────────
export default function StatsScreen() {
  const { colors } = useAppTheme();
  const [appts,        setAppts]        = useState<ApptRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [doctorName,   setDoctorName]   = useState('MDDr. Loderer');
  const [clinicInfo,   setClinicInfo]   = useState<ClinicInfo | null>(null);
  const [invoiceMonth, setInvoiceMonth] = useState(new Date().getMonth());
  const [invoiceYear,  setInvoiceYear]  = useState(new Date().getFullYear());
  const [exporting,    setExporting]    = useState(false);
  const [kpi, setKpi] = useState<{
    avgWait: number | null;
    avgTreatment: number | null;
    chairs: { name: string; color: string; count: number }[];
    todayWait: number | null;
    todayTreatment: number | null;
  }>({ avgWait: null, avgTreatment: null, chairs: [], todayWait: null, todayTreatment: null });

  const loadData = useCallback(async () => {
    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) { setLoading(false); setRefreshing(false); return; }

      // Načítaj profil doktora (meno + ambulancia)
      const { data: prof } = await supabase
        .from('profiles')
        .select('full_name, clinic_name, clinic_address, clinic_ico, clinic_dic')
        .eq('id', user.id)
        .maybeSingle();
      if (prof) {
        if (prof.full_name) setDoctorName(prof.full_name);
        if (prof.clinic_name || prof.clinic_address || prof.clinic_ico || prof.clinic_dic) {
          setClinicInfo({
            clinic_name:    prof.clinic_name    ?? null,
            clinic_address: prof.clinic_address ?? null,
            clinic_ico:     prof.clinic_ico     ?? null,
            clinic_dic:     prof.clinic_dic     ?? null,
          });
        }
      }

      const { data, error } = await supabase
        .from('appointments')
        .select('id, appointment_date, status, patient_id, patient_rating, service:service_id(name, emoji, price_min), patient:profiles!appointments_patient_id_fkey(full_name)')
        .eq('doctor_id', user.id)
        .order('appointment_date', { ascending: false });

      if (error) throw error;
      setAppts((data ?? []) as unknown as ApptRow[]);

      // KPI — čakacie časy + využitie kresiel (posledných 30 dní)
      const { data: kpiData } = await supabase
        .from('appointment_kpi')
        .select('avg_wait_minutes, avg_treatment_minutes, chair_id, total, day');

      const { data: chairsData } = await supabase
        .from('chairs')
        .select('id, name, color')
        .eq('is_active', true);

      if (kpiData && kpiData.length > 0) {
        const waits = kpiData.map((r: any) => r.avg_wait_minutes).filter((v: any) => v != null);
        const treatments = kpiData.map((r: any) => r.avg_treatment_minutes).filter((v: any) => v != null);
        const avgWait = waits.length > 0 ? Math.round(waits.reduce((a: number, b: number) => a + b, 0) / waits.length) : null;
        const avgTreatment = treatments.length > 0 ? Math.round(treatments.reduce((a: number, b: number) => a + b, 0) / treatments.length) : null;

        const today = new Date().toISOString().split('T')[0];
        const todayRow = kpiData.find((r: any) => r.day === today);

        const chairCounts: Record<string, number> = {};
        kpiData.forEach((r: any) => {
          if (r.chair_id) chairCounts[r.chair_id] = (chairCounts[r.chair_id] ?? 0) + (r.total ?? 0);
        });
        const chairs = (chairsData ?? []).map((c: any) => ({
          name: c.name,
          color: c.color ?? '#C9A84C',
          count: chairCounts[c.id] ?? 0,
        }));

        setKpi({
          avgWait,
          avgTreatment,
          chairs,
          todayWait: todayRow?.avg_wait_minutes ?? null,
          todayTreatment: todayRow?.avg_treatment_minutes ?? null,
        });
      }
    } catch (e) {
      console.error('[Stats] loadData failed:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // ── Výpočty ───────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const now        = new Date();
    const todayStart = startOfDay(now);
    const weekStart  = startOfWeek(now);
    const prevWeekStart = addDays(weekStart, -7);
    const monthStart = startOfMonth(now);
    const prevMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));

    // Základné filtre
    const today     = appts.filter((a) => sameDay(new Date(a.appointment_date), now));
    const thisWeek  = appts.filter((a) => { const d = new Date(a.appointment_date); return d >= weekStart && d < addDays(weekStart, 7); });
    const lastWeek  = appts.filter((a) => { const d = new Date(a.appointment_date); return d >= prevWeekStart && d < weekStart; });
    const thisMonth = appts.filter((a) => new Date(a.appointment_date) >= monthStart);
    const lastMonth = appts.filter((a) => { const d = new Date(a.appointment_date); return d >= prevMonthStart && d < monthStart; });

    const completed  = appts.filter((a) => a.status === 'completed');
    const scheduled  = appts.filter((a) => a.status === 'scheduled');
    const cancelled  = appts.filter((a) => a.status === 'cancelled');
    const pending    = appts.filter((a) => a.status === 'pending');
    const uniquePats = new Set(appts.map((a) => a.patient_id)).size;

    // Odhadovaný príjem (sum price_min dokončených termínov)
    const revenue = completed.reduce((sum, a) => sum + (a.service?.price_min ?? 0), 0);
    const revenueThisMonth = thisMonth
      .filter((a) => a.status === 'completed')
      .reduce((sum, a) => sum + (a.service?.price_min ?? 0), 0);

    // Najbližší naplánovaný termín
    const upcoming = scheduled
      .filter((a) => new Date(a.appointment_date) >= todayStart)
      .sort((a, b) => new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime())[0];

    // Najobľúbenejšie služby
    const serviceCounts: Record<string, { name: string; emoji: string | null; count: number }> = {};
    appts.filter((a) => a.service).forEach((a) => {
      const key = a.service!.name;
      if (!serviceCounts[key]) serviceCounts[key] = { name: key, emoji: a.service!.emoji, count: 0 };
      serviceCounts[key].count++;
    });
    const topServices = Object.values(serviceCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Vyťaženosť podľa dňa v týždni (len dokončené + naplánované)
    const dayBuckets: number[] = [0,0,0,0,0,0,0];
    appts.forEach((a) => {
      if (a.status === 'cancelled') return;
      dayBuckets[new Date(a.appointment_date).getDay()]++;
    });

    // Stĺpcový graf — aktuálny týždeň (Po–Ne)
    const weekChartData = [1,2,3,4,5,6,0].map((dayIdx) => {
      const dayOffset = dayIdx === 0 ? 6 : dayIdx - 1; // Po=0,Ut=1,...,Ne=6
      const date = addDays(weekStart, dayOffset);
      const count = appts.filter((a) => {
        const d = new Date(a.appointment_date);
        return sameDay(d, date) && a.status !== 'cancelled';
      }).length;
      return {
        label: ['Po','Ut','St','Št','Pi','So','Ne'][dayOffset],
        count,
        isToday: sameDay(date, now),
      };
    });

    // Najvyťaženejší deň
    const maxDayIdx = dayBuckets.indexOf(Math.max(...dayBuckets));
    const busiestDay = dayBuckets[maxDayIdx] > 0 ? SK_DAYS[maxDayIdx] : null;

    // Priemerné hodnotenie (iba completed s rating)
    const rated = completed.filter((a) => a.patient_rating != null && a.patient_rating > 0);
    const avgRating = rated.length > 0
      ? rated.reduce((sum, a) => sum + (a.patient_rating ?? 0), 0) / rated.length
      : null;

    // Mesačný trend — posledných 6 mesiacov
    const monthlyData = Array.from({ length: 6 }, (_, i) => {
      const mDate = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const mEnd  = new Date(mDate.getFullYear(), mDate.getMonth() + 1, 1);
      const count = appts.filter((a) => {
        const d = new Date(a.appointment_date);
        return d >= mDate && d < mEnd && a.status !== 'cancelled';
      }).length;
      const revenue = appts.filter((a) => {
        const d = new Date(a.appointment_date);
        return d >= mDate && d < mEnd && a.status === 'completed';
      }).reduce((sum, a) => sum + (a.service?.price_min ?? 0), 0);
      return {
        label: SK_MONTHS[mDate.getMonth()].slice(0, 3),
        month: mDate.getMonth(),
        year: mDate.getFullYear(),
        count,
        revenue,
        isCurrent: i === 5,
      };
    });

    // Retencia pacientov
    const patientApptMap = new Map<string, number>();
    appts.forEach((a) => {
      if (a.status === 'cancelled') return;
      patientApptMap.set(a.patient_id, (patientApptMap.get(a.patient_id) ?? 0) + 1);
    });
    const returningPatients  = [...patientApptMap.values()].filter((n) => n > 1).length;
    const oneTimePatients    = [...patientApptMap.values()].filter((n) => n === 1).length;
    const avgApptPerPatient  = patientApptMap.size > 0
      ? Math.round(([...patientApptMap.values()].reduce((a, b) => a + b, 0) / patientApptMap.size) * 10) / 10
      : 0;
    const retentionRate = patientApptMap.size > 0
      ? Math.round((returningPatients / patientApptMap.size) * 100)
      : 0;

    return {
      todayCount: today.length,
      thisWeekCount: thisWeek.filter((a) => a.status !== 'cancelled').length,
      lastWeekCount: lastWeek.filter((a) => a.status !== 'cancelled').length,
      thisMonthCount: thisMonth.filter((a) => a.status !== 'cancelled').length,
      lastMonthCount: lastMonth.filter((a) => a.status !== 'cancelled').length,
      totalCount: appts.length,
      completedCount: completed.length,
      scheduledCount: scheduled.filter((a) => new Date(a.appointment_date) >= todayStart).length,
      cancelledCount: cancelled.length,
      pendingCount: pending.length,
      uniquePats,
      revenue,
      revenueThisMonth,
      upcoming,
      topServices,
      weekChartData,
      monthlyData,
      busiestDay,
      completionRate: appts.length > 0 ? Math.round((completed.length / appts.length) * 100) : 0,
      avgRating,
      ratedCount: rated.length,
      returningPatients,
      oneTimePatients,
      avgApptPerPatient,
      retentionRate,
    };
  }, [appts]);

  // ── Mesačné fakturácie ───────────────────────────────────────────────────
  const invoiceAppts = useMemo(() => {
    return appts.filter((a) => {
      if (a.status !== 'completed') return false;
      const d = new Date(a.appointment_date);
      return d.getMonth() === invoiceMonth && d.getFullYear() === invoiceYear;
    }).sort((a, b) => new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime());
  }, [appts, invoiceMonth, invoiceYear]);

  const invoiceRevenue = useMemo(
    () => invoiceAppts.reduce((sum, a) => sum + (a.service?.price_min ?? 0), 0),
    [invoiceAppts],
  );

  function prevInvoiceMonth() {
    if (invoiceMonth === 0) { setInvoiceMonth(11); setInvoiceYear((y) => y - 1); }
    else setInvoiceMonth((m) => m - 1);
  }
  function nextInvoiceMonth() {
    const now = new Date();
    if (invoiceYear > now.getFullYear() || (invoiceYear === now.getFullYear() && invoiceMonth >= now.getMonth())) return;
    if (invoiceMonth === 11) { setInvoiceMonth(0); setInvoiceYear((y) => y + 1); }
    else setInvoiceMonth((m) => m + 1);
  }

  async function handleExportMonthly() {
    if (invoiceAppts.length === 0) {
      Alert.alert('Žiadne faktúry', 'Za vybraný mesiac nie sú žiadne dokončené termíny.');
      return;
    }
    setExporting(true);
    try {
      await exportMonthlyInvoices(
        doctorName,
        clinicInfo,
        invoiceMonth,
        invoiceYear,
        invoiceAppts.map((a) => ({
          id:           a.id,
          appointment_date: a.appointment_date,
          patient_name: a.patient?.full_name ?? null,
          service:      a.service ? { name: a.service.name, emoji: a.service.emoji, price_min: a.service.price_min } : null,
        })),
      );
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg2, padding: SIZES.padding }}>
        <SkeletonList count={6} />
      </View>
    );
  }

  const todayLabel = new Date().toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' });

  const dyn = {
    bg:   { backgroundColor: colors.bg2 },
    card: { backgroundColor: colors.cardBg, borderColor: colors.bg3 },
    text: { color: colors.textPrimary },
    sub:  { color: colors.textSecondary },
  };

  return (
    <ScreenWrapper>
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Hlavička ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSub}>PREHĽAD PRAXE</Text>
          <Text style={styles.headerTitle}>Štatistiky</Text>
        </View>
        <View style={styles.headerDate}>
          <Ionicons name="calendar-outline" size={12} color={COLORS.sand} />
          <Text style={styles.headerDateText}>{new Date().toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
        </View>
      </View>

      <ScrollView
        style={[styles.scroll, dyn.bg]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={COLORS.wal} colors={[COLORS.wal]} />}
      >

        {/* ── Dnešný deň ── */}
        <View style={styles.todayBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.todayLabel}>DNES</Text>
            <Text style={styles.todayDate}>{todayLabel}</Text>
          </View>
          <View style={styles.todayCount}>
            <Text style={styles.todayCountNum}>{stats.todayCount}</Text>
            <Text style={styles.todayCountSub}>{pluralizeAppointments(stats.todayCount)}</Text>
          </View>
        </View>

        {/* ── Najbližší termín ── */}
        {stats.upcoming && (
          <View style={[styles.upcomingCard, dyn.card]}>
            <View style={styles.upcomingDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.upcomingLabel}>NAJBLIŽŠÍ TERMÍN</Text>
              <Text style={styles.upcomingTime}>
                {new Date(stats.upcoming.appointment_date).toLocaleString('sk-SK', {
                  weekday: 'short', day: 'numeric', month: 'short',
                  hour: '2-digit', minute: '2-digit',
                })}
              </Text>
              {stats.upcoming.service && (
                <Text style={styles.upcomingService}>
                  {stats.upcoming.service.emoji ?? '🦷'} {stats.upcoming.service.name}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* ── KPI Klinické metriky ── */}
        <Text style={styles.sectionLabel}>KLINICKÉ KPI</Text>
        <View style={[styles.card, dyn.card, { marginBottom: 14 }]}>
          <Text style={styles.cardTitle}>ČAKACIE & OŠETROVACIE ČASY (30 DNÍ)</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
            <View style={[styles.kpiBox, { backgroundColor: '#EBF5FB' }]}>
              <Ionicons name="time-outline" size={20} color="#1A5276" />
              <Text style={[styles.kpiNum, { color: '#1A5276' }]}>
                {kpi.avgWait != null ? `${kpi.avgWait} min` : '—'}
              </Text>
              <Text style={styles.kpiLabel}>Priem. čakanie</Text>
            </View>
            <View style={[styles.kpiBox, { backgroundColor: '#EAFAF1' }]}>
              <Ionicons name="medical-outline" size={20} color="#1E8449" />
              <Text style={[styles.kpiNum, { color: '#1E8449' }]}>
                {kpi.avgTreatment != null ? `${kpi.avgTreatment} min` : '—'}
              </Text>
              <Text style={styles.kpiLabel}>Priem. ošetrenie</Text>
            </View>
          </View>
          {kpi.chairs.length > 0 && (
            <>
              <Text style={[styles.cardTitle, { marginBottom: 8 }]}>VYUŽITIE KRESIEL</Text>
              {kpi.chairs.map((ch) => {
                const max = Math.max(...kpi.chairs.map((c) => c.count), 1);
                return (
                  <View key={ch.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <View style={[styles.chairDot, { backgroundColor: ch.color }]} />
                    <Text style={styles.chairName}>{ch.name}</Text>
                    <View style={bar.track}>
                      <View style={[bar.fill, { width: `${max > 0 ? (ch.count / max) * 100 : 0}%`, backgroundColor: ch.color }]} />
                    </View>
                    <Text style={styles.chairCount}>{ch.count}×</Text>
                  </View>
                );
              })}
            </>
          )}
        </View>

        {/* ── Kľúčové metriky ── */}
        <Text style={styles.sectionLabel}>KĽÚČOVÉ METRIKY</Text>
        <View style={styles.metricsGrid}>
          <StatCard emoji="📅" label="Tento týždeň" value={stats.thisWeekCount}
            sub={`Min. týždeň: ${stats.lastWeekCount}`} bg={colors.cardBg} color={colors.textPrimary} />
          <StatCard emoji="📆" label="Tento mesiac" value={stats.thisMonthCount}
            sub={`Min. mesiac: ${stats.lastMonthCount}`} bg={colors.cardBg} color={colors.textPrimary} />
          <StatCard emoji="👥" label="Pacienti" value={stats.uniquePats}
            sub="celkovo" bg={colors.cardBg} color={colors.textPrimary} />
          <StatCard emoji="✅" label="Úspešnosť" value={`${stats.completionRate}%`}
            sub="dokončených" color="#1E8449" bg="#EAFAF1" />
        </View>

        {/* ── Trend týždeň / mesiac ── */}
        <View style={styles.trendRow}>
          <View style={[styles.trendCard, dyn.card, { flex: 1 }]}>
            <Text style={styles.trendCardLabel}>Týždeň vs minulý</Text>
            <View style={styles.trendCardContent}>
              <Text style={[styles.trendCardNum, dyn.text]}>{stats.thisWeekCount}</Text>
              <TrendChip current={stats.thisWeekCount} previous={stats.lastWeekCount} />
            </View>
          </View>
          <View style={[styles.trendCard, dyn.card, { flex: 1 }]}>
            <Text style={styles.trendCardLabel}>Mesiac vs minulý</Text>
            <View style={styles.trendCardContent}>
              <Text style={[styles.trendCardNum, dyn.text]}>{stats.thisMonthCount}</Text>
              <TrendChip current={stats.thisMonthCount} previous={stats.lastMonthCount} />
            </View>
          </View>
        </View>

        {/* ── Stĺpcový graf týždňa ── */}
        <View style={[styles.card, dyn.card]}>
          <Text style={styles.cardTitle}>TERMÍNY TENTO TÝŽDEŇ</Text>
          <WeekChart data={stats.weekChartData} />
          {stats.busiestDay && (
            <View style={styles.busiestRow}>
              <Ionicons name="flame-outline" size={13} color={COLORS.wal} />
              <Text style={styles.busiestText}>Najvyťaženejší deň: <Text style={{ fontWeight: '700', color: COLORS.esp }}>{stats.busiestDay}</Text></Text>
            </View>
          )}
        </View>

        {/* ── Mesačný trend ── */}
        <View style={[styles.card, dyn.card]}>
          <Text style={styles.cardTitle}>MESAČNÝ TREND (6 MESIACOV)</Text>
          <MonthChart data={stats.monthlyData} />
          <View style={styles.monthRevenueRow}>
            {stats.monthlyData.map((m, i) => (
              <View key={i} style={styles.monthRevenueCol}>
                {m.revenue > 0 && (
                  <Text style={[styles.monthRevenueText, m.isCurrent && { color: COLORS.wal, fontWeight: '700' }]}>
                    {m.revenue >= 1000 ? `${(m.revenue / 1000).toFixed(1)}k` : `${m.revenue}`}€
                  </Text>
                )}
              </View>
            ))}
          </View>
          <Text style={styles.revenueNote}>* Príjem odhadnutý z dokončených termínov</Text>
        </View>

        {/* ── Príjem po mesiacoch (horizontálny graf) ── */}
        <View style={[styles.card, dyn.card]}>
          <Text style={styles.cardTitle}>PRÍJEM PO MESIACOCH</Text>
          <RevenueBarChart data={stats.monthlyData} />
          <Text style={[styles.revenueNote, { color: COLORS.wal, marginTop: 10 }]}>
            * Odhad z min. cien dokončených termínov
          </Text>
        </View>

        {/* ── Rozdelenie služieb ── */}
        {stats.topServices.length > 1 && (
          <View style={[styles.card, dyn.card]}>
            <Text style={styles.cardTitle}>ROZDELENIE SLUŽIEB</Text>
            <ServiceBreakdown
              services={stats.topServices}
              total={stats.topServices.reduce((s, svc) => s + svc.count, 0)}
            />
          </View>
        )}

        {/* ── Status breakdown ── */}
        <View style={[styles.card, dyn.card]}>
          <Text style={styles.cardTitle}>STAV TERMÍNOV (CELKOVO)</Text>
          {[
            { label: 'Dokončené',   count: stats.completedCount,  color: '#1E8449', emoji: '✅' },
            { label: 'Naplánované', count: stats.scheduledCount,  color: '#1A5276', emoji: '📅' },
            { label: 'Čakajú',      count: stats.pendingCount,    color: '#D4AC0D', emoji: '⏳' },
            { label: 'Zrušené',     count: stats.cancelledCount,  color: '#922B21', emoji: '❌' },
          ].filter(row => row.count > 0 || row.label !== 'Čakajú').map((row) => (
            <View key={row.label} style={styles.statusRow}>
              <Text style={styles.statusEmoji}>{row.emoji}</Text>
              <Text style={styles.statusLabel}>{row.label}</Text>
              <MiniBar value={row.count} max={stats.totalCount} color={row.color} />
              <Text style={[styles.statusCount, { color: row.color }]}>{row.count}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Celkom termínov</Text>
            <Text style={styles.totalCount}>{stats.totalCount}</Text>
          </View>
        </View>

        {/* ── Hodnotenia pacientov ── */}
        {stats.avgRating !== null && (
          <View style={[styles.card, dyn.card]}>
            <Text style={styles.cardTitle}>HODNOTENIA PACIENTOV</Text>
            <View style={styles.ratingRow}>
              <View style={{ flex: 1 }}>
                <View style={styles.starsRow}>
                  {[1,2,3,4,5].map((star) => (
                    <Ionicons
                      key={star}
                      name={star <= Math.round(stats.avgRating!) ? 'star' : 'star-outline'}
                      size={22}
                      color="#F1C40F"
                    />
                  ))}
                </View>
                <Text style={styles.ratingAvgText}>
                  {stats.avgRating!.toFixed(1)} / 5
                </Text>
                <Text style={styles.ratingCountText}>
                  Počet hodnotení: {stats.ratedCount}
                </Text>
              </View>
              <View style={styles.ratingCircle}>
                <Text style={styles.ratingCircleNum}>{stats.avgRating!.toFixed(1)}</Text>
                <Text style={styles.ratingCircleSub}>/ 5</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Retencia pacientov ── */}
        {stats.uniquePats > 0 && (
          <View style={[styles.card, dyn.card]}>
            <Text style={styles.cardTitle}>RETENCIA PACIENTOV</Text>
            <View style={styles.retentionGrid}>
              <View style={[styles.retentionItem, { backgroundColor: '#EBF5FB' }]}>
                <Text style={[styles.retentionNum, { color: '#1A5276' }]}>{stats.retentionRate}%</Text>
                <Text style={[styles.retentionLabel, { color: '#1A5276' }]}>Miera retencie</Text>
              </View>
              <View style={[styles.retentionItem, { backgroundColor: '#EAFAF1' }]}>
                <Text style={[styles.retentionNum, { color: '#1E8449' }]}>{stats.returningPatients}</Text>
                <Text style={[styles.retentionLabel, { color: '#1E8449' }]}>Opakovaní pacienti</Text>
              </View>
              <View style={[styles.retentionItem, { backgroundColor: '#FEF9E7' }]}>
                <Text style={[styles.retentionNum, { color: '#9A7D0A' }]}>{stats.oneTimePatients}</Text>
                <Text style={[styles.retentionLabel, { color: '#9A7D0A' }]}>Jednorazoví</Text>
              </View>
              <View style={[styles.retentionItem, { backgroundColor: '#F5EEF8' }]}>
                <Text style={[styles.retentionNum, { color: '#6C3483' }]}>{stats.avgApptPerPatient}</Text>
                <Text style={[styles.retentionLabel, { color: '#6C3483' }]}>Priemer/pacient</Text>
              </View>
            </View>
            {/* Retention bar */}
            <View style={styles.retentionBarRow}>
              <Text style={styles.retentionBarLabel}>Opakovaní</Text>
              <View style={styles.retentionBarTrack}>
                <View style={[styles.retentionBarFill, { width: `${stats.retentionRate}%`, backgroundColor: '#1E8449' }]} />
              </View>
              <Text style={styles.retentionBarPct}>{stats.retentionRate}%</Text>
            </View>
          </View>
        )}

        {/* ── Príjem (odhad) ── */}
        <View style={[styles.card, styles.revenueCard]}>
          <Text style={[styles.cardTitle, { color: COLORS.sand }]}>ODHADOVANÝ PRÍJEM</Text>
          <View style={styles.revenueRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.revenueLabel}>Tento mesiac</Text>
              <Text style={styles.revenueAmount}>{stats.revenueThisMonth.toLocaleString('sk-SK')} €</Text>
            </View>
            <View style={styles.revenueDivider} />
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={styles.revenueLabel}>Celkovo</Text>
              <Text style={styles.revenueAmount}>{stats.revenue.toLocaleString('sk-SK')} €</Text>
            </View>
          </View>
          <Text style={styles.revenueNote}>* Odhad na základe minimálnych cien dokončených termínov</Text>
        </View>

        {/* ── Mesačné fakturácie ── */}
        <View style={[styles.card, dyn.card]}>
          <View style={styles.invoiceCardHeader}>
            <Ionicons name="receipt-outline" size={15} color={COLORS.wal} />
            <Text style={styles.cardTitle}>MESAČNÉ FAKTURÁCIE</Text>
          </View>

          {/* Month picker */}
          <View style={styles.monthPicker}>
            <TouchableOpacity style={styles.monthArrow} onPress={prevInvoiceMonth} activeOpacity={0.75}>
              <Ionicons name="chevron-back" size={18} color={COLORS.wal} />
            </TouchableOpacity>
            <Text style={styles.monthPickerLabel}>
              {SK_MONTHS_FULL[invoiceMonth]} {invoiceYear}
            </Text>
            <TouchableOpacity
              style={[styles.monthArrow, invoiceYear === new Date().getFullYear() && invoiceMonth >= new Date().getMonth() && { opacity: 0.3 }]}
              onPress={nextInvoiceMonth}
              activeOpacity={0.75}
              disabled={invoiceYear === new Date().getFullYear() && invoiceMonth >= new Date().getMonth()}
            >
              <Ionicons name="chevron-forward" size={18} color={COLORS.wal} />
            </TouchableOpacity>
          </View>

          {/* Summary */}
          <View style={styles.invoiceSummary}>
            <View style={styles.invoiceSummaryItem}>
              <Text style={styles.invoiceSummaryNum}>{invoiceAppts.length}</Text>
              <Text style={styles.invoiceSummaryLabel}>termínov</Text>
            </View>
            <View style={styles.invoiceSummaryDivider} />
            <View style={styles.invoiceSummaryItem}>
              <Text style={[styles.invoiceSummaryNum, { color: '#1E8449' }]}>
                {invoiceRevenue > 0 ? `${invoiceRevenue.toLocaleString('sk-SK')} €` : '—'}
              </Text>
              <Text style={styles.invoiceSummaryLabel}>odh. príjem</Text>
            </View>
          </View>

          {/* Zoznam */}
          {invoiceAppts.length === 0 ? (
            <View style={styles.invoiceEmpty}>
              <Text style={styles.invoiceEmptyIcon}>🗓</Text>
              <Text style={styles.invoiceEmptyText}>Žiadne dokončené termíny za {SK_MONTHS_FULL[invoiceMonth].toLowerCase()} {invoiceYear}</Text>
            </View>
          ) : (
            invoiceAppts.map((a, i) => {
              const d     = new Date(a.appointment_date);
              const price = a.service?.price_min ?? 0;
              return (
                <View key={a.id} style={[styles.invoiceRow, i === invoiceAppts.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={styles.invoiceDateBox}>
                    <Text style={styles.invoiceDateDay}>{d.getDate()}</Text>
                    <Text style={styles.invoiceDateMon}>{SK_MONTHS_FULL[d.getMonth()].slice(0, 3)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.invoicePatient} numberOfLines={1}>
                      {a.patient?.full_name ?? 'Pacient'}
                    </Text>
                    {a.service && (
                      <Text style={styles.invoiceService} numberOfLines={1}>
                        {a.service.emoji ?? '🦷'} {a.service.name}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.invoicePrice}>
                    {price > 0 ? `${price.toLocaleString('sk-SK')} €` : '—'}
                  </Text>
                </View>
              );
            })
          )}

          {/* Export button */}
          <TouchableOpacity
            style={[styles.invoiceExportBtn, (exporting || invoiceAppts.length === 0) && { opacity: 0.45 }]}
            onPress={handleExportMonthly}
            disabled={exporting || invoiceAppts.length === 0}
            activeOpacity={0.85}
          >
            {exporting
              ? <ActivityIndicator color="#fff" size="small" />
              : <>
                  <Ionicons name="download-outline" size={16} color="#fff" />
                  <Text style={styles.invoiceExportBtnText}>Exportovať PDF</Text>
                </>}
          </TouchableOpacity>
        </View>

        {/* ── Top služby ── */}
        {stats.topServices.length > 0 && (
          <View style={[styles.card, dyn.card]}>
            <Text style={styles.cardTitle}>NAJOBĽÚBENEJŠIE SLUŽBY</Text>
            {stats.topServices.map((svc, i) => (
              <View key={svc.name} style={styles.svcRow}>
                <View style={styles.svcRank}>
                  <Text style={styles.svcRankText}>{i + 1}</Text>
                </View>
                <Text style={styles.svcEmoji}>{svc.emoji ?? '🦷'}</Text>
                <Text style={styles.svcName} numberOfLines={1}>{svc.name}</Text>
                <MiniBar value={svc.count} max={stats.topServices[0].count} color={COLORS.wal} />
                <Text style={styles.svcCount}>{svc.count}×</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Súhrnné čísla ── */}
        <View style={[styles.card, dyn.card]}>
          <Text style={styles.cardTitle}>CELKOVÝ SÚHRN</Text>
          {[
            { label: 'Všetky termíny',    value: stats.totalCount,     emoji: '📋' },
            { label: 'Unikátnych pacientov', value: stats.uniquePats,  emoji: '👥' },
            { label: 'Dokončené termíny', value: stats.completedCount,  emoji: '✅' },
            { label: 'Miera úspešnosti',   value: `${stats.completionRate}%`, emoji: '📊' },
            { label: 'Priem. hodnotenie',   value: stats.avgRating != null ? `${stats.avgRating.toFixed(1)} ⭐` : '—', emoji: '⭐' },
          ].map((row, idx, arr) => (
            <View key={row.label} style={[styles.summaryRow, idx === arr.length - 1 && { borderBottomWidth: 0 }]}>
              <Text style={styles.summaryEmoji}>{row.emoji}</Text>
              <Text style={[styles.summaryLabel, dyn.text]}>{row.label}</Text>
              <Text style={[styles.summaryValue, dyn.text]}>{row.value}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
    </ScreenWrapper>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: COLORS.esp },
  scroll:  { flex: 1, backgroundColor: COLORS.bg2 },
  content: { padding: SIZES.padding, paddingTop: 12 },
  center:  { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center' },

  header:        { backgroundColor: COLORS.esp, paddingHorizontal: SIZES.padding, paddingTop: 18, paddingBottom: 20, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  headerSub:     { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 3 },
  headerTitle:   { fontSize: 22, fontWeight: '700', color: '#fff' },
  headerDate:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  headerDateText:{ fontSize: 10, color: COLORS.sand, fontWeight: '500' },

  sectionLabel: { fontSize: 9, letterSpacing: 2, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },

  // Dnes banner
  todayBanner:    { backgroundColor: COLORS.esp, borderRadius: 14, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.wal },
  todayLabel:     { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 3 },
  todayDate:      { fontSize: 14, fontWeight: '600', color: COLORS.cream },
  todayCount:     { alignItems: 'center', backgroundColor: COLORS.wal, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  todayCountNum:  { fontSize: 28, fontWeight: '800', color: '#fff', lineHeight: 32 },
  todayCountSub:  { fontSize: 9, color: COLORS.cream, fontWeight: '500' },

  // Najbližší termín
  upcomingCard:    { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: COLORS.bg3 },
  upcomingDot:     { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2ECC71' },
  upcomingLabel:   { fontSize: 8, letterSpacing: 1.5, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 3 },
  upcomingTime:    { fontSize: 14, fontWeight: '700', color: COLORS.esp, marginBottom: 2 },
  upcomingService: { fontSize: 11, color: COLORS.wal },

  // Metriky grid
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  statCard:    { width: '47%', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: COLORS.bg3, alignItems: 'center' },
  statEmoji:   { fontSize: 22, marginBottom: 4 },
  statValue:   { fontSize: 24, fontWeight: '800', lineHeight: 28, color: COLORS.esp },
  statLabel:   { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, color: COLORS.wal, marginTop: 2, textAlign: 'center' },
  statSub:     { fontSize: 10, color: '#888', marginTop: 3, textAlign: 'center' },

  // Trend
  trendRow:         { flexDirection: 'row', gap: 10, marginBottom: 14 },
  trendCard:        { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.bg3 },
  trendCardLabel:   { fontSize: 9, color: COLORS.wal, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  trendCardContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trendCardNum:     { fontSize: 26, fontWeight: '800', color: COLORS.esp },
  trendChip:        { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  trendText:        { fontSize: 11, fontWeight: '700' },

  // Karta
  card:      { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: COLORS.bg3 },
  cardTitle: { fontSize: 9, letterSpacing: 2, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 12 },

  // Týždenný graf
  weekChart:    { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 110, marginBottom: 10 },
  weekCol:      { flex: 1, alignItems: 'center' },
  weekCount:    { fontSize: 9, fontWeight: '700', color: COLORS.wal, marginBottom: 3 },
  weekBarWrap:  { height: 80, justifyContent: 'flex-end', width: '100%', alignItems: 'center' },
  weekBar:      { width: '70%', borderRadius: 4, minHeight: 4 },
  weekBarToday: { backgroundColor: COLORS.wal },
  weekDay:      { fontSize: 9, color: COLORS.wal, marginTop: 4, fontWeight: '500' },
  busiestRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.bg3 },
  busiestText:  { fontSize: 12, color: COLORS.wal },
  monthRevenueRow:  { flexDirection: 'row', marginTop: 2, marginBottom: 6 },
  monthRevenueCol:  { flex: 1, alignItems: 'center' },
  monthRevenueText: { fontSize: 8, color: COLORS.wal, fontWeight: '500' },

  // Status breakdown
  statusRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  statusEmoji: { fontSize: 14, width: 20 },
  statusLabel: { fontSize: 11, color: COLORS.esp, fontWeight: '500', width: 88 },
  statusCount: { fontSize: 13, fontWeight: '800', width: 28, textAlign: 'right' },
  totalRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.bg3, marginTop: 2 },
  totalLabel:  { fontSize: 11, fontWeight: '600', color: COLORS.esp },
  totalCount:  { fontSize: 13, fontWeight: '800', color: COLORS.esp },

  // Hodnotenia
  ratingRow:       { flexDirection: 'row', alignItems: 'center', gap: 12 },
  starsRow:        { flexDirection: 'row', gap: 3, marginBottom: 6 },
  ratingAvgText:   { fontSize: 20, fontWeight: '800', color: COLORS.esp, marginBottom: 2 },
  ratingCountText: { fontSize: 10, color: COLORS.wal, fontWeight: '500' },
  ratingCircle:    { width: 70, height: 70, borderRadius: 35, backgroundColor: '#FEF9E7', borderWidth: 2, borderColor: '#F1C40F', alignItems: 'center', justifyContent: 'center' },
  ratingCircleNum: { fontSize: 22, fontWeight: '800', color: COLORS.esp, lineHeight: 26 },
  ratingCircleSub: { fontSize: 9, color: COLORS.wal, fontWeight: '600' },

  // Príjem
  revenueCard:     { backgroundColor: COLORS.esp },
  revenueRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  revenueLabel:    { fontSize: 9, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  revenueAmount:   { fontSize: 26, fontWeight: '800', color: '#fff' },
  revenueDivider:  { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 16 },
  revenueNote:     { fontSize: 9, color: 'rgba(255,255,255,0.7)', fontStyle: 'italic' },

  // Top služby
  svcRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  svcRank:     { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.bg3, alignItems: 'center', justifyContent: 'center' },
  svcRankText: { fontSize: 10, fontWeight: '700', color: COLORS.wal },
  svcEmoji:    { fontSize: 16 },
  svcName:     { width: 110, fontSize: 11, fontWeight: '600', color: COLORS.esp },
  svcCount:    { fontSize: 12, fontWeight: '800', color: COLORS.wal, width: 28, textAlign: 'right' },

  // Retencia
  retentionGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  retentionItem:       { flex: 1, minWidth: '45%', borderRadius: 10, padding: 12, alignItems: 'center' },
  retentionNum:        { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  retentionLabel:      { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2, textAlign: 'center' },
  retentionBarRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  retentionBarLabel:   { fontSize: 10, color: COLORS.wal, width: 68, fontWeight: '600' },
  retentionBarTrack:   { flex: 1, height: 8, backgroundColor: COLORS.bg3, borderRadius: 4, overflow: 'hidden' },
  retentionBarFill:    { height: 8, borderRadius: 4 },
  retentionBarPct:     { fontSize: 11, fontWeight: '700', color: '#1E8449', width: 36, textAlign: 'right' },

  // Súhrn
  summaryRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: COLORS.bg3 },
  summaryEmoji: { fontSize: 16, width: 24 },
  summaryLabel: { flex: 1, fontSize: 12, color: COLORS.esp, fontWeight: '500' },
  summaryValue: { fontSize: 14, fontWeight: '800', color: COLORS.esp },

  // KPI boxy
  kpiBox:    { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center', gap: 4 },
  kpiNum:    { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  kpiLabel:  { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, color: COLORS.wal, textAlign: 'center' },
  chairDot:  { width: 10, height: 10, borderRadius: 5 },
  chairName: { width: 72, fontSize: 11, fontWeight: '600', color: COLORS.esp },
  chairCount:{ fontSize: 12, fontWeight: '800', color: COLORS.wal, width: 28, textAlign: 'right' },

  // Mesačné fakturácie
  invoiceCardHeader:     { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  monthPicker:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.bg2, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 4, marginBottom: 14, borderWidth: 1, borderColor: COLORS.bg3 },
  monthArrow:            { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  monthPickerLabel:      { fontSize: 15, fontWeight: '700', color: COLORS.esp },
  invoiceSummary:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EAFAF1', borderRadius: 10, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#A9DFBF' },
  invoiceSummaryItem:    { flex: 1, alignItems: 'center' },
  invoiceSummaryNum:     { fontSize: 22, fontWeight: '800', color: COLORS.esp, lineHeight: 26 },
  invoiceSummaryLabel:   { fontSize: 9, fontWeight: '600', color: COLORS.wal, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  invoiceSummaryDivider: { width: 1, height: 36, backgroundColor: '#A9DFBF', marginHorizontal: 8 },
  invoiceRow:            { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: COLORS.bg3 },
  invoiceDateBox:        { width: 36, alignItems: 'center', backgroundColor: COLORS.bg2, borderRadius: 8, paddingVertical: 4 },
  invoiceDateDay:        { fontSize: 16, fontWeight: '800', color: COLORS.esp, lineHeight: 20 },
  invoiceDateMon:        { fontSize: 8, fontWeight: '600', color: COLORS.wal, textTransform: 'uppercase' },
  invoicePatient:        { fontSize: 12, fontWeight: '700', color: COLORS.esp, marginBottom: 2 },
  invoiceService:        { fontSize: 11, color: COLORS.wal },
  invoicePrice:          { fontSize: 13, fontWeight: '800', color: '#1E8449' },
  invoiceEmpty:          { alignItems: 'center', paddingVertical: 24, gap: 8 },
  invoiceEmptyIcon:      { fontSize: 32 },
  invoiceEmptyText:      { fontSize: 12, color: COLORS.wal, textAlign: 'center', fontStyle: 'italic' },
  invoiceExportBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1A5276', borderRadius: 10, paddingVertical: 13, marginTop: 14 },
  invoiceExportBtnText:  { fontSize: 13, fontWeight: '700', color: '#fff' },
});
