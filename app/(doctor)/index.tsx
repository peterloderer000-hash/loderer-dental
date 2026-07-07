import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { supabase } from '../../supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, GRADIENTS, SHADOWS, RADII, SPACING, TYPO } from '../../styles/theme';
import { useAppTheme } from '../../context/ThemeContext';
import { useAppointments, Appointment } from '../../hooks/useAppointments';
import { exportDailySchedule } from '../../utils/exportPDF';
import { ScreenWrapper } from '../../components/ScreenWrapper';
import { SkeletonList } from '../../components/Skeleton';
import { useNotifications } from '../../hooks/useNotifications';
import {
  getNextOpenDays, generateTimeSlotsForDay,
  SK_DAYS_SHORT, SK_MONTHS_SHORT, jsDayToDb, timeToMinutes
} from '../../utils/timeSlots';
import AsyncStorage from '@react-native-async-storage/async-storage';
import OnboardingTour, { getOnboardingKey } from '../../components/OnboardingTour';

type OpeningHour = { open_time: string; close_time: string };
type BookedSlot  = { start: number; end: number };

// ─── Doctor Reschedule Modal ──────────────────────────────────────────────────
function DoctorRescheduleModal({ visible, appointment, doctorId, onClose, onDone }: {
  visible: boolean; appointment: Appointment | null; doctorId: string;
  onClose: () => void; onDone: () => void;
}) {
  const { colors: rc } = useAppTheme();
  const [openingHoursMap, setOpeningHoursMap] = useState<Map<number, OpeningHour>>(new Map());
  const [bookedSlots,  setBookedSlots]  = useState<BookedSlot[]>([]);
  const [selDate, setSelDate] = useState<Date | null>(null);
  const [selTime, setSelTime] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const openDbDays = useMemo(() => new Set(openingHoursMap.keys()), [openingHoursMap]);
  const days       = useMemo(() => openDbDays.size > 0 ? getNextOpenDays(21, openDbDays) : [], [openDbDays]);

  const selectedDayHours = useMemo((): OpeningHour | null => {
    if (!selDate) return null;
    return openingHoursMap.get(jsDayToDb(selDate.getDay())) ?? null;
  }, [selDate, openingHoursMap]);

  const slots = useMemo(() => {
    if (!appointment?.service || !selectedDayHours) return [];
    return generateTimeSlotsForDay(
      appointment.service?.duration_minutes ?? 30,
      selectedDayHours.open_time,
      selectedDayHours.close_time,
    );
  }, [appointment, selectedDayHours]);

  function isSlotTaken(slotStart: string): boolean {
    if (!appointment?.service) return false;
    const sMin = timeToMinutes(slotStart);
    const eMin = sMin + appointment.service?.duration_minutes ?? 30;
    return bookedSlots.some(b => sMin < b.end && eMin > b.start);
  }

  useEffect(() => {
    if (!visible || !doctorId) return;
    setSelDate(null); setSelTime('');
    supabase.from('opening_hours')
      .select('day_of_week, open_time, close_time, is_closed')
      .eq('doctor_id', doctorId)
      .then(({ data: hours }) => {
        const map = new Map<number, OpeningHour>();
        (hours ?? []).forEach(h => {
          if (!h.is_closed && h.open_time && h.close_time)
            map.set(h.day_of_week, { open_time: h.open_time.slice(0,5), close_time: h.close_time.slice(0,5) });
        });
        if (map.size === 0) for (let d = 1; d <= 5; d++) map.set(d, { open_time: '08:00', close_time: '17:00' });
        setOpeningHoursMap(map);
      }).catch(() => {});
  }, [visible, doctorId]);

  useEffect(() => {
    if (!selDate || !appointment) { setBookedSlots([]); return; }
    setLoadingSlots(true);
    const dayStart = new Date(selDate); dayStart.setHours(0,0,0,0);
    const dayEnd   = new Date(selDate); dayEnd.setHours(23,59,59,999);
    supabase.from('appointments')
      .select('appointment_date, custom_duration_minutes, service:services(duration_minutes)')
      .eq('doctor_id', doctorId)
      .in('status', ['scheduled', 'pending'])
      .neq('id', appointment.id)
      .gte('appointment_date', dayStart.toISOString())
      .lte('appointment_date', dayEnd.toISOString())
      .then(({ data }) => {
        const bs: BookedSlot[] = (data ?? []).map((r: any) => {
          const d = new Date(r.appointment_date);
          const start = d.getHours() * 60 + d.getMinutes();
          const dur = r.custom_duration_minutes ?? r.service?.duration_minutes ?? 30;
          return { start, end: start + dur };
        });
        setBookedSlots(bs);
        setLoadingSlots(false);
      }).catch(() => {});
  }, [selDate, appointment, doctorId]);

  async function handleConfirm() {
    if (!selDate || !selTime || !appointment) return;
    setSaving(true);
    const [h, m] = selTime.split(':').map(Number);
    const dt = new Date(selDate); dt.setHours(h, m, 0, 0);
    const { error } = await supabase.from('appointments')
      .update({ appointment_date: dt.toISOString() })
      .eq('id', appointment.id);
    setSaving(false);
    if (error) { Alert.alert('Chyba', error.message); return; }
    const dateStr = dt.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' });
    Alert.alert('Termín presunutý ✓', `Nový čas: ${dateStr} o ${selTime}`);
    // Notifikuj pacienta o presune termínu
    supabase.from('notifications').insert({
      user_id:        appointment.patient_id,
      title:          '📅 Termín presunutý',
      body:           `Váš termín${appointment.service ? ` (${appointment.service.name})` : ''} bol presunutý na ${dateStr} o ${selTime}.`,
      type:           'info',
      appointment_id: appointment.id
    }).then(null, () => {});
    onDone(); onClose();
  }

  if (!appointment) return null;
  const dur = appointment.service?.duration_minutes ?? 30;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={rsStyles.overlay}>
        <TouchableOpacity style={{ flex: 0.3 }} activeOpacity={1} onPress={onClose} />
        <View style={[rsStyles.sheet, { backgroundColor: rc.cardBg }]}>
          <View style={rsStyles.handle} />
          <Text style={[rsStyles.title, { color: rc.textPrimary }]}>Presunúť termín</Text>
          <Text style={[rsStyles.subtitle, { color: rc.textSecondary }]}>
            {appointment.patient?.full_name ?? 'Pacient'} · {appointment.service?.name ?? 'Termín'}
          </Text>

          {/* Dátumy */}
          <Text style={[rsStyles.sectionLabel, { color: rc.textSecondary }]}>DÁTUM</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 2 }}>
              {days.map((d, i) => {
                const isSel = selDate?.toDateString() === d.toDateString();
                const dbDay = jsDayToDb(d.getDay());
                const oh    = openingHoursMap.get(dbDay);
                return (
                  <TouchableOpacity key={i} style={[rsStyles.dateCell, { backgroundColor: rc.bg3, borderColor: rc.bg3 }, isSel && rsStyles.dateCellSel]}
                    onPress={() => { setSelDate(d); setSelTime(''); }} activeOpacity={0.8}>
                    <Text style={[rsStyles.dateName, { color: rc.textSecondary }, isSel && rsStyles.dateSelTxt]}>{SK_DAYS_SHORT[d.getDay()]}</Text>
                    <Text style={[rsStyles.dateNum,  { color: rc.textPrimary },   isSel && rsStyles.dateSelTxt]}>{d.getDate()}</Text>
                    <Text style={[rsStyles.dateMon,  { color: rc.textSecondary }, isSel && rsStyles.dateSelTxt]}>{SK_MONTHS_SHORT[d.getMonth()]}</Text>
                    {oh && <Text style={[rsStyles.dateHours, { color: rc.textSecondary }, isSel && { color: COLORS.sand }]}>{oh.open_time}–{oh.close_time}</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Sloty */}
          {selDate && (
            <>
              <Text style={[rsStyles.sectionLabel, { color: rc.textSecondary }]}>ČAS</Text>
              {loadingSlots
                ? <ActivityIndicator color={COLORS.wal} style={{ marginVertical: 10 }} />
                : <View style={rsStyles.slotsGrid}>
                    {slots.map(s => {
                      const taken = isSlotTaken(s.start);
                      const isSel = selTime === s.start;
                      return (
                        <TouchableOpacity key={s.start}
                          style={[rsStyles.slot, { backgroundColor: rc.cardBg, borderColor: rc.bg3 }, isSel && rsStyles.slotSel, taken && rsStyles.slotTaken]}
                          onPress={() => !taken && setSelTime(s.start)} disabled={taken} activeOpacity={0.8}>
                          <Text style={[rsStyles.slotText, { color: rc.textPrimary }, isSel && { color: '#F5F6F8' }, taken && { color: '#D0D4DC' }]}>
                            {s.start}
                          </Text>
                          {taken && <Text style={rsStyles.slotTakenLbl}>✗</Text>}
                        </TouchableOpacity>
                      );
                    })}
                  </View>}
            </>
          )}

          <View style={rsStyles.actions}>
            <TouchableOpacity style={[rsStyles.btnCancel, { borderColor: rc.bg3 }]} onPress={onClose} activeOpacity={0.8}>
              <Text style={[rsStyles.btnCancelText, { color: rc.textSecondary }]}>Zrušiť</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[rsStyles.btnConfirm, (!selDate || !selTime || saving) && { opacity: 0.4 }]}
              onPress={handleConfirm} disabled={!selDate || !selTime || saving} activeOpacity={0.85}>
              {saving
                ? <ActivityIndicator color="#F5F6F8" size="small" />
                : <Text style={rsStyles.btnConfirmText}>Potvrdiť presun</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const rsStyles = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: COLORS.cream, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 40, maxHeight: '82%' },
  handle:     { width: 38, height: 4, borderRadius: 2, backgroundColor: COLORS.bg3, alignSelf: 'center', marginBottom: 18 },
  title:      { fontSize: 20, fontWeight: '700', color: COLORS.esp, marginBottom: 4 },
  subtitle:   { fontSize: 12, color: COLORS.wal, marginBottom: 18 },
  sectionLabel: { fontSize: 9, letterSpacing: 2, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  dateCell:    { width: 62, alignItems: 'center', paddingVertical: 9, borderRadius: 2, backgroundColor: COLORS.bg2, borderWidth: 1.5, borderColor: COLORS.bg3 },
  dateCellSel: { backgroundColor: COLORS.esp, borderColor: COLORS.sand },
  dateName:    { fontSize: 8, fontWeight: '700', color: COLORS.wal, textTransform: 'uppercase', letterSpacing: 0.3 },
  dateNum:     { fontSize: 18, fontWeight: '700', color: COLORS.esp, marginVertical: 1 },
  dateMon:     { fontSize: 8, color: COLORS.wal, textTransform: 'uppercase' },
  dateHours:   { fontSize: 6, color: COLORS.wal, marginTop: 3, textAlign: 'center' },
  dateSelTxt:  { color: COLORS.cream },
  slotsGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  slot:        { width: '22%', alignItems: 'center', paddingVertical: 10, borderRadius: 2, backgroundColor: COLORS.cream, borderWidth: 1.5, borderColor: COLORS.bg3 },
  slotSel:     { backgroundColor: COLORS.esp, borderColor: COLORS.sand },
  slotTaken:   { backgroundColor: '#f5f5f5', borderColor: '#e8e8e8', opacity: 0.5 },
  slotText:    { fontSize: 13, fontWeight: '700', color: COLORS.esp },
  slotTakenLbl:{ fontSize: 9, color: '#D0D4DC' },
  actions:     { flexDirection: 'row', gap: 10 },
  btnCancel:   { flex: 1, paddingVertical: 14, borderRadius: 2, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.bg3 },
  btnCancelText:{ fontSize: 14, fontWeight: '600', color: COLORS.wal },
  btnConfirm:  { flex: 2, paddingVertical: 14, borderRadius: 2, alignItems: 'center', backgroundColor: COLORS.wal, justifyContent: 'center' },
  btnConfirmText: { fontSize: 14, fontWeight: '700', color: '#F5F6F8' }
});

// ─── Pomocné funkcie ──────────────────────────────────────────────────────────
function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
}
function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' });
}
function isToday(dateStr: string) {
  const d = new Date(dateStr); const t = new Date();
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
}

