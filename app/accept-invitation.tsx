import { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { COLORS } from '../styles/theme';

type Step = 'token' | 'name';

const ROLE_LABELS: Record<string, string> = {
  doctor:     'Doktor',
  reception:  'Recepcia',
  hygienist:  'Hygienista',
  owner:      'Vlastník kliniky',
};

export default function AcceptInvitation() {
  const router  = useRouter();
  const params  = useLocalSearchParams<{ token?: string }>();

  const [step,       setStep]       = useState<Step>('token');
  const [token,      setToken]      = useState(params.token ?? '');
  const [fullName,   setFullName]   = useState('');
  const [loading,    setLoading]    = useState(false);
  const [invitation, setInvitation] = useState<{
    id: string; role: string; clinic_id: string | null;
  } | null>(null);

  async function handleValidateToken() {
    if (!token.trim()) { Alert.alert('Chyba', 'Zadaj pozvánkový kód.'); return; }
    setLoading(true);

    const { data, error } = await supabase
      .from('invitations')
      .select('id, role, email, expires_at, accepted_at, clinic_id')
      .eq('token', token.trim())
      .maybeSingle();

    setLoading(false);

    if (error || !data) {
      Alert.alert('Neplatný kód', 'Pozvánkový kód nebol nájdený.'); return;
    }
    if (data.accepted_at) {
      Alert.alert('Už použitá', 'Táto pozvánka bola už použitá.'); return;
    }
    if (new Date(data.expires_at) < new Date()) {
      Alert.alert('Vypršala', 'Platnosť pozvánky vypršala. Požiadaj administrátora o novú.'); return;
    }

    setInvitation({ id: data.id, role: data.role, clinic_id: data.clinic_id });
    setStep('name');
  }

  async function handleAccept() {
    if (!fullName.trim() || !invitation) { Alert.alert('Chyba', 'Zadaj svoje celé meno.'); return; }
    setLoading(true);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      Alert.alert('Chyba', 'Nepodarilo sa načítať účet.');
      setLoading(false); return;
    }

    const profilePayload: Record<string, any> = {
      id:        user.id,
      role:      invitation.role,
      full_name: fullName.trim(),
    };
    if (invitation.clinic_id) profilePayload.default_clinic_id = invitation.clinic_id;

    const { error: profileError } = await supabase.from('profiles').upsert(profilePayload);
    if (profileError) {
      Alert.alert('Chyba', profileError.message);
      setLoading(false); return;
    }

    // Mark invitation as accepted
    await supabase.from('invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invitation.id);

    setLoading(false);

    const isDoctor = ['doctor', 'owner'].includes(invitation.role);
    const isStaff  = ['reception', 'hygienist'].includes(invitation.role);
    if (isDoctor)   router.replace('/doctor-onboarding' as any);
    else if (isStaff) router.replace('/(doctor)' as any);
    else            router.replace('/(patient)' as any);
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* ── Hero ── */}
        <View style={styles.hero}>
          <View style={styles.heroDeco1} />
          <View style={styles.heroDeco2} />
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={styles.logoWrap}>
            <Ionicons name="mail-open-outline" size={46} color={COLORS.sand} />
          </View>
          <Text style={styles.heroTitle}>Pozvánka do kliniky</Text>
          <Text style={styles.heroSub}>
            {step === 'token' ? 'Zadaj kód, ktorý ti poslal administrátor' : 'Overená! Doplň svoje meno.'}
          </Text>
        </View>

        {/* ── Karta ── */}
        <View style={styles.card}>

          {step === 'token' ? (
            <>
              <Text style={styles.label}>POZVÁNKOVÝ KÓD</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="key-outline" size={17} color={COLORS.wal} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="napr. a3f7c2e1b9d4..."
                  placeholderTextColor="#999"
                  value={token}
                  onChangeText={setToken}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                />
              </View>

              {loading ? (
                <ActivityIndicator size="large" color={COLORS.wal} style={{ marginTop: 28 }} />
              ) : (
                <TouchableOpacity
                  style={[styles.btnConfirm, !token.trim() && styles.btnDisabled]}
                  onPress={handleValidateToken}
                  activeOpacity={0.85}
                  disabled={!token.trim()}
                >
                  <Ionicons name="shield-checkmark-outline" size={16} color="#fff" />
                  <Text style={styles.btnConfirmText}>Overiť kód</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              {/* Potvrdenie roly */}
              <View style={styles.roleBanner}>
                <View style={styles.roleBannerIcon}>
                  <Ionicons name="checkmark-circle" size={26} color="#1E8449" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.roleBannerTitle}>Pozvánka platná</Text>
                  <Text style={styles.roleBannerSub}>
                    Rola: <Text style={{ fontWeight: '700' }}>{ROLE_LABELS[invitation?.role ?? ''] ?? invitation?.role}</Text>
                  </Text>
                </View>
              </View>

              <Text style={[styles.label, { marginTop: 20 }]}>CELÉ MENO</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="person-outline" size={17} color={COLORS.wal} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Napr. MDDr. Peter Loderer"
                  placeholderTextColor="#999"
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                  autoFocus
                />
              </View>

              {loading ? (
                <ActivityIndicator size="large" color={COLORS.wal} style={{ marginTop: 28 }} />
              ) : (
                <TouchableOpacity
                  style={[styles.btnConfirm, !fullName.trim() && styles.btnDisabled]}
                  onPress={handleAccept}
                  activeOpacity={0.85}
                  disabled={!fullName.trim()}
                >
                  <Text style={styles.btnConfirmText}>Aktivovať účet</Text>
                  <Ionicons name="arrow-forward" size={16} color="#fff" />
                </TouchableOpacity>
              )}
            </>
          )}

        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flexGrow: 1, paddingBottom: 32 },

  hero: {
    backgroundColor: COLORS.esp,
    paddingTop: 72, paddingBottom: 48,
    alignItems: 'center', overflow: 'hidden',
  },
  heroDeco1: {
    position: 'absolute', width: 260, height: 260, borderRadius: 130,
    backgroundColor: COLORS.wal, opacity: 0.15, top: -90, right: -70,
  },
  heroDeco2: {
    position: 'absolute', width: 160, height: 160, borderRadius: 80,
    backgroundColor: COLORS.sand, opacity: 0.08, bottom: -50, left: -30,
  },
  backBtn: {
    position: 'absolute', top: 52, left: 20,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  logoWrap: {
    width: 88, height: 88, borderRadius: 26,
    backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center',
    marginBottom: 18, borderWidth: 3, borderColor: COLORS.sand,
    elevation: 8, shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
  },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: 0.3, marginBottom: 6 },
  heroSub:   { fontSize: 13, color: COLORS.sand, letterSpacing: 0.3, textAlign: 'center', paddingHorizontal: 32 },

  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    marginTop: -20, padding: 28, paddingTop: 32,
    flex: 1, minHeight: 340,
  },

  label: {
    fontSize: 10, fontWeight: '700', color: COLORS.wal,
    textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8,
  },

  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: COLORS.bg3,
    borderRadius: 12, backgroundColor: COLORS.bg2,
    marginBottom: 8, paddingHorizontal: 12,
  },
  inputIcon: { marginRight: 8 },
  input:     { flex: 1, paddingVertical: 13, fontSize: 15, color: COLORS.esp },

  btnConfirm: {
    backgroundColor: COLORS.esp, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center', marginTop: 20,
    flexDirection: 'row', justifyContent: 'center', gap: 8,
    elevation: 4, shadowColor: COLORS.esp,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
  },
  btnDisabled:    { opacity: 0.35 },
  btnConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  roleBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#EAF7EF', borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: '#A8D9B8',
  },
  roleBannerIcon:  { width: 36, height: 36, borderRadius: 18, backgroundColor: '#D4EFDF', alignItems: 'center', justifyContent: 'center' },
  roleBannerTitle: { fontSize: 14, fontWeight: '700', color: '#1A5C35' },
  roleBannerSub:   { fontSize: 12, color: '#2E7D52', marginTop: 2 },
});
