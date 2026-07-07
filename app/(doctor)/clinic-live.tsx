import React, { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet,
  Text, TouchableOpacity, View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useClinic, type ClinicAppointment } from '../../hooks/useClinic';
import {
  CLINIC_STATUS_CFG, fmtTime, getWaitingMinutes,
  getTreatmentMinutes, fmtMins
} from '../../utils/clinicMetrics';
import { COLORS } from '../../styles/theme';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';

// ─── Action definitions per status ───────────────────────────────────────────

type ActionDef = {
  label:   string;
  icon:    string;
  color:   string;
  bg:      string;
  handler: (appt: ClinicAppointment) => Promise<void> | void;
};

// ─── Appointment card ─────────────────────────────────────────────────────────

type CardProps = {
  appt:          ClinicAppointment;
  expanded:      boolean;
  onToggle:      () => void;
  actions:       ActionDef[];
  rooms:         { id: string; name: string; color: string }[];
  onAssignRoom:  (appt: ClinicAppointment, roomId: string | null) => Promise<void>;
  tick:          number;
  actionLoading: boolean;
};

function AppointmentCard({ appt, expanded, onToggle, actions, rooms, onAssignRoom, tick, actionLoading }: CardProps) {
  const { colors, dark } = useAppTheme();
  const cfg      = CLINIC_STATUS_CFG[appt.clinic_status] ?? CLINIC_STATUS_CFG.scheduled;
  const waitMins = getWaitingMinutes(appt);
  const treatMin = getTreatmentMinutes(appt);
  const tooLong  = waitMins !== null && waitMins > 15 && appt.clinic_status === 'waiting';

  return (
    <View style={[s.card, expanded && s.cardExpanded, { borderLeftColor: cfg.border, borderLeftWidth: 4, backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
      <TouchableOpacity onPress={onToggle} activeOpacity={0.85}>
        {/* ── Row 1: status + name + time ── */}
        <View style={s.cardRow}>
          <View style={[s.statusChip, { backgroundColor: dark ? cfg.color + '22' : cfg.bg, borderColor: cfg.border }]}>
            <Text style={s.statusEmoji}>{cfg.emoji}</Text>
            <Text style={[s.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.patientName, { color: colors.textPrimary }]} numberOfLines={1}>
              {appt.patient?.full_name ?? 'Pacient'}
            </Text>
            {appt.service && (
              <Text style={[s.serviceName, { color: colors.textSecondary }]} numberOfLines={1}>
                {appt.service.emoji ?? '🦷'} {appt.service.name}
              </Text>
            )}
          </View>
          <View style={s.timeCol}>
            <Text style={[s.scheduledTime, { color: colors.textPrimary }]}>{fmtTime(appt.appointment_date)}</Text>
            {appt.room && (
              <View style={[s.roomChip, { backgroundColor: appt.room.color + '22', borderColor: appt.room.color + '66' }]}>
                <Text style={[s.roomChipText, { color: appt.room.color }]}>{appt.room.name}</Text>
              </View>
            )}
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16} color={colors.textSecondary} style={{ marginLeft: 6 }}
          />
        </View>

        {/* ── Row 2: time metrics ── */}
        <View style={s.metricsRow}>
          {appt.arrived_at && (
            <MetricPill icon="enter-outline" label="Príchod" value={fmtTime(appt.arrived_at)} />
          )}
          {appt.started_at && (
            <MetricPill icon="medical-outline" label="Začiatok" value={fmtTime(appt.started_at)} />
          )}
          {appt.ended_at && (
            <MetricPill icon="checkmark-circle-outline" label="Koniec" value={fmtTime(appt.ended_at)} />
          )}
          {waitMins !== null && appt.clinic_status === 'waiting' && (
            <MetricPill
              icon="hourglass-outline"
              label="Čaká"
              value={fmtMins(waitMins)}
              urgent={tooLong}
            />
          )}
          {treatMin !== null && ['in_chair','treatment_done','checkout','paid'].includes(appt.clinic_status) && (
            <MetricPill icon="timer-outline" label="Zákrok" value={fmtMins(treatMin)} />
          )}
        </View>
      </TouchableOpacity>

      {/* ── Expanded: rooms + actions ── */}
      {expanded && (
        <View style={[s.expandedSection, { backgroundColor: colors.bg2, borderTopColor: colors.bg3 }]}>
          {/* Room picker */}
          {rooms.length > 0 && (
            <View style={s.roomRow}>
              <Text style={[s.expandLabel, { color: colors.textSecondary }]}>MIESTNOSŤ</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                <TouchableOpacity
                  style={[s.roomBtn, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, !appt.room_id && s.roomBtnActive]}
                  onPress={() => onAssignRoom(appt, null)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.roomBtnText, { color: colors.textSecondary }, !appt.room_id && s.roomBtnTextActive]}>—</Text>
                </TouchableOpacity>
                {rooms.map(r => (
                  <TouchableOpacity
                    key={r.id}
                    style={[s.roomBtn, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, appt.room_id === r.id && { backgroundColor: r.color, borderColor: r.color }]}
                    onPress={() => onAssignRoom(appt, r.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.roomBtnText, { color: colors.textSecondary }, appt.room_id === r.id && { color: '#F5F6F8' }]}>{r.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Action buttons */}
          {actions.length > 0 && (
            <View style={s.actionsWrap}>
              <Text style={[s.expandLabel, { color: colors.textSecondary }]}>AKCIE</Text>
              {actionLoading ? (
                <View style={s.loadingRow}>
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                  <Text style={[s.loadingText, { color: colors.textSecondary }]}>Ukladám...</Text>
                </View>
              ) : (
                <View style={s.actionsGrid}>
                  {actions.map(a => (
                    <TouchableOpacity
                      key={a.label}
                      style={[s.actionBtn, { backgroundColor: dark ? a.color + '22' : a.bg, borderColor: a.color + '44' }]}
                      onPress={() => a.handler(appt)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name={a.icon as any} size={18} color={a.color} />
                      <Text style={[s.actionBtnText, { color: a.color }]}>{a.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {appt.clinic_status === 'paid' && (
            <View style={s.doneRow}>
              <Ionicons name="checkmark-circle" size={18} color="#2E7D5E" />
              <Text style={s.doneText}>Pacient odišiel · Zaplatené</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function MetricPill({ icon, label, value, urgent }: { icon: string; label: string; value: string; urgent?: boolean }) {
  const { colors, dark } = useAppTheme();
  return (
    <View style={[s.pill, urgent && s.pillUrgent, !urgent && { backgroundColor: colors.bg2, borderColor: colors.bg3 }, urgent && dark && { backgroundColor: '#4A1010', borderColor: '#C0392B' }]}>
      <Ionicons name={icon as any} size={11} color={urgent ? '#C0392B' : colors.textSecondary} />
      <Text style={[s.pillLabel, { color: colors.textSecondary }, urgent && { color: '#C0392B' }]}>{label}</Text>
      <Text style={[s.pillValue, { color: colors.textPrimary }, urgent && { color: '#C0392B' }]}>{value}</Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ClinicLiveScreen() {
  const router   = useRouter();
  const clinic   = useClinic();
  const { colors } = useAppTheme();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tick,     setTick]     = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Update waiting timers every minute
  useEffect(() => {
    intervalRef.current = setInterval(() => setTick(t => t + 1), 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  // Role guard — patient nesmie vidieť clinic screens
  if (!clinic.loading && clinic.clinicRole === null) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.esp }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🔒</Text>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#F5F6F8', marginBottom: 8 }}>Prístup zamietnutý</Text>
          <Text style={{ fontSize: 13, color: COLORS.sand, textAlign: 'center' }}>Táto obrazovka je dostupná len pre doktora a recepciu.</Text>
        </View>
      </View>
    );
  }

  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  function wrapAction(apptId: string, fn: () => Promise<void>): () => Promise<void> {
    return async () => {
      setActionLoadingId(apptId);
      try { await fn(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } finally { setActionLoadingId(null); }
    };
  }

  function getActions(appt: ClinicAppointment): ActionDef[] {
    const status   = appt.clinic_status;
    const isDoctor = clinic.clinicRole === 'doctor';

    if (status === 'scheduled' || status === 'late') {
      return [
        {
          label: 'Pacient prišiel', icon: 'enter-outline',
          color: '#117A65', bg: '#E8F8F5',
          handler: wrapAction(appt.id, async () => { await clinic.markArrived(appt); setExpanded(null); })
        },
        ...(status === 'scheduled' ? [{
          label: 'Mešká', icon: 'time-outline',
          color: '#B87333', bg: '#FDF3E7',
          handler: wrapAction(appt.id, async () => { await clinic.markLate(appt); setExpanded(null); })
        }] : []),
        {
          label: 'No-show', icon: 'close-circle-outline',
          color: '#922B21', bg: '#FDEDEC',
          handler: (a: ClinicAppointment) => confirmNoShow(a)
        },
      ];
    }

    if (status === 'arrived' || status === 'waiting') {
      return [
        ...(isDoctor ? [{
          label: 'Do kresla', icon: 'medical-outline',
          color: '#2E7D5E', bg: '#EDF7F3',
          handler: wrapAction(appt.id, async () => { await clinic.startTreatment(appt); setExpanded(null); })
        }] : []),
        {
          label: 'No-show', icon: 'close-circle-outline',
          color: '#922B21', bg: '#FDEDEC',
          handler: (a: ClinicAppointment) => confirmNoShow(a)
        },
      ];
    }

    if (status === 'in_chair') {
      return [
        ...(isDoctor ? [{
          label: 'Hotovo', icon: 'checkmark-circle-outline',
          color: '#7D3C98', bg: '#F5EEF8',
          handler: wrapAction(appt.id, async () => { await clinic.endTreatment(appt); setExpanded(null); })
        }] : []),
        {
          label: 'Pomoc!', icon: 'alert-circle-outline',
          color: '#C0392B', bg: '#FDEDEC',
          handler: wrapAction(appt.id, async () => { await clinic.needHelp(appt); })
        },
      ];
    }

    if (status === 'treatment_done') {
      return [
        {
          label: 'Priprav účet', icon: 'receipt-outline',
          color: '#E67E22', bg: '#FEF3E2',
          handler: wrapAction(appt.id, async () => { await clinic.prepareInvoice(appt); setExpanded(null); })
        },
      ];
    }

    if (status === 'checkout') {
      return [
        {
          label: 'Zaplatené', icon: 'card-outline',
          color: '#2E7D5E', bg: '#EDF7F3',
          handler: wrapAction(appt.id, async () => { await clinic.markPaid(appt); setExpanded(null); })
        },
      ];
    }

    return [];
  }

  function confirmNoShow(appt: ClinicAppointment) {
    Alert.alert(
      'No-show',
      `Označiť ${appt.patient?.full_name ?? 'pacienta'} ako neprišiel?`,
      [
        { text: 'Zrušiť', style: 'cancel' },
        { text: 'Áno, No-show', style: 'destructive', onPress: async () => {
          await clinic.markNoShow(appt);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setExpanded(null);
        }},
      ],
    );
  }

  // Exclude cancelled/no_show from live view — they're tracked in dashboard metrics
  const activeAppts = clinic.appointments.filter(
    a => a.clinic_status !== 'cancelled' && a.clinic_status !== 'no_show',
  );

  // ── Status summary counts ──
  const counts = {
    waiting:        activeAppts.filter(a => a.clinic_status === 'waiting').length,
    in_chair:       activeAppts.filter(a => a.clinic_status === 'in_chair').length,
    treatment_done: activeAppts.filter(a => a.clinic_status === 'treatment_done').length,
    checkout:       activeAppts.filter(a => a.clinic_status === 'checkout').length,
    late:           activeAppts.filter(a => a.clinic_status === 'late').length
  };

  const totalToday = activeAppts.length;

  return (
    <View style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerSub}>KLINIKA · DNES</Text>
          <Text style={s.headerTitle}>Live prehľad</Text>
        </View>
        <TouchableOpacity onPress={clinic.refetch} style={s.refreshBtn} activeOpacity={0.8}>
          <Ionicons name="refresh" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={s.liveDot}>
          <View style={s.liveDotInner} />
          <Text style={s.liveText}>LIVE</Text>
        </View>
      </View>

      {/* Summary bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.summaryScroll} contentContainerStyle={s.summaryRow}>
        <SummaryChip emoji="📋" label={`${totalToday} dnes`} color={COLORS.wal} />
        {counts.late > 0        && <SummaryChip emoji="⚠️" label={`${counts.late} mešká`}      color="#922B21" urgent />}
        {counts.waiting > 0     && <SummaryChip emoji="⏳" label={`${counts.waiting} čaká`}     color="#B87333" />}
        {counts.in_chair > 0    && <SummaryChip emoji="🦷" label={`${counts.in_chair} v kresle`} color="#2E7D5E" />}
        {counts.treatment_done > 0 && <SummaryChip emoji="✅" label={`${counts.treatment_done} hotový`} color="#7D3C98" />}
        {counts.checkout > 0    && <SummaryChip emoji="🧾" label={`${counts.checkout} účet`}    color="#E67E22" />}
      </ScrollView>

      {/* Content */}
      {clinic.loading ? (
        <View style={{ flex: 1, backgroundColor: colors.bg2, padding: 16 }}>
          <SkeletonList count={4} />
        </View>
      ) : activeAppts.length === 0 ? (
        <View style={[s.center, { backgroundColor: colors.bg2 }]}>
          <Text style={s.emptyIcon}>🏥</Text>
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Žiadne termíny dnes</Text>
          <Text style={[s.emptySub, { color: colors.textSecondary }]}>Všetky termíny sú dokončené alebo žiadne nie sú naplánované</Text>
        </View>
      ) : (
        <ScrollView style={[s.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {activeAppts.map(appt => (
            <AppointmentCard
              key={appt.id}
              appt={appt}
              expanded={expanded === appt.id}
              onToggle={() => setExpanded(expanded === appt.id ? null : appt.id)}
              actions={getActions(appt)}
              rooms={clinic.rooms}
              onAssignRoom={async (a, roomId) => { await clinic.assignRoom(a, roomId); }}
              tick={tick}
              actionLoading={actionLoadingId === appt.id}
            />
          ))}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </View>
  );
}

function SummaryChip({ emoji, label, color, urgent }: { emoji: string; label: string; color: string; urgent?: boolean }) {
  const { dark } = useAppTheme();
  return (
    <View style={[s.summaryChip, urgent && { borderColor: color, backgroundColor: dark ? '#4A1010' : '#FDEDEC' }]}>
      <Text style={s.summaryEmoji}>{emoji}</Text>
      <Text style={[s.summaryLabel, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: COLORS.esp },
  scroll:  { flex: 1, backgroundColor: COLORS.bg2 },
  content: { padding: 12 },
  center:  { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center', padding: 32 },

  // Header
  header: {
    backgroundColor: COLORS.esp,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10
  },
  backBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  refreshBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerSub:  { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  headerTitle:{ fontSize: 18, fontWeight: '700', color: '#F5F6F8' },
  liveDot:    { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, paddingHorizontal: 8, paddingVertical: 5 },
  liveDotInner: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#52C896' },
  liveText:   { fontSize: 10, fontWeight: '700', color: '#52C896', letterSpacing: 1 },

  // Summary bar
  summaryScroll: { maxHeight: 42, backgroundColor: COLORS.esp },
  summaryRow:    { paddingHorizontal: 12, paddingBottom: 10, gap: 8, flexDirection: 'row', alignItems: 'center' },
  summaryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 4,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)'
  },
  summaryEmoji: { fontSize: 12 },
  summaryLabel: { fontSize: 11, fontWeight: '600' },

  // Cards
  card: {
    backgroundColor: COLORS.cream, borderRadius: 2, marginBottom: 10,
    borderWidth: 1.5, borderColor: COLORS.bg3, overflow: 'hidden',
    elevation: 2, shadowColor: '#121417', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4
  },
  cardExpanded: { borderColor: COLORS.sand },

  cardRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },

  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 2, paddingHorizontal: 7, paddingVertical: 4,
    borderWidth: 1
  },
  statusEmoji: { fontSize: 11 },
  statusLabel: { fontSize: 10, fontWeight: '700' },

  patientName: { fontSize: 15, fontWeight: '800', color: COLORS.esp, flex: 1 },
  serviceName: { fontSize: 11, color: COLORS.wal, marginTop: 1 },

  timeCol:       { alignItems: 'flex-end', gap: 4 },
  scheduledTime: { fontSize: 14, fontWeight: '700', color: COLORS.esp },
  roomChip:      { borderRadius: 2, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  roomChipText:  { fontSize: 10, fontWeight: '600' },

  // Metric pills
  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, paddingHorizontal: 12, paddingBottom: 10 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: COLORS.bg2, borderRadius: 2, paddingHorizontal: 7, paddingVertical: 4,
    borderWidth: 1, borderColor: COLORS.bg3
  },
  pillUrgent: { backgroundColor: '#FDEDEC', borderColor: '#F1948A' },
  pillLabel:  { fontSize: 9, color: COLORS.wal, textTransform: 'uppercase', letterSpacing: 0.5 },
  pillValue:  { fontSize: 11, fontWeight: '700', color: COLORS.esp },

  // Expanded section
  expandedSection: { borderTopWidth: 1, borderTopColor: COLORS.bg3, padding: 12, gap: 12, backgroundColor: COLORS.bg2 },
  expandLabel:     { fontSize: 9, fontWeight: '700', color: COLORS.wal, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 },

  // Room picker
  roomRow: {},
  roomBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 2,
    borderWidth: 1.5, borderColor: COLORS.bg3, backgroundColor: COLORS.cream
  },
  roomBtnActive: { backgroundColor: COLORS.esp, borderColor: COLORS.esp },
  roomBtnText:   { fontSize: 12, fontWeight: '600', color: COLORS.wal },
  roomBtnTextActive: { color: '#F5F6F8' },

  // Action buttons
  actionsWrap:  {},
  actionsGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  loadingRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 2,
    borderWidth: 1.5
  },
  actionBtnText: { fontSize: 13, fontWeight: '700' },

  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  doneText: { fontSize: 13, color: '#2E7D5E', fontWeight: '600' },

  // Loading / empty
  loadingText: { marginTop: 12, fontSize: 13, color: COLORS.wal },
  emptyIcon:   { fontSize: 56, marginBottom: 16 },
  emptyTitle:  { fontSize: 18, fontWeight: '700', color: COLORS.esp, marginBottom: 6, textAlign: 'center' },
  emptySub:    { fontSize: 13, color: COLORS.wal, textAlign: 'center', lineHeight: 20 }
});
