import { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../supabase';
import { COLORS, SIZES } from '../styles/theme';

type Role = 'patient' | 'doctor';

export default function SetupRole() {
  const router = useRouter();
  const [role, setRole]         = useState<Role | null>(null);
  const [fullName, setFullName] = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleConfirm() {
    if (!role) { Alert.alert('Chyba', 'Vyber svoju rolu.'); return; }
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

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        <Text style={styles.tooth}>🦷</Text>
        <Text style={styles.title}>Nastavenie profilu</Text>
        <Text style={styles.subtitle}>Vyplň údaje pre pokračovanie</Text>

        {/* Meno */}
        <View style={styles.inputWrap}>
          <Text style={styles.label}>CELÉ MENO</Text>
          <TextInput
            style={styles.input}
            placeholder="Napr. Ján Novák"
            placeholderTextColor="#aaa"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
          />
        </View>

        {/* Výber roly */}
        <Text style={styles.label}>KTO SI?</Text>
        <View style={styles.cardsWrapper}>
          <TouchableOpacity
            style={[styles.card, styles.cardDoctor, role === 'doctor' && styles.cardActive]}
            onPress={() => setRole('doctor')}
            activeOpacity={0.8}
          >
            <Text style={styles.cardEmoji}>👨‍⚕️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTextDoctor}>Som Doktor</Text>
              <Text style={styles.cardSubDoctor}>Spravujem termíny a záznamy</Text>
            </View>
            {role === 'doctor' && <Text style={styles.check}>✓</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.card, styles.cardPatient, role === 'patient' && styles.cardPatientActive]}
            onPress={() => setRole('patient')}
            activeOpacity={0.8}
          >
            <Text style={styles.cardEmoji}>🦷</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTextPatient}>Som Pacient</Text>
              <Text style={styles.cardSubPatient}>Rezervujem termíny</Text>
            </View>
            {role === 'patient' && <Text style={styles.checkDark}>✓</Text>}
          </TouchableOpacity>
        </View>

        {/* Tlačidlo */}
        {loading ? (
          <ActivityIndicator size="large" color={COLORS.wal} style={{ marginTop: 32 }} />
        ) : (
          <TouchableOpacity
            style={[styles.btnConfirm, (!role || !fullName.trim()) && styles.btnDisabled]}
            onPress={handleConfirm}
            activeOpacity={0.85}
            disabled={!role || !fullName.trim()}
          >
            <Text style={styles.btnConfirmText}>Pokračovať →</Text>
          </TouchableOpacity>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.ivory },
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: SIZES.padding + 4, paddingTop: 60 },

  tooth:    { fontSize: 56, marginBottom: 10 },
  title:    { fontSize: 24, fontWeight: '700', color: COLORS.esp, marginBottom: 6 },
  subtitle: { fontSize: 14, color: COLORS.wal, marginBottom: 32, textAlign: 'center' },

  inputWrap: { width: '100%', maxWidth: 380, marginBottom: 24 },
  label: { fontSize: 10, fontWeight: '700', color: COLORS.wal, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, alignSelf: 'flex-start' },
  input: { width: '100%', maxWidth: 380, borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: SIZES.radius, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: COLORS.esp, backgroundColor: '#fff' },

  cardsWrapper: { width: '100%', maxWidth: 380, gap: 12, marginTop: 8, marginBottom: 32 },

  card: { borderRadius: SIZES.radius + 2, paddingVertical: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 2 },

  cardDoctor:     { backgroundColor: COLORS.esp, borderColor: COLORS.wal },
  cardActive:     { borderColor: COLORS.sand, borderWidth: 3 },
  cardTextDoctor: { fontSize: 16, fontWeight: '700', color: COLORS.cream },
  cardSubDoctor:  { fontSize: 11, color: COLORS.sand, marginTop: 2 },
  check:          { fontSize: 20, color: COLORS.sand },

  cardPatient:      { backgroundColor: '#fff', borderColor: COLORS.bg3 },
  cardPatientActive:{ borderColor: COLORS.wal, borderWidth: 3 },
  cardTextPatient:  { fontSize: 16, fontWeight: '700', color: COLORS.esp },
  cardSubPatient:   { fontSize: 11, color: COLORS.wal, marginTop: 2 },
  checkDark:        { fontSize: 20, color: COLORS.wal },

  cardEmoji: { fontSize: 34 },

  btnConfirm:     { width: '100%', maxWidth: 380, backgroundColor: COLORS.wal, borderRadius: SIZES.radius, paddingVertical: 16, alignItems: 'center', elevation: 4 },
  btnDisabled:    { opacity: 0.4 },
  btnConfirmText: { fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
});
