import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ActivityIndicator, Alert, Modal, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, RADII } from '../../styles/theme';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';
import { pluralizeAppointments } from '../../utils/pluralize';
import { useAppointments, Appointment } from '../../hooks/useAppointments';
import { supabase } from '../../supabase';
import { jsDayToDb } from '../../utils/timeSlots';
import { exportDailySchedule } from '../../utils/exportPDF';
import { ScreenWrapper } from '../../components/ScreenWrapper';

const SK_DAYS   = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];
const SK_MONTHS = ['január','február','marec','apríl','máj','jún','júl','august','september','október','november','december'];

// Pixelov na minútu v timeline
const PX_PER_MIN = 1.4;

type OHRange   = { open: number; close: number }; // minúty od polnoci
type TimeBlock = { id: string; start_time: string; end_time: string; title: string; block_type: string };

function getMonthGrid(monthOffset: number): { days: Date[]; year: number; month: number } {
  const now    = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year   = target.getFullYear();
  const month  = target.getMonth();
  const first  = new Date(year, month, 1);
  const startDow = (first.getDay() + 6) % 7; // Monday = 0
  const start  = new Date(year, month, 1 - startDow);
  const days   = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  return { days, year, month };
}

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
  pending:   '#D4AC0D',
  scheduled: COLORS.wal,
  arrived:   '#17A589',
  completed: '#1E8449',
  cancelled: '#922B21',
};

