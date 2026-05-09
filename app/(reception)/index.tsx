import React from 'react';
import {
  RefreshControl, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useClinic } from '../../hooks/useClinic';
import { computeDayMetrics, fmtTime } from '../../utils/clinicMetrics';
import { COLORS, RADII, SHADOWS, TYPO, GRADIENTS } from '../../styles/theme';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';

export default function ReceptionHome() {
  const router  = useRouter();
  const { colors, dark } = useAppTheme();
  const clinic  = useClinic();
  const metrics = computeDayMetrics(clinic.appointments);

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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.esp }} edges={['top']}>
      {/* Hero */}
      <LinearGradient colors={GRADIENTS.hero as [string, string, ...string[]]} style={s.hero}>
        {/* Decorative circles */}
        <View style={[s.circle, { width: 160, height: 160, right: -40, top: -60, opacity: 0.06 }]} />
        <View style={[s.circle, { width: 100, height: 100, right: 60, top: 10, opacity: 0.04 }]} />

        <View style={s.heroRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.heroSub}>{greeting}</Text>
            <Text style={s.heroTitle}>Recepcia</Text>
          </View>
          <TouchableOpacity onPress={clinic.refetch} style={s.refreshBtn} activeOpacity={0.8}>
            <Ionicons name="refresh" size={18} color={COLORS.sand} />
          </TouchableOpacity>
        </View>

        {/* Stat pills */}
        <View style={s.statRow}>
          <StatPill value={metrics.totalToday}     label="Dnes"      color={COLORS.sand} />
          <StatPill value={metrics.waitingNow}     label="Čaká"      color="#F0C78A" urgent={metrics.waitingNow > 0} />
          <StatPill value={metrics.inChairNow}     label="V kresle"  color="#D2B4DE" />
          <StatPill value={metrics.completedToday} label="Hotovo"    color="#A8D5C0" />
        </View>
      </LinearGradient>

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
                      <View style={[s.numBadge, mins !== null && mins > 15 && { backgroundColor: COLORS.error }]}>
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

const s = StyleSheet.create({
  hero: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20, overflow: 'hidden' },
  circle: { position: 'absolute', borderRadius: 999, backgroundColor: '#FAF6F0' },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  heroSub:  { ...TYPO.overline, color: COLORS.sand, marginBottom: 4 },
  heroTitle:{ ...TYPO.h1, color: '#FAF6F0' },
  refreshBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  statRow: { flexDirection: 'row', gap: 8 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

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

  listCard:  { borderRadius: RADII.lg, borderWidth: 1, overflow: 'hidden' },
  listRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 1 },
  listName:  { ...TYPO.bodyMed },
  listSub:   { ...TYPO.bodySm, marginTop: 2 },
  listTime:  { ...TYPO.bodyMed },

  numBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.esp, alignItems: 'center', justifyContent: 'center' },
  numText:  { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 14, color: '#fff' },

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
  card:    { width: '47%', backgroundColor: '#FFFDF9', borderRadius: RADII.lg, padding: 14, gap: 6, ...SHADOWS.card, borderWidth: 1, borderColor: COLORS.bg3 },
  iconWrap:{ width: 44, height: 44, borderRadius: RADII.md, alignItems: 'center', justifyContent: 'center' },
  label:   { fontFamily: 'DMSans_500Medium', fontSize: 14, color: COLORS.esp },
  sub:     { fontFamily: 'DMSans_400Regular', fontSize: 11, color: COLORS.wal },
});
