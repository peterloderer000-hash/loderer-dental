/**
 * Prílohy pacienta — doktor
 * Fotogaléria s grid/list zobrazením, full-screen preview, pred/po porovnanie
 */
import React, { useState, useCallback, useRef } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, FlatList, Image, Modal,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View, PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown, FadeInRight } from 'react-native-reanimated';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { SkeletonList } from '../../components/Skeleton';
import { AnimatedListItem } from '../../components/ui/AnimatedListItem';
import { useAppTheme } from '../../context/ThemeContext';

const { width: SCREEN_W } = Dimensions.get('window');
const GRID_GAP = 4;
const GRID_COLS = 3;
const TILE_SIZE = (SCREEN_W - SPACING.xl * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

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
  general:  { label: 'Príloha',  icon: '📎', color: '#784212', bg: '#FEF9E7' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// FULL-SCREEN PREVIEW MODAL
// ═══════════════════════════════════════════════════════════════════════════════
function PreviewModal({
  visible, attachment, onClose, onDelete, dark, colors,
}: {
  visible: boolean;
  attachment: Attachment | null;
  onClose: () => void;
  onDelete: (a: Attachment) => void;
  dark: boolean;
  colors: any;
}) {
  if (!attachment) return null;
  const cat = CAT_CFG[attachment.category] ?? CAT_CFG.general;
  const d = new Date(attachment.created_at);

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <View style={ms.backdrop}>
        {/* Close */}
        <TouchableOpacity style={ms.closeBtn} onPress={onClose} activeOpacity={0.8}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>

        {/* Image */}
        <Image
          source={{ uri: attachment.file_url }}
          style={ms.fullImage}
          resizeMode="contain"
        />

        {/* Info bar */}
        <View style={ms.infoBar}>
          <Text style={ms.infoName} numberOfLines={1}>{attachment.name}</Text>
          <View style={ms.infoRow}>
            <View style={[ms.infoCatBadge, { backgroundColor: cat.bg }]}>
              <Text style={[ms.infoCatText, { color: cat.color }]}>{cat.icon} {cat.label}</Text>
            </View>
            <Text style={ms.infoDate}>
              {d.toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
          </View>
          {attachment.notes ? (
            <Text style={ms.infoNotes} numberOfLines={2}>{attachment.notes}</Text>
          ) : null}

          {/* Delete */}
          <TouchableOpacity style={ms.deleteBtn} onPress={() => onDelete(attachment)} activeOpacity={0.8}>
            <Ionicons name="trash-outline" size={16} color="#E74C3C" />
            <Text style={ms.deleteBtnText}>Vymazať</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BEFORE/AFTER COMPARISON MODAL
// ═══════════════════════════════════════════════════════════════════════════════
function CompareModal({
  visible, images, onClose, dark, colors,
}: {
  visible: boolean;
  images: { before: Attachment | null; after: Attachment | null };
  onClose: () => void;
  dark: boolean;
  colors: any;
}) {
  const [sliderX, setSliderX] = useState(SCREEN_W / 2);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gs) => {
        const x = Math.max(20, Math.min(SCREEN_W - 20, gs.moveX));
        setSliderX(x);
      },
    })
  ).current;

  if (!images.before || !images.after) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <View style={cs.backdrop}>
        {/* Header */}
        <View style={cs.header}>
          <Text style={cs.headerTitle}>Pred / Po porovnanie</Text>
          <TouchableOpacity onPress={onClose} style={cs.closeBtn} activeOpacity={0.8}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Comparison area */}
        <View style={cs.compareArea} {...panResponder.panHandlers}>
          {/* After image (full width, behind) */}
          <Image source={{ uri: images.after.file_url }} style={cs.fullImg} resizeMode="cover" />

          {/* Before image (clipped) */}
          <View style={[cs.beforeClip, { width: sliderX }]}>
            <Image source={{ uri: images.before.file_url }} style={[cs.fullImg, { width: SCREEN_W }]} resizeMode="cover" />
          </View>

          {/* Slider line */}
          <View style={[cs.sliderLine, { left: sliderX }]}>
            <View style={cs.sliderHandle}>
              <Ionicons name="swap-horizontal" size={16} color="#fff" />
            </View>
          </View>

          {/* Labels */}
          <View style={cs.labelLeft}>
            <Text style={cs.labelText}>PRED</Text>
          </View>
          <View style={cs.labelRight}>
            <Text style={cs.labelText}>PO</Text>
          </View>
        </View>

        {/* Info */}
        <View style={cs.footer}>
          <View style={cs.footerItem}>
            <Text style={cs.footerLabel}>Pred</Text>
            <Text style={cs.footerName} numberOfLines={1}>{images.before.name}</Text>
            <Text style={cs.footerDate}>
              {new Date(images.before.created_at).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          </View>
          <View style={cs.footerDivider} />
          <View style={cs.footerItem}>
            <Text style={cs.footerLabel}>Po</Text>
            <Text style={cs.footerName} numberOfLines={1}>{images.after.name}</Text>
            <Text style={cs.footerDate}>
              {new Date(images.after.created_at).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
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
  const [viewMode,   setViewMode]   = useState<'grid' | 'list'>('grid');

  // Upload form
  const [showForm,     setShowForm]     = useState(false);
  const [uploading,    setUploading]    = useState(false);
  const [formName,     setFormName]     = useState('');
  const [formCategory, setFormCategory] = useState('photo');
  const [formNotes,    setFormNotes]    = useState('');
  const [pendingUri,   setPendingUri]   = useState<string | null>(null);
  const [pendingB64,   setPendingB64]   = useState<string | null>(null);
  const [pendingMime,  setPendingMime]  = useState('image/jpeg');

  // Preview modal
  const [previewAtt, setPreviewAtt] = useState<Attachment | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Compare modal
  const [compareMode,   setCompareMode]   = useState(false);
  const [compareSelect, setCompareSelect] = useState<Attachment[]>([]);
  const [showCompare,   setShowCompare]   = useState(false);

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

  // ── Picker ──────────────────────────────────────────────────────────────────
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

  // ── Upload ──────────────────────────────────────────────────────────────────
  async function handleUpload() {
    if (!patientId || !doctorId || !pendingB64) return;
    if (!formName.trim()) { Alert.alert('Chyba', 'Zadaj názov prílohy.'); return; }

    setUploading(true);
    try {
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
        size_bytes: bytes.length,
      });

      if (dbErr) { Alert.alert('Chyba', dbErr.message); return; }

      cancelForm();
      await load();
    } catch (e: any) {
      Alert.alert('Chyba', e?.message ?? 'Upload zlyhal');
    } finally {
      setUploading(false);
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  function handleDelete(att: Attachment) {
    Alert.alert('Vymazať prílohu', `Odstrániť „${att.name}"?`, [
      { text: 'Nie', style: 'cancel' },
      {
        text: 'Vymazať', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('patient_attachments').delete().eq('id', att.id);
          if (error) { Alert.alert('Chyba', error.message); return; }
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setAttachments(prev => prev.filter(a => a.id !== att.id));
          if (showPreview) { setShowPreview(false); setPreviewAtt(null); }
        },
      },
    ]);
  }

  // ── Compare ─────────────────────────────────────────────────────────────────
  function toggleCompareMode() {
    if (compareMode) {
      setCompareMode(false);
      setCompareSelect([]);
    } else {
      setCompareMode(true);
      setCompareSelect([]);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }

  function handleCompareSelect(att: Attachment) {
    if (att.file_type !== 'image') return;
    const already = compareSelect.find(a => a.id === att.id);
    if (already) {
      setCompareSelect(prev => prev.filter(a => a.id !== att.id));
    } else if (compareSelect.length < 2) {
      const next = [...compareSelect, att];
      setCompareSelect(next);
      if (next.length === 2) {
        // Sort by date — older is "before"
        const sorted = [...next].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        setShowCompare(true);
        setCompareMode(false);
      }
    }
  }

  // ── Preview ─────────────────────────────────────────────────────────────────
  function openPreview(att: Attachment) {
    if (att.file_type !== 'image') return;
    setPreviewAtt(att);
    setShowPreview(true);
  }

  const filtered = activeTab === 'all'
    ? attachments
    : attachments.filter(a => a.category === activeTab);

  const imageCount = attachments.filter(a => a.file_type === 'image').length;

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
        subtitle={`${attachments.length} príloh`}
        icon="images-outline"
        onBack={() => router.back()}
        rightAction={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {imageCount >= 2 && (
              <TouchableOpacity
                style={[styles.compareBtn, compareMode && styles.compareBtnActive]}
                onPress={toggleCompareMode}
                activeOpacity={0.85}
              >
                <Ionicons name="git-compare-outline" size={16} color="#fff" />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.addBtn} onPress={openPicker} activeOpacity={0.85}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.addBtnText}>Pridať</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* ── Tabs + view toggle ── */}
      <View style={styles.controlsRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ flex: 1 }} contentContainerStyle={styles.tabsContent}>
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
        {/* View toggle */}
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.viewBtn, viewMode === 'grid' && styles.viewBtnActive]}
            onPress={() => setViewMode('grid')} activeOpacity={0.8}
          >
            <Ionicons name