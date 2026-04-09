import React, { useState, useMemo } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { usePatients, Patient } from '../../hooks/usePatients';
import { COLORS, SIZES } from '../../styles/theme';

// ─── Initials avatar ──────────────────────────────────────────────────────────
function Avatar({ name }: { name: string | null }) {
  const initials = (name ?? '?')
    .trim()
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Deterministická farba podľa prvého písmena
  const PALETTE = [
    '#1A5276', '#1E8449', '#6C3483', '#922B21',
    '#9A7D0A', '#1A5276', '#17A589', '#784212',
  ];
  const color = PALETTE[(initials.charCodeAt(0) ?? 0) % PALETTE.length];

  return (
    <View style={[styles.avatar, { backgroundColor: color + '22', borderColor: color + '55' }]}>
      <Text style={[styles.avatarText, { color }]}>{initials}</Text>
    </View>
  );
}

// ─── Jedna karta pacienta ─────────────────────────────────────────────────────
function PatientCard({ patient, onChart, onPassport, onBook }: {
  patient: Patient;
  onChart:   () => void;
  onPassport: () => void;
  onBook:    () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Avatar name={patient.full_name} />

        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.patientName} numberOfLines={1}>
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
        </View>

        {/* Zdravotný pas badge */}
        <View style={[styles.passportBadge,
          patient.has_passport ? styles.passportBadgeOk : styles.passportBadgeMissing]}>
          <Text style={styles.passportBadgeText}>
            {patient.has_passport ? '✓ Anamnéza' : '! Bez anamnézy'}
          </Text>
        </View>
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
    </View>
  );
}

