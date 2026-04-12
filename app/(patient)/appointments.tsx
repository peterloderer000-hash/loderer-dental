import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { ActivityIndicator, Alert, Animated, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SIZES } from '../../styles/theme';
import { useAppointments, Appointment } from '../../hooks/useAppointments';
import { supabase } from '../../supabase';
import {
  getNextOpenDays, generateTimeSlotsForDay,
  SK_DAYS_SHORT, SK_MONTHS_SHORT, jsDayToDb, timeToMinutes,
} from '../../utils/timeSlots';

type OpeningHour = { open_time: string; close_time: string };
type BookedSlot  = { start: number; end: number };

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('sk-SK', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}
function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
}
function getMonthLabel(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('sk-SK', { month: 'long', year: 'numeric' });
}

const STATUS_CONFIG = {
  scheduled: { label: 'Naplánovaný', bg: '#EBF5FB', color: '#1A5276', border: '#AED6F1', icon: 'time-outline' as const },
  completed:  { label: 'Dokončený',   bg: '#EAFAF1', color: '#1E8449', border: '#A9DFBF', icon: 'checkmark-circle-outline' as const },
  cancelled:  { label: 'Zrušený',     bg: '#FDEDEC', color: '#922B21', border: '#F1948A', icon: 'close-circle-outline' as const },
};

type Filter = 'all' | 'scheduled' | 'completed' | 'cancelled';

