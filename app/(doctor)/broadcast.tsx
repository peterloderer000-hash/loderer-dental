/**
 * Hromadná správa — doktor
 * Pošle in-app notifikáciu vybranej skupine pacientov
 */
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View } from 'react-native';
import {} from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { useAppTheme } from '../../context/ThemeContext';

type Audience = 'all' | 'upcoming' | 'recall' | 'custom';

const AUDIENCE_CFG: { key: Audience; label: string; desc: string; icon: string; color: string; bg: string; darkBg: string }[] = [
  { key: 'all',      label: 'Všetci pacienti',        desc: 'Pošle správu všetkým registrovaným pacientom',               icon: 'people-outline',        color: COLORS.wal,  bg: '#F4ECE4', darkBg: '#3D2E22' },
  { key: 'upcoming', label: 'Najbližšie termíny',      desc: 'Pacienti s termínom v nasledujúcich 7 dňoch',                icon: 'calendar-outline',      color: '#1A5276',   bg: '#EBF5FB', darkBg: '#0D2233' },
  { key: 'recall',   label: 'Recall — >6 mesiacov',   desc: 'Pacienti, ktorí neboli na kontrole viac ako 6 mesiacov',     icon: 'time-outline',          color: '#922B21',   bg: '#FDEDEC', darkBg: '#4A1010' },
  { key: 'custom',   label: 'Vybraní pacienti',        desc: 'Vyberte konkrétnych pacientov zo zoznamu',                   icon: 'checkmark-circle-outline', color: '#1E8449', bg: '#EAFAF1', darkBg: '#0D3B1F' },
];

const MESSAGE_TEMPLATES = [
  { emoji: '🎄', label: 'Sviatky',     title: 'Sviatočné pozdravy',          body: 'Prajem vám krásne sviatky a veľa zdravia. Nezabudnite na pravidelnú zubnú hygienu! 🦷' },
  { emoji: '📅', label: 'Dovolenka',   title: 'Zmena ordinačných hodín',     body: 'Oznamujeme, že od [dátum] do [dátum] bude ordinacia zatvorená. Tešíme sa na vás po otvorení!' },
  { emoji: '🦷', label: 'Prevencia',   title: 'Čas na preventívnu prehliadku', body: 'Pravidelné prehliadky sú základom zdravého úsmevu. Zavolajte nám alebo sa objednajte cez appku!' },
  { emoji: '✨', label: 'Akcia',       title: 'Špeciálna ponuka',            body: 'Tento mesiac ponúkame zvýhodnenú cenu na bielenie zubov. Neváhajte nás kontaktovať!' },
  { emoji: '🩺', label: 'Covid',       title: 'Dôležité oznamenie',          body: 'Prosíme pacientov, aby pred návštevou ordinacie informovali o príznakoch ochorenia. Ďakujeme za pochopenie.' },
];

type Patient = { id: string; full_name: string | null; phone_number: string | null };

