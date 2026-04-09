import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';
import { COLORS, SIZES } from '../../styles/theme';

type ToothStatus = 'healthy'|'cavity'|'filled'|'crown'|'extracted'|'missing'|'root_canal';
type Stats = Partial<Record<ToothStatus, number>>;

const DEDUCTIONS: Partial<Record<ToothStatus, number>> = {
  cavity:     10,
  root_canal:  8,
  extracted:  12,
  missing:     8,
};

const STATUS_LABELS: Record<ToothStatus, { label: string; color: string; bg: string; emoji: string }> = {
  healthy:    { label: 'Zdravé',        color: '#1E8449', bg: '#EAFAF1', emoji: '✅' },
  cavity:     { label: 'Kazy',          color: '#922B21', bg: '#FDEDEC', emoji: '🔴' },
  filled:     { label: 'Plomby',        color: '#9A7D0A', bg: '#FEF9E7', emoji: '🟡' },
  crown:      { label: 'Korunky',       color: '#1A5276', bg: '#EBF5FB', emoji: '🔵' },
  extracted:  { label: 'Extrahované',   color: '#566573', bg: '#F2F3F4', emoji: '⚫' },
  missing:    { label: 'Chýbajúce',     color: '#99A3A4', bg: '#FDFEFE', emoji: '⬜' },
  root_canal: { label: 'Devitalizácia', color: '#6C3483', bg: '#F5EEF8', emoji: '🟣' },
};

const BADGES = [
  { id: 'passport',    emoji: '📋', title: 'Dotazník vyplnený',    sub: 'Zdravotná anamnéza je kompletná',       color: '#1E8449' },
  { id: 'appointment', emoji: '📅', title: 'Termín naplánovaný',   sub: 'Máš nadchádzajúcu návštevu',           color: '#1A5276' },
  { id: 'clean',       emoji: '🌟', title: 'Čistý chrup',          sub: 'Žiadne kazy ani problémy',             color: '#9A7D0A' },
  { id: 'chart',       emoji: '🦷', title: 'Karta vyplnená',       sub: 'Doktor zaznamenal tvoj chrup',         color: '#6C3483' },
];

function ScoreCircle({ score }: { score: number }) {
  const color = score >= 80 ? '#1E8449' : score >= 60 ? '#9A7D0A' : '#922B21';
  const label = score >= 80 ? 'Výborný' : score >= 60 ? 'Dobrý' : score >= 40 ? 'Priemerný' : 'Slabý';
  return (
    <View style={[styles.circleWrap, { borderColor: color }]}>
      <Text style={[styles.scoreNum, { color }]}>{score}</Text>
      <Text style={[styles.scoreMax, { color }]}>/100</Text>
      <Text style={[styles.scoreLabel, { color }]}>{label}</Text>
    </View>
  );
}

