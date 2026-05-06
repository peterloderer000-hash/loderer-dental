/**
 * Rodinné profily — pacient
 * Správa rodinných príslušníkov + rezervácia termínov za nich
 */
import React, { useState, useCallback } from 'react';
import {
  ActivityIndicator, Alert, Modal, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../supabase';
import { COLORS, SIZES } from '../../styles/theme';
import { SkeletonList } from '../../components/Skeleton';

type FamilyMember = {
  id: string;
  full_name: string;
  date_of_birth: string | null;
  relationship: string;
  notes: string | null;
};

const RELATIONSHIPS = ['dieťa', 'manžel/ka', 'rodič', 'súrodenec', 'iné'] as const;

const REL_CFG: Record<string, { icon: string; color: string; bg: string }> = {
  'dieťa':     { icon: '👶', color: '#1A5276', bg: '#EBF5FB' },
  'manžel/ka': { icon: '💑', color: '#7D3C98', bg: '#F5EEF8' },
  'rodič':     { icon: '👴', color: '#784212', bg: '#FEF9E7' },
  'súrodenec': { icon: '🧑', color: '#1E8449', bg: '#EAFAF1' },
  'iné':       { icon: '👤', color: COLORS.wal, bg: '#F4ECE4' },
};

function calcAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return age;
}

const EMPTY_FORM = { full_name: '', date_of_birth: '', relationship: 'dieťa', notes: '' };

