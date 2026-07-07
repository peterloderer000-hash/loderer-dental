/**
 * Rodinné profily — pacient (Premium V2)
 * Správa rodinných príslušníkov + rezervácia termínov za nich
 */
import React, { useState, useCallback } from 'react';
import {
  ActivityIndicator, Alert, Modal, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../supabase';
import { COLORS, RADII, SPACING, GRADIENTS } from '../../styles/theme';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';
import HeroHeader from '../../components/ui/HeroHeader';
import AppCard from '../../components/ui/AppCard';

// ─── Types ────────────────────────────────────────────────────────────────────
type FamilyMember = {
  id: string;
  full_name: string;
  date_of_birth: string | null;
  relationship: string;
  notes: string | null;
};

const RELATIONSHIPS = ['dieťa', 'manžel/ka', 'rodič', 'súrodenec', 'iné'] as const;

const REL_CFG: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string; darkBg: string }> = {
  'dieťa':     { icon: 'happy-outline',  color: '#1A5276', bg: '#EBF5FB', darkBg: '#0D2233' },
  'manžel/ka': { icon: 'heart-outline',  color: '#7D3C98', bg: '#F5EEF8', darkBg: '#2A1040' },
  'rodič':     { icon: 'people-outline', color: '#B87333', bg: '#FDF3E7', darkBg: '#2D2000' },
  'súrodenec': { icon: 'person-outline', color: '#2E7D5E', bg: '#EDF7F3', darkBg: '#1A3D2E' },
  'iné':       { icon: 'person-outline', color: COLORS.wal, bg: '#D0D4DC', darkBg: '#1E1610' },
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

// ─── MemberCard ──────────────────────────────────────────────────────────────
const MemberCard = React.memo(function MemberCard({
  member, dark, colors, onEdit, onDelete, onBook,
}: {
  member: FamilyMember; dark: boolean; colors: any;
  onEdit: () => void; onDelete: () => void; onBook: () => void;
}) {
  const cfg = REL_CFG[member.relationship] ?? REL_CFG['iné'];
  const age = calcAge(member.date_of_birth);
  const initials = member.full_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <AppCard style={st.card} shadow="sm">
      <View style={st.cardTop}>
        {/* Avatar */}
        <View style={[st.avatar, { backgroundColor: dark ? cfg.darkBg : cfg.bg }]}>
          <Ionicons name={cfg.icon} size={24} color={cfg.color} />
        </View>

        {/* Info */}
        <View style={{ flex: 1 }}>
          <Text style={[st.memberName, { color: colors.textPrimary }]}>{member.full_name}</Text>
          <View style={st.metaRow}>
            <View style={[st.relBadge, { backgroundColor: dark ? cfg.darkBg : cfg.bg }]}>
              <Text style={[st.relBadgeText, { color: cfg.color }]}>{member.relationship}</Text>
            </View>
            {age !== null && (
              <Text style={[st.ageText, { color: colors.textSecondary }]}>{age} rokov</Text>
            )}
          </View>
          {member.notes ? (
            <Text style={[st.memberNotes, { color: colors.textSecondary }]} numberOfLines={2}>{member.notes}</Text>
          ) : null}
        </View>

        {/* Actions */}
        <View style={st.cardActions}>
          <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={[st.actionIcon, { backgroundColor: dark ? '#1E1610' : COLORS.bg2 }]}>
            <Ionicons name="create-outline" size={16} color={COLORS.gold} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={[st.actionIcon, { backgroundColor: dark ? '#3A0E0E' : '#FDEDEC' }]}>
            <Ionicons name="trash-outline" size={16} color="#C0392B" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Book button */}
      <TouchableOpacity style={[st.bookBtn, { borderColor: dark ? '#2A1F15' : COLORS.sand, backgroundColor: dark ? '#1E1610' : '#D0D4DC' }]} onPress={onBook} activeOpacity={0.85}>
        <Ionicons name="calendar-outline" size={14} color={COLORS.gold} />
        <Text style={[st.bookBtnText, { color: dark ? COLORS.sand : COLORS.wal }]}>Rezervovať termín</Text>
        <Ionicons name="chevron-forward" size={13} color={COLORS.sand} style={{ marginLeft: 'auto' }} />
      </TouchableOpacity>
    </AppCard>
  );
});

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function FamilyScreen() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function openEdit(m: FamilyMember) {
    setEditing(m);
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
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowModal(false);
    load();
  }

  function handleDelete(m: FamilyMember) {
    Alert.alert('Odstrániť', `Odstrániť ${m.full_name} z rodinných profilov?`, [
      { text: 'Nie', style: 'cancel' },
      { text: 'Áno, odstrániť', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('family_members').delete().eq('id', m.id);
        if (error) { Alert.alert('Chyba', error.message); return; }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setMembers(prev => prev.filter(x => x.id !== m.id));
      }},
    ]);
  }

  return (
    <View style={[st.safe, { backgroundColor: dark ? '#0A0806' : colors.bg2 }]}>
      <HeroHeader
        title="Rodinné profily"
        subtitle={members.length > 0 ? `${members.length} rodinných príslušníkov` : 'Správa rodinných profilov'}
        icon="people-outline"
        onBack={() => router.back()}
        rightAction={
          <TouchableOpacity style={st.addBtn} onPress={openAdd} activeOpacity={0.85}>
            <LinearGradient colors={[COLORS.goldDark, COLORS.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.addBtnGrad}>
              <Ionicons name="add" size={16} color="#1A1209" />
              <Text style={st.addBtnText}>Pridať</Text>
            </LinearGradient>
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={st.scroll}
        contentContainerStyle={{ paddingTop: SPACING.lg, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.gold} />}
      >
        {/* Info banner */}
        <View style={[st.infoBanner, { backgroundColor: dark ? '#1E1610' : '#D0D4DC', borderColor: dark ? '#2A1F15' : COLORS.sand }]}>
          <Ionicons name="information-circle-outline" size={15} color={COLORS.gold} />
          <Text style={[st.infoBannerText, { color: dark ? COLORS.sand : COLORS.wal }]}>
            Pridaj rodinných príslušníkov a rezervuj im termíny bez nutnosti vytvárať samostatné účty.
          </Text>
        </View>

        {loading ? (
          <View style={{ paddingHorizontal: SPACING.xl }}>
            <SkeletonList count={3} />
          </View>
        ) : members.length === 0 ? (
          <View style={st.empty}>
            <View style={[st.emptyCircle, { backgroundColor: dark ? '#1E1610' : COLORS.bg2 }]}>
              <Ionicons name="people-outline" size={44} color={COLORS.gold} />
            </View>
            <Text style={[st.emptyTitle, { color: colors.textPrimary }]}>Žiadni rodinní príslušníci</Text>
            <Text style={[st.emptySub, { color: colors.textSecondary }]}>
              Klepni „Pridať" a sprav profil pre dieťa alebo partnera
            </Text>
            <TouchableOpacity style={st.emptyActionBtn} onPress={openAdd} activeOpacity={0.85}>
              <LinearGradient colors={[COLORS.goldDark, COLORS.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.emptyActionGrad}>
                <Ionicons name="add-circle-outline" size={16} color="#1A1209" />
                <Text style={st.emptyActionText}>Pridať prvého člena</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          members.map(m => (
            <MemberCard
              key={m.id}
              member={m}
              dark={dark}
              colors={colors}
              onEdit={() => openEdit(m)}
              onDelete={() => handleDelete(m)}
              onBook={() => router.push({
                pathname: '/(patient)/book-appointment',
                params: { forFamily: '1', familyName: m.full_name, familyId: m.id },
              })}
            />
          ))
        )}
      </ScrollView>

      {/* ── Modal: Pridať / Upraviť ── */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={st.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowModal(false)} />
          <View style={[st.sheet, { backgroundColor: dark ? '#110E09' : colors.cardBg }]}>
            <View style={[st.sheetHandle, { backgroundColor: dark ? '#2A1F15' : colors.bg3 }]} />
            <Text style={[st.sheetTitle, { color: colors.textPrimary }]}>
              {editing ? 'Upraviť profil' : 'Pridať rodinného príslušníka'}
            </Text>

            {/* Meno */}
            <Text style={[st.formLabel, { color: colors.textSecondary }]}>CELÉ MENO *</Text>
            <TextInput
              style={[st.formInput, { backgroundColor: dark ? '#0A0806' : colors.bg2, color: colors.textPrimary, borderColor: dark ? '#2A1F15' : colors.bg3 }]}
              value={form.full_name}
              onChangeText={v => setForm(f => ({ ...f, full_name: v }))}
              placeholder="Meno a priezvisko"
              placeholderTextColor={dark ? '#B8ACA0' : '#B8ACA0'}
              autoCapitalize="words"
            />

            {/* Vzťah */}
            <Text style={[st.formLabel, { color: colors.textSecondary }]}>VZŤAH</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 8, flexShrink: 0 }}>
                {RELATIONSHIPS.map(r => {
                  const cfg = REL_CFG[r];
                  const active = form.relationship === r;
                  return (
                    <TouchableOpacity
                      key={r} activeOpacity={0.8}
                      style={[
                        st.relChip,
                        { backgroundColor: dark ? '#110E09' : colors.cardBg, borderColor: dark ? '#2A1F15' : colors.bg3 },
                        active && { backgroundColor: dark ? cfg.darkBg : cfg.bg, borderColor: cfg.color },
                      ]}
                      onPress={() => { setForm(f => ({ ...f, relationship: r })); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    >
                      <Ionicons name={cfg.icon} size={15} color={active ? cfg.color : colors.textSecondary} />
                      <Text style={[st.relChipLabel, { color: colors.textSecondary }, active && { color: cfg.color, fontWeight: '700' }]} numberOfLines={1}>
                        {r}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* Dátum narodenia */}
            <Text style={[st.formLabel, { color: colors.textSecondary }]}>DÁTUM NARODENIA</Text>
            <TextInput
              style={[st.formInput, { backgroundColor: dark ? '#0A0806' : colors.bg2, color: colors.textPrimary, borderColor: dark ? '#2A1F15' : colors.bg3 }]}
              value={form.date_of_birth}
              onChangeText={v => setForm(f => ({ ...f, date_of_birth: v }))}
              placeholder="DD.MM.RRRR"
              placeholderTextColor={dark ? '#B8ACA0' : '#B8ACA0'}
              keyboardType="numbers-and-punctuation"
              maxLength={10}
            />

            {/* Poznámka */}
            <Text style={[st.formLabel, { color: colors.textSecondary }]}>POZNÁMKA</Text>
            <TextInput
              style={[st.formInput, { minHeight: 60, textAlignVertical: 'top', backgroundColor: dark ? '#0A0806' : colors.bg2, color: colors.textPrimary, borderColor: dark ? '#2A1F15' : colors.bg3 }]}
              value={form.notes}
              onChangeText={v => setForm(f => ({ ...f, notes: v }))}
              placeholder="Alergie, špeciálne potreby..."
              placeholderTextColor={dark ? '#B8ACA0' : '#B8ACA0'}
              multiline
            />

            {/* Tlačidlá */}
            <View style={st.modalActions}>
              <TouchableOpacity
                style={[st.modalCancel, { borderColor: dark ? '#2A1F15' : colors.bg3 }]}
                onPress={() => setShowModal(false)} activeOpacity={0.8}
              >
                <Text style={[st.modalCancelText, { color: colors.textSecondary }]}>Zrušiť</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.modalSave, saving && { opacity: 0.5 }]}
                onPress={handleSave} disabled={saving} activeOpacity={0.85}
              >
                <LinearGradient colors={[COLORS.goldDark, COLORS.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.modalSaveGrad}>
                  {saving
                    ? <ActivityIndicator color="#1A1209" size="small" />
                    : <Text style={st.modalSaveText}>{editing ? 'Uložiť' : 'Pridať'}</Text>}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  safe:   { flex: 1 },
  scroll: { flex: 1 },

  // Add button
  addBtn:     { borderRadius: RADII.lg, overflow: 'hidden' },
  addBtnGrad: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADII.lg },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#1A1209' },

  // Info banner
  infoBanner:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: RADII.xl, padding: SPACING.md, borderWidth: 1, marginHorizontal: SPACING.xl, marginBottom: SPACING.lg },
  infoBannerText: { flex: 1, fontSize: 12, lineHeight: 17 },

  // Empty
  empty:          { alignItems: 'center', paddingVertical: 50 },
  emptyCircle:    { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle:     { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySub:       { fontSize: 13, textAlign: 'center', lineHeight: 20, maxWidth: 260, marginBottom: 20 },
  emptyActionBtn: { borderRadius: RADII.lg, overflow: 'hidden' },
  emptyActionGrad:{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 22, paddingVertical: 13, borderRadius: RADII.lg },
  emptyActionText:{ fontSize: 13, fontWeight: '700', color: '#1A1209' },

  // Card
  card:        { marginHorizontal: SPACING.xl, marginBottom: SPACING.md },
  cardTop:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  avatar:      { width: 48, height: 48, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  memberName:  { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  metaRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  relBadge:    { borderRadius: RADII.sm, paddingHorizontal: 8, paddingVertical: 3 },
  relBadgeText:{ fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  ageText:     { fontSize: 12 },
  memberNotes: { fontSize: 12, fontStyle: 'italic', lineHeight: 16 },
  cardActions: { flexDirection: 'column', gap: 8 },
  actionIcon:  { width: 32, height: 32, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },

  // Book button
  bookBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 4, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1 },
  bookBtnText: { fontSize: 13, fontWeight: '600', flex: 1 },

  // Modal
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:          { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 44 },
  sheetHandle:    { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle:     { fontSize: 18, fontWeight: '700', marginBottom: 18 },
  formLabel:      { fontSize: 9, letterSpacing: 1.5, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 },
  formInput:      { borderWidth: 1.5, borderRadius: 2, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, marginBottom: 14 },
  relChip:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 4, borderWidth: 1.5, flexShrink: 0 },
  relChipLabel:   { fontSize: 13, fontWeight: '500', flexShrink: 0 },
  modalActions:   { flexDirection: 'row', gap: 10, marginTop: 6 },
  modalCancel:    { flex: 1, paddingVertical: 13, borderRadius: 4, alignItems: 'center', borderWidth: 1.5 },
  modalCancelText:{ fontSize: 14, fontWeight: '600' },
  modalSave:      { flex: 2, borderRadius: 4, overflow: 'hidden' },
  modalSaveGrad:  { paddingVertical: 13, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  modalSaveText:  { fontSize: 14, fontWeight: '700', color: '#1A1209' },
});
