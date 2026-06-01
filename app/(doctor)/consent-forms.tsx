/**
 * Informované súhlasy — doktor
 * Správa šablón + odosielanie pacientom
 */
import React, { useState, useCallback } from 'react';
import {
  ActivityIndicator, Alert, Modal, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View } from 'react-native';
import {} from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';

type ConsentForm = {
  id: string;
  title: string;
  content: string;
  is_active: boolean;
  created_at: string;
};

type PatientConsent = {
  id: string;
  form_id: string;
  status: string;
  signed_at: string | null;
  signed_name: string | null;
  patient: { full_name: string | null } | null;
  form: { title: string } | null;
};

type Patient = { id: string; full_name: string | null };

// Predpripravené šablóny
const DEFAULT_TEMPLATES = [
  {
    title: 'Súhlas so stomatologickým ošetrením',
    content: 'Ja, dolu podpísaný/á, súhlasím so stomatologickým ošetrením vrátane potrebných röntgenových snímok, lokálnej anestézie a ďalších diagnostických a terapeutických výkonov podľa uváženia ošetrujúceho lekára.\n\nBeriem na vedomie, že mi boli vysvetlené možné riziká a alternatívy liečby. Súhlasím so spracovaním svojich osobných a zdravotných údajov na účely poskytovania zdravotnej starostlivosti.' },
  {
    title: 'Súhlas s extrakciou zuba',
    content: 'Súhlasím s extrakciou zuba/zubov podľa odporúčania ošetrujúceho lekára. Som informovaný/á o možných komplikáciách (krvácanie, infekcia, poškodenie susedných zubov, alveolitis sicca) a beriem ich na vedomie.\n\nPo výkone budem dodržiavať pokyny lekára ohľadom stravy, hygieny a prípadnej medikácie.' },
  {
    title: 'Súhlas s implantologickým výkonom',
    content: 'Súhlasím s plánovaným implantologickým výkonom. Som oboznámený/á s priebehom liečby, vrátane chirurgickej fázy, hojenia a protetickej fázy. Beriem na vedomie, že úspešnosť implantátu závisí od celkového zdravotného stavu, dodržiavania hygieny a nekurenia.\n\nSúhlasím s použitím röntgenového vyšetrenia (OPG, CBCT) na diagnostické účely.' },
];

