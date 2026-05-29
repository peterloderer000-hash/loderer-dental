/**
 * Prílohy pacienta — doktor
 * Upload fotiek (RTG, pred/po, dokumenty) cez Supabase Storage
 */
import React, { useState, useCallback } from 'react';
import {
  ActivityIndicator, Alert, Image, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View } from 'react-native';
import {} from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';

type Attachment = {
  id: string;
  name: string;
  file_url: string;
  file_type: string;
  category: string;
  notes: string | null;
  size_bytes: number | null;
  created_at: string;
};

const ALL_CATS = [
  { key: 'all',      label: 'Všetko',    icon: '📎' },
  { key: 'xray',     label: 'RTG',       icon: '🩻' },
  { key: 'photo',    label: 'Fotky',     icon: '📸' },
  { key: 'document', label: 'Dokumenty', icon: '📄' },
  { key: 'general',  label: 'Ostatné',   icon: '🗂️' },
];

const CAT_CFG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  xray:     { label: 'RTG',      icon: '🩻', color: '#1A5276', bg: '#EBF5FB' },
  photo:    { label: 'Fotka',    icon: '📸', color: '#1E8449', bg: '#EAFAF1' },
  document: { label: 'Dokument', icon: '📄', color: '#7D3C98', bg: '#F5EEF8' },
  general:  { label: 'Príloha',  icon: '📎', color: '#784212', bg: '#FEF9E7' } };

export default function PatientAttachmentsScreen() {
  const router = useRouter();
  const { patientId, patientName } =
    useLocalSearchParams<{ patientId: string; patientName: string }>();
  const { colors, dark } = useAppTheme();

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab,  setActiveTab]  = useState('all');
  const [doctorId,   setDoctorId]   = useState<string | null>(null);

  // Upload form
  const [showForm,     setShowForm]     = useState(false);
  const [uploading,    setUploading]    = useState(false);
  const [formName,     setFormName]     = useState('');
  const [formCategory, setFormCategory] = useState('photo');
  const [formNotes,    setFormNotes]    = useState('');
  const [pendingUri,   setPendingUri]   = useState<string | null>(null);
  const [pendingB64,   setPendingB64]   = useState<string | null>(null);
  const [pendingMime,  setPendingMime]  = useState('image/jpeg');

  async function load() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setDoctorId(user.id);

      const { data } = await supabase
        .from('patient_attachments')
        .select('id, name, file_url, file_type, category, notes, size_bytes, created_at')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });

      setAttachments((data ?? []) as Attachment[]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { load(); }, [patientId]));

  // ── Picker ────────────────────────────────────────────────────────────────
  async function pickImage(fromCamera: boolean) {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Povolenie', 'Potrebujeme prístup k fotoaparátu / galérii.');
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.82 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', base64: true, quality: 0.82 });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPendingUri(asset.uri);
      setPendingB64(asset.base64 ?? null);
      setPendingMime(asset.mimeType ?? 'image/jpeg');
      const today = new Date().toLocaleDateString('sk-SK').replace(/\./g, '-');
      setFormName(`Fotka_${today}`);
      setFormCategory('photo');
      setFormNotes('');
      setShowForm(true);
    }
  }

  function openPicker() {
    Alert.alert('Pridať prílohu', 'Vyber zdroj', [
      { text: '📷  Odfotiť',   onPress: () => pickImage(true)  },
      { text: '🖼️  Z galérie', onPress: () => pickImage(false) },
      { text: 'Zrušiť', style: 'cancel' },
    ]);
  }

  function cancelForm() {
    setShowForm(false);
    setPendingUri(null); setPendingB64(null);
    setFormName(''); setFormNotes(''); setFormCategory('photo');
  }

  // ── Upload ────────────────────────────────────────────────────────────────
  async function handleUpload() {
    if (!patientId || !doctorId || !pendingB64) return;
    if (!formName.trim()) { Alert.alert('Chyba', 'Zadaj názov prílohy.'); return; }

    setUploading(true);
    try {
      // Base64 → Uint8Array
      const binary = atob(pendingB64);
      const bytes  = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const ext  = pendingMime.split('/')[1] ?? 'jpg';
      const path = `${patientId}/${Date.now()}.${ext}`;

      const { data: storageData, error: storageErr } = await supabase.storage
        .from('patient-attachments')
        .upload(path, bytes, { contentType: pendingMime, upsert: false });

      if (storageErr) {
        Alert.alert('Chyba uploadu', storageErr.message);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('patient-attachments')
        .getPublicUrl(storageData.path);

      const { error: dbErr } = await supabase.from('patient_attachments').insert({
        patient_id: patientId,
        doctor_id:  doctorId,
        name:       formName.trim(),
        file_url:   publicUrl,
        file_type:  'image',
        category:   formCategory,
        notes:      formNotes.trim() || null,
        size_bytes: bytes.length });

      if (dbErr) { Alert.alert('Chyba', dbErr.message); return; }

      cancelForm();
      await load();
    } catch (e: any) {
      Alert.alert('Chyba', e?.message ?? 'Upload zlyhal');
    } finally {
      setUploading(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  function handleDelete(att: Attachment) {
    Alert.alert('Vymazať prílohu', `Odstrániť „${att.name}"?`, [
      { text: 'Nie', style: 'cancel' },
      {
        text: 'Vymazať', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('patient_attachments').delete().eq('id', att.id);
          if (error) { Alert.alert('Chyba', error.message); return; }
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setAttachments(prev => prev.filter(a => a.id !== att.id));
        } },
    ]);
  }

  const filtered = activeTab === 'all'
    ? attachments
    : attachments.filter(a => a.category === activeTab);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg2, padding: SPACING.xl }}>
        <SkeletonList count={4} />
      </View>
    );
  }

  return (
    <View style={styles.safe}>

      <HeroHeader
        title={patientName}
        subtitle="Prílohy pacienta"
        icon="attach-outline"
        onBack={() => router.back()}
        rightAction={
          <TouchableOpacity style={styles.addBtn} onPress={openPicker} activeOpacity={0.85}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBtnText}>Pridať</Text>
          </TouchableOpacity>
        }
      />

      {/* ── Kategórie ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.tabsBar} contentContainerStyle={styles.tabsContent}>
        {ALL_CATS.map(c => {
          const cnt = c.key === 'all' ? attachments.length : attachments.filter(a => a.category === c.key).length;
          const active = activeTab === c.key;
          return (
            <TouchableOpacity key={c.key} style={[styles.tab, active && styles.tabActive]}
              onPress={() => setActiveTab(c.key)} activeOpacity={0.8}>
              <Text style={styles.tabIcon}>{c.icon}</Text>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{c.label}</Text>
              {cnt > 0 && (
                <View style={[styles.tabBadge, active && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, active && { color: '#fff' }]}>{cnt}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Upload form ── */}
      {showForm && (
        <View style={[styles.formCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
          {pendingUri && (
            <Image source={{ uri: pendingUri }} style={styles.previewImg} resizeMode="cover" />
          )}
          <TextInput style={[styles.formInput, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]} value={formName} onChangeText={setFormName}
            placeholder="Názov prílohy *" placeholderTextColor={dark ? '#666' : '#bbb'} />

          {/* Kategória */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {Object.entries(CAT_CFG).map(([key, cfg]) => (
                <TouchableOpacity key={key} activeOpacity={0.8}
                  style={[styles.catChip, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, formCategory === key && { backgroundColor: cfg.bg, borderColor: cfg.color }]}
                  onPress={() => setFormCategory(key)}>
                  <Text style={styles.catChipIcon}>{cfg.icon}</Text>
                  <Text style={[styles.catChipLabel, formCategory === key && { color: cfg.color, fontWeight: '700' }]}>
                    {cfg.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <TextInput style={[styles.formInput, { minHeight: 54, textAlignVertical: 'top', backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
            value={formNotes} onChangeText={setFormNotes}
            placeholder="Poznámka (nepovinné)" placeholderTextColor={dark ? '#666' : '#bbb'} multiline />

          <View style={styles.formActions}>
            <TouchableOpacity style={[styles.formCancel, { borderColor: colors.bg3 }]} onPress={cancelForm} activeOpacity={0.8}>
              <Text style={[styles.formCancelText, { color: colors.textSecondary }]}>Zrušiť</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.formSave, uploading && { opacity: 0.5 }]}
              onPress={handleUpload} disabled={uploading} activeOpacity={0.85}>
              {uploading
                ? <ActivityIndicator color="#fff" size="small" />
                : <><Ionicons name="cloud-upload-outline" size={14} color="#fff" />
                    <Text style={styles.formSaveText}>Nahrať</Text></View>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Zoznam príloh ── */}
      <ScrollView style={[styles.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.wal} />}>

        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📂</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Žiadne prílohy</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Klepni „Pridať" a nahraj RTG, fotku alebo dokument</Text>
          </View>
        ) : (
          filtered.map(att => {
            const cat = CAT_CFG[att.category] ?? CAT_CFG.general;
            const d   = new Date(att.created_at);
            const kb  = att.size_bytes ? `${Math.round(att.size_bytes / 1024)} KB` : null;
            return (
              <View key={att.id} style={[styles.attCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                {att.file_type === 'image' ? (
                  <Image source={{ uri: att.file_url }} style={styles.attThumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.attThumb, { backgroundColor: cat.bg, alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ fontSize: 26 }}>{cat.icon}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.attName, { color: colors.textPrimary }]} numberOfLines={1}>{att.name}</Text>
                  <View style={styles.attMetaRow}>
                    <View style={[styles.catBadge, { backgroundColor: cat.bg }]}>
                      <Text style={[styles.catBadgeText, { color: cat.color }]}>{cat.icon} {cat.label}</Text>
                    </View>
                    <Text style={[styles.attDate, { color: colors.textSecondary }]}>
                      {d.toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                    {kb && <Text style={styles.attSize}>{kb}</Text>}
                  </View>
                  {att.notes ? (
                    <Text style={styles.attNotes} numberOfLines={2}>{att.notes}</Text>
                  ) : null}
                </View>
                <TouchableOpacity onPress={() => handleDelete(att)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ paddingLeft: 4 }}>
                  <Ionicons name="trash-outline" size={18} color="#E74C3C" />
                </TouchableOpacity>
              </View>
            );
          })
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },
  content:{ padding: SPACING.xl, paddingTop: 12 },
  center: { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center' },

  header:      { backgroundColor: COLORS.esp, paddingHorizontal: SPACING.xl, paddingTop: 14, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerSub:   { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  addBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.wal, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  addBtnText:  { fontSize: 13, fontWeight: '700', color: '#fff' },

  tabsBar:     { maxHeight: 48, backgroundColor: COLORS.esp },
  tabsContent: { paddingHorizontal: SPACING.xl, paddingBottom: 8, gap: 6, alignItems: 'center' },
  tab:         { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)' },
  tabActive:   { backgroundColor: COLORS.wal },
  tabIcon:     { fontSize: 12 },
  tabLabel:    { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  tabLabelActive: { color: '#fff' },
  tabBadge:    { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  tabBadgeActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  tabBadgeText:{ fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.7)' },

  formCard:    { backgroundColor: '#fff', margin: SPACING.xl, marginBottom: 0, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.bg3 },
  previewImg:  { width: '100%', height: 130, borderRadius: 10, marginBottom: 10 },
  formInput:   { borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: COLORS.esp, backgroundColor: COLORS.bg2, marginBottom: 8 },
  catChip:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.bg3, backgroundColor: '#fff' },
  catChipIcon: { fontSize: 13 },
  catChipLabel:{ fontSize: 11, color: COLORS.wal },
  formActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  formCancel:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.bg3 },
  formCancelText: { fontSize: 13, fontWeight: '600', color: COLORS.wal },
  formSave:    { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.wal },
  formSaveText:{ fontSize: 13, fontWeight: '700', color: '#fff' },

  empty:      { alignItems: 'center', paddingVertical: 60 },
  emptyIcon:  { fontSize: 46, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.esp, marginBottom: 6 },
  emptySub:   { fontSize: 12, color: COLORS.wal, textAlign: 'center', lineHeight: 18 },

  attCard:     { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: COLORS.bg3 },
  attThumb:    { width: 66, height: 66, borderRadius: 8, backgroundColor: COLORS.bg3 },
  attName:     { fontSize: 13, fontWeight: '700', color: COLORS.esp, marginBottom: 4 },
  attMetaRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 },
  catBadge:    { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  catBadgeText:{ fontSize: 9, fontWeight: '700' },
  attDate:     { fontSize: 10, color: COLORS.wal },
  attSize:     { fontSize: 10, color: '#bbb' },
  attNotes:    { fontSize: 10, color: '#888', fontStyle: 'italic', lineHeight: 14 } });
                                                                                                                                                                                                                                                                                                