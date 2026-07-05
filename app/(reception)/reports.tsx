import React, { useState, useEffect, useMemo } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import HeroHeader from '../../components/ui/HeroHeader';
import { supabase } from '../../supabase';
import { COLORS, RADII, SHADOWS, TYPO, GRADIENTS } from '../../styles/theme';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';

// ── Typy ──────────────────────────────────────────────────────────────────────

type DayStat = {
  date: string;
  total: number;
  completed: number;
  cancelled: number;
  noShow: number;
  revenue: number;
  avgWaitMins: number | null;
};

type ServiceStat = {
  name: string;
  emoji: string | null;
  count: number;
  revenue: number;
};

type PeriodTab = '7d' | '30d';

const PERIOD_TABS: { key: PeriodTab; label: string }[] = [
  { key: '7d',  label: '7 dní' },
  { key: '30d', label: '30 dní' },
];

// ── Hlavný komponent ──────────────────────────────────────────────────────────

export default function ReceptionReports() {
  const { colors, dark } = useAppTheme();
  const [period, setPeriod]           = useState<PeriodTab>('7d');
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [dayStats, setDayStats]       = useState<DayStat[]>([]);
  const [serviceStats, setServiceStats] = useState<ServiceStat[]>([]);

  const days = period === '7d' ? 7 : 30;

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);
      const fromStr = fromDate.toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from('appointments')
        .select('id, appointment_date, status, clinic_status, payment_status, service:services(name, emoji, price_min)')
        .gte('appointment_date', `${fromStr}T00:00:00`)
        .order('appointment_date', { ascending: true })
        .limit(2000);

      if (error || !data) { setLoading(false); return; }

      // Per-day stats
      const dayMap = new Map<string, { total: number; completed: number; cancelled: number; noShow: number; revenue: number }>();
      const svcMap = new Map<string, ServiceStat>();

      data.forEach((a: any) => {
        const date = a.appointment_date?.slice(0, 10) ?? '';
        const existing = dayMap.get(date) ?? { total: 0, completed: 0, cancelled: 0, noShow: 0, revenue: 0 };
        existing.total++;
        if (a.status === 'completed' || ['treatment_done', 'checkout', 'paid'].includes(a.clinic_status ?? '')) {
          existing.completed++;
        }
        if (a.status === 'cancelled') existing.cancelled++;
        if (a.clinic_status === 'no_show') existing.noShow++;
        if (a.payment_status === 'paid') {
          existing.revenue += a.service?.price_min ?? 0;
        }
        dayMap.set(date, existing);

        // Service stats
        const svcName = a.service?.name ?? 'Iné';
        const svcEmoji = a.service?.emoji ?? null;
        const svcKey = svcName;
        const svc = svcMap.get(svcKey) ?? { name: svcName, emoji: svcEmoji, count: 0, revenue: 0 };
        svc.count++;
        if (a.payment_status === 'paid') svc.revenue += a.service?.price_min ?? 0;
        svcMap.set(svcKey, svc);
      });

      const dayStatsArr: DayStat[] = [];
      dayMap.forEach((val, date) => {
        dayStatsArr.push({ date, ...val, avgWaitMins: null });
      });
      dayStatsArr.sort((a, b) => a.date.localeCompare(b.date));

      const svcStatsArr = [...svcMap.values()].sort((a, b) => b.count - a.count);

      setDayStats(dayStatsArr);
      setServiceStats(svcStatsArr);
    } catch (e: any) {
      console.error('[Reports] load failed:', e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, [period]);

  // Aggregáty
  const totals = useMemo(() => {
    const t = { appointments: 0, completed: 0, cancelled: 0, noShow: 0, revenue: 0 };
    dayStats.forEach(d => {
      t.appointments += d.total;
      t.completed += d.completed;
      t.cancelled += d.cancelled;
      t.noShow += d.noShow;
      t.revenue += d.revenue;
    });
    return t;
  }, [dayStats]);

  const avgPerDay = useMemo(() => {
    if (dayStats.length === 0) return 0;
    return Math.round(totals.appointments / dayStats.length);
  }, [dayStats, totals]);

  const completionRate = useMemo(() => {
    const eligible = totals.appointments - totals.cancelled;
    if (eligible === 0) return null;
    return Math.round((totals.completed / eligible) * 100);
  }, [totals]);

  const maxDayTotal = useMemo(() => Math.max(1, ...dayStats.map(d => d.total)), [dayStats]);

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    const dayNames = ['Ne','Po','Ut','St','Št','Pi','So'];
    return `${dayNames[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.esp }} edges={['top']}>
      <HeroHeader
        title="Reporty"
        subtitle="Recepcia"
        icon="bar-chart-outline"
      />

      {/* Period tabs */}
      <View style={[s.tabRow, { backgroundColor: dark ? '#1A120B' : COLORS.esp }]}>
        {PERIOD_TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[s.tab, period === tab.key && s.tabActive]}
            onPress={() => setPeriod(tab.key)}
            activeOpacity={0.8}
          >
            {period === tab.key ? (
              <LinearGradient colors={GRADIENTS.gold as [string, string, ...string[]]} style={s.tabGrad}>
                <Text style={[s.tabLabel, { color: '#fff' }]}>{tab.label}</Text>
              </LinearGradient>
            ) : (
              <Text style={[s.tabLabel, { color: 'rgba(196,168,130,0.7)' }]}>{tab.label}</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, backgroundColor: colors.bg2, padding: 16 }}>
          <SkeletonList count={6} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.bg2 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={COLORS.gold} />}
        >
          {/* ── Súhrnné KPI ── */}
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>Súhrn</Text>
            <View style={[s.kpiGrid, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, SHADOWS.card]}>
              <KpiCard icon="calendar-outline" label="Termíny" value={`${totals.appointments}`} color={dark ? '#5DADE2' : '#1A5276'} colors={colors} dark={dark} />
              <KpiCard icon="checkmark-circle-outline" label="Dokončené" value={`${totals.completed}`} color={dark ? '#82E0AA' : '#2E7D5E'} colors={colors} dark={dark} />
              <KpiCard icon="trending-up-outline" label="Ø/deň" value={`${avgPerDay}`} color={dark ? '#F0A030' : '#B87333'} colors={colors} dark={dark} />
              <KpiCard icon="pie-chart-outline" label="Úspešnosť" value={completionRate !== null ? `${completionRate}%` : '—'} color={dark ? '#D2B4DE' : '#7D3C98'} colors={colors} dark={dark} />
              <KpiCard icon="cash-outline" label="Príjem" value={`${totals.revenue.toLocaleString('sk-SK')} €`} color={dark ? '#82E0AA' : '#2E7D5E'} colors={colors} dark={dark} />
              <KpiCard icon="close-circle-outline" label="No-show" value={`${totals.noShow}`} color={dark ? '#F1948A' : '#C0392B'} colors={colors} dark={dark} />
            </View>
          </View>

          {/* ── Denný graf ── */}
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>Termíny podľa dňa</Text>
            <View style={[s.chartCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, SHADOWS.card]}>
              {dayStats.map(day => {
                const pct = (day.total / maxDayTotal) * 100;
                const compPct = day.total > 0 ? (day.completed / day.total) * 100 : 0;
                const isToday = day.date === new Date().toISOString().slice(0, 10);
                return (
                  <View key={day.date} style={s.chartRow}>
                    <Text style={[s.chartDate, { color: isToday ? COLORS.gold : colors.textSecondary }, isToday && { fontFamily: 'DMSans_500Medium' }]}>
                      {fmtDate(day.date)}
                    </Text>
                    <View style={s.chartBarWrap}>
                      <View style={[s.chartBarBg, { width: `${pct}%`, backgroundColor: dark ? '#1A5276' : '#EBF5FB' }]} />
                      <View style={[s.chartBarFg, { width: `${compPct * pct / 100}%`, backgroundColor: dark ? '#2E7D5E' : '#A8D5C0' }]} />
                    </View>
                    <Text style={[s.chartCount, { color: day.total > 0 ? colors.textPrimary : colors.bg3 }]}>
                      {day.total}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* ── Príjmy podľa dňa ── */}
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>Príjmy podľa dňa</Text>
            <View style={[s.chartCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, SHADOWS.card]}>
              {(() => {
                const maxRev = Math.max(1, ...dayStats.map(d => d.revenue));
                return dayStats.map(day => {
                  const pct = (day.revenue / maxRev) * 100;
                  const isToday = day.date === new Date().toISOString().slice(0, 10);
                  return (
                    <View key={day.date} style={s.chartRow}>
                      <Text style={[s.chartDate, { color: isToday ? COLORS.gold : colors.textSecondary }, isToday && { fontFamily: 'DMSans_500Medium' }]}>
                        {fmtDate(day.date)}
                      </Text>
                      <View style={s.chartBarWrap}>
                        <View style={[s.chartBarFg, { width: `${pct}%`, backgroundColor: dark ? '#2E7D5E' : '#A8D5C0' }]} />
                      </View>
                      <Text style={[s.chartCount, { color: day.revenue > 0 ? colors.textPrimary : colors.bg3, minWidth: 52, textAlign: 'right' }]}>
                        {day.revenue > 0 ? `${day.revenue.toLocaleString('sk-SK')} €` : '—'}
                      </Text>
                    </View>
                  );
                });
              })()}
            </View>
          </View>

          {/* ── Top služby ── */}
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>Top služby</Text>
            <View style={[s.chartCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, SHADOWS.card]}>
              {serviceStats.slice(0, 8).map((svc, idx) => {
                const maxSvc = serviceStats[0]?.count ?? 1;
                const pct = (svc.count / maxSvc) * 100;
                return (
                  <View key={svc.name} style={[s.svcRow, idx < Math.min(serviceStats.length, 8) - 1 && { borderBottomWidth: 1, borderBottomColor: colors.bg3 }]}>
                    <Text style={s.svcEmoji}>{svc.emoji ?? '🦷'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.svcName, { color: colors.textPrimary }]} numberOfLines={1}>{svc.name}</Text>
                      <View style={s.svcBarWrap}>
                        <View style={[s.svcBar, { width: `${pct}%`, backgroundColor: dark ? COLORS.gold + '40' : COLORS.gold + '30' }]} />
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[s.svcCount, { color: colors.textPrimary }]}>{svc.count}×</Text>
                      {svc.revenue > 0 && (
                        <Text style={[s.svcRev, { color: colors.textSecondary }]}>{svc.revenue.toLocaleString('sk-SK')} €</Text>
                      )}
                    </View>
                  </View>
                );
              })}
              {serviceStats.length === 0 && (
                <Text style={[s.emptyText, { color: colors.textSecondary }]}>Žiadne dáta za zvolené obdobie</Text>
              )}
            </View>
          </View>

          {/* ── Recall prehľad ── */}
          <RecallSection colors={colors} dark={dark} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ── Sub-komponenty ────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, color, colors, dark }: {
  icon: string; label: string; value: string; color: string; colors: any; dark: boolean;
}) {
  return (
    <View style={[kpi.item, { backgroundColor: dark ? color + '15' : color + '0A' }]}>
      <Ionicons name={icon as any} size={18} color={color} />
      <Text style={[kpi.value, { color: colors.textPrimary }]}>{value}</Text>
      <Text style={[kpi.label, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

function RecallSection({ colors, dark }: { colors: any; dark: boolean }) {
  const { colors: themeColors } = useAppTheme();
  const [recallCount, setRecallCount] = useState<number | null>(null);
  const [totalPatients, setTotalPatients] = useState<number>(0);

  useEffect(() => {
    async function loadRecall() {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 6);

      const [patientsRes, apptRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'patient'),
        supabase.from('appointments')
          .select('patient_id, appointment_date')
          .eq('status', 'completed')
          .order('appointment_date', { ascending: false })
          .limit(2000),
      ]);

      setTotalPatients(patientsRes.count ?? 0);

      if (!apptRes.data) return;
      const map = new Map<string, string>();
      apptRes.data.forEach((a: any) => {
        if (!map.has(a.patient_id)) map.set(a.patient_id, a.appointment_date);
      });
      const count = [...map.values()].filter(d => new Date(d) < cutoff).length;
      setRecallCount(count);
    }
    loadRecall();
  }, []);

  if (recallCount === null) return null;

  const pct = totalPatients > 0 ? Math.round((recallCount / totalPatients) * 100) : 0;

  return (
    <View style={s.section}>
      <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>Recall</Text>
      <View style={[s.recallCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, SHADOWS.card]}>
        <View style={s.recallRow}>
          <View style={[s.recallIcon, { backgroundColor: dark ? '#4A1010' : COLORS.errorBg }]}>
            <Ionicons name="notifications-outline" size={22} color={COLORS.error} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.recallValue, { color: colors.textPrimary }]}>
              {recallCount} {recallCount === 1 ? 'pacient' : recallCount < 5 ? 'pacienti' : 'pacientov'}
            </Text>
            <Text style={[s.recallSub, { color: colors.textSecondary }]}>
              Posledná návšteva viac ako 6 mesiacov ({pct}% z {totalPatients})
            </Text>
          </View>
        </View>
        {/* Progress bar */}
        <View style={[s.recallBarBg, { backgroundColor: dark ? '#ffffff10' : '#f0f0f0' }]}>
          <View style={[s.recallBarFg, { width: `${Math.min(pct, 100)}%`, backgroundColor: pct > 30 ? COLORS.error : COLORS.warning }]} />
        </View>
      </View>
    </View>
  );
}

// ── Štýly ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  hero:      { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, gap: 2 },
  heroLabel: { ...TYPO.overline, color: COLORS.sand, marginBottom: 2 },
  heroTitle: { ...TYPO.h1, color: '#F8F6F2' },
  backBtn:   { position: 'absolute', left: 16, top: 14, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },

  tabRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 14, paddingTop: 4, gap: 8 },
  tab:    { flex: 1, borderRadius: RADII.full, overflow: 'hidden', paddingVertical: 8, alignItems: 'center' },
  tabActive: {},
  tabGrad: { width: '100%', alignItems: 'center', paddingVertical: 8, borderRadius: RADII.full },
  tabLabel: { fontFamily: 'DMSans_500Medium', fontSize: 12, letterSpacing: 0.3 },

  section:      { marginBottom: 20 },
  sectionTitle: { ...TYPO.label, marginBottom: 10 },

  kpiGrid: { borderRadius: RADII.lg, borderWidth: 1, padding: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },

  chartCard: { borderRadius: RADII.lg, borderWidth: 1, padding: 12 },
  chartRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  chartDate: { width: 50, fontSize: 10, fontFamily: 'DMSans_500Medium', textAlign: 'right' },
  chartBarWrap: { flex: 1, height: 14, borderRadius: 7, overflow: 'hidden', position: 'relative' as const },
  chartBarBg:   { position: 'absolute' as const, left: 0, top: 0, bottom: 0, borderRadius: 7 },
  chartBarFg:   { position: 'absolute' as const, left: 0, top: 0, bottom: 0, borderRadius: 7 },
  chartCount:   { width: 20, fontSize: 11, fontFamily: 'DMSans_500Medium', textAlign: 'center' },

  svcRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 4 },
  svcEmoji:  { fontSize: 20 },
  svcName:   { fontFamily: 'DMSans_500Medium', fontSize: 13 },
  svcBarWrap:{ height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 4 },
  svcBar:    { height: 6, borderRadius: 3 },
  svcCount:  { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 16 },
  svcRev:    { fontFamily: 'DMSans_500Medium', fontSize: 10, marginTop: 1 },
  emptyText: { textAlign: 'center', padding: 20, fontFamily: 'DMSans_500Medium', fontSize: 13 },

  recallCard:  { borderRadius: RADII.lg, borderWidth: 1, padding: 16, gap: 12 },
  recallRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  recallIcon:  { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  recallValue: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 18 },
  recallSub:   { fontFamily: 'DMSans_500Medium', fontSize: 11, marginTop: 2 },
  recallBarBg: { height: 8, borderRadius: 4, overflow: 'hidden' },
  recallBarFg: { height: 8, borderRadius: 4 },
});

const kpi = StyleSheet.create({
  item:  { width: '31%', borderRadius: RADII.md, padding: 10, alignItems: 'center', gap: 4 },
  value: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 16, lineHeight: 20 },
  label: { fontFamily: 'DMSans_500Medium', fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase' },
});