export default function BroadcastScreen() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  const [audience,       setAudience]       = useState<Audience>('all');
  const [title,          setTitle]          = useState('');
  const [body,           setBody]           = useState('');
  const [sending,        setSending]        = useState(false);
  const [patients,       setPatients]       = useState<Patient[]>([]);
  const [loadingPts,     setLoadingPts]     = useState(true);
  const [selectedIds,    setSelectedIds]    = useState<Set<string>>(new Set());
  const [patientSearch,  setPatientSearch]  = useState('');
  const [recipientCount, setRecipientCount] = useState<number>(0);
  const [countLoading,   setCountLoading]   = useState(false);
  const [isScheduled,    setIsScheduled]    = useState(false);
  const [schedDate,      setSchedDate]      = useState('');
  const [schedTime,      setSchedTime]      = useState('09:00');

  async function loadPatients() {
    setLoadingPts(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, phone_number')
        .eq('role', 'patient')
        .order('full_name');
      setPatients((data ?? []) as Patient[]);
    } finally {
      setLoadingPts(false);
    }
  }

  useFocusEffect(useCallback(() => { loadPatients(); }, []));

  // ── Vypočítaj počet príjemcov pri každej zmene audience / patients / selectedIds ──
  useEffect(() => {
    let cancelled = false;

    async function compute() {
      if (audience === 'all') {
        setRecipientCount(patients.length);
        return;
      }
      if (audience === 'custom') {
        setRecipientCount(selectedIds.size);
        return;
      }
      // Pre upcoming a recall musíme ísť do DB
      setCountLoading(true);
      try {
        if (audience === 'upcoming') {
          const now   = new Date();
          const plus7 = new Date(now); plus7.setDate(now.getDate() + 7);
          const { data } = await supabase
            .from('appointments')
            .select('patient_id')
            .eq('status', 'scheduled')
            .gte('appointment_date', now.toISOString())
            .lte('appointment_date', plus7.toISOString());
          if (!cancelled) {
            const unique = new Set((data ?? []).map((a: any) => a.patient_id as string));
            setRecipientCount(unique.size);
          }
        } else if (audience === 'recall') {
          const { data } = await supabase
            .from('appointments')
            .select('patient_id, appointment_date')
            .eq('status', 'completed')
            .order('appointment_date', { ascending: false });
          if (!cancelled) {
            const map = new Map<string, Date>();
            (data ?? []).forEach((a: any) => {
              const d = new Date(a.appointment_date);
              if (!map.has(a.patient_id) || d > map.get(a.patient_id)!) map.set(a.patient_id, d);
            });
            const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 6);
            setRecipientCount([...map.entries()].filter(([, d]) => d < cutoff).length);
          }
        }
      } finally {
        if (!cancelled) setCountLoading(false);
      }
    }

    compute();
    return () => { cancelled = true; };
  }, [audience, patients, selectedIds]);

  const filteredPatients = useMemo(() => {
    const q = patientSearch.toLowerCase();
    if (!q) return patients;
    return patients.filter(p =>
      (p.full_name ?? '').toLowerCase().includes(q) ||
      (p.phone_number ?? '').toLowerCase().includes(q)
    );
  }, [patients, patientSearch]);

  function togglePatient(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSend() {
    if (!title.trim()) { Alert.alert('Chýba predmet', 'Zadajte predmet správy.'); return; }
    if (!body.trim())  { Alert.alert('Chýba text',    'Zadajte text správy.'); return; }

    // Určiť zoznam príjemcov
    let recipientIds: string[] = [];

    if (audience === 'all') {
      recipientIds = patients.map(p => p.id);
    } else if (audience === 'custom') {
      recipientIds = [...selectedIds];
      if (recipientIds.length === 0) {
        Alert.alert('Žiadni pacienti', 'Vyberte aspoň jedného pacienta.');
        return;
      }
    } else if (audience === 'upcoming') {
      const now  = new Date();
      const plus7 = new Date(now); plus7.setDate(now.getDate() + 7);
      const { data } = await supabase
        .from('appointments')
        .select('patient_id')
        .eq('status', 'scheduled')
        .gte('appointment_date', now.toISOString())
        .lte('appointment_date', plus7.toISOString());
      recipientIds = [...new Set((data ?? []).map((a: any) => a.patient_id as string))];
    } else if (audience === 'recall') {
      const { data } = await supabase
        .from('appointments')
        .select('patient_id, appointment_date')
        .eq('status', 'completed')
        .order('appointment_date', { ascending: false });
      const map = new Map<string, Date>();
      (data ?? []).forEach((a: any) => {
        const d = new Date(a.appointment_date);
        if (!map.has(a.patient_id) || d > map.get(a.patient_id)!) map.set(a.patient_id, d);
      });
      const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 6);
      recipientIds = [...map.entries()].filter(([, d]) => d < cutoff).map(([id]) => id);
    }

    if (recipientIds.length === 0) {
      Alert.alert('Žiadni príjemcovia', 'Pre vybrané kritériá neboli nájdení žiadni pacienti.');
      return;
    }

    Alert.alert(
      'Odoslať správu',
      `Odoslať "${title}" ${recipientIds.length} pacientom?`,
      [
        { text: 'Zrušiť', style: 'cancel' },
        { text: 'Odoslať', onPress: async () => {
          setSending(true);
          try {
            let scheduledAt: string | null = null;
            if (isScheduled && schedDate) {
              scheduledAt = new Date(`${schedDate}T${schedTime || '09:00'}:00`).toISOString();
            }
            const notifs = recipientIds.map(uid => ({
              user_id:      uid,
              title:        title.trim(),
              body:         body.trim(),
              type:         'info' as const,
              scheduled_at: scheduledAt }));
            // Supabase má limit na insert, posielame po 100
            for (let i = 0; i < notifs.length; i += 100) {
              const { error } = await supabase.from('notifications').insert(notifs.slice(i, i + 100));
              if (error) throw error;
            }
            const msg = isScheduled && schedDate
              ? `Správa naplánovaná na ${schedDate} ${schedTime} pre ${recipientIds.length} pacientov.`
              : `Správa bola odoslaná ${recipientIds.length} pacientom.`;
            Alert.alert(isScheduled ? '📅 Naplánované!' : '✅ Odoslané!', msg);
            setTitle(''); setBody(''); setSelectedIds(new Set());
          } catch (err: any) {
            Alert.alert('Chyba', err.message);
          } finally {
            setSending(false);
          }
        }},
      ],
    );
  }

  return (
    <View style={styles.safe}>
      <HeroHeader
        title="Hromadná správa"
        subtitle="Komunikácia"
        icon="megaphone-outline"
        onBack={() => router.back()}
      />

      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView style={[styles.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Skupina príjemcov */}
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>KOMU POŠLEME</Text>
          <View style={styles.audienceGrid}>
            {AUDIENCE_CFG.map((a) => (
              <TouchableOpacity
                key={a.key}
                style={[styles.audienceCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, audience === a.key && { borderColor: a.color, backgroundColor: dark ? a.darkBg : a.bg }]}
                onPress={() => setAudience(a.key)}
                activeOpacity={0.8}
              >
                <View style={[styles.audienceIcon, { backgroundColor: audience === a.key ? a.color : colors.bg3 }]}>
                  <Ionicons name={a.icon as any} size={16} color={audience === a.key ? '#fff' : COLORS.wal} />
                </View>
                <Text style={[styles.audienceLabel, { color: colors.textPrimary }, audience === a.key && { color: a.color }]}>{a.label}</Text>
                <Text style={[styles.audienceDesc, { color: colors.textSecondary }]}>{a.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Výber pacientov (len pre custom) */}
          {audience === 'custom' && (
            <View style={[styles.customSection, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <View style={[styles.searchRow, { borderBottomColor: colors.bg3 }]}>
                <Ionicons name="search-outline" size={16} color={COLORS.wal} />
                <TextInput
                  style={[styles.searchInput, { color: colors.textPrimary }]}
                  placeholder="Hľadaj pacienta..."
                  placeholderTextColor={dark ? '#666' : '#999'}
                  value={patientSearch}
                  onChangeText={setPatientSearch}
                />
                {selectedIds.size > 0 && (
                  <View style={styles.selBadge}>
                    <Text style={styles.selBadgeText}>{selectedIds.size}</Text>
                  </View>
                )}
              </View>
              {loadingPts ? (
                <ActivityIndicator color={COLORS.wal} style={{ marginVertical: 12 }} />
              ) : (
                filteredPatients.map((p) => {
                  const sel = selectedIds.has(p.id);
                  const initials = (p.full_name ?? '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.ptRow, { borderBottomColor: colors.bg3 }, sel && [styles.ptRowSel, { backgroundColor: dark ? '#3D2E22' : '#F4ECE4' }]]}
                      onPress={() => togglePatient(p.id)}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.ptAvatar, { backgroundColor: colors.bg3 }, sel && { backgroundColor: COLORS.wal }]}>
                        <Text style={[styles.ptAvatarText, sel && { color: '#fff' }]}>{initials}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.ptName, { color: colors.textPrimary }]}>{p.full_name ?? 'Pacient'}</Text>
                        {p.phone_number && <Text style={[styles.ptPhone, { color: colors.textSecondary }]}>{p.phone_number}</Text>}
                      </View>
                      <Ionicons
                        name={sel ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={sel ? COLORS.wal : colors.bg3}
                      />
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}

          {/* Šablóny */}
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>ŠABLÓNY</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.templatesRow}>
            {MESSAGE_TEMPLATES.map((t) => (
              <TouchableOpacity
                key={t.label}
                style={[styles.templateChip, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}
                onPress={() => { setTitle(t.title); setBody(t.body); }}
                activeOpacity={0.8}
              >
                <Text style={styles.templateEmoji}>{t.emoji}</Text>
                <Text style={[styles.templateLabel, { color: colors.textPrimary }]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Predmet */}
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>PREDMET SPRÁVY</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.cardBg, borderColor: colors.bg3, color: colors.textPrimary }]}
            placeholder="Napr. Oznamenie o zatvorení ordinacie"
            placeholderTextColor={dark ? '#666' : '#999'}
            value={title}
            onChangeText={setTitle}
            maxLength={80}
          />
          <Text style={[styles.charCount, { color: colors.textSecondary }]}>{title.length}/80</Text>

          {/* Text správy */}
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>TEXT SPRÁVY</Text>
          <TextInput
            style={[styles.input, styles.bodyInput, { backgroundColor: colors.cardBg, borderColor: colors.bg3, color: colors.textPrimary }]}
            placeholder="Text správy pre pacientov..."
            placeholderTextColor={dark ? '#666' : '#999'}
            value={body}
            onChangeText={setBody}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            maxLength={500}
          />
          <Text style={[styles.charCount, { color: colors.textSecondary }]}>{body.length}/500</Text>

          {/* Preview */}
          {(title || body) && (
            <View style={[styles.previewBox, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <Text style={[styles.previewLabel, { color: colors.textSecondary }]}>NÁHĽAD NOTIFIKÁCIE</Text>
              <View style={[styles.previewCard, { backgroundColor: colors.bg2 }]}>
                <View style={styles.previewHeader}>
                  <Ionicons name="notifications" size={14} color={COLORS.wal} />
                  <Text style={[styles.previewApp, { color: colors.textSecondary }]}>Loderer Dental</Text>
                </View>
                {title ? <Text style={[styles.previewTitle, { color: colors.textPrimary }]} numberOfLines={1}>{title}</Text> : null}
                {body ? <Text style={[styles.previewBody, { color: colors.textSecondary }]} numberOfLines={3}>{body}</Text> : null}
              </View>
            </View>
          )}

          {/* Súhrn príjemcov */}
          <View style={[styles.recipientSummary, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Ionicons name="people-outline" size={16} color={COLORS.wal} />
            {countLoading
              ? <ActivityIndicator size="small" color={COLORS.wal} style={{ marginLeft: 4 }} />
              : <Text style={styles.recipientSummaryText}>
                  Počet príjemcov: <Text style={styles.recipientSummaryCount}>{recipientCount}</Text>
                </Text>
            }
          </View>

          {/* Naplánovať odoslanie */}
          <TouchableOpacity
            style={[styles.schedToggle, { backgroundColor: colors.bg3 }, isScheduled && [styles.schedToggleActive, { backgroundColor: dark ? '#2D2200' : '#FEF9E7' }]]}
            onPress={() => setIsScheduled(v => !v)}
            activeOpacity={0.85}
          >
            <Ionicons name={isScheduled ? 'calendar' : 'calendar-outline'} size={18} color={isScheduled ? COLORS.gold : COLORS.wal} />
            <Text style={[styles.schedToggleText, isScheduled && { color: COLORS.gold }]}>
              {isScheduled ? 'Naplánované odoslanie' : 'Odoslať neskôr (naplánovať)'}
            </Text>
          </TouchableOpacity>
          {isScheduled && (
            <View style={styles.schedRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.schedLabel, { color: colors.textSecondary }]}>DÁTUM</Text>
                <TextInput
                  style={[styles.schedInput, { backgroundColor: colors.cardBg, borderColor: colors.bg3, color: colors.textPrimary }]}
                  placeholder="RRRR-MM-DD"
                  placeholderTextColor={COLORS.sand}
                  value={schedDate}
                  onChangeText={setSchedDate}
                  keyboardType="numeric"
                  maxLength={10}
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ width: 100 }}>
                <Text style={[styles.schedLabel, { color: colors.textSecondary }]}>ČAS</Text>
                <TextInput
                  style={[styles.schedInput, { backgroundColor: colors.cardBg, borderColor: colors.bg3, color: colors.textPrimary }]}
                  placeholder="HH:MM"
                  placeholderTextColor={COLORS.sand}
                  value={schedTime}
                  onChangeText={setSchedTime}
                  keyboardType="numeric"
                  maxLength={5}
                />
              </View>
            </View>
          )}

          {/* Tlačidlo odoslať */}
          <TouchableOpacity
            style={[styles.sendBtn, (sending || recipientCount === 0) && { opacity: 0.5 }]}
            onPress={handleSend}
            disabled={sending || recipientCount === 0}
            activeOpacity={0.85}
          >
            {sending
              ? <ActivityIndicator color="#fff" size="small" />
              : <>
                  <Ionicons name="send" size={18} color="#fff" />
                  <Text style={styles.sendBtnText}>
                    Odoslať správu ({recipientCount})
                  </Text>
                </View>}
          </TouchableOpacity>

          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },
  content:{ padding: SPACING.xl, paddingTop: 16 },

  header:      { backgroundColor: COLORS.esp, paddingHorizontal: SPACING.xl, paddingTop: 14, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerSub:   { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 3 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },

  sectionLabel: { fontSize: 9, fontWeight: '800', color: COLORS.wal, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10, marginTop: 4 },

  audienceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  audienceCard: { width: '47%', padding: 12, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.bg3, gap: 6 },
  audienceIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  audienceLabel:{ fontSize: 12, fontWeight: '700', color: COLORS.esp },
  audienceDesc: { fontSize: 11, color: COLORS.wal, lineHeight: 14 },

  customSection:{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: COLORS.bg3, marginBottom: 20, overflow: 'hidden' },
  searchRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.bg3 },
  searchInput:  { flex: 1, fontSize: 13, color: COLORS.esp },
  selBadge:     { backgroundColor: COLORS.wal, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 },
  selBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  ptRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.bg3 },
  ptRowSel:     { backgroundColor: '#F4ECE4' },
  ptAvatar:     { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.bg3, alignItems: 'center', justifyContent: 'center' },
  ptAvatarText: { fontSize: 13, fontWeight: '700', color: COLORS.wal },
  ptName:       { fontSize: 13, fontWeight: '600', color: COLORS.esp },
  ptPhone:      { fontSize: 11, color: COLORS.wal, marginTop: 1 },

  templatesRow: { gap: 8, paddingBottom: 14, paddingTop: 2 },
  templateChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.bg3 },
  templateEmoji:{ fontSize: 14 },
  templateLabel:{ fontSize: 12, fontWeight: '600', color: COLORS.esp },

  input:        { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.bg3, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.esp, marginBottom: 4 },
  bodyInput:    { minHeight: 100, textAlignVertical: 'top' },
  charCount:    { fontSize: 11, color: COLORS.wal, textAlign: 'right', marginBottom: 18 },

  previewBox:   { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: COLORS.bg3, padding: 14, marginBottom: 20 },
  previewLabel: { fontSize: 9, fontWeight: '800', color: COLORS.wal, letterSpacing: 1.5, marginBottom: 10 },
  previewCard:  { backgroundColor: '#F8F8F8', borderRadius: 12, padding: 12, gap: 3 },
  previewHeader:{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  previewApp:   { fontSize: 10, fontWeight: '700', color: COLORS.wal },
  previewTitle: { fontSize: 13, fontWeight: '700', color: COLORS.esp },
  previewBody:  { fontSize: 13, color: '#555', lineHeight: 17 },

  schedToggle:       { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.bg3, borderRadius: 12, padding: 14, marginBottom: 10 },
  schedToggleActive: { backgroundColor: '#FEF9E7', borderWidth: 1, borderColor: COLORS.gold },
  schedToggleText:   { fontSize: 14, fontWeight: '600', color: COLORS.wal },
  schedRow:          { flexDirection: 'row', marginBottom: 14 },
  schedLabel:        { fontSize: 9, fontWeight: '700', color: COLORS.wal, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 },
  schedInput:        { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.bg3, borderRadius: 10, padding: 12, fontSize: 15, color: COLORS.esp, fontWeight: '600' },
  sendBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: COLORS.wal, borderRadius: 16, paddingVertical: 16, marginTop: 4 },
  sendBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  recipientSummary:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: COLORS.bg3, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
  recipientSummaryText:  { fontSize: 13, color: COLORS.wal },
  recipientSummaryCount: { fontWeight: '800', color: COLORS.esp, fontSize: 14 } });
