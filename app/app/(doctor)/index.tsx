import React, { useState, useCallback, useMemo } from 'react';
import {
  ActivityIndicator, Alert, Modal, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, CommonActions } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { supabase } from '../../supabase';
import { COLORS, SIZES } from '../../styles/theme';
import { useAppointments, Appointment } from '../../hooks/useAppointments';

// ─── Pomocné funkcie ──────────────────────────────────────────────────────────
function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
}
function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' });
}
function isToday(dateStr: string) {
  const d = new Date(dateStr); const t = new Date();
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
}

const STATUS_CONFIG = {
  scheduled: { label: 'Naplánovaný', bg: '#EBF5FB', color: '#1A5276', border: '#AED6F1' },
  completed:  { label: 'Dokončený',   bg: '#EAFAF1', color: '#1E8449', border: '#A9DFBF' },
  cancelled:  { label: 'Zrušený',     bg: '#FDEDEC', color: '#922B21', border: '#F1948A' },
};

function StatusBadge({ status }: { status: Appointment['status'] }) {
  const c = STATUS_CONFIG[status];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={[styles.badgeText, { color: c.color }]}>{c.label}</Text>
    </View>
  );
}

function AppointmentCard({ item, onComplete, onCancel, onDentalChart, onPassport }: {
  item: Appointment; onComplete: () => void; onCancel: () => void; onDentalChart: () => void; onPassport: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.timeBox}>
          <Text style={styles.timeText}>{formatTime(item.appointment_date)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.patientName}>{item.patient?.full_name ?? 'Neznámy pacient'}</Text>
          {item.patient?.phone_number
            ? <Text style={styles.patientPhone}>{item.patient.phone_number}</Text>
            : null}
        </View>
        <StatusBadge status={item.status} />
      </View>
      {item.notes ? (
        <View style={styles.notesRow}>
          <Ionicons name="document-text-outline" size={13} color={COLORS.wal} />
          <Text style={styles.notesText}>{item.notes}</Text>
        </View>
      ) : null}
      <View style={styles.actionsGrid}>
        {item.status === 'scheduled' && (
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.btnComplete} onPress={onComplete} activeOpacity={0.8}>
              <Ionicons name="checkmark-circle-outline" size={15} color="#1E8449" />
              <Text style={styles.btnCompleteText}>Dokončiť</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnCancel} onPress={onCancel} activeOpacity={0.8}>
              <Ionicons name="close-circle-outline" size={15} color="#922B21" />
              <Text style={styles.btnCancelText}>Zrušiť</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.btnChart} onPress={onDentalChart} activeOpacity={0.8}>
            <Ionicons name="clipboard-outline" size={15} color={COLORS.wal} />
            <Text style={styles.btnChartText}>Zubná karta</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnPassport} onPress={onPassport} activeOpacity={0.8}>
            <Ionicons name="document-text-outline" size={15} color="#1A5276" />
            <Text style={styles.btnPassportText}>Anamnéza</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

type Filter = 'today' | 'upcoming' | 'all';

