import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, Modal, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../supabase';
import { COLORS } from '../../styles/theme';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';

const EMOJIS = ['🦷', '🪥', '😁', '💉', '🏥', '👨‍⚕️', '📋', '✨'];

type Service = {
  id: string;
  name: string;
  emoji: string | null;
  duration_minutes: number;
  price_min: number | null;
  price_max: number | null;
};

export default function ServicesScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [services,  setServices]  = useState<Service[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving,    setSaving]    = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name,      setName]      = useState('');
  const [emoji,     setEmoji]     = useState(EMOJIS[0]);
  const [duration,  setDuration]  = useState('');
  const [priceMin,  setPriceMin]  = useState('');
  const [priceMax,  setPriceMax]  = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('services').select('*').order('name');
    setServices((data ?? []) as Service[]);
    setLoading(false);
  }

  function openAdd() {
    setEditingId(null); setName(''); setEmoji(EMOJIS[0]);
    setDuration(''); setPriceMin(''); setPriceMax('');
    setModalOpen(true);
  }

  function openEdit(svc: Service) {
    setEditingId(svc.id); setName(svc.name); setEmoji(svc.emoji ?? EMOJIS[0]);
    setDuration(String(svc.duration_minutes));
    setPriceMin(String(svc.price_min ?? ''));
    setPriceMax(String(svc.price_max ?? ''));
    setModalOpen(true);
  }

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
      : await supabase.from('services').insert([payload]);
    setSaving(false);
    if (error) { Alert.alert('Chyba', error.message); return; }
    setModalOpen(false);
    load();
  }

  async function remove() {
    if (!editingId) return;
    setSaving(true);
    await supabase.from('services').delete().eq('id', editingId);
    setSaving(false);
    setModalOpen(false);
    load();
  }

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
          <Text style={s.countText}>{services.length}</Text>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, backgroundColor: colors.bg2, padding: 16 }}><SkeletonList count={5} /></View>
      ) : (
        <ScrollView style={[s.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {services.length === 0 && (
            <View style={s.empty}>
              <Text style={s.emptyIcon}>🦷</Text>
              <Text style={[s.emptyText, { color: colors.textSecondary }]}>Žiadne služby. Pridajte prvú.</Text>
            </View>
          )}
          {services.map((svc) => (
            <TouchableOpacity key={svc.id} style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]} onPress={() => openEdit(svc)} activeOpacity={0.85}>
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
                <Ionicons name="pencil-outline" size={16} color={COLORS.sand} style={{ marginTop: 4 }} />
              </View>
            </TouchableOpacity>
          ))}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      <TouchableOpacity style={s.fab} onPress={openAdd} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color={COLORS.esp} />
      </TouchableOpacity>

      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>{editingId ? 'Upraviť službu' : 'Nová služba'}</Text>

            <View style={s.emojiRow}>
              {EMOJIS.map((e) => (
                <TouchableOpacity
                  key={e}
                  style={[s.emojiBtn, emoji === e && s.emojiBtnActive]}
                  onPress={() => setEmoji(e)}
                >
                  <Text style={s.emojiText}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput style={s.input} placeholder="Názov služby" placeholderTextColor={COLORS.sand}
              value={name} onChangeText={setName} />
            <TextInput style={s.input} placeholder="Trvanie (min)" placeholderTextColor={COLORS.sand}
              value={duration} onChangeText={setDuration} keyboardType="numeric" />
            <View style={s.priceRow}>
              <TextInput style={[s.input, { flex: 1 }]} placeholder="Cena od (€)" placeholderTextColor={COLORS.sand}
                value={priceMin} onChangeText={setPriceMin} keyboardType="numeric" />
              <View style={{ width: 10 }} />
              <TextInput style={[s.input, { flex: 1 }]} placeholder="Cena do (€)" placeholderTextColor={COLORS.sand}
                value={priceMax} onChangeText={setPriceMax} keyboardType="numeric" />
            </View>

            <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.5 }]} onPress={save} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color={COLORS.esp} /> : <Text style={s.saveBtnText}>Uložiť</Text>}
            </TouchableOpacity>
            {editingId && (
              <TouchableOpacity style={s.deleteBtn} onPress={remove} disabled={saving} activeOpacity={0.85}>
                <Text style={s.deleteBtnText}>Vymazať</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.cancelBtn} onPress={() => setModalOpen(false)}>
              <Text style={s.cancelBtnText}>Zrušiť</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: COLORS.esp },
  scroll:  { flex: 1, backgroundColor: COLORS.bg2 },
  content: { padding: 16 },
  center:  { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center' },
  header:  {
    backgroundColor: COLORS.esp, paddingHorizontal: 16,
    paddingTop: 14, paddingBottom: 18,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  backBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerSub:  { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  headerTitle:{ fontSize: 19, fontWeight: '700', color: '#fff' },
  countBadge: { backgroundColor: COLORS.gold, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  countText:  { fontSize: 13, fontWeight: '800', color: COLORS.esp },

  empty:     { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 14, color: COLORS.wal, textAlign: 'center' },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.bg3,
  },
  cardLeft:     { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center' },
  cardEmoji:    { fontSize: 22 },
  cardName:     { fontSize: 15, fontWeight: '700', color: COLORS.esp, marginBottom: 2 },
  cardDuration: { fontSize: 11, color: COLORS.wal },
  cardPrice:    { fontSize: 13, fontWeight: '700', color: COLORS.gold },

  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: COLORS.esp, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6,
  },

  overlay: { flex: 1, backgroundColor: 'rgba(44,31,20,0.6)', justifyContent: 'flex-end' },
  modal:   { backgroundColor: COLORS.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 10 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.esp, textAlign: 'center', marginBottom: 4 },

  emojiRow:      { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 4 },
  emojiBtn:      { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: COLORS.bg3 },
  emojiBtnActive:{ borderColor: COLORS.gold, backgroundColor: COLORS.goldLight ?? COLORS.sand },
  emojiText:     { fontSize: 22 },

  input:      { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.bg3, borderRadius: 10, padding: 12, color: COLORS.esp, fontSize: 15 },
  priceRow:   { flexDirection: 'row' },
  saveBtn:    { backgroundColor: COLORS.gold, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveBtnText:{ color: COLORS.esp, fontSize: 15, fontWeight: '800' },
  deleteBtn:  { borderWidth: 1.5, borderColor: COLORS.error, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  deleteBtnText: { color: COLORS.error, fontSize: 15, fontWeight: '700' },
  cancelBtn:  { paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { color: COLORS.wal, fontSize: 14 },
});
