/**
 * Before/After galéria — doktor
 * Porovnanie fotiek pred a po zákroku so sliderom
 */
import React, { useState, useCallback, useRef } from 'react';
import {
  Alert, Dimensions, Image, Modal, PanResponder,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII, SHADOWS } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';

const { width: SCREEN_W } = Dimensions.get('window');
const IMG_W = SCREEN_W - SPACING.xl * 2;

type BeforeAfter = {
  id: string;
  patient_id: string;
  treatment_type: string;
  before_url: string;
  after_url: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
};

const TREATMENTS = [
  'Bielenie zubov', 'Veneers', 'Korunky', 'Implantáty',
  'Rovnátka', 'Výplne', 'Extrakcia', 'Profesionálna hygiena',
  'Chirurgia', 'Rekonštrukcia', 'Iné',
];

/* ── Slider komponent ────────────────────────────────────────────── */
function CompareSlider({ beforeUrl, afterUrl }: { beforeUrl: string; afterUrl: string }) {
  const [sliderPos, setSliderPos] = useState(0.5);
  const containerRef = useRef<View>(null);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { Haptics.selectionAsync(); },
      onPanResponderMove: (_, gestureState) => {
        containerRef.current?.measure((x, y, width) => {
          const pos = Math.max(0.05, Math.min(0.95, (gestureState.moveX - x) / width));
          setSliderPos(pos);
        });
      },
    })
  ).current;

  return (
    <View ref={containerRef} style={s.sliderContainer} {...panResponder.panHandlers}>
      {/* After (full) */}
      <Image source={{ uri: afterUrl }} style={s.sliderImage} resizeMode="cover" />

      {/* Before (clipped) */}
      <View style={[s.sliderClip, { width: `${sliderPos * 100}%` }]}>
        <Image source={{ uri: beforeUrl }} style={[s.sliderImage, { width: IMG_W }]} resizeMode="cover" />
      </View>

      {/* Divider line */}
      <View style={[s.sliderLine, { left: `${sliderPos * 100}%` }]}>
        <View style={s.sliderHandle}>
          <Ionicons name="swap-horizontal" size={16} color="#F5F6F8" />
        </View>
      </View>

      {/* Labels */}
      <View style={s.sliderLabels}>
        <View style={[s.sliderLabel, { backgroundColor: 'rgba(192,57,43,0.85)' }]}>
          <Text style={s.sliderLabelText}>PRED</Text>
        </View>
        <View style={[s.sliderLabel, { backgroundColor: 'rgba(46,125,94,0.85)' }]}>
          <Text style={s.sliderLabelText}>PO</Text>
        </View>
      </View>
    </View>
  );
}

/* ── Hlavný komponent ────────────────────────────────────────────── */
export default function BeforeAfterScreen() {
  const router = useRouter();
  const { patientId, patientName } = useLocalSearchParams<{ patientId: string; patientName: string }>();
  const { colors, dark } = useAppTheme();

  const [items, setItems] = useState<BeforeAfter[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [beforeUri, setBeforeUri] = useState<string | null>(null);
  const [afterUri, setAfterUri] = useState<string | null>(null);
  const [treatment, setTreatment] = useState('');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<BeforeAfter | null>(null);

  const loadData = useCallback(async () => {
    if (!patientId) { setLoading(false); return; }
    try {
      const { data } = await supabase
        .from('before_after_photos')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });
      setItems(data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  async function pickImage(type: 'before' | 'after') {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [4, 3],
    });
    if (!result.canceled && result.assets?.[0]) {
      if (type === 'before') setBeforeUri(result.assets[0].uri);
      else setAfterUri(result.assets[0].uri);
    }
  }

  async function uploadPhoto(uri: string, name: string): Promise<string | null> {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `before-after/${patientId}/${Date.now()}_${name}.${ext}`;
      const { error } = await supabase.storage.from('patient-attachments').upload(path, blob, { contentType: `image/${ext}` });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('patient-attachments').getPublicUrl(path);
      return urlData?.publicUrl ?? null;
    } catch (e) {
      console.error('Upload error:', e);
      return null;
    }
  }

  async function saveBeforeAfter() {
    if (!beforeUri || !afterUri || !treatment || !patientId) {
      Alert.alert('Chyba', 'Vyplňte všetky povinné polia.');
      return;
    }
    setUploading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const [beforeUrl, afterUrl] = await Promise.all([
        uploadPhoto(beforeUri, 'before'),
        uploadPhoto(afterUri, 'after'),
      ]);

      if (!beforeUrl || !afterUrl) {
        Alert.alert('Chyba', 'Nepodarilo sa nahrať fotky.');
        return;
      }

      await supabase.from('before_after_photos').insert({
        patient_id: patientId,
        treatment_type: treatment,
        before_url: beforeUrl,
        after_url: afterUrl,
        description: description || null,
        is_public: false,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowAdd(false);
      setBeforeUri(null); setAfterUri(null); setTreatment(''); setDescription('');
      loadData();
    } catch (e) {
      Alert.alert('Chyba', 'Nepodarilo sa uložiť.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <View style={[s.safe, { backgroundColor: colors.esp }]}>
      <HeroHeader
        title="Before / After"
        subtitle={patientName ?? 'Pacient'}
        icon="images-outline"
        onBack={() => router.back()}
      />

      <ScrollView style={[s.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}>

        {/* Add button */}
        <TouchableOpacity
          style={[s.addBtn, { backgroundColor: COLORS.gold }]}
          onPress={() => setShowAdd(true)} activeOpacity={0.85}
        >
          <Ionicons name="add-circle-outline" size={20} color="#F5F6F8" />
          <Text style={s.addBtnText}>Pridať porovnanie</Text>
        </TouchableOpacity>

        {loading ? <SkeletonList count={3} /> : items.length === 0 ? (
          <Animated.View entering={FadeInDown} style={[s.emptyCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Text style={{ fontSize: 48 }}>📸</Text>
            <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Žiadne porovnania</Text>
            <Text style={[s.emptySub, { color: colors.textSecondary }]}>
              Pridajte fotky pred a po zákroku pre vizuálne porovnanie.
            </Text>
          </Animated.View>
        ) : (
          items.map((item, i) => (
            <Animated.View key={item.id} entering={FadeInDown.delay(i * 100)}>
              <TouchableOpacity
                style={[s.itemCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}
                onPress={() => setSelectedItem(item)} activeOpacity={0.9}
              >
                <View style={s.itemHeader}>
                  <View style={[s.treatBadge, { backgroundColor: dark ? 'rgba(201,168,76,0.15)' : '#FDF3E7' }]}>
                    <Text style={[s.treatText, { color: COLORS.gold }]}>{item.treatment_type}</Text>
                  </View>
                  <Text style={[s.dateText, { color: colors.textSecondary }]}>
                    {new Date(item.created_at).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                </View>

                {/* Mini preview */}
                <View style={s.miniPreview}>
                  <View style={s.miniBox}>
                    <Image source={{ uri: item.before_url }} style={s.miniImg} resizeMode="cover" />
                    <View style={[s.miniLabel, { backgroundColor: 'rgba(192,57,43,0.85)' }]}>
                      <Text style={s.miniLabelText}>PRED</Text>
                    </View>
                  </View>
                  <Ionicons name="arrow-forward" size={20} color={COLORS.gold} />
                  <View style={s.miniBox}>
                    <Image source={{ uri: item.after_url }} style={s.miniImg} resizeMode="cover" />
                    <View style={[s.miniLabel, { backgroundColor: 'rgba(46,125,94,0.85)' }]}>
                      <Text style={s.miniLabelText}>PO</Text>
                    </View>
                  </View>
                </View>

                {item.description && (
                  <Text style={[s.descText, { color: colors.textSecondary }]} numberOfLines={2}>
                    {item.description}
                  </Text>
                )}

                <View style={s.tapHint}>
                  <Ionicons name="expand-outline" size={14} color={colors.textSecondary} />
                  <Text style={[s.tapHintText, { color: colors.textSecondary }]}>Ťuknite pre porovnávací slider</Text>
                </View>
              </TouchableOpacity>
            </Animated.View>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Add Modal ────────────────────────────────────────── */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { backgroundColor: colors.bg2 }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.textPrimary }]}>Nové porovnanie</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Treatment picker */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Typ zákroku *</Text>
              <View style={s.treatRow}>
                {TREATMENTS.map(t => (
                  <TouchableOpacity key={t}
                    style={[s.treatChip, { backgroundColor: treatment === t ? COLORS.gold : colors.cardBg, borderColor: treatment === t ? COLORS.gold : colors.bg3 }]}
                    onPress={() => setTreatment(t)}
                  >
                    <Text style={[s.treatChipText, { color: treatment === t ? '#F5F6F8' : colors.textPrimary }]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Before photo */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Fotka PRED *</Text>
              <TouchableOpacity
                style={[s.photoBtn, { backgroundColor: colors.cardBg, borderColor: beforeUri ? COLORS.success : colors.bg3 }]}
                onPress={() => pickImage('before')}
              >
                {beforeUri ? (
                  <Image source={{ uri: beforeUri }} style={s.photoPreview} resizeMode="cover" />
                ) : (
                  <>
                    <Ionicons name="camera-outline" size={28} color={colors.textSecondary} />
                    <Text style={[s.photoBtnText, { color: colors.textSecondary }]}>Vybrať fotku</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* After photo */}
              <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Fotka PO *</Text>
              <TouchableOpacity
                style={[s.photoBtn, { backgroundColor: colors.cardBg, borderColor: afterUri ? COLORS.success : colors.bg3 }]}
                onPress={() => pickImage('after')}
              >
                {afterUri ? (
                  <Image source={{ uri: afterUri }} style={s.photoPreview} resizeMode="cover" />
                ) : (
                  <>
                    <Ionicons name="camera-outline" size={28} color={colors.textSecondary} />
                    <Text style={[s.photoBtnText, { color: colors.textSecondary }]}>Vybrať fotku</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Save */}
              <TouchableOpacity
                style={[s.saveBtn, (!beforeUri || !afterUri || !treatment || uploading) && { opacity: 0.5 }]}
                onPress={saveBeforeAfter}
                disabled={!beforeUri || !afterUri || !treatment || uploading}
              >
                <Ionicons name="checkmark-circle" size={20} color="#F5F6F8" />
                <Text style={s.saveBtnText}>{uploading ? 'Nahrávam...' : 'Uložiť porovnanie'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Compare Modal ────────────────────────────────────── */}
      <Modal visible={!!selectedItem} animationType="fade" transparent>
        <View style={s.compareOverlay}>
          <View style={s.compareHeader}>
            <Text style={s.compareTitle}>{selectedItem?.treatment_type}</Text>
            <TouchableOpacity onPress={() => setSelectedItem(null)}>
              <Ionicons name="close-circle" size={32} color="#F5F6F8" />
            </TouchableOpacity>
          </View>
          {selectedItem && (
            <CompareSlider beforeUrl={selectedItem.before_url} afterUrl={selectedItem.after_url} />
          )}
          <Text style={s.compareHint}>Ťahajte slider pre porovnanie</Text>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: SPACING.xl },

  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: RADII.pill, marginBottom: SPACING.xl, ...SHADOWS.gold },
  addBtnText: { color: '#F5F6F8', fontWeight: '700', fontSize: 15 },

  emptyCard: { borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.xl, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 19 },

  itemCard: { borderRadius: RADII.lg, borderWidth: 1, padding: 14, marginBottom: 14 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  treatBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: RADII.pill },
  treatText: { fontSize: 12, fontWeight: '700' },
  dateText: { fontSize: 11 },

  miniPreview: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 10 },
  miniBox: { flex: 1, height: 100, borderRadius: RADII.sm, overflow: 'hidden', position: 'relative' },
  miniImg: { width: '100%', height: '100%' },
  miniLabel: { position: 'absolute', bottom: 4, left: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  miniLabelText: { color: '#F5F6F8', fontSize: 9, fontWeight: '800', letterSpacing: 1 },

  descText: { fontSize: 12, lineHeight: 17, marginBottom: 8 },
  tapHint: { flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'center' },
  tapHintText: { fontSize: 11 },

  // Slider
  sliderContainer: { width: IMG_W, height: IMG_W * 0.75, borderRadius: RADII.md, overflow: 'hidden', alignSelf: 'center', marginTop: 20 },
  sliderImage: { width: '100%', height: '100%' },
  sliderClip: { position: 'absolute', top: 0, left: 0, height: '100%', overflow: 'hidden' },
  sliderLine: { position: 'absolute', top: 0, bottom: 0, width: 3, backgroundColor: '#F5F6F8', marginLeft: -1.5, zIndex: 10 },
  sliderHandle: { position: 'absolute', top: '50%', marginTop: -18, left: -15, width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.gold, justifyContent: 'center', alignItems: 'center', ...SHADOWS.gold },
  sliderLabels: { position: 'absolute', top: 8, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8 },
  sliderLabel: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  sliderLabelText: { color: '#F5F6F8', fontSize: 10, fontWeight: '800', letterSpacing: 1 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.xl, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xl },
  modalTitle: { fontSize: 18, fontWeight: '700' },

  fieldLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 16 },
  treatRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  treatChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADII.pill, borderWidth: 1 },
  treatChipText: { fontSize: 12, fontWeight: '600' },

  photoBtn: { height: 120, borderRadius: RADII.md, borderWidth: 1.5, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  photoBtnText: { fontSize: 12, marginTop: 4 },
  photoPreview: { width: '100%', height: '100%' },

  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, backgroundColor: COLORS.gold, borderRadius: RADII.pill, marginTop: 24, marginBottom: 30, ...SHADOWS.gold },
  saveBtnText: { color: '#F5F6F8', fontWeight: '700', fontSize: 15 },

  compareOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', padding: SPACING.xl },
  compareHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  compareTitle: { color: '#F5F6F8', fontSize: 18, fontWeight: '700' },
  compareHint: { color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 16, fontSize: 13 },
});
