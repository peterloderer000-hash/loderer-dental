import React, { useState, useEffect, useMemo } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { supabase } from '../../supabase';
import { COLORS, SIZES } from '../../styles/theme';

// ─── Vernostné body ───────────────────────────────────────────────────────────
const LEVELS = [
  { name: 'Bronz',   min: 0,    max: 299,  color: '#CD7F32', bg: '#FDF3E7', icon: '🥉' },
  { name: 'Striebro',min: 300,  max: 599,  color: '#A0A0A0', bg: '#F4F4F4', icon: '🥈' },
  { name: 'Zlato',   min: 600,  max: 999,  color: '#D4A017', bg: '#FEF9E7', icon: '🥇' },
  { name: 'Platina', min: 1000, max: 99999, color: '#6C3483', bg: '#F5EEF8', icon: '💎' },
];

function getLoyaltyLevel(points: number) {
  return LEVELS.find((l) => points >= l.min && points <= l.max) ?? LEVELS[0];
}

function LoyaltyCard({ completed }: { completed: number }) {
  const points    = completed * 100;
  const level     = getLoyaltyLevel(points);
  const nextLevel = LEVELS[LEVELS.indexOf(level) + 1];
  const progress  = nextLevel
    ? (points - level.min) / (nextLevel.min - level.min)
    : 1;

  return (
    <View style={[loyStyles.card, { backgroundColor: level.bg, borderColor: level.color + '55' }]}>
      <View style={loyStyles.header}>
        <Text style={loyStyles.icon}>{level.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={loyStyles.title}>Vernostné body</Text>
          <Text style={[loyStyles.level, { color: level.color }]}>{level.name}</Text>
        </View>
        <View style={[loyStyles.pointsBadge, { backgroundColor: level.color }]}>
          <Text style={loyStyles.pointsNum}>{points}</Text>
          <Text style={loyStyles.pointsLabel}>bodov</Text>
        </View>
      </View>

      {nextLevel && (
        <>
          <View style={loyStyles.progressBg}>
            <View style={[loyStyles.progressFill, { width: `${Math.round(progress * 100)}%` as any, backgroundColor: level.color }]} />
          </View>
          <Text style={[loyStyles.progressLabel, { color: level.color }]}>
            {nextLevel.min - points} bodov do úrovne {nextLevel.name} {nextLevel.icon}
          </Text>
        </>
      )}

      <View style={loyStyles.infoRow}>
        <Ionicons name="information-circle-outline" size={13} color={level.color} />
        <Text style={[loyStyles.infoText, { color: level.color }]}>
          {points >= 1000
            ? '💎 Platina — získavaš 15 % zľavu na každú návštevu!'
            : points >= 600
            ? '🥇 Zlato — získavaš 10 % zľavu na každú návštevu'
            : points >= 300
            ? '🥈 Striebro — získavaš 5 % zľavu na každú návštevu'
            : '100 bodov za každú absolvovanú návštevu'}
        </Text>
      </View>
    </View>
  );
}

const loyStyles = StyleSheet.create({
  card:         { borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1.5 },
  header:       { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  icon:         { fontSize: 32 },
  title:        { fontSize: 9, fontWeight: '700', color: COLORS.wal, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 2 },
  level:        { fontSize: 18, fontWeight: '800' },
  pointsBadge:  { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center' },
  pointsNum:    { fontSize: 22, fontWeight: '800', color: '#fff', lineHeight: 26 },
  pointsLabel:  { fontSize: 8, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: 1 },
  progressBg:   { height: 8, backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 4, marginBottom: 6, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  progressLabel:{ fontSize: 10, fontWeight: '600', marginBottom: 12, textAlign: 'center' },
  infoRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  infoText:     { flex: 1, fontSize: 11, lineHeight: 16 },
});

type ApptStats = { total: number; completed: number; upcoming: number; lastVisit: string | null };

export default function ProfileScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [fullName, setFullName]   = useState('');
  const [phone, setPhone]         = useState('');
  const [email, setEmail]         = useState('');
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [hasPassport, setHasPassport] = useState(false);
  const [apptStats, setApptStats] = useState<ApptStats>({ total: 0, completed: 0, upcoming: 0, lastVisit: null });

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setEmail(user.email ?? '');
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (data) {
        setFullName(data.full_name ?? '');
        setPhone(data.phone_number ?? '');
      }
      const { data: pp } = await supabase.from('health_passports').select('patient_id').eq('patient_id', user.id).maybeSingle();
      setHasPassport(!!pp);

      // Štatistiky termínov
      const { data: appts } = await supabase
        .from('appointments').select('status, appointment_date').eq('patient_id', user.id);
      if (appts) {
        const now       = new Date();
        const total     = appts.length;
        const completed = appts.filter((a) => a.status === 'completed').length;
        const upcoming  = appts.filter((a) => a.status === 'scheduled' && new Date(a.appointment_date) > now).length;
        const past      = appts.filter((a) => a.status === 'completed').sort(
          (a, b) => new Date(b.appointment_date).getTime() - new Date(a.appointment_date).getTime()
        );
        const lastVisit = past[0]
          ? new Date(past[0].appointment_date).toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' })
          : null;
        setApptStats({ total, completed, upcoming, lastVisit });
      }

      setLoading(false);
    }
    load();
  }, []);

  async function handleSave() {
    if (!fullName.trim()) { Alert.alert('Chyba', 'Zadaj meno.'); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { error } = await supabase.from('profiles').update({
      full_name: fullName.trim(),
      phone_number: phone.trim() || null,
    }).eq('id', user.id);
    setSaving(false);
    if (error) Alert.alert('Chyba', error.message);
    else Alert.alert('Uložené ✓', 'Profil bol aktualizovaný.');
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    const parent = navigation.getParent() ?? navigation;
    parent.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'index' }] }));
  }

  const initials = fullName.trim().split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={COLORS.wal} size="large" /></View>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Avatar */}
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <Text style={styles.avatarName}>{fullName || 'Pacient'}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>🦷  Pacient</Text>
            </View>
          </View>

          {/* Štatistiky */}
          <View style={styles.statsRow}>
            {[
              { num: apptStats.total,     label: 'Termínov',   color: COLORS.wal,  bg: '#F4ECE4' },
              { num: apptStats.completed, label: 'Absolvovaných', color: '#1E8449', bg: '#EAFAF1' },
              { num: apptStats.upcoming,  label: 'Plánovaných', color: '#1A5276',  bg: '#EBF5FB' },
            ].map((s) => (
              <View key={s.label} style={[styles.statBox, { backgroundColor: s.bg }]}>
                <Text style={[styles.statNum, { color: s.color }]}>{s.num}</Text>
                <Text style={[styles.statLabel, { color: s.color }]}>{s.label}</Text>
              </View>
            ))}
          </View>
          {apptStats.lastVisit && (
            <View style={styles.lastVisitRow}>
              <Ionicons name="time-outline" size={13} color={COLORS.wal} />
              <Text style={styles.lastVisitText}>Posledná návšteva: {apptStats.lastVisit}</Text>
            </View>
          )}

          {/* Vernostné body */}
          <LoyaltyCard completed={apptStats.completed} />

          {/* Osobné údaje */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>OSOBNÉ ÚDAJE</Text>

            <Text style={styles.label}>CELÉ MENO</Text>
            <TextInput style={styles.input} value={fullName} onChangeText={setFullName}
              placeholder="Meno a priezvisko" placeholderTextColor="#bbb"
              autoCapitalize="words" />

            <Text style={styles.label}>TELEFÓN</Text>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone}
              placeholder="+421 900 000 000" placeholderTextColor="#bbb"
              keyboardType="phone-pad" />

            <Text style={styles.label}>EMAIL</Text>
            <View style={styles.inputDisabled}>
              <Text style={styles.inputDisabledText}>{email}</Text>
            </View>

            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave} disabled={saving} activeOpacity={0.85}>
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>Uložiť zmeny</Text>}
            </TouchableOpacity>
          </View>

          {/* Rýchle skratky */}
          <Text style={styles.sectionTitle}>RÝCHLY PRÍSTUP</Text>
          {[
            { icon: 'clipboard-outline'    as const, label: 'Zdravotný dotazník', sub: hasPassport ? 'Vyplnený' : 'Nevyplnený', route: '/(patient)/health-passport', accent: hasPassport ? '#1E8449' : '#9A7D0A', bg: hasPassport ? '#EAFAF1' : '#FEF9E7' },
            { icon: 'bar-chart-outline'    as const, label: 'Dentálne skóre',     sub: 'Môj stav chrupu',          route: '/(patient)/score',            accent: '#1A5276',  bg: '#EBF5FB' },
            { icon: 'list-outline'         as const, label: 'História termínov',  sub: `${apptStats.total} termínov`, route: '/(patient)/appointments',    accent: COLORS.wal, bg: '#F4ECE4' },
            { icon: 'chatbubble-outline'   as const, label: 'AI Dentálny asistent',sub: 'Otázky o zdraví zubov',  route: '/(patient)/chat',             accent: '#6C3483',  bg: '#F5EEF8' },
            { icon: 'bag-outline'          as const, label: 'Shop produktov',     sub: 'Odporúčané doktorom',      route: '/(patient)/shop',             accent: '#784212',  bg: '#FDEBD0' },
          ].map((item) => (
            <TouchableOpacity key={item.label} style={styles.navRow}
              onPress={() => router.push(item.route as any)} activeOpacity={0.8}>
              <View style={[styles.navIcon, { backgroundColor: item.bg }]}>
                <Ionicons name={item.icon} size={18} color={item.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.navLabel}>{item.label}</Text>
                <Text style={styles.navSub}>{item.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color={COLORS.bg3} />
            </TouchableOpacity>
          ))}

          <View style={{ height: 14 }} />

          {/* Odhlásiť */}
          <TouchableOpacity style={styles.logoutBtn} onPress={handleSignOut} activeOpacity={0.85}>
            <Ionicons name="log-out-outline" size={18} color="#922B21" />
            <Text style={styles.logoutText}>Odhlásiť sa</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.bg2 },
  scroll: { flex: 1 },
  content:{ padding: SIZES.padding },
  center: { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center' },

  avatarWrap: { alignItems: 'center', paddingVertical: 28 },
  avatar:     { width: 88, height: 88, borderRadius: 44, backgroundColor: COLORS.esp, alignItems: 'center', justifyContent: 'center', marginBottom: 12, borderWidth: 3, borderColor: COLORS.sand },
  avatarText: { fontSize: 32, fontWeight: '700', color: COLORS.cream },
  avatarName: { fontSize: 20, fontWeight: '700', color: COLORS.esp, marginBottom: 6 },
  roleBadge:  { backgroundColor: COLORS.bg3, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 5, borderWidth: 1, borderColor: COLORS.sand },
  roleText:   { fontSize: 12, fontWeight: '600', color: COLORS.wal },

  statsRow:     { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statBox:      { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  statNum:      { fontSize: 24, fontWeight: '800', lineHeight: 28 },
  statLabel:    { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 3, textAlign: 'center' },
  lastVisitRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14, paddingHorizontal: 4 },
  lastVisitText:{ fontSize: 11, color: COLORS.wal, fontStyle: 'italic' },

  card:      { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: COLORS.bg3 },
  cardTitle: { fontSize: 9, letterSpacing: 2, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 14 },

  label: { fontSize: 9, letterSpacing: 1.5, color: COLORS.wal, fontWeight: '600', textTransform: 'uppercase', marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.esp, backgroundColor: COLORS.bg2 },
  inputDisabled: { borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#f5f5f5' },
  inputDisabledText: { fontSize: 14, color: '#999' },

  saveBtn:     { backgroundColor: COLORS.esp, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 18 },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.cream },

  passportCard: { flexDirection: 'row', alignItems: 'center' },
  passportIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  passportTitle: { fontSize: 14, fontWeight: '600', color: COLORS.esp, marginBottom: 3 },
  passportSub:   { fontSize: 11, color: COLORS.wal },

  sectionTitle: { fontSize: 9, letterSpacing: 2, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },

  // Quick nav
  navRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.bg3 },
  navIcon:  { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  navLabel: { fontSize: 14, fontWeight: '600', color: COLORS.esp, marginBottom: 2 },
  navSub:   { fontSize: 11, color: COLORS.wal },

  logoutBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FDEDEC', borderRadius: 12, paddingVertical: 14, borderWidth: 1, borderColor: '#F1948A', marginBottom: 10 },
  logoutText: { fontSize: 14, fontWeight: '600', color: '#922B21' },
});
