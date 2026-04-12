import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../../styles/theme';

type Category = 'all' | 'brushes' | 'floss' | 'whitening' | 'mouthwash';

const CATEGORIES: { key: Category; label: string; emoji: string }[] = [
  { key: 'all',       label: 'Všetko',    emoji: '🛍️' },
  { key: 'brushes',   label: 'Kefky',     emoji: '🪥' },
  { key: 'floss',     label: 'Nite',      emoji: '🧵' },
  { key: 'whitening', label: 'Bielenie',  emoji: '✨' },
  { key: 'mouthwash', label: 'Ústna voda',emoji: '💧' },
];

// Produkty odporúčané doktorom — zobrazujú sa vždy navrchu
const DOCTOR_PICKS = [
  { id: 101, emoji: '🪥', name: 'Oral-B iO Series 7',   desc: 'Elektrická kefka — ideálna po ošetrení', reason: 'Šetrná k ďasnám po zákroku' },
  { id: 102, emoji: '🧵', name: 'Oral-B Super Floss',    desc: 'Špeciálna niť pre mosty a implantáty',  reason: 'Odporúčame pre tvoj typ chrupu' },
  { id: 103, emoji: '💧', name: 'Listerine Total Care',  desc: 'Ústna voda 6v1 — denná ochrana',         reason: 'Profylaktická ochrana ďasien' },
];

const PRODUCTS = [
  { id: 1, category: 'brushes',   name: 'Oral-B iO Series 7',       desc: 'Elektrická kefka s AI technológiou',          price: '89,90 €', badge: '⭐ Top', emoji: '🪥' },
  { id: 2, category: 'brushes',   name: 'Philips Sonicare',          desc: 'Sonická kefka pre citlivé ďasná',            price: '79,90 €', badge: null,     emoji: '🪥' },
  { id: 3, category: 'floss',     name: 'Oral-B Super Floss',        desc: 'Pre mosty a implantáty',                      price: '4,90 €',  badge: '🦷 Odporúčané', emoji: '🧵' },
  { id: 4, category: 'floss',     name: 'Waterpik WP-660',           desc: 'Ústna sprcha — účinnejšia ako niť',          price: '59,90 €', badge: null,     emoji: '💦' },
  { id: 5, category: 'whitening', name: 'Crest 3D Whitestrips',      desc: 'Bieliace pásiky na 14 dní',                  price: '34,90 €', badge: '✨ Bestseller', emoji: '✨' },
  { id: 6, category: 'whitening', name: 'Colgate Optic White',       desc: 'Zubná pasta s bieliacim účinkom',            price: '7,90 €',  badge: null,     emoji: '🦷' },
  { id: 7, category: 'mouthwash', name: 'Listerine Total Care',      desc: 'Ústna voda 6v1 ochrana',                     price: '6,90 €',  badge: '💙 Obľúbené', emoji: '💧' },
  { id: 8, category: 'mouthwash', name: 'Corsodyl Daily',            desc: 'Špeciálna ústna voda na ďasná',             price: '8,90 €',  badge: null,     emoji: '🌿' },
];

