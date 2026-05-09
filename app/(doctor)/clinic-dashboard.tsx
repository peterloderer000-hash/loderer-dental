import React from 'react';
import {
  ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useClinic } from '../../hooks/useClinic';
import {
  computeDayMetrics, CLINIC_STATUS_CFG,
  fmtMins, fmtTime,
} from '../../utils/clinicMetrics';
import { COLORS } from '../../styles/theme';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon, color, bg }: {
  label: string; value: string | number; sub?: string;
  icon: string; color: string; bg: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={[sc.card, { backgroundColor: bg, borderColor: color + '44' }]}>
      <View style={[sc.iconWrap, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <Text style={[sc.value, { color }]}>{value}</Text>
      <Text style={[sc.label, { color: colors.textSecondary }]}>{label}</Text>
      {sub ? <Text style={[sc.sub, { color: colors.textSecondary }]}>{sub}</Text> : null}
    </View>
  );
}

const sc = StyleSheet.create({
  card:    { flex: 1, minWidth: 140, borderRadius: 14, padding: 14, gap: 4, borderWidth: 1.5, alignItems: 'flex-start' },
  iconWrap:{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  value:   { fontSize: 28, fontWeight: '900', lineHeight: 32 },
  label:   { fontSize: 11, fontWeight: '600', color: COLORS.wal, textTransform: 'uppercase', letterSpacing: 0.5 },
  sub:     { fontSize: 10, color: '#999', marginTop: 1 },
});

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={[pb.track, { backgroundColor: colors.bg3 }]}>
      <View style={[pb.fill, { width: `${Math.min(100, pct)}%`, backgroundColor: color }]} />
    </View>
  );
}

const pb = StyleSheet.create({
  track: { height: 8, borderRadius: 4, backgroundColor: COLORS.bg3, overflow: 'hidden', flex: 1 },
  fill:  { height: '100%', borderRadius: 4 },
});

// ─── Status row in appointment list ──────────────────────────────────────────

