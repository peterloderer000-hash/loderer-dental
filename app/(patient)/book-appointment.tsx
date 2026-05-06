import React, { useState, useEffect, useMemo } from 'react';
import {
  ActivityIndicator, Alert, BackHandler, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Reanimated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming,
  FadeInDown,
} from 'react-native-reanimated';
import { supabase } from '../../supabase';
import { COLORS, SIZES } from '../../styles/theme';
import { SkeletonList } from '../../components/Skeleton';
import { useServices, Service, formatPrice, formatPriceRange, formatDuration } from '../../hooks/useServices';
import { scheduleAppointmentReminder } from '../../hooks/usePushNotifications';
import {
  generateTimeSlotsForDay, getNextOpenDays,
  SK_DAYS_SHORT, SK_MONTHS_SHORT, jsDayToDb, timeToMinutes,
} from '../../utils/timeSlots';
import { fetchBlockedMinutes } from '../../hooks/useTimeBlocks';

type Step = 0 | 1 | 2 | 3 | 4;

type OpeningHour = { open_time: string; close_time: string };
type BookedSlot  = { start: number; end: number }; // minúty od polnoci
type DoctorOption = { id: string; full_name: string; specialty: string | null };

const STEP_LABELS = ['Doktor', 'Služba', 'Dátum', 'Čas', 'Potvrdenie'];

// ─── Progress bar ─────────────────────────────────────────────────────────────
function StepBar({ step }: { step: Step }) {
  return (
    <Reanimated.View entering={FadeInDown.duration(400)} style={styles.stepBar}>
      {STEP_LABELS.map((label, i) => {
        const done   = i < step;
        const active = i === step;
        return (
          <React.Fragment key={label}>
            <View style={styles.stepItem}>
              <View style={[styles.stepDot, done && styles.stepDotDone, active && styles.stepDotActive]}>
                {done
                  ? <Ionicons name="checkmark" size={10} color="#fff" />
                  : <Text style={[styles.stepDotText, active && { color: '#fff' }]}>{i + 1}</Text>}
              </View>
              <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>{label}</Text>
            </View>
            {i < 4 && <View style={[styles.stepLine, done && styles.stepLineDone]} />}
          </React.Fragment>
        );
      })}
    </Reanimated.View>
  );
}

// ─── Pulse confirm button ─────────────────────────────────────────────────────
function PulseButton({ onPress, loading, children }: {
  onPress: () => void; loading: boolean; children: React.ReactNode;
}) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (!loading) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.03, { duration: 700 }),
          withTiming(1,    { duration: 700 }),
        ),
        -1,
        false,
      );
    } else {
      scale.value = withTiming(1, { duration: 150 });
    }
  }, [loading]);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Reanimated.View style={animStyle}>
      <TouchableOpacity
        style={[styles.bookBtn, loading && { opacity: 0.6 }]}
        onPress={onPress}
        disabled={loading}
        activeOpacity={0.85}
      >
        {children}
      </TouchableOpacity>
    </Reanimated.View>
  );
}

