import React, { useState, useMemo, useCallback } from 'react';
import {
  Alert, Image, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { usePatients, Patient } from '../../hooks/usePatients';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { ScreenWrapper } from '../../components/ScreenWrapper';
import { useAppTheme } from '../../context/ThemeContext';

type WaitingEntry = {
  id: string;
  patient_id: string;
  patientName: string;
  service_id: string | null;
  serviceName: string | null;
  serviceEmoji: string | null;
  preferred_date: string | null;
  notes: string | null;
  status: string;
  created_at: string;
};

// ─── Avatar (foto alebo iniciály) ────────────────────────────────────────────
function Avatar({ name, avatarUrl }: { name: string | null; avatarUrl: string | null }) {
  const initials = (name ?? '?')
    .trim()
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Deterministická farba podľa prvého písmena
  const PALETTE = [
    '#1A5276', '#2E7D5E', '#6C3483', '#922B21',
    '#9A7D0A', '#1A5276', '#17A589', '#784212',
  ];
  const color = PALETTE[(initials.charCodeAt(0) ?? 0) % PALETTE.length];

  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={[styles.avatar, { borderColor: color + '55' }]}
      />
    );
  }

  return (
    <View style={[styles.avatar, { backgroundColor: color + '22', borderColor: color + '55' }]}>
      <Text style={[styles.avatarText, { color }]}>{initials}</Text>
    </View>
  );
}

// ─── Jedna karta pacienta ─────────────────────────────────────────────────────
const PatientCard = React.memo(function PatientCard({ patient, onDetail, onChart, onPassport, onBook }: {
  patient: Patient;
  onDetail:  () => void;
  onChart:   () => void;
  onPassport: () => void;
  onBook:    () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <TouchableOpacity style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]} onPress={onDetail} activeOpacity={0.88}>
      <View style={styles.cardTop}>
        <Avatar name={patient.full_name} avatarUrl={patient.avatar_url} />

        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.patientName, { color: colors.textPrimary }]} numberOfLines={1}>
            {patient.full_name ?? 'Neznámy pacient'}
          </Text>
          {patient.phone_number ? (
            <View style={styles.infoRow}>
              <Ionicons name="call-outline" size={11} color={COLORS.wal} />
              <Text style={styles.infoText}>{patient.phone_number}</Text>
            </View>
          ) : (
            <Text style={styles.infoMuted}>Bez telefónu</Text>
          )}
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={11} color={COLORS.wal} />
            <Text style={styles.infoText}>
              {patient.appointment_count > 0
                ? `${patient.appointment_count} termín${patient.appointment_count === 1 ? '' : patient.appointment_count < 5 ? 'y' : 'ov'}`
                : 'Bez termínov'}
            </Text>
            {patient.recall_needed && (
              <View style={styles.recallChip}>
                <Text style={styles.recallChipText}>Recall</Text>
              </View>
            )}
          </View>
        </View>

        {/* Zdravotný pas badge */}
        <View style={[styles.passportBadge,
          patient.has_passport ? styles.passportBadgeOk : styles.passportBadgeMissing]}>
          <Text style={styles.passportBadgeText}>
            {patient.has_passport ? '✓ Anamnéza' : '! Bez anamnézy'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color={COLORS.bg3} style={{ marginLeft: 4 }} />
      </View>

      {/* Akcie */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.btnChart} onPress={onChart} activeOpacity={0.8}>
          <Ionicons name="clipboard-outline" size={14} color={COLORS.wal} />
          <Text style={styles.btnChartText}>Zubná karta</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnPassport} onPress={onPassport} activeOpacity={0.8}>
          <Ionicons name="document-text-outline" size={14} color="#1A5276" />
          <Text style={styles.btnPassportText}>Anamnéza</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.btnBook} onPress={onBook} activeOpacity={0.8}>
        <Ionicons name="calendar-outline" size={14} color="#fff" />
        <Text style={styles.btnBookText}>Rezervovať termín</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

// ─── Hlavná obrazovka ─────────────────────────────────────────────────────────
type PatientFilter = 'all' | 'recall' | 'no_passport' | 'with_passport';
type PatientSort   = 'name_asc' | 'name_desc' | 'last_visit' | 'appt_count' | 'recall_first' | 'birthday';

