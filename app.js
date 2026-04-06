import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert } from 'react-native';
import { supabase } from './supabase'; // Toto je to prepojenie, čo sme vytvorili

export default function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);

  // Kontrola, či je užívateľ už prihlásený
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
  }, []);

  // Funkcia na registráciu
  async function signUpWithEmail() {
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) Alert.alert('Chyba pri registrácii', error.message);
    else Alert.alert('Úspech!', 'Skontroluj si email pre potvrdenie (ak máš potvrdenie zapnuté).');
    setLoading(false);
  }

  // Funkcia na prihlásenie
  async function signInWithEmail() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) Alert.alert('Chyba pri prihlásení', error.message);
    else {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    }
    setLoading(false);
  }

  // Ak je užívateľ prihlásený, ukážeme mu "Vitajte"
  if (user) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Vitaj v Dental App! 👋</Text>
        <Text>Prihlásený ako: {user.email}</Text>
        <TouchableOpacity style={styles.button} onPress={() => supabase.auth.signOut().then(() => setUser(null))}>
          <Text style={styles.buttonText}>Odhlásiť sa</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Inak ukážeme Login obrazovku
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Zubná Ambulancia</Text>
      
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Heslo"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity style={styles.button} onPress={signInWithEmail} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Načítavam...' : 'Prihlásiť sa'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, {backgroundColor: '#6c757d'}]} onPress={signUpWithEmail} disabled={loading}>
        <Text style={styles.buttonText}>Registrovať sa</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  input: { width: '100%', borderWidth: 1, borderColor: '#ccc', padding: 15, marginBottom: 10, borderRadius: 8 },
  button: { backgroundColor: '#007bff', padding: 15, borderRadius: 8, width: '100%', alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontWeight: 'bold' }
});