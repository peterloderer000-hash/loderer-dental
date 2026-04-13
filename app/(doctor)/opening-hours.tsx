import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet,
  Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../supabase';
import { COLORS, SIZES } from '../../styles/theme';

// ─── Konfigurácia ──────────────────────────────────────────────────────────────
const DAYS = [
  { num: 1, label: 'Pondelok', short: 'Po', weekend: false },
  { num: 2, label: 'Utorok',   short: 'Ut', weekend: false },
  { num: 3, label: 'Streda',   short: 'St', weekend: false },
  { num: 4, label: 'Štvrtok',  short: 'Št', weekend: false },
  { num: 5, label: 'Piatok',   short: 'Pi', weekend: false },
  { num: 6, label: 'Sobota',   short: 'So', weekend: true  },
  { num: 7, label: 'Nedeľa',   short: 'Ne', weekend: true  },
];

const PRESETS = [
  { label: '8:00 – 16:00', open: '08:00', close: '16:00' },
  { label: '8:00 – 17:00', open: '08:00', close: '17:00' },
  { label: '9:00 – 17:00', open: '09:00', close: '17:00' },
  { label: '7:00 – 15:00', open: '07:00', close: '15:00' },
];

// ─── Typ ──────────────────────────────────────────────────────────────────────
type DayRow = {
  day_of_week: number;
  open_time:   string;  // 'HH:MM'
  close_time:  string;  // 'HH:MM'
  is_closed:   boolean;
  note:        string;
};

function defaultRow(day: number): DayRow {
  return {
    day_of_week: day,
    open_time:   '08:00',
    close_time:  '17:00',
    is_closed:   day >= 6,
    note:        '',
  };
}

// ─── Pomocné funkcie ───────────────────────────────────────────────────────────
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function durationLabel(open: string, close: string): string {
  const diff = timeToMinutes(close) - timeToMinutes(open);
  if (diff <= 0) return '';
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m === 0 ? `${h} hod` : `${h} hod ${m} min`;
}

// ─── Time Stepper komponent ────────────────────────────────────────────────────
function TimeStepper({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  const mins = timeToMinutes(value);

  function step(delta: number) {
    const next = Math.max(0, Math.min(23 * 60 + 55, mins + delta));
    onChange(minutesToTime(next));
  }

  return (
    <View style={ts.wrap}>
      <Text style={ts.label}>{label}</Text>
      <View style={ts.timeDisplay}>
        <Text style={ts.timeText}>{value}</Text>
      </View>
      <View style={ts.btnRow}>
        <TouchableOpacity style={ts.btn} onPress={() => step(-60)} activeOpacity={0.7}>
          <Text style={ts.btnText}>−1h</Text>
        </TouchableOpacity>
        <TouchableOpacity style={ts.btn} onPress={() => step(-15)} activeOpacity={0.7}>
          <Text style={ts.btnText}>−15</Text>
        </TouchableOpacity>
        <TouchableOpacity style={ts.btn} onPress={() => step(-5)} activeOpacity={0.7}>
          <Text style={ts.btnText}>−5</Text>
        </TouchableOpacity>
        <TouchableOpacity style={ts.btn} onPress={() => step(5)} activeOpacity={0.7}>
          <Text style={ts.btnText}>+5</Text>
        </TouchableOpacity>
        <TouchableOpacity style={ts.btn} onPress={() => step(15)} activeOpacity={0.7}>
          <Text style={ts.btnText}>+15</Text>
        </TouchableOpacity>
        <TouchableOpacity style={ts.btn} onPress={() => step(60)} activeOpacity={0.7}>
          <Text style={ts.btnText}>+1h</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
const ts = StyleSheet.create({
  wrap:        { width: '100%' },
  label:       { fontSize: 9, letterSpacing: 1.5, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  timeDisplay: { alignItems: 'center', marginBottom: 10 },
  timeText:    { fontSize: 36, fontWeight: '800', color: COLORS.esp, letterSpacing: 2 },
  btnRow:      { flexDirection: 'row', gap: 6 },
  btn:         { flex: 1, height: 44, borderRadius: 10, backgroundColor: COLORS.bg3, alignItems: 'center', justifyContent: 'center' },
  btnText:     { fontSize: 13, fontWeight: '800', color: COLORS.wal },
});

// ─── Hlavná obrazovka ─────────────────────────────────────────────────────────
export default function OpeningHoursScreen() {
  const router = useRouter();
  const [rows,     setRows]     = useState<DayRow[]>(DAYS.map(d => defaultRow(d.num)));
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [doctorId, setDoctorId] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setDoctorId(user.id);

      const { data } = await supabase
        .from('opening_hours')
        .select('day_of_week,open_time,close_time,is_closed,note')
        .eq('doctor_id', user.id)
        .order('day_of_week');

      if (data && data.length > 0) {
        setRows(DAYS.map(d => {
          const f = data.find(r => r.day_of_week === d.num);
          return f ? {
            day_of_week: d.num,
            open_time:   f.open_time?.slice(0, 5)  ?? '08:00',
            close_time:  f.close_time?.slice(0, 5) ?? '17:00',
            is_closed:   f.is_closed,
            note:        f.note ?? '',
          } : defaultRow(d.num);
        }));
      }
      setLoading(false);
    }
    load();
  }, []);

  function update(day: number, field: keyof DayRow, value: any) {
    setRows(prev => prev.map(r => r.day_of_week === day ? { ...r, [field]: value } : r));
  }

  // Kopíruj hodiny z jedného dňa na všetky pracovné dni
  function copyToWeekdays(fromDay: number) {
    const src = rows.find(r => r.day_of_week === fromDay);
    if (!src) return;
    Alert.alert(
      'Kopírovať hodiny',
      `Skopírovať ${src.open_time}–${src.close_time} na všetky pracovné dni (Po–Pi)?`,
      [
        { text: 'Zrušiť', style: 'cancel' },
        { text: 'Kopírovať', onPress: () => {
          setRows(prev => prev.map(r =>
            r.day_of_week <= 5
              ? { ...r, open_time: src.open_time, close_time: src.close_time, is_closed: false }
              : r
          ));
        }},
      ]
    );
  }

  // Aplikuj preset na deň
  function applyPreset(day: number, preset: typeof PRESETS[0]) {
    update(day, 'open_time', preset.open);
    update(day, 'close_time', preset.close);
    update(day, 'is_closed', false);
  }

  async function handleSave() {
    // Validácia
    for (const row of rows) {
      if (row.is_closed) continue;
      if (timeToMinutes(row.open_time) >= timeToMinutes(row.close_time)) {
        const dayName = DAYS[row.day_of_week - 1].label;
        Alert.alert('Chyba', `${dayName}: čas otvorenia musí byť pred zatvorením.`);
        return;
      }
    }

    setSaving(true);
    const upsertData = rows.map(r => ({
      doctor_id:   doctorId,
      day_of_week: r.day_of_week,
      open_time:   r.is_closed ? null : r.open_time,
      close_time:  r.is_closed ? null : r.close_time,
      is_closed:   r.is_closed,
      note:        r.note.trim() || null,
      updated_at:  new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('opening_hours')
      .upsert(upsertData, { onConflict: 'doctor_id,day_of_week' });

    setSaving(false);
    if (error) Alert.alert('Chyba', error.message);
    else {
      Alert.alert('Uložené ✓', 'Ordinačné hodiny boli aktualizované.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={COLORS.wal} size="large" /></View>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* ── Hlavička ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerSub}>NASTAVENIA</Text>
          <Text style={styles.headerTitle}>Ordinačné hodiny</Text>
        </View>
        <TouchableOpacity
          style={[styles.saveTopBtn, saving && { opacity: 0.6 }]}
          onPress={handleSave} disabled={saving} activeOpacity={0.85}>
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.saveTopBtnText}>Uložiť</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}>

        {/* ── Info ── */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={15} color="#1A5276" />
          <Text style={styles.infoText}>
            Kliknite na deň pre úpravu. Pomocou +/− tlačidiel nastavte čas po 5 alebo 30 minútach.
          </Text>
        </View>

        {/* ── Rýchly prehľad — všetky dni ── */}
        <View style={styles.overviewCard}>
          <Text style={styles.cardTitle}>PREHĽAD TÝŽDŇA</Text>
          {rows.map(row => {
            const day = DAYS[row.day_of_week - 1];
            const isExp = expanded === row.day_of_week;
            return (
              <TouchableOpacity
                key={row.day_of_week}
                style={[styles.overviewRow, isExp && styles.overviewRowActive]}
                onPress={() => setExpanded(isExp ? null : row.day_of_week)}
                activeOpacity={0.8}
              >
                {/* Deň skratka */}
                <View style={[
                  styles.dayBadge,
                  row.is_closed ? styles.dayBadgeClosed : styles.dayBadgeOpen,
                  day.weekend && !row.is_closed && styles.dayBadgeWeekend,
                ]}>
                  <Text style={[styles.dayShort, row.is_closed && styles.dayShortClosed]}>
                    {day.short}
                  </Text>
                </View>

                {/* Čas */}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dayFullLabel, row.is_closed && { color: '#bbb' }]}>
                    {day.label}
                  </Text>
                  {row.is_closed ? (
                    <Text style={styles.closedText}>Zatvorené</Text>
                  ) : (
                    <Text style={styles.hoursText}>
                      {row.open_time} – {row.close_time}
                      <Text style={styles.durationText}>  {durationLabel(row.open_time, row.close_time)}</Text>
                    </Text>
                  )}
                  {row.note ? <Text style={styles.notePreview} numberOfLines={1}>📝 {row.note}</Text> : null}
                </View>

                {/* Switch + expand */}
                <Switch
                  value={!row.is_closed}
                  onValueChange={(v) => {
                    update(row.day_of_week, 'is_closed', !v);
                    if (v && expanded !== row.day_of_week) setExpanded(row.day_of_week);
                  }}
                  trackColor={{ false: COLORS.bg3, true: COLORS.wal }}
                  thumbColor="#fff"
                  style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                />
                <Ionicons
                  name={isExp ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={COLORS.bg3}
                />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Detail editora pre vybraný deň ── */}
        {expanded !== null && (() => {
          const row  = rows.find(r => r.day_of_week === expanded)!;
          const day  = DAYS[expanded - 1];
          return (
            <View style={styles.editorCard}>
              <Text style={styles.cardTitle}>EDITOVAŤ — {day.label.toUpperCase()}</Text>

              {row.is_closed ? (
                <View style={styles.closedEditor}>
                  <Text style={styles.closedEditorText}>Tento deň je nastavený ako zatvorený.</Text>
                  <TouchableOpacity
                    style={styles.openDayBtn}
                    onPress={() => update(row.day_of_week, 'is_closed', false)}
                    activeOpacity={0.8}>
                    <Text style={styles.openDayBtnText}>Nastaviť ako otvorený</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  {/* Time steppers — stacked vertically */}
                  <View style={styles.steppersCol}>
                    <TimeStepper
                      label="Otvorenie"
                      value={row.open_time}
                      onChange={(v) => update(row.day_of_week, 'open_time', v)}
                    />
                    <View style={styles.stepperDivider} />
                    <TimeStepper
                      label="Zatvorenie"
                      value={row.close_time}
                      onChange={(v) => update(row.day_of_week, 'close_time', v)}
                    />
                  </View>

                  {/* Dĺžka */}
                  {timeToMinutes(row.close_time) > timeToMinutes(row.open_time) && (
                    <View style={styles.durationBadge}>
                      <Ionicons name="time-outline" size={12} color={COLORS.wal} />
                      <Text style={styles.durationBadgeText}>
                        Dĺžka ordinačného dňa: {durationLabel(row.open_time, row.close_time)}
                      </Text>
                    </View>
                  )}

                  {/* Rýchle presety */}
                  <Text style={styles.presetsLabel}>RÝCHLE PRESETY</Text>
                  <View style={styles.presetsRow}>
                    {PRESETS.map(p => (
                      <TouchableOpacity
                        key={p.label}
                        style={[
                          styles.presetBtn,
                          row.open_time === p.open && row.close_time === p.close && styles.presetBtnActive,
                        ]}
                        onPress={() => applyPreset(row.day_of_week, p)}
                        activeOpacity={0.75}>
                        <Text style={[
                          styles.presetText,
                          row.open_time === p.open && row.close_time === p.close && styles.presetTextActive,
                        ]}>{p.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Kopírovať na pracovné dni */}
                  {row.day_of_week <= 5 && (
                    <TouchableOpacity
                      style={styles.copyBtn}
                      onPress={() => copyToWeekdays(row.day_of_week)}
                      activeOpacity={0.8}>
                      <Ionicons name="copy-outline" size={14} color={COLORS.wal} />
                      <Text style={styles.copyBtnText}>Kopírovať tieto hodiny na všetky pracovné dni (Po–Pi)</Text>
                    </TouchableOpacity>
                  )}

                  {/* Poznámka */}
                  <Text style={styles.noteLabel}>POZNÁMKA (voliteľné)</Text>
                  <TextInput
                    style={styles.noteInput}
                    value={row.note}
                    onChangeText={(v) => update(row.day_of_week, 'note', v)}
                    placeholder="napr. Obedná prestávka 12:00 – 13:00"
                    placeholderTextColor="#bbb"
                    maxLength={80}
                  />
                </>
              )}
            </View>
          );
        })()}

        {/* ── Uložiť ── */}
        <TouchableOpacity
          style={[styles.saveFullBtn, saving && { opacity: 0.6 }]}
          onPress={handleSave} disabled={saving} activeOpacity={0.85}>
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <>
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={styles.saveFullBtnText}>Uložiť ordinačné hodiny</Text>
              </>}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: COLORS.esp },
  scroll:  { flex: 1, backgroundColor: COLORS.bg2 },
  content: { padding: SIZES.padding, paddingTop: 12 },
  center:  { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center' },

  header:        { backgroundColor: COLORS.esp, paddingHorizontal: SIZES.padding, paddingTop: 14, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerSub:     { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 3 },
  headerTitle:   { fontSize: 19, fontWeight: '700', color: '#fff' },
  saveTopBtn:    { backgroundColor: COLORS.wal, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  saveTopBtnText:{ fontSize: 13, fontWeight: '700', color: '#fff' },

  infoBanner: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: '#EBF5FB', borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#AED6F1' },
  infoText:   { flex: 1, fontSize: 11, color: '#1A5276', lineHeight: 17 },

  // Prehľad
  overviewCard:      { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: COLORS.bg3 },
  cardTitle:         { fontSize: 9, letterSpacing: 2, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 12 },
  overviewRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.bg3 },
  overviewRowActive: { backgroundColor: COLORS.bg2, marginHorizontal: -14, paddingHorizontal: 14, borderRadius: 0 },

  dayBadge:        { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dayBadgeOpen:    { backgroundColor: COLORS.wal },
  dayBadgeClosed:  { backgroundColor: COLORS.bg3 },
  dayBadgeWeekend: { backgroundColor: '#1A5276' },
  dayShort:        { fontSize: 12, fontWeight: '800', color: '#fff' },
  dayShortClosed:  { color: COLORS.wal },

  dayFullLabel: { fontSize: 13, fontWeight: '700', color: COLORS.esp, marginBottom: 2 },
  closedText:   { fontSize: 11, color: '#bbb', fontStyle: 'italic' },
  hoursText:    { fontSize: 12, fontWeight: '600', color: COLORS.esp },
  durationText: { fontSize: 10, color: COLORS.wal, fontWeight: '400' },
  notePreview:  { fontSize: 9, color: COLORS.wal, marginTop: 2 },

  // Editor
  editorCard:     { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1.5, borderColor: COLORS.wal },
  steppersCol:    { flexDirection: 'column', gap: 0, marginBottom: 14 },
  stepperDivider: { height: 1, backgroundColor: COLORS.bg3, marginVertical: 16 },
  durationBadge:  { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.bg2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 14, alignSelf: 'flex-start' },
  durationBadgeText: { fontSize: 11, color: COLORS.wal, fontWeight: '600' },

  presetsLabel: { fontSize: 8, letterSpacing: 1.5, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  presetsRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  presetBtn:    { borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.bg3, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: COLORS.bg2 },
  presetBtnActive: { borderColor: COLORS.wal, backgroundColor: COLORS.wal + '15' },
  presetText:   { fontSize: 12, fontWeight: '600', color: COLORS.wal },
  presetTextActive: { color: COLORS.wal, fontWeight: '800' },

  copyBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.bg2, borderRadius: 10, padding: 11, marginBottom: 14, borderWidth: 1, borderColor: COLORS.bg3 },
  copyBtnText: { flex: 1, fontSize: 11, color: COLORS.wal, fontWeight: '600' },

  noteLabel: { fontSize: 8, letterSpacing: 1.5, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 },
  noteInput: { backgroundColor: COLORS.bg2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 12, color: COLORS.esp, borderWidth: 1, borderColor: COLORS.bg3 },

  closedEditor:     { alignItems: 'center', paddingVertical: 16, gap: 12 },
  closedEditorText: { fontSize: 13, color: COLORS.wal, fontStyle: 'italic' },
  openDayBtn:       { backgroundColor: COLORS.wal, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  openDayBtnText:   { fontSize: 13, fontWeight: '700', color: '#fff' },

  saveFullBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.esp, borderRadius: 14, paddingVertical: 15 },
  saveFullBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
