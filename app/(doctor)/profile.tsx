import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { supabase } from '../../supabase';
import { COLORS, RADII, SHADOWS, TYPO, GRADIENTS } from '../../styles/theme';
import { SkeletonList } from '../../components/Skeleton';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../context/ThemeContext';
import { clearAllCache } from '../../utils/offlineCache';

const AVATAR_BUCKET = 'avatars';

export default function DoctorProfile() {
  const router     = useRouter();
  const navigation = useNavigation();
  const { colors, dark, toggle: toggleTheme } = useAppTheme();

  const [fullName,      setFullName]      = useState('');
  const [phone,         setPhone]         = useState('');
  const [specialty,     setSpecialty]     = useState('');
  const [email,         setEmail]         = useState('');
  const [avatarUrl,     setAvatarUrl]     = useState<string | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [uploading,     setUploading]     = useState(false);
  const [userId,        setUserId]        = useState('');
  const [stats,         setStats]         = useState({ total: 0, completed: 0, patients: 0, avgRating: 0 });
  // Profil ambulancie
  const [clinicName,    setClinicName]    = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [clinicIco,     setClinicIco]     = useState('');
  const [clinicDic,     setClinicDic]     = useState('');

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setEmail(user.email ?? '');
      setUserId(user.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, phone_number, specialty, avatar_url, clinic_name, clinic_address, clinic_ico, clinic_dic')
        .eq('id', user.id)
        .maybeSingle();

      if (profile) {
        setFullName(profile.full_name       ?? '');
        setPhone(profile.phone_number       ?? '');
        setSpecialty(profile.specialty      ?? '');
        setAvatarUrl(profile.avatar_url     ?? null);
        setClinicName(profile.clinic_name   ?? '');
        setClinicAddress(profile.clinic_address ?? '');
        setClinicIco(profile.clinic_ico     ?? '');
        setClinicDic(profile.clinic_dic     ?? '');
      }

      // Štatistiky doktora
      const { data: appts } = await supabase
        .from('appointments')
        .select('status, patient_id, patient_rating')
        .eq('doctor_id', user.id);

      if (appts) {
        const total     = appts.length;
        const completed = appts.filter((a) => a.status === 'completed').length;
        const patients  = new Set(appts.map((a) => a.patient_id)).size;
        const ratings   = appts.map((a) => a.patient_rating).filter(Boolean) as number[];
        const avgRating = ratings.length > 0
          ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10
          : 0;
        setStats({ total, completed, patients, avgRating });
      }
      setLoading(false);
    }
    load();
  }, []);

  // ── Uložiť profil ─────────────────────────────────────────────────────────
  async function handleSave() {
    if (!fullName.trim()) { Alert.alert('Chyba', 'Zadaj meno.'); return; }
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name:       fullName.trim(),
        phone_number:    phone.trim()         || null,
        specialty:       specialty.trim()     || null,
        clinic_name:     clinicName.trim()    || null,
        clinic_address:  clinicAddress.trim() || null,
        clinic_ico:      clinicIco.trim()     || null,
        clinic_dic:      clinicDic.trim()     || null,
      })
      .eq('id', userId);
    setSaving(false);
    if (error) Alert.alert('Chyba', error.message);
    else Alert.alert('Uložené ✓', 'Profil bol aktualizovaný.');
  }

  // ── Vybrať a nahrať fotku ─────────────────────────────────────────────────
  async function pickAndUpload() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Povolenie', 'Potrebujeme prístup k fotkám. Prosím, povoľ ho v nastaveniach.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]) return;

    setUploading(true);

    try {
      const asset = result.assets[0];

      // Fetch URI → ArrayBuffer → upload
      const response  = await fetch(asset.uri);
      const arrayBuf  = await response.arrayBuffer();
      const uint8Arr  = new Uint8Array(arrayBuf);

      const filePath = `${userId}/avatar.jpg`;

      const { error: upErr } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(filePath, uint8Arr, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (upErr) throw upErr;

      const { data: { publicUrl } } = supabase.storage
        .from(AVATAR_BUCKET)
        .getPublicUrl(filePath);

      // Cachebust pomocou timestamp
      const urlWithTs = `${publicUrl}?t=${Date.now()}`;

      await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);

      setAvatarUrl(urlWithTs);
    } catch (err: any) {
      Alert.alert('Chyba nahrávania', err?.message ?? 'Nepodarilo sa nahrať fotku.');
    } finally {
      setUploading(false);
    }
  }

  // ── Odhlásiť ─────────────────────────────────────────────────────────────
  async function handleSignOut() {
    await clearAllCache();
    await supabase.auth.signOut();
    const parent = navigation.getParent() ?? navigation;
    parent.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'index' }] }));
  }

  const initials = fullName.trim().split(' ').filter(Boolean)
    .map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?';

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg2, padding: 16 }}>
        <SkeletonList count={5} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={[styles.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* ── Hero ── */}
          <LinearGradient colors={GRADIENTS.hero as [string, string, ...string[]]} style={styles.hero}>
            <View style={[styles.heroCircle, { width: 180, height: 180, right: -40, top: -40 }]} />
            <Text style={styles.heroLabel}>MÔJ ÚČET</Text>

            {/* Avatar */}
            <TouchableOpacity style={styles.avatarWrap} onPress={pickAndUpload}
              activeOpacity={0.85} disabled={uploading}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" transition={200} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
              )}
              <View style={[styles.cameraBtn, uploading && { backgroundColor: COLORS.wal }]}>
                {uploading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="camera" size={14} color="#fff" />}
              </View>
            </TouchableOpacity>

            <Text style={styles.heroName}>{fullName || 'Doktor'}</Text>
            {specialty ? <Text style={styles.heroSpec}>{specialty}</Text> : null}
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>👨‍⚕️  Doktor</Text>
            </View>

            {/* Stat pills */}
            <View style={styles.statRow}>
              <HeroStat value={stats.total}     label="Termínov"   />
              <View style={styles.statSep} />
              <HeroStat value={stats.completed}  label="Hotových"   />
              <View style={styles.statSep} />
              <HeroStat value={stats.patients}   label="Pacientov"  />
              {stats.avgRating > 0 && <>
                <View style={styles.statSep} />
                <HeroStat value={stats.avgRating} label="Hodnotenie" />
              </>}
            </View>
          </LinearGradient>

          {/* ── Osobné údaje ── */}
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Text style={[styles.cardTitle, { color: colors.wal }]}>OSOBNÉ ÚDAJE</Text>

            <Text style={[styles.fieldLabel, { color: colors.wal }]}>CELÉ MENO</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.bg3, color: colors.textPrimary }]}
              value={fullName} onChangeText={setFullName}
              placeholder="Meno a priezvisko" placeholderTextColor={dark ? '#666' : '#bbb'} autoCapitalize="words" />

            <Text style={[styles.fieldLabel, { color: colors.wal }]}>ŠPECIALIZÁCIA / TITUL</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.bg3, color: colors.textPrimary }]}
              value={specialty} onChangeText={setSpecialty}
              placeholder="napr. MDDr., Ortodontia, Implantológia..."
              placeholderTextColor={dark ? '#666' : '#bbb'} autoCapitalize="words" />

            <Text style={[styles.fieldLabel, { color: colors.wal }]}>TELEFÓN</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.bg3, color: colors.textPrimary }]}
              value={phone} onChangeText={setPhone}
              placeholder="+421 900 000 000" placeholderTextColor={dark ? '#666' : '#bbb'} keyboardType="phone-pad" />

            <Text style={[styles.fieldLabel, { color: colors.wal }]}>EMAIL</Text>
            <View style={[styles.inputDisabled, { backgroundColor: dark ? '#111' : '#f5f5f5', borderColor: colors.bg3 }]}>
              <Text style={[styles.inputDisabledText, { color: dark ? '#666' : '#999' }]}>{email}</Text>
              <Ionicons name="lock-closed-outline" size={14} color={dark ? '#555' : '#bbb'} />
            </View>

            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave} disabled={saving} activeOpacity={0.85}>
              <LinearGradient colors={GRADIENTS.gold as [string, string, ...string[]]} style={styles.saveGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Ionicons name="checkmark-circle" size={17} color="#fff" />
                      <Text style={styles.saveBtnText}>Uložiť zmeny</Text>
                    </>}
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* ── Profil ambulancie ── */}
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <View style={styles.clinicCardHeader}>
              <Ionicons name="business-outline" size={16} color={colors.wal} />
              <Text style={[styles.cardTitle, { color: colors.wal }]}>PROFIL AMBULANCIE</Text>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.wal }]}>NÁZOV AMBULANCIE</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.bg3, color: colors.textPrimary }]}
              value={clinicName} onChangeText={setClinicName}
              placeholder="napr. Zubná ambulancia Loderer" placeholderTextColor={dark ? '#666' : '#bbb'} autoCapitalize="words" />

            <Text style={[styles.fieldLabel, { color: colors.wal }]}>ADRESA</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.bg3, color: colors.textPrimary }]}
              value={clinicAddress} onChangeText={setClinicAddress}
              placeholder="napr. Hlavná 1, 040 01 Košice" placeholderTextColor={dark ? '#666' : '#bbb'} autoCapitalize="words" />

            <Text style={[styles.fieldLabel, { color: colors.wal }]}>IČO</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.bg3, color: colors.textPrimary }]}
              value={clinicIco} onChangeText={setClinicIco}
              placeholder="12345678" placeholderTextColor={dark ? '#666' : '#bbb'} keyboardType="numeric" maxLength={10} />

            <Text style={[styles.fieldLabel, { color: colors.wal }]}>DIČ (voliteľné)</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.bg3, color: colors.textPrimary }]}
              value={clinicDic} onChangeText={setClinicDic}
              placeholder="SK1234567890" placeholderTextColor={dark ? '#666' : '#bbb'} autoCapitalize="characters" maxLength={12} />

            <View style={[styles.clinicInfoBanner, { backgroundColor: dark ? '#0D2137' : '#EBF5FB', borderColor: dark ? '#1A4B70' : '#AED6F1' }]}>
              <Ionicons name="information-circle-outline" size={14} color={dark ? '#7FB3D3' : '#1A5276'} />
              <Text style={[styles.clinicInfoText, { color: dark ? '#7FB3D3' : '#1A5276' }]}>
                Tieto údaje sa zobrazia na všetkých faktúrach a PDF exportoch.
              </Text>
            </View>
          </View>

          {/* ── Nastavenia displeja ── */}
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Text style={[styles.cardTitle, { color: colors.wal }]}>NASTAVENIA</Text>
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Ionicons name={dark ? 'moon' : 'moon-outline'} size={20} color={colors.wal} />
                <View style={{ marginLeft: 12 }}>
                  <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>Tmavý režim</Text>
                  <Text style={[styles.toggleSub, { color: colors.textSecondary }]}>
                    {dark ? 'Zapnutý' : 'Vypnutý'}
                  </Text>
                </View>
              </View>
              <Switch
                value={dark}
                onValueChange={toggleTheme}
                trackColor={{ false: COLORS.bg3, true: COLORS.wal }}
                thumbColor={dark ? COLORS.cream : '#fff'}
                ios_backgroundColor={COLORS.bg3}
              />
            </View>
          </View>

          {/* ── Prevádzka kliniky ── */}
          <View style={styles.clinicOpsCard}>
            <View style={styles.clinicOpsHeader}>
              <Ionicons name="pulse-outline" size={16} color={COLORS.cream} />
              <Text style={styles.clinicOpsTitle}>PREVÁDZKA KLINIKY</Text>
            </View>
            <View style={styles.clinicOpsGrid}>
              {[
                { icon: 'pulse-outline'      as const, label: 'Live prehľad',     sub: 'Dnešné termíny',      route: '/(doctor)/clinic-live',      color: '#27AE60' },
                { icon: 'bed-outline'        as const, label: 'Kreslo',           sub: 'Tablet / ambulancia', route: '/(doctor)/clinic-room',      color: '#2980B9' },
                { icon: 'bar-chart-outline'  as const, label: 'Dashboard',        sub: 'Denné metriky',       route: '/(doctor)/clinic-dashboard', color: '#8E44AD' },
                { icon: 'sparkles-outline'   as const, label: 'AI asistent',      sub: 'Opýtaj sa AI',        route: '/(doctor)/clinic-ai',        color: '#E67E22' },
              ].map(item => (
                <TouchableOpacity
                  key={item.label}
                  style={styles.clinicOpsBtn}
                  onPress={() => router.push(item.route as any)}
                  activeOpacity={0.82}
                >
                  <View style={[styles.clinicOpsBtnIcon, { backgroundColor: item.color + '22' }]}>
                    <Ionicons name={item.icon} size={20} color={item.color} />
                  </View>
                  <Text style={styles.clinicOpsBtnLabel}>{item.label}</Text>
                  <Text style={styles.clinicOpsBtnSub}>{item.sub}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Rýchly prístup ── */}
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Text style={[styles.cardTitle, { color: colors.wal }]}>RÝCHLY PRÍSTUP</Text>
            {[
              { icon: 'time-outline'        as const, label: 'Ordinačné hodiny',  sub: 'Spravovať rozvrh',         route: '/(doctor)/opening-hours' },
              { icon: 'lock-closed-outline' as const, label: 'Blokovanie času',   sub: 'Obed, dovolenka, schôdzka', route: '/(doctor)/time-blocks' },
              { icon: 'medical-outline'     as const, label: 'Správa služieb',    sub: 'Ošetrenia a cenník',        route: '/(doctor)/services' },
              { icon: 'stats-chart-outline' as const, label: 'Štatistiky praxe',  sub: 'Prehľad výkonnosti',       route: '/(doctor)/stats' },
              { icon: 'people-outline'      as const, label: 'Pacienti',           sub: `${stats.patients} reg.`,   route: '/(doctor)/patients' },
              { icon: 'calendar-outline'    as const, label: 'Kalendár termínov', sub: 'Týždenný prehľad',         route: '/(doctor)/calendar' },
              { icon: 'chatbubble-outline'  as const, label: 'Správy pacientov',  sub: 'Konverzácie',              route: '/(doctor)/messages' },
              { icon: 'megaphone-outline'   as const, label: 'Hromadná správa',   sub: 'Broadcast notifikácii',    route: '/(doctor)/broadcast' },
            ].map((item, idx, arr) => (
              <TouchableOpacity key={item.label}
                style={[styles.navRow, { borderBottomColor: colors.bg3 }, idx === arr.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() => router.push(item.route as any)} activeOpacity={0.8}>
                <View style={[styles.navIcon, { backgroundColor: dark ? colors.bg3 : '#F4ECE4' }]}>
                  <Ionicons name={item.icon} size={18} color={colors.wal} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.navLabel, { color: colors.textPrimary }]}>{item.label}</Text>
                  <Text style={[styles.navSub, { color: colors.textSecondary }]}>{item.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={15} color={colors.bg3} />
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Info ── */}
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Text style={[styles.cardTitle, { color: colors.wal }]}>BEZPEČNOSŤ</Text>
            {[
              { icon: 'shield-checkmark-outline', text: 'Vaše dáta sú šifrované a bezpečné.' },
              { icon: 'lock-closed-outline',      text: 'Prístup k pacientskym záznamom je chránený.' },
              { icon: 'people-outline',           text: 'Pacienti vás vidia len ako MDDr. v zozname.' },
            ].map((item) => (
              <View key={item.text} style={styles.infoRow}>
                <Ionicons name={item.icon as any} size={16} color={colors.wal} />
                <Text style={[styles.infoText, { color: colors.textSecondary }]}>{item.text}</Text>
              </View>
            ))}
          </View>

          {/* ── Odhlásiť ── */}
          <TouchableOpacity style={styles.logoutBtn} onPress={handleSignOut} activeOpacity={0.85}>
            <Ionicons name="log-out-outline" size={18} color="#922B21" />
            <Text style={styles.logoutText}>Odhlásiť sa</Text>
          </TouchableOpacity>

          <View style={{ alignItems: 'center', paddingVertical: 24 }}>
            <Text style={{ fontSize: 11, color: '#C4A882', fontFamily: 'DMSans_400Regular' }}>
              Loderer Dental v{Constants.expoConfig?.version ?? '1.0.0'}
            </Text>
            <Text style={{ fontSize: 10, color: '#C4A882', marginTop: 2, fontFamily: 'DMSans_400Regular' }}>
              Build: 2026-05-02 • OTA aktívne
            </Text>
          </View>
          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── HeroStat helper ──────────────────────────────────────────────────────────
function HeroStat({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontFamily: 'PlayfairDisplay_700Bold', fontSize: 22, color: '#FAF6F0', lineHeight: 26 }}>{value}</Text>
      <Text style={{ fontFamily: 'DMSans_500Medium', fontSize: 9, color: 'rgba(196,168,130,0.7)', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 2 }}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1 },
  content:{ padding: 16, paddingBottom: 120 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  hero:       { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, alignItems: 'center', overflow: 'hidden', gap: 6 },
  heroCircle: { position: 'absolute', borderRadius: 999, backgroundColor: '#FAF6F0', opacity: 0.05 },
  heroLabel:  { ...TYPO.overline, color: COLORS.sand, marginBottom: 8 },
  heroName:   { ...TYPO.h2, color: '#FAF6F0', marginBottom: 4 },
  heroSpec:   { ...TYPO.body, color: 'rgba(196,168,130,0.75)', marginBottom: 6 },

  // ── Avatar ──
  avatarWrap:       { position: 'relative', marginBottom: 12 },
  avatar:           { width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: COLORS.sand },
  avatarPlaceholder:{ backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  avatarText:       { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 30, color: COLORS.cream },
  cameraBtn:        {
    position: 'absolute', bottom: 0, right: -4,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.esp,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  roleBadge:  { backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: RADII.full, paddingHorizontal: 14, paddingVertical: 5, marginBottom: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  roleText:   { fontFamily: 'DMSans_500Medium', fontSize: 12, color: COLORS.sand },

  statRow: { flexDirection: 'row', alignItems: 'center', width: '100%', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: RADII.md, paddingVertical: 12, paddingHorizontal: 8 },
  statSep: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.12)' },

  // ── Karta ──
  card:      { borderRadius: RADII.lg, padding: 16, marginBottom: 12, borderWidth: 1, ...SHADOWS.sm },
  cardTitle: { ...TYPO.label, marginBottom: 14 },

  fieldLabel: { ...TYPO.overline, marginBottom: 6, marginTop: 12 },
  input:       { borderWidth: 1, borderRadius: RADII.sm, paddingHorizontal: 14, paddingVertical: 12, ...TYPO.body },
  inputDisabled:    { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: RADII.sm, paddingHorizontal: 14, paddingVertical: 12 },
  inputDisabledText:{ flex: 1, ...TYPO.body },

  saveBtn:     { borderRadius: RADII.md, overflow: 'hidden', marginTop: 18 },
  saveGrad:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  saveBtnText: { ...TYPO.btnText, color: '#fff' },

  // ── Ambulancia ──
  clinicCardHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  clinicInfoBanner:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: RADII.sm, padding: 10, borderWidth: 1, marginTop: 14 },
  clinicInfoText:    { flex: 1, ...TYPO.bodySm, lineHeight: 16 },

  // ── Nav ──
  navRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1 },
  navIcon:  { width: 38, height: 38, borderRadius: RADII.sm, alignItems: 'center', justifyContent: 'center' },
  navLabel: { ...TYPO.bodyMed, marginBottom: 1 },
  navSub:   { ...TYPO.bodySm },

  // ── Info ──
  infoRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  infoText: { flex: 1, ...TYPO.bodySm, lineHeight: 18 },

  // ── Logout ──
  logoutBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.errorBg, borderRadius: RADII.md, paddingVertical: 14, borderWidth: 1, borderColor: '#F1948A' },
  logoutText: { ...TYPO.bodyMed, color: COLORS.error },

  // ── Prevádzka kliniky ──
  clinicOpsCard: {
    backgroundColor: COLORS.esp, borderRadius: RADII.lg, padding: 16,
    marginBottom: 12, borderWidth: 1.5, borderColor: COLORS.wal,
  },
  clinicOpsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  clinicOpsTitle:  { ...TYPO.label, color: COLORS.sand },
  clinicOpsGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  clinicOpsBtn: {
    width: '47%', backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: RADII.md, padding: 12, gap: 5,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  clinicOpsBtnIcon: {
    width: 36, height: 36, borderRadius: RADII.sm,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  clinicOpsBtnLabel: { ...TYPO.bodyMed, color: '#fff' },
  clinicOpsBtnSub:   { ...TYPO.bodySm, color: COLORS.sand },

  // ── Dark mode toggle ──
  toggleRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleInfo:  { flexDirection: 'row', alignItems: 'center', flex: 1 },
  toggleLabel: { ...TYPO.bodyMed },
  toggleSub:   { ...TYPO.bodySm, marginTop: 1 },
});
