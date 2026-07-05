import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Easing, RefreshControl, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../supabase';
import { COLORS, RADII, SHADOWS, TYPO, GRADIENTS, SPACING } from '../../styles/theme';
import { useAppTheme } from '../../context/ThemeContext';
import { SkeletonList } from '../../components/Skeleton';

// ─── Typy ─────────────────────────────────────────────────────────────────────
type ToothStatus =
  | 'healthy' | 'cavity' | 'early_cavity' | 'watch'
  | 'filled' | 'large_filling' | 'replace_filling'
  | 'crown' | 'bridge' | 'implant' | 'veneer' | 'sealant'
  | 'root_canal' | 'extracted' | 'missing'
  | 'fracture' | 'erosion' | 'abrasion'
  | 'hypoplasia' | 'hypomineralization'
  | 'periodontal' | 'mobility'
  | 'improve_hygiene' | 'treatment_needed';

type ToothRecord = { tooth_number: number; status: ToothStatus; notes: string | null };
type ApptRow = {
  id: string; appointment_date: string; status: string;
  service: { name: string; emoji: string | null } | null;
};

// ─── Scoring ──────────────────────────────────────────────────────────────────
function getWeight(n: number) {
  const p = n % 10;
  if (p === 6 || p === 7) return 3;
  if (p === 4 || p === 5) return 2;
  if (p === 3) return 1.5;
  if (p === 8) return 0.5;
  return 1;
}
function isFront(n: number) { const p = n % 10; return p >= 1 && p <= 3; }

const HEALTH_DED: Partial<Record<ToothStatus, number>> = {
  cavity: 15, early_cavity: 8, root_canal: 10, extracted: 14,
  missing: 10, fracture: 12, periodontal: 10, mobility: 8,
};
const AESTH_DED: Partial<Record<ToothStatus, number>> = {
  cavity: 18, early_cavity: 10, extracted: 22, missing: 20,
  root_canal: 12, erosion: 8, abrasion: 6, hypoplasia: 7, hypomineralization: 7, fracture: 14,
};
const HYG_DED: Partial<Record<ToothStatus, number>> = {
  watch: 5, improve_hygiene: 12, large_filling: 4, early_cavity: 8, treatment_needed: 10,
};
const HYG_BONUS: Partial<Record<ToothStatus, number>> = { sealant: 4, filled: 1 };

