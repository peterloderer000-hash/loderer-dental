/**
 * Vernostný program — pacient
 * Body za návštevy, recenzie, streaky. Tiery Bronze → Platinum.
 */
import React, { useState, useCallback } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII, SHADOWS, GRADIENTS } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { ProgressRing } from '../../components/ui';
import { SkeletonList } from '../../components/Skeleton';
import { AnimatedListItem } from '../../components/ui/AnimatedListItem';
import { useAppTheme } from '../../context/ThemeContext';

type PointEntry = {
  id: string;
  points: number;
  reason: string;
  description: string | null;
  created_at: string;
};

const TIERS = [
  { key: 'bronze',   label: 'Bronze',   icon: '🥉', min: 0,    color: '#CD7F32', bg: '#FFF3E0', next: 200 },
  { key: 'silver',   label: 'Silver',   icon: '🥈', min: 200,  color: '#A0A0A0', bg: '#F5F5F5', next: 500 },
  { key: 'gold',     label: 'Gold',     icon: '🥇', min: 500,  color: '#C9A84C', bg: '#FFF8E1', next: 1000 },
  { key: 'platinum', label: 'Platinum', icon: '💎', min: 1000, color: '#7B68EE', bg: '#EDE7F6', next: null },
];

const REASON_CFG: Record<string, { icon: string; label: string; color: string }> = {
  appointment: { icon: '🦷', label: 'Návšteva',  color: '#1E8449' },
  review:      { icon: '⭐', label: 'Recenzia',  color: '#F39C12' },
  referral:    { icon: '👥', label: 'Odporúčanie', color: '#3498DB' },
  streak:      { icon: '🔥', label: 'Séria',     color: '#E74C3C' },
  bonus:       { icon: '🎁', label: 'Bonus',     color: '#9B59B6' },
};

const REWARDS = [
  { points: 100,  icon: '🪥', title: 'Zubná kefka zadarmo',       desc: 'Profesionálna mäkká kefka' },
  { points: 250,  icon: '✨', title: '20% zľava na bielenie',      desc: 'Profesionálne bielenie v ambulancii' },
  { points: 500,  icon: '🧹', title: 'Dentálna hygiena zadarmo',   desc: 'Kompletné čistenie + fluoridácia' },
  { points: 750,  icon: '📸', title: 'Bezplatné RTG vyšetrenie',   desc: 'Panoramatický RTG snímok' },
  { points: 1000, icon: '💎', title: 'VIP ošetrenie',              desc: 'Premium bielenie + čistenie + darček' },
];

function getTier(totalPoints: number) {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (totalPoints >= TIERS[i].min) return TIERS[i];
  }
  return TIERS[0];
}

function getNextTier(totalPoints: number) {
  const current = getTier(totalPoints);
  const idx = TIERS.findIndex(t => t.key === current.key);
  return idx < TIERS.length - 1 ? TIERS[idx + 1] : null;
}