export default function DoctorCalendar() {
  const router  = useRouter();
  const { colors, dark } = useAppTheme();
  const { appointments, loading, refetch } = useAppointments('doctor');

  const [weekOffset,  setWeekOffset]  = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  });
  const [viewMode, setViewMode] = useState<'list' | 'timeline' | 'month'>('list');
  const [ohMap, setOhMap]       = useState<Map<number, OHRange>>(new Map());
  const [exporting, setExporting] = useState(false);
  const [doctorName, setDoctorName] = useState('MDDr. Loderer');
  const [doctorId,   setDoctorId]   = useState<string | null>(null);
  // Time blocks
  const [timeBlocks,    setTimeBlocks]    = useState<TimeBlock[]>([]);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockStart,    setBlockStart]    = useState('08:00');
  const [blockEnd,      setBlockEnd]      = useState('09:00');
  const [blockReason,   setBlockReason]   = useState('');
  const [savingBlock,   setSavingBlock]   = useState(false);

  // ── Načítaj meno a ID doktora ────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setDoctorId(user.id);
      supabase.from('profiles').select('full_name').eq('id', user.id).single()
        .then(({ data }) => { if (data?.full_name) setDoctorName(data.full_name); });
    });
  }, []);

  // ── Načítaj ordinačné hodiny raz ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data: { user }, error: authErr }) => {
      if (cancelled || authErr || !user) return;
      supabase.from('opening_hours')
        .select('day_of_week, open_time, close_time, is_closed')
        .eq('doctor_id', user.id)
        .then(({ data, error: qErr }) => {
          if (cancelled || qErr) return;
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
    return () => { cancelled = true; };
  }, []);

  const loadBlocks = useCallback(async (date: Date) => {
    if (!doctorId) return;
    const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
    const dayEnd   = new Date(date); dayEnd.setHours(23, 59, 59, 999);
    const { data } = await supabase
      .from('time_blocks')
      .select('id, start_time, end_time, title, block_type')
      .eq('doctor_id', doctorId)
      .lte('start_time', dayEnd.toISOString())
      .gte('end_time',   dayStart.toISOString())
      .order('start_time', { ascending: true });
    setTimeBlocks((data ?? []) as TimeBlock[]);
  }, [doctorId]);

  const [refreshing, setRefreshing] = useState(false);
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));
  async function handleRefresh() { setRefreshing(true); await refetch(); setRefreshing(false); }

  useEffect(() => { loadBlocks(selectedDay); }, [selectedDay, loadBlocks]);

  // ── Týždeň ────────────────────────────────────────────────────────────────
  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset]);

  const weekLabel = useMemo(() => {
    const first = weekDays[0]; const last = weekDays[6];
    return `${first.getDate()}. – ${last.getDate()}. ${SK_MONTHS[last.getMonth()]} ${last.getFullYear()}`;
  }, [weekDays]);

  const isCurrentWeek = weekOffset === 0;

  const { days: monthDays, year: monthYear, month: monthMonth } = useMemo(
    () => getMonthGrid(monthOffset), [monthOffset]
  );
  const monthLabel = useMemo(
    () => `${SK_MONTHS[monthMonth]} ${monthYear}`,
    [monthMonth, monthYear]
  );

  // all appointments count by day (for month dots — includes completed)
  const apptsByDay = useMemo(() => {
    const map = new Map<string, number>();
    appointments.forEach(a => {
      const key = new Date(a.appointment_date).toDateString();
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return map;
  }, [appointments]);

  const goToToday = useCallback(() => {
    setWeekOffset(0);
    setMonthOffset(0);
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
  // počet aktívnych termínov per deň (scheduled + pending pre bodky v grid)
  const scheduledByDay = useMemo(() => {
    const map = new Map<string, number>();
    appointments.forEach(a => {
      if (a.status === 'cancelled' || a.status === 'completed') return;
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

  const handleExport = useCallback(async () => {
    if (dayAppts.length === 0) {
      Alert.alert('Prázdny deň', 'Pre tento deň nie sú žiadne termíny na export.');
      return;
    }
    setExporting(true);
    try {
      await exportDailySchedule(doctorName, selectedDay, dayAppts);
    } finally {
      setExporting(false);
    }
  }, [dayAppts, selectedDay, doctorName]);

  const handleSaveBlock = useCallback(async () => {
    if (!doctorId) return;
    if (blockStart >= blockEnd) {
      Alert.alert('Chyba', 'Koniec bloku musí byť neskôr ako začiatok.');
      return;
    }
    setSavingBlock(true);
    const [sh, sm] = blockStart.split(':').map(Number);
    const [eh, em] = blockEnd.split(':').map(Number);
    const startDt = new Date(selectedDay); startDt.setHours(sh, sm, 0, 0);
    const endDt   = new Date(selectedDay); endDt.setHours(eh, em, 0, 0);
    const { error } = await supabase.from('time_blocks').insert({
      doctor_id:  doctorId,
      title:      blockReason.trim() || 'Blokovaný čas',
      block_type: 'other',
      start_time: startDt.toISOString(),
      end_time:   endDt.toISOString(),
    });
    setSavingBlock(false);
    if (error) { Alert.alert('Chyba', error.message); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowBlockModal(false);
    setBlockReason('');
    await loadBlocks(selectedDay);
  }, [doctorId, selectedDay, blockStart, blockEnd, blockReason, loadBlocks]);

  const handleDeleteBlock = useCallback(async (blockId: string) => {
    Alert.alert('Zmazať blok', 'Odstrániť tento blok z kalendára?', [
      { text: 'Nie', style: 'cancel' },
      { text: 'Zmazať', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('time_blocks').delete().eq('id', blockId);
          if (error) { Alert.alert('Chyba', error.message); return; }
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setTimeBlocks(prev => prev.filter(b => b.id !== blockId));
        },
      },
    ]);
  }, []);

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

  const dyn = {
    bg:   { backgroundColor: colors.bg2 },
    card: { backgroundColor: colors.cardBg, borderColor: colors.bg3 },
    text: { color: colors.textPrimary },
    sub:  { color: colors.textSecondary },
  };

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <ScreenWrapper>
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

      {/* ── Navigácia týždňa / mesiaca ── */}
      {viewMode === 'month' ? (
        <View style={styles.weekNav}>
          <TouchableOpacity onPress={() => setMonthOffset(p => p - 1)} style={styles.navBtn} activeOpacity={0.75}>
            <Ionicons name="chevron-back" size={18} color={COLORS.cream} />
          </TouchableOpacity>
          <Text style={[styles.weekLabel, { textTransform: 'capitalize' }]}>{monthLabel}</Text>
          <TouchableOpacity onPress={() => setMonthOffset(p => p + 1)} style={styles.navBtn} activeOpacity={0.75}>
            <Ionicons name="chevron-forward" size={18} color={COLORS.cream} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.weekNav}>
          <TouchableOpacity onPress={() => handleWeekChange(-1)} style={styles.navBtn} activeOpacity={0.75}>
            <Ionicons name="chevron-back" size={18} color={COLORS.cream} />
          </TouchableOpacity>
          <Text style={styles.weekLabel}>{weekLabel}</Text>
          <TouchableOpacity onPress={() => handleWeekChange(1)} style={styles.navBtn} activeOpacity={0.75}>
            <Ionicons name="chevron-forward" size={18} color={COLORS.cream} />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Mriežka dní ── */}
      {viewMode !== 'month' && (
        <View style={[styles.weekGrid, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
          {weekDays.map((d, i) => {
            const isSelected = sameDay(d, selectedDay);
            const isToday    = sameDay(d, new Date());
            const count      = scheduledByDay.get(d.toDateString()) ?? 0;
            return (
              <TouchableOpacity key={i}
                style={[styles.dayCell, isSelected && styles.dayCellSel, isToday && !isSelected && (dark ? { backgroundColor: '#3B2A1A' } : styles.dayCellToday)]}
                onPress={() => setSelectedDay(d)} activeOpacity={0.75}>
                <Text style={[styles.dayName, { color: colors.textSecondary }, isSelected && styles.dayNameSel, isToday && !isSelected && styles.dayNameToday]}>
                  {SK_DAYS[i]}
                </Text>
                <Text style={[styles.dayNum, { color: colors.textPrimary }, isSelected && styles.dayNumSel, isToday && !isSelected && styles.dayNumToday]}>
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
      )}

      {/* ── Deň-header + prepínač pohľadu ── */}
      <View style={[styles.dayHeader, dyn.bg, { borderBottomColor: colors.bg3 }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.dayHeaderText, { color: colors.textPrimary }]}>
            {selectedDay.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
          <Text style={styles.dayHeaderSub}>{dayAppts.length} {pluralizeAppointments(dayAppts.length)}</Text>
        </View>
        <View style={styles.dayHeaderRight}>
          {/* Blokovať čas */}
          <TouchableOpacity
            style={styles.blockBtn}
            onPress={() => { setBlockStart('08:00'); setBlockEnd('09:00'); setBlockReason(''); setShowBlockModal(true); }}
            activeOpacity={0.8}
          >
            <Ionicons name="lock-closed-outline" size={15} color="#7D3C98" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.exportBtn, (exporting || dayAppts.length === 0) && { opacity: 0.4 }]}
            onPress={handleExport}
            disabled={exporting || dayAppts.length === 0}
            activeOpacity={0.8}
          >
            {exporting
              ? <ActivityIndicator color={COLORS.wal} size="small" />
              : <Ionicons name="download-outline" size={16} color={COLORS.wal} />}
          </TouchableOpacity>
          <View style={styles.viewToggle}>
            {([
              { mode: 'list',     icon: 'list-outline'     },
              { mode: 'timeline', icon: 'time-outline'     },
              { mode: 'month',    icon: 'calendar-outline' },
            ] as { mode: 'list' | 'timeline' | 'month'; icon: any }[]).map(({ mode, icon }) => (
              <TouchableOpacity key={mode}
                style={[styles.toggleBtn, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, viewMode === mode && styles.toggleBtnActive]}
                onPress={() => setViewMode(mode)} activeOpacity={0.75}>
                <Ionicons name={icon} size={15} color={viewMode === mode ? '#fff' : colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* ── Obsah ── */}
      {loading ? (
        <View style={{ flex: 1, backgroundColor: colors.bg2, padding: SPACING.xl }}>
          <SkeletonList count={5} />
        </View>

      ) : viewMode === 'month' ? (
        <ScrollView style={[styles.scroll, dyn.bg]} showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}>
          {/* Day name header */}
          <View style={styles.monthDayNames}>
            {SK_DAYS.map(d => (
              <Text key={d} style={styles.monthDayName}>{d}</Text>
            ))}
          </View>
          {/* 6-week grid */}
          <View style={styles.monthGrid}>
            {monthDays.map((d, idx) => {
              const inMonth  = d.getMonth() === monthMonth;
              const isSel    = sameDay(d, selectedDay);
              const isToday  = sameDay(d, new Date());
              const count    = apptsByDay.get(d.toDateString()) ?? 0;
              const dots     = Math.min(count, 3);
              return (
                <TouchableOpacity key={idx}
                  style={[
                    styles.monthCell,
                    isSel    && styles.monthCellSel,
                    isToday  && !isSel && (dark ? { backgroundColor: '#3B2A1A' } : styles.monthCellToday),
                    !inMonth && styles.monthCellOut,
                  ]}
                  onPress={() => { setSelectedDay(d); }}
                  activeOpacity={0.75}>
                  <Text style={[
                    styles.monthCellNum,
                    { color: colors.textPrimary },
                    isSel    && styles.monthCellNumSel,
                    isToday  && !isSel && styles.monthCellNumToday,
                    !inMonth && styles.monthCellNumOut,
                  ]}>{d.getDate()}</Text>
                  <View style={styles.monthDots}>
                    {Array.from({ length: dots }).map((_, di) => (
                      <View key={di} style={[styles.monthDot, isSel && styles.monthDotSel]} />
                    ))}
                    {count > 3 && (
                      <Text style={[styles.monthDotMore, isSel && { color: COLORS.sand }]}>+{count - 3}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Selected day appointments */}
          <View style={[styles.monthApptSection, { borderTopColor: colors.bg3 }]}>
            <Text style={[styles.monthApptTitle, { color: colors.textPrimary }]}>
              {selectedDay.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>
            {dayAppts.length === 0 ? (
              <Text style={[styles.monthApptEmpty, { color: colors.textSecondary }]}>Žiadne termíny</Text>
            ) : (
              dayAppts.map(a => {
                const color = STATUS_COLOR[a.status];
                const dur   = a.service?.duration_minutes ?? 0;
                return (
                  <TouchableOpacity key={a.id}
                    style={[styles.apptRow, dyn.card, { borderLeftColor: color }]}
                    onPress={() => router.push({
                      pathname: '/(doctor)/patient-detail',
                      params: { patientId: a.patient_id, patientName: a.patient?.full_name ?? 'Pacient' },
                    })}
                    activeOpacity={0.78}>
                    <View style={styles.apptTimeCol}>
                      <Text style={[styles.apptTimeStart, { color: colors.textPrimary }]}>{fmtTime(a.appointment_date)}</Text>
                      {dur > 0 && <Text style={styles.apptTimeEnd}>{fmtEnd(a.appointment_date, dur)}</Text>}
                    </View>
                    <View style={[styles.apptTimeLine, { backgroundColor: color }]} />
                    <View style={styles.apptContent}>
                      <Text style={[styles.apptPatient, dyn.text]} numberOfLines={1}>{a.patient?.full_name ?? 'Neznámy'}</Text>
                      {a.service && (
                        <View style={styles.apptSvcRow}>
                          <Text style={{ fontSize: 11 }}>{a.service.emoji ?? '🦷'}</Text>
                          <Text style={styles.apptSvcName} numberOfLines={1}>{a.service.name}</Text>
                          {dur > 0 && <Text style={styles.apptDur}>· {dur} min</Text>}
                        </View>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={13} color="#ccc" />
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </ScrollView>

      ) : viewMode === 'list' ? (
        dayAppts.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyIcon}>🗓</Text>
            <Text style={styles.emptyTitle}>Žiadne termíny</Text>
            <Text style={styles.emptySub}>Pre tento deň nie sú naplánované žiadne termíny.</Text>
          </View>
        ) : (
          <ScrollView style={[styles.scroll, dyn.bg]} showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.wal} />}>
            {/* ── Zablokované časy ── */}
            {timeBlocks.map((b) => (
              <View key={b.id} style={styles.blockRow}>
                <Ionicons name="lock-closed" size={14} color="#7D3C98" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.blockTime}>
                    {fmtTime(b.start_time)} – {fmtTime(b.end_time)}
                  </Text>
                  <Text style={styles.blockReason} numberOfLines={1}>{b.title}</Text>
                </View>
                <TouchableOpacity onPress={() => handleDeleteBlock(b.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="trash-outline" size={14} color="#922B21" />
                </TouchableOpacity>
              </View>
            ))}
            {dayAppts.map((a) => {
              const color = STATUS_COLOR[a.status];
              const dur   = a.service?.duration_minutes ?? 0;
              return (
                <TouchableOpacity key={a.id}
                  style={[styles.apptRow, dyn.card, { borderLeftColor: color }]}
                  onPress={() => router.push({
                    pathname: '/(doctor)/patient-detail',
                    params: { patientId: a.patient_id, patientName: a.patient?.full_name ?? 'Pacient' },
                  })}
                  activeOpacity={0.78}>

                  {/* Čas stĺpec */}
                  <View style={styles.apptTimeCol}>
                    <Text style={[styles.apptTimeStart, { color: colors.textPrimary }]} numberOfLines={1}>{fmtTime(a.appointment_date)}</Text>
                    {dur > 0 && (
                      <Text style={styles.apptTimeEnd} numberOfLines={1}>{fmtEnd(a.appointment_date, dur)}</Text>
                    )}
                  </View>

                  {/* Farebná čiara */}
                  <View style={[styles.apptTimeLine, { backgroundColor: color }]} />

                  {/* Obsah */}
                  <View style={styles.apptContent}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
                      <Text style={[styles.apptPatient, dyn.text, { flex: 1 }]} numberOfLines={1}>{a.patient?.full_name ?? 'Neznámy pacient'}</Text>
                      {a.is_urgent && (
                        <View style={styles.urgentBadge}>
                          <Text style={styles.urgentBadgeText}>🚨</Text>
                        </View>
                      )}
                    </View>
                    {a.family_member_name ? (
                      <Text style={{ fontSize: 10, color: '#784212', fontWeight: '600', marginBottom: 1 }}>
                        👶 Pre: {a.family_member_name}
                      </Text>
                    ) : null}
                    {a.service && (
                      <View style={styles.apptSvcRow}>
                        <Text style={{ fontSize: 11 }}>{a.service.emoji ?? '🦷'}</Text>
                        <Text style={styles.apptSvcName} numberOfLines={1}>{a.service.name}</Text>
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
                      {a.status === 'scheduled' ? '●' : a.status === 'completed' ? '✓' : a.status === 'pending' ? '⏳' : '✕'}
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
          <View style={[styles.timeline, { height: tlHeight }]}
            onStartShouldSetResponder={() => true}
            onResponderRelease={(e) => {
              // Quick add — tap empty area to create appointment at that time
              const y = e.nativeEvent.locationY;
              const min = Math.round((y / PX_PER_MIN + tlRange.open) / 15) * 15; // round to 15 min
              const h = Math.floor(min / 60);
              const m = min % 60;
              if (h >= 7 && h <= 20) {
                const dateStr = selectedDay.toISOString().slice(0, 10);
                const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                router.push({ pathname: '/(doctor)/add-appointment', params: { prefillDate: dateStr, prefillTime: timeStr } });
              }
            }}>

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

            {/* Blokované časy v timeline */}
            {timeBlocks.map(b => {
              const sd   = new Date(b.start_time);
              const ed   = new Date(b.end_time);
              const sMin = sd.getHours() * 60 + sd.getMinutes();
              const eMin = ed.getHours() * 60 + ed.getMinutes();
              const top    = (sMin - tlRange.open) * PX_PER_MIN;
              const height = Math.max((eMin - sMin) * PX_PER_MIN, 24);
              return (
                <TouchableOpacity
                  key={b.id}
                  style={[styles.tlBlockBusy, { top, height }]}
                  onPress={() => handleDeleteBlock(b.id)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="lock-closed" size={10} color="#7D3C98" />
                  <Text style={styles.tlBlockBusyText} numberOfLines={1}>
                    {b.title} · {fmtTime(b.start_time)}–{fmtTime(b.end_time)}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* Termíny */}
            {dayAppts.map(a => {
              const d      = new Date(a.appointment_date);
              const sMin   = d.getHours() * 60 + d.getMinutes();
              const dur    = a.service?.duration_minutes ?? 30;
              const top    = (sMin - tlRange.open) * PX_PER_MIN;
              const height = Math.max(dur * PX_PER_MIN, 42);
              // Service color takes priority for visual variety, fallback to status color
              const color  = (a.service as any)?.color || STATUS_COLOR[a.status];
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={[styles.tlName, { color }]} numberOfLines={1}>
                      {a.patient?.full_name ?? 'Pacient'}
                    </Text>
                    {a.is_urgent && <Text style={{ fontSize: 10 }}>🚨</Text>}
                  </View>
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

      {/* ── Modal: Blokovať čas ── */}
      <Modal visible={showBlockModal} transparent animationType="slide" onRequestClose={() => setShowBlockModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowBlockModal(false)} />
        <View style={[styles.modalSheet, { backgroundColor: colors.cardBg }]}>
          <View style={[styles.modalHandle, { backgroundColor: colors.bg3 }]} />
          <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>🔒 Blokovať čas</Text>
          <Text style={[styles.modalDate, { color: colors.textSecondary }]}>
            {selectedDay.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>

          <View style={styles.timeRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.timeLabel, { color: colors.textSecondary }]}>Od</Text>
              <TextInput
                style={[styles.timeInput, { backgroundColor: colors.bg3, borderColor: colors.bg3, color: colors.textPrimary }]}
                value={blockStart}
                onChangeText={setBlockStart}
                placeholder="08:00"
                placeholderTextColor="#999"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
            </View>
            <Ionicons name="arrow-forward" size={18} color={COLORS.wal} style={{ marginTop: 26 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.timeLabel, { color: colors.textSecondary }]}>Do</Text>
              <TextInput
                style={[styles.timeInput, { backgroundColor: colors.bg3, borderColor: colors.bg3, color: colors.textPrimary }]}
                value={blockEnd}
                onChangeText={setBlockEnd}
                placeholder="09:00"
                placeholderTextColor="#999"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
            </View>
          </View>

          {/* Quick presets */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.presetsRow}>
            {[
              { label: 'Obed', start: '12:00', end: '13:00' },
              { label: 'Školenie', start: '09:00', end: '12:00' },
              { label: 'Dovolenka (celý deň)', start: '08:00', end: '18:00' },
              { label: '30 min pauza', start: '10:00', end: '10:30' },
              { label: 'Poobedňajšia pauza', start: '15:00', end: '15:30' },
            ].map((p) => (
              <TouchableOpacity key={p.label} style={styles.presetChip}
                onPress={() => { setBlockStart(p.start); setBlockEnd(p.end); setBlockReason(p.label); }}
                activeOpacity={0.8}>
                <Text style={styles.presetChipText}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={[styles.timeLabel, { color: colors.textSecondary }]}>Dôvod (voliteľné)</Text>
          <TextInput
            style={[styles.reasonInput, { backgroundColor: colors.bg3, borderColor: colors.bg3, color: colors.textPrimary }]}
            value={blockReason}
            onChangeText={setBlockReason}
            placeholder="Napr. Obed, Školenie, Dovolenka..."
            placeholderTextColor="#999"
          />

          <TouchableOpacity
            style={[styles.blockSaveBtn, savingBlock && { opacity: 0.5 }]}
            onPress={handleSaveBlock}
            disabled={savingBlock}
            activeOpacity={0.85}
          >
            {savingBlock
              ? <ActivityIndicator color="#fff" size="small" />
              : <>
                  <Ionicons name="lock-closed" size={16} color="#fff" />
                  <Text style={styles.blockSaveBtnText}>Blokovať čas</Text>
                </>
            }
          </TouchableOpacity>
        </View>
      </Modal>

    </SafeAreaView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },
  center: { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center', gap: 10 },

  // Header
  header:       { backgroundColor: COLORS.esp, paddingHorizontal: SPACING.xl + 4, paddingTop: 20, paddingBottom: 18, flexDirection: 'row', alignItems: 'center' },
  headerLabel:  { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '500', textTransform: 'uppercase', marginBottom: 4 },
  headerTitle:  { fontSize: 20, fontWeight: '600', color: '#fff' },
  todayBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.wal, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  todayBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.cream },

  // Week nav
  weekNav:   { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg3, paddingVertical: 10, paddingHorizontal: SPACING.xl },
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
  dayHeader:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingTop: 12, paddingBottom: 10, backgroundColor: COLORS.bg2, borderBottomWidth: 1, borderBottomColor: COLORS.bg3 },
  dayHeaderText: { fontSize: 13, fontWeight: '700', color: COLORS.esp, textTransform: 'capitalize' },
  dayHeaderSub:  { fontSize: 11, color: COLORS.wal, marginTop: 1 },
  dayHeaderRight:{ flexDirection: 'row', alignItems: 'center', gap: 8 },
  exportBtn:     { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.bg3, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.bg3 },
  viewToggle:    { flexDirection: 'row', gap: 6 },
  toggleBtn:     { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.bg3 },
  toggleBtnActive:{ backgroundColor: COLORS.esp, borderColor: COLORS.wal },

  // List view
  apptRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', marginHorizontal: SPACING.xl, marginTop: 8, padding: 12, borderRadius: RADII.md, borderWidth: 1, borderColor: COLORS.bg3, borderLeftWidth: 4, elevation: 1 },
  apptTimeCol:   { width: 54, alignItems: 'flex-end' },
  apptTimeStart: { fontSize: 13, fontWeight: '700', color: COLORS.esp },
  apptTimeEnd:   { fontSize: 11, color: COLORS.wal, marginTop: 2 },
  apptTimeLine:  { width: 2, height: '80%', borderRadius: 1, opacity: 0.5 },
  apptContent:   { flex: 1 },
  apptPatient:   { fontSize: 14, fontWeight: '600', color: COLORS.esp, marginBottom: 3 },
  apptSvcRow:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  apptSvcName:   { fontSize: 12, color: COLORS.wal, fontWeight: '500', flex: 1 },
  apptDur:       { fontSize: 12, color: '#888' },
  apptNotes:     { fontSize: 12, color: COLORS.wal, marginTop: 3 },
  statusBadge:   { borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 3, alignItems: 'center', justifyContent: 'center' },
  statusText:    { fontSize: 11, fontWeight: '700' },
  urgentBadge:   { backgroundColor: '#FDEDEC', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  urgentBadgeText: { fontSize: 10 },

  // Month grid
  monthDayNames: { flexDirection: 'row', paddingHorizontal: SPACING.xl, paddingTop: 10, paddingBottom: 4 },
  monthDayName:  { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700', color: COLORS.wal, textTransform: 'uppercase', letterSpacing: 0.5 },
  monthGrid:     { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.xl - 4 },
  monthCell:     { width: '14.28%', alignItems: 'center', paddingVertical: 6, borderRadius: 10, gap: 2 },
  monthCellSel:  { backgroundColor: COLORS.esp },
  monthCellToday:{ backgroundColor: '#F4ECE4' },
  monthCellOut:  { opacity: 0.3 },
  monthCellNum:  { fontSize: 15, fontWeight: '600', color: COLORS.esp },
  monthCellNumSel:   { color: '#fff' },
  monthCellNumToday: { color: COLORS.wal, fontWeight: '800' },
  monthCellNumOut:   { color: COLORS.wal },
  monthDots:     { flexDirection: 'row', gap: 2, height: 6, alignItems: 'center' },
  monthDot:      { width: 5, height: 5, borderRadius: 2.5, backgroundColor: COLORS.wal },
  monthDotSel:   { backgroundColor: COLORS.sand },
  monthDotMore:  { fontSize: 8, color: COLORS.wal, fontWeight: '700' },
  monthApptSection: { borderTopWidth: 1, marginTop: 12, paddingTop: 14, paddingHorizontal: SPACING.xl },
  monthApptTitle:   { fontSize: 13, fontWeight: '700', color: COLORS.esp, textTransform: 'capitalize', marginBottom: 10 },
  monthApptEmpty:   { fontSize: 13, color: COLORS.wal, fontStyle: 'italic', paddingBottom: 20 },

  // Empty
  emptyIcon:  { fontSize: 44 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.esp },
  emptySub:   { fontSize: 12, color: COLORS.wal, textAlign: 'center', paddingHorizontal: 40 },

  // Timeline
  timeline:    { position: 'relative', marginHorizontal: SPACING.xl, paddingLeft: 52 },
  tlHour:      { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
  tlHourLabel: { width: 46, fontSize: 11, fontWeight: '600', color: '#888', textAlign: 'right', paddingRight: 6 },
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

  // Block button in day header
  blockBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F5EEF8', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#D7BDE2' },

  // Block row in list view
  blockRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F5EEF8', marginHorizontal: SPACING.xl, marginTop: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#D7BDE2', borderLeftWidth: 3, borderLeftColor: '#7D3C98' },
  blockTime:   { fontSize: 12, fontWeight: '700', color: '#7D3C98' },
  blockReason: { fontSize: 11, color: '#A569BD', marginTop: 1 },

  // Block in timeline
  tlBlockBusy:     { position: 'absolute', left: 58, right: 0, borderRadius: 6, borderLeftWidth: 3, borderLeftColor: '#7D3C98', backgroundColor: '#F5EEF855', padding: 4, flexDirection: 'row', alignItems: 'center', gap: 4, overflow: 'hidden' },
  tlBlockBusyText: { fontSize: 10, color: '#7D3C98', fontWeight: '600', flex: 1 },

  // Modal
  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet:     { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 24, paddingBottom: 36 },
  modalHandle:    { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.bg3, alignSelf: 'center', marginBottom: 18 },
  modalTitle:     { fontSize: 18, fontWeight: '800', color: COLORS.esp, marginBottom: 4 },
  modalDate:      { fontSize: 12, color: COLORS.wal, marginBottom: 20, textTransform: 'capitalize' },
  timeRow:        { flexDirection: 'row', gap: 12, alignItems: 'flex-end', marginBottom: 14 },
  timeLabel:      { fontSize: 11, fontWeight: '600', color: COLORS.wal, marginBottom: 6 },
  timeInput:      { borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, fontWeight: '700', color: COLORS.esp, backgroundColor: COLORS.bg2, textAlign: 'center' },
  presetsRow:     { gap: 8, marginBottom: 16 },
  presetChip:     { backgroundColor: COLORS.bg3, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: COLORS.bg3 },
  presetChipText: { fontSize: 12, fontWeight: '600', color: COLORS.esp },
  reasonInput:    { borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: COLORS.esp, backgroundColor: COLORS.bg2, marginBottom: 20, marginTop: 6 },
  blockSaveBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#7D3C98', borderRadius: 14, paddingVertical: 14 },
  blockSaveBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
