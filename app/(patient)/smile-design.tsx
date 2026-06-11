/**
 * Virtuálny Smile Design — selfie + AI simulácia (bielenie, rovnátka, fazety)
 */
import React, { useState } from 'react';
import {
  Alert, Image, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { COLORS, SPACING, RADII, SHADOWS } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { useAppTheme } from '../../context/ThemeContext';

type SimType = 'whitening' | 'braces' | 'veneers' | 'alignment';

const SIMULATIONS: { key: SimType; label: string; icon: string; desc: string; color: string }[] = [
  { key: 'whitening', label: 'Bielenie', icon: '✨', desc: 'Simulácia belšieho úsmevu', color: '#F1C40F' },
  { key: 'braces', label: 'Rovnátka', icon: '😬', desc: 'Vizualizácia rovnátok', color: '#3498DB' },
  { key: 'veneers', label: 'Fazety', icon: '💎', desc: 'Simulácia porcelánových faziet', color: '#E74C3C' },
  { key: 'alignment', label: 'Zarovnanie', icon: '🦷', desc: 'Po vyrovnaní zubov', color: '#2ECC71' },
];

export default function SmileDesign() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [activeSim, setActiveSim] = useState<SimType | null>(null);
  const [processing, setProcessing] = useState(false);
  const [intensity, setIntensity] = useState(50);

  async function pickPhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Povolenie', 'Pre selfie potrebujeme prístup ku kamere.');
      return;
    }

    Alert.alert('Smile Design', 'Vyberte zdroj fotografie:', [
      {
        text: 'Fotoaparát', onPress: async () => {
          const r = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: true, aspect: [1, 1] });
          if (!r.canceled && r.assets?.[0]) setPhotoUri(r.assets[0].uri);
        },
      },
      {
        text: 'Galéria', onPress: async () => {
          const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, allowsEditing: true, aspect: [1, 1] });
          if (!r.canceled && r.assets?.[0]) setPhotoUri(r.assets[0].uri);
        },
      },
      { text: 'Zrušiť', style: 'cancel' },
    ]);
  }

  function applySim(type: SimType) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setProcessing(true);
    setActiveSim(type);
    // Simulácia AI spracovania
    setTimeout(() => setProcessing(false), 1500);
  }

  // Simulate overlay tint for the selected effect
  function getOverlay() {
    if (!activeSim || processing) return null;
    const overlayColors: { [k: string]: string } = {
      whitening: 'rgba(255,255,255,0.25)',
      braces: 'rgba(52,152,219,0.15)',
      veneers: 'rgba(255,255,255,0.35)',
      alignment: 'rgba(46,204,113,0.1)',
    };
    return overlayColors[activeSim] ?? null;
  }

  return (
    <View style={[st.safe, { backgroundColor: colors.esp }]}>
      <HeroHeader title="Smile Design" subtitle="Virtuálny úsmev" icon="sparkles-outline" onBack={() => router.back()} />

      <ScrollView style={[st.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={st.content}
        showsVerticalScrollIndicator={false}>

        {/* Photo area */}
        <Animated.View entering={FadeInDown.delay(100)}>
          {!photoUri ? (
            <TouchableOpacity style={[st.uploadArea, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}
              onPress={pickPhoto} activeOpacity={0.8}>
              <View style={[st.uploadIcon, { backgroundColor: COLORS.gold + '15' }]}>
                <Ionicons name="camera" size={40} color={COLORS.gold} />
              </View>
              <Text style={[st.uploadTitle, { color: colors.textPrimary }]}>Odfoťte svoj úsmev</Text>
              <Text style={[st.uploadSub, { color: colors.textSecondary }]}>
                Usmejte sa na fotku a uvidíte, ako by vyzeral váš nový úsmev
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={[st.photoCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <View style={st.photoWrapper}>
                <Image source={{ uri: photoUri }} style={st.photo} />
                {getOverlay() && <View style={[st.photoOverlay, { backgroundColor: getOverlay()! }]} />}
                {processing && (
                  <View style={st.processingOverlay}>
                    <Ionicons name="sparkles" size={32} color="#fff" />
                    <Text style={st.processingText}>AI spracovanie...</Text>
                  </View>
                )}
                {activeSim && !processing && (
                  <View style={st.simLabel}>
                    <Text style={st.simLabelText}>
                      {SIMULATIONS.find(s => s.key === activeSim)?.label ?? ''}
                    </Text>
                  </View>
                )}
              </View>

              <View style={st.photoActions}>
                <TouchableOpacity style={[st.actionBtn, { backgroundColor: colors.bg2 }]} onPress={pickPhoto}>
                  <Ionicons name="camera-outline" size={18} color={colors.textPrimary} />
                  <Text style={[st.actionBtnText, { color: colors.textPrimary }]}>Nová fotka</Text>
                </TouchableOpacity>
                {activeSim && (
                  <TouchableOpacity style={[st.actionBtn, { backgroundColor: colors.bg2 }]}
                    onPress={() => { setActiveSim(null); Haptics.selectionAsync(); }}>
                    <Ionicons name="refresh-outline" size={18} color={colors.textPrimary} />
                    <Text style={[st.actionBtnText, { color: colors.textPrimary }]}>Reset</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </Animated.View>

        {/* Simulation options */}
        {photoUri && (
          <Animated.View entering={FadeInDown.delay(200)}>
            <Text style={[st.sectionTitle, { color: colors.textPrimary }]}>Vyberte simuláciu</Text>
            <View style={st.simGrid}>
              {SIMULATIONS.map(sim => {
                const active = activeSim === sim.key;
                return (
                  <TouchableOpacity key={sim.key}
                    style={[st.simCard, {
                      backgroundColor: active ? sim.color + '15' : colors.cardBg,
                      borderColor: active ? sim.color : colors.bg3,
                    }]}
                    onPress={() => applySim(sim.key)} activeOpacity={0.8}>
                    <Text style={{ fontSize: 28 }}>{sim.icon}</Text>
                    <Text style={[st.simName, { color: active ? sim.color : colors.textPrimary }]}>{sim.label}</Text>
                    <Text style={[st.simDesc, { color: colors.textSecondary }]}>{sim.desc}</Text>
                    {active && <Ionicons name="checkmark-circle" size={20} color={sim.color} style={{ marginTop: 4 }} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.View>
        )}

        {/* Intensity slider (simple) */}
        {photoUri && activeSim && !processing && (
          <Animated.View entering={FadeInDown.delay(300)} style={[st.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Text style={[st.cardTitle, { color: colors.textPrimary }]}>Intenzita efektu</Text>
            <View style={st.sliderRow}>
              {[25, 50, 75, 100].map(v => (
                <TouchableOpacity key={v}
                  style={[st.sliderBtn, {
                    backgroundColor: intensity === v ? COLORS.gold : colors.bg2,
                    borderColor: intensity === v ? COLORS.gold : colors.bg3,
                  }]}
                  onPress={() => { setIntensity(v); Haptics.selectionAsync(); }}>
                  <Text style={[st.sliderText, { color: intensity === v ? '#fff' : colors.textPrimary }]}>{v}%</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        )}

        {/* CTA */}
        {photoUri && activeSim && !processing && (
          <Animated.View entering={FadeInDown.delay(400)}>
            <TouchableOpacity style={st.ctaBtn}
              onPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert('Konzultácia', 'Chcete si objednať konzultáciu pre tento zákrok?', [
                  { text: 'Neskôr' },
                  { text: 'Objednať sa', onPress: () => router.push('/(patient)/book-appointment') },
                ]);
              }} activeOpacity={0.85}>
              <Ionicons name="calendar" size={20} color="#fff" />
              <Text style={st.ctaText}>Objednať sa na konzultáciu</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        <View style={[st.disclaimer, { backgroundColor: dark ? 'rgba(26,82,118,0.15)' : COLORS.infoBg }]}>
          <Ionicons name="information-circle" size={14} color={COLORS.info} />
          <Text style={[st.disclaimerText, { color: colors.textSecondary }]}>
            Toto je orientačná vizualizácia. Skutočný výsledok závisí od individuálneho posúdenia lekárom.
          </Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: SPACING.xl },

  uploadArea: { borderRadius: RADII.lg, borderWidth: 2, borderStyle: 'dashed', padding: SPACING.xxxl, alignItems: 'center', marginBottom: SPACING.lg },
  uploadIcon: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  uploadTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  uploadSub: { fontSize: 13, textAlign: 'center', lineHeight: 18 },

  photoCard: { borderRadius: RADII.lg, borderWidth: 1, overflow: 'hidden', marginBottom: SPACING.lg },
  photoWrapper: { position: 'relative' },
  photo: { width: '100%', aspectRatio: 1, resizeMode: 'cover' },
  photoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  processingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  processingText: { color: '#fff', fontWeight: '700', fontSize: 14, marginTop: 8 },
  simLabel: { position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: RADII.pill },
  simLabelText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  photoActions: { flexDirection: 'row', gap: 8, padding: SPACING.md },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADII.pill },
  actionBtnText: { fontSize: 12, fontWeight: '600' },

  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  simGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: SPACING.lg },
  simCard: { width: '48%', borderRadius: RADII.lg, borderWidth: 1.5, padding: SPACING.md, alignItems: 'center' },
  simName: { fontSize: 14, fontWeight: '700', marginTop: 6 },
  simDesc: { fontSize: 10, textAlign: 'center', marginTop: 2 },

  card: { borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.lg, marginBottom: SPACING.lg },
  cardTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12 },
  sliderRow: { flexDirection: 'row', gap: 8 },
  sliderBtn: { flex: 1, paddingVertical: 10, borderRadius: RADII.pill, borderWidth: 1, alignItems: 'center' },
  sliderText: { fontWeight: '700', fontSize: 13 },

  ctaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, backgroundColor: COLORS.gold, borderRadius: RADII.pill, ...SHADOWS.gold, marginBottom: SPACING.lg },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  disclaimer: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: RADII.sm, alignItems: 'flex-start' },
  disclaimerText: { flex: 1, fontSize: 11, lineHeight: 16 },
});
