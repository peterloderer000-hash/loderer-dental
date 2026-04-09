import React, { useState, useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SIZES } from '../../styles/theme';
import { useAppointments, Appointment } from '../../hooks/useAppointments';

const SK_DAYS   = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];
const SK_MONTHS = ['január','február','marec','apríl','máj','jún','júl','august','september','október','november','december'];

function getWeekDays(offset = 0): Date[] {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function sameDay(a: Date, b: Date) {
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
}

const STATUS_DOT: Record<Appointment['status'], string> = {
  scheduled: COLORS.wal,
  completed: '#1E8449',
  cancelled: '#922B21',
};

export default function DoctorCalendar() {
  const { appointments, loading, refetch } = useAppointments('doctor');
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(new Date());

  // Keď sa zmení týždeň, vyber prvý deň nového týždňa (alebo dnešok ak je v ňom)
  const handleWeekChange = useCallback((delta: number) => {
    setWeekOffset((o) => {
      const next = o + delta;
      const days = getWeekDays(next);
      const today = new Date();
      const todayInWeek = days.find((d) => sameDay(d, today));
      setSelectedDay(todayInWeek ?? days[0]);
      return next;
    });
  }, []);

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const weekDays = getWeekDays(weekOffset);
  const weekLabel = `${weekDays[0].getDate()}. – ${weekDays[6].getDate()}. ${SK_MONTHS[weekDays[6].getMonth()]} ${weekDays[6].getFullYear()}`;

  // Termíny pre vybraný deň
  const dayAppts = appointments.filter((a) => sameDay(new Date(a.appointment_date), selectedDay));

  // Počet termínov per deň v týždni
  const countForDay = (d: Date) =>
    appointments.filter((a) => sameDay(new Date(a.appointment_date), d) && a.status === 'scheduled').length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>KALENDÁR TERMÍNOV</Text>
          <Text style={styles.headerTitle}>Týždenný prehľad</Text>
        </View>
      </View>

      {/* Week navigator */}
      <View style={styles.weekNav}>
        <TouchableOpacity onPress={() => handleWeekChange(-1)} style={styles.navBtn} activeOpacity={0.75}>
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.weekLabel}>{weekLabel}</Text>
        <TouchableOpacity onPress={() => handleWeekChange(1)} style={styles.navBtn} activeOpacity={0.75}>
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Week grid */}
      <View style={styles.weekGrid}>
        {weekDays.map((d, i) => {
          const isSelected = sameDay(d, selectedDay);
          const isToday    = sameDay(d, new Date());
          const count      = countForDay(d);
          return (
            <TouchableOpacity key={i} style={[styles.dayCell, isSelected && styles.dayCellSelected]}
              onPress={() => setSelectedDay(d)} activeOpacity={0.75}>
              <Text style={[styles.dayName, isSelected && styles.dayNameSelected]}>{SK_DAYS[i]}</Text>
              <Text style={[styles.dayNum, isSelected && styles.dayNumSelected, isToday && !isSelected && styles.dayNumToday]}>
                {d.getDate()}
              </Text>
              {count > 0
                ? <View style={[styles.countPill, isSelected && styles.countPillSelected]}>
                    <Text style={[styles.countPillText, isSelected && styles.countPillTextSelected]}>{count}</Text>
                  </View>
                : <View style={styles.emptyDot} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Selected day appointments */}
      <View style={styles.dayHeader}>
        <Text style={styles.dayHeaderText}>
          {selectedDay.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
        <Text style={styles.dayHeaderCount}>{dayAppts.length} termínov</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.wal} /></View>
      ) : dayAppts.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🗓</Text>
          <Text style={styles.emptyText}>Žiadne termíny</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {dayAppts.map((a) => (
            <View key={a.id} style={styles.apptRow}>
              <View style={[styles.statusDot, { backgroundColor: STATUS_DOT[a.status] }]} />
              <View style={styles.apptTime}>
                <Text style={styles.apptTimeText}>{formatTime(a.appointment_date)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.apptPatient}>{a.patient?.full_name ?? 'Neznámy'}</Text>
                {a.notes ? <Text style={styles.apptNotes} numberOfLines={1}>{a.notes}</Text> : null}
              </View>
              <View style={[styles.miniStatus, { backgroundColor: STATUS_DOT[a.status] + '22', borderColor: STATUS_DOT[a.status] }]}>
                <Text style={[styles.miniStatusText, { color: STATUS_DOT[a.status] }]}>
                  {a.status === 'scheduled' ? '●' : a.status === 'completed' ? '✓' : '✕'}
                </Text>
              </View>
            </View>
          ))}
          <View style={{ height: 30 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },
  center: { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center', gap: 8 },

  header: { backgroundColor: COLORS.esp, paddingHorizontal: SIZES.padding + 4, paddingTop: 20, paddingBottom: 18 },
  headerLabel: { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '500', textTransform: 'uppercase', marginBottom: 4 },
  headerTitle: { fontSize: 20, fontWeight: '600', color: '#fff' },

  weekNav: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg3, paddingVertical: 10, paddingHorizontal: SIZES.padding },
  navBtn:  { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.esp, alignItems: 'center', justifyContent: 'center' },
  navArrow:{ fontSize: 22, color: COLORS.cream, lineHeight: 28, fontWeight: '300' },
  weekLabel: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '600', color: COLORS.esp },

  weekGrid: { flexDirection: 'row', backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 6, borderBottomWidth: 1, borderColor: COLORS.bg3 },
  dayCell: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 6, borderRadius: 10 },
  dayCellSelected: { backgroundColor: COLORS.esp },
  dayName: { fontSize: 9, fontWeight: '600', color: COLORS.wal, textTransform: 'uppercase', letterSpacing: 0.5 },
  dayNameSelected: { color: COLORS.sand },
  dayNum:  { fontSize: 16, fontWeight: '700', color: COLORS.esp },
  dayNumSelected: { color: '#fff' },
  dayNumToday: { color: COLORS.wal },
  countPill: { backgroundColor: COLORS.wal, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, minWidth: 16, alignItems: 'center' },
  countPillSelected: { backgroundColor: COLORS.sand },
  countPillText: { fontSize: 9, fontWeight: '700', color: '#fff' },
  countPillTextSelected: { color: COLORS.esp },
  emptyDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },

  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SIZES.padding, paddingTop: 14, paddingBottom: 8, backgroundColor: COLORS.bg2 },
  dayHeaderText:  { fontSize: 13, fontWeight: '600', color: COLORS.esp, textTransform: 'capitalize' },
  dayHeaderCount: { fontSize: 11, color: COLORS.wal, fontWeight: '500' },

  apptRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', marginHorizontal: SIZES.padding, marginBottom: 8, padding: 12, borderRadius: SIZES.radius, borderWidth: 1, borderColor: COLORS.bg3, elevation: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  apptTime: { backgroundColor: COLORS.bg3, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  apptTimeText:   { fontSize: 12, fontWeight: '700', color: COLORS.esp },
  apptPatient:    { fontSize: 13, fontWeight: '600', color: COLORS.esp },
  apptNotes:      { fontSize: 11, color: COLORS.wal, marginTop: 1 },
  miniStatus:     { borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  miniStatusText: { fontSize: 11, fontWeight: '700' },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: 15, color: COLORS.wal, fontWeight: '500' },
});
