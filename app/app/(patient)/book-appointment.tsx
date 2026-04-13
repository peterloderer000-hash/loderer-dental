import React, { useState, useEffect, useMemo } from 'react';
import {
  ActivityIndicator, Alert, BackHandler, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabase';
import { COLORS, SIZES } from '../../styles/theme';
import { useServices, Service, formatPrice, formatPriceRange, formatDuration } from '../../hooks/useServices';
import {
  generateTimeSlotsForDay, getNextOpenDays,
  SK_DAYS_SHORT, SK_MONTHS_SHORT, jsDayToDb, timeToMinutes,
} from '../../utils/timeSlots';

type Step = 1 | 2 | 3 | 4;

type OpeningHour = { open_time: string; close_time: string };
type BookedSlot  = { start: number; end: number }; // minúty od polnoci

const STEP_LABELS = ['Služba', 'Dátum', 'Čas', 'Potvrdenie'];

// ─── Progress bar ─────────────────────────────────────────────────────────────
function StepBar({ step }: { step: Step }) {
  return (
    <View style={styles.stepBar}>
      {STEP_LABELS.map((label, i) => {
        const num = (i + 1) as Step;
        const done   = num < step;
        const active = num === step;
        return (
          <React.Fragment key={label}>
            <View style={styles.stepItem}>
              <View style={[styles.stepDot, done && styles.stepDotDone, active && styles.stepDotActive]}>
                {done
                  ? <Ionicons name="checkmark" size={10} color="#fff" />
                  : <Text style={[styles.stepDotText, active && { color: '#fff' }]}>{num}</Text>}
              </View>
              <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>{label}</Text>
            </View>
            {i < 3 && <View style={[styles.stepLine, done && styles.stepLineDone]} />}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ─── Hlavná obrazovka ─────────────────────────────────────────────────────────
export default function BookAppointmentScreen() {
  const router = useRouter();
  const { grouped, flat, loading: loadingServices } = useServices();

  const [step, setStep]                     = useState<Step>(1);
  const [searchQuery, setSearchQuery]       = useState('');
  const [selectedService, setService]       = useState<Service | null>(null);
  const [selectedDate, setDate]             = useState<Date | null>(null);
  const [selectedTime, setTime]             = useState('');
  const [notes, setNotes]                   = useState('');
  const [doctorId, setDoctorId]             = useState('');
  const [doctorName, setDoctorName]         = useState('');
  const [loading, setLoading]               = useState(false);
  // Ordinačné hodiny doktora: kľúč = DB číslo dňa (1=Po … 7=Ne)
  const [openingHoursMap, setOpeningHoursMap] = useState<Map<number, OpeningHour>>(new Map());
  const [loadingHours, setLoadingHours]       = useState(true);
  // Obsadené sloty pre vybraný deň
  const [bookedSlots,  setBookedSlots]  = useState<BookedSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Set otvorených DB dní odvodený z máp
  const openDbDays = useMemo(() => new Set(openingHoursMap.keys()), [openingHoursMap]);

  // Zoznam dostupných dní — iba dni kedy má doktor otvorené
  const days = useMemo(
    () => openDbDays.size > 0 ? getNextOpenDays(21, openDbDays) : [],
    [openDbDays],
  );

  // Hodiny pre aktuálne vybraný deň
  const selectedDayHours = useMemo((): OpeningHour | null => {
    if (!selectedDate) return null;
    return openingHoursMap.get(jsDayToDb(selectedDate.getDay())) ?? null;
  }, [selectedDate, openingHoursMap]);

  // Časové sloty — dynamicky podľa ordinačných hodín doktora
  const slots = useMemo(() => {
    if (!selectedService || !selectedDayHours) return [];
    return generateTimeSlotsForDay(
      selectedService.duration_minutes,
      selectedDayHours.open_time,
      selectedDayHours.close_time,
    );
  }, [selectedService, selectedDayHours]);

  // Načítaj doktora + jeho ordinačné hodiny
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: doctors } = await supabase
        .from('profiles').select('id, full_name').eq('role', 'doctor');
      if (cancelled) return;
      if (!doctors || doctors.length === 0) { setLoadingHours(false); return; }

      const doc = doctors[0];
      setDoctorId(doc.id);
      setDoctorName(doc.full_name ?? 'MDDr. Loderer');

      const { data: hours } = await supabase
        .from('opening_hours')
        .select('day_of_week, open_time, close_time, is_closed')
        .eq('doctor_id', doc.id);

      if (hours) {
        const map = new Map<number, OpeningHour>();
        hours.forEach(h => {
          if (!h.is_closed && h.open_time && h.close_time) {
            map.set(h.day_of_week, {
              open_time:  h.open_time.slice(0, 5),
              close_time: h.close_time.slice(0, 5),
            });
          }
        });
        // Fallback: ak tabuľka neexistuje, použij Po–Pi 8–17
        if (map.size === 0) {
          for (let d = 1; d <= 5; d++) map.set(d, { open_time: '08:00', close_time: '17:00' });
        }
        setOpeningHoursMap(map);
      }
      if (!cancelled) setLoadingHours(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Načítaj obsadené sloty pre vybraný deň
  useEffect(() => {
    if (!selectedDate || !doctorId) { setBookedSlots([]); return; }
    setLoadingSlots(true);
    const dayStart = new Date(selectedDate); dayStart.setHours(0, 0, 0, 0);
    const dayEnd   = new Date(selectedDate); dayEnd.setHours(23, 59, 59, 999);
    supabase
      .from('appointments')
      .select('appointment_date, service:services(duration_minutes)')
      .eq('doctor_id', doctorId)
      .eq('status', 'scheduled')
      .gte('appointment_date', dayStart.toISOString())
      .lte('appointment_date', dayEnd.toISOString())
      .then(({ data }) => {
        setLoadingSlots(false);
        if (!data) return;
        setBookedSlots(data.map(a => {
          const d    = new Date(a.appointment_date);
          const sMin = d.getHours() * 60 + d.getMinutes();
          const dur  = (a.service as any)?.duration_minutes ?? 30;
          return { start: sMin, end: sMin + dur };
        }));
      });
  }, [selectedDate, doctorId]);

  /** Vráti true ak nový slot [slotStart, slotStart+dur) koliduje s existujúcim termínom */
  function isSlotTaken(slotStart: string, durationMin: number): boolean {
    const s = timeToMinutes(slotStart);
    const e = s + durationMin;
    return bookedSlots.some(b => s < b.end && e > b.start);
  }

  // Android back button — naviguje medzi krokmi
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step > 1) { setStep((s) => (s - 1) as Step); return true; }
      return false;
    });
    return () => sub.remove();
  }, [step]);

  function goBack() {
    if (step > 1) setStep((s) => (s - 1) as Step);
    else router.back();
  }

  async function handleBook() {
    if (!selectedService || !selectedDate || !selectedTime || !doctorId) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nie si prihlásený.');

      const [h, m] = selectedTime.split(':').map(Number);
      const dt = new Date(selectedDate);
      dt.setHours(h, m, 0, 0);

      // Kontrola obsadenosti — duration-based overlap (nie len presná zhoda timestamps)
      const dayStart = new Date(selectedDate); dayStart.setHours(0, 0, 0, 0);
      const dayEnd   = new Date(selectedDate); dayEnd.setHours(23, 59, 59, 999);
      const { data: existing } = await supabase
        .from('appointments')
        .select('appointment_date, service:services(duration_minutes)')
        .eq('doctor_id', doctorId)
        .eq('status', 'scheduled')
        .gte('appointment_date', dayStart.toISOString())
        .lte('appointment_date', dayEnd.toISOString());

      const newStart = h * 60 + m;
      const newEnd   = newStart + selectedService.duration_minutes;
      const conflict = (existing ?? []).some(e => {
        const ed = new Date(e.appointment_date);
        const es = ed.getHours() * 60 + ed.getMinutes();
        const ee = es + ((e.service as any)?.duration_minutes ?? 30);
        return newStart < ee && newEnd > es;
      });
      if (conflict)
        throw new Error('Tento čas je už obsadený. Vyberte iný termín.');

      const { error } = await supabase.from('appointments').insert({
        patient_id:       user.id,
        doctor_id:        doctorId,
        appointment_date: dt.toISOString(),
        status:           'scheduled',
        notes:            notes.trim() || null,
        service_id:       selectedService.id,
      });
      if (error) throw error;

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const endTime = slots.find(s => s.start === selectedTime)?.end ?? '';
      const durStr  = formatDuration(selectedService.duration_minutes);
      const priceStr = formatPriceRange(selectedService.price_min, selectedService.price_max);
      const dateStr  = selectedDate.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

      router.replace({
        pathname: '/(patient)/booking-success',
        params: {
          serviceName:  selectedService.name,
          serviceEmoji: selectedService.emoji ?? '🦷',
          date:         dateStr,
          time:         `${selectedTime}${endTime ? ` – ${endTime}` : ''}`,
          doctorName:   doctorName,
          price:        priceStr,
          duration:     durStr,
          notes:        notes.trim(),
        },
      });
    } catch (e: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Chyba', e?.message ?? 'Nastala chyba pri rezervácii.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Hlavička ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>KROK {step} Z 4</Text>
          <Text style={styles.headerTitle}>{STEP_LABELS[step - 1]}</Text>
        </View>
      </View>

      <StepBar step={step} />

      {/* ════════════════════════════════════════ KROK 1 — SLUŽBA */}
      {step === 1 && (
        loadingServices ? (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.wal} size="large" />
            <Text style={styles.loadingText}>Načítavam služby...</Text>
          </View>
        ) : (
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}>

            {/* ── Search bar ── */}
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={16} color={COLORS.wal} />
              <TextInput
                style={styles.searchInput}
                placeholder="Vyhľadaj službu..."
                placeholderTextColor="#bbb"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color="#bbb" />
                </TouchableOpacity>
              )}
            </View>

            {/* ── Výsledky search alebo grupované kategórie ── */}
            {searchQuery.trim().length > 0 ? (
              // Flat search výsledky
              (() => {
                const q = searchQuery.trim().toLowerCase();
                const results = flat.filter(s =>
                  s.name.toLowerCase().includes(q) ||
                  (s.description ?? '').toLowerCase().includes(q) ||
                  s.category.toLowerCase().includes(q)
                );
                return results.length === 0 ? (
                  <View style={styles.searchEmpty}>
                    <Text style={styles.searchEmptyText}>Žiadna služba nenájdená pre „{searchQuery}"</Text>
                  </View>
                ) : results.map((svc) => {
                  const selected = selectedService?.id === svc.id;
                  return (
                    <TouchableOpacity key={svc.id}
                      style={[styles.serviceCard, selected && styles.serviceCardSel]}
                      onPress={() => { setService(svc); setTime(''); setSearchQuery(''); setStep(2); }}
                      activeOpacity={0.8}>
                      <View style={[styles.serviceEmoji, selected && styles.serviceEmojiSel]}>
                        <Text style={{ fontSize: 26 }}>{svc.emoji ?? '🦷'}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.serviceName, selected && styles.serviceNameSel]}>{svc.name}</Text>
                        <Text style={styles.serviceDesc} numberOfLines={1}>{svc.category}</Text>
                        <View style={styles.serviceMeta}>
                          <View style={styles.metaPill}>
                            <Ionicons name="time-outline" size={10} color={COLORS.wal} />
                            <Text style={styles.metaText}>{formatDuration(svc.duration_minutes)}</Text>
                          </View>
                          <View style={styles.metaPill}>
                            <Ionicons name="pricetag-outline" size={10} color={COLORS.wal} />
                            <Text style={styles.metaText}>{formatPrice(svc.price_min, svc.price_max)}</Text>
                          </View>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="#ddd" />
                    </TouchableOpacity>
                  );
                });
              })()
            ) : (
            // Normálne grupované kategórie
            Object.entries(grouped).map(([category, items]) => (
              <View key={category}>
                <Text style={styles.categoryLabel}>{category}</Text>
                {items.map((svc) => {
                  const selected = selectedService?.id === svc.id;
                  return (
                    <TouchableOpacity key={svc.id}
                      style={[styles.serviceCard, selected && styles.serviceCardSel]}
                      onPress={() => { setService(svc); setTime(''); setStep(2); }}
                      activeOpacity={0.8}>
                      <View style={[styles.serviceEmoji, selected && styles.serviceEmojiSel]}>
                        <Text style={{ fontSize: 26 }}>{svc.emoji ?? '🦷'}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.serviceName, selected && styles.serviceNameSel]}>
                          {svc.name}
                        </Text>
                        {svc.description && (
                          <Text style={styles.serviceDesc} numberOfLines={1}>{svc.description}</Text>
                        )}
                        <View style={styles.serviceMeta}>
                          <View style={styles.metaPill}>
                            <Ionicons name="time-outline" size={10} color={COLORS.wal} />
                            <Text style={styles.metaText}>{formatDuration(svc.duration_minutes)}</Text>
                          </View>
                          <View style={styles.metaPill}>
                            <Ionicons name="pricetag-outline" size={10} color={COLORS.wal} />
                            <Text style={styles.metaText}>{formatPrice(svc.price_min, svc.price_max)}</Text>
                          </View>
                        </View>
                      </View>
                      <Ionicons
                        name={selected ? 'checkmark-circle' : 'chevron-forward'}
                        size={20}
                        color={selected ? '#1E8449' : '#ddd'}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))
            )}
            <View style={{ height: 30 }} />
          </ScrollView>
        )
      )}

      {/* ════════════════════════════════════════ KROK 2 — DÁTUM */}
      {step === 2 && (
        loadingHours ? (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.wal} size="large" />
            <Text style={styles.loadingText}>Načítavam ordinačné hodiny...</Text>
          </View>
        ) : (
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}>

            {selectedService && (
              <View style={styles.selectedServiceChip}>
                <Text style={styles.chipEmoji}>{selectedService.emoji ?? '🦷'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.chipName}>{selectedService.name}</Text>
                  <Text style={styles.chipDur}>{formatDuration(selectedService.duration_minutes)}</Text>
                </View>
              </View>
            )}

            <Text style={styles.sectionLabel}>VYBERTE DÁTUM</Text>
            {days.length === 0 ? (
              <View style={styles.emptyDays}>
                <Ionicons name="calendar-outline" size={36} color={COLORS.bg3} />
                <Text style={styles.emptyDaysText}>Momentálne nie sú dostupné žiadne termíny.</Text>
                <Text style={styles.emptyDaysSub}>Skúste nás kontaktovať telefonicky.</Text>
              </View>
            ) : (
              <View style={styles.datesGrid}>
                {days.map((d) => {
                  const isSel   = selectedDate?.toDateString() === d.toDateString();
                  const isToday = d.toDateString() === new Date().toDateString();
                  const dbDay   = jsDayToDb(d.getDay());
                  const hours   = openingHoursMap.get(dbDay);
                  return (
                    <TouchableOpacity key={d.toISOString()}
                      style={[styles.dateCell, isSel && styles.dateCellSel]}
                      onPress={() => { setDate(d); setTime(''); }}
                      activeOpacity={0.75}>
                      <Text style={[styles.dateDayName, isSel && styles.dateSelText]}>
                        {isToday ? 'Dnes' : SK_DAYS_SHORT[d.getDay()]}
                      </Text>
                      <Text style={[styles.dateDayNum, isSel && styles.dateSelText]}>{d.getDate()}</Text>
                      <Text style={[styles.dateMonth, isSel && styles.dateSelText]}>
                        {SK_MONTHS_SHORT[d.getMonth()]}
                      </Text>
                      {hours && (
                        <Text style={[styles.dateHours, isSel && styles.dateHoursSel]}>
                          {hours.open_time}–{hours.close_time}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <TouchableOpacity
              style={[styles.nextBtn, !selectedDate && styles.nextBtnDisabled]}
              onPress={() => selectedDate && setStep(3)}
              disabled={!selectedDate} activeOpacity={0.85}>
              <Text style={styles.nextBtnText}>Vybrať čas →</Text>
            </TouchableOpacity>
            <View style={{ height: 30 }} />
          </ScrollView>
        )
      )}

      {/* ════════════════════════════════════════ KROK 3 — ČAS */}
      {step === 3 && (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}>

          {selectedService && selectedDate && (
            <View style={styles.selectedServiceChip}>
              <Text style={styles.chipEmoji}>{selectedService.emoji ?? '🦷'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.chipName}>{selectedService.name}</Text>
                <Text style={styles.chipDur}>
                  {selectedDate.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' })}
                </Text>
              </View>
            </View>
          )}

          <Text style={styles.sectionLabel}>VYBERTE ČAS</Text>
          <Text style={styles.sectionSub}>
            {selectedDayHours
              ? `Ordinačné hodiny: ${selectedDayHours.open_time} – ${selectedDayHours.close_time}  ·  Trvanie: ${selectedService ? formatDuration(selectedService.duration_minutes) : ''}`
              : `Trvanie: ${selectedService ? formatDuration(selectedService.duration_minutes) : ''}`}
          </Text>

          {loadingSlots ? (
            <View style={[styles.center, { flex: 0, paddingVertical: 20 }]}>
              <ActivityIndicator color={COLORS.wal} />
              <Text style={[styles.loadingText, { marginTop: 8 }]}>Kontrolujem dostupnosť...</Text>
            </View>
          ) : (
            <View style={styles.slotsGrid}>
              {slots.map((slot) => {
                const isSel  = selectedTime === slot.start;
                const taken  = isSlotTaken(slot.start, selectedService?.duration_minutes ?? 30);
                return (
                  <TouchableOpacity key={slot.start}
                    style={[styles.slotCell, isSel && styles.slotCellSel, taken && styles.slotCellTaken]}
                    onPress={() => { if (!taken) setTime(slot.start); }}
                    activeOpacity={taken ? 1 : 0.75}
                    disabled={taken}>
                    <Text style={[styles.slotStart, isSel && styles.slotSelText, taken && styles.slotTakenText]}>
                      {slot.start}
                    </Text>
                    <Text style={[styles.slotEnd, isSel && styles.slotEndSel, taken && styles.slotTakenText]}>
                      – {slot.end}
                    </Text>
                    {taken && (
                      <Text style={styles.slotTakenLabel}>Obsadené</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <TouchableOpacity
            style={[styles.nextBtn, !selectedTime && styles.nextBtnDisabled]}
            onPress={() => selectedTime && setStep(4)}
            disabled={!selectedTime} activeOpacity={0.85}>
            <Text style={styles.nextBtnText}>Pokračovať →</Text>
          </TouchableOpacity>
          <View style={{ height: 30 }} />
        </ScrollView>
      )}

      {/* ════════════════════════════════════════ KROK 4 — POTVRDENIE */}
      {step === 4 && (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Zhrnutie */}
          {selectedService && selectedDate && (
            <View style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <Text style={styles.summaryEmoji}>{selectedService.emoji ?? '🦷'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.summaryService}>{selectedService.name}</Text>
                  <Text style={styles.summaryDoctor}>👨‍⚕️  {doctorName}</Text>
                </View>
              </View>
              <View style={styles.summaryDivider} />
              {[
                { icon: 'calendar-outline' as const, text: selectedDate.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) },
                { icon: 'time-outline' as const,     text: `${selectedTime} – ${slots.find(s => s.start === selectedTime)?.end ?? ''}  (${formatDuration(selectedService.duration_minutes)})` },
                { icon: 'pricetag-outline' as const, text: formatPriceRange(selectedService.price_min, selectedService.price_max) },
              ].map((row) => (
                <View key={row.icon} style={styles.summaryRow}>
                  <Ionicons name={row.icon} size={15} color={COLORS.wal} />
                  <Text style={styles.summaryRowText}>{row.text}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Poznámky */}
          <Text style={styles.sectionLabel}>POZNÁMKY (voliteľné)</Text>
          <View style={styles.notesCard}>
            <TextInput style={styles.notesInput}
              placeholder="Ďalšie informácie pre doktora..."
              placeholderTextColor="#bbb"
              value={notes} onChangeText={setNotes}
              multiline numberOfLines={3} textAlignVertical="top" />
          </View>

          <TouchableOpacity
            style={[styles.bookBtn, loading && { opacity: 0.6 }]}
            onPress={handleBook} disabled={loading} activeOpacity={0.85}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Ionicons name="calendar" size={18} color="#fff" />
                  <Text style={styles.bookBtnText}>Potvrdiť rezerváciu</Text>
                </>}
          </TouchableOpacity>
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },
  content:{ padding: SIZES.padding, paddingTop: 16 },
  center: { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: COLORS.wal, fontSize: 13 },

  // Header
  header:      { backgroundColor: COLORS.esp, paddingHorizontal: SIZES.padding, paddingTop: 14, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerLabel: { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '500', textTransform: 'uppercase', marginBottom: 3 },
  headerTitle: { fontSize: 19, fontWeight: '600', color: '#fff' },

  // Step bar
  stepBar:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.bg3 },
  stepItem:     { alignItems: 'center', gap: 4 },
  stepDot:      { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.bg3, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: COLORS.bg3 },
  stepDotActive:{ backgroundColor: COLORS.wal, borderColor: COLORS.wal },
  stepDotDone:  { backgroundColor: '#1E8449', borderColor: '#1E8449' },
  stepDotText:  { fontSize: 10, fontWeight: '700', color: '#aaa' },
  stepLabel:    { fontSize: 8, fontWeight: '600', color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5 },
  stepLabelActive: { color: COLORS.wal },
  stepLine:     { flex: 1, height: 2, backgroundColor: COLORS.bg3, marginHorizontal: 4 },
  stepLineDone: { backgroundColor: '#1E8449' },

  // Search
  searchBar:       { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.bg3, paddingHorizontal: 12, marginBottom: 16 },
  searchInput:     { flex: 1, paddingVertical: 11, fontSize: 13, color: COLORS.esp },
  searchEmpty:     { alignItems: 'center', paddingVertical: 30 },
  searchEmptyText: { fontSize: 13, color: COLORS.wal, fontStyle: 'italic', textAlign: 'center' },

  // Section
  sectionLabel: { fontSize: 9, letterSpacing: 2, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6, marginTop: 4 },
  sectionSub:   { fontSize: 11, color: COLORS.wal, marginBottom: 14, fontStyle: 'italic' },
  categoryLabel:{ fontSize: 10, letterSpacing: 1.5, color: COLORS.esp, fontWeight: '800', textTransform: 'uppercase', marginBottom: 10, marginTop: 16, paddingLeft: 4, borderLeftWidth: 3, borderLeftColor: COLORS.wal, paddingVertical: 2 },

  // Service card
  serviceCard:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.bg3, padding: 14, marginBottom: 10, elevation: 1 },
  serviceCardSel: { borderColor: '#1E8449', backgroundColor: '#EAFAF1' },
  serviceEmoji:   { width: 52, height: 52, borderRadius: 14, backgroundColor: COLORS.bg3, alignItems: 'center', justifyContent: 'center' },
  serviceEmojiSel:{ backgroundColor: '#D5F5E3' },
  serviceName:    { fontSize: 14, fontWeight: '700', color: COLORS.esp, marginBottom: 2 },
  serviceNameSel: { color: '#1E4D2B' },
  serviceDesc:    { fontSize: 11, color: COLORS.wal, marginBottom: 6 },
  serviceMeta:    { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  metaPill:       { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.bg3, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  metaText:       { fontSize: 10, fontWeight: '600', color: COLORS.wal },

  // Selected chip
  selectedServiceChip: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.sand, padding: 12, marginBottom: 18 },
  chipEmoji: { fontSize: 26 },
  chipName:  { fontSize: 13, fontWeight: '700', color: COLORS.esp },
  chipDur:   { fontSize: 11, color: COLORS.wal, marginTop: 1 },

  // Dates
  datesGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  dateCell:     { width: '13%', flexGrow: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.bg3 },
  dateCellSel:  { backgroundColor: COLORS.esp, borderColor: COLORS.sand },
  dateDayName:  { fontSize: 8, fontWeight: '700', color: COLORS.wal, textTransform: 'uppercase', letterSpacing: 0.3 },
  dateDayNum:   { fontSize: 18, fontWeight: '700', color: COLORS.esp, marginVertical: 1 },
  dateMonth:    { fontSize: 8, color: COLORS.wal, textTransform: 'uppercase' },
  dateHours:    { fontSize: 6, color: COLORS.wal, marginTop: 3, textAlign: 'center', letterSpacing: 0.2 },
  dateHoursSel: { color: COLORS.sand },
  dateSelText:  { color: COLORS.sand },
  emptyDays:     { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyDaysText: { fontSize: 15, fontWeight: '600', color: COLORS.esp, textAlign: 'center' },
  emptyDaysSub:  { fontSize: 12, color: COLORS.wal, textAlign: 'center' },

  // Slots
  slotsGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  slotCell:       { width: '22%', alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.bg3 },
  slotCellSel:    { backgroundColor: COLORS.esp, borderColor: COLORS.sand },
  slotCellTaken:  { backgroundColor: '#F9F9F9', borderColor: '#E8E8E8', opacity: 0.55 },
  slotStart:      { fontSize: 14, fontWeight: '700', color: COLORS.esp },
  slotEnd:        { fontSize: 9, color: '#aaa', marginTop: 2 },
  slotSelText:    { color: COLORS.cream },
  slotEndSel:     { color: COLORS.sand },
  slotTakenText:  { color: '#ccc' },
  slotTakenLabel: { fontSize: 7, color: '#bbb', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },

  // Summary
  summaryCard:    { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1.5, borderColor: COLORS.sand, padding: 16, marginBottom: 20 },
  summaryHeader:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  summaryEmoji:   { fontSize: 36 },
  summaryService: { fontSize: 17, fontWeight: '700', color: COLORS.esp, marginBottom: 3 },
  summaryDoctor:  { fontSize: 12, color: COLORS.wal },
  summaryDivider: { height: 1, backgroundColor: COLORS.bg3, marginBottom: 14 },
  summaryRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  summaryRowText: { flex: 1, fontSize: 13, color: COLORS.esp, lineHeight: 19 },

  // Notes
  notesCard:  { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: COLORS.bg3, padding: 12, marginBottom: 20 },
  notesInput: { fontSize: 13, color: COLORS.esp, minHeight: 72, lineHeight: 20 },

  // Buttons
  nextBtn:         { backgroundColor: COLORS.wal, borderRadius: 14, paddingVertical: 15, alignItems: 'center', elevation: 3 },
  nextBtnDisabled: { opacity: 0.35 },
  nextBtnText:     { fontSize: 15, fontWeight: '700', color: '#fff' },
  bookBtn:         { backgroundColor: '#1E8449', borderRadius: 14, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, elevation: 4 },
  bookBtnText:     { fontSize: 15, fontWeight: '700', color: '#fff' },
});
