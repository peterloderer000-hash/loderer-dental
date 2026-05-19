import React, { useState, useCallback } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, Image, Modal, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import Svg, { Rect, Text as SvgText, G } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../supabase';
import { COLORS, SIZES } from '../../styles/theme';
import { SkeletonList } from '../../components/Skeleton';
import { useDentalChart, ToothStatus, ToothRecord } from '../../hooks/useDentalChart';
import { useAppTheme } from '../../context/ThemeContext';

const TOOTH_PHOTOS_BUCKET = 'tooth-photos';

// ─── SVG Mapa chrupu (vizuálny prehľad) ──────────────────────────────────────
function ToothSVGMap({ chart, onPress }: { chart: Record<number, ToothRecord | undefined>; onPress: (n: number) => void }) {
  const { colors, dark } = useAppTheme();
  const W      = SCREEN_W - 32;
  const COLS   = 16;
  const toothW = Math.floor((W - 20) / COLS);
  const toothH = toothW + 4;
  const gap    = 1;

  function toothColor(n: number): string {
    const r = chart[n];
    if (!r) return dark ? '#3D2E22' : '#F0EBE5';
    const cfg = STATUS_LIST.find(s => s.key === r.status);
    return cfg?.bg ?? (dark ? '#3D2E22' : '#F0EBE5');
  }
  function toothBorder(n: number): string {
    const r = chart[n];
    if (!r) return dark ? '#4E3C2E' : '#D5C9C0';
    const cfg = STATUS_LIST.find(s => s.key === r.status);
    return cfg?.color ?? (dark ? '#4E3C2E' : '#C4A882');
  }

  const svgH = toothH * 2 + 16 + 20; // 2 rows + gap + label space

  return (
    <TouchableOpacity activeOpacity={1}>
      <Svg width={W} height={svgH} style={{ alignSelf: 'center' }}>
        {/* HORNÁ ČEĽUSŤ (1-16) */}
        <SvgText x={W / 2} y={11} textAnchor="middle" fontSize={8} fill={dark ? '#C4A882' : '#6B4F3A'} fontFamily="DMSans_500Medium">
          HORNÁ ČEĽUSŤ
        </SvgText>
        {Array.from({ length: 16 }, (_, i) => {
          const n  = i + 1;
          const x  = i * (toothW + gap);
          const y  = 14;
          return (
            <G key={n} onPress={() => onPress(n)}>
              <Rect x={x} y={y} width={toothW} height={toothH} rx={3} fill={toothColor(n)} stroke={toothBorder(n)} strokeWidth={1} />
              <SvgText x={x + toothW / 2} y={y + toothH - 3} textAnchor="middle" fontSize={6} fill={dark ? '#C4A882' : '#6B4F3A'}>
                {n}
              </SvgText>
            </G>
          );
        })}
        {/* DOLNÁ ČEĽUSŤ (17-32) */}
        <SvgText x={W / 2} y={14 + toothH + 8 + 8} textAnchor="middle" fontSize={8} fill={dark ? '#C4A882' : '#6B4F3A'} fontFamily="DMSans_500Medium">
          DOLNÁ ČEĽUSŤ
        </SvgText>
        {Array.from({ length: 16 }, (_, i) => {
          const n  = i + 17;
          const x  = i * (toothW + gap);
          const y  = 14 + toothH + 8 + 11;
          return (
            <G key={n} onPress={() => onPress(n)}>
              <Rect x={x} y={y} width={toothW} height={toothH} rx={3} fill={toothColor(n)} stroke={toothBorder(n)} strokeWidth={1} />
              <SvgText x={x + toothW / 2} y={y + toothH - 3} textAnchor="middle" fontSize={6} fill={dark ? '#C4A882' : '#6B4F3A'}>
                {n}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </TouchableOpacity>
  );
}

type HistoryRecord = {
  id: string;
  status: ToothStatus;
  notes: string | null;
  created_at: string;
};

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
  const { colors } = useAppTheme();
  const s      = record ? getStatus(record.status) : null;
  const bg     = s ? s.bg    : colors.cardBg;
  const border = s ? s.color : colors.bg3;
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
      {record?.photo_url && <View style={styles.photoDot} />}
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
function EditModal({ tooth, record, patientId, visible, onClose, onSave, saving, noteOverride }: {
  tooth: number; record: ToothRecord | undefined; patientId: string; visible: boolean;
  onClose: () => void; onSave: (status: ToothStatus, notes: string, photoUrl: string | null) => void; saving: boolean;
  noteOverride?: string;
}) {
  const { colors, dark } = useAppTheme();
  const [sel,       setSel]       = useState<ToothStatus>(record?.status ?? 'healthy');
  const [notes,     setNotes]     = useState(noteOverride !== undefined ? noteOverride : record?.notes ?? '');
  const [photoUrl,  setPhotoUrl]  = useState<string | null>(record?.photo_url ?? null);
  const [uploading, setUploading] = useState(false);

  React.useEffect(() => {
    setSel(record?.status ?? 'healthy');
    setNotes(noteOverride !== undefined ? noteOverride : record?.notes ?? '');
    setPhotoUrl(record?.photo_url ?? null);
  }, [tooth, record, noteOverride]);

  async function pickPhoto(useCamera: boolean) {
    const perm = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Povolenie', `Potrebujeme prístup k ${useCamera ? 'fotoaparátu' : 'fotkám'}.`);
      return;
    }
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [4, 3], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;

    setUploading(true);
    try {
      const buf  = await (await fetch(result.assets[0].uri)).arrayBuffer();
      const path = `${patientId}/tooth-${tooth}.jpg`;
      const { error: upErr } = await supabase.storage.from(TOOTH_PHOTOS_BUCKET)
        .upload(path, new Uint8Array(buf), { contentType: 'image/jpeg', upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from(TOOTH_PHOTOS_BUCKET).getPublicUrl(path);
      setPhotoUrl(`${publicUrl}?t=${Date.now()}`);
    } catch (e: any) {
      Alert.alert('Chyba', e?.message ?? 'Nepodarilo sa nahrať fotku.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.cardBg }]}>
          <View style={[styles.handle, { backgroundColor: colors.bg3 }]} />

          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Zub č. {tooth}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={COLORS.esp} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>STAV ZUBA</Text>
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

          <Text style={[styles.sectionLabel, { marginTop: 14, color: colors.textSecondary }]}>POZNÁMKY</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Napr. distálna plocha..."
            placeholderTextColor={dark ? '#555' : '#bbb'}
            multiline
            numberOfLines={2}
          />

          {/* ── Foto zuba ── */}
          <Text style={[styles.sectionLabel, { marginTop: 14, color: colors.textSecondary }]}>FOTO ZUBA</Text>
          {photoUrl ? (
            <View style={styles.photoWrap}>
              <Image source={{ uri: photoUrl }} style={styles.photoPreview} resizeMode="cover" />
              <TouchableOpacity style={styles.photoRemoveBtn} onPress={() => setPhotoUrl(null)} activeOpacity={0.8}>
                <Ionicons name="close-circle" size={22} color="#922B21" />
              </TouchableOpacity>
            </View>
          ) : null}
          <View style={styles.photoBtnRow}>
            <TouchableOpacity style={styles.photoBtn} onPress={() => pickPhoto(false)} disabled={uploading} activeOpacity={0.8}>
              {uploading
                ? <ActivityIndicator size="small" color={COLORS.wal} />
                : <><Ionicons name="images-outline" size={16} color={COLORS.wal} /><Text style={styles.photoBtnText}>Galéria</Text></>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoBtn} onPress={() => pickPhoto(true)} disabled={uploading} activeOpacity={0.8}>
              <Ionicons name="camera-outline" size={16} color={COLORS.wal} />
              <Text style={styles.photoBtnText}>Odfotiť</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, (saving || uploading) && { opacity: 0.6 }]}
            onPress={() => onSave(sel, notes, photoUrl)}
            disabled={saving || uploading}
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

// ─── Detail modal — história + poznámka + akcie ───────────────────────────────
function ToothDetailModal({ tooth, record, patientId, patientName, note, visible, onClose, onNoteChange, onEditStatus }: {
  tooth: number; record: ToothRecord | undefined; patientId: string; patientName: string;
  note: string; visible: boolean;
  onClose: () => void; onNoteChange: (n: string) => void; onEditStatus: () => void;
}) {
  const { colors, dark } = useAppTheme();
  const router = useRouter();
  const [history,   setHistory]  = useState<HistoryRecord[]>([]);
  const [loadingH,  setLoadingH] = useState(false);

  React.useEffect(() => {
    if (!visible) return;
    setLoadingH(true);
    supabase
      .from('dental_records')
      .select('id, status, notes, created_at')
      .eq('patient_id', patientId)
      .eq('tooth_number', tooth)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => {
        setHistory((data ?? []) as HistoryRecord[]);
        setLoadingH(false);
      });
  }, [visible, patientId, tooth]);

  const st = record ? getStatus(record.status) : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.cardBg, maxHeight: '88%' }]}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={[styles.handle, { backgroundColor: colors.bg3 }]} />

            {/* Hlavička */}
            <View style={styles.sheetHead}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Zub č. {tooth}</Text>
                {st && (
                  <View style={[dStyles.statusPill, { backgroundColor: dark ? st.color + '33' : st.bg }]}>
                    <View style={[dStyles.statusDot, { backgroundColor: st.color }]} />
                    <Text style={[dStyles.statusPillText, { color: st.color }]}>{st.label}</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* História zmien */}
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>HISTÓRIA ZMIEN (posledných 5)</Text>
            {loadingH ? (
              <ActivityIndicator color={COLORS.wal} style={{ marginVertical: 14 }} />
            ) : history.length === 0 ? (
              <Text style={[dStyles.emptyText, { color: colors.textSecondary }]}>Žiadna história — prvý záznam vznikne pri ďalšom uložení.</Text>
            ) : (
              <View style={{ gap: 6, marginBottom: 6 }}>
                {history.map((h, i) => {
                  const hSt    = getStatus(h.status);
                  const isNew  = i === 0;
                  return (
                    <View key={h.id} style={[dStyles.historyRow, {
                      backgroundColor: isNew ? (dark ? hSt.color + '22' : hSt.bg) : colors.bg2,
                      borderColor:     isNew ? hSt.color + '55' : colors.bg3,
                    }]}>
                      <View style={[dStyles.histDot, { backgroundColor: hSt.color }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[dStyles.histStatus, { color: hSt.color }]}>{hSt.label}</Text>
                        {h.notes ? (
                          <Text style={[dStyles.histNote, { color: colors.textSecondary }]} numberOfLines={2}>{h.notes}</Text>
                        ) : null}
                      </View>
                      <Text style={[dStyles.histDate, { color: colors.textSecondary }]}>
                        {new Date(h.created_at).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: '2-digit' })}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Poznámka */}
            <Text style={[styles.sectionLabel, { marginTop: 14, color: colors.textSecondary }]}>POZNÁMKA K ZUBU</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3, marginBottom: 20 }]}
              value={note}
              onChangeText={onNoteChange}
              placeholder="Napr. distálna plocha, citlivosť na chlad..."
              placeholderTextColor={dark ? '#555' : '#bbb'}
              multiline
              numberOfLines={2}
            />

            {/* Akcie */}
            <TouchableOpacity style={[dStyles.btn, { backgroundColor: COLORS.esp }]}
              onPress={onEditStatus} activeOpacity={0.85}>
              <Ionicons name="create-outline" size={16} color="#fff" />
              <Text style={dStyles.btnTextWhite}>Zmeniť stav zuba</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[dStyles.btn, { marginTop: 10,
                backgroundColor: dark ? '#0D3B1F' : '#EAFAF1',
                borderWidth: 1.5, borderColor: dark ? '#27AE6044' : '#A9DFBF',
              }]}
              onPress={() => {
                onClose();
                router.push({
                  pathname: '/(doctor)/treatment-plan',
                  params: { patientId, patientName, prefilledTooth: String(tooth) },
                });
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="list-outline" size={16} color={dark ? '#27AE60' : '#1E8449'} />
              <Text style={[dStyles.btnTextWhite, { color: dark ? '#27AE60' : '#1E8449' }]}>Pridať do liečebného plánu</Text>
            </TouchableOpacity>

            <View style={{ height: 20 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const dStyles = StyleSheet.create({
  statusPill:    { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusDot:     { width: 7, height: 7, borderRadius: 4 },
  statusPillText:{ fontSize: 12, fontWeight: '700' },
  emptyText:     { fontSize: 12, fontStyle: 'italic', marginBottom: 14 },
  historyRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 10, borderRadius: 10, borderWidth: 1 },
  histDot:       { width: 8, height: 8, borderRadius: 4, marginTop: 3, flexShrink: 0 },
  histStatus:    { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  histNote:      { fontSize: 12, lineHeight: 17 },
  histDate:      { fontSize: 10, fontWeight: '600', marginTop: 2, flexShrink: 0 },
  btn:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 14 },
  btnTextWhite:  { fontSize: 14, fontWeight: '700', color: '#fff' },
});

// ─── Hlavná obrazovka ─────────────────────────────────────────────────────────
export default function DentalChart() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { patientId, patientName } = useLocalSearchParams<{ patientId: string; patientName: string }>();
  const { chart, loading, saveTooth, stats } = useDentalChart(patientId ?? '');

  const [activeTooth,  setActiveTooth]  = useState<number | null>(null);
  const [detailTooth,  setDetailTooth]  = useState<number | null>(null);
  const [noteOverride, setNoteOverride] = useState<string | undefined>(undefined);
  const [saving,       setSaving]       = useState(false);

  const handleToothPress = useCallback((n: number) => {
    const rec = chart[n];
    if (rec && rec.status !== 'healthy' && rec.status !== 'missing') {
      setNoteOverride(undefined);
      setDetailTooth(n);
    } else {
      setActiveTooth(n);
    }
  }, [chart]);

  async function handleSave(status: ToothStatus, notes: string, photoUrl: string | null) {
    if (!activeTooth) return;
    setSaving(true);
    const err = await saveTooth(activeTooth, status, notes, photoUrl);
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
        <View style={{ flex: 1, backgroundColor: colors.bg2, padding: 16 }}>
          <SkeletonList count={5} />
        </View>
      ) : (
        <ScrollView style={[styles.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>

          {/* ── Legenda — 2-stĺpcová mriežka ── */}
          <View style={[styles.legendCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Text style={[styles.legendTitle, { color: colors.textSecondary }]}>LEGENDA</Text>
            <View style={styles.legendGrid}>
              {STATUS_LIST.map((s) => (
                <View key={s.key} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                  <Text style={[styles.legendText, { color: colors.textPrimary }]} numberOfLines={1}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── SVG Prehľad chrupu ── */}
          <View style={[styles.chartCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3, padding: 12 }]}>
            <Text style={[styles.chartHint, { marginBottom: 8, fontFamily: 'DMSans_500Medium' }]}>VIZUÁLNA MAPA</Text>
            <ToothSVGMap
              chart={Object.fromEntries(
                Object.entries(chart).map(([k, v]) => [
                  // map FDI to 1-32: upper Q1(18-11→1-8), Q2(21-28→9-16), lower Q4(48-41→17-24), Q3(31-38→25-32)
                  parseInt(k) >= 11 && parseInt(k) <= 18 ? 19 - parseInt(k) :
                  parseInt(k) >= 21 && parseInt(k) <= 28 ? parseInt(k) - 12 :
                  parseInt(k) >= 31 && parseInt(k) <= 38 ? parseInt(k) - 6 :
                  parseInt(k) >= 41 && parseInt(k) <= 48 ? 89 - parseInt(k) : parseInt(k),
                  v
                ])
              )}
              onPress={(n) => {
                // Reverse map 1-32 back to FDI
                const fdi = n <= 8 ? 19 - n : n <= 16 ? n + 12 : n <= 24 ? 89 - n : n + 6;
                handleToothPress(fdi);
              }}
            />
          </View>

          {/* ── Zubná schéma ── */}
          <View style={[styles.chartCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            {/* Hlavičky kvadrantov — HORNÁ */}
            <View style={styles.quadHeaderRow}>
              <Text style={[styles.quadHeaderLeft, { color: colors.textSecondary }]}>Q1 · vpravo hore</Text>
              <Text style={[styles.quadHeaderRight, { color: colors.textSecondary }]}>Q2 · vľavo hore</Text>
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
              <View style={[styles.jawSepLine, { backgroundColor: colors.bg3 }]} />
              <Text style={[styles.jawSepLabel, { color: colors.textSecondary }]}>⬆ HORNÁ  ·  DOLNÁ ⬇</Text>
              <View style={[styles.jawSepLine, { backgroundColor: colors.bg3 }]} />
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
              <Text style={[styles.quadHeaderLeft, { color: colors.textSecondary }]}>Q4 · vpravo dole</Text>
              <Text style={[styles.quadHeaderRight, { color: colors.textSecondary }]}>Q3 · vľavo dole</Text>
            </View>

            <Text style={styles.chartHint}>Klepnite na zub pre editáciu</Text>
          </View>

          {/* ── Štatistiky ── */}
          <View style={[styles.statsCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Text style={[styles.statsTitle, { color: colors.textSecondary }]}>ŠTATISTIKY</Text>
            {STATUS_LIST.filter((s) => (stats[s.key] ?? 0) > 0).length === 0 ? (
              <Text style={[styles.statsEmpty, { color: colors.textSecondary }]}>Žiadne záznamy — klepnite na zub.</Text>
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

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {detailTooth !== null && (
        <ToothDetailModal
          tooth={detailTooth}
          record={chart[detailTooth]}
          patientId={patientId ?? ''}
          patientName={patientName ?? ''}
          note={chart[detailTooth]?.notes ?? ''}
          visible
          onClose={() => setDetailTooth(null)}
          onNoteChange={(n) => setNoteOverride(n)}
          onEditStatus={() => {
            const current = chart[detailTooth];
            setNoteOverride(noteOverride !== undefined ? noteOverride : current?.notes ?? '');
            setActiveTooth(detailTooth);
            setDetailTooth(null);
          }}
        />
      )}
      {activeTooth !== null && (
        <EditModal
          tooth={activeTooth}
          record={chart[activeTooth]}
          patientId={patientId ?? ''}
          visible
          onClose={() => { setActiveTooth(null); setNoteOverride(undefined); }}
          onSave={handleSave}
          saving={saving}
          noteOverride={noteOverride}
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

  photoDot: { position: 'absolute', bottom: 2, right: 2, width: 5, height: 5, borderRadius: 3, backgroundColor: '#1A5276' },

  // Foto
  photoWrap:      { position: 'relative', marginBottom: 10, borderRadius: 12, overflow: 'hidden', borderWidth: 1.5, borderColor: COLORS.bg3 },
  photoPreview:   { width: '100%', height: 160, borderRadius: 10 },
  photoRemoveBtn: { position: 'absolute', top: 6, right: 6, backgroundColor: '#fff', borderRadius: 11 },
  photoBtnRow:    { flexDirection: 'row', gap: 10, marginBottom: 4 },
  photoBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F4ECE4', borderWidth: 1.5, borderColor: COLORS.sand },
  photoBtnText:   { fontSize: 13, fontWeight: '600', color: COLORS.wal },
});
