/**
 * Shop objednávky — recepcia
 * Prehľad pending objednávok z e-shopu, zmena statusu
 */
import React, { useState, useCallback } from 'react';
import {
  Alert, RefreshControl, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII, SHADOWS } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { SkeletonList } from '../../components/Skeleton';
import { AnimatedListItem } from '../../components/ui/AnimatedListItem';
import { useAppTheme } from '../../context/ThemeContext';

type OrderItem = { id: number; name: string; price: number; qty: number; emoji: string };

type Order = {
  id: string;
  patient_id: string;
  items: OrderItem[];
  total_price: number;
  status: string;
  notes: string | null;
  created_at: string;
  patient?: { full_name: string | null } | null;
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending:   { label: 'Čaká',         color: '#B87333', bg: '#FDF3E7', icon: '⏳' },
  ready:     { label: 'Pripravené',   color: '#52C896', bg: '#EDF7F3', icon: '✅' },
  picked_up: { label: 'Vyzdvihnuté', color: '#1A5276', bg: '#EBF5FB', icon: '📦' },
  cancelled: { label: 'Zrušené',     color: '#C0392B', bg: '#FDEDEC', icon: '❌' },
};

function fmtPrice(n: number) {
  return n.toFixed(2).replace('.', ',') + ' €';
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' }) +
    ' · ' + d.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
}

