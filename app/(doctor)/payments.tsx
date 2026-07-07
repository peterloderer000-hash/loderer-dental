import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal,
  Platform, RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../supabase';
import { COLORS } from '../../styles/theme';
import { SkeletonList } from '../../components/Skeleton';
import { AnimatedListItem } from '../../components/ui/AnimatedListItem';
import { useAppTheme } from '../../context/ThemeContext';

type DateRange    = 'today' | 'week' | 'month';
type FilterStatus = 'all' | 'pending' | 'paid' | 'refunded';
type Method       = 'cash' | 'card' | 'online' | 'insurance';

interface Payment {
  id: string;
  amount_cents: number;
  currency: string;
  method: Method;
  status: string;
  paid_at: string | null;
  created_at: string;
  notes: string | null;
  patient: { id?: string; full_name: string | null } | null;
  appointment: { appointment_date: string | null } | null;
}

interface PatientOption { id: string; full_name: string | null; }

const METHOD_LABELS: Record<Method, string> = {
  cash: 'Hotovosť', card: 'Karta', online: 'Online', insurance: 'Poisťovňa'
};
const METHOD_ICONS: Record<Method, string> = {
  cash: 'cash-outline', card: 'card-outline',
  online: 'globe-outline', insurance: 'shield-outline'
};
const STATUS_COLOR: Record<string, string> = {
  pending: '#B87333', paid: '#1A5C35', refunded: '#7B3F00', cancelled: '#B8ACA0'
};
const STATUS_BG: Record<string, string> = {
  pending: '#FEF3CD', paid: '#EDF7F3', refunded: '#FDF3E7', cancelled: '#EAECEE'
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'Čaká', paid: 'Zaplatené', refunded: 'Vrátené', cancelled: 'Zrušené'
};
const RANGE_LABELS: Record<DateRange, string> = {
  today: 'Dnes', week: 'Týždeň', month: 'Mesiac'
};

function fmtEur(cents: number) {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' });
}