// ─── Hlavná obrazovka ─────────────────────────────────────────────────────────
export default function PatientsScreen() {
  const router  = useRouter();
  const { patients, loading, refetch } = usePatients();
  const [query, setQuery] = useState('');

  useFocusEffect(React.useCallback(() => { refetch(); }, [refetch]));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) =>
      (p.full_name    ?? '').toLowerCase().includes(q) ||
      (p.phone_number ?? '').toLowerCase().includes(q)
    );
  }, [patients, query]);

  const totalCount     = patients.length;
  const passportCount  = patients.filter((p) => p.has_passport).length;
  const missingCount   = totalCount - passportCount;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* ── Hlavička ── */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>DOKTOR DASHBOARD</Text>
          <Text style={styles.headerTitle}>Pacienti 🦷</Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countNum}>{totalCount}</Text>
          <Text style={styles.countLabel}>spolu</Text>
        </View>
      </View>

      {/* ── Vyhľadávací bar ── */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={COLORS.wal} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Hľadaj podľa mena alebo telefónu..."
          placeholderTextColor="#aaa"
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
      </View>

      {/* ── Štatistiky ── */}
      {!loading && query.length === 0 && (
        <View style={styles.statsRow}>
          <View style={[styles.statChip, { backgroundColor: '#EAFAF1', borderColor: '#A9DFBF' }]}>
            <Text style={[styles.statNum, { color: '#1E8449' }]}>{passportCount}</Text>
            <Text style={[styles.statLbl, { color: '#1E8449' }]}>S anamnézou</Text>
          </View>
          <View style={[styles.statChip, { backgroundColor: '#FEF9E7', borderColor: '#F9E79F' }]}>
            <Text style={[styles.statNum, { color: '#9A7D0A' }]}>{missingCount}</Text>
            <Text style={[styles.statLbl, { color: '#9A7D0A' }]}>Bez anamnézy</Text>
          </View>
        </View>
      )}

      {/* ── Zoznam ── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.wal} size="large" />
          <Text style={styles.loadingText}>Načítavam pacientov...</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>{query ? '🔍' : '👤'}</Text>
          <Text style={styles.emptyTitle}>
            {query ? 'Žiadny výsledok' : 'Zatiaľ žiadni pacienti'}
          </Text>
          <Text style={styles.emptySub}>
            {query
              ? `Nenašiel sa žiadny pacient pre „${query}"`
              : 'Pacienti sa zobrazia po prvej registrácii.'}
          </Text>
          {query.length > 0 && (
            <TouchableOpacity style={styles.clearBtn} onPress={() => setQuery('')}>
              <Text style={styles.clearBtnText}>Vymazať hľadanie</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Počet výsledkov pri hľadaní */}
          {query.length > 0 && (
            <Text style={styles.resultLabel}>
              {filtered.length} {filtered.length === 1 ? 'výsledok' : 'výsledky'} pre „{query}"
            </Text>
          )}

          {filtered.map((patient) => (
            <PatientCard
              key={patient.id}
              patient={patient}
              onChart={() => router.push({
                pathname: '/(doctor)/dental-chart',
                params: { patientId: patient.id, patientName: patient.full_name ?? 'Pacient' },
              })}
              onPassport={() => router.push({
                pathname: '/(doctor)/patient-passport',
                params: { patientId: patient.id, patientName: patient.full_name ?? 'Pacient' },
              })}
              onBook={() => router.push({
                pathname: '/(doctor)/add-appointment',
                params: { patientId: patient.id, patientName: patient.full_name ?? 'Pacient' },
              })}
            />
          ))}
          <View style={{ height: 30 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },
  center: { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center', padding: 32 },

  // Header
  header: { backgroundColor: COLORS.esp, paddingHorizontal: SIZES.padding + 4, paddingTop: 20, paddingBottom: 20, flexDirection: 'row', alignItems: 'center' },
  headerLabel: { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '500', textTransform: 'uppercase', marginBottom: 4 },
  headerTitle: { fontSize: 20, fontWeight: '600', color: '#fff' },
  countBadge: { backgroundColor: COLORS.wal, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center', borderWidth: 2, borderColor: COLORS.sand },
  countNum:   { fontSize: 22, fontWeight: '700', color: '#fff', lineHeight: 26 },
  countLabel: { fontSize: 8, color: COLORS.cream, letterSpacing: 1, textTransform: 'uppercase' },

  // Search bar
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: SIZES.padding, marginTop: 14, marginBottom: 4, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.bg3, paddingHorizontal: 12, gap: 8, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
  searchIcon:  { flexShrink: 0 },
  searchInput: { flex: 1, paddingVertical: 13, fontSize: 14, color: COLORS.esp },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: SIZES.padding, marginTop: 12, marginBottom: 4 },
  statChip: { flex: 1, borderRadius: 12, borderWidth: 1, paddingVertical: 10, alignItems: 'center' },
  statNum:  { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  statLbl:  { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },

  // Result label
  resultLabel: { fontSize: 11, color: COLORS.wal, paddingHorizontal: SIZES.padding, paddingTop: 12, paddingBottom: 4, fontStyle: 'italic' },

  // Patient card
  card: { backgroundColor: '#fff', borderRadius: SIZES.radius, marginHorizontal: SIZES.padding, marginTop: 12, padding: 14, borderWidth: 1, borderColor: COLORS.bg3, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },

  avatar:     { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  avatarText: { fontSize: 17, fontWeight: '700' },

  patientName: { fontSize: 15, fontWeight: '700', color: COLORS.esp, marginBottom: 3 },
  infoRow:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoText:    { fontSize: 12, color: COLORS.wal },
  infoMuted:   { fontSize: 12, color: '#bbb', fontStyle: 'italic' },

  passportBadge:        { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, alignSelf: 'flex-start' },
  passportBadgeOk:      { backgroundColor: '#EAFAF1', borderColor: '#A9DFBF' },
  passportBadgeMissing: { backgroundColor: '#FEF9E7', borderColor: '#F9E79F' },
  passportBadgeText:    { fontSize: 9, fontWeight: '700', color: COLORS.esp, textTransform: 'uppercase', letterSpacing: 0.5 },

  actions:         { flexDirection: 'row', gap: 8 },
  btnChart:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10, backgroundColor: '#F4ECE4', borderWidth: 1, borderColor: COLORS.sand },
  btnChartText:    { fontSize: 12, fontWeight: '600', color: COLORS.wal },
  btnPassport:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10, backgroundColor: '#EBF5FB', borderWidth: 1, borderColor: '#AED6F1' },
  btnPassportText: { fontSize: 12, fontWeight: '600', color: '#1A5276' },
  btnBook:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10, backgroundColor: COLORS.wal, marginTop: 8 },
  btnBookText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  // Empty / loading
  loadingText: { marginTop: 12, color: COLORS.wal, fontSize: 13 },
  emptyIcon:  { fontSize: 52, marginBottom: 14 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: COLORS.esp, marginBottom: 6, textAlign: 'center' },
  emptySub:   { fontSize: 13, color: COLORS.wal, textAlign: 'center', lineHeight: 20 },
  clearBtn:     { marginTop: 18, backgroundColor: COLORS.wal, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  clearBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },
});
