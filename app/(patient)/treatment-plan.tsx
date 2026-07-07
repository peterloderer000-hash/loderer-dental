import React, { useState, useEffect, useCallback } from 'react';
import {
  Alert, RefreshControl, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabase';
import { COLORS, RADII, SHADOWS, SPACING, TYPO, GRADIENTS } from '../../styles/theme';
import { useAppTheme } from '../../context/ThemeContext';
import { SkeletonList } from '../../components/Skeleton';
import HeroHeader from '../../components/ui/HeroHeader';
import AppCard from '../../components/ui/AppCard';
import SectionHeader from '../../components/ui/SectionHeader';

// ─── Typy ─────────────────────────────────────────────────────────────────────
type PlanItem = {
  id: string;
  title: string;
  description: string | null;
  estimated_cost: number | null;
  status: 'planned' | 'scheduled' | 'completed' | 'skipped';
  tooth_number: number | null;
  sort_order: number;
};

type Plan = {
  id: string;
  title: string;
  notes: string | null;
  status: 'active' | 'completed' | 'cancelled';
  created_at: string;
  doctor_name: string | null;
  items: PlanItem[];
};

// ─── Konfig stavov ────────────────────────────────────────────────────────────
const ITEM_CFG = {
  planned:   { label: 'Plánované',   color: '#1A5276', bg: '#EBF5FB', darkBg: '#0D2233', icon: 'time-outline'             as const },
  scheduled: { label: 'Naplánované', color: '#3A4256', bg: '#FDF3E7', darkBg: '#2D2000', icon: 'calendar-outline'         as const },
  completed: { label: 'Hotové',      color: '#2E7D5E', bg: '#EDF7F3', darkBg: '#1A3D2E', icon: 'checkmark-circle-outline' as const },
  skipped:   { label: 'Preskočené',  color: '#7F8C8D', bg: '#F4F6F7', darkBg: '#1A1C1D', icon: 'remove-circle-outline'    as const },
};

const PLAN_CFG = {
  active:    { label: 'Prebieha',  color: COLORS.gold, bg: '#FDF3E7', darkBg: '#2D2000' },
  completed: { label: 'Hotový',    color: '#2E7D5E',   bg: '#EDF7F3', darkBg: '#1A3D2E' },
  cancelled: { label: 'Zrušený',   color: '#C0392B',   bg: '#FDEDEC', darkBg: '#3A0E0E' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });
}
function fmtEur(n: number | null) {
  if (n === null || n === 0) return null;
  return `${n.toFixed(2).replace('.', ',')} €`;
}

