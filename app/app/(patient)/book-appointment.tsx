import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabase';
import { COLORS, SIZES } from '../../styles/theme';

type Doctor = { id: string; full_name: string | null };

// Generuj časové sloty (30-minútové intervaly, 08:00–17:00)
const TIME_SLOTS = [
  '08:00','08:30','09:00','09:30','10:00','10:30',
  '11:00','11:30','12:00','13:00','13:30',
  '14:00','14:30','15:00','15:30','16:00','16:30','17:00',
];

// Generuj nasledujúcich 21 pracovných dní (bez víkendov)
function getNextDays(count = 21): Date[] {
  const result: Date[] = [];
  let d = new Date();
  d.setHours(0, 0, 0, 0);
  while (result.length < count) {
    d = new Date(d);
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) result.push(new Date(d)); // skip Ne=0, So=6
  }
  return result;
}

const SK_DAYS_SHORT  = ['Ne','Po','Ut','St','Št','Pi','So'];
const SK_MONTHS_SHORT = ['jan','feb','mar','apr','máj','jún','júl','aug','sep','okt','nov','dec'];

function RadioItem({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <TouchableOpacity style={[styles.optionItem, selected && styles.optionItemSel]} onPress={onSelect} activeOpacity={0.75}>
      <View style={[styles.radio, selected && styles.radioSel]}>
        {selected && <View style={styles.radioDot} />}
      </View>
      <Text style={[styles.optionText, selected && styles.optionTextSel]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function BookAppointmentScreen() {
  const router = useRouter();

  const [doctors, setDoctors]         = useState<Doctor[]>([]);
  const [selectedDoctor, setDoctor]   = useState('');
  const [selectedDate, setDate]       = useState<Date | null>(null);
  const [selectedTime, setTime]       = useState('');
  const [notes, setNotes]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [fetchingDoctors, setFetchingDoctors] = useState(true);

  const days = getNextDays(21);

  // Načítaj doktorov
  useEffect(() => {
    supabase.from('profiles').select('id, full_name').eq('role', 'doctor')
      .then(({ data }) => {
        setDoctors(data ?? []);
        if (data && data.length > 0) setDoctor(data[0].id);
        setFetchingDoctors(false);
      });
  }, []);

  async function handleBook() {
    if (!selectedDoctor) { Alert.alert('Chyba', 'Vyberte prosím doktora.'); return; }
    if (!selectedDate)   { Alert.alert('Chyba', 'Vyberte prosím dátum.'); return; }
    if (!selectedTime)   { Alert.alert('Chyba', 'Vyberte prosím čas.'); return; }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nie si prihlásený.');

      // Zostavíme ISO datetime z dátumu + časového slotu
      const [h, m] = selectedTime.split(':').map(Number);
      const dt = new Date(selectedDate);
      dt.setHours(h, m, 0, 0);

      // Kontrola duplicitného termínu
      const { data: existing } = await supabase.from('appointments')
        .select('id').eq('doctor_id', selectedDoctor)
        .eq('appointment_date', dt.toISOString()).eq('status', 'scheduled');
      if (existing && existing.length > 0) {
        throw new Error('Tento čas je už obsadený. Vyberte iný termín.');
      }

      const { error } = await supabase.from('appointments').insert({
        patient_id:       user.id,
        doctor_id:        selectedDoctor,
        appointment_date: dt.toISOString(),
        status:           'scheduled',
        notes:            notes.trim() || null,
      });

      if (error) throw error;
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Úspech ✓', 'Termín bol rezervovaný!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Chyba', e?.message ?? 'Nastala chyba pri rezervácii.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <Ionicons name="chevron-back" size={22} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>REZERVÁCIA</Text>
          <Text style={styles.headerTitle}>Nový termín</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* ── Výber doktora ── */}
        <Text style={styles.sectionLabel}>VYBERTE DOKTORA</Text>
        {fetchingDoctors ? (
          <ActivityIndicator color={COLORS.wal} style={{ marginVertical: 16 }} />
        ) : doctors.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.emptyText}>Žiadni doktori nie sú dostupní.</Text>
          </View>
        ) : (
          <View style={styles.card}>
            {doctors.map((doc) => (
              <RadioItem key={doc.id} label={`👨‍⚕️  ${doc.full_name ?? 'Doktor'}`}
                selected={selectedDoctor === doc.id}
                onSelect={() => setDoctor(doc.id)} />
            ))}
          </View>
        )}

        {/* ── Výber dátumu ── */}
        <Text style={styles.sectionLabel}>VYBERTE DÁTUM</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={styles.datesScroll} contentContainerStyle={styles.datesContent}>
          {days.map((d, i) => {
            const isSel = selectedDate?.toDateString() === d.toDateString();
            return (
              <TouchableOpacity key={i}
                style={[styles.dateCell, isSel && styles.dateCellSel]}
                onPress={() => setDate(d)} activeOpacity={0.75}>
                <Text style={[styles.dateDayName, isSel && styles.dateDayNameSel]}>
                  {SK_DAYS_SHORT[d.getDay()]}
                </Text>
                <Text style={[styles.dateDayNum, isSel && styles.dateDayNumSel]}>{d.getDate()}</Text>
                <Text style={[styles.dateMonth, isSel && styles.dateMonthSel]}>
                  {SK_MONTHS_SHORT[d.getMonth()]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Výber času ── */}
        <Text style={styles.sectionLabel}>VYBERTE ČAS</Text>
        <View style={styles.timesGrid}>
          {TIME_SLOTS.map((slot) => {
            const isSel = selectedTime === slot;
            return (
              <TouchableOpacity key={slot}
                style={[styles.timeCell, isSel && styles.timeCellSel]}
                onPress={() => setTime(slot)} activeOpacity={0.75}>
                <Text style={[styles.timeText, isSel && styles.timeTextSel]}>{slot}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Poznámky ── */}
        <Text style={styles.sectionLabel}>POZNÁMKY (voliteľné)</Text>
        <View style={styles.card}>
          <TextInput style={styles.textarea}
            placeholder="Dôvod návštevy, špeciálne požiadavky..."
            placeholderTextColor={COLORS.sand}
            value={notes} onChangeText={setNotes}
            multiline numberOfLines={3} textAlignVertical="top" />
        </View>

        {/* ── Zhrnutie ── */}
        {selectedDate && selectedTime && (
          <View style={styles.summaryCard}>
            <Ionicons name="calendar-outline" size={16} color={COLORS.wal} />
            <Text style={styles.summaryText}>
              {selectedDate.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' })}
              {' o '}
              <Text style={{ fontWeight: '700' }}>{selectedTime}</Text>
            </Text>
          </View>
        )}

        {/* ── Tlačidlo ── */}
        <TouchableOpacity style={[styles.bookBtn, loading && { opacity: 0.55 }]}
          onPress={handleBook} disabled={loading} activeOpacity={0.85}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <><Ionicons name="calendar-outline" size={18} color="#fff" />
                <Text style={styles.bookBtnText}>Rezervovať termín</Text></>}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },
  content:{ padding: SIZES.padding, paddingTop: 20 },

  header: { backgroundColor: COLORS.esp, paddingHorizontal: SIZES.padding, paddingTop: 14, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerLabel: { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '500', textTransform: 'uppercase', marginBottom: 3 },
  headerTitle: { fontSize: 19, fontWeight: '600', color: '#fff' },

  sectionLabel: { fontSize: 9, letterSpacing: 2, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 10, marginTop: 6 },

  card: { backgroundColor: '#fff', borderRadius: SIZES.radius, borderWidth: 1, borderColor: COLORS.bg3, padding: 12, gap: 6, marginBottom: 20 },
  emptyText: { fontSize: 13, color: COLORS.wal, textAlign: 'center', padding: 8 },

  optionItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.bg3, backgroundColor: '#FAFAF8' },
  optionItemSel: { backgroundColor: COLORS.esp, borderColor: COLORS.wal },
  radio:    { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: COLORS.sand, alignItems: 'center', justifyContent: 'center' },
  radioSel: { borderColor: COLORS.wal },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.wal },
  optionText:    { fontSize: 14, color: COLORS.esp },
  optionTextSel: { color: COLORS.cream, fontWeight: '500' },

  datesScroll:  { marginBottom: 20, marginHorizontal: -SIZES.padding },
  datesContent: { paddingHorizontal: SIZES.padding, gap: 8 },
  dateCell: { width: 56, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.bg3 },
  dateCellSel: { backgroundColor: COLORS.esp, borderColor: COLORS.wal },
  dateDayName: { fontSize: 9, fontWeight: '700', color: COLORS.wal, textTransform: 'uppercase', letterSpacing: 0.5 },
  dateDayNameSel: { color: COLORS.sand },
  dateDayNum:  { fontSize: 20, fontWeight: '700', color: COLORS.esp, marginVertical: 2 },
  dateDayNumSel: { color: '#fff' },
  dateMonth:   { fontSize: 9, color: COLORS.wal, textTransform: 'uppercase' },
  dateMonthSel:{ color: COLORS.sand },

  timesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  timeCell: { width: '22%', alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.bg3 },
  timeCellSel: { backgroundColor: COLORS.esp, borderColor: COLORS.wal },
  timeText:    { fontSize: 14, fontWeight: '600', color: COLORS.esp },
  timeTextSel: { color: COLORS.cream },

  textarea: { fontSize: 13, color: COLORS.esp, minHeight: 70, lineHeight: 20 },

  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.bg3, borderRadius: SIZES.radius, padding: 12, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: COLORS.wal },
  summaryText: { flex: 1, fontSize: 13, color: COLORS.esp, lineHeight: 19 },

  bookBtn: { backgroundColor: COLORS.wal, borderRadius: SIZES.radius, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, elevation: 4 },
  bookBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