const STATUS_CONFIG = {
  pending:   { label: 'Čaká na schválenie', bg: '#FDF3E7', color: '#B87333', border: '#D0D4DC' },
  scheduled: { label: 'Naplánovaný',        bg: '#EBF5FB', color: '#1A5276', border: '#AED6F1' },
  arrived:   { label: '🟢 V čakárni',       bg: '#E8F8F5', color: '#0E6655', border: '#A2D9CE' },
  completed: { label: 'Dokončený',           bg: '#EDF7F3', color: '#2E7D5E', border: '#A3D4BE' },
  cancelled: { label: 'Zrušený',             bg: '#FDEDEC', color: '#922B21', border: '#F1948A' }
};

const StatusBadge = React.memo(function StatusBadge({ status }: { status: Appointment['status'] }) {
  const { dark } = useAppTheme();
  const c = STATUS_CONFIG[status] ?? STATUS_CONFIG.scheduled;
  return (
    <View style={[styles.badge, { backgroundColor: dark ? c.color + '22' : c.bg, borderColor: c.border }]}>
      <Text style={[styles.badgeText, { color: c.color }]}>{c.label}</Text>
    </View>
  );
});

const AppointmentCard = React.memo(function AppointmentCard({ item, onComplete, onCancel, onDentalChart, onPassport, onViewPatient, onReschedule, onApproveRequest }: {
  item: Appointment; onComplete: () => void; onCancel: () => void; onDentalChart: () => void; onPassport: () => void; onViewPatient: () => void; onReschedule: () => void; onApproveRequest?: () => void;
}) {
  const { colors: ac, dark } = useAppTheme();
  const adyn = {
    card: { backgroundColor: ac.cardBg, borderColor: ac.bg3 },
    text: { color: ac.textPrimary },
    sub:  { color: ac.textSecondary }
  };
  // Dark-mode aware button backgrounds
  const db = (lightBg: string, accent: string) => dark ? { backgroundColor: accent + '22', borderColor: accent + '44' } : { backgroundColor: lightBg };

  const accentColor = item.is_urgent ? COLORS.error
    : item.status === 'arrived'   ? COLORS.success
    : item.status === 'completed' ? COLORS.successBg
    : item.status === 'cancelled' ? COLORS.error
    : item.status === 'pending'   ? COLORS.warning
    : COLORS.gold;

  return (
    <View style={[styles.card, adyn.card, item.is_urgent && styles.cardUrgent]}>
      <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
      {item.is_urgent && (
        <View style={[styles.urgentBanner, dark && { backgroundColor: '#4A1010' }]}>
          <Text style={styles.urgentBannerText}>🚨 URGENTNÉ</Text>
        </View>
      )}
      <TouchableOpacity style={styles.cardHeader} onPress={onViewPatient} activeOpacity={0.75}>
        <View style={styles.timeBox}>
          <Text style={styles.timeText}>{formatTime(item.appointment_date)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.patientName, adyn.text]}>{item.patient?.full_name ?? 'Neznámy pacient'}</Text>
          {item.family_member_name ? (
            <Text style={styles.familyTag}>👶 Pre: {item.family_member_name}</Text>
          ) : item.patient?.phone_number ? (
            <Text style={styles.patientPhone}>{item.patient?.phone_number}</Text>
          ) : null}
        </View>
        <StatusBadge status={item.status} />
        <Ionicons name="chevron-forward" size={13} color="#D0D4DC" style={{ marginLeft: 4 }} />
      </TouchableOpacity>
      {item.service && (
        <View style={styles.notesRow}>
          <Text style={{ fontSize: 13 }}>{item.service.emoji ?? '🦷'}</Text>
          <Text style={[styles.notesText, adyn.sub]}>{item.service?.name}</Text>
        </View>
      )}
      {item.notes ? (
        <View style={styles.notesRow}>
          <Ionicons name="document-text-outline" size={13} color={COLORS.wal} />
          <Text style={[styles.notesText, adyn.sub]}>{item.notes}</Text>
        </View>
      ) : null}
      {/* Hodnotenie pacienta */}
      {item.status === 'completed' && item.patient_rating ? (
        <View style={[styles.ratingRow, dark && { backgroundColor: '#2D1F10' }]}>
          {[1,2,3,4,5].map(n => (
            <Ionicons key={n}
              name={n <= item.patient_rating! ? 'star' : 'star-outline'}
              size={13} color="#B8ACA0" />
          ))}
          <Text style={styles.ratingLabel}>
            {['','Veľmi zlý','Zlý','Dobrý','Veľmi dobrý','Výborný!'][item.patient_rating]}
          </Text>
        </View>
      ) : item.status === 'completed' ? (
        <View style={[styles.ratingRow, dark && { backgroundColor: '#2D1F10' }]}>
          {[1,2,3,4,5].map(n => (
            <Ionicons key={n} name="star-outline" size={13} color="#D0D4DC" />
          ))}
          <Text style={[styles.ratingLabel, { color: '#D0D4DC' }]}>Bez hodnotenia</Text>
        </View>
      ) : null}
      <View style={styles.actionsGrid}>
        {item.status === 'arrived' && (
          <View style={[styles.actionsRow, { marginBottom: 6 }]}>
            <TouchableOpacity style={[styles.btnComplete, { flex: 1 }, db('#E8F8F5', '#0E6655')]} onPress={onComplete} activeOpacity={0.8}>
              <Ionicons name="walk-outline" size={15} color="#0E6655" />
              <Text style={[styles.btnCompleteText, { color: '#0E6655' }]}>Zavolať dnu ✓</Text>
            </TouchableOpacity>
          </View>
        )}
        {item.status === 'scheduled' && (
          <>
            <View style={styles.actionsRow}>
              <TouchableOpacity style={[styles.btnComplete, db('#EDF7F3', '#2E7D5E')]} onPress={onComplete} activeOpacity={0.8}>
                <Ionicons name="checkmark-circle-outline" size={15} color="#2E7D5E" />
                <Text style={styles.btnCompleteText}>Dokončiť</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnCancel, db('#FDEDEC', '#922B21')]} onPress={onCancel} activeOpacity={0.8}>
                <Ionicons name="close-circle-outline" size={15} color="#922B21" />
                <Text style={styles.btnCancelText}>Zrušiť</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.actionsRow}>
              <TouchableOpacity style={[styles.btnReschedule, db('#EBF5FB', '#1A5276')]} onPress={onReschedule} activeOpacity={0.8}>
                <Ionicons name="calendar-outline" size={15} color="#1A5276" />
                <Text style={styles.btnRescheduleText}>Presunúť termín</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
        {item.status === 'pending' && onApproveRequest && (
          <TouchableOpacity style={[styles.btnReschedule, { flex: 1 }, db('#EBF5FB', '#1A5276')]} onPress={onApproveRequest} activeOpacity={0.8}>
            <Ionicons name="shield-checkmark-outline" size={15} color="#1A5276" />
            <Text style={styles.btnRescheduleText}>Vybaviť žiadosť</Text>
          </TouchableOpacity>
        )}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.btnChart, db('#D0D4DC', COLORS.wal)]} onPress={onDentalChart} activeOpacity={0.8}>
            <Ionicons name="clipboard-outline" size={15} color={COLORS.wal} />
            <Text style={styles.btnChartText}>Zubná karta</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnPassport, db('#EBF5FB', '#1A5276')]} onPress={onPassport} activeOpacity={0.8}>
            <Ionicons name="document-text-outline" size={15} color="#1A5276" />
            <Text style={styles.btnPassportText}>Anamnéza</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

type Filter = 'today' | 'upcoming' | 'all';

