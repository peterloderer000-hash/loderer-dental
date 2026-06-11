import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
// navigation removed — using expo-router instead
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabase';
import { COLORS, RADII, SHADOWS, TYPO, GRADIENTS } from '../../styles/theme';
import { SkeletonList } from '../../components/Skeleton';
import { pluralizeAppointments } from '../../utils/pluralize';
import { useAppTheme } from '../../context/ThemeContext';
import { clearAllCache } from '../../utils/offlineCache';
import { setAppLanguage } from '../../i18n';

const AVATAR_BUCKET = 'avatars';

// ─── Loyalty card ─────────────────────────────────────────────────────────────
const LEVELS = [
  { key: 'bronze'  as const, min: 0,    max: 299,   color: '#CD7F32', bg: '#FDF3E7', icon: '🥉' },
  { key: 'silver'  as const, min: 300,  max: 599,   color: '#A0A0A0', bg: '#F4F4F4', icon: '🥈' },
  { key: 'gold'    as const, min: 600,  max: 999,   color: '#D4A017', bg: '#FEF9E7', icon: '🥇' },
  { key: 'platinum'as const, min: 1000, max: 99999, color: '#6C3483', bg: '#F5EEF8', icon: '💎' },
];

function getLoyaltyLevel(points: number) {
  return LEVELS.find(l => points >= l.min && points <= l.max) ?? LEVELS[0];
}

