/**
 * Moje fotky — pacient
 * Prezeranie fotiek nahraných doktorom + upload vlastných selfies
 */
import React, { useState, useCallback, useRef } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, Image, Modal,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View, PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
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
];

const CAT_CFG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  xray:     { label: 'RTG',      icon: '🩻', color: '#1A5276', bg: '#EBF5FB' },
  photo:    { label: 'Fotka',    icon: '📸', color: '#1E8449', bg: '#EAFAF1' },
  document: { label: 'Dokument', icon: '📄', color: '#7D3C98', bg: '#F5EEF8' },
  general:  { label: 'Príloha',  icon: '📎', color: '#784212', bg: '#FEF9E7' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// FULL-SCREEN PREVIEW
// ═══════════════════════════════════════════════════════════════════════════════
function PreviewModal({
  visible, attachment, onClose,
}: {
  visible: boolean;
  attachment: Attachment | null;
  onClose: () => void;
}) {
  if (!attachment) return null;
  const cat = CAT_CFG[attachment.category] ?? CAT_CFG.general;
  const d = new Date(attachment.created_at);

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <View style={ms.backdrop}>
        <TouchableOpacity style={ms.closeBtn} onPress={onClose} activeOpacity={0.8}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>

        <Image
          source={{ uri: attachment.file_url }}
          style={ms.fullImage}
          resizeMode="contain"
        />

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
            <Text style={ms.infoNotes} numberOfLines={3}>{attachment.notes}</Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BEFORE/AFTER COMPARISON
// ═══════════════════════════════════════════════════════════════════════════════
function CompareModal({
  visible, images, onClose,
}: {
  visible: boolean;
  images: { before: Attachment | null; after: Attachment | null };
  onClose: () => void;
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
      <View style={cStyles.backdrop}>
        <View style={cStyles.header}>
          <Text style={cStyles.headerTitle}>Pred / Po porovnanie</Text>
          <TouchableOpacity onPress={onClose} style={cStyles.closeBtn} activeOpacity={0.8}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={cStyles.compareArea} {...panResponder.panHandlers}>
          <Image source={{ uri: images.after.file_url }} style={cStyles.fullImg} resizeMode="cover" />
          <View style={[cStyles.beforeClip, { width: sliderX }]}>
            <Image source={{ uri: images.before.file_url }} style={[cStyles.fullImg, { width: SCREEN_W }]} resizeMode="cover" />
          </View>
          <View style={[cStyles.sliderLine, { left: sliderX }]}>
            <View style={cStyles.sliderHandle}>
              <Ionicons name="swap-horizontal" size={16} color="#fff" />
            </View>
          </View>
          <View style={cStyles.labelLeft}>
            <Text style={cStyles.labelText}>PRED</Text>
          </View>
          <View style={cStyles.labelRight}>
            <Text style={cStyles.labelText}>PO</Text>
          </View>
        </View>

        <View style={cStyles.footer}>
          <View style={cStyles.footerItem}>
            <Text style={cStyles.footerLabel}>Pred</Text>
            <Text style={cStyles.footerName} numberOfLines={1}>{images.before.name}</Text>
            <Text style={cStyles.footerDate}>
              {new Date(images.before.created_at).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          </View>
          <View style={cStyles.footerDivider} />
          <View style={cStyles.footerItem}>
            <Text style={cStyles.footerLabel}>Po</Text>
            <Text style={cStyles.footerName} numberOfLines={1}>{images.after.name}</Text>
            <Text style={cStyles.footerDate}>
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
export default function MyPhotosScreen() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab,  setActiveTab]  = useState('all');
  const [viewMode,   setViewMode]   = useState<'grid' | 'list'>('grid');

  // Upload
  const [uploading,   setUploading]   = useState(false);
  const [showUpload,  setShowUpload]  = useState(false);
  const [pendingUri,  setPendingUri]  = useState<string | null>(null);
  const [pendingB64,  setPendingB64]  = useState<string | null>(null);
  const [pendingMime, setPendingMime] = useState('image/jpeg');
  const [formName,    setFormName]    = useState('');
  const [formNotes,   setFormNotes]   = useState('');

  // Preview
  const [previewAtt, setPreviewAtt] = useState<Attachment | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Compare
  const [compareMode,   setCompareMode]   = useState(false);
  const [compareSelect, setCompareSelect] = useState<Attachment[]>([]);
  const [showCompare,   setShowCompare]   = useState(false);

  async function load() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('patient_attachments')
        .select('id, name, file_url, file_type, category, notes, size_bytes, created_at')
        .eq('patient_id', user.id)
        .order('created_at', { ascending: false });

      setAttachments((data ?? []) as Attachment[]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  // ── Upload selfie ───────────────────────────────────────────────────────────
  async function pickSelfie(fromCamera: boolean) {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Povolenie', 'Potrebujeme prístup k fotoaparátu / galérii.');
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.82, cameraType: ImagePicker.CameraType.front })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', base64: true, quality: 0.82 });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPendingUri(asset.uri);
      setPendingB64(asset.base64 ?? null);
      setPendingMime(asset.mimeType ?? 'image/jpeg');
      const today = new Date().toLocaleDateString('sk-SK').replace(/\./g, '-');
      setFormName(`Selfie_${today}`);
      setFormNotes('');
      setShowUpload(true);
    }
  }

  function openPicker() {
    Alert.alert('Nahrať fotku', 'Vyber zdroj', [
      { text: '🤳  Selfie',     onPress: () => pickSelfie(true)  },
      { text: '🖼️  Z galérie',  onPress: () => pickSelfie(false) },
      { text: 'Zrušiť', style: 'cancel' },
    ]);
  }

  async function handleUpload() {
    if (!pendingB64) return;
    if (!formName.trim()) { Alert.alert('Chyba', 'Zadaj názov fotky.'); return; }

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const binary = atob(pendingB64);
      const bytes  = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const ext  = pendingMime.split('/')[1] ?? 'jpg';
      const path = `${user.id}/${Date.now()}.${ext}`;

      const { data: storageData, error: storageErr } = await supabase.storage
        .from('patient-attachments')
        .upload(path, bytes, { contentType: pendingMime, upsert: false });

      if (storageErr) { Alert.alert('Chyba uploadu', storageErr.message); return; }

      const { data: { publicUrl } } = supabase.storage
        .from('patient-attachments')
        .getPublicUrl(storageData.path);

      const { error: dbErr } = await supabase.from('patient_attachments').insert({
        patient_id: user.id,
        doctor_id:  user.id,
        name:       formName.trim(),
        file_url:   publicUrl,
        file_type:  'image',
        category:   'photo',
        notes:      formNotes.trim() || null,
        size_bytes: bytes.length,
      });

      if (dbErr) { Alert.alert('Chyba', dbErr.message); return; }

      setShowUpload(false);
      setPendingUri(null); setPendingB64(null);
      setFormName(''); setFormNotes('');
      await load();
    } catch (e: any) {
      Alert.alert('Chyba', e?.message ?? 'Upload zlyhal');
    } finally {
      setUploading(false);
    }
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
        const sorted = [...next].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        setCompareSelect(sorted);
        setShowCompare(true);
        setCompareMode(false);
      }
    }
  }

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
        title="Moje fotky"
        subtitle={`${attachments.length} súborov`}
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
              <Ionicons name="camera-outline" size={18} color="#fff" />
              <Text style={styles.addBtnText}>Nahrať</Text>
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
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.viewBtn, viewMode === 'grid' && styles.viewBtnActive]}
            onPress={() => setViewMode('grid')} activeOpacity={0.8}
          >
            <Ionicons name="grid-outline" size={15} color={viewMode === 'grid' ? '#fff' : 'rgba(255,255,255,0.5)'} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewBtn, viewMode === 'list' && styles.viewBtnActive]}
            onPress={() => setViewMode('list')} activeOpacity={0.8}
          >
            <Ionicons name="list-outline" size={15} color={viewMode === 'list' ? '#fff' : 'rgba(255,255,255,0.5)'} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Compare banner ── */}
      {compareMode && (
        <Animated.View entering={FadeInDown.duration(200)} style={[styles.compareBanner, { backgroundColor: dark ? '#1E1610' : COLORS.gold }]}>
          <Ionicons name="git-compare-outline" size={16} color="#fff" />
          <Text style={styles.compareBannerText}>
            Vyber 2 fotky na porovnanie ({compareSelect.length}/2)
          </Text>
          <TouchableOpacity onPress={toggleCompareMode}>
            <Text style={styles.compareBannerCancel}>Zrušiť</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Upload form ── */}
      {showUpload && (
        <View style={[styles.formCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
          {pendingUri && (
            <Image source={{ uri: pendingUri }} style={styles.previewImg} resizeMode="cover" />
          )}
          <TextInput
            style={[styles.formInput, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
            value={formName} onChangeText={setFormName}
            placeholder="Názov fotky *" placeholderTextColor={dark ? '#666' : '#bbb'}
          />
          <TextInput
            style={[styles.formInput, { minHeight: 54, textAlignVertical: 'top', backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
            value={formNotes} onChangeText={setFormNotes}
            placeholder="Poznámka (nepovinné)" placeholderTextColor={dark ? '#666' : '#bbb'} multiline
          />
          <View style={styles.formActions}>
            <TouchableOpacity
              style={[styles.formCancel, { borderColor: colors.bg3 }]}
              onPress={() => { setShowUpload(false); setPendingUri(null); setPendingB64(null); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.formCancelText, { color: colors.textSecondary }]}>Zrušiť</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.formSave, uploading && { opacity: 0.5 }]}
              onPress={handleUpload} disabled={uploading} activeOpacity={0.85}>
              {uploading
                ? <ActivityIndicator color="#fff" size="small" />
                : <><Ionicons name="cloud-upload-outline" size={14} color="#fff" />
                    <Text style={styles.formSaveText}>Nahrať</Text></>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Content ── */}
      <ScrollView
        style={[styles.scroll, { backgroundColor: colors.bg2 }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.wal} />}
      >
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📷</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Zatiaľ žiadne fotky</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              Váš zubár sem nahrá RTG snímky a fotky z ošetrení. Môžete pridať aj vlastné selfie.
            </Text>
          </View>
        ) : viewMode === 'grid' ? (
          <View style={styles.grid}>
            {filtered.map((att, idx) => {
              const cat = CAT_CFG[att.category] ?? CAT_CFG.general;
              const isSelected = compareSelect.find(a => a.id === att.id);
              return (
                <AnimatedListItem key={att.id} index={idx}>
                  <TouchableOpacity
                    style={[styles.gridTile, isSelected && styles.gridTileSelected]}
                    onPress={() => compareMode ? handleCompareSelect(att) : openPreview(att)}
                    activeOpacity={0.85}
                  >
                    {att.file_type === 'image' ? (
                      <Image source={{ uri: att.file_url }} style={styles.gridImage} resizeMode="cover" />
                    ) : (
                      <View style={[styles.gridImage, { backgroundColor: cat.bg, alignItems: 'center', justifyContent: 'center' }]}>
                        <Text style={{ fontSize: 30 }}>{cat.icon}</Text>
                      </View>
                    )}
                    <View style={[styles.gridCatBadge, { backgroundColor: cat.bg }]}>
                      <Text style={{ fontSize: 9 }}>{cat.icon}</Text>
                    </View>
                    {compareMode && att.file_type === 'image' && (
                      <View style={[styles.gridCheckbox, isSelected && styles.gridCheckboxActive]}>
                        {isSelected && <Ionicons name="checkmark" size={12} color="#fff" />}
                      </View>
                    )}
                    <View style={styles.gridNameOverlay}>
                      <Text style={styles.gridName} numberOfLines={1}>{att.name}</Text>
                    </View>
                  </TouchableOpacity>
                </AnimatedListItem>
              );
            })}
          </View>
        ) : (
          filtered.map((att, idx) => {
            const cat = CAT_CFG[att.category] ?? CAT_CFG.general;
            const d   = new Date(att.created_at);
            const kb  = att.size_bytes ? `${Math.round(att.size_bytes / 1024)} KB` : null;
            const isSelected = compareSelect.find(a => a.id === att.id);
            return (
              <AnimatedListItem key={att.id} index={idx}>
                <TouchableOpacity
                  style={[styles.attCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, isSelected && styles.attCardSelected]}
                  onPress={() => compareMode ? handleCompareSelect(att) : openPreview(att)}
                  activeOpacity={0.85}
                >
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
                  {compareMode && att.file_type === 'image' && (
                    <View style={[styles.listCheckbox, isSelected && styles.listCheckboxActive]}>
                      {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                  )}
                </TouchableOpacity>
              </AnimatedListItem>
            );
          })
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Modals ── */}
      <PreviewModal
        visible={showPreview}
        attachment={previewAtt}
        onClose={() => { setShowPreview(false); setPreviewAtt(null); }}
      />

      <CompareModal
        visible={showCompare}
        images={{ before: compareSelect[0] ?? null, after: compareSelect[1] ?? null }}
        onClose={() => { setShowCompare(false); setCompareSelect([]); }}
      />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const ms = StyleSheet.create({
  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  closeBtn:   { position: 'absolute', top: 54, right: 20, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  fullImage:  { width: '100%', height: '60%' },
  infoBar:    { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.8)', padding: 20, paddingBottom: 40 },
  infoName:   { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 8 },
  infoRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  infoCatBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  infoCatText:  { fontSize: 11, fontWeight: '700' },
  infoDate:   { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  infoNotes:  { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic', marginTop: 4 },
});

const cStyles = StyleSheet.create({
  backdrop:   { flex: 1, backgroundColor: '#000' },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 54, paddingBottom: 14 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  closeBtn:   { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  compareArea: { flex: 1, position: 'relative', overflow: 'hidden' },
  fullImg:    { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  beforeClip: { position: 'absolute', top: 0, left: 0, height: '100%', overflow: 'hidden' },
  sliderLine: { position: 'absolute', top: 0, bottom: 0, width: 3, backgroundColor: '#fff', marginLeft: -1.5 },
  sliderHandle: { position: 'absolute', top: '50%', marginTop: -18, left: -15, width: 33, height: 36, borderRadius: 18, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center' },
  labelLeft:  { position: 'absolute', top: 16, left: 16, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  labelRight: { position: 'absolute', top: 16, right: 16, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  labelText:  { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  footer:     { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 16, paddingBottom: 40, gap: 12 },
  footerItem: { flex: 1 },
  footerLabel: { fontSize: 10, fontWeight: '700', color: COLORS.gold, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  footerName:  { fontSize: 13, fontWeight: '600', color: '#fff', marginBottom: 2 },
  footerDate:  { fontSize: 11, color: 'rgba(255,255,255,0.5)' },
  footerDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
});

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1 },
  content:{ padding: SPACING.xl, paddingTop: 12 },

  addBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.wal, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  addBtnText:  { fontSize: 13, fontWeight: '700', color: '#fff' },
  compareBtn:  { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  compareBtnActive: { backgroundColor: COLORS.gold },

  controlsRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.esp, paddingRight: 12 },
  tabsContent: { paddingHorizontal: SPACING.xl, paddingVertical: 8, gap: 6, alignItems: 'center' },
  tab:         { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)' },
  tabActive:   { backgroundColor: COLORS.wal },
  tabIcon:     { fontSize: 12 },
  tabLabel:    { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  tabLabelActive: { color: '#fff' },
  tabBadge:    { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  tabBadgeActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  tabBadgeText:{ fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.7)' },

  viewToggle:  { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: 2 },
  viewBtn:     { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6 },
  viewBtnActive: { backgroundColor: COLORS.wal },

  compareBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: SPACING.xl, paddingVertical: 10 },
  compareBannerText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#fff' },
  compareBannerCancel: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },

  formCard:    { margin: SPACING.xl, marginBottom: 0, borderRadius: 14, padding: 14, borderWidth: 1 },
  previewImg:  { width: '100%', height: 130, borderRadius: 10, marginBottom: 10 },
  formInput:   { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, marginBottom: 8 },
  formActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  formCancel:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1.5 },
  formCancelText: { fontSize: 13, fontWeight: '600' },
  formSave:    { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.wal },
  formSaveText:{ fontSize: 13, fontWeight: '700', color: '#fff' },

  empty:      { alignItems: 'center', paddingVertical: 60 },
  emptyIcon:  { fontSize: 46, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  emptySub:   { fontSize: 12, textAlign: 'center', lineHeight: 18, paddingHorizontal: 20 },

  grid:          { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  gridTile:      { width: TILE_SIZE, height: TILE_SIZE, borderRadius: RADII.md, overflow: 'hidden', position: 'relative' },
  gridTileSelected: { borderWidth: 3, borderColor: COLORS.gold },
  gridImage:     { width: '100%', height: '100%' },
  gridCatBadge:  { position: 'absolute', top: 5, left: 5, borderRadius: 6, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  gridNameOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 6, paddingVertical: 4 },
  gridName:      { fontSize: 9, fontWeight: '600', color: '#fff' },
  gridCheckbox:  { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#fff', backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  gridCheckboxActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },

  attCard:       { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, padding: 10, marginBottom: 8, borderWidth: 1 },
  attCardSelected: { borderColor: COLORS.gold, borderWidth: 2 },
  attThumb:      { width: 66, height: 66, borderRadius: 8, backgroundColor: COLORS.cream },
  attName:       { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  attMetaRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 },
  catBadge:      { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  catBadgeText:  { fontSize: 9, fontWeight: '700' },
  attDate:       { fontSize: 10 },
  attSize:       { fontSize: 10, color: '#bbb' },
  attName:       { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  attMetaRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 },
  catBadge:      { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  catBadgeText:  { fontSize: 9, fontWeight: '700' },
  attDate:       { fontSize: 10 },
  attSize:       { fontSize: 10, color: '#bbb' },
  attNotes:      { fontSize: 10, color: '#888', fontStyle: 'italic', lineHeight: 14 },
  listCheckbox:  { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: COLORS.sand, alignItems: 'center', justifyContent: 'center' },
  listCheckboxActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
});
