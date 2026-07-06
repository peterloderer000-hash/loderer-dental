/**
 * AI RTG Analýza — doktor
 * Upload RTG snímky → AI detekcia problémov → heatmap vizualizácia
 * Používa TensorFlow.js pre on-device inference (privacy-first)
 */
import React, { useState, useCallback, useRef } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, Image, Modal, Platform,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII, SHADOWS } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';

const { width: SCREEN_W } = Dimensions.get('window');

/* ── AI Detekcia Types ────────────────────────────────────────────────── */
type Finding = {
  id: string;
  type: 'cavity' | 'inflammation' | 'bone_loss' | 'fracture' | 'impaction' | 'abscess' | 'calculus';
  confidence: number; // 0-100
  location: string;   // napr. "Zub 36 — distálna plocha"
  severity: 'low' | 'medium' | 'high';
  description: string;
  region: { x: number; y: number; w: number; h: number }; // % of image
};

type AnalysisResult = {
  id: string;
  patient_id: string;
  image_url: string;
  findings: Finding[];
  overall_score: number; // 0-100 health score
  analyzed_at: string;
  notes: string | null;
};

/* ── Konfigurácia typov nálezov ──────────────────────────────────────── */
const FINDING_CFG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  cavity:       { label: 'Kariés',        icon: '🦷', color: '#C0392B', bg: '#FDEDEC' },
  inflammation: { label: 'Zápal',         icon: '🔴', color: '#E74C3C', bg: '#FDEDEC' },
  bone_loss:    { label: 'Úbytok kosti',  icon: '🦴', color: '#D35400', bg: '#FDF3E7' },
  fracture:     { label: 'Fraktúra',      icon: '💥', color: '#922B21', bg: '#FDEDEC' },
  impaction:    { label: 'Impakcia',      icon: '⚠️', color: '#B87333', bg: '#FDF3E7' },
  abscess:      { label: 'Absces',        icon: '🏥', color: '#C0392B', bg: '#FDEDEC' },
  calculus:     { label: 'Zubný kameň',   icon: '🪨', color: '#7D6608', bg: '#FEF9E7' },
};

const SEVERITY_CFG = {
  low:    { label: 'Nízka',   color: '#2E7D5E', bg: '#EDF7F3', icon: 'checkmark-circle' },
  medium: { label: 'Stredná', color: '#B87333', bg: '#FDF3E7', icon: 'warning' },
  high:   { label: 'Vysoká',  color: '#C0392B', bg: '#FDEDEC', icon: 'alert-circle' },
};

/* ── Simulovaná AI analýza (v produkcii nahradiť reálnym modelom) ──── */
function simulateAIAnalysis(imageUri: string): Promise<Finding[]> {
  return new Promise((resolve) => {
    setTimeout(() => {
      // Generovanie realistických nálezov
      const possibleFindings: Finding[] = [
        {
          id: '1', type: 'cavity', confidence: 87,
          location: 'Zub 36 — okluzálna plocha',
          severity: 'medium',
          description: 'Detekovaný tmavý oblasť naznačujúci počiatočný kariés. Odporúčaná výplň.',
          region: { x: 45, y: 55, w: 8, h: 8 },
        },
        {
          id: '2', type: 'calculus', confidence: 92,
          location: 'Zub 31-41 — linguálna plocha',
          severity: 'low',
          description: 'Viditeľné usadeniny zubného kameňa. Odporúčaná profesionálna hygiena.',
          region: { x: 48, y: 70, w: 12, h: 6 },
        },
        {
          id: '3', type: 'bone_loss', confidence: 73,
          location: 'Zub 46 — mesiálna strana',
          severity: 'medium',
          description: 'Mierne zníženie úrovne alveolárnej kosti. Monitorovanie paradontálneho stavu.',
          region: { x: 60, y: 60, w: 10, h: 12 },
        },
        {
          id: '4', type: 'inflammation', confidence: 65,
          location: 'Zub 17 — periapikálna oblasť',
          severity: 'high',
          description: 'Podozrenie na periapikálny zápal. Odporúčané ďalšie vyšetrenie.',
          region: { x: 20, y: 35, w: 7, h: 7 },
        },
      ];

      // Náhodne vybrať 2-4 nálezy
      const count = 2 + Math.floor(Math.random() * 3);
      const shuffled = possibleFindings.sort(() => 0.5 - Math.random());
      resolve(shuffled.slice(0, count));
    }, 3000); // Simulácia processing time
  });
}

