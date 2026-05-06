import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Switch, TouchableOpacity,
  ScrollView, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../supabase';
import { COLORS } from '../../styles/theme';

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
  const [hours, setHours] = useState<DayRow[]>(
    DAYS.map((day, index) => ({
      id: null,
      day_index: index,
      day_name: day,
      is_open: index < 5,
      time_from: '08:00',
      time_to: '17:00',
      clinic_id: null,
    }))
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

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
    else Alert.alert('Uložené', 'Ordinačné hodiny boli uložené.');
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerSub}>NASTAVENIA</Text>
          <Text style={s.headerTitle}>Ordinačné hodiny</Text>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {hours.map((item, index) => (
          <View key={index} style={s.row}>
            <Text style={s.dayText}>{item.day_name}</Text>
            <Switch
              value={item.is_open}
              onValueChange={(val) => toggle(index, val)}
              trackColor={{ false: COLORS.bg3, true: COLORS.gold }}
              thumbColor={COLORS.cream}
            />
            <View style={s.timeRow}>
              <TextInput
                style={[s.timeInput, !item.is_open && s.disabled]}
                value={item.time_from}
                onChangeText={(t) => setTime(index, 'time_from', t)}
                editable={item.is_open}
                keyboardType="numeric"
                maxLength={5}
              />
              <Text style={s.sep}>–</Text>
              <TextInput
                style={[s.timeInput, !item.is_open && s.disabled]}
                value={item.time_to}
                onChangeText={(t) => setTime(index, 'time_to', t)}
                editable={item.is_open}
                keyboardType="numeric"
                maxLength={5}
              />
            </View>
          </View>
        ))}

        <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.5 }]} onPress={save} disabled={saving} activeOpacity={0.85}>
          {saving
            ? <ActivityIndicator color={COLORS.esp} />
            : <Text style={s.saveBtnText}>Uložiť</Text>}
        </TouchableOpacity>
        <View style={{ height: 40 }} />
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
});
