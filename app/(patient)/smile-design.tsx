/**
 * AI Smile Design™ — reálna AI transformácia úsmevu
 * 
 * Funkcie:
 * - Fotka z kamery/galérie
 * - AI spracovanie cez Supabase Edge Function → Replicate API
 * - Before/After porovnávací slider
 * - Uloženie výsledkov do galérie
 * - Zdieľanie výsledkov
 * - História transformácií
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, FlatList, Image,
  Modal, PanResponder, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII, SHADOWS } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';

const { width: SCREEN_W } = Dimensions.get('window');
const IMAGE_W = SCREEN_W - SPACING.xl * 2;

type EffectType = 'whitening' | 'veneers' | 'enhancement' | 'alignment';

type SmileDesign = {
  id: string;
  original_url: string;
  result_url: string | null;
  effect_type: string;
  intensity: number;
  status: string;
  created_at: string;
};

/* ─── Effect definitions ──────────────────────────────────────────────────── */
const EFFECTS: { key: EffectType; label: string; icon: string; ionicon: string; desc: string; color: string }[] = [
  { key: 'whitening',    label: 'Bielenie',     icon: '✨', ionicon: 'sunny',           desc: 'AI bielenie zubov — prirodzený belší úsmev',        color: '#B87333' },
  { key: 'enhancement',  label: 'Vylepšenie',   icon: '💎', ionicon: 'sparkles',         desc: 'Celkové AI vylepšenie tváre a úsmevu',              color: '#2E7D5E' },
  { key: 'veneers',      label: 'Fazety',       icon: '🦷', ionicon: 'shield-checkmark', desc: 'Simulácia porcelánových faziet — dokonalý úsmev',   color: '#1A5276' },
  { key: 'alignment',    label: 'Zarovnanie',   icon: '😁', ionicon: 'git-compare',      desc: 'Vizualizácia po ortodontickej liečbe',              color: '#9B59B6' },
];

/* ─── Supabase Edge Function URL ──────────────────────────────────────────── */
const SUPABASE_URL = 'https://fcxkgnfnfswcusjetqop.supabase.co';
const EDGE_FN_URL = `${SUPABASE_URL}/functions/v1/smile-transform`;

