import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from './supabase';
import { COLORS, SIZES } from './styles/theme';

type Role = 'patient' | 'doctor';

export default function SetupRole() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function selectRole(role: Role) {
    setLoading(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      Alert.alert('Chyba', 'Nepodarilo sa načítať účet. Skús sa znovu prihlásiť.');
      setLoading(false);
      return;
    }

    // Uložíme id (= auth.uid()) a role do tabuľky profiles
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, role });

    setLoading(false);

    if (error) {
      Alert.alert('Chyba', error.message);
      return;
    }

    // Navigácia na správny dashboard podľa roly
    if (role === 'patient') {
      router.replace('/(patient)');
    } else {
      router.replace('/(doctor)');
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.tooth}>🦷</Text>
      <Text style={styles.title}>Kto si?</Text>
      <Text style={styles.subtitle}>Vyber svoju rolu v aplikácii</Text>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.sand} style={styles.loader} />
      ) : (
        <View style={styles.cardsWrapper}>
          {/* .role-doc — Doktor (tmavý štýl) */}
          <TouchableOpacity
            style={[styles.card, styles.cardDoctor]}
            onPress={() => selectRole('doctor')}
          >
            <Text style={styles.cardEmoji}>👨‍⚕️</Text>
            <Text style={styles.cardTextDoctor}>Som Doktor</Text>
          </TouchableOpacity>

          {/* .role-pat — Pacient (svetlý štýl) */}
          <TouchableOpacity
            style={[styles.card, styles.cardPatient]}
            onPress={() => selectRole('patient')}
          >
            <Text style={styles.cardEmoji}>🦷</Text>
            <Text style={styles.cardTextPatient}>Som Pacient</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.ivory,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SIZES.padding + 12,
  },
  tooth: { fontSize: 64, marginBottom: 12 },
  title: { fontSize: 26, fontWeight: '600', color: COLORS.esp, marginBottom: 6 },
  subtitle: { fontSize: 15, color: COLORS.wal, marginBottom: 40, textAlign: 'center' },
  loader: { marginTop: 20 },
  cardsWrapper: { width: '100%', maxWidth: 360, gap: 14 },
  card: {
    borderRadius: SIZES.radius + 4,
    paddingVertical: 17, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 2.5,
  },
  // .role-doc — tmavá karta pre doktora
  cardDoctor: {
    backgroundColor: COLORS.esp,
    borderColor: COLORS.wal,
    shadowColor: '#1a0e08',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 1, shadowRadius: 0, elevation: 5,
  },
  // .role-pat — svetlá karta pre pacienta
  cardPatient: {
    backgroundColor: '#fff',
    borderColor: COLORS.bg3,
    shadowColor: COLORS.bg3,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 1, shadowRadius: 0, elevation: 5,
  },
  cardEmoji: { fontSize: 36 },
  cardTextDoctor: { fontSize: 17, fontWeight: '600', color: COLORS.cream, flex: 1 },
  cardTextPatient: { fontSize: 17, fontWeight: '600', color: COLORS.esp, flex: 1 },
});