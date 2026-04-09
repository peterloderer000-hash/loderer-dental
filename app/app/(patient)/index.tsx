import React, { useCallback } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SIZES } from '../../styles/theme';
import { useProfile } from '../../hooks/useProfile';
import { useAppointments } from '../../hooks/useAppointments';
import UpcomingAppointmentCard from './components/UpcomingAppointmentCard';
import QuickActionsGrid from './components/QuickActionsGrid';

function formatAppointmentDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' }) +
    ' · ' + d.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
}

export default function PatientHome() {
  const router = useRouter();
  const { profile, hasHealthPassport, loading: profileLoading, refetch: refetchProfile } = useProfile();
  const { appointments, loading: apptLoading, refetch: refetchAppts, updateStatus } = useAppointments('patient');

  useFocusEffect(useCallback(() => {
    refetchProfile();
    refetchAppts();
  }, [refetchProfile, refetchAppts]));

  async function handleCancelAppointment(id: string) {
    Alert.alert('Zrušiť termín', 'Naozaj chcete zrušiť tento termín?', [
      { text: 'Nie', style: 'cancel' },
      { text: 'Áno, zrušiť', style: 'destructive', onPress: async () => {
        await updateStatus(id, 'cancelled');
        refetchAppts();
      }},
    ]);
  }

  const displayName = profile?.full_name ?? 'Pacient';

  // Najbližší naplánovaný termín
  const nextAppointment = appointments.find(
    (a) => a.status === 'scheduled' && new Date(a.appointment_date) > new Date()
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Hlavička ── */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>VITAJ SPÄŤ</Text>
          {profileLoading
            ? <ActivityIndicator color={COLORS.sand} size="small" style={{ alignSelf: 'flex-start', marginTop: 4 }} />
            : <Text style={styles.headerTitle}>Ahoj, {displayName}! 👋</Text>}
        </View>
        <TouchableOpacity style={styles.avatar} onPress={() => router.push('/(patient)/profile')} activeOpacity={0.8}>
          <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── ⚠️ Health Passport Banner ── */}
        {!profileLoading && !hasHealthPassport && (
          <TouchableOpacity style={styles.hpBanner}
            onPress={() => router.push('/(patient)/health-passport')} activeOpacity={0.88}>
            <View style={styles.hpBannerLeft}>
              <Text style={styles.hpIcon}>⚠️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.hpTitle}>Vyplňte zdravotný dotazník</Text>
                <Text style={styles.hpSub}>Pomôže nám poskytovať vám bezpečnejšiu starostlivosť.</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#8C2A18" />
          </TouchableOpacity>
        )}

        {/* ── Najbližší termín ── */}
        <View style={[styles.body, styles.bodyRow]}>
          <Text style={styles.sectionLabel}>NAJBLIŽŠÍ TERMÍN</Text>
          <TouchableOpacity onPress={() => router.push('/(patient)/appointments')} activeOpacity={0.75} style={styles.historyBtn}>
            <Text style={styles.historyBtnText}>História</Text>
            <Ionicons name="chevron-forward" size={12} color={COLORS.wal} />
          </TouchableOpacity>
        </View>
        {apptLoading ? (
          <ActivityIndicator color={COLORS.wal} style={{ marginVertical: 12 }} />
        ) : nextAppointment ? (
          <UpcomingAppointmentCard
            date={formatAppointmentDate(nextAppointment.appointment_date)}
            doctor={nextAppointment.doctor?.full_name ?? 'MDDr. Loderer'}
            type={nextAppointment.notes ?? 'Preventívna'}
            onCancel={() => handleCancelAppointment(nextAppointment.id)}
          />
        ) : (
          <TouchableOpacity style={styles.noApptCard}
            onPress={() => router.push('/(patient)/book-appointment')} activeOpacity={0.85}>
            <Ionicons name="calendar-outline" size={20} color={COLORS.wal} />
            <View style={{ flex: 1 }}>
              <Text style={styles.noApptText}>Žiadny nadchádzajúci termín</Text>
              <Text style={styles.noApptSub}>Kliknite sem a rezervujte si nový termín →</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ── Rýchle akcie ── */}
        <View style={styles.body}><Text style={styles.sectionLabel}>RÝCHLE AKCIE</Text></View>
        <QuickActionsGrid />

        {/* ── Upozornenia ── */}
        <View style={styles.body}>
          <Text style={styles.sectionLabel}>UPOZORNENIA</Text>
          <View style={styles.alertCard}>
            <Ionicons name="warning-outline" size={15} color="#c0392b" />
            <Text style={styles.alertText}>Odporúčaná preventívna prehliadka každých 6 mesiacov.</Text>
          </View>
        </View>

        {/* ── AI odporúčanie ── */}
        <View style={styles.body}>
          <Text style={styles.sectionLabel}>AI ODPORÚČANIE</Text>
          <View style={styles.aiCard}>
            <Text style={styles.aiLabel}>DENTÁLNE AI</Text>
            <Text style={styles.aiText}>
              Odporúčame zubné nite aspoň raz denne.
              Pravidelná hygiena znižuje riziko zubného kazu o 40 %. 🎉
            </Text>
          </View>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ── FAB: Rezervovať termín ── */}
      <TouchableOpacity style={styles.fab}
        onPress={() => router.push('/(patient)/book-appointment')} activeOpacity={0.85}>
        <Ionicons name="add" size={24} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },

  header: { backgroundColor: COLORS.esp, paddingHorizontal: SIZES.padding + 4, paddingTop: 20, paddingBottom: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLabel: { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '500', textTransform: 'uppercase', marginBottom: 4 },
  headerTitle: { fontSize: 22, fontWeight: '500', color: '#fff' },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.wal, borderWidth: 2, borderColor: COLORS.sand, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontWeight: '700', color: COLORS.cream },

  hpBanner: { backgroundColor: '#FAE8E5', borderWidth: 1.5, borderColor: '#CC7060', borderRadius: SIZES.radius, marginHorizontal: SIZES.padding, marginTop: 16, marginBottom: 4, paddingVertical: 13, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  hpBannerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  hpIcon:  { fontSize: 22 },
  hpTitle: { fontSize: 14, fontWeight: '700', color: '#8C2A18', marginBottom: 2 },
  hpSub:   { fontSize: 11, color: '#a84030', lineHeight: 16 },

  body:    { paddingHorizontal: SIZES.padding, paddingTop: 18, paddingBottom: 8 },
  bodyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { fontSize: 9, letterSpacing: 2, color: COLORS.wal, fontWeight: '500', textTransform: 'uppercase', marginBottom: 9 },
  historyBtn:     { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 9 },
  historyBtnText: { fontSize: 11, fontWeight: '600', color: COLORS.wal },

  noApptCard: { backgroundColor: '#fff', borderRadius: SIZES.radius, marginHorizontal: SIZES.padding, marginBottom: 14, padding: 16, borderWidth: 1.5, borderColor: COLORS.bg3, borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', gap: 12 },
  noApptText: { fontSize: 13, fontWeight: '600', color: COLORS.esp, marginBottom: 3 },
  noApptSub:  { fontSize: 11, color: COLORS.wal },

  alertCard: { backgroundColor: '#FAE8E5', borderWidth: 1, borderColor: '#CC7060', borderRadius: SIZES.radius, padding: 12, flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  alertText:  { flex: 1, fontSize: 12, color: '#8C2A18', lineHeight: 18 },

  aiCard:  { backgroundColor: COLORS.esp, borderRadius: SIZES.radius, padding: 14 },
  aiLabel: { fontSize: 9, color: 'rgba(255,255,255,0.38)', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: '500', marginBottom: 6 },
  aiText:  { fontSize: 13, color: COLORS.cream, lineHeight: 20 },

  fab: { position: 'absolute', bottom: 80, right: 20, width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: COLORS.esp, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6 },
});
