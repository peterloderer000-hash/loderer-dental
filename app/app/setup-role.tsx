import { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { COLORS, SIZES } from '../styles/theme';

type Role = 'patient' | 'doctor';

export default function SetupRole() {
  const router = useRouter();
  const [role, setRole]         = useState<Role | null>(null);
  const [fullName, setFullName] = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleConfirm() {
    if (!role)            { Alert.alert('Chyba', 'Vyber svoju rolu.'); return; }
    if (!fullName.trim()) { Alert.alert('Chyba', 'Zadaj svoje celé meno.'); return; }

    setLoading(true);
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      Alert.alert('Chyba', 'Nepodarilo sa načítať účet.');
      setLoading(false);
      return;
    }

    const { error } = await supabase.from('profiles').upsert({
      id:        user.id,
      role,
      full_name: fullName.trim(),
    });

    setLoading(false);
    if (error) { Alert.alert('Chyba', error.message); return; }

    router.replace(role === 'patient' ? '/(patient)' : '/(doctor)');
  }

  const canContinue = !!role && fullName.trim().length > 0;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* ── Hero ── */}
        <View style={styles.hero}>
          <View style={styles.heroDeco1} />
          <View style={styles.heroDeco2} />
          <View style={styles.logoWrap}>
            <Text style={styles.logoEmoji}>🦷</Text>
          </View>
          <Text style={styles.heroTitle}>Nastavenie profilu</Text>
          <Text style={styles.heroSub}>Vyplň údaje pre pokračovanie</Text>
        </View>

        {/* ── Karta ── */}
        <View style={styles.card}>

          {/* Meno */}
          <Text style={styles.label}>CELÉ MENO</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="person-outline" size={17} color={COLORS.wal} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Napr. Ján Novák"
              placeholderTextColor="#bbb"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
            />
          </View>

          {/* Rola */}
          <Text style={[styles.label, { marginTop: 8 }]}>KTO SI?</Text>

          <TouchableOpacity
            style={[styles.roleCard, styles.roleCardDoctor, role === 'doctor' && styles.roleCardDoctorActive]}
            onPress={() => setRole('doctor')}
            activeOpacity={0.82}
          >
            <View style={[styles.roleIconWrap, { backgroundColor: role === 'doctor' ? COLORS.sand : 'rgba(255,255,255,0.15)' }]}>
              <Text style={{ fontSize: 26 }}>👨‍⚕️</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.roleTitle}>Som Doktor</Text>
              <Text style={styles.roleSub}>Spravujem termíny a záznamy</Text>
            </View>
            {role === 'doctor' && (
              <View style={styles.checkCircle}>
                <Ionicons name="checkmark" size={14} color={COLORS.esp} />
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleCard, styles.roleCardPatient, role === 'patient' && styles.roleCardPatientActive]}
            onPress={() => setRole('patient')}
            activeOpacity={0.82}
          >
            <View style={[styles.roleIconWrap, { backgroundColor: role === 'patient' ? COLORS.esp : COLORS.bg3 }]}>
              <Text style={{ fontSize: 26 }}>🦷</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.roleTitle, { color: COLORS.esp }]}>Som Pacient</Text>
              <Text style={[styles.roleSub, { color: COLORS.wal }]}>Rezervujem termíny online</Text>
            </View>
            {role === 'patient' && (
              <View style={[styles.checkCircle, { backgroundColor: COLORS.wal }]}>
                <Ionicons name="checkmark" size={14} color="#fff" />
              </View>
            )}
          </TouchableOpacity>

          {/* Tlačidlo */}
          {loading ? (
            <ActivityIndicator size="large" color={COLORS.wal} style={{ marginTop: 28 }} />
          ) : (
            <TouchableOpacity
              style={[styles.btnConfirm, !canContinue && styles.btnDisabled]}
              onPress={handleConfirm}
              activeOpacity={0.85}
              disabled={!canContinue}
            >
              <Text style={styles.btnConfirmText}>Pokračovať</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </TouchableOpacity>
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

  // Hero
  hero: { backgroundColor: COLORS.esp, paddingTop: 68, paddingBottom: 44, alignItems: 'center', overflow: 'hidden' },
  heroDeco1: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: COLORS.wal, opacity: 0.15, top: -90, right: -70 },
  heroDeco2: { position: 'absolute', width: 160, height: 160, borderRadius: 80,  backgroundColor: COLORS.sand, opacity: 0.08, bottom: -50, left: -30 },
  logoWrap:  { width: 84, height: 84, borderRadius: 24, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 3, borderColor: COLORS.sand, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  logoEmoji: { fontSize: 44 },
  heroTitle: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: 0.3, marginBottom: 6 },
  heroSub:   { fontSize: 13, color: COLORS.sand, letterSpacing: 0.4 },

  // Card
  card: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -20, padding: 24, paddingTop: 28, flex: 1, minHeight: 420 },

  label: { fontSize: 10, fontWeight: '700', color: COLORS.wal, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 },

  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: 12, backgroundColor: COLORS.bg2, marginBottom: 8, paddingHorizontal: 12 },
  inputIcon: { marginRight: 8 },
  input:     { flex: 1, paddingVertical: 13, fontSize: 15, color: COLORS.esp },

  // Role cards
  roleCard: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 2, marginBottom: 12 },

  roleCardDoctor:       { backgroundColor: COLORS.esp, borderColor: COLORS.wal },
  roleCardDoctorActive: { borderColor: COLORS.sand, borderWidth: 2.5 },
  roleTitle:            { fontSize: 15, fontWeight: '700', color: COLORS.cream, marginBottom: 2 },
  roleSub:              { fontSize: 11, color: COLORS.sand },

  roleCardPatient:       { backgroundColor: '#fff', borderColor: COLORS.bg3 },
  roleCardPatientActive: { borderColor: COLORS.wal, borderWidth: 2.5 },

  roleIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  checkCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.sand, alignItems: 'center', justifyContent: 'center' },

  btnConfirm:     { backgroundColor: COLORS.esp, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 20, flexDirection: 'row', justifyContent: 'center', gap: 8, elevation: 4, shadowColor: COLORS.esp, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  btnDisabled:    { opacity: 0.35 },
  btnConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
