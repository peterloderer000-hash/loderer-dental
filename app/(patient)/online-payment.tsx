/**
 * Online platby — prehľad a platba za ošetrenie
 * Pripravené na Stripe integráciu
 */
import React, { useState, useCallback } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View,
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

type Invoice = {
  id: string;
  amount: number;
  description: string;
  status: 'pending' | 'paid' | 'overdue';
  due_date: string;
  created_at: string;
};

export default function OnlinePayment() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);

  const loadInvoices = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase.from('invoices')
        .select('*').eq('patient_id', user.id)
        .order('created_at', { ascending: false });

      setInvoices((data ?? []).map(d => ({
        id: d.id,
        amount: d.amount,
        description: d.description ?? 'Ošetrenie',
        status: d.status,
        due_date: d.due_date,
        created_at: d.created_at,
      })));
    } catch (e) {
      // Table may not exist yet
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadInvoices(); }, [loadInvoices]));

  async function handlePay(invoice: Invoice) {
    setPaying(invoice.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Stripe integration placeholder
    setTimeout(() => {
      setPaying(null);
      Alert.alert(
        'Platba',
        'Online platobná brána bude dostupná v ďalšej verzii. Zatiaľ prosím plaťte v ambulancii.',
        [{ text: 'OK' }]
      );
    }, 1000);
  }

  const pending = invoices.filter(i => i.status === 'pending' || i.status === 'overdue');
  const paid = invoices.filter(i => i.status === 'paid');
  const totalPending = pending.reduce((s, i) => s + i.amount, 0);

  const statusCfg = {
    pending: { label: 'Čaká na platbu', color: COLORS.warning, bg: COLORS.warningBg },
    paid: { label: 'Zaplatené', color: COLORS.success, bg: COLORS.successBg },
    overdue: { label: 'Po splatnosti', color: COLORS.error, bg: COLORS.errorBg },
  };

  return (
    <View style={[st.safe, { backgroundColor: colors.esp }]}>
      <HeroHeader title="Platby" subtitle="Online platby" icon="card-outline" onBack={() => router.back()} />

      <ScrollView style={[st.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={st.content}
        showsVerticalScrollIndicator={false}>

        {loading ? <SkeletonList count={3} /> : (
          <>
            {/* Summary */}
            <Animated.View entering={FadeInDown.delay(100)} style={st.summaryRow}>
              <View style={[st.sumCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <Text style={[st.sumLabel, { color: colors.textSecondary }]}>Neuhradené</Text>
                <Text style={[st.sumNum, { color: pending.length > 0 ? COLORS.warning : COLORS.success }]}>
                  {totalPending.toFixed(0)}€
                </Text>
              </View>
              <View style={[st.sumCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <Text style={[st.sumLabel, { color: colors.textSecondary }]}>Faktúr</Text>
                <Text style={[st.sumNum, { color: COLORS.info }]}>{invoices.length}</Text>
              </View>
            </Animated.View>

            {/* Pending */}
            {pending.length > 0 && (
              <>
                <Text style={[st.sectionTitle, { color: colors.textPrimary }]}>Na úhradu</Text>
                {pending.map((inv, i) => {
                  const cfg = statusCfg[inv.status];
                  return (
                    <Animated.View key={inv.id} entering={FadeInDown.delay(150 + i * 60)}
                      style={[st.invCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                      <View style={st.invHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={[st.invDesc, { color: colors.textPrimary }]}>{inv.description}</Text>
                          <Text style={[st.invDate, { color: colors.textSecondary }]}>
                            Splatnosť: {new Date(inv.due_date).toLocaleDateString('sk-SK')}
                          </Text>
                        </View>
                        <View style={[st.badge, { backgroundColor: cfg.bg }]}>
                          <Text style={[st.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                      </View>
                      <View style={st.invFooter}>
                        <Text style={[st.invAmount, { color: colors.textPrimary }]}>{inv.amount.toFixed(2)}€</Text>
                        <TouchableOpacity
                          style={[st.payBtn, paying === inv.id && { opacity: 0.6 }]}
                          onPress={() => handlePay(inv)} disabled={!!paying}>
                          <Ionicons name="card" size={16} color="#F5F6F8" />
                          <Text style={st.payBtnText}>{paying === inv.id ? '...' : 'Zaplatiť'}</Text>
                        </TouchableOpacity>
                      </View>
                    </Animated.View>
                  );
                })}
              </>
            )}

            {/* Paid */}
            {paid.length > 0 && (
              <>
                <Text style={[st.sectionTitle, { color: colors.textPrimary }]}>Zaplatené</Text>
                {paid.slice(0, 10).map((inv, i) => (
                  <View key={inv.id} style={[st.paidRow, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                    <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                    <View style={{ flex: 1 }}>
                      <Text style={[st.paidDesc, { color: colors.textPrimary }]}>{inv.description}</Text>
                      <Text style={[st.paidDate, { color: colors.textSecondary }]}>
                        {new Date(inv.created_at).toLocaleDateString('sk-SK')}
                      </Text>
                    </View>
                    <Text style={[st.paidAmount, { color: COLORS.success }]}>{inv.amount.toFixed(2)}€</Text>
                  </View>
                ))}
              </>
            )}

            {invoices.length === 0 && (
              <View style={[st.empty, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <Text style={{ fontSize: 48 }}>💳</Text>
                <Text style={[st.emptyTitle, { color: colors.textPrimary }]}>Žiadne faktúry</Text>
                <Text style={[st.emptySub, { color: colors.textSecondary }]}>
                  Tu sa zobrazia vaše faktúry za ošetrenia.
                </Text>
              </View>
            )}

            <View style={[st.info, { backgroundColor: dark ? 'rgba(26,82,118,0.15)' : COLORS.infoBg }]}>
              <Ionicons name="shield-checkmark" size={14} color={COLORS.info} />
              <Text style={[st.infoText, { color: colors.textSecondary }]}>
                Platby sú zabezpečené šifrovaním. Online platobná brána (Stripe) bude aktivovaná v budúcej verzii.
              </Text>
            </View>
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
  sumCard: { flex: 1, borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.lg, alignItems: 'center' },
  sumLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  sumNum: { fontSize: 28, fontWeight: '800', marginTop: 4 },

  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10, marginTop: 8 },

  invCard: { borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.lg, marginBottom: SPACING.md },
  invHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  invDesc: { fontSize: 14, fontWeight: '700' },
  invDate: { fontSize: 11, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADII.pill },
  badgeText: { fontSize: 10, fontWeight: '700' },
  invFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: 'rgba(0,0,0,0.05)' },
  invAmount: { fontSize: 22, fontWeight: '800' },
  payBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: COLORS.gold, borderRadius: RADII.pill },
  payBtnText: { color: '#F5F6F8', fontWeight: '700', fontSize: 13 },

  paidRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: RADII.md, borderWidth: 1, padding: 14, marginBottom: 6 },
  paidDesc: { fontSize: 13, fontWeight: '600' },
  paidDate: { fontSize: 10, marginTop: 2 },
  paidAmount: { fontSize: 14, fontWeight: '700' },

  empty: { borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.xxl, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  emptySub: { fontSize: 13, textAlign: 'center', marginTop: 6 },

  info: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: RADII.sm, alignItems: 'flex-start', marginTop: SPACING.lg },
  infoText: { flex: 1, fontSize: 11, lineHeight: 16 },
});
