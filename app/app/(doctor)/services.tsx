import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../supabase';
import { COLORS, SIZES } from '../../styles/theme';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';

const EMOJIS = ['🦷','🪥','😁','💉','🏥','👨‍⚕️','📋','✨','🔬','💊','🩺','🫀'];

type Service = {
  id: string;
  name: string;
  emoji: string | null;
  duration_minutes: number;
  price_min: number | null;
  price_max: number | null;
  sort_order: number;
  is_active: boolean;
};

export default function ServicesScreen() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  const [services,   setServices]   = useState<Service[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen,  setModalOpen]  = useState(false);
  const [saving,     setSaving]     = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name,      setName]      = useState('');
  const [emoji,     setEmoji]     = useState(EMOJIS[0]);
  const [duration,  setDuration]  = useState('');
  const [priceMin,  setPriceMin]  = useState('');
  const [priceMax,  setPriceMax]  = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('services')
      .select('id, name, emoji, duration_minutes, price_min, price_max, sort_order, is_active')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    setServices((data ?? []) as Service[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const active   = services.filter(s => s.is_active !== false);
  const archived = services.filter(s => s.is_active === false);

  // ── Otvoriť modál ─────────────────────────────────────────────────────────
  function openAdd() {
    setEditingId(null); setName(''); setEmoji(EMOJIS[0]);
    setDuration(''); setPriceMin(''); setPriceMax('');
    setModalOpen(true);
  }
  function openEdit(svc: Service) {
    setEditingId(svc.id); setName(svc.name); setEmoji(svc.emoji ?? EMOJIS[0]);
    setDuration(String(svc.duration_minutes));
    setPriceMin(svc.price_min != null ? String(svc.price_min) : '');
    setPriceMax(svc.price_max != null ? String(svc.price_max) : '');
    setModalOpen(true);
  }

  // ── Uložiť ────────────────────────────────────────────────────────────────
  async function save() {
    if (!name.trim() || !duration) { Alert.alert('Chyba', 'Vyplňte aspoň názov a trvanie.'); return; }
    setSaving(true);
    const payload = {
      name: name.trim(), emoji,
      duration_minutes: parseInt(duration, 10),
      price_min: priceMin ? parseFloat(priceMin) : null,
      price_max: priceMax ? parseFloat(priceMax) : null,
      color: COLORS.sand,
    };
    const { error } = editingId
      ? await supabase.from('services').update(payload).eq('id', editingId)
      : await supabase.from('services').insert([{ ...payload, sort_order: active.length, is_active: true }]);
    setSaving(false);
    if (error) { Alert.alert('Chyba', error.message); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setModalOpen(false);
    load();
  }

  // ── Archivácia / Obnova ───────────────────────────────────────────────────
  async function archiveService() {
    if (!editingId) return;
    setSaving(true);
    const { error } = await supabase.from('services').update({ is_active: false }).eq('id', editingId);
    setSaving(false);
    if (error) { Alert.alert('Chyba', error.message); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setModalOpen(false);
    load();
  }
  async function restoreService(svc: Service) {
    await supabase.from('services').update({ is_active: true, sort_order: active.length }).eq('id', svc.id);
    load();
  }

  // ── Presun hore / dole ────────────────────────────────────────────────────
  async function moveService(idx: number, direction: 'up' | 'down') {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= active.length) return;

    const reordered = [...active];
    const temp = reordered[idx];
    reordered[idx] = reordered[targetIdx];
    reordered[targetIdx] = temp;

    // Okamžitá UI aktualizácia
    setServices([...reordered.map((s, i) => ({ ...s, sort_order: i })), ...archived]);

    // Uloženie do DB
    await Promise.all(
      reordered.map((svc, i) =>
        supabase.from('services').update({ sort_order: i }).eq('id', svc.id),
      ),
    );
  }

  if (loading) return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Cenník služieb</Text>
      </View>
      <View style={{ flex: 1, backgroundColor: colors.bg2, padding: SIZES.padding }}>
        <SkeletonList count={5} />
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerSub}>NASTAVENIA</Text>
          <Text style={s.headerTitle}>Cenník služieb</Text>
        </View>
        <View style={s.countBadge}>
          <Text style={s.countText}>{active.length}</Text>
        </View>
      </View>

      <ScrollView
        style={[s.scroll, { backgroundColor: colors.bg2 }]}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={COLORS.wal} colors={[COLORS.wal]} />
        }
      >
        {/* ── Aktívne služby ── */}
        {active.length === 0 && archived.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>🦷</Text>
            <Text style={[s.emptyText, { color: colors.textSecondary }]}>Žiadne služby. Pridajte prvú.</Text>
          </View>
        )}

        {active.map((svc, idx) => (
          <View key={svc.id} style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            {/* Šípky pre presun */}
            <View style={s.arrows}>
              <TouchableOpacity
                onPress={() => moveService(idx, 'up')}
                disabled={idx === 0}
                style={[s.arrowBtn, idx === 0 && { opacity: 0.2 }]}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="chevron-up" size={16} color={COLORS.wal} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => moveService(idx, 'down')}
                disabled={idx === active.length - 1}
                style={[s.arrowBtn, idx === active.length - 1 && { opacity: 0.2 }]}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="chevron-down" size={16} color={COLORS.wal} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={s.cardBody} onPress={() => openEdit(svc)} activeOpacity={0.85}>
              <View style={[s.cardLeft, { backgroundColor: colors.bg2 }]}>
                <Text style={s.cardEmoji}>{svc.emoji ?? '🦷'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.cardName, { color: colors.textPrimary }]}>{svc.name}</Text>
                <Text style={[s.cardDuration, { color: colors.textSecondary }]}>{svc.duration_minutes} min</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.cardPrice}>
                  {svc.price_min != null ? `${svc.price_min}€` : '—'}
                  {svc.price_max != null ? ` – ${svc.price_max}€` : ''}
                </Text>
                <Ionicons name="pencil-outline" size={14} color={COLORS.sand} style={{ marginTop: 4 }} />
              </View>
            </TouchableOpacity>
          </View>
        ))}

        {/* ── Archivované ── */}
        {archived.length > 0 && (
          <>
            <Text style={[s.sectionLabel, { color: colors.textSecondary, marginTop: 16 }]}>ARCHIVOVANÉ SLUŽBY</Text>
            {archived.map((svc) => (
              <View key={svc.id} style={[s.card, s.cardArchived, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <View style={[s.cardLeft, { backgroundColor: colors.bg3, opacity: 0.5 }]}>
                  <Text style={[s.cardEmoji, { opacity: 0.5 }]}>{svc.emoji ?? '🦷'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.cardName, { color: colors.textSecondary, opacity: 0.7 }]}>{svc.name}</Text>
                  <Text style={[s.cardDuration, { color: colors.textSecondary, opacity: 0.5 }]}>{svc.duration_minutes} min</Text>
                </View>
                <TouchableOpacity
                  style={s.restoreBtn}
                  onPress={() => restoreService(svc)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="refresh-outline" size={14} color={COLORS.wal} />
                  <Text style={s.restoreBtnText}>Obnoviť</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={s.fab} onPress={openAdd} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color={COLORS.esp} />
      </TouchableOpacity>

      {/* ── Modál ── */}
      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View style={s.overlay}>
          <TouchableOpacity style={{ flex: 0.3 }} activeOpacity={1} onPress={() => setModalOpen(false)} />
          <View style={[s.modal, { backgroundColor: colors.cardBg }]}>
            <View style={[s.modalHandle, { backgroundColor: colors.bg3 }]} />
            <Text style={[s.modalTitle, { color: colors.textPrimary }]}>
              {editingId ? 'Upraviť službu' : 'Nová služba'}
            </Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Emoji výber */}
              <View style={s.emojiRow}>
                {EMOJIS.map((e) => (
                  <TouchableOpacity
                    key={e}
                    style={[s.emojiBtn, { backgroundColor: colors.bg2, borderColor: colors.bg3 },
                      emoji === e && { borderColor: COLORS.gold, backgroundColor: dark ? COLORS.wal + '22' : '#FEF9E7' }]}
                    onPress={() => setEmoji(e)}
                  >
                    <Text style={s.emojiText}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[s.inputLabel, { color: colors.textSecondary }]}>NÁZOV SLUŽBY *</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
                placeholder="Napr. Plomba, Extrakcia..."
                placeholderTextColor={dark ? '#555' : '#bbb'}
                value={name} onChangeText={setName}
              />

              <Text style={[s.inputLabel, { color: colors.textSecondary }]}>TRVANIE (min) *</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
                placeholder="30"
                placeholderTextColor={dark ? '#555' : '#bbb'}
                value={duration} onChangeText={setDuration} keyboardType="numeric"
              />

              <Text style={[s.inputLabel, { color: colors.textSecondary }]}>CENOVÉ ROZMEDZIE (€)</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TextInput
                  style={[s.input, { flex: 1, backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
                  placeholder="od"
                  placeholderTextColor={dark ? '#555' : '#bbb'}
                  value={priceMin} onChangeText={setPriceMin} keyboardType="decimal-pad"
                />
                <TextInput
                  style={[s.input, { flex: 1, backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
                  placeholder="do"
                  placeholderTextColor={dark ? '#555' : '#bbb'}
                  value={priceMax} onChangeText={setPriceMax} keyboardType="decimal-pad"
                />
              </View>

              <TouchableOpacity
                style={[s.saveBtn, saving && { opacity: 0.5 }]}
                onPress={save} disabled={saving} activeOpacity={0.85}
              >
                {saving ? <ActivityIndicator color={COLORS.esp} /> : <Text style={s.saveBtnText}>Uložiť</Text>}
              </TouchableOpacity>

              {editingId && (
                <TouchableOpacity
                  style={[s.archiveBtn, saving && { opacity: 0.5 }]}
                  onPress={archiveService} disabled={saving} activeOpacity={0.85}
                >
                  <Ionicons name="archive-outline" size={16} color={COLORS.wal} />
                  <Text style={s.archiveBtnText}>Archivovať</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={s.cancelBtn} onPress={() => setModalOpen(false)}>
                <Text style={[s.cancelBtnText, { color: colors.textSecondary }]}>Zrušiť</Text>
              </TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: COLORS.esp },
  scroll:  { flex: 1 },
  content: { padding: SIZES.padding },

  header: {
    backgroundColor: COLORS.esp, paddingHorizontal: SIZES.padding,
    paddingTop: 14, paddingBottom: 18,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  backBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerSub:  { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  headerTitle:{ fontSize: 19, fontWeight: '700', color: '#fff' },
  countBadge: { backgroundColor: COLORS.gold, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  countText:  { fontSize: 13, fontWeight: '800', color: COLORS.esp },

  sectionLabel: { fontSize: 9, letterSpacing: 2, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },

  empty:     { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 14, textAlign: 'center' },

  card:        { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, marginBottom: 8, overflow: 'hidden' },
  cardArchived:{ opacity: 0.7 },
  arrows:      { paddingVertical: 6, paddingHorizontal: 6, gap: 0, alignItems: 'center', justifyContent: 'center' },
  arrowBtn:    { padding: 4 },
  cardBody:    { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  cardLeft:    { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  cardEmoji:   { fontSize: 20 },
  cardName:    { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  cardDuration:{ fontSize: 11 },
  cardPrice:   { fontSize: 13, fontWeight: '700', color: COLORS.gold },
  restoreBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: COLORS.bg3, margin: 10 },
  restoreBtnText: { fontSize: 11, fontWeight: '600', color: COLORS.wal },

  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: COLORS.esp, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6,
  },

  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal:       { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, maxHeight: '85%' },
  modalHandle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle:  { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 14 },

  emojiRow:   { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 14 },
  emojiBtn:   { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  emojiText:  { fontSize: 20 },

  inputLabel: { fontSize: 9, letterSpacing: 1.5, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6, marginTop: 12 },
  input:      { borderWidth: 1.5, borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 2 },

  saveBtn:     { backgroundColor: COLORS.gold, paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 16 },
  saveBtnText: { color: COLORS.esp, fontSize: 15, fontWeight: '800' },
  archiveBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: COLORS.bg3, paddingVertical: 12, borderRadius: 12, marginTop: 10 },
  archiveBtnText: { color: COLORS.wal, fontSize: 14, fontWeight: '600' },
  cancelBtn:   { paddingVertical: 14, alignItems: 'center' },
  cancelBtnText: { fontSize: 14 },
});
