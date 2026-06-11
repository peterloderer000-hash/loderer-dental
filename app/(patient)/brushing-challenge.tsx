/**
 * Brushing Challenge — gamifikácia dentálnej hygieny
 * 2-minútový timer, streak counter, loyalty body
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View, Vibration,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence } from 'react-native-reanimated';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII, SHADOWS } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { useAppTheme } from '../../context/ThemeContext';

const BRUSH_TIME = 120; // 2 minúty v sekundách
const QUADRANTS = ['Vpravo hore', 'Vľavo hore', 'Vľavo dole', 'Vpravo dole'];
const QUADRANT_TIME = BRUSH_TIME / 4;

type Stats = {
  currentStreak: number;
  longestStreak: number;
  totalSessions: number;
  todayMorning: boolean;
  todayEvening: boolean;
  weekHistory: boolean[];
};

export default function BrushingChallenge() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();

  const [stats, setStats] = useState<Stats>({
    currentStreak: 0, longestStreak: 0, totalSessions: 0,
    todayMorning: false, todayEvening: false, weekHistory: [],
  });
  const [loading, setLoading] = useState(true);
  const [timerActive, setTimerActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(BRUSH_TIME);
  const [currentQuadrant, setCurrentQuadrant] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Animation
  const pulseScale = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  // ── Load stats ────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Dnešné sessions
      const { data: todayLogs } = await supabase
        .from('brushing_logs')
        .select('session_type')
        .eq('patient_id', user.id)
        .gte('logged_at', today + 'T00:00:00');

      const todayMorning = todayLogs?.some(l => l.session_type === 'morning') ?? false;
      const todayEvening = todayLogs?.some(l => l.session_type === 'evening') ?? false;

      // Celkový počet
      const { count } = await supabase
        .from('brushing_logs')
        .select('*', { count: 'exact', head: true })
        .eq('patient_id', user.id);

      // Týždňová história
      const { data: weekLogs } = await supabase
        .from('brushing_logs')
        .select('logged_at')
        .eq('patient_id', user.id)
        .gte('logged_at', weekAgo)
        .order('logged_at', { ascending: true });

      const weekDays: boolean[] = [];
      for (let i = 6; i >= 0; i--) {
        const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        weekDays.push(weekLogs?.some(l => l.logged_at?.startsWith(day)) ?? false);
      }

      // Streak kalkulácia
      let streak = 0;
      for (let i = 0; i < 30; i++) {
        const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const hasLog = weekLogs?.some(l => l.logged_at?.startsWith(day));
        if (hasLog || (i === 0 && (todayMorning || todayEvening))) {
          streak++;
        } else if (i > 0) break;
      }

      setStats({
        currentStreak: streak,
        longestStreak: Math.max(streak, count ? Math.min(count, 30) : 0),
        totalSessions: count ?? 0,
        todayMorning, todayEvening, weekHistory: weekDays,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadStats(); }, [loadStats]));

  // ── Timer ─────────────────────────────────────────────────────
  useEffect(() => {
    if (timerActive && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          const next = prev - 1;
          const quad = Math.floor((BRUSH_TIME - next) / QUADRANT_TIME);
          if (quad !== currentQuadrant && quad < 4) {
            setCurrentQuadrant(quad);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          }
          if (next <= 0) {
            clearInterval(intervalRef.current!);
            setTimerActive(false);
            setSessionComplete(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            saveSession();
          }
          return Math.max(0, next);
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [timerActive]);

  function startTimer() {
    setTimeLeft(BRUSH_TIME);
    setCurrentQuadrant(0);
    setSessionComplete(false);
    setTimerActive(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    pulseScale.value = withRepeat(withSequence(
      withTiming(1.05, { duration: 500 }),
      withTiming(1, { duration: 500 }),
    ), -1);
  }

  function stopTimer() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTimerActive(false);
    pulseScale.value = withTiming(1);
  }

  async function saveSession() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const hour = new Date().getHours();
      const sessionType = hour < 14 ? 'morning' : 'evening';

      await supabase.from('brushing_logs').insert({
        patient_id: user.id,
        duration_seconds: BRUSH_TIME,
        session_type: sessionType,
        quality_score: 85 + Math.floor(Math.random() * 15),
      });

      // Pridať loyalty body
      await supabase.from('loyalty_points').insert({
        patient_id: user.id,
        points: 5,
        reason: 'Brushing challenge dokončený',
        type: 'earned',
      }).then(() => {});

      loadStats();
    } catch (e) {
      console.error(e);
    }
  }

  // ── Format time ───────────────────────────────────────────────
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const progress = 1 - timeLeft / BRUSH_TIME;
  const DAY_NAMES = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];

  return (
    <View style={[st.safe, { backgroundColor: colors.esp }]}>
      <HeroHeader
        title="Brushing Challenge"
        subtitle="Zubná hygiena"
        icon="timer-outline"
        onBack={() => router.back()}
      />

      <ScrollView style={[st.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={st.content}
        showsVerticalScrollIndicator={false}>

        {/* ── Streak banner ──────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(100)}
          style={[st.streakCard, { backgroundColor: dark ? 'rgba(201,168,76,0.1)' : '#FEF9E7', borderColor: COLORS.gold + '30' }]}>
          <Text style={{ fontSize: 32 }}>🔥</Text>
          <View style={{ flex: 1 }}>
            <Text style={[st.streakNum, { color: COLORS.gold }]}>{stats.currentStreak} dní</Text>
            <Text style={[st.streakLabel, { color: colors.textSecondary }]}>Aktuálny streak</Text>
          </View>
          <View style={st.streakBest}>
            <Text style={[st.streakBestNum, { color: colors.textPrimary }]}>{stats.longestStreak}</Text>
            <Text style={[st.streakBestLabel, { color: colors.textSecondary }]}>Najlepší</Text>
          </View>
        </Animated.View>

        {/* ── Dnešný stav ────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(200)} style={[st.todayCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
          <Text style={[st.todayTitle, { color: colors.textPrimary }]}>Dnes</Text>
          <View style={st.todayRow}>
            <View style={[st.todaySlot, stats.todayMorning && { backgroundColor: COLORS.successBg, borderColor: COLORS.success }]}>
              <Text style={{ fontSize: 20 }}>🌅</Text>
              <Text style={[st.todaySlotText, { color: stats.todayMorning ? COLORS.success : colors.textSecondary }]}>
                Ráno
              </Text>
              {stats.todayMorning && <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />}
            </View>
            <View style={[st.todaySlot, stats.todayEvening && { backgroundColor: COLORS.successBg, borderColor: COLORS.success }]}>
              <Text style={{ fontSize: 20 }}>🌙</Text>
              <Text style={[st.todaySlotText, { color: stats.todayEvening ? COLORS.success : colors.textSecondary }]}>
                Večer
              </Text>
              {stats.todayEvening && <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />}
            </View>
          </View>
        </Animated.View>

        {/* ── Timer ───────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(300)} style={[st.timerCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
          {sessionComplete ? (
            <View style={st.completeBox}>
              <Text style={{ fontSize: 48 }}>🎉</Text>
              <Text style={[st.completeTitle, { color: COLORS.success }]}>Výborne!</Text>
              <Text style={[st.completeSub, { color: colors.textSecondary }]}>
                2 minúty čistenia dokončené! +5 loyalty bodov
              </Text>
              <TouchableOpacity style={st.againBtn} onPress={() => { setSessionComplete(false); setTimeLeft(BRUSH_TIME); }}>
                <Text style={st.againBtnText}>Čistiť znova</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Circular progress */}
              <Animated.View style={[st.timerCircle, pulseStyle, {
                borderColor: timerActive ? COLORS.gold : colors.bg3,
              }]}>
                <Text style={[st.timerNum, { color: timerActive ? COLORS.gold : colors.textPrimary }]}>
                  {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
                </Text>
                {timerActive && (
                  <Text style={[st.quadrantText, { color: COLORS.gold }]}>
                    {QUADRANTS[currentQuadrant]}
                  </Text>
                )}
              </Animated.View>

              {/* Progress bar */}
              {timerActive && (
                <View style={st.progressRow}>
                  {QUADRANTS.map((q, i) => (
                    <View key={q} style={st.progressSegment}>
                      <View style={[st.progressBar, { backgroundColor: colors.bg3 }]}>
                        <View style={[st.progressFill, {
                          backgroundColor: i < currentQuadrant ? COLORS.success : i === currentQuadrant ? COLORS.gold : 'transparent',
                          width: i < currentQuadrant ? '100%' : i === currentQuadrant
                            ? `${((BRUSH_TIME - timeLeft - i * QUADRANT_TIME) / QUADRANT_TIME) * 100}%` : '0%',
                        }]} />
                      </View>
                      <Text style={[st.progressLabel, {
                        color: i <= currentQuadrant ? COLORS.gold : colors.textSecondary,
                        fontWeight: i === currentQuadrant ? '700' : '400',
                      }]}>{q}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Start/Stop button */}
              <TouchableOpacity
                style={[st.startBtn, { backgroundColor: timerActive ? COLORS.error : COLORS.gold }]}
                onPress={timerActive ? stopTimer : startTimer}
                activeOpacity={0.85}
              >
                <Ionicons name={timerActive ? 'stop' : 'play'} size={24} color="#fff" />
                <Text style={st.startBtnText}>
                  {timerActive ? 'Zastaviť' : 'Začať čistenie'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>

        {/* ── Týždňový prehľad ────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(400)} style={[st.weekCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
          <Text style={[st.weekTitle, { color: colors.textPrimary }]}>Posledných 7 dní</Text>
          <View style={st.weekRow}>
            {stats.weekHistory.map((done, i) => (
              <View key={i} style={st.weekDay}>
                <View style={[st.weekDot, { backgroundColor: done ? COLORS.success : colors.bg3 }]}>
                  {done && <Ionicons name="checkmark" size={12} color="#fff" />}
                </View>
                <Text style={[st.weekDayText, { color: done ? COLORS.success : colors.textSecondary }]}>
                  {DAY_NAMES[(new Date(Date.now() - (6-i) * 86400000).getDay() + 6) % 7]}
                </Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* ── Tips ────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(500)} style={[st.tipsCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
          <Text style={[st.tipsTitle, { color: colors.textPrimary }]}>💡 Tipy</Text>
          {[
            'Čistite zuby jemným kruhovým pohybom',
            'Venujte každej štvrtine minimálne 30 sekúnd',
            'Nezabudnite na jazyk a vnútornú stranu zubov',
            'Používajte medzizubné kefky alebo niť',
          ].map((tip, i) => (
            <View key={i} style={st.tipRow}>
              <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
              <Text style={[st.tipText, { color: colors.textSecondary }]}>{tip}</Text>
            </View>
          ))}
        </Animated.View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: SPACING.xl },

  streakCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: RADII.lg, borderWidth: 1, marginBottom: SPACING.lg },
  streakNum: { fontSize: 22, fontWeight: '800' },
  streakLabel: { fontSize: 12 },
  streakBest: { alignItems: 'center' },
  streakBestNum: { fontSize: 18, fontWeight: '800' },
  streakBestLabel: { fontSize: 10 },

  todayCard: { borderRadius: RADII.lg, borderWidth: 1, padding: 16, marginBottom: SPACING.lg },
  todayTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12 },
  todayRow: { flexDirection: 'row', gap: 12 },
  todaySlot: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: RADII.md, borderWidth: 1, borderColor: 'transparent' },
  todaySlotText: { flex: 1, fontSize: 14, fontWeight: '600' },

  timerCard: { borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.xl, alignItems: 'center', marginBottom: SPACING.lg },
  timerCircle: { width: 160, height: 160, borderRadius: 80, borderWidth: 4, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  timerNum: { fontSize: 36, fontWeight: '800', fontVariant: ['tabular-nums'] },
  quadrantText: { fontSize: 12, fontWeight: '600', marginTop: 4 },

  progressRow: { flexDirection: 'row', gap: 6, width: '100%', marginBottom: 20 },
  progressSegment: { flex: 1, alignItems: 'center' },
  progressBar: { width: '100%', height: 4, borderRadius: 2, overflow: 'hidden', marginBottom: 4 },
  progressFill: { height: '100%', borderRadius: 2 },
  progressLabel: { fontSize: 9, textAlign: 'center' },

  startBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 32, paddingVertical: 14, borderRadius: RADII.pill, ...SHADOWS.gold },
  startBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  completeBox: { alignItems: 'center', paddingVertical: 16 },
  completeTitle: { fontSize: 24, fontWeight: '800', marginTop: 8 },
  completeSub: { fontSize: 13, textAlign: 'center', marginTop: 6, marginBottom: 16 },
  againBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: RADII.pill, backgroundColor: COLORS.gold },
  againBtnText: { color: '#fff', fontWeight: '600' },

  weekCard: { borderRadius: RADII.lg, borderWidth: 1, padding: 16, marginBottom: SPACING.lg },
  weekTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-around' },
  weekDay: { alignItems: 'center', gap: 6 },
  weekDot: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  weekDayText: { fontSize: 10, fontWeight: '600' },

  tipsCard: { borderRadius: RADII.lg, borderWidth: 1, padding: 16 },
  tipsTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  tipText: { flex: 1, fontSize: 12, lineHeight: 17 },
});