export default function FamilyScreen() {
  const router = useRouter();
  const [members,    setMembers]    = useState<FamilyMember[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [patientId,  setPatientId]  = useState<string | null>(null);

  // Modal
  const [showModal,  setShowModal]  = useState(false);
  const [editing,    setEditing]    = useState<FamilyMember | null>(null);
  const [form,       setForm]       = useState({ ...EMPTY_FORM });
  const [saving,     setSaving]     = useState(false);

  async function load() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setPatientId(user.id);
      const { data } = await supabase
        .from('family_members')
        .select('id, full_name, date_of_birth, relationship, notes')
        .eq('patient_id', user.id)
        .order('created_at');
      setMembers((data ?? []) as FamilyMember[]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  }

  function openEdit(m: FamilyMember) {
    setEditing(m);
    // Convert YYYY-MM-DD → DD.MM.YYYY
    let dob = '';
    if (m.date_of_birth) {
      const [y, mo, d] = m.date_of_birth.split('-');
      dob = `${d}.${mo}.${y}`;
    }
    setForm({ full_name: m.full_name, date_of_birth: dob, relationship: m.relationship, notes: m.notes ?? '' });
    setShowModal(true);
  }

  function parseDob(str: string): string | null {
    if (!str.trim()) return null;
    const parts = str.trim().split('.');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      if (d && m && y && y.length === 4) return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
    return 'invalid';
  }

  async function handleSave() {
    if (!form.full_name.trim()) { Alert.alert('Chyba', 'Zadaj meno.'); return; }
    if (!patientId) return;

    let dob: string | null = null;
    if (form.date_of_birth.trim()) {
      dob = parseDob(form.date_of_birth);
      if (dob === 'invalid') { Alert.alert('Chyba', 'Dátum musí byť vo formáte DD.MM.RRRR'); return; }
    }

    setSaving(true);
    const payload = {
      full_name:     form.full_name.trim(),
      date_of_birth: dob,
      relationship:  form.relationship,
      notes:         form.notes.trim() || null,
    };

    let error;
    if (editing) {
      ({ error } = await supabase.from('family_members').update(payload).eq('id', editing.id));
    } else {
      ({ error } = await supabase.from('family_members').insert({ ...payload, patient_id: patientId }));
    }
    setSaving(false);
    if (error) { Alert.alert('Chyba', error.message); return; }
    setShowModal(false);
    load();
  }

  function handleDelete(m: FamilyMember) {
    Alert.alert('Odstrániť', `Odstrániť ${m.full_name} z rodinných profilov?`, [
      { text: 'Nie', style: 'cancel' },
      { text: 'Áno, odstrániť', style: 'destructive', onPress: async () => {
        await supabase.from('family_members').delete().eq('id', m.id);
        setMembers(prev => prev.filter(x => x.id !== m.id));
      }},
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Hlavička ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerSub}>MÔJ ÚČET</Text>
          <Text style={styles.headerTitle}>Rodinné profily</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.85}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addBtnText}>Pridať</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.wal} />}>

        {/* Info banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="people-outline" size={14} color="#1A5276" />
          <Text style={styles.infoBannerText}>
            Pridaj rodinných príslušníkov a rezervuj im termíny bez nutnosti vytvárať samostatné účty.
          </Text>
        </View>

        {loading ? (
          <SkeletonList count={3} />
        ) : members.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>👨‍👩‍👧‍👦</Text>
            <Text style={styles.emptyTitle}>Žiadni rodinní príslušníci</Text>
            <Text style={styles.emptySub}>Klepni „Pridať" a sprav profil pre dieťa alebo partnera</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={openAdd} activeOpacity={0.85}>
              <Ionicons name="add-circle-outline" size={16} color="#fff" />
              <Text style={styles.emptyBtnText}>Pridať prvého člena</Text>
            </TouchableOpacity>
          </View>
        ) : (
          members.map(m => {
            const cfg = REL_CFG[m.relationship] ?? REL_CFG['iné'];
            const age = calcAge(m.date_of_birth);
            const initials = m.full_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
            return (
              <View key={m.id} style={styles.card}>
                <View style={styles.cardTop}>
                  {/* Avatar */}
                  <View style={[styles.avatar, { backgroundColor: cfg.bg, borderColor: cfg.color + '55' }]}>
                    <Text style={{ fontSize: 22 }}>{cfg.icon}</Text>
                  </View>

                  {/* Info */}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>{m.full_name}</Text>
                    <View style={styles.metaRow}>
                      <View style={[styles.relBadge, { backgroundColor: cfg.bg, borderColor: cfg.color + '44' }]}>
                        <Text style={[styles.relBadgeText, { color: cfg.color }]}>{m.relationship}</Text>
                      </View>
                      {age !== null && (
                        <Text style={styles.ageText}>{age} rokov</Text>
                      )}
                    </View>
                    {m.notes ? (
                      <Text style={styles.memberNotes} numberOfLines={2}>{m.notes}</Text>
                    ) : null}
                  </View>

                  {/* Akcie */}
                  <View style={styles.cardActions}>
                    <TouchableOpacity onPress={() => openEdit(m)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.actionIcon}>
                      <Ionicons name="create-outline" size={18} color={COLORS.wal} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(m)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.actionIcon}>
                      <Ionicons name="trash-outline" size={18} color="#E74C3C" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Rezervovať termín */}
                <TouchableOpacity
                  style={styles.bookBtn}
                  onPress={() => router.push({
                    pathname: '/(patient)/book-appointment',
                    params: { forFamily: '1', familyName: m.full_name, familyId: m.id },
                  })}
                  activeOpacity={0.85}
                >
                  <Ionicons name="calendar-outline" size={14} color={COLORS.wal} />
                  <Text style={styles.bookBtnText}>Rezervovať termín pre {m.full_name.split(' ')[0]}</Text>
                  <Ionicons name="chevron-forward" size={13} color={COLORS.wal} style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>
              </View>
            );
          })
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Modal: Pridať / Upraviť ── */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowModal(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{editing ? 'Upraviť profil' : 'Pridať rodinného príslušníka'}</Text>

            {/* Meno */}
            <Text style={styles.formLabel}>CELÉ MENO *</Text>
            <TextInput style={styles.formInput} value={form.full_name}
              onChangeText={v => setForm(f => ({ ...f, full_name: v }))}
              placeholder="Meno a priezvisko" placeholderTextColor="#999"
              autoCapitalize="words" />

            {/* Vzťah */}
            <Text style={styles.formLabel}>VZŤAH</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8, flexShrink: 0 }}>
                {RELATIONSHIPS.map(r => {
                  const cfg = REL_CFG[r];
                  const active = form.relationship === r;
                  return (
                    <TouchableOpacity key={r} activeOpacity={0.8}
                      style={[styles.relChip, active && { backgroundColor: cfg.bg, borderColor: cfg.color }]}
                      onPress={() => setForm(f => ({ ...f, relationship: r }))}>
                      <Text style={styles.relChipIcon}>{cfg.icon}</Text>
                      <Text style={[styles.relChipLabel, active && { color: cfg.color, fontWeight: '700' }]} numberOfLines={1}>
                        {r}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* Dátum narodenia */}
            <Text style={styles.formLabel}>DÁTUM NARODENIA</Text>
            <TextInput style={styles.formInput} value={form.date_of_birth}
              onChangeText={v => setForm(f => ({ ...f, date_of_birth: v }))}
              placeholder="DD.MM.RRRR" placeholderTextColor="#999"
              keyboardType="numbers-and-punctuation" maxLength={10} />

            {/* Poznámka */}
            <Text style={styles.formLabel}>POZNÁMKA</Text>
            <TextInput style={[styles.formInput, { minHeight: 60, textAlignVertical: 'top' }]}
              value={form.notes} onChangeText={v => setForm(f => ({ ...f, notes: v }))}
              placeholder="Alergie, špeciálne potreby..." placeholderTextColor="#999"
              multiline />

            {/* Tlačidlá */}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowModal(false)} activeOpacity={0.8}>
                <Text style={styles.modalCancelText}>Zrušiť</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, saving && { opacity: 0.5 }]}
                onPress={handleSave} disabled={saving} activeOpacity={0.85}>
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.modalSaveText}>{editing ? 'Uložiť' : 'Pridať'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },
  content:{ padding: SIZES.padding, paddingTop: 14 },
  center: { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center' },

  header:      { backgroundColor: COLORS.esp, paddingHorizontal: SIZES.padding, paddingTop: 14, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerSub:   { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  addBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.wal, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  addBtnText:  { fontSize: 13, fontWeight: '700', color: '#fff' },

  infoBanner:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#EBF5FB', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#AED6F1', marginBottom: 14 },
  infoBannerText: { flex: 1, fontSize: 12, color: '#1A5276', lineHeight: 16 },

  empty:       { alignItems: 'center', paddingVertical: 50 },
  emptyIcon:   { fontSize: 52, marginBottom: 14 },
  emptyTitle:  { fontSize: 17, fontWeight: '700', color: COLORS.esp, marginBottom: 6 },
  emptySub:    { fontSize: 13, color: COLORS.wal, textAlign: 'center', marginBottom: 20, lineHeight: 18 },
  emptyBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.wal, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  emptyBtnText:{ fontSize: 13, fontWeight: '700', color: '#fff' },

  card:     { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.bg3 },
  cardTop:  { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  avatar:   { width: 50, height: 50, borderRadius: 25, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  memberName: { fontSize: 15, fontWeight: '700', color: COLORS.esp, marginBottom: 5 },
  metaRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  relBadge:   { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  relBadgeText:{ fontSize: 11, fontWeight: '700' },
  ageText:    { fontSize: 12, color: COLORS.wal },
  memberNotes:{ fontSize: 12, color: '#888', fontStyle: 'italic', lineHeight: 15 },
  cardActions:{ flexDirection: 'column', gap: 6 },
  actionIcon: { padding: 2 },

  bookBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F4ECE4', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.sand },
  bookBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.wal, flex: 1 },

  // Modal
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:        { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 44 },
  sheetHandle:  { width: 38, height: 4, borderRadius: 2, backgroundColor: COLORS.bg3, alignSelf: 'center', marginBottom: 20 },
  sheetTitle:   { fontSize: 18, fontWeight: '700', color: COLORS.esp, marginBottom: 18 },
  formLabel:    { fontSize: 9, letterSpacing: 1.5, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 },
  formInput:    { borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: COLORS.esp, backgroundColor: COLORS.bg2, marginBottom: 14 },
  relChip:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.bg3, backgroundColor: '#fff', flexShrink: 0 },
  relChipIcon:  { fontSize: 15 },
  relChipLabel: { fontSize: 13, fontWeight: '500', color: COLORS.wal, flexShrink: 0 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  modalCancel:  { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.bg3 },
  modalCancelText: { fontSize: 14, fontWeight: '600', color: COLORS.wal },
  modalSave:    { flex: 2, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: COLORS.wal, justifyContent: 'center' },
  modalSaveText:{ fontSize: 14, fontWeight: '700', color: '#fff' },
});
