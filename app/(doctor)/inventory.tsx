/**
 * Inventory Management — doktor/recepcia
 * Sledovanie zásob materiálu, upozornenia, história
 */
import React, { useState, useCallback } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
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

type InventoryItem = {
  id: string;
  name: string;
  category: string;
  sku: string | null;
  current_stock: number;
  min_stock: number;
  unit: string;
  price_per_unit: number;
  supplier: string | null;
  last_restocked_at: string | null;
};

const CATEGORIES = [
  { key: 'all',        label: 'Všetko',       icon: '📦' },
  { key: 'material',   label: 'Materiál',     icon: '🦷' },
  { key: 'instrument', label: 'Nástroje',     icon: '🔧' },
  { key: 'medication', label: 'Lieky',        icon: '💊' },
  { key: 'hygiene',    label: 'Hygiena',      icon: '🧴' },
  { key: 'other',      label: 'Ostatné',      icon: '📎' },
];

export default function Inventory() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showAdjust, setShowAdjust] = useState<InventoryItem | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustType, setAdjustType] = useState<'in' | 'out'>('out');

  // Form state
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('material');
  const [formStock, setFormStock] = useState('');
  const [formMinStock, setFormMinStock] = useState('5');
  const [formUnit, setFormUnit] = useState('ks');
  const [formPrice, setFormPrice] = useState('');
  const [formSupplier, setFormSupplier] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      let query = supabase.from('inventory_items').select('*').order('name');
      if (filter !== 'all') query = query.eq('category', filter);
      const { data } = await query;
      setItems(data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const filtered = search
    ? items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : items;

  const lowStock = items.filter(i => i.current_stock <= i.min_stock);
  const totalValue = items.reduce((sum, i) => sum + i.current_stock * i.price_per_unit, 0);

  async function addItem() {
    if (!formName) { Alert.alert('Chyba', 'Vyplňte názov.'); return; }
    setSaving(true);
    try {
      await supabase.from('inventory_items').insert({
        name: formName,
        category: formCategory,
        current_stock: parseInt(formStock) || 0,
        min_stock: parseInt(formMinStock) || 5,
        unit: formUnit || 'ks',
        price_per_unit: parseFloat(formPrice) || 0,
        supplier: formSupplier || null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowAdd(false);
      setFormName(''); setFormStock(''); setFormPrice(''); setFormSupplier('');
      loadData();
    } catch (e) {
      Alert.alert('Chyba', 'Nepodarilo sa pridať.');
    } finally {
      setSaving(false);
    }
  }

  async function adjustStock() {
    if (!showAdjust || !adjustQty) return;
    const qty = parseInt(adjustQty);
    if (isNaN(qty) || qty <= 0) return;

    try {
      const newStock = adjustType === 'in'
        ? showAdjust.current_stock + qty
        : Math.max(0, showAdjust.current_stock - qty);

      await supabase.from('inventory_items')
        .update({
          current_stock: newStock,
          ...(adjustType === 'in' ? { last_restocked_at: new Date().toISOString() } : {}),
        })
        .eq('id', showAdjust.id);

      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('inventory_transactions').insert({
        item_id: showAdjust.id,
        quantity: qty,
        type: adjustType,
        user_id: user?.id,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowAdjust(null); setAdjustQty('');
      loadData();
    } catch (e) {
      Alert.alert('Chyba', 'Nepodarilo sa upraviť zásoby.');
    }
  }

  function stockColor(item: InventoryItem) {
    if (item.current_stock <= 0) return COLORS.error;
    if (item.current_stock <= item.min_stock) return COLORS.warning;
    return COLORS.success;
  }

  return (
    <View style={[st.safe, { backgroundColor: colors.esp }]}>
      <HeroHeader
        title="Zásoby materiálu"
        subtitle="Inventory"
        icon="cube-outline"
        onBack={() => router.back()}
      />

      <View style={[st.body, { backgroundColor: colors.bg2 }]}>
        {/* ── Stats bar ──────────────────────────────────── */}
        <View style={st.statsBar}>
          <View style={[st.statCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Text style={[st.statNum, { color: colors.textPrimary }]}>{items.length}</Text>
            <Text style={[st.statLabel, { color: colors.textSecondary }]}>Položiek</Text>
          </View>
          <View style={[st.statCard, { backgroundColor: lowStock.length > 0 ? COLORS.errorBg : colors.cardBg, borderColor: lowStock.length > 0 ? COLORS.error + '40' : colors.bg3 }]}>
            <Text style={[st.statNum, { color: lowStock.length > 0 ? COLORS.error : colors.textPrimary }]}>{lowStock.length}</Text>
            <Text style={[st.statLabel, { color: colors.textSecondary }]}>Nízke zásoby</Text>
          </View>
          <View style={[st.statCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Text style={[st.statNum, { color: COLORS.gold }]}>{totalValue.toFixed(0)}€</Text>
            <Text style={[st.statLabel, { color: colors.textSecondary }]}>Hodnota</Text>
          </View>
        </View>

        {/* ── Search + Add ───────────────────────────────── */}
        <View style={st.searchRow}>
          <View style={[st.searchBox, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Ionicons name="search" size={16} color={colors.textSecondary} />
            <TextInput
              style={[st.searchInput, { color: colors.textPrimary }]}
              placeholder="Hľadať..."
              placeholderTextColor={colors.textSecondary}
              value={search}
              onChangeText={setSearch}
            />
          </View>
          <TouchableOpacity style={[st.addBtn, { backgroundColor: COLORS.gold }]} onPress={() => setShowAdd(true)}>
            <Ionicons name="add" size={22} color="#F5F6F8" />
          </TouchableOpacity>
        </View>

        {/* ── Category filter ────────────────────────────── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.catScroll} contentContainerStyle={{ gap: 8, paddingHorizontal: SPACING.xl }}>
          {CATEGORIES.map(c => (
            <TouchableOpacity key={c.key}
              style={[st.catChip, { backgroundColor: filter === c.key ? COLORS.gold : colors.cardBg, borderColor: filter === c.key ? COLORS.gold : colors.bg3 }]}
              onPress={() => setFilter(c.key)}
            >
              <Text style={{ fontSize: 14 }}>{c.icon}</Text>
              <Text style={[st.catText, { color: filter === c.key ? '#F5F6F8' : colors.textPrimary }]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Low stock alerts ────────────────────────────── */}
        {lowStock.length > 0 && (
          <View style={[st.alertBanner, { marginHorizontal: SPACING.xl }]}>
            <Ionicons name="warning" size={16} color={COLORS.error} />
            <Text style={st.alertText}>
              {lowStock.length} {lowStock.length === 1 ? 'položka' : 'položky'} s nízkymi zásobami!
            </Text>
          </View>
        )}

        {/* ── Items list ─────────────────────────────────── */}
        {loading ? (
          <View style={{ padding: SPACING.xl }}><SkeletonList count={5} /></View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={i => i.id}
            contentContainerStyle={{ padding: SPACING.xl, paddingTop: 8 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={[st.emptyCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <Text style={{ fontSize: 40 }}>📦</Text>
                <Text style={[st.emptyText, { color: colors.textSecondary }]}>Žiadne položky</Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[st.itemCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}
                onPress={() => { setShowAdjust(item); setAdjustType('out'); setAdjustQty(''); }}
                activeOpacity={0.85}
              >
                <View style={st.itemRow}>
                  <View style={[st.stockBadge, { backgroundColor: stockColor(item) + '15', borderColor: stockColor(item) }]}>
                    <Text style={[st.stockNum, { color: stockColor(item) }]}>{item.current_stock}</Text>
                    <Text style={[st.stockUnit, { color: stockColor(item) }]}>{item.unit}</Text>
                  </View>
                  <View style={st.itemMeta}>
                    <Text style={[st.itemName, { color: colors.textPrimary }]}>{item.name}</Text>
                    <Text style={[st.itemSub, { color: colors.textSecondary }]}>
                      Min: {item.min_stock} {item.unit} · {item.price_per_unit}€/{item.unit}
                    </Text>
                  </View>
                  {item.current_stock <= item.min_stock && (
                    <View style={[st.lowBadge, { backgroundColor: COLORS.errorBg }]}>
                      <Ionicons name="alert" size={12} color={COLORS.error} />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </View>

      {/* ── Add Modal ────────────────────────────────────── */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={st.modalOverlay}>
          <View style={[st.modalContent, { backgroundColor: colors.bg2 }]}>
            <View style={st.modalHeader}>
              <Text style={[st.modalTitle, { color: colors.textPrimary }]}>Nová položka</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[st.fLabel, { color: colors.textSecondary }]}>Názov *</Text>
              <TextInput style={[st.fInput, { color: colors.textPrimary, backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}
                value={formName} onChangeText={setFormName} placeholder="Napr. Výplňový materiál A2" placeholderTextColor={colors.textSecondary} />

              <Text style={[st.fLabel, { color: colors.textSecondary }]}>Kategória</Text>
              <View style={st.catPicker}>
                {CATEGORIES.filter(c => c.key !== 'all').map(c => (
                  <TouchableOpacity key={c.key}
                    style={[st.catOption, { backgroundColor: formCategory === c.key ? COLORS.gold : colors.cardBg }]}
                    onPress={() => setFormCategory(c.key)}>
                    <Text style={{ fontSize: 16 }}>{c.icon}</Text>
                    <Text style={[st.catOptionText, { color: formCategory === c.key ? '#F5F6F8' : colors.textPrimary }]}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={st.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.fLabel, { color: colors.textSecondary }]}>Stav</Text>
                  <TextInput style={[st.fInput, { color: colors.textPrimary, backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}
                    value={formStock} onChangeText={setFormStock} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.fLabel, { color: colors.textSecondary }]}>Min. zásoba</Text>
                  <TextInput style={[st.fInput, { color: colors.textPrimary, backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}
                    value={formMinStock} onChangeText={setFormMinStock} keyboardType="numeric" placeholderTextColor={colors.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.fLabel, { color: colors.textSecondary }]}>Jednotka</Text>
                  <TextInput style={[st.fInput, { color: colors.textPrimary, backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}
                    value={formUnit} onChangeText={setFormUnit} placeholderTextColor={colors.textSecondary} />
                </View>
              </View>

              <View style={st.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.fLabel, { color: colors.textSecondary }]}>Cena/ks (€)</Text>
                  <TextInput style={[st.fInput, { color: colors.textPrimary, backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}
                    value={formPrice} onChangeText={setFormPrice} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.fLabel, { color: colors.textSecondary }]}>Dodávateľ</Text>
                  <TextInput style={[st.fInput, { color: colors.textPrimary, backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}
                    value={formSupplier} onChangeText={setFormSupplier} placeholderTextColor={colors.textSecondary} />
                </View>
              </View>

              <TouchableOpacity style={[st.saveBtn, saving && { opacity: 0.5 }]} onPress={addItem} disabled={saving}>
                <Text style={st.saveBtnText}>{saving ? 'Ukladám...' : 'Pridať položku'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Adjust Modal ─────────────────────────────────── */}
      <Modal visible={!!showAdjust} animationType="slide" transparent>
        <View style={st.modalOverlay}>
          <View style={[st.modalContent, { backgroundColor: colors.bg2, maxHeight: '50%' }]}>
            <View style={st.modalHeader}>
              <Text style={[st.modalTitle, { color: colors.textPrimary }]}>{showAdjust?.name}</Text>
              <TouchableOpacity onPress={() => setShowAdjust(null)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[st.adjustStock, { color: colors.textPrimary }]}>
              Aktuálne: <Text style={{ color: stockColor(showAdjust!), fontWeight: '800' }}>{showAdjust?.current_stock} {showAdjust?.unit}</Text>
            </Text>

            <View style={st.typeRow}>
              <TouchableOpacity
                style={[st.typeBtn, adjustType === 'out' && { backgroundColor: COLORS.errorBg, borderColor: COLORS.error }]}
                onPress={() => setAdjustType('out')}>
                <Ionicons name="remove-circle" size={20} color={adjustType === 'out' ? COLORS.error : colors.textSecondary} />
                <Text style={[st.typeBtnText, { color: adjustType === 'out' ? COLORS.error : colors.textSecondary }]}>Výdaj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.typeBtn, adjustType === 'in' && { backgroundColor: COLORS.successBg, borderColor: COLORS.success }]}
                onPress={() => setAdjustType('in')}>
                <Ionicons name="add-circle" size={20} color={adjustType === 'in' ? COLORS.success : colors.textSecondary} />
                <Text style={[st.typeBtnText, { color: adjustType === 'in' ? COLORS.success : colors.textSecondary }]}>Príjem</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={[st.fInput, { color: colors.textPrimary, backgroundColor: colors.cardBg, borderColor: colors.bg3, fontSize: 24, textAlign: 'center' }]}
              value={adjustQty} onChangeText={setAdjustQty} keyboardType="numeric" placeholder="Množstvo"
              placeholderTextColor={colors.textSecondary} />

            <TouchableOpacity
              style={[st.saveBtn, { backgroundColor: adjustType === 'in' ? COLORS.success : COLORS.error }, !adjustQty && { opacity: 0.5 }]}
              onPress={adjustStock} disabled={!adjustQty}>
              <Text style={st.saveBtnText}>{adjustType === 'in' ? 'Naskladniť' : 'Vyskladniť'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1 },

  statsBar: { flexDirection: 'row', gap: 8, padding: SPACING.xl, paddingBottom: 12 },
  statCard: { flex: 1, borderRadius: RADII.md, borderWidth: 1, padding: 12, alignItems: 'center' },
  statNum: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 10, marginTop: 2 },

  searchRow: { flexDirection: 'row', gap: 8, paddingHorizontal: SPACING.xl, marginBottom: 12 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: RADII.pill, borderWidth: 1, height: 40 },
  searchInput: { flex: 1, fontSize: 14 },
  addBtn: { width: 40, height: 40, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },

  catScroll: { marginBottom: 12 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADII.pill, borderWidth: 1 },
  catText: { fontSize: 12, fontWeight: '600' },

  alertBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: COLORS.errorBg, borderRadius: RADII.sm, marginBottom: 8 },
  alertText: { color: COLORS.error, fontSize: 12, fontWeight: '600' },

  itemCard: { borderRadius: RADII.md, borderWidth: 1, padding: 12, marginBottom: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stockBadge: { width: 48, height: 48, borderRadius: 2, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  stockNum: { fontSize: 16, fontWeight: '800' },
  stockUnit: { fontSize: 9, fontWeight: '600' },
  itemMeta: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: '600' },
  itemSub: { fontSize: 11, marginTop: 2 },
  lowBadge: { width: 24, height: 24, borderRadius: 2, justifyContent: 'center', alignItems: 'center' },

  emptyCard: { borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.xl, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 13 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.xl, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700' },

  fLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 14 },
  fInput: { borderWidth: 1, borderRadius: RADII.sm, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  formRow: { flexDirection: 'row', gap: 10 },
  catPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catOption: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADII.pill },
  catOptionText: { fontSize: 12, fontWeight: '600' },

  adjustStock: { fontSize: 16, marginBottom: 16 },
  typeRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: RADII.md, borderWidth: 1, borderColor: 'transparent' },
  typeBtnText: { fontSize: 14, fontWeight: '600' },

  saveBtn: { paddingVertical: 14, borderRadius: RADII.pill, backgroundColor: COLORS.gold, alignItems: 'center', marginTop: 20, marginBottom: 20, ...SHADOWS.gold },
  saveBtnText: { color: '#F5F6F8', fontWeight: '700', fontSize: 15 },
});
