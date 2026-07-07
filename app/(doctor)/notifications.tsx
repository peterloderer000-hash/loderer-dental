import React, { useCallback, useMemo, useState } from 'react';
import {
  RefreshControl, ScrollView, StyleSheet,
  Text, TouchableOpacity, View
} from 'react-native';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyNotifications } from '../../components/EmptyState';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { COLORS, RADII, SHADOWS, TYPO, GRADIENTS } from '../../styles/theme';
import { useNotifications, AppNotification } from '../../hooks/useNotifications';
import { useAppTheme } from '../../context/ThemeContext';

const TYPE_CONFIG = {
  info:    { icon: 'information-circle' as const, color: COLORS.info,    bg: COLORS.infoBg,    border: '#AED6F1' },
  success: { icon: 'checkmark-circle'   as const, color: COLORS.success, bg: COLORS.successBg, border: '#A3D4BE' },
  warning: { icon: 'warning'            as const, color: COLORS.warning,  bg: COLORS.warningBg, border: '#F0C78A' },
  error:   { icon: 'close-circle'       as const, color: COLORS.error,   bg: COLORS.errorBg,   border: '#F1948A' }
};

type FilterType = 'all' | 'unread' | 'info' | 'warning' | 'success';

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all',     label: 'Všetky'      },
  { key: 'unread',  label: 'Nové'        },
  { key: 'success', label: 'Termíny'     },
  { key: 'info',    label: 'Systém'      },
  { key: 'warning', label: 'Dôležité'    },
];

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)    return 'práve teraz';
  if (diff < 3600)  return `pred ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `pred ${Math.floor(diff / 3600)} hod`;
  const days = Math.floor(diff / 86400);
  if (days === 1)   return 'včera';
  if (days < 7)     return `pred ${days} dňami`;
  return new Date(dateStr).toLocaleDateString('sk-SK', { day: 'numeric', month: 'long' });
}

function NotifCard({ item, onPress, colors }: { item: AppNotification; onPress: () => void; colors: any }) {
  const cfg     = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.info;
  const hasLink = !!item.appointment_id;

  return (
    <TouchableOpacity
      style={[
        nc.card,
        { backgroundColor: colors.cardBg, borderColor: colors.bg3 },
        !item.read && { backgroundColor: '#F5F6F8', borderColor: COLORS.goldLight },
        SHADOWS.sm,
      ]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <View style={[nc.accent, { backgroundColor: cfg.color }]} />
      <View style={[nc.iconWrap, { backgroundColor: cfg.bg }]}>
        <Ionicons name={cfg.icon} size={20} color={cfg.color} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={nc.top}>
          <Text style={[nc.title, { color: colors.textPrimary }, !item.read && { fontFamily: 'DMSans_500Medium' }]} numberOfLines={1}>
            {item.title}
          </Text>
          {!item.read && <View style={nc.unreadDot} />}
        </View>
        {item.body ? (
          <Text style={[nc.body, { color: colors.textSecondary }]} numberOfLines={2}>{item.body}</Text>
        ) : null}
        <View style={nc.bottom}>
          <Text style={[nc.time, { color: colors.textSecondary }]}>{timeAgo(item.created_at)}</Text>
          {hasLink && (
            <View style={[nc.linkChip, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
              <Text style={[nc.linkText, { color: cfg.color }]}>Zobraziť</Text>
              <Ionicons name="chevron-forward" size={10} color={cfg.color} />
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function DoctorNotificationsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { notifications, loading, unreadCount, refetch, markRead, markAllRead } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  async function handleRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  const filtered = useMemo(() => {
    switch (filter) {
      case 'unread':  return notifications.filter(n => !n.read);
      case 'success': return notifications.filter(n => n.type === 'success');
      case 'info':    return notifications.filter(n => n.type === 'info');
      case 'warning': return notifications.filter(n => n.type === 'warning' || n.type === 'error');
      default:        return notifications;
    }
  }, [notifications, filter]);

  // Group by day
  const grouped = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    const groups: { label: string; items: typeof filtered }[] = [
      { label: 'Dnes', items: [] },
      { label: 'Včera', items: [] },
      { label: 'Tento týždeň', items: [] },
      { label: 'Staršie', items: [] },
    ];
    for (const n of filtered) {
      const d = new Date(n.created_at); d.setHours(0, 0, 0, 0);
      if (d.getTime() >= today.getTime()) groups[0].items.push(n);
      else if (d.getTime() >= yesterday.getTime()) groups[1].items.push(n);
      else if (d.getTime() >= weekAgo.getTime()) groups[2].items.push(n);
      else groups[3].items.push(n);
    }
    return groups.filter(g => g.items.length > 0);
  }, [filtered]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.esp }}>
      {/* Hero */}
      <LinearGradient colors={GRADIENTS.hero as [string, string, ...string[]]} style={s.hero}>
        <View style={s.heroRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.75}>
            <Ionicons name="arrow-back" size={20} color={COLORS.sand} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.heroLabel}>CENTRUM</Text>
            <Text style={s.heroTitle}>Notifikácie</Text>
          </View>
          {unreadCount > 0 && (
            <TouchableOpacity style={s.markAllBtn} onPress={() => { markAllRead(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} activeOpacity={0.8}>
              <Text style={s.markAllText}>Označiť všetky</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Filter tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filtersRow}>
          {FILTERS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[s.filterTab, filter === tab.key && s.filterTabActive]}
              onPress={() => { setFilter(tab.key); Haptics.selectionAsync(); }}
              activeOpacity={0.8}
            >
              <Text style={[s.filterLabel, filter === tab.key ? { color: '#F5F6F8' } : { color: 'rgba(196,168,130,0.65)' }]}>
                {tab.label}
                {tab.key === 'unread' && unreadCount > 0 ? ` (${unreadCount})` : ''}
                {tab.key === 'all' && notifications.length > 0 ? ` (${notifications.length})` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </LinearGradient>

      {loading ? (
        <SkeletonList count={5} />
      ) : filtered.length === 0 ? (
        <EmptyNotifications />
      ) : (
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.bg2 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingVertical: 12, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.gold} />}
        >
          {grouped.map(group => (
            <React.Fragment key={group.label}>
              <SectionLabel label={`${group.label.toUpperCase()} (${group.items.length})`} color={group.label === 'Dnes' ? COLORS.gold : COLORS.sand} />
              {group.items.map(n => (
                <NotifCard key={n.id} item={n} colors={colors} onPress={async () => {
                  if (!n.read) await markRead(n.id);
                  if (n.appointment_id) router.back();
                }} />
              ))}
            </React.Fragment>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function SectionLabel({ label, color }: { label: string; color: string }) {
  return (
    <View style={sl.row}>
      <View style={[sl.dot, { backgroundColor: color }]} />
      <Text style={[sl.text, { color }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  hero:        { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 0, gap: 4 },
  heroRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  heroLabel:   { ...TYPO.overline, color: COLORS.sand, marginBottom: 2 },
  heroTitle:   { ...TYPO.h1, color: '#F5F6F8' },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  markAllBtn:  { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: RADII.sm, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  markAllText: { fontFamily: 'DMSans_500Medium', fontSize: 11, color: COLORS.sand },

  filtersRow:     { flexDirection: 'row', gap: 8, paddingBottom: 14 },
  filterTab:      { borderRadius: RADII.full, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: 'rgba(255,255,255,0.08)' },
  filterTabActive:{ backgroundColor: COLORS.gold },
  filterLabel:    { fontFamily: 'DMSans_500Medium', fontSize: 12, letterSpacing: 0.3 },

  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyTitle: { ...TYPO.h2, textAlign: 'center' },
  emptySub:   { ...TYPO.body, textAlign: 'center' }
});

const sl = StyleSheet.create({
  row:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, marginTop: 4 },
  dot:  { width: 6, height: 6, borderRadius: 3 },
  text: { ...TYPO.label }
});

const nc = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    marginHorizontal: 16, marginBottom: 8,
    borderRadius: RADII.lg, padding: 14,
    borderWidth: 1, overflow: 'hidden'
  },
  accent:    { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  iconWrap:  { width: 40, height: 40, borderRadius: RADII.sm, alignItems: 'center', justifyContent: 'center' },
  top:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  title:     { flex: 1, fontFamily: 'DMSans_400Regular', fontSize: 13 },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.gold },
  body:      { fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 19, marginBottom: 6 },
  bottom:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  time:      { fontFamily: 'DMSans_400Regular', fontSize: 11 },
  linkChip:  { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: RADII.sm, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  linkText:  { fontFamily: 'DMSans_500Medium', fontSize: 11 }
});