export default function ConsentFormsScreen() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  const [forms,      setForms]      = useState<ConsentForm[]>([]);
  const [consents,   setConsents]   = useState<PatientConsent[]>([]);
  const [patients,   setPatients]   = useState<Patient[]>([]);
  const [doctorId,   setDoctorId]   = useState<string | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab,  setActiveTab]  = useState<'forms' | 'sent'>('forms');

  // Modaly
  const [showFormModal,   setShowFormModal]   = useState(false);
  const [showSendModal,   setShowSendModal]   = useState(false);
  const [showPreview,     setShowPreview]     = useState<ConsentForm | null>(null);
  const [editingForm,     setEditingForm]     = useState<ConsentForm | null>(null);
  const [formTitle,       setFormTitle]       = useState('');
  const [formContent,     setFormContent]     = useState('');
  const [saving,          setSaving]          = useState(false);
  const [sendFormId,      setSendFormId]      = useState<string | null>(null);
  const [sendPatientId,   setSendPatientId]   = useState<string | null>(null);
  const [sendApptId,      setSendApptId]      = useState('');
  const [sending,         setSending]         = useState(false);

  async function load() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setDoctorId(user.id);

      const [formsRes, consentsRes, patientsRes] = await Promise.all([
        supabase.from('consent_forms').select('id, title, content, is_active, created_at')
          .eq('doctor_id', user.id).order('created_at', { ascending: false }),
        supabase.from('patient_consents')
          .select('id, form_id, status, signed_at, signed_name, patient:profiles!patient_consents_patient_id_fkey(full_name), form:consent_forms(title)')
          .order('created_at', { ascending: false }).limit(100),
        supabase.from('profiles').select('id, full_name').eq('role', 'patient').order('full_name'),
      ]);

      setForms((formsRes.data ?? []) as ConsentForm[]);
      setConsents((consentsRes.data ?? []) as unknown as PatientConsent[]);
      setPatients((patientsRes.data ?? []) as Patient[]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  // ── Vytvoriť / upraviť šablónu ───────────────────────────────────────────
  function openCreate(template?: typeof DEFAULT_TEMPLATES[0]) {
    setEditingForm(null);
    setFormTitle(template?.title ?? '');
    setFormContent(template?.content ?? '');
    setShowFormModal(true);
  }

  function openEdit(f: ConsentForm) {
    setEditingForm(f);
    setFormTitle(f.title);
    setFormContent(f.content);
    setShowFormModal(true);
  }

  async function handleSaveForm() {
    if (!formTitle.trim() || !formContent.trim()) { Alert.alert('Chyba', 'Vyplň názov aj obsah.'); return; }
    if (!doctorId) return;
    setSaving(true);
    const payload = { title: formTitle.trim(), content: formContent.trim() };
    let error;
    if (editingForm) {
      ({ error } = await supabase.from('consent_forms').update(payload).eq('id', editingForm.id));
    } else {
      ({ error } = await supabase.from('consent_forms').insert({ ...payload, doctor_id: doctorId }));
    }
    setSaving(false);
    if (error) { Alert.alert('Chyba', error.message); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowFormModal(false);
    load();
  }

  async function handleDeleteForm(f: ConsentForm) {
    Alert.alert('Odstrániť šablónu', `Odstrániť „${f.title}"?`, [
      { text: 'Nie', style: 'cancel' },
      { text: 'Odstrániť', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('consent_forms').delete().eq('id', f.id);
        if (error) { Alert.alert('Chyba', error.message); return; }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setForms(prev => prev.filter(x => x.id !== f.id));
      }},
    ]);
  }

  // ── Odoslať pacientovi ───────────────────────────────────────────────────
  function openSend(formId: string) {
    setSendFormId(formId);
    setSendPatientId(null);
    setSendApptId('');
    setShowSendModal(true);
  }

  async function handleSend() {
    if (!sendFormId || !sendPatientId) { Alert.alert('Chyba', 'Vyber pacienta.'); return; }
    setSending(true);
    let { error } = await supabase.from('patient_consents').insert({
      form_id:        sendFormId,
      patient_id:     sendPatientId,
      appointment_id: sendApptId.trim() || null,
      status:         'pending' });
    // If appointment_id column doesn't exist yet, retry without it
    if (error?.message?.includes('appointment_id')) {
      ({ error } = await supabase.from('patient_consents').insert({
        form_id:    sendFormId,
        patient_id: sendPatientId,
        status:     'pending' }));
    }
    setSending(false);
    if (error) { Alert.alert('Chyba', error.message); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowSendModal(false);
    Alert.alert('Odoslané ✓', 'Pacient dostane výzvu na podpis pri najbližšom prihlásení.');
    load();
  }

  const STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
    pending: { label: 'Čaká na podpis', color: '#7D6608', bg: '#FEF9E7', icon: '⏳' },
    signed:  { label: 'Podpísaný',      color: '#1E8449', bg: '#EAFAF1', icon: '✅' },
    declined:{ label: 'Odmietnutý',     color: '#922B21', bg: '#FDEDEC', icon: '❌' } };

  if (loading) return <SkeletonList count={4} />;

  const pendingCount = consents.filter(c => c.status === 'pending').length;

  return (
    <View style={styles.safe}>
      <HeroHeader
        title="Informované súhlasy"
        subtitle="Dokumentácia"
        icon="document-text-outline"
        onBack={() => router.back()}
      />

      {/* ── Taby ── */}
      <View style={styles.tabsRow}>
        <TouchableOpacity style={[styles.tab, activeTab === 'forms' && styles.tabActive]}
          onPress={() => setActiveTab('forms')} activeOpacity={0.8}>
          <Text style={[styles.tabText, activeTab === 'forms' && styles.tabTextActive]}>
            📄 Šablóny ({forms.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'sent' && styles.tabActive]}
          onPress={() => setActiveTab('sent')} activeOpacity={0.8}>
          <Text style={[styles.tabText, activeTab === 'sent' && styles.tabTextActive]}>
            📬 Odoslané {pendingCount > 0 ? `(${pendingCount} čaká)` : `(${consents.length})`}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={[styles.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.wal} />}>

        {/* ── TAB: Šablóny ── */}
        {activeTab === 'forms' && (
          <>
            {/* Predpripravené šablóny */}
            {forms.length === 0 && (
              <View style={styles.templateSection}>
                <Text style={styles.templateSectionTitle}>PREDPRIPRAVENÉ ŠABLÓNY</Text>
                {DEFAULT_TEMPLATES.map((t, i) => (
                  <TouchableOpacity key={i} style={[styles.templateChip, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}
                    onPress={() => openCreate(t)} activeOpacity={0.8}>
                    <Ionicons name="document-text-outline" size={16} color={COLORS.wal} />
                    <Text style={[styles.templateChipText, { color: colors.textPrimary }]} numberOfLines={1}>{t.title}</Text>
                    <Ionicons name="add-circle-outline" size={16} color={COLORS.wal} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {forms.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>📋</Text>
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Žiadne vlastné šablóny</Text>
                <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Klepni na predpripravenú šablónu vyššie alebo vytvor vlastnú</Text>
              </View>
            ) : (
              forms.map(f => (
                <View key={f.id} style={[styles.formCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                  <View style={styles.formCardTop}>
                    <Ionicons name="document-text-outline" size={20} color={COLORS.wal} />
                    <Text style={[styles.formTitle, { color: colors.textPrimary }]} numberOfLines={2}>{f.title}</Text>
                  </View>
                  <Text style={styles.formPreview} numberOfLines={2}>{f.content}</Text>
                  <View style={styles.formActions}>
                    <TouchableOpacity style={[styles.formActionBtn, { borderColor: colors.bg3 }]} onPress={() => setShowPreview(f)} activeOpacity={0.8}>
                      <Ionicons name="eye-outline" size={14} color={COLORS.wal} />
                      <Text style={styles.formActionText}>Náhľad</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.formActionBtn, { borderColor: colors.bg3 }]} onPress={() => openEdit(f)} activeOpacity={0.8}>
                      <Ionicons name="create-outline" size={14} color={COLORS.wal} />
                      <Text style={styles.formActionText}>Upraviť</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.formActionBtn, styles.formActionSend]}
                      onPress={() => openSend(f.id)} activeOpacity={0.85}>
                      <Ionicons name="send-outline" size={14} color="#fff" />
                      <Text style={[styles.formActionText, { color: '#fff' }]}>Odoslať</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteForm(f)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="trash-outline" size={16} color="#E74C3C" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {/* ── TAB: Odoslané ── */}
        {activeTab === 'sent' && (
          consents.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📬</Text>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Zatiaľ nič odoslané</Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Vytvor šablónu a odošli ju pacientovi</Text>
            </View>
          ) : (
            consents.map(c => {
              const st = STATUS_CFG[c.status] ?? STATUS_CFG.pending;
              return (
                <View key={c.id} style={[styles.consentRow, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                  <View style={[styles.statusDot, { backgroundColor: st.bg, borderColor: st.color + '66' }]}>
                    <Text style={{ fontSize: 14 }}>{st.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.consentPatient, { color: colors.textPrimary }]} numberOfLines={1}>
                      {(c.patient as any)?.full_name ?? 'Pacient'}
                    </Text>
                    <Text style={[styles.consentForm, { color: colors.textSecondary }]} numberOfLines={1}>
                      {(c.form as any)?.title ?? 'Súhlas'}
                    </Text>
                    {c.status === 'signed' && c.signed_at && (
                      <Text style={styles.consentSigned}>
                        Podpísané: {new Date(c.signed_at).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {c.signed_name ? ` — ${c.signed_name}` : ''}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: st.color }]}>{st.label}</Text>
                  </View>
                </View>
              );
            })
          )
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Modal: Vytvoriť / upraviť šablónu ── */}
      <Modal visible={showFormModal} animationType="slide" transparent onRequestClose={() => setShowFormModal(false)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowFormModal(false)} />
          <View style={[styles.sheet, { maxHeight: '90%', backgroundColor: colors.cardBg }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.bg3 }]} />
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{editingForm ? 'Upraviť šablónu' : 'Nová šablóna'}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>NÁZOV SÚHLASU *</Text>
              <TextInput style={[styles.formInput, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]} value={formTitle} onChangeText={setFormTitle}
                placeholder="napr. Súhlas s extrakciou zuba" placeholderTextColor={dark ? '#666' : '#bbb'} />
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>TEXT SÚHLASU *</Text>
              <TextInput style={[styles.formInput, { minHeight: 160, textAlignVertical: 'top', backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
                value={formContent} onChangeText={setFormContent}
                placeholder="Plný text informovaného súhlasu..." placeholderTextColor={dark ? '#666' : '#bbb'}
                multiline />
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalCancel, { borderColor: colors.bg3 }]} onPress={() => setShowFormModal(false)} activeOpacity={0.8}>
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>Zrušiť</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSave, saving && { opacity: 0.5 }]}
                onPress={handleSaveForm} disabled={saving} activeOpacity={0.85}>
                {saving ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.modalSaveText}>{editingForm ? 'Uložiť' : 'Vytvoriť'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal: Odoslať pacientovi ── */}
      <Modal visible={showSendModal} animationType="slide" transparent onRequestClose={() => setShowSendModal(false)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowSendModal(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.cardBg }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.bg3 }]} />
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Odoslať súhlas pacientovi</Text>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>VYBER PACIENTA *</Text>
            <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
              {patients.map(p => (
                <TouchableOpacity key={p.id}
                  style={[styles.patientOption, { borderBottomColor: colors.bg3 }, sendPatientId === p.id && styles.patientOptionActive]}
                  onPress={() => setSendPatientId(p.id)} activeOpacity={0.8}>
                  <View style={[styles.patientDot, { borderColor: colors.bg3 }, sendPatientId === p.id && { backgroundColor: COLORS.wal }]}>
                    {sendPatientId === p.id && <Ionicons name="checkmark" size={12} color="#fff" />}
                  </View>
                  <Text style={[styles.patientOptionText, { color: colors.textSecondary }, sendPatientId === p.id && { color: colors.textPrimary, fontWeight: '700' }]}>
                    {p.full_name ?? 'Pacient'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalCancel, { borderColor: colors.bg3 }]} onPress={() => setShowSendModal(false)} activeOpacity={0.8}>
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>Zrušiť</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSave, (sending || !sendPatientId) && { opacity: 0.5 }]}
                onPress={handleSend} disabled={sending || !sendPatientId} activeOpacity={0.85}>
                {sending ? <ActivityIndicator color="#fff" size="small" />
                  : <><Ionicons name="send-outline" size={14} color="#fff" />
                      <Text style={styles.modalSaveText}>Odoslať</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal: Náhľad ── */}
      <Modal visible={!!showPreview} animationType="fade" transparent onRequestClose={() => setShowPreview(null)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowPreview(null)} />
          <View style={[styles.sheet, { maxHeight: '85%', backgroundColor: colors.cardBg }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.bg3 }]} />
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{showPreview?.title}</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <Text style={[styles.previewText, { color: colors.textPrimary }]}>{showPreview?.content}</Text>
            </ScrollView>
            <TouchableOpacity style={styles.modalSave} onPress={() => setShowPreview(null)} activeOpacity={0.85}>
              <Text style={styles.modalSaveText}>Zatvoriť</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },
  content:{ padding: SPACING.xl, paddingTop: 12 },
  center: { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center' },

  header:      { backgroundColor: COLORS.esp, paddingHorizontal: SPACING.xl, paddingTop: 14, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerSub:   { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  addBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.wal, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  addBtnText:  { fontSize: 13, fontWeight: '700', color: '#fff' },

  tabsRow:       { flexDirection: 'row', backgroundColor: COLORS.esp, paddingHorizontal: SPACING.xl, paddingBottom: 12, gap: 10 },
  tab:           { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  tabActive:     { backgroundColor: COLORS.wal },
  tabText:       { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  tabTextActive: { color: '#fff' },

  templateSection:     { marginBottom: 14 },
  templateSectionTitle:{ fontSize: 9, letterSpacing: 2, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  templateChip:        { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.cream, borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: COLORS.bg3 },
  templateChipText:    { flex: 1, fontSize: 12, fontWeight: '600', color: COLORS.esp },

  empty:      { alignItems: 'center', paddingVertical: 40 },
  emptyIcon:  { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.esp, marginBottom: 6 },
  emptySub:   { fontSize: 12, color: COLORS.wal, textAlign: 'center', lineHeight: 18 },

  formCard:    { backgroundColor: COLORS.cream, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.bg3 },
  formCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 6 },
  formTitle:   { flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.esp, lineHeight: 20 },
  formPreview: { fontSize: 11, color: '#888', lineHeight: 16, marginBottom: 10, fontStyle: 'italic' },
  formActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  formActionBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: COLORS.bg3 },
  formActionSend: { backgroundColor: COLORS.wal, borderColor: COLORS.wal },
  formActionText: { fontSize: 11, fontWeight: '700', color: COLORS.wal },

  consentRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.cream, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.bg3 },
  statusDot:     { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  consentPatient:{ fontSize: 13, fontWeight: '700', color: COLORS.esp, marginBottom: 2 },
  consentForm:   { fontSize: 10, color: COLORS.wal, marginBottom: 2 },
  consentSigned: { fontSize: 9, color: '#1E8449', fontStyle: 'italic' },
  statusBadge:   { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  statusBadgeText:{ fontSize: 9, fontWeight: '700' },

  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:       { backgroundColor: COLORS.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 44 },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: COLORS.bg3, alignSelf: 'center', marginBottom: 20 },
  sheetTitle:  { fontSize: 18, fontWeight: '700', color: COLORS.esp, marginBottom: 16 },
  formLabel:   { fontSize: 9, letterSpacing: 1.5, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 },
  formInput:   { borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: COLORS.esp, backgroundColor: COLORS.bg2, marginBottom: 14 },

  patientOption:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.bg3 },
  patientOptionActive:{ backgroundColor: '#F4ECE4', borderRadius: 8, paddingHorizontal: 8, borderBottomWidth: 0, marginBottom: 1 },
  patientDot:        { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.bg3, alignItems: 'center', justifyContent: 'center' },
  patientOptionText: { fontSize: 14, color: COLORS.wal },

  previewText: { fontSize: 14, color: COLORS.esp, lineHeight: 22 },

  modalActions:    { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalCancel:     { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.bg3 },
  modalCancelText: { fontSize: 14, fontWeight: '600', color: COLORS.wal },
  modalSave:       { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 12, backgroundColor: COLORS.wal },
  modalSaveText:   { fontSize: 14, fontWeight: '700', color: '#fff' } });
