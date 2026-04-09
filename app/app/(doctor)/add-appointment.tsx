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

type Patient = { id: string; full_name: string | null; phone_number: string | null };

const TIME_SLOTS = ['08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30',
                    '12:00','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00'];

const SK_DAYS_SHORT   = ['Ne','Po','Ut','St','Št','Pi','So'];
const SK_MONTHS_SHORT = ['jan','feb','mar','apr','máj','jún','júl','aug','sep','okt','nov','dec'];

function getNextDays(count = 21): Date[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    return d;
  });
}

export default function DoctorAddAppointment() {
  const router  = useRouter();
  const params  = useLocalSearchParams<{ patientId?: string; patientName?: string }>();

  const [patients, setPatients]     = useState<Patient[]>([]);
  const [patientQuery, setQuery]    = useState(params.patientName ?? '');
  const [selectedPatient, setPatient] = useState<Patient | null>(null);
  const [showDropdown, setDropdown] = useState(false);
  const [selectedDate, setDate]     = useState<Date | null>(null);
  const [selectedTime, setTime]     = useState('');
  const [notes, setNotes]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [loadingPatients, setLoadingP] = useState(true);

  const days = getNextDays(21);

  // Načítaj zoznam pacientov
  useEffect(() => {
    supabase.from('profiles').select('id, full_name, phone_number').eq('role', 'patient')
      .order('full_name', { ascending: true })
      .then(({ data }) => {
        const list = (data ?? []) as Patient[];
        setPatients(list);
        // Ak bol predvybraný pacient cez params
        if (params.patientId) {
          const found = list.find((p) => p.id === params.patientId);
          if (found) { setPatient(found); setQuery(found.full_name ?? ''); }
        }
        setLoadingP(false);
      });
  }, []);

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
    if (!selectedDate)    { Alert.alert('Chyba', 'Vyber prosím dátum.'); return; }
    if (!selectedTime)    { Alert.alert('Chyba', 'Vyber prosím čas.'); return; }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nie si prihlásený.');

      const [h, m] = selectedTime.split(':').map(Number);
      const dt     = new Date(selectedDate);
      dt.setHours(h, m, 0, 0);

      // Kontrola duplicitného termínu
      const { data: existing } = await supabase.from('appointments')
        .select('id').eq('doctor_id', user.id)
        .eq('appointment_date', dt.toISOString())
        .eq('status', 'scheduled');
      if (existing && existing.length > 0)
        throw new Error('Tento čas je už obsadený. Vyber iný termín.');

      const { error } = await supabase.from('appointments').insert({
        patient_id:       selectedPatient.id,
        doctor_id:        user.id,
        appointment_date: dt.toISOString(),
        status:           'scheduled',
        notes:            notes.trim() || null,
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

  const canSave = !!selectedPatient && !!selectedDate && !!selectedTime;

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

          {/* ── Výber dátumu ── */}
          <Text style={[styles.sectionLabel, { marginTop: 24 }]}>DÁTUM</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={styles.datesScroll} contentContainerStyle={styles.datesContent}>
            {days.map((d, i) => {
              const isSel   = selectedDate?.toDateString() === d.toDateString();
              const isToday = d.toDateString() === new Date().toDateString();
              return (
                <TouchableOpacity key={i}
                  style={[styles.dateCell, isSel && styles.dateCellSel]}
                  onPress={() => setDate(d)} activeOpacity={0.75}>
                  <Text style={[styles.dateDayName, isSel && styles.dateSel]}>
                    {isToday ? 'Dnes' : SK_DAYS_SHORT[d.getDay()]}
                  </Text>
                  <Text style={[styles.dateDayNum, isSel && styles.dateSel]}>{d.getDate()}</Text>
                  <Text style={[styles.dateMonth, isSel && styles.dateSel]}>
                    {SK_MONTHS_SHORT[d.getMonth()]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* ── Výber času ── */}
          <Text style={[styles.sectionLabel, { marginTop: 8 }]}>ČAS</Text>
          <View style={styles.timesGrid}>
            {TIME_SLOTS.map((slot) => {
              const isSel = selectedTime === slot;
              return (
                <TouchableOpacity key={slot}
                  style={[styles.timeCell, isSel && styles.timeCellSel]}
                  onPress={() => setTime(slot)} activeOpacity={0.75}>
                  <Text style={[styles.timeText, isSel && styles.timeSel]}>{slot}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

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
  dateSel:      { color: COLORS.sand },

  // Times
  timesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  timeCell:    { width: '22%', alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.bg3 },
  timeCellSel: { backgroundColor: COLORS.esp, borderColor: COLORS.sand },
  timeText:    { fontSize: 13, fontWeight: '600', color: COLORS.esp },
  timeSel:     { color: COLORS.cream },

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
