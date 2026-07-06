/**
 * Video konzultácia — zoznam nadchádzajúcich videohovorov
 * Pripravené na WebRTC / Daily.co integráciu
 */
import React, { useState, useCallback } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII, SHADOWS } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';

type VideoSession = {
  id: string;
  patient_name: string;
  date: string;
  time: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  reason: string;
  duration_minutes: number;
};

export default function VideoConsult() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  const [sessions, setSessions] = useState<VideoSession[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    try {
      const { data } = await supabase.from('video_consultations')
        .select('*, patient:profiles!patient_id(full_name)')
        .order('date', { ascending: true });

      setSessions((data ?? []).map(d => ({
        id: d.id,
        patient_name: d.patient?.full_name ?? 'Pacient',
        date: d.date,
        time: d.time ?? '10:00',
        status: d.status ?? 'scheduled',
        reason: d.reason ?? 'Konzultácia',
        duration_minutes: d.duration_minutes ?? 15,
      })));
    } catch (e) {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadSessions(); }, [loadSessions]));

  function startCall(session: VideoSession) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      'Video konzultácia',
      'Video hovory budú plne funkčné v ďalšej verzii (WebRTC integrácia). Zatiaľ prosím použite telefón alebo iný video nástroj.',
      [{ text: 'OK' }]
    );
  }

  const STATUS_CFG = {
    scheduled: { label: 'Naplánovaná', color: COLORS.info, icon: 'time-outline' as const },
    in_progress: { label: 'Prebieha', color: COLORS.success, icon: 'videocam' as const },
    completed: { label: 'Dokončená', color: '#95A5A6', icon: 'checkmark-circle' as const },
    cancelled: { label: 'Zrušená', color: COLORS.error, icon: 'close-circle' as const },
  };

  const upcoming = sessions.filter(s => s.status === 'scheduled');
  const past = sessions.filter(s => s.status === 'completed' || s.status === 'cancelled');

  return (
    <View style={[st.safe, { backgroundColor: colors.esp }]}>
      <HeroHeader title="Video konzultácie" subtitle="Telemedicína" icon="videocam-outline" onBack={() => router.back()} />

      <ScrollView style={[st.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={st.content}
        showsVerticalScrollIndicator={false}>

        {loading ? <SkeletonList count={3} /> : (
          <>
            {/* Banner */}
            <Animated.View entering={FadeInDown.delay(100)}
              style={[st.banner, { backgroundColor: dark ? 'rgba(26,82,118,0.2)' : '#EBF5FB' }]}>
              <View style={st.bannerIcon}>
                <Ionicons name="videocam" size={32} color={COLORS.info} />
              </View>
              <Text style={[st.bannerTitle, { color: colors.textPrimary }]}>Telemedicína</Text>
              <Text style={[st.bannerSub, { color: colors.textSecondary }]}>
                Konzultujte s pacientmi na diaľku. Video hovory, zdieľanie obrazovky a RTG snímkov.
              </Text>
            </Animated.View>

            {/* Upcoming */}
            <Text style={[st.sectionTitle, { color: colors.textPrimary }]}>Nadchádzajúce ({upcoming.length})</Text>

            {upcoming.length === 0 ? (
              <View style={[st.empty, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <Ionicons name="videocam-off-outline" size={40} color={colors.textSecondary} />
                <Text style={[st.emptyText, { color: colors.textSecondary }]}>Žiadne naplánované konzultácie</Text>
              </View>
            ) : (
              upcoming.map((s, i) => {
                const cfg = STATUS_CFG[s.status];
                const isToday = s.date === new Date().toISOString().split('T')[0];
                return (
                  <Animated.View key={s.id} entering={FadeInDown.delay(150 + i * 60)}
                    style={[st.card, { backgroundColor: colors.cardBg, borderColor: isToday ? COLORS.gold : colors.bg3 }]}>
                    {isToday && (
                      <View style={st.todayBadge}>
                        <Text style={st.todayText}>DNES</Text>
                      </View>
                    )}
                    <View style={st.cardHeader}>
                      <View style={[st.avatarCircle, { backgroundColor: COLORS.gold + '15' }]}>
                        <Ionicons name="person" size={20} color={COLORS.gold} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[st.cardName, { color: colors.textPrimary }]}>{s.patient_name}</Text>
                        <Text style={[st.cardReason, { color: colors.textSecondary }]}>{s.reason}</Text>
                      </View>
                    </View>
                    <View style={st.cardMeta}>
                      <View style={st.metaItem}>
                        <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                        <Text style={[st.metaText, { color: colors.textSecondary }]}>
                          {new Date(s.date).toLocaleDateString('sk-SK')}
                        </Text>
                      </View>
                      <View style={st.metaItem}>
                        <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                        <Text style={[st.metaText, { color: colors.textSecondary }]}>{s.time}</Text>
                      </View>
                      <View style={st.metaItem}>
                        <Ionicons name="hourglass-outline" size={14} color={colors.textSecondary} />
                        <Text style={[st.metaText, { color: colors.textSecondary }]}>{s.duration_minutes} min</Text>
                      </View>
                    </View>
                    <TouchableOpacity style={st.callBtn} onPress={() => startCall(s)} activeOpacity={0.85}>
                      <Ionicons name="videocam" size={18} color="#fff" />
                      <Text style={st.callBtnText}>Zahájiť hovor</Text>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })
            )}

            {/* Past */}
            {past.length > 0 && (
              <>
                <Text style={[st.sectionTitle, { color: colors.textPrimary, marginTop: SPACING.lg }]}>
                  História ({past.length})
                </Text>
                {past.slice(0, 10).map(s => {
                  const cfg = STATUS_CFG[s.status];
                  return (
                    <View key={s.id} style={[st.histRow, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                      <Ionicons name={cfg.icon} size={18} color={cfg.color} />
                      <View style={{ flex: 1 }}>
                        <Text style={[st.histName, { color: colors.textPrimary }]}>{s.patient_name}</Text>
                        <Text style={[st.histDate, { color: colors.textSecondary }]}>
                          {new Date(s.date).toLocaleDateString('sk-SK')} · {s.duration_minutes} min
                        </Text>
                      </View>
                      <View style={[st.histBadge, { backgroundColor: cfg.color + '15' }]}>
                        <Text style={[st.histBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: SPACING.xl },

  banner: { borderRadius: RADII.lg, padding: SPACING.xl, alignItems: 'center', marginBottom: SPACING.lg },
  bannerIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(52,152,219,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  bannerTitle: { fontSize: 18, fontWeight: '800' },
  bannerSub: { fontSize: 12, textAlign: 'center', marginTop: 4, lineHeight: 18 },

  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },

  empty: { borderRadius: RADII.lg, borderWidth: 1, padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 13, marginTop: 8 },

  card: { borderRadius: RADII.lg, borderWidth: 1.5, padding: SPACING.lg, marginBottom: SPACING.md },
  todayBadge: { position: 'absolute', top: -1, right: 16, backgroundColor: COLORS.gold, paddingHorizontal: 10, paddingVertical: 3, borderBottomLeftRadius: 6, borderBottomRightRadius: 6 },
  todayText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarCircle: { width: 44, height: 44, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  cardName: { fontSize: 15, fontWeight: '700' },
  cardReason: { fontSize: 12, marginTop: 2 },
  cardMeta: { flexDirection: 'row', gap: 16, marginTop: 14, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: 'rgba(0,0,0,0.05)' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12 },
  callBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, backgroundColor: COLORS.success, borderRadius: RADII.pill, marginTop: 14 },
  callBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  histRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: RADII.md, borderWidth: 1, padding: 12, marginBottom: 6 },
  histName: { fontSize: 13, fontWeight: '600' },
  histDate: { fontSize: 10, marginTop: 2 },
  histBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADII.pill },
  histBadgeText: { fontSize: 9, fontWeight: '700' },
});
