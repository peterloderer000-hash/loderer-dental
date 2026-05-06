import React, { useState, useEffect, useCallback } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../supabase';
import { COLORS, SIZES } from '../../styles/theme';
import { SkeletonList } from '../../components/Skeleton';

// ─── Typy ─────────────────────────────────────────────────────────────────────
type Severity = 'mild' | 'moderate' | 'severe';

type Diagnosis = {
  id: string;
  icd_code: string | null;
  description: string;
  severity: Severity;
  created_at: string;
  appointment_id: string | null;
};

type Prescription = {
  id: string;
  medication: string;
  dosage: string | null;
  instructions: string | null;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
  appointment_id: string | null;
};

type Tab = 'diagnoses' | 'prescriptions';

// ─── Pomocné funkcie ───────────────────────────────────────────────────────────
function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString('sk-SK', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

const SEVERITY_CFG: Record<Severity, { label: string; color: string; bg: string; border: string }> = {
  mild:     { label: 'Mierna',  color: '#1E8449', bg: '#EAFAF1', border: '#A9DFBF' },
  moderate: { label: 'Stredná', color: '#7D6608', bg: '#FEF9E7', border: '#F9E79F' },
  severe:   { label: 'Ťažká',   color: '#922B21', bg: '#FDEDEC', border: '#F5B7B1' },
};

const SEVERITY_OPTIONS: Severity[] = ['mild', 'moderate', 'severe'];

// ─── Modál: pridať diagnózu ───────────────────────────────────────────────────
function AddDiagModal({
  visible, onClose, onSave,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (diag: Omit<Diagnosis, 'id' | 'created_at' | 'appointment_id'>) => Promise<void>;
}) {
  const [icdCode,     setIcdCode]     = useState('');
  const [description, setDescription] = useState('');
  const [severity,    setSeverity]    = useState<Severity>('mild');
  const [saving,      setSaving]      = useState(false);

  useEffect(() => {
    if (visible) {
      setIcdCode('');
      setDescription('');
      setSeverity('mild');
    }
  }, [visible]);

  async function handleSave() {
    if (!description.trim()) {
      Alert.alert('Chyba', 'Popis diagnózy je povinný.');
      return;
    }
    setSaving(true);
    await onSave({
      icd_code:    icdCode.trim() || null,
      description: description.trim(),
      severity,
    });
    setSaving(false);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={ms.overlay}>
          <TouchableOpacity style={{ flex: 0.3 }} activeOpacity={1} onPress={onClose} />
          <View style={ms.sheet}>
            <View style={ms.handle} />
            <Text style={ms.title}>Pridať diagnózu</Text>

            <Text style={ms.label}>KÓD ICD (voliteľné)</Text>
            <TextInput
              style={ms.input}
              value={icdCode}
              onChangeText={setIcdCode}
              placeholder="K02.1 – napr. zubný kaz"
              placeholderTextColor="#bbb"
              autoCapitalize="characters"
              maxLength={10}
            />

            <Text style={ms.label}>POPIS DIAGNÓZY *</Text>
            <TextInput
              style={[ms.input, { minHeight: 90 }]}
              value={description}
              onChangeText={setDescription}
              placeholder="Popis diagnózy..."
              placeholderTextColor="#bbb"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              autoFocus
            />

            <Text style={ms.label}>ZÁVAŽNOSŤ</Text>
            <View style={ms.chipRow}>
              {SEVERITY_OPTIONS.map((sev) => {
                const cfg    = SEVERITY_CFG[sev];
                const active = severity === sev;
                return (
                  <TouchableOpacity
                    key={sev}
                    style={[ms.chip, { borderColor: cfg.border, backgroundColor: active ? cfg.color : '#fff' }]}
                    onPress={() => setSeverity(sev)}
                    activeOpacity={0.8}
                  >
                    <Text style={[ms.chipText, { color: active ? '#fff' : cfg.color }]}>
                      {cfg.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[ms.btnRow, { marginTop: 18 }]}>
              <TouchableOpacity style={ms.btnCancel} onPress={onClose} activeOpacity={0.8}>
                <Text style={ms.btnCancelText}>Zrušiť</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[ms.btnSave, saving && { opacity: 0.5 }]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={ms.btnSaveText}>Uložiť</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Modál: pridať recept ─────────────────────────────────────────────────────
function AddRxModal({
  visible, onClose, onSave,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (rx: Omit<Prescription, 'id' | 'created_at' | 'appointment_id' | 'is_active'>) => Promise<void>;
}) {
  const [medication,    setMedication]    = useState('');
  const [dosage,        setDosage]        = useState('');
  const [instructions,  setInstructions]  = useState('');
  const [validUntil,    setValidUntil]    = useState('');
  const [saving,        setSaving]        = useState(false);

  useEffect(() => {
    if (visible) {
      setMedication('');
      setDosage('');
      setInstructions('');
      setValidUntil('');
    }
  }, [visible]);

  async function handleSave() {
    if (!medication.trim()) {
      Alert.alert('Chyba', 'Názov lieku je povinný.');
      return;
    }
    if (validUntil.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(validUntil.trim())) {
      Alert.alert('Chyba', 'Dátum platnosti musí byť vo formáte YYYY-MM-DD.');
      return;
    }
    setSaving(true);
    await onSave({
      medication:   medication.trim(),
      dosage:       dosage.trim() || null,
      instructions: instructions.trim() || null,
      valid_until:  validUntil.trim() || null,
    });
    setSaving(false);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={ms.overlay}>
          <TouchableOpacity style={{ flex: 0.2 }} activeOpacity={1} onPress={onClose} />
          <View style={[ms.sheet, { maxHeight: '82%' }]}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={ms.handle} />
              <Text style={ms.title}>Pridať recept</Text>

              <Text style={ms.label}>LIEK *</Text>
              <TextInput
                style={ms.input}
                value={medication}
                onChangeText={setMedication}
                placeholder="Napr. Ibuprofen 400mg"
                placeholderTextColor="#bbb"
                autoFocus
              />

              <Text style={ms.label}>DÁVKOVANIE (voliteľné)</Text>
              <TextInput
                style={ms.input}
                value={dosage}
                onChangeText={setDosage}
                placeholder="Napr. 1×3 denne po jedle"
                placeholderTextColor="#bbb"
              />

              <Text style={ms.label}>ĎALŠIE POKYNY (voliteľné)</Text>
              <TextInput
                style={[ms.input, { minHeight: 80 }]}
                value={instructions}
                onChangeText={setInstructions}
                placeholder="Ďalšie pokyny..."
                placeholderTextColor="#bbb"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <Text style={ms.label}>PLATNÉ DO (voliteľné)</Text>
              <TextInput
                style={ms.input}
                value={validUntil}
                onChangeText={setValidUntil}
                placeholder="YYYY-MM-DD – napr. 2026-05-31"
                placeholderTextColor="#bbb"
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
            </ScrollView>

            <View style={[ms.btnRow, { marginTop: 14 }]}>
              <TouchableOpacity style={ms.btnCancel} onPress={onClose} activeOpacity={0.8}>
                <Text style={ms.btnCancelText}>Zrušiť</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[ms.btnSave, saving && { opacity: 0.5 }]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={ms.btnSaveText}>Uložiť</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Modál štýly ──────────────────────────────────────────────────────────────
const ms = StyleSheet.create({
  overlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:         { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 36 },
  handle:        { width: 38, height: 4, borderRadius: 2, backgroundColor: COLORS.bg3, alignSelf: 'center', marginBottom: 18 },
  title:         { fontSize: 20, fontWeight: '700', color: COLORS.esp, marginBottom: 16 },
  label:         { fontSize: 9, letterSpacing: 1.5, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6, marginTop: 12 },
  input:         { borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.esp, backgroundColor: COLORS.bg2 },
  chipRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip:          { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5 },
  chipText:      { fontSize: 13, fontWeight: '600' },
  btnRow:        { flexDirection: 'row', gap: 10 },
  btnCancel:     { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.bg3 },
  btnCancelText: { fontSize: 14, fontWeight: '600', color: COLORS.wal },
  btnSave:       { flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: COLORS.wal, justifyContent: 'center' },
  btnSaveText:   { fontSize: 14, fontWeight: '700', color: '#fff' },
});

// ─── Hlavná obrazovka ─────────────────────────────────────────────────────────
export default function PrescriptionsScreen() {
  const router = useRouter();
  const { patientId, patientName } = useLocalSearchParams<{ patientId: string; patientName: string }>();

  const [activeTab,   setActiveTab]   = useState<Tab>('diagnoses');
  const [diagnoses,   setDiagnoses]   = useState<Diagnosis[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [doctorId,    setDoctorId]    = useState('');
  const [showAddDiag, setShowAddDiag] = useState(false);
  const [showAddRx,   setShowAddRx]   = useState(false);

  // ── Načítanie dát ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: diagData }, { data: rxData }] = await Promise.all([
      supabase
        .from('diagnoses')
        .select('id, icd_code, description, severity, created_at, appointment_id')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false }),
      supabase
        .from('prescriptions')
        .select('id, medication, dosage, instructions, valid_until, is_active, created_at, appointment_id')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false }),
    ]);
    if (diagData) setDiagnoses(diagData as Diagnosis[]);
    if (rxData)   setPrescriptions(rxData as Prescription[]);
    setLoading(false);
  }, [patientId]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setDoctorId(user.id);
    });
    load();
  }, [load]);

  // ── Diagnóza: pridať ──────────────────────────────────────────────────────
  async function handleAddDiag(
    diag: Omit<Diagnosis, 'id' | 'created_at' | 'appointment_id'>,
  ) {
    const { data, error } = await supabase
      .from('diagnoses')
      .insert({
        patient_id: patientId,
        doctor_id:  doctorId,
        icd_code:   diag.icd_code,
        description: diag.description,
        severity:   diag.severity,
      })
      .select('id, icd_code, description, severity, created_at, appointment_id')
      .single();
    if (error) { Alert.alert('Chyba', error.message); return; }
    setDiagnoses((prev) => [data as Diagnosis, ...prev]);
    setShowAddDiag(false);
  }

  // ── Diagnóza: zmazať ──────────────────────────────────────────────────────
  function handleDeleteDiag(diag: Diagnosis) {
    Alert.alert(
      'Zmazať diagnózu',
      `Naozaj zmazať diagnózu "${diag.description.slice(0, 60)}"?`,
      [
        { text: 'Nie', style: 'cancel' },
        {
          text: 'Zmazať', style: 'destructive', onPress: async () => {
            const { error } = await supabase.from('diagnoses').delete().eq('id', diag.id);
            if (error) { Alert.alert('Chyba', error.message); return; }
            setDiagnoses((prev) => prev.filter((d) => d.id !== diag.id));
          },
        },
      ],
    );
  }

  // ── Recept: pridať ────────────────────────────────────────────────────────
  async function handleAddRx(
    rx: Omit<Prescription, 'id' | 'created_at' | 'appointment_id' | 'is_active'>,
  ) {
    const { data, error } = await supabase
      .from('prescriptions')
      .insert({
        patient_id:   patientId,
        doctor_id:    doctorId,
        medication:   rx.medication,
        dosage:       rx.dosage,
        instructions: rx.instructions,
        valid_until:  rx.valid_until,
        is_active:    true,
      })
      .select('id, medication, dosage, instructions, valid_until, is_active, created_at, appointment_id')
      .single();
    if (error) { Alert.alert('Chyba', error.message); return; }
    setPrescriptions((prev) => [data as Prescription, ...prev]);
    setShowAddRx(false);
  }

  // ── Recept: zmazať ────────────────────────────────────────────────────────
  function handleDeleteRx(rx: Prescription) {
    Alert.alert(
      'Zmazať recept',
      `Naozaj zmazať recept na "${rx.medication}"?`,
      [
        { text: 'Nie', style: 'cancel' },
        {
          text: 'Zmazať', style: 'destructive', onPress: async () => {
            const { error } = await supabase.from('prescriptions').delete().eq('id', rx.id);
            if (error) { Alert.alert('Chyba', error.message); return; }
            setPrescriptions((prev) => prev.filter((r) => r.id !== rx.id));
          },
        },
      ],
    );
  }

  // ── Recept: prepnúť is_active ─────────────────────────────────────────────
  async function handleToggleActive(rx: Prescription) {
    const next = !rx.is_active;
    const { error } = await supabase
      .from('prescriptions')
      .update({ is_active: next })
      .eq('id', rx.id);
    if (error) { Alert.alert('Chyba', error.message); return; }
    setPrescriptions((prev) =>
      prev.map((r) => (r.id === rx.id ? { ...r, is_active: next } : r)),
    );
  }

  // ── Render karty diagnózy ─────────────────────────────────────────────────
  function renderDiagCard(item: Diagnosis) {
    const sev = SEVERITY_CFG[item.severity] ?? SEVERITY_CFG.mild;
    return (
      <View key={item.id} style={styles.card}>
        <View style={styles.cardTopRow}>
          {item.icd_code ? (
            <View style={styles.icdChip}>
              <Text style={styles.icdText}>{item.icd_code}</Text>
            </View>
          ) : null}
          <View style={[styles.severityBadge, { backgroundColor: sev.bg, borderColor: sev.border }]}>
            <Text style={[styles.severityText, { color: sev.color }]}>{sev.label}</Text>
          </View>
          <Text style={styles.dateText}>{fmtDate(item.created_at)}</Text>
          <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteDiag(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={16} color="#C0392B" />
          </TouchableOpacity>
        </View>
        <Text style={styles.descText}>{item.description}</Text>
      </View>
    );
  }

  // ── Render karty receptu ──────────────────────────────────────────────────
  function renderRxCard(item: Prescription) {
    const activeCfg = item.is_active
      ? { label: 'Aktívny',    color: '#1E8449', bg: '#EAFAF1', border: '#A9DFBF' }
      : { label: 'Neaktívny',  color: '#7F8C8D', bg: '#F4F6F7', border: '#D5D8DC' };
    return (
      <View key={item.id} style={styles.card}>
        <View style={styles.cardTopRow}>
          <Text style={styles.medicationText} numberOfLines={1}>{item.medication}</Text>
          <TouchableOpacity
            style={[styles.activeBadge, { backgroundColor: activeCfg.bg, borderColor: activeCfg.border }]}
            onPress={() => handleToggleActive(item)}
            activeOpacity={0.75}
          >
            <Text style={[styles.activeText, { color: activeCfg.color }]}>{activeCfg.label}</Text>
          </TouchableOpacity>
          <Text style={styles.dateText}>{fmtDate(item.created_at)}</Text>
          <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteRx(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={16} color="#C0392B" />
          </TouchableOpacity>
        </View>
        {item.dosage ? (
          <Text style={styles.rxMeta}>{'💊 '}{item.dosage}</Text>
        ) : null}
        {item.instructions ? (
          <Text style={styles.rxMeta}>{item.instructions}</Text>
        ) : null}
        {item.valid_until ? (
          <Text style={styles.rxMeta}>{'📅 Platné do: '}{item.valid_until}</Text>
        ) : null}
      </View>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  function renderEmpty(tab: Tab) {
    const isDiag = tab === 'diagnoses';
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyEmoji}>{isDiag ? '🩺' : '💊'}</Text>
        <Text style={styles.emptyTitle}>{isDiag ? 'Žiadne diagnózy' : 'Žiadne recepty'}</Text>
        <Text style={styles.emptySubtitle}>
          {isDiag
            ? 'Pre tohto pacienta zatiaľ nie sú zaznamenané žiadne diagnózy.'
            : 'Pre tohto pacienta zatiaľ nie sú vystavené žiadne recepty.'}
        </Text>
        <TouchableOpacity
          style={styles.emptyBtn}
          onPress={() => isDiag ? setShowAddDiag(true) : setShowAddRx(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.emptyBtnText}>Pridať</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Hlavička */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerSub}>RECEPTY &amp; DIAGNÓZY</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>{patientName}</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => activeTab === 'diagnoses' ? setShowAddDiag(true) : setShowAddRx(true)}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Taby */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'diagnoses' && styles.tabActive]}
          onPress={() => setActiveTab('diagnoses')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'diagnoses' && styles.tabTextActive]}>
            {'🩺 Diagnózy ('}
            {diagnoses.length}
            {')'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'prescriptions' && styles.tabActive]}
          onPress={() => setActiveTab('prescriptions')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'prescriptions' && styles.tabTextActive]}>
            {'💊 Recepty ('}
            {prescriptions.length}
            {')'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Obsah */}
      {loading ? (
        <SkeletonList count={4} />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {activeTab === 'diagnoses' ? (
            diagnoses.length === 0
              ? renderEmpty('diagnoses')
              : diagnoses.map(renderDiagCard)
          ) : (
            prescriptions.length === 0
              ? renderEmpty('prescriptions')
              : prescriptions.map(renderRxCard)
          )}
        </ScrollView>
      )}

      {/* Modály */}
      <AddDiagModal
        visible={showAddDiag}
        onClose={() => setShowAddDiag(false)}
        onSave={handleAddDiag}
      />
      <AddRxModal
        visible={showAddRx}
        onClose={() => setShowAddRx(false)}
        onSave={handleAddRx}
      />
    </SafeAreaView>
  );
}

