/**
 * Clinic Room — tablet-friendly screen for a single treatment room.
 * Large action buttons, current patient, live timer.
 * URL: /(doctor)/clinic-room?roomId=<uuid>
 * If no roomId, shows room picker.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useClinic, type ClinicAppointment, type ClinicRoom } from '../../hooks/useClinic';
import {
  CLINIC_STATUS_CFG, fmtTime, getWaitingMinutes,
  getTreatmentMinutes, fmtMins,
} from '../../utils/clinicMetrics';
import { COLORS } from '../../styles/theme';
import { useAppTheme } from '../../context/ThemeContext';

// ─── Live timer hook ──────────────────────────────────────────────────────────

function useTick(intervalMs = 10_000) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return tick;
}

// ─── Patient card for current room ───────────────────────────────────────────

function PatientCard({ appt, onAction, tick, isLoading, isDoctor }: {
  appt:      ClinicAppointment;
  onAction:  (action: string) => void;
  tick:      number;
  isLoading: boolean;
  isDoctor:  boolean;
}) {
  const { colors, dark } = useAppTheme();
  const cfg      = CLINIC_STATUS_CFG[appt.clinic_status] ?? CLINIC_STATUS_CFG.scheduled;
  const waitMins = getWaitingMinutes(appt);
  const treatMin = getTreatmentMinutes(appt);

  return (
    <View style={[pc.card, { borderColor: colors.bg3, borderTopWidth: 4, borderTopColor: cfg.color, backgroundColor: colors.cardBg }]}>
      {/* Status badge */}
      <View style={[pc.statusBadge, { backgroundColor: dark ? cfg.color + '22' : cfg.bg, borderColor: cfg.border }]}>
        <Text style={pc.statusEmoji}>{cfg.emoji}</Text>
        <Text style={[pc.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
      </View>

      {/* Patient info */}
      <Text style={[pc.patientName, { color: colors.textPrimary }]}>{appt.patient?.full_name ?? 'Pacient'}</Text>
      {appt.service && (
        <Text style={[pc.serviceName, { color: colors.textSecondary }]}>
          {appt.service.emoji ?? '🦷'} {appt.service.name}
          {appt.service.duration_minutes ? `  ·  ${appt.service.duration_minutes} min` : ''}
        </Text>
      )}
      {appt.patient?.phone_number && (
        <Text style={[pc.phone, { color: colors.textSecondary }]}>{appt.patient.phone_number}</Text>
      )}

      {/* Time metrics */}
      <View style={pc.timerRow}>
        <TimerCell label="TERMÍN"   value={fmtTime(appt.appointment_date)} icon="calendar-outline" />
        {appt.arrived_at   && <TimerCell label="PRÍCHOD"  value={fmtTime(appt.arrived_at)}         icon="enter-outline" />}
        {appt.started_at && <TimerCell label="ZAČIATOK" value={fmtTime(appt.started_at)}   icon="medical-outline" />}
        {appt.ended_at && <TimerCell label="KONIEC" value={fmtTime(appt.ended_at)} icon="flag-outline" />}
        {waitMins !== null && appt.clinic_status === 'waiting' &&
          <TimerCell label="ČAKÁ"    value={fmtMins(waitMins)}  icon="hourglass-outline" urgent={waitMins > 15} />}
        {treatMin !== null && ['in_chair','treatment_done','checkout','paid'].includes(appt.clinic_status) &&
          <TimerCell label="ZÁKROK"  value={fmtMins(treatMin)}  icon="timer-outline" />}
      </View>

      {/* Action buttons */}
      {isLoading ? (
        <View style={pc.loadingRow}>
          <ActivityIndicator size="small" color={colors.textSecondary} />
          <Text style={[pc.loadingText, { color: colors.textSecondary }]}>Ukladám...</Text>
        </View>
      ) : (
        <ActionButtons status={appt.clinic_status} onAction={onAction} isDoctor={isDoctor} />
      )}
    </View>
  );
}