// ─── Modal: klinické poznámky pri dokončení ────────────────────────────────────
function CompleteModal({ visible, patientName, onClose, onConfirm, saving }: {
  visible: boolean; patientName: string; onClose: () => void;
  onConfirm: (notes: string) => void; saving: boolean;
}) {
  const [notes, setNotes] = useState('');
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Dokončiť termín</Text>
          <Text style={styles.sheetSub}>{patientName}</Text>
          <Text style={styles.sheetLabel}>KLINICKÉ POZNÁMKY (voliteľné)</Text>
          <TextInput
            style={styles.sheetInput}
            placeholder="Čo sa robilo, odporúčania, ďalší postup..."
            placeholderTextColor="#bbb"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            autoFocus
          />
          <View style={styles.sheetActions}>
            <TouchableOpacity style={styles.sheetBtnCancel} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.sheetBtnCancelText}>Zrušiť</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sheetBtnConfirm, saving && { opacity: 0.6 }]}
              onPress={() => onConfirm(notes)}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.sheetBtnConfirmText}>✓ Dokončiť</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function DoctorHome() {
  const router = useRouter();
  const navigation = useNavigation();
  const { appointments, loading, refetch, updateStatus } = useAppointments('doctor');
  const [filter, setFilter] = useState<Filter>('today');
  const [doctorName, setDoctorName] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [completingItem, setCompletingItem] = useState<Appointment | null>(null);
  const [completeSaving, setCompleteSaving] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    refetch();
    setTimeout(() => setRefreshing(false), 800);
  }, [refetch]);

  async function handleSignOut() {
    Alert.alert('Odhlásiť sa', 'Naozaj sa chceš odhlásiť?', [
      { text: 'Nie', style: 'cancel' },
      { text: 'Áno', style: 'destructive', onPress: async () => {
        await supabase.auth.signOut();
        const parent = navigation.getParent() ?? navigation;
        parent.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'index' }] }));
      }},
    ]);
  }

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
        .then(({ data }) => { if (data?.full_name) setDoctorName(data.full_name); });
    });
  }, []);

  async function handleComplete(item: Appointment) {
    setCompletingItem(item);
  }

  async function confirmComplete(notes: string) {
    if (!completingItem) return;
    setCompleteSaving(true);
    const err = await updateStatus(completingItem.id, 'completed', notes);
    setCompleteSaving(false);
    setCompletingItem(null);
    if (err) Alert.alert('Chyba', err.message);
  }

  async function handleCancel(id: string) {
    Alert.alert('Zrušiť termín', 'Chcete zrušiť tento termín?', [
      { text: 'Nie', style: 'cancel' },
      {
        text: 'Áno, zrušiť', style: 'destructive',
        onPress: async () => { const err = await updateStatus(id, 'cancelled'); if (err) Alert.alert('Chyba', err.message); },
      },
    ]);
  }

  const filtered = useMemo(() => {
    const now = new Date();
    const q = searchQuery.trim().toLowerCase();
    return appointments.filter((a) => {
      // Filter podľa tab
      const d = new Date(a.appointment_date);
      if (filter === 'today'    && !(isToday(a.appointment_date) && a.status === 'scheduled')) return false;
      if (filter === 'upcoming' && !(d > now && a.status === 'scheduled')) return false;
      // Filter podľa vyhľadávania
      if (q) {
        const name  = (a.patient?.full_name    ?? '').toLowerCase();
        const phone = (a.patient?.phone_number ?? '').toLowerCase();
        const notes = (a.notes                 ?? '').toLowerCase();
        if (!name.includes(q) && !phone.includes(q) && !notes.includes(q)) return false;
      }
      return true;
    });
  }, [appointments, filter, searchQuery]);

  const grouped = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    filtered.forEach((a) => {
      const key = formatDate(a.appointment_date);
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });
    return map;
  }, [filtered]);

  const todayCount    = appointments.filter((a) => isToday(a.appointment_date) && a.status === 'scheduled').length;
  const upcomingCount = appointments.filter((a) => new Date(a.appointment_date) > new Date() && a.status === 'scheduled').length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>DOKTOR DASHBOARD</Text>
          <Text style={styles.headerTitle}>{doctorName || 'Vitajte'} 👨‍⚕️</Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={styles.countNum}>{todayCount}</Text>
          <Text style={styles.countLabel}>dnes</Text>
        </View>
        <TouchableOpacity onPress={handleSignOut} style={styles.logoutBtn} activeOpacity={0.75}>
          <Ionicons name="log-out-outline" size={20} color={COLORS.sand} />
        </TouchableOpacity>
      </View>

      {/* ── Stats strip ── */}
      {!loading && (
        <View style={styles.statsStrip}>
          {[
            { num: todayCount,    label: 'Dnes',       color: COLORS.wal,  bg: '#F4ECE4' },
            { num: upcomingCount, label: 'Nadchádza',  color: '#1A5276',   bg: '#EBF5FB' },
            { num: appointments.filter((a) => a.status === 'completed').length, label: 'Dokončené', color: '#1E8449', bg: '#EAFAF1' },
            { num: new Set(appointments.map((a) => a.patient_id)).size, label: 'Pacienti', color: '#6C3483', bg: '#F5EEF8' },
          ].map((s) => (
            <View key={s.label} style={[styles.statChip, { backgroundColor: s.bg }]}>
              <Text style={[styles.statNum, { color: s.color }]}>{s.num}</Text>
              <Text style={[styles.statLbl, { color: s.color }]}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Search bar ── */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color={COLORS.wal} />
        <TextInput
          style={styles.searchInput}
          placeholder="Hľadaj pacienta, poznámky..."
          placeholderTextColor="#aaa"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color="#bbb" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filterRow}>
        {([
          { key: 'today', label: 'Dnes' },
          { key: 'upcoming', label: 'Nadchádzajúce' },
          { key: 'all', label: 'Všetky' },
        ] as { key: Filter; label: string }[]).map(({ key, label }) => (
          <TouchableOpacity key={key}
            style={[styles.filterTab, filter === key && styles.filterTabActive]}
            onPress={() => setFilter(key)} activeOpacity={0.75}>
            <Text style={[styles.filterTabText, filter === key && styles.filterTabTextActive]}>
              {label}
              {key === 'today' && todayCount > 0 ? ` (${todayCount})` : ''}
              {key === 'upcoming' && upcomingCount > 0 ? ` (${upcomingCount})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.wal} size="large" /></View>
      ) : Object.keys(grouped).length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>📅</Text>
          <Text style={styles.emptyText}>Žiadne termíny</Text>
          <Text style={styles.emptySub}>V tomto zobrazení nie sú žiadne termíny.</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.sand} colors={[COLORS.wal]} />}>
          {Object.entries(grouped).map(([date, items]) => (
            <View key={date}>
              <View style={styles.dateHeader}>
                <View style={styles.dateDot} />
                <Text style={styles.dateLabel}>{date}</Text>
              </View>
              {items.map((item) => (
                <AppointmentCard key={item.id} item={item}
                  onComplete={() => handleComplete(item)}
                  onCancel={() => handleCancel(item.id)}
                  onDentalChart={() => router.push({
                    pathname: '/(doctor)/dental-chart',
                    params: { patientId: item.patient_id, patientName: item.patient?.full_name ?? 'Pacient' },
                  })}
                  onPassport={() => router.push({
                    pathname: '/(doctor)/patient-passport',
                    params: { patientId: item.patient_id, patientName: item.patient?.full_name ?? 'Pacient' },
                  })} />
              ))}
            </View>
          ))}
          <View style={{ height: 30 }} />
        </ScrollView>
      )}

      {/* ── FAB: Nový termín ── */}
      <TouchableOpacity style={styles.fab}
        onPress={() => router.push('/(doctor)/add-appointment')} activeOpacity={0.85}>
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>

      {/* ── Modal: klinické poznámky ── */}
      <CompleteModal
        visible={!!completingItem}
        patientName={completingItem?.patient?.full_name ?? 'Pacient'}
        onClose={() => setCompletingItem(null)}
        onConfirm={confirmComplete}
        saving={completeSaving}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },
  center: { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center' },

  header: { backgroundColor: COLORS.esp, paddingHorizontal: SIZES.padding + 4, paddingTop: 20, paddingBottom: 20, flexDirection: 'row', alignItems: 'center' },
  headerLabel: { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '500', textTransform: 'uppercase', marginBottom: 4 },
  headerTitle: { fontSize: 20, fontWeight: '600', color: '#fff' },
  logoutBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  countBadge: { backgroundColor: COLORS.wal, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center', borderWidth: 2, borderColor: COLORS.sand },
  countNum:   { fontSize: 22, fontWeight: '700', color: '#fff', lineHeight: 26 },
  countLabel: { fontSize: 8, color: COLORS.cream, letterSpacing: 1, textTransform: 'uppercase' },

  filterRow: { flexDirection: 'row', backgroundColor: COLORS.bg3, paddingHorizontal: SIZES.padding, paddingVertical: 10, gap: 8 },
  filterTab: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.bg3 },
  filterTabActive: { backgroundColor: COLORS.esp, borderColor: COLORS.wal },
  filterTabText: { fontSize: 10, fontWeight: '600', color: COLORS.wal, textTransform: 'uppercase', letterSpacing: 0.5 },
  filterTabTextActive: { color: COLORS.cream },

  dateHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: SIZES.padding, paddingTop: 18, paddingBottom: 8 },
  dateDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.wal },
  dateLabel: { fontSize: 11, fontWeight: '700', color: COLORS.esp, textTransform: 'capitalize', letterSpacing: 0.5 },

  card: { backgroundColor: '#fff', borderRadius: SIZES.radius, marginHorizontal: SIZES.padding, marginBottom: 10, padding: 14, borderWidth: 1, borderColor: COLORS.bg3, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  timeBox: { backgroundColor: COLORS.esp, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  timeText:    { fontSize: 14, fontWeight: '700', color: COLORS.cream },
  patientName: { fontSize: 14, fontWeight: '600', color: COLORS.esp, marginBottom: 2 },
  patientPhone:{ fontSize: 11, color: COLORS.wal },

  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  badgeText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  notesRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', marginTop: 6, marginBottom: 4 },
  notesText: { flex: 1, fontSize: 12, color: COLORS.wal, lineHeight: 18 },

  actionsGrid: { gap: 8, marginTop: 10 },
  actionsRow:  { flexDirection: 'row', gap: 8 },
  btnComplete: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 8, backgroundColor: '#EAFAF1', borderWidth: 1, borderColor: '#A9DFBF' },
  btnCompleteText: { fontSize: 12, fontWeight: '600', color: '#1E8449' },
  btnCancel: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 8, backgroundColor: '#FDEDEC', borderWidth: 1, borderColor: '#F1948A' },
  btnCancelText: { fontSize: 12, fontWeight: '600', color: '#922B21' },
  btnChart: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 8, backgroundColor: '#F4ECE4', borderWidth: 1, borderColor: COLORS.sand },
  btnChartText: { fontSize: 12, fontWeight: '600', color: COLORS.wal },
  btnPassport: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 8, backgroundColor: '#EBF5FB', borderWidth: 1, borderColor: '#AED6F1' },
  btnPassportText: { fontSize: 12, fontWeight: '600', color: '#1A5276' },

  statsStrip: { flexDirection: 'row', gap: 8, paddingHorizontal: SIZES.padding + 4, paddingVertical: 12, backgroundColor: COLORS.bg2, borderBottomWidth: 1, borderBottomColor: COLORS.bg3 },
  statChip:   { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  statNum:    { fontSize: 20, fontWeight: '800', lineHeight: 24 },
  statLbl:    { fontSize: 8, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },

  emptyIcon: { fontSize: 52, marginBottom: 14 },
  emptyText: { fontSize: 18, fontWeight: '600', color: COLORS.esp, marginBottom: 6 },
  emptySub:  { fontSize: 13, color: COLORS.wal, textAlign: 'center', paddingHorizontal: 40 },

  fab: { position: 'absolute', bottom: 82, right: 20, width: 54, height: 54, borderRadius: 27, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: COLORS.esp, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, borderWidth: 2, borderColor: COLORS.sand },

  // Search bar
  searchWrap:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: SIZES.padding + 4, marginTop: 10, marginBottom: 4, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.bg3, paddingHorizontal: 12, gap: 8 },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 13, color: COLORS.esp },

  // Complete modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:   { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 22, paddingBottom: 40 },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: COLORS.bg3, alignSelf: 'center', marginBottom: 20 },
  sheetTitle:  { fontSize: 20, fontWeight: '700', color: COLORS.esp, marginBottom: 4 },
  sheetSub:    { fontSize: 13, color: COLORS.wal, marginBottom: 18 },
  sheetLabel:  { fontSize: 9, letterSpacing: 2, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  sheetInput:  { borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: 12, padding: 12, fontSize: 13, color: COLORS.esp, minHeight: 100, backgroundColor: COLORS.bg2, marginBottom: 20 },
  sheetActions:       { flexDirection: 'row', gap: 10 },
  sheetBtnCancel:     { flex: 1, borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  sheetBtnCancelText: { fontSize: 14, fontWeight: '600', color: COLORS.wal },
  sheetBtnConfirm:     { flex: 2, backgroundColor: '#1E8449', borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  sheetBtnConfirmText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