export default function SmileDesign() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();

  // Photo state
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [resultUri, setResultUri] = useState<string | null>(null);

  // Effect state
  const [selectedEffect, setSelectedEffect] = useState<EffectType>('whitening');
  const [intensity, setIntensity] = useState(75);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  // Before/After slider
  const [sliderPos, setSliderPos] = useState(0.5);

  // History
  const [history, setHistory] = useState<SmileDesign[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [viewingDesign, setViewingDesign] = useState<SmileDesign | null>(null);

  // User
  const [userId, setUserId] = useState('');

  /* ─── Load user & history ──────────────────────────────────────────────── */
  const loadHistory = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data } = await supabase.from('smile_designs')
        .select('*')
        .eq('patient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      setHistory((data ?? []) as SmileDesign[]);
    } catch (e) {
      console.error(e);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadHistory(); }, [loadHistory]));

  /* ─── PanResponder for before/after slider ─────────────────────────────── */
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        Haptics.selectionAsync();
      },
      onPanResponderMove: (_, gestureState) => {
        const newPos = Math.max(0.05, Math.min(0.95, (gestureState.moveX - SPACING.xl) / IMAGE_W));
        setSliderPos(newPos);
      },
    }),
  ).current;

  /* ─── Pick photo ───────────────────────────────────────────────────────── */
  async function pickPhoto(source: 'camera' | 'gallery') {
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Povolenie', 'Potrebujeme prístup ku kamere pre selfie.');
          return;
        }
        const r = await ImagePicker.launchCameraAsync({
          quality: 0.85,
          allowsEditing: true,
          aspect: [3, 4],
          base64: false,
        });
        if (!r.canceled && r.assets?.[0]) {
          setPhotoUri(r.assets[0].uri);
          setResultUri(null);
          setSliderPos(0.5);
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Povolenie', 'Potrebujeme prístup ku galérii.');
          return;
        }
        const r = await ImagePicker.launchImageLibraryAsync({
          quality: 0.85,
          allowsEditing: true,
          aspect: [3, 4],
          base64: false,
        });
        if (!r.canceled && r.assets?.[0]) {
          setPhotoUri(r.assets[0].uri);
          setResultUri(null);
          setSliderPos(0.5);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  /* ─── Process with AI ──────────────────────────────────────────────────── */
  async function processWithAI() {
    if (!photoUri || processing) return;
    setProcessing(true);
    setProgress(0);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Progress animation
    const progressInterval = setInterval(() => {
      setProgress(p => Math.min(p + 2, 90));
    }, 500);

    try {
      // 1. Upload photo to Supabase Storage first
      setProgress(5);
      const origPath = `originals/${userId}/${Date.now()}.jpg`;
      const origBlob = await (await fetch(photoUri)).blob();
      const { error: uploadError } = await supabase.storage.from('smile-designs').upload(origPath, origBlob, { contentType: 'image/jpeg' });
      if (uploadError) throw new Error(`Upload zlyhalo: ${uploadError.message}`);

      const { data: origUrlData } = supabase.storage.from('smile-designs').getPublicUrl(origPath);
      const imageUrl = origUrlData?.publicUrl;
      if (!imageUrl) throw new Error('Nepodarilo sa získať URL obrázku');

      setProgress(20);

      // 2. Call AI Edge Function with URL (not base64 — avoids payload size limits)
      const { data: { session } } = await supabase.auth.getSession();
      let aiRes: Response;
      try {
        aiRes = await fetch(EDGE_FN_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token ?? ''}`,
          },
          body: JSON.stringify({
            image_url: imageUrl,
            effect: selectedEffect,
            intensity,
          }),
        });
      } catch (fetchErr: any) {
        throw new Error('Nepodarilo sa pripojiť k AI serveru. Skontrolujte internetové pripojenie.');
      }

      // 3. Parse response — handle non-JSON gracefully
      let aiData: any;
      try {
        aiData = await aiRes.json();
      } catch {
        throw new Error(
          aiRes.status === 404
            ? 'AI funkcia nie je nasadená. Spustite: supabase functions deploy smile-transform'
            : `Server vrátil neočakávanú odpoveď (HTTP ${aiRes.status})`
        );
      }

      if (aiData.status === 'success' && aiData.result_url) {
        setResultUri(aiData.result_url);
        setProgress(100);

        // Save to database
        await supabase.from('smile_designs').insert({
          patient_id: userId,
          original_url: imageUrl,
          result_url: aiData.result_url,
          effect_type: selectedEffect,
          intensity,
          status: 'completed',
        });

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await loadHistory();
      } else {
        throw new Error(aiData.error ?? `AI spracovanie zlyhalo (HTTP ${aiRes.status})`);
      }
    } catch (e: any) {
      setProgress(0);
      const msg = e?.message ?? 'Neznáma chyba';
      if (msg.includes('REPLICATE_API_TOKEN')) {
        Alert.alert(
          'API kľúč chýba',
          'Pre AI spracovanie je potrebný Replicate API kľúč.\n\nNastavte ho v Supabase Dashboard → Edge Functions → Secrets ako REPLICATE_API_TOKEN.',
          [{ text: 'Rozumiem' }],
        );
      } else if (msg.includes('nasadená') || msg.includes('deploy')) {
        Alert.alert(
          'AI funkcia nie je nasadená',
          'Edge Function "smile-transform" nie je nasadená na Supabase.\n\nSpustite:\nsupabase functions deploy smile-transform',
          [{ text: 'Rozumiem' }],
        );
      } else {
        Alert.alert('Chyba', msg, [{ text: 'Skúsiť znova', onPress: processWithAI }, { text: 'Zrušiť' }]);
      }
    } finally {
      clearInterval(progressInterval);
      setProcessing(false);
    }
  }

  /* ─── Share result ─────────────────────────────────────────────────────── */
  async function shareResult() {
    if (!resultUri) return;
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('Zdieľanie', 'Zdieľanie nie je na tomto zariadení dostupné.');
        return;
      }
      // Download result image for sharing
      const res = await fetch(resultUri);
      const blob = await res.blob();
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        // Share URL directly
        await Sharing.shareAsync(resultUri, {
          mimeType: 'image/jpeg',
          dialogTitle: 'Zdieľať Smile Design',
        });
      };
    } catch {
      // If direct sharing fails, copy URL
      Alert.alert('Zdieľanie', 'Výsledok je uložený vo vašom profile.');
    }
  }

  /* ─── Render ────────────────────────────────────────────────────────────── */
  return (
    <View style={[st.safe, { backgroundColor: colors.esp }]}>
      <HeroHeader title="AI Smile Design" subtitle="Virtuálny úsmev s AI" icon="sparkles-outline" onBack={() => router.back()} />

      <ScrollView style={[st.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={st.content}
        showsVerticalScrollIndicator={false}>

        {/* ─── Photo area ──────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(100)}>
          {!photoUri ? (
            /* Upload prompt */
            <View style={[st.uploadCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <View style={[st.uploadIconWrap, { backgroundColor: dark ? '#3A4256' + '30' : COLORS.infoBg }]}>
                <Ionicons name="camera" size={44} color={COLORS.info} />
              </View>
              <Text style={[st.uploadTitle, { color: colors.textPrimary }]}>Odfoťte svoj úsmev</Text>
              <Text style={[st.uploadSub, { color: colors.textSecondary }]}>
                AI analyzuje vašu tvár a vytvorí realistickú vizualizáciu nového úsmevu
              </Text>

              <View style={st.uploadBtns}>
                <TouchableOpacity style={[st.uploadBtn, { backgroundColor: COLORS.wal }]}
                  onPress={() => pickPhoto('camera')} activeOpacity={0.85}>
                  <Ionicons name="camera" size={20} color="#F5F6F8" />
                  <Text style={st.uploadBtnText}>Fotoaparát</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[st.uploadBtn, { backgroundColor: dark ? '#252830' : COLORS.bg2, borderWidth: 1, borderColor: colors.bg3 }]}
                  onPress={() => pickPhoto('gallery')} activeOpacity={0.85}>
                  <Ionicons name="images" size={20} color={colors.textPrimary} />
                  <Text style={[st.uploadBtnTextAlt, { color: colors.textPrimary }]}>Galéria</Text>
                </TouchableOpacity>
              </View>

              {/* Tips */}
              <View style={[st.tipsWrap, { borderTopColor: colors.bg3 }]}>
                <Text style={[st.tipsTitle, { color: colors.textSecondary }]}>TIPY PRE LEPŠÍ VÝSLEDOK</Text>
                {['Usmejte sa prirodzene a ukážte zuby', 'Foťte pri dobrom osvetlení', 'Držte telefón vo výške očí'].map((tip, i) => (
                  <View key={i} style={st.tipRow}>
                    <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
                    <Text style={[st.tipText, { color: colors.textSecondary }]}>{tip}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            /* Photo with before/after */
            <View style={[st.photoCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              {/* Before/After comparison */}
              <View style={st.compareWrap} {...(resultUri ? panResponder.panHandlers : {})}>
                {/* Original (full width) */}
                <Image source={{ uri: photoUri }} style={[st.compareImg, { width: IMAGE_W }]} />

                {/* Result overlay (clipped) */}
                {resultUri && (
                  <View style={[st.compareOverlay, { width: IMAGE_W * sliderPos }]}>
                    <Image source={{ uri: resultUri }} style={[st.compareImg, { width: IMAGE_W }]} />
                  </View>
                )}

                {/* Slider handle */}
                {resultUri && (
                  <View style={[st.sliderHandle, { left: IMAGE_W * sliderPos - 16 }]}>
                    <View style={st.sliderLine} />
                    <View style={st.sliderKnob}>
                      <Ionicons name="code" size={16} color="#F5F6F8" />
                    </View>
                    <View style={st.sliderLine} />
                  </View>
                )}

                {/* Labels */}
                {resultUri && (
                  <>
                    <View style={[st.label, st.labelBefore]}>
                      <Text style={st.labelText}>PRED</Text>
                    </View>
                    <View style={[st.label, st.labelAfter]}>
                      <Text style={st.labelText}>PO</Text>
                    </View>
                  </>
                )}

                {/* Processing overlay */}
                {processing && (
                  <View style={st.processingOverlay}>
                    <View style={st.processingContent}>
                      <ActivityIndicator size="large" color="#F5F6F8" />
                      <Text style={st.processingTitle}>AI spracovanie...</Text>
                      <Text style={st.processingSub}>
                        {progress < 30 ? 'Analyzujem tvár...' :
                         progress < 60 ? 'Aplikujem efekt...' :
                         progress < 90 ? 'Optimalizujem výsledok...' :
                         'Finalizujem...'}
                      </Text>
                      <View style={st.progressBar}>
                        <View style={[st.progressFill, { width: `${progress}%` }]} />
                      </View>
                    </View>
                  </View>
                )}
              </View>

              {/* Photo action buttons */}
              <View style={st.photoActions}>
                <TouchableOpacity style={[st.photoBtn, { backgroundColor: colors.bg2 }]}
                  onPress={() => { setPhotoUri(null); setResultUri(null); }}>
                  <Ionicons name="camera-outline" size={16} color={colors.textPrimary} />
                  <Text style={[st.photoBtnText, { color: colors.textPrimary }]}>Nová fotka</Text>
                </TouchableOpacity>
                {resultUri && (
                  <>
                    <TouchableOpacity style={[st.photoBtn, { backgroundColor: colors.bg2 }]} onPress={shareResult}>
                      <Ionicons name="share-outline" size={16} color={colors.textPrimary} />
                      <Text style={[st.photoBtnText, { color: colors.textPrimary }]}>Zdieľať</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[st.photoBtn, { backgroundColor: colors.bg2 }]}
                      onPress={() => { setResultUri(null); setSliderPos(0.5); }}>
                      <Ionicons name="refresh-outline" size={16} color={colors.textPrimary} />
                      <Text style={[st.photoBtnText, { color: colors.textPrimary }]}>Reset</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          )}
        </Animated.View>

        {/* ─── Effect selector ──────────────────────────────────────── */}
        {photoUri && (
          <Animated.View entering={FadeInDown.delay(200)}>
            <Text style={[st.sectionTitle, { color: colors.textPrimary }]}>Vyberte efekt</Text>
            <View style={st.effectGrid}>
              {EFFECTS.map(eff => {
                const active = selectedEffect === eff.key;
                return (
                  <TouchableOpacity key={eff.key}
                    style={[st.effectCard, {
                      backgroundColor: active ? eff.color + '15' : colors.cardBg,
                      borderColor: active ? eff.color : colors.bg3,
                      borderWidth: active ? 2 : 1,
                    }]}
                    onPress={() => { setSelectedEffect(eff.key); Haptics.selectionAsync(); }}
                    activeOpacity={0.8}>
                    <View style={[st.effectIconWrap, { backgroundColor: eff.color + '18' }]}>
                      <Ionicons name={eff.ionicon as any} size={22} color={eff.color} />
                    </View>
                    <Text style={[st.effectName, { color: active ? eff.color : colors.textPrimary }]}>{eff.label}</Text>
                    <Text style={[st.effectDesc, { color: colors.textSecondary }]} numberOfLines={2}>{eff.desc}</Text>
                    {active && (
                      <View style={[st.effectCheck, { backgroundColor: eff.color }]}>
                        <Ionicons name="checkmark" size={12} color="#F5F6F8" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.View>
        )}

        {/* ─── Intensity control ──────────────────────────────────── */}
        {photoUri && (
          <Animated.View entering={FadeInDown.delay(300)} style={[st.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <View style={st.cardHeader}>
              <Text style={[st.cardTitle, { color: colors.textPrimary }]}>Intenzita efektu</Text>
              <Text style={[st.intensityVal, { color: EFFECTS.find(e => e.key === selectedEffect)?.color ?? COLORS.wal }]}>
                {intensity}%
              </Text>
            </View>
            <View style={st.intensityRow}>
              {[25, 50, 75, 100].map(v => {
                const active = intensity === v;
                const effectColor = EFFECTS.find(e => e.key === selectedEffect)?.color ?? COLORS.wal;
                return (
                  <TouchableOpacity key={v}
                    style={[st.intensityBtn, {
                      backgroundColor: active ? effectColor : colors.bg2,
                      borderColor: active ? effectColor : colors.bg3,
                    }]}
                    onPress={() => { setIntensity(v); Haptics.selectionAsync(); }}>
                    <Text style={[st.intensityLabel, { color: active ? '#F5F6F8' : colors.textPrimary }]}>
                      {v === 25 ? 'Jemný' : v === 50 ? 'Stredný' : v === 75 ? 'Silný' : 'Max'}
                    </Text>
                    <Text style={[st.intensityPct, { color: active ? '#F5F6F8' : colors.textSecondary }]}>{v}%</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.View>
        )}

        {/* ─── Process CTA ──────────────────────────────────────── */}
        {photoUri && !processing && (
          <Animated.View entering={FadeInDown.delay(400)}>
            <TouchableOpacity style={[st.ctaBtn, { backgroundColor: COLORS.wal }]}
              onPress={processWithAI} activeOpacity={0.85}>
              <Ionicons name="sparkles" size={22} color="#F5F6F8" />
              <Text style={st.ctaText}>
                {resultUri ? 'Spracovať znova' : 'Spustiť AI transformáciu'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ─── Book consultation CTA ─────────────────────────────── */}
        {resultUri && (
          <Animated.View entering={FadeInDown.delay(500)}>
            <TouchableOpacity style={[st.bookBtn, { backgroundColor: dark ? '#252830' : '#F5F6F8', borderColor: colors.bg3 }]}
              onPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert('Konzultácia', 'Chcete si objednať konzultáciu pre tento zákrok?', [
                  { text: 'Neskôr' },
                  { text: 'Objednať sa', onPress: () => router.push('/(patient)/book-appointment') },
                ]);
              }} activeOpacity={0.85}>
              <Ionicons name="calendar" size={20} color={COLORS.success} />
              <View style={{ flex: 1 }}>
                <Text style={[st.bookTitle, { color: colors.textPrimary }]}>Objednať sa na konzultáciu</Text>
                <Text style={[st.bookSub, { color: colors.textSecondary }]}>Poraďte sa s lekárom o tomto zákroku</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ─── History ───────────────────────────────────────────── */}
        {history.length > 0 && (
          <Animated.View entering={FadeInDown.delay(600)}>
            <Text style={[st.sectionTitle, { color: colors.textPrimary, marginTop: SPACING.lg }]}>
              Vaše predchádzajúce návrhy
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.historyScroll}
              contentContainerStyle={st.historyContent}>
              {history.map(item => (
                <TouchableOpacity key={item.id}
                  style={[st.historyCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}
                  onPress={() => setViewingDesign(item)} activeOpacity={0.85}>
                  <Image source={{ uri: item.result_url ?? item.original_url }}
                    style={st.historyImg} />
                  <View style={st.historyInfo}>
                    <Text style={[st.historyEffect, { color: colors.textPrimary }]}>
                      {EFFECTS.find(e => e.key === item.effect_type)?.label ?? item.effect_type}
                    </Text>
                    <Text style={[st.historyDate, { color: colors.textSecondary }]}>
                      {new Date(item.created_at).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' })}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Animated.View>
        )}

        {/* ─── Disclaimer ─────────────────────────────────────────── */}
        <View style={[st.disclaimer, { backgroundColor: dark ? 'rgba(26,82,118,0.15)' : COLORS.infoBg }]}>
          <Ionicons name="information-circle" size={16} color={COLORS.info} />
          <Text style={[st.disclaimerText, { color: colors.textSecondary }]}>
            AI vizualizácia je orientačná. Skutočný výsledok závisí od individuálneho posúdenia lekárom. Fotografie sú spracované pomocou umelej inteligencie.
          </Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ─── History detail modal ─────────────────────────────────────────── */}
      <Modal visible={!!viewingDesign} transparent animationType="fade"
        onRequestClose={() => setViewingDesign(null)}>
        <TouchableOpacity style={st.modalOverlay} activeOpacity={1} onPress={() => setViewingDesign(null)}>
          <Animated.View entering={FadeInDown.duration(300)} style={[st.modalContent, { backgroundColor: colors.cardBg }]}>
            {viewingDesign && (
              <>
                <View style={st.modalImgRow}>
                  {viewingDesign.original_url ? (
                    <View style={st.modalImgWrap}>
                      <Image source={{ uri: viewingDesign.original_url }} style={st.modalImg} />
                      <Text style={[st.modalImgLabel, { color: colors.textSecondary }]}>PRED</Text>
                    </View>
                  ) : null}
                  {viewingDesign.result_url ? (
                    <View style={st.modalImgWrap}>
                      <Image source={{ uri: viewingDesign.result_url }} style={st.modalImg} />
                      <Text style={[st.modalImgLabel, { color: colors.textSecondary }]}>PO</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[st.modalEffect, { color: colors.textPrimary }]}>
                  {EFFECTS.find(e => e.key === viewingDesign.effect_type)?.label ?? viewingDesign.effect_type}
                  {' · '}{viewingDesign.intensity}%
                </Text>
                <Text style={[st.modalDate, { color: colors.textSecondary }]}>
                  {new Date(viewingDesign.created_at).toLocaleDateString('sk-SK', {
                    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </Text>
                <TouchableOpacity style={[st.modalCloseBtn, { backgroundColor: COLORS.wal }]}
                  onPress={() => setViewingDesign(null)}>
                  <Text style={st.modalCloseBtnText}>Zavrieť</Text>
                </TouchableOpacity>
              </>
            )}
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

/* ─── Styles ──────────────────────────────────────────────────────────────── */
const st = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: SPACING.xl },

  /* Upload */
  uploadCard: { borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.xl, alignItems: 'center', marginBottom: SPACING.lg },
  uploadIconWrap: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  uploadTitle: { fontSize: 20, fontWeight: '800', marginBottom: 6 },
  uploadSub: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 20, paddingHorizontal: 12 },
  uploadBtns: { flexDirection: 'row', gap: 10, width: '100%' },
  uploadBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: RADII.sm },
  uploadBtnText: { color: '#F5F6F8', fontSize: 14, fontWeight: '700' },
  uploadBtnTextAlt: { fontSize: 14, fontWeight: '700' },
  tipsWrap: { width: '100%', borderTopWidth: 1, marginTop: 20, paddingTop: 16 },
  tipsTitle: { fontSize: 9, fontWeight: '600', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  tipText: { fontSize: 12, lineHeight: 17 },

  /* Photo card */
  photoCard: { borderRadius: RADII.lg, borderWidth: 1, overflow: 'hidden', marginBottom: SPACING.lg },
  compareWrap: { position: 'relative', width: IMAGE_W, height: IMAGE_W * 1.33, overflow: 'hidden' },
  compareImg: { width: IMAGE_W, height: IMAGE_W * 1.33, resizeMode: 'cover' },
  compareOverlay: { position: 'absolute', top: 0, left: 0, bottom: 0, overflow: 'hidden' },

  /* Slider */
  sliderHandle: { position: 'absolute', top: 0, bottom: 0, width: 32, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  sliderLine: { flex: 1, width: 2, backgroundColor: '#F5F6F8' },
  sliderKnob: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center', ...SHADOWS.lg },

  /* Labels */
  label: { position: 'absolute', bottom: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADII.sm, backgroundColor: 'rgba(0,0,0,0.55)' },
  labelBefore: { right: 12 },
  labelAfter: { left: 12 },
  labelText: { color: '#F5F6F8', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },

  /* Processing */
  processingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(18,20,23,0.75)', alignItems: 'center', justifyContent: 'center' },
  processingContent: { alignItems: 'center', paddingHorizontal: 32 },
  processingTitle: { color: '#F5F6F8', fontSize: 18, fontWeight: '700', marginTop: 16, marginBottom: 4 },
  processingSub: { color: '#B8ACA0', fontSize: 13, marginBottom: 16 },
  progressBar: { width: 200, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: '#2E7D5E' },

  /* Photo actions */
  photoActions: { flexDirection: 'row', gap: 8, padding: SPACING.md },
  photoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADII.sm },
  photoBtnText: { fontSize: 12, fontWeight: '600' },

  /* Section */
  sectionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 12 },

  /* Effects grid */
  effectGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: SPACING.lg },
  effectCard: { width: '47%', flexGrow: 1, borderRadius: RADII.md, padding: 14, position: 'relative' },
  effectIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  effectName: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  effectDesc: { fontSize: 10, lineHeight: 14 },
  effectCheck: { position: 'absolute', top: 10, right: 10, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  /* Intensity */
  card: { borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.lg, marginBottom: SPACING.lg },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  intensityVal: { fontSize: 18, fontWeight: '800' },
  intensityRow: { flexDirection: 'row', gap: 8 },
  intensityBtn: { flex: 1, paddingVertical: 10, borderRadius: RADII.sm, borderWidth: 1, alignItems: 'center' },
  intensityLabel: { fontWeight: '700', fontSize: 11 },
  intensityPct: { fontSize: 10, marginTop: 2 },

  /* CTA */
  ctaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: RADII.sm, ...SHADOWS.lg, marginBottom: SPACING.md },
  ctaText: { color: '#F5F6F8', fontWeight: '700', fontSize: 15, letterSpacing: 0.5 },

  /* Book */
  bookBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: SPACING.md, borderRadius: RADII.md, borderWidth: 1, marginBottom: SPACING.lg },
  bookTitle: { fontSize: 14, fontWeight: '700' },
  bookSub: { fontSize: 11, marginTop: 2 },

  /* History */
  historyScroll: { marginBottom: SPACING.lg },
  historyContent: { gap: 10 },
  historyCard: { width: 140, borderRadius: RADII.md, borderWidth: 1, overflow: 'hidden' },
  historyImg: { width: 140, height: 140, resizeMode: 'cover' },
  historyInfo: { padding: 8 },
  historyEffect: { fontSize: 12, fontWeight: '700' },
  historyDate: { fontSize: 10, marginTop: 2 },

  /* Disclaimer */
  disclaimer: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: RADII.sm, alignItems: 'flex-start', marginTop: SPACING.sm },
  disclaimerText: { flex: 1, fontSize: 11, lineHeight: 16 },

  /* Modal */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justify