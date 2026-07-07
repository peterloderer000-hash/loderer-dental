import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { SkeletonList } from '../../components/Skeleton';
import { exportTreatmentPlan } from '../../utils/exportPDF';
import { useAppTheme } from '../../context/ThemeContext';

// ─── Typy ─────────────────────────────────────────────────────────────────────
type PlanItem = {
  id: string;
  plan_id: string;
  title: string;
  description: string | null;
  estimated_cost: number | null;
  status: 'planned' | 'scheduled' | 'completed' | 'skipped';
  tooth_number: number | null;
  sort_order: number;
};

type Plan = {
  id: string;
  patient_id: string;
  doctor_id: string;
  title: string;
  notes: string | null;
  status: 'active' | 'completed' | 'cancelled';
  visible_to_patient: boolean;
  created_at: string;
  items: PlanItem[];
};

// ─── Typy ─────────────────────────────────────────────────────────────────────
type Service = { id: string; name: string; emoji: string | null; price_min: number | null };

// ─── Konfigurácia stavov ───────────────────────────────────────────────────────
const ITEM_STATUS_CFG = {
  planned:   { label: 'Plánované',   color: '#1A5276', bg: '#EBF5FB', darkBg: '#0D2233', border: '#AED6F1', icon: 'time-outline'             as const },
  scheduled: { label: 'Naplánované', color: '#B87333', bg: '#FDF3E7', darkBg: '#2D1F10', border: '#D0D4DC', icon: 'calendar-outline'         as const },
  completed: { label: 'Hotové',      color: '#2E7D5E', bg: '#EDF7F3', darkBg: '#1A3D2E', border: '#A3D4BE', icon: 'checkmark-circle-outline' as const },
  skipped:   { label: 'Preskočené',  color: '#B8ACA0', bg: '#F5F6F8', darkBg: '#252830', border: '#D0D4DC', icon: 'remove-circle-outline'    as const }
};
const ITEM_STATUS_CYCLE: PlanItem['status'][] = ['planned', 'scheduled', 'completed', 'skipped'];

const PLAN_STATUS_CFG = {
  active:    { label: 'Aktívny',  color: COLORS.wal,  bg: '#D0D4DC' },
  completed: { label: 'Hotový',   color: '#2E7D5E',   bg: '#EDF7F3' },
  cancelled: { label: 'Zrušený',  color: '#922B21',   bg: '#FDEDEC' }
};

// ─── Pomocné ──────────────────────────────────────────────────────────────────
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });
}
function fmtEur(n: number | null) {
  if (n === null) return '—';
  return `${n.toFixed(2).replace('.', ',')} €`;
}

// ─── Modál: nový/edit plán ────────────────────────────────────────────────────
const PLAN_TEMPLATES = [
  { title: 'Komplexný liečebný plán', notes: 'Celkové ošetrenie s postupnými fázami.' },
  { title: 'Protetický plán',         notes: 'Korunky, mostíky, implantáty.' },
  { title: 'Endodontické ošetrenie',  notes: 'Liečba koreňových kanálikov.' },
  { title: 'Parodontologická liečba', notes: 'Ošetrenie ďasien a parodontu.' },
  { title: 'Estetický plán',          notes: 'Bielenie, veneery, estetické úpravy.' },
  { title: 'Chirurgický plán',        notes: 'Extrakcie, implantácie, chirurgia.' },
  { title: 'Detský liečebný plán',    notes: 'Preventíva a liečba mliečneho chrupu.' },
  { title: 'Ortodontický plán',       notes: 'Rovnátka, alignery, korekcia zhryzu.' },
];

function PlanModal({ visible, initial, onClose, onSave }: {
  visible: boolean;
  initial: { title: string; notes: string } | null;
  onClose: () => void;
  onSave: (title: string, notes: string) => Promise<void>;
}) {
  const { colors, dark } = useAppTheme();
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setTitle(initial?.title ?? '');
      setNotes(initial?.notes ?? '');
    }
  }, [visible, initial]);

  async function handleSave() {
    if (!title.trim()) { Alert.alert('Chyba', 'Zadaj názov plánu.'); return; }
    setSaving(true);
    await onSave(title.trim(), notes.trim());
    setSaving(false);
  }

  function applyTemplate(t: typeof PLAN_TEMPLATES[0]) {
    setTitle(t.title);
    setNotes(t.notes);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={mStyles.overlay}>
          <TouchableOpacity style={{ flex: 0.15 }} activeOpacity={1} onPress={onClose} />
          <View style={[mStyles.sheet, { backgroundColor: colors.cardBg }]}>
            <View style={[mStyles.handle, { backgroundColor: colors.bg3 }]} />
            <Text style={[mStyles.title, { color: colors.textPrimary }]}>{initial ? 'Upraviť plán' : 'Nový plán'}</Text>

            {/* Šablóny — len pri vytváraní nového */}
            {!initial && (
              <>
                <Text style={[mStyles.label, { color: colors.textSecondary }]}>ŠABLÓNY</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, maxHeight: 36 }}
                  contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
                  {PLAN_TEMPLATES.map((t) => (
                    <TouchableOpacity key={t.title}
                      style={[mStyles.templateChip, {
                        backgroundColor: title === t.title ? COLORS.wal : colors.bg2,
                        borderColor: title === t.title ? COLORS.wal : colors.bg3,
                      }]}
                      onPress={() => applyTemplate(t)} activeOpacity={0.8}>
                      <Text style={[mStyles.templateText, {
                        color: title === t.title ? '#F5F6F8' : colors.textPrimary,
                      }]}>{t.title}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            <Text style={[mStyles.label, { color: colors.textSecondary }]}>NÁZOV PLÁNU</Text>
            <TextInput style={[mStyles.input, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]} value={title} onChangeText={setTitle}
              placeholder="Liečebný plán" placeholderTextColor={dark ? '#B8ACA0' : '#D0D4DC'} autoFocus />

            <Text style={[mStyles.label, { color: colors.textSecondary }]}>POZNÁMKY (voliteľné)</Text>
            <TextInput style={[mStyles.input, { minHeight: 80, backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]} value={notes} onChangeText={setNotes}
              placeholder="Celkový postup, odporúčania..." placeholderTextColor={dark ? '#B8ACA0' : '#D0D4DC'}
              multiline numberOfLines={3} textAlignVertical="top" />

            <View style={mStyles.btnRow}>
              <TouchableOpacity style={[mStyles.btnCancel, { borderColor: colors.bg3 }]} onPress={onClose} activeOpacity={0.8}>
                <Text style={[mStyles.btnCancelText, { color: colors.textSecondary }]}>Zrušiť</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[mStyles.btnSave, saving && { opacity: 0.5 }]}
                onPress={handleSave} disabled={saving} activeOpacity={0.85}>
                {saving
                  ? <ActivityIndicator color="#F5F6F8" size="small" />
                  : <Text style={mStyles.btnSaveText}>Uložiť</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Modál: nový/edit položka ─────────────────────────────────────────────────
function ItemModal({ visible, planId, initial, services, prefilledTooth, onClose, onSave }: {
  visible: boolean;
  planId: string;
  initial: PlanItem | null;
  services: Service[];
  prefilledTooth?: number;
  onClose: () => void;
  onSave: (item: Omit<PlanItem, 'id' | 'plan_id' | 'sort_order'> & { id?: string }) => Promise<void>;
}) {
  const { colors, dark } = useAppTheme();
  const [itemTitle, setItemTitle] = useState('');
  const [desc,      setDesc]      = useState('');
  const [cost,      setCost]      = useState('');
  const [tooth,     setTooth]     = useState('');
  const [status,    setStatus]    = useState<PlanItem['status']>('planned');
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    if (visible) {
      setItemTitle(initial?.title ?? '');
      setDesc(initial?.description ?? '');
      setCost(initial?.estimated_cost != null ? String(initial.estimated_cost) : '');
      setTooth(
        initial?.tooth_number != null ? String(initial.tooth_number)
        : prefilledTooth != null     ? String(prefilledTooth)
        : '',
      );
      setStatus(initial?.status ?? 'planned');
    }
  }, [visible, initial, prefilledTooth]);

  function applyService(svc: Service) {
    setItemTitle(svc.name);
    if (svc.price_min != null) setCost(String(svc.price_min));
  }

  async function handleSave() {
    if (!itemTitle.trim()) { Alert.alert('Chyba', 'Zadaj názov výkonu.'); return; }
    const costNum  = cost.trim()  ? parseFloat(cost.replace(',', '.'))  : null;
    const toothNum = tooth.trim() ? parseInt(tooth, 10)                : null;
    if (cost.trim() && (isNaN(costNum!) || costNum! < 0)) { Alert.alert('Chyba', 'Neplatná cena.'); return; }
    if (tooth.trim() && (isNaN(toothNum!) || toothNum! < 1 || toothNum! > 48)) {
      Alert.alert('Chyba', 'Číslo zuba musí byť 1–48.'); return;
    }
    setSaving(true);
    await onSave({
      id:             initial?.id,
      title:          itemTitle.trim(),
      description:    desc.trim() || null,
      estimated_cost: costNum,
      tooth_number:   toothNum,
      status
    });
    setSaving(false);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={mStyles.overlay}>
          <TouchableOpacity style={{ flex: 0.2 }} activeOpacity={1} onPress={onClose} />
          <View style={[mStyles.sheet, { maxHeight: '80%', backgroundColor: colors.cardBg }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={[mStyles.handle, { backgroundColor: colors.bg3 }]} />
              <Text style={[mStyles.title, { color: colors.textPrimary }]}>{initial ? 'Upraviť výkon' : 'Pridať výkon'}</Text>

              {/* ── Rýchly výber zo služieb ── */}
              {!initial && services.length > 0 && (
                <>
                  <Text style={[mStyles.label, { color: colors.textSecondary }]}>RÝCHLY VÝBER ZO SLUŽIEB</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: 4 }} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
                    {services.map(svc => (
                      <TouchableOpacity key={svc.id}
                        style={[mStyles.svcChip, {
                          backgroundColor: itemTitle === svc.name
                            ? (dark ? COLORS.wal + '33' : '#D0D4DC')
                            : colors.bg2,
                          borderColor: itemTitle === svc.name ? COLORS.wal : colors.bg3
                        }]}
                        onPress={() => applyService(svc)} activeOpacity={0.75}>
                        {svc.emoji ? <Text style={mStyles.svcChipEmoji}>{svc.emoji}</Text> : null}
                        <Text style={[mStyles.svcChipText, { color: itemTitle === svc.name ? COLORS.wal : colors.textSecondary }]}>
                          {svc.name}
                        </Text>
                        {svc.price_min != null && (
                          <Text style={[mStyles.svcChipPrice, { color: itemTitle === svc.name ? COLORS.wal : colors.textSecondary }]}>
                            {svc.price_min}€
                          </Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              <Text style={[mStyles.label, { color: colors.textSecondary }]}>NÁZOV VÝKONU *</Text>
              <TextInput style={[mStyles.input, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]} value={itemTitle} onChangeText={setItemTitle}
                placeholder="Extrakcia, plomba, korunka..." placeholderTextColor={dark ? '#B8ACA0' : '#D0D4DC'} autoFocus />

              <Text style={[mStyles.label, { color: colors.textSecondary }]}>POPIS (voliteľné)</Text>
              <TextInput style={[mStyles.input, { minHeight: 60, backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]} value={desc} onChangeText={setDesc}
                placeholder="Detaily výkonu..." placeholderTextColor={dark ? '#B8ACA0' : '#D0D4DC'}
                multiline numberOfLines={2} textAlignVertical="top" />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[mStyles.label, { color: colors.textSecondary }]}>CENA (€)</Text>
                  <TextInput style={[mStyles.input, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]} value={cost} onChangeText={setCost}
                    placeholder="0,00" placeholderTextColor={dark ? '#B8ACA0' : '#D0D4DC'} keyboardType="decimal-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[mStyles.label, { color: colors.textSecondary }]}>ZUB (1–48)</Text>
                  <TextInput style={[mStyles.input, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]} value={tooth} onChangeText={setTooth}
                    placeholder="napr. 16" placeholderTextColor={dark ? '#B8ACA0' : '#D0D4DC'} keyboardType="numeric" maxLength={2} />
                </View>
              </View>

              <Text style={[mStyles.label, { color: colors.textSecondary }]}>STAV</Text>
              <View style={mStyles.chipRow}>
                {ITEM_STATUS_CYCLE.map((s) => {
                  const cfg    = ITEM_STATUS_CFG[s];
                  const active = status === s;
                  return (
                    <TouchableOpacity key={s}
                      style={[mStyles.chip, { borderColor: cfg.border, backgroundColor: active ? cfg.color : colors.cardBg }]}
                      onPress={() => setStatus(s)} activeOpacity={0.8}>
                      <Text style={[mStyles.chipText, { color: active ? '#F5F6F8' : cfg.color }]}>
                        {cfg.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <View style={[mStyles.btnRow, { marginTop: 12 }]}>
              <TouchableOpacity style={[mStyles.btnCancel, { borderColor: colors.bg3 }]} onPress={onClose} activeOpacity={0.8}>
                <Text style={[mStyles.btnCancelText, { color: colors.textSecondary }]}>Zrušiť</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[mStyles.btnSave, saving && { opacity: 0.5 }]}
                onPress={handleSave} disabled={saving} activeOpacity={0.85}>
                {saving
                  ? <ActivityIndicator color="#F5F6F8" size="small" />
                  : <Text style={mStyles.btnSaveText}>Uložiť</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const mStyles = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:        { backgroundColor: COLORS.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 36 },
  handle:       { width: 38, height: 4, borderRadius: 2, backgroundColor: COLORS.bg3, alignSelf: 'center', marginBottom: 18 },
  title:        { fontSize: 20, fontWeight: '700', color: COLORS.esp, marginBottom: 18 },
  label:        { fontSize: 9, letterSpacing: 1.5, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6, marginTop: 10 },
  input:        { borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: 2, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.esp, backgroundColor: COLORS.bg2 },
  chipRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 4, borderWidth: 1.5 },
  chipText:     { fontSize: 12, fontWeight: '600' },
  btnRow:       { flexDirection: 'row', gap: 10 },
  btnCancel:    { flex: 1, paddingVertical: 14, borderRadius: 2, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.bg3 },
  btnCancelText:{ fontSize: 14, fontWeight: '600', color: COLORS.wal },
  btnSave:      { flex: 2, paddingVertical: 14, borderRadius: 2, alignItems: 'center', backgroundColor: COLORS.wal, justifyContent: 'center' },
  btnSaveText:  { fontSize: 14, fontWeight: '700', color: '#F5F6F8' },
  svcChip:      { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 4, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 7 },
  svcChipEmoji: { fontSize: 14 },
  svcChipText:  { fontSize: 12, fontWeight: '600' },
  svcChipPrice: { fontSize: 11, fontWeight: '500', opacity: 0.75 },
  templateChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1.5 },
  templateText: { fontSize: 12, fontWeight: '600' },
});

// ─── Hlavná obrazovka ─────────────────────────────────────────────────────────
export default function TreatmentPlanScreen() {
  const router = useRouter();
  const { patientId, patientName, prefilledTooth: prefilledToothParam } =
    useLocalSearchParams<{ patientId: string; patientName: string; prefilledTooth?: string }>();
  const { colors, dark } = useAppTheme();
  const autoOpenedRef = useRef(false);

  const [plans,        setPlans]        = useState<Plan[]>([]);
  const [services,     setServices]     = useState<Service[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [doctorId,     setDoctorId]     = useState('');

  // Modály
  const [showPlanModal,    setShowPlanModal]    = useState(false);
  const [editingPlan,      setEditingPlan]      = useState<Plan | null>(null);
  const [showItemModal,    setShowItemModal]    = useState(false);
  const [editingItem,      setEditingItem]      = useState<PlanItem | null>(null);
  const [activeItemPlanId, setActiveItemPlanId] = useState('');
  const [expandedPlan,     setExpandedPlan]     = useState<string | null>(null);

  const load = useCallback(async () => {
    const [plansRes, svcRes] = await Promise.all([
      supabase.from('treatment_plans').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }),
      supabase.from('services').select('id, name, emoji, price_min').order('name'),
    ]);

    setServices((svcRes.data ?? []) as Service[]);

    const plansData = plansRes.data;
    if (!plansData) { setLoading(false); return; }

    const planIds = plansData.map((p: any) => p.id);
    const { data: itemsData } = planIds.length > 0
      ? await supabase.from('treatment_plan_items').select('*').in('plan_id', planIds).order('sort_order')
      : { data: [] };

    const withItems: Plan[] = plansData.map((p: any) => ({
      ...p,
      visible_to_patient: p.visible_to_patient ?? false,
      items: (itemsData ?? []).filter((i: any) => i.plan_id === p.id)
    }));
    setPlans(withItems);
    if (withItems.length > 0 && !expandedPlan) setExpandedPlan(withItems[0].id);
    setLoading(false);
  }, [patientId]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setDoctorId(user.id);
    }).catch(() => {});
    load();
  }, [load]);

  // Auto-open ItemModal pri príchode z dental-chart s prefilledTooth
  useEffect(() => {
    if (!prefilledToothParam || autoOpenedRef.current || loading || plans.length === 0) return;
    autoOpenedRef.current = true;
    const firstActive = plans.find((p) => p.status === 'active') ?? plans[0];
    setExpandedPlan(firstActive.id);
    setActiveItemPlanId(firstActive.id);
    setEditingItem(null);
    setShowItemModal(true);
  }, [plans, loading, prefilledToothParam]);

  // ── Plán CRUD ─────────────────────────────────────────────────────────────
  async function handleSavePlan(title: string, notes: string) {
    if (editingPlan) {
      const { error } = await supabase.from('treatment_plans')
        .update({ title, notes: notes || null, updated_at: new Date().toISOString() })
        .eq('id', editingPlan.id);
      if (error) { Alert.alert('Chyba', error.message); return; }
    } else {
      const { data, error } = await supabase.from('treatment_plans').insert({
        patient_id: patientId, doctor_id: doctorId, title, notes: notes || null
      }).select().single();
      if (error) { Alert.alert('Chyba', error.message); return; }
      setExpandedPlan(data.id);
      // Notifikuj pacienta o novom liečebnom pláne
      await supabase.from('notifications').insert({
        user_id: patientId,
        title:   '📋 Nový liečebný plán',
        body:    `Doktor pre vás pripravil liečebný plán: "${title}". Pozrite si ho v sekcii Liečebný plán.`,
        type:    'info'
      });
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowPlanModal(false);
    setEditingPlan(null);
    load();
  }

  async function handleDeletePlan(plan: Plan) {
    Alert.alert('Zmazať plán', `Naozaj zmazať "${plan.title}"? Zmažú sa aj všetky výkony.`, [
      { text: 'Nie', style: 'cancel' },
      { text: 'Zmazať', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('treatment_plans').delete().eq('id', plan.id);
        if (error) { Alert.alert('Chyba', error.message); return; }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (expandedPlan === plan.id) setExpandedPlan(null);
        load();
      }},
    ]);
  }

  async function handleToggleVisible(plan: Plan) {
    const next = !plan.visible_to_patient;
    await supabase.from('treatment_plans')
      .update({ visible_to_patient: next, updated_at: new Date().toISOString() })
      .eq('id', plan.id);
    if (next) {
      await supabase.from('notifications').insert({
        user_id: patientId,
        title:   '📋 Liečebný plán je dostupný',
        body:    `Doktor zdieľal liečebný plán „${plan.title}". Pozrite si ho v sekcii Liečebný plán.`,
        type:    'info'
      });
    }
    load();
  }

  async function handleChangePlanStatus(plan: Plan, newStatus: Plan['status']) {
    await supabase.from('treatment_plans')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', plan.id);

    // Notifikuj pacienta pri dokončení liečebného plánu
    if (newStatus === 'completed') {
      await supabase.from('notifications').insert({
        user_id: patientId,
        title:   '🎉 Liečebný plán dokončený!',
        body:    `Váš liečebný plán "${plan.title}" bol úspešne dokončený. Ďakujeme za dôveru!`,
        type:    'success'
      });
    }

    load();
  }

  // ── Položky CRUD ──────────────────────────────────────────────────────────
  async function handleSaveItem(item: Omit<PlanItem, 'id' | 'plan_id' | 'sort_order'> & { id?: string }) {
    const plan = plans.find(p => p.id === activeItemPlanId);
    if (!plan) return;

    if (item.id) {
      const { error } = await supabase.from('treatment_plan_items').update({
        title:          item.title,
        description:    item.description,
        estimated_cost: item.estimated_cost,
        tooth_number:   item.tooth_number,
        status:         item.status
      }).eq('id', item.id);
      if (error) { Alert.alert('Chyba', error.message); return; }
    } else {
      const { error } = await supabase.from('treatment_plan_items').insert({
        plan_id:        activeItemPlanId,
        title:          item.title,
        description:    item.description,
        estimated_cost: item.estimated_cost,
        tooth_number:   item.tooth_number,
        status:         item.status,
        sort_order:     plan.items.length
      });
      if (error) { Alert.alert('Chyba', error.message); return; }
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowItemModal(false);
    setEditingItem(null);
    load();
  }

  async function handleDeleteItem(item: PlanItem) {
    Alert.alert('Zmazať výkon', `Zmazať "${item.title}"?`, [
      { text: 'Nie', style: 'cancel' },
      { text: 'Zmazať', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('treatment_plan_items').delete().eq('id', item.id);
        if (error) { Alert.alert('Chyba', error.message); return; }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        load();
      }},
    ]);
  }

  async function handleCycleItemStatus(item: PlanItem) {
    const idx  = ITEM_STATUS_CYCLE.indexOf(item.status);
    const next = ITEM_STATUS_CYCLE[(idx + 1) % ITEM_STATUS_CYCLE.length];
    await supabase.from('treatment_plan_items').update({ status: next }).eq('id', item.id);

    // Notifikuj pacienta pri dôležitej zmene stavu
    if (next === 'completed' || next === 'scheduled') {
      const cfg = ITEM_STATUS_CFG[next];
      await supabase.from('notifications').insert({
        user_id: patientId,
        title:   next === 'completed'
          ? `✅ Výkon dokončený`
          : `📅 Výkon naplánovaný`,
        body:    `${item.title}${item.tooth_number ? ` (zub č. ${item.tooth_number})` : ''} — ${cfg.label}.`,
        type:    next === 'completed' ? 'success' : 'info'
      });
    }

    load();
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.safe}>
      <HeroHeader
        title="Liečebný plán"
        subtitle={patientName ?? 'Pacient'}
        icon="clipboard-outline"
        onBack={() => router.back()}
        rightAction={
          <TouchableOpacity style={styles.addBtn}
            onPress={() => { setEditingPlan(null); setShowPlanModal(true); }} activeOpacity={0.85}>
            <Ionicons name="add" size={20} color="#F5F6F8" />
            <Text style={styles.addBtnText}>Nový plán</Text>
          </TouchableOpacity>
        }
      />

      {loading ? (
        <View style={{ padding: SPACING.xl }}><SkeletonList count={4} /></View>
      ) : plans.length === 0 ? (
        <View style={[styles.center, { backgroundColor: colors.bg2 }]}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Žiadny plán</Text>
          <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Vytvorte liečebný plán pre tohto pacienta.</Text>
          <TouchableOpacity style={styles.emptyBtn}
            onPress={() => { setEditingPlan(null); setShowPlanModal(true); }} activeOpacity={0.85}>
            <Ionicons name="add" size={16} color="#F5F6F8" />
            <Text style={styles.emptyBtnText}>Vytvoriť plán</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={[styles.scroll, { backgroundColor: colors.bg2 }]}
          contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}>
          {plans.map((plan) => {
            const expanded  = expandedPlan === plan.id;
            const pCfg      = PLAN_STATUS_CFG[plan.status];
            const total     = plan.items.reduce((s, i) => s + (i.estimated_cost ?? 0), 0);
            const completed = plan.items.filter(i => i.status === 'completed').reduce((s, i) => s + (i.estimated_cost ?? 0), 0);
            const doneCount = plan.items.filter(i => i.status === 'completed').length;
            const progress  = plan.items.length > 0 ? doneCount / plan.items.length : 0;

            return (
              <View key={plan.id} style={[styles.planCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                {/* Plan header */}
                <TouchableOpacity style={styles.planHeader}
                  onPress={() => setExpandedPlan(expanded ? null : plan.id)} activeOpacity={0.8}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.planTitleRow}>
                      <Text style={[styles.planTitle, { color: colors.textPrimary }]}>{plan.title}</Text>
                      <View style={[styles.planBadge, { backgroundColor: pCfg.bg }]}>
                        <Text style={[styles.planBadgeText, { color: pCfg.color }]}>{pCfg.label}</Text>
                      </View>
                    </View>
                    <Text style={[styles.planDate, { color: colors.textSecondary }]}>{fmtDate(plan.created_at)}</Text>

                    {/* Progress bar */}
                    {plan.items.length > 0 && (
                      <View style={{ marginTop: 8 }}>
                        <View style={styles.progressBg}>
                          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` as any }]} />
                        </View>
                        <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>
                          {doneCount}/{plan.items.length} výkonov · {fmtEur(completed)} / {fmtEur(total)}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Ionicons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={18} color={COLORS.wal} style={{ marginLeft: 10 }} />
                </TouchableOpacity>

                {expanded && (
                  <>
                    {/* Plan actions */}
                    <View style={[styles.planActions, { borderBottomColor: colors.bg3 }]}>
                      <TouchableOpacity style={[styles.planActBtn, { backgroundColor: colors.bg2, borderColor: colors.bg3 }]}
                        onPress={() => { setEditingPlan(plan); setShowPlanModal(true); }} activeOpacity={0.8}>
                        <Ionicons name="pencil-outline" size={13} color={COLORS.wal} />
                        <Text style={[styles.planActText, { color: colors.textSecondary }]}>Upraviť</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.planActBtn, { backgroundColor: colors.bg2, borderColor: colors.bg3 }, plan.visible_to_patient && styles.planActBtnActive]}
                        onPress={() => handleToggleVisible(plan)} activeOpacity={0.8}>
                        <Ionicons
                          name={plan.visible_to_patient ? 'eye' : 'eye-off-outline'}
                          size={13}
                          color={plan.visible_to_patient ? COLORS.gold : COLORS.wal}
                        />
                        <Text style={[styles.planActText, { color: colors.textSecondary }, plan.visible_to_patient && { color: COLORS.gold }]}>
                          {plan.visible_to_patient ? 'Zdieľané' : 'Zdieľať'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.planActBtn, { backgroundColor: colors.bg2, borderColor: colors.bg3 }]}
                        onPress={() => handleChangePlanStatus(
                          plan, plan.status === 'active' ? 'completed' : 'active'
                        )} activeOpacity={0.8}>
                        <Ionicons
                          name={plan.status === 'active' ? 'checkmark-circle-outline' : 'refresh-outline'}
                          size={13} color="#2E7D5E" />
                        <Text style={[styles.planActText, { color: '#2E7D5E' }]}>
                          {plan.status === 'active' ? 'Dokončiť' : 'Znovu aktivovať'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.planActBtn, { backgroundColor: colors.bg2, borderColor: colors.bg3 }]}
                        onPress={() => exportTreatmentPlan(plan, patientName as string)} activeOpacity={0.8}>
                        <Ionicons name="share-outline" size={13} color="#1A5276" />
                        <Text style={[styles.planActText, { color: '#1A5276' }]}>Export PDF</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.planActBtn, { backgroundColor: colors.bg2, borderColor: colors.bg3 }]}
                        onPress={() => handleDeletePlan(plan)} activeOpacity={0.8}>
                        <Ionicons name="trash-outline" size={13} color="#922B21" />
                        <Text style={[styles.planActText, { color: '#922B21' }]}>Zmazať</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Notes */}
                    {plan.notes ? (
                      <View style={[styles.notesBox, { borderBottomColor: colors.bg3, backgroundColor: colors.bg2 }]}>
                        <Ionicons name="document-text-outline" size={13} color={COLORS.wal} />
                        <Text style={[styles.notesText, { color: colors.textSecondary }]}>{plan.notes}</Text>
                      </View>
                    ) : null}

                    {/* Items */}
                    {plan.items.length === 0 ? (
                      <Text style={styles.noItems}>Žiadne výkony — pridaj prvý výkon.</Text>
                    ) : (
                      plan.items.map((item) => {
                        const iCfg = ITEM_STATUS_CFG[item.status];
                        return (
                          <View key={item.id}
                            style={[styles.itemCard, { borderLeftColor: iCfg.color, backgroundColor: dark ? iCfg.darkBg : iCfg.bg }]}>
                            <View style={styles.itemTop}>
                              {/* Tap to cycle status */}
                              <TouchableOpacity
                                style={[styles.itemStatusBtn, { backgroundColor: iCfg.color }]}
                                onPress={() => handleCycleItemStatus(item)} activeOpacity={0.8}>
                                <Ionicons name={iCfg.icon} size={14} color="#F5F6F8" />
                              </TouchableOpacity>
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.itemTitle, { color: colors.textPrimary }]}>{item.title}</Text>
                                {item.tooth_number != null && (
                                  <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>🦷 Zub {item.tooth_number}</Text>
                                )}
                                {item.description ? (
                                  <Text style={[styles.itemDesc, { color: colors.textSecondary }]}>{item.description}</Text>
                                ) : null}
                              </View>
                              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                                <Text style={[styles.itemCost, { color: iCfg.color }]}>
                                  {fmtEur(item.estimated_cost)}
                                </Text>
                                <View style={styles.itemActions}>
                                  <TouchableOpacity
                                    onPress={() => {
                                      setEditingItem(item);
                                      setActiveItemPlanId(plan.id);
                                      setShowItemModal(true);
                                    }}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    activeOpacity={0.7}>
                                    <Ionicons name="pencil-outline" size={14} color={COLORS.wal} />
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    onPress={() => handleDeleteItem(item)}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    activeOpacity={0.7}>
                                    <Ionicons name="trash-outline" size={14} color="#922B21" />
                                  </TouchableOpacity>
                                </View>
                              </View>
                            </View>
                            <View style={[styles.itemStatusBadge,
                              { backgroundColor: iCfg.color + '22', borderColor: iCfg.border }]}>
                              <Text style={[styles.itemStatusText, { color: iCfg.color }]}>{iCfg.label}</Text>
                            </View>
                          </View>
                        );
                      })
                    )}

                    {/* Add item button */}
                    <TouchableOpacity
                      style={[styles.addItemBtn, { backgroundColor: dark ? colors.cardBg : '#F5F6F8' }]}
                      onPress={() => {
                        setEditingItem(null);
                        setActiveItemPlanId(plan.id);
                        setShowItemModal(true);
                      }} activeOpacity={0.85}>
                      <Ionicons name="add-circle-outline" size={16} color={COLORS.wal} />
                      <Text style={styles.addItemText}>Pridať výkon</Text>
                    </TouchableOpacity>

                    {/* Financial summary */}
                    {plan.items.length > 0 && (
                      <View style={styles.summaryRow}>
                        <View style={[styles.summaryBox, { backgroundColor: colors.bg2, borderColor: colors.bg3 }]}>
                          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Celková cena</Text>
                          <Text style={[styles.summaryVal, { color: COLORS.wal }]}>{fmtEur(total)}</Text>
                        </View>
                        <View style={[styles.summaryBox, { backgroundColor: dark ? '#1A3D2E' : '#EDF7F3', borderColor: dark ? '#52C89633' : '#A3D4BE' }]}>
                          <Text style={[styles.summaryLabel, { color: dark ? '#52C896' : '#2E7D5E' }]}>Dokončené</Text>
                          <Text style={[styles.summaryVal, { color: dark ? '#52C896' : '#2E7D5E' }]}>{fmtEur(completed)}</Text>
                        </View>
                        <View style={[styles.summaryBox, { backgroundColor: dark ? '#4A1010' : '#FDEDEC', borderColor: dark ? '#C0392B33' : '#F5B7B1' }]}>
                          <Text style={[styles.summaryLabel, { color: dark ? '#C0392B' : '#922B21' }]}>Zostatok</Text>
                          <Text style={[styles.summaryVal, { color: dark ? '#C0392B' : '#922B21' }]}>
                            {fmtEur(total - completed)}
                          </Text>
                        </View>
                      </View>
                    )}
                  </>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Modály */}
      <PlanModal
        visible={showPlanModal}
        initial={editingPlan ? { title: editingPlan.title, notes: editingPlan.notes ?? '' } : null}
        onClose={() => { setShowPlanModal(false); setEditingPlan(null); }}
        onSave={handleSavePlan}
      />
      <ItemModal
        visible={showItemModal}
        planId={activeItemPlanId}
        initial={editingItem}
        services={services}
        prefilledTooth={prefilledToothParam && !editingItem ? parseInt(prefilledToothParam) : undefined}
        onClose={() => { setShowItemModal(false); setEditingItem(null); }}
        onSave={handleSaveItem}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },
  center: { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center', padding: 40 },

  header:      { backgroundColor: COLORS.esp, paddingHorizontal: SPACING.xl, paddingTop: 18, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  headerSub:   { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#F5F6F8' },
  addBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.wal, borderRadius: 4, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5, borderColor: COLORS.sand },
  addBtnText:  { fontSize: 12, fontWeight: '700', color: '#F5F6F8' },

  emptyIcon:    { fontSize: 52, marginBottom: 14 },
  emptyTitle:   { fontSize: 18, fontWeight: '700', color: COLORS.esp, marginBottom: 6 },
  emptySub:     { fontSize: 13, color: COLORS.wal, textAlign: 'center', marginBottom: 20 },
  emptyBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.wal, borderRadius: 2, paddingHorizontal: 22, paddingVertical: 13 },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: '#F5F6F8' },

  planCard:     { backgroundColor: COLORS.cream, borderRadius: 4, marginBottom: 14, borderWidth: 1, borderColor: COLORS.bg3, overflow: 'hidden', elevation: 2, shadowColor: '#121417', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
  planHeader:   { padding: 16, flexDirection: 'row', alignItems: 'flex-start' },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' },
  planTitle:    { fontSize: 16, fontWeight: '700', color: COLORS.esp },
  planBadge:    { borderRadius: 2, paddingHorizontal: 8, paddingVertical: 3 },
  planBadgeText:{ fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  planDate:     { fontSize: 11, color: COLORS.wal },
  progressBg:   { height: 6, backgroundColor: COLORS.bg3, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: COLORS.wal, borderRadius: 3 },
  progressLabel:{ fontSize: 10, color: COLORS.wal, fontWeight: '600', marginTop: 4 },

  planActions:      { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: COLORS.bg3, flexWrap: 'wrap' },
  planActBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.bg2, borderRadius: 2, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.bg3 },
  planActBtnActive: { backgroundColor: 'rgba(201,168,76,0.10)', borderColor: 'rgba(201,168,76,0.4)' },
  planActText:      { fontSize: 11, fontWeight: '600', color: COLORS.wal },

  notesBox:   { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#F5F6F8', borderBottomWidth: 1, borderBottomColor: COLORS.bg3 },
  notesText:  { flex: 1, fontSize: 12, color: COLORS.wal, lineHeight: 18 },

  noItems:    { textAlign: 'center', fontSize: 12, color: '#B8ACA0', fontStyle: 'italic', paddingVertical: 16, paddingHorizontal: 20 },

  itemCard:        { marginHorizontal: 12, marginVertical: 5, borderRadius: 2, padding: 12, borderLeftWidth: 3.5 },
  itemTop:         { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  itemStatusBtn:   { width: 28, height: 28, borderRadius: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  itemTitle:       { fontSize: 14, fontWeight: '600', color: COLORS.esp, marginBottom: 2 },
  itemMeta:        { fontSize: 11, color: COLORS.wal, marginBottom: 1 },
  itemDesc:        { fontSize: 11, color: COLORS.wal, lineHeight: 16, marginTop: 2 },
  itemCost:        { fontSize: 14, fontWeight: '700' },
  itemActions:     { flexDirection: 'row', gap: 10 },
  itemStatusBadge: { alignSelf: 'flex-start', borderRadius: 2, paddingHorizontal: 8, paddingVertical: 3, marginTop: 8, borderWidth: 1 },
  itemStatusText:  { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  addItemBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, margin: 12, marginTop: 8, paddingVertical: 10, borderRadius: 2, borderWidth: 1.5, borderStyle: 'dashed', borderColor: COLORS.wal, backgroundColor: '#F5F6F8' },
  addItemText:  { fontSize: 13, fontWeight: '600', color: COLORS.wal },

  summaryRow:   { flexDirection: 'row', margin: 12, marginTop: 4, gap: 8 },
  summaryBox:   { flex: 1, backgroundColor: COLORS.bg2, borderRadius: 2, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: COLORS.bg3 },
  summaryLabel: { fontSize: 9, color: COLORS.wal, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600', marginBottom: 4 },
  summaryVal:   { fontSize: 14, fontWeight: '800' }
});
