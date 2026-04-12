import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, SIZES } from '../../styles/theme';
import { useAppointments, Appointment } from '../../hooks/useAppointments';
import { supabase } from '../../supabase';
import { jsDayToDb } from '../../utils/timeSlots';

const SK_DAYS   = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];
const SK_MONTHS = ['január','február','marec','apríl','máj','jún','júl','august','september','október','november','december'];

// Pixelov na minútu v timeline
const PX_PER_MIN = 1.4;

type OHRange = { open: number; close: number }; // minúty od polnoci

function getWeekDays(offset = 0): Date[] {
  const today  = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function sameDay(a: Date, b: Date) {
  return (
    a.getDate()     === b.getDate()  &&
    a.getMonth()    === b.getMonth() &&
    a.getFullYear() === b.getFullYear()
  );
}

function fmtTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
}
function fmtEnd(dateStr: string, durMin: number) {
  const d = new Date(new Date(dateStr).getTime() + durMin * 60000);
  return d.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
}

const STATUS_COLOR: Record<Appointment['status'], string> = {
  scheduled: COLORS.wal,
  completed: '#1E8449',
  cancelled: '#922B21',
};

export default function DoctorCalendar() {
  const router  = useRouter();
  const { appointments, loading, refetch } = useAppointments('doctor');

  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  });
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');
  const [ohMap, setOhMap]       = useState<Map<number, OHRange>>(new Map());

  // ── Načítaj ordinačné hodiny raz ──────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('opening_hours')
        .select('day_of_week, open_time, close_time, is_closed')
        .eq('doctor_id', user.id)
        .then(({ data }) => {
          const map = new Map<number, OHRange>();
          (data ?? []).forEach(h => {
            if (!h.is_closed && h.open_time && h.close_time) {
              const [oh, om] = h.open_time.split(':').map(Number);
              const [ch, cm] = h.close_time.split(':').map(Number);
              map.set(h.day_of_week, { open: oh * 60 + om, close: ch * 60 + cm });
            }
          });
          setOhMap(map);
        });
    });
  }, []);

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  // ── Týždeň ────────────────────────────────────────────────────────────────
  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset]);

  const weekLabel = useMemo(() => {
    const first = weekDays[0]; const last = weekDays[6];
    return `${first.getDate()}. – ${last.getDate()}. ${SK_MONTHS[last.getMonth()]} ${last.getFullYear()}`;
  }, [weekDays]);

  const isCurrentWeek = weekOffset === 0;

  const goToToday = useCallback(() => {
    setWeekOffset(0);
    const d = new Date(); d.setHours(0, 0, 0, 0);
    setSelectedDay(d);
  }, []);

  const handleWeekChange = useCallback((delta: number) => {
    setWeekOffset(prev => {
      const next  = prev + delta;
      const days  = getWeekDays(next);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      setSelectedDay(days.find(d => sameDay(d, today)) ?? days[0]);
      return next;
    });
  }, []);

  // ── Memoizované derivácie ─────────────────────────────────────────────────
  // počet scheduled termínov per deň (pre bodky v grid)
  const scheduledByDay = useMemo(() => {
    const map = new Map<string, number>();
    appointments.forEach(a => {
      if (a.status !== 'scheduled') return;
      const key = new Date(a.appointment_date).toDateString();
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return map;
  }, [appointments]);

  // termíny pre vybraný deň, zoradené
  const dayAppts = useMemo(() =>
    appointments
      .filter(a => sameDay(new Date(a.appointment_date), selectedDay))
      .sort((a, b) =>
        new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime()
      ),
    [appointments, selectedDay]
  );

  // ── Timeline range zo ordinačných hodín ──────────────────────────────────
  const tlRange = useMemo((): OHRange => {
    const dbDay = jsDayToDb(selectedDay.getDay());
    const oh    = ohMap.get(dbDay);
    return oh
      ? { open: Math.max(0, oh.open - 30), close: oh.close + 30 }
      : { open: 7 * 60, close: 18 * 60 };
  }, [selectedDay, ohMap]);

  const tlHours = useMemo(() => {
    const result: number[] = [];
    for (let h = Math.floor(tlRange.open / 60); h <= Math.ceil(tlRange.close / 60); h++)
      result.push(h);
    return result;
  }, [tlRange]);

  const tlHeight = (tlRange.close - tlRange.open) * PX_PER_MIN + 40;

  // ── "Teraz" čiara ─────────────────────────────────────────────────────────
  const nowTop = useMemo(() => {
    if (!sameDay(selectedDay, new Date())) return null;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (nowMin < tlRange.open || nowMin > tlRange.close) return null;
    return (nowMin - tlRange.open) * PX_PER_MIN;
  }, [selectedDay, tlRange]);

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* ── Hlavička ── */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>KALENDÁR TERMÍNOV</Text>
          <Text style={styles.headerTitle}>Týždenný prehľad</Text>
        </View>
        {!isCurrentWeek && (
          <TouchableOpacity style={styles.todayBtn} onPress={goToToday} activeOpacity={0.8}>
            <Ionicons name="today-outline" size={13} color={COLORS.cream} />
            <Text style={styles.todayBtnText}>Dnes</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Navigácia týždňa ── */}
      <View style={styles.weekNav}>
        <TouchableOpacity onPress={() => handleWeekChange(-1)} style={styles.navBtn} activeOpacity={0.75}>
          <Ionicons name="chevron-back" size={18} color={COLORS.cream} />
        </TouchableOpacity>
        <Text style={styles.weekLabel}>{weekLabel}</Text>
        <TouchableOpacity onPress={() => handleWeekChange(1)} style={styles.navBtn} activeOpacity={0.75}>
          <Ionicons name="chevron-forward" size={18} color={COLORS.cream} />
        </TouchableOpacity>
      </View>

      {/* ── Mriežka dní ── */}
      <View style={styles.weekGrid}>
        {weekDays.map((d, i) => {
          const isSelected = sameDay(d, selectedDay);
          const isToday    = sameDay(d, new Date());
          const count      = scheduledByDay.get(d.toDateString()) ?? 0;
          return (
            <TouchableOpacity key={i}
              style={[styles.dayCell, isSelected && styles.dayCellSel, isToday && !isSelected && styles.dayCellToday]}
              onPress={() => setSelectedDay(d)} activeOpacity={0.75}>
              <Text style={[styles.dayName, isSelected && styles.dayNameSel, isToday && !isSelected && styles.dayNameToday]}>
                {SK_DAYS[i]}
              </Text>
              <Text style={[styles.dayNum, isSelected && styles.dayNumSel, isToday && !isSelected && styles.dayNumToday]}>
                {d.getDate()}
              </Text>
              {count > 0
                ? <View style={[styles.countPill, isSelected && styles.countPillSel]}>
                    <Text style={[styles.countPillText, isSelected && styles.countPillTextSel]}>{count}</Text>
                  </View>
                : <View style={styles.emptyDot} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Deň-header + prepínač pohľadu ── */}
      <View style={styles.dayHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.dayHeaderText}>
            {selectedDay.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
          <Text style={styles.dayHeaderSub}>{dayAppts.length} termínov</Text>
        </View>
        <View style={styles.viewToggle}>
          {(['list', 'timeline'] as const).map(mode => (
            <TouchableOpacity key={mode}
              style={[styles.toggleBtn, viewMode === mode && styles.toggleBtnActive]}
              onPress={() => setViewMode(mode)} activeOpacity={0.75}>
              <Ionicons
                name={mode === 'list' ? 'list-outline' : 'time-outline'}
                size={15}
                color={viewMode === mode ? '#fff' : COLORS.wal}
              />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Obsah ── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.wal} size="large" />
        </View>

      ) : viewMode === 'list' ? (
        dayAppts.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyIcon}>🗓</Text>
            <Text style={styles.emptyTitle}>Žiadne termíny</Text>
            <Text style={styles.emptySub}>Pre tento deň nie sú naplánované žiadne termíny.</Text>
          </View>
        ) : (
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {dayAppts.map((a) => {
              const color = STATUS_COLOR[a.status];
              const dur   = a.service?.duration_minutes ?? 0;
              return (
                <TouchableOpacity key={a.id}
                  style={[styles.apptRow, { borderLeftColor: color }]}
                  onPress={() => router.push({
                    pathname: '/(doctor)/patient-detail',
                    params: { patientId: a.patient_id, patientName: a.patient?.full_name ?? 'Pacient' },
                  })}
                  activeOpacity={0.78}>

                  {/* Čas stĺpec */}
                  <View style={styles.apptTimeCol}>
                    <Text style={styles.apptTimeStart}>{fmtTime(a.appointment_date)}</Text>
                    {dur > 0 && (
                      <Text style={styles.apptTimeEnd}>{fmtEnd(a.appointment_date, dur)}</Text>
                    )}
                  </View>

                  {/* Farebná čiara */}
                  <View style={[styles.apptTimeLine, { backgroundColor: color }]} />

                  {/* Obsah */}
                  <View style={styles.apptContent}>
                    <Text style={styles.apptPatient}>{a.patient?.full_name ?? 'Neznámy pacient'}</Text>
                    {a.service && (
                      <View style={styles.apptSvcRow}>
                        <Text style={{ fontSize: 11 }}>{a.service.emoji ?? '🦷'}</Text>
                        <Text style={styles.apptSvcName}>{a.service.name}</Text>
                        {dur > 0 && <Text style={styles.apptDur}>· {dur} min</Text>}
                      </View>
                    )}
                    {a.notes ? (
                      <Text style={styles.apptNotes} numberOfLines={1}>📝 {a.notes}</Text>
                    ) : null}
                  </View>

                  {/* Status */}
                  <View style={[styles.statusBadge, { backgroundColor: color + '18', borderColor: color }]}>
                    <Text style={[styles.statusText, { color }]}>
                      {a.status === 'scheduled' ? '●' : a.status === 'completed' ? '✓' : '✕'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={13} color="#ccc" />
                </TouchableOpacity>
              );
            })}
            <View style={{ height: 100 }} />
          </ScrollView>
        )

      ) : (
        /* ── Timeline pohľad ── */
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={[styles.timeline, { height: tlHeight }]}>

            {/* Hodinové čiary */}
            {tlHours.map(hour => {
              const top = (hour * 60 - tlRange.open) * PX_PER_MIN;
              return (
                <View key={hour} style={[styles.tlHour, { top }]}>
                  <Text style={styles.tlHourLabel}>{String(hour).padStart(2, '0')}:00</Text>
                  <View style={styles.tlHourLine} />
                </View>
              );
            })}

            {/* Termíny */}
            {dayAppts.map(a => {
              const d      = new Date(a.appointment_date);
              const sMin   = d.getHours() * 60 + d.getMinutes();
              const dur    = a.service?.duration_minutes ?? 30;
              const top    = (sMin - tlRange.open) * PX_PER_MIN;
              const height = Math.max(dur * PX_PER_MIN, 42);
              const color  = STATUS_COLOR[a.status];
              return (
                <TouchableOpacity key={a.id}
                  style={[styles.tlBlock, { top, height, backgroundColor: color + '18', borderLeftColor: color }]}
                  onPress={() => router.push({
                    pathname: '/(doctor)/patient-detail',
                    params: { patientId: a.patient_id, patientName: a.patient?.full_name ?? 'Pacient' },
                  })}
                  activeOpacity={0.78}>
                  <Text style={[styles.tlTime, { color }]}>
                    {fmtTime(a.appointment_date)} – {fmtEnd(a.appointment_date, dur)}
                  </Text>
                  <Text style={[styles.tlName, { color }]} numberOfLines={1}>
                    {a.patient?.full_name ?? 'Pacient'}
                  </Text>
                  {height > 54 && a.service && (
                    <Text style={[styles.tlSvc, { color }]} numberOfLines={1}>
                      {a.service.emoji ?? '🦷'} {a.service.name}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}

            {/* Teraz čiara */}
            {nowTop !== null && (
              <View style={[styles.nowLine, { top: nowTop }]}>
                <View style={styles.nowDot} />
                <View style={styles.nowBar} />
              </View>
            )}
          </View>
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* ── FAB: Pridať termín ── */}
      <TouchableOpacity style={styles.fab}
        onPress={() => router.push('/(doctor)/add-appointment')} activeOpacity={0.85}>
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },
  center: { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center', gap: 10 },

  // Header
  header:       { backgroundColor: COLORS.esp, paddingHorizontal: SIZES.padding + 4, paddingTop: 20, paddingBottom: 18, flexDirection: 'row', alignItems: 'center' },
  headerLabel:  { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '500', textTransform: 'uppercase', marginBottom: 4 },
  headerTitle:  { fontSize: 20, fontWeight: '600', color: '#fff' },
  todayBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.wal, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  todayBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.cream },

  // Week nav
  weekNav:   { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg3, paddingVertical: 10, paddingHorizontal: SIZES.padding },
  navBtn:    { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.esp, alignItems: 'center', justifyContent: 'center' },
  weekLabel: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '600', color: COLORS.esp },

  // Week grid
  weekGrid:          { flexDirection: 'row', backgroundColor: '#fff', paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderColor: COLORS.bg3 },
  dayCell:           { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 6, borderRadius: 10 },
  dayCellSel:        { backgroundColor: COLORS.esp },
  dayCellToday:      { backgroundColor: '#F4ECE4' },
  dayName:           { fontSize: 9, fontWeight: '600', color: COLORS.wal, textTransform: 'uppercase', letterSpacing: 0.4 },
  dayNameSel:        { color: COLORS.sand },
  dayNameToday:      { color: COLORS.wal, fontWeight: '800' },
  dayNum:            { fontSize: 16, fontWeight: '700', color: COLORS.esp },
  dayNumSel:         { color: '#fff' },
  dayNumToday:       { color: COLORS.wal },
  countPill:         { backgroundColor: COLORS.wal, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, minWidth: 16, alignItems: 'center' },
  countPillSel:      { backgroundColor: COLORS.sand },
  countPillText:     { fontSize: 9, fontWeight: '700', color: '#fff' },
  countPillTextSel:  { color: COLORS.esp },
  emptyDot:          { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },

  // Day header
  dayHeader:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SIZES.padding, paddingTop: 12, paddingBottom: 10, backgroundColor: COLORS.bg2, borderBottomWidth: 1, borderBottomColor: COLORS.bg3 },
  dayHeaderText: { fontSize: 13, fontWeight: '700', color: COLORS.esp, textTransform: 'capitalize' },
  dayHeaderSub:  { fontSize: 11, color: COLORS.wal, marginTop: 1 },
  viewToggle:    { flexDirection: 'row', gap: 6 },
  toggleBtn:     { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.bg3 },
  toggleBtnActive:{ backgroundColor: COLORS.esp, borderColor: COLORS.wal },

  // List view
  apptRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', marginHorizontal: SIZES.padding, marginTop: 8, padding: 12, borderRadius: SIZES.radius, borderWidth: 1, borderColor: COLORS.bg3, borderLeftWidth: 4, elevation: 1 },
  apptTimeCol:   { width: 44, alignItems: 'flex-end' },
  apptTimeStart: { fontSize: 12, fontWeight: '700', color: COLORS.esp },
  apptTimeEnd:   { fontSize: 10, color: COLORS.wal, marginTop: 2 },
  apptTimeLine:  { width: 2, height: '80%', borderRadius: 1, opacity: 0.5 },
  apptContent:   { flex: 1 },
  apptPatient:   { fontSize: 14, fontWeight: '600', color: COLORS.esp, marginBottom: 3 },
  apptSvcRow:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  apptSvcName:   { fontSize: 11, color: COLORS.wal, fontWeight: '500' },
  apptDur:       { fontSize: 11, color: '#bbb' },
  apptNotes:     { fontSize: 11, color: COLORS.wal, marginTop: 3 },
  statusBadge:   { borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 3, alignItems: 'center', justifyContent: 'center' },
  statusText:    { fontSize: 11, fontWeight: '700' },

  // Empty
  emptyIcon:  { fontSize: 44 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.esp },
  emptySub:   { fontSize: 12, color: COLORS.wal, textAlign: 'center', paddingHorizontal: 40 },

  // Timeline
  timeline:    { position: 'relative', marginHorizontal: SIZES.padding, paddingLeft: 52 },
  tlHour:      { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
  tlHourLabel: { width: 46, fontSize: 10, fontWeight: '600', color: '#bbb', textAlign: 'right', paddingRight: 6 },
  tlHourLine:  { flex: 1, height: 1, backgroundColor: COLORS.bg3 },
  tlBlock:     { position: 'absolute', left: 58, right: 0, borderRadius: 8, borderLeftWidth: 3, padding: 6, overflow: 'hidden' },
  tlTime:      { fontSize: 9, fontWeight: '700' },
  tlName:      { fontSize: 12, fontWeight: '600', marginTop: 1 },
  tlSvc:       { fontSize: 10, marginTop: 1, opacity: 0.85 },

  // "Teraz" čiara
  nowLine: { position: 'absolute', left: 52, right: 0, flexDirection: 'row', alignItems: 'center', zIndex: 10 },
  nowDot:  { width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#E74C3C', marginLeft: -4 },
  nowBar:  { flex: 1, height: 1.5, backgroundColor: '#E74C3C' },

  // FAB
  fab: { position: 'absolute', bottom: 82, right: 20, width: 54, height: 54, borderRadius: 27, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: COLORS.esp, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, borderWidth: 2, borderColor: COLORS.sand },
});