function TimerCell({ label, value, icon, urgent }: { label: string; value: string; icon: string; urgent?: boolean }) {
  const { colors, dark } = useAppTheme();
  return (
    <View style={[pc.timerCell, urgent && pc.timerCellUrgent, !urgent && { backgroundColor: colors.bg2, borderColor: colors.bg3 }, urgent && dark && { backgroundColor: '#4A1010', borderColor: '#C0392B' }]}>
      <Ionicons name={icon as any} size={14} color={urgent ? '#C0392B' : colors.textSecondary} />
      <Text style={[pc.timerLabel, { color: colors.textSecondary }, urgent && { color: '#C0392B' }]}>{label}</Text>
      <Text style={[pc.timerValue, { color: colors.textPrimary }, urgent && { color: '#C0392B' }]}>{value}</Text>
    </View>
  );
}

function ActionButtons({ status, onAction, isDoctor }: {
  status: string; onAction: (a: string) => void; isDoctor: boolean;
}) {
  const { dark } = useAppTheme();
  type BtnDef = { label: string; icon: string; color: string; bg: string; action: string; big?: boolean };
  let buttons: BtnDef[] = [];

  if (status === 'scheduled' || status === 'late') {
    buttons = [
      { label: 'Pacient prišiel', icon: 'enter-outline',         color: '#117A65', bg: '#E8F8F5', action: 'arrived', big: true },
      { label: 'Mešká',           icon: 'time-outline',           color: '#7D6608', bg: '#FEF9E7', action: 'late' },
      { label: 'No-show',         icon: 'close-circle-outline',   color: '#922B21', bg: '#FDEDEC', action: 'noshow' },
    ];
  } else if (status === 'arrived' || status === 'waiting') {
    buttons = [
      ...(isDoctor ? [{ label: 'DO KRESLA', icon: 'medical-outline', color: '#1E8449', bg: '#EAFAF1', action: 'start', big: true } as BtnDef] : []),
      { label: 'No-show', icon: 'close-circle-outline', color: '#922B21', bg: '#FDEDEC', action: 'noshow' },
    ];
  } else if (status === 'in_chair') {
    buttons = [
      ...(isDoctor ? [{ label: 'HOTOVO', icon: 'checkmark-circle-outline', color: '#7D3C98', bg: '#F5EEF8', action: 'done', big: true } as BtnDef] : []),
      { label: 'Pomoc!', icon: 'alert-circle-outline', color: '#C0392B', bg: '#FDEDEC', action: 'help' },
    ];
  } else if (status === 'treatment_done') {
    buttons = [
      { label: 'PRIPRAV ÚČET', icon: 'receipt-outline', color: '#E67E22', bg: '#FEF3E2', action: 'checkout', big: true },
    ];
  } else if (status === 'checkout') {
    buttons = [
      { label: 'ZAPLATENÉ', icon: 'card-outline', color: '#1E8449', bg: '#EAFAF1', action: 'paid', big: true },
    ];
  }

  if (buttons.length === 0) {
    return (
      <View style={pc.doneRow}>
        <Ionicons name="checkmark-circle" size={22} color="#1E8449" />
        <Text style={pc.doneText}>Pacient odišiel · Zaplatené</Text>
      </View>
    );
  }

  return (
    <View style={pc.btnGrid}>
      {buttons.map(b => (
        <TouchableOpacity
          key={b.action}
          style={[pc.btn, { backgroundColor: dark ? b.color + '22' : b.bg, borderColor: b.color + '55' }, b.big && pc.btnBig]}
          onPress={() => onAction(b.action)}
          activeOpacity={0.8}
        >
          <Ionicons name={b.icon as any} size={b.big ? 24 : 20} color={b.color} />
          <Text style={[pc.btnText, { color: b.color }, b.big && pc.btnTextBig]}>{b.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const pc = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20,
    borderWidth: 1.5, borderColor: COLORS.bg3,
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8,
  },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 12, borderWidth: 1,
  },
  statusEmoji: { fontSize: 14 },
  statusLabel: { fontSize: 12, fontWeight: '700' },
  patientName: { fontSize: 28, fontWeight: '900', color: COLORS.esp, marginBottom: 4 },
  serviceName: { fontSize: 15, color: COLORS.wal, marginBottom: 2 },
  phone:       { fontSize: 12, color: '#999', marginBottom: 12 },

  timerRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 14 },
  timerCell:     { alignItems: 'center', backgroundColor: COLORS.bg2, borderRadius: 10, padding: 10, minWidth: 72, gap: 2, borderWidth: 1, borderColor: COLORS.bg3 },
  timerCellUrgent: { backgroundColor: '#FDEDEC', borderColor: '#F1948A' },
  timerLabel:    { fontSize: 9, color: COLORS.wal, letterSpacing: 0.5, fontWeight: '600' },
  timerValue:    { fontSize: 14, fontWeight: '800', color: COLORS.esp },

  btnGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  btn:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, flex: 1, minWidth: 120 },
  btnBig:     { flex: 2, paddingVertical: 16 },
  btnText:    { fontSize: 14, fontWeight: '700' },
  btnTextBig: { fontSize: 16 },
  doneRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  doneText:   { fontSize: 15, color: '#1E8449', fontWeight: '600' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  loadingText:{ fontSize: 13, color: COLORS.wal, fontStyle: 'italic' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ClinicRoomScreen() {
  const router    = useRouter();
  const params    = useLocalSearchParams<{ roomId?: string }>();
  const clinic    = useClinic();
  const { colors } = useAppTheme();
  const tick      = useTick(10_000);
  const [selectedRoom,    setSelectedRoom]    = useState<string | null>(params.roomId ?? null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Role guard — patient nesmie vidieť clinic screens
  if (!clinic.loading && clinic.clinicRole === null) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.esp }} edges={['top', 'bottom']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🔒</Text>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 8 }}>Prístup zamietnutý</Text>
          <Text style={{ fontSize: 13, color: COLORS.sand, textAlign: 'center' }}>Táto obrazovka je dostupná len pre doktora a recepciu.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // When rooms load, auto-select first if none selected
  useEffect(() => {
    if (!selectedRoom && clinic.rooms.length > 0) {
      setSelectedRoom(clinic.rooms[0].id);
    }
  }, [clinic.rooms]);

  const currentRoom  = clinic.rooms.find(r => r.id === selectedRoom) ?? null;
  const roomPatients = clinic.appointments.filter(
    a => a.room_id === selectedRoom && a.clinic_status !== 'cancelled' && a.clinic_status !== 'no_show',
  );

  // Prioritize: in_chair > waiting > arrived > treatment_done > checkout > scheduled > late
  const ORDER: Record<string, number> = {
    in_chair: 0, waiting: 1, arrived: 2, treatment_done: 3,
    checkout: 4, scheduled: 5, late: 6, paid: 7,
  };
  const sorted = [...roomPatients].sort((a, b) =>
    (ORDER[a.clinic_status] ?? 9) - (ORDER[b.clinic_status] ?? 9),
  );

  // Unassigned (any room, in active state)
  const unassigned = clinic.appointments.filter(a =>
    !a.room_id && ['scheduled','arrived','waiting','late'].includes(a.clinic_status),
  );

  async function handleAction(appt: ClinicAppointment, action: string) {
    if (action === 'noshow') {
      Alert.alert('No-show', `Označiť ${appt.patient?.full_name ?? 'pacienta'} ako neprišiel?`, [
        { text: 'Zrušiť', style: 'cancel' },
        { text: 'No-show', style: 'destructive', onPress: async () => {
          setActionLoadingId(appt.id);
          await clinic.markNoShow(appt);
          setActionLoadingId(null);
        }},
      ]);
      return;
    }
    setActionLoadingId(appt.id);
    try {
      switch (action) {
        case 'arrived':  await clinic.markArrived(appt); break;
        case 'late':     await clinic.markLate(appt); break;
        case 'start':    await clinic.startTreatment(appt); break;
        case 'done':     await clinic.endTreatment(appt); break;
        case 'checkout': await clinic.prepareInvoice(appt); break;
        case 'paid':     await clinic.markPaid(appt); break;
        case 'help':     await clinic.needHelp(appt); break;
      }
    } finally {
      setActionLoadingId(null);
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerSub}>AMBULANCIA</Text>
          <Text style={s.headerTitle}>
            {currentRoom ? currentRoom.name : 'Kreslo'}
          </Text>
        </View>
        <TouchableOpacity onPress={clinic.refetch} style={s.refreshBtn} activeOpacity={0.8}>
          <Ionicons name="refresh" size={20} color={COLORS.cream} />
        </TouchableOpacity>
      </View>

      {/* Room picker */}
      {clinic.rooms.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.roomScroll} contentContainerStyle={s.roomRow}>
          {clinic.rooms.map(r => (
            <TouchableOpacity
              key={r.id}
              style={[s.roomTab, selectedRoom === r.id && { backgroundColor: r.color, borderColor: r.color }]}
              onPress={() => setSelectedRoom(r.id)}
              activeOpacity={0.8}
            >
              <View style={[s.roomDot, { backgroundColor: r.color }]} />
              <Text style={[s.roomTabText, selectedRoom === r.id && { color: '#fff' }]}>{r.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <ScrollView style={[s.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Patients in this room */}
        {sorted.length === 0 ? (
          <View style={s.emptyRoom}>
            <Text style={s.emptyIcon}>🦷</Text>
            <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
              {currentRoom ? `${currentRoom.name} je prázdne` : 'Žiadni pacienti'}
            </Text>
            <Text style={[s.emptySub, { color: colors.textSecondary }]}>Priraďte pacienta z čakárne nižšie</Text>
          </View>
        ) : (
          sorted.map(appt => (
            <PatientCard
              key={appt.id}
              appt={appt}
              onAction={(action) => handleAction(appt, action)}
              tick={tick}
              isLoading={actionLoadingId === appt.id}
              isDoctor={clinic.clinicRole === 'doctor'}
            />
          ))
        )}

        {/* Unassigned patients */}
        {unassigned.length > 0 && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>⏳ Čaká na priradenie ({unassigned.length})</Text>
            {unassigned.map(appt => {
              const cfg = CLINIC_STATUS_CFG[appt.clinic_status];
              return (
                <View key={appt.id} style={[s.waitCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                  <View style={[s.waitStatusDot, { backgroundColor: cfg.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.waitName, { color: colors.textPrimary }]}>{appt.patient?.full_name ?? 'Pacient'}</Text>
                    <Text style={[s.waitService, { color: colors.textSecondary }]}>
                      {appt.service?.emoji ?? '🦷'} {appt.service?.name ?? '—'} · {fmtTime(appt.appointment_date)}
                    </Text>
                  </View>
                  {selectedRoom && (
                    <TouchableOpacity
                      style={s.assignBtn}
                      onPress={() => clinic.assignRoom(appt, selectedRoom)}
                      activeOpacity={0.8}
                    >
                      <Text style={s.assignBtnText}>Sem →</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: COLORS.esp },
  scroll:  { flex: 1, backgroundColor: COLORS.bg2 },
  content: { padding: 14 },

  header: {
    backgroundColor: COLORS.esp,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  backBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  refreshBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerSub:  { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  headerTitle:{ fontSize: 18, fontWeight: '700', color: '#fff' },

  roomScroll:  { maxHeight: 46, backgroundColor: COLORS.esp },
  roomRow:     { paddingHorizontal: 12, paddingBottom: 10, gap: 8, flexDirection: 'row', alignItems: 'center' },
  roomTab:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(255,255,255,0.1)' },
  roomDot:     { width: 8, height: 8, borderRadius: 4 },
  roomTabText: { fontSize: 13, fontWeight: '600', color: COLORS.cream },

  emptyRoom: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon:  { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.esp, marginBottom: 6 },
  emptySub:   { fontSize: 13, color: COLORS.wal, textAlign: 'center' },

  section:      { marginTop: 16, marginBottom: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: COLORS.wal, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },

  waitCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1.5, borderColor: COLORS.bg3,
  },
  waitStatusDot: { width: 10, height: 10, borderRadius: 5 },
  waitName:      { fontSize: 14, fontWeight: '700', color: COLORS.esp },
  waitService:   { fontSize: 11, color: COLORS.wal, marginTop: 1 },
  assignBtn:     { backgroundColor: COLORS.esp, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  assignBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
});
