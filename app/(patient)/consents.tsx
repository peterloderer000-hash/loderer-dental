/**
 * Informované súhlasy — pacient
 * Zobrazenie a podpis súhlasov zaslaných doktorom
 */
import React, { useState, useCallback } from 'react';
import {
  ActivityIndicator, Alert, Modal, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../supabase';
import { COLORS, SIZES } from '../../styles/theme';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';

type Consent = {
  id: string;
  status: string;
  signed_at: string | null;
  signed_name: string | null;
  created_at: string;
  form: { title: string; content: string } | null;
};

const STATUS_CFG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  pending:  { label: 'Čaká na podpis', icon: '⏳', color: '#7D6608', bg: '#FEF9E7' },
  signed:   { label: 'Podpísaný',      icon: '✅', color: '#1E8449', bg: '#EAFAF1' },
  declined: { label: 'Odmietnutý',     icon: '❌', color: '#922B21', bg: '#FDEDEC' },
};

export default function ConsentsScreen() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  const [consents,   setConsents]   = useState<Consent[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [patientName, setPatientName] = useState('');

  // Podpis
  const [signing,    setSigning]    = useState<Consent | null>(null);
  const [signName,   setSignName]   = useState('');
  const [agreed,     setAgreed]     = useState(false);
  const [saving,     setSaving]     = useState(false);

  async function load() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
      if (prof?.full_name) setPatientName(prof.full_name);

      const { data } = await supabase
        .from('patient_consents')
        .select('id, status, signed_at, signed_name, created_at, form:consent_forms(title, content)')
        .eq('patient_id', user.id)
        .order('created_at', { ascending: false });

      setConsents((data ?? []) as unknown as Consent[]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  function openSign(c: Consent) {
    setSigning(c);
    setSignName(patientName);
    setAgreed(false);
  }

  async function handleSign() {
    if (!signing) return;
    if (!signName.trim()) { Alert.alert('Chyba', 'Zadaj svoje meno ako podpis.'); return; }
    if (!agreed) { Alert.alert('Chyba', 'Musíš potvrdiť, že si prečítal/a súhlas.'); return; }
    setSaving(true);
    const { error } = await supabase.from('patient_consents').update({
      status:      'signed',
      signed_name: signName.trim(),
      signed_at:   new Date().toISOString(),
    }).eq('id', signing.id);
    setSaving(false);
    if (error) { Alert.alert('Chyba', error.message); return; }
    setSigning(null);
    Alert.alert('Podpísané ✓', 'Súhlas bol úspešne podpísaný a odoslaný doktorovi.');
    load();
  }

  async function handleDecline() {
    if (!signing) return;
    Alert.alert('Odmietnuť súhlas', 'Naozaj chceš odmietnuť tento súhlas?', [
      { text: 'Nie', style: 'cancel' },
      { text: 'Áno, odmietnuť', style: 'destructive', onPress: async () => {
        await supabase.from('patient_consents').update({ status: 'declined' }).eq('id', signing.id);
        setSigning(null);
        load();
      }},
    ]);
  }

  const pending = consents.filter(c => c.status === 'pending');
  const done    = consents.filter(c => c.status !== 'pending');

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
            <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerSub}>DOKUMENTY</Text>
            <Text style={styles.headerTitle}>Informované súhlasy</Text>
          </View>
        </View>
        <View style={{ flex: 1, backgroundColor: colors.bg2, padding: SIZES.padding, paddingTop: 16 }}>
          <SkeletonList count={4} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Hlavička ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerSub}>DOKUMENTY</Text>
          <Text style={styles.headerTitle}>Informované súhlasy</Text>
        </View>
        {pending.length > 0 && (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>{pending.length} čaká</Text>
          </View>
        )}
      </View>

      <ScrollView style={[styles.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.wal} />}>

        {/* ── Čakajúce ── */}
        {pending.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Ionicons name="alert-circle" size={14} color="#7D6608" />
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>VYŽADUJE PODPIS</Text>
            </View>
            {pending.map(c => (
              <View key={c.id} style={[styles.card, styles.cardPending, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardIcon}>📋</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                      {(c.form as any)?.title ?? 'Súhlas'}
                    </Text>
                    <Text style={[styles.cardDate, { color: colors.textSecondary }]}>
                      Doručené: {new Date(c.created_at).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' })}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: '#FEF9E7' }]}>
                    <Text style={[styles.statusBadgeText, { color: '#7D6608' }]}>⏳ Čaká</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.signBtn} onPress={() => openSign(c)} activeOpacity={0.85}>
                  <Ionicons name="pencil-outline" size={15} color="#fff" />
                  <Text style={styles.signBtnText}>Prečítať a podpísať</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        {/* ── Dokončené ── */}
        {done.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Ionicons name="checkmark-circle-outline" size={14} color={COLORS.wal} />
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>HISTÓRIA</Text>
            </View>
            {done.map(c => {
              const st = STATUS_CFG[c.status] ?? STATUS_CFG.signed;
              return (
                <View key={c.id} style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardIcon}>{st.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        {(c.form as any)?.title ?? 'Súhlas'}
                      </Text>
                      {c.signed_at && (
                        <Text style={[styles.cardDate, { color: colors.textSecondary }]}>
                          {c.status === 'signed' ? 'Podpísané' : 'Odmietnuté'}:{' '}
                          {new Date(c.signed_at).toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </Text>
                      )}
                      {c.signed_name && (
                        <Text style={styles.signedName}>✍️ {c.signed_name}</Text>
                      )}
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: st.color }]}>{st.label}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {consents.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📄</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Žiadne súhlasy</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Doktor ti zašle súhlas pred zákrokom na podpis.</Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Modal: Podpis ── */}
      <Modal visible={!!signing} animationType="slide" transparent onRequestClose={() => setSigning(null)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={{ flex: 0.2 }} activeOpacity={1} onPress={() => setSigning(null)} />
          <View style={[styles.sheet, { maxHeight: '85%', backgroundColor: colors.cardBg }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.bg3 }]} />
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>Informovaný súhlas</Text>
            <Text style={[styles.sheetSubtitle, { color: colors.textSecondary }]}>{(signing?.form as any)?.title}</Text>

            {/* Text súhlasu */}
            <ScrollView style={[styles.consentTextBox, { backgroundColor: colors.bg2, borderColor: colors.bg3 }]} showsVerticalScrollIndicator>
              <Text style={[styles.consentText, { color: colors.textPrimary }]}>{(signing?.form as any)?.content}</Text>
            </ScrollView>

            {/* Checkbox */}
            <TouchableOpacity style={styles.checkRow} onPress={() => setAgreed(v => !v)} activeOpacity={0.8}>
              <View style={[styles.checkbox, { borderColor: colors.bg3 }, agreed && styles.checkboxChecked]}>
                {agreed && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              <Text style={[styles.checkLabel, { color: colors.textPrimary }]}>
                Prečítal/a som si súhlas a rozumiem jeho obsahu
              </Text>
            </TouchableOpacity>

            {/* Podpis — meno */}
            <Text style={[styles.signLabel, { color: colors.textSecondary }]}>PODPIS — ZADAJ CELÉ MENO</Text>
            <TextInput style={[styles.signInput, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]} value={signName} onChangeText={setSignName}
              placeholder="Meno a priezvisko" placeholderTextColor={dark ? '#666' : '#999'}
              autoCapitalize="words" />

            {/* Akcie */}
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.declineBtn} onPress={handleDecline} activeOpacity={0.8}>
                <Text style={styles.declineBtnText}>Odmietnuť</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, (saving || !agreed || !signName.trim()) && { opacity: 0.5 }]}
                onPress={handleSign} disabled={saving || !agreed || !signName.trim()} activeOpacity={0.85}>
                {saving ? <ActivityIndicator color="#fff" size="small" />
                  : <><Ionicons name="pencil-outline" size={15} color="#fff" />
                      <Text style={styles.confirmBtnText}>Podpísať</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },
  content:{ padding: SIZES.padding, paddingTop: 14 },
  center: { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center' },

  header:       { backgroundColor: COLORS.esp, paddingHorizontal: SIZES.padding, paddingTop: 14, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerSub:    { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  headerTitle:  { fontSize: 18, fontWeight: '700', color: '#fff' },
  pendingBadge: { backgroundColor: '#E67E22', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  pendingBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: 4 },
  sectionTitle:  { fontSize: 9, letterSpacing: 2, fontWeight: '700', color: COLORS.wal, textTransform: 'uppercase' },

  card:        { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.bg3 },
  cardPending: { borderColor: '#F9E79F', borderWidth: 1.5 },
  cardTop:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  cardIcon:    { fontSize: 22, marginTop: 2 },
  cardTitle:   { fontSize: 14, fontWeight: '700', color: COLORS.esp, marginBottom: 3, lineHeight: 20 },
  cardDate:    { fontSize: 11, color: COLORS.wal },
  signedName:  { fontSize: 11, color: '#1E8449', marginTop: 2, fontStyle: 'italic' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  statusBadgeText: { fontSize: 9, fontWeight: '700' },

  signBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.wal, borderRadius: 10, paddingVertical: 11 },
  signBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  empty:      { alignItems: 'center', paddingVertical: 60 },
  emptyIcon:  { fontSize: 46, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.esp, marginBottom: 6 },
  emptySub:   { fontSize: 13, color: COLORS.wal, textAlign: 'center' },

  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:       { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 44 },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: COLORS.bg3, alignSelf: 'center', marginBottom: 18 },
  sheetTitle:  { fontSize: 20, fontWeight: '800', color: COLORS.esp, marginBottom: 4 },
  sheetSubtitle: { fontSize: 13, color: COLORS.wal, marginBottom: 14 },

  consentTextBox: { maxHeight: 200, backgroundColor: COLORS.bg2, borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: COLORS.bg3 },
  consentText:    { fontSize: 13, color: COLORS.esp, lineHeight: 21 },

  checkRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  checkbox:      { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: COLORS.bg3, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxChecked:{ backgroundColor: COLORS.wal, borderColor: COLORS.wal },
  checkLabel:    { flex: 1, fontSize: 13, color: COLORS.esp, lineHeight: 20 },

  signLabel: { fontSize: 9, letterSpacing: 1.5, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 },
  signInput: { borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: COLORS.esp, backgroundColor: COLORS.bg2, marginBottom: 16 },

  sheetActions: { flexDirection: 'row', gap: 10 },
  declineBtn:   { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', borderWidth: 1.5, borderColor: '#F1948A', backgroundColor: '#FDEDEC' },
  declineBtnText:{ fontSize: 13, fontWeight: '600', color: '#922B21' },
  confirmBtn:   { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 12, backgroundColor: COLORS.wal },
  confirmBtnText:{ fontSize: 14, fontWeight: '700', color: '#fff' },
});
