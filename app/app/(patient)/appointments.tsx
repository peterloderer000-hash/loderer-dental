import React, { useState, useCallback, useMemo } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SIZES } from '../../styles/theme';
import { useAppointments, Appointment } from '../../hooks/useAppointments';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('sk-SK', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}
function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
}
function getMonthLabel(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('sk-SK', { month: 'long', year: 'numeric' });
}

const STATUS_CONFIG = {
  scheduled: { label: 'Naplánovaný', bg: '#EBF5FB', color: '#1A5276', border: '#AED6F1', icon: 'time-outline' as const },
  completed:  { label: 'Dokončený',   bg: '#EAFAF1', color: '#1E8449', border: '#A9DFBF', icon: 'checkmark-circle-outline' as const },
  cancelled:  { label: 'Zrušený',     bg: '#FDEDEC', color: '#922B21', border: '#F1948A', icon: 'close-circle-outline' as const },
};

type Filter = 'all' | 'scheduled' | 'completed' | 'cancelled';

// ─── Karta termínu ────────────────────────────────────────────────────────────
function AppointmentCard({ item, onCancel }: { item: Appointment; onCancel: () => void }) {
  const cfg = STATUS_CONFIG[item.status];
  const now = new Date();
  const isPast = new Date(item.appointment_date) < now;
  const canCancel = item.status === 'scheduled' && !isPast;

  return (
    <View style={[styles.card, isPast && item.status === 'scheduled' && styles.cardMissed]}>
      {/* Čas + status */}
      <View style={styles.cardTop}>
        <View style={styles.timeBox}>
          <Text style={styles.timeDay}>{new Date(item.appointment_date).getDate()}</Text>
          <Text style={styles.timeMonth}>
            {new Date(item.appointment_date).toLocaleDateString('sk-SK', { month: 'short' })}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.timeText}>{formatTime(item.appointment_date)}</Text>
          <Text style={styles.dateText} numberOfLines={1}>
            {new Date(item.appointment_date).toLocaleDateString('sk-SK', { weekday: 'long' })}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
          <Ionicons name={cfg.icon} size={11} color={cfg.color} />
          <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Info */}
      <View style={styles.cardBottom}>
        <View style={styles.infoItem}>
          <Ionicons name="person-outline" size={13} color={COLORS.wal} />
          <Text style={styles.infoText}>{item.doctor?.full_name ?? 'MDDr. Loderer'}</Text>
        </View>
        {item.notes ? (
          <View style={styles.infoItem}>
            <Ionicons name="document-text-outline" size={13} color={COLORS.wal} />
            <Text style={styles.infoText} numberOfLines={1}>{item.notes}</Text>
          </View>
        ) : null}
      </View>

      {/* Cancel button — len pre budúce naplánované */}
      {canCancel && (
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
          <Ionicons name="close-circle-outline" size={14} color="#922B21" />
          <Text style={styles.cancelBtnText}>Zrušiť termín</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Hlavná obrazovka ─────────────────────────────────────────────────────────
export default function AppointmentsScreen() {
  const router = useRouter();
  const { appointments, loading, refetch, updateStatus } = useAppointments('patient');
  const [filter, setFilter] = useState<Filter>('all');

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  function handleCancel(id: string) {
    Alert.alert('Zrušiť termín', 'Naozaj chcete zrušiť tento termín?', [
      { text: 'Nie', style: 'cancel' },
      { text: 'Áno, zrušiť', style: 'destructive', onPress: async () => {
        const err = await updateStatus(id, 'cancelled');
        if (err) Alert.alert('Chyba', err.message);
      }},
    ]);
  }

  // Grupuj podľa mesiaca
  const filtered = useMemo(() => {
    const list = filter === 'all'
      ? appointments
      : appointments.filter((a) => a.status === filter);
    return [...list].sort(
      (a, b) => new Date(b.appointment_date).getTime() - new Date(a.appointment_date).getTime()
    );
  }, [appointments, filter]);

  const grouped = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    filtered.forEach((a) => {
      const key = getMonthLabel(a.appointment_date);
      if (!map[key]) map[key] = [];
      map[key].push(a);
    });
    return map;
  }, [filtered]);

  // Počty pre filter tabs
  const counts = useMemo(() => ({
    all:       appointments.length,
    scheduled: appointments.filter((a) => a.status === 'scheduled').length,
    completed: appointments.filter((a) => a.status === 'completed').length,
    cancelled: appointments.filter((a) => a.status === 'cancelled').length,
  }), [appointments]);

  const FILTERS: { key: Filter; label: string; color: string }[] = [
    { key: 'all',       label: `Všetky (${counts.all})`,           color: COLORS.wal },
    { key: 'scheduled', label: `Plánované (${counts.scheduled})`,  color: '#1A5276' },
    { key: 'completed', label: `Dokončené (${counts.completed})`,  color: '#1E8449' },
    { key: 'cancelled', label: `Zrušené (${counts.cancelled})`,    color: '#922B21' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Hlavička ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>MÔJ PREHĽAD</Text>
          <Text style={styles.headerTitle}>História termínov</Text>
        </View>
        <View style={styles.totalBadge}>
          <Text style={styles.totalNum}>{counts.all}</Text>
          <Text style={styles.totalLabel}>termínov</Text>
        </View>
      </View>

      {/* ── Filter tabs ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
        {FILTERS.map((f) => (
          <TouchableOpacity key={f.key}
            style={[styles.filterTab, filter === f.key && { backgroundColor: f.color, borderColor: f.color }]}
            onPress={() => setFilter(f.key)} activeOpacity={0.75}>
            <Text style={[styles.filterTabText, filter === f.key && styles.filterTabTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Obsah ── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.wal} size="large" />
          <Text style={styles.loadingText}>Načítavam termíny...</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>📅</Text>
          <Text style={styles.emptyTitle}>Žiadne termíny</Text>
          <Text style={styles.emptySub}>
            {filter === 'all'
              ? 'Zatiaľ nemáš žiadne termíny. Rezervuj si prvý!'
              : `Žiadne termíny v kategórii „${FILTERS.find((f) => f.key === filter)?.label}"`}
          </Text>
          {filter !== 'all' && (
            <TouchableOpacity style={styles.clearFilter} onPress={() => setFilter('all')}>
              <Text style={styles.clearFilterText}>Zobraziť všetky</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {Object.entries(grouped).map(([month, items]) => (
            <View key={month}>
              {/* Mesiac header */}
              <View style={styles.monthHeader}>
                <View style={styles.monthDot} />
                <Text style={styles.monthLabel}>{month}</Text>
                <View style={styles.monthCount}>
                  <Text style={styles.monthCountText}>{items.length}</Text>
                </View>
              </View>

              {items.map((item) => (
                <AppointmentCard key={item.id} item={item} onCancel={() => handleCancel(item.id)} />
              ))}
            </View>
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

  header: { backgroundColor: COLORS.esp, paddingHorizontal: SIZES.padding, paddingTop: 14, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerLabel: { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '500', textTransform: 'uppercase', marginBottom: 3 },
  headerTitle: { fontSize: 19, fontWeight: '600', color: '#fff' },
  totalBadge: { backgroundColor: COLORS.wal, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.sand },
  totalNum:   { fontSize: 20, fontWeight: '700', color: '#fff', lineHeight: 24 },
  totalLabel: { fontSize: 8, color: COLORS.cream, letterSpacing: 1, textTransform: 'uppercase' },

  // Filters
  filterScroll:  { maxHeight: 52, backgroundColor: COLORS.bg3 },
  filterContent: { paddingHorizontal: SIZES.padding, paddingVertical: 10, gap: 8 },
  filterTab:     { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.bg3, backgroundColor: '#fff' },
  filterTabText: { fontSize: 11, fontWeight: '600', color: COLORS.wal },
  filterTabTextActive: { color: '#fff' },

  // Month group
  monthHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: SIZES.padding, paddingTop: 18, paddingBottom: 8 },
  monthDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.wal },
  monthLabel: { flex: 1, fontSize: 12, fontWeight: '700', color: COLORS.esp, textTransform: 'capitalize' },
  monthCount: { backgroundColor: COLORS.bg3, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  monthCountText: { fontSize: 10, fontWeight: '700', color: COLORS.wal },

  // Card
  card: { backgroundColor: '#fff', borderRadius: SIZES.radius, marginHorizontal: SIZES.padding, marginBottom: 10, padding: 14, borderWidth: 1, borderColor: COLORS.bg3, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  cardMissed: { borderColor: '#F9E79F', backgroundColor: '#FEFDF0' },

  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  timeBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.esp, alignItems: 'center', justifyContent: 'center' },
  timeDay:   { fontSize: 16, fontWeight: '800', color: '#fff', lineHeight: 18 },
  timeMonth: { fontSize: 9, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase' },
  timeText:  { fontSize: 15, fontWeight: '700', color: COLORS.esp, marginBottom: 2 },
  dateText:  { fontSize: 11, color: COLORS.wal, textTransform: 'capitalize' },

  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  statusText:  { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  divider: { height: 1, backgroundColor: COLORS.bg3, marginBottom: 10 },

  cardBottom: { gap: 6 },
  infoItem:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText:   { fontSize: 12, color: COLORS.wal, flex: 1 },

  cancelBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, paddingVertical: 9, borderRadius: 8, backgroundColor: '#FDEDEC', borderWidth: 1, borderColor: '#F1948A' },
  cancelBtnText: { fontSize: 12, fontWeight: '600', color: '#922B21' },

  // Empty / loading
  loadingText: { marginTop: 12, color: COLORS.wal, fontSize: 13 },
  emptyIcon:   { fontSize: 52, marginBottom: 14 },
  emptyTitle:  { fontSize: 17, fontWeight: '600', color: COLORS.esp, marginBottom: 6, textAlign: 'center' },
  emptySub:    { fontSize: 13, color: COLORS.wal, textAlign: 'center', lineHeight: 20 },
  clearFilter: { marginTop: 18, backgroundColor: COLORS.wal, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  clearFilterText: { fontSize: 13, fontWeight: '600', color: '#fff' },
});
