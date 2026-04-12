import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../supabase';

export default function DoctorHome() {
  const router = useRouter();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>👨‍⚕️</Text>
      <Text style={styles.title}>Vitaj, Doktor!</Text>
      <Text style={styles.subtitle}>Toto je tvoj dashboard lekára.</Text>
      <Text style={styles.hint}>— Modul 3 bude tu —</Text>

      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Odhlásiť sa</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e8f8f1',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emoji: { fontSize: 80, marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '700', color: '#0a3d28', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#3a8060', marginBottom: 12, textAlign: 'center' },
  hint: { fontSize: 14, color: '#aac', fontStyle: 'italic', marginBottom: 48 },
  signOutBtn: {
    borderWidth: 1.5,
    borderColor: '#cc3333',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  signOutText: { color: '#cc3333', fontSize: 15, fontWeight: '600' },
});