export default function ScoreScreen() {
  const [stats, setStats]           = useState<Stats>({});
  const [hasPassport, setHasPassport] = useState(false);
  const [hasAppointment, setHasAppointment] = useState(false);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) { if (!cancelled) setLoading(false); return; }

      // Zubná karta
      const { data: teeth } = await supabase
        .from('dental_charts').select('status').eq('patient_id', user.id);
      if (!cancelled && teeth) {
        const s: Stats = {};
        teeth.forEach((t) => { s[t.status as ToothStatus] = (s[t.status as ToothStatus] ?? 0) + 1; });
        setStats(s);
      }

      // Zdravotný pas
      const { data: pp } = await supabase
        .from('health_passports').select('patient_id').eq('patient_id', user.id).maybeSingle();
      if (!cancelled) setHasPassport(!!pp);

      // Termín
      const { data: appts } = await supabase
        .from('appointments').select('id')
        .eq('patient_id', user.id).eq('status', 'scheduled');
      if (!cancelled) setHasAppointment((appts?.length ?? 0) > 0);

      if (!cancelled) setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // Výpočet skóre
  const hasChartData = Object.keys(stats).length > 0;
  let score = hasChartData ? 100 : 70;
  if (hasChartData) {
    Object.entries(DEDUCTIONS).forEach(([status, pts]) => {
      score -= (stats[status as ToothStatus] ?? 0) * pts;
    });
  }
  score = Math.max(0, Math.min(100, score));

  const earnedBadges = BADGES.filter((b) => {
    if (b.id === 'passport')    return hasPassport;
    if (b.id === 'appointment') return hasAppointment;
    if (b.id === 'clean')       return hasChartData && !stats.cavity && !stats.root_canal;
    if (b.id === 'chart')       return hasChartData;
    return false;
  });

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={COLORS.wal} size="large" /></View>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerSub}>TVOJE</Text>
        <Text style={styles.headerTitle}>Dentálne skóre</Text>
      </View>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}>

        {/* Skóre kruh */}
        <View style={styles.circleSection}>
          <ScoreCircle score={score} />
          {!hasChartData && (
            <Text style={styles.noDataNote}>
              Skóre bude presnejšie po návšteve doktora a vyplnení zubnej karty.
            </Text>
          )}
        </View>

        {/* Rozklad */}
        {hasChartData && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>ROZKLAD CHRUPU</Text>
            <View style={styles.statsGrid}>
              {(Object.keys(STATUS_LABELS) as ToothStatus[]).map((key) => {
                const count = stats[key] ?? 0;
                if (!count) return null;
                const s = STATUS_LABELS[key];
                return (
                  <View key={key} style={[styles.statItem, { backgroundColor: s.bg, borderColor: s.color }]}>
                    <Text style={styles.statEmoji}>{s.emoji}</Text>
                    <Text style={[styles.statCount, { color: s.color }]}>{count}</Text>
                    <Text style={[styles.statLabel, { color: s.color }]}>{s.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Odznaky */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>ODZNAKY</Text>
          {earnedBadges.length === 0 ? (
            <Text style={styles.noBadges}>Zatiaľ žiadne odznaky. Vyplň dotazník a rezervuj termín!</Text>
          ) : (
            <View style={styles.badgesGrid}>
              {earnedBadges.map((b) => (
                <View key={b.id} style={[styles.badge, { borderColor: b.color }]}>
                  <Text style={styles.badgeEmoji}>{b.emoji}</Text>
                  <Text style={[styles.badgeTitle, { color: b.color }]}>{b.title}</Text>
                  <Text style={styles.badgeSub}>{b.sub}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Tipy */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>ODPORÚČANIA</Text>
          {[
            { emoji: '🪥', tip: 'Čisť zuby 2× denne aspoň 2 minúty.' },
            { emoji: '🧵', tip: 'Používaj zubovú niť každý deň.' },
            { emoji: '💧', tip: 'Vyplachuj ústami po každom jedle.' },
            { emoji: '📅', tip: 'Navštív zubára každých 6 mesiacov.' },
          ].map((t, i) => (
            <View key={i} style={styles.tipRow}>
              <Text style={styles.tipEmoji}>{t.emoji}</Text>
              <Text style={styles.tipText}>{t.tip}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: COLORS.esp },
  scroll:  { flex: 1, backgroundColor: COLORS.bg2 },
  content: { padding: SIZES.padding, paddingTop: 10 },
  center:  { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center' },

  header:    { backgroundColor: COLORS.esp, paddingHorizontal: SIZES.padding, paddingTop: 18, paddingBottom: 20 },
  headerSub: { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 3 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },

  circleSection: { alignItems: 'center', paddingVertical: 24 },
  circleWrap: { width: 160, height: 160, borderRadius: 80, borderWidth: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', marginBottom: 10 },
  scoreNum:   { fontSize: 52, fontWeight: '800', lineHeight: 58 },
  scoreMax:   { fontSize: 14, fontWeight: '600', marginTop: -4 },
  scoreLabel: { fontSize: 13, fontWeight: '700', marginTop: 4, textTransform: 'uppercase', letterSpacing: 1 },
  noDataNote: { fontSize: 11, color: COLORS.wal, textAlign: 'center', paddingHorizontal: 30, fontStyle: 'italic', marginTop: 8 },

  card:      { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: COLORS.bg3 },
  cardTitle: { fontSize: 9, letterSpacing: 2, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 12 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statItem:  { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', minWidth: 80 },
  statEmoji: { fontSize: 16, marginBottom: 2 },
  statCount: { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  statLabel: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2 },

  noBadges:   { fontSize: 12, color: COLORS.wal, fontStyle: 'italic' },
  badgesGrid: { gap: 10 },
  badge:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 10, borderWidth: 1.5, padding: 12, backgroundColor: COLORS.bg2 },
  badgeEmoji: { fontSize: 28 },
  badgeTitle: { fontSize: 13, fontWeight: '700' },
  badgeSub:   { fontSize: 11, color: COLORS.wal, marginTop: 1 },

  tipRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  tipEmoji:{ fontSize: 18 },
  tipText: { flex: 1, fontSize: 13, color: COLORS.esp, lineHeight: 19 },
});