export default function ShopScreen() {
  const [activeCategory, setActiveCategory] = useState<Category>('all');

  const filtered = PRODUCTS.filter(
    (p) => activeCategory === 'all' || p.category === activeCategory
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerSub}>ODPORÚČANÉ PRE TEBA</Text>
        <Text style={styles.headerTitle}>Dentálny Shop</Text>
      </View>

      {/* Kategórie */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.catScroll} contentContainerStyle={styles.catContent}>
        {CATEGORIES.map((c) => (
          <TouchableOpacity key={c.key}
            style={[styles.catBtn, activeCategory === c.key && styles.catBtnActive]}
            onPress={() => setActiveCategory(c.key)} activeOpacity={0.75}>
            <Text style={styles.catEmoji}>{c.emoji}</Text>
            <Text style={[styles.catLabel, activeCategory === c.key && styles.catLabelActive]}>
              {c.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}>

        {/* ── Doktor odporúča ── */}
        <View style={styles.doctorSection}>
          <View style={styles.doctorHeader}>
            <Ionicons name="medical" size={14} color={COLORS.wal} />
            <Text style={styles.doctorHeaderText}>DOKTOR ODPORÚČA</Text>
          </View>
          {DOCTOR_PICKS.map((p) => (
            <TouchableOpacity key={p.id} style={styles.doctorCard}
              onPress={() => Alert.alert(p.name, `${p.desc}\n\n💬 Doktor: „${p.reason}"`)}
              activeOpacity={0.85}>
              <Text style={styles.doctorEmoji}>{p.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.doctorName}>{p.name}</Text>
                <Text style={styles.doctorDesc}>{p.desc}</Text>
                <View style={styles.doctorReasonRow}>
                  <Ionicons name="chatbubble-outline" size={10} color={COLORS.wal} />
                  <Text style={styles.doctorReason}>{p.reason}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={COLORS.sand} />
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Všetky produkty ── */}
        <Text style={styles.allProductsLabel}>VŠETKY PRODUKTY</Text>
        <View style={styles.grid}>
          {filtered.map((p) => (
            <TouchableOpacity key={p.id} style={styles.card}
              onPress={() => Alert.alert(p.name, `${p.desc}\n\nCena: ${p.price}\n\nFunkcia objednávky bude dostupná čoskoro.`)}
              activeOpacity={0.85}>
              {p.badge && (
                <View style={styles.badgeWrap}>
                  <Text style={styles.badgeText}>{p.badge}</Text>
                </View>
              )}
              <Text style={styles.productEmoji}>{p.emoji}</Text>
              <Text style={styles.productName}>{p.name}</Text>
              <Text style={styles.productDesc}>{p.desc}</Text>
              <View style={styles.priceRow}>
                <Text style={styles.price}>{p.price}</Text>
                <View style={styles.addBtn}>
                  <Text style={styles.addBtnText}>+</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.comingSoon}>
          <Text style={styles.comingSoonEmoji}>🚀</Text>
          <Text style={styles.comingSoonTitle}>Čoskoro k dispozícii</Text>
          <Text style={styles.comingSoonSub}>Online objednávanie produktov bude dostupné v ďalšej verzii aplikácie.</Text>
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: COLORS.esp },
  scroll:{ flex: 1, backgroundColor: COLORS.bg2 },
  content: { padding: SIZES.padding },

  header: { backgroundColor: COLORS.esp, paddingHorizontal: SIZES.padding, paddingTop: 18, paddingBottom: 18 },
  headerSub:   { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 3 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },

  catScroll:   { backgroundColor: COLORS.bg3, maxHeight: 64 },
  catContent:  { paddingHorizontal: SIZES.padding, paddingVertical: 10, gap: 8 },
  catBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.bg3 },
  catBtnActive:{ backgroundColor: COLORS.esp, borderColor: COLORS.wal },
  catEmoji:    { fontSize: 14 },
  catLabel:    { fontSize: 11, fontWeight: '600', color: COLORS.wal },
  catLabelActive: { color: COLORS.cream },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  card: { width: '47%', backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.bg3, elevation: 2 },
  badgeWrap: { backgroundColor: COLORS.bg3, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 8 },
  badgeText: { fontSize: 9, fontWeight: '700', color: COLORS.wal },
  productEmoji: { fontSize: 32, marginBottom: 8 },
  productName:  { fontSize: 13, fontWeight: '700', color: COLORS.esp, marginBottom: 4, lineHeight: 18 },
  productDesc:  { fontSize: 10, color: COLORS.wal, lineHeight: 14, marginBottom: 10 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' },
  price:    { fontSize: 15, fontWeight: '700', color: COLORS.esp },
  addBtn:   { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.esp, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { fontSize: 18, color: '#fff', lineHeight: 22 },

  comingSoon: { alignItems: 'center', padding: 24, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: COLORS.bg3, borderStyle: 'dashed' },
  comingSoonEmoji: { fontSize: 36, marginBottom: 10 },
  comingSoonTitle: { fontSize: 15, fontWeight: '700', color: COLORS.esp, marginBottom: 6 },
  comingSoonSub:   { fontSize: 12, color: COLORS.wal, textAlign: 'center', lineHeight: 18 },

  // Doktor odporúča
  doctorSection:    { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1.5, borderColor: COLORS.sand, marginBottom: 20, overflow: 'hidden' },
  doctorHeader:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.esp, paddingHorizontal: 14, paddingVertical: 10 },
  doctorHeaderText: { fontSize: 10, fontWeight: '700', color: COLORS.sand, letterSpacing: 2, textTransform: 'uppercase' },
  doctorCard:       { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.bg3 },
  doctorEmoji:      { fontSize: 28, width: 40, textAlign: 'center' },
  doctorName:       { fontSize: 13, fontWeight: '700', color: COLORS.esp, marginBottom: 2 },
  doctorDesc:       { fontSize: 10, color: COLORS.wal, marginBottom: 4 },
  doctorReasonRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  doctorReason:     { fontSize: 10, color: COLORS.wal, fontStyle: 'italic', flex: 1 },
  allProductsLabel: { fontSize: 9, letterSpacing: 2, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 12 },
});
