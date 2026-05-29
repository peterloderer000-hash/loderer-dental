import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TextInput, Switch, TouchableOpacity,
  ScrollView, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII } from '../../styles/theme';
import { useAppTheme } from '../../context/ThemeContext';

type ClinicException = {
  id: string;
  date: string;        // YYYY-MM-DD
  is_closed: boolean;
  open_time: string;
  close_time: string;
  note: string;
};

const DAYS = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];

type DayRow = {
  id: string | null;
  day_of_week: number;
  day_index: number;
  day_name: string;
  is_open: boolean;
  is_closed: boolean;
  time_from: string;
  time_to: string;
  open_time: string;
  close_time: string;
  clinic_id: string | null;
};

export default function OpeningHoursScreen() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  const [hours, setHours] = useState<DayRow[]>(
    DAYS.map((day, index) => ({
      id: null,
      day_of_week: index + 1,
      day_index: index,
      day_name: day,
      is_open: index < 5,
      is_closed: index >= 5,
      time_from: '08:00',
      time_to: '17:00',
      open_time: '08:00',
      close_time: '17:00',
      clinic_id: null,
    }))
  );
  const [saving,      setSaving]      = useState(false);
  const [exceptions,  setExceptions]  = useState<ClinicException[]>([]);
  const [exSaving,    setExSaving]    = useState(false);
  const [doctorId,    setDoctorId]    = useState('');

  // Nová výnimka — form stav
  const [exDate,      setExDate]      = useState('');
  const [exClosed,    setExClosed]    = useState(true);
  const [exOpen,      setExOpen]      = useState('08:00');
  const [exClose,     setExClose]     = useState('13:00');
  const [exNote,      setExNote]      = useState('');
  const [showExForm,  setShowExForm]  = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setDoctorId(user.id);
    });
    load();
    loadExceptions();
  }, []);

  async function load() {
    const { data } = await supabase.from('opening_hours').select('*');
    if (data && data.length > 0) {
      setHours((prev) => {
        const next = [...prev];
        data.forEach((item: any) => {
          const idx = (item.day_of_week ?? (item.day_index + 1)) - 1;
          if (idx >= 0 && idx <= 6) {
            next[idx] = {
              ...next[idx],
              id:          item.id,
              day_of_week: item.day_of_week ?? item.day_index + 1,
              is_open:     item.is_open ?? !item.is_closed,
              is_closed:   item.is_closed ?? !item.is_open,
              time_from:   item.time_from ?? item.open_time ?? '08:00',
              time_to:     item.time_to   ?? item.close_time ?? '17:00',
              open_time:   item.open_time ?? item.time_from ?? '08:00',
              close_time:  item.close_time ?? item.time_to  ?? '17:00',
              clinic_id:   item.clinic_id ?? null,
            };
          }
        });
        return next;
      });
    }
  }

  function toggle(index: number, value: boolean) {
    setHours((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], is_open: value, is_closed: !value };
      return next;
    });
  }

  function setTime(index: number, field: 'time_from' | 'time_to', value: string) {
    setHours((prev) => {
      const next = [...prev];
      const mapped = field === 'time_from' ? { time_from: value, open_time: value } : { time_to: value, close_time: value };
      next[index] = { ...next[index], ...mapped };
      return next;
    });
  }

  async function loadExceptions() {
    if (!doctorId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('clinic_exceptions')
        .select('id, date, is_closed, open_time, close_time, note')
        .eq('doctor_id', user.id)
        .order('date', { ascending: true });
      setExceptions((data ?? []) as ClinicException[]);
    } else {
      const { data } = await supabase
        .from('clinic_exceptions')
        .select('id, date, is_closed, open_time, close_time, note')
        .eq('doctor_id', doctorId)
        .order('date', { ascending: true });
      setExceptions((data ?? []) as ClinicException[]);
    }
  }

  async function addException() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exDate.trim())) {
      Alert.alert('Chyba', 'Dátum musí byť vo formáte YYYY-MM-DD (napr. 2026-05-01).');
      return;
    }
    setExSaving(true);
    const uid = doctorId || (await supabase.auth.getUser()).data.user?.id;
    const { error } = await supabase.from('clinic_exceptions').upsert({
      doctor_id:  uid,
      date:       exDate.trim(),
      is_closed:  exClosed,
      open_time:  exClosed ? null : exOpen,
      close_time: exClosed ? null : exClose,
      note:       exNote.trim() || null,
    }, { onConflict: 'doctor_id,date' });
    setExSaving(false);
    if (error) { Alert.alert('Chyba', error.message); return; }
    setExDate(''); setExNote(''); setExClosed(true); setShowExForm(false);
    loadExceptions();
  }

  async function deleteException(ex: ClinicException) {
    Alert.alert('Odstrániť výnimku', `Odstrániť výnimku pre ${ex.date}?`, [
      { text: 'Nie', style: 'cancel' },
      { text: 'Odstrániť', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('clinic_exceptions').delete().eq('id', ex.id);
        if (error) { Alert.alert('Chyba', error.message); return; }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        loadExceptions();
      }},
    ]);
  }

  async function save() {
    setSaving(true);
    const payload = hours.map(({ day_name, ...rest }) => ({
      ...rest,
      day_of_week: rest.day_index + 1,
      is_closed:   !rest.is_open,
      open_time:   rest.time_from,
      close_time:  rest.time_to,
    }));
    const { error } = await supabase.from('opening_hours').upsert(payload, { onConflict: 'day_of_week' });
    setSaving(false);
    if (error) Alert.alert('Chyba', error.message);
    else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Uložené', 'Ordinačné hodiny boli uložené.');
    }
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.esp }]} edges={['top']}>
      <View style={[s.header, { backgroundColor: colors.esp }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerSub}>NASTAVENIA</Text>
          <Text style={s.headerTitle}>Ordinačné hodiny</Text>
        </View>
      </View>

      <ScrollView style={[s.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {hours.map((item, index) => (
          <View key={index} style={[s.row, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Text style={[s.dayText, { color: colors.textPrimary }]}>{item.day_name}</Text>
            <Switch
              value={item.is_open}
              onValueChange={(val) => toggle(index, val)}
              trackColor={{ false: colors.bg3, true: COLORS.gold }}
              thumbColor={COLORS.cream}
            />
            <View style={s.timeRow}>
              <TextInput
                style={[s.timeInput, !item.is_open && s.disabled, { color: colors.textPrimary, borderColor: colors.wal, backgroundColor: item.is_open ? (dark ? colors.inputBg : COLORS.cream) : colors.bg3 }]}
                value={item.time_from}
                onChangeText={(t) => setTime(index, 'time_from', t)}
                editable={item.is_open}
                keyboardType="numeric"
                maxLength={5}
                placeholderTextColor={dark ? '#666' : '#999'}
              />
              <Text style={[s.sep, { color: colors.textSecondary }]}>–</Text>
              <TextInput
                style={[s.timeInput, !item.is_open && s.disabled, { color: colors.textPrimary, borderColor: colors.wal, backgroundColor: item.is_open ? (dark ? colors.inputBg : COLORS.cream) : colors.bg3 }]}
                value={item.time_to}
                onChangeText={(t) => setTime(index, 'time_to', t)}
                editable={item.is_open}
                keyboardType="numeric"
                maxLength={5}
                placeholderTextColor={dark ? '#666' : '#999'}
              />
            </View>
          </View>
        ))}

        <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.5 }]} onPress={save} disabled={saving} activeOpacity={0.85}>
          {saving
            ? <ActivityIndicator color={COLORS.esp} />
            : <Text style={s.saveBtnText}>Uložiť pravidelný rozvrh</Text>}
        </TouchableOpacity>

        {/* ── Výnimky ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 28, marginBottom: 10 }}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Výnimky</Text>
          <TouchableOpacity
            style={[s.addExBtn, { backgroundColor: dark ? COLORS.wal + '22' : '#F4ECE4', borderColor: dark ? COLORS.wal + '55' : COLORS.sand }]}
            onPress={() => setShowExForm(v => !v)}
            activeOpacity={0.8}
          >
            <Ionicons name={showExForm ? 'close-outline' : 'add-outline'} size={16} color={COLORS.wal} />
            <Text style={[s.addExBtnText, { color: COLORS.wal }]}>{showExForm ? 'Zrušiť' : 'Pridať'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={[s.sectionSub, { color: colors.textSecondary }]}>Sviatky, dovolenka alebo iné hodiny pre konkrétny dátum.</Text>

        {/* Formulár na pridanie výnimky */}
        {showExForm && (
          <View style={[s.exForm, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Text style={[s.exLabel, { color: colors.textSecondary }]}>DÁTUM (YYYY-MM-DD)</Text>
            <TextInput
              style={[s.exInput, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
              value={exDate} onChangeText={setExDate}
              placeholder="2026-12-24"
              placeholderTextColor={dark ? '#555' : '#bbb'}
              keyboardType="numbers-and-punctuation"
              maxLength={10}
            />

            <View style={s.exToggleRow}>
              <Text style={[s.exLabel, { color: colors.textSecondary, marginTop: 0 }]}>ZATVORENÉ CELÝ DEŇ</Text>
              <Switch
                value={exClosed}
                onValueChange={setExClosed}
                trackColor={{ false: colors.bg3, true: COLORS.wal }}
                thumbColor={COLORS.cream}
              />
            </View>

            {!exClosed && (
              <View style={s.exTimeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.exLabel, { color: colors.textSecondary }]}>OD</Text>
                  <TextInput
                    style={[s.exInput, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
                    value={exOpen} onChangeText={setExOpen}
                    placeholder="08:00" placeholderTextColor={dark ? '#555' : '#bbb'}
                    keyboardType="numbers-and-punctuation" maxLength={5}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.exLabel, { color: colors.textSecondary }]}>DO</Text>
                  <TextInput
                    style={[s.exInput, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
                    value={exClose} onChangeText={setExClose}
                    placeholder="13:00" placeholderTextColor={dark ? '#555' : '#bbb'}
                    keyboardType="numbers-and-punctuation" maxLength={5}
                  />
                </View>
              </View>
            )}

            <Text style={[s.exLabel, { color: colors.textSecondary }]}>POZNÁMKA (voliteľné)</Text>
            <TextInput
              style={[s.exInput, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
              value={exNote} onChangeText={setExNote}
              placeholder="Napr. Sviatok práce, dovolenka..."
              placeholderTextColor={dark ? '#555' : '#bbb'}
            />

            <TouchableOpacity
              style={[s.saveBtn, { marginTop: 12, backgroundColor: COLORS.esp }, exSaving && { opacity: 0.5 }]}
              onPress={addException} disabled={exSaving} activeOpacity={0.85}
            >
              {exSaving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={[s.saveBtnText, { color: COLORS.cream }]}>Uložiť výnimku</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* Zoznam výnimiek */}
        {exceptions.length === 0 ? (
          <Text style={[s.exEmpty, { color: colors.textSecondary }]}>Žiadne výnimky — ambulancia funguje podľa pravidelného rozvrhu.</Text>
        ) : (
          exceptions.map(ex => (
            <View key={ex.id} style={[s.exRow, { backgroundColor: colors.cardBg, borderColor: ex.is_closed ? (dark ? '#C0392B33' : '#F5B7B1') : (dark ? '#27AE6033' : '#A9DFBF') }]}>
              <View style={[s.exDateBox, { backgroundColor: ex.is_closed ? (dark ? '#4A1010' : '#FDEDEC') : (dark ? '#0D3B1F' : '#EAFAF1') }]}>
                <Text style={[s.exDateText, { color: ex.is_closed ? '#E74C3C' : '#1E8449' }]}>
                  {ex.date.slice(5)}
                </Text>
                <Text style={[s.exDateYear, { color: ex.is_closed ? '#E74C3C' : '#1E8449', opacity: 0.7 }]}>
                  {ex.date.slice(0, 4)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.exStatus, { color: ex.is_closed ? '#E74C3C' : '#1E8449' }]}>
                  {ex.is_closed ? '🔴 Zatvorené' : `🟢 ${ex.open_time ?? ''}–${ex.close_time ?? ''}`}
                </Text>
                {ex.note ? <Text style={[s.exNoteText, { color: colors.textSecondary }]}>{ex.note}</Text> : null}
              </View>
              <TouchableOpacity
                onPress={() => deleteException(ex)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="trash-outline" size={16} color="#C0392B" />
              </TouchableOpacity>
            </View>
          ))
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: COLORS.esp },
  scroll:  { flex: 1, backgroundColor: COLORS.bg2 },
  content: { padding: 16 },
  header:  {
    backgroundColor: COLORS.esp, paddingHorizontal: 16,
    paddingTop: 14, paddingBottom: 18,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  backBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerSub:  { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  headerTitle:{ fontSize: 19, fontWeight: '700', color: '#fff' },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', padding: 14, borderRadius: 12, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.bg3,
  },
  dayText:   { width: 30, fontSize: 15, fontWeight: '700', color: COLORS.esp },
  timeRow:   { flexDirection: 'row', alignItems: 'center' },
  timeInput: {
    width: 58, height: 36, borderWidth: 1, borderColor: COLORS.wal,
    borderRadius: 8, textAlign: 'center', fontSize: 14,
    fontWeight: '600', color: COLORS.esp, backgroundColor: COLORS.cream,
  },
  disabled:    { backgroundColor: COLORS.bg3, color: COLORS.sand, borderColor: COLORS.bg3 },
  sep:         { marginHorizontal: 6, fontSize: 16, color: COLORS.wal },
  saveBtn:     { backgroundColor: COLORS.gold, paddingVertical: 15, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: COLORS.esp, fontSize: 16, fontWeight: '800' },

  sectionTitle:  { fontSize: 14, fontWeight: '800' },
  sectionSub:    { fontSize: 12, marginBottom: 14, fontStyle: 'italic' },
  addExBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 6 },
  addExBtnText:  { fontSize: 12, fontWeight: '700' },
  exForm:        { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 14 },
  exLabel:       { fontSize: 9, letterSpacing: 1.5, fontWeight: '700', textTransform: 'uppercase', marginTop: 12, marginBottom: 6 },
  exInput:       { borderWidth: 1.5, borderRadius: 10, padding: 11, fontSize: 14, marginBottom: 2 },
  exToggleRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  exTimeRow:     { flexDirection: 'row', gap: 12, marginTop: 8 },
  exEmpty:       { fontSize: 13, fontStyle: 'italic', textAlign: 'center', paddingVertical: 16 },
  exRow:         { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8 },
  exDateBox:     { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', minWidth: 54 },
  exDateText:    { fontSize: 14, fontWeight: '800' },
  exDateYear:    { fontSize: 9, fontWeight: '600' },
  exStatus:      { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  exNoteText:    { fontSize: 11 },
});