function calcHealth(t: ToothRecord[]): number {
  if (!t.length) return 70;
  let d = 0, h = 0;
  t.forEach(r => { d += (HEALTH_DED[r.status] ?? 0) * getWeight(r.tooth_number); if (r.status === 'healthy') h++; });
  return Math.max(0, Math.min(100, Math.round(100 - d + Math.min(15, h * 0.8))));
}
function calcAesthetics(t: ToothRecord[]): number {
  const f = t.filter(r => isFront(r.tooth_number));
  if (!f.length) return 75;
  let s = 100, h = 0;
  f.forEach(r => { s -= AESTH_DED[r.status] ?? 0; if (r.status === 'healthy') h++; });
  return Math.max(0, Math.min(100, Math.round(s + Math.min(8, h * 1.5))));
}
function calcHygiene(t: ToothRecord[], hasPassport: boolean, completed: number): number {
  if (!t.length) return hasPassport ? 60 : 50;
  let s = 100;
  t.forEach(r => { s -= HYG_DED[r.status] ?? 0; s += HYG_BONUS[r.status] ?? 0; });
  if (hasPassport) s += 5;
  s += Math.min(10, completed * 3);
  return Math.max(0, Math.min(100, Math.round(s)));
}
function calcPrevention(hasPassport: boolean, hasAppt: boolean, completed: number, hasChart: boolean): number {
  let s = 0;
  if (hasChart) s += 25; if (hasPassport) s += 25; if (hasAppt) s += 20;
  s += Math.min(30, completed * 8);
  return Math.min(100, s);
}
function overall(h: number, a: number, hy: number, p: number) {
  return Math.round(h * 0.40 + a * 0.20 + hy * 0.25 + p * 0.15);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function scoreColor(s: number) {
  if (s >= 80) return COLORS.success;
  if (s >= 65) return '#27AE60';
  if (s >= 50) return COLORS.warning;
  return COLORS.error;
}
function scoreLabel(s: number) {
  if (s >= 80) return 'Výborný chrup';
  if (s >= 65) return 'Dobrý stav';
  if (s >= 50) return 'Priemerný stav';
  return 'Vyžaduje pozornosť';
}
function grade(s: number) { return s >= 85 ? 'A' : s >= 70 ? 'B' : s >= 50 ? 'C' : 'D'; }
function gradeColor(s: number) {
  return s >= 85 ? COLORS.success : s >= 70 ? '#9A7D0A' : s >= 50 ? COLORS.warning : COLORS.error;
}

const STATUS_DISPLAY: Partial<Record<ToothStatus, { label: string; color: string; emoji: string }>> = {
  healthy:         { label: 'Zdravý',        color: COLORS.success, emoji: '✅' },
  cavity:          { label: 'Kaz',           color: COLORS.error,   emoji: '🔴' },
  early_cavity:    { label: 'Začín. kaz',    color: '#CB4335',      emoji: '🟠' },
  filled:          { label: 'Plomba',        color: '#9A7D0A',      emoji: '🟡' },
  large_filling:   { label: 'Veľká plomba',  color: '#7D6608',      emoji: '🟤' },
  crown:           { label: 'Korunka',       color: COLORS.info,    emoji: '👑' },
  implant:         { label: 'Implantát',     color: '#117A65',      emoji: '🔩' },
  bridge:          { label: 'Mostík',        color: '#154360',      emoji: '🌉' },
  root_canal:      { label: 'Devitalizácia', color: '#7D3C98',      emoji: '🟣' },
  extracted:       { label: 'Extrahovaný',   color: '#566573',      emoji: '⚫' },
  missing:         { label: 'Chýba',         color: '#AAB7B8',      emoji: '⬜' },
  watch:           { label: 'Pozorovanie',   color: COLORS.warning,  emoji: '👁' },
  periodontal:     { label: 'Parodont.',     color: COLORS.error,   emoji: '🦷' },
  improve_hygiene: { label: 'Zlepš hygienu', color: COLORS.info,    emoji: '🪥' },
  treatment_needed:{ label: 'Na prerobenie', color: '#F39C12',      emoji: '🔧' },
  fracture:        { label: 'Fraktúra',      color: '#E74C3C',      emoji: '💥' },
};

// ─── Animated score ring ──────────────────────────────────────────────────────
function ScoreRing({ score, size = 180 }: { score: number; size?: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    anim.addListener(({ value }) => setDisplay(Math.round(value)));
    Animated.timing(anim, {
      toValue: score, duration: 1400,
      easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();
    return () => anim.removeAllListeners();
  }, [score]);

  const col   = scoreColor(score);
  const stroke = 14;
  const inner  = size - stroke * 2;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Track ring */}
      <View style={{
        position: 'absolute', width: size, height: size,
        borderRadius: size / 2, borderWidth: stroke, borderColor: 'rgba(255,255,255,0.10)',
      }} />
      {/* Fill arc approximation — gradient ring cap */}
      <Animated.View style={{
        position: 'absolute',
        width: size, height: size,
        borderRadius: size / 2,
        borderWidth: stroke,
        borderColor: 'transparent',
        borderTopColor: col,
        borderRightColor: anim.interpolate({ inputRange: [0, 50, 100], outputRange: ['transparent', col, col] }),
        borderBottomColor: anim.interpolate({ inputRange: [0, 75, 100], outputRange: ['transparent', 'transparent', col] }),
        transform: [{ rotate: '-90deg' }],
      }} />
      {/* Inner glow */}
      <View style={{
        position: 'absolute',
        width: inner - 16, height: inner - 16,
        borderRadius: (inner - 16) / 2,
        backgroundColor: col + '12',
      }} />
      {/* Center text */}
      <View style={{ alignItems: 'center' }}>
        <Text style={{ fontFamily: 'PlayfairDisplay_700Bold', fontSize: size * 0.22, color: '#F8F6F2', lineHeight: size * 0.26 }}>
          {display}
        </Text>
        <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: size * 0.08, color: 'rgba(196,168,130,0.7)', letterSpacing: 0.5 }}>
          / 100
        </Text>
      </View>
    </View>
  );
}

