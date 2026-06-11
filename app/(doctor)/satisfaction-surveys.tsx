/**
 * Satisfaction Surveys Dashboard — doktor vidí hodnotenia pacientov
 */
import React, { useState, useCallback } from 'react';
import {
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';

type Survey = {
  id: string;
  rating: number;
  comment: string | null;
  categories: string[];
  created_at: string;
  patient_name: string;
};

const CAT_LABELS: { [k: string]: string } = {
  staff: 'Personál', cleanliness: 'Čistota', wait_time: 'Čakanie',
  pain_management: 'Bezbolesť', communication: 'Komunikácia',
};

export default function SatisfactionSurveys() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSurveys = useCallback(async () => {
    try {
      const { data } = await supabase.from('satisfaction_surveys')
        .select('id, rating, comment, categories, created_at, patient_id')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!data || data.length === 0) { setSurveys([]); setLoading(false); return; }

      const patientIds = [...new Set(data.map(s => s.patient_id))];
      const { data: profiles } = await supabase.from('profiles')
        .select('id, full_name').in('id', patientIds);

      const profileMap = new Map((profiles ?? []).map(p => [p.id, p.full_name]));

      setSurveys(data.map(s => ({
        id: s.id,
        rating: s.rating,
        comment: s.comment,
        categories: s.categories ?? [],
        created_at: s.created_at,
        patient_name: profileMap.get(s.patient_id) ?? 'Pacient',
      })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadSurveys(); }, [loadSurveys]));

  const avgRating = surveys.length > 0
    ? (surveys.reduce((s, sv) => s + sv.rating, 0) / surveys.length).toFixed(1)
    : '—';

  const catCounts = surveys.reduce((acc, sv) => {
    (sv.categories ?? []).forEach(c => { acc[c] = (acc[c] ?? 0) + 1; });
    return acc;
  }, {} as { [k: string]: number });

  const topCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <View style={[st.safe, { backgroundColor: colors.esp }]}>
      <HeroHeader title="Hodnotenia" subtitle="Spokojnosť pacientov" icon="star-half-outline" onBack={() => router.back()} />

      <ScrollView style={[st.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={st.content}
        showsVerticalScrollIndicator={false}>

        {loading ? <SkeletonList count={4} /> : (
          <>
            {/* Summary */}
            <Animated.View entering={FadeInDown.delay(100)} style={st.summaryRow}>
              <View style={[st.summaryCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <Text style={[st.summaryNum, { color: COLORS.gold }]}>{avgRating}</Text>
                <View style={st.starsSmall}>
                  {[1,2,3,4,5].map(n => (
                    <Ionicons key={n} name={n <= Math.round(Number(avgRating)) ? 'star' : 'star-outline'}
                      size={14} color={COLORS.gold} />
                  ))}
                </View>
                <Text style={[st.summaryLabel, { color: colors.textSecondary }]}>Priemerné hodnotenie</Text>
              </View>
              <View style={[st.summaryCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <Text style={[st.summaryNum, { color: COLORS.info }]}>{surveys.length}</Text>
                <Text style={[st.summaryLabel, { color: colors.textSecondary }]}>Celkom hodnotení</Text>
              </View>
            </Animated.View>

            {/* Top categories */}
            {topCats.length > 0 && (
              <Animated.View entering={FadeInDown.delay(200)} style={[st.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <Text style={[st.cardTitle, { color: colors.textPrimary }]}>Najčastejšie pochválené</Text>
                {topCats.map(([cat, count], i) => {
                  const pct = surveys.length > 0 ? Math.round((count / surveys.length) * 100) : 0;
                  return (
                    <View key={cat} style={st.catRow}>
                      <Text style={[st.catName, { color: colors.textPrimary }]}>{CAT_LABELS[cat] ?? cat}</Text>
                      <View style={[st.catBar, { backgroundColor: colors.bg2 }]}>
                        <View style={[st.catFill, { width: `${pct}%`, backgroundColor: COLORS.gold }]} />
                      </View>
                      <Text style={[st.catPct, { color: colors.textSecondary }]}>{pct}%</Text>
                    </View>
                  );
                })}
              </Animated.View>
            )}

            {/* Individual reviews */}
            <Text style={[st.sectionTitle, { color: colors.textPrimary }]}>Posledné hodnotenia</Text>
            {surveys.length === 0 ? (
              <View style={[st.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3, alignItems: 'center', padding: 32 }]}>
                <Text style={{ fontSize: 40 }}>📝</Text>
                <Text style={[st.emptyText, { color: colors.textSecondary }]}>Zatiaľ žiadne hodnotenia</Text>
              </View>
            ) : (
              surveys.map((sv, i) => (
                <Animated.View key={sv.id} entering={FadeInDown.delay(300 + i * 60)}
                  style={[st.reviewCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                  <View style={st.reviewHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[st.reviewName, { color: colors.textPrimary }]}>{sv.patient_name}</Text>
                      <Text style={[st.reviewDate, { color: colors.textSecondary }]}>
                        {new Date(sv.created_at).toLocaleDateString('sk-SK')}
                      </Text>
                    </View>
                    <View style={st.reviewStars}>
                      {[1,2,3,4,5].map(n => (
                        <Ionicons key={n} name={n <= sv.rating ? 'star' : 'star-outline'}
                          size={16} color={COLORS.gold} />
                      ))}
                    </View>
                  </View>
                  {sv.categories.length > 0 && (
                    <View style={st.reviewCats}>
                      {sv.categories.map(c => (
                        <View key={c} style={[st.catChip, { backgroundColor: COLORS.gold + '12' }]}>
                          <Text style={[st.catChipText, { color: COLORS.gold }]}>{CAT_LABELS[c] ?? c}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {sv.comment && (
                    <Text style={[st.reviewComment, { color: colors.textSecondary }]}>"{sv.comment}"</Text>
                  )}
                </Animated.View>
              ))
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

  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: SPACING.lg },
  summaryCard: { flex: 1, borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.lg, alignItems: 'center' },
  summaryNum: { fontSize: 32, fontWeight: '800' },
  summaryLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', marginTop: 4 },
  starsSmall: { flexDirection: 'row', gap: 2, marginTop: 2 },

  card: { borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.lg, marginBottom: SPACING.lg },
  cardTitle: { fontSize: 14, fontWeight: '700', marginBottom: 14 },

  catRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  catName: { width: 100, fontSize: 12, fontWeight: '600' },
  catBar: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  catFill: { height: '100%', borderRadius: 4 },
  catPct: { width: 36, fontSize: 11, fontWeight: '700', textAlign: 'right' },

  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12, marginTop: 4 },

  emptyText: { fontSize: 13, marginTop: 8 },

  reviewCard: { borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.lg, marginBottom: SPACING.md },
  reviewHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  reviewName: { fontSize: 14, fontWeight: '700' },
  reviewDate: { fontSize: 11, marginTop: 2 },
  reviewStars: { flexDirection: 'row', gap: 2 },
  reviewCats: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  catChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADII.pill },
  catChipText: { fontSize: 10, fontWeight: '700' },
  reviewComment: { fontSize: 13, fontStyle: 'italic', lineHeight: 18, marginTop: 10 },
});