// ─── Karta termínu ────────────────────────────────────────────────────────────
function AppointmentCard({ item, onCancel, onReschedule, onDetail, onRate }: {
  item: Appointment; onCancel: () => void; onReschedule: () => void; onDetail: () => void; onRate: () => void;
}) {
  const cfg = STATUS_CONFIG[item.status];
  const now = new Date();
  const isPast = new Date(item.appointment_date) < now;
  const canCancel = item.status === 'scheduled' && !isPast;

  return (
    <TouchableOpacity style={[styles.card, isPast && item.status === 'scheduled' && styles.cardMissed]} onPress={onDetail} activeOpacity={0.9}>
      {/* Čas + status */}
      <View style={styles.cardTop}>
        <View style={styles.timeBox}>
          <Text style={styles.timeDay}>{new Date(item.appointment_date).getDate()}</Text>
          <Text style={styles.timeMonth}>
            {new Date(item.appointment_date).toLocaleDateString('sk-SK', { month: 'short' })}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.timeText}>{formatTime(item.appointment_date)}</Text>
          <Text style={styles.dateText} numberOfLines={1}>
            {new Date(item.appointment_date).toLocaleDateString('sk-SK', { weekday: 'long' })}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
          <Ionicons name={cfg.icon} size={11} color={cfg.color} />
          <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Info */}
      <View style={styles.cardBottom}>
        {item.service && (
          <View style={styles.infoItem}>
            <Text style={{ fontSize: 13 }}>{item.service.emoji ?? '🦷'}</Text>
            <Text style={styles.infoText}>{item.service.name}</Text>
          </View>
        )}
        <View style={styles.infoItem}>
          <Ionicons name="person-outline" size={13} color={COLORS.wal} />
          <Text style={styles.infoText}>{item.doctor?.full_name ?? 'MDDr. Loderer'}</Text>
        </View>
        {item.notes ? (
          <View style={styles.infoItem}>
            <Ionicons name="document-text-outline" size={13} color={COLORS.wal} />
            <Text style={styles.infoText} numberOfLines={1}>{item.notes}</Text>
          </View>
        ) : null}
      </View>

      {/* Záver doktora — zobrazí sa po dokončení termínu */}
      {item.status === 'completed' && item.doctor_notes ? (
        <View style={styles.doctorNotesBox}>
          <View style={styles.doctorNotesHeader}>
            <Ionicons name="medical" size={13} color="#1A5276" />
            <Text style={styles.doctorNotesLabel}>ZÁVER DOKTORA</Text>
          </View>
          <Text style={styles.doctorNotesText}>{item.doctor_notes}</Text>
        </View>
      ) : null}

      {/* Akcie — len pre budúce naplánované */}
      {canCancel && (
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.rescheduleBtn} onPress={onReschedule} activeOpacity={0.8}>
            <Ionicons name="calendar-outline" size={14} color={COLORS.wal} />
            <Text style={styles.rescheduleBtnText}>Presunúť</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
            <Ionicons name="close-circle-outline" size={14} color="#922B21" />
            <Text style={styles.cancelBtnText}>Zrušiť</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* Hodnotenie pre dokončené termíny */}
      {item.status === 'completed' && (
        item.patient_rating ? (
          <View style={styles.ratingRow}>
            {[1,2,3,4,5].map(n => (
              <Ionicons key={n} name={n <= item.patient_rating! ? 'star' : 'star-outline'} size={14} color="#F39C12" />
            ))}
            <Text style={styles.ratingText}>
              {['','Veľmi zlý','Zlý','Dobrý','Veľmi dobrý','Výborný!'][item.patient_rating]}
            </Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.rateBtn} onPress={onRate} activeOpacity={0.8}>
            <Ionicons name="star-outline" size={14} color="#F39C12" />
            <Text style={styles.rateBtnText}>Ohodnoť túto návštevu</Text>
          </TouchableOpacity>
        )
      )}

      {/* "Detaily" hint for completed/cancelled */}
      {item.status !== 'scheduled' && (
        <View style={styles.detailHint}>
          <Ionicons name="receipt-outline" size={12} color={COLORS.wal} />
          <Text style={styles.detailHintText}>Klepni pre detaily</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Reschedule Modal ────────────────────────────────────────────────────────
function RescheduleModal({ visible, appointment, onClose, onDone }: {
  visible: boolean;
  appointment: Appointment | null;
  onClose: () => void;
  onDone: () => void;
}) {
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
      appointment.service.duration_minutes,
      selectedDayHours.open_time,
      selectedDayHours.close_time,
    );
  }, [appointment, selectedDayHours]);

  // Načítaj ordinačné hodiny
  useEffect(() => {
    if (!visible || !appointment) return;
    setSelDate(null); setSelTime('');
    supabase.from('profiles').select('id').eq('role', 'doctor').limit(1)
      .then(({ data: docs }) => {
        if (!docs || docs.length === 0) return;
        supabase.from('opening_hours')
          .select('day_of_week, open_time, close_time, is_closed')
          .eq('doctor_id', docs[0].id)
          .then(({ data: hours }) => {
            const map = new Map<number, OpeningHour>();
            (hours ?? []).forEach(h => {
              if (!h.is_closed && h.open_time && h.close_time)
                map.set(h.day_of_week, { open_time: h.open_time.slice(0,5), close_time: h.close_time.slice(0,5) });
            });
            if (map.size === 0) for (let d = 1; d <= 5; d++) map.set(d, { open_time: '08:00', close_time: '17:00' });
            setOpeningHoursMap(map);
          });
      });
  }, [visible, appointment]);

  // Načítaj obsadené sloty pre vybraný deň (okrem aktuálneho termínu)
  useEffect(() => {
    if (!selDate || !appointment) { setBookedSlots([]); return; }
    setLoadingSlots(true);
    const dayStart = new Date(selDate); dayStart.setHours(0,0,0,0);
    const dayEnd   = new Date(selDate); dayEnd.setHours(23,59,59,999);
    supabase.from('appointments')
      .select('appointment_date, service:service_id(duration_minutes)')
      .eq('doctor_id', appointment.doctor_id)
      .eq('status', 'scheduled')
      .neq('id', appointment.id) // vylúč aktuálny termín
      .gte('appointment_date', dayStart.toISOString())
      .lte('appointment_date', dayEnd.toISOString())
      .then(({ data }) => {
        setLoadingSlots(false);
        setBookedSlots((data ?? []).map(a => {
          const d = new Date(a.appointment_date);
          const s = d.getHours() * 60 + d.getMinutes();
          return { start: s, end: s + ((a.service as any)?.duration_minutes ?? 30) };
        }));
      });
  }, [selDate, appointment]);

  function isSlotTaken(start: string, dur: number) {
    const s = timeToMinutes(start); const e = s + dur;
    return bookedSlots.some(b => s < b.end && e > b.start);
  }

  async function handleConfirm() {
    if (!appointment || !selDate || !selTime) return;
    setSaving(true);
    const [h, m] = selTime.split(':').map(Number);
    const dt = new Date(selDate); dt.setHours(h, m, 0, 0);
    const { error } = await supabase.from('appointments')
      .update({ appointment_date: dt.toISOString() })
      .eq('id', appointment.id);
    setSaving(false);
    if (error) { Alert.alert('Chyba', error.message); return; }
    Alert.alert('Termín presunutý ✓',
      `Nový termín: ${dt.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' })} o ${selTime}`,
      [{ text: 'OK', onPress: () => { onDone(); onClose(); } }]
    );
  }

  if (!appointment) return null;
  const dur = appointment.service?.duration_minutes ?? 30;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={rs.overlay}>
        <View style={rs.sheet}>
          <View style={rs.handle} />
          <View style={rs.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={rs.sheetTitle}>Presunúť termín</Text>
              <Text style={rs.sheetSub}>{appointment.service?.emoji ?? '🦷'} {appointment.service?.name ?? 'Termín'}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={COLORS.wal} />
            </TouchableOpacity>
          </View>

          {/* Výber dátumu */}
          <Text style={rs.label}>VYBERTE NOVÝ DÁTUM</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={rs.datesScroll} contentContainerStyle={rs.datesContent}>
            {days.map(d => {
              const isSel   = selDate?.toDateString() === d.toDateString();
              const isToday = d.toDateString() === new Date().toDateString();
              return (
                <TouchableOpacity key={d.toISOString()}
                  style={[rs.dateCell, isSel && rs.dateCellSel]}
                  onPress={() => { setSelDate(d); setSelTime(''); }} activeOpacity={0.75}>
                  <Text style={[rs.dateName, isSel && rs.dateSel]}>{isToday ? 'Dnes' : SK_DAYS_SHORT[d.getDay()]}</Text>
                  <Text style={[rs.dateNum,  isSel && rs.dateSel]}>{d.getDate()}</Text>
                  <Text style={[rs.dateMon,  isSel && rs.dateSel]}>{SK_MONTHS_SHORT[d.getMonth()]}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Výber času */}
          {selDate && (
            <>
              <Text style={rs.label}>VYBERTE ČAS</Text>
              {loadingSlots ? (
                <ActivityIndicator color={COLORS.wal} style={{ marginVertical: 12 }} />
              ) : (
                <View style={rs.slotsGrid}>
                  {slots.map(slot => {
                    const isSel  = selTime === slot.start;
                    const taken  = isSlotTaken(slot.start, dur);
                    return (
                      <TouchableOpacity key={slot.start}
                        style={[rs.slot, isSel && rs.slotSel, taken && rs.slotTaken]}
                        onPress={() => !taken && setSelTime(slot.start)}
                        disabled={taken} activeOpacity={taken ? 1 : 0.75}>
                        <Text style={[rs.slotText, isSel && rs.slotTextSel, taken && rs.slotTextTaken]}>
                          {slot.start}
                        </Text>
                        {taken && <Text style={rs.slotTakenLabel}>✗</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </>
          )}

          {/* Potvrdiť */}
          <TouchableOpacity
            style={[rs.confirmBtn, (!selDate || !selTime || saving) && rs.confirmBtnOff]}
            onPress={handleConfirm} disabled={!selDate || !selTime || saving} activeOpacity={0.85}>
            {saving
              ? <ActivityIndicator color="#fff" />
              : <><Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <Text style={rs.confirmText}>Potvrdiť presunutie</Text></>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const rs = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:       { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: '85%' },
  handle:      { width: 38, height: 4, borderRadius: 2, backgroundColor: COLORS.bg3, alignSelf: 'center', marginBottom: 18 },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
  sheetTitle:  { fontSize: 18, fontWeight: '700', color: COLORS.esp, marginBottom: 3 },
  sheetSub:    { fontSize: 12, color: COLORS.wal },
  label:       { fontSize: 9, fontWeight: '700', color: COLORS.wal, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 },

  datesScroll:  { marginHorizontal: -20, marginBottom: 18 },
  datesContent: { paddingHorizontal: 20, gap: 8 },
  dateCell:   { width: 56, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: COLORS.bg2, borderWidth: 1.5, borderColor: COLORS.bg3 },
  dateCellSel:{ backgroundColor: COLORS.esp, borderColor: COLORS.sand },
  dateName:   { fontSize: 8, fontWeight: '700', color: COLORS.wal, textTransform: 'uppercase' },
  dateNum:    { fontSize: 18, fontWeight: '700', color: COLORS.esp, marginVertical: 2 },
  dateMon:    { fontSize: 8, color: COLORS.wal, textTransform: 'uppercase' },
  dateSel:    { color: COLORS.sand },

  slotsGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  slot:           { width: '22%', alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.bg2, borderWidth: 1.5, borderColor: COLORS.bg3 },
  slotSel:        { backgroundColor: COLORS.esp, borderColor: COLORS.sand },
  slotTaken:      { opacity: 0.4 },
  slotText:       { fontSize: 13, fontWeight: '700', color: COLORS.esp },
  slotTextSel:    { color: COLORS.cream },
  slotTextTaken:  { color: '#ccc' },
  slotTakenLabel: { fontSize: 9, color: '#E74C3C', fontWeight: '700' },

  confirmBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.wal, borderRadius: 14, paddingVertical: 15 },
  confirmBtnOff: { opacity: 0.35 },
  confirmText:   { fontSize: 15, fontWeight: '700', color: '#fff' },
});

// ─── Hodnotenie termínu ───────────────────────────────────────────────────────
function RatingModal({ appointment, onClose, onDone }: {
  appointment: Appointment | null; onClose: () => void; onDone: () => void;
}) {
  const [rating,  setRating]  = useState(0);
  const [review,  setReview]  = useState('');
  const [saving,  setSaving]  = useState(false);
  const starScale = useRef(new Animated.Value(1)).current;

  function animateStar() {
    Animated.sequence([
      Animated.timing(starScale, { toValue: 1.3, duration: 100, useNativeDriver: true }),
      Animated.spring(starScale,  { toValue: 1,   useNativeDriver: true }),
    ]).start();
  }

  function selectRating(n: number) {
    setRating(n);
    animateStar();
  }

  async function handleSubmit() {
    if (!appointment || rating === 0) { Alert.alert('Vyber hodnotenie', 'Klikni na hviezdy.'); return; }
    setSaving(true);
    const { error } = await supabase.from('appointments').update({
      patient_rating: rating,
      patient_review: review.trim() || null,
    }).eq('id', appointment.id);
    setSaving(false);
    if (error) { Alert.alert('Chyba', error.message); return; }
    onDone();
    onClose();
  }

  if (!appointment) return null;

  const LABELS = ['', 'Veľmi zlý', 'Zlý', 'Dobrý', 'Veľmi dobrý', 'Výborný!'];

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={rStyles.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={rStyles.sheet}>
          <View style={rStyles.handle} />
          <Text style={rStyles.title}>Ohodnoť návštevu</Text>
          <Text style={rStyles.subtitle}>
            {appointment.service?.emoji ?? '🦷'} {appointment.service?.name ?? 'Termín'} ·{' '}
            {new Date(appointment.appointment_date).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' })}
          </Text>

          {/* Hviezdy */}
          <Animated.View style={[rStyles.starsRow, { transform: [{ scale: starScale }] }]}>
            {[1,2,3,4,5].map((n) => (
              <TouchableOpacity key={n} onPress={() => selectRating(n)} activeOpacity={0.7}>
                <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={40}
                  color={n <= rating ? '#F39C12' : '#ddd'} />
              </TouchableOpacity>
            ))}
          </Animated.View>
          {rating > 0 && (
            <Text style={rStyles.ratingLabel}>{LABELS[rating]}</Text>
          )}

          {/* Komentár */}
          <TextInput
            style={rStyles.input}
            placeholder="Pridaj komentár (voliteľné)..."
            placeholderTextColor="#bbb"
            value={review}
            onChangeText={setReview}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <View style={rStyles.actions}>
            <TouchableOpacity style={rStyles.btnCancel} onPress={onClose} activeOpacity={0.8}>
              <Text style={rStyles.btnCancelText}>Neskôr</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[rStyles.btnSubmit, (saving || rating === 0) && { opacity: 0.5 }]}
              onPress={handleSubmit} disabled={saving || rating === 0} activeOpacity={0.85}>
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={rStyles.btnSubmitText}>Odoslať hodnotenie</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const rStyles = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:       { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44 },
  handle:      { width: 38, height: 4, borderRadius: 2, backgroundColor: COLORS.bg3, alignSelf: 'center', marginBottom: 20 },
  title:       { fontSize: 22, fontWeight: '800', color: COLORS.esp, textAlign: 'center', marginBottom: 4 },
  subtitle:    { fontSize: 13, color: COLORS.wal, textAlign: 'center', marginBottom: 24 },
  starsRow:    { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 8 },
  ratingLabel: { fontSize: 14, fontWeight: '700', color: '#F39C12', textAlign: 'center', marginBottom: 16 },
  input:       { borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: 12, padding: 12, fontSize: 13, color: COLORS.esp, minHeight: 80, backgroundColor: COLORS.bg2, marginBottom: 20 },
  actions:     { flexDirection: 'row', gap: 10 },
  btnCancel:   { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.bg3 },
  btnCancelText:{ fontSize: 14, fontWeight: '600', color: COLORS.wal },
  btnSubmit:   { flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#F39C12', justifyContent: 'center' },
  btnSubmitText:{ fontSize: 14, fontWeight: '700', color: '#fff' },
});

// ─── Detail / Účtenka termínu ────────────────────────────────────────────────
function AppointmentDetailSheet({ appointment, onClose }: {
  appointment: Appointment | null; onClose: () => void;
}) {
  if (!appointment) return null;
  const cfg = STATUS_CONFIG[appointment.status];
  const d   = new Date(appointment.appointment_date);
  const svc = appointment.service;

  function formatPrice(min: number | null, max: number | null): string {
    if (min === null && max === null) return 'Cena na vyžiadanie';
    if (min === 0 && max === 0) return 'Zadarmo';
    if (min === max || max === null) return `${min} €`;
    return `${min} – ${max} €`;
  }
  function formatDur(mins: number): string {
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60); const m = mins % 60;
    return m === 0 ? `${h} hod` : `${h} hod ${m} min`;
  }

  const rows: { icon: string; label: string; value: string }[] = [
    { icon: '📅', label: 'Dátum', value: d.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) },
    { icon: '⏰', label: 'Čas', value: d.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' }) },
    { icon: '👨‍⚕️', label: 'Doktor', value: appointment.doctor?.full_name ?? 'MDDr. Loderer' },
    ...(svc ? [
      { icon: svc.emoji ?? '🦷', label: 'Služba', value: svc.name },
      { icon: '⏱', label: 'Trvanie', value: formatDur(svc.duration_minutes) },
      { icon: '💶', label: 'Cena', value: formatPrice(svc.price_min, svc.price_max) },
    ] : []),
    ...(appointment.notes ? [{ icon: '📝', label: 'Poznámka', value: appointment.notes }] : []),
  ];

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={dsStyles.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={dsStyles.sheet}>
          <View style={dsStyles.handle} />

          {/* Status chip */}
          <View style={[dsStyles.statusChip, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
            <Ionicons name={cfg.icon} size={14} color={cfg.color} />
            <Text style={[dsStyles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>

          {/* Title */}
          <Text style={dsStyles.title}>{svc?.name ?? 'Termín'}</Text>
          <Text style={dsStyles.subtitle}>
            {svc?.emoji ?? '🦷'} {d.toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' })}
            {' · '}{d.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' })}
          </Text>

          {/* Detail rows */}
          <View style={dsStyles.rows}>
            {rows.map((r) => (
              <View key={r.label} style={dsStyles.row}>
                <Text style={dsStyles.rowIcon}>{r.icon}</Text>
                <Text style={dsStyles.rowLabel}>{r.label}</Text>
                <Text style={dsStyles.rowValue} numberOfLines={2}>{r.value}</Text>
              </View>
            ))}
          </View>

          {/* Záver doktora */}
          {appointment.status === 'completed' && appointment.doctor_notes && (
            <View style={dsStyles.notesBox}>
              <View style={dsStyles.notesHeader}>
                <Ionicons name="medical" size={14} color="#1A5276" />
                <Text style={dsStyles.notesHeaderText}>ZÁVER DOKTORA</Text>
              </View>
              <Text style={dsStyles.notesText}>{appointment.doctor_notes}</Text>
            </View>
          )}

          <TouchableOpacity style={dsStyles.closeBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={dsStyles.closeBtnText}>Zatvoriť</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const dsStyles = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 40 },
  handle:     { width: 38, height: 4, borderRadius: 2, backgroundColor: COLORS.bg3, alignSelf: 'center', marginBottom: 18 },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10 },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  title:      { fontSize: 20, fontWeight: '700', color: COLORS.esp, marginBottom: 4 },
  subtitle:   { fontSize: 13, color: COLORS.wal, marginBottom: 18 },
  rows:       { backgroundColor: COLORS.bg2, borderRadius: 12, padding: 4, marginBottom: 14 },
  row:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 9, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: COLORS.bg3 },
  rowIcon:    { fontSize: 14, width: 20, textAlign: 'center', marginTop: 1 },
  rowLabel:   { fontSize: 11, fontWeight: '600', color: COLORS.wal, width: 70 },
  rowValue:   { flex: 1, fontSize: 13, color: COLORS.esp, fontWeight: '500', lineHeight: 18 },
  notesBox:   { backgroundColor: '#EBF5FB', borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#AED6F1' },
  notesHeader:{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 7 },
  notesHeaderText: { fontSize: 9, letterSpacing: 2, fontWeight: '700', color: '#1A5276', textTransform: 'uppercase' },
  notesText:  { fontSize: 13, color: '#1A5276', lineHeight: 20 },
  closeBtn:   { backgroundColor: COLORS.esp, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  closeBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

// ─── Hlavná obrazovka ─────────────────────────────────────────────────────────
export default function AppointmentsScreen() {
  const router = useRouter();
  const { appointments, loading, refetch, updateStatus } = useAppointments('patient');
  const [filter, setFilter] = useState<Filter>('all');
  const [rescheduleAppt, setRescheduleAppt] = useState<Appointment | null>(null);
  const [detailAppt, setDetailAppt]         = useState<Appointment | null>(null);
  const [ratingAppt, setRatingAppt]         = useState<Appointment | null>(null);

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  function handleCancel(id: string) {
    Alert.alert('Zrušiť termín', 'Naozaj chcete zrušiť tento termín?', [
      { text: 'Nie', style: 'cancel' },
      { text: 'Áno, zrušiť', style: 'destructive', onPress: async () => {
        const err = await updateStatus(id, 'cancelled');
        if (err) Alert.alert('Chyba', err.message);
      }},
    ]);
  }

  // Grupuj podľa mesiaca
  const filtered = useMemo(() => {
    const list = filter === 'all'
      ? appointments
      : appointments.filter((a) => a.status === filter);
    return [...list].sort(
      (a, b) => new Date(b.appointment_date).getTime() - new Date(a.appointment_date).getTime()
    );
  }, [appointments, filter]);

  const grouped = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    filtered.forEach((a) => {
      const key = getMonthLabel(a.appointment_date);
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });
    return map;
  }, [filtered]);

  // Počty pre filter tabs
  const counts = useMemo(() => ({
    all:       appointments.length,
    scheduled: appointments.filter((a) => a.status === 'scheduled').length,
    completed: appointments.filter((a) => a.status === 'completed').length,
    cancelled: appointments.filter((a) => a.status === 'cancelled').length,
  }), [appointments]);

  const FILTERS: { key: Filter; label: string; color: string }[] = [
    { key: 'all',       label: `Všetky (${counts.all})`,           color: COLORS.wal },
    { key: 'scheduled', label: `Plánované (${counts.scheduled})`,  color: '#1A5276' },
    { key: 'completed', label: `Dokončené (${counts.completed})`,  color: '#1E8449' },
    { key: 'cancelled', label: `Zrušené (${counts.cancelled})`,    color: '#922B21' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Hlavička ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>MÔJ PREHĽAD</Text>
          <Text style={styles.headerTitle}>História termínov</Text>
        </View>
        <View style={styles.totalBadge}>
          <Text style={styles.totalNum}>{counts.all}</Text>
          <Text style={styles.totalLabel}>termínov</Text>
        </View>
      </View>

      {/* ── Filter tabs ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
        {FILTERS.map((f) => (
          <TouchableOpacity key={f.key}
            style={[styles.filterTab, filter === f.key && { backgroundColor: f.color, borderColor: f.color }]}
            onPress={() => setFilter(f.key)} activeOpacity={0.75}>
            <Text style={[styles.filterTabText, filter === f.key && styles.filterTabTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Obsah ── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.wal} size="large" />
          <Text style={styles.loadingText}>Načítavam termíny...</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>📅</Text>
          <Text style={styles.emptyTitle}>Žiadne termíny</Text>
          <Text style={styles.emptySub}>
            {filter === 'all'
              ? 'Zatiaľ nemáš žiadne termíny. Rezervuj si prvý!'
              : `Žiadne termíny v kategórii „${FILTERS.find((f) => f.key === filter)?.label}"`}
          </Text>
          {filter !== 'all' && (
            <TouchableOpacity style={styles.clearFilter} onPress={() => setFilter('all')}>
              <Text style={styles.clearFilterText}>Zobraziť všetky</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {Object.entries(grouped).map(([month, items]) => (
            <View key={month}>
              {/* Mesiac header */}
              <View style={styles.monthHeader}>
                <View style={styles.monthDot} />
                <Text style={styles.monthLabel}>{month}</Text>
                <View style={styles.monthCount}>
                  <Text style={styles.monthCountText}>{items.length}</Text>
                </View>
              </View>

              {items.map((item) => (
                <AppointmentCard key={item.id} item={item}
                  onCancel={() => handleCancel(item.id)}
                  onReschedule={() => setRescheduleAppt(item)}
                  onDetail={() => setDetailAppt(item)}
                  onRate={() => setRatingAppt(item)} />
              ))}
            </View>
          ))}
          <View style={{ height: 30 }} />
        </ScrollView>
      )}

      <RescheduleModal
        visible={!!rescheduleAppt}
        appointment={rescheduleAppt}
        onClose={() => setRescheduleAppt(null)}
        onDone={refetch}
      />

      <AppointmentDetailSheet
        appointment={detailAppt}
        onClose={() => setDetailAppt(null)}
      />

      <RatingModal
        appointment={ratingAppt}
        onClose={() => setRatingAppt(null)}
        onDone={refetch}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },
  center: { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center', padding: 32 },

  header: { backgroundColor: COLORS.esp, paddingHorizontal: SIZES.padding, paddingTop: 14, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerLabel: { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '500', textTransform: 'uppercase', marginBottom: 3 },
  headerTitle: { fontSize: 19, fontWeight: '600', color: '#fff' },
  totalBadge: { backgroundColor: COLORS.wal, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.sand },
  totalNum:   { fontSize: 20, fontWeight: '700', color: '#fff', lineHeight: 24 },
  totalLabel: { fontSize: 8, color: COLORS.cream, letterSpacing: 1, textTransform: 'uppercase' },

  // Filters
  filterScroll:  { maxHeight: 52, backgroundColor: COLORS.bg3 },
  filterContent: { paddingHorizontal: SIZES.padding, paddingVertical: 10, gap: 8 },
  filterTab:     { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.bg3, backgroundColor: '#fff' },
  filterTabText: { fontSize: 11, fontWeight: '600', color: COLORS.wal },
  filterTabTextActive: { color: '#fff' },

  // Month group
  monthHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: SIZES.padding, paddingTop: 18, paddingBottom: 8 },
  monthDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.wal },
  monthLabel: { flex: 1, fontSize: 12, fontWeight: '700', color: COLORS.esp, textTransform: 'capitalize' },
  monthCount: { backgroundColor: COLORS.bg3, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  monthCountText: { fontSize: 10, fontWeight: '700', color: COLORS.wal },

  // Card
  card: { backgroundColor: '#fff', borderRadius: SIZES.radius, marginHorizontal: SIZES.padding, marginBottom: 10, padding: 14, borderWidth: 1, borderColor: COLORS.bg3, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  cardMissed: { borderColor: '#F9E79F', backgroundColor: '#FEFDF0' },

  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  timeBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.esp, alignItems: 'center', justifyContent: 'center' },
  timeDay:   { fontSize: 16, fontWeight: '800', color: '#fff', lineHeight: 18 },
  timeMonth: { fontSize: 9, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase' },
  timeText:  { fontSize: 15, fontWeight: '700', color: COLORS.esp, marginBottom: 2 },
  dateText:  { fontSize: 11, color: COLORS.wal, textTransform: 'capitalize' },

  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  statusText:  { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  divider: { height: 1, backgroundColor: COLORS.bg3, marginBottom: 10 },

  cardBottom: { gap: 6 },
  infoItem:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText:   { fontSize: 12, color: COLORS.wal, flex: 1 },

  actionsRow:       { flexDirection: 'row', gap: 8, marginTop: 10 },
  rescheduleBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 8, backgroundColor: '#F4ECE4', borderWidth: 1, borderColor: COLORS.sand },
  rescheduleBtnText:{ fontSize: 12, fontWeight: '600', color: COLORS.wal },
  cancelBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 8, backgroundColor: '#FDEDEC', borderWidth: 1, borderColor: '#F1948A' },
  cancelBtnText:    { fontSize: 12, fontWeight: '600', color: '#922B21' },

  doctorNotesBox:    { marginTop: 10, backgroundColor: '#EBF5FB', borderRadius: 10, padding: 11, borderWidth: 1, borderColor: '#AED6F1' },
  doctorNotesHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 },
  doctorNotesLabel:  { fontSize: 9, fontWeight: '800', color: '#1A5276', letterSpacing: 1.5, textTransform: 'uppercase' },
  doctorNotesText:   { fontSize: 12, color: '#1A5276', lineHeight: 18 },

  detailHint:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, justifyContent: 'center' },
  detailHintText: { fontSize: 10, color: COLORS.wal, fontStyle: 'italic' },

  // Rating
  ratingRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.bg3 },
  ratingText: { fontSize: 11, fontWeight: '600', color: '#F39C12', marginLeft: 4 },
  rateBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, paddingVertical: 9, borderRadius: 8, backgroundColor: '#FEF9E7', borderWidth: 1, borderColor: '#F9E79F' },
  rateBtnText:{ fontSize: 12, fontWeight: '600', color: '#9A7D0A' },

  // Empty / loading
  loadingText: { marginTop: 12, color: COLORS.wal, fontSize: 13 },
  emptyIcon:   { fontSize: 52, marginBottom: 14 },
  emptyTitle:  { fontSize: 17, fontWeight: '600', color: COLORS.esp, marginBottom: 6, textAlign: 'center' },
  emptySub:    { fontSize: 13, color: COLORS.wal, textAlign: 'center', lineHeight: 20 },
  clearFilter: { marginTop: 18, backgroundColor: COLORS.wal, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  clearFilterText: { fontSize: 13, fontWeight: '600', color: '#fff' },
});