function ApptRow({ appt }: { appt: ReturnType<typeof useClinic>['appointments'][number] }) {
  const { colors } = useAppTheme();
  const cfg = CLINIC_STATUS_CFG[appt.clinic_status] ?? CLINIC_STATUS_CFG.scheduled;
  return (
    <View style={[ar.row, { borderBottomColor: colors.bg3 }]}>
      <Text style={ar.emoji}>{cfg.emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[ar.name, { color: colors.textPrimary }]}>{appt.patient?.full_name ?? 'Pacient'}</Text>
        <Text style={[ar.service, { color: colors.textSecondary }]}>{appt.service?.name ?? '—'}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text style={[ar.time, { color: colors.textPrimary }]}>{fmtTime(appt.appointment_date)}</Text>
        <View style={[ar.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
          <Text style={[ar.statusText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>
    </View>
  );
}

const ar = StyleSheet.create({
  row:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.bg3 },
  emoji:       { fontSize: 20, width: 28, textAlign: 'center' },
  name:        { fontSize: 14, fontWeight: '700', color: COLORS.esp },
  service:     { fontSize: 11, color: COLORS.wal, marginTop: 1 },
  time:        { fontSize: 13, fontWeight: '700', color: COLORS.esp },
  statusBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  statusText:  { fontSize: 9, fontWeight: '700' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ClinicDashboardScreen() {
  const router  = useRouter();
  const { colors, dark } = useAppTheme();
  const clinic  = useClinic();
  const metrics = computeDayMetrics(clinic.appointments);

  // Role guard — len doctor
  if (!clinic.loading && clinic.clinicRole !== 'doctor') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.esp }} edges={['top', 'bottom']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🔒</Text>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 8 }}>Prístup zamietnutý</Text>
          <Text style={{ fontSize: 13, color: COLORS.sand, textAlign: 'center' }}>Denný dashboard je dostupný len pre doktora.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const utilizationColor =
    metrics.utilizationPct === null  ? COLORS.wal :
    metrics.utilizationPct >= 80     ? '#1E8449' :
    metrics.utilizationPct >= 50     ? '#E67E22' : '#C0392B';

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.esp }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.esp }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerSub}>KLINIKA · DNES</Text>
          <Text style={s.headerTitle}>Denný prehľad</Text>
        </View>
        <TouchableOpacity onPress={clinic.refetch} style={s.refreshBtn} activeOpacity={0.8}>
          <Ionicons name="refresh" size={20} color={COLORS.cream} />
        </TouchableOpacity>
      </View>

      {clinic.loading ? (
        <View style={{ padding: 16, backgroundColor: colors.bg2 }}><SkeletonList count={5} /></View>
      ) : (
        <ScrollView style={[s.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

          {/* ── Quick nav ── */}
          <View style={s.navRow}>
            <TouchableOpacity style={[s.navBtn, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]} onPress={() => router.push('/(doctor)/clinic-live')} activeOpacity={0.85}>
              <Ionicons name="pulse-outline" size={16} color={colors.textPrimary} />
              <Text style={[s.navBtnText, { color: colors.textPrimary }]}>Live</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.navBtn, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]} onPress={() => router.push('/(doctor)/clinic-room')} activeOpacity={0.85}>
              <Ionicons name="bed-outline" size={16} color={colors.textPrimary} />
              <Text style={[s.navBtnText, { color: colors.textPrimary }]}>Kreslo</Text>
            </TouchableOpacity>
          </View>

          {/* ── Utilization ── */}
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>Využitie dňa</Text>
            <View style={[s.utilizationCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <View style={s.utilizationTop}>
                <Text style={[s.utilizationPct, { color: utilizationColor }]}>
                  {metrics.utilizationPct !== null ? `${metrics.utilizationPct}%` : '—'}
                </Text>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[s.utilizationLabel, { color: colors.textSecondary }]}>
                    {metrics.completedToday} / {metrics.totalToday - metrics.cancelledToday - metrics.noShowToday} dokončených
                  </Text>
                  <ProgressBar pct={metrics.utilizationPct ?? 0} color={utilizationColor} />
                </View>
              </View>
            </View>
          </View>

          {/* ── Stats grid ── */}
          <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>Aktuálny stav</Text>
          <View style={s.statsGrid}>
            <StatCard
              label="Celkom dnes" value={metrics.totalToday}
              icon="calendar-outline" color={COLORS.wal} bg={colors.bg2}
            />
            <StatCard
              label="Čaká teraz" value={metrics.waitingNow}
              icon="hourglass-outline"
              color={metrics.waitingNow > 0 ? '#7D6608' : '#1E8449'}
              bg={metrics.waitingNow > 0 ? '#FEF9E7' : '#EAFAF1'}
            />
          </View>
          <View style={s.statsGrid}>
            <StatCard
              label="V kresle" value={metrics.inChairNow}
              icon="medical-outline" color="#1E8449" bg="#EAFAF1"
            />
            <StatCard
              label="Dokončených" value={metrics.completedToday}
              icon="checkmark-circle-outline" color="#7D3C98" bg="#F5EEF8"
            />
          </View>
          <View style={s.statsGrid}>
            <StatCard
              label="Čaká príliš dlho" value={metrics.waitingTooLong}
              sub="> 15 minút"
              icon="alert-circle-outline"
              color={metrics.waitingTooLong > 0 ? '#C0392B' : '#1E8449'}
              bg={metrics.waitingTooLong > 0 ? '#FDEDEC' : '#EAFAF1'}
            />
            <StatCard
              label="No-show" value={metrics.noShowToday}
              icon="close-circle-outline"
              color={metrics.noShowToday > 0 ? '#922B21' : '#1E8449'}
              bg={metrics.noShowToday > 0 ? '#FDEDEC' : '#EAFAF1'}
            />
          </View>

          {/* ── Timing stats ── */}
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>Časové metriky</Text>
            <View style={[s.timingCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <TimingRow
                label="Priemerné čakanie"
                value={fmtMins(metrics.avgWaitingMins)}
                icon="hourglass-outline"
                accent={metrics.avgWaitingMins !== null && metrics.avgWaitingMins > 15}
              />
              <TimingRow
                label="Priemerný zákrok"
                value={fmtMins(metrics.avgTreatmentMins)}
                icon="timer-outline"
              />
              <TimingRow
                label="Zrušené"
                value={String(metrics.cancelledToday)}
                icon="calendar-outline"
                last
              />
            </View>
          </View>

          {/* ── Today's appointment list ── */}
          {clinic.appointments.length > 0 && (
            <View style={s.section}>
              <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>Zoznam dnes ({clinic.appointments.length})</Text>
              <View style={[s.apptCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                {clinic.appointments.map(a => <ApptRow key={a.id} appt={a} />)}
              </View>
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function TimingRow({ label, value, icon, accent, last }: {
  label: string; value: string; icon: string; accent?: boolean; last?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={[tr.row, { borderBottomColor: colors.bg3 }, last && { borderBottomWidth: 0 }]}>
      <Ionicons name={icon as any} size={15} color={accent ? '#C0392B' : colors.textSecondary} />
      <Text style={[tr.label, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[tr.value, { color: colors.textPrimary }, accent && { color: '#C0392B' }]}>{value}</Text>
    </View>
  );
}

const tr = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.bg3 },
  label: { flex: 1, fontSize: 13, color: COLORS.wal },
  value: { fontSize: 16, fontWeight: '800', color: COLORS.esp },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: COLORS.esp },
  scroll:  { flex: 1, backgroundColor: COLORS.bg2 },
  content: { padding: 14 },
  center:  { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center' },

  header: {
    backgroundColor: COLORS.esp,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  backBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  refreshBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerSub:  { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  headerTitle:{ fontSize: 18, fontWeight: '700', color: '#fff' },

  navRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  navBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: COLORS.cream, borderRadius: 12, paddingVertical: 11,
    borderWidth: 1, borderColor: COLORS.sand,
  },
  navBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.esp },

  section:      { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: COLORS.wal, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 },

  utilizationCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    borderWidth: 1.5, borderColor: COLORS.bg3,
  },
  utilizationTop:  { flexDirection: 'row', alignItems: 'center', gap: 14 },
  utilizationPct:  { fontSize: 40, fontWeight: '900', width: 80 },
  utilizationLabel:{ fontSize: 12, color: COLORS.wal, fontWeight: '500' },

  statsGrid: { flexDirection: 'row', gap: 10, marginBottom: 10 },

  timingCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: COLORS.bg3 },

  apptCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: COLORS.bg3 },
});