// ─── Sub-score card ───────────────────────────────────────────────────────────
function SubScoreCard({ label, score, emoji, colors }: {
  label: string; score: number; emoji: string; colors: any;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: score / 100, duration: 800, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [score]);

  const col = scoreColor(score);
  const g   = grade(score);

  return (
    <View style={[sub.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, SHADOWS.sm]}>
      <Text style={sub.emoji}>{emoji}</Text>
      <Text style={[sub.value, { color: col }]}>{score}</Text>
      <Animated.View style={[sub.bar, { width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }), backgroundColor: col }]} />
      <Text style={[sub.label, { color: colors.textSecondary }]} numberOfLines={1}>{label}</Text>
      <View style={[sub.grade, { backgroundColor: col }]}>
        <Text style={sub.gradeText}>{g}</Text>
      </View>
    </View>
  );
}

// ─── Dimension bar ────────────────────────────────────────────────────────────
function DimBar({ label, score, emoji, colors }: { label: string; score: number; emoji: string; colors: any }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: score, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [score]);

  const col = scoreColor(score);
  const g   = grade(score);
  const gc  = gradeColor(score);

  return (
    <View style={db.row}>
      <Text style={db.emoji}>{emoji}</Text>
      <Text style={[db.label, { color: colors.textPrimary }]}>{label}</Text>
      <View style={[db.track, { backgroundColor: colors.bg3 }]}>
        <Animated.View style={[db.fill, {
          width: anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
          backgroundColor: col,
        }]} />
      </View>
      <Text style={[db.score, { color: gc }]}>{score}</Text>
      <View style={[db.badge, { backgroundColor: gc }]}>
        <Text style={db.badgeText}>{g}</Text>
      </View>
    </View>
  );
}

