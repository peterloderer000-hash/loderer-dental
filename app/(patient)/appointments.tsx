import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { ActivityIndicator, Alert, Animated, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, RADII, GRADIENTS } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { useAppTheme } from '../../context/ThemeContext';
import { useAppointments, Appointment } from '../../hooks/useAppointments';
import { supabase } from '../../supabase';
import { exportPatientHistory } from '../../utils/exportPDF';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { MonthCalendar } from '../../components/MonthCalendar';
import {
  generateTimeSlotsForDay,
  jsDayToDb, timeToMinutes,
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
  pending:   { label: 'Čaká na schválenie', bg: '#FEF9E7', color: '#7D6608', border: '#F9E79F', icon: 'hourglass-outline' as const },
  scheduled: { label: 'Naplánovaný',        bg: '#EBF5FB', color: '#1A5276', border: '#AED6F1', icon: 'time-outline' as const },
  arrived:   { label: 'V čakárni 🟢',       bg: '#E8F8F5', color: '#0E6655', border: '#A2D9CE', icon: 'walk-outline' as const },
  completed: { label: 'Dokončený',           bg: '#EAFAF1', color: '#1E8449', border: '#A9DFBF', icon: 'checkmark-circle-outline' as const },
  cancelled: { label: 'Zrušený',             bg: '#FDEDEC', color: '#922B21', border: '#F1948A', icon: 'close-circle-outline' as const },
};

type Filter = 'all' | 'pending' | 'scheduled' | 'arrived' | 'completed' | 'cancelled';

type WaitingEntry = {
  id: string;
  status: string;
  preferred_date: string | null;
  notes: string | null;
  service: { name: string; emoji: string | null } | null;
  created_at: string;
};