// ─── Komponent: jeden plán (premium) ─────────────────────────────────────────
type PlanCardProps = { plan: Plan; colors: ReturnType<typeof useAppTheme>['colors']; dark: boolean; onBook: () => void };
const PlanCard = React.memo(function PlanCard({ plan, colors, dark, onBook }: PlanCardProps) {
  const [expanded,  setExpanded]  = useState(plan.status === 'active');
  const [approving, setApproving] = useState(false);
  const isApproved = plan.notes?.includes('[SCHVÁLENÉ PACIENTOM]') ?? false;
  const pCfg      = PLAN_CFG[plan.status];
  const total     = plan.items.reduce((s, i) => s + (i.estimated_cost ?? 0), 0);
  const completedCost = plan.items.filter(i => i.status === 'completed').reduce((s, i) => s + (i.estimated_cost ?? 0), 0);
  const doneCount = plan.items.filter(i => i.status === 'completed').length;
  const progress  = plan.items.length > 0 ? doneCount / plan.items.length : 0;
  const pct       = Math.round(progress * 100);

  async function handleApprove() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Schváliť liečebný plán',
      `Potvrdzujete súhlas s plánom "${plan.title}"?\n\nToto nahradí fyzický podpis pre interné záznamy.`,
      [
        { text: 'Nie', style: 'cancel' },
        {
          text: '✓ Schváliť', onPress: async () => {
            setApproving(true);
            const datestamp = new Date().toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });
            const marker    = `[SCHVÁLENÉ PACIENTOM: ${datestamp}]`;
            const newNotes  = plan.notes ? `${plan.notes}\n${marker}` : marker;
            const { error } = await supabase.from('treatment_plans').update({ notes: newNotes }).eq('id', plan.id);
            setApproving(false);
            if (error) { Alert.alert('Chyba', error.message); return; }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Schválené ✓', `Plán "${plan.title}" bol digitálne schválený ${datestamp}.`);
            plan.notes = newNotes;
          },
        },
      ]
    );
  }

  return (
    <AppCard style={{ marginBottom: SPACING.lg, marginHorizontal: SPACING.xl }} shadow="md">
      {/* Hlavička */}
      <TouchableOpacity
        style={st.planHeader}
        onPress={() => { setExpanded(e => !e); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        activeOpacity={0.8}
      >
        <View style={[st.planStatusDot, { backgroundColor: pCfg.color }]} />
        <View style={{ flex: 1 }}>
          <View style={st.planTitleRow}>
            <Text style={[st.planTitle, { color: colors.textPrimary }]}>{plan.title}</Text>
            <View style={[st.planBadge, { backgroundColor: dark ? pCfg.darkBg : pCfg.bg }]}>
              <Text style={[st.planBadgeText, { color: pCfg.color }]}>{pCfg.label}</Text>
            </View>
          </View>
          {plan.doctor_name && (
            <Text style={[st.planDoctor, { color: colors.textSecondary }]}>
              Dr. {plan.doctor_name} · {fmtDate(plan.created_at)}
            </Text>
          )}
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.sand} />
      </TouchableOpacity>

      {/* Progress bar */}
      {plan.items.length > 0 && (
        <View style={st.progressWrap}>
          <View style={[st.progressBg, { backgroundColor: dark ? colors.bg2 : COLORS.bg3 }]}>
            <LinearGradient
              colors={pct >= 100 ? ['#2E7D5E', '#58D68D'] : [COLORS.goldDark, COLORS.gold]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={[st.progressFill, { width: `${pct}%` as any }]}
            />
          </View>
          <View style={st.progressRow}>
            <Text style={[st.progressPct, { color: pCfg.color }]}>{pct}%</Text>
            <Text style={[st.progressLabel, { color: colors.textSecondary }]}>
              {doneCount} z {plan.items.length} výkonov
            </Text>
          </View>
        </View>
      )}

      {expanded && (
        <>
          {/* Poznámky doktora */}
          {plan.notes ? (
            <View style={[st.notesBox, { backgroundColor: dark ? colors.bg2 : '#FDFBF8', borderTopColor: colors.bg3 }]}>
              <Ionicons name="chatbox-ellipses-outline" size={14} color={COLORS.gold} />
              <Text style={[st.notesText, { color: colors.textSecondary }]}>{plan.notes}</Text>
            </View>
          ) : null}

          {/* Timeline výkonov */}
          {plan.items.length === 0 ? (
            <Text style={[st.noItems, { color: colors.textSecondary }]}>Žiadne výkony v pláne.</Text>
          ) : (
            <View style={st.timeline}>
              {plan.items.map((item, idx) => {
                const iCfg = ITEM_CFG[item.status];
                const price = fmtEur(item.estimated_cost);
                const isLast = idx === plan.items.length - 1;
                return (
                  <View key={item.id} style={st.timelineItem}>
                    {/* Timeline linka + bodka */}
                    <View style={st.timelineLeft}>
                      <View style={[st.timelineDot, { backgroundColor: dark ? iCfg.darkBg : iCfg.bg, borderColor: iCfg.color }]}>
                        <Ionicons name={iCfg.icon} size={13} color={iCfg.color} />
                      </View>
                      {!isLast && <View style={[st.timelineLine, { backgroundColor: colors.bg3 }]} />}
                    </View>

                    {/* Obsah */}
                    <View style={st.timelineContent}>
                      <Text style={[
                        st.itemTitle,
                        { color: colors.textPrimary },
                        item.status === 'completed' && { textDecorationLine: 'line-through', color: '#7F8C8D' },
                        item.status === 'skipped' && { color: '#999' },
                      ]}>
                        {item.title}
                      </Text>
                      <View style={st.itemMeta}>
                        <View style={[st.itemStatusPill, { backgroundColor: dark ? iCfg.darkBg : iCfg.bg }]}>
                          <Text style={[st.itemStatusText, { color: iCfg.color }]}>{iCfg.label}</Text>
                        </View>
                        {item.tooth_number != null && (
                          <Text style={[st.itemTooth, { color: colors.textSecondary }]}>🦷 {item.tooth_number}</Text>
                        )}
                        {price && (
                          <Text style={[st.itemPrice, { color: iCfg.color }]}>{price}</Text>
                        )}
                      </View>
                      {item.description ? (
                        <Text style={[st.itemDesc, { color: colors.textSecondary }]}>{item.description}</Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Finančný súhrn */}
          {total > 0 && (
            <View style={[st.summary, { backgroundColor: dark ? colors.bg2 : COLORS.bg2, borderTopColor: colors.bg3 }]}>
              <View style={st.summaryItem}>
                <Text style={[st.summaryLabel, { color: colors.textSecondary }]}>Celkom</Text>
                <Text style={[st.summaryVal, { color: COLORS.esp }]}>{fmtEur(total)}</Text>
              </View>
              <View style={[st.summaryDivider, { backgroundColor: colors.bg3 }]} />
              <View style={st.summaryItem}>
                <Text style={[st.summaryLabel, { color: colors.textSecondary }]}>Hotové</Text>
                <Text style={[st.summaryVal, { color: COLORS.success }]}>{fmtEur(completedCost) ?? '0 €'}</Text>
              </View>
              <View style={[st.summaryDivider, { backgroundColor: colors.bg3 }]} />
              <View style={st.summaryItem}>
                <Text style={[st.summaryLabel, { color: colors.textSecondary }]}>Zostatok</Text>
                <Text style={[st.summaryVal, { color: COLORS.error }]}>{fmtEur(total - completedCost) ?? '0 €'}</Text>
              </View>
            </View>
          )}

          {/* Akcie */}
          <View style={st.actionsRow}>
            {/* E-podpis */}
            {plan.status === 'active' && (
              isApproved ? (
                <View style={[st.approvedBadge, { backgroundColor: dark ? '#1A3D2E' : COLORS.successBg, borderColor: dark ? '#52C89644' : '#A3D4BE' }]}>
                  <Ionicons name="checkmark-circle" size={15} color={dark ? '#58D68D' : COLORS.success} />
                  <Text style={[st.approvedText, { color: dark ? '#58D68D' : COLORS.success }]}>Schválené digitálne</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[st.approveBtn, approving && { opacity: 0.6 }]}
                  onPress={handleApprove} disabled={approving} activeOpacity={0.85}
                >
                  <LinearGradient colors={[COLORS.goldDark, COLORS.gold]} style={st.approveBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    <Ionicons name="checkmark-circle-outline" size={15} color="#1A1209" />
                    <Text style={st.approveBtnText}>Schváliť plán</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )
            )}

            {/* Rezervovať termín */}
            {plan.status === 'active' && plan.items.some(i => i.status === 'planned' || i.status === 'scheduled') && (
              <TouchableOpacity style={[st.bookBtn, { borderColor: COLORS.gold }]} onPress={onBook} activeOpacity={0.85}>
                <Ionicons name="calendar-outline" size={14} color={COLORS.gold} />
                <Text style={[st.bookBtnText, { color: COLORS.gold }]}>Rezervovať</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}
    </AppCard>
  );
});

// ─── Hlavná obrazovka ─────────────────────────────────────────────────────────
export default function PatientTreatmentPlanScreen() {
  const router     = useRouter();
  const { colors, dark } = useAppTheme();
  const [plans,   setPlans]   = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: plansData } = await supabase
      .from('treatment_plans')
      .select('id, title, notes, status, created_at, doctor_id')
      .eq('patient_id', user.id)
      .eq('visible_to_patient', true)
      .order('created_at', { ascending: false });

    if (!plansData || plansData.length === 0) { setPlans([]); setLoading(false); return; }

    const doctorIds = [...new Set(plansData.map((p: any) => p.doctor_id))];
    const { data: doctors } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', doctorIds);
    const doctorMap: Record<string, string> = {};
    (doctors ?? []).forEach((d: any) => { doctorMap[d.id] = d.full_name ?? ''; });

    const planIds = plansData.map((p: any) => p.id);
    const { data: itemsData } = await supabase
      .from('treatment_plan_items')
      .select('*')
      .in('plan_id', planIds)
      .order('sort_order');

    const withItems: Plan[] = plansData.map((p: any) => ({
      id:          p.id,
      title:       p.title,
      notes:       p.notes,
      status:      p.status,
      created_at:  p.created_at,
      doctor_name: doctorMap[p.doctor_id] ?? null,
      items:       (itemsData ?? []).filter((i: any) => i.plan_id === p.id),
    }));

    setPlans(withItems);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const activePlans    = plans.filter(p => p.status === 'active');
  const completedPlans = plans.filter(p => p.status !== 'active');

  // Štatistiky pre header
  const totalItems = plans.reduce((s, p) => s + p.items.length, 0);
  const doneItems  = plans.reduce((s, p) => s + p.items.filter(i => i.status === 'completed').length, 0);

  return (
    <View style={[st.safe, { backgroundColor: dark ? '#0A0806' : colors.bg2 }]}>
      <HeroHeader
        title="Liečebný plán"
        subtitle={totalItems > 0 ? `${doneItems} z ${totalItems} výkonov dokončených` : 'Váš prehľad liečby'}
        icon="clipboard-outline"
        onBack={() => router.back()}
      />

      {loading ? (
        <View style={{ padding: SPACING.xl, paddingTop: 16 }}>
          <SkeletonList count={4} />
        </View>
      ) : plans.length === 0 ? (
        <View style={st.center}>
          <View style={[st.emptyCircle, { backgroundColor: dark ? '#1E1610' : COLORS.bg2 }]}>
            <Ionicons name="clipboard-outline" size={44} color={COLORS.gold} />
          </View>
          <Text style={[st.emptyTitle, { color: colors.textPrimary }]}>Žiadny liečebný plán</Text>
          <Text style={[st.emptySub, { color: colors.textSecondary }]}>
            Doktor vám vytvorí liečebný plán po konzultácii.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={st.scroll}
          contentContainerStyle={{ paddingTop: SPACING.lg, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} />}
        >
          {/* Aktívne plány */}
          {activePlans.length > 0 && (
            <>
              <SectionHeader title={`Prebiehajúce (${activePlans.length})`} style={{ marginHorizontal: SPACING.xl }} />
              {activePlans.map(p => (
                <PlanCard key={p.id} plan={p} colors={colors} dark={dark} onBook={() => router.push('/(patient)/book-appointment')} />
              ))}
            </>
          )}

          {/* Dokončené/zrušené */}
          {completedPlans.length > 0 && (
            <>
              <SectionHeader title={`História (${completedPlans.length})`} style={{ marginHorizontal: SPACING.xl, marginTop: SPACING.lg }} />
              {completedPlans.map(p => (
                <PlanCard key={p.id} plan={p} colors={colors} dark={dark} onBook={() => router.push('/(patient)/book-appointment')} />
              ))}
            </>
          )}

          {/* Info box */}
          <View style={[st.infoBox, { backgroundColor: dark ? '#1E1610' : '#D0D4DC', borderColor: dark ? '#2A1F15' : COLORS.sand }]}>
            <Ionicons name="information-circle-outline" size={16} color={COLORS.gold} />
            <Text style={[st.infoText, { color: dark ? COLORS.sand : COLORS.wal }]}>
              Liečebný plán vytvára váš zubný lekár. Pre zmeny alebo otázky kontaktujte ordináciu.
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  safe:   { flex: 1 },
  scroll: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },

  // Empty state
  emptyCircle: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle:  { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySub:    { fontSize: 13, textAlign: 'center', lineHeight: 20, maxWidth: 260 },

  // PlanCard
  planHeader:    { padding: SPACING.lg, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  planStatusDot: { width: 10, height: 10, borderRadius: 2, marginTop: 6 },
  planTitleRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 },
  planTitle:     { fontSize: 16, fontWeight: '700' },
  planBadge:     { borderRadius: RADII.sm, paddingHorizontal: 8, paddingVertical: 3 },
  planBadgeText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  planDoctor:    { fontSize: 12, marginTop: 2 },

  // Progress
  progressWrap:  { paddingHorizontal: SPACING.lg, marginBottom: SPACING.md },
  progressBg:    { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill:  { height: 6, borderRadius: 3 },
  progressRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  progressPct:   { fontSize: 12, fontWeight: '800' },
  progressLabel: { fontSize: 11 },

  // Notes
  notesBox:  { flexDirection: 'row', gap: 8, paddingHorizontal: SPACING.lg, paddingVertical: 10, borderTopWidth: 1 },
  notesText: { flex: 1, fontSize: 13, lineHeight: 18 },

  // Timeline
  timeline:        { paddingHorizontal: SPACING.lg, paddingTop: 4 },
  timelineItem:    { flexDirection: 'row', marginBottom: 2 },
  timelineLeft:    { width: 32, alignItems: 'center' },
  timelineDot:     { width: 26, height: 26, borderRadius: 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  timelineLine:    { width: 1.5, flex: 1, marginVertical: 2 },
  timelineContent: { flex: 1, paddingLeft: 10, paddingBottom: 14 },

  // Items
  noItems:        { textAlign: 'center', fontSize: 13, fontStyle: 'italic', paddingVertical: 16 },
  itemTitle:      { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  itemMeta:       { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  itemStatusPill: { borderRadius: RADII.sm, paddingHorizontal: 7, paddingVertical: 2 },
  itemStatusText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  itemTooth:      { fontSize: 11, fontWeight: '500' },
  itemPrice:      { fontSize: 13, fontWeight: '700', minWidth: 60, textAlign: 'right' },
  itemDesc:       { fontSize: 12, lineHeight: 16, marginTop: 4 },

  // Summary
  summary:        { flexDirection: 'row', borderTopWidth: 1, marginTop: 4, borderRadius: 0 },
  summaryItem:    { flex: 1, alignItems: 'center', paddingVertical: 12 },
  summaryDivider: { width: 1, marginVertical: 10 },
  summaryLabel:   { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600', marginBottom: 3 },
  summaryVal:     { fontSize: 14, fontWeight: '800' },

  // Actions
  actionsRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, flexWrap: 'wrap' },
  approvedBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 4, borderWidth: 1.5 },
  approvedText:  { fontSize: 13, fontWeight: '600' },
  approveBtn:    { flex: 1, borderRadius: 4, overflow: 'hidden' },
  approveBtnGrad:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 4 },
  approveBtnText:{ fontSize: 14, fontWeight: '700', color: '#1A1209' },
  bookBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 4, borderWidth: 1.5 },
  bookBtnText:   { fontSize: 13, fontWeight: '600' },

  // Info box
  infoBox:  { flexDirection: 'row', gap: 10, padding: 16, borderRadius: 6, borderWidth: 1, marginHorizontal: 24, marginTop: 12 },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18 },
});
