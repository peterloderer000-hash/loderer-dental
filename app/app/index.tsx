import { useState, useEffect } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, KeyboardAvoidingView,
  Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { COLORS, SIZES } from '../styles/theme';
import { ONBOARDING_KEY } from './onboarding';

const { width } = Dimensions.get('window');

async function getRoleAndNavigate(userId: string, router: any) {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
  if (data?.role === 'doctor')       router.replace('/(doctor)');
  else if (data?.role === 'patient') router.replace('/(patient)');
  else                               router.replace('/setup-role');
}

type Mode = 'login' | 'reset';

export default function AuthScreen() {
  const router = useRouter();
  const [mode, setMode]         = useState<Mode>('login');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(true);
  const [showPass, setShowPass] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    async function init() {
      // Skontroluj či bol onboarding zobrazený
      const seen = await AsyncStorage.getItem(ONBOARDING_KEY);
      if (!seen) {
        router.replace('/onboarding');
        return;
      }
      // Bežná kontrola session
      const { data: { session } } = await supabase.auth.getSession();
      if (session) getRoleAndNavigate(session.user.id, router);
      else setLoading(false);
    }
    init();
  }, []);

  async function handleSignIn() {
    if (!email || !password) { Alert.alert('Chyba', 'Vyplňte email aj heslo.'); return; }
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { Alert.alert('Chyba prihlásenia', error.message); setLoading(false); return; }
    await getRoleAndNavigate(data.user.id, router);
    setLoading(false);
  }

  async function handleSignUp() {
    if (!email || !password) { Alert.alert('Chyba', 'Vyplňte email aj heslo.'); return; }
    if (password.length < 6) { Alert.alert('Chyba', 'Heslo musí mať aspoň 6 znakov.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) { Alert.alert('Chyba registrácie', error.message); return; }
    router.push('/setup-role');
  }

  async function handleResetPassword() {
    if (!email.trim()) { Alert.alert('Chyba', 'Zadajte váš email.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setLoading(false);
    if (error) { Alert.alert('Chyba', error.message); return; }
    setResetSent(true);
  }

  function backToLogin() { setMode('login'); setResetSent(false); }

  if (loading) {
    return (
      <View style={styles.splash}>
        <View style={styles.splashLogo}>
          <Text style={styles.splashEmoji}>🦷</Text>
        </View>
        <Text style={styles.splashTitle}>Loderer Dental</Text>
        <Text style={styles.splashSub}>Vaša zubná ambulancia</Text>
        <ActivityIndicator color={COLORS.sand} size="large" style={{ marginTop: 48 }} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* ── Hero ── */}
        <View style={styles.hero}>
          <View style={styles.heroDeco1} />
          <View style={styles.heroDeco2} />
          <View style={styles.logoWrap}>
            <Text style={styles.logoEmoji}>🦷</Text>
          </View>
          <Text style={styles.heroTitle}>Loderer Dental</Text>
          <Text style={styles.heroSub}>Vaša zubná ambulancia</Text>
        </View>

        {/* ── Formulár ── */}
        <View style={styles.formCard}>

          {mode === 'reset' ? (
            /* ── Reset hesla ── */
            <>
              <TouchableOpacity onPress={backToLogin} style={styles.backRow} activeOpacity={0.7}>
                <Ionicons name="arrow-back" size={16} color={COLORS.wal} />
                <Text style={styles.backText}>Späť na prihlásenie</Text>
              </TouchableOpacity>

              <Text style={styles.formTitle}>Obnoviť heslo</Text>

              {resetSent ? (
                <View style={styles.successBox}>
                  <Ionicons name="checkmark-circle" size={40} color="#1E8449" />
                  <Text style={styles.successTitle}>Email odoslaný!</Text>
                  <Text style={styles.successSub}>
                    Skontrolujte schránku {email} a kliknite na odkaz pre obnovenie hesla.
                  </Text>
                  <TouchableOpacity style={styles.btnPrimary} onPress={backToLogin} activeOpacity={0.85}>
                    <Text style={styles.btnPrimaryText}>Späť na prihlásenie</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={styles.resetInfo}>
                    Zadajte váš email a pošleme vám odkaz na obnovenie hesla.
                  </Text>
                  <Text style={styles.label}>EMAIL</Text>
                  <View style={styles.inputWrap}>
                    <Ionicons name="mail-outline" size={17} color={COLORS.wal} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="vas@email.sk"
                      placeholderTextColor="#bbb"
                      autoCapitalize="none"
                      keyboardType="email-address"
                      value={email}
                      onChangeText={setEmail}
                      autoFocus
                    />
                  </View>
                  <TouchableOpacity style={styles.btnPrimary} onPress={handleResetPassword} activeOpacity={0.85}>
                    <Ionicons name="send-outline" size={17} color="#fff" />
                    <Text style={styles.btnPrimaryText}>Odoslať odkaz</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          ) : (
            /* ── Prihlásenie / Registrácia ── */
            <>
              <Text style={styles.formTitle}>Prihlásenie</Text>

              <Text style={styles.label}>EMAIL</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="mail-outline" size={17} color={COLORS.wal} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="vas@email.sk"
                  placeholderTextColor="#bbb"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>

              <Text style={styles.label}>HESLO</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="lock-closed-outline" size={17} color={COLORS.wal} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="••••••••"
                  placeholderTextColor="#bbb"
                  secureTextEntry={!showPass}
                  value={password}
                  onChangeText={setPassword}
                />
                <TouchableOpacity onPress={() => setShowPass(p => !p)} style={styles.eyeBtn}>
                  <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color={COLORS.wal} />
                </TouchableOpacity>
              </View>

              {/* Zabudnuté heslo */}
              <TouchableOpacity onPress={() => setMode('reset')} style={styles.forgotBtn} activeOpacity={0.7}>
                <Text style={styles.forgotText}>Zabudli ste heslo?</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.btnPrimary} onPress={handleSignIn} activeOpacity={0.85}>
                <Ionicons name="log-in-outline" size={18} color="#fff" />
                <Text style={styles.btnPrimaryText}>Prihlásiť sa</Text>
              </TouchableOpacity>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>alebo</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity style={styles.btnSecondary} onPress={handleSignUp} activeOpacity={0.85}>
                <Ionicons name="person-add-outline" size={17} color={COLORS.wal} />
                <Text style={styles.btnSecondaryText}>Registrovať sa</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── Footer ── */}
        <Text style={styles.footer}>© 2025 Loderer Dental · Všetky práva vyhradené</Text>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.esp },

  container: { flexGrow: 1, paddingBottom: 32 },

  // Splash / loading
  splash:      { flex: 1, backgroundColor: COLORS.esp, alignItems: 'center', justifyContent: 'center' },
  splashLogo:  { width: 100, height: 100, borderRadius: 28, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: 3, borderColor: COLORS.sand },
  splashEmoji: { fontSize: 52 },
  splashTitle: { fontSize: 26, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  splashSub:   { fontSize: 13, color: COLORS.sand, marginTop: 6 },

  // Hero section
  hero: { backgroundColor: COLORS.esp, paddingTop: 72, paddingBottom: 48, alignItems: 'center', overflow: 'hidden' },
  heroDeco1: { position: 'absolute', width: 280, height: 280, borderRadius: 140, backgroundColor: COLORS.wal, opacity: 0.15, top: -100, right: -80 },
  heroDeco2: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: COLORS.sand, opacity: 0.08, bottom: -60, left: -40 },
  logoWrap:  { width: 90, height: 90, borderRadius: 26, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center', marginBottom: 18, borderWidth: 3, borderColor: COLORS.sand, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  logoEmoji: { fontSize: 48 },
  heroTitle: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: 0.3, marginBottom: 6 },
  heroSub:   { fontSize: 13, color: COLORS.sand, letterSpacing: 0.5 },

  // Form card
  formCard: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -20, padding: 28, paddingTop: 32, flex: 1, minHeight: 420 },
  formTitle: { fontSize: 20, fontWeight: '700', color: COLORS.esp, marginBottom: 22, textAlign: 'center' },

  label: { fontSize: 10, fontWeight: '700', color: COLORS.wal, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginTop: 4 },

  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: 12, backgroundColor: COLORS.bg2, marginBottom: 16, paddingHorizontal: 12 },
  inputIcon: { marginRight: 8 },
  input:     { flex: 1, paddingVertical: 13, fontSize: 15, color: COLORS.esp },
  eyeBtn:    { padding: 6 },

  btnPrimary:     { backgroundColor: COLORS.esp, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 8, elevation: 4, flexDirection: 'row', justifyContent: 'center', gap: 8, shadowColor: COLORS.esp, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  divider:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 18 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.bg3 },
  dividerText: { fontSize: 12, color: '#bbb', fontWeight: '500' },

  btnSecondary:     { borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: 14, paddingVertical: 13, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, backgroundColor: COLORS.bg2 },
  btnSecondaryText: { color: COLORS.wal, fontSize: 14, fontWeight: '600' },

  footer: { textAlign: 'center', fontSize: 10, color: COLORS.sand, marginTop: 24, paddingHorizontal: 20, opacity: 0.7 },

  // Forgot password
  forgotBtn:  { alignSelf: 'flex-end', marginTop: -8, marginBottom: 14 },
  forgotText: { fontSize: 12, color: COLORS.wal, fontWeight: '600', textDecorationLine: 'underline' },

  // Reset mode
  backRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 18 },
  backText: { fontSize: 13, color: COLORS.wal, fontWeight: '500' },
  resetInfo:{ fontSize: 13, color: COLORS.wal, lineHeight: 20, marginBottom: 20, textAlign: 'center' },

  // Success state
  successBox:   { alignItems: 'center', paddingVertical: 16, gap: 12 },
  successTitle: { fontSize: 20, fontWeight: '700', color: '#1E8449' },
  successSub:   { fontSize: 13, color: COLORS.wal, textAlign: 'center', lineHeight: 20, marginBottom: 8 },
});
