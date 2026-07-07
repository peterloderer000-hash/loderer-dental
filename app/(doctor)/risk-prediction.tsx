/**
 * AI Predikcia rizík — doktor
 * Analyzuje zdravotný dotazník, históriu a zubnú kartu → vypočíta rizikové skóre
 */
import React, { useState, useCallback } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII, SHADOWS } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';

/* ── Types ────────────────────────────────────────────────────────── */
type RiskFactor = {
  id: string;
  category: string;
  factor: string;
  impact: 'positive' | 'negative' | 'neutral';
  weight: number; // 1-10
};

type Recommendation = {
  id: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  icon: string;
};

type Prediction = {
  cavity_risk: number;
  periodontal_risk: number;
  erosion_risk: number;
  overall_risk: number;
  risk_factors: RiskFactor[];
  recommendations: Recommendation[];
  next_visit_days: number;
};

/* ── Konfigurácia ────────────────────────────────────────────────── */
const RISK_COLORS = {
  low: '#2E7D5E',
  medium: '#B87333',
  high: '#C0392B',
};

function riskLevel(score: number): 'low' | 'medium' | 'high' {
  if (score < 35) return 'low';
  if (score < 65) return 'medium';
  return 'high';
}

function riskColor(score: number) { return RISK_COLORS[riskLevel(score)]; }
function riskLabel(score: number) {
  const l = riskLevel(score);
  return l === 'low' ? 'Nízke' : l === 'medium' ? 'Stredné' : 'Vysoké';
}

