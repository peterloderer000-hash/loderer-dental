import React, { useState, useEffect, useMemo } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabase';
import { COLORS, RADII, SHADOWS, TYPO, GRADIENTS } from '../../styles/theme';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';
import { fmtTime } from '../../utils/clinicMetrics';

type PayableAppointment = {
  id: string;
  appointment_date: string;
  duration_minutes: number;
  clinic_status: string | null;
  payment_status: string | null;
  price: number | null;
  patient: { id: string; full_name: string } | null;
  service: { name: string; price: number | null } | null;
};

type FilterTab = 'pending' | 'paid' | 'all';

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'pending', label: 'Nezaplatené' },
  { key: 'paid',    label: 'Zaplatené'  },
  { key: 'all',     label: 'Všetky'     },
];

export default function ReceptionPayments() {
  const { colors, dark } = useAppTheme();
  const [appointments, setAppointments] = useState<PayableAppointment[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [filter, setFilter]             = useState<FilterTab>('pending');
  const [marking, setMarking]           = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    const { data } = await supabase
      .from('appointments')
      .select('id, appointment_date, duration_minutes, clinic_status, payment_status, price, patient:profiles!appointments_patient_id_fkey(id, full_name), service:services(name, price)')
      .gte('appointment_date', `${today}T00:00:00`)
      .lte('appointment_date', `${today}T23:59:59`)
      .order('appointment_date');
    setAppointments((data as unknown as PayableAppointment[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (filter === 'paid')    return appointments.filter(a => a.payment_status === 'paid');
    if (filter === 'pending') return appointments.filter(a => a.payment_status !== 'paid' && a.clinic_status !== 'cancelled');
    return appointments.filter(a => a.clinic_status !== 'cancelled');
  }, [appointments, filter]);

  const totalPending = useMemo(
    () => appointments
      .filter(a => a.payment_status !== 'paid' && a.clinic_status !== 'cancelled')
      .reduce((sum, a) => sum + (a.price ?? a.service?.price ?? 0), 0),
    [appointments]
  );
  const totalPaid = useMemo(
    () => appointments
      .filter(a => a.payment_status === 'paid')
      .reduce((sum, a) => sum + (a.price ?? a.service?.price ?? 0), 0),
    [appointments]
  );

  async function markPaid(apt: PayableAppointment) {
    setMarking(apt.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await supabase.from('appointments').update({ payment_status: 'paid' }).eq('id', apt.id);
    setMarking(null);
    load(true);
  }

  const fmtPrice = (val: number | null | undefined) =>
    val != null ? `${val.toLocaleString('sk-SK')} €` : '—';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.esp }} edges={['top']}>
      {/* Hero */}
      <LinearGradient colors={GRADIENTS.hero as [string, string, ...string[]]} style={s.hero}>
        <Text style={s.heroLabel}>RECEPCIA · DNES</Text>
        <Text style={s.heroTitle}>Platby</Text>

        {/* Summary row */}
        <View style={s.summaryRow}>
          <SummaryChip
            label="Nezaplatené"
            value={fmtPrice(totalPending)}
            color="#F0C78A"
            textColor="#7D5A0A"
          />
          <SummaryChip
            label="Prijaté"
            value={fmtPrice(totalPaid)}
            color="#A8D5C0"
            textColor="#1E6045"
          />
        </View>
      </LinearGradient>

      {/* Filter tabs */}
      <View style={[s.filterRow, { backgroundColor: COLORS.esp }]}>
        {FILTER_TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[s.filterTab, filter === tab.key && s.filterTabActive]}
            onPress={() => { setFilter(tab.key); Haptics.selectionAsync(); }}
            activeOpacity={0.8}
          >
            {filter === tab.key ? (
              <LinearGradient colors={GRADIENTS.gold as [string, string, ...string[]]} style={s.filterGrad}>
                <Text style={[s.filterLabel, { color: '#fff' }]}>{tab.label}</Text>
              </LinearGradient>
            ) : (
              <Text style={[s.filterLabel, { color: 'rgba(196,168,130,0.7)' }]}>{tab.label}</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, backgroundColor: colors.bg2, padding: 16 }}>
          <SkeletonList count={5} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.bg2 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={COLORS.gold} />}
        >
          {filtered.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="card-outline" size={48} color={COLORS.sand} />
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
                {filter === 'pending' ? 'Všetko zaplatené' : 'Žiadne záznamy'}
              </Text>
              <Text style={[s.emptySub, { color: colors.textSecondary }]}>
                {filter === 'pending'
                  ? 'Výborne! Žiadne čakajúce platby na dnešok'
                  : 'Pre zvolený filter sa nenašli žiadne záznamy'}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {filtered.map(apt => {
                const isPaid = apt.payment_status === 'paid';
                const price = apt.price ?? apt.service?.price ?? null;
                const isLoading = marking === apt.id;

                return (
                  <View
                    key={apt.id}
                    style={[pc.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, SHADOWS.card]}
                  >
                    <View style={[pc.accent, { backgroundColor: isPaid ? COLORS.success : COLORS.gold }]} />

                    <View style={pc.top}>
                      <View style={{ flex: 1 }}>
                        <Text style={[pc.name, { color: colors.textPrimary }]} numberOfLines={1}>
                          {apt.patient?.full_name ?? 'Pacient'}
                        </Text>
                        <Text style={[pc.service, { color: colors.textSecondary }]} numberOfLines={1}>
                          {apt.service?.name ?? '—'} · {fmtTime(apt.appointment_date)}
                        </Text>
                      </View>

                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Text style={[pc.price, { color: isPaid ? COLORS.success : colors.textPrimary }]}>
                          {fmtPrice(price)}
                        </Text>
                        {isPaid && (
                          <View style={pc.paidBadge}>
                            <Ionicons name="checkmark-circle" size={12} color={COLORS.success} />
                            <Text style={pc.paidText}>Zaplatené</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {!isPaid && apt.clinic_status !== 'cancelled' && (
                      <TouchableOpacity
                        style={pc.payBtn}
                        onPress={() => markPaid(apt)}
                        activeOpacity={0.8}
                        disabled={isLoading}
                      >
                        <LinearGradient
                          colors={GRADIENTS.gold as [string, string, ...string[]]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={pc.payGrad}
                        >
                          {isLoading
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <>
                                <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                                <Text style={pc.payText}>Označiť ako zaplatené</Text>
                              </>
                          }
                        </LinearGradient>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function SummaryChip({ label, value, color, textColor }: {
  label: string; value: string; color: string; textColor: string;
}) {
  return (
    <View style={[schip.wrap, { backgroundColor: color }]}>
      <Text style={[schip.label, { color: textColor }]}>{label}</Text>
      <Text style={[schip.value, { color: textColor }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, gap: 2 },
  heroLabel: { ...TYPO.overline, color: COLORS.sand, marginBottom: 2 },
  heroTitle: { ...TYPO.h1, color: '#FAF6F0', marginBottom: 14 },
  summaryRow: { flexDirection: 'row', gap: 10 },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 14, paddingTop: 4, gap: 8 },
  filterTab: {
    flex: 1,
    borderRadius: RADII.full,
    overflow: 'hidden',
    paddingVertical: 8,
    alignItems: 'center',
  },
  filterTabActive: {},
  filterGrad: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: RADII.full,
  },
  filterLabel: { fontFamily: 'DMSans_500Medium', fontSize: 12, letterSpacing: 0.3 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty:  { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyTitle: { ...TYPO.h2, textAlign: 'center' },
  emptySub:   { ...TYPO.body, textAlign: 'center' },
});

const schip = StyleSheet.create({
  wrap:  { flex: 1, borderRadius: RADII.md, padding: 12, gap: 3 },
  label: { fontFamily: 'DMSans_500Medium', fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
  value: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 20, lineHeight: 24 },
});

const pc = StyleSheet.create({
  card: {
    borderRadius: RADII.lg,
    borderWidth: 1,
    overflow: 'hidden',
    paddingLeft: 18,
    paddingRight: 14,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 10,
  },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  top:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  name:   { ...TYPO.bodyMed },
  service:{ ...TYPO.bodySm, marginTop: 2 },
  price:  { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 18, lineHeight: 22 },
  paidBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  paidText:  { fontFamily: 'DMSans_500Medium', fontSize: 11, color: COLORS.success },
  payBtn:    { borderRadius: RADII.md, overflow: 'hidden' },
  payGrad:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  payText:   { fontFamily: 'DMSans_500Medium', fontSize: 13, color: '#fff' },
});