const SORT_LABELS: Record<PatientSort, string> = {
  name_asc:    'Meno A–Z',
  name_desc:   'Meno Z–A',
  last_visit:  'Posledná návšteva',
  appt_count:  'Počet termínov',
  recall_first:'Recall prvý',
  birthday:    '🎂 Najbližšie narodeniny'
};

export default function PatientsScreen() {
  const router  = useRouter();
  const { colors, dark } = useAppTheme();
  const { patients, loading, refetch } = usePatients();
  const [query, setQuery]             = useState('');
  const [activeFilter, setActiveFilter] = useState<PatientFilter>('all');
  const [sortBy,  setSortBy]  = useState<PatientSort>('name_asc');
  const [showSort, setShowSort] = useState(false);
  const [waitingList, setWaitingList] = useState<WaitingEntry[]>([]);
  const [refreshing, setRefreshing]   = useState(false);

  const loadWaitingList = useCallback(async () => {
    const { data } = await supabase
      .from('waiting_list')
      .select('id, patient_id, service_id, preferred_date, notes, status, created_at, service:services(name, emoji), patient:profiles!waiting_list_patient_id_fkey(full_name)')
      .eq('status', 'waiting')
      .order('created_at', { ascending: true });

    setWaitingList((data ?? []).map((r: any) => ({
      id:             r.id,
      patient_id:     r.patient_id,
      patientName:    r.patient?.full_name ?? 'Pacient',
      service_id:     r.service_id ?? null,
      serviceName:    r.service?.name ?? null,
      serviceEmoji:   r.service?.emoji ?? null,
      preferred_date: r.preferred_date,
      notes:          r.notes,
      status:         r.status,
      created_at:     r.created_at
    })));
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetch(), loadWaitingList()]);
    setRefreshing(false);
  }, [refetch, loadWaitingList]);

  useFocusEffect(React.useCallback(() => {
    refetch();
    loadWaitingList();
  }, [refetch, loadWaitingList]));

  async function handleContactWaiting(entry: WaitingEntry) {
    Alert.alert(
      'Kontaktovať pacienta',
      `Označiť ${entry.patientName} ako kontaktovaného a odstrániť z čakacej listiny?`,
      [
        { text: 'Nie', style: 'cancel' },
        { text: 'Áno', onPress: async () => {
          await supabase.from('waiting_list').update({ status: 'contacted' }).eq('id', entry.id);
          setWaitingList((prev) => prev.filter((e) => e.id !== entry.id));
        }},
      ]
    );
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = [...patients];
    if (q) {
      result = result.filter((p) =>
        (p.full_name    ?? '').toLowerCase().includes(q) ||
        (p.phone_number ?? '').toLowerCase().includes(q)
      );
    }
    if (activeFilter === 'recall')       result = result.filter((p) => p.recall_needed);
    if (activeFilter === 'no_passport')  result = result.filter((p) => !p.has_passport);
    if (activeFilter === 'with_passport')result = result.filter((p) => p.has_passport);

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'name_asc':   return (a.full_name ?? '').localeCompare(b.full_name ?? '', 'sk');
        case 'name_desc':  return (b.full_name ?? '').localeCompare(a.full_name ?? '', 'sk');
        case 'last_visit': {
          if (!a.last_appointment_date && !b.last_appointment_date) return 0;
          if (!a.last_appointment_date) return 1;
          if (!b.last_appointment_date) return -1;
          return new Date(b.last_appointment_date).getTime() - new Date(a.last_appointment_date).getTime();
        }
        case 'appt_count': return b.appointment_count - a.appointment_count;
        case 'recall_first': {
          if (a.recall_needed && !b.recall_needed) return -1;
          if (!a.recall_needed && b.recall_needed) return 1;
          return (a.full_name ?? '').localeCompare(b.full_name ?? '', 'sk');
        }
        case 'birthday': {
          if (a.days_until_birthday === null && b.days_until_birthday === null) return 0;
          if (a.days_until_birthday === null) return 1;
          if (b.days_until_birthday === null) return -1;
          return a.days_until_birthday - b.days_until_birthday;
        }
        default: return 0;
      }
    });
    return result;
  }, [patients, query, activeFilter, sortBy]);

  const totalCount     = patients.length;
  const passportCount  = patients.filter((p) => p.has_passport).length;
  const missingCount   = totalCount - passportCount;
  const recallCount    = patients.filter((p) => p.recall_needed).length;

  return (
    <ScreenWrapper>
    <View style={styles.safe}>

      <HeroHeader
        title="Pacienti"
        subtitle="Správa"
        icon="people-outline"
        rightAction={
          <View style={styles.countBadge}>
            <Text style={styles.countNum}>{totalCount}</Text>
            <Text style={styles.countLabel}>spolu</Text>
          </View>
        }
      />

      {/* ── Vyhľadávací bar ── */}
      <View style={[styles.searchWrap, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
        <Ionicons name="search-outline" size={18} color={COLORS.wal} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder="Hľadaj podľa mena alebo telefónu..."
          placeholderTextColor={dark ? '#666' : '#999'}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color="#bbb" />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.sortBtn, showSort && styles.sortBtnActive]}
          onPress={() => setShowSort(p => !p)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name="swap-vertical-outline" size={18} color={showSort ? '#F5F6F8' : COLORS.wal} />
        </TouchableOpacity>
      </View>

      {/* ── Sort picker ── */}
      {showSort && (
        <View style={[styles.sortPanel, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
          {(Object.entries(SORT_LABELS) as [PatientSort, string][]).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[styles.sortOption, { borderBottomColor: colors.bg3 }, sortBy === key && styles.sortOptionActive]}
              onPress={() => { setSortBy(key); setShowSort(false); }}
              activeOpacity={0.8}
            >
              {sortBy === key && <Ionicons name="checkmark" size={14} color={COLORS.wal} />}
              <Text style={[styles.sortOptionText, { color: colors.textPrimary }, sortBy === key && styles.sortOptionTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Štatistiky ── */}
      {!loading && query.length === 0 && (
        <View style={styles.statsRow}>
          <View style={[styles.statChip, { backgroundColor: '#EDF7F3', borderColor: '#A3D4BE' }]}>
            <Text style={[styles.statNum, { color: '#2E7D5E' }]}>{passportCount}</Text>
            <Text style={[styles.statLbl, { color: '#2E7D5E' }]}>S anamnézou</Text>
          </View>
          <View style={[styles.statChip, { backgroundColor: '#FDF3E7', borderColor: '#D0D4DC' }]}>
            <Text style={[styles.statNum, { color: '#9A7D0A' }]}>{missingCount}</Text>
            <Text style={[styles.statLbl, { color: '#9A7D0A' }]}>Bez anamnézy</Text>
          </View>
          {waitingList.length > 0 && (
            <View style={[styles.statChip, { backgroundColor: '#EBF5FB', borderColor: '#AED6F1' }]}>
              <Text style={[styles.statNum, { color: '#1A5276' }]}>{waitingList.length}</Text>
              <Text style={[styles.statLbl, { color: '#1A5276' }]}>Čakajúci</Text>
            </View>
          )}
          {recallCount > 0 && (
            <View style={[styles.statChip, { backgroundColor: '#FDF3E7', borderColor: '#D0D4DC' }]}>
              <Text style={[styles.statNum, { color: '#9A7D0A' }]}>{recallCount}</Text>
              <Text style={[styles.statLbl, { color: '#9A7D0A' }]}>Recall</Text>
            </View>
          )}
        </View>
      )}

      {/* ── Filter chips ── */}
      {!loading && (
        <View style={styles.filterRow}>
          {([
            { key: 'all',          label: 'Všetci',        count: patients.length },
            { key: 'recall',       label: '🔔 Recall',     count: recallCount },
            { key: 'no_passport',  label: '⚠ Bez anam.',   count: missingCount },
            { key: 'with_passport',label: '✓ S anamnézou', count: passportCount },
          ] as { key: PatientFilter; label: string; count: number }[]).map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, activeFilter === f.key && styles.filterChipActive]}
              onPress={() => setActiveFilter(f.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.filterChipText, activeFilter === f.key && styles.filterChipTextActive]}>
                {f.label}
              </Text>
              {f.count > 0 && (
                <View style={[styles.filterChipBadge, activeFilter === f.key && styles.filterChipBadgeActive]}>
                  <Text style={[styles.filterChipBadgeText, activeFilter === f.key && { color: COLORS.wal }]}>
                    {f.count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Zoznam ── */}
      {loading ? (
        <SkeletonList count={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={query || activeFilter !== 'all' ? '🔍' : '👤'}
          title={query || activeFilter !== 'all' ? 'Žiadny výsledok' : 'Zatiaľ žiadni pacienti'}
          subtitle={
            query
              ? `Nenašiel sa žiadny pacient pre „${query}"`
              : activeFilter !== 'all'
                ? 'Žiadny pacient nevyhovuje zvolenému filtru.'
                : 'Pacienti sa zobrazia po prvej registrácii.'
          }
          action={(query.length > 0 || activeFilter !== 'all') ? {
            label: 'Vymazať filtre',
            onPress: () => { setQuery(''); setActiveFilter('all'); }
          } : undefined}
        />
      ) : (
        <ScrollView style={[styles.scroll, { backgroundColor: colors.bg2 }]} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.wal} />}
        >
          {/* ── Čakacia listina ── */}
          {waitingList.length > 0 && query.length === 0 && activeFilter === 'all' && (
            <View style={styles.wlSection}>
              <View style={styles.wlSectionHeader}>
                <View style={styles.wlDot} />
                <Text style={styles.wlSectionTitle}>ČAKACIA LISTINA ({waitingList.length})</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: SPACING.xl, gap: 10, paddingBottom: 4 }}>
                {waitingList.map((entry) => (
                  <View key={entry.id} style={[styles.wlCard, { backgroundColor: colors.cardBg }]}>
                    <View style={styles.wlCardTop}>
                      <Text style={[styles.wlPatient, { color: colors.textPrimary }]} numberOfLines={1}>{entry.patientName}</Text>
                    </View>
                    {entry.serviceName && (
                      <Text style={styles.wlService} numberOfLines={1}>
                        {entry.serviceEmoji ?? '🦷'} {entry.serviceName}
                      </Text>
                    )}
                    {entry.preferred_date && (
                      <Text style={styles.wlDate}>
                        📅 {new Date(entry.preferred_date).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Text>
                    )}
                    {entry.notes ? (
                      <Text style={styles.wlNotes} numberOfLines={2}>📝 {entry.notes}</Text>
                    ) : null}
                    <View style={styles.wlActions}>
                      <TouchableOpacity
                        style={styles.wlBtnBook}
                        onPress={() => router.push({ pathname: '/(doctor)/add-appointment', params: { patientId: entry.patient_id, patientName: entry.patientName, ...(entry.service_id ? { serviceId: entry.service_id } : {}) } })}
                        activeOpacity={0.8}>
                        <Ionicons name="calendar-outline" size={13} color="#fff" />
                        <Text style={styles.wlBtnBookText}>Rezervovať</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.wlBtnMsg}
                        onPress={() => router.push({ pathname: '/(doctor)/messages', params: { patientId: entry.patient_id, patientName: entry.patientName } })}
                        activeOpacity={0.8}>
                        <Ionicons name="chatbubble-outline" size={13} color="#1A5276" />
                        <Text style={styles.wlBtnMsgText}>Napísať</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.wlBtnDone}
                        onPress={() => handleContactWaiting(entry)}
                        activeOpacity={0.8}>
                        <Ionicons name="checkmark" size={13} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Počet výsledkov pri hľadaní / filtri */}
          {(query.length > 0 || activeFilter !== 'all') && (
            <Text style={styles.resultLabel}>
              {filtered.length} {filtered.length === 1 ? 'výsledok' : filtered.length >= 2 && filtered.length <= 4 ? 'výsledky' : 'výsledkov'}
              {query.length > 0 ? ` pre „${query}"` : ''}
            </Text>
          )}

          {filtered.map((patient) => (
            <PatientCard
              key={patient.id}
              patient={patient}
              onDetail={() => router.push({
                pathname: '/(doctor)/patient-detail',
                params: { patientId: patient.id, patientName: patient.full_name ?? 'Pacient' }
              })}
              onChart={() => router.push({
                pathname: '/(doctor)/dental-chart',
                params: { patientId: patient.id, patientName: patient.full_name ?? 'Pacient' }
              })}
              onPassport={() => router.push({
                pathname: '/(doctor)/patient-passport',
                params: { patientId: patient.id, patientName: patient.full_name ?? 'Pacient' }
              })}
              onBook={() => router.push({
                pathname: '/(doctor)/add-appointment',
                params: { patientId: patient.id, patientName: patient.full_name ?? 'Pacient' }
              })}
            />
          ))}
          <View style={{ height: 90 }} />
        </ScrollView>
      )}
    </View>
    </ScreenWrapper>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },
  center: { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center', padding: 32 },

  // Header
  header: { backgroundColor: COLORS.esp, paddingHorizontal: SPACING.xl + 4, paddingTop: 20, paddingBottom: 20, flexDirection: 'row', alignItems: 'center' },
  headerLabel: { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '500', textTransform: 'uppercase', marginBottom: 4 },
  headerTitle: { fontSize: 20, fontWeight: '600', color: '#F5F6F8' },
  countBadge: { backgroundColor: COLORS.wal, borderRadius: 2, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center', borderWidth: 2, borderColor: COLORS.sand },
  countNum:   { fontSize: 22, fontWeight: '700', color: '#F5F6F8', lineHeight: 26 },
  countLabel: { fontSize: 10, color: COLORS.cream, letterSpacing: 1, textTransform: 'uppercase' },

  // Search bar
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.cream, marginHorizontal: SPACING.xl, marginTop: 14, marginBottom: 4, borderRadius: 2, borderWidth: 1.5, borderColor: COLORS.bg3, paddingHorizontal: 12, gap: 8, elevation: 2, shadowColor: '#121417', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
  searchIcon:  { flexShrink: 0 },
  searchInput: { flex: 1, paddingVertical: 13, fontSize: 14, color: COLORS.esp },
  sortBtn:        { width: 32, height: 32, borderRadius: 2, backgroundColor: COLORS.bg3, alignItems: 'center', justifyContent: 'center' },
  sortBtnActive:  { backgroundColor: COLORS.wal },
  sortPanel:      { backgroundColor: COLORS.cream, marginHorizontal: SPACING.xl, borderRadius: 2, borderWidth: 1.5, borderColor: COLORS.bg3, marginBottom: 6, overflow: 'hidden', elevation: 4, shadowColor: '#121417', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 },
  sortOption:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.bg3 },
  sortOptionActive:{ backgroundColor: '#D0D4DC' },
  sortOptionText: { fontSize: 13, color: COLORS.esp, fontWeight: '500' },
  sortOptionTextActive: { fontWeight: '700', color: COLORS.wal },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: SPACING.xl, marginTop: 12, marginBottom: 4 },
  statChip: { flex: 1, borderRadius: 2, borderWidth: 1, paddingVertical: 10, alignItems: 'center' },
  statNum:  { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  statLbl:  { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },

  // Filter chips
  filterRow:              { flexDirection: 'row', gap: 8, paddingHorizontal: SPACING.xl, marginTop: 10, marginBottom: 4, flexWrap: 'wrap' },
  filterChip:             { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4, backgroundColor: COLORS.cream, borderWidth: 1.5, borderColor: COLORS.bg3 },
  filterChipActive:       { backgroundColor: COLORS.esp, borderColor: COLORS.esp },
  filterChipText:         { fontSize: 11, fontWeight: '600', color: COLORS.wal },
  filterChipTextActive:   { color: '#F5F6F8' },
  filterChipBadge:        { backgroundColor: COLORS.bg3, borderRadius: 2, paddingHorizontal: 5, paddingVertical: 1 },
  filterChipBadgeActive:  { backgroundColor: COLORS.sand },
  filterChipBadgeText:    { fontSize: 9, fontWeight: '800', color: COLORS.wal },

  // Result label
  resultLabel: { fontSize: 11, color: COLORS.wal, paddingHorizontal: SPACING.xl, paddingTop: 12, paddingBottom: 4, fontStyle: 'italic' },

  // Patient card
  card: { backgroundColor: COLORS.cream, borderRadius: RADII.md, marginHorizontal: SPACING.xl, marginTop: 12, padding: 14, borderWidth: 1, borderColor: COLORS.bg3, elevation: 2, shadowColor: '#121417', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },

  avatar:     { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  avatarText: { fontSize: 17, fontWeight: '700' },

  patientName: { fontSize: 15, fontWeight: '700', color: COLORS.esp, marginBottom: 3 },
  infoRow:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoText:    { fontSize: 12, color: COLORS.wal },
  infoMuted:   { fontSize: 12, color: '#888', fontStyle: 'italic' },
  recallChip:  { backgroundColor: '#FDF3E7', borderRadius: 2, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 4, borderWidth: 1, borderColor: '#D0D4DC' },
  recallChipText: { fontSize: 9, fontWeight: '700', color: '#9A7D0A' },

  passportBadge:        { borderRadius: 2, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, alignSelf: 'flex-start' },
  passportBadgeOk:      { backgroundColor: '#EDF7F3', borderColor: '#A3D4BE' },
  passportBadgeMissing: { backgroundColor: '#FDF3E7', borderColor: '#D0D4DC' },
  passportBadgeText:    { fontSize: 9, fontWeight: '700', color: COLORS.esp, textTransform: 'uppercase', letterSpacing: 0.5 },

  actions:         { flexDirection: 'row', gap: 8 },
  btnChart:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 2, backgroundColor: '#D0D4DC', borderWidth: 1, borderColor: COLORS.sand },
  btnChartText:    { fontSize: 12, fontWeight: '600', color: COLORS.wal },
  btnPassport:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 2, backgroundColor: '#EBF5FB', borderWidth: 1, borderColor: '#AED6F1' },
  btnPassportText: { fontSize: 12, fontWeight: '600', color: '#1A5276' },
  btnBook:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 2, backgroundColor: COLORS.wal, marginTop: 8 },
  btnBookText: { fontSize: 12, fontWeight: '700', color: '#F5F6F8' },

  // Waiting list
  wlSection:       { backgroundColor: '#FDF3E7', borderBottomWidth: 1, borderBottomColor: '#D0D4DC', paddingTop: 10, paddingBottom: 12 },
  wlSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACING.xl, marginBottom: 10 },
  wlDot:           { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#B8ACA0' },
  wlSectionTitle:  { fontSize: 9, fontWeight: '800', color: '#B87333', letterSpacing: 1.5 },
  wlCard:          { width: 190, backgroundColor: COLORS.cream, borderRadius: 2, padding: 12, borderWidth: 1.5, borderColor: '#D0D4DC', elevation: 2 },
  wlCardTop:       { marginBottom: 6 },
  wlPatient:       { fontSize: 13, fontWeight: '700', color: COLORS.esp },
  wlService:       { fontSize: 11, color: COLORS.wal, marginBottom: 3 },
  wlDate:          { fontSize: 11, color: '#B87333', fontWeight: '500', marginBottom: 4 },
  wlNotes:         { fontSize: 11, color: '#888', marginBottom: 8, fontStyle: 'italic' },
  wlActions:       { flexDirection: 'row', gap: 6 },
  wlBtnBook:       { flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 7, borderRadius: 2, backgroundColor: COLORS.wal },
  wlBtnBookText:   { fontSize: 11, fontWeight: '700', color: '#F5F6F8' },
  wlBtnMsg:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 7, borderRadius: 2, backgroundColor: '#EBF5FB', borderWidth: 1, borderColor: '#AED6F1' },
  wlBtnMsgText:    { fontSize: 11, fontWeight: '700', color: '#1A5276' },
  wlBtnDone:       { width: 30, alignItems: 'center', justifyContent: 'center', paddingVertical: 7, borderRadius: 2, backgroundColor: '#2E7D5E' },

  // Empty / loading
  loadingText: { marginTop: 12, color: COLORS.wal, fontSize: 13 },
  emptyIcon:  { fontSize: 52, marginBottom: 14 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: COLORS.esp, marginBottom: 6, textAlign: 'center' },
  emptySub:   { fontSize: 13, color: COLORS.wal, textAlign: 'center', lineHeight: 20 },
  clearBtn:     { marginTop: 18, backgroundColor: COLORS.wal, borderRadius: 2, paddingHorizontal: 20, paddingVertical: 10 },
  clearBtnText: { fontSize: 13, fontWeight: '600', color: '#F5F6F8' }
});
