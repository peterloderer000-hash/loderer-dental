import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Linking, RefreshControl, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../supabase';
import { COLORS } from '../../styles/theme';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyRecall } from '../../components/EmptyState';
import { useAppTheme } from '../../context/ThemeContext';

interface RecallPatient {
  id: string;
  full_name: string;
  phone_number: string;
  lastVisit: string;
}

export default function RecallScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [patients, setPatients] = useState<RecallPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRecallPatients = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, phone_number, appointments(appointment_date, status)')
      .eq('role', 'patient');

    if (error) { Alert.alert('Chyba', 'Nepodarilo sa načítať pacientov'); return; }

    const now = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(now.getMonth() - 6);

    const recallList: RecallPatient[] = [];

    data?.forEach((profile: any) => {
      const apps = profile.appointments ?? [];

      const hasFutureScheduled = apps.some(
        (a: any) => a.status === 'scheduled' && new Date(a.appointment_date) > now
      );
      if (hasFutureScheduled) return;

      const completed = apps.filter((a: any) => a.status === 'completed');

      if (completed.length === 0) {
        recallList.push({
          id: profile.id,
          full_name: profile.full_name ?? 'Neznáme meno',
          phone_number: profile.phone_number ?? '',
          lastVisit: 'Nikdy',
        });
        return;
      }

      const sorted = [...completed].sort(
        (a: any, b: any) => new Date(b.appointment_date).getTime() - new Date(a.appointment_date).getTime()
      );
      const lastVisitDate = new Date(sorted[0].appointment_date);

      if (lastVisitDate < sixMonthsAgo) {
        const diffMonths = Math.floor(
          Math.abs(now.getTime() - lastVisitDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
        );
        recallList.push({
          id: profile.id,
          full_name: profile.full_name ?? 'Neznáme meno',
          phone_number: profile.phone_number ?? '',
          lastVisit: `${diffMonths} mes.`,
        });
      }
    });

    setPatients(recallList);
    setLoading(false);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchRecallPatients();
    setRefreshing(false);
  }, [fetchRecallPatients]);

  useEffect(() => { fetchRecallPatients(); }, [fetchRecallPatients]);

  function handleContact(phone: string) {
    if (!phone) { Alert.alert('Upozornenie', 'Pacient nemá telefónne číslo'); return; }
    Linking.openURL(`tel:${phone}`);
  }

  const renderItem = ({ item }: { item: RecallPatient }) => (
    <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
      <View style={s.cardInfo}>
        <Text style={[s.name, { color: colors.textPrimary }]}>{item.full_name}</Text>
        {!!item.phone_number && <Text style={[s.phone, { color: colors.textSecondary }]}>{item.phone_number}</Text>}
        <Text style={[s.visitText, { color: colors.textSecondary }]}>
          Posledná návšteva: <Text style={[s.visitValue, { color: colors.textPrimary }]}>{item.lastVisit}</Text>
        </Text>
      </View>
      <TouchableOpacity style={s.contactBtn} onPress={() => handleContact(item.phone_number)} activeOpacity={0.85}>
        <Ionicons name="call" size={17} color={COLORS.esp} />
        <Text style={s.contactBtnText}>Kontaktovať</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) return <SkeletonList count={5} />;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerSub}>PACIENTI</Text>
          <Text style={s.headerTitle}>Recall pacientov</Text>
        </View>
        {patients.length > 0 && (
          <View style={s.countBadge}>
            <Text style={s.countText}>{patients.length}</Text>
          </View>
        )}
      </View>

      <FlatList
        data={patients}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={s.content}
        style={[s.list, { backgroundColor: colors.bg2 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} colors={[COLORS.gold]} />
        }
        ListEmptyComponent={!refreshing ? <EmptyRecall /> : null}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  list:   { flex: 1, backgroundColor: COLORS.bg2 },
  content:{ padding: 16, flexGrow: 1 },

  header: {
    backgroundColor: COLORS.esp, paddingHorizontal: 16,
    paddingTop: 14, paddingBottom: 18,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  backBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerSub:  { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  headerTitle:{ fontSize: 19, fontWeight: '700', color: '#fff' },
  countBadge: { backgroundColor: COLORS.gold, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  countText:  { fontSize: 13, fontWeight: '800', color: COLORS.esp },

  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.bg3,
    elevation: 2, shadowColor: COLORS.esp, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3,
  },
  cardInfo:     { marginBottom: 12 },
  name:         { fontSize: 17, fontWeight: '800', color: COLORS.esp, marginBottom: 4 },
  phone:        { fontSize: 14, color: COLORS.wal, marginBottom: 6 },
  visitText:    { fontSize: 13, color: COLORS.wal },
  visitValue:   { fontWeight: '700', color: COLORS.esp },
  contactBtn:   { flexDirection: 'row', backgroundColor: COLORS.gold, borderRadius: 10, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', gap: 8 },
  contactBtnText:{ fontSize: 15, fontWeight: '700', color: COLORS.esp },

});
