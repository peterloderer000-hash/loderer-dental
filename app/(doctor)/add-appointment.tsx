import React, { useState, useEffect, useMemo } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabase';
import { COLORS, SIZES } from '../../styles/theme';
import { useServices, Service, formatPrice, formatDuration } from '../../hooks/useServices';
import {
  generateTimeSlotsForDay, getNextOpenDays,
  SK_DAYS_SHORT, SK_MONTHS_SHORT, jsDayToDb, timeToMinutes,
} from '../../utils/timeSlots';

type OpeningHour = { open_time: string; close_time: string };
type BookedSlot  = { start: number; end: number };

type Patient = { id: string; full_name: string | null; phone_number: string | null };

export default function DoctorAddAppointment() {
  const router  = useRouter();
  const params  = useLocalSearchParams<{ patientId?: string; patientName?: string }>();
  const { grouped: servicesGrouped, loading: loadingServices } = useServices();

  const [patients, setPatients]       = useState<Patient[]>([]);
  const [patientQuery, setQuery]      = useState(params.patientName ?? '');
  const [selectedPatient, setPatient] = useState<Patient | null>(null);
  const [showDropdown, setDropdown]   = useState(false);
  const [selectedService, setService] = useState<Service | null>(null);
  const [selectedDate, setDate]       = useState<Date | null>(null);
  const [selectedTime, setTime]       = useState('');
  const [notes, setNotes]             = useState('');
  const [customDuration, setCustomDuration] = useState<number | null>(null);
  const [customDurationText, setCustomDurationText] = useState('');
  const [loading, setLoading]         = useState(false);
  const [loadingPatients, setLoadingP] = useState(true);
  const [showServices, setShowServices] = useState(false);
  const [openingHoursMap, setOpeningHoursMap] = useState<Map<number, OpeningHour>>(new Map());
  const [doctorUserId,    setDoctorUserId]    = useState('');
  const [bookedSlots,  setBookedSlots]  = useState<BookedSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Efektívna dĺžka = vlastná ak nastavená, inak z vybranej služby
  const effectiveDuration = customDuration ?? selectedService?.duration_minutes ?? 30;

  const openDbDays = useMemo(() => new Set(openingHoursMap.keys()), [openingHoursMap]);

  const days = useMemo(
    () => openDbDays.size > 0 ? getNextOpenDays(21, openDbDays) : [],
    [openDbDays],
  );

  const selectedDayHours = useMemo((): OpeningHour | null => {
    if (!selectedDate) return null;
    return openingHoursMap.get(jsDayToDb(selectedDate.getDay())) ?? null;
  }, [selectedDate, openingHoursMap]);

  const slots = useMemo(
    () => generateTimeSlotsForDay(
      effectiveDuration,
      selectedDayHours?.open_time  ?? '08:00',
      selectedDayHours?.close_time ?? '17:00',
    ),
    [effectiveDuration, selectedDayHours],
  );

  function isSlotTaken(slotStart: string): boolean {
    const durationMin = effectiveDuration;
    const s = timeToMinutes(slotStart);
    const e = s + durationMin;
    return bookedSlots.some(b => s < b.end && e > b.start);
  }

  // Načítaj pacientov + ordinačné hodiny doktora
  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Doktor = prihlásený user
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (user) {
        setDoctorUserId(user.id);
        const { data: hours } = await supabase
          .from('opening_hours')
          .select('day_of_week, open_time, close_time, is_closed')
          .eq('doctor_id', user.id);
        if (hours) {
          const map = new Map<number, OpeningHour>();
          hours.forEach(h => {
            if (!h.is_closed && h.open_time && h.close_time) {
              map.set(h.day_of_week, { open_time: h.open_time.slice(0, 5), close_time: h.close_time.slice(0, 5) });
            }
          });
          if (map.size === 0) for (let d = 1; d <= 5; d++) map.set(d, { open_time: '08:00', close_time: '17:00' });
          setOpeningHoursMap(map);
        }
      }
      // Pacienti
      const { data: pats } = await supabase
        .from('profiles').select('id, full_name, phone_number')
        .eq('role', 'patient').order('full_name', { ascending: true });
      const list = (pats ?? []) as Patient[];
      setPatients(list);
      if (params.patientId) {
        const found = list.find((p) => p.id === params.patientId);
        if (found) { setPatient(found); setQuery(found.full_name ?? ''); }
      }
      if (!cancelled) setLoadingP(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Fetch obsadených slotov pre vybraný deň
  useEffect(() => {
    if (!selectedDate || !doctorUserId) { setBookedSlots([]); return; }
    let cancelled = false;
    setLoadingSlots(true);
    const dayStart = new Date(selectedDate); dayStart.setHours(0, 0, 0, 0);
    const dayEnd   = new Date(selectedDate); dayEnd.setHours(23, 59, 59, 999);
    supabase
      .from('appointments')
      .select('appointment_date, service:services(duration_minutes)')
      .eq('doctor_id', doctorUserId)
      .eq('status', 'scheduled')
      .gte('appointment_date', dayStart.toISOString())
      .lte('appointment_date', dayEnd.toISOString())
      .then(({ data }) => {
        if (cancelled) return;
        setLoadingSlots(false);
        if (!data) return;
        setBookedSlots(data.map(a => {
          const d = new Date(a.appointment_date);
          const sMin = d.getHours() * 60 + d.getMinutes();
          const dur  = (a.service as any)?.duration_minutes ?? 30;
          return { start: sMin, end: sMin + dur };
        }));
      });
    return () => { cancelled = true; };
  }, [selectedDate, doctorUserId]);

  const filteredPatients = useMemo(() => {
    const q = patientQuery.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) =>
      (p.full_name ?? '').toLowerCase().includes(q) ||
      (p.phone_number ?? '').toLowerCase().includes(q)
    );
  }, [patients, patientQuery]);

  async function handleSave() {
    if (!selectedPatient) { Alert.alert('Chyba', 'Vyber prosím pacienta.'); return; }
    if (!selectedService) { Alert.alert('Chyba', 'Vyber prosím službu.'); return; }
    if (!selectedDate)    { Alert.alert('Chyba', 'Vyber prosím dátum.'); return; }
    if (!selectedTime)    { Alert.alert('Chyba', 'Vyber prosím čas.'); return; }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nie si prihlásený.');

      const [h, m] = selectedTime.split(':').map(Number);
      const dt     = new Date(selectedDate);
      dt.setHours(h, m, 0, 0);

      // Kontrola kolízie (duration-based overlap) — nie len exact match
      const newStart = h * 60 + m;
      const newEnd   = newStart + effectiveDuration;
      const dayStart2 = new Date(dt); dayStart2.setHours(0, 0, 0, 0);
      const dayEnd2   = new Date(dt); dayEnd2.setHours(23, 59, 59, 999);
      const { data: existing } = await supabase.from('appointments')
        .select('appointment_date, service:services(duration_minutes)')
        .eq('doctor_id', user.id)
        .eq('status', 'scheduled')
        .gte('appointment_date', dayStart2.toISOString())
        .lte('appointment_date', dayEnd2.toISOString());
      const conflict = (existing ?? []).some(e => {
        const ed = new Date(e.appointment_date);
        const es = ed.getHours() * 60 + ed.getMinutes();
        const ee = es + ((e.service as any)?.duration_minutes ?? 30);
        return newStart < ee && newEnd > es;
      });
      if (conflict) throw new Error('Tento čas sa prekrýva s existujúcim termínom. Vyber iný.');

      const { error } = await supabase.from('appointments').insert({
        patient_id:       selectedPatient.id,
        doctor_id:        user.id,
        appointment_date: dt.toISOString(),
        status:           'scheduled',
        notes:            notes.trim() || null,
        service_id:       selectedService?.id ?? null,
      });
      if (error) throw error;

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Termín pridaný ✓', `Termín pre ${selectedPatient.full_name ?? 'pacienta'} bol naplánovaný.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Chyba', e?.message ?? 'Nastala chyba pri ukladaní.');
    } finally {
      setLoading(false);
    }
  }

  const canSave = !!selectedPatient && !!selectedService && !!selectedDate && !!selectedTime;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Hlavička ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>DOKTOR</Text>
          <Text style={styles.headerTitle}>Nový termín</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* ── Výber pacienta ── */}
          <Text style={styles.sectionLabel}>PACIENT</Text>
          <View style={styles.patientSearchWrap}>
            <Ionicons name="person-outline" size={17} color={COLORS.wal} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.patientInput}
              placeholder="Vyhľadaj pacienta..."
              placeholderTextColor="#bbb"
              value={patientQuery}
              onChangeText={(t) => { setQuery(t); setPatient(null); setDropdown(true); }}
              onFocus={() => setDropdown(true)}
              autoCapitalize="words"
            />
            {selectedPatient && (
              <Ionicons name="checkmark-circle" size={20} color="#1E8449" />
            )}
          </View>

          {/* Dropdown výsledky */}
          {showDropdown && patientQuery.length > 0 && !selectedPatient && (
            <View style={styles.dropdown}>
              {loadingPatients ? (
                <ActivityIndicator color={COLORS.wal} style={{ padding: 12 }} />
              ) : filteredPatients.length === 0 ? (
                <Text style={styles.dropdownEmpty}>Žiadny pacient nenájdený</Text>
              ) : (
                filteredPatients.slice(0, 6).map((p) => (
                  <TouchableOpacity key={p.id} style={styles.dropdownItem}
                    onPress={() => { setPatient(p); setQuery(p.full_name ?? ''); setDropdown(false); }}
                    activeOpacity={0.75}>
                    <View style={styles.dropdownAvatar}>
                      <Text style={styles.dropdownAvatarText}>
                        {(p.full_name ?? '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dropdownName}>{p.full_name ?? 'Neznámy'}</Text>
                      {p.phone_number && (
                        <Text style={styles.dropdownPhone}>{p.phone_number}</Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#ddd" />
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {/* Vybraný pacient chip */}
          {selectedPatient && (
            <View style={styles.selectedChip}>
              <View style={styles.chipAvatar}>
                <Text style={styles.chipAvatarText}>
                  {(selectedPatient.full_name ?? '?').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.chipName}>{selectedPatient.full_name}</Text>
                {selectedPatient.phone_number && (
                  <Text style={styles.chipPhone}>{selectedPatient.phone_number}</Text>
                )}
              </View>
              <TouchableOpacity onPress={() => { setPatient(null); setQuery(''); }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close-circle" size={20} color="#bbb" />
              </TouchableOpacity>
            </View>
          )}

          {/* ── Výber služby ── */}
          <Text style={[styles.sectionLabel, { marginTop: 20 }]}>SLUŽBA</Text>
          <TouchableOpacity style={styles.servicePickerBtn}
            onPress={() => setShowServices((v) => !v)} activeOpacity={0.8}>
            {selectedService ? (
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 20 }}>{selectedService.emoji ?? '🦷'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.servicePickerName}>{selectedService.name}</Text>
                  <Text style={styles.servicePickerMeta}>
                    {formatDuration(selectedService.duration_minutes)} · {formatPrice(selectedService.price_min, selectedService.price_max)}
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={styles.servicePickerPlaceholder}>Vyber službu...</Text>
            )}
            <Ionicons name={showServices ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.wal} />
          </TouchableOpacity>

          {showServices && (
            <View style={styles.serviceDropdown}>
              {loadingServices
                ? <ActivityIndicator color={COLORS.wal} style={{ padding: 12 }} />
                : Object.entries(servicesGrouped).map(([cat, items]) => (
                  <View key={cat}>
                    <Text style={styles.serviceDropdownCat}>{cat}</Text>
                    {items.map((svc) => (
                      <TouchableOpacity key={svc.id} style={styles.serviceDropdownItem}
                        onPress={() => { setService(svc); setTime(''); setShowServices(false); setCustomDuration(null); setCustomDurationText(''); }}
                        activeOpacity={0.8}>
                        <Text style={{ fontSize: 16 }}>{svc.emoji ?? '🦷'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.serviceDropdownName}>{svc.name}</Text>
                          <Text style={styles.serviceDropdownMeta}>
                            {formatDuration(svc.duration_minutes)} · {formatPrice(svc.price_min, svc.price_max)}
                          </Text>
                        </View>
                        {selectedService?.id === svc.id && (
                          <Ionicons name="checkmark-circle" size={18} color="#1E8449" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                ))
              }
            </View>
          )}

          {/* ── Dĺžka ošetrenia ── */}
          {selectedService && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: 20 }]}>DĹŽKA OŠETRENIA</Text>
              <View style={styles.durationRow}>
                {[15, 30, 45, 60, 90, 120].map((min) => {
                  const isActive = effectiveDuration === min;
                  return (
                    <TouchableOpacity
                      key={min}
                      style={[styles.durationChip, isActive && styles.durationChipActive]}
                      onPress={() => { setCustomDuration(min); setCustomDurationText(String(min)); setTime(''); }}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.durationChipText, isActive && styles.durationChipTextActive]}>
                        {min < 60 ? `${min} min` : `${min / 60} hod`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.durationCustomRow}>
                <Ionicons name="time-outline" size={16} color={COLORS.wal} />
                <TextInput
                  style={styles.durationInput}
                  placeholder={`Vlastná (min) · teraz: ${effectiveDuration} min`}
                  placeholderTextColor="#bbb"
                  keyboardType="numeric"
                  value={customDurationText}
                  onChangeText={(t) => {
                    setCustomDurationText(t);
                    const n = parseInt(t, 10);
                    if (!isNaN(n) && n > 0 && n <= 480) { setCustomDuration(n); setTime(''); }
                  }}
                  maxLength={3}
                />
              </View>
            </>
          )}

          {/* ── Výber dátumu ── */}
          <Text style={[styles.sectionLabel, { marginTop: 24 }]}>DÁTUM</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={styles.datesScroll} contentContainerStyle={styles.datesContent}>
            {days.map((d) => {
              const isSel   = selectedDate?.toDateString() === d.toDateString();
              const isToday = d.toDateString() === new Date().toDateString();
              const dbDay   = jsDayToDb(d.getDay());
              const hrs     = openingHoursMap.get(dbDay);
              return (
                <TouchableOpacity key={d.toISOString()}
                  style={[styles.dateCell, isSel && styles.dateCellSel]}
                  onPress={() => { setDate(d); setTime(''); }} activeOpacity={0.75}>
                  <Text style={[styles.dateDayName, isSel && styles.dateSel]}>
                    {isToday ? 'Dnes' : SK_DAYS_SHORT[d.getDay()]}
                  </Text>
                  <Text style={[styles.dateDayNum, isSel && styles.dateSel]}>{d.getDate()}</Text>
                  <Text style={[styles.dateMonth, isSel && styles.dateSel]}>
                    {SK_MONTHS_SHORT[d.getMonth()]}
                  </Text>
                  {hrs && (
                    <Text style={[styles.dateHours, isSel && styles.dateSel]}>
                      {hrs.open_time}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* ── Výber času ── */}
          <Text style={[styles.sectionLabel, { marginTop: 8 }]}>ČAS</Text>
          {selectedService && (
            <Text style={styles.slotSubLabel}>
              {selectedDayHours
                ? `Ordinuje: ${selectedDayHours.open_time}–${selectedDayHours.close_time}  ·  Trvanie: ${formatDuration(effectiveDuration)}`
                : `Trvanie: ${formatDuration(effectiveDuration)}`}
            </Text>
          )}
          {loadingSlots ? (
            <ActivityIndicator color={COLORS.wal} style={{ marginBottom: 16 }} />
          ) : (
            <View style={styles.timesGrid}>
              {slots.map((slot) => {
                const isSel  = selectedTime === slot.start;
                const taken  = isSlotTaken(slot.start);
                return (
                  <TouchableOpacity key={slot.start}
                    style={[styles.timeCell, isSel && styles.timeCellSel, taken && styles.timeCellTaken]}
                    onPress={() => { if (!taken) setTime(slot.start); }}
                    activeOpacity={taken ? 1 : 0.75}
                    disabled={taken}>
                    <Text style={[styles.timeText, isSel && styles.timeSel, taken && styles.timeTakenText]}>
                      {slot.start}
                    </Text>
                    <Text style={[styles.timeEndText, isSel && { color: COLORS.sand }, taken && styles.timeTakenText]}>
                      –{slot.end}
                    </Text>
                    {taken && <Text style={styles.timeTakenLabel}>✗</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* ── Poznámky ── */}
          <Text style={[styles.sectionLabel, { marginTop: 8 }]}>POZNÁMKY</Text>
          <View style={styles.notesCard}>
            <TextInput
              style={styles.notesInput}
              placeholder="Dôvod návštevy, typ ošetrenia, poznámky..."
              placeholderTextColor="#bbb"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* ── Zhrnutie ── */}
          {selectedPatient && selectedDate && selectedTime && (
            <View style={styles.summaryCard}>
              <Ionicons name="checkmark-circle" size={20} color="#1E8449" />
              <View style={{ flex: 1 }}>
                <Text style={styles.summaryTitle}>Zhrnutie termínu</Text>
                <Text style={styles.summaryLine}>
                  👤 {selectedPatient.full_name}
                </Text>
                <Text style={styles.summaryLine}>
                  📅 {selectedDate.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' })} o {selectedTime}
                </Text>
                <Text style={styles.summaryLine}>
                  ⏱ {formatDuration(effectiveDuration)}
                </Text>
                {notes.trim() ? <Text style={styles.summaryLine}>📝 {notes.trim()}</Text> : null}
              </View>
            </View>
          )}

          {/* ── Tlačidlo ── */}
          <TouchableOpacity
            style={[styles.saveBtn, (!canSave || loading) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!canSave || loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Ionicons name="calendar" size={18} color="#fff" />
                  <Text style={styles.saveBtnText}>Uložiť termín</Text>
                </>}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: COLORS.esp },
  scroll:  { flex: 1, backgroundColor: COLORS.bg2 },
  content: { padding: SIZES.padding, paddingTop: 20 },

  header: { backgroundColor: COLORS.esp, paddingHorizontal: SIZES.padding, paddingTop: 14, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerLabel: { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '500', textTransform: 'uppercase', marginBottom: 3 },
  headerTitle: { fontSize: 19, fontWeight: '600', color: '#fff' },

  sectionLabel: { fontSize: 9, letterSpacing: 2, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 10 },

  // Patient search
  patientSearchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.bg3, paddingHorizontal: 12, marginBottom: 4 },
  patientInput: { flex: 1, paddingVertical: 13, fontSize: 14, color: COLORS.esp },

  dropdown: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: COLORS.bg3, marginBottom: 10, overflow: 'hidden', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6 },
  dropdownEmpty: { padding: 14, fontSize: 13, color: COLORS.wal, textAlign: 'center', fontStyle: 'italic' },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.bg2 },
  dropdownAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.esp, alignItems: 'center', justifyContent: 'center' },
  dropdownAvatarText: { fontSize: 15, fontWeight: '700', color: COLORS.cream },
  dropdownName:  { fontSize: 14, fontWeight: '600', color: COLORS.esp },
  dropdownPhone: { fontSize: 11, color: COLORS.wal, marginTop: 1 },

  selectedChip: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#EAFAF1', borderRadius: 12, borderWidth: 1.5, borderColor: '#A9DFBF', padding: 12, marginBottom: 4 },
  chipAvatar:     { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1E8449', alignItems: 'center', justifyContent: 'center' },
  chipAvatarText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  chipName:  { fontSize: 14, fontWeight: '600', color: '#1E8449' },
  chipPhone: { fontSize: 11, color: '#27AE60', marginTop: 1 },

  // Dates
  datesScroll:  { marginBottom: 12, marginHorizontal: -SIZES.padding },
  datesContent: { paddingHorizontal: SIZES.padding, gap: 8 },
  dateCell:     { width: 58, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.bg3 },
  dateCellSel:  { backgroundColor: COLORS.esp, borderColor: COLORS.sand },
  dateDayName:  { fontSize: 9, fontWeight: '700', color: COLORS.wal, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  dateDayNum:   { fontSize: 20, fontWeight: '700', color: COLORS.esp, marginVertical: 2 },
  dateMonth:    { fontSize: 9, color: COLORS.wal, textTransform: 'uppercase' },
  dateHours:    { fontSize: 7, color: COLORS.wal, marginTop: 2, letterSpacing: 0.2 },
  dateSel:      { color: COLORS.sand },

  // Times
  timesGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  timeCell:       { width: '22%', alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.bg3 },
  timeCellSel:    { backgroundColor: COLORS.esp, borderColor: COLORS.sand },
  timeCellTaken:  { backgroundColor: '#F9F9F9', borderColor: '#E8E8E8', opacity: 0.5 },
  timeText:       { fontSize: 13, fontWeight: '600', color: COLORS.esp },
  timeSel:        { color: COLORS.cream },
  timeTakenText:  { color: '#ccc' },
  timeTakenLabel: { fontSize: 9, color: '#E74C3C', marginTop: 2, fontWeight: '700' },
  timeEndText:    { fontSize: 9, color: '#aaa', marginTop: 2 },
  slotSubLabel:   { fontSize: 11, color: COLORS.wal, fontStyle: 'italic', marginBottom: 8 },

  // Service picker
  servicePickerBtn:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.bg3, padding: 12, marginBottom: 4 },
  servicePickerName:        { fontSize: 13, fontWeight: '700', color: COLORS.esp },
  servicePickerMeta:        { fontSize: 10, color: COLORS.wal, marginTop: 1 },
  servicePickerPlaceholder: { flex: 1, fontSize: 14, color: '#bbb' },
  serviceDropdown:          { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: COLORS.bg3, marginBottom: 8, overflow: 'hidden', elevation: 4 },
  serviceDropdownCat:       { fontSize: 9, fontWeight: '800', color: COLORS.wal, textTransform: 'uppercase', letterSpacing: 1.5, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4, backgroundColor: COLORS.bg2 },
  serviceDropdownItem:      { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.bg2 },
  serviceDropdownName:      { fontSize: 13, fontWeight: '600', color: COLORS.esp },
  serviceDropdownMeta:      { fontSize: 10, color: COLORS.wal, marginTop: 1 },

  // Duration picker
  durationRow:            { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  durationChip:           { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.bg3 },
  durationChipActive:     { backgroundColor: COLORS.esp, borderColor: COLORS.sand },
  durationChipText:       { fontSize: 12, fontWeight: '600', color: COLORS.wal },
  durationChipTextActive: { color: COLORS.cream },
  durationCustomRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.bg3, paddingHorizontal: 12, marginBottom: 4 },
  durationInput:          { flex: 1, paddingVertical: 11, fontSize: 13, color: COLORS.esp },

  // Notes
  notesCard:  { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: COLORS.bg3, padding: 12, marginBottom: 16 },
  notesInput: { fontSize: 13, color: COLORS.esp, minHeight: 72, lineHeight: 20 },

  // Summary
  summaryCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#EAFAF1', borderRadius: 12, borderWidth: 1.5, borderColor: '#A9DFBF', padding: 14, marginBottom: 16 },
  summaryTitle: { fontSize: 11, fontWeight: '700', color: '#1E8449', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  summaryLine:  { fontSize: 13, color: COLORS.esp, marginBottom: 3, lineHeight: 19 },

  saveBtn:         { backgroundColor: COLORS.wal, borderRadius: 14, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, elevation: 4, shadowColor: COLORS.esp, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText:     { fontSize: 15, fontWeight: '700', color: '#fff' },
});
