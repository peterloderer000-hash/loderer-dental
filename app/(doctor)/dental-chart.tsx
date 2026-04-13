import React, { useState, useCallback } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, Modal, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { COLORS, SIZES } from '../../styles/theme';
import { useDentalChart, ToothStatus, ToothRecord } from '../../hooks/useDentalChart';

const SCREEN_W = Dimensions.get('window').width;
const TOOTH_SIZE = Math.floor((SCREEN_W - 32 - 7 * 4) / 8); // 8 zubov, 7 medzier po 4px, padding 16 na každej strane

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_LIST: { key: ToothStatus; label: string; color: string; bg: string }[] = [
  { key: 'healthy',    label: 'Zdravý',        color: '#1E8449', bg: '#EAFAF1' },
  { key: 'cavity',     label: 'Kaz',           color: '#922B21', bg: '#FDEDEC' },
  { key: 'filled',     label: 'Plomba',        color: '#9A7D0A', bg: '#FEF9E7' },
  { key: 'crown',      label: 'Korunka',       color: '#1A5276', bg: '#EBF5FB' },
  { key: 'extracted',  label: 'Extrahovaný',   color: '#566573', bg: '#F2F3F4' },
  { key: 'missing',    label: 'Chýba',         color: '#AAB7B8', bg: '#FDFEFE' },
  { key: 'root_canal', label: 'Devitalizácia', color: '#6C3483', bg: '#F5EEF8' },
];

function getStatus(key: ToothStatus) {
  return STATUS_LIST.find((s) => s.key === key) ?? STATUS_LIST[0];
}

// ─── Jednotlivý zub ───────────────────────────────────────────────────────────
const Tooth = React.memo(function Tooth({ num, record, onPress }: {
  num: number;
  record: ToothRecord | undefined;
  onPress: () => void;
}) {
  const s = record ? getStatus(record.status) : null;
  const bg     = s ? s.bg     : '#fff';
  const border = s ? s.color  : COLORS.bg3;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.tooth, { width: TOOTH_SIZE, height: TOOTH_SIZE + 10, backgroundColor: bg, borderColor: border }]}
    >
      <Text style={[styles.toothNum, { color: border }]}>{num}</Text>
      {s && s.key !== 'healthy' && (
        <View style={[styles.dot, { backgroundColor: border }]} />
      )}
    </TouchableOpacity>
  );
});

// ─── Riadok zubov ─────────────────────────────────────────────────────────────
const ToothRow = React.memo(function ToothRow({ teeth, chart, onPress }: {
  teeth: number[];
  chart: Record<number, ToothRecord>;
  onPress: (n: number) => void;
}) {
  return (
    <View style={styles.row}>
      {teeth.map((n) => (
        <Tooth key={n} num={n} record={chart[n]} onPress={() => onPress(n)} />
      ))}
    </View>
  );
});

