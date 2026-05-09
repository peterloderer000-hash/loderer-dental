import React, { useState, useEffect, useCallback } from 'react';
import {
  ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../supabase';
import { COLORS, SIZES } from '../../styles/theme';
import { useAppTheme } from '../../context/ThemeContext';
import { SkeletonList } from '../../components/Skeleton';

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
  planned:   { label: 'Plánované',   color: '#1A5276', bg: '#EBF5FB', icon: 'time-outline'             as const },
  scheduled: { label: 'Naplánované', color: '#7D6608', bg: '#FEF9E7', icon: 'calendar-outline'         as const },
  completed: { label: 'Hotové',      color: '#1E8449', bg: '#EAFAF1', icon: 'checkmark-circle-outline' as const },
  skipped:   { label: 'Preskočené',  color: '#7F8C8D', bg: '#F4F6F7', icon: 'remove-circle-outline'    as const },
};

const PLAN_CFG = {
  active:    { label: 'Prebieha',  color: COLORS.wal, bg: '#F4ECE4' },
  completed: { label: 'Hotový',    color: '#1E8449',  bg: '#EAFAF1' },
  cancelled: { label: 'Zrušený',   color: '#922B21',  bg: '#FDEDEC' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });
}
function fmtEur(n: number | null) {
  if (n === null || n === 0) return null;
  return `${n.toFixed(2).replace('.', ',')} €`;
}

// ─── Komponent: jeden plán ────────────────────────────────────────────────────
type PlanCardProps = { plan: Plan; colors: ReturnType<typeof useAppTheme>['colors']; dark: boolean };
function PlanCard({ plan, colors, dark }: PlanCardProps) {
  const [expanded, setExpanded] = useState(plan.status === 'active');
  const pCfg      = PLAN_CFG[plan.status];
  const total     = plan.items.reduce((s, i) => s + (i.estimated_cost ?? 0), 0);
  const completed = plan.items.filter(i => i.status === 'completed').reduce((s, i) => s + (i.estimated_cost ?? 0), 0);
  const doneCount = plan.items.filter(i => i.status === 'completed').length;
  const progress  = plan.items.length > 0 ? doneCount / plan.items.length : 0;
  const pct       = Math.round(progress * 100);

  return (
    <View style={[styles.planCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
      {/* Hlavička */}
      <TouchableOpacity style={styles.planHeader} onPress={() => setExpanded(e => !e)} activeOpacity={0.8}>
        <View style={{ flex: 1 }}>
          <View style={styles.planTitleRow}>
            <Text style={[styles.planTitle, { color: colors.textPrimary }]}>{plan.title}</Text>
            <View style={[styles.planBadge, { backgroundColor: pCfg.bg }]}>
              <Text style={[styles.planBadgeText, { color: pCfg.color }]}>{pCfg.label}</Text>
            </View>
          </View>
          {plan.doctor_name && (
            <Text style={[styles.planDoctor, { color: colors.textSecondary }]}>👨‍⚕️ {plan.doctor_name} · {fmtDate(plan.created_at)}</Text>
          )}

          {/* Progress */}
          {plan.items.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: pCfg.color }]} />
              </View>
              <View style={styles.progressRow}>
                <Text style={[styles.progressPct, { color: pCfg.color }]}>{pct}%</Text>
                <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>
                  {doneCount} z {plan.items.length} výkonov hotových
                </Text>
              </View>
            </View>
          )}
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18} color={COLORS.wal} style={{ marginLeft: 10 }} />
      </TouchableOpacity>

      {expanded && (
        <>
          {/* Poznámky doktora */}
          {plan.notes ? (
            <View style={[styles.notesBox, { backgroundColor: dark ? colors.bg2 : '#FDFBF8', borderTopColor: colors.bg3 }]}>
              <Ionicons name="information-circle-outline" size={15} color={COLORS.wal} />
              <Text style={[styles.notesText, { color: colors.textSecondary }]}>{plan.notes}</Text>
            </View>
          ) : null}

          {/* Zoznam výkonov */}
          {plan.items.length === 0 ? (
            <Text style={[styles.noItems, { color: colors.textSecondary }]}>Žiadne výkony v pláne.</Text>
          ) : (
            <View style={[styles.itemsList, { borderTopColor: colors.bg3 }]}>
              {plan.items.map((item, idx) => {
                const iCfg = ITEM_CFG[item.status];
                const price = fmtEur(item.estimated_cost);
                return (
                  <View key={item.id} style={[
                    styles.itemRow,
                    idx < plan.items.length - 1 && styles.itemRowBorder,
                    idx < plan.items.length - 1 && { borderBottomColor: colors.bg3 },
                  ]}>
                    {/* Status ikona */}
                    <View style={[styles.itemIcon, { backgroundColor: iCfg.bg }]}>
                      <Ionicons name={iCfg.icon} size={16} color={iCfg.color} />
                    </View>

                    {/* Obsah */}
                    <View style={{ flex: 1 }}>
                      <Text style={[
                        styles.itemTitle,
                        { color: colors.textPrimary },
                        item.status === 'completed' && styles.itemTitleDone,
                        item.status === 'skipped'   && styles.itemTitleSkipped,
                      ]}>
                        {item.title}
                      </Text>
                      <View style={styles.itemMeta}>
                        <View style={[styles.itemStatusPill, { backgroundColor: iCfg.bg }]}>
                          <Text style={[styles.itemStatusText, { color: iCfg.color }]}>{iCfg.label}</Text>
                        </View>
                        {item.tooth_number != null && (
                          <Text style={[styles.itemTooth, { color: colors.textSecondary }]}>🦷 Zub {item.tooth_number}</Text>
                        )}
                      </View>
                      {item.description ? (
                        <Text style={[styles.itemDesc, { color: colors.textSecondary }]}>{item.description}</Text>
                      ) : null}
                    </View>

                    {/* Cena */}
                    {price && (
                      <Text style={[styles.itemPrice, { color: iCfg.color }]}>{price}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* Finančný súhrn */}
          {total > 0 && (
            <View style={[styles.summary, { backgroundColor: colors.bg2, borderTopColor: colors.bg3 }]}>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Celková cena</Text>
                <Text style={[styles.summaryVal, { color: COLORS.wal }]}>{fmtEur(total)}</Text>
              </View>
              <View style={[styles.summaryDivider, { backgroundColor: colors.bg3 }]} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Hotové výkony</Text>
                <Text style={[styles.summaryVal, { color: '#1E8449' }]}>{fmtEur(completed) ?? '0,00 €'}</Text>
              </View>
              <View style={[styles.summaryDivider, { backgroundColor: colors.bg3 }]} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Zostatok</Text>
                <Text style={[styles.summaryVal, { color: '#922B21' }]}>{fmtEur(total - completed) ?? '0,00 €'}</Text>
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}

// ─── Hlavná obrazovka ─────────────────────────────────────────────────────────
export default function PatientTreatmentPlanScreen() {
  const router     = useRouter();
  const { colors, dark } = useAppTheme();
  const [plans,   setPlans]   = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: plansData } = await supabase
      .from('treatment_plans')
      .select('id, title, notes, status, created_at, doctor_id')
      .eq('patient_id', user.id)
      .eq('visible_to_patient', true)
      .order('created_at', { ascending: false });

    if (!plansData || plansData.length === 0) { setLoading(false); return; }

    // Mená doktorov
    const doctorIds = [...new Set(plansData.map((p: any) => p.doctor_id))];
    const { data: doctors } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', doctorIds);
    const doctorMap: Record<string, string> = {};
    (doctors ?? []).forEach((d: any) => { doctorMap[d.id] = d.full_name ?? ''; });

    // Položky plánov
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

  const activePlans    = plans.filter(p => p.status === 'active');
  const completedPlans = plans.filter(p => p.status !== 'active');

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg2 }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: dark ? colors.cardBg : COLORS.esp }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={22} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerSub}>MÔJ</Text>
          <Text style={styles.headerTitle}>Liečebný plán</Text>
        </View>
        <View style={styles.headerIcon}>
          <Text style={{ fontSize: 24 }}>📋</Text>
        </View>
      </View>

      {loading ? (
        <View style={{ padding: SIZES.padding, paddingTop: 16 }}>
          <SkeletonList count={4} />
        </View>
      ) : plans.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Žiadny liečebný plán</Text>
          <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
            Doktor vám vytvorí liečebný plán po konzultácii.
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll}
          contentContainerStyle={{ padding: SIZES.padding, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}>

          {/* Aktívne plány */}
          {activePlans.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionDot, { backgroundColor: COLORS.wal }]} />
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                  PREBIEHAJÚCE ({activePlans.length})
                </Text>
              </View>
              {activePlans.map(p => <PlanCard key={p.id} plan={p} colors={colors} dark={dark} />)}
            </>
          )}

          {/* Dokončené/zrušené */}
          {completedPlans.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionDot, { backgroundColor: '#7F8C8D' }]} />
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                  HISTÓRIA ({completedPlans.length})
                </Text>
              </View>
              {completedPlans.map(p => <PlanCard key={p.id} plan={p} colors={colors} dark={dark} />)}
            </>
          )}

          {/* Info box */}
          <View style={[styles.infoBox, { backgroundColor: dark ? colors.cardBg : '#F4ECE4', borderColor: COLORS.sand }]}>
            <Ionicons name="information-circle-outline" size={16} color={COLORS.wal} />
            <Text style={[styles.infoText, { color: COLORS.wal }]}>
              Liečebný plán vytvára váš zubný lekár. Pre zmeny alebo otázky kontaktujte ordináciu.
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1 },
  scroll: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },

  header:      { paddingHorizontal: SIZES.padding, paddingTop: 18, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  headerSub:   { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  headerIcon:  { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },

  emptyIcon:  { fontSize: 52, marginBottom: 14 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySub:   { fontSize: 13, textAlign: 'center', lineHeight: 20 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 4 },
  sectionDot:    { width: 8, height: 8, borderRadius: 4 },
  sectionTitle:  { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },

  planCard:     { backgroundColor: '#fff', borderRadius: 16, marginBottom: 14, borderWidth: 1, borderColor: COLORS.bg3, overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
  planHeader:   { padding: 16, flexDirection: 'row', alignItems: 'flex-start' },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 },
  planTitle:    { fontSize: 16, fontWeight: '700', color: COLORS.esp },
  planBadge:    { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  planBadgeText:{ fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  planDoctor:   { fontSize: 12, color: COLORS.wal },

  progressBg:   { height: 7, backgroundColor: COLORS.bg3, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 7, borderRadius: 4 },
  progressRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  progressPct:  { fontSize: 12, fontWeight: '800' },
  progressLabel:{ fontSize: 11, color: COLORS.wal },

  notesBox:   { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#FDFBF8', borderTopWidth: 1, borderTopColor: COLORS.bg3 },
  notesText:  { flex: 1, fontSize: 13, color: COLORS.wal, lineHeight: 18 },

  noItems:    { textAlign: 'center', fontSize: 13, color: '#888', fontStyle: 'italic', paddingVertical: 16 },

  itemsList:      { borderTopWidth: 1, borderTopColor: COLORS.bg3 },
  itemRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  itemRowBorder:  { borderBottomWidth: 1, borderBottomColor: COLORS.bg3 },
  itemIcon:       { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  itemTitle:      { fontSize: 14, fontWeight: '600', color: COLORS.esp, marginBottom: 4 },
  itemTitleDone:  { textDecorationLine: 'line-through', color: '#7F8C8D' },
  itemTitleSkipped:{ color: '#888' },
  itemMeta:       { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  itemStatusPill: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  itemStatusText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  itemTooth:      { fontSize: 11, color: COLORS.wal, fontWeight: '500' },
  itemDesc:       { fontSize: 12, color: COLORS.wal, lineHeight: 16, marginTop: 4 },
  itemPrice:      { fontSize: 13, fontWeight: '700', minWidth: 60, textAlign: 'right' },

  summary:        { flexDirection: 'row', borderTopWidth: 1, borderTopColor: COLORS.bg3, backgroundColor: COLORS.bg2 },
  summaryItem:    { flex: 1, alignItems: 'center', paddingVertical: 12 },
  summaryDivider: { width: 1, backgroundColor: COLORS.bg3, marginVertical: 10 },
  summaryLabel:   { fontSize: 9, color: COLORS.wal, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600', marginBottom: 3 },
  summaryVal:     { fontSize: 14, fontWeight: '800' },

  infoBox:  { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 6 },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18 },
});
