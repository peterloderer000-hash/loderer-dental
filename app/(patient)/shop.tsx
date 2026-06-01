import React, { useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { COLORS, RADII, SHADOWS, TYPO, GRADIENTS, SPACING } from '../../styles/theme';
import { useAppTheme } from '../../context/ThemeContext';

type Category = 'all' | 'brushes' | 'floss' | 'whitening' | 'mouthwash';

const CATEGORIES: { key: Category; label: string; emoji: string }[] = [
  { key: 'all',       label: 'Všetko',     emoji: '🛍️' },
  { key: 'brushes',   label: 'Kefky',      emoji: '🪥' },
  { key: 'floss',     label: 'Nite',       emoji: '🧵' },
  { key: 'whitening', label: 'Bielenie',   emoji: '✨' },
  { key: 'mouthwash', label: 'Ústna voda', emoji: '💧' },
];

const DOCTOR_PICKS = [
  { id: 101, emoji: '🪥', name: 'Oral-B iO Series 7',  desc: 'Elektrická kefka — ideálna po ošetrení', reason: 'Šetrná k ďasnám po zákroku' },
  { id: 102, emoji: '🧵', name: 'Oral-B Super Floss',   desc: 'Špeciálna niť pre mosty a implantáty',  reason: 'Odporúčame pre tvoj typ chrupu' },
  { id: 103, emoji: '💧', name: 'Listerine Total Care', desc: 'Ústna voda 6v1 — denná ochrana',         reason: 'Profylaktická ochrana ďasien' },
];

const PRODUCTS = [
  { id: 1, category: 'brushes',   name: 'Oral-B iO Series 7',  desc: 'Elektrická kefka s AI technológiou', price: '89,90 €', badge: '⭐ Top',             emoji: '🪥' },
  { id: 2, category: 'brushes',   name: 'Philips Sonicare',     desc: 'Sonická kefka pre citlivé ďasná',   price: '79,90 €', badge: null,                  emoji: '🪥' },
  { id: 3, category: 'floss',     name: 'Oral-B Super Floss',   desc: 'Pre mosty a implantáty',             price: '4,90 €',  badge: '🦷 Odporúčané',       emoji: '🧵' },
  { id: 4, category: 'floss',     name: 'Waterpik WP-660',      desc: 'Ústna sprcha — účinnejšia ako niť', price: '59,90 €', badge: null,                  emoji: '💦' },
  { id: 5, category: 'whitening', name: 'Crest 3D Whitestrips', desc: 'Bieliace pásiky na 14 dní',          price: '34,90 €', badge: '✨ Bestseller',        emoji: '✨' },
  { id: 6, category: 'whitening', name: 'Colgate Optic White',  desc: 'Zubná pasta s bieliacim účinkom',   price: '7,90 €',  badge: null,                  emoji: '🦷' },
  { id: 7, category: 'mouthwash', name: 'Listerine Total Care', desc: 'Ústna voda 6v1 ochrana',             price: '6,90 €',  badge: '💙 Obľúbené',         emoji: '💧' },
  { id: 8, category: 'mouthwash', name: 'Corsodyl Daily',       desc: 'Špeciálna ústna voda na ďasná',    price: '8,90 €',  badge: null,                  emoji: '🌿' },
];

export default function ShopScreen() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  const [activeCategory, setActiveCategory] = useState<Category>('all');

  const filtered = PRODUCTS.filter(
    p => activeCategory === 'all' || p.category === activeCategory,
  );

  function handlePickPress(p: typeof DOCTOR_PICKS[0]) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(p.name, `${p.desc}\n\n💬 Doktor: „${p.reason}"`);
  }

  function handleProductInfo(p: typeof PRODUCTS[0]) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(p.name, `${p.desc}\n\nCena: ${p.price}`);
  }

  function handleBuyInClinic(p: typeof PRODUCTS[0]) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.push('/(patient)/chat');
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.esp }}>
      {/* Hero */}
      <LinearGradient colors={GRADIENTS.hero as [string, string, ...string[]]} style={s.hero}>
        <View style={[s.circle, { width: 200, height: 200, right: -60, top: -60, opacity: 0.06 }]} />
        <View style={[s.circle, { width: 120, height: 120, left: -20, bottom: -30, opacity: 0.04 }]} />

        <Text style={s.heroLabel}>DENTÁLNY SHOP</Text>
        <Text style={s.heroTitle}>Odporúčaná{'\n'}starostlivosť</Text>
        <Text style={s.heroSub}>Produkty vybrané pre teba doktorom</Text>

        {/* Category pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.catRow}
          style={{ marginTop: 16 }}
        >
          {CATEGORIES.map(c => (
            <TouchableOpacity
              key={c.key}
              style={[s.catPill, activeCategory === c.key && s.catPillActive]}
              onPress={() => { setActiveCategory(c.key); Haptics.selectionAsync(); }}
              activeOpacity={0.8}
            >
              <Text style={s.catEmoji}>{c.emoji}</Text>
              <Text style={[s.catLabel, activeCategory === c.key ? { color: '#fff' } : { color: 'rgba(196,168,130,0.7)' }]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg2 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}
      >
        {/* ── Doctor Picks ── */}
        <View>
          <View style={s.sectionHeader}>
            <View style={[s.sectionDot, { backgroundColor: COLORS.gold }]} />
            <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>DOKTOR ODPORÚČA</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 4 }}>
            {DOCTOR_PICKS.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[s.pickCard, { backgroundColor: colors.cardBg }, SHADOWS.md]}
                onPress={() => handlePickPress(p)}
                activeOpacity={0.85}
              >
                <View style={s.pickGoldBadge}>
                  <Ionicons name="medical" size={10} color={COLORS.gold} />
                  <Text style={s.pickGoldBadgeText}>Odporúčanie doktora</Text>
                </View>
                <Text style={s.pickEmoji}>{p.emoji}</Text>
                <Text style={[s.pickName, { color: colors.textPrimary }]}>{p.name}</Text>
                <Text style={[s.pickDesc, { color: colors.textSecondary }]}>{p.desc}</Text>
                <View style={s.pickReasonRow}>
                  <Ionicons name="chatbubble-outline" size={10} color={COLORS.gold} />
                  <Text style={[s.pickReason, { color: colors.textSecondary }]}>{p.reason}</Text>
                </View>
                <TouchableOpacity
                  style={s.pickClinicBtn}
                  onPress={() => router.push('/(patient)/chat')}
                  activeOpacity={0.8}
                >
                  <Text style={s.pickClinicText}>Spýtať sa doktora</Text>
                  <Ionicons name="chevron-forward" size={12} color={COLORS.gold} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── Product grid ── */}
        <View>
          <View style={s.sectionHeader}>
            <View style={[s.sectionDot, { backgroundColor: COLORS.sand }]} />
            <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>VŠETKY PRODUKTY</Text>
          </View>

          {filtered.length === 0 ? (
            <View style={[s.empty, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <Text style={s.emptyEmoji}>🛍️</Text>
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Žiadne produkty</Text>
              <Text style={[s.emptySub, { color: colors.textSecondary }]}>
                Zatiaľ žiadne produkty v tejto kategórii
              </Text>
            </View>
          ) : (
            <View style={s.grid}>
              {filtered.map(p => (
                <View
                  key={p.id}
                  style={[s.productCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, SHADOWS.sm]}
                >
                  {p.badge && (
                    <View style={[s.badge, { backgroundColor: dark ? COLORS.esp : COLORS.bg3 }]}>
                      <Text style={[s.badgeText, { color: colors.textSecondary }]}>{p.badge}</Text>
                    </View>
                  )}
                  <Text style={s.productEmoji}>{p.emoji}</Text>
                  <Text style={[s.productName, { color: colors.textPrimary }]}>{p.name}</Text>
                  <Text style={[s.productDesc, { color: colors.textSecondary }]}>{p.desc}</Text>
                  <Text style={[s.price, { color: COLORS.esp }]}>{p.price}</Text>

                  <View style={s.productActions}>
                    <TouchableOpacity
                      style={[s.infoBtn, { borderColor: colors.bg3 }]}
                      onPress={() => handleProductInfo(p)}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.infoBtnText, { color: colors.textSecondary }]}>Viac info</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.clinicBtn}
                      onPress={() => handleBuyInClinic(p)}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={GRADIENTS.gold as [string, string, ...string[]]}
                        style={s.clinicBtnGrad}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      >
                        <Text style={s.clinicBtnText}>V ambulancii</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Odporúčacie upozornenie */}
        <View style={[s.comingSoon, { backgroundColor: dark ? '#0D2233' : '#EBF5FB', borderColor: dark ? '#1A527655' : '#AED6F1' }]}>
          <Text style={s.comingSoonEmoji}>💬</Text>
          <Text style={[s.comingSoonTitle, { color: dark ? '#5DADE2' : '#1A5276' }]}>Potrebujete poradiť s výberom?</Text>
          <Text style={[s.comingSoonSub, { color: dark ? '#7FB3D3' : '#1A5276' }]}>
            Náš tím vám odporučí produkt na mieru. Napíšte nám cez AI Chat alebo priamo cez správy.
          </Text>
          <TouchableOpacity
            style={[s.comingSoonBtn, { backgroundColor: dark ? '#1A5276' : '#2980B9' }]}
            onPress={() => router.push('/(patient)/chat')}
            activeOpacity={0.85}
          >
            <Text style={s.comingSoonBtnText}>Spýtať sa AI asistenta →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, overflow: 'hidden' },
  circle: { position: 'absolute', borderRadius: 999, backgroundColor: '#FAF6F0' },
  heroLabel: { ...TYPO.overline, color: COLORS.sand, marginBottom: 4 },
  heroTitle: { fontFamily: 'PlayfairDisplay_700Bold_Italic', fontSize: 26, lineHeight: 34, color: '#FAF6F0' },
  heroSub:   { ...TYPO.bodySm, color: 'rgba(196,168,130,0.7)', marginTop: 6 },

  catRow:     { flexDirection: 'row', gap: 8, paddingBottom: 16, paddingTop: 2 },
  catPill:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADII.full, backgroundColor: 'rgba(255,255,255,0.08)' },
  catPillActive: { backgroundColor: COLORS.gold },
  catEmoji:   { fontSize: 14 },
  catLabel:   { fontFamily: 'DMSans_500Medium', fontSize: 12, letterSpacing: 0.3 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionDot:    { width: 6, height: 6, borderRadius: 3 },
  sectionLabel:  { ...TYPO.label },

  // Doctor picks
  pickCard: { width: 200, borderRadius: RADII.lg, padding: 14, borderWidth: 1.5, borderColor: COLORS.goldLight, gap: 6 },
  pickGoldBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.goldLight + '40', borderRadius: RADII.full, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  pickGoldBadgeText: { fontFamily: 'DMSans_500Medium', fontSize: 9, color: COLORS.goldDark, letterSpacing: 0.3 },
  pickEmoji: { fontSize: 28 },
  pickName:  { fontFamily: 'DMSans_500Medium', fontSize: 13, lineHeight: 18 },
  pickDesc:  { fontFamily: 'DMSans_400Regular', fontSize: 11, lineHeight: 15 },
  pickReasonRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pickReason:    { fontFamily: 'DMSans_400Regular', fontSize: 10, fontStyle: 'italic', flex: 1 },
  pickClinicBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  pickClinicText: { fontFamily: 'DMSans_500Medium', fontSize: 11, color: COLORS.gold },

  // Product grid
  grid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  productCard: { width: '47.5%', borderRadius: RADII.lg, padding: 14, borderWidth: 1, gap: 4 },
  badge:     { borderRadius: RADII.xs, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 4 },
  badgeText: { fontFamily: 'DMSans_500Medium', fontSize: 9, letterSpacing: 0.3 },
  productEmoji: { fontSize: 32, marginBottom: 4 },
  productName:  { fontFamily: 'DMSans_500Medium', fontSize: 13, lineHeight: 17 },
  productDesc:  { fontFamily: 'DMSans_400Regular', fontSize: 10, lineHeight: 14 },
  price:        { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 16, color: COLORS.esp, marginTop: 4 },

  productActions: { flexDirection: 'row', gap: 6, marginTop: 8 },
  infoBtn:     { flex: 1, borderRadius: RADII.sm, borderWidth: 1, paddingVertical: 7, alignItems: 'center' },
  infoBtnText: { fontFamily: 'DMSans_500Medium', fontSize: 10 },
  clinicBtn:   { flex: 1, borderRadius: RADII.sm, overflow: 'hidden' },
  clinicBtnGrad: { paddingVertical: 7, alignItems: 'center', justifyContent: 'center' },
  clinicBtnText: { fontFamily: 'DMSans_500Medium', fontSize: 10, color: '#fff' },

  // Empty
  empty: { borderRadius: RADII.lg, padding: 32, alignItems: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed' },
  emptyEmoji:  { fontSize: 48 },
  emptyTitle:  { ...TYPO.h2, textAlign: 'center' },
  emptySub:    { ...TYPO.body, textAlign: 'center' },

  // Coming soon
  comingSoon:      { borderRadius: RADII.lg, padding: 16, alignItems: 'center', gap: 8, borderWidth: 1 },
  comingSoonBtn:   { borderRadius: RADII.md, paddingVertical: 10, paddingHorizontal: 20, marginTop: 4 },
  comingSoonBtnText: { fontFamily: 'DMSans_500Medium', fontSize: 13, color: '#fff' },
  comingSoonEmoji: { fontSize: 32 },
  comingSoonTitle: { fontFamily: 'DMSans_500Medium', fontSize: 14 },
  comingSoonSub:   { ...TYPO.bodySm, textAlign: 'center' },
});
