import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { supabase } from '../../supabase';
import { COLORS, SIZES } from '../../styles/theme';

// ─── Typy ─────────────────────────────────────────────────────────────────────
type ApptRow = {
  id: string;
  appointment_date: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  patient_id: string;
  service: { name: string; emoji: string | null; price_min: number | null } | null;
};

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
  const [appts,     setAppts]     = useState<ApptRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data } = await supabase
      .from('appointments')
      .select('id, appointment_date, status, patient_id, service:service_id(name, emoji, price_min)')
      .eq('doctor_id', user.id)
      .order('appointment_date', { ascending: false });

    setAppts((data ?? []) as ApptRow[]);
    setLoading(false);
    setRefreshing(false);
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
      uniquePats,
      revenue,
      revenueThisMonth,
      upcoming,
      topServices,
      weekChartData,
      busiestDay,
      completionRate: appts.length > 0 ? Math.round((completed.length / appts.length) * 100) : 0,
    };
  }, [appts]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={COLORS.wal} size="large" /></View>;
  }

  const todayLabel = new Date().toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
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
        style={styles.scroll}
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
            <Text style={styles.todayCountSub}>termínov</Text>
          </View>
        </View>

        {/* ── Najbližší termín ── */}
        {stats.upcoming && (
          <View style={styles.upcomingCard}>
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

        {/* ── Kľúčové metriky ── */}
        <Text style={styles.sectionLabel}>KĽÚČOVÉ METRIKY</Text>
        <View style={styles.metricsGrid}>
          <StatCard emoji="📅" label="Tento týždeň" value={stats.thisWeekCount}
            sub={`Minulý: ${stats.lastWeekCount}`} />
          <StatCard emoji="📆" label="Tento mesiac" value={stats.thisMonthCount}
            sub={`Minulý: ${stats.lastMonthCount}`} />
          <StatCard emoji="👥" label="Pacientov" value={stats.uniquePats}
            sub="celkovo" />
          <StatCard emoji="✅" label="Úspešnosť" value={`${stats.completionRate}%`}
            sub="dokončených" color="#1E8449" bg="#EAFAF1" />
        </View>

        {/* ── Trend týždeň / mesiac ── */}
        <View style={styles.trendRow}>
          <View style={[styles.trendCard, { flex: 1 }]}>
            <Text style={styles.trendCardLabel}>Týždeň vs minulý</Text>
            <View style={styles.trendCardContent}>
              <Text style={styles.trendCardNum}>{stats.thisWeekCount}</Text>
              <TrendChip current={stats.thisWeekCount} previous={stats.lastWeekCount} />
            </View>
          </View>
          <View style={[styles.trendCard, { flex: 1 }]}>
            <Text style={styles.trendCardLabel}>Mesiac vs minulý</Text>
            <View style={styles.trendCardContent}>
              <Text style={styles.trendCardNum}>{stats.thisMonthCount}</Text>
              <TrendChip current={stats.thisMonthCount} previous={stats.lastMonthCount} />
            </View>
          </View>
        </View>

        {/* ── Stĺpcový graf týždňa ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>TERMÍNY TENTO TÝŽDEŇ</Text>
          <WeekChart data={stats.weekChartData} />
          {stats.busiestDay && (
            <View style={styles.busiestRow}>
              <Ionicons name="flame-outline" size={13} color={COLORS.wal} />
              <Text style={styles.busiestText}>Najvyťaženejší deň: <Text style={{ fontWeight: '700', color: COLORS.esp }}>{stats.busiestDay}</Text></Text>
            </View>
          )}
        </View>

        {/* ── Status breakdown ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>STAV TERMÍNOV (CELKOVO)</Text>
          {[
            { label: 'Dokončené',   count: stats.completedCount,  color: '#1E8449', emoji: '✅' },
            { label: 'Naplánované', count: stats.scheduledCount,  color: '#1A5276', emoji: '📅' },
            { label: 'Zrušené',     count: stats.cancelledCount,  color: '#922B21', emoji: '❌' },
          ].map((row) => (
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

        {/* ── Top služby ── */}
        {stats.topServices.length > 0 && (
          <View style={styles.card}>
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
        <View style={styles.card}>
          <Text style={styles.cardTitle}>CELKOVÝ SÚHRN</Text>
          {[
            { label: 'Všetky termíny',    value: stats.totalCount,     emoji: '📋' },
            { label: 'Unikátnych pacientov', value: stats.uniquePats,  emoji: '👥' },
            { label: 'Dokončené termíny', value: stats.completedCount,  emoji: '✅' },
            { label: 'Miera úspešnosti',  value: `${stats.completionRate}%`, emoji: '📊' },
          ].map((row) => (
            <View key={row.label} style={styles.summaryRow}>
              <Text style={styles.summaryEmoji}>{row.emoji}</Text>
              <Text style={styles.summaryLabel}>{row.label}</Text>
              <Text style={styles.summaryValue}>{row.value}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
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
  statCard:    { width: '47%', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.bg3, alignItems: 'center' },
  statEmoji:   { fontSize: 22, marginBottom: 6 },
  statValue:   { fontSize: 26, fontWeight: '800', lineHeight: 30, color: COLORS.esp },
  statLabel:   { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, color: COLORS.wal, marginTop: 2 },
  statSub:     { fontSize: 9, color: '#bbb', marginTop: 3 },

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
  busiestText:  { fontSize: 11, color: COLORS.wal },

  // Status breakdown
  statusRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  statusEmoji: { fontSize: 14, width: 20 },
  statusLabel: { fontSize: 11, color: COLORS.esp, fontWeight: '500', width: 88 },
  statusCount: { fontSize: 13, fontWeight: '800', width: 28, textAlign: 'right' },
  totalRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.bg3, marginTop: 2 },
  totalLabel:  { fontSize: 11, fontWeight: '600', color: COLORS.esp },
  totalCount:  { fontSize: 13, fontWeight: '800', color: COLORS.esp },

  // Príjem
  revenueCard:     { backgroundColor: COLORS.esp },
  revenueRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  revenueLabel:    { fontSize: 9, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  revenueAmount:   { fontSize: 26, fontWeight: '800', color: '#fff' },
  revenueDivider:  { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 16 },
  revenueNote:     { fontSize: 9, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' },

  // Top služby
  svcRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  svcRank:     { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.bg3, alignItems: 'center', justifyContent: 'center' },
  svcRankText: { fontSize: 10, fontWeight: '700', color: COLORS.wal },
  svcEmoji:    { fontSize: 16 },
  svcName:     { width: 110, fontSize: 11, fontWeight: '600', color: COLORS.esp },
  svcCount:    { fontSize: 12, fontWeight: '800', color: COLORS.wal, width: 28, textAlign: 'right' },

  // Súhrn
  summaryRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: COLORS.bg3 },
  summaryEmoji: { fontSize: 16, width: 24 },
  summaryLabel: { flex: 1, fontSize: 12, color: COLORS.esp, fontWeight: '500' },
  summaryValue: { fontSize: 14, fontWeight: '800', color: COLORS.esp },
});
