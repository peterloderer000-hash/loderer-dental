import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { useAppTheme } from '../../context/ThemeContext';
import { generateMonthlyReportPdf, generateInvoicePdf, generateTreatmentPlanPdf } from '../../utils/pdfExport';

export default function PdfExports() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState('');
  const [recentAppts, setRecentAppts] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const [apptRes, planRes] = await Promise.all([
        supabase
          .from('appointments')
          .select('id, appointment_date, status, patient:profiles!appointments_patient_id_fkey(full_name), service:services(name)')
          .eq('doctor_id', user.id)
          .eq('status', 'completed')
          .order('appointment_date', { ascending: false })
          .limit(10),
        supabase
          .from('treatment_plans')
          .select('id, title, patient:profiles!treatment_plans_patient_id_fkey(full_name), created_at')
          .eq('doctor_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);
      setRecentAppts(apptRes.data ?? []);
      setPlans(planRes.data ?? []);
    }
    load();
  }, []);

  async function handleMonthlyReport(monthsAgo: number) {
    if (!userId) return;
    setLoading(true);
    try {
      const now = new Date();
      const year = monthsAgo === 0 ? now.getFullYear() : new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1).getFullYear();
      const month = monthsAgo === 0 ? now.getMonth() : new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1).getMonth();
      await generateMonthlyReportPdf(userId, year, month);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Chyba', e?.message ?? 'Nepodarilo sa vygenerovať PDF');
    } finally {
      setLoading(false);
    }
  }

  async function handleInvoice(apptId: string) {
    setLoading(true);
    try {
      await generateInvoicePdf(apptId);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Chyba', e?.message ?? 'Nepodarilo sa vygenerovať faktúru');
    } finally {
      setLoading(false);
    }
  }

  async function handlePlan(planId: string) {
    setLoading(true);
    try {
      await generateTreatmentPlanPdf(planId);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Chyba', e?.message ?? 'Nepodarilo sa vygenerovať PDF');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.safe}>
      <HeroHeader
        title="PDF Exporty"
        subtitle="Dokumenty"
        icon="document-outline"
        onBack={() => router.back()}
      />

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.gold} />
          <Text style={[styles.loadingText, { color: colors.textPrimary }]}>Generujem PDF...</Text>
        </View>
      )}

      <ScrollView style={[styles.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Monthly reports */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Mesačné reporty</Text>
        <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>Prehľad termínov, tržieb a platieb</Text>
        <View style={styles.btnRow}>
          <TouchableOpacity style={[styles.exportBtn, { backgroundColor: dark ? '#0D2233' : '#EBF5FB', borderColor: dark ? '#5DADE244' : '#AED6F1' }]}
            onPress={() => handleMonthlyReport(0)} activeOpacity={0.7} disabled={loading}>
            <Ionicons name="document-text-outline" size={20} color={dark ? '#5DADE2' : '#2E86C1'} />
            <Text style={[styles.exportBtnText, { color: dark ? '#5DADE2' : '#1A5276' }]}>Tento mesiac</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.exportBtn, { backgroundColor: dark ? '#0D2233' : '#EBF5FB', borderColor: dark ? '#5DADE244' : '#AED6F1' }]}
            onPress={() => handleMonthlyReport(1)} activeOpacity={0.7} disabled={loading}>
            <Ionicons name="document-text-outline" size={20} color={dark ? '#5DADE2' : '#2E86C1'} />
            <Text style={[styles.exportBtnText, { color: dark ? '#5DADE2' : '#1A5276' }]}>Minulý mesiac</Text>
          </TouchableOpacity>
        </View>

        {/* Invoices */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 24 }]}>Faktúry</Text>
        <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>Vygeneruj faktúru za dokončené ošetrenie</Text>
        {recentAppts.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Žiadne dokončené termíny</Text>
        ) : (
          recentAppts.map(a => (
            <TouchableOpacity key={a.id}
              style={[styles.itemRow, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}
              onPress={() => handleInvoice(a.id)} activeOpacity={0.7} disabled={loading}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, { color: colors.textPrimary }]}>{(a.patient as any)?.full_name ?? 'Pacient'}</Text>
                <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                  {new Date(a.appointment_date).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' })} · {(a.service as any)?.name ?? 'Ošetrenie'}
                </Text>
              </View>
              <Ionicons name="download-outline" size={18} color={COLORS.wal} />
            </TouchableOpacity>
          ))
        )}

        {/* Treatment plans */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 24 }]}>Liečebné plány</Text>
        <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>Export plánu pre pacienta</Text>
        {plans.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Žiadne liečebné plány</Text>
        ) : (
          plans.map(p => (
            <TouchableOpacity key={p.id}
              style={[styles.itemRow, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}
              onPress={() => handlePlan(p.id)} activeOpacity={0.7} disabled={loading}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, { color: colors.textPrimary }]}>{p.title}</Text>
                <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                  {(p.patient as any)?.full_name ?? '—'} · {new Date(p.created_at).toLocaleDateString('sk-SK')}
                </Text>
              </View>
              <Ionicons name="download-outline" size={18} color={COLORS.wal} />
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: 80 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: COLORS.esp },
  scroll:  { flex: 1 },
  content: { padding: SPACING.xl, paddingTop: 16 },
  header:  { backgroundColor: COLORS.esp, paddingHorizontal: SPACING.xl, paddingTop: 14, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerLabel: { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '500', textTransform: 'uppercase', marginBottom: 3 },
  headerTitle: { fontSize: 19, fontWeight: '600', color: '#fff' },

  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  sectionSub:   { fontSize: 12, marginBottom: 12, fontStyle: 'italic' },

  btnRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  exportBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5 },
  exportBtnText: { fontSize: 13, fontWeight: '700' },

  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1.5, marginBottom: 8 },
  itemName: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  itemMeta: { fontSize: 11 },

  emptyText: { fontSize: 12, fontStyle: 'italic', marginBottom: 12 },

  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, fontWeight: '600' } });
