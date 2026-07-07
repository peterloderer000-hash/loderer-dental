/**
 * Smart Waitlist — čakací zoznam s auto-notifikáciou
 * Keď sa uvoľní termín, automaticky ponúkne ďalšiemu v rade
 */
import React, { useState, useCallback } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII, SHADOWS } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';

type WaitlistEntry = {
  id: string;
  patient_id: string;
  patient_name: string;
  preferred_date: string | null;
  preferred_time: string | null;
  service: string;
  priority: 'normal' | 'high' | 'urgent';
  status: 'waiting' | 'notified' | 'booked' | 'expired';
  created_at: string;
  notes: string | null;
};

const PRIORITY_CFG = {
  normal: { label: 'Normálna', color: COLORS.info, icon: 'remove-circle-outline' as const },
  high: { label: 'Vysoká', color: COLORS.warning, icon: 'alert-circle-outline' as const },
  urgent: { label: 'Urgentná', color: COLORS.error, icon: 'flame-outline' as const },
};

const STATUS_CFG = {
  waiting: { label: 'Čaká', color: COLORS.warning },
  notified: { label: 'Notifikovaný', color: COLORS.info },
  booked: { label: 'Objednaný', color: COLORS.success },
  expired: { label: 'Expirovaný', color: '#B8ACA0' },
};