export default function ShopOrdersScreen() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();

  const [orders, setOrders]       = useState<Order[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]       = useState<'pending' | 'all'>('pending');

  const load = useCallback(async () => {
    try {
      let query = supabase
        .from('shop_orders')
        .select('id, patient_id, items, total_price, status, notes, created_at, patient:patient_id(full_name)')
        .order('created_at', { ascending: false })
        .limit(50);

      if (filter === 'pending') {
        query = query.in('status', ['pending', 'ready']);
      }

      const { data } = await query;
      setOrders((data ?? []) as unknown as Order[]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function updateStatus(orderId: string, newStatus: string) {
    const { error } = await supabase
      .from('shop_orders')
      .update({ status: newStatus })
      .eq('id', orderId);

    if (error) { Alert.alert('Chyba', error.message); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    load();
  }

  function handleAction(order: Order) {
    if (order.status === 'pending') {
      Alert.alert('Zmeniť status', `Objednávka pre ${order.patient?.full_name ?? 'pacienta'}`, [
        { text: 'Zrušiť', style: 'cancel' },
        { text: '✅ Pripravené', onPress: () => updateStatus(order.id, 'ready') },
        { text: '❌ Zrušiť objednávku', style: 'destructive', onPress: () => updateStatus(order.id, 'cancelled') },
      ]);
    } else if (order.status === 'ready') {
      Alert.alert('Vyzdvihnuté?', `Pacient ${order.patient?.full_name ?? ''} si vyzdvihol objednávku?`, [
        { text: 'Nie', style: 'cancel' },
        { text: '📦 Vyzdvihnuté', onPress: () => updateStatus(order.id, 'picked_up') },
      ]);
    }
  }

  const pendingCount = orders.filter(o => o.status === 'pending').length;
  const readyCount = orders.filter(o => o.status === 'ready').length;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg2, padding: SPACING.xl }}>
        <SkeletonList count={4} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.esp }}>
      <HeroHeader
        title="Shop objednávky"
        subtitle={`${pendingCount} čakajúcich · ${readyCount} pripravených`}
        icon="cart-outline"
        onBack={() => router.back()}
      />

      {/* Filter tabs */}
      <View style={[s.filterRow, { backgroundColor: COLORS.esp }]}>
        {(['pending', 'all'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[s.filterBtn, filter === f && s.filterBtnActive]}
            onPress={() => setFilter(f)}
            activeOpacity={0.8}
          >
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>
              {f === 'pending' ? 'Aktívne' : 'Všetky'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg2 }}
        contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.wal} />}
      >
        {orders.length === 0 ? (
          <View style={s.empty}>
            <Text style={{ fontSize: 40 }}>📦</Text>
            <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Žiadne objednávky</Text>
            <Text style={[s.emptyDesc, { color: colors.textSecondary }]}>
              {filter === 'pending' ? 'Žiadne čakajúce objednávky z e-shopu' : 'Zatiaľ neboli žiadne objednávky'}
            </Text>
          </View>
        ) : (
          orders.map((order, idx) => {
            const cfg = STATUS_CFG[order.status] ?? STATUS_CFG.pending;
            const items = (order.items ?? []) as OrderItem[];
            return (
              <AnimatedListItem key={order.id} index={idx}>
                <TouchableOpacity
                  style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}
                  onPress={() => handleAction(order)}
                  activeOpacity={order.status === 'pending' || order.status === 'ready' ? 0.85 : 1}
                >
                  {/* Header */}
                  <View style={s.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.patientName, { color: colors.textPrimary }]}>
                        {order.patient?.full_name ?? 'Pacient'}
                      </Text>
                      <Text style={[s.cardDate, { color: colors.textSecondary }]}>{fmtDate(order.created_at)}</Text>
                    </View>
                    <View style={[s.statusBadge, { backgroundColor: dark ? `${cfg.color}22` : cfg.bg }]}>
                      <Text style={{ fontSize: 12 }}>{cfg.icon}</Text>
                      <Text style={[s.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  </View>

                  {/* Items */}
                  <View style={[s.itemsBox, { backgroundColor: colors.bg2 }]}>
                    {items.map((item, i) => (
                      <View key={i} style={[s.itemRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.bg3 }]}>
                        <Text style={s.itemEmoji}>{item.emoji}</Text>
                        <Text style={[s.itemName, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                        <Text style={[s.itemQty, { color: colors.textSecondary }]}>×{item.qty}</Text>
                        <Text style={[s.itemPrice, { color: colors.textPrimary }]}>{fmtPrice(item.price * item.qty)}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Footer */}
                  <View style={s.cardFooter}>
                    {order.notes && (
                      <Text style={[s.notes, { color: colors.textSecondary }]} numberOfLines={1}>
                        📝 {order.notes}
                      </Text>
                    )}
                    <View style={{ flex: 1 }} />
                    <Text style={[s.totalPrice, { color: colors.textPrimary }]}>{fmtPrice(order.total_price)}</Text>
                  </View>

                  {/* Action hint */}
                  {(order.status === 'pending' || order.status === 'ready') && (
                    <View style={[s.actionHint, { backgroundColor: dark ? `${cfg.color}15` : `${cfg.color}10` }]}>
                      <Ionicons name="hand-left-outline" size={14} color={cfg.color} />
                      <Text style={[s.actionHintText, { color: cfg.color }]}>
                        {order.status === 'pending' ? 'Klepnite pre zmenu statusu' : 'Klepnite keď vyzdvihnuté'}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </AnimatedListItem>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  filterRow:  { flexDirection: 'row', paddingHorizontal: SPACING.xl, paddingBottom: 12, gap: 8 },
  filterBtn:  { flex: 1, paddingVertical: 8, borderRadius: 2, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  filterBtnActive: { backgroundColor: COLORS.wal },
  filterText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  filterTextActive: { color: '#F5F6F8' },

  empty:      { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyDesc:  { fontSize: 12, textAlign: 'center' },

  card:       { borderRadius: RADII.lg, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  patientName: { fontSize: 15, fontWeight: '700' },
  cardDate:   { fontSize: 11, marginTop: 2 },

  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 2, paddingHorizontal: 10, paddingVertical: 5 },
  statusText:  { fontSize: 11, fontWeight: '700' },

  itemsBox:   { marginHorizontal: 14, borderRadius: RADII.md, padding: 10, marginBottom: 10 },
  itemRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  itemEmoji:  { fontSize: 16 },
  itemName:   { flex: 1, fontSize: 12, fontWeight: '500' },
  itemQty:    { fontSize: 11 },
  itemPrice:  { fontSize: 12, fontWeight: '700', minWidth: 55, textAlign: 'right' },

  cardFooter: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 10, gap: 8 },
  notes:      { fontSize: 11, fontStyle: 'italic', flex: 1 },
  totalPrice: { fontSize: 18, fontWeight: '800' },

  actionHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  actionHintText: { fontSize: 11, fontWeight: '600' },
});