// ─── Štýly ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.esp,
  },

  // Header
  header: {
    backgroundColor: COLORS.esp,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIZES.padding,
    paddingTop: 4,
    paddingBottom: 14,
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSub: {
    fontSize: 9,
    letterSpacing: 2,
    color: COLORS.sand,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginTop: 1,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.wal,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Taby
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bg3,
  },
  tab: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: COLORS.wal,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.sand,
  },
  tabTextActive: {
    color: COLORS.esp,
  },

  // Scroll
  scroll: {
    flex: 1,
    backgroundColor: COLORS.bg2,
  },
  scrollContent: {
    padding: SIZES.padding,
    paddingBottom: 120,
  },

  // Loading
  loadingWrap: {
    flex: 1,
    backgroundColor: COLORS.bg2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Karta
  card: {
    backgroundColor: '#fff',
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.bg3,
    padding: 14,
    marginBottom: 10,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },

  // Diagnóza
  icdChip: {
    backgroundColor: '#EBF5FB',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#AED6F1',
  },
  icdText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A5276',
  },
  severityBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  severityText: {
    fontSize: 11,
    fontWeight: '700',
  },
  dateText: {
    fontSize: 11,
    color: COLORS.sand,
    marginLeft: 'auto',
    marginRight: 4,
  },
  deleteBtn: {
    padding: 2,
  },
  descText: {
    fontSize: 14,
    color: COLORS.esp,
    lineHeight: 20,
  },

  // Recept
  medicationText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.esp,
    flex: 1,
  },
  activeBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  activeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  rxMeta: {
    fontSize: 13,
    color: COLORS.wal,
    marginTop: 4,
    lineHeight: 18,
  },

  // Empty state
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: SIZES.padding,
  },
  emptyEmoji: {
    fontSize: 52,
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.esp,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.wal,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.wal,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: SIZES.radius,
  },
  emptyBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