// ─── Karta termínu ────────────────────────────────────────────────────────────
function isToday(dateStr: string) {
  const d = new Date(dateStr);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

const AppointmentCard = React.memo(function AppointmentCard({ item, onCancel, onReschedule, onDetail, onRate, onCheckIn, onQuestionnaire }: {
  item: Appointment; onCancel: () => void; onReschedule: () => void;
  onDetail: () => void; onRate: () => void; onCheckIn: () => void; onQuestionnaire: () => void;
}) {
  const { colors, dark } = useAppTheme();
  const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.scheduled;
  const now = new Date();
  const apptDate = new Date(item.appointment_date);
  const isPast = apptDate < now;
  const canCancel     = (item.status === 'scheduled' || item.status === 'pending') && !isPast;
  const canReschedule = item.status === 'scheduled' && !isPast;
  const canCheckIn    = item.status === 'scheduled' && isToday(item.appointment_date) && (apptDate.getTime() - now.getTime()) < 2 * 60 * 60 * 1000;
  // Dotazník: 48h pred termínom, ešte neplánovaný/scheduled
  const hoursUntil = (apptDate.getTime() - now.getTime()) / (60 * 60 * 1000);
  const canFillQuestionnaire = item.status === 'scheduled' && !isPast && hoursUntil <= 48 && hoursUntil > 0;

  return (
    <TouchableOpacity style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, isPast && item.status === 'scheduled' && styles.cardMissed]} onPress={onDetail} activeOpacity={0.9}>
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
        <View style={[styles.statusBadge, { backgroundColor: dark ? cfg.color + '22' : cfg.bg, borderColor: dark ? cfg.color + '44' : cfg.border }]}>
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
            <Text style={styles.infoText}>{item.service?.name}</Text>
          </View>
        )}
        <View style={styles.infoItem}>
          <Ionicons name="person-outline" size={13} color={COLORS.wal} />
          <Text style={styles.infoText}>{item.doctor?.full_name ?? 'MDDr. Loderer'}</Text>
        </View>
        {item.family_member_name ? (
          <View style={styles.infoItem}>
            <Text style={{ fontSize: 13 }}>👶</Text>
            <Text style={[styles.infoText, { color: '#784212', fontWeight: '600' }]}>
              Pre: {item.family_member_name}
            </Text>
          </View>
        ) : item.notes ? (
          <View style={styles.infoItem}>
            <Ionicons name="document-text-outline" size={13} color={COLORS.wal} />
            <Text style={styles.infoText} numberOfLines={1}>{item.notes}</Text>
          </View>
        ) : null}
      </View>

      {/* Stav platby — zobrazí sa na dokončených termínoch */}
      {item.status === 'completed' && item.payment_status && item.payment_status !== 'unpaid' && (
        <View style={[styles.payBadge,
          item.payment_status === 'paid'    ? styles.payPaid    :
          item.payment_status === 'partial' ? styles.payPartial : {}
        ]}>
          <Text style={[styles.payBadgeText,
            item.payment_status === 'paid'    ? styles.payPaidText    :
            item.payment_status === 'partial' ? styles.payPartialText : {}
          ]}>
            {item.payment_status === 'paid'    ? '✅ Zaplatené'   :
             item.payment_status === 'partial' ? '⚠️ Čiastočne'  : ''}
          </Text>
        </View>
      )}

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
      {/* Pokyny po ošetrení */}
      {item.status === 'completed' && item.care_instructions ? (
        <View style={styles.careBox}>
          <View style={styles.careBoxHeader}>
            <Text style={styles.careBoxIcon}>📋</Text>
            <Text style={styles.careBoxLabel}>POKYNY PO OŠETRENÍ</Text>
          </View>
          <Text style={styles.careBoxText}>{item.care_instructions}</Text>
        </View>
      ) : null}

      {/* Predtermínový dotazník */}
      {canFillQuestionnaire && (
        <TouchableOpacity
          style={[styles.questionnaireBtn, { backgroundColor: dark ? '#0D2233' : '#EBF5FB', borderColor: dark ? '#1A5276' : '#AED6F1' }]}
          onPress={onQuestionnaire} activeOpacity={0.85}
        >
          <Ionicons name="clipboard-outline" size={16} color={dark ? '#5DADE2' : COLORS.info} />
          <Text style={[styles.questionnaireBtnText, { color: dark ? '#5DADE2' : COLORS.info }]}>Vyplniť predtermínový dotazník</Text>
          <Ionicons name="chevron-forward" size={14} color={dark ? '#5DADE2' : COLORS.info} />
        </TouchableOpacity>
      )}

      {/* Check-in — "Prišiel som" tlačidlo */}
      {canCheckIn && (
        <TouchableOpacity style={styles.checkInBtn} onPress={onCheckIn} activeOpacity={0.85}>
          <Text style={styles.checkInBtnEmoji}>🚶</Text>
          <Text style={styles.checkInBtnText}>Prišiel som — ohlásiť sa v čakárni</Text>
        </TouchableOpacity>
      )}
      {/* Arrived info */}
      {item.status === 'arrived' && (
        <View style={styles.arrivedBox}>
          <Text style={styles.arrivedEmoji}>✅</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.arrivedTitle}>Si v čakárni</Text>
            <Text style={styles.arrivedSub}>Doktor bude vedieť, že si prišiel. Chvíľu počkaj.</Text>
          </View>
        </View>
      )}
      {/* Akcie — zrušiť pre pending + scheduled, presunúť len pre scheduled */}
      {canCancel && (
        <View style={styles.actionsRow}>
          {canReschedule && (
            <TouchableOpacity style={styles.rescheduleBtn} onPress={onReschedule} activeOpacity={0.8}>
              <Ionicons name="calendar-outline" size={14} color={COLORS.wal} />
              <Text style={styles.rescheduleBtnText}>Presunúť</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.cancelBtn, !canReschedule && { flex: 1 }]} onPress={onCancel} activeOpacity={0.8}>
            <Ionicons name="close-circle-outline" size={14} color="#922B21" />
            <Text style={styles.cancelBtnText}>{item.status === 'pending' ? 'Odvolať žiadosť' : 'Zrušiť'}</Text>
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
});

// ─── Reschedule Modal ────────────────────────────────────────────────────────
function RescheduleModal({ visible, appointment, onClose, onDone }: {
  visible: boolean;
  appointment: Appointment | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { colors } = useAppTheme();
  const [openingHoursMap, setOpeningHoursMap] = useState<Map<number, OpeningHour>>(new Map());
  const [bookedSlots,  setBookedSlots]  = useState<BookedSlot[]>([]);
  const [selDate, setSelDate] = useState<Date | null>(null);
  const [selTime, setSelTime] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const openDbDays = useMemo(() => new Set(openingHoursMap.keys()), [openingHoursMap]);

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

  // Načítaj ordinačné hodiny
  useEffect(() => {
    if (!visible || !appointment) return;
    setSelDate(null); setSelTime('');
    // Použijeme doctor_id priamo z termínu — nie prvého doktora v DB
    supabase.from('opening_hours')
      .select('day_of_week, open_time, close_time, is_closed')
      .eq('doctor_id', appointment.doctor_id)
      .then(({ data: hours }) => {
        const map = new Map<number, OpeningHour>();
        (hours ?? []).forEach(h => {
          if (!h.is_closed && h.open_time && h.close_time)
            map.set(h.day_of_week, { open_time: h.open_time.slice(0,5), close_time: h.close_time.slice(0,5) });
        });
        if (map.size === 0) for (let d = 1; d <= 5; d++) map.set(d, { open_time: '08:00', close_time: '17:00' });
        setOpeningHoursMap(map);
      }).catch(() => {});
  }, [visible, appointment]);

  // Načítaj obsadené sloty pre vybraný deň (okrem aktuálneho termínu)
  useEffect(() => {
    if (!selDate || !appointment) { setBookedSlots([]); return; }
    let cancelled = false;
    setLoadingSlots(true);
    const dayStart = new Date(selDate); dayStart.setHours(0,0,0,0);
    const dayEnd   = new Date(selDate); dayEnd.setHours(23,59,59,999);
    supabase.from('appointments')
      .select('appointment_date, service:services(duration_minutes)')
      .eq('doctor_id', appointment.doctor_id)
      .in('status', ['scheduled', 'pending'])
      .neq('id', appointment.id) // vylúč aktuálny termín
      .gte('appointment_date', dayStart.toISOString())
      .lte('appointment_date', dayEnd.toISOString())
      .then(({ data }) => {
        if (cancelled) return;
        setLoadingSlots(false);
        setBookedSlots((data ?? []).map(a => {
          const d = new Date(a.appointment_date);
          const s = d.getHours() * 60 + d.getMinutes();
          return { start: s, end: s + ((a.service as any)?.duration_minutes ?? 30) };
        }));
      }).catch(() => {});
    return () => { cancelled = true; };
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
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const dateStr = dt.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' });
    // Notifikuj doktora o presune termínu
    supabase.from('notifications').insert({
      user_id:        appointment.doctor_id,
      title:          '📅 Pacient presunutý termín',
      body:           `${appointment.patient?.full_name ?? 'Pacient'} presunutý termín${appointment.service ? ` (${appointment.service.name})` : ''} na ${dateStr} o ${selTime}.`,
      type:           'info',
      appointment_id: appointment.id,
    }).then(null, () => {});
    Alert.alert('Termín presunutý ✓',
      `Nový termín: ${dateStr} o ${selTime}`,
      [{ text: 'OK', onPress: () => { onDone(); onClose(); } }]
    );
  }

  if (!appointment) return null;
  const dur = appointment.service?.duration_minutes ?? 30;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={rs.overlay}>
        <View style={[rs.sheet, { backgroundColor: colors.cardBg }]}>
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
          <MonthCalendar
            selectedDate={selDate}
            onSelectDate={(d) => { setSelDate(d); setSelTime(''); }}
            openDbDays={openDbDays}
            maxMonthsAhead={12}
            warnMonthsAhead={6}
          />

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
  sheet:       { backgroundColor: COLORS.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: '85%' },
  handle:      { width: 38, height: 4, borderRadius: 2, backgroundColor: COLORS.bg3, alignSelf: 'center', marginBottom: 18 },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
  sheetTitle:  { fontSize: 18, fontWeight: '700', color: COLORS.esp, marginBottom: 3 },
  sheetSub:    { fontSize: 12, color: COLORS.wal },
  label:       { fontSize: 9, fontWeight: '700', color: COLORS.wal, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 },


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
  const { colors, dark } = useAppTheme();
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
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Ďakujeme za hodnotenie! ⭐', LABELS[rating], [
      { text: 'OK', onPress: () => { onDone(); onClose(); } },
    ]);
  }

  if (!appointment) return null;

  const LABELS = ['', 'Veľmi zlý', 'Zlý', 'Dobrý', 'Veľmi dobrý', 'Výborný!'];

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={rStyles.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[rStyles.sheet, { backgroundColor: colors.cardBg }]}>
          <View style={[rStyles.handle, { backgroundColor: colors.bg3 }]} />
          <Text style={[rStyles.title, { color: colors.textPrimary }]}>Ohodnoť návštevu</Text>
          <Text style={[rStyles.subtitle, { color: colors.textSecondary }]}>
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
            style={[rStyles.input, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
            placeholder="Pridaj komentár (voliteľné)..."
            placeholderTextColor={dark ? '#666' : '#999'}
            value={review}
            onChangeText={setReview}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <View style={rStyles.actions}>
            <TouchableOpacity style={[rStyles.btnCancel, { borderColor: colors.bg3 }]} onPress={onClose} activeOpacity={0.8}>
              <Text style={[rStyles.btnCancelText, { color: colors.textSecondary }]}>Neskôr</Text>
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
  sheet:       { backgroundColor: COLORS.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44 },
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
  const { colors, dark } = useAppTheme();
  if (!appointment) return null;
  const cfg = STATUS_CONFIG[appointment.status] ?? STATUS_CONFIG.scheduled;
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
        <View style={[dsStyles.sheet, { backgroundColor: colors.cardBg }]}>
          <View style={[dsStyles.handle, { backgroundColor: colors.bg3 }]} />

          {/* Status chip */}
          <View style={[dsStyles.statusChip, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
            <Ionicons name={cfg.icon} size={14} color={cfg.color} />
            <Text style={[dsStyles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>

          {/* Title */}
          <Text style={[dsStyles.title, { color: colors.textPrimary }]}>{svc?.name ?? 'Termín'}</Text>
          <Text style={[dsStyles.subtitle, { color: colors.textSecondary }]}>
            {svc?.emoji ?? '🦷'} {d.toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' })}
            {' · '}{d.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' })}
          </Text>

          {/* Detail rows */}
          <View style={[dsStyles.rows, { backgroundColor: colors.bg2 }]}>
            {rows.map((r) => (
              <View key={r.label} style={[dsStyles.row, { borderBottomColor: colors.bg3 }]}>
                <Text style={dsStyles.rowIcon}>{r.icon}</Text>
                <Text style={[dsStyles.rowLabel, { color: colors.textSecondary }]}>{r.label}</Text>
                <Text style={[dsStyles.rowValue, { color: colors.textPrimary }]} numberOfLines={2}>{r.value}</Text>
              </View>
            ))}
          </View>

          {/* Check-in kód pre recepciu */}
          {(appointment.status === 'scheduled' || appointment.status === 'pending') && (
            <View style={dsStyles.checkinBox}>
              <View style={dsStyles.checkinHeader}>
                <Ionicons name="qr-code-outline" size={14} color="#7D3C98" />
                <Text style={dsStyles.checkinHeaderText}>KÓD PRE PRÍCHOD</Text>
              </View>
              <Text style={dsStyles.checkinCode}>{appointment.id.slice(0, 8).toUpperCase()}</Text>
              <Text style={dsStyles.checkinHint}>Ukáž tento kód na recepcii pri príchode</Text>
            </View>
          )}

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
          {/* Pokyny po ošetrení */}
          {appointment.status === 'completed' && appointment.care_instructions && (
            <View style={[dsStyles.notesBox, { backgroundColor: '#FDFDE7', borderColor: '#F9E79F' }]}>
              <View style={dsStyles.notesHeader}>
                <Text style={{ fontSize: 14 }}>📋</Text>
                <Text style={[dsStyles.notesHeaderText, { color: '#9A7D0A' }]}>POKYNY PO OŠETRENÍ</Text>
              </View>
              <Text style={[dsStyles.notesText, { color: '#6D4C0A' }]}>{appointment.care_instructions}</Text>
            </View>
          )}
          {/* Stav platby */}
          {appointment.status === 'completed' && appointment.payment_status && (
            <View style={[dsStyles.notesBox, {
              backgroundColor:
                appointment.payment_status === 'paid'    ? '#EAFAF1' :
                appointment.payment_status === 'partial' ? '#FEF9E7' : '#FDEDEC',
              borderColor:
                appointment.payment_status === 'paid'    ? '#A9DFBF' :
                appointment.payment_status === 'partial' ? '#F9E79F' : '#F5B7B1',
            }]}>
              <View style={dsStyles.notesHeader}>
                <Text style={{ fontSize: 14 }}>🧾</Text>
                <Text style={[dsStyles.notesHeaderText, {
                  color:
                    appointment.payment_status === 'paid'    ? '#1E8449' :
                    appointment.payment_status === 'partial' ? '#7D6608' : '#922B21',
                }]}>STAV PLATBY</Text>
              </View>
              <Text style={[dsStyles.notesText, {
                color:
                  appointment.payment_status === 'paid'    ? '#1E8449' :
                  appointment.payment_status === 'partial' ? '#7D6608' : '#922B21',
                fontWeight: '700',
              }]}>
                {appointment.payment_status === 'paid'    ? '✅ Platba potvrdená' :
                 appointment.payment_status === 'partial' ? '⚠️ Čiastočná platba' :
                                                            '💸 Nezaplatené'}
              </Text>
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
  sheet:      { backgroundColor: COLORS.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 40 },
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
  checkinBox:        { backgroundColor: '#F5EEF8', borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1.5, borderColor: '#D2B4DE', alignItems: 'center' },
  checkinHeader:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  checkinHeaderText: { fontSize: 9, letterSpacing: 2, fontWeight: '700', color: '#7D3C98', textTransform: 'uppercase' },
  checkinCode:       { fontSize: 30, fontWeight: '900', color: '#6C3483', letterSpacing: 8 },
  checkinHint:       { fontSize: 12, color: '#7D3C98', marginTop: 6 },
});

// ─── Hlavná obrazovka ─────────────────────────────────────────────────────────
export default function AppointmentsScreen() {
  const router = useRouter();
  const { appointments, loading, refetch, updateStatus, selfCheckIn } = useAppointments('patient');
  const [filter, setFilter] = useState<Filter>('all');
  const [rescheduleAppt, setRescheduleAppt] = useState<Appointment | null>(null);
  const [detailAppt, setDetailAppt]         = useState<Appointment | null>(null);
  const [ratingAppt, setRatingAppt]         = useState<Appointment | null>(null);
  const [patientName, setPatientName]       = useState('Pacient');
  const [exporting,  setExporting]          = useState(false);
  const [waitingList, setWaitingList]       = useState<WaitingEntry[]>([]);

  const loadWaiting = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('waiting_list')
      .select('id, status, preferred_date, notes, created_at, service:services(name, emoji)')
      .eq('patient_id', user.id)
      .eq('status', 'waiting')
      .order('created_at', { ascending: false });
    setWaitingList((data ?? []).map((r: any) => ({
      id: r.id,
      status: r.status,
      preferred_date: r.preferred_date,
      notes: r.notes,
      service: r.service ?? null,
      created_at: r.created_at,
    })));
  }, []);

  const { colors, dark } = useAppTheme();
  const dyn = {
    bg:   { backgroundColor: colors.bg2 },
    card: { backgroundColor: colors.cardBg, borderColor: colors.bg3 },
    text: { color: colors.textPrimary },
    sub:  { color: colors.textSecondary },
  };
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(useCallback(() => { refetch(); loadWaiting(); }, [refetch, loadWaiting]));

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([refetch(), loadWaiting()]);
    setRefreshing(false);
  }

  async function handleCancelWaiting(entry: WaitingEntry) {
    Alert.alert(
      'Odstrániť z čakacej listiny',
      `Naozaj chcete odstrániť zápis${entry.service ? ` (${entry.service.name})` : ''} z čakacej listiny?`,
      [
        { text: 'Nie', style: 'cancel' },
        { text: 'Áno, odstrániť', style: 'destructive', onPress: async () => {
          await supabase.from('waiting_list').update({ status: 'cancelled' }).eq('id', entry.id);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setWaitingList((prev) => prev.filter((e) => e.id !== entry.id));
        }},
      ]
    );
  }

  // Načítaj meno pacienta pre PDF
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('profiles').select('full_name').eq('id', user.id).single()
        .then(({ data }) => { if (data?.full_name) setPatientName(data.full_name); });
    }).catch(() => {});
  }, []);

  async function handleExport() {
    setExporting(true);
    try {
      await exportPatientHistory(patientName, appointments);
    } finally {
      setExporting(false);
    }
  }

  function handleCancel(appt: Appointment) {
    const isPending = appt.status === 'pending';
    Alert.alert(
      isPending ? 'Odvolať žiadosť' : 'Zrušiť termín',
      isPending
        ? 'Naozaj chcete odvolať túto žiadosť o termín?'
        : 'Naozaj chcete zrušiť tento termín?',
      [
        { text: 'Nie', style: 'cancel' },
        { text: isPending ? 'Áno, odvolať' : 'Áno, zrušiť', style: 'destructive', onPress: async () => {
          const err = await updateStatus(appt.id, 'cancelled');
          if (err) { Alert.alert('Chyba', err.message); return; }
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          // Notifikuj doktora pri zrušení potvrdeného termínu
          if (!isPending) {
            const timeStr = new Date(appt.appointment_date).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
            const dateStr = new Date(appt.appointment_date).toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' });
            supabase.from('notifications').insert({
              user_id:        appt.doctor_id,
              title:          '⚠️ Pacient zrušil termín',
              body:           `${appt.patient?.full_name ?? 'Pacient'} zrušil termín${appt.service ? ` (${appt.service.name})` : ''} na ${dateStr} o ${timeStr}.`,
              type:           'warning',
              appointment_id: appt.id,
            }).then(null, () => {});
          }
        }},
      ]
    );
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
    pending:   appointments.filter((a) => a.status === 'pending').length,
    scheduled: appointments.filter((a) => a.status === 'scheduled').length,
    arrived:   appointments.filter((a) => a.status === 'arrived').length,
    completed: appointments.filter((a) => a.status === 'completed').length,
    cancelled: appointments.filter((a) => a.status === 'cancelled').length,
  }), [appointments]);

  const FILTERS = useMemo<{ key: Filter; label: string; color: string }[]>(() => [
    { key: 'all',       label: `Všetky (${counts.all})`,             color: COLORS.wal },
    ...(counts.pending > 0 ? [{ key: 'pending' as Filter, label: `Čakajúce (${counts.pending})`, color: '#D4AC0D' }] : []),
    { key: 'scheduled', label: `Plánované (${counts.scheduled})`,    color: '#1A5276' },
    ...(counts.arrived > 0 ? [{ key: 'arrived' as Filter, label: `V čakárni (${counts.arrived})`, color: '#0E6655' }] : []),
    { key: 'completed', label: `Dokončené (${counts.completed})`,    color: '#1E8449' },
    { key: 'cancelled', label: `Zrušené (${counts.cancelled})`,      color: '#922B21' },
  ], [counts]);

  return (
    <View style={styles.safe}>
      <HeroHeader
        title="História termínov"
        subtitle={`${counts.all} termínov celkovo`}
        icon="calendar-outline"
        onBack={() => router.back()}
        rightAction={
          <TouchableOpacity
            style={[styles.exportBtn, exporting && { opacity: 0.5 }]}
            onPress={handleExport}
            disabled={exporting || appointments.length === 0}
            activeOpacity={0.8}>
            {exporting
              ? <ActivityIndicator color={COLORS.cream} size="small" />
              : <Ionicons name="download-outline" size={18} color={COLORS.gold} />}
          </TouchableOpacity>
        }
      />

      {/* ── Čakacia listina ── */}
      {waitingList.length > 0 && (
        <View style={styles.wlSection}>
          <View style={styles.wlSectionHeader}>
            <Text style={styles.wlSectionTitle}>⏳ ČAKACIA LISTINA</Text>
            <View style={styles.wlBadge}>
              <Text style={styles.wlBadgeText}>{waitingList.length}</Text>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.wlScroll}>
            {waitingList.map((entry) => (
              <View key={entry.id} style={[styles.wlCard, { backgroundColor: colors.cardBg, borderColor: dark ? '#27AE6044' : '#A2D9CE' }]}>
                <Text style={styles.wlEmoji}>{entry.service?.emoji ?? '⏳'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.wlService} numberOfLines={1}>
                    {entry.service?.name ?? 'Čakáte na termín'}
                  </Text>
                  {entry.preferred_date && (
                    <Text style={styles.wlDate}>
                      Preferovaný dátum: {new Date(entry.preferred_date).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' })}
                    </Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => handleCancelWaiting(entry)} activeOpacity={0.75} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={18} color="#E74C3C" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── Filter tabs ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
        {FILTERS.map((f) => (
          <TouchableOpacity key={f.key}
            style={[styles.filterTab, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, filter === f.key && { backgroundColor: f.color, borderColor: f.color }]}
            onPress={() => setFilter(f.key)} activeOpacity={0.75}>
            <Text style={[styles.filterTabText, filter === f.key && styles.filterTabTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Obsah ── */}
      {loading ? (
        <SkeletonList count={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="📅"
          title="Žiadne termíny"
          subtitle={
            filter === 'all'
              ? 'Zatiaľ nemáš žiadne termíny. Rezervuj si prvý!'
              : `Žiadne termíny v kategórii „${FILTERS.find((f) => f.key === filter)?.label}"`
          }
          action={filter !== 'all' ? { label: 'Zobraziť všetky', onPress: () => setFilter('all') } : undefined}
        />
      ) : (
        <ScrollView style={[styles.scroll, dyn.bg]} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.gold} />}>
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
                  onCancel={() => handleCancel(item)}
                  onReschedule={() => setRescheduleAppt(item)}
                  onDetail={() => setDetailAppt(item)}
                  onRate={() => setRatingAppt(item)}
                  onQuestionnaire={() => router.push({
                    pathname: '/(patient)/pre-questionnaire' as any,
                    params: {
                      appointmentId:   item.id,
                      appointmentDate: item.appointment_date,
                      doctorId:        item.doctor_id,
                      serviceName:     item.service?.name ?? '',
                    },
                  })}
                  onCheckIn={async () => {
                    const err = await selfCheckIn(item.id);
                    if (err) { Alert.alert('Chyba', err.message); return; }
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    await supabase.from('notifications').insert({
                      user_id:        item.doctor_id,
                      title:          '🟢 Pacient je v čakárni',
                      body:           `${item.patient?.full_name ?? 'Pacient'} prišiel na termín${item.service ? ` — ${item.service?.name}` : ''}.`,
                      type:           'info',
                      appointment_id: item.id,
                    }).then(({ error }) => { if (error) console.warn('Notif error:', error.message); });
                    Alert.alert('✅ Ohlásený!', 'Doktor vidí, že si v čakárni. Chvíľu počkaj.');
                  }} />
              ))}
            </View>
          ))}
          <View style={{ height: 90 }} />
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
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },
  center: { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center', padding: 32 },

  header: { backgroundColor: COLORS.esp, paddingHorizontal: SPACING.xl, paddingTop: 14, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  exportBtn:  { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(201,168,76,0.15)', alignItems: 'center', justifyContent: 'center' },

  // Waiting list section
  wlSection:       { backgroundColor: '#E8F8F5', borderBottomWidth: 1, borderBottomColor: '#A2D9CE', paddingVertical: 10 },
  wlSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACING.xl, marginBottom: 8 },
  wlSectionTitle:  { fontSize: 9, letterSpacing: 1.5, fontWeight: '700', color: '#0E6655', textTransform: 'uppercase' },
  wlBadge:         { backgroundColor: '#17A589', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 1 },
  wlBadgeText:     { fontSize: 9, fontWeight: '800', color: '#fff' },
  wlScroll:        { paddingHorizontal: SPACING.xl, gap: 8 },
  wlCard:          { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.cream, borderRadius: 10, borderWidth: 1.5, borderColor: '#A2D9CE', paddingHorizontal: 12, paddingVertical: 9, maxWidth: 260 },
  wlEmoji:         { fontSize: 18 },
  wlService:       { fontSize: 13, fontWeight: '700', color: '#0E6655', marginBottom: 2 },
  wlDate:          { fontSize: 11, color: '#17A589' },

  // Filters
  filterScroll:  { flexShrink: 0, flexGrow: 0 },
  filterContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterTab:     { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: COLORS.bg3, backgroundColor: '#FAFAF8' },
  filterTabText: { fontSize: 13, fontFamily: 'DMSans_500Medium', color: COLORS.wal },
  filterTabTextActive: { color: '#fff', fontFamily: 'DMSans_500Medium', fontSize: 13 },

  // Month group
  monthHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: SPACING.xl, paddingTop: 18, paddingBottom: 8 },
  monthDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.gold },
  monthLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.esp, textTransform: 'capitalize' },
  monthCount: { backgroundColor: COLORS.bg3, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  monthCountText: { fontSize: 11, fontWeight: '700', color: COLORS.wal },

  // Card
  card: { backgroundColor: COLORS.cream, borderRadius: RADII.md, marginHorizontal: SPACING.xl, marginBottom: 10, padding: 14, borderWidth: 1, borderColor: COLORS.bg3, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  cardMissed: { borderColor: '#F9E79F', backgroundColor: '#FEFDF0' },

  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  timeBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.esp, alignItems: 'center', justifyContent: 'center' },
  timeDay:   { fontSize: 16, fontWeight: '800', color: '#fff', lineHeight: 18 },
  timeMonth: { fontSize: 9, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase' },
  timeText:  { fontSize: 15, fontWeight: '700', color: COLORS.esp, marginBottom: 2 },
  dateText:  { fontSize: 12, color: COLORS.wal, textTransform: 'capitalize' },

  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  statusText:  { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  divider: { height: 1, backgroundColor: COLORS.bg3, marginBottom: 10 },

  cardBottom: { gap: 6 },
  infoItem:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText:   { fontSize: 13, color: COLORS.wal, flex: 1 },

  actionsRow:       { flexDirection: 'row', gap: 8, marginTop: 10 },
  rescheduleBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 8, backgroundColor: '#E2DDD6', borderWidth: 1, borderColor: COLORS.sand },
  rescheduleBtnText:{ fontSize: 13, fontWeight: '600', color: COLORS.wal },
  cancelBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 8, backgroundColor: '#FDEDEC', borderWidth: 1, borderColor: '#F1948A' },
  cancelBtnText:    { fontSize: 13, fontWeight: '600', color: '#922B21' },

  // Check-in
  questionnaireBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5 },
  questionnaireBtnText: { flex: 1, fontSize: 13, fontFamily: 'DMSans_500Medium' },
  checkInBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, paddingVertical: 12, borderRadius: 12, backgroundColor: '#0E6655', borderWidth: 1.5, borderColor: '#0B5345' },
  checkInBtnEmoji:{ fontSize: 16 },
  checkInBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  arrivedBox:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: '#E8F8F5', borderWidth: 1, borderColor: '#A2D9CE' },
  arrivedEmoji:   { fontSize: 22 },
  arrivedTitle:   { fontSize: 13, fontWeight: '700', color: '#0E6655' },
  arrivedSub:     { fontSize: 12, color: '#0E6655', lineHeight: 17, marginTop: 2 },

  doctorNotesBox:    { marginTop: 10, backgroundColor: '#EBF5FB', borderRadius: 10, padding: 11, borderWidth: 1, borderColor: '#AED6F1' },
  doctorNotesHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 },
  doctorNotesLabel:  { fontSize: 9, fontWeight: '800', color: '#1A5276', letterSpacing: 1.5, textTransform: 'uppercase' },
  doctorNotesText:   { fontSize: 13, color: '#1A5276', lineHeight: 19 },

  careBox:       { marginTop: 10, backgroundColor: '#FDFDE7', borderRadius: 10, padding: 11, borderWidth: 1.5, borderColor: '#F9E79F' },
  careBoxHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  careBoxIcon:   { fontSize: 13 },
  careBoxLabel:  { fontSize: 9, fontWeight: '800', color: '#9A7D0A', letterSpacing: 1.5, textTransform: 'uppercase' },
  careBoxText:   { fontSize: 13, color: '#6D4C0A', lineHeight: 19 },

  detailHint:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, justifyContent: 'center' },
  detailHintText: { fontSize: 11, color: COLORS.wal, fontStyle: 'italic' },

  // Stav platby
  payBadge:        { flexDirection: 'row', alignItems: 'center', marginTop: 8, alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.bg3, backgroundColor: '#F5F5F5' },
  payPaid:         { backgroundColor: '#EAFAF1', borderColor: '#A9DFBF' },
  payPartial:      { backgroundColor: '#FEF9E7', borderColor: '#F9E79F' },
  payBadgeText:    { fontSize: 11, fontWeight: '600', color: COLORS.wal },
  payPaidText:     { color: '#1E8449' },
  payPartialText:  { color: '#7D6608' },

  // Rating
  ratingRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.bg3 },
  ratingText: { fontSize: 12, fontWeight: '600', color: '#F39C12', marginLeft: 4 },
  rateBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, paddingVertical: 9, borderRadius: 8, backgroundColor: '#FEF9E7', borderWidth: 1, borderColor: '#F9E79F' },
  rateBtnText:{ fontSize: 13, fontWeight: '600', color: '#9A7D0A' },

  // Empty / loading
  loadingText: { marginTop: 12, color: COLORS.wal, fontSize: 13 },
  emptyIcon:   { fontSize: 52, marginBottom: 14 },
  emptyTitle:  { fontSize: 17, fontWeight: '600', color: COLORS.esp, marginBottom: 6, textAlign: 'center' },
  emptySub:    { fontSize: 13, color: COLORS.wal, textAlign: 'center', lineHeight: 20 },
  clearFilter: { marginTop: 18, backgroundColor: COLORS.gold, borderRadius: RADII.sm, paddingHorizontal: 20, paddingVertical: 10 },
  clearFilterText: { fontSize: 13, fontWeight: '600', color: '#1A1209' },
});