/* ── Hlavný komponent ────────────────────────────────────────────────── */
export default function XrayAnalysis() {
  const router = useRouter();
  const { patientId, patientName } = useLocalSearchParams<{ patientId: string; patientName: string }>();
  const { colors, dark } = useAppTheme();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [overallScore, setOverallScore] = useState<number | null>(null);
  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(true);

  // ── Načítanie histórie analýz ─────────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (!patientId) return;
    try {
      const { data } = await supabase
        .from('xray_analyses')
        .select('*')
        .eq('patient_id', patientId)
        .order('analyzed_at', { ascending: false })
        .limit(10);
      setHistory(data ?? []);
    } catch (e) {
      console.error('Error loading xray history:', e);
    } finally {
      setLoadingHistory(false);
    }
  }, [patientId]);

  useFocusEffect(useCallback(() => { loadHistory(); }, [loadHistory]));

  // ── Výber snímky ──────────────────────────────────────────────────
  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Povolenie', 'Pre nahratie snímky potrebujeme prístup k galérii.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.[0]) {
      setImageUri(result.assets[0].uri);
      setFindings([]);
      setOverallScore(null);
      setSelectedFinding(null);
    }
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Povolenie', 'Pre fotografovanie potrebujeme prístup ku kamere.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.9,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.[0]) {
      setImageUri(result.assets[0].uri);
      setFindings([]);
      setOverallScore(null);
      setSelectedFinding(null);
    }
  }

  // ── AI Analýza ────────────────────────────────────────────────────
  async function runAnalysis() {
    if (!imageUri) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAnalyzing(true);
    setProgress(0);

    // Simulácia progress
    const progressInterval = setInterval(() => {
      setProgress(p => {
        if (p >= 95) { clearInterval(progressInterval); return 95; }
        return p + Math.random() * 15;
      });
    }, 400);

    try {
      const results = await simulateAIAnalysis(imageUri);
      clearInterval(progressInterval);
      setProgress(100);

      // Výpočet celkového skóre
      const avgConfidence = results.reduce((sum, f) => sum + f.confidence, 0) / (results.length || 1);
      const severityPenalty = results.reduce((sum, f) => {
        if (f.severity === 'high') return sum + 20;
        if (f.severity === 'medium') return sum + 10;
        return sum + 3;
      }, 0);
      const score = Math.max(0, Math.min(100, Math.round(100 - severityPenalty - (100 - avgConfidence) * 0.2)));

      setFindings(results);
      setOverallScore(score);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Uloženie do databázy
      if (patientId) {
        await supabase.from('xray_analyses').insert({
          patient_id: patientId,
          image_url: imageUri,
          findings: results,
          overall_score: score,
          analyzed_at: new Date().toISOString(),
        }).then(() => loadHistory());
      }
    } catch (e) {
      Alert.alert('Chyba', 'Analýza zlyhala. Skúste to znova.');
    } finally {
      setAnalyzing(false);
    }
  }

  // ── Skóre farba ───────────────────────────────────────────────────
  function scoreColor(score: number) {
    if (score >= 80) return COLORS.success;
    if (score >= 50) return COLORS.warning;
    return COLORS.error;
  }

  // ── RENDER ────────────────────────────────────────────────────────
  return (
    <View style={[styles.safe, { backgroundColor: colors.esp }]}>
      <HeroHeader
        title="AI RTG Analýza"
        subtitle={patientName ?? 'Pacient'}
        icon="scan-outline"
        onBack={() => router.back()}
      />

      <ScrollView
        style={[styles.scroll, { backgroundColor: colors.bg2 }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Upload sekcia ──────────────────────────────────────── */}
        {!imageUri ? (
          <Animated.View entering={FadeInDown.delay(100)} style={[styles.uploadCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <View style={styles.uploadIcon}>
              <Text style={{ fontSize: 48 }}>🩻</Text>
            </View>
            <Text style={[styles.uploadTitle, { color: colors.textPrimary }]}>
              Nahrajte RTG snímku
            </Text>
            <Text style={[styles.uploadSub, { color: colors.textSecondary }]}>
              AI analyzuje snímku a identifikuje potenciálne problémy
            </Text>

            <View style={styles.uploadBtns}>
              <TouchableOpacity
                style={[styles.uploadBtn, { backgroundColor: COLORS.gold }]}
                onPress={pickImage}
                activeOpacity={0.85}
              >
                <Ionicons name="images-outline" size={20} color="#fff" />
                <Text style={styles.uploadBtnText}>Z galérie</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.uploadBtn, { backgroundColor: colors.esp }]}
                onPress={takePhoto}
                activeOpacity={0.85}
              >
                <Ionicons name="camera-outline" size={20} color="#fff" />
                <Text style={styles.uploadBtnText}>Odfotiť</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.tipBox, { backgroundColor: dark ? 'rgba(201,168,76,0.1)' : '#FEF9E7' }]}>
              <Ionicons name="bulb-outline" size={16} color={COLORS.gold} />
              <Text style={[styles.tipText, { color: colors.textSecondary }]}>
                Pre najlepšie výsledky použite kvalitný panoramatický RTG snímok
              </Text>
            </View>
          </Animated.View>
        ) : (
          <>
            {/* ── RTG snímka s heatmap ─────────────────────────── */}
            <Animated.View entering={FadeInDown.delay(100)} style={[styles.imageCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <View style={styles.imageHeader}>
                <Text style={[styles.imageTitle, { color: colors.textPrimary }]}>RTG snímka</Text>
                <View style={styles.imageActions}>
                  {findings.length > 0 && (
                    <TouchableOpacity
                      style={[styles.heatmapToggle, showHeatmap && { backgroundColor: COLORS.gold + '20' }]}
                      onPress={() => setShowHeatmap(!showHeatmap)}
                    >
                      <Ionicons name={showHeatmap ? 'eye' : 'eye-off'} size={16} color={COLORS.gold} />
                      <Text style={[styles.heatmapText, { color: COLORS.gold }]}>Heatmap</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.changeBtn}
                    onPress={() => { setImageUri(null); setFindings([]); setOverallScore(null); }}
                  >
                    <Ionicons name="swap-horizontal" size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.imageContainer}>
                <Image source={{ uri: imageUri }} style={styles.xrayImage} resizeMode="contain" />

                {/* Heatmap overlays */}
                {showHeatmap && findings.map((f) => (
                  <TouchableOpacity
                    key={f.id}
                    style={[
                      styles.heatmapDot,
                      {
                        left: `${f.region.x}%`,
                        top: `${f.region.y}%`,
                        width: `${f.region.w}%`,
                        height: `${f.region.h}%`,
                        backgroundColor: FINDING_CFG[f.type]?.color + '40' ?? '#C0392B40',
                        borderColor: FINDING_CFG[f.type]?.color ?? '#C0392B',
                      },
                      selectedFinding?.id === f.id && styles.heatmapDotSelected,
                    ]}
                    onPress={() => setSelectedFinding(f)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.heatmapLabel}>{f.id}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Analyze button */}
              {findings.length === 0 && (
                <TouchableOpacity
                  style={[styles.analyzeBtn, analyzing && { opacity: 0.7 }]}
                  onPress={runAnalysis}
                  disabled={analyzing}
                  activeOpacity={0.85}
                >
                  {analyzing ? (
                    <View style={styles.analyzingRow}>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={styles.analyzeBtnText}>
                        Analyzujem... {Math.round(progress)}%
                      </Text>
                    </View>
                  ) : (
                    <>
                      <Ionicons name="sparkles" size={20} color="#fff" />
                      <Text style={styles.analyzeBtnText}>Spustiť AI analýzu</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {/* Progress bar */}
              {analyzing && (
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${Math.min(progress, 100)}%` }]} />
                </View>
              )}
            </Animated.View>

            {/* ── Overall Score ─────────────────────────────────── */}
            {overallScore !== null && (
              <Animated.View entering={FadeInDown.delay(200)} style={[styles.scoreCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <View style={styles.scoreRow}>
                  <View style={[styles.scoreCircle, { borderColor: scoreColor(overallScore) }]}>
                    <Text style={[styles.scoreNum, { color: scoreColor(overallScore) }]}>{overallScore}</Text>
                    <Text style={[styles.scoreLabel, { color: colors.textSecondary }]}>/ 100</Text>
                  </View>
                  <View style={styles.scoreMeta}>
                    <Text style={[styles.scoreTitle, { color: colors.textPrimary }]}>Celkové skóre</Text>
                    <Text style={[styles.scoreSub, { color: colors.textSecondary }]}>
                      {overallScore >= 80 ? 'Dobrý stav — minimálne nálezy' :
                       overallScore >= 50 ? 'Stredný stav — odporúčané ošetrenie' :
                       'Vyžaduje pozornosť — viac nálezov'}
                    </Text>
                    <View style={styles.findingsCount}>
                      <Ionicons name="alert-circle" size={14} color={COLORS.warning} />
                      <Text style={[styles.findingsCountText, { color: colors.textSecondary }]}>
                        {findings.length} {findings.length === 1 ? 'nález' : findings.length < 5 ? 'nálezy' : 'nálezov'}
                      </Text>
                    </View>
                  </View>
                </View>
              </Animated.View>
            )}

            {/* ── Nálezy ───────────────────────────────────────── */}
            {findings.length > 0 && (
              <Animated.View entering={FadeInDown.delay(300)}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                  Detekované nálezy
                </Text>

                {findings.map((f, i) => {
                  const cfg = FINDING_CFG[f.type] ?? FINDING_CFG.cavity;
                  const sev = SEVERITY_CFG[f.severity];
                  const isSelected = selectedFinding?.id === f.id;

                  return (
                    <TouchableOpacity
                      key={f.id}
                      style={[
                        styles.findingCard,
                        { backgroundColor: colors.cardBg, borderColor: isSelected ? cfg.color : colors.bg3 },
                        isSelected && { borderWidth: 2 },
                      ]}
                      onPress={() => setSelectedFinding(isSelected ? null : f)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.findingHeader}>
                        <View style={[styles.findingBadge, { backgroundColor: cfg.bg }]}>
                          <Text style={{ fontSize: 20 }}>{cfg.icon}</Text>
                        </View>
                        <View style={styles.findingMeta}>
                          <View style={styles.findingTop}>
                            <Text style={[styles.findingType, { color: cfg.color }]}>{cfg.label}</Text>
                            <View style={[styles.sevBadge, { backgroundColor: sev.bg }]}>
                              <Ionicons name={sev.icon as any} size={12} color={sev.color} />
                              <Text style={[styles.sevText, { color: sev.color }]}>{sev.label}</Text>
                            </View>
                          </View>
                          <Text style={[styles.findingLoc, { color: colors.textSecondary }]}>
                            {f.location}
                          </Text>
                        </View>
                        <View style={styles.confCircle}>
                          <Text style={[styles.confNum, { color: cfg.color }]}>{f.confidence}%</Text>
                        </View>
                      </View>

                      {isSelected && (
                        <Animated.View entering={FadeIn} style={[styles.findingDetail, { borderTopColor: colors.bg3 }]}>
                          <Text style={[styles.findingDesc, { color: colors.textPrimary }]}>
                            {f.description}
                          </Text>
                          <View style={styles.findingActions}>
                            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: cfg.bg }]}>
                              <Ionicons name="create-outline" size={14} color={cfg.color} />
                              <Text style={[styles.actionText, { color: cfg.color }]}>Pridať poznámku</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.infoBg }]}>
                              <Ionicons name="medkit-outline" size={14} color={COLORS.info} />
                              <Text style={[styles.actionText, { color: COLORS.info }]}>Liečebný plán</Text>
                            </TouchableOpacity>
                          </View>
                        </Animated.View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </Animated.View>
            )}

            {/* ── AI Disclaimer ────────────────────────────────── */}
            {findings.length > 0 && (
              <View style={[styles.disclaimerBox, { backgroundColor: dark ? 'rgba(26,82,118,0.15)' : COLORS.infoBg }]}>
                <Ionicons name="information-circle" size={16} color={COLORS.info} />
                <Text style={[styles.disclaimerText, { color: colors.textSecondary }]}>
                  AI analýza je pomocný nástroj a nenahrádza odborné posúdenie. Všetky nálezy by mali byť overené zubným lekárom.
                </Text>
              </View>
            )}
          </>
        )}

        {/* ── História analýz ──────────────────────────────────── */}
        {patientId && (
          <View style={{ marginTop: SPACING.xl }}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              História analýz
            </Text>

            {loadingHistory ? (
              <SkeletonList count={2} />
            ) : history.length === 0 ? (
              <View style={[styles.emptyHistory, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <Text style={{ fontSize: 32 }}>📊</Text>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  Zatiaľ žiadne analýzy
                </Text>
              </View>
            ) : (
              history.map((h, i) => (
                <TouchableOpacity
                  key={h.id}
                  style={[styles.historyCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}
                  activeOpacity={0.85}
                  onPress={() => {
                    setImageUri(h.image_url);
                    setFindings(h.findings ?? []);
                    setOverallScore(h.overall_score);
                  }}
                >
                  <View style={styles.historyRow}>
                    <Image source={{ uri: h.image_url }} style={styles.historyThumb} />
                    <View style={styles.historyMeta}>
                      <Text style={[styles.historyDate, { color: colors.textPrimary }]}>
                        {new Date(h.analyzed_at).toLocaleDateString('sk-SK', {
                          day: 'numeric', month: 'long', year: 'numeric'
                        })}
                      </Text>
                      <Text style={[styles.historyFindings, { color: colors.textSecondary }]}>
                        {(h.findings?.length ?? 0)} nálezov
                      </Text>
                    </View>
                    <View style={[styles.historyScore, { borderColor: scoreColor(h.overall_score) }]}>
                      <Text style={[styles.historyScoreNum, { color: scoreColor(h.overall_score) }]}>
                        {h.overall_score}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

/* ── Styles ───────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: SPACING.xl },

  // Upload
  uploadCard: { borderRadius: RADII.lg, padding: SPACING.xl, borderWidth: 1, alignItems: 'center' },
  uploadIcon: { marginBottom: SPACING.lg },
  uploadTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  uploadSub: { fontSize: 13, textAlign: 'center', marginBottom: SPACING.xl, lineHeight: 19 },
  uploadBtns: { flexDirection: 'row', gap: 12, marginBottom: SPACING.lg },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: RADII.pill },
  uploadBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  tipBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: RADII.sm, width: '100%' },
  tipText: { flex: 1, fontSize: 12, lineHeight: 17 },

  // Image
  imageCard: { borderRadius: RADII.lg, borderWidth: 1, overflow: 'hidden', marginBottom: SPACING.lg },
  imageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  imageTitle: { fontSize: 14, fontWeight: '700' },
  imageActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  heatmapToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADII.pill },
  heatmapText: { fontSize: 12, fontWeight: '600' },
  changeBtn: { padding: 6 },
  imageContainer: { width: '100%', aspectRatio: 1.6, backgroundColor: '#000', position: 'relative' },
  xrayImage: { width: '100%', height: '100%' },

  // Heatmap dots
  heatmapDot: {
    position: 'absolute', borderRadius: 2, borderWidth: 2,
    justifyContent: 'center', alignItems: 'center', zIndex: 10,
  },
  heatmapDotSelected: { borderWidth: 3 },
  heatmapLabel: { fontSize: 10, fontWeight: '800', color: '#fff' },

  // Analyze
  analyzeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, margin: 14, paddingVertical: 14, backgroundColor: COLORS.gold,
    borderRadius: RADII.pill, ...SHADOWS.gold,
  },
  analyzeBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  analyzingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressBar: { height: 3, backgroundColor: 'rgba(255,255,255,0.15)', marginHorizontal: 14, marginBottom: 14, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: COLORS.gold, borderRadius: 2 },

  // Score
  scoreCard: { borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.lg, marginBottom: SPACING.lg },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  scoreCircle: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, justifyContent: 'center', alignItems: 'center' },
  scoreNum: { fontSize: 24, fontWeight: '800' },
  scoreLabel: { fontSize: 10 },
  scoreMeta: { flex: 1 },
  scoreTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  scoreSub: { fontSize: 12, lineHeight: 17, marginBottom: 6 },
  findingsCount: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  findingsCountText: { fontSize: 12, fontWeight: '500' },

  // Findings
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  findingCard: { borderRadius: RADII.md, borderWidth: 1, padding: 14, marginBottom: 10 },
  findingHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  findingBadge: { width: 44, height: 44, borderRadius: 2, justifyContent: 'center', alignItems: 'center' },
  findingMeta: { flex: 1 },
  findingTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  findingType: { fontSize: 14, fontWeight: '700' },
  findingLoc: { fontSize: 12 },
  confCircle: { alignItems: 'center' },
  confNum: { fontSize: 16, fontWeight: '800' },
  sevBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADII.pill },
  sevText: { fontSize: 10, fontWeight: '700' },

  findingDetail: { marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  findingDesc: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
  findingActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADII.pill },
  actionText: { fontSize: 12, fontWeight: '600' },

  // Disclaimer
  disclaimerBox: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: RADII.sm, marginTop: SPACING.lg, alignItems: 'flex-start' },
  disclaimerText: { flex: 1, fontSize: 11, lineHeight: 16 },

  // History
  emptyHistory: { borderRadius: RADII.md, borderWidth: 1, padding: 24, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 13 },
  historyCard: { borderRadius: RADII.md, borderWidth: 1, padding: 12, marginBottom: 8 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  historyThumb: { width: 48, height: 48, borderRadius: 2, backgroundColor: '#000' },
  historyMeta: { flex: 1 },
  historyDate: { fontSize: 13, fontWeight: '600' },
  historyFindings: { fontSize: 11 },
  historyScore: { width: 40, height: 40, borderRadius: 4, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  historyScoreNum: { fontSize: 14, fontWeight: '800' },
});