export default function LoyaltyScreen() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();

  const [totalPoints, setTotalPoints] = useState(0);
  const [history, setHistory]         = useState<PointEntry[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('loyalty_points')
        .select('id, points, reason, description, created_at')
        .eq('patient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      const entries = (data ?? []) as PointEntry[];
      setHistory(entries);
      setTotalPoints(entries.reduce((sum, e) => sum + e.points, 0));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const tier = getTier(totalPoints);
  const nextTier = getNextTier(totalPoints);
  const progress = nextTier
    ? (totalPoints - tier.min) / (nextTier.min - tier.min)
    : 1;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg2, padding: SPACING.xl }}>
        <SkeletonList count={5} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.esp }}>
      <HeroHeader
        title="Vernostný program"
        subtitle={`${totalPoints} bodov · ${tier.label}`}
        icon="trophy-outline"
        onBack={() => router.back()}
      />

      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg2 }}
        contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.wal} />}
      >
        {/* ── TIER CARD ── */}
        <Animated.View entering={FadeInDown.delay(100).duration(500)}>
          <LinearGradient
            colors={dark ? ['#1A120B', '#2C1F14'] : [tier.bg, '#fff']}
            style={[s.tierCard, SHADOWS.card]}
          >
            <View style={s.tierTop}>
              <Text style={s.tierEmoji}>{tier.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.tierName, { color: tier.color }]}>{tier.label}</Text>
                <Text style={[s.tierPoints, { color: colors.textPrimary }]}>{totalPoints} bodov</Text>
              </View>
              <ProgressRing
                value={Math.round(progress * 100)}
                size="md"
                color={tier.color}
                trackColor={dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}
                valueColor={tier.color}
                labelColor={colors.textSecondary}
                label="%"
              />
            </View>
            {nextTier && (
              <View style={s.tierProgress}>
                <View style={[s.tierBar, { backgroundColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
                  <View style={[s.tierBarFill, { width: `${Math.min(progress * 100, 100)}%`, backgroundColor: tier.color }]} />
                </View>
                <Text style={[s.tierNextText, { color: colors.textSecondary }]}>
                  Ešte {nextTier.min - totalPoints} bodov do {nextTier.icon} {nextTier.label}
                </Text>
              </View>
            )}
          </LinearGradient>
        </Animated.View>

        {/* ── HOW TO EARN ── */}
        <Animated.View entering={FadeInDown.delay(200).duration(500)}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Ako získať body</Text>
          <View style={[s.earnCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            {[
              { icon: '🦷', label: 'Návšteva u zubára', pts: '+50 bodov' },
              { icon: '⭐', label: 'Napísať recenziu', pts: '+25 bodov' },
              { icon: '🔥', label: '3 návštevy v rade', pts: '+100 bonus' },
              { icon: '👥', label: 'Odporučiť priateľa', pts: '+75 bodov' },
              { icon: '📋', label: 'Vyplniť dotazník', pts: '+15 bodov' },
            ].map((item, i) => (
              <View key={i} style={[s.earnRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.bg3 }]}>
                <Text style={s.earnIcon}>{item.icon}</Text>
                <Text style={[s.earnLabel, { color: colors.textPrimary }]}>{item.label}</Text>
                <Text style={[s.earnPts, { color: COLORS.gold }]}>{item.pts}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* ── REWARDS ── */}
        <Animated.View entering={FadeInDown.delay(300).duration(500)}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Odmeny</Text>
          {REWARDS.map((reward, i) => {
            const canClaim = totalPoints >= reward.points;
            return (
              <AnimatedListItem key={i} index={i}>
                <View style={[s.rewardCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, !canClaim && { opacity: 0.5 }]}>
                  <View style={[s.rewardIcon, { backgroundColor: canClaim ? (dark ? '#1A120B' : '#FFF8E1') : colors.bg2 }]}>
                    <Text style={{ fontSize: 24 }}>{reward.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.rewardTitle, { color: colors.textPrimary }]}>{reward.title}</Text>
                    <Text style={[s.rewardDesc, { color: colors.textSecondary }]}>{reward.desc}</Text>
                  </View>
                  <View style={[s.rewardBadge, { backgroundColor: canClaim ? COLORS.gold : colors.bg3 }]}>
                    <Text style={[s.rewardBadgeText, { color: canClaim ? '#fff' : colors.textSecondary }]}>{reward.points}</Text>
                  </View>
                </View>
              </AnimatedListItem>
            );
          })}
        </Animated.View>

        {/* ── HISTORY ── */}
        <Animated.View entering={FadeInDown.delay(400).duration(500)}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>História bodov</Text>
          {history.length === 0 ? (
            <View style={s.emptyHistory}>
              <Text style={{ fontSize: 36, marginBottom: 8 }}>🏆</Text>
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Zatiaľ žiadne body</Text>
              <Text style={[s.emptyDesc, { color: colors.textSecondary }]}>
                Body získate za návštevy, recenzie a pravidelnosť. Objednajte sa ešte dnes!
              </Text>
              <TouchableOpacity
                style={s.emptyBtn}
                onPress={() => router.push('/(patient)/book-appointment')}
                activeOpacity={0.85}
              >
                <Text style={s.emptyBtnText}>Rezervovať termín</Text>
              </TouchableOpacity>
            </View>
          ) : (
            history.map((entry, i) => {
              const cfg = REASON_CFG[entry.reason] ?? REASON_CFG.bonus;
              const d = new Date(entry.created_at);
              return (
                <AnimatedListItem key={entry.id} index={i}>
                  <View style={[s.historyRow, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                    <View style={[s.historyIcon, { backgroundColor: dark ? '#1A120B' : `${cfg.color}15` }]}>
                      <Text style={{ fontSize: 16 }}>{cfg.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.historyLabel, { color: colors.textPrimary }]}>{entry.description ?? cfg.label}</Text>
                      <Text style={[s.historyDate, { color: colors.textSecondary }]}>
                        {d.toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Text>
                    </View>
                    <Text style={[s.historyPts, { color: entry.points > 0 ? '#27AE60' : '#E74C3C' }]}>
                      {entry.points > 0 ? '+' : ''}{entry.points}
                    </Text>
                  </View>
                </AnimatedListItem>
              );
            })
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  // Tier card
  tierCard:     { borderRadius: RADII.xl, padding: SPACING.xl, marginBottom: SPACING.xl, overflow: 'hidden' },
  tierTop:      { flexDirection: 'row', alignItems: 'center', gap: 14 },
  tierEmoji:    { fontSize: 42 },
  tierName:     { fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },
  tierPoints:   { fontSize: 14, fontWeight: '600', marginTop: 2 },
  tierProgress: { marginTop: 16 },
  tierBar:      { height: 8, borderRadius: 4, overflow: 'hidden' },
  tierBarFill:  { height: '100%', borderRadius: 4 },
  tierNextText: { fontSize: 11, fontWeight: '500', marginTop: 6, textAlign: 'center' },

  // Section
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12, marginTop: 8 },

  // Earn card
  earnCard:     { borderRadius: RADII.lg, borderWidth: 1, overflow: 'hidden', marginBottom: SPACING.xl },
  earnRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  earnIcon:     { fontSize: 20 },
  earnLabel:    { flex: 1, fontSize: 13, fontWeight: '500' },
  earnPts:      { fontSize: 12, fontWeight: '700' },

  // Rewards
  rewardCard:   { flexDirection: 'row', alignItems: 'center', borderRadius: RADII.lg, borderWidth: 1, padding: 14, marginBottom: 8, gap: 12 },
  rewardIcon:   { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rewardTitle:  { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  rewardDesc:   { fontSize: 11, lineHeight: 15 },
  rewardBadge:  { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  rewardBadgeText: { fontSize: 11, fontWeight: '800' },

  // Empty
  emptyHistory: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle:   { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  emptyDesc:    { fontSize: 12, textAlign: 'center', lineHeight: 18, paddingHorizontal: 20, marginBottom: 16 },
  emptyBtn:     { backgroundColor: COLORS.wal, borderRadius: RADII.md, paddingHorizontal: 24, paddingVertical: 12 },
  emptyBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // History
  historyRow:   { flexDirection: 'row', alignItems: 'center', borderRadius: RADII.md, borderWidth: 1, padding: 12, marginBottom: 6, gap: 10 },
  historyIcon:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  historyLabel: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  historyDate:  { fontSize: 10 },
  historyPts:   { fontSize: 15, fontWeight: '800' },
});