export default function SmartWaitlist() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifying, setNotifying] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    try {
      const { data } = await supabase.from('waitlist')
        .select('*')
        .in('status', ['waiting', 'notified'])
        .order('created_at', { ascending: true });

      if (!data) { setEntries([]); setLoading(false); return; }

      const patientIds = [...new Set(data.map(d => d.patient_id))];
      const { data: profiles } = await supabase.from('profiles')
        .select('id, full_name').in('id', patientIds);
      const nameMap = new Map((profiles ?? []).map(p => [p.id, p.full_name]));

      setEntries(data.map(d => ({
        id: d.id,
        patient_id: d.patient_id,
        patient_name: nameMap.get(d.patient_id) ?? 'Pacient',
        preferred_date: d.preferred_date,
        preferred_time: d.preferred_time,
        service: d.service ?? 'Neurčené',
        priority: d.priority ?? 'normal',
        status: d.status,
        created_at: d.created_at,
        notes: d.notes,
      })));
    } catch (e) {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadEntries(); }, [loadEntries]));

  async function notifyPatient(entry: WaitlistEntry) {
    setNotifying(entry.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Update waitlist status
      await supabase.from('waitlist')
        .update({ status: 'notified', notified_at: new Date().toISOString() })
        .eq('id', entry.id);

      // Send in-app notification
      await supabase.from('notifications').insert({
        user_id: entry.patient_id,
        title: 'Voľný termín!',
        body: `Uvoľnil sa termín pre ${entry.service}. Rezervujte si ho čo najskôr!`,
        type: 'waitlist',
        data: { waitlist_id: entry.id },
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Odoslané', `Pacient ${entry.patient_name} bol notifikovaný.`);
      loadEntries();
    } catch (e) {
      Alert.alert('Chyba', 'Nepodarilo sa odoslať notifikáciu.');
    } finally {
      setNotifying(null);
    }
  }

  async function markBooked(entry: WaitlistEntry) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await supabase.from('waitlist').update({ status: 'booked' }).eq('id', entry.id);
    loadEntries();
  }

  async function removeEntry(entry: WaitlistEntry) {
    Alert.alert('Odstrániť', `Odstrániť ${entry.patient_name} z čakacieho zoznamu?`, [
      { text: 'Zrušiť' },
      {
        text: 'Odstrániť', style: 'destructive', onPress: async () => {
          await supabase.from('waitlist').update({ status: 'expired' }).eq('id', entry.id);
          loadEntries();
        },
      },
    ]);
  }

  const waitingCount = entries.filter(e => e.status === 'waiting').length;
  const notifiedCount = entries.filter(e => e.status === 'notified').length;

  return (
    <View style={[st.safe, { backgroundColor: colors.esp }]}>
      <HeroHeader title="Čakací zoznam" subtitle="Smart waitlist" icon="list-outline" onBack={() => router.back()} />

      <ScrollView style={[st.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={st.content}
        showsVerticalScrollIndicator={false}>

        {loading ? <SkeletonList count={4} /> : (
          <>
            {/* Stats */}
            <Animated.View entering={FadeInDown.delay(100)} style={st.statsRow}>
              <View style={[st.statCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <Text style={[st.statNum, { color: COLORS.warning }]}>{waitingCount}</Text>
                <Text style={[st.statLabel, { color: colors.textSecondary }]}>Čaká</Text>
              </View>
              <View style={[st.statCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <Text style={[st.statNum, { color: COLORS.info }]}>{notifiedCount}</Text>
                <Text style={[st.statLabel, { color: colors.textSecondary }]}>Notifikovaní</Text>
              </View>
              <View style={[st.statCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <Text style={[st.statNum, { color: colors.textPrimary }]}>{entries.length}</Text>
                <Text style={[st.statLabel, { color: colors.textSecondary }]}>Celkom</Text>
              </View>
            </Animated.View>

            {entries.length === 0 ? (
              <View style={[st.empty, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <Text style={{ fontSize: 48 }}>📋</Text>
                <Text style={[st.emptyTitle, { color: colors.textPrimary }]}>Prázdny čakací zoznam</Text>
                <Text style={[st.emptySub, { color: colors.textSecondary }]}>
                  Zatiaľ nikto nečaká na voľný termín.
                </Text>
              </View>
            ) : (
              entries.map((entry, i) => {
                const prCfg = PRIORITY_CFG[entry.priority];
                const stCfg = STATUS_CFG[entry.status];
                return (
                  <Animated.View key={entry.id} entering={FadeInDown.delay(150 + i * 60)}
                    style={[st.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                    <View style={st.cardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[st.cardName, { color: colors.textPrimary }]}>{entry.patient_name}</Text>
                        <Text style={[st.cardService, { color: colors.textSecondary }]}>{entry.service}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <View style={[st.badge, { backgroundColor: prCfg.color + '15' }]}>
                          <Ionicons name={prCfg.icon} size={12} color={prCfg.color} />
                          <Text style={[st.badgeText, { color: prCfg.color }]}>{prCfg.label}</Text>
                        </View>
                        <View style={[st.badge, { backgroundColor: stCfg.color + '15' }]}>
                          <Text style={[st.badgeText, { color: stCfg.color }]}>{stCfg.label}</Text>
                        </View>
                      </View>
                    </View>

                    {(entry.preferred_date || entry.preferred_time) && (
                      <View style={st.prefRow}>
                        <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                        <Text style={[st.prefText, { color: colors.textSecondary }]}>
                          {entry.preferred_date ? new Date(entry.preferred_date).toLocaleDateString('sk-SK') : ''}
                          {entry.preferred_time ? ` o ${entry.preferred_time}` : ''}
                        </Text>
                      </View>
                    )}

                    {entry.notes && (
                      <Text style={[st.notes, { color: colors.textSecondary }]}>{entry.notes}</Text>
                    )}

                    <View style={st.cardActions}>
                      {entry.status === 'waiting' && (
                        <TouchableOpacity style={st.notifyBtn}
                          onPress={() => notifyPatient(entry)}
                          disabled={notifying === entry.id}>
                          <Ionicons name="notifications" size={16} color="#F5F6F8" />
                          <Text style={st.notifyText}>{notifying === entry.id ? '...' : 'Notifikovať'}</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={[st.actionBtn, { backgroundColor: COLORS.success + '15' }]}
                        onPress={() => markBooked(entry)}>
                        <Ionicons name="checkmark" size={16} color={COLORS.success} />
                        <Text style={[st.actionText, { color: COLORS.success }]}>Objednaný</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[st.actionBtn, { backgroundColor: COLORS.error + '10' }]}
                        onPress={() => removeEntry(entry)}>
                        <Ionicons name="close" size={16} color={COLORS.error} />
                      </TouchableOpacity>
                    </View>
                  </Animated.View>
                );
              })
            )}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: SPACING.xl },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: SPACING.lg },
  statCard: { flex: 1, borderRadius: RADII.md, borderWidth: 1, padding: 14, alignItems: 'center' },
  statNum: { fontSize: 24, fontWeight: '800' },
  statLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', marginTop: 2 },

  empty: { borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.xxl, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  emptySub: { fontSize: 13, textAlign: 'center', marginTop: 6 },

  card: { borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.lg, marginBottom: SPACING.md },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  cardName: { fontSize: 15, fontWeight: '700' },
  cardService: { fontSize: 12, marginTop: 2 },

  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADII.pill },
  badgeText: { fontSize: 10, fontWeight: '700' },

  prefRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: 'rgba(0,0,0,0.05)' },
  prefText: { fontSize: 12 },
  notes: { fontSize: 12, fontStyle: 'italic', marginTop: 6 },

  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: 'rgba(0,0,0,0.05)' },
  notifyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: COLORS.gold, borderRadius: RADII.pill },
  notifyText: { color: '#F5F6F8', fontWeight: '700', fontSize: 12 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADII.pill },
  actionText: { fontWeight: '700', fontSize: 11 },
});