/* ── Simulácia AI predikcie ──────────────────────────────────────── */
async function generatePrediction(patientId: string): Promise<Prediction> {
  // Načítanie dát pacienta
  const [passportRes, chartsRes, appointmentsRes] = await Promise.all([
    supabase.from('health_passports').select('*').eq('patient_id', patientId).maybeSingle(),
    supabase.from('dental_charts').select('*').eq('patient_id', patientId),
    supabase.from('appointments').select('*').eq('patient_id', patientId).order('date', { ascending: false }).limit(5),
  ]);

  const passport = passportRes.data;
  const charts = chartsRes.data ?? [];
  const appointments = appointmentsRes.data ?? [];

  // Analýza rizikových faktorov
  const factors: RiskFactor[] = [];
  let cavityBase = 30, perioBase = 25, erosionBase = 20;

  // Analýza zubnej karty
  const cavities = charts.filter(c => c.status === 'cavity').length;
  const fillings = charts.filter(c => c.status === 'filled' || c.status === 'filling').length;

  if (cavities > 3) {
    factors.push({ id: 'f1', category: 'dental', factor: `${cavities} aktívnych kariésov`, impact: 'negative', weight: 8 });
    cavityBase += 25;
  } else if (cavities > 0) {
    factors.push({ id: 'f1b', category: 'dental', factor: `${cavities} aktívny kariés`, impact: 'negative', weight: 5 });
    cavityBase += 12;
  }

  if (fillings > 5) {
    factors.push({ id: 'f2', category: 'dental', factor: `${fillings} výplní — vyššie riziko sekundárneho kariésu`, impact: 'negative', weight: 4 });
    cavityBase += 8;
  }

  // Analýza zdravotného dotazníka
  if (passport) {
    if (passport.allergies) {
      factors.push({ id: 'f3', category: 'medical', factor: 'Alergie — obmedzené liečebné možnosti', impact: 'negative', weight: 3 });
    }
    if (passport.is_pregnant) {
      factors.push({ id: 'f4', category: 'medical', factor: 'Tehotenstvo — zvýšené riziko gingivitídy', impact: 'negative', weight: 6 });
      perioBase += 15;
    }
    if (passport.medical_history?.includes('Diabetes')) {
      factors.push({ id: 'f5', category: 'medical', factor: 'Diabetes — výrazne zvýšené parodontálne riziko', impact: 'negative', weight: 9 });
      perioBase += 25;
    }
    if (passport.lifestyle_habits?.includes('Fajčenie')) {
      factors.push({ id: 'f6', category: 'lifestyle', factor: 'Fajčenie — riziko paradontózy a orálneho karcinómu', impact: 'negative', weight: 9 });
      perioBase += 20;
      cavityBase += 10;
    }
    if (passport.lifestyle_habits?.includes('Vysoký príjem cukru')) {
      factors.push({ id: 'f7', category: 'lifestyle', factor: 'Vysoký príjem cukru', impact: 'negative', weight: 7 });
      cavityBase += 15;
      erosionBase += 10;
    }
    if (passport.lifestyle_habits?.includes('Pravidelné čistenie nití')) {
      factors.push({ id: 'f8', category: 'lifestyle', factor: 'Používanie medzizubných kefiek', impact: 'positive', weight: 5 });
      perioBase -= 8;
      cavityBase -= 5;
    }
    if (passport.fear_level === 'Veľký strach') {
      factors.push({ id: 'f9', category: 'behavioral', factor: 'Dentálna fóbia — riziko odkladania liečby', impact: 'negative', weight: 6 });
      cavityBase += 10;
    }
  }

  // Frekvencia návštev
  if (appointments.length === 0) {
    factors.push({ id: 'f10', category: 'visits', factor: 'Žiadna predchádzajúca návšteva', impact: 'negative', weight: 7 });
    cavityBase += 15;
    perioBase += 10;
  } else {
    const lastVisit = new Date(appointments[0]?.date);
    const daysSince = Math.floor((Date.now() - lastVisit.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince > 365) {
      factors.push({ id: 'f11', category: 'visits', factor: `Posledná návšteva pred ${Math.round(daysSince/30)} mesiacmi`, impact: 'negative', weight: 6 });
      cavityBase += 12;
    } else if (daysSince < 180) {
      factors.push({ id: 'f12', category: 'visits', factor: 'Pravidelné návštevy', impact: 'positive', weight: 5 });
      cavityBase -= 10;
      perioBase -= 8;
    }
  }

  // Clamp values
  const cavity_risk = Math.max(5, Math.min(95, cavityBase));
  const periodontal_risk = Math.max(5, Math.min(95, perioBase));
  const erosion_risk = Math.max(5, Math.min(95, erosionBase));
  const overall_risk = Math.round((cavity_risk * 0.4 + periodontal_risk * 0.35 + erosion_risk * 0.25));

  // Generovanie odporúčaní
  const recommendations: Recommendation[] = [];

  if (cavity_risk > 50) {
    recommendations.push({
      id: 'r1', priority: 'high', title: 'Fluoridácia',
      description: 'Odporúčaná profesionálna fluoridácia na zníženie rizika kariésu.',
      icon: 'flask-outline',
    });
  }
  if (periodontal_risk > 40) {
    recommendations.push({
      id: 'r2', priority: cavity_risk > 60 ? 'high' : 'medium', title: 'Profesionálna hygiena',
      description: 'Pravidelné čistenie zubného kameňa a plaku každých 3-4 mesiace.',
      icon: 'sparkles-outline',
    });
  }
  if (erosion_risk > 35) {
    recommendations.push({
      id: 'r3', priority: 'medium', title: 'Diétne poradenstvo',
      description: 'Obmedzenie kyslých nápojov a potravín. Používanie slamky.',
      icon: 'nutrition-outline',
    });
  }
  recommendations.push({
    id: 'r4', priority: 'low', title: 'Domáca starostlivosť',
    description: 'Čistenie 2× denne, medzizubné kefky, ústna voda s fluoridom.',
    icon: 'home-outline',
  });

  // Smart recall — odporúčaný interval ďalšej návštevy
  const next_visit_days = overall_risk > 60 ? 90 : overall_risk > 35 ? 150 : 180;

  return {
    cavity_risk, periodontal_risk, erosion_risk, overall_risk,
    risk_factors: factors, recommendations, next_visit_days,
  };
}

/* ── Risk Gauge Component ────────────────────────────────────────── */
function RiskGauge({ label, score, icon, colors: c }: { label: string; score: number; icon: string; colors: any }) {
  const color = riskColor(score);
  return (
    <View style={[s.gaugeCard, { backgroundColor: c.cardBg, borderColor: c.bg3 }]}>
      <View style={[s.gaugeCircle, { borderColor: color }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={[s.gaugeLabel, { color: c.textSecondary }]}>{label}</Text>
      <Text style={[s.gaugeScore, { color }]}>{score}%</Text>
      <View style={[s.gaugeBar, { backgroundColor: c.bg3 }]}>
        <View style={[s.gaugeFill, { width: `${score}%`, backgroundColor: color }]} />
      </View>
      <Text style={[s.gaugeLevel, { color }]}>{riskLabel(score)}</Text>
    </View>
  );
}

/* ── Hlavný komponent ────────────────────────────────────────────── */
export default function RiskPrediction() {
  const router = useRouter();
  const { patientId, patientName } = useLocalSearchParams<{ patientId: string; patientName: string }>();
  const { colors, dark } = useAppTheme();

  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    if (!patientId) { setLoading(false); return; }
    try {
      const { data } = await supabase
        .from('risk_predictions')
        .select('*')
        .eq('patient_id', patientId)
        .order('predicted_at', { ascending: false })
        .limit(5);

      if (data && data.length > 0) {
        const latest = data[0];
        setPrediction({
          cavity_risk: latest.cavity_risk,
          periodontal_risk: latest.periodontal_risk,
          erosion_risk: latest.erosion_risk,
          overall_risk: latest.overall_risk,
          risk_factors: latest.risk_factors ?? [],
          recommendations: latest.recommendations ?? [],
          next_visit_days: latest.next_visit_recommended
            ? Math.floor((new Date(latest.next_visit_recommended).getTime() - Date.now()) / (1000*60*60*24))
            : 180,
        });
        setHistory(data.slice(1));
      }
    } catch (e) {
      console.error('Error loading risk predictions:', e);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  async function runPrediction() {
    if (!patientId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setGenerating(true);
    try {
      const pred = await generatePrediction(patientId);
      setPrediction(pred);

      // Uloženie
      const nextVisitDate = new Date();
      nextVisitDate.setDate(nextVisitDate.getDate() + pred.next_visit_days);

      await supabase.from('risk_predictions').insert({
        patient_id: patientId,
        cavity_risk: pred.cavity_risk,
        periodontal_risk: pred.periodontal_risk,
        erosion_risk: pred.erosion_risk,
        overall_risk: pred.overall_risk,
        risk_factors: pred.risk_factors,
        recommendations: pred.recommendations,
        next_visit_recommended: nextVisitDate.toISOString().split('T')[0],
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.error('Risk prediction error:', e);
    } finally {
      setGenerating(false);
    }
  }

  const PRIORITY_CFG = {
    high:   { label: 'Urgentné', color: COLORS.error, bg: COLORS.errorBg, icon: 'alert-circle' },
    medium: { label: 'Dôležité', color: COLORS.warning, bg: COLORS.warningBg, icon: 'warning' },
    low:    { label: 'Bežné',    color: COLORS.success, bg: COLORS.successBg, icon: 'checkmark-circle' },
  };

  return (
    <View style={[s.safe, { backgroundColor: colors.esp }]}>
      <HeroHeader
        title="AI Predikcia rizík"
        subtitle={patientName ?? 'Pacient'}
        icon="analytics-outline"
        onBack={() => router.back()}
      />

      <ScrollView style={[s.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}>

        {loading ? (
          <SkeletonList count={4} />
        ) : !prediction ? (
          /* ── Žiadna predikcia ───────────────────────────── */
          <Animated.View entering={FadeInDown} style={[s.emptyCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Text style={{ fontSize: 48, marginBottom: 14 }}>🧠</Text>
            <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>AI Analýza rizík</Text>
            <Text style={[s.emptySub, { color: colors.textSecondary }]}>
              Na základe zubnej karty, zdravotného dotazníka a histórie návštev AI vypočíta personalizované rizikové skóre.
            </Text>
            <TouchableOpacity
              style={[s.generateBtn, generating && { opacity: 0.7 }]}
              onPress={runPrediction} disabled={generating} activeOpacity={0.85}
            >
              {generating ? (
                <ActivityIndicator size="small" color="#F5F6F8" />
              ) : (
                <Ionicons name="sparkles" size={20} color="#F5F6F8" />
              )}
              <Text style={s.generateBtnText}>
                {generating ? 'Analyzujem...' : 'Generovať predikciu'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <>
            {/* ── Overall Risk ────────────────────────────── */}
            <Animated.View entering={FadeInDown.delay(100)}
              style={[s.overallCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <View style={[s.overallCircle, { borderColor: riskColor(prediction.overall_risk) }]}>
                <Text style={[s.overallNum, { color: riskColor(prediction.overall_risk) }]}>
                  {prediction.overall_risk}
                </Text>
                <Text style={[s.overallPct, { color: colors.textSecondary }]}>/ 100</Text>
              </View>
              <Text style={[s.overallLabel, { color: colors.textPrimary }]}>Celkové riziko</Text>
              <Text style={[s.overallLevel, { color: riskColor(prediction.overall_risk) }]}>
                {riskLabel(prediction.overall_risk)} riziko
              </Text>
              <View style={[s.nextVisitBadge, { backgroundColor: dark ? 'rgba(201,168,76,0.1)' : '#FDF3E7' }]}>
                <Ionicons name="calendar-outline" size={14} color={COLORS.gold} />
                <Text style={[s.nextVisitText, { color: COLORS.gold }]}>
                  Odporúčaná návšteva za {prediction.next_visit_days} dní
                </Text>
              </View>
            </Animated.View>

            {/* ── Risk Gauges ─────────────────────────────── */}
            <Animated.View entering={FadeInDown.delay(200)} style={s.gaugesRow}>
              <RiskGauge label="Kariés" score={prediction.cavity_risk} icon="ellipse" colors={colors} />
              <RiskGauge label="Paradontóza" score={prediction.periodontal_risk} icon="git-branch-outline" colors={colors} />
              <RiskGauge label="Erózia" score={prediction.erosion_risk} icon="water-outline" colors={colors} />
            </Animated.View>

            {/* ── Rizikové faktory ────────────────────────── */}
            {prediction.risk_factors.length > 0 && (
              <Animated.View entering={FadeInDown.delay(300)}>
                <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Rizikové faktory</Text>
                {prediction.risk_factors.map((f) => (
                  <View key={f.id} style={[s.factorRow, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                    <View style={[s.factorIcon, {
                      backgroundColor: f.impact === 'positive' ? COLORS.successBg :
                                       f.impact === 'negative' ? COLORS.errorBg : COLORS.warningBg
                    }]}>
                      <Ionicons
                        name={f.impact === 'positive' ? 'checkmark-circle' : f.impact === 'negative' ? 'close-circle' : 'remove-circle'}
                        size={16}
                        color={f.impact === 'positive' ? COLORS.success : f.impact === 'negative' ? COLORS.error : COLORS.warning}
                      />
                    </View>
                    <Text style={[s.factorText, { color: colors.textPrimary }]}>{f.factor}</Text>
                    <View style={[s.weightBadge, {
                      backgroundColor: f.impact === 'negative' ? COLORS.errorBg : COLORS.successBg
                    }]}>
                      <Text style={[s.weightText, {
                        color: f.impact === 'negative' ? COLORS.error : COLORS.success
                      }]}>{f.impact === 'positive' ? '-' : '+'}{f.weight}</Text>
                    </View>
                  </View>
                ))}
              </Animated.View>
            )}

            {/* ── Odporúčania ────────────────────────────── */}
            <Animated.View entering={FadeInDown.delay(400)}>
              <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Odporúčania</Text>
              {prediction.recommendations.map((r) => {
                const cfg = PRIORITY_CFG[r.priority];
                return (
                  <View key={r.id} style={[s.recCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                    <View style={s.recHeader}>
                      <View style={[s.recIconBox, { backgroundColor: cfg.bg }]}>
                        <Ionicons name={r.icon as any} size={20} color={cfg.color} />
                      </View>
                      <View style={s.recMeta}>
                        <Text style={[s.recTitle, { color: colors.textPrimary }]}>{r.title}</Text>
                        <View style={[s.recPriority, { backgroundColor: cfg.bg }]}>
                          <Ionicons name={cfg.icon as any} size={10} color={cfg.color} />
                          <Text style={[s.recPriorityText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                      </View>
                    </View>
                    <Text style={[s.recDesc, { color: colors.textSecondary }]}>{r.description}</Text>
                  </View>
                );
              })}
            </Animated.View>

            {/* ── Regenerovať ─────────────────────────────── */}
            <TouchableOpacity
              style={[s.regenBtn, { borderColor: COLORS.gold }]}
              onPress={runPrediction} disabled={generating} activeOpacity={0.85}
            >
              {generating ? <ActivityIndicator size="small" color={COLORS.gold} /> :
                <Ionicons name="refresh" size={18} color={COLORS.gold} />}
              <Text style={[s.regenText, { color: COLORS.gold }]}>Aktualizovať predikciu</Text>
            </TouchableOpacity>

            {/* ── Disclaimer ──────────────────────────────── */}
            <View style={[s.disclaimer, { backgroundColor: dark ? 'rgba(26,82,118,0.15)' : COLORS.infoBg }]}>
              <Ionicons name="information-circle" size={14} color={COLORS.info} />
              <Text style={[s.disclaimerText, { color: colors.textSecondary }]}>
                AI predikcia je pomocný nástroj. Klinické rozhodnutia vždy záležia na odbornom posúdení lekára.
              </Text>
            </View>
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

/* ── Styles ───────────────────────────────────────────────────────── */
const s = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: SPACING.xl },

  emptyCard: { borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.xl, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: SPACING.xl },
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 24,
    paddingVertical: 14, backgroundColor: COLORS.gold, borderRadius: RADII.pill, ...SHADOWS.gold,
  },
  generateBtnText: { color: '#F5F6F8', fontWeight: '700', fontSize: 15 },

  overallCard: { borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.xl, alignItems: 'center', marginBottom: SPACING.lg },
  overallCircle: { width: 100, height: 100, borderRadius: 20, borderWidth: 4, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  overallNum: { fontSize: 32, fontWeight: '800' },
  overallPct: { fontSize: 12 },
  overallLabel: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  overallLevel: { fontSize: 14, fontWeight: '600', marginBottom: 12 },
  nextVisitBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADII.pill },
  nextVisitText: { fontSize: 12, fontWeight: '600' },

  gaugesRow: { flexDirection: 'row', gap: 10, marginBottom: SPACING.xl },
  gaugeCard: { flex: 1, borderRadius: RADII.md, borderWidth: 1, padding: 12, alignItems: 'center' },
  gaugeCircle: { width: 44, height: 44, borderRadius: 4, borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  gaugeLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  gaugeScore: { fontSize: 20, fontWeight: '800', marginBottom: 6 },
  gaugeBar: { width: '100%', height: 4, borderRadius: 2, overflow: 'hidden', marginBottom: 4 },
  gaugeFill: { height: '100%', borderRadius: 2 },
  gaugeLevel: { fontSize: 10, fontWeight: '700' },

  sectionTitle: { fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12, marginTop: 8 },

  factorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: RADII.sm, borderWidth: 1, marginBottom: 6 },
  factorIcon: { width: 28, height: 28, borderRadius: 2, justifyContent: 'center', alignItems: 'center' },
  factorText: { flex: 1, fontSize: 13, lineHeight: 17 },
  weightBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADII.pill },
  weightText: { fontSize: 11, fontWeight: '700' },

  recCard: { borderRadius: RADII.md, borderWidth: 1, padding: 14, marginBottom: 10 },
  recHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  recIconBox: { width: 40, height: 40, borderRadius: 2, justifyContent: 'center', alignItems: 'center' },
  recMeta: { flex: 1 },
  recTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  recPriority: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADII.pill, alignSelf: 'flex-start' },
  recPriorityText: { fontSize: 10, fontWeight: '700' },
  recDesc: { fontSize: 12, lineHeight: 17 },

  regenBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: RADII.pill, borderWidth: 1.5, marginTop: SPACING.lg },
  regenText: { fontSize: 14, fontWeight: '600' },

  disclaimer: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: RADII.sm, marginTop: SPACING.lg, alignItems: 'flex-start' },
  disclaimerText: { flex: 1, fontSize: 11, lineHeight: 16 },
});