// ─── Edit modal ───────────────────────────────────────────────────────────────
function EditModal({ tooth, record, visible, onClose, onSave, saving }: {
  tooth: number;
  record: ToothRecord | undefined;
  visible: boolean;
  onClose: () => void;
  onSave: (status: ToothStatus, notes: string) => void;
  saving: boolean;
}) {
  const [sel, setSel]     = useState<ToothStatus>(record?.status ?? 'healthy');
  const [notes, setNotes] = useState(record?.notes ?? '');

  React.useEffect(() => {
    setSel(record?.status ?? 'healthy');
    setNotes(record?.notes ?? '');
  }, [tooth, record]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>Zub č. {tooth}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={COLORS.esp} />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>STAV ZUBA</Text>
          <View style={styles.statusGrid}>
            {STATUS_LIST.map((s) => (
              <TouchableOpacity
                key={s.key}
                onPress={() => setSel(s.key)}
                activeOpacity={0.8}
                style={[
                  styles.statusBtn,
                  { backgroundColor: s.bg, borderColor: s.color },
                  sel === s.key && { borderWidth: 2 },
                ]}
              >
                {sel === s.key && (
                  <Ionicons name="checkmark-circle" size={12} color={s.color} style={{ marginRight: 3 }} />
                )}
                <Text style={[styles.statusBtnText, { color: s.color }]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { marginTop: 14 }]}>POZNÁMKY</Text>
          <TextInput
            style={styles.input}
            value={notes}
            onChangeText={setNotes}
            placeholder="Napr. distálna plocha..."
            placeholderTextColor="#bbb"
            multiline
            numberOfLines={3}
          />

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={() => onSave(sel, notes)}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.saveBtnText}>Uložiť zmenu</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Hlavná obrazovka ─────────────────────────────────────────────────────────
export default function DentalChart() {
  const router = useRouter();
  const { patientId, patientName } = useLocalSearchParams<{ patientId: string; patientName: string }>();
  const { chart, loading, saveTooth, stats } = useDentalChart(patientId ?? '');

  const [activeTooth, setActiveTooth] = useState<number | null>(null);
  const [saving, setSaving]           = useState(false);

  const handleToothPress = useCallback((n: number) => setActiveTooth(n), []);

  async function handleSave(status: ToothStatus, notes: string) {
    if (!activeTooth) return;
    setSaving(true);
    const err = await saveTooth(activeTooth, status, notes);
    setSaving(false);
    if (err) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Chyba', (err as any)?.message ?? 'Nepodarilo sa uložiť.');
      return;
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setActiveTooth(null);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Hlavička */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerSub}>ZUBNÁ KARTA</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>{patientName ?? 'Pacient'}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.wal} size="large" />
          <Text style={{ marginTop: 10, color: COLORS.wal, fontSize: 13 }}>Načítavam kartu...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>

          {/* Legenda */}
          <View style={styles.legendRow}>
            {STATUS_LIST.map((s) => (
              <View key={s.key} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                <Text style={styles.legendText}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* ── HORNÁ ČEĽUSŤ ── */}
          <View style={styles.jawCard}>
            <Text style={styles.jawTitle}>⬆  Horná čeľusť</Text>

            <View style={styles.quadRow}>
              <Text style={styles.qLabel}>Q1</Text>
              <Text style={styles.qDesc}>vpravo hore</Text>
            </View>
            <ToothRow teeth={[18,17,16,15,14,13,12,11]} chart={chart} onPress={handleToothPress} />

            <View style={styles.separator} />

            <View style={styles.quadRow}>
              <Text style={styles.qLabel}>Q2</Text>
              <Text style={styles.qDesc}>vľavo hore</Text>
            </View>
            <ToothRow teeth={[21,22,23,24,25,26,27,28]} chart={chart} onPress={handleToothPress} />
          </View>

          {/* ── DOLNÁ ČEĽUSŤ ── */}
          <View style={styles.jawCard}>
            <Text style={styles.jawTitle}>⬇  Dolná čeľusť</Text>

            <View style={styles.quadRow}>
              <Text style={styles.qLabel}>Q4</Text>
              <Text style={styles.qDesc}>vpravo dole</Text>
            </View>
            <ToothRow teeth={[48,47,46,45,44,43,42,41]} chart={chart} onPress={handleToothPress} />

            <View style={styles.separator} />

            <View style={styles.quadRow}>
              <Text style={styles.qLabel}>Q3</Text>
              <Text style={styles.qDesc}>vľavo dole</Text>
            </View>
            <ToothRow teeth={[31,32,33,34,35,36,37,38]} chart={chart} onPress={handleToothPress} />
          </View>

          {/* ── Štatistiky ── */}
          <View style={styles.statsCard}>
            <Text style={styles.statsTitle}>ŠTATISTIKY</Text>
            {STATUS_LIST.filter((s) => (stats[s.key] ?? 0) > 0).length === 0 ? (
              <Text style={styles.statsEmpty}>Žiadne záznamy — klepnite na zub.</Text>
            ) : (
              <View style={styles.statsGrid}>
                {STATUS_LIST.map((s) => {
                  const count = stats[s.key] ?? 0;
                  if (!count) return null;
                  return (
                    <View key={s.key} style={[styles.statChip, { backgroundColor: s.bg, borderColor: s.color }]}>
                      <Text style={[styles.statCount, { color: s.color }]}>{count}</Text>
                      <Text style={[styles.statLabel, { color: s.color }]}>{s.label}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {activeTooth !== null && (
        <EditModal
          tooth={activeTooth}
          record={chart[activeTooth]}
          visible
          onClose={() => setActiveTooth(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 14 },
  center: { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center' },

  header: { backgroundColor: COLORS.esp, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  headerSub:   { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 3 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },

  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:  { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontSize: 9, color: COLORS.wal },

  jawCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: COLORS.bg3 },
  jawTitle: { fontSize: 11, fontWeight: '700', color: COLORS.esp, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },

  quadRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  qLabel:  { fontSize: 10, fontWeight: '700', color: COLORS.wal, backgroundColor: COLORS.bg3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  qDesc:   { fontSize: 10, color: COLORS.wal },

  separator: { height: 1, backgroundColor: COLORS.bg3, marginVertical: 12 },

  row: { flexDirection: 'row', gap: 4 },

  tooth: {
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  toothNum: { fontSize: 9, fontWeight: '700' },
  dot: { width: 5, height: 5, borderRadius: 3 },

  statsCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.bg3 },
  statsTitle: { fontSize: 9, letterSpacing: 2, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 10 },
  statsEmpty: { fontSize: 12, color: COLORS.wal, fontStyle: 'italic' },
  statsGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statChip:   { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7, alignItems: 'center', minWidth: 80 },
  statCount:  { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  statLabel:  { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:   { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 40 },
  handle:  { width: 38, height: 4, borderRadius: 2, backgroundColor: COLORS.bg3, alignSelf: 'center', marginBottom: 18 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: COLORS.esp },
  label: { fontSize: 9, letterSpacing: 2, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },

  statusGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusBtn:     { flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  statusBtnText: { fontSize: 12, fontWeight: '600' },

  input: { borderWidth: 1, borderColor: COLORS.bg3, borderRadius: 10, padding: 12, fontSize: 13, color: COLORS.esp, minHeight: 72, textAlignVertical: 'top', backgroundColor: COLORS.bg2 },

  saveBtn:     { backgroundColor: COLORS.esp, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 16 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.cream, letterSpacing: 0.5 },
});
