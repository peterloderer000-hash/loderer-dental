/**
 * Dentálny shop — pacient
 * Produkty odporúčané doktorom, košík, objednávky v ambulancii
 */
import React, { useState, useCallback } from 'react';
import {
  Alert, Modal, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { supabase } from '../../supabase';
import { COLORS, RADII, SHADOWS, TYPO, GRADIENTS, SPACING } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { AnimatedListItem } from '../../components/ui/AnimatedListItem';
import { useAppTheme } from '../../context/ThemeContext';

type Category = 'all' | 'brushes' | 'floss' | 'whitening' | 'mouthwash' | 'care';

type Product = {
  id: number;
  category: string;
  name: string;
  desc: string;
  price: number;
  badge: string | null;
  emoji: string;
};

type CartItem = Product & { qty: number };

const CATEGORIES: { key: Category; label: string; emoji: string }[] = [
  { key: 'all',       label: 'Všetko',     emoji: '🛍️' },
  { key: 'brushes',   label: 'Kefky',      emoji: '🪥' },
  { key: 'floss',     label: 'Nite',       emoji: '🧵' },
  { key: 'whitening', label: 'Bielenie',   emoji: '✨' },
  { key: 'mouthwash', label: 'Ústna voda', emoji: '💧' },
  { key: 'care',      label: 'Starostlivosť', emoji: '🧴' },
];

const PRODUCTS: Product[] = [
  { id: 1, category: 'brushes',   name: 'Oral-B iO Series 7',        desc: 'Elektrická kefka s AI technológiou',     price: 89.90, badge: '⭐ Top',        emoji: '🪥' },
  { id: 2, category: 'brushes',   name: 'Philips Sonicare 4300',     desc: 'Sonická kefka pre citlivé ďasná',       price: 79.90, badge: null,             emoji: '🪥' },
  { id: 3, category: 'brushes',   name: 'Curaprox CS 5460',          desc: 'Ultra mäkká manuálna kefka',            price: 5.90,  badge: '🦷 Odporúčané', emoji: '🪥' },
  { id: 4, category: 'floss',     name: 'Oral-B Super Floss',        desc: 'Pre mosty a implantáty',                 price: 4.90,  badge: '🦷 Odporúčané', emoji: '🧵' },
  { id: 5, category: 'floss',     name: 'Waterpik WP-660',           desc: 'Ústna sprcha — účinnejšia ako niť',     price: 59.90, badge: null,             emoji: '💦' },
  { id: 6, category: 'floss',     name: 'TePe medzizubné kefky',     desc: 'Set 6 ks rôznych veľkostí',            price: 6.90,  badge: null,             emoji: '🧵' },
  { id: 7, category: 'whitening', name: 'Crest 3D Whitestrips',      desc: 'Bieliace pásiky na 14 dní',             price: 34.90, badge: '✨ Bestseller',  emoji: '✨' },
  { id: 8, category: 'whitening', name: 'Colgate Optic White',       desc: 'Zubná pasta s bieliacim účinkom',       price: 7.90,  badge: null,             emoji: '🦷' },
  { id: 9, category: 'mouthwash', name: 'Listerine Total Care',      desc: 'Ústna voda 6v1 ochrana',                price: 6.90,  badge: '💙 Obľúbené',   emoji: '💧' },
  { id: 10, category: 'mouthwash', name: 'Corsodyl Daily',           desc: 'Špeciálna ústna voda na ďasná',        price: 8.90,  badge: null,             emoji: '🌿' },
  { id: 11, category: 'care',     name: 'Elmex Sensitive Pro',        desc: 'Pasta na citlivé zuby s aminofluoridom', price: 5.90,  badge: null,            emoji: '🧴' },
  { id: 12, category: 'care',     name: 'GUM Paroex gél',             desc: 'Chlorhexidínový gél na ďasná',         price: 9.90,  badge: null,             emoji: '🧴' },
];

function fmtPrice(n: number) {
  return n.toFixed(2).replace('.', ',') + ' €';
}

export default function ShopScreen() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  const [activeCategory, setActiveCategory] = useState<Category>('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [orderNotes, setOrderNotes] = useState('');
  const [ordering, setOrdering] = useState(false);

  const filtered = PRODUCTS.filter(
    p => activeCategory === 'all' || p.category === activeCategory,
  );

  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0);

  function addToCart(product: Product) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...product, qty: 1 }];
    });
  }

  function updateQty(id: number, delta: number) {
    setCart(prev => prev.map(i => {
      if (i.id !== id) return i;
      const newQty = i.qty + delta;
      return newQty <= 0 ? null : { ...i, qty: newQty };
    }).filter(Boolean) as CartItem[]);
  }

  async function handleOrder() {
    if (cart.length === 0) return;
    setOrdering(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { Alert.alert('Chyba', 'Nie ste prihlásený.'); return; }

      const items = cart.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty, emoji: i.emoji }));
      const { error } = await supabase.from('shop_orders').insert({
        patient_id: user.id,
        items,
        total_price: cartTotal,
        notes: orderNotes.trim() || null,
        status: 'pending',
      });

      if (error) { Alert.alert('Chyba', error.message); return; }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCart([]);
      setOrderNotes('');
      setShowCart(false);
      Alert.alert(
        '✅ Objednávka odoslaná!',
        `Vaša objednávka (${fmtPrice(cartTotal)}) bude pripravená na vyzdvihnutie v ambulancii.`,
        [{ text: 'OK' }]
      );
    } catch (e: any) {
      Alert.alert('Chyba', e?.message ?? 'Objednávka zlyhala');
    } finally {
      setOrdering(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.esp }}>
      <HeroHeader
        title="Dentálny shop"
        subtitle="Produkty odporúčané doktorom"
        icon="storefront-outline"
        onBack={() => router.back()}
        rightAction={
          <TouchableOpacity style={s.cartBtn} onPress={() => setShowCart(true)} activeOpacity={0.85}>
            <Ionicons name="cart-outline" size={20} color="#F5F6F8" />
            {cartCount > 0 && (
              <View style={s.cartBadge}>
                <Text style={s.cartBadgeText}>{cartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        }
        bottomElement={
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catRow}>
            {CATEGORIES.map(c => (
              <TouchableOpacity
                key={c.key}
                style={[s.catPill, activeCategory === c.key && s.catPillActive]}
                onPress={() => { setActiveCategory(c.key); Haptics.selectionAsync(); }}
                activeOpacity={0.8}
              >
                <Text style={s.catEmoji}>{c.emoji}</Text>
                <Text style={[s.catLabel, activeCategory === c.key ? { color: '#F5F6F8' } : { color: 'rgba(196,168,130,0.7)' }]}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        }
      />

      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg2 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 120 }}
      >
        {/* ── Product grid ── */}
        <View style={s.grid}>
          {filtered.map((p, idx) => {
            const inCart = cart.find(i => i.id === p.id);
            return (
              <AnimatedListItem key={p.id} index={idx}>
                <View style={[s.productCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, SHADOWS.sm]}>
                  {p.badge && (
                    <View style={[s.badge, { backgroundColor: dark ? COLORS.esp : COLORS.bg3 }]}>
                      <Text style={[s.badgeText, { color: colors.textSecondary }]}>{p.badge}</Text>
                    </View>
                  )}
                  <Text style={s.productEmoji}>{p.emoji}</Text>
                  <Text style={[s.productName, { color: colors.textPrimary }]}>{p.name}</Text>
                  <Text style={[s.productDesc, { color: colors.textSecondary }]}>{p.desc}</Text>
                  <Text style={[s.price, { color: colors.textPrimary }]}>{fmtPrice(p.price)}</Text>

                  {inCart ? (
                    <View style={s.qtyRow}>
                      <TouchableOpacity style={[s.qtyBtn, { backgroundColor: colors.bg2 }]} onPress={() => updateQty(p.id, -1)} activeOpacity={0.8}>
                        <Ionicons name="remove" size={16} color={colors.textPrimary} />
                      </TouchableOpacity>
                      <Text style={[s.qtyText, { color: colors.textPrimary }]}>{inCart.qty}</Text>
                      <TouchableOpacity style={[s.qtyBtn, { backgroundColor: colors.bg2 }]} onPress={() => updateQty(p.id, 1)} activeOpacity={0.8}>
                        <Ionicons name="add" size={16} color={colors.textPrimary} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={s.addBtn} onPress={() => addToCart(p)} activeOpacity={0.85}>
                      <LinearGradient colors={GRADIENTS.gold as [string,string,...string[]]} style={s.addBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                        <Ionicons name="cart-outline" size={14} color="#F5F6F8" />
                        <Text style={s.addBtnText}>Do košíka</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  )}
                </View>
              </AnimatedListItem>
            );
          })}
        </View>

        {/* Info banner */}
        <Animated.View entering={FadeInUp.delay(300).duration(400)}>
          <View style={[s.infoBanner, { backgroundColor: dark ? '#0D2233' : '#EBF5FB', borderColor: dark ? '#1A527655' : '#AED6F1' }]}>
            <Text style={{ fontSize: 24 }}>🏥</Text>
            <Text style={[s.infoTitle, { color: dark ? '#5DADE2' : '#1A5276' }]}>Vyzdvihnutie v ambulancii</Text>
            <Text style={[s.infoDesc, { color: dark ? '#7FB3D3' : '#2471A3' }]}>
              Produkty si objednajte a vyzdvihnite pri najbližšej návšteve. Platba priamo v ambulancii.
            </Text>
          </View>
        </Animated.View>
      </ScrollView>

      {/* ── Floating cart bar ── */}
      {cartCount > 0 && !showCart && (
        <Animated.View entering={FadeInDown.duration(300)} style={s.floatingBar}>
          <TouchableOpacity
            style={s.floatingBtn}
            onPress={() => setShowCart(true)}
            activeOpacity={0.9}
          >
            <LinearGradient colors={GRADIENTS.hero as [string,string,...string[]]} style={s.floatingGrad}>
              <View style={s.floatingLeft}>
                <View style={s.floatingBadge}>
                  <Text style={s.floatingBadgeText}>{cartCount}</Text>
                </View>
                <Text style={s.floatingLabel}>Zobraziť košík</Text>
              </View>
              <Text style={s.floatingPrice}>{fmtPrice(cartTotal)}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Cart modal ── */}
      <Modal visible={showCart} transparent animationType="slide" onRequestClose={() => setShowCart(false)}>
        <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setShowCart(false)} />
        <View style={[s.cartSheet, { backgroundColor: colors.cardBg }]}>
          <View style={[s.cartHandle, { backgroundColor: colors.bg3 }]} />
          <Text style={[s.cartTitle, { color: colors.textPrimary }]}>Košík</Text>

          {cart.length === 0 ? (
            <View style={s.cartEmpty}>
              <Text style={{ fontSize: 40 }}>🛒</Text>
              <Text style={[s.cartEmptyText, { color: colors.textSecondary }]}>Košík je prázdny</Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 300 }}>
              {cart.map(item => (
                <View key={item.id} style={[s.cartItem, { borderColor: colors.bg3 }]}>
                  <Text style={s.cartItemEmoji}>{item.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.cartItemName, { color: colors.textPrimary }]}>{item.name}</Text>
                    <Text style={[s.cartItemPrice, { color: colors.textSecondary }]}>{fmtPrice(item.price)} × {item.qty}</Text>
                  </View>
                  <View style={s.cartQtyRow}>
                    <TouchableOpacity onPress={() => updateQty(item.id, -1)} style={[s.cartQtyBtn, { backgroundColor: colors.bg2 }]}>
                      <Ionicons name="remove" size={14} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={[s.cartQtyText, { color: colors.textPrimary }]}>{item.qty}</Text>
                    <TouchableOpacity onPress={() => updateQty(item.id, 1)} style={[s.cartQtyBtn, { backgroundColor: colors.bg2 }]}>
                      <Ionicons name="add" size={14} color={colors.textPrimary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={[s.cartItemTotal, { color: colors.textPrimary }]}>{fmtPrice(item.price * item.qty)}</Text>
                </View>
              ))}
            </ScrollView>
          )}

          {cart.length > 0 && (
            <>
              <TextInput
                style={[s.notesInput, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
                placeholder="Poznámka k objednávke (nepovinné)"
                placeholderTextColor={colors.textSecondary}
                value={orderNotes}
                onChangeText={setOrderNotes}
              />
              <View style={[s.cartTotalRow, { borderColor: colors.bg3 }]}>
                <Text style={[s.cartTotalLabel, { color: colors.textSecondary }]}>Celkom</Text>
                <Text style={[s.cartTotalPrice, { color: colors.textPrimary }]}>{fmtPrice(cartTotal)}</Text>
              </View>
              <TouchableOpacity
                style={[s.orderBtn, ordering && { opacity: 0.5 }]}
                onPress={handleOrder}
                disabled={ordering}
                activeOpacity={0.85}
              >
                <LinearGradient colors={GRADIENTS.gold as [string,string,...string[]]} style={s.orderBtnGrad}>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#F5F6F8" />
                  <Text style={s.orderBtnText}>
                    {ordering ? 'Odosielam...' : 'Objednať na vyzdvihnutie'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  catRow:     { flexDirection: 'row', gap: 8, paddingBottom: 4, paddingTop: 2 },
  catPill:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADII.full, backgroundColor: 'rgba(255,255,255,0.08)' },
  catPillActive: { backgroundColor: COLORS.gold },
  catEmoji:   { fontSize: 14 },
  catLabel:   { fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },

  cartBtn:    { position: 'relative', width: 38, height: 38, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  cartBadge:  { position: 'absolute', top: -4, right: -4, backgroundColor: '#C0392B', borderRadius: 2, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  cartBadgeText: { fontSize: 10, fontWeight: '800', color: '#F5F6F8' },

  grid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  productCard: { width: '48%', borderRadius: RADII.lg, padding: 14, borderWidth: 1, gap: 4 },
  badge:     { borderRadius: RADII.xs, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 4 },
  badgeText: { fontSize: 9, fontWeight: '600', letterSpacing: 0.3 },
  productEmoji: { fontSize: 32, marginBottom: 4 },
  productName:  { fontSize: 13, fontWeight: '700', lineHeight: 17 },
  productDesc:  { fontSize: 10, lineHeight: 14 },
  price:        { fontSize: 16, fontWeight: '800', marginTop: 4 },

  addBtn:    { marginTop: 8, borderRadius: RADII.sm, overflow: 'hidden' },
  addBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  addBtnText: { fontSize: 11, fontWeight: '700', color: '#F5F6F8' },

  qtyRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 8 },
  qtyBtn:    { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  qtyText:   { fontSize: 16, fontWeight: '800' },

  infoBanner: { borderRadius: RADII.lg, padding: 16, alignItems: 'center', gap: 8, borderWidth: 1, marginTop: 16 },
  infoTitle:  { fontSize: 14, fontWeight: '700' },
  infoDesc:   { fontSize: 12, textAlign: 'center', lineHeight: 18 },

  // Floating cart bar
  floatingBar: { position: 'absolute', bottom: 20, left: SPACING.xl, right: SPACING.xl },
  floatingBtn: { borderRadius: RADII.lg, overflow: 'hidden' },
  floatingGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14 },
  floatingLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  floatingBadge: { backgroundColor: COLORS.gold, width: 24, height: 24, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
  floatingBadgeText: { fontSize: 12, fontWeight: '800', color: '#F5F6F8' },
  floatingLabel: { fontSize: 14, fontWeight: '700', color: '#F5F6F8' },
  floatingPrice: { fontSize: 16, fontWeight: '800', color: COLORS.gold },

  // Cart modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  cartSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.xl, paddingBottom: 40 },
  cartHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  cartTitle:  { fontSize: 20, fontWeight: '800', marginBottom: 16 },
  cartEmpty:  { alignItems: 'center', paddingVertical: 40, gap: 8 },
  cartEmptyText: { fontSize: 14 },

  cartItem:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1 },
  cartItemEmoji: { fontSize: 24 },
  cartItemName:  { fontSize: 13, fontWeight: '600' },
  cartItemPrice: { fontSize: 11, marginTop: 2 },
  cartQtyRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cartQtyBtn:  { width: 26, height: 26, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
  cartQtyText: { fontSize: 14, fontWeight: '700' },
  cartItemTotal: { fontSize: 14, fontWeight: '800', minWidth: 60, textAlign: 'right' },

  notesInput: { borderWidth: 1, borderRadius: RADII.md, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, marginTop: 12 },
  cartTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderTopWidth: 1, marginTop: 8 },
  cartTotalLabel: { fontSize: 14, fontWeight: '600' },
  cartTotalPrice: { fontSize: 20, fontWeight: '800' },
  orderBtn: { marginTop: 8, borderRadius: RADII.lg, overflow: 'hidden' },
  orderBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  orderBtnText: { fontSize: 15, fontWeight: '700', color: '#F5F6F8' },
});