// ─── Hlavná obrazovka ─────────────────────────────────────────────────────────
export default function BookAppointmentScreen() {
  const router = useRouter();
  const { forFamily, familyName, familyId } =
    useLocalSearchParams<{ forFamily?: string; familyName?: string; familyId?: string }>();
  const isForFamily = forFamily === '1' && !!familyName;

  const { grouped, flat, loading: loadingServices } = useServices();

  const [step, setStep]                     = useState<Step>(0);
  const [searchQuery, setSearchQuery]       = useState('');
  const [selectedService, setService]       = useState<Service | null>(null);
  const [selectedDate, setDate]             = useState<Date | null>(null);
  const [selectedTime, setTime]             = useState('');
  const [notes, setNotes]                   = useState('');
  const [isUrgent, setIsUrgent]             = useState(false);
  const [doctorId, setDoctorId]             = useState('');
  const [doctorName, setDoctorName]         = useState('');
  const [loading, setLoading]               = useState(false);
  const [wlLoading, setWlLoading]           = useState(false);
  const [wlJoined, setWlJoined]             = useState(false);
  const [doctors, setDoctors]               = useState<DoctorOption[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  // Ordinačné hodiny doktora: kľúč = DB číslo dňa (1=Po … 7=Ne)
  const [openingHoursMap, setOpeningHoursMap] = useState<Map<number, OpeningHour>>(new Map());
  const [loadingHours, setLoadingHours]       = useState(false);
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

  // Načítaj zoznam doktorov (krok 0)
  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Preferuj clinic_members, fallback na profiles
      const { data: members, error: membersErr } = await supabase
        .from('clinic_members')
        .select('user_id, specialty, profiles:user_id(full_name)')
        .eq('role', 'doctor');

      if (!cancelled) {
        if (!membersErr && members && members.length > 0) {
          setDoctors(members.map((m: any) => ({
            id:        m.user_id,
            full_name: m.profiles?.full_name ?? 'MDDr.',
            specialty: m.specialty ?? null,
          })));
        } else {
          // Fallback: profiles table
          const { data: profs } = await supabase
            .from('profiles').select('id, full_name').eq('role', 'doctor');
          if (!cancelled) {
            setDoctors((profs ?? []).map((p: any) => ({
              id:        p.id,
              full_name: p.full_name ?? 'MDDr.',
              specialty: null,
            })));
          }
        }
        setLoadingDoctors(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Načítaj ordinačné hodiny keď je vybraný doktor (krok 1→)
  useEffect(() => {
    if (!doctorId) return;
    let cancelled = false;
    setLoadingHours(true);
    async function load() {
      const { data: hours } = await supabase
        .from('opening_hours')
        .select('day_of_week, open_time, close_time, is_closed')
        .eq('doctor_id', doctorId);
      if (cancelled) return;
      const map = new Map<number, OpeningHour>();
      (hours ?? []).forEach(h => {
        if (!h.is_closed && h.open_time && h.close_time) {
          map.set(h.day_of_week, {
            open_time:  h.open_time.slice(0, 5),
            close_time: h.close_time.slice(0, 5),
          });
        }
      });
      if (map.size === 0) {
        for (let d = 1; d <= 5; d++) map.set(d, { open_time: '08:00', close_time: '17:00' });
      }
      setOpeningHoursMap(map);
      setLoadingHours(false);
    }
    load();
    return () => { cancelled = true; };
  }, [doctorId]);

  // Reset wlJoined pri zmene dátumu
  useEffect(() => { setWlJoined(false); }, [selectedDate]);

  // Načítaj obsadené sloty + blokovania pre vybraný deň
  useEffect(() => {
    if (!selectedDate || !doctorId) { setBookedSlots([]); return; }
    setLoadingSlots(true);
    const dayStart = new Date(selectedDate); dayStart.setHours(0, 0, 0, 0);
    const dayEnd   = new Date(selectedDate); dayEnd.setHours(23, 59, 59, 999);
    Promise.all([
      supabase
        .from('appointments')
        .select('appointment_date, custom_duration_minutes, service:services(duration_minutes)')
        .eq('doctor_id', doctorId)
        .in('status', ['scheduled', 'pending'])
        .gte('appointment_date', dayStart.toISOString())
        .lte('appointment_date', dayEnd.toISOString()),
      fetchBlockedMinutes(doctorId, dayStart, dayEnd),
    ]).then(([{ data }, blockSlots]) => {
      setLoadingSlots(false);
      const apptSlots = (data ?? []).map((a: any) => {
        const d    = new Date(a.appointment_date);
        const sMin = d.getHours() * 60 + d.getMinutes();
        // Použij skutočnú potvrdená dĺžku (ak doktor zmenil pri schválení), inak odhadovanú zo služby
        const dur  = a.custom_duration_minutes ?? a.service?.duration_minutes ?? 30;
        return { start: sMin, end: sMin + dur };
      });
      setBookedSlots([...apptSlots, ...blockSlots]);
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
      if (step > 0) { setStep((s) => (s - 1) as Step); return true; }
      return false;
    });
    return () => sub.remove();
  }, [step]);

  function goBack() {
    if (step > 0) setStep((s) => (s - 1) as Step);
    else router.back();
  }

  async function handleJoinWaitingList() {
    if (!selectedService || !selectedDate || !doctorId) return;
    setWlLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nie si prihlásený.');
      await supabase.from('waiting_list').insert({
        patient_id:     user.id,
        service_id:     selectedService.id,
        preferred_date: selectedDate.toISOString().slice(0, 10),
        notes:          notes.trim() || null,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setWlJoined(true);
    } catch (e: any) {
      Alert.alert('Chyba', e?.message ?? 'Nepodarilo sa pridať na čakaciu listinu.');
    } finally {
      setWlLoading(false);
    }
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

      // Zlož poznámky — ak je rezervácia pre rodinného príslušníka, pridaj jeho meno
      const finalNotes = isForFamily
        ? `[Pre: ${familyName}]${notes.trim() ? ' ' + notes.trim() : ''}`
        : notes.trim() || null;

      // Atomická rezervácia cez RPC — server-side conflict check (chráni aj pred race condition)
      const { data: result, error: rpcError } = await supabase.rpc('book_appointment', {
        p_doctor_id:        doctorId,
        p_patient_id:       user.id,
        p_service_id:       selectedService.id,
        p_start:            dt.toISOString(),
        p_duration_minutes: selectedService.duration_minutes,
        p_notes:            finalNotes,
        p_status:           'pending',
        p_is_urgent:        isUrgent,
      });
      if (rpcError) throw rpcError;
      if (!result?.ok) {
        throw new Error(
          result?.reason === 'conflict'
            ? 'Tento čas je už obsadený. Vyberte iný termín.'
            : result?.reason === 'unauthorized'
            ? 'Nie si prihlásený.'
            : 'Chyba pri vytváraní termínu.'
        );
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Notifikuj doktora o novej žiadosti
      const familySuffix = isForFamily ? ` (pre ${familyName})` : '';
      supabase.from('notifications').insert({
        user_id:  doctorId,
        title:    isUrgent ? '🚨 URGENTNÁ žiadosť o termín' : '📋 Nová žiadosť o termín',
        body:     `${selectedService.name}${familySuffix} · ${dt.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' })} o ${selectedTime}${isUrgent ? ' — URGENTNÉ!' : ''}`,
        type:     isUrgent ? 'warning' : 'info',
      }).then(({ error }) => { if (error) console.warn('Booking notif error:', error.message); });

      // Naplánuj lokálnu pripomienku 1 hodinu pred termínom
      scheduleAppointmentReminder(dt, doctorName || 'doktor', selectedService.name).catch(() => {});

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
          isUrgent:     isUrgent ? '1' : '0',
          familyName:   isForFamily ? (familyName ?? '') : '',
          appointmentIso: dt.toISOString(),
          durationMin:  selectedService.duration_minutes.toString(),
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
          <Text style={styles.headerLabel}>KROK {step + 1} Z 5</Text>
          <Text style={styles.headerTitle}>{STEP_LABELS[step]}</Text>
        </View>
      </View>

      <StepBar step={step} />

      {/* ── Banner pre rodinného príslušníka ── */}
      {isForFamily && (
        <View style={styles.familyBanner}>
          <Ionicons name="people-outline" size={15} color="#784212" />
          <Text style={styles.familyBannerText}>
            Rezervácia pre: <Text style={{ fontWeight: '800' }}>{familyName}</Text>
          </Text>
        </View>
      )}

      {/* ════════════════════════════════════════ KROK 0 — VÝBER DOKTORA */}
      {step === 0 && (
        loadingDoctors ? (
          <View style={{ flex: 1, backgroundColor: COLORS.bg2, padding: SIZES.padding }}>
            <SkeletonList count={3} />
          </View>
        ) : (
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}>
            <Text style={styles.sectionLabel}>S KÝM CHCEŠ ÍSŤ?</Text>

            {doctors.length === 0 ? (
              <View style={styles.emptyDays}>
                <Ionicons name="person-outline" size={36} color={COLORS.bg3} />
                <Text style={styles.emptyDaysText}>Žiadni aktívni doktori neboli nájdení.</Text>
                <Text style={styles.emptyDaysSub}>Skúste nás kontaktovať telefonicky.</Text>
              </View>
            ) : (
              <>
                {doctors.map((doc) => {
                  const selected = doctorId === doc.id;
                  const initials = doc.full_name.trim().split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
                  return (
                    <TouchableOpacity
                      key={doc.id}
                      style={[styles.doctorCard, selected && styles.doctorCardSel]}
                      onPress={() => {
                        setDoctorId(doc.id);
                        setDoctorName(doc.full_name);
                        setOpeningHoursMap(new Map());
                        setDate(null);
                        setTime('');
                        setStep(1);
                      }}
                      activeOpacity={0.8}
                    >
                      {/* Initials avatar */}
                      <View style={[styles.doctorAvatar, selected && { borderColor: COLORS.gold }]}>
                        <Text style={styles.doctorInitials}>{initials}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.doctorName, selected && { color: COLORS.esp }]}>
                          {doc.full_name}
                        </Text>
                        {doc.specialty ? (
                          <Text style={styles.doctorSpec}>{doc.specialty}</Text>
                        ) : (
                          <Text style={styles.doctorSpec}>Zubný lekár</Text>
                        )}
                        <Text style={styles.doctorAvail}>Dostupné termíny ›</Text>
                      </View>
                      {selected && <Ionicons name="checkmark-circle" size={22} color={COLORS.gold} />}
                      {!selected && <Ionicons name="chevron-forward" size={18} color="#ccc" />}
                    </TouchableOpacity>
                  );
                })}

                {/* Nevadí mi kto */}
                <TouchableOpacity
                  style={[styles.doctorCard, { borderStyle: 'dashed' }, doctorId === '__any__' && styles.doctorCardSel]}
                  onPress={() => {
                    const first = doctors[0];
                    if (!first) return;
                    setDoctorId(first.id);
                    setDoctorName(first.full_name);
                    setOpeningHoursMap(new Map());
                    setDate(null);
                    setTime('');
                    setStep(1);
                  }}
                  activeOpacity={0.8}
                >
                  <View style={[styles.doctorAvatar, { backgroundColor: COLORS.bg3 }]}>
                    <Ionicons name="shuffle-outline" size={22} color={COLORS.wal} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.doctorName}>Nevadí mi kto</Text>
                    <Text style={styles.doctorSpec}>Prvý dostupný termín u ľubovoľného doktora</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#ccc" />
                </TouchableOpacity>
              </>
            )}
            <View style={{ height: 100 }} />
          </ScrollView>
        )
      )}

      {/* ════════════════════════════════════════ KROK 1 — SLUŽBA */}
      {step === 1 && (
        loadingServices ? (
          <View style={{ flex: 1, backgroundColor: COLORS.bg2, padding: SIZES.padding }}>
            <SkeletonList count={4} />
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
                placeholderTextColor="#999"
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
                            <Text style={styles.metaText}>~{formatDuration(svc.duration_minutes)}</Text>
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
                            <Text style={styles.metaText}>~{formatDuration(svc.duration_minutes)}</Text>
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
            <View style={{ height: 100 }} />
          </ScrollView>
        )
      )}

      {/* ════════════════════════════════════════ KROK 2 — DÁTUM */}
      {step === 2 && (
        loadingHours ? (
          <View style={{ flex: 1, backgroundColor: COLORS.bg2, padding: SIZES.padding }}>
            <SkeletonList count={4} />
          </View>
        ) : (
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}>

            {selectedService && (
              <View style={styles.selectedServiceChip}>
                <Text style={styles.chipEmoji}>{selectedService.emoji ?? '🦷'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.chipName}>{selectedService.name}</Text>
                  <Text style={styles.chipDur}>⏱ ~{formatDuration(selectedService.duration_minutes)} · orientačný čas</Text>
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
            <View style={{ height: 100 }} />
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
              ? `Ordinačné hodiny: ${selectedDayHours.open_time} – ${selectedDayHours.close_time}  ·  ~${selectedService ? formatDuration(selectedService.duration_minutes) : ''} (orientačný čas)`
              : `~${selectedService ? formatDuration(selectedService.duration_minutes) : ''} (orientačný čas)`}
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
                    {taken && (
                      <Text style={styles.slotTakenLabel}>✗</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Čakacia listina — ak sú všetky sloty obsadené */}
          {!loadingSlots && slots.length > 0 &&
           slots.every(s => isSlotTaken(s.start, selectedService?.duration_minutes ?? 30)) && (
            <View style={styles.wlBox}>
              <Text style={styles.wlTitle}>⏳ Tento deň je plne obsadený</Text>
              <Text style={styles.wlSub}>Môžete sa zapísať na čakaciu listinu pre {selectedDate?.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' })}. Doktor vás kontaktuje pri uvoľnení miesta.</Text>
              {wlJoined ? (
                <View style={styles.wlSuccess}>
                  <Ionicons name="checkmark-circle" size={18} color="#1E8449" />
                  <Text style={styles.wlSuccessText}>Zapísaní na čakaciu listinu ✓</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.wlBtn, wlLoading && { opacity: 0.5 }]}
                  onPress={handleJoinWaitingList}
                  disabled={wlLoading}
                  activeOpacity={0.85}>
                  {wlLoading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <><Ionicons name="person-add-outline" size={15} color="#fff" />
                        <Text style={styles.wlBtnText}>Zapísať sa na čakaciu listinu</Text></>}
                </TouchableOpacity>
              )}
            </View>
          )}

          <TouchableOpacity
            style={[styles.nextBtn, !selectedTime && styles.nextBtnDisabled]}
            onPress={() => selectedTime && setStep(4)}
            disabled={!selectedTime} activeOpacity={0.85}>
            <Text style={styles.nextBtnText}>Pokračovať →</Text>
          </TouchableOpacity>
          <View style={{ height: 100 }} />
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
                { icon: 'time-outline' as const,     text: `${selectedTime} – ${slots.find(s => s.start === selectedTime)?.end ?? ''}  (~${formatDuration(selectedService.duration_minutes)}, orientačný čas)` },
                { icon: 'pricetag-outline' as const, text: formatPriceRange(selectedService.price_min, selectedService.price_max) },
              ].map((row) => (
                <View key={row.icon} style={styles.summaryRow}>
                  <Ionicons name={row.icon} size={15} color={COLORS.wal} />
                  <Text style={styles.summaryRowText}>{row.text}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Urgentná rezervácia */}
          <TouchableOpacity
            style={[styles.urgentCard, isUrgent && styles.urgentCardActive]}
            onPress={() => setIsUrgent(v => !v)}
            activeOpacity={0.8}>
            <View style={styles.urgentLeft}>
              <Text style={styles.urgentEmoji}>🚨</Text>
              <View>
                <Text style={[styles.urgentTitle, isUrgent && styles.urgentTitleActive]}>Urgentná rezervácia</Text>
                <Text style={styles.urgentSub}>Upozorní doktora, aby termín vybavil prednostne</Text>
              </View>
            </View>
            <View style={[styles.urgentToggle, isUrgent && styles.urgentToggleActive]}>
              <View style={[styles.urgentThumb, isUrgent && styles.urgentThumbActive]} />
            </View>
          </TouchableOpacity>

          {/* Poznámky */}
          <Text style={styles.sectionLabel}>POZNÁMKY (voliteľné)</Text>
          <View style={styles.notesCard}>
            <TextInput style={styles.notesInput}
              placeholder="Ďalšie informácie pre doktora..."
              placeholderTextColor="#999"
              value={notes} onChangeText={setNotes}
              multiline numberOfLines={3} textAlignVertical="top" />
          </View>

          <PulseButton onPress={handleBook} loading={loading}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Ionicons name="calendar" size={18} color="#fff" />
                  <Text style={styles.bookBtnText}>Potvrdiť rezerváciu</Text>
                </>}
          </PulseButton>
          <View style={{ height: 100 }} />
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

  familyBanner:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF9E7', paddingHorizontal: SIZES.padding, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F0D9A8' },
  familyBannerText: { fontSize: 13, color: '#784212' },
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
  stepDotText:  { fontSize: 11, fontWeight: '700', color: '#666' },
  stepLabel:    { fontSize: 10, fontWeight: '600', color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 },
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
  sectionSub:   { fontSize: 12, color: COLORS.wal, marginBottom: 14, fontStyle: 'italic' },
  categoryLabel:{ fontSize: 11, letterSpacing: 1.5, color: COLORS.esp, fontWeight: '800', textTransform: 'uppercase', marginBottom: 10, marginTop: 16, paddingLeft: 4, borderLeftWidth: 3, borderLeftColor: COLORS.wal, paddingVertical: 2 },

  // Doctor card (Step 0)
  doctorCard:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.bg3, padding: 14, marginBottom: 10, elevation: 1 },
  doctorCardSel: { borderColor: COLORS.gold, backgroundColor: '#FFFDF7' },
  doctorAvatar:  { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.sand },
  doctorInitials:{ fontSize: 18, fontWeight: '700', color: COLORS.cream, fontFamily: 'PlayfairDisplay_700Bold' },
  doctorName:    { fontSize: 16, fontFamily: 'PlayfairDisplay_700Bold', color: COLORS.esp, marginBottom: 2 },
  doctorSpec:    { fontSize: 12, color: COLORS.wal, marginBottom: 3 },
  doctorAvail:   { fontSize: 11, color: COLORS.gold, fontWeight: '600' },

  // Service card
  serviceCard:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.bg3, padding: 14, marginBottom: 10, elevation: 1 },
  serviceCardSel: { borderColor: '#1E8449', backgroundColor: '#EAFAF1' },
  serviceEmoji:   { width: 52, height: 52, borderRadius: 14, backgroundColor: COLORS.bg3, alignItems: 'center', justifyContent: 'center' },
  serviceEmojiSel:{ backgroundColor: '#D5F5E3' },
  serviceName:    { fontSize: 14, fontWeight: '700', color: COLORS.esp, marginBottom: 2 },
  serviceNameSel: { color: '#1E4D2B' },
  serviceDesc:    { fontSize: 12, color: COLORS.wal, marginBottom: 6 },
  serviceMeta:    { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  metaPill:       { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.bg3, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  metaText:       { fontSize: 11, fontWeight: '600', color: COLORS.wal },

  // Selected chip
  selectedServiceChip: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.sand, padding: 12, marginBottom: 18 },
  chipEmoji: { fontSize: 26 },
  chipName:  { fontSize: 13, fontWeight: '700', color: COLORS.esp },
  chipDur:   { fontSize: 11, color: COLORS.wal, marginTop: 1 },

  // Dates
  datesGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  dateCell:     { width: '13%', flexGrow: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.bg3 },
  dateCellSel:  { backgroundColor: COLORS.esp, borderColor: COLORS.sand },
  dateDayName:  { fontSize: 10, fontWeight: '700', color: COLORS.wal, textTransform: 'uppercase', letterSpacing: 0.3 },
  dateDayNum:   { fontSize: 18, fontWeight: '700', color: COLORS.esp, marginVertical: 1 },
  dateMonth:    { fontSize: 10, color: COLORS.wal, textTransform: 'uppercase' },
  dateHours:    { fontSize: 6, color: COLORS.wal, marginTop: 3, textAlign: 'center', letterSpacing: 0.2 },
  dateHoursSel: { color: COLORS.sand },
  dateSelText:  { color: COLORS.sand },
  emptyDays:     { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyDaysText: { fontSize: 15, fontWeight: '600', color: COLORS.esp, textAlign: 'center' },
  emptyDaysSub:  { fontSize: 13, color: COLORS.wal, textAlign: 'center' },

  // Slots
  slotsGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  slotCell:       { width: '22%', alignItems: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.bg3 },
  slotCellSel:    { backgroundColor: COLORS.esp, borderColor: COLORS.sand },
  slotCellTaken:  { backgroundColor: '#F9F9F9', borderColor: '#E8E8E8', opacity: 0.55 },
  slotStart:      { fontSize: 14, fontWeight: '700', color: COLORS.esp },
  slotEnd:        { fontSize: 10, color: '#888', marginTop: 2 },
  slotSelText:    { color: COLORS.cream },
  slotEndSel:     { color: COLORS.sand },
  slotTakenText:  { color: '#bbb' },
  slotTakenLabel: { fontSize: 12, color: '#bbb', marginTop: 1 },

  // Summary
  summaryCard:    { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1.5, borderColor: COLORS.sand, padding: 16, marginBottom: 20 },
  summaryHeader:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  summaryEmoji:   { fontSize: 36 },
  summaryService: { fontSize: 17, fontWeight: '700', color: COLORS.esp, marginBottom: 3 },
  summaryDoctor:  { fontSize: 13, color: COLORS.wal },
  summaryDivider: { height: 1, backgroundColor: COLORS.bg3, marginBottom: 14 },
  summaryRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  summaryRowText: { flex: 1, fontSize: 13, color: COLORS.esp, lineHeight: 19 },

  // Urgent toggle
  urgentCard:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.bg3, padding: 14, marginBottom: 14 },
  urgentCardActive:   { borderColor: '#E74C3C', backgroundColor: '#FEF9F9' },
  urgentLeft:         { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  urgentEmoji:        { fontSize: 26 },
  urgentTitle:        { fontSize: 14, fontWeight: '700', color: COLORS.esp, marginBottom: 2 },
  urgentTitleActive:  { color: '#C0392B' },
  urgentSub:          { fontSize: 12, color: COLORS.wal, maxWidth: 220 },
  urgentToggle:       { width: 44, height: 26, borderRadius: 13, backgroundColor: COLORS.bg3, justifyContent: 'center', paddingHorizontal: 3 },
  urgentToggleActive: { backgroundColor: '#E74C3C' },
  urgentThumb:        { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', elevation: 2 },
  urgentThumbActive:  { alignSelf: 'flex-end' },

  // Notes
  notesCard:  { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: COLORS.bg3, padding: 12, marginBottom: 20 },
  notesInput: { fontSize: 13, color: COLORS.esp, minHeight: 72, lineHeight: 20 },

  // Waiting list
  wlBox:         { backgroundColor: '#FEF9E7', borderRadius: 14, borderWidth: 1.5, borderColor: '#F9E79F', padding: 16, marginBottom: 16 },
  wlTitle:       { fontSize: 14, fontWeight: '700', color: '#7D6608', marginBottom: 8 },
  wlSub:         { fontSize: 13, color: '#9A7D0A', lineHeight: 19, marginBottom: 14 },
  wlBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.wal, borderRadius: 12, paddingVertical: 12 },
  wlBtnText:     { fontSize: 13, fontWeight: '700', color: '#fff' },
  wlSuccess:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EAFAF1', borderRadius: 10, padding: 10 },
  wlSuccessText: { fontSize: 13, fontWeight: '600', color: '#1E8449' },

  // Buttons
  nextBtn:         { backgroundColor: COLORS.wal, borderRadius: 14, paddingVertical: 15, alignItems: 'center', elevation: 3 },
  nextBtnDisabled: { opacity: 0.35 },
  nextBtnText:     { fontSize: 15, fontWeight: '700', color: '#fff' },
  bookBtn:         { backgroundColor: '#1E8449', borderRadius: 14, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, elevation: 4 },
  bookBtnText:     { fontSize: 15, fontWeight: '700', color: '#fff' },
});
