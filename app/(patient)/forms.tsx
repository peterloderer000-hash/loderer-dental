/**
 * Centrum formulárov — pacient
 * Agreguje: pending consenty, health passport stav, predtermínové dotazníky
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../supabase';
import { COLORS, RADII, SHADOWS, SPACING, TYPO } from '../../styles/theme';
import { useAppTheme } from '../../context/ThemeContext';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';

type ConsentItem = {
  id: string;
  status: string;
  created_at: string;
  form: { title: string } | null;
};

type UpcomingAppt = {
  id: string;
  appointment_date: string;
  notes: string | null;
  service: { name: string; emoji: string | null } | null;
};

export default function FormsHubScreen() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [consents, setConsents] = useState<ConsentItem[]>([]);
  const [hasHealthPassport, setHasHealthPassport] = useState(false);
  const [upcomingAppts, setUpcomingAppts] = useState<UpcomingAppt[]>([]);

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [consentsRes, hpRes, apptsRes] = await Promise.all([
        supabase
          .from('patient_consents')
          .select('id, status, created_at, form:consent_forms(title)')
          .eq('patient_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('health_passports')
          .select('id')
          .eq('patient_id', user.id)
          .maybeSingle(),
        supabase
          .from('appointments')
          .select('id, appointment_date, notes, service:services(name, emoji)')
          .eq('patient_id', user.id)
          .eq('status', 'scheduled')
          .gte('appointment_date', new Date().toISOString())
          .order('appointment_date')
          .limit(5),
      ]);

      setConsents((consentsRes.data ?? []) as unknown as ConsentItem[]);
      setHasHealthPassport(!!hpRes.data);
      setUpcomingAppts((apptsRes.data ?? []) as unknown as UpcomingAppt[]);
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pendingConsents = useMemo(() => consents.filter(c => c.status === 'pending'), [consents]);
  const signedConsents = useMemo(() => consents.filter(c => c.status === 'signed'), [consents]);

  // Termíny do 48h kde ešte nie je vyplnený dotazník
  const questionnairesNeeded = useMemo(() => {
    const now = Date.now();
    return upcomingAppts.filter(a => {
      const hoursUntil = (new Date(a.appointment_date).getTime() - now) / (3600000);
      return hoursUntil > 0 && hoursUntil <= 48;
    });
  }, [upcomingAppts]);

  const pendingCount = pendingConsents.length + (hasHealthPassport ? 0 : 1) + questionnairesNeeded.length;

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg2 }]} edges={['top']}>
        <Header dark={dark} colors={colors} router={router} />
        <View style={{ padding: SPACING.lg }}><SkeletonList count={4} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg2 }]} edges={['top']}>
      <Header dark={dark} colors={colors} router={router} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.wal} colors={[COLORS.wal]} />}
      >
        {/* Status banner */}
        {pendingCount > 0 ? (
          <View style={[styles.statusBanner, { backgroundColor: dark ? '#2D2200' : '#FEF9E7', borderColor: dark ? '#F39C1244' : '#F9E79F' }]}>
            <Ionicons name="alert-circle" size={20} color="#F39C12" />
            <Text style={[styles.statusText, { color: dark ? '#F0A030' : '#7D6608' }]}>
              {pendingCount} {pendingCount === 1 ? 'formulár čaká' : pendingCount < 5 ? 'formuláre čakajú' : 'formulárov čaká'} na vyplnenie
            </Text>
          </View>
        ) : (
          <View style={[styles.statusBanner, { backgroundColor: dark ? '#0D3B1F' : '#EAFAF1', borderColor: dark ? '#27AE6044' : '#A9DFBF' }]}>
            <Ionicons name="checkmark-circle" size={20} color="#27AE60" />
            <Text style={[styles.statusText, { color: dark ? '#58D68D' : '#1E8449' }]}>
              Všetky formuláre sú vyplnené
            </Text>
          </View>
        )}

        {/* ── HEALTH PASSPORT ── */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>ZDRAVOTNÝ PAS</Text>
        <TouchableOpacity
          style={[styles.formCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}
          onPress={() => router.push('/(patient)/health-passport')}
          activeOpacity={0.85}
        >
          <View style={[styles.formIcon, { backgroundColor: dark ? '#1E0D33' : '#F5EEF8' }]}>
            <Text style={{ fontSize: 22 }}>🏥</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.formTitle, { color: colors.textPrimary }]}>Zdravotný pas</Text>
            <Text style={[styles.formSub, { color: colors.textSecondary }]}>
              Alergie, lieky, anamnéza, kontakt na blízku osobu
            </Text>
          </View>
          <View style={[styles.formStatus, {
            backgroundColor: hasHealthPassport
              ? (dark ? '#0D3B1F' : '#EAFAF1')
              : (dark ? '#2D2200' : '#FEF9E7'),
          }]}>
            <Text style={[styles.formStatusText, {
              color: hasHealthPassport ? (dark ? '#58D68D' : '#1E8449') : (dark ? '#F0A030' : '#7D6608'),
            }]}>
              {hasHealthPassport ? '✅ Vyplnený' : '⏳ Nevyplnený'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* ── PREDTERMÍNOVÉ DOTAZNÍKY ── */}
        {questionnairesNeeded.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 20 }]}>PREDTERMÍNOVÉ DOTAZNÍKY</Text>
            {questionnairesNeeded.map(appt => (
              <TouchableOpacity
                key={appt.id}
                style={[styles.formCard, { backgroundColor: dark ? '#0D2233' : '#EBF5FB', borderColor: dark ? '#1A527644' : '#AED6F1' }]}
                onPress={() => router.push({ pathname: '/(patient)/pre-questionnaire' as any, params: { appointmentId: appt.id } })}
                activeOpacity={0.85}
              >
                <View style={[styles.formIcon, { backgroundColor: dark ? '#1A3A5C' : '#D4E6F1' }]}>
                  <Text style={{ fontSize: 22 }}>{appt.service?.emoji ?? '📋'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formTitle, { color: colors.textPrimary }]}>Dotazník pred návštevou</Text>
                  <Text style={[styles.formSub, { color: colors.textSecondary }]}>
                    {appt.service?.name ?? 'Termín'} · {new Date(appt.appointment_date).toLocaleDateString('sk-SK', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={dark ? '#5DADE2' : '#1A5276'} />
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* ── INFORMOVANÉ SÚHLASY ── */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 20 }]}>INFORMOVANÉ SÚHLASY</Text>

        {pendingConsents.length > 0 && (
          <>
            <Text style={[styles.subLabel, { color: dark ? '#F0A030' : '#7D6608' }]}>⏳ Čakajúce na podpis</Text>
            {pendingConsents.map(c => (
              <TouchableOpacity
                key={c.id}
                style={[styles.formCard, { backgroundColor: dark ? '#2D2200' : '#FEF9E7', borderColor: dark ? '#F39C1244' : '#F9E79F' }]}
                onPress={() => router.push('/(patient)/consents')}
                activeOpacity={0.85}
              >
                <View style={[styles.formIcon, { backgroundColor: dark ? '#3D2A00' : '#FDE8C0' }]}>
                  <Ionicons name="document-text" size={22} color="#F39C12" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formTitle, { color: colors.textPrimary }]}>{c.form?.title ?? 'Súhlas'}</Text>
                  <Text style={[styles.formSub, { color: colors.textSecondary }]}>
                    Pridaný {new Date(c.created_at).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
                <View style={[styles.formStatus, { backgroundColor: dark ? '#4A3000' : '#FEF3C7' }]}>
                  <Text style={[styles.formStatusText, { color: dark ? '#F0A030' : '#92400E' }]}>Podpísať</Text>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        {signedConsents.length > 0 && (
          <>
            <Text style={[styles.subLabel, { color: dark ? '#58D68D' : '#1E8449' }]}>✅ Podpísané</Text>
            {signedConsents.slice(0, 5).map(c => (
              <TouchableOpacity
                key={c.id}
                style={[styles.formCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}
                onPress={() => router.push('/(patient)/consents')}
                activeOpacity={0.85}
              >
                <View style={[styles.formIcon, { backgroundColor: dark ? '#0D3B1F' : '#EAFAF1' }]}>
                  <Ionicons name="checkmark-circle" size={22} color="#27AE60" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formTitle, { color: colors.textPrimary }]}>{c.form?.title ?? 'Súhlas'}</Text>
                  <Text style={[styles.formSub, { color: colors.textSecondary }]}>Podpísaný</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </>
        )}

        {consents.length === 0 && (
          <EmptyState
            icon="document-text-outline"
            title="Žiadne súhlasy"
            subtitle="Doktor vám zatiaľ nezaslal žiadne informované súhlasy."
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────
function Header({ dark, colors, router }: { dark: boolean; colors: any; router: any }) {
  return (
    <View style={[styles.header, { backgroundColor: COLORS.esp }]}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
        <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
      </TouchableOpacity>
      <View>
        <Text style={styles.headerTitle}>Formuláre</Text>
        <Text style={styles.headerSub}>Súhlasy, dotazníky, zdravotný pas</Text>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: COLORS.bg2 },
  header:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SPACING.lg, paddingTop: 14, paddingBottom: 16 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 19, fontWeight: '600', color: '#fff' },
  headerSub:   { fontSize: 11, color: COLORS.sand, marginTop: 1 },

  statusBanner:    { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: RADII.md, borderWidth: 1.5, padding: 14, marginBottom: 20 },
  statusText:      { fontSize: 13, fontWeight: '600', flex: 1 },

  sectionLabel:    { fontSize: 9, letterSpacing: 2, fontWeight: '700', textTransform: 'uppercase', marginBottom: 10, marginTop: 4 },
  subLabel:        { fontSize: 12, fontWeight: '700', marginBottom: 8, marginTop: 4 },

  formCard:        { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: RADII.lg, borderWidth: 1.5, padding: 14, marginBottom: 10, ...SHADOWS.sm },
  formIcon:        { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  formTitle:       { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  formSub:         { fontSize: 12 },
  formStatus:      { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  formStatusText:  { fontSize: 10, fontWeight: '700' },
});
