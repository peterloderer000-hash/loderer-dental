import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../../../styles/theme';
import type { Appointment } from '../../../hooks/useAppointments';

// ─── Odpočítavanie ────────────────────────────────────────────────────────────
function getCountdown(dateStr: string): { text: string; urgent: boolean } {
  const now  = new Date();
  const appt = new Date(dateStr);
  const diffMs  = appt.getTime() - now.getTime();
  const diffMin = Math.round(diffMs / 60000);

  if (diffMin <= 0)  return { text: '🔔 Práve prebieha', urgent: true };
  if (diffMin < 60)  return { text: `⏱ Za ${diffMin} minút`, urgent: true };

  const timeStr    = appt.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
  const isToday    = appt.toDateString() === now.toDateString();
  const tomorrow   = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = appt.toDateString() === tomorrow.toDateString();

  if (isToday) {
    const h = Math.round(diffMs / 3600000);
    return { text: `📅 Dnes o ${timeStr} · za ${h} hod`, urgent: false };
  }
  if (isTomorrow) return { text: `📅 Zajtra o ${timeStr}`, urgent: false };

  const diffDays = Math.ceil(diffMs / 86400000);
  return { text: `📅 Za ${diffDays} dní · ${timeStr}`, urgent: false };
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60); const m = mins % 60;
  return m === 0 ? `${h} hod` : `${h} hod ${m} min`;
}

type Props = {
  appointment: Appointment;
  onPress?: () => void;
  onCancel?: () => void;
  onReschedule?: () => void;
};

export default function UpcomingAppointmentCard({ appointment, onPress, onCancel, onReschedule }: Props) {
  const [countdown, setCountdown] = useState(() => getCountdown(appointment.appointment_date));

  // Aktualizuj countdown každú minútu
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(getCountdown(appointment.appointment_date));
    }, 60_000);
    return () => clearInterval(interval);
  }, [appointment.appointment_date]);

  const appt    = new Date(appointment.appointment_date);
  const dayNum  = appt.getDate();
  const dayName = appt.toLocaleDateString('sk-SK', { weekday: 'short' });
  const month   = appt.toLocaleDateString('sk-SK', { month: 'short' });
  const timeStr = appt.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
  const svc     = appointment.service;
  const doctor  = appointment.doctor?.full_name ?? 'MDDr. Loderer';

  return (
    <View style={[styles.card, countdown.urgent && styles.cardUrgent]}>
      {/* Odpočítavanie */}
      <View style={[styles.countdownRow, countdown.urgent && styles.countdownUrgent]}>
        <View style={[styles.countdownDot, { backgroundColor: countdown.urgent ? '#E74C3C' : '#2ECC71' }]} />
        <Text style={[styles.countdownText, countdown.urgent && styles.countdownTextUrgent]}>
          {countdown.text}
        </Text>
      </View>

      {/* Hlavný obsah */}
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        <View style={styles.mainRow}>
          {/* Dátum box */}
          <View style={styles.dateBox}>
            <Text style={styles.dateDay}>{dayNum}</Text>
            <Text style={styles.dateMonth}>{month.toUpperCase()}</Text>
            <Text style={styles.dateDayName}>{dayName}</Text>
          </View>

          {/* Info */}
          <View style={styles.infoSection}>
            <View style={styles.timeRow}>
              <Ionicons name="time-outline" size={13} color={COLORS.sand} />
              <Text style={styles.timeText}>{timeStr}</Text>
              {svc && (
                <>
                  <Text style={styles.timeSep}>·</Text>
                  <Ionicons name="timer-outline" size={13} color={COLORS.sand} />
                  <Text style={styles.timeText}>{formatDuration(svc.duration_minutes)}</Text>
                </>
              )}
            </View>

            <Text style={styles.serviceName} numberOfLines={1}>
              {svc ? `${svc.emoji ?? '🦷'} ${svc.name}` : '🦷 Preventívna prehliadka'}
            </Text>

            <View style={styles.doctorRow}>
              <Ionicons name="person-circle-outline" size={13} color={COLORS.sand} />
              <Text style={styles.doctorText}>{doctor}</Text>
            </View>
          </View>

          <Ionicons name="chevron-forward" size={16} color={COLORS.sand} />
        </View>
      </TouchableOpacity>

      {/* Akcie */}
      {(onReschedule || onCancel) && (
        <View style={styles.actionsRow}>
          {onReschedule && (
            <TouchableOpacity style={styles.rescheduleBtn} onPress={onReschedule} activeOpacity={0.8}>
              <Ionicons name="calendar-outline" size={14} color={COLORS.cream} />
              <Text style={styles.rescheduleBtnText}>Presunúť</Text>
            </TouchableOpacity>
          )}
          {onCancel && (
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
              <Ionicons name="close-circle-outline" size={14} color="#F1948A" />
              <Text style={styles.cancelBtnText}>Zrušiť</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.esp,
    borderRadius: SIZES.radius + 2,
    marginHorizontal: SIZES.padding,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.wal,
    overflow: 'hidden',
    shadowColor: '#1a0e08',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  cardUrgent: {
    borderColor: '#E74C3C',
  },

  // Countdown banner
  countdownRow:        { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: 'rgba(255,255,255,0.07)', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  countdownUrgent:     { backgroundColor: 'rgba(231,76,60,0.15)' },
  countdownDot:        { width: 7, height: 7, borderRadius: 3.5 },
  countdownText:       { fontSize: 11, fontWeight: '600', color: COLORS.cream, flex: 1 },
  countdownTextUrgent: { color: '#F1948A' },

  // Hlavný obsah
  mainRow:     { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },

  // Dátum box
  dateBox:     { width: 52, height: 60, borderRadius: 12, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: COLORS.sand },
  dateDay:     { fontSize: 22, fontWeight: '800', color: '#fff', lineHeight: 26 },
  dateMonth:   { fontSize: 9,  fontWeight: '700', color: COLORS.cream, letterSpacing: 0.5 },
  dateDayName: { fontSize: 8,  color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginTop: 1 },

  // Info
  infoSection: { flex: 1, gap: 5 },
  timeRow:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  timeText:    { fontSize: 12, color: COLORS.sand, fontWeight: '500' },
  timeSep:     { fontSize: 12, color: COLORS.wal },
  serviceName: { fontSize: 15, fontWeight: '700', color: '#fff', lineHeight: 20 },
  doctorRow:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  doctorText:  { fontSize: 11, color: COLORS.cream, fontWeight: '400' },

  // Akcie
  actionsRow:       { flexDirection: 'row', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  rescheduleBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.08)' },
  rescheduleBtnText:{ fontSize: 12, fontWeight: '600', color: COLORS.cream },
  cancelBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  cancelBtnText:    { fontSize: 12, fontWeight: '600', color: '#F1948A' },
});
