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
// 16 teeth per row, gap=1 between teeth (14 gaps each side = 14 total), divider=10, h-padding=(12+10)*2=44
const TOOTH_SYM_SIZE = Math.floor((SCREEN_W - 44 - 14 - 10) / 16);

// ─── Status config (24 statuses) ──────────────────────────────────────────────
const STATUS_LIST: { key: ToothStatus; label: string; color: string; bg: string }[] = [
  { key: 'healthy',            label: 'Zdravý',              color: '#1E8449', bg: '#EAFAF1' },
  { key: 'cavity',             label: 'Kaz',                 color: '#922B21', bg: '#FDEDEC' },
  { key: 'early_cavity',       label: 'Začínajúci kaz',      color: '#CB4335', bg: '#FDEDEC' },
  { key: 'watch',              label: 'Na pozorovanie',       color: '#E67E22', bg: '#FEF5E7' },
  { key: 'filled',             label: 'Plomba',              color: '#9A7D0A', bg: '#FEF9E7' },
  { key: 'large_filling',      label: 'Veľká plomba',        color: '#7D6608', bg: '#FEF3CD' },
  { key: 'replace_filling',    label: 'Výmena plomby',       color: '#B7770D', bg: '#FEF0D3' },
  { key: 'crown',              label: 'Korunka',             color: '#1A5276', bg: '#EBF5FB' },
  { key: 'bridge',             label: 'Mostík',              color: '#154360', bg: '#D6EAF8' },
  { key: 'implant',            label: 'Implantát',           color: '#117A65', bg: '#D5F5E3' },
  { key: 'veneer',             label: 'Veneer',              color: '#6C3483', bg: '#F5EEF8' },
  { key: 'sealant',            label: 'Pečať',               color: '#1ABC9C', bg: '#E8F8F5' },
  { key: 'root_canal',         label: 'Devitalizácia',       color: '#7D3C98', bg: '#F4ECF7' },
  { key: 'extracted',          label: 'Extrahovaný',         color: '#566573', bg: '#F2F3F4' },
  { key: 'missing',            label: 'Chýba',               color: '#AAB7B8', bg: '#FDFEFE' },
  { key: 'fracture',           label: 'Fraktúra',            color: '#E74C3C', bg: '#FDEDEC' },
  { key: 'erosion',            label: 'Erózia',              color: '#D35400', bg: '#FDEBD0' },
  { key: 'abrasion',           label: 'Abrázia',             color: '#A04000', bg: '#FDEBD0' },
  { key: 'hypoplasia',         label: 'Hypoplázia',          color: '#8E44AD', bg: '#F5EEF8' },
  { key: 'hypomineralization', label: 'Hypomineralizácia',   color: '#9B59B6', bg: '#F5EEF8' },
  { key: 'periodontal',        label: 'Parodontálny prob.',  color: '#C0392B', bg: '#FDEDEC' },
  { key: 'mobility',           label: 'Kývavosť zuba',       color: '#E74C3C', bg: '#FDEDEC' },
  { key: 'improve_hygiene',    label: 'Zlepšiť hygienu',     color: '#2980B9', bg: '#EBF5FB' },
  { key: 'treatment_needed',   label: 'Indik. prerobenie',   color: '#F39C12', bg: '#FEF9E7' },
];

function getStatus(key: ToothStatus) {
  return STATUS_LIST.find((s) => s.key === key) ?? STATUS_LIST[0];
}

// ─── Zub ──────────────────────────────────────────────────────────────────────
const Tooth = React.memo(function Tooth({ num, record, onPress }: {
  num: number; record: ToothRecord | undefined; onPress: () => void;
}) {
  const s      = record ? getStatus(record.status) : null;
  const bg     = s ? s.bg    : '#fff';
  const border = s ? s.color : COLORS.bg3;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.tooth, {
        width: TOOTH_SYM_SIZE,
        height: TOOTH_SYM_SIZE + 8,
        backgroundColor: bg,
        borderColor: border,
      }]}
    >
      <Text style={[styles.toothNum, { color: border }]}>{num}</Text>
      {s && s.key !== 'healthy' && <View style={[styles.dot, { backgroundColor: border }]} />}
    </TouchableOpacity>
  );
});

// ─── Jaw row — dve kvadranty vedľa seba ───────────────────────────────────────
const JawRow = React.memo(function JawRow({ left, right, chart, onPress }: {
  left: number[]; right: number[];
  chart: Record<number, ToothRecord>;
  onPress: (n: number) => void;
}) {
  return (
    <View style={styles.jawTeethRow}>
      {left.map((n) => (
        <Tooth key={n} num={n} record={chart[n]} onPress={() => onPress(n)} />
      ))}
      <View style={styles.centerDivider} />
      {right.map((n) => (
        <Tooth key={n} num={n} record={chart[n]} onPress={() => onPress(n)} />
      ))}
    </View>
  );
});

