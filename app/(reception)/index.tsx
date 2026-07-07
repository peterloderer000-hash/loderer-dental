import React, { useState, useEffect, useMemo } from 'react';
import {
  Image, Modal, RefreshControl, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import HeroHeader from '../../components/ui/HeroHeader';
import { useClinic } from '../../hooks/useClinic';
import { computeDayMetrics, fmtTime, fmtMins } from '../../utils/clinicMetrics';
import { COLORS, RADII, SHADOWS, TYPO, GRADIENTS } from '../../styles/theme';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';
import { supabase } from '../../supabase';

export default function ReceptionHome() {
  const router  = useRouter();
  const { colors, dark } = useAppTheme();
  const clinic  = useClinic();
  const metrics = computeDayMetrics(clinic.appointments);
  const [showKiosk, setShowKiosk] = useState(false);

  // QR kód pre self check-in (dnešný dátum + ambulancia ID)
  const today     = new Date().toISOString().slice(0, 10);
  const kioskData = `LODERER-CHECKIN:${today}`;
  const qrUrl     = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(kioskData)}`;

  const urgent = clinic.appointments.filter(a =>
    a.clinic_status === 'late' ||
    (a.clinic_status === 'waiting' &&
      a.arrived_at &&
      Math.round((Date.now() - new Date(a.arrived_at).getTime()) / 60000) > 15)
  );

  const inWaiting = clinic.appointments.filter(a =>
    a.clinic_status === 'waiting' || a.clinic_status === 'arrived',
  );
  const upcoming = clinic.appointments.filter(a => a.clinic_status === 'scheduled');

  const nowHour  = new Date().getHours();
  const greeting = nowHour < 12 ? 'Dobré ráno' : nowHour < 18 ? 'Dobrý deň' : 'Dobrý večer';

  // ── Denný príjem ──
  const [dailyRevenue, setDailyRevenue] = useState<number>(0);
  const [unpaidCount, setUnpaidCount]   = useState<number>(0);

  useEffect(() => {
    async function loadRevenue() {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from('appointments')
        .select('payment_status, service:services(price_min)')
        .gte('appointment_date', `${today}T00:00:00`)
        .lte('appointment_date', `${today}T23:59:59`)
        .neq('status', 'cancelled');
      if (!data) return;
      let revenue = 0;
      let unpaid = 0;
      data.forEach((a: any) => {
        const price = a.service?.price_min ?? 0;
        if (a.payment_status === 'paid') revenue += price;
        else unpaid++;
      });
      setDailyRevenue(revenue);
      setUnpaidCount(unpaid);
    }
    loadRevenue();
  }, [clinic.appointments]);

  // ── Timeline: rozdelenie dňa na hodinové sloty ──
  const timelineSlots = useMemo(() => {
    const slots: { hour: number; count: number; completed: number }[] = [];
    for (let h = 7; h <= 18; h++) {
      const inSlot = clinic.appointments.filter(a => {
        const aH = new Date(a.appointment_date).getHours();
        return aH === h;
      });
      slots.push({
        hour: h,
        count: inSlot.length,
        completed: inSlot.filter(a =>
          ['treatment_done', 'checkout', 'paid'].includes(a.clinic_status)
        ).length,
      });
    }
    return slots;
  }, [clinic.appointments]);

  const maxSlotCount = useMemo(() => Math.max(1, ...timelineSlots.map(s => s.count)), [timelineSlots]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.esp }} edges={['top']}>
      <HeroHeader
        greeting={greeting}
        title="Recepcia"
        icon="desktop-outline"
        rightAction={
          <TouchableOpacity onPress={clinic.refetch} style={s.refreshBtn} activeOpacity={0.8}>
            <Ionicons name="refresh" size={18} color={COLORS.sand} />
          </TouchableOpacity>
        }
        bottomElement={
          <View style={s.statRow}>
            <StatPill value={metrics.totalToday}     label="Dnes"      color={COLORS.sand} />
            <StatPill value={metrics.waitingNow}     label="Čaká"      color="#F0C78A" urgent={metrics.waitingNow > 0} />
            <StatPill value={metrics.inChairNow}     label="V kresle"  color="#D2B4DE" />
            <StatPill value={metrics.completedToday} label="Hotovo"    color="#A8D5C0" />
          </View>
        }
      />

      {clinic.loading ? (
        <View style={{ flex: 1, backgroundColor: colors.bg2, padding: 16 }}>
          <SkeletonList count={4} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.bg2 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={false} onRefresh={clinic.refetch} tintColor={COLORS.gold} />}
        >
          {/* ── Kiosk QR Modal ── */}
          <Modal visible={showKiosk} transparent animationType="fade" onRequestClose={() => setShowKiosk(false)}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
              <View style={[s.kioskSheet, { backgroundColor: colors.cardBg }]}>
                <Text style={[s.kioskTitle, { color: colors.textPrimary }]}>📱 Self Check-in</Text>
                <Text style={[s.kioskSub, { color: colors.textSecondary }]}>Ukážte tento QR kód pacientovi. Naskenuje ho mobilom a automaticky sa odhlási v čakárni.</Text>
                <View style={s.kioskQrWrap}>
                  <Image source={{ uri: qrUrl }} style={s.kioskQr} resizeMode="contain" />
                </View>
                <Text style={[s.kioskDate, { color: colors.textSecondary }]}>Platný: {today}</Text>
                <TouchableOpacity style={[s.kioskClose, { backgroundColor: dark ? '#1A120B' : COLORS.esp }]} onPress={() => setShowKiosk(false)} activeOpacity={0.85}>
                  <Text style={s.kioskCloseText}>Zavrieť</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* Urgent banner */}
          {urgent.length > 0 && (
            <View style={s.urgentBanner}>
              <Ionicons name="alert-circle" size={18} color={COLORS.error} />
              <Text style={s.urgentText}>
                {urgent.length === 1 ? '1 pacient vyžaduje pozornosť' : `${urgent.length} pacienti vyžadujú pozornosť`}
              </Text>
              <TouchableOpacity onPress={() => router.push('/(reception)/checkin' as any)} activeOpacity={0.8}>
                <Text style={s.urgentLink}>Zobraziť →</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Rozšírené KPI ── */}
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>Dnešné štatistiky</Text>
            <View style={[s.kpiGrid, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, SHADOWS.card]}>
              <KpiItem icon="time-outline" label="Ø čakanie" value={fmtMins(metrics.avgWaitingMins)} color={dark ? '#5DADE2' : '#1A5276'} dark={dark} />
              <KpiItem icon="medical-outline" label="Ø ošetrenie" value={fmtMins(metrics.avgTreatmentMins)} color={dark ? '#82E0AA' : '#1E6B45'} dark={dark} />
              <KpiItem icon="pie-chart-outline" label="Využitie" value={metrics.utilizationPct !== null ? `${metrics.utilizationPct}%` : '—'} color={dark ? '#F0A030' : '#B87333'} dark={dark} />
              <KpiItem icon="cash-outline" label="Príjem" value={`${dailyRevenue.toLocaleString('sk-SK')} €`} color={dark ? '#82E0AA' : '#2E7D5E'} dark={dark} />
              <KpiItem icon="close-circle-outline" label="No-show" value={`${metrics.noShowToday}`} color={dark ? '#F1948A' : '#C0392B'} dark={dark} />
              <KpiItem icon="card-outline" label="Nezapl." value={`${unpaidCount}`} color={dark ? '#F0C78A' : '#B87333'} dark={dark} />
            </View>
          </View>

          {/* ── Časová os ── */}
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>Časová os dňa</Text>
            <View style={[s.timelineCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, SHADOWS.card]}>
              {timelineSlots.map(slot => {
                const pct = (slot.count / maxSlotCount) * 100;
                const compPct = slot.count > 0 ? (slot.completed / slot.count) * 100 : 0;
                const isNow = new Date().getHours() === slot.hour;
                return (
                  <View key={slot.hour} style={s.tlRow}>
                    <Text style={[s.tlHour, { color: isNow ? COLORS.gold : colors.textSecondary }, isNow && { fontFamily: 'DMSans_500Medium' }]}>
                      {`${slot.hour}:00`}
                    </Text>
                    <View style={s.tlBarWrap}>
                      <View style={[s.tlBarBg, { width: `${pct}%`, backgroundColor: dark ? '#1A5276' : '#EBF5FB' }]} />
                      <View style={[s.tlBarFg, { width: `${compPct * pct / 100}%`, backgroundColor: dark ? '#2E7D5E' : '#A8D5C0' }]} />
                      {isNow && <View style={[s.tlNowDot, { borderColor: colors.cardBg }]} />}
                    </View>
                    <Text style={[s.tlCount, { color: slot.count > 0 ? colors.textPrimary : colors.bg3 }]}>
                      {slot.count}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Quick actions */}
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>Rýchle akcie</Text>
            <View style={s.quickGrid}>
              <QuickAction
                icon="enter-outline"
                label="Check-in"
                sub="Privítanie pacientov"
                color={COLORS.gold}
                onPress={() => router.push('/(reception)/checkin' as any)}
              />
              <QuickAction
                icon="people-outline"
                label="Pacienti"
                sub="Zoznam a vyhľadanie"
                color="#7D3C98"
                onPress={() => router.push('/(reception)/patients' as any)}
              />
              <QuickAction
                icon="card-outline"
                label="Platby"
                sub="Checkout a príjmy"
                color={COLORS.success}
                onPress={() => router.push('/(reception)/payments' as any)}
              />
              <QuickAction
                icon="medical-outline"
                label="Ambulancia"
                sub="Live stav kresiel"
                color={COLORS.info}
                onPress={() => router.push('/(reception)/clinic-room' as any)}
              />
              <QuickAction
                icon="qr-code-outline"
                label="Kiosk QR"
                sub="Self check-in pacienta"
                color="#7D3C98"
                onPress={() => setShowKiosk(true)}
              />
              <QuickAction
                icon="stats-chart-outline"
                label="Reporty"
                sub="Štatistiky a prehľady"
                color="#1A5276"
                onPress={() => router.push('/(reception)/reports' as any)}
              />
              <QuickAction
                icon="cart-outline"
                label="Shop objednávky"
                sub="Objednávky z e-shopu"
                color="#3A4256"
                onPress={() => router.push('/(reception)/shop-orders' as any)}
              />
            </View>
          </View>

          {/* Čakáreň */}
          {inWaiting.length > 0 && (
            <View style={s.section}>
              <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>
                V čakárni ({inWaiting.length})
              </Text>
              <View style={[s.listCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, SHADOWS.card]}>
                {inWaiting.map((a, idx) => {
                  const mins = a.arrived_at
                    ? Math.round((Date.now() - new Date(a.arrived_at).getTime()) / 60000)
                    : null;
                  const isLast = idx === inWaiting.length - 1;
                  return (
                    <View key={a.id} style={[s.listRow, isLast && { borderBottomWidth: 0 }, { borderBottomColor: colors.bg3 }]}>
                      <View style={[s.numBadge, { backgroundColor: dark ? '#1A120B' : COLORS.esp }, mins !== null && mins > 15 && { backgroundColor: COLORS.error }]}>
                        <Text style={s.numText}>{idx + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.listName, { color: colors.textPrimary }]}>{a.patient?.full_name ?? 'Pacient'}</Text>
                        <Text style={[s.listSub, { color: colors.textSecondary }]}>{a.service?.name ?? '—'}</Text>
                      </View>
                      {mins !== null && (
                        <View style={s.waitBadge}>
                          <Text style={[s.waitMins, { color: mins > 15 ? COLORS.error : COLORS.success }]}>{mins}</Text>
                          <Text style={[s.waitLabel, { color: mins > 15 ? COLORS.error : COLORS.success }]}>min</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Nadchádzajúce */}
          {upcoming.length > 0 && (
            <View style={s.section}>
              <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>
                Nadchádzajúce ({upcoming.length})
              </Text>
              <View style={[s.listCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, SHADOWS.card]}>
                {upcoming.slice(0, 6).map((a, idx) => {
                  const isLast = idx === Math.min(upcoming.length, 6) - 1;
                  return (
                    <View key={a.id} style={[s.listRow, isLast && { borderBottomWidth: 0 }, { borderBottomColor: colors.bg3 }]}>
                      <View style={s.dot} />
                      <View style={{ flex: 1 }}>
                        <Text style={[s.listName, { color: colors.textPrimary }]}>{a.patient?.full_name ?? 'Pacient'}</Text>
                        <Text style={[s.listSub, { color: colors.textSecondary }]}>{a.service?.name ?? '—'}</Text>
                      </View>
                      <Text style={[s.listTime, { color: colors.textPrimary }]}>{fmtTime(a.appointment_date)}</Text>
                    </View>
                  );
                })}
                {upcoming.length > 6 && (
                  <TouchableOpacity
                    style={s.moreRow}
                    onPress={() => router.push('/(reception)/checkin' as any)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.moreText, { color: COLORS.gold }]}>
                      Zobraziť všetky ({upcoming.length}) →
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {clinic.appointments.length === 0 && (
            <View style={s.emptyCard}>
              <Ionicons name="calendar-outline" size={48} color={COLORS.sand} />
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Žiadne termíny dnes</Text>
              <Text style={[s.emptySub, { color: colors.textSecondary }]}>
                Všetky termíny sú dokončené alebo žiadne nie sú naplánované
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function StatPill({ value, label, color, urgent }: {
  value: number; label: string; color: string; urgent?: boolean;
}) {
  return (
    <View style={[sp.wrap, urgent && { backgroundColor: 'rgba(192,57,43,0.15)' }]}>
      <Text style={[sp.value, { color }]}>{value}</Text>
      <Text style={[sp.label, { color: urgent ? COLORS.error : 'rgba(196,168,130,0.65)' }]}>{label}</Text>
    </View>
  );
}

function QuickAction({ icon, label, sub, color, onPress }: {
  icon: string; label: string; sub: string; color: string; onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <TouchableOpacity style={[qa.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]} onPress={onPress} activeOpacity={0.82}>
      <View style={[qa.iconWrap, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon as any} size={24} color={color} />
      </View>
      <Text style={[qa.label, { color: colors.textPrimary }]}>{label}</Text>
      <Text style={[qa.sub, { color: colors.textSecondary }]} numberOfLines={1}>{sub}</Text>
    </TouchableOpacity>
  );
}

function KpiItem({ icon, label, value, color, dark }: {
  icon: string; label: string; value: string; color: string; dark: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={[kpi.item, { backgroundColor: dark ? color + '15' : color + '0A' }]}>
      <Ionicons name={icon as any} size={18} color={color} />
      <Text style={[kpi.value, { color: colors.textPrimary }]}>{value}</Text>
      <Text style={[kpi.label, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20, overflow: 'hidden' },
  circle: { position: 'absolute', borderRadius: 999, backgroundColor: '#F8F6F2' },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  heroSub:  { ...TYPO.overline, color: COLORS.sand, marginBottom: 4 },
  heroTitle:{ ...TYPO.h1, color: '#F8F6F2' },
  refreshBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  statRow: { flexDirection: 'row', gap: 8 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  kioskSheet:    { borderRadius: 4, padding: 24, alignItems: 'center', width: '100%' },
  kioskTitle:    { fontSize: 22, fontFamily: 'PlayfairDisplay_700Bold', marginBottom: 8 },
  kioskSub:      { fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  kioskQrWrap:   { backgroundColor: COLORS.cream, borderRadius: 4, padding: 12, marginBottom: 12 },
  kioskQr:       { width: 240, height: 240 },
  kioskDate:     { fontSize: 12, marginBottom: 20 },
  kioskClose:    { paddingVertical: 14, paddingHorizontal: 48, borderRadius: 2 },
  kioskCloseText:{ fontSize: 15, fontFamily: 'DMSans_500Medium', color: '#F8F6F2' },
  urgentBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.errorBg,
    borderRadius: RADII.md, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: '#F1948A',
  },
  urgentText: { flex: 1, ...TYPO.bodyMed, color: '#922B21' },
  urgentLink: { ...TYPO.bodyMed, color: COLORS.error },

  section:      { marginBottom: 20 },
  sectionTitle: { ...TYPO.label, marginBottom: 10 },

  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  kpiGrid:      { borderRadius: RADII.lg, borderWidth: 1, padding: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  timelineCard: { borderRadius: RADII.lg, borderWidth: 1, padding: 12 },
  tlRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  tlHour:       { width: 38, fontSize: 10, fontFamily: 'DMSans_500Medium', textAlign: 'right' },
  tlBarWrap:    { flex: 1, height: 14, borderRadius: 2, overflow: 'hidden', position: 'relative' as const },
  tlBarBg:      { position: 'absolute' as const, left: 0, top: 0, bottom: 0, borderRadius: 2 },
  tlBarFg:      { position: 'absolute' as const, left: 0, top: 0, bottom: 0, borderRadius: 2 },
  tlNowDot:     { position: 'absolute' as const, right: -3, top: 3, width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.gold, borderWidth: 1.5, borderColor: '#F5F6F8' },
  tlCount:      { width: 20, fontSize: 11, fontFamily: 'DMSans_500Medium', textAlign: 'center' },

  listCard:  { borderRadius: RADII.lg, borderWidth: 1, overflow: 'hidden' },
  listRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 1 },
  listName:  { ...TYPO.bodyMed },
  listSub:   { ...TYPO.bodySm, marginTop: 2 },
  listTime:  { ...TYPO.bodyMed },

  numBadge: { width: 32, height: 32, borderRadius: 4, backgroundColor: COLORS.esp, alignItems: 'center', justifyContent: 'center' },
  numText:  { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 14, color: '#F5F6F8' },

  waitBadge: { alignItems: 'center', minWidth: 44 },
  waitMins:  { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 18, lineHeight: 22 },
  waitLabel: { ...TYPO.caption },

  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.bg3 },

  moreRow:  { padding: 14, alignItems: 'center' },
  moreText: { ...TYPO.bodyMed },

  emptyCard:  { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyTitle: { ...TYPO.h2, textAlign: 'center' },
  emptySub:   { ...TYPO.body, textAlign: 'center' },
});

const sp = StyleSheet.create({
  wrap:  { flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: RADII.md, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center', gap: 2 },
  value: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 22, lineHeight: 26 },
  label: { fontFamily: 'DMSans_500Medium', fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase' },
});

const qa = StyleSheet.create({
  card:    { width: '47%', borderRadius: RADII.lg, padding: 14, gap: 6, ...SHADOWS.card, borderWidth: 1 },
  iconWrap:{ width: 44, height: 44, borderRadius: RADII.md, alignItems: 'center', justifyContent: 'center' },
  label:   { fontFamily: 'DMSans_500Medium', fontSize: 14 },
  sub:     { fontFamily: 'DMSans_400Regular', fontSize: 11 },
});

const kpi = StyleSheet.create({
  item:  { width: '31%', borderRadius: RADII.md, padding: 10, alignItems: 'center', gap: 4 },
  value: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 16, lineHeight: 20 },
  label: { fontFamily: 'DMSans_500Medium', fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase' },
});