// ─── Tip card ──────────────────────────────────────────────────────────────────
function TipCard({ icon, title, sub, color, colors }: { icon: string; title: string; sub: string; color: string; colors: any }) {
  return (
    <View style={[tip.card, { backgroundColor: colors.bg2, borderLeftColor: color }]}>
      <View style={[tip.iconWrap, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[tip.title, { color }]}>{title}</Text>
        <Text style={[tip.sub, { color: colors.textSecondary }]}>{sub}</Text>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function ScoreScreen() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();

  const [teeth,        setTeeth]        = useState<ToothRecord[]>([]);
  const [appointments, setAppointments] = useState<ApptRow[]>([]);
  const [hasPassport,  setHasPassport]  = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const [teethRes, apptRes, ppRes] = await Promise.all([
      supabase.from('dental_charts').select('tooth_number,status,notes').eq('patient_id', user.id),
      supabase.from('appointments')
        .select('id,appointment_date,status,service:services(name,emoji)')
        .eq('patient_id', user.id)
        .order('appointment_date', { ascending: false }),
      supabase.from('health_passports').select('id').eq('patient_id', user.id).maybeSingle(),
    ]);

    setTeeth((teethRes.data ?? []) as ToothRecord[]);
    setAppointments((apptRes.data ?? []) as unknown as ApptRow[]);
    setHasPassport(!!ppRes.data);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const sc = useMemo(() => {
    const completed = appointments.filter(a => a.status === 'completed').length;
    const hasAppt   = appointments.length > 0;
    const hasChart  = teeth.length > 0;
    const h  = calcHealth(teeth);
    const hy = calcHygiene(teeth, hasPassport, completed);
    const a  = calcAesthetics(teeth);
    const p  = calcPrevention(hasPassport, hasAppt, completed, hasChart);
    return { health: h, hygiene: hy, aesthetics: a, prevention: p, overall: overall(h, a, hy, p) };
  }, [teeth, appointments, hasPassport]);

  const statusCounts = useMemo(() => {
    const m: Partial<Record<ToothStatus, number>> = {};
    teeth.forEach(t => { m[t.status] = (m[t.status] ?? 0) + 1; });
    return m;
  }, [teeth]);

  const tips = useMemo(() => {
    const list: { icon: string; title: string; sub: string; color: string }[] = [];
    const cavities    = (statusCounts['cavity'] ?? 0) + (statusCounts['early_cavity'] ?? 0);
    const hygieneIss  = statusCounts['improve_hygiene'] ?? 0;
    const watching    = statusCounts['watch'] ?? 0;
    const periodontal = (statusCounts['periodontal'] ?? 0) + (statusCounts['mobility'] ?? 0);
    const treatNeeded = statusCounts['treatment_needed'] ?? 0;
    const completed   = appointments.filter(a => a.status === 'completed').length;
    const lastVisit   = appointments.find(a => a.status === 'completed');
    const monthsSince = lastVisit
      ? Math.round((Date.now() - new Date(lastVisit.appointment_date).getTime()) / (1000*60*60*24*30))
      : 999;

    if (cavities > 0)      list.push({ icon:'warning-outline',       title:`${cavities} ${cavities===1?'kaz':'kazov'} vyžaduje ošetrenie`,    sub:'Čím skôr ošetríte kaz, tým menej invazívny bude zákrok.', color: COLORS.error });
    if (hygieneIss > 0)    list.push({ icon:'warning-outline',       title:'Zlepšiť hygienu',      sub:'Odporúčame elektrický kefár a dentálnu niť 2× denne.', color: COLORS.info });
    if (periodontal > 0)   list.push({ icon:'alert-circle-outline',  title:'Parodontálny problém', sub:'Navštívte doktora — dásne si vyžadujú pozornosť.', color: COLORS.error });
    if (treatNeeded > 0)   list.push({ icon:'construct-outline',     title:`${treatNeeded} zub${treatNeeded>1?'y':''} na prerobenie`, sub:'Konzultujte s doktorom plán ošetrenia.', color: COLORS.warning });
    if (watching > 0)      list.push({ icon:'eye-outline',           title:`${watching} zub${watching>1?'y':''} na pozorovanie`, sub:'Odporúčame kontrolu každých 3–6 mesiacov.', color: COLORS.warning });
    if (!hasPassport)      list.push({ icon:'document-text-outline', title:'Vyplňte zdravotný dotazník', sub:'Pomôže nám poskytnúť vám bezpečnejšiu starostlivosť.', color: COLORS.info });
    if (monthsSince > 6 || completed === 0)
                           list.push({ icon:'calendar-outline',      title:'Preventívna prehliadka', sub:`Každých 6 mesiacov${completed>0?`. Posledná pred ${monthsSince} mes.`:'. Ešte ste nás nenavštívili.'}`, color: COLORS.success });
    if (sc.overall >= 85)  list.push({ icon:'star-outline',          title:'Skvelá starostlivosť!', sub:'Pokračujte — vidíme sa o 6 mesiacov na prehliadke.', color: COLORS.success });
    return list.slice(0, 5);
  }, [statusCounts, appointments, hasPassport, sc.overall]);

  const recentAppts = useMemo(
    () => appointments.filter(a => a.status === 'completed').slice(0, 3),
    [appointments]
  );

  // ── Achievementy ──────────────────────────────────────────────────────────
  const achievements = useMemo(() => {
    const completed = appointments.filter(a => a.status === 'completed').length;
    const lastVisit = appointments.find(a => a.status === 'completed');
    const monthsSince = lastVisit
      ? Math.round((Date.now() - new Date(lastVisit.appointment_date).getTime()) / (1000*60*60*24*30))
      : 999;
    return [
      { key: 'first',    emoji: '🦷', title: 'Prvá návšteva',         desc: 'Ste v systéme!',                       unlocked: completed >= 1 },
      { key: 'regular',  emoji: '📅', title: 'Pravidelný pacient',     desc: '5+ dokončených termínov',              unlocked: completed >= 5 },
      { key: 'loyal',    emoji: '🏆', title: 'Verný pacient',          desc: '10+ dokončených termínov',             unlocked: completed >= 10 },
      { key: 'score75',  emoji: '🌟', title: 'Zdravé zuby',            desc: 'Dentálne skóre ≥ 75',                  unlocked: sc.overall >= 75 },
      { key: 'score90',  emoji: '💎', title: 'Výborná starostlivosť',  desc: 'Dentálne skóre ≥ 90',                  unlocked: sc.overall >= 90 },
      { key: 'passport', emoji: '📋', title: 'Zdravotný pas vyplnený', desc: 'Kompletné zdravotné informácie',       unlocked: hasPassport },
      { key: 'fresh',    emoji: '✨', title: 'Čerstvá prehliadka',     desc: 'Návšteva v posledných 6 mesiacoch',    unlocked: monthsSince <= 6 && completed > 0 },
      { key: 'allround', emoji: '🎯', title: 'All-round zdravie',      desc: 'Všetky 4 dimenzie > 60 bodov',         unlocked: sc.health > 60 && sc.hygiene > 60 && sc.aesthetics > 60 && sc.prevention > 60 },
    ];
  }, [appointments, sc, hasPassport]);

  const hasData = teeth.length > 0;
  const col     = scoreColor(sc.overall);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.esp }}>
        <LinearGradient colors={GRADIENTS.hero as [string, string, ...string[]]} style={s.hero}>
          <Text style={s.heroLabel}>ANALÝZA CHRUPU</Text>
          <Text style={s.heroTitle}>Dentálne skóre</Text>
        </LinearGradient>
        <View style={{ flex: 1, backgroundColor: colors.bg2, padding: 16, paddingTop: 20 }}>
          <SkeletonList count={5} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.esp }}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} />}
      >
        {/* Hero with ring */}
        <LinearGradient colors={GRADIENTS.hero as [string, string, ...string[]]} style={s.hero}>
          {/* Decorative circles */}
          <View style={[s.circle, { width: 200, height: 200, right: -60, top: -60, opacity: 0.05 }]} />
          <View style={[s.circle, { width: 120, height: 120, right: 30, bottom: -20, opacity: 0.04 }]} />

          <Text style={s.heroLabel}>ANALÝZA CHRUPU</Text>
          <Text style={s.heroTitle}>Dentálne skóre</Text>

          {hasData ? (
            <View style={s.ringWrap}>
              <ScoreRing score={sc.overall} size={180} />
              <View style={s.ringMeta}>
                <View style={[s.scoreBadge, { backgroundColor: col }]}>
                  <Text style={s.scoreBadgeText}>{scoreLabel(sc.overall)}</Text>
                </View>
                <Text style={s.ringSubtext}>{teeth.length} zaznamenaných zubov</Text>
              </View>
            </View>
          ) : (
            <View style={s.noDataHero}>
              <Text style={s.noDataEmoji}>🦷</Text>
              <Text style={s.noDataTitle}>Zubná karta zatiaľ prázdna</Text>
              <Text style={s.noDataSub}>
                Doktor vyplní vašu zubnú kartu pri prvej návšteve.
              </Text>
            </View>
          )}
        </LinearGradient>

        <View style={{ backgroundColor: colors.bg2, paddingBottom: 120 }}>
          {/* Sub-score cards */}
          {hasData && (
            <View style={s.subRow}>
              <SubScoreCard label="Zdravie"   score={sc.health}     emoji="❤️" colors={colors} />
              <SubScoreCard label="Hygiena"   score={sc.hygiene}    emoji="🪥" colors={colors} />
              <SubScoreCard label="Estetika"  score={sc.aesthetics} emoji="✨" colors={colors} />
              <SubScoreCard label="Prevencia" score={sc.prevention} emoji="🛡️" colors={colors} />
            </View>
          )}

          {/* No data CTA */}
          {!hasData && (
            <View style={[s.noDataCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <Text style={[s.noDataCardTitle, { color: colors.textPrimary }]}>Rezervujte si termín</Text>
              <Text style={[s.noDataCardSub, { color: colors.textSecondary }]}>
                Po prvej návšteve vám doktor vyplní zubnú kartu a tu uvidíte detailné skóre.
              </Text>
              <TouchableOpacity
                style={s.ctaBtn}
                onPress={() => router.push('/(patient)/book-appointment')}
                activeOpacity={0.85}
              >
                <LinearGradient colors={GRADIENTS.gold as [string, string, ...string[]]} style={s.ctaGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  <Ionicons name="calendar-outline" size={18} color="#fff" />
                  <Text style={s.ctaText}>Rezervovať termín</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {hasData && (
            <>
              {/* Score breakdown */}
              <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <Text style={[s.cardTitle, { color: colors.textSecondary }]}>ROZBOR SKÓRE</Text>
                <DimBar label="Zdravie"   score={sc.health}     emoji="❤️" colors={colors} />
                <DimBar label="Hygiena"   score={sc.hygiene}    emoji="🪥" colors={colors} />
                <DimBar label="Estetika"  score={sc.aesthetics} emoji="✨" colors={colors} />
                <DimBar label="Prevencia" score={sc.prevention} emoji="🛡️" colors={colors} />
                <View style={s.legend}>
                  {([['A','≥85', COLORS.success],['B','≥70','#9A7D0A'],['C','≥50', COLORS.warning],['D','<50', COLORS.error]] as const).map(([g, r, c]) => (
                    <View key={g} style={s.legendItem}>
                      <View style={[s.legendDot, { backgroundColor: c }]} />
                      <Text style={[s.legendText, { color: colors.textSecondary }]}>{g}: {r}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Tooth status */}
              <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <Text style={[s.cardTitle, { color: colors.textSecondary }]}>STAV ZUBOV</Text>
                <View style={s.statusGrid}>
                  {(Object.entries(statusCounts) as [ToothStatus, number][])
                    .sort(([, a], [, b]) => b - a)
                    .map(([status, count]) => {
                      const cfg = STATUS_DISPLAY[status];
                      if (!cfg) return null;
                      return (
                        <View key={status} style={[s.statusChip, { borderColor: cfg.color + '50', backgroundColor: cfg.color + '15' }]}>
                          <Text style={s.statusEmoji}>{cfg.emoji}</Text>
                          <Text style={[s.statusCount, { color: cfg.color }]}>{count}×</Text>
                          <Text style={[s.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                      );
                    })}
                </View>
              </View>
            </>
          )}

          {/* Recommendations */}
          {tips.length > 0 && (
            <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <Text style={[s.cardTitle, { color: colors.textSecondary }]}>ODPORÚČANIA</Text>
              <View style={{ gap: 8 }}>
                {tips.map((t, i) => <TipCard key={i} {...t} colors={colors} />)}
              </View>
            </View>
          )}

          {/* ── Achievementy ── */}
          <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Text style={[s.cardTitle, { color: colors.textSecondary }]}>ACHIEVEMENTY</Text>
            <View style={ach.grid}>
              {achievements.map(a => (
                <View
                  key={a.key}
                  style={[ach.item,
                    { backgroundColor: a.unlocked ? (dark ? '#1A2A1A' : '#F0FAF4') : colors.bg2,
                      borderColor: a.unlocked ? (dark ? '#27AE6044' : '#A9DFBF') : colors.bg3,
                      opacity: a.unlocked ? 1 : 0.45 }]}
                >
                  <Text style={ach.emoji}>{a.emoji}</Text>
                  <Text style={[ach.title, { color: a.unlocked ? colors.textPrimary : colors.textSecondary }]} numberOfLines={2}>{a.title}</Text>
                  <Text style={[ach.desc, { color: colors.textSecondary }]} numberOfLines={2}>{a.desc}</Text>
                  {a.unlocked && (
                    <View style={ach.badge}>
                      <Text style={ach.badgeText}>✓</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
            <Text style={[ach.progress, { color: colors.textSecondary }]}>
              {achievements.filter(a => a.unlocked).length} / {achievements.length} odomknutých
            </Text>
          </View>

          {/* Recent visits */}
          {recentAppts.length > 0 && (
            <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <Text style={[s.cardTitle, { color: colors.textSecondary }]}>NEDÁVNE NÁVŠTEVY</Text>
              {recentAppts.map((a, i) => (
                <View key={a.id} style={[s.apptRow, i === recentAppts.length - 1 && { borderBottomWidth: 0 }, { borderBottomColor: colors.bg3 }]}>
                  <View style={[s.apptIcon, { backgroundColor: colors.bg2 }]}>
                    <Text style={{ fontSize: 16 }}>{a.service?.emoji ?? '🦷'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.apptName, { color: colors.textPrimary }]}>{a.service?.name ?? 'Termín'}</Text>
                    <Text style={[s.apptDate, { color: colors.textSecondary }]}>
                      {new Date(a.appointment_date).toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </Text>
                  </View>
                  <View style={[s.doneBadge, { backgroundColor: COLORS.successBg }]}>
                    <Text style={[s.doneText, { color: COLORS.success }]}>✓ Hotovo</Text>
                  </View>
                </View>
              ))}
              <TouchableOpacity style={s.moreBtn} onPress={() => router.push('/(patient)/appointments')} activeOpacity={0.8}>
                <Text style={[s.moreBtnText, { color: COLORS.gold }]}>Zobraziť všetky termíny</Text>
                <Ionicons name="chevron-forward" size={14} color={COLORS.gold} />
              </TouchableOpacity>
            </View>
          )}

          {/* CTA button */}
          <TouchableOpacity style={s.ctaBtn} onPress={() => router.push('/(patient)/book-appointment')} activeOpacity={0.85}>
            <LinearGradient colors={GRADIENTS.gold as [string, string, ...string[]]} style={s.ctaGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name="calendar-outline" size={18} color="#fff" />
              <Text style={s.ctaText}>Rezervovať termín</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Achievement styles ───────────────────────────────────────────────────────
const ach = StyleSheet.create({
  grid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  item:     { width: '47%', borderRadius: 12, borderWidth: 1.5, padding: 10, gap: 4, position: 'relative' },
  emoji:    { fontSize: 24 },
  title:    { fontSize: 12, fontFamily: 'DMSans_500Medium', lineHeight: 16 },
  desc:     { fontSize: 10, lineHeight: 14 },
  badge:    { position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: 9, backgroundColor: '#27AE60', alignItems: 'center', justifyContent: 'center' },
  badgeText:{ fontSize: 10, color: '#fff', fontWeight: '700' },
  progress: { fontSize: 11, textAlign: 'center', marginTop: 2 },
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  hero: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 32, overflow: 'hidden' },
  circle: { position: 'absolute', borderRadius: 999, backgroundColor: '#F8F6F2' },
  heroLabel: { ...TYPO.overline, color: COLORS.sand, marginBottom: 4 },
  heroTitle: { ...TYPO.h1, color: '#F8F6F2', marginBottom: 24 },

  ringWrap:     { alignItems: 'center', gap: 16 },
  ringMeta:     { alignItems: 'center', gap: 8 },
  scoreBadge:   { borderRadius: RADII.full, paddingHorizontal: 16, paddingVertical: 6 },
  scoreBadgeText: { fontFamily: 'DMSans_500Medium', fontSize: 13, color: '#fff', letterSpacing: 0.3 },
  ringSubtext:  { fontFamily: 'DMSans_400Regular', fontSize: 12, color: 'rgba(196,168,130,0.65)' },

  noDataHero:  { alignItems: 'center', gap: 10, paddingBottom: 8 },
  noDataEmoji: { fontSize: 52 },
  noDataTitle: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 20, color: '#F8F6F2', textAlign: 'center' },
  noDataSub:   { fontFamily: 'DMSans_400Regular', fontSize: 13, color: 'rgba(196,168,130,0.75)', textAlign: 'center', lineHeight: 20 },

  subRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },

  noDataCard: { margin: 16, borderRadius: RADII.lg, backgroundColor: '#FAFAF8', padding: 20, ...SHADOWS.card, borderWidth: 1, borderColor: COLORS.bg3, gap: 10 },
  noDataCardTitle: { ...TYPO.h2 },
  noDataCardSub:   { ...TYPO.body },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  card:      { backgroundColor: '#FAFAF8', borderRadius: RADII.lg, marginHorizontal: 16, marginTop: 12, padding: 16, borderWidth: 1, ...SHADOWS.sm },
  cardTitle: { ...TYPO.label, marginBottom: 14 },

  legend:     { flexDirection: 'row', gap: 12, marginTop: 8, justifyContent: 'flex-end' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:  { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontFamily: 'DMSans_400Regular', fontSize: 9, letterSpacing: 0.3 },

  statusGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusChip:  { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: RADII.sm, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 6 },
  statusEmoji: { fontSize: 12 },
  statusCount: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 13 },
  statusLabel: { fontFamily: 'DMSans_500Medium', fontSize: 11 },

  apptRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  apptIcon:  { width: 38, height: 38, borderRadius: RADII.sm, alignItems: 'center', justifyContent: 'center' },
  apptName:  { ...TYPO.bodyMed, marginBottom: 2 },
  apptDate:  { ...TYPO.bodySm },
  doneBadge: { borderRadius: RADII.sm, paddingHorizontal: 8, paddingVertical: 4 },
  doneText:  { fontFamily: 'DMSans_500Medium', fontSize: 11 },
  moreBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 12 },
  moreBtnText: { ...TYPO.bodyMed },

  ctaBtn:  { marginHorizontal: 16, marginTop: 16, borderRadius: RADII.md, overflow: 'hidden' },
  ctaGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  ctaText: { fontFamily: 'DMSans_500Medium', fontSize: 15, color: '#fff', letterSpacing: 0.3 },
});

const sub = StyleSheet.create({
  card:      { flex: 1, borderRadius: RADII.md, borderWidth: 1, padding: 10, alignItems: 'center', gap: 4, overflow: 'hidden' },
  emoji:     { fontSize: 18 },
  value:     { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 20, lineHeight: 24 },
  bar:       { height: 3, borderRadius: 2, alignSelf: 'stretch' },
  label:     { fontFamily: 'DMSans_500Medium', fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase', textAlign: 'center' },
  grade:     { borderRadius: RADII.xs, paddingHorizontal: 6, paddingVertical: 2 },
  gradeText: { fontFamily: 'DMSans_500Medium', fontSize: 9, color: '#fff' },
});

const db = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  emoji:     { fontSize: 15, width: 22, textAlign: 'center' },
  label:     { fontFamily: 'DMSans_500Medium', fontSize: 12, width: 68 },
  track:     { flex: 1, height: 7, borderRadius: 4, overflow: 'hidden' },
  fill:      { height: 7, borderRadius: 4 },
  score:     { fontFamily: 'DMSans_500Medium', fontSize: 12, width: 26, textAlign: 'right' },
  badge:     { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: 'DMSans_500Medium', fontSize: 10, color: '#fff' },
});

const tip = StyleSheet.create({
  card:    { flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderRadius: RADII.md, padding: 12, borderLeftWidth: 3 },
  iconWrap:{ width: 36, height: 36, borderRadius: RADII.sm, alignItems: 'center', justifyContent: 'center' },
  title:   { ...TYPO.bodyMed, marginBottom: 2 },
  sub:     { ...TYPO.bodySm, lineHeight: 18 },
});
