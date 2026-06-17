import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal,
  Platform, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { SkeletonList } from '../../components/Skeleton';
import { AnimatedListItem } from '../../components/ui/AnimatedListItem';
import { useAppTheme } from '../../context/ThemeContext';

// ─── Typy ─────────────────────────────────────────────────────────────────────
interface RecallPatient {
  id: string;
  full_name: string;
  phone_number: string | null;
  lastVisit: Date | null;
  monthsAbsent: number;
  visitCount: number;
}

type RecallFilter = 'all' | '6-12' | '12-24' | '24+';

const FILTER_LABELS: Record<RecallFilter, string> = {
  all:    'Všetci',
  '6-12': '6–12 mes.',
  '12-24':'1–2 roky',
  '24+':  '2+ roky'
};

// ─── Urgentnosť ───────────────────────────────────────────────────────────────
function getUrgency(months: number, dark: boolean) {
  if (months >= 24) return {
    dot: '#E74C3C', color: '#922B21',
    bg: dark ? '#4A1010' : '#FDEDEC',
    border: dark ? '#C0392B33' : '#F5B7B1',
    emoji: '🔴'
  };
  if (months >= 12) return {
    dot: '#F39C12', color: '#7D6608',
    bg: dark ? '#2D2200' : '#FEF9E7',
    border: dark ? '#E67E2233' : '#F9E79F',
    emoji: '🟡'
  };
  return {
    dot: '#2ECC71', color: '#1E8449',
    bg: dark ? '#0D3B1F' : '#EAFAF1',
    border: dark ? '#27AE6033' : '#A9DFBF',
    emoji: '🟢'
  };
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtAbsLabel(months: number): string {
  if (months >= 999) return 'Nikdy';
  if (months >= 24) {
    const yrs = Math.floor(months / 12);
    return `${yrs} ${yrs === 1 ? 'rok' : yrs < 5 ? 'roky' : 'rokov'}`;
  }
  return `${months} mes.`;
}

// ─── Hlavná obrazovka ─────────────────────────────────────────────────────────
export default function RecallScreen() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();

  const [patients,       setPatients]       = useState<RecallPatient[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [filter,         setFilter]         = useState<RecallFilter>('all');
  const [selected,       setSelected]       = useState<Set<string>>(new Set());
  const [recallMsgCount, setRecallMsgCount] = useState(0);
  const [showBulkModal,  setShowBulkModal]  = useState(false);
  const [bulkMsg,        setBulkMsg]        = useState('Dobrý deň {meno}, pripomíname, že je čas na preventívnu zubársku prehliadku. Rezervujte si termín priamo v aplikácii. Tešíme sa na vás!');
  const [sending,        setSending]        = useState(false);
  const [doctorId,       setDoctorId]       = useState('');

  // ── Načítanie ───────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setDoctorId(user.id);

    const now          = new Date();
    const monthStart   = new Date(now.getFullYear(), now.getMonth(), 1);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(now.getMonth() - 6);

    const [{ data: profiles }, { data: msgData }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, phone_number, appointments(appointment_date, status)')
        .eq('role', 'patient'),
      supabase
        .from('staff_messages')
        .select('id')
        .or('body.ilike.%recall%,body.ilike.%návšteva%')
        .gte('created_at', monthStart.toISOString()),
    ]);

    setRecallMsgCount(msgData?.length ?? 0);

    const list: RecallPatient[] = [];
    (profiles ?? []).forEach((profile: any) => {
      const apps = profile.appointments ?? [];

      const hasFuture = apps.some(
        (a: any) => a.status === 'scheduled' && new Date(a.appointment_date) > now,
      );
      if (hasFuture) return;

      const completed  = apps.filter((a: any) => a.status === 'completed');
      const visitCount = completed.length;

      if (visitCount === 0) {
        list.push({
          id: profile.id, full_name: profile.full_name ?? 'Neznáme meno',
          phone_number: profile.phone_number ?? null,
          lastVisit: null, monthsAbsent: 999, visitCount: 0
        });
        return;
      }

      const sorted = [...completed].sort(
        (a: any, b: any) => new Date(b.appointment_date).getTime() - new Date(a.appointment_date).getTime(),
      );
      const lastVisitDate = new Date(sorted[0].appointment_date);

      if (lastVisitDate < sixMonthsAgo) {
        const months = Math.floor(
          Math.abs(now.getTime() - lastVisitDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44),
        );
        list.push({
          id: profile.id, full_name: profile.full_name ?? 'Neznáme meno',
          phone_number: profile.phone_number ?? null,
          lastVisit: lastVisitDate, monthsAbsent: months, visitCount
        });
      }
    });

    list.sort((a, b) => b.monthsAbsent - a.monthsAbsent);
    setPatients(list);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ── Filtrovanie ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (filter === 'all')   return patients;
    if (filter === '6-12')  return patients.filter(p => p.monthsAbsent >= 6  && p.monthsAbsent < 12);
    if (filter === '12-24') return patients.filter(p => p.monthsAbsent >= 12 && p.monthsAbsent < 24);
    return patients.filter(p => p.monthsAbsent >= 24);
  }, [patients, filter]);

  const counts = useMemo(() => ({
    all:    patients.length,
    '6-12': patients.filter(p => p.monthsAbsent >= 6  && p.monthsAbsent < 12).length,
    '12-24':patients.filter(p => p.monthsAbsent >= 12 && p.monthsAbsent < 24).length,
    '24+':  patients.filter(p => p.monthsAbsent >= 24).length
  }), [patients]);

  const avgAbsence = useMemo(() => {
    const real = patients.filter(p => p.monthsAbsent < 999);
    if (!real.length) return 0;
    return Math.round(real.reduce((s, p) => s + p.monthsAbsent, 0) / real.length);
  }, [patients]);

  // ── Výber ───────────────────────────────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length && filtered.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(p => p.id)));
    }
  }

  // ── Personalizované odoslanie jednému pacientovi ────────────────────────────
  async function handleSendOne(patient: RecallPatient) {
    setSending(true);
    try {
      const firstName = patient.full_name.split(' ')[0];
      const absText   = fmtAbsLabel(patient.monthsAbsent);
      await supabase.from('notifications').insert({
        user_id: patient.id,
        title:   '🦷 Čas na preventívnu prehliadku',
        body:    `Dobrý deň ${firstName}, od vašej poslednej návštevy uplynulo ${absText}. Odporúčame preventívnu prehliadku. Rezervujte si termín priamo v aplikácii.`,
        type:    'info'
      });
      Alert.alert('Odoslané ✓', `Recall správa odoslaná pre ${patient.full_name}.`);
    } catch (e: any) {
      Alert.alert('Chyba', e?.message ?? 'Nepodarilo sa odoslať.');
    } finally {
      setSending(false);
    }
  }

  // ── Hromadné odoslanie ──────────────────────────────────────────────────────
  async function handleBulkSend() {
    if (!bulkMsg.trim() || selected.size === 0) return;
    setSending(true);
    try {
      const targets = patients.filter(p => selected.has(p.id));

      await Promise.all(targets.map(p => {
        const firstName = p.full_name.split(' ')[0];
        const personalMsg = bulkMsg.trim().replace('{meno}', firstName);
        return supabase.from('notifications').insert({
          user_id: p.id,
          title:   '🦷 Vaša zubná ambulancia — Recall',
          body:    personalMsg,
          type:    'info'
        });
      }));

      await supabase.from('staff_messages').insert({
        sender_id: doctorId,
        body:      `[recall] ${bulkMsg.trim()} (${targets.length} pacientov)`
      });

      setShowBulkModal(false);
      setBulkMsg('');
      setSelected(new Set());
      setRecallMsgCount(c => c + 1);
      Alert.alert('Odoslané ✓', `Recall správa odoslaná ${targets.length} ${targets.length === 1 ? 'pacientovi' : 'pacientom'}.`);
    } catch (e: any) {
      Alert.alert('Chyba', e?.message ?? 'Nepodarilo sa odoslať správu.');
    } finally {
      setSending(false);
    }
  }

  // ── Karta pacienta ──────────────────────────────────────────────────────────
  function renderItem({ item, index: _aidx }: { item: RecallPatient; index: number }) {
    const urg   = getUrgency(item.monthsAbsent, dark);
    const isSel = selected.has(item.id);

    return (
      <AnimatedListItem index={_aidx}>
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.cardBg, borderColor: isSel ? COLORS.wal : colors.bg3 },
          isSel && { borderWidth: 2 }]}
        onPress={() => toggleSelect(item.id)}
        activeOpacity={0.8}
      >
        {/* Farebná lišta urgentnosti */}
        <View style={[styles.urgBar, { backgroundColor: urg.dot }]} />

        <View style={{ flex: 1, paddingLeft: 12 }}>
          {/* Meno + checkbox */}
          <View style={styles.cardTopRow}>
            <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
              {item.full_name}
            </Text>
            <View style={[styles.checkbox,
              { borderColor: isSel ? COLORS.wal : colors.bg3 },
              isSel && { backgroundColor: COLORS.wal }]}>
              {isSel && <Ionicons name="checkmark" size={12} color="#fff" />}
            </View>
          </View>

          {item.phone_number ? (
            <Text style={[styles.phone, { color: colors.textSecondary }]}>{item.phone_number}</Text>
          ) : null}

          {/* Badge urgentnosti + počet návštev */}
          <View style={styles.metaRow}>
            <View style={[styles.urgBadge, { backgroundColor: urg.bg, borderColor: urg.border }]}>
              <Text style={[styles.urgText, { color: urg.color }]}>
                {urg.emoji} {fmtAbsLabel(item.monthsAbsent)}
              </Text>
            </View>
            <Text style={[styles.visitCount, { color: colors.textSecondary }]}>
              <Ionicons name="calendar-outline" size={11} /> {item.visitCount}× návštev
            </Text>
          </View>

          {/* Posledná návšteva — konkrétny dátum */}
          <Text style={[styles.lastVisitRow, { color: colors.textSecondary }]}>
            Posledná návšteva:{' '}
            <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>
              {item.lastVisit ? fmtDate(item.lastVisit) : '—'}
            </Text>
          </Text>

          {/* Akcie */}
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={[styles.cardBtn, { backgroundColor: urg.bg, borderColor: urg.border }]}
              onPress={() => { if (!sending) handleSendOne(item); }}
              activeOpacity={0.8}
            >
              <Ionicons name="send-outline" size={13} color={urg.color} />
              <Text style={[styles.cardBtnText, { color: urg.color }]}>Odoslať recall</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cardBtn, { backgroundColor: colors.bg2, borderColor: colors.bg3 }]}
              onPress={() => router.push({ pathname: '/(doctor)/add-appointment', params: { patientId: item.id } })}
              activeOpacity={0.8}
            >
              <Ionicons name="calendar-outline" size={13} color={colors.textSecondary} />
              <Text style={[styles.cardBtnText, { color: colors.textSecondary }]}>Rezervovať</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
      </AnimatedListItem>
    );
  }

  if (loading) return (
    <View style={styles.safe}>
      <HeroHeader
        title="Recall pacientov"
        subtitle="Pacienti"
        icon="notifications-outline"
        onBack={() => router.back()}
      />
      <View style={{ flex: 1, padding: SPACING.xl, backgroundColor: colors.bg2 }}>
        <SkeletonList count={5} />
      </View>
    </View>
  );

  const allSelected = selected.size === filtered.length && filtered.length > 0;

  return (
    <View style={styles.safe}>
      <HeroHeader
        title="Recall pacientov"
        subtitle="Pacienti"
        icon="notifications-outline"
        onBack={() => router.back()}
        rightAction={
          patients.length > 0 ? (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{patients.length}</Text>
            </View>
          ) : undefined
        }
      />

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        style={[styles.list, { backgroundColor: colors.bg2 }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={COLORS.gold}
            colors={[COLORS.gold]}
          />
        }
        ListHeaderComponent={
          <>
            {/* ── Štatistiky ── */}
            <View style={[styles.statsCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <View style={styles.statBox}>
                <Text style={[styles.statNum, { color: colors.textPrimary }]}>{patients.length}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Recall pacienti</Text>
              </View>
              <View style={[styles.statDiv, { backgroundColor: colors.bg3 }]} />
              <View style={styles.statBox}>
                <Text style={[styles.statNum, { color: colors.textPrimary }]}>{avgAbsence} mes.</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Priem. absencia</Text>
              </View>
              <View style={[styles.statDiv, { backgroundColor: colors.bg3 }]} />
              <View style={styles.statBox}>
                <Text style={[styles.statNum, { color: colors.textPrimary }]}>{recallMsgCount}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Správ tento mes.</Text>
              </View>
            </View>

            {/* ── Filtre ── */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
              {(Object.keys(FILTER_LABELS) as RecallFilter[]).map(f => {
                const active = filter === f;
                return (
                  <TouchableOpacity key={f}
                    style={[styles.filterTab,
                      { backgroundColor: colors.cardBg, borderColor: colors.bg3 },
                      active && { backgroundColor: COLORS.esp, borderColor: COLORS.esp }]}
                    onPress={() => { setFilter(f); setSelected(new Set()); }}
                    activeOpacity={0.8}>
                    <Text style={[styles.filterTabText, { color: colors.textSecondary },
                      active && { color: '#fff' }]}>
                      {FILTER_LABELS[f]}
                    </Text>
                    <View style={[styles.filterBadge,
                      { backgroundColor: active ? 'rgba(255,255,255,0.22)' : colors.bg3 }]}>
                      <Text style={[styles.filterBadgeText, { color: active ? '#fff' : colors.textSecondary }]}>
                        {counts[f]}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* ── Panel výberu ── */}
            {filtered.length > 0 && (
              <View style={[styles.selectBar, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <TouchableOpacity style={styles.selectAllBtn} onPress={toggleSelectAll} activeOpacity={0.8}>
                  <View style={[styles.checkbox,
                    { borderColor: allSelected ? COLORS.wal : colors.bg3 },
                    allSelected && { backgroundColor: COLORS.wal }]}>
                    {allSelected && <Ionicons name="checkmark" size={12} color="#fff" />}
                  </View>
                  <Text style={[styles.selectAllText, { color: colors.textSecondary }]}>
                    {allSelected ? 'Zrušiť výber' : 'Vybrať všetkých'}
                    {selected.size > 0 && !allSelected ? ` (${selected.size})` : ''}
                  </Text>
                </TouchableOpacity>

                {selected.size > 0 && (
                  <TouchableOpacity
                    style={styles.bulkSendBtn}
                    onPress={() => {
                      setBulkMsg('Dobrý deň, radi by sme vás pozvali na preventívnu prehliadku. Kontaktujte nás pre dohodnutie termínu.');
                      setShowBulkModal(true);
                    }}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="send-outline" size={14} color="#fff" />
                    <Text style={styles.bulkSendText}>Poslať všetkým vybraným ({selected.size})</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyEmoji}>✅</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Výborné!</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              {filter === 'all'
                ? 'Žiadni pacienti nevyžadujú recall.'
                : `Žiadni pacienti v kategórii „${FILTER_LABELS[filter]}".`}
            </Text>
          </View>
        }
      />

      {/* ── Bulk send modál ── */}
      <Modal visible={showBulkModal} transparent animationType="slide"
        onRequestClose={() => setShowBulkModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <TouchableOpacity style={{ flex: 0.25 }} activeOpacity={1} onPress={() => setShowBulkModal(false)} />
            <View style={[styles.modalSheet, { backgroundColor: colors.cardBg }]}>
              <View style={[styles.modalHandle, { backgroundColor: colors.bg3 }]} />
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Hromadná recall správa</Text>
              <Text style={[styles.modalSub, { color: colors.textSecondary }]}>
                Správa bude odoslaná {selected.size} {selected.size === 1 ? 'pacientovi' : 'pacientom'} ako in-app notifikácia.
              </Text>

              <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>TEXT SPRÁVY</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
                value={bulkMsg}
                onChangeText={setBulkMsg}
                placeholder="Napíšte správu pre pacientov..."
                placeholderTextColor={dark ? '#555' : '#bbb'}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                autoFocus
              />

              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={[styles.modalBtnCancel, { borderColor: colors.bg3 }]}
                  onPress={() => setShowBulkModal(false)} activeOpacity={0.8}>
                  <Text style={[styles.modalBtnCancelText, { color: colors.textSecondary }]}>Zrušiť</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtnSend, (sending || !bulkMsg.trim()) && { opacity: 0.5 }]}
                  onPress={handleBulkSend}
                  disabled={sending || !bulkMsg.trim()}
                  activeOpacity={0.85}>
                  {sending
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <><Ionicons name="send-outline" size={15} color="#fff" />
                        <Text style={styles.modalBtnSendText}>Odoslať všetkým</Text></>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: COLORS.esp },
  list:    { flex: 1 },
  content: { padding: SPACING.xl, paddingBottom: 100, flexGrow: 1 },

  // Header
  header:      { backgroundColor: COLORS.esp, paddingHorizontal: SPACING.xl, paddingTop: 14, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerSub:   { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  headerTitle: { fontSize: 19, fontWeight: '700', color: '#fff' },
  countBadge:  { backgroundColor: COLORS.gold, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  countText:   { fontSize: 13, fontWeight: '800', color: COLORS.esp },

  // Štatistiky
  statsCard: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12 },
  statBox:   { flex: 1, alignItems: 'center' },
  statNum:   { fontSize: 20, fontWeight: '800', lineHeight: 24, marginBottom: 2 },
  statLabel: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
  statDiv:   { width: 1, marginHorizontal: 8, borderRadius: 1 },

  // Filtre
  filterScroll:      { maxHeight: 48, marginBottom: 10 },
  filterContent:     { gap: 8, alignItems: 'center', paddingRight: 4 },
  filterTab:         { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  filterTabText:     { fontSize: 12, fontWeight: '600' },
  filterBadge:       { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 },
  filterBadgeText:   { fontSize: 11, fontWeight: '700' },

  // Výber
  selectBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, borderWidth: 1, padding: 10, marginBottom: 12, gap: 8 },
  selectAllBtn:  { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  selectAllText: { fontSize: 12, fontWeight: '600' },
  checkbox:      { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  bulkSendBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.esp, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  bulkSendText:  { fontSize: 11, fontWeight: '700', color: '#fff' },

  // Karta
  card:        { flexDirection: 'row', borderRadius: 12, borderWidth: 1, marginBottom: 10, overflow: 'hidden', elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
  urgBar:      { width: 5, minHeight: '100%' },
  cardTopRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, paddingTop: 12, paddingRight: 12 },
  name:        { fontSize: 15, fontWeight: '800', flex: 1, marginRight: 8 },
  phone:       { fontSize: 13, marginBottom: 8 },
  metaRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  urgBadge:    { flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  urgText:     { fontSize: 12, fontWeight: '700' },
  visitCount:  { fontSize: 12, fontWeight: '500' },
  lastVisitRow:{ fontSize: 12, marginBottom: 8 },
  cardActions: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  cardBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  cardBtnText: { fontSize: 12, fontFamily: 'DMSans_500Medium' },

  // Empty
  emptyWrap:  { alignItems: 'center', paddingTop: 60, paddingHorizontal: 20 },
  emptyEmoji: { fontSize: 52, marginBottom: 14 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptySub:   { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  // Modál
  modalOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet:         { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 36 },
  modalHandle:        { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  modalTitle:         { fontSize: 20, fontWeight: '700', marginBottom: 6 },
  modalSub:           { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  modalLabel:         { fontSize: 9, letterSpacing: 1.5, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  modalInput:         { borderWidth: 1.5, borderRadius: 12, padding: 14, fontSize: 14, minHeight: 110, textAlignVertical: 'top', marginBottom: 16 },
  modalBtnRow:        { flexDirection: 'row', gap: 10 },
  modalBtnCancel:     { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1.5 },
  modalBtnCancelText: { fontSize: 14, fontWeight: '600' },
  modalBtnSend:       { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: COLORS.esp },
  modalBtnSendText:   { fontSize: 14, fontWeight: '700', color: '#fff' }
});
