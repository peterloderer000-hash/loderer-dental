/**
 * Automatické faktúry — generovanie faktúr po ošetrení
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

type InvoiceItem = {
  id: string;
  patient_name: string;
  amount: number;
  description: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  date: string;
  invoice_number: string;
};

export default function AutoInvoices() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const loadInvoices = useCallback(async () => {
    try {
      const { data } = await supabase.from('invoices')
        .select('*, patient:profiles!patient_id(full_name)')
        .order('created_at', { ascending: false })
        .limit(50);

      setInvoices((data ?? []).map((d, i) => ({
        id: d.id,
        patient_name: d.patient?.full_name ?? 'Pacient',
        amount: d.amount ?? 0,
        description: d.description ?? 'Ošetrenie',
        status: d.status ?? 'draft',
        date: d.created_at,
        invoice_number: d.invoice_number ?? `FAK-${String(i + 1).padStart(4, '0')}`,
      })));
    } catch (e) {
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadInvoices(); }, [loadInvoices]));

  async function generateForCompleted() {
    setGenerating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Find completed appointments without invoices (last 7 days)
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
      const { data: appts } = await supabase.from('appointments')
        .select('id, patient_id, date, services, price')
        .eq('status', 'completed')
        .gte('date', weekAgo)
        .is('invoice_id', null);

      if (!appts || appts.length === 0) {
        Alert.alert('', 'Žiadne neofakturované ošetrenia za posledných 7 dní.');
        setGenerating(false);
        return;
      }

      let created = 0;
      for (const appt of appts) {
        if (!appt.price || appt.price === 0) continue;

        const invoiceNum = `FAK-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
        const { data: inv } = await supabase.from('invoices').insert({
          patient_id: appt.patient_id,
          appointment_id: appt.id,
          amount: appt.price,
          description: Array.isArray(appt.services) ? appt.services.join(', ') : 'Ošetrenie',
          status: 'draft',
          invoice_number: invoiceNum,
          due_date: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
        }).select('id').single();

        if (inv) {
          await supabase.from('appointments')
            .update({ invoice_id: inv.id }).eq('id', appt.id);
          created++;
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Hotovo', `Vygenerovaných ${created} faktúr.`);
      loadInvoices();
    } catch (e) {
      Alert.alert('Chyba', 'Nepodarilo sa vygenerovať faktúry.');
    } finally {
      setGenerating(false);
    }
  }

  const STATUS_CFG = {
    draft: { label: 'Koncept', color: '#95A5A6' },
    sent: { label: 'Odoslaná', color: COLORS.info },
    paid: { label: 'Zaplatená', color: COLORS.success },
    overdue: { label: 'Po splatnosti', color: COLORS.error },
  };

  const totalRevenue = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
  const totalPending = invoices.filter(i => i.status === 'sent' || i.status === 'draft').reduce((s, i) => s + i.amount, 0);

  return (
    <View style={[st.safe, { backgroundColor: colors.esp }]}>
      <HeroHeader title="Faktúry" subtitle="Automatická fakturácia" icon="receipt-outline" onBack={() => router.back()} />

      <ScrollView style={[st.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={st.content}
        showsVerticalScrollIndicator={false}>

        {loading ? <SkeletonList count={4} /> : (
          <>
            {/* Summary */}
            <Animated.View entering={FadeInDown.delay(100)} style={st.statsRow}>
              <View style={[st.statCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <Text style={[st.statNum, { color: COLORS.success }]}>{totalRevenue.toFixed(0)}€</Text>
                <Text style={[st.statLabel, { color: colors.textSecondary }]}>Uhradené</Text>
              </View>
              <View style={[st.statCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <Text style={[st.statNum, { color: COLORS.warning }]}>{totalPending.toFixed(0)}€</Text>
                <Text style={[st.statLabel, { color: colors.textSecondary }]}>Neuhradené</Text>
              </View>
              <View style={[st.statCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <Text style={[st.statNum, { color: colors.textPrimary }]}>{invoices.length}</Text>
                <Text style={[st.statLabel, { color: colors.textSecondary }]}>Faktúr</Text>
              </View>
            </Animated.View>

            {/* Generate button */}
            <TouchableOpacity style={[st.genBtn, generating && { opacity: 0.6 }]}
              onPress={generateForCompleted} disabled={generating} activeOpacity={0.85}>
              <Ionicons name="flash" size={20} color="#fff" />
              <Text style={st.genBtnText}>
                {generating ? 'Generujem...' : 'Auto-generovať faktúry za posledný týždeň'}
              </Text>
            </TouchableOpacity>

            {/* Invoice list */}
            {invoices.length === 0 ? (
              <View style={[st.empty, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <Text style={{ fontSize: 48 }}>🧾</Text>
                <Text style={[st.emptyTitle, { color: colors.textPrimary }]}>Žiadne faktúry</Text>
                <Text style={[st.emptySub, { color: colors.textSecondary }]}>
                  Faktúry sa automaticky vygenerujú po dokončení ošetrení.
                </Text>
              </View>
            ) : (
              invoices.map((inv, i) => {
                const cfg = STATUS_CFG[inv.status];
                return (
                  <Animated.View key={inv.id} entering={FadeInDown.delay(200 + i * 50)}
                    style={[st.invCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                    <View style={st.invHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[st.invNum, { color: colors.textSecondary }]}>{inv.invoice_number}</Text>
                        <Text style={[st.invName, { color: colors.textPrimary }]}>{inv.patient_name}</Text>
                        <Text style={[st.invDesc, { color: colors.textSecondary }]}>{inv.description}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[st.invAmount, { color: colors.textPrimary }]}>{inv.amount.toFixed(2)}€</Text>
                        <View style={[st.badge, { backgroundColor: cfg.color + '15' }]}>
                          <Text style={[st.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                      </View>
                    </View>
                    <Text style={[st.invDate, { color: colors.textSecondary }]}>
                      {new Date(inv.date).toLocaleDateString('sk-SK')}
                    </Text>
                  </Animated.View>
                );
              })
            )}
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

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: SPACING.lg },
  statCard: { flex: 1, borderRadius: RADII.md, borderWidth: 1, padding: 14, alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', marginTop: 2 },

  genBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, backgroundColor: COLORS.gold, borderRadius: RADII.pill, ...SHADOWS.gold, marginBottom: SPACING.lg },
  genBtnText: { color: '#F5F6F8', fontWeight: '700', fontSize: 14 },

  empty: { borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.xxl, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  emptySub: { fontSize: 13, textAlign: 'center', marginTop: 6 },

  invCard: { borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.lg, marginBottom: 8 },
  invHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  invNum: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  invName: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  invDesc: { fontSize: 11, marginTop: 2 },
  invAmount: { fontSize: 18, fontWeight: '800' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADII.pill, marginTop: 4 },
  badgeText: { fontSize: 9, fontWeight: '700' },
  invDate: { fontSize: 10, marginTop: 8, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: 'rgba(0,0,0,0.05)' },
});
