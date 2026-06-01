import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ActivityIndicator, Alert, Modal, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View } from 'react-native';
import {} from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { SkeletonList } from '../../components/Skeleton';
import { useTimeBlocks, BLOCK_CONFIG, BlockType, TimeBlock } from '../../hooks/useTimeBlocks';
import { useAppTheme } from '../../context/ThemeContext';
import { SK_DAYS_SHORT, SK_MONTHS_SHORT } from '../../utils/timeSlots';

// ─── Pomocné ──────────────────────────────────────────────────────────────────
function fmtTime(dt: Date) {
  return dt.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
}
function fmtDateShort(dt: Date) {
  return dt.toLocaleDateString('sk-SK', { weekday: 'short', day: 'numeric', month: 'short' });
}
function fmtDateFull(dt: Date) {
  return dt.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function parseHHMM(text: string): number | null {
  const m = text.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10); const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
function minutesToHHMM(mins: number) {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}
function getNext30Days() {
  const days: Date[] = [];
  const now = new Date(); now.setHours(0, 0, 0, 0);
  for (let i = 0; i < 30; i++) {
    const d = new Date(now); d.setDate(now.getDate() + i);
    days.push(d);
  }
  return days;
}

// ─── Rýchle šablóny ──────────────────────────────────────────────────────────
function quickBlocks(now: Date) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);

  // Koniec týždňa (nedeľa o 23:59)
  const dow = today.getDay();
  const daysToSunday = dow === 0 ? 0 : 7 - dow;
  const sunday = new Date(today); sunday.setDate(today.getDate() + daysToSunday); sunday.setHours(23, 59, 0, 0);

  return [
    {
      label: '🍽️ Obed dnes',
      sub: '12:00 – 13:00',
      block_type: 'lunch' as BlockType,
      title: 'Obed',
      start: (() => { const d = new Date(today); d.setHours(12, 0, 0, 0); return d; })(),
      end:   (() => { const d = new Date(today); d.setHours(13, 0, 0, 0); return d; })() },
    {
      label: '🌙 Poobede dnes',
      sub: '13:00 – 17:00',
      block_type: 'personal' as BlockType,
      title: 'Voľno poobede',
      start: (() => { const d = new Date(today); d.setHours(13, 0, 0, 0); return d; })(),
      end:   (() => { const d = new Date(today); d.setHours(17, 0, 0, 0); return d; })() },
    {
      label: '📋 Celé zajtra',
      sub: fmtDateShort(tomorrow),
      block_type: 'meeting' as BlockType,
      title: 'Voľný deň',
      start: (() => { const d = new Date(tomorrow); d.setHours(8, 0, 0, 0); return d; })(),
      end:   (() => { const d = new Date(tomorrow); d.setHours(17, 0, 0, 0); return d; })() },
    {
      label: '🏖️ Do konca týždňa',
      sub: `do ${fmtDateShort(sunday)}`,
      block_type: 'vacation' as BlockType,
      title: 'Dovolenka',
      start: (() => { const d = new Date(today); d.setHours(0, 0, 0, 0); return d; })(),
      end:   sunday },
  ];
}

