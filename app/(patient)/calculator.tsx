import React, { useMemo, useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { COLORS, SIZES } from '../../styles/theme';
import { useServices, Service, formatDuration } from '../../hooks/useServices';

// ─── Hlavná obrazovka ─────────────────────────────────────────────────────────
export default function CalculatorScreen() {
  const router = useRouter();
  const { grouped, loading } = useServices();
  const [basket, setBasket] = useState<Service[]>([]);
  const [openCat, setOpenCat] = useState<string | null>(null);

  // ── Košík logika ─────────────────────────────────────────────────────────
  function addToBasket(svc: Service) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBasket((prev) => [...prev, svc]);
  }

  function removeFromBasket(index: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBasket((prev) => prev.filter((_, i) => i !== index));
  }

  function clearBasket() {
    Alert.alert('Vymazať kalkuláciu', 'Naozaj chcete vyprázdniť zoznam?', [
      { text: 'Zrušiť', style: 'cancel' },
      { text: 'Vymazať', style: 'destructive', onPress: () => setBasket([]) },
    ]);
  }

  // ── Súčty ────────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    let minTotal = 0;
    let maxTotal = 0;
    let durationTotal = 0;
    basket.forEach((svc) => {
      minTotal     += svc.price_min ?? 0;
      maxTotal     += svc.price_max ?? svc.price_min ?? 0;
      durationTotal += svc.duration_minutes;
    });
    return { minTotal, maxTotal, durationTotal };
  }, [basket]);

  // Počet výskytov každej služby v košíku
  const basketCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    basket.forEach((s) => { counts[s.id] = (counts[s.id] ?? 0) + 1; });
    return counts;
  }, [basket]);

  // Zoskupenie košíka pre zobrazenie (memoizované — nie znovu-počítané pri každom renderi)
  const basketGrouped = useMemo(() =>
    basket.reduce<Record<string, { svc: Service; count: number }>>((acc, s) => {
      if (!acc[s.id]) acc[s.id] = { svc: s, count: 0 };
      acc[s.id].count++;
      return acc;
    }, {}),
  [basket]);

  function formatTotalPrice(min: number, max: number): string {
    if (min === 0 && max === 0) return 'Zadarmo';
    if (min === max) return `${min} €`;
    return `${min} – ${max} €`;
  }

  function formatTotalDuration(minutes: number): string {
    if (minutes === 0) return '—';
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h} hod` : `${h} hod ${m} min`;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Hlavička ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerSub}>ORIENTAČNÁ CENA</Text>
          <Text style={styles.headerTitle}>Kalkulačka služieb</Text>
        </View>
        {basket.length > 0 && (
          <TouchableOpacity onPress={clearBasket} style={styles.clearBtn} activeOpacity={0.75}>
            <Ionicons name="trash-outline" size={17} color="#922B21" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}>

        {/* ── Info banner ── */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={16} color="#1A5276" />
          <Text style={styles.infoText}>
            Vyberte plánované zákroky a zistite orientačnú cenu. Presná suma závisí od konkrétneho stavu zubov.
          </Text>
        </View>

        {/* ── Zoznam výberu ── */}
        {Object.entries(grouped ?? {}).map(([category, items]) => {
          const isOpen = openCat === category;
          return (
            <View key={category} style={styles.categoryBlock}>
              {/* Kategória hlavička */}
              <TouchableOpacity
                style={[styles.catHeader, isOpen && styles.catHeaderOpen]}
                onPress={() => setOpenCat(isOpen ? null : category)}
                activeOpacity={0.8}
              >
                <Text style={[styles.catLabel, isOpen && styles.catLabelOpen]}>{category}</Text>
                <View style={styles.catRight}>
                  {items.some((s) => (basketCounts[s.id] ?? 0) > 0) && (
                    <View style={styles.catBadge}>
                      <Text style={styles.catBadgeText}>
                        {items.reduce((sum, s) => sum + (basketCounts[s.id] ?? 0), 0)}
                      </Text>
                    </View>
                  )}
                  <Ionicons
                    name={isOpen ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={isOpen ? COLORS.wal : '#bbb'}
                  />
                </View>
              </TouchableOpacity>

              {/* Zoznam služieb */}
              {isOpen && items.map((svc) => {
                const count = basketCounts[svc.id] ?? 0;
                const isFree = svc.price_min === 0 && svc.price_max === 0;
                return (
                  <View key={svc.id} style={styles.svcRow}>
                    <Text style={styles.svcEmoji}>{svc.emoji ?? '🦷'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.svcName}>{svc.name}</Text>
                      <View style={styles.svcMeta}>
                        <Text style={styles.svcPrice}>
                          {isFree ? 'Zadarmo'
                            : svc.price_min === svc.price_max
                            ? `${svc.price_min} €`
                            : `od ${svc.price_min} €`}
                        </Text>
                        <Text style={styles.svcDot}>·</Text>
                        <Text style={styles.svcDur}>{formatDuration(svc.duration_minutes)}</Text>
                      </View>
                    </View>
                    {/* +/- tlačidlá */}
                    <View style={styles.qtyRow}>
                      {count > 0 && (
                        <TouchableOpacity
                          style={styles.qtyBtn}
                          onPress={() => {
                            // Odstráni posledný výskyt tejto služby
                            const idx = basket.map((b) => b.id).lastIndexOf(svc.id);
                            if (idx !== -1) removeFromBasket(idx);
                          }}
                          activeOpacity={0.75}
                        >
                          <Ionicons name="remove" size={14} color={COLORS.wal} />
                        </TouchableOpacity>
                      )}
                      {count > 0 && (
                        <Text style={styles.qtyCount}>{count}</Text>
                      )}
                      <TouchableOpacity
                        style={[styles.qtyBtn, styles.qtyBtnAdd]}
                        onPress={() => addToBasket(svc)}
                        activeOpacity={0.75}
                      >
                        <Ionicons name="add" size={14} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}

        <View style={{ height: 200 }} />
      </ScrollView>

      {/* ── Súhrnný panel (fixný dole) ── */}
      <View style={styles.summaryPanel}>
        {basket.length === 0 ? (
          <View style={styles.emptyBasket}>
            <Ionicons name="calculator-outline" size={20} color={COLORS.wal} />
            <Text style={styles.emptyText}>Pridajte zákroky zo zoznamu vyššie</Text>
          </View>
        ) : (
          <>
            {/* Zoznam vybraných */}
            <ScrollView
              style={styles.basketScroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              {/* Zoskupenie rovnakých služieb */}
              {Object.entries(basketGrouped).map(([id, { svc, count }]) => (
                <View key={id} style={styles.basketRow}>
                  <Text style={styles.basketEmoji}>{svc.emoji ?? '🦷'}</Text>
                  <Text style={styles.basketName} numberOfLines={1}>{svc.name}</Text>
                  {count > 1 && <Text style={styles.basketCount}>×{count}</Text>}
                  <Text style={styles.basketPrice}>
                    {svc.price_min === 0 && svc.price_max === 0
                      ? 'Zadarmo'
                      : svc.price_min === svc.price_max
                      ? `${(svc.price_min ?? 0) * count} €`
                      : `od ${(svc.price_min ?? 0) * count} €`}
                  </Text>
                </View>
              ))}
            </ScrollView>

            {/* Oddeľovač */}
            <View style={styles.panelDivider} />

            {/* Celková suma */}
            <View style={styles.totalRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.totalLabel}>
                  Celkový odhad · {formatTotalDuration(totals.durationTotal)}
                </Text>
                <Text style={styles.totalPrice}>
                  {formatTotalPrice(totals.minTotal, totals.maxTotal)}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.bookBtn}
                onPress={() => router.push('/(patient)/book-appointment')}
                activeOpacity={0.85}
              >
                <Ionicons name="calendar" size={16} color="#fff" />
                <Text style={styles.bookBtnText}>Rezervovať</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: COLORS.esp },
  scroll:  { flex: 1, backgroundColor: COLORS.bg2 },
  content: { padding: SIZES.padding, paddingTop: 12 },

  header:      { backgroundColor: COLORS.esp, paddingHorizontal: SIZES.padding, paddingTop: 14, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  clearBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FDEDEC', alignItems: 'center', justifyContent: 'center' },
  headerSub:   { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '500', textTransform: 'uppercase', marginBottom: 3 },
  headerTitle: { fontSize: 19, fontWeight: '700', color: '#fff' },

  infoBanner: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: '#EBF5FB', borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#AED6F1' },
  infoText:   { flex: 1, fontSize: 11, color: '#1A5276', lineHeight: 17 },

  // Kategória
  categoryBlock:  { marginBottom: 8 },
  catHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: COLORS.bg3 },
  catHeaderOpen:  { borderColor: COLORS.wal, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomWidth: 0 },
  catLabel:       { fontSize: 12, fontWeight: '700', color: COLORS.esp },
  catLabelOpen:   { color: COLORS.wal },
  catRight:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catBadge:       { backgroundColor: COLORS.wal, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, minWidth: 18, alignItems: 'center' },
  catBadgeText:   { fontSize: 9, fontWeight: '800', color: '#fff' },

  // Služba
  svcRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: COLORS.wal, borderTopWidth: 0, marginTop: 0 },
  svcEmoji: { fontSize: 20, width: 28, textAlign: 'center' },
  svcName:  { fontSize: 12, fontWeight: '600', color: COLORS.esp, marginBottom: 2 },
  svcMeta:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  svcPrice: { fontSize: 11, fontWeight: '700', color: COLORS.wal },
  svcDot:   { fontSize: 10, color: '#ccc' },
  svcDur:   { fontSize: 10, color: '#bbb' },

  // Qty tlačidlá
  qtyRow:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn:     { width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.bg3, alignItems: 'center', justifyContent: 'center' },
  qtyBtnAdd:  { backgroundColor: COLORS.wal },
  qtyCount:   { fontSize: 13, fontWeight: '800', color: COLORS.esp, minWidth: 16, textAlign: 'center' },

  // Súhrnný panel
  summaryPanel: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: COLORS.bg3, paddingHorizontal: SIZES.padding, paddingTop: 12, paddingBottom: 24, maxHeight: 280, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 12 },
  emptyBasket:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  emptyText:    { fontSize: 12, color: COLORS.wal, fontStyle: 'italic' },

  basketScroll: { maxHeight: 120 },
  basketRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  basketEmoji:  { fontSize: 14 },
  basketName:   { flex: 1, fontSize: 11, color: COLORS.esp, fontWeight: '500' },
  basketCount:  { fontSize: 11, fontWeight: '700', color: COLORS.wal },
  basketPrice:  { fontSize: 11, fontWeight: '700', color: COLORS.esp },

  panelDivider: { height: 1, backgroundColor: COLORS.bg3, marginVertical: 10 },

  totalRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  totalLabel: { fontSize: 10, color: COLORS.wal, fontWeight: '500', marginBottom: 3 },
  totalPrice: { fontSize: 22, fontWeight: '800', color: COLORS.esp },
  bookBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.wal, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  bookBtnText:{ fontSize: 13, fontWeight: '700', color: '#fff' },
});
