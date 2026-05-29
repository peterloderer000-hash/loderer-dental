import React, { useState, useCallback, useEffect } from 'react';
import {
  ActivityIndicator, Alert, Linking, RefreshControl, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII } from '../../styles/theme';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyWaitlist } from '../../components/EmptyState';
import { useAppTheme } from '../../context/ThemeContext';

type WaitlistRow = {
  id: string;
  preferred_date: string | null;
  notes: string | null;
  created_at: string;
  status: string;
  patient: { id: string; full_name: string | null; phone_number: string | null } | null;
  service:  { id: string; name: string; emoji: string | null; duration_minutes: number } | null;
};

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60)    return 'práve teraz';
  if (diff < 3600)  return `pred ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `pred ${Math.floor(diff / 3600)} hod`;
  const days = Math.floor(diff / 86400);
  return days === 1 ? 'včera' : `pred ${days} dňami`;
}

function waitingDays(dateStr: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000));
}

export default function WaitlistScreen() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  const [items,      setItems]      = useState<WaitlistRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting,     setActing]     = useState<string | null>(null); // id being acted on

  async function load() {
    const { data, error } = await supabase
      .from('waiting_list')
      .select('id, preferred_date, notes, created_at, status, patient:profiles!waiting_list_patient_id_fkey(id, full_name, phone_number), service:services(id, name, emoji, duration_minutes)')
      .eq('status', 'waiting')
      .order('created_at', { ascending: true });
    if (!error) setItems((data ?? []) as unknown as WaitlistRow[]);
    setLoading(false);
    setRefreshing(false);
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  // Realtime — nový pacient v čakacej listine
  useEffect(() => {
    const ch = supabase
      .channel('waitlist-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'waiting_list', filter: 'status=eq.waiting' },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function handleDismiss(item: WaitlistRow) {
    Alert.alert(
      'Zamietnuť',
      `Zamietnuť žiadosť od ${item.patient?.full_name ?? 'pacienta'}?`,
      [
        { text: 'Nie', style: 'cancel' },
        {
          text: 'Zamietnuť', style: 'destructive',
          onPress: async () => {
            setActing(item.id);
            const { error } = await supabase
              .from('waiting_list')
              .update({ status: 'dismissed' })
              .eq('id', item.id);
            setActing(null);
            if (error) Alert.alert('Chyba', error.message);
            else {
              setItems(prev => prev.filter(i => i.id !== item.id));
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
          },
        },
      ],
    );
  }

  async function handleApprove(item: WaitlistRow) {
    // Označ ako schválené a presmeruj na nový termín s prefill
    setActing(item.id);
    const { error } = await supabase
      .from('waiting_list')
      .update({ status: 'approved' })
      .eq('id', item.id);
    setActing(null);
    if (error) { Alert.alert('Chyba', error.message); return; }
    setItems(prev => prev.filter(i => i.id !== item.id));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Naviguj na add-appointment s pacientom a službou prefill
    router.push({
      pathname: '/(doctor)/add-appointment',
      params: {
        patientId:   item.patient?.id    ?? '',
        patientName: item.patient?.full_name ?? '',
        serviceId:   item.service?.id    ?? '',
      },
    });
  }

  if (loading) return <SkeletonList count={4} />;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.esp }]} edges={['top']}>
      {/* Hlavička */}
      <View style={[styles.header, { backgroundColor: colors.esp }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerSub}>PACIENTI</Text>
          <Text style={styles.headerTitle}>Čakacia listina</Text>
        </View>
        {items.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeNum}>{items.length}</Text>
          </View>
        )}
      </View>

      <ScrollView
        style={[styles.scroll, { backgroundColor: colors.bg2 }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.wal} />}
      >
        {items.length === 0 ? (
          <EmptyWaitlist />
        ) : (
          <>
            <View style={[styles.infoBanner, { backgroundColor: dark ? '#0D2233' : '#EBF5FB', borderColor: dark ? '#1A527644' : '#AED6F1' }]}>
              <Ionicons name="information-circle-outline" size={14} color={dark ? '#5DADE2' : '#1A5276'} />
              <Text style={[styles.infoBannerText, { color: dark ? '#5DADE2' : '#1A5276' }]}>
                Klepni "Rezervovať" pre otvorenie formulára s predvyplneným pacientom a službou.
              </Text>
            </View>

            {items.map((item) => {
              const isActing = acting === item.id;
              const prefDate = item.preferred_date
                ? new Date(item.preferred_date).toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' })
                : null;
              return (
                <View key={item.id} style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                  {/* Hlavička karty */}
                  <View style={styles.cardHeader}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {(item.patient?.full_name ?? '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.patientName, { color: colors.textPrimary }]}>{item.patient?.full_name ?? 'Pacient'}</Text>
                      {item.patient?.phone_number && (
                        <Text style={[styles.patientPhone, { color: colors.textSecondary }]}>{item.patient.phone_number}</Text>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {(() => {
                        const days = waitingDays(item.created_at);
                        const isLong = days >= 14;
                        return (
                          <View style={[styles.waitBadge, {
                            backgroundColor: isLong ? (dark ? '#4A1010' : '#FDEDEC') : (dark ? '#0D2233' : '#EBF5FB'),
                            borderColor: isLong ? (dark ? '#C0392B33' : '#F5B7B1') : (dark ? '#1A527633' : '#AED6F1'),
                          }]}>
                            <Text style={[styles.waitBadgeText, { color: isLong ? '#E74C3C' : (dark ? '#5DADE2' : '#1A5276') }]}>
                              {days === 0 ? 'dnes' : days === 1 ? 'čaká 1 deň' : `čaká ${days} dní`}
                            </Text>
                          </View>
                        );
                      })()}
                      {item.patient?.phone_number && (
                        <TouchableOpacity
                          style={styles.callBtn}
                          onPress={() => Linking.openURL(`tel:${item.patient!.phone_number}`)}
                          activeOpacity={0.75}
                        >
                          <Ionicons name="call" size={14} color="#fff" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {/* Detaily */}
                  <View style={styles.detailsRow}>
                    {item.service && (
                      <View style={[styles.detailChip, { backgroundColor: colors.bg2, borderColor: colors.bg3 }]}>
                        <Text style={styles.detailChipEmoji}>{item.service.emoji ?? '🦷'}</Text>
                        <Text style={[styles.detailChipText, { color: colors.textPrimary }]}>{item.service.name}</Text>
                      </View>
                    )}
                    {prefDate && (
                      <View style={[styles.detailChip, { backgroundColor: dark ? '#0D2233' : '#EBF5FB', borderColor: dark ? '#1A527644' : '#AED6F1' }]}>
                        <Ionicons name="calendar-outline" size={11} color={dark ? '#5DADE2' : '#1A5276'} />
                        <Text style={[styles.detailChipText, { color: dark ? '#5DADE2' : '#1A5276' }]}>{prefDate}</Text>
                      </View>
                    )}
                  </View>

                  {item.notes && (
                    <View style={[styles.notesRow, { backgroundColor: colors.bg2 }]}>
                      <Ionicons name="document-text-outline" size={12} color={colors.textSecondary} />
                      <Text style={[styles.notesText, { color: colors.textSecondary }]}>{item.notes}</Text>
                    </View>
                  )}

                  {/* Akcie */}
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={[styles.btnDismiss, { backgroundColor: dark ? '#4A1010' : '#FDEDEC', borderColor: dark ? '#C0392B44' : '#F1948A' }, isActing && { opacity: 0.5 }]}
                      onPress={() => handleDismiss(item)}
                      disabled={!!acting}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="close-circle-outline" size={15} color={dark ? '#E74C3C' : '#922B21'} />
                      <Text style={[styles.btnDismissText, { color: dark ? '#E74C3C' : '#922B21' }]}>Zamietnuť</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btnApprove, isActing && { opacity: 0.5 }]}
                      onPress={() => handleApprove(item)}
                      disabled={!!acting}
                      activeOpacity={0.85}
                    >
                      {isActing
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <>
                            <Ionicons name="calendar-outline" size={15} color="#fff" />
                            <Text style={styles.btnApproveText}>Rezervovať</Text>
                          </>}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },
  content:{ padding: SPACING.xl, paddingTop: 16 },
  center: { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center' },

  header:      { backgroundColor: COLORS.esp, paddingHorizontal: SPACING.xl, paddingTop: 14, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerSub:   { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 3 },
  headerTitle: { fontSize: 19, fontWeight: '700', color: '#fff' },
  countBadge:  { backgroundColor: '#0E6655', borderRadius: 16, minWidth: 32, height: 32, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  countBadgeNum: { fontSize: 15, fontWeight: '800', color: '#fff' },

  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyIcon:  { fontSize: 48, marginBottom: 14 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.esp, marginBottom: 6 },
  emptySub:   { fontSize: 13, color: COLORS.wal, textAlign: 'center', lineHeight: 19 },

  infoBanner:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#EBF5FB', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#AED6F1', marginBottom: 14 },
  infoBannerText: { flex: 1, fontSize: 11, color: '#1A5276', lineHeight: 16 },

  card:       { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: COLORS.bg3, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatar:     { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.esp, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontWeight: '700', color: COLORS.cream },
  patientName:{ fontSize: 15, fontWeight: '700', color: COLORS.esp },
  patientPhone:{ fontSize: 11, color: COLORS.wal, marginTop: 1 },
  timeAgo:    { fontSize: 10, color: '#bbb', fontStyle: 'italic' },
  waitBadge:     { borderRadius: 8, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  waitBadgeText: { fontSize: 10, fontWeight: '700' },
  callBtn:    { width: 28, height: 28, borderRadius: 14, backgroundColor: '#1A8A44', alignItems: 'center', justifyContent: 'center' },

  detailsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 },
  detailChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.bg2, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: COLORS.bg3 },
  detailChipDate: { backgroundColor: '#EBF5FB', borderColor: '#AED6F1' },
  detailChipEmoji:{ fontSize: 13 },
  detailChipText: { fontSize: 11, fontWeight: '600', color: COLORS.esp },

  notesRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: COLORS.bg2, borderRadius: 8, padding: 8, marginBottom: 10 },
  notesText:  { flex: 1, fontSize: 11, color: COLORS.wal, lineHeight: 16 },

  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  btnDismiss: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 10, backgroundColor: '#FDEDEC', borderWidth: 1.5, borderColor: '#F1948A' },
  btnDismissText: { fontSize: 12, fontWeight: '700', color: '#922B21' },
  btnApprove: { flex: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#0E6655' },
  btnApproveText: { fontSize: 12, fontWeight: '700', color: '#fff' },
});