// ─── Karta bloku ──────────────────────────────────────────────────────────────
function BlockCard({ block, onDelete }: { block: TimeBlock; onDelete: () => void }) {
  const cfg = BLOCK_CONFIG[block.block_type] ?? BLOCK_CONFIG.other;
  const s = new Date(block.start_time);
  const e = new Date(block.end_time);
  const sameDay = s.toDateString() === e.toDateString();
  return (
    <View style={[bStyles.card, { borderLeftColor: cfg.color, backgroundColor: cfg.bg }]}>
      <View style={bStyles.cardMain}>
        <Text style={bStyles.cardIcon}>{cfg.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[bStyles.cardTitle, { color: cfg.color }]}>{block.title}</Text>
          <Text style={bStyles.cardDate}>
            {fmtDateShort(s)}
            {!sameDay ? ` – ${fmtDateShort(e)}` : ''}
            {'  ·  '}{fmtTime(s)} – {fmtTime(e)}
          </Text>
          {block.note ? <Text style={bStyles.cardNote}>{block.note}</Text> : null}
        </View>
        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={18} color={cfg.color} style={{ opacity: 0.7 }} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
const bStyles = StyleSheet.create({
  card:     { flexDirection: 'row', borderLeftWidth: 4, borderRadius: 12, padding: 14, marginBottom: 10, elevation: 1 },
  cardMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 },
  cardIcon: { fontSize: 22, marginTop: 1 },
  cardTitle:{ fontSize: 14, fontWeight: '700', marginBottom: 3 },
  cardDate: { fontSize: 11, color: COLORS.wal, fontWeight: '500' },
  cardNote: { fontSize: 11, color: COLORS.wal, fontStyle: 'italic', marginTop: 3 } });

// ─── Modal: vlastné blokovanie ────────────────────────────────────────────────
function AddBlockModal({ visible, onClose, onSave }: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: { title: string; block_type: BlockType; start_time: string; end_time: string; note?: string }) => Promise<any>;
}) {
  const { colors, dark } = useAppTheme();
  const days = useMemo(() => getNext30Days(), []);
  const [selDate,    setSelDate]    = useState<Date>(days[0]);
  const [blockType,  setBlockType]  = useState<BlockType>('other');
  const [title,      setTitle]      = useState('');
  const [startStr,   setStartStr]   = useState('08:00');
  const [endStr,     setEndStr]     = useState('09:00');
  const [note,       setNote]       = useState('');
  const [saving,     setSaving]     = useState(false);
  const [startErr,   setStartErr]   = useState(false);
  const [endErr,     setEndErr]     = useState(false);

  useEffect(() => {
    if (visible) {
      setSelDate(days[0]);
      setBlockType('other');
      setTitle('');
      setStartStr('08:00');
      setEndStr('09:00');
      setNote('');
      setStartErr(false);
      setEndErr(false);
    }
  }, [visible]);

  // Auto-fill title when blockType changes
  useEffect(() => {
    if (!title || Object.values(BLOCK_CONFIG).some(c => c.label === title)) {
      setTitle(BLOCK_CONFIG[blockType].label);
    }
    // Auto fill times for lunch
    if (blockType === 'lunch') { setStartStr('12:00'); setEndStr('13:00'); }
  }, [blockType]);

  async function handleSave() {
    const sMin = parseHHMM(startStr);
    const eMin = parseHHMM(endStr);
    setStartErr(sMin === null);
    setEndErr(eMin === null || (sMin !== null && eMin <= sMin));
    if (sMin === null || eMin === null || eMin <= sMin) return;

    const start = new Date(selDate); start.setHours(Math.floor(sMin / 60), sMin % 60, 0, 0);
    const end   = new Date(selDate); end.setHours(Math.floor(eMin / 60), eMin % 60, 0, 0);

    setSaving(true);
    const err = await onSave({
      title:      title.trim() || BLOCK_CONFIG[blockType].label,
      block_type: blockType,
      start_time: start.toISOString(),
      end_time:   end.toISOString(),
      note:       note.trim() || undefined });
    setSaving(false);
    if (err) { Alert.alert('Chyba', err.message); return; }
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={mStyles.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[mStyles.sheet, { backgroundColor: colors.cardBg }]}>
          <View style={[mStyles.handle, { backgroundColor: colors.bg3 }]} />
          <Text style={[mStyles.title, { color: colors.textPrimary }]}>Pridať blokovanie</Text>

          {/* Typ */}
          <Text style={[mStyles.label, { color: colors.textSecondary }]}>TYP</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(Object.entries(BLOCK_CONFIG) as [BlockType, typeof BLOCK_CONFIG[BlockType]][]).map(([key, cfg]) => (
                <TouchableOpacity
                  key={key}
                  style={[mStyles.typeChip, { backgroundColor: colors.bg2, borderColor: colors.bg3 }, blockType === key && { backgroundColor: cfg.bg, borderColor: cfg.color }]}
                  onPress={() => setBlockType(key)}
                  activeOpacity={0.8}
                >
                  <Text>{cfg.icon}</Text>
                  <Text style={[mStyles.typeLabel, { color: colors.textSecondary }, blockType === key && { color: cfg.color, fontWeight: '700' }]}>
                    {cfg.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Názov */}
          <Text style={[mStyles.label, { color: colors.textSecondary }]}>NÁZOV</Text>
          <View style={[mStyles.inputWrap, { backgroundColor: colors.bg2, borderColor: colors.bg3 }]}>
            <TextInput
              style={[mStyles.input, { color: colors.textPrimary }]}
              value={title}
              onChangeText={setTitle}
              placeholder="Názov blokovania..."
              placeholderTextColor={dark ? '#666' : '#bbb'}
              maxLength={60}
            />
          </View>

          {/* Dátum */}
          <Text style={[mStyles.label, { color: colors.textSecondary }]}>DÁTUM</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {days.map((d, i) => {
                const isSel = d.toDateString() === selDate.toDateString();
                const isToday = i === 0;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[mStyles.dayCell, { backgroundColor: colors.bg2, borderColor: colors.bg3 }, isSel && mStyles.dayCellSel]}
                    onPress={() => setSelDate(d)}
                    activeOpacity={0.8}
                  >
                    <Text style={[mStyles.dayName, isSel && mStyles.daySelTxt]}>
                      {isToday ? 'Dnes' : SK_DAYS_SHORT[d.getDay()]}
                    </Text>
                    <Text style={[mStyles.dayNum, isSel && mStyles.daySelTxt]}>{d.getDate()}</Text>
                    <Text style={[mStyles.dayMon, isSel && mStyles.daySelTxt]}>{SK_MONTHS_SHORT[d.getMonth()]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Čas */}
          <Text style={[mStyles.label, { color: colors.textSecondary }]}>ČAS (HH:MM)</Text>
          <View style={mStyles.timeRow}>
            <View style={[mStyles.timeWrap, { flex: 1, backgroundColor: colors.bg2, borderColor: colors.bg3 }, startErr && mStyles.inputErr]}>
              <Ionicons name="play-outline" size={13} color={COLORS.wal} />
              <TextInput
                style={[mStyles.timeInput, { color: colors.textPrimary }]}
                value={startStr}
                onChangeText={(t) => { setStartStr(t); setStartErr(false); }}
                placeholder="08:00"
                placeholderTextColor={dark ? '#666' : '#bbb'}
                keyboardType="numeric"
                maxLength={5}
              />
            </View>
            <Text style={{ color: COLORS.wal, fontWeight: '700', paddingHorizontal: 6 }}>–</Text>
            <View style={[mStyles.timeWrap, { flex: 1, backgroundColor: colors.bg2, borderColor: colors.bg3 }, endErr && mStyles.inputErr]}>
              <Ionicons name="stop-outline" size={13} color={COLORS.wal} />
              <TextInput
                style={[mStyles.timeInput, { color: colors.textPrimary }]}
                value={endStr}
                onChangeText={(t) => { setEndStr(t); setEndErr(false); }}
                placeholder="09:00"
                placeholderTextColor={dark ? '#666' : '#bbb'}
                keyboardType="numeric"
                maxLength={5}
              />
            </View>
          </View>
          {(startErr || endErr) && (
            <Text style={mStyles.errText}>
              {startErr ? 'Neplatný čas začiatku (HH:MM)' : 'Čas konca musí byť neskôr ako začiatok'}
            </Text>
          )}

          {/* Poznámka */}
          <Text style={[mStyles.label, { marginTop: 12, color: colors.textSecondary }]}>POZNÁMKA (voliteľné)</Text>
          <View style={[mStyles.inputWrap, { backgroundColor: colors.bg2, borderColor: colors.bg3 }]}>
            <TextInput
              style={[mStyles.input, { minHeight: 52, textAlignVertical: 'top', color: colors.textPrimary }]}
              value={note}
              onChangeText={setNote}
              placeholder="Dôvod, upozornenie..."
              placeholderTextColor={dark ? '#666' : '#bbb'}
              multiline
              numberOfLines={2}
              maxLength={200}
            />
          </View>

          {/* Tlačidlá */}
          <View style={mStyles.btnRow}>
            <TouchableOpacity style={[mStyles.btnCancel, { borderColor: colors.bg3 }]} onPress={onClose} activeOpacity={0.8}>
              <Text style={[mStyles.btnCancelText, { color: colors.textSecondary }]}>Zrušiť</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[mStyles.btnSave, saving && { opacity: 0.5 }]}
              onPress={handleSave} disabled={saving} activeOpacity={0.85}>
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <><Ionicons name="lock-closed-outline" size={15} color="#fff" />
                    <Text style={mStyles.btnSaveText}>Zablokovať čas</Text></>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const mStyles = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet:     { backgroundColor: COLORS.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 44, maxHeight: '92%' },
  handle:    { width: 38, height: 4, borderRadius: 2, backgroundColor: COLORS.bg3, alignSelf: 'center', marginBottom: 18 },
  title:     { fontSize: 20, fontWeight: '700', color: COLORS.esp, marginBottom: 18 },
  label:     { fontSize: 9, letterSpacing: 2, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  typeChip:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.bg2, borderWidth: 1.5, borderColor: COLORS.bg3 },
  typeLabel: { fontSize: 12, fontWeight: '500', color: COLORS.wal },
  inputWrap: { backgroundColor: COLORS.bg2, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.bg3, paddingHorizontal: 12, paddingVertical: 2, marginBottom: 12 },
  input:     { fontSize: 13, color: COLORS.esp, paddingVertical: 10 },
  dayCell:   { width: 54, alignItems: 'center', paddingVertical: 8, borderRadius: 12, backgroundColor: COLORS.bg2, borderWidth: 1.5, borderColor: COLORS.bg3 },
  dayCellSel:{ backgroundColor: COLORS.esp, borderColor: COLORS.sand },
  dayName:   { fontSize: 8, fontWeight: '700', color: COLORS.wal, textTransform: 'uppercase' },
  dayNum:    { fontSize: 16, fontWeight: '700', color: COLORS.esp, marginVertical: 2 },
  dayMon:    { fontSize: 8, color: COLORS.wal, textTransform: 'uppercase' },
  daySelTxt: { color: COLORS.cream },
  timeRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  timeWrap:  { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.bg2, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.bg3, paddingHorizontal: 10, paddingVertical: 4 },
  timeInput: { fontSize: 16, fontWeight: '700', color: COLORS.esp, paddingVertical: 6, minWidth: 48 },
  inputErr:  { borderColor: '#E74C3C', backgroundColor: '#FEF0EE' },
  errText:   { fontSize: 11, color: '#E74C3C', marginBottom: 8 },
  btnRow:    { flexDirection: 'row', gap: 10, marginTop: 16 },
  btnCancel: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.bg3 },
  btnCancelText: { fontSize: 14, fontWeight: '600', color: COLORS.wal },
  btnSave:   { flex: 1.6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 14, borderRadius: 12, backgroundColor: COLORS.esp },
  btnSaveText: { fontSize: 14, fontWeight: '700', color: '#fff' } });

// ─── Hlavná obrazovka ─────────────────────────────────────────────────────────
export default function TimeBlocksScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [doctorId, setDoctorId] = useState('');
  const { blocks, loading, refetch, addBlock, deleteBlock } = useTimeBlocks(doctorId || null);
  const [showModal, setShowModal] = useState(false);
  const [quickSaving, setQuickSaving] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setDoctorId(user.id);
    });
  }, []);

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const templates = useMemo(() => quickBlocks(new Date()), []);

  async function handleQuickAdd(tpl: typeof templates[0]) {
    setQuickSaving(tpl.label);
    const err = await addBlock({
      title:      tpl.title,
      block_type: tpl.block_type,
      start_time: tpl.start.toISOString(),
      end_time:   tpl.end.toISOString() });
    setQuickSaving(null);
    if (err) Alert.alert('Chyba', err.message);
  }

  function handleDelete(block: TimeBlock) {
    const cfg = BLOCK_CONFIG[block.block_type] ?? BLOCK_CONFIG.other;
    Alert.alert(
      'Odstrániť blokovanie',
      `Odstrániť „${block.title}" (${fmtDateShort(new Date(block.start_time))} ${fmtTime(new Date(block.start_time))} – ${fmtTime(new Date(block.end_time))})?`,
      [
        { text: 'Nie', style: 'cancel' },
        { text: 'Odstrániť', style: 'destructive', onPress: async () => {
          const err = await deleteBlock(block.id);
          if (err) Alert.alert('Chyba', err.message);
        }},
      ]
    );
  }

  // Zoskup podľa dňa
  const grouped = useMemo(() => {
    const map: Record<string, TimeBlock[]> = {};
    blocks.forEach((b) => {
      const key = fmtDateFull(new Date(b.start_time));
      if (!map[key]) map[key] = [];
      map[key].push(b);
    });
    return map;
  }, [blocks]);

  return (
    <View style={styles.safe}>
      <HeroHeader
        title="Blokovanie času"
        subtitle="Správa rozvrhu"
        icon="calendar-outline"
        onBack={() => router.back()}
      />

      <ScrollView style={[styles.scroll, { backgroundColor: colors.bg2 }]} showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}>

        {/* Info banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={18} color="#1A5276" />
          <Text style={styles.infoText}>
            Blokovaný čas sa zobrazí pacientom ako obsadený — nemôžu si v ňom objednať termín.
          </Text>
        </View>

        {/* Rýchle šablóny */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>RÝCHLE BLOKOVANIE</Text>
        <View style={styles.quickGrid}>
          {templates.map((tpl) => {
            const isSaving = quickSaving === tpl.label;
            return (
              <TouchableOpacity
                key={tpl.label}
                style={[styles.quickCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}
                onPress={() => handleQuickAdd(tpl)}
                disabled={!!quickSaving}
                activeOpacity={0.8}
              >
                {isSaving
                  ? <ActivityIndicator color={COLORS.wal} size="small" />
                  : <Text style={styles.quickIcon}>{tpl.label.split(' ')[0]}</Text>}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.quickLabel, { color: colors.textPrimary }]}>{tpl.label.split(' ').slice(1).join(' ')}</Text>
                  <Text style={[styles.quickSub, { color: colors.textSecondary }]}>{tpl.sub}</Text>
                </View>
                <Ionicons name="add-circle-outline" size={20} color={COLORS.wal} />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Vlastné blokovanie */}
        <TouchableOpacity style={[styles.customBtn, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]} onPress={() => setShowModal(true)} activeOpacity={0.85}>
          <Ionicons name="settings-outline" size={17} color={COLORS.wal} />
          <Text style={[styles.customBtnText, { color: colors.textSecondary }]}>Vlastné blokovanie...</Text>
        </TouchableOpacity>

        {/* Zoznam blokovaní */}
        <Text style={[styles.sectionLabel, { marginTop: 22, color: colors.textSecondary }]}>
          NADCHÁDZAJÚCE BLOKOVANIA {blocks.length > 0 ? `(${blocks.length})` : ''}
        </Text>

        {loading ? (
          <View style={{ padding: SPACING.xl }}><SkeletonList count={3} /></View>
        ) : blocks.length === 0 ? (
          <View style={styles.emptyCenter}>
            <Ionicons name="checkmark-circle-outline" size={48} color={COLORS.bg3} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Žiadne blokovania</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Ordinačný čas je plne dostupný pre pacientov.</Text>
          </View>
        ) : (
          Object.entries(grouped).map(([day, dayBlocks]) => (
            <View key={day}>
              <View style={styles.dayHeader}>
                <View style={styles.dayHeaderDot} />
                <Text style={[styles.dayHeaderText, { color: colors.textSecondary }]}>{day.toUpperCase()}</Text>
              </View>
              {dayBlocks.map((b) => (
                <BlockCard key={b.id} block={b} onDelete={() => handleDelete(b)} />
              ))}
            </View>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Modal */}
      <AddBlockModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onSave={async (data) => {
          const err = await addBlock(data);
          return err;
        }}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: COLORS.esp },
  scroll:  { flex: 1, backgroundColor: COLORS.bg2 },
  content: { padding: SPACING.xl, paddingTop: 14 },

  header:      { backgroundColor: COLORS.esp, paddingHorizontal: SPACING.xl, paddingTop: 14, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerSub:   { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 3 },
  headerTitle: { fontSize: 19, fontWeight: '700', color: '#fff' },
  addBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.wal, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  addBtnText:  { fontSize: 12, fontWeight: '700', color: '#fff' },

  infoBanner:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#EBF5FB', borderRadius: 12, borderWidth: 1, borderColor: '#AED6F1', padding: 12, marginBottom: 20 },
  infoText:    { flex: 1, fontSize: 12, color: '#1A5276', lineHeight: 18 },

  sectionLabel: { fontSize: 9, letterSpacing: 2, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 12 },

  quickGrid:  { gap: 8, marginBottom: 8 },
  quickCard:  { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.cream, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.bg3, padding: 14, elevation: 1 },
  quickIcon:  { fontSize: 22 },
  quickLabel: { fontSize: 13, fontWeight: '700', color: COLORS.esp },
  quickSub:   { fontSize: 11, color: COLORS.wal, marginTop: 2 },

  customBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.cream, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.bg3, borderStyle: 'dashed', paddingVertical: 12, marginTop: 6 },
  customBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.wal },

  dayHeader:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, marginTop: 4 },
  dayHeaderDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.wal },
  dayHeaderText:{ fontSize: 9, letterSpacing: 1.5, fontWeight: '700', color: COLORS.wal, textTransform: 'uppercase' },

  emptyCenter: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyTitle:  { fontSize: 16, fontWeight: '600', color: COLORS.esp },
  emptySub:    { fontSize: 13, color: COLORS.wal, textAlign: 'center' } });