// ─── Nová platba — modal ──────────────────────────────────────────────────────
function NewPaymentModal({ visible, onClose, onCreated }: {
  visible: boolean; onClose: () => void; onCreated: () => void;
}) {
  const { colors, dark } = useAppTheme();
  const [patientSearch, setPatientSearch] = useState('');
  const [patients, setPatients]           = useState<PatientOption[]>([]);
  const [selectedPatient, setSelected]    = useState<PatientOption | null>(null);
  const [amountStr, setAmountStr]         = useState('');
  const [method, setMethod]               = useState<Method>('cash');
  const [notes, setNotes]                 = useState('');
  const [saving, setSaving]               = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      setPatientSearch(''); setPatients([]); setSelected(null);
      setAmountStr(''); setMethod('cash'); setNotes('');
    }
  }, [visible]);

  function onSearchChange(text: string) {
    setPatientSearch(text);
    setSelected(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (text.length < 2) { setPatients([]); return; }
    searchTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'patient')
        .ilike('full_name', `%${text}%`)
        .limit(8);
      setPatients(data ?? []);
    }, 300);
  }

  async function handleSave() {
    const cents = Math.round(parseFloat(amountStr.replace(',', '.')) * 100);
    if (!selectedPatient) { Alert.alert('Chyba', 'Vyber pacienta.'); return; }
    if (isNaN(cents) || cents <= 0) { Alert.alert('Chyba', 'Zadaj platnú sumu.'); return; }
    setSaving(true);
    const { error } = await supabase.from('payments').insert({
      patient_id:   selectedPatient.id,
      amount_cents: cents,
      currency:     'EUR',
      method,
      status:       'pending',
      notes:        notes.trim() || null
    });
    setSaving(false);
    if (error) { Alert.alert('Chyba', error.message); return; }
    Alert.alert('✅ Platba vytvorená', `${fmtEur(cents)} — ${METHOD_LABELS[method]}`);
    onCreated();
    onClose();
  }

  async function handleSaveAndPay() {
    const cents = Math.round(parseFloat(amountStr.replace(',', '.')) * 100);
    if (!selectedPatient) { Alert.alert('Chyba', 'Vyber pacienta.'); return; }
    if (isNaN(cents) || cents <= 0) { Alert.alert('Chyba', 'Zadaj platnú sumu.'); return; }
    setSaving(true);
    const { error } = await supabase.from('payments').insert({
      patient_id:   selectedPatient.id,
      amount_cents: cents,
      currency:     'EUR',
      method,
      status:       'paid',
      paid_at:      new Date().toISOString(),
      notes:        notes.trim() || null
    });
    setSaving(false);
    if (error) { Alert.alert('Chyba', error.message); return; }
    Alert.alert('✅ Zaplatené', `${fmtEur(cents)} — ${METHOD_LABELS[method]}`);
    onCreated();
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={m.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[m.sheet, { backgroundColor: colors.cardBg }]}>
          {/* Handle */}
          <View style={[m.handle, { backgroundColor: colors.bg3 }]} />
          <View style={m.sheetHeader}>
            <Text style={m.sheetTitle}>💰 Nová platba</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.8}>
              <Ionicons name="close" size={24} color={COLORS.esp} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Pacient */}
            <Text style={[m.label, { color: colors.textSecondary }]}>PACIENT</Text>
            <View style={[m.inputWrap, { backgroundColor: colors.bg2, borderColor: colors.bg3 }]}>
              <Ionicons name="person-outline" size={16} color={COLORS.wal} />
              <TextInput
                style={[m.input, { color: colors.textPrimary }]}
                placeholder="Hľadaj pacienta..."
                placeholderTextColor={dark ? '#B8ACA0' : '#B8ACA0'}
                value={selectedPatient ? (selectedPatient.full_name ?? '') : patientSearch}
                onChangeText={onSearchChange}
                onFocus={() => { if (selectedPatient) { setSelected(null); setPatientSearch(''); } }}
              />
              {selectedPatient && <Ionicons name="checkmark-circle" size={18} color="#2E7D5E" />}
            </View>
            {patients.length > 0 && !selectedPatient && (
              <View style={[m.dropdown, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                {patients.map(p => (
                  <TouchableOpacity key={p.id} style={[m.dropdownItem, { borderBottomColor: colors.bg3 }]}
                    onPress={() => { setSelected(p); setPatients([]); setPatientSearch(p.full_name ?? ''); }}>
                    <Ionicons name="person-outline" size={14} color={COLORS.wal} />
                    <Text style={[m.dropdownText, { color: colors.textPrimary }]}>{p.full_name ?? '—'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Suma */}
            <Text style={[m.label, { color: colors.textSecondary }]}>SUMA (€)</Text>
            <View style={[m.inputWrap, { backgroundColor: colors.bg2, borderColor: colors.bg3 }]}>
              <Ionicons name="cash-outline" size={16} color={COLORS.wal} />
              <TextInput
                style={[m.input, { color: colors.textPrimary }]}
                placeholder="0,00"
                placeholderTextColor={dark ? '#B8ACA0' : '#B8ACA0'}
                value={amountStr}
                onChangeText={setAmountStr}
                keyboardType="decimal-pad"
              />
            </View>

            {/* Metóda */}
            <Text style={[m.label, { color: colors.textSecondary }]}>SPÔSOB PLATBY</Text>
            <View style={m.methodRow}>
              {(['cash', 'card', 'online', 'insurance'] as Method[]).map(mt => (
                <TouchableOpacity key={mt}
                  style={[m.methodBtn, { backgroundColor: colors.bg2, borderColor: colors.bg3 }, method === mt && m.methodBtnActive]}
                  onPress={() => setMethod(mt)} activeOpacity={0.8}>
                  <Ionicons name={METHOD_ICONS[mt] as any} size={18}
                    color={method === mt ? '#F5F6F8' : COLORS.wal} />
                  <Text style={[m.methodLabel, method === mt && m.methodLabelActive]}>
                    {METHOD_LABELS[mt]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Poznámky */}
            <Text style={[m.label, { color: colors.textSecondary }]}>POZNÁMKY (voliteľné)</Text>
            <View style={[m.inputWrap, { alignItems: 'flex-start', paddingTop: 10, backgroundColor: colors.bg2, borderColor: colors.bg3 }]}>
              <TextInput
                style={[m.input, { minHeight: 60, color: colors.textPrimary }]}
                placeholder="Napr. záloha, doplatenie..."
                placeholderTextColor={dark ? '#B8ACA0' : '#B8ACA0'}
                value={notes}
                onChangeText={setNotes}
                multiline
              />
            </View>

            {/* Tlačidlá */}
            <View style={m.btns}>
              <TouchableOpacity style={m.btnSecondary} onPress={handleSave}
                disabled={saving} activeOpacity={0.8}>
                {saving ? <ActivityIndicator size="small" color={COLORS.esp} />
                  : <Text style={m.btnSecondaryText}>Uložiť ako čakajúcu</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={m.btnPrimary} onPress={handleSaveAndPay}
                disabled={saving} activeOpacity={0.8}>
                <Ionicons name="card-outline" size={16} color="#F5F6F8" />
                <Text style={m.btnPrimaryText}>Označiť ako zaplatené</Text>
              </TouchableOpacity>
            </View>
            <View style={{ height: 100 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Hlavná obrazovka ─────────────────────────────────────────────────────────
export default function PaymentsScreen() {
  const { colors, dark } = useAppTheme();
  const router = useRouter();
  const [filter, setFilter]     = useState<FilterStatus>('all');
  const [range, setRange]       = useState<DateRange>('today');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const now   = new Date();
    const start = new Date(now);
    if (range === 'today') {
      start.setHours(0, 0, 0, 0);
    } else if (range === 'week') {
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
    } else {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    }

    let q = supabase
      .from('payments')
      .select(`
        id, amount_cents, currency, method, status, paid_at, created_at, notes,
        patient:patient_id(full_name),
        appointment:appointment_id(appointment_date)
      `)
      .gte('created_at', start.toISOString())
      .order('created_at', { ascending: false });

    if (filter !== 'all') q = q.eq('status', filter);

    const { data, error } = await q;
    setLoading(false);
    if (error) { console.warn('payments load:', error.message); return; }
    setPayments((data ?? []) as unknown as Payment[]);
  }, [filter, range]);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('payments_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function markPaid(id: string, method: Method) {
    const { error } = await supabase
      .from('payments')
      .update({ status: 'paid', paid_at: new Date().toISOString(), method })
      .eq('id', id);
    if (error) { Alert.alert('Chyba', error.message); return; }
    load();
  }

  function confirmMarkPaid(id: string) {
    Alert.alert('Označiť ako zaplatené', 'Aký spôsob platby?', [
      { text: 'Hotovosť', onPress: () => markPaid(id, 'cash') },
      { text: 'Karta',    onPress: () => markPaid(id, 'card') },
      { text: 'Zrušiť',  style: 'cancel' },
    ]);
  }

  const totalAll     = payments.reduce((s, p) => s + p.amount_cents, 0);
  const totalPaid    = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount_cents, 0);
  const totalPending = payments.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount_cents, 0);

  return (
    <View style={[s.safe, { backgroundColor: colors.bg2 }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerSub}>KLINIKA</Text>
          <Text style={s.headerTitle}>Platby</Text>
        </View>
        <TouchableOpacity onPress={load} style={s.refreshBtn} activeOpacity={0.8}>
          <Ionicons name="refresh" size={20} color={COLORS.cream} />
        </TouchableOpacity>
      </View>

      {/* Date range */}
      <View style={s.rangeRow}>
        {(['today', 'week', 'month'] as DateRange[]).map(r => (
          <TouchableOpacity key={r} onPress={() => setRange(r)}
            style={[s.rangeChip, range === r && s.rangeChipActive]} activeOpacity={0.8}>
            <Text style={[s.rangeText, range === r && s.rangeTextActive]}>{RANGE_LABELS[r]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Summary cards */}
      <View style={[s.summaryRow, { backgroundColor: colors.cardBg }]}>
        <View style={s.summaryCard}>
          <Text style={s.summaryLbl}>Spolu</Text>
          <Text style={[s.summaryAmt, { color: COLORS.esp }]}>{fmtEur(totalAll)}</Text>
        </View>
        <View style={[s.summaryCard, { borderLeftWidth: 1, borderLeftColor: colors.bg3 }]}>
          <Text style={[s.summaryLbl, { color: colors.textSecondary }]}>Zaplatené</Text>
          <Text style={[s.summaryAmt, { color: '#1A5C35' }]}>{fmtEur(totalPaid)}</Text>
        </View>
        <View style={[s.summaryCard, { borderLeftWidth: 1, borderLeftColor: colors.bg3 }]}>
          <Text style={[s.summaryLbl, { color: colors.textSecondary }]}>Čakajú</Text>
          <Text style={[s.summaryAmt, { color: '#B87333' }]}>{fmtEur(totalPending)}</Text>
        </View>
      </View>

      {/* Status filter */}
      <View style={s.filterRow}>
        {(['all', 'pending', 'paid', 'refunded'] as FilterStatus[]).map(f => (
          <TouchableOpacity key={f} onPress={() => setFilter(f)}
            style={[s.filterChip, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, filter === f && s.filterChipActive]} activeOpacity={0.8}>
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>
              {STATUS_LABEL[f] ?? 'Všetky'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {loading ? (
        <View style={{ padding: 16 }}><SkeletonList count={5} /></View>
      ) : (
        <FlatList
          data={payments}
          keyExtractor={p => p.id}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.wal} />}
          ListEmptyComponent={() => (
            <View style={s.empty}>
              <Text style={s.emptyIcon}>💰</Text>
              <Text style={s.emptyTitle}>Žiadne platby</Text>
              <Text style={s.emptySub}>Za vybrané obdobie neboli nájdené žiadne platby.</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={() => setShowModal(true)} activeOpacity={0.8}>
                <Ionicons name="add" size={16} color="#F5F6F8" />
                <Text style={s.emptyBtnText}>Pridať platbu</Text>
              </TouchableOpacity>
            </View>
          )}
          renderItem={({ item: p, index: _aidx }) => (
              <AnimatedListItem index={_aidx}>
            <View style={[s.card, { backgroundColor: colors.cardBg }]}>
              <View style={s.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.patientName, { color: colors.textPrimary }]} numberOfLines={1}>{p.patient?.full_name ?? '—'}</Text>
                  <View style={s.metaRow}>
                    <Ionicons name={METHOD_ICONS[p.method] as any} size={12} color={COLORS.wal} />
                    <Text style={s.metaText}>{METHOD_LABELS[p.method]}</Text>
                    <Text style={s.metaDot}>·</Text>
                    <Text style={s.metaText}>{fmtDate(p.created_at)} {fmtTime(p.created_at)}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={[s.amount, { color: colors.textPrimary }]}>{fmtEur(p.amount_cents)}</Text>
                  <View style={[s.statusBadge, { backgroundColor: STATUS_BG[p.status] ?? '#EAECEE' }]}>
                    <Text style={[s.statusText, { color: STATUS_COLOR[p.status] ?? '#B8ACA0' }]}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </Text>
                  </View>
                </View>
              </View>
              {p.notes ? <Text style={s.notes} numberOfLines={2}>{p.notes}</Text> : null}
              {p.status === 'pending' && (
                <TouchableOpacity style={s.payBtn} onPress={() => confirmMarkPaid(p.id)} activeOpacity={0.8}>
                  <Ionicons name="checkmark-circle-outline" size={15} color="#F5F6F8" />
                  <Text style={s.payBtnText}>Označiť ako zaplatené</Text>
                </TouchableOpacity>
              )}
            </View>
              </AnimatedListItem>
          )}
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={s.fab} onPress={() => setShowModal(true)} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color="#F5F6F8" />
      </TouchableOpacity>

      <NewPaymentModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onCreated={load}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.bg2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.esp, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16
  },
  backBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  refreshBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  headerSub:  { fontSize: 9, color: COLORS.sand, letterSpacing: 1.5, fontWeight: '600' },
  headerTitle:{ fontSize: 20, fontWeight: '700', color: '#F5F6F8' },

  rangeRow:     { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: COLORS.esp, paddingBottom: 14 },
  rangeChip:    { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  rangeChipActive: { backgroundColor: COLORS.sand },
  rangeText:    { fontSize: 12, color: COLORS.cream, fontWeight: '600' },
  rangeTextActive: { color: COLORS.esp },

  summaryRow:  { flexDirection: 'row', backgroundColor: COLORS.cream, marginHorizontal: 14, marginTop: 12, borderRadius: 2, overflow: 'hidden', elevation: 2, shadowColor: '#121417', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
  summaryCard: { flex: 1, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center' },
  summaryLbl:  { fontSize: 10, color: '#B8ACA0', marginBottom: 2 },
  summaryAmt:  { fontSize: 16, fontWeight: '700' },

  filterRow:     { flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4, flexWrap: 'wrap' },
  filterChip:    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4, backgroundColor: COLORS.cream, borderWidth: 1.5, borderColor: COLORS.bg3 },
  filterChipActive: { backgroundColor: COLORS.esp, borderColor: COLORS.esp },
  filterText:    { fontSize: 12, color: COLORS.wal, fontWeight: '600' },
  filterTextActive: { color: '#F5F6F8' },

  list:        { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 100 },
  loadingText: { fontSize: 13, color: COLORS.wal, marginTop: 8 },

  empty:       { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyIcon:   { fontSize: 48, marginBottom: 4 },
  emptyTitle:  { fontSize: 17, fontWeight: '700', color: COLORS.esp },
  emptySub:    { fontSize: 13, color: COLORS.wal, textAlign: 'center' },
  emptyBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.wal, borderRadius: 2, paddingHorizontal: 18, paddingVertical: 10, marginTop: 8 },
  emptyBtnText:{ fontSize: 14, fontWeight: '700', color: '#F5F6F8' },

  card: {
    backgroundColor: COLORS.cream, borderRadius: 2, padding: 14, marginBottom: 10,
    elevation: 1, shadowColor: '#121417', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3
  },
  cardTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  patientName: { fontSize: 15, fontWeight: '700', color: COLORS.esp, marginBottom: 4 },
  metaRow:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:    { fontSize: 11, color: '#B8ACA0' },
  metaDot:     { fontSize: 11, color: '#D0D4DC' },
  amount:      { fontSize: 17, fontWeight: '700', color: COLORS.esp },
  statusBadge: { borderRadius: 2, paddingHorizontal: 8, paddingVertical: 3 },
  statusText:  { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  notes:       { fontSize: 12, color: '#B8ACA0', marginTop: 8, fontStyle: 'italic' },
  payBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: COLORS.wal, borderRadius: 2, paddingVertical: 9, marginTop: 10
  },
  payBtnText: { fontSize: 13, fontWeight: '700', color: '#F5F6F8' },

  fab: {
    position: 'absolute', right: 20, bottom: 28,
    width: 56, height: 56, borderRadius: 6,
    backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center',
    elevation: 4, shadowColor: COLORS.esp, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8
  }
});

// ─── Modal styles ─────────────────────────────────────────────────────────────
const m = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:     { backgroundColor: COLORS.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', paddingHorizontal: 20 },
  handle:    { width: 40, height: 4, backgroundColor: COLORS.bg3, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  sheetTitle:  { fontSize: 18, fontWeight: '700', color: COLORS.esp },

  label:    { fontSize: 10, fontWeight: '700', color: COLORS.wal, letterSpacing: 1.5, marginTop: 14, marginBottom: 6 },
  inputWrap:{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.bg2, borderRadius: 2, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1.5, borderColor: COLORS.bg3 },
  input:    { flex: 1, fontSize: 15, color: COLORS.esp, paddingVertical: 10 },

  dropdown:     { backgroundColor: COLORS.cream, borderRadius: 2, borderWidth: 1, borderColor: COLORS.bg3, overflow: 'hidden', elevation: 4, marginTop: 4, marginBottom: 4 },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: COLORS.bg3 },
  dropdownText: { fontSize: 14, color: COLORS.esp },

  methodRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  methodBtn:       { flex: 1, minWidth: '45%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 2, backgroundColor: COLORS.bg2, borderWidth: 1.5, borderColor: COLORS.bg3 },
  methodBtnActive: { backgroundColor: COLORS.wal, borderColor: COLORS.wal },
  methodLabel:     { fontSize: 12, fontWeight: '600', color: COLORS.wal },
  methodLabelActive:{ color: '#F5F6F8' },

  btns:          { flexDirection: 'row', gap: 10, marginTop: 20 },
  btnSecondary:  { flex: 1, paddingVertical: 13, borderRadius: 2, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.bg3 },
  btnSecondaryText: { fontSize: 13, fontWeight: '600', color: COLORS.esp },
  btnPrimary:    { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 2, backgroundColor: COLORS.wal },
  btnPrimaryText:{ fontSize: 13, fontWeight: '700', color: '#F5F6F8' }
});
