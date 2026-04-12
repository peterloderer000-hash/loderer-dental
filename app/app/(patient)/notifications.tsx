import React, { useCallback } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SIZES } from '../../styles/theme';
import { useNotifications, AppNotification } from '../../hooks/useNotifications';

// ─── Konfigurácia typov ────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  info:    { icon: 'information-circle' as const, color: '#1A5276', bg: '#EBF5FB', border: '#AED6F1' },
  success: { icon: 'checkmark-circle'   as const, color: '#1E8449', bg: '#EAFAF1', border: '#A9DFBF' },
  warning: { icon: 'warning'            as const, color: '#7D6608', bg: '#FEF9E7', border: '#F9E79F' },
  error:   { icon: 'close-circle'       as const, color: '#922B21', bg: '#FDEDEC', border: '#F1948A' },
};

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)   return 'práve teraz';
  if (diff < 3600) return `pred ${Math.floor(diff / 60)} min`;
  if (diff < 86400)return `pred ${Math.floor(diff / 3600)} hod`;
  const days = Math.floor(diff / 86400);
  if (days === 1)  return 'včera';
  if (days < 7)    return `pred ${days} dňami`;
  return new Date(dateStr).toLocaleDateString('sk-SK', { day: 'numeric', month: 'long' });
}

// ─── Karta notifikácie ────────────────────────────────────────────────────────
function NotifCard({ item, onPress }: { item: AppNotification; onPress: () => void }) {
  const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.info;
  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: cfg.color }, !item.read && styles.cardUnread]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[styles.iconWrap, { backgroundColor: cfg.bg }]}>
        <Ionicons name={cfg.icon} size={22} color={cfg.color} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.cardTop}>
          <Text style={[styles.title, !item.read && styles.titleUnread]} numberOfLines={1}>
            {item.title}
          </Text>
          {!item.read && <View style={styles.unreadDot} />}
        </View>
        {item.body ? (
          <Text style={styles.body} numberOfLines={2}>{item.body}</Text>
        ) : null}
        <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Hlavná obrazovka ─────────────────────────────────────────────────────────
export default function NotificationsScreen() {
  const router = useRouter();
  const { notifications, loading, unreadCount, refetch, markRead, markAllRead } = useNotifications();

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Hlavička ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerSub}>CENTRUM</Text>
          <Text style={styles.headerTitle}>Notifikácie</Text>
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity style={styles.markAllBtn} onPress={markAllRead} activeOpacity={0.8}>
            <Text style={styles.markAllText}>Označiť všetky</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Obsah ── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.wal} size="large" />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="notifications-off-outline" size={52} color={COLORS.bg3} />
          <Text style={styles.emptyTitle}>Žiadne notifikácie</Text>
          <Text style={styles.emptySub}>Tu sa zobrazia správy o tvojich termínoch.</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}>

          {unreadCount > 0 && (
            <View style={styles.sectionHeader}>
              <View style={styles.sectionDot} />
              <Text style={styles.sectionLabel}>NOVÉ ({unreadCount})</Text>
            </View>
          )}

          {notifications.filter((n) => !n.read).map((n) => (
            <NotifCard key={n.id} item={n} onPress={() => markRead(n.id)} />
          ))}

          {notifications.some((n) => n.read) && (
            <View style={[styles.sectionHeader, { marginTop: 18 }]}>
              <View style={[styles.sectionDot, { backgroundColor: '#ccc' }]} />
              <Text style={[styles.sectionLabel, { color: '#bbb' }]}>PREČÍTANÉ</Text>
            </View>
          )}

          {notifications.filter((n) => n.read).map((n) => (
            <NotifCard key={n.id} item={n} onPress={() => {}} />
          ))}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },
  content:{ paddingTop: 10, paddingBottom: 20 },
  center: { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },

  header:     { backgroundColor: COLORS.esp, paddingHorizontal: SIZES.padding, paddingTop: 14, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerSub:  { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 3 },
  headerTitle:{ fontSize: 19, fontWeight: '700', color: '#fff' },
  markAllBtn: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  markAllText:{ fontSize: 11, fontWeight: '600', color: COLORS.cream },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: SIZES.padding, paddingVertical: 10 },
  sectionDot:    { width: 7, height: 7, borderRadius: 3.5, backgroundColor: COLORS.wal },
  sectionLabel:  { fontSize: 9, fontWeight: '700', color: COLORS.wal, letterSpacing: 2, textTransform: 'uppercase' },

  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: '#fff', marginHorizontal: SIZES.padding, marginBottom: 8,
    borderRadius: 14, padding: 14, borderLeftWidth: 4,
    borderWidth: 1, borderColor: COLORS.bg3,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3,
  },
  cardUnread: { backgroundColor: '#FDFAF6', borderColor: COLORS.sand },

  iconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  cardTop:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  title:       { flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.wal },
  titleUnread: { color: COLORS.esp, fontWeight: '700' },
  unreadDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.wal },
  body:        { fontSize: 12, color: COLORS.wal, lineHeight: 17, marginBottom: 5 },
  time:        { fontSize: 10, color: '#bbb', fontWeight: '500' },

  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.esp, textAlign: 'center' },
  emptySub:   { fontSize: 12, color: COLORS.wal, textAlign: 'center', lineHeight: 18 },
});