// ─── Modal: schválenie žiadosti pacienta ─────────────────────────────────────
function ApproveModal({ visible, appointment, onClose, onApprove, onReject, saving }: {
  visible: boolean;
  appointment: Appointment | null;
  onClose: () => void;
  onApprove: (durationMinutes: number) => void;
  onReject: () => void;
  saving: boolean;
}) {
  const { colors: mc } = useAppTheme();
  const defaultDur = appointment?.service?.duration_minutes ?? 30;
  const [selectedDur, setSelectedDur] = useState(defaultDur);
  const [customText,  setCustomText]  = useState('');

  React.useEffect(() => {
    if (visible && appointment) {
      const d = appointment.service?.duration_minutes ?? 30;
      setSelectedDur(d);
      setCustomText('');
    }
  }, [visible, appointment]);

  if (!appointment) return null;
  const d = new Date(appointment.appointment_date);
  const dateLabel = d.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' });
  const timeLabel = d.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: mc.cardBg }]}>
          <View style={styles.sheetHandle} />
          <Text style={[styles.sheetTitle, { color: mc.textPrimary }]}>Schváliť termín</Text>
          <Text style={[styles.sheetSub, { color: mc.textSecondary }]}>{appointment.patient?.full_name ?? 'Pacient'}</Text>

          {/* Info o termíne */}
          <View style={[aStyles.infoBox, { backgroundColor: mc.bg3 }]}>
            {appointment.service && (
              <Text style={[aStyles.infoRow, { color: mc.textPrimary }]}>
                {appointment.service.emoji ?? '🦷'} {appointment.service.name}
              </Text>
            )}
            <Text style={[aStyles.infoRow, { color: mc.textPrimary }]}>📅 {dateLabel} o {timeLabel}</Text>
            {appointment.notes ? <Text style={[aStyles.infoRow, { color: mc.textPrimary }]}>📝 {appointment.notes}</Text> : null}
          </View>

          {/* Dĺžka ošetrenia */}
          <Text style={[styles.sheetLabel, { color: mc.textSecondary }]}>DĹŽKA OŠETRENIA</Text>
          <View style={aStyles.chipRow}>
            {[15, 30, 45, 60, 90, 120].map((min) => (
              <TouchableOpacity
                key={min}
                style={[aStyles.chip, { backgroundColor: mc.cardBg, borderColor: mc.bg3 }, selectedDur === min && aStyles.chipActive]}
                onPress={() => { setSelectedDur(min); setCustomText(''); }}
                activeOpacity={0.75}
              >
                <Text style={[aStyles.chipText, { color: mc.textSecondary }, selectedDur === min && aStyles.chipTextActive]}>
                  {min < 60 ? `${min} min` : `${min / 60} hod`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={[aStyles.customRow, { backgroundColor: mc.cardBg, borderColor: mc.bg3 }]}>
            <Ionicons name="time-outline" size={15} color={COLORS.wal} />
            <TextInput
              style={[aStyles.customInput, { color: mc.textPrimary }]}
              placeholder={`Vlastná (min) · teraz: ${selectedDur} min`}
              placeholderTextColor={mc.textSecondary}
              keyboardType="numeric"
              value={customText}
              onChangeText={(t) => {
                setCustomText(t);
                const n = parseInt(t, 10);
                if (!isNaN(n) && n > 0 && n <= 480) setSelectedDur(n);
              }}
              maxLength={3}
            />
          </View>

          {/* Tlačidlá */}
          <View style={aStyles.btnRow}>
            <TouchableOpacity
              style={[aStyles.btnReject, saving && { opacity: 0.5 }]}
              onPress={onReject}
              disabled={saving}
              activeOpacity={0.8}
            >
              <Ionicons name="close-circle-outline" size={16} color="#922B21" />
              <Text style={aStyles.btnRejectText}>Odmietnuť</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[aStyles.btnApprove, saving && { opacity: 0.5 }]}
              onPress={() => onApprove(selectedDur)}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#F5F6F8" size="small" />
                : <>
                    <Ionicons name="checkmark-circle-outline" size={16} color="#F5F6F8" />
                    <Text style={aStyles.btnApproveText}>Schváliť</Text>
                  </>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const aStyles = StyleSheet.create({
  infoBox:  { backgroundColor: COLORS.bg2, borderRadius: 2, padding: 12, marginBottom: 14, gap: 4 },
  infoRow:  { fontSize: 13, color: COLORS.esp, fontWeight: '500', lineHeight: 20 },
  chipRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip:     { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 4, backgroundColor: COLORS.cream, borderWidth: 1.5, borderColor: COLORS.bg3 },
  chipActive:    { backgroundColor: COLORS.esp, borderColor: COLORS.sand },
  chipText:      { fontSize: 12, fontWeight: '600', color: COLORS.wal },
  chipTextActive:{ color: COLORS.cream },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.cream, borderRadius: 2, borderWidth: 1.5, borderColor: COLORS.bg3, paddingHorizontal: 12, marginBottom: 16 },
  customInput: { flex: 1, paddingVertical: 10, fontSize: 13, color: COLORS.esp },
  btnRow:    { flexDirection: 'row', gap: 10 },
  btnReject: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 2, backgroundColor: '#FDEDEC', borderWidth: 1.5, borderColor: '#F1948A' },
  btnRejectText: { fontSize: 13, fontWeight: '700', color: '#922B21' },
  btnApprove: { flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 2, backgroundColor: '#2E7D5E' },
  btnApproveText: { fontSize: 13, fontWeight: '700', color: '#F5F6F8' }
});

// ─── Šablóny pokynov po ošetrení ─────────────────────────────────────────────
const CARE_TEMPLATES = [
  { label: 'Plomba',    icon: '🦷', text: 'Nejedzte 2 hodiny po ošetrení. Vyhýbajte sa tvrdým a lepivým jedlám 24 hodín. Pri bolesti môžete užiť ibuprofén.' },
  { label: 'Extrakcia', icon: '🩸', text: 'Hryzajte gázku 30 minút. Nejedzte 3 hodiny, nepite alkohol 24 hodín. Nedotýkajte sa rany jazykom. Pri silnej bolesti kontaktujte ordinaciu.' },
  { label: 'Čistenie',  icon: '🪥', text: 'Ďasná môžu byť citlivé 24–48 hodín. Čistite zuby jemne, používajte ústnu vodu. Pri krvácení kontaktujte ordinaciu.' },
  { label: 'Korunka',   icon: '👑', text: 'Vyhýbajte sa tvrdým jedlám 2 hodiny. Korunku čistite dentálnou niťou. Pri uvoľnení okamžite kontaktujte ordinaciu.' },
  { label: 'Bielenie',  icon: '✨', text: 'Vyhnite sa farebnému jedlu a nápojom 48 hodín (káva, čaj, červené víno). Nepoužívajte farebnú pastu na zuby 24 hodín.' },
];

// ─── Modal: klinické poznámky + pokyny po ošetrení ─────────────────────────────
function CompleteModal({ visible, patientName, onClose, onConfirm, saving }: {
  visible: boolean; patientName: string; onClose: () => void;
  onConfirm: (notes: string, careInstructions: string) => void; saving: boolean;
}) {
  const { colors: cm, dark: cmDark } = useAppTheme();
  const [notes, setNotes]         = useState('');
  const [careInstr, setCareInstr] = useState('');
  const [showCare, setShowCare]   = useState(false);

  React.useEffect(() => {
    if (visible) { setNotes(''); setCareInstr(''); setShowCare(false); }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.overlay}>
          <ScrollView style={{ width: '100%' }} contentContainerStyle={{ justifyContent: 'flex-end', flexGrow: 1 }}
            keyboardShouldPersistTaps="handled">
            <View style={[styles.sheet, { backgroundColor: cm.cardBg }]}>
              <View style={styles.sheetHandle} />
              <Text style={[styles.sheetTitle, { color: cm.textPrimary }]}>Dokončiť termín</Text>
              <Text style={[styles.sheetSub, { color: cm.textSecondary }]}>{patientName}</Text>

              {/* Klinické poznámky */}
              <Text style={[styles.sheetLabel, { color: cm.textSecondary }]}>KLINICKÉ POZNÁMKY (interné)</Text>
              <TextInput
                style={[styles.sheetInput, { color: cm.textPrimary, backgroundColor: cm.bg3 }]}
                placeholder="Čo sa robilo, ďalší postup..."
                placeholderTextColor={cm.textSecondary}
                value={notes}
                onChangeText={setNotes}
                multiline numberOfLines={3}
                textAlignVertical="top"
              />

              {/* Pokyny po ošetrení */}
              <TouchableOpacity
                style={cmStyles.careToggle}
                onPress={() => setShowCare(!showCare)}
                activeOpacity={0.8}
              >
                <Ionicons name={showCare ? 'chevron-down' : 'chevron-forward'} size={14} color="#1A5276" />
                <Text style={cmStyles.careToggleText}>Pokyny po ošetrení (pre pacienta)</Text>
                {careInstr.length > 0 && (
                  <View style={cmStyles.careFilledDot} />
                )}
              </TouchableOpacity>

              {showCare && (
                <View style={cmStyles.careBox}>
                  {/* Šablóny */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    contentContainerStyle={cmStyles.templatesRow}>
                    {CARE_TEMPLATES.map((t) => (
                      <TouchableOpacity key={t.label} style={[cmStyles.templateChip, { backgroundColor: cm.cardBg, borderColor: cmDark ? cm.bg3 : '#AED6F1' }]}
                        onPress={() => setCareInstr(t.text)} activeOpacity={0.8}>
                        <Text>{t.icon}</Text>
                        <Text style={cmStyles.templateLabel}>{t.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TextInput
                    style={[styles.sheetInput, { marginTop: 8, marginBottom: 0, color: cm.textPrimary, backgroundColor: cm.bg3 }]}
                    placeholder="Pokyny, lieky, obmedzenia po ošetrení..."
                    placeholderTextColor={cm.textSecondary}
                    value={careInstr}
                    onChangeText={setCareInstr}
                    multiline numberOfLines={3}
                    textAlignVertical="top"
                  />
                </View>
              )}

              <View style={styles.sheetActions}>
                <TouchableOpacity style={styles.sheetBtnCancel} onPress={onClose} activeOpacity={0.8}>
                  <Text style={styles.sheetBtnCancelText}>Zrušiť</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sheetBtnConfirm, saving && { opacity: 0.6 }]}
                  onPress={() => onConfirm(notes, careInstr)}
                  disabled={saving}
                  activeOpacity={0.85}
                >
                  {saving
                    ? <ActivityIndicator color="#F5F6F8" size="small" />
                    : <Text style={styles.sheetBtnConfirmText}>✓ Dokončiť</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const cmStyles = StyleSheet.create({
  careToggle:    { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 10, marginBottom: 4 },
  careToggleText:{ fontSize: 12, fontWeight: '700', color: '#1A5276', flex: 1 },
  careFilledDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#52C896' },
  careBox:       { backgroundColor: '#EBF5FB', borderRadius: 2, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#AED6F1' },
  templatesRow:  { gap: 8, paddingBottom: 4 },
  templateChip:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 4, backgroundColor: COLORS.cream, borderWidth: 1.5, borderColor: '#AED6F1' },
  templateLabel: { fontSize: 11, fontWeight: '700', color: '#1A5276' }
});

export default function DoctorHome() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  const navigation = useNavigation();
  const { appointments, loading, refetch, updateStatus, approvePending } = useAppointments('doctor');
  const { unreadCount: notifCount } = useNotifications();
  const [filter, setFilter] = useState<Filter>('today');
  const [doctorName, setDoctorName] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [completingItem, setCompletingItem] = useState<Appointment | null>(null);
  const [completeSaving, setCompleteSaving] = useState(false);
  const [rescheduleAppt, setRescheduleAppt] = useState<Appointment | null>(null);
  const [approvingAppt,  setApprovingAppt]  = useState<Appointment | null>(null);
  const [approveSaving,  setApproveSaving]  = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [doctorId, setDoctorId] = useState('');
  const [exporting,  setExporting]  = useState(false);
  const [msgCount,      setMsgCount]      = useState(0);
  const [wlCount,       setWlCount]       = useState(0);
  const [recallCount,   setRecallCount]   = useState(0);
  const [consentCount,  setConsentCount]  = useState(0);
  const [birthdays,     setBirthdays]     = useState<{ id: string; name: string; daysUntil: number; phone: string | null }[]>([]);
  const [sendingReminders, setSendingReminders] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(getOnboardingKey('doctor')).then(v => { if (!v) setShowTour(true); }).catch(() => {});
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    refetch();
    setTimeout(() => setRefreshing(false), 800);
  }, [refetch]);

  async function handleSignOut() {
    Alert.alert('Odhlásiť sa', 'Naozaj sa chceš odhlásiť?', [
      { text: 'Nie', style: 'cancel' },
      { text: 'Áno', style: 'destructive', onPress: async () => {
        await supabase.auth.signOut();
        if (Platform.OS === 'web') { window.location.href = '/'; } else { router.replace('/'); }
      }},
    ]);
  }

  const loadMsgCount = useCallback(async (uid: string) => {
    const { count } = await supabase.from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('receiver_id', uid)
      .eq('is_read', false);
    setMsgCount(count ?? 0);
  }, []);

  const loadWlCount = useCallback(async () => {
    const { count } = await supabase.from('waiting_list')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'waiting');
    setWlCount(count ?? 0);
  }, []);

  const loadRecallCount = useCallback(async () => {
    const { data } = await supabase
      .from('appointments')
      .select('patient_id, appointment_date')
      .eq('status', 'completed')
      .order('appointment_date', { ascending: false });
    if (!data) return;
    const map = new Map<string, Date>();
    data.forEach((a: any) => {
      const d = new Date(a.appointment_date);
      if (!map.has(a.patient_id) || d > map.get(a.patient_id)!) map.set(a.patient_id, d);
    });
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 6);
    const count = [...map.values()].filter((d) => d < cutoff).length;
    setRecallCount(count);
  }, []);

  const loadConsentCount = useCallback(async (uid: string) => {
    const { data: forms } = await supabase
      .from('consent_forms').select('id').eq('doctor_id', uid);
    if (!forms || forms.length === 0) { setConsentCount(0); return; }
    const ids = forms.map((f: any) => f.id);
    const { count } = await supabase.from('patient_consents')
      .select('*', { count: 'exact', head: true })
      .in('form_id', ids)
      .eq('status', 'pending');
    setConsentCount(count ?? 0);
  }, []);

  const loadBirthdays = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, phone_number, date_of_birth')
      .eq('role', 'patient')
      .not('date_of_birth', 'is', null)
      .limit(500);
    if (error || !data) return;
    const now = new Date();
    const upcoming = (data as { id: string; full_name: string | null; phone_number: string | null; date_of_birth: string }[])
      .map((p) => {
        const dob  = new Date(p.date_of_birth);
        let next   = new Date(now.getFullYear(), dob.getMonth(), dob.getDate());
        if (next < now) next = new Date(now.getFullYear() + 1, dob.getMonth(), dob.getDate());
        return { id: p.id, name: p.full_name ?? 'Pacient', phone: p.phone_number ?? null, daysUntil: Math.floor((next.getTime() - now.getTime()) / 86400000) };
      })
      .filter((p) => p.daysUntil <= 14)
      .sort((a, b) => a.daysUntil - b.daysUntil);
    setBirthdays(upcoming);
  }, []);

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setDoctorId(user.id);
      supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
        .then(({ data }) => { if (data?.full_name) setDoctorName(data.full_name); });
      loadMsgCount(user.id);
      loadWlCount();
      loadRecallCount();
      loadConsentCount(user.id);
      loadBirthdays();
    }).catch(() => {});
  }, [loadMsgCount, loadWlCount, loadRecallCount, loadBirthdays]);

  useFocusEffect(useCallback(() => {
    refetch();
    loadWlCount();
    loadRecallCount();
    loadBirthdays();
    if (doctorId) { loadMsgCount(doctorId); loadConsentCount(doctorId); }
  }, [refetch, doctorId, loadMsgCount, loadWlCount, loadRecallCount, loadConsentCount, loadBirthdays]));

  async function handleComplete(item: Appointment) {
    setCompletingItem(item);
  }

  async function confirmComplete(notes: string, careInstructions: string) {
    if (!completingItem) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCompleteSaving(true);
    const saved = completingItem;
    const err = await updateStatus(saved.id, 'completed', notes, careInstructions);
    setCompleteSaving(false);
    setCompletingItem(null);
    if (err) { Alert.alert('Chyba', err.message); return; }

    // Notifikácia pacientovi — pokyny po ošetrení
    const svcName = saved.service?.name ?? 'ošetrenie';
    if (careInstructions.trim()) {
      supabase.from('notifications').insert({
        user_id:        saved.patient_id,
        title:          '📋 Pokyny po ošetrení',
        body:           `Po dnešnom ${svcName}: ${careInstructions.trim().slice(0, 120)}${careInstructions.length > 120 ? '…' : ''}`,
        type:           'info',
        appointment_id: saved.id
      }).then(null, () => {});
    } else {
      supabase.from('notifications').insert({
        user_id:        saved.patient_id,
        title:          `✅ Ošetrenie dokončené`,
        body:           `Dnešné ${svcName} bolo úspešne dokončené. Ďakujeme za vašu návštevu!`,
        type:           'success',
        appointment_id: saved.id
      }).then(null, () => {});
    }

    // Deň-po check-in notifikácia (o 24h)
    supabase.from('notifications').insert({
      user_id:        saved.patient_id,
      title:          '😊 Ako sa cítite?',
      body:           `Včera ste boli u nás na ${svcName}. Ak máte otázky alebo ťažkosti, neváhajte nás kontaktovať.`,
      type:           'info',
      appointment_id: saved.id,
      created_at:     new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }).then(null, () => {});

    // Ponúkni naplánovanie nasledujúceho termínu
    Alert.alert(
      'Naplánovať ďalší termín?',
      `Chcete pre ${saved.patient?.full_name ?? 'pacienta'} ihneď naplánovať ďalší termín?`,
      [
        { text: 'Nie', style: 'cancel' },
        { text: '📅 Naplánovať', onPress: () => router.push({
          pathname: '/(doctor)/add-appointment',
          params: { patientId: saved.patient_id, patientName: saved.patient?.full_name ?? '' }
        }) },
      ]
    );
  }

  async function handleApprove(durationMinutes: number) {
    if (!approvingAppt) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setApproveSaving(true);
    const saved = approvingAppt;
    const err = await approvePending(saved.id, durationMinutes);
    if (!err) {
      const d       = new Date(saved.appointment_date);
      const timeStr = d.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
      const dateStr = d.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' });
      supabase.from('notifications').insert({
        user_id:        saved.patient_id,
        title:          '✅ Termín potvrdený!',
        body:           `Váš termín${saved.service ? ` (${saved.service.name})` : ''} bol potvrdený na ${dateStr} o ${timeStr}. Tešíme sa na vás!`,
        type:           'success',
        appointment_id: saved.id
      }).then(({ error }) => { if (error) console.warn('Approve notif error:', error.message); }).catch(() => {});
    }
    setApproveSaving(false);
    setApprovingAppt(null);
    if (err) Alert.alert('Chyba', err.message);
  }

  async function handleReject() {
    if (!approvingAppt) return;
    const saved = approvingAppt;
    Alert.alert('Odmietnuť žiadosť', 'Naozaj chcete odmietnuť túto žiadosť pacienta?', [
      { text: 'Nie', style: 'cancel' },
      {
        text: 'Odmietnuť', style: 'destructive',
        onPress: async () => {
          const err = await updateStatus(saved.id, 'cancelled');
          setApprovingAppt(null);
          if (err) { Alert.alert('Chyba', err.message); return; }
          // Notifikuj pacienta o odmietnutí
          supabase.from('notifications').insert({
            user_id:        saved.patient_id,
            title:          '❌ Žiadosť o termín odmietnutá',
            body:           `Vaša žiadosť o termín${saved.service ? ` (${saved.service.name})` : ''} nebola schválená. Skúste iný termín alebo nás kontaktujte.`,
            type:           'warning',
            appointment_id: saved.id
          }).then(({ error }) => { if (error) console.warn('Reject notif error:', error.message); }).catch(() => {});
        }
      },
    ]);
  }

  async function handleCancel(id: string) {
    Alert.alert('Zrušiť termín', 'Chcete zrušiť tento termín?', [
      { text: 'Nie', style: 'cancel' },
      {
        text: 'Áno, zrušiť', style: 'destructive',
        onPress: async () => { const err = await updateStatus(id, 'cancelled'); if (err) Alert.alert('Chyba', err.message); }
      },
    ]);
  }

  async function handleSendTomorrowReminders() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const dayEnd = new Date(tomorrow);
    dayEnd.setHours(23, 59, 59, 999);

    const tomorrowAppts = appointments.filter((a) => {
      const d = new Date(a.appointment_date);
      return a.status === 'scheduled' && d >= tomorrow && d <= dayEnd;
    });

    if (tomorrowAppts.length === 0) {
      Alert.alert('Žiadne termíny', 'Zajtra nie sú žiadne naplánované termíny.');
      return;
    }

    Alert.alert(
      'Poslať pripomienky',
      `Odoslať pripomienku ${tomorrowAppts.length} pacientom s termínom zajtra?`,
      [
        { text: 'Nie', style: 'cancel' },
        { text: 'Odoslať', onPress: async () => {
          setSendingReminders(true);
          try {
            const notifs = tomorrowAppts.map((a) => {
              const timeStr = new Date(a.appointment_date).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
              return {
                user_id:        a.patient_id,
                title:          '📅 Pripomienka termínu',
                body:           `Zajtra máte termín o ${timeStr}${a.service ? ` — ${a.service.name}` : ''}. Tešíme sa na vás!`,
                type:           'info' as const,
                appointment_id: a.id
              };
            });
            const { error } = await supabase.from('notifications').insert(notifs);
            if (error) throw error;
            Alert.alert('✅ Odoslané!', `Pripomienka bola odoslaná ${tomorrowAppts.length} pacientom.`);
          } catch (err: any) {
            Alert.alert('Chyba', err.message);
          } finally {
            setSendingReminders(false);
          }
        }},
      ],
    );
  }

  async function handleExportDay() {
    setExporting(true);
    try {
      await exportDailySchedule(doctorName || 'MDDr. Loderer', new Date(), appointments);
    } finally {
      setExporting(false);
    }
  }

  const arrivedAppts = useMemo(() =>
    appointments.filter((a) => a.status === 'arrived' && isToday(a.appointment_date))
      .sort((a, b) => new Date(a.arrived_at ?? a.appointment_date).getTime() - new Date(b.arrived_at ?? b.appointment_date).getTime()),
  [appointments]);

  const filtered = useMemo(() => {
    const now = new Date();
    const q = searchQuery.trim().toLowerCase();
    return appointments.filter((a) => {
      // Filter podľa tab
      const d = new Date(a.appointment_date);
      if (filter === 'today'    && !(isToday(a.appointment_date) && (a.status === 'scheduled' || a.status === 'arrived'))) return false;
      if (filter === 'upcoming' && !(d > now && a.status === 'scheduled')) return false;
      // Filter podľa vyhľadávania
      if (q) {
        const name  = (a.patient?.full_name    ?? '').toLowerCase();
        const phone = (a.patient?.phone_number ?? '').toLowerCase();
        const notes = (a.notes                 ?? '').toLowerCase();
        if (!name.includes(q) && !phone.includes(q) && !notes.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      // Urgentné žiadosti vždy hore
      if (a.is_urgent && !b.is_urgent) return -1;
      if (!a.is_urgent && b.is_urgent) return 1;
      return 0;
    });
  }, [appointments, filter, searchQuery]);

  const grouped = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    filtered.forEach((a) => {
      const key = formatDate(a.appointment_date);
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });
    return map;
  }, [filtered]);

  const pendingAppts  = useMemo(() =>
    appointments.filter((a) => a.status === 'pending')
      .sort((a, b) => (b.is_urgent ? 1 : 0) - (a.is_urgent ? 1 : 0)),
  [appointments]);
  const todayCount      = appointments.filter((a) => isToday(a.appointment_date) && (a.status === 'scheduled' || a.status === 'arrived')).length;
  const upcomingCount   = appointments.filter((a) => new Date(a.appointment_date) > new Date() && a.status === 'scheduled').length;
  const completedToday  = appointments.filter((a) => isToday(a.appointment_date) && a.status === 'completed').length;

  // Ďalší naplánovaný termín (najbližší v čase)
  const nextAppt = useMemo(() => {
    const now = new Date();
    return appointments
      .filter(a => a.status === 'scheduled' && new Date(a.appointment_date) > now)
      .sort((a, b) => new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime())[0] ?? null;
  }, [appointments]);

  const nextApptLabel = useMemo(() => {
    if (!nextAppt) return null;
    const diff    = Math.round((new Date(nextAppt.appointment_date).getTime() - Date.now()) / 60000);
    const name    = nextAppt.patient?.full_name ?? 'Pacient';
    const timeStr = formatTime(nextAppt.appointment_date);
    if (diff <= 0)  return `🔔 Práve prebieha: ${name}`;
    if (diff < 60)  return `⏱ Ďalší pacient za ${diff} min — ${name}`;
    if (isToday(nextAppt.appointment_date)) return `📅 Dnes o ${timeStr} — ${name}`;
    const dateStr = new Date(nextAppt.appointment_date).toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' });
    return `📅 ${dateStr} o ${timeStr} — ${name}`;
  }, [nextAppt]);

  const dyn = {
    bg:   { backgroundColor: colors.bg2 },
    card: { backgroundColor: colors.cardBg, borderColor: colors.bg3 },
    text: { color: colors.textPrimary },
    sub:  { color: colors.textSecondary }
  };

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Dobré ráno' : hour < 18 ? 'Dobrý deň' : 'Dobrý večer';
  const todayDateStr = now.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' });
  const lastName = doctorName ? (doctorName.split(' ').pop() ?? doctorName) : 'Loderer';

  if (showTour) return <OnboardingTour role="doctor" onFinish={() => setShowTour(false)} />;

  return (
    <ScreenWrapper>
    <View style={styles.safe}>

      {/* ── HERO ── */}
      <LinearGradient colors={GRADIENTS.hero as [string, string, ...string[]]} style={styles.hero}>
        <View style={styles.heroCircle1} />
        <View style={styles.heroCircle2} />

        {/* Header row */}
        <View style={styles.heroHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroGreeting}>{greeting},{'\n'}MDDr. {lastName}.</Text>
            <Text style={styles.heroDate}>{todayDateStr} · {todayCount} termínov</Text>
          </View>
          <View style={styles.heroActions}>
            <TouchableOpacity style={styles.heroBtn} onPress={() => router.push('/(doctor)/calendar')} activeOpacity={0.8}>
              <Ionicons name="calendar-outline" size={19} color={COLORS.cream} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.heroBtn} onPress={() => router.push('/(doctor)/stats')} activeOpacity={0.8}>
              <Ionicons name="bar-chart-outline" size={19} color={COLORS.cream} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.heroBtn} onPress={() => router.push('/(doctor)/notifications')} activeOpacity={0.8}>
              <Ionicons name="notifications-outline" size={19} color={COLORS.cream} />
              {notifCount > 0 && (
                <View style={styles.heroBadge}>
                  <Text style={styles.heroBadgeText}>{notifCount > 9 ? '9+' : notifCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.heroBtn} onPress={() => router.push('/(doctor)/search')} activeOpacity={0.8}>
              <Ionicons name="search-outline" size={19} color={COLORS.cream} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Gold divider */}
        <View style={styles.heroGoldLine} />

        {/* Stats row */}
        <View style={styles.heroStats}>
          <View style={styles.heroStatItem}>
            <Text style={styles.heroStatNum}>{todayCount}</Text>
            <Text style={styles.heroStatLbl}>Dnes</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStatItem}>
            <Text style={styles.heroStatNum}>{upcomingCount}</Text>
            <Text style={styles.heroStatLbl}>Nadchádzajúce</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStatItem}>
            <Text style={styles.heroStatNum}>{arrivedAppts.length}</Text>
            <Text style={styles.heroStatLbl}>V čakárni</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStatItem}>
            <Text style={[styles.heroStatNum, { color: '#52C896' }]}>{completedToday}</Text>
            <Text style={[styles.heroStatLbl, { color: 'rgba(196,168,130,0.8)' }]}>Hotovo</Text>
          </View>
          {pendingAppts.length > 0 && (
            <>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStatItem}>
                <Text style={[styles.heroStatNum, { color: COLORS.gold }]}>{pendingAppts.length}</Text>
                <Text style={[styles.heroStatLbl, { color: COLORS.gold }]}>Čakajú</Text>
              </View>
            </>
          )}
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={[styles.heroUtilBtn, sendingReminders && { opacity: 0.4 }]}
            onPress={handleSendTomorrowReminders}
            disabled={sendingReminders}
            activeOpacity={0.8}
          >
            {sendingReminders
              ? <ActivityIndicator color={COLORS.cream} size="small" />
              : <Ionicons name="alarm-outline" size={16} color={COLORS.cream} />}
          </TouchableOpacity>
          <TouchableOpacity style={styles.heroUtilBtn} onPress={handleSignOut} activeOpacity={0.75}>
            <Ionicons name="log-out-outline" size={16} color={COLORS.cream} />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* ── Quick action chips ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.quickBar, dyn.bg]}
        contentContainerStyle={styles.quickBarContent}
      >
        {([
          { label: 'Check-in',   icon: 'qr-code-outline'        as const, route: '/(doctor)/checkin'        as const, color: '#0E6655', bg: '#E8F8F5' },
          { label: 'Čakáreň',   icon: 'tv-outline'              as const, route: '/(doctor)/waiting-room'   as const, color: '#1A5276', bg: '#EBF5FB', badge: arrivedAppts.length > 0 ? arrivedAppts.length : 0 },
          { label: 'Fakturácia',icon: 'card-outline'            as const, route: '/(doctor)/billing'        as const, color: '#7D3C98', bg: '#F5EEF8' },
          { label: 'Súhlasy',   icon: 'document-text-outline'   as const, route: '/(doctor)/consent-forms'  as const, color: '#0E6655', bg: '#E8F8F5', badge: consentCount },
          { label: 'Broadcast', icon: 'megaphone-outline'        as const, route: '/(doctor)/broadcast'     as const, color: '#B87333', bg: '#FEF0E7' },
          ...(wlCount > 0     ? [{ label: 'Čakacia l.', icon: 'list-outline' as const,     route: '/(doctor)/waitlist' as const, color: '#0E6655', bg: '#E8F8F5', badge: wlCount }]     : []),
          ...(recallCount > 0 ? [{ label: 'Recall',     icon: 'refresh-outline' as const,  route: '/(doctor)/recall'   as const, color: '#922B21', bg: '#FDEDEC', badge: recallCount }] : []),
          { label: 'Owner',     icon: 'bar-chart-outline'      as const, route: '/(doctor)/owner-dashboard' as const, color: '#1B4F72', bg: '#EBF5FB' },
          { label: 'PDF Export',icon: 'document-outline'       as const, route: '/(doctor)/pdf-exports'     as const, color: '#6C3483', bg: '#F4ECF7' },
          { label: 'Faktúry',  icon: 'receipt-outline'        as const, route: '/(doctor)/auto-invoices'   as const, color: '#2E7D5E', bg: '#E8F8F5' },
          { label: 'Waitlist',  icon: 'hourglass-outline'     as const, route: '/(doctor)/smart-waitlist'  as const, color: '#B87333', bg: '#FEF0E7' },
          { label: 'Video',     icon: 'videocam-outline'      as const, route: '/(doctor)/video-consult'   as const, color: '#2E86C1', bg: '#EBF5FB' },
          { label: 'SMS',       icon: 'chatbox-outline'       as const, route: '/(doctor)/sms-reminders'   as const, color: '#6C3483', bg: '#F4ECF7' },
          { label: 'Sklad',     icon: 'cube-outline'          as const, route: '/(doctor)/inventory'       as const, color: '#B87333', bg: '#FDF3E7' },
          { label: 'Hodnotenia',icon: 'star-half-outline'     as const, route: '/(doctor)/satisfaction-surveys' as const, color: '#3A4256', bg: '#FDF3E7' },
        ] as { label: string; icon: any; route: any; color: string; bg: string; badge?: number }[]).map((chip) => (
          <TouchableOpacity
            key={chip.label}
            style={[styles.quickChip, { backgroundColor: chip.bg }]}
            onPress={() => router.push(chip.route)}
            activeOpacity={0.8}
          >
            <View style={{ position: 'relative' }}>
              <Ionicons name={chip.icon} size={18} color={chip.color} />
              {chip.badge && chip.badge > 0 ? (
                <View style={styles.quickBadge}>
                  <Text style={styles.quickBadgeText}>{chip.badge}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.quickChipLabel, { color: chip.color }]}>{chip.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Hlavný vertikálny scroll ── */}
      <ScrollView
        style={[styles.mainScroll, dyn.bg]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.sand} colors={[COLORS.wal]} />
        }
      >
        {/* ── Čakajúce žiadosti ── */}
        {pendingAppts.length > 0 && (
          <View style={[styles.pendingSection, dark && { backgroundColor: '#2D1F10', borderBottomColor: '#B8ACA033' }]}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: '#B8ACA0' }]} />
              <Text style={[styles.sectionTitle, { color: '#B87333' }]}>
                ČAKAJÚ NA SCHVÁLENIE ({pendingAppts.length})
              </Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 10, paddingBottom: 4 }}>
              {pendingAppts.map((appt) => {
                const d = new Date(appt.appointment_date);
                const dateStr = d.toLocaleDateString('sk-SK', { weekday: 'short', day: 'numeric', month: 'short' });
                const timeStr = d.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
                return (
                  <TouchableOpacity
                    key={appt.id}
                    style={[styles.pendingCard, { backgroundColor: colors.cardBg }]}
                    onPress={() => setApprovingAppt(appt)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.pendingCardTop}>
                      <Text style={[styles.pendingPatient, { color: colors.textPrimary }]} numberOfLines={1}>
                        {appt.patient?.full_name ?? 'Pacient'}
                      </Text>
                      <View style={[styles.pendingBadge, appt.is_urgent && { backgroundColor: '#C0392B' }]}>
                        <Text style={styles.pendingBadgeText}>{appt.is_urgent ? '🚨 URGENT' : 'Nové'}</Text>
                      </View>
                    </View>
                    {appt.family_member_name ? (
                      <Text style={styles.familyTag}>👶 Pre: {appt.family_member_name}</Text>
                    ) : null}
                    {appt.service && (
                      <Text style={[styles.pendingService, { color: colors.textSecondary }]} numberOfLines={1}>
                        {appt.service.emoji ?? '🦷'} {appt.service.name}
                      </Text>
                    )}
                    <Text style={styles.pendingTime}>📅 {dateStr} o {timeStr}</Text>
                    <View style={styles.pendingActions}>
                      <TouchableOpacity
                        style={styles.pendingBtnApprove}
                        onPress={() => setApprovingAppt(appt)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="checkmark" size={13} color="#F5F6F8" />
                        <Text style={styles.pendingBtnApproveText}>Schváliť</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.pendingBtnReject}
                        onPress={() => {
                          Alert.alert('Odmietnuť', `Odmietnuť žiadosť od ${appt.patient?.full_name ?? 'pacienta'}?`, [
                            { text: 'Nie', style: 'cancel' },
                            { text: 'Odmietnuť', style: 'destructive',
                              onPress: async () => {
                                await updateStatus(appt.id, 'cancelled');
                                supabase.from('notifications').insert({
                                  user_id:        appt.patient_id,
                                  title:          '❌ Žiadosť o termín odmietnutá',
                                  body:           `Vaša žiadosť o termín${appt.service ? ` (${appt.service.name})` : ''} nebola schválená. Skúste iný termín alebo nás kontaktujte.`,
                                  type:           'warning',
                                  appointment_id: appt.id
                                }).then(null, () => {});
                              }},
                          ]);
                        }}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="close" size={13} color="#922B21" />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Čakáreň ── */}
        {arrivedAppts.length > 0 && (
          <View style={[styles.arrivedSection, dark && { backgroundColor: '#1A3D2E', borderBottomColor: '#A2D9CE33' }]}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: '#17A589' }]} />
              <Text style={[styles.sectionTitle, { color: '#0E6655' }]}>V ČAKÁRNI ({arrivedAppts.length})</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 10, paddingBottom: 4 }}>
              {arrivedAppts.map((appt) => {
                const arrivedTime = appt.arrived_at
                  ? new Date(appt.arrived_at).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' })
                  : '—';
                const apptTime = formatTime(appt.appointment_date);
                const waitMins = appt.arrived_at
                  ? Math.round((Date.now() - new Date(appt.arrived_at).getTime()) / 60000)
                  : 0;
                return (
                  <TouchableOpacity
                    key={appt.id}
                    style={[styles.arrivedCard, { backgroundColor: colors.cardBg }]}
                    onPress={() => router.push({ pathname: '/(doctor)/patient-detail', params: { patientId: appt.patient_id } })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.arrivedCardTop}>
                      <Text style={[styles.arrivedPatient, { color: colors.textPrimary }]} numberOfLines={1}>
                        {appt.patient?.full_name ?? 'Pacient'}
                      </Text>
                      <View style={styles.arrivedWaitBadge}>
                        <Text style={styles.arrivedWaitText}>{waitMins} min</Text>
                      </View>
                    </View>
                    {appt.service && (
                      <Text style={[styles.arrivedService, { color: colors.textSecondary }]} numberOfLines={1}>
                        {appt.service.emoji ?? '🦷'} {appt.service.name}
                      </Text>
                    )}
                    <Text style={styles.arrivedTime}>{apptTime} · Prišiel: {arrivedTime}</Text>
                    <TouchableOpacity
                      style={styles.arrivedCallBtn}
                      onPress={() => setCompletingItem(appt)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="checkmark-circle-outline" size={13} color="#F5F6F8" />
                      <Text style={styles.arrivedCallBtnText}>Zavolať dnu ✓</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Ďalší pacient banner ── */}
        {!loading && nextApptLabel && (
          <TouchableOpacity
            style={[styles.nextApptBanner, dark && { backgroundColor: '#2D1F10', borderBottomColor: '#B8ACA033' }]}
            onPress={() => setFilter('upcoming')}
            activeOpacity={0.8}
          >
            <View style={[styles.sectionDot, { backgroundColor: COLORS.gold }]} />
            <Text style={styles.nextApptText} numberOfLines={1}>{nextApptLabel}</Text>
            <Ionicons name="chevron-forward" size={14} color={COLORS.wal} />
          </TouchableOpacity>
        )}

        {/* ── Narodeniny ── */}
        {birthdays.length > 0 && (
          <View style={[styles.bdSection, dark && { backgroundColor: '#1E0D33', borderBottomColor: '#D7BDE233' }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: '#7D3C98' }]}>🎂 NARODENINY (najbližších 14 dní)</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 10, paddingBottom: 4 }}>
              {birthdays.map((b) => (
                <View key={b.id} style={[styles.bdCard, { backgroundColor: colors.cardBg }]}>
                  <Text style={styles.bdEmoji}>{b.daysUntil === 0 ? '🎉' : '🎂'}</Text>
                  <Text style={[styles.bdName, { color: colors.textPrimary }]} numberOfLines={1}>{b.name}</Text>
                  <Text style={styles.bdDays}>
                    {b.daysUntil === 0 ? 'Dnes!' : b.daysUntil === 1 ? 'Zajtra' : `Za ${b.daysUntil} dní`}
                  </Text>
                  <TouchableOpacity
                    style={[styles.bdBtn, dark && { backgroundColor: '#1E0D33', borderColor: '#D7BDE244' }]}
                    onPress={() => router.push({ pathname: '/(doctor)/messages', params: { patientId: b.id, patientName: b.name } })}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="chatbubble-outline" size={12} color="#7D3C98" />
                    <Text style={styles.bdBtnText}>Blahoželať</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Vyhľadávanie ── */}
        <View style={[styles.searchWrap, dyn.card]}>
          <Ionicons name="search-outline" size={16} color={COLORS.wal} />
          <TextInput
            style={[styles.searchInput, dyn.text]}
            placeholder="Hľadaj pacienta, poznámky..."
            placeholderTextColor={colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color="#D0D4DC" />
            </TouchableOpacity>
          )}
        </View>

        {/* ── Filter tabs ── */}
        <View style={[styles.filterRow, dyn.bg]}>
          {([
            { key: 'today',    label: 'Dnes' },
            { key: 'upcoming', label: 'Budúce' },
            { key: 'all',      label: 'Všetky' },
          ] as { key: Filter; label: string }[]).map(({ key, label }) => (
            <TouchableOpacity key={key}
              style={[styles.filterTab, filter === key && styles.filterTabActive]}
              onPress={() => setFilter(key)} activeOpacity={0.75}>
              {filter === key ? (
                <LinearGradient colors={GRADIENTS.gold as [string, string, ...string[]]} style={styles.filterTabGradient}>
                  <Text style={styles.filterTabTextActive}>
                    {label}
                    {key === 'today' && todayCount > 0 ? ` (${todayCount})` : ''}
                    {key === 'upcoming' && upcomingCount > 0 ? ` (${upcomingCount})` : ''}
                  </Text>
                </LinearGradient>
              ) : (
                <Text style={[styles.filterTabText, dyn.sub]}>
                  {label}
                  {key === 'today' && todayCount > 0 ? ` (${todayCount})` : ''}
                  {key === 'upcoming' && upcomingCount > 0 ? ` (${upcomingCount})` : ''}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Zoznam termínov ── */}
        {loading ? (
          <SkeletonList count={5} />
        ) : Object.keys(grouped).length === 0 ? (
          <View style={styles.centerInScroll}>
            <Text style={styles.emptyIcon}>📅</Text>
            <Text style={[styles.emptyText, dyn.text]}>Žiadne termíny</Text>
            <Text style={[styles.emptySub, dyn.sub]}>
              {filter === 'today' ? 'Na dnes nie sú naplánované žiadne termíny.' : 'V tomto zobrazení nie sú žiadne termíny.'}
            </Text>
            <TouchableOpacity
              style={styles.emptyAddBtn}
              onPress={() => router.push('/(doctor)/add-appointment')}
              activeOpacity={0.85}
            >
              <LinearGradient colors={GRADIENTS.gold as [string, string, ...string[]]} style={styles.emptyAddBtnGradient}>
                <Ionicons name="add-circle-outline" size={16} color="#F5F6F8" />
                <Text style={styles.emptyAddBtnText}>Pridať termín</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          Object.entries(grouped).map(([date, items]) => (
            <View key={date}>
              <View style={styles.dateHeader}>
                <View style={styles.dateDot} />
                <Text style={[styles.dateLabel, dyn.text]}>{date}</Text>
              </View>
              {items.map((item) => (
                <AppointmentCard key={item.id} item={item}
                  onComplete={() => handleComplete(item)}
                  onCancel={() => handleCancel(item.id)}
                  onReschedule={() => setRescheduleAppt(item)}
                  onApproveRequest={() => setApprovingAppt(item)}
                  onDentalChart={() => router.push({
                    pathname: '/(doctor)/dental-chart',
                    params: { patientId: item.patient_id, patientName: item.patient?.full_name ?? 'Pacient' }
                  })}
                  onPassport={() => router.push({
                    pathname: '/(doctor)/patient-passport',
                    params: { patientId: item.patient_id, patientName: item.patient?.full_name ?? 'Pacient' }
                  })}
                  onViewPatient={() => router.push({
                    pathname: '/(doctor)/patient-detail',
                    params: { patientId: item.patient_id, patientName: item.patient?.full_name ?? 'Pacient' }
                  })} />
              ))}
            </View>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── FAB ── */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/(doctor)/add-appointment')}
        activeOpacity={0.85}
      >
        <LinearGradient colors={GRADIENTS.gold as [string, string, ...string[]]} style={styles.fabGradient}>
          <Ionicons name="add" size={26} color="#F5F6F8" />
        </LinearGradient>
      </TouchableOpacity>

      {/* ── Modaly ── */}
      <ApproveModal
        visible={!!approvingAppt}
        appointment={approvingAppt}
        onClose={() => setApprovingAppt(null)}
        onApprove={handleApprove}
        onReject={handleReject}
        saving={approveSaving}
      />
      <CompleteModal
        visible={!!completingItem}
        patientName={completingItem?.patient?.full_name ?? 'Pacient'}
        onClose={() => setCompletingItem(null)}
        onConfirm={confirmComplete}
        saving={completeSaving}
      />
      <DoctorRescheduleModal
        visible={!!rescheduleAppt}
        appointment={rescheduleAppt}
        doctorId={doctorId}
        onClose={() => setRescheduleAppt(null)}
        onDone={refetch}
      />
    </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: COLORS.esp },
  mainScroll: { flex: 1 },

  // ── Hero ─────────────────────────────────────────────────────────────────────
  hero: { paddingHorizontal: SPACING.lg, paddingTop: 12, paddingBottom: 16 },
  heroCircle1: {
    position: 'absolute', top: -60, right: -40,
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(201,168,76,0.07)'
  },
  heroCircle2: {
    position: 'absolute', bottom: -30, left: -30,
    width: 120, height: 120, borderRadius: 4,
    backgroundColor: 'rgba(201,168,76,0.05)'
  },
  heroHeader:  { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  heroGreeting:{ fontFamily: 'PlayfairDisplay_700Bold_Italic', fontSize: 24, lineHeight: 30, color: COLORS.cream, letterSpacing: -0.3 },
  heroDate:    { ...TYPO.label, color: COLORS.sand, marginTop: 8, textTransform: 'capitalize' },
  heroActions: { flexDirection: 'row', gap: 6, marginTop: 4 },
  heroBtn:     {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center'
  },
  heroBadge: {
    position: 'absolute', top: -2, right: -2,
    minWidth: 14, height: 14, borderRadius: 2,
    backgroundColor: '#C0392B',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 2,
    borderWidth: 1.5, borderColor: COLORS.esp
  },
  heroBadgeText: { fontSize: 7, fontWeight: '800', color: '#F5F6F8' },
  heroGoldLine:  { height: 1, backgroundColor: COLORS.gold, opacity: 0.5, marginBottom: 12 },
  heroStats:     { flexDirection: 'row', alignItems: 'center', gap: 0 },
  heroStatItem:  { alignItems: 'center', paddingHorizontal: 10 },
  heroStatNum:   { fontSize: 22, fontWeight: '800', color: COLORS.cream, lineHeight: 26 },
  heroStatLbl:   { fontSize: 9, fontWeight: '600', color: COLORS.sand, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 1 },
  heroStatDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.15)' },
  heroUtilBtn:   {
    width: 32, height: 32, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 6
  },

  // ── Quick action chips ────────────────────────────────────────────────────────
  quickBar:        { flexShrink: 0, flexGrow: 0, borderBottomWidth: 1, borderBottomColor: COLORS.bg3 },
  quickBarContent: { flexDirection: 'row', gap: 8, paddingHorizontal: SPACING.lg, paddingVertical: 10, paddingRight: 20 },
  quickChip:       { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: RADII.full, paddingHorizontal: 14, paddingVertical: 8 },
  quickChipLabel:  { fontSize: 11, fontWeight: '600' },
  quickBadge:      {
    position: 'absolute', top: -4, right: -6,
    minWidth: 14, height: 14, borderRadius: 2,
    backgroundColor: '#C0392B',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 2
  },
  quickBadgeText: { fontSize: 7, fontWeight: '800', color: '#F5F6F8' },

  // ── Filter ───────────────────────────────────────────────────────────────────
  filterRow:          { flexDirection: 'row', paddingHorizontal: SPACING.lg, paddingVertical: 10, gap: 8 },
  filterTab:          { flex: 1, borderRadius: RADII.full, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.bg3, overflow: 'hidden' },
  filterTabActive:    { borderColor: 'transparent' },
  filterTabGradient:  { width: '100%', paddingVertical: 8, alignItems: 'center', borderRadius: RADII.full },
  filterTabText:      { fontSize: 11, fontWeight: '600', paddingVertical: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  filterTabTextActive:{ fontSize: 11, fontWeight: '700', color: '#F5F6F8', textTransform: 'uppercase', letterSpacing: 0.5 },

  // ── Date header ──────────────────────────────────────────────────────────────
  dateHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: SPACING.lg, paddingTop: 16, paddingBottom: 8 },
  dateDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.wal },
  dateLabel:  { ...TYPO.overline, color: COLORS.esp },

  // ── Appointment card ─────────────────────────────────────────────────────────
  card:        { backgroundColor: '#F5F6F8', borderRadius: RADII.lg, marginHorizontal: SPACING.lg, marginBottom: 10, paddingLeft: 18, padding: 14, borderWidth: 1, borderColor: COLORS.bg3, ...SHADOWS.card, overflow: 'hidden' },
  cardUrgent:  { borderColor: COLORS.error, borderWidth: 1.5 },
  accentBar:   { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, borderTopLeftRadius: RADII.lg, borderBottomLeftRadius: RADII.lg },
  urgentBanner:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FDEDEC', borderRadius: 2, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: 8 },
  urgentBannerText:{ fontSize: 10, fontWeight: '800', color: '#C0392B', letterSpacing: 1 },
  cardHeader:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  timeBox:     { backgroundColor: COLORS.esp, borderRadius: RADII.sm, paddingHorizontal: 10, paddingVertical: 6 },
  timeText:    { fontSize: 14, fontWeight: '700', color: COLORS.cream },
  patientName: { fontSize: 14, fontWeight: '600', color: COLORS.esp, marginBottom: 2 },
  patientPhone:{ fontSize: 11, color: COLORS.wal },
  familyTag:   { fontSize: 11, color: '#B87333', fontWeight: '600' },

  badge:     { borderRadius: 2, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  badgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },

  notesRow:    { flexDirection: 'row', gap: 6, alignItems: 'flex-start', marginTop: 6, marginBottom: 4 },
  notesText:   { flex: 1, fontSize: 12, color: COLORS.wal, lineHeight: 18 },
  ratingRow:   { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 6, marginBottom: 4, backgroundColor: '#FEFCE8', borderRadius: 2, paddingHorizontal: 10, paddingVertical: 6 },
  ratingLabel: { fontSize: 11, fontWeight: '600', color: '#B87333', marginLeft: 6 },

  actionsGrid:     { gap: 8, marginTop: 10 },
  actionsRow:      { flexDirection: 'row', gap: 8 },
  btnComplete:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: RADII.sm, backgroundColor: '#EDF7F3', borderWidth: 1, borderColor: '#A3D4BE' },
  btnCompleteText: { fontSize: 12, fontWeight: '600', color: '#2E7D5E' },
  btnCancel:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: RADII.sm, backgroundColor: '#FDEDEC', borderWidth: 1, borderColor: '#F1948A' },
  btnCancelText:   { fontSize: 12, fontWeight: '600', color: '#922B21' },
  btnChart:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: RADII.sm, backgroundColor: '#D0D4DC', borderWidth: 1, borderColor: COLORS.sand },
  btnChartText:    { fontSize: 12, fontWeight: '600', color: COLORS.wal },
  btnPassport:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: RADII.sm, backgroundColor: '#EBF5FB', borderWidth: 1, borderColor: '#AED6F1' },
  btnPassportText: { fontSize: 12, fontWeight: '600', color: '#1A5276' },
  btnReschedule:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: RADII.sm, backgroundColor: '#EBF5FB', borderWidth: 1, borderColor: '#AED6F1' },
  btnRescheduleText:{ fontSize: 12, fontWeight: '600', color: '#1A5276' },

  // ── Empty state ──────────────────────────────────────────────────────────────
  centerInScroll:    { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 30 },
  emptyIcon:         { fontSize: 52, marginBottom: 14 },
  emptyText:         { fontSize: 18, fontWeight: '600', color: COLORS.esp, marginBottom: 6, textAlign: 'center' },
  emptySub:          { fontSize: 13, color: COLORS.wal, textAlign: 'center', paddingHorizontal: 10, marginBottom: 20, lineHeight: 19 },
  emptyAddBtn:       { borderRadius: RADII.full, overflow: 'hidden' },
  emptyAddBtnGradient: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 13 },
  emptyAddBtnText:   { fontSize: 14, fontWeight: '700', color: '#F5F6F8' },

  // ── FAB ──────────────────────────────────────────────────────────────────────
  fab: {
    position: 'absolute', bottom: 82, right: 20,
    width: 56, height: 56, borderRadius: 6,
    overflow: 'hidden',
    ...SHADOWS.gold
  },
  fabGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ── Section headers ───────────────────────────────────────────────────────────
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACING.lg, marginBottom: 10 },
  sectionDot:    { width: 7, height: 7, borderRadius: 3.5 },
  sectionTitle:  { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },

  // ── Pending section ───────────────────────────────────────────────────────────
  pendingSection:     { backgroundColor: '#FDF3E7', borderBottomWidth: 1, borderBottomColor: '#D0D4DC', paddingTop: 10, paddingBottom: 12 },
  pendingCard:        { width: 200, backgroundColor: COLORS.cream, borderRadius: RADII.md, padding: 12, borderWidth: 1.5, borderColor: '#D0D4DC', ...SHADOWS.sm },
  pendingCardTop:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  pendingPatient:     { flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.esp },
  pendingBadge:       { backgroundColor: '#B8ACA0', borderRadius: 2, paddingHorizontal: 6, paddingVertical: 2 },
  pendingBadgeText:   { fontSize: 8, fontWeight: '800', color: '#F5F6F8' },
  pendingService:     { fontSize: 11, color: COLORS.wal, marginBottom: 3 },
  pendingTime:        { fontSize: 11, color: '#B87333', fontWeight: '500', marginBottom: 8 },
  pendingActions:     { flexDirection: 'row', gap: 6 },
  pendingBtnApprove:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 7, borderRadius: RADII.sm, backgroundColor: '#2E7D5E' },
  pendingBtnApproveText: { fontSize: 11, fontWeight: '700', color: '#F5F6F8' },
  pendingBtnReject:   { width: 30, alignItems: 'center', justifyContent: 'center', paddingVertical: 7, borderRadius: RADII.sm, backgroundColor: '#FDEDEC', borderWidth: 1, borderColor: '#F1948A' },

  // ── Arrived / Čakáreň ────────────────────────────────────────────────────────
  arrivedSection:   { backgroundColor: '#E8F8F5', borderBottomWidth: 1, borderBottomColor: '#A2D9CE', paddingTop: 10, paddingBottom: 12 },
  arrivedCard:      { width: 200, backgroundColor: COLORS.cream, borderRadius: RADII.md, padding: 12, borderWidth: 1.5, borderColor: '#A2D9CE', ...SHADOWS.sm },
  arrivedCardTop:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  arrivedPatient:   { flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.esp },
  arrivedWaitBadge: { backgroundColor: '#17A589', borderRadius: 2, paddingHorizontal: 6, paddingVertical: 2 },
  arrivedWaitText:  { fontSize: 8, fontWeight: '800', color: '#F5F6F8' },
  arrivedService:   { fontSize: 11, color: COLORS.wal, marginBottom: 3 },
  arrivedTime:      { fontSize: 10, color: '#0E6655', fontWeight: '500', marginBottom: 8 },
  arrivedCallBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: RADII.sm, backgroundColor: '#0E6655' },
  arrivedCallBtnText: { fontSize: 11, fontWeight: '700', color: '#F5F6F8' },

  // ── Next appointment banner ───────────────────────────────────────────────────
  nextApptBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FDF3E7', borderBottomWidth: 1, borderBottomColor: '#D0D4DC', paddingHorizontal: SPACING.lg, paddingVertical: 10 },
  nextApptText:   { flex: 1, fontSize: 12, fontWeight: '600', color: '#B87333' },

  // ── Birthdays ────────────────────────────────────────────────────────────────
  bdSection:  { backgroundColor: '#F5EEF8', borderBottomWidth: 1, borderBottomColor: '#D7BDE2', paddingTop: 8, paddingBottom: 10 },
  bdCard:     { width: 150, backgroundColor: COLORS.cream, borderRadius: RADII.md, padding: 12, borderWidth: 1.5, borderColor: '#D7BDE2', alignItems: 'center' },
  bdEmoji:    { fontSize: 24, marginBottom: 4 },
  bdName:     { fontSize: 12, fontWeight: '700', color: COLORS.esp, textAlign: 'center', marginBottom: 3 },
  bdDays:     { fontSize: 11, fontWeight: '600', color: '#7D3C98', marginBottom: 8 },
  bdBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F5EEF8', borderRadius: RADII.sm, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#D7BDE2' },
  bdBtnText:  { fontSize: 11, fontWeight: '700', color: '#7D3C98' },

  // ── Search ───────────────────────────────────────────────────────────────────
  searchWrap:  { flexDirection: 'row', alignItems: 'center', marginHorizontal: SPACING.lg, marginTop: 12, marginBottom: 4, borderRadius: RADII.md, borderWidth: 1.5, borderColor: COLORS.bg3, paddingHorizontal: 12, gap: 8 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 13, color: COLORS.esp },

  // ── Modals ────────────────────────────────────────────────────────────────────
  overlay:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:            { backgroundColor: COLORS.cream, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 22, paddingBottom: 40 },
  sheetHandle:      { width: 38, height: 4, borderRadius: 2, backgroundColor: COLORS.bg3, alignSelf: 'center', marginBottom: 20 },
  sheetTitle:       { fontSize: 20, fontWeight: '700', color: COLORS.esp, marginBottom: 4 },
  sheetSub:         { fontSize: 13, color: COLORS.wal, marginBottom: 18 },
  sheetLabel:       { fontSize: 9, letterSpacing: 2, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  sheetInput:       { borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: RADII.md, padding: 12, fontSize: 13, color: COLORS.esp, minHeight: 100, backgroundColor: COLORS.bg2, marginBottom: 20 },
  sheetActions:     { flexDirection: 'row', gap: 10 },
  sheetBtnCancel:   { flex: 1, borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: RADII.md, paddingVertical: 14, alignItems: 'center' },
  sheetBtnCancelText:  { fontSize: 14, fontWeight: '600', color: COLORS.wal },
  sheetBtnConfirm:     { flex: 2, borderRadius: RADII.md, paddingVertical: 14, alignItems: 'center', backgroundColor: COLORS.wal, justifyContent: 'center' },
  sheetBtnConfirmText: { fontSize: 14, fontWeight: '700', color: '#F5F6F8' }
});
