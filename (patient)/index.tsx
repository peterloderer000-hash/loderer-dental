import React, { useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../supabase';
import { COLORS, SIZES } from '../styles/theme';
import { useProfile } from '../hooks/useProfile';
import UpcomingAppointmentCard from './components/UpcomingAppointmentCard';
import QuickActionsGrid from './components/QuickActionsGrid';

const APPOINTMENT = { date: 'Utorok, 1. Apríla · 10:30', doctor: 'MDDr. Loderer', type: 'Preventívna' };

export default function PatientHome() {
  const router = useRouter();
  const { profile, hasHealthPassport, loading, refetch } = useProfile();

  // Znova načítaj po návrate z health-passport formulára
  useFocusEffect(useCallback(() => { refetch(); }, []));

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  const displayName = profile?.full_name ?? 'Pacient';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Hlavička ── */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>VITAJ SPÄŤ</Text>
          {loading
            ? <ActivityIndicator color={COLORS.sand} size="small" style={{ alignSelf: 'flex-start', marginTop: 4 }} />
            : <Text style={styles.headerTitle}>Ahoj, {displayName}! 👋</Text>}
        </View>
        <TouchableOpacity style={styles.avatar} onPress={handleSignOut} activeOpacity={0.8}>
          <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── ⚠️ Health Passport Banner ── */}
        {!loading && !hasHealthPassport && (
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
        <View style={styles.body}><Text style={styles.sectionLabel}>NAJBLIŽŠÍ TERMÍN</Text></View>
        <UpcomingAppointmentCard date={APPOINTMENT.date} doctor={APPOINTMENT.doctor} type={APPOINTMENT.type} />

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
              Tvoje skóre sa zlepšilo o 4 body od poslednej návštevy.
              Odporúčame zubné nite aspoň raz denne. 🎉
            </Text>
          </View>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },

  header: {
    backgroundColor: COLORS.esp,
    paddingHorizontal: SIZES.padding + 4, paddingTop: 20, paddingBottom: 22,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerLabel: { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '500', textTransform: 'uppercase', marginBottom: 4 },
  headerTitle: { fontSize: 22, fontWeight: '500', color: '#fff' },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: COLORS.wal, borderWidth: 2, borderColor: COLORS.sand,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 17, fontWeight: '700', color: COLORS.cream },

  hpBanner: {
    backgroundColor: '#FAE8E5', borderWidth: 1.5, borderColor: '#CC7060',
    borderRadius: SIZES.radius, marginHorizontal: SIZES.padding,
    marginTop: 16, marginBottom: 4, paddingVertical: 13, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  hpBannerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  hpIcon:  { fontSize: 22 },
  hpTitle: { fontSize: 14, fontWeight: '700', color: '#8C2A18', marginBottom: 2 },
  hpSub:   { fontSize: 11, color: '#a84030', lineHeight: 16 },

  body: { paddingHorizontal: SIZES.padding, paddingTop: 18, paddingBottom: 8 },
  sectionLabel: { fontSize: 9, letterSpacing: 2, color: COLORS.wal, fontWeight: '500', textTransform: 'uppercase', marginBottom: 9 },

  alertCard: {
    backgroundColor: '#FAE8E5', borderWidth: 1, borderColor: '#CC7060',
    borderRadius: SIZES.radius, padding: 12, flexDirection: 'row', gap: 8, alignItems: 'flex-start',
  },
  alertText: { flex: 1, fontSize: 12, color: '#8C2A18', lineHeight: 18 },

  aiCard: { backgroundColor: COLORS.esp, borderRadius: SIZES.radius, padding: 14 },
  aiLabel: { fontSize: 9, color: 'rgba(255,255,255,0.38)', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: '500', marginBottom: 6 },
  aiText:  { fontSize: 13, color: COLORS.cream, lineHeight: 20 },
});