// ─── Edit modal ───────────────────────────────────────────────────────────────
function EditModal({ tooth, record, visible, onClose, onSave, saving }: {
  tooth: number; record: ToothRecord | undefined; visible: boolean;
  onClose: () => void; onSave: (status: ToothStatus, notes: string) => void; saving: boolean;
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

          <Text style={styles.sectionLabel}>STAV ZUBA</Text>
          {/* ScrollView pre 24 statusov */}
          <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
            <View style={styles.statusGrid}>
              {STATUS_LIST.map((s) => (
                <TouchableOpacity
                  key={s.key}
                  onPress={() => setSel(s.key)}
                  activeOpacity={0.8}
                  style={[
                    styles.statusBtn,
                    { backgroundColor: s.bg, borderColor: s.color },
                    sel === s.key && { borderWidth: 2.5 },
                  ]}
                >
                  {sel === s.key && (
                    <Ionicons name="checkmark-circle" size={12} color={s.color} style={{ marginRight: 3 }} />
                  )}
                  <Text style={[styles.statusBtnText, { color: s.color }]}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={[styles.sectionLabel, { marginTop: 14 }]}>POZNÁMKY</Text>
          <TextInput
            style={styles.input}
            value={notes}
            onChangeText={setNotes}
            placeholder="Napr. distálna plocha..."
            placeholderTextColor="#bbb"
            multiline
            numberOfLines={2}
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

          {/* ── Legenda — 2-stĺpcová mriežka ── */}
          <View style={styles.legendCard}>
            <Text style={styles.legendTitle}>LEGENDA</Text>
            <View style={styles.legendGrid}>
              {STATUS_LIST.map((s) => (
                <View key={s.key} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                  <Text style={styles.legendText} numberOfLines={1}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── Zubná schéma ── */}
          <View style={styles.chartCard}>
            {/* Hlavičky kvadrantov — HORNÁ */}
            <View style={styles.quadHeaderRow}>
              <Text style={styles.quadHeaderLeft}>Q1 · vpravo hore</Text>
              <Text style={styles.quadHeaderRight}>Q2 · vľavo hore</Text>
            </View>

            {/* Horná čeľusť */}
            <JawRow
              left={[18, 17, 16, 15, 14, 13, 12, 11]}
              right={[21, 22, 23, 24, 25, 26, 27, 28]}
              chart={chart}
              onPress={handleToothPress}
            />

            {/* Separátor čeľustí */}
            <View style={styles.jawSeparator}>
              <View style={styles.jawSepLine} />
              <Text style={styles.jawSepLabel}>⬆ HORNÁ  ·  DOLNÁ ⬇</Text>
              <View style={styles.jawSepLine} />
            </View>

            {/* Dolná čeľusť */}
            <JawRow
              left={[48, 47, 46, 45, 44, 43, 42, 41]}
              right={[31, 32, 33, 34, 35, 36, 37, 38]}
              chart={chart}
              onPress={handleToothPress}
            />

            {/* Hlavičky kvadrantov — DOLNÁ */}
            <View style={[styles.quadHeaderRow, { marginTop: 6 }]}>
              <Text style={styles.quadHeaderLeft}>Q4 · vpravo dole</Text>
              <Text style={styles.quadHeaderRight}>Q3 · vľavo dole</Text>
            </View>

            <Text style={styles.chartHint}>Klepnite na zub pre editáciu</Text>
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
  safe:          { flex: 1, backgroundColor: COLORS.esp },
  scroll:        { flex: 1, backgroundColor: COLORS.bg2 },
  scrollContent: { paddingHorizontal: 12, paddingTop: 14 },
  center:        { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center' },

  header:      { backgroundColor: COLORS.esp, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  headerSub:   { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 3 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },

  // ── Legenda ──
  legendCard:  { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: COLORS.bg3 },
  legendTitle: { fontSize: 9, letterSpacing: 2, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 10 },
  legendGrid:  { flexDirection: 'row', flexWrap: 'wrap' },
  legendItem:  { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingRight: 8 },
  legendDot:   { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  legendText:  { fontSize: 11, color: COLORS.esp, fontWeight: '500', flex: 1 },

  // ── Schéma ──
  chartCard:     { backgroundColor: '#fff', borderRadius: 14, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: COLORS.bg3 },
  quadHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  quadHeaderLeft:  { fontSize: 9, fontWeight: '700', color: COLORS.wal, textTransform: 'uppercase', letterSpacing: 0.5 },
  quadHeaderRight: { fontSize: 9, fontWeight: '700', color: COLORS.wal, textTransform: 'uppercase', letterSpacing: 0.5 },

  jawTeethRow: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  centerDivider: { width: 10, height: '100%', alignSelf: 'stretch', backgroundColor: COLORS.bg3, borderRadius: 2, marginHorizontal: 1 },

  jawSeparator: { flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 10 },
  jawSepLine:   { flex: 1, height: 1, backgroundColor: COLORS.bg3 },
  jawSepLabel:  { fontSize: 8, fontWeight: '700', color: COLORS.wal, letterSpacing: 0.5, textTransform: 'uppercase' },

  chartHint: { fontSize: 9, color: COLORS.bg3, textAlign: 'center', marginTop: 8, fontStyle: 'italic' },

  tooth:    { borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 2 },
  toothNum: { fontSize: 7, fontWeight: '700' },
  dot:      { width: 4, height: 4, borderRadius: 2 },

  // ── Štatistiky ──
  statsCard:  { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.bg3 },
  statsTitle: { fontSize: 9, letterSpacing: 2, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 10 },
  statsEmpty: { fontSize: 12, color: COLORS.wal, fontStyle: 'italic' },
  statsGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statChip:   { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7, alignItems: 'center', minWidth: 80 },
  statCount:  { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  statLabel:  { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  // ── Modal ──
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 40 },
  handle:     { width: 38, height: 4, borderRadius: 2, backgroundColor: COLORS.bg3, alignSelf: 'center', marginBottom: 18 },
  sheetHead:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: COLORS.esp },
  sectionLabel: { fontSize: 9, letterSpacing: 2, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },

  statusGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusBtn:     { flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  statusBtnText: { fontSize: 12, fontWeight: '600' },

  input:       { borderWidth: 1, borderColor: COLORS.bg3, borderRadius: 10, padding: 12, fontSize: 13, color: COLORS.esp, minHeight: 60, textAlignVertical: 'top', backgroundColor: COLORS.bg2 },
  saveBtn:     { backgroundColor: COLORS.esp, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 14 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.cream, letterSpacing: 0.5 },
});
