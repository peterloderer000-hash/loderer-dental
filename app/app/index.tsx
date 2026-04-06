import { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../supabase';
import { COLORS, SIZES } from '../styles/theme';

export default function AuthScreen() {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSignIn() {
    if (!email || !password) { Alert.alert('Chyba', 'Vyplňte email aj heslo.'); return; }
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { Alert.alert('Chyba prihlásenia', error.message); setLoading(false); return; }

    // Skontroluj či má používateľ už rolu
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();

    setLoading(false);

    if (profile?.role === 'doctor')       router.replace('/(doctor)');
    else if (profile?.role === 'patient') router.replace('/(patient)');
    else                                  router.push('/setup-role');
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

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.tooth}>🦷</Text>
          <Text style={styles.title}>Zubná Ambulancia</Text>
          <Text style={styles.subtitle}>Loderer Dental</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Prihlásenie / Registrácia</Text>

          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            style={styles.input}
            placeholder="vas@email.sk"
            placeholderTextColor="#aaa"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.label}>HESLO</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="#aaa"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {loading ? (
            <ActivityIndicator size="large" color={COLORS.sand} style={{ marginTop: 24 }} />
          ) : (
            <>
              <TouchableOpacity style={styles.btnPrimary} onPress={handleSignIn} activeOpacity={0.85}>
                <Text style={styles.btnPrimaryText}>Prihlásiť sa</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnSecondary} onPress={handleSignUp} activeOpacity={0.85}>
                <Text style={styles.btnSecondaryText}>Registrovať sa</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.ivory },
  container: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: SIZES.padding },

  header: { alignItems: 'center', marginBottom: 32 },
  tooth:    { fontSize: 64, marginBottom: 8 },
  title:    { fontSize: 28, fontWeight: '700', color: COLORS.esp },
  subtitle: { fontSize: 16, color: COLORS.wal, marginTop: 4 },

  card: {
    width: '100%', maxWidth: 400, backgroundColor: '#fff',
    borderRadius: SIZES.radius + 4, padding: 24,
    borderWidth: 1, borderColor: COLORS.bg3,
    shadowColor: COLORS.esp, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 5,
  },
  cardTitle: { fontSize: 17, fontWeight: '600', color: COLORS.esp, marginBottom: 20, textAlign: 'center' },

  label: { fontSize: 11, fontWeight: '500', color: COLORS.wal, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 14 },
  input: { borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: SIZES.radius - 1, paddingHorizontal: 15, paddingVertical: 13, fontSize: 15, color: COLORS.esp, backgroundColor: '#fff' },

  btnPrimary:     { backgroundColor: COLORS.esp, borderWidth: 2.5, borderColor: COLORS.wal, borderRadius: SIZES.radius, paddingVertical: 15, alignItems: 'center', marginTop: 24, elevation: 4 },
  btnPrimaryText: { color: COLORS.cream, fontSize: 15, fontWeight: '500' },
  btnSecondary:     { backgroundColor: COLORS.sand, borderWidth: 2.5, borderColor: COLORS.wal, borderRadius: SIZES.radius, paddingVertical: 13, alignItems: 'center', marginTop: 10 },
  btnSecondaryText: { color: COLORS.esp, fontSize: 14, fontWeight: '500' },
});