function LoyaltyCard({ completed }: { completed: number }) {
  const { t } = useTranslation();
  const points    = completed * 100;
  const level     = getLoyaltyLevel(points);
  const nextLevel = LEVELS[LEVELS.indexOf(level) + 1];
  const progress  = nextLevel ? (points - level.min) / (nextLevel.min - level.min) : 1;

  const levelName = t(`profile.loyalty.${level.key}`);
  const nextName  = nextLevel ? t(`profile.loyalty.${nextLevel.key}`) : '';

  return (
    <View style={[loy.card, { backgroundColor: level.bg, borderColor: level.color + '55' }]}>
      <View style={loy.header}>
        <Text style={loy.icon}>{level.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={loy.title}>{t('profile.loyalty.title')}</Text>
          <Text style={[loy.level, { color: level.color }]}>{levelName}</Text>
        </View>
        <View style={[loy.badge, { backgroundColor: level.color }]}>
          <Text style={loy.badgeNum}>{points}</Text>
          <Text style={loy.badgeLabel}>{t('profile.loyalty.points')}</Text>
        </View>
      </View>

      {nextLevel && (
        <>
          <View style={loy.progressBg}>
            <View style={[loy.progressFill, { width: `${Math.round(progress * 100)}%` as any, backgroundColor: level.color }]} />
          </View>
          <Text style={[loy.progressLabel, { color: level.color }]}>
            {nextLevel.min - points} {t('profile.loyalty.toLevel')} {nextName} {nextLevel.icon}
          </Text>
        </>
      )}

      <View style={loy.infoRow}>
        <Ionicons name="information-circle-outline" size={13} color={level.color} />
        <Text style={[loy.infoText, { color: level.color }]}>
          {points >= 1000
            ? t('profile.loyalty.infoPlatinum')
            : points >= 600
            ? t('profile.loyalty.infoGold')
            : points >= 300
            ? t('profile.loyalty.infoSilver')
            : t('profile.loyalty.infoBronze')}
        </Text>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
type ApptStats = { total: number; completed: number; upcoming: number; lastVisit: string | null };

export default function ProfileScreen() {
  const router     = useRouter();
  const { colors, dark, toggle: toggleTheme } = useAppTheme();
  const { t, i18n: i18nInst } = useTranslation();
  const [lang, setLang] = useState<'sk' | 'en'>(
    (i18nInst.language?.startsWith('en') ? 'en' : 'sk') as 'sk' | 'en'
  );
  const [fullName,    setFullName]    = useState('');
  const [phone,       setPhone]       = useState('');
  const [email,       setEmail]       = useState('');
  const [avatarUrl,   setAvatarUrl]   = useState<string | null>(null);
  const [userId,      setUserId]      = useState('');
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [hasPassport, setHasPassport] = useState(false);
  const [apptStats,   setApptStats]   = useState<ApptStats>({ total: 0, completed: 0, upcoming: 0, lastVisit: null });
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [rxList,   setRxList]   = useState<{ id: string; medication: string; created_at: string }[]>([]);
  const [planList, setPlanList] = useState<{ id: string; title: string; created_at: string }[]>([]);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setEmail(user.email ?? '');
      setUserId(user.id);
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (data) {
        setFullName(data.full_name ?? '');
        setPhone(data.phone_number ?? '');
        setAvatarUrl(data.avatar_url ?? null);
        if (data.date_of_birth) {
          const [y, m, d] = data.date_of_birth.split('-');
          setDateOfBirth(`${d}.${m}.${y}`);
        }
      }
      const { data: pp } = await supabase.from('health_passports').select('patient_id').eq('patient_id', user.id).maybeSingle();
      setHasPassport(!!pp);

      const [{ data: rxData }, { data: planData }] = await Promise.all([
        supabase.from('prescriptions').select('id, medication, created_at').eq('patient_id', user.id).eq('is_active', true).order('created_at', { ascending: false }).limit(5),
        supabase.from('treatment_plans').select('id, title, created_at').eq('patient_id', user.id).eq('visible_to_patient', true).order('created_at', { ascending: false }),
      ]);
      setRxList((rxData ?? []) as { id: string; medication: string; created_at: string }[]);
      setPlanList((planData ?? []) as { id: string; title: string; created_at: string }[]);

      const { data: appts } = await supabase.from('appointments').select('status, appointment_date').eq('patient_id', user.id);
      if (appts) {
        const now       = new Date();
        const total     = appts.length;
        const completed = appts.filter(a => a.status === 'completed').length;
        const upcoming  = appts.filter(a => a.status === 'scheduled' && new Date(a.appointment_date) > now).length;
        const past      = appts.filter(a => a.status === 'completed')
          .sort((a, b) => new Date(b.appointment_date).getTime() - new Date(a.appointment_date).getTime());
        const lastVisit = past[0]
          ? new Date(past[0].appointment_date).toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' })
          : null;
        setApptStats({ total, completed, upcoming, lastVisit });
      }
      setLoading(false);
    }
    load();
  }, []);

  async function pickAndUpload() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert(t('profile.permissions.photoTitle'), t('profile.permissions.photoMsg')); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    try {
      const buf  = await (await fetch(result.assets[0].uri)).arrayBuffer();
      const path = `${userId}/avatar.jpg`;
      const { error: upErr } = await supabase.storage.from(AVATAR_BUCKET)
        .upload(path, new Uint8Array(buf), { contentType: 'image/jpeg', upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', userId);
      setAvatarUrl(`${publicUrl}?t=${Date.now()}`);
    } catch (e: any) {
      Alert.alert(t('profile.chyba'), e?.message ?? t('profile.uploadError'));
    } finally { setUploading(false); }
  }

  async function handleSave() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!fullName.trim()) { Alert.alert(t('profile.chyba'), t('profile.personal.errorName')); return; }
    let parsedDob: string | null = null;
    if (dateOfBirth.trim()) {
      const parts = dateOfBirth.trim().split('.');
      if (parts.length === 3) {
        const [d, m, y] = parts;
        if (d && m && y && y.length === 4) parsedDob = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
      if (!parsedDob) { Alert.alert(t('profile.chyba'), t('profile.personal.errorDob')); return; }
    }
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      full_name: fullName.trim(),
      phone_number: phone.trim() || null,
      date_of_birth: parsedDob,
    }).eq('id', userId);
    setSaving(false);
    if (error) Alert.alert(t('profile.chyba'), error.message);
    else Alert.alert(t('profile.personal.savedTitle'), t('profile.personal.savedMsg'));
  }

  async function handleSignOut() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await clearAllCache();
    await supabase.auth.signOut();
    if (Platform.OS === 'web') { window.location.href = '/'; } else { router.replace('/'); }
  }

  async function handleLanguage(l: 'sk' | 'en') {
    Haptics.selectionAsync();
    setLang(l);
    await setAppLanguage(l);
  }

  const initials = fullName.trim().split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg2, padding: 16 }}>
        <SkeletonList count={5} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.esp }} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero */}
          <LinearGradient colors={GRADIENTS.hero as [string, string, ...string[]]} style={s.hero}>
            <View style={[s.circle, { width: 180, height: 180, right: -50, top: -50, opacity: 0.06 }]} />

            {/* Avatar */}
            <TouchableOpacity onPress={pickAndUpload} disabled={uploading} style={s.avatarWrap} activeOpacity={0.85}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={s.avatar} contentFit="cover" transition={200} />
              ) : (
                <View style={[s.avatar, { alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={s.avatarInitials}>{initials}</Text>
                </View>
              )}
              <View style={s.cameraBtn}>
                {uploading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="camera" size={13} color="#fff" />}
              </View>
            </TouchableOpacity>

            <Text style={s.heroName}>{fullName || 'Pacient'}</Text>
            <View style={s.roleBadge}>
              <Text style={s.roleText}>{t('profile.role')}</Text>
            </View>

            {/* Stats row */}
            <View style={s.statRow}>
              <StatPill value={apptStats.total}     label={t('profile.stats.total')}     />
              <View style={s.statDivider} />
              <StatPill value={apptStats.completed}  label={t('profile.stats.completed')}  />
              <View style={s.statDivider} />
              <StatPill value={apptStats.upcoming}   label={t('profile.stats.upcoming')}   />
            </View>
          </LinearGradient>

          <View style={{ backgroundColor: colors.bg2, padding: 16, gap: 12 }}>
            {/* Last visit */}
            {apptStats.lastVisit && (
              <View style={[s.lastVisit, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <Ionicons name="time-outline" size={15} color={COLORS.gold} />
                <Text style={[s.lastVisitText, { color: colors.textSecondary }]}>
                  {t('profile.lastVisit')}{' '}<Text style={{ color: colors.textPrimary, fontFamily: 'DMSans_500Medium' }}>{apptStats.lastVisit}</Text>
                </Text>
              </View>
            )}

            {/* Loyalty */}
            <LoyaltyCard completed={apptStats.completed} />

            {/* Moje dokumenty */}
            {(rxList.length > 0 || planList.length > 0) && (
              <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <Text style={[s.cardTitle, { color: colors.textSecondary }]}>MOJE DOKUMENTY</Text>
                {planList.map((plan, idx) => (
                  <TouchableOpacity key={plan.id}
                    style={[docS.row, idx > 0 && { borderTopWidth: 1 }, { borderTopColor: colors.bg3 }]}
                    onPress={() => router.push('/(patient)/treatment-plan')}
                    activeOpacity={0.8}
                  >
                    <View style={[docS.icon, { backgroundColor: dark ? '#0D3B1F' : '#EAFAF1' }]}>
                      <Ionicons name="list-outline" size={16} color={dark ? '#27AE60' : '#1E8449'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[docS.name, { color: colors.textPrimary }]} numberOfLines={1}>{plan.title}</Text>
                      <Text style={[docS.date, { color: colors.textSecondary }]}>
                        Liečebný plán · {new Date(plan.created_at).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={COLORS.sand} />
                  </TouchableOpacity>
                ))}
                {rxList.map((rx, idx) => (
                  <TouchableOpacity key={rx.id}
                    style={[docS.row, (idx > 0 || planList.length > 0) && { borderTopWidth: 1 }, { borderTopColor: colors.bg3 }]}
                    onPress={() => router.push('/(patient)/prescriptions')}
                    activeOpacity={0.8}
                  >
                    <View style={[docS.icon, { backgroundColor: dark ? '#0D2233' : '#EBF5FB' }]}>
                      <Ionicons name="medical-outline" size={16} color={dark ? '#5DADE2' : '#1A5276'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[docS.name, { color: colors.textPrimary }]} numberOfLines={1}>💊 {rx.medication}</Text>
                      <Text style={[docS.date, { color: colors.textSecondary }]}>
                        Recept · {new Date(rx.created_at).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={COLORS.sand} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Settings card — dark mode + language */}
            <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <Text style={[s.cardTitle, { color: colors.textSecondary }]}>{t('profile.settings.title')}</Text>

              {/* Dark mode row */}
              <View style={s.toggleRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={[s.toggleIcon, { backgroundColor: dark ? COLORS.esp : COLORS.bg2 }]}>
                    <Ionicons name={dark ? 'moon' : 'moon-outline'} size={18} color={dark ? COLORS.sand : COLORS.wal} />
                  </View>
                  <View>
                    <Text style={[s.toggleLabel, { color: colors.textPrimary }]}>{t('profile.settings.darkMode')}</Text>
                    <Text style={[s.toggleSub, { color: colors.textSecondary }]}>{dark ? t('profile.settings.darkOn') : t('profile.settings.darkOff')}</Text>
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

              {/* Language row */}
              <View style={[s.toggleRow, { marginTop: 14 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={[s.toggleIcon, { backgroundColor: colors.bg2 }]}>
                    <Ionicons name="language-outline" size={18} color={COLORS.wal} />
                  </View>
                  <View>
                    <Text style={[s.toggleLabel, { color: colors.textPrimary }]}>{t('profile.settings.language')}</Text>
                    <Text style={[s.toggleSub, { color: colors.textSecondary }]}>
                      {lang === 'sk' ? t('profile.settings.languageSk') : t('profile.settings.languageEn')}
                    </Text>
                  </View>
                </View>
                {/* SK / EN pill toggle */}
                <View style={ls.langToggle}>
                  <TouchableOpacity
                    style={[ls.langBtn, lang === 'sk' && ls.langBtnActive]}
                    onPress={() => handleLanguage('sk')}
                    activeOpacity={0.7}
                  >
                    <Text style={[ls.langBtnText, lang === 'sk' && ls.langBtnTextActive]}>SK</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[ls.langBtn, lang === 'en' && ls.langBtnActive]}
                    onPress={() => handleLanguage('en')}
                    activeOpacity={0.7}
                  >
                    <Text style={[ls.langBtnText, lang === 'en' && ls.langBtnTextActive]}>EN</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Personal info */}
            <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <Text style={[s.cardTitle, { color: colors.textSecondary }]}>{t('profile.personal.title')}</Text>

              <InputField label={t('profile.personal.fullName')} value={fullName} onChange={setFullName}
                placeholder={t('profile.personal.namePlaceholder')} autoCapitalize="words" colors={colors} />
              <InputField label={t('profile.personal.phone')} value={phone} onChange={setPhone}
                placeholder={t('profile.personal.phonePlaceholder')} keyboardType="phone-pad" colors={colors} />
              <InputField label={t('profile.personal.dob')} value={dateOfBirth} onChange={setDateOfBirth}
                placeholder={t('profile.personal.dobPlaceholder')} keyboardType="numbers-and-punctuation" maxLength={10} colors={colors} />

              <Text style={[s.inputLabel, { color: colors.textSecondary }]}>{t('profile.personal.email')}</Text>
              <View style={[s.inputDisabled, { backgroundColor: colors.bg2, borderColor: colors.bg3 }]}>
                <Text style={[s.inputDisabledText, { color: colors.textSecondary }]}>{email}</Text>
              </View>

              <TouchableOpacity
                style={[s.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.85}
              >
                <LinearGradient colors={GRADIENTS.gold as [string, string, ...string[]]} style={s.saveGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  {saving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.saveBtnText}>{t('profile.personal.save')}</Text>}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Quick nav */}
            <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <Text style={[s.cardTitle, { color: colors.textSecondary }]}>{t('profile.quickAccess.title')}</Text>
              {[
                { icon: 'clipboard-outline'     as const, label: t('profile.quickAccess.passport'),  sub: hasPassport ? t('profile.quickAccess.passportSub') : t('profile.quickAccess.passportSubNo'), route: '/(patient)/health-passport', bg: hasPassport ? COLORS.successBg : COLORS.warningBg, color: hasPassport ? COLORS.success : COLORS.warning },
                { icon: 'bar-chart-outline'     as const, label: t('profile.quickAccess.score'),     sub: t('profile.quickAccess.scoreSub'),  route: '/(patient)/score',            bg: COLORS.infoBg,     color: COLORS.info    },
                { icon: 'list-outline'          as const, label: t('profile.quickAccess.history'),   sub: `${apptStats.total} ${pluralizeAppointments(apptStats.total)}`,                               route: '/(patient)/appointments', bg: COLORS.bg2, color: COLORS.wal },
                { icon: 'chatbubble-outline'    as const, label: t('profile.quickAccess.chat'),      sub: t('profile.quickAccess.chatSub'),   route: '/(patient)/chat',             bg: '#F5EEF8',         color: '#7D3C98' },
                { icon: 'card-outline'          as const, label: t('profile.quickAccess.payments'),  sub: t('profile.quickAccess.paymentsSub'), route: '/(patient)/payment-history', bg: COLORS.successBg,  color: COLORS.success },
                { icon: 'people-outline'        as const, label: t('profile.quickAccess.family'),    sub: t('profile.quickAccess.familySub'), route: '/(patient)/family',           bg: COLORS.infoBg,     color: COLORS.info    },
                { icon: 'document-text-outline' as const, label: t('profile.quickAccess.consents'),  sub: t('profile.quickAccess.consentsSub'), route: '/(patient)/consents',       bg: '#F5EEF8',         color: '#7D3C98' },
                { icon: 'list-outline'          as const, label: t('profile.quickAccess.plan'),      sub: t('profile.quickAccess.planSub'),  route: '/(patient)/treatment-plan',   bg: COLORS.successBg,  color: COLORS.success },
                { icon: 'qr-code-outline'       as const, label: 'Dentálny pas',                     sub: 'QR kód pre iného zubára',           route: '/(patient)/dental-passport-qr', bg: '#EBF5FB',       color: '#2980B9' },
                { icon: 'calculator-outline'    as const, label: 'Odhad poistenia',                  sub: 'Kalkulačka krytia poisťovňou',      route: '/(patient)/insurance-calc',     bg: '#FEF9E7',       color: '#F39C12' },
              ].map((item, idx, arr) => (
                <TouchableOpacity
                  key={item.label}
                  style={[s.navRow, idx === arr.length - 1 && { borderBottomWidth: 0 }, { borderBottomColor: colors.bg3 }]}
                  onPress={() => router.push(item.route as any)}
                  activeOpacity={0.8}
                >
                  <View style={[s.navIcon, { backgroundColor: item.bg }]}>
                    <Ionicons name={item.icon} size={18} color={item.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.navLabel, { color: colors.textPrimary }]}>{item.label}</Text>
                    <Text style={[s.navSub, { color: colors.textSecondary }]}>{item.sub}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={15} color={COLORS.sand} />
                </TouchableOpacity>
              ))}
            </View>

            {/* Logout */}
            <TouchableOpacity style={s.logoutBtn} onPress={handleSignOut} activeOpacity={0.85}>
              <Ionicons name="log-out-outline" size={18} color={COLORS.error} />
              <Text style={s.logoutText}>{t('profile.logout')}</Text>
            </TouchableOpacity>

            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Text style={{ fontSize: 11, color: '#C4A882', fontFamily: 'DMSans_400Regular' }}>
                Loderer Dental v{Constants.expoConfig?.version ?? '1.0.0'}
              </Text>
              <Text style={{ fontSize: 10, color: '#C4A882', marginTop: 2, fontFamily: 'DMSans_400Regular' }}>
                Build: 2026-05-02 • OTA aktívne
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function StatPill({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={sp.value}>{value}</Text>
      <Text style={sp.label}>{label}</Text>
    </View>
  );
}

function InputField({ label, value, onChange, placeholder, autoCapitalize, keyboardType, maxLength, colors }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: any; maxLength?: number; colors: any;
}) {
  return (
    <>
      <Text style={[s.inputLabel, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        style={[s.input, { backgroundColor: colors.inputBg, borderColor: colors.bg3, color: colors.textPrimary }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.sand}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        maxLength={maxLength}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  hero: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, alignItems: 'center', overflow: 'hidden' },
  circle: { position: 'absolute', borderRadius: 999, backgroundColor: '#FAF6F0' },

  avatarWrap: { position: 'relative', marginBottom: 12 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: COLORS.wal, borderWidth: 3, borderColor: COLORS.sand },
  avatarInitials: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 30, color: COLORS.cream },
  cameraBtn: {
    position: 'absolute', bottom: 0, right: -4,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  heroName: { ...TYPO.h2, color: '#FAF6F0', marginBottom: 6 },
  roleBadge: { backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: RADII.full, paddingHorizontal: 14, paddingVertical: 5, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  roleText:  { fontFamily: 'DMSans_500Medium', fontSize: 12, color: COLORS.sand },
  statRow: { flexDirection: 'row', alignItems: 'center', width: '100%', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: RADII.md, paddingVertical: 12, paddingHorizontal: 8 },
  statDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.12)' },

  lastVisit: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: RADII.md, padding: 12, borderWidth: 1 },
  lastVisitText: { ...TYPO.bodySm },

  card:      { borderRadius: RADII.lg, padding: 16, borderWidth: 1, ...SHADOWS.sm },
  cardTitle: { ...TYPO.label, marginBottom: 14 },

  inputLabel:   { ...TYPO.overline, color: COLORS.wal, marginTop: 12, marginBottom: 6 },
  input:        { borderWidth: 1, borderRadius: RADII.sm, paddingHorizontal: 14, paddingVertical: 12, ...TYPO.body },
  inputDisabled:{ borderWidth: 1, borderRadius: RADII.sm, paddingHorizontal: 14, paddingVertical: 12 },
  inputDisabledText: { ...TYPO.body },

  saveBtn:     { marginTop: 18, borderRadius: RADII.md, overflow: 'hidden' },
  saveGrad:    { paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { ...TYPO.btnText, color: '#fff' },

  navRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  navIcon:  { width: 40, height: 40, borderRadius: RADII.sm, alignItems: 'center', justifyContent: 'center' },
  navLabel: { ...TYPO.bodyMed, marginBottom: 2 },
  navSub:   { ...TYPO.bodySm },

  toggleRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleIcon: { width: 36, height: 36, borderRadius: RADII.sm, alignItems: 'center', justifyContent: 'center' },
  toggleLabel:{ ...TYPO.bodyMed },
  toggleSub:  { ...TYPO.bodySm, marginTop: 2 },
  logoutBtn:  {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.errorBg, borderRadius: RADII.md, paddingVertical: 14,
    borderWidth: 1, borderColor: '#F1948A',
  },
  logoutText: { ...TYPO.bodyMed, color: COLORS.error },

  version: { ...TYPO.bodySm, textAlign: 'center', marginTop: 4 },
});

const sp = StyleSheet.create({
  value: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 22, color: '#FAF6F0', lineHeight: 26 },
  label: { fontFamily: 'DMSans_500Medium', fontSize: 9, color: 'rgba(196,168,130,0.7)', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 2 },
});

const loy = StyleSheet.create({
  card:          { borderRadius: RADII.lg, padding: 16, borderWidth: 1.5 },
  header:        { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  icon:          { fontSize: 32 },
  title:         { ...TYPO.overline, color: COLORS.wal, marginBottom: 2 },
  level:         { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 18 },
  badge:         { borderRadius: RADII.md, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center' },
  badgeNum:      { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 22, color: '#fff', lineHeight: 26 },
  badgeLabel:    { fontFamily: 'DMSans_500Medium', fontSize: 8, color: 'rgba(255,255,255,0.8)', letterSpacing: 1, textTransform: 'uppercase' },
  progressBg:    { height: 8, backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 4, marginBottom: 6, overflow: 'hidden' },
  progressFill:  { height: 8, borderRadius: 4 },
  progressLabel: { ...TYPO.bodySm, marginBottom: 12, textAlign: 'center' },
  infoRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  infoText:      { flex: 1, ...TYPO.bodySm, lineHeight: 16 },
});

// ── Language toggle styles ─────────────────────────────────────────────────────
const ls = StyleSheet.create({
  langToggle: {
    flexDirection: 'row',
    backgroundColor: COLORS.bg2,
    borderRadius: RADII.full,
    padding: 3,
    gap: 2,
  },
  langBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: RADII.full,
  },
  langBtnActive: {
    backgroundColor: COLORS.wal,
  },
  langBtnText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    color: COLORS.wal,
    letterSpacing: 0.5,
  },
  langBtnTextActive: {
    color: '#fff',
  },
});

const docS = StyleSheet.create({
  row:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 13, fontFamily: 'DMSans_500Medium', marginBottom: 1 },
  date: { fontSize: 11, fontFamily: 'DMSans_400Regular' },
});
