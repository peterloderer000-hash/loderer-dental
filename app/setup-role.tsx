import { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { COLORS } from '../styles/theme';

export default function SetupRole() {
  const router  = useRouter();
  const [fullName, setFullName] = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleConfirm() {
    if (!fullName.trim()) { Alert.alert('Chyba', 'Zadaj svoje celé meno.'); return; }
    setLoading(true);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      Alert.alert('Chyba', 'Nepodarilo sa načítať účet.');
      setLoading(false); return;
    }

    // Ak má user už staff rolu (z pozvánky), neprepisuj ju
    const { data: existing } = await supabase
      .from('profiles').select('role').eq('id', user.id).maybeSingle();

    if (existing?.role && existing.role !== 'patient') {
      setLoading(false);
      router.replace('/(doctor)');
      return;
    }

    const { error } = await supabase.from('profiles').upsert({
      id:        user.id,
      role:      'patient',
      full_name: fullName.trim(),
    });

    setLoading(false);
    if (error) { Alert.alert('Chyba', error.message); return; }
    router.replace('/(patient)');
  }

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
          <Text style={styles.heroTitle}>Vitaj v Loderer Dental</Text>
          <Text style={styles.heroSub}>Zadaj svoje meno a začneme</Text>
        </View>

        {/* ── Karta ── */}
        <View style={styles.card}>
          <Text style={styles.label}>CELÉ MENO</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="person-outline" size={17} color={COLORS.wal} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Napr. Jana Nováková"
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
              onPress={handleConfirm}
              activeOpacity={0.85}
              disabled={!fullName.trim()}
            >
              <Text style={styles.btnConfirmText}>Pokračovať</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </TouchableOpacity>
          )}

          {/* Pozvánka pre personál */}
          <TouchableOpacity
            style={styles.inviteLink}
            onPress={() => router.push('/accept-invitation' as any)}
            activeOpacity={0.7}
          >
            <Ionicons name="mail-outline" size={13} color={COLORS.wal} />
            <Text style={styles.inviteLinkText}>Máš pozvánku od kliniky? Klikni sem</Text>
          </TouchableOpacity>
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
    position: 'absolute', width: 260, height: 260, borderRadius: 20,
    backgroundColor: COLORS.wal, opacity: 0.15, top: -90, right: -70,
  },
  heroDeco2: {
    position: 'absolute', width: 160, height: 160, borderRadius: 4,
    backgroundColor: COLORS.sand, opacity: 0.08, bottom: -50, left: -30,
  },
  logoWrap: {
    width: 88, height: 88, borderRadius: 26,
    backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center',
    marginBottom: 18, borderWidth: 3, borderColor: COLORS.sand,
    elevation: 4, shadowColor: '#121417',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
  },
  logoEmoji: { fontSize: 46 },
  heroTitle: { fontSize: 24, fontWeight: '800', color: '#F5F6F8', letterSpacing: 0.3, marginBottom: 6 },
  heroSub:   { fontSize: 13, color: COLORS.sand, letterSpacing: 0.4 },

  card: {
    backgroundColor: COLORS.cream,
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
    borderRadius: 2, backgroundColor: COLORS.bg2,
    marginBottom: 8, paddingHorizontal: 12,
  },
  inputIcon: { marginRight: 8 },
  input:     { flex: 1, paddingVertical: 13, fontSize: 15, color: COLORS.esp },

  btnConfirm: {
    backgroundColor: COLORS.esp, borderRadius: 2,
    paddingVertical: 15, alignItems: 'center', marginTop: 20,
    flexDirection: 'row', justifyContent: 'center', gap: 8,
    elevation: 4, shadowColor: COLORS.esp,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
  },
  btnDisabled:    { opacity: 0.35 },
  btnConfirmText: { fontSize: 15, fontWeight: '700', color: '#F5F6F8' },

  inviteLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 28, paddingVertical: 8,
  },
  inviteLinkText: {
    fontSize: 12, color: COLORS.wal, fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
