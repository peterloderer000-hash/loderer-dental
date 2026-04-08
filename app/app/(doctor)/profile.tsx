import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../supabase';
import { COLORS, SIZES } from '../../styles/theme';

export default function DoctorProfile() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone]       = useState('');
  const [email, setEmail]       = useState('');
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [stats, setStats]       = useState({ total: 0, completed: 0, patients: 0 });

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? '');

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (profile) { setFullName(profile.full_name ?? ''); setPhone(profile.phone_number ?? ''); }

      // Štatistiky doktora
      const { data: appts } = await supabase.from('appointments').select('status, patient_id').eq('doctor_id', user.id);
      if (appts) {
        const total     = appts.length;
        const completed = appts.filter((a) => a.status === 'completed').length;
        const patients  = new Set(appts.map((a) => a.patient_id)).size;
        setStats({ total, completed, patients });
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave() {
    if (!fullName.trim()) { Alert.alert('Chyba', 'Zadaj meno.'); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('profiles').update({
      full_name:    fullName.trim(),
      phone_number: phone.trim() || null,
    }).eq('id', user.id);
    setSaving(false);
    if (error) Alert.alert('Chyba', error.message);
    else Alert.alert('Uložené ✓', 'Profil bol aktualizovaný.');
  }

  function handleSignOut() {
    supabase.auth.signOut();
  }

  const initials = fullName.trim().split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?';

  if (loading) return <View style={styles.center}><ActivityIndicator color={COLORS.wal} size="large" /></View>;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerSub}>MÔJ ÚČET</Text>
        <Text style={styles.headerTitle}>Profil doktora</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Avatar */}
          <View style={styles.avatarSection}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <Text style={styles.avatarName}>{fullName || 'Doktor'}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>👨‍⚕️  Doktor</Text>
            </View>
          </View>

          {/* Štatistiky */}
          <View style={styles.statsRow}>
            {[
              { num: stats.total,     label: 'Termínov' },
              { num: stats.completed, label: 'Dokončených' },
              { num: stats.patients,  label: 'Pacientov' },
            ].map((s) => (
              <View key={s.label} style={styles.statBox}>
                <Text style={styles.statNum}>{s.num}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Osobné údaje */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>OSOBNÉ ÚDAJE</Text>

            <Text style={styles.label}>CELÉ MENO</Text>
            <TextInput style={styles.input} value={fullName} onChangeText={setFullName}
              placeholder="Meno a priezvisko" placeholderTextColor="#bbb" autoCapitalize="words" />

            <Text style={styles.label}>TELEFÓN</Text>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone}
              placeholder="+421 900 000 000" placeholderTextColor="#bbb" keyboardType="phone-pad" />

            <Text style={styles.label}>EMAIL</Text>
            <View style={styles.inputDisabled}>
              <Text style={styles.inputDisabledText}>{email}</Text>
            </View>

            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave} disabled={saving} activeOpacity={0.85}>
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>Uložiť zmeny</Text>}
            </TouchableOpacity>
          </View>

          {/* Info */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>INFORMÁCIE</Text>
            {[
              { icon: 'shield-checkmark-outline', text: 'Vaše dáta sú šifrované a bezpečné.' },
              { icon: 'lock-closed-outline',      text: 'Prístup k pacientskym záznamom je chránený.' },
              { icon: 'people-outline',           text: 'Pacienti vás vidia len ako MDDr. v zozname.' },
            ].map((item) => (
              <View key={item.text} style={styles.infoRow}>
                <Ionicons name={item.icon as any} size={16} color={COLORS.wal} />
                <Text style={styles.infoText}>{item.text}</Text>
              </View>
            ))}
          </View>

          {/* Odhlásiť */}
          <TouchableOpacity style={styles.logoutBtn} onPress={handleSignOut} activeOpacity={0.85}>
            <Ionicons name="log-out-outline" size={18} color="#922B21" />
            <Text style={styles.logoutText}>Odhlásiť sa</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },
  content:{ padding: SIZES.padding },
  center: { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center' },

  header:      { backgroundColor: COLORS.esp, paddingHorizontal: SIZES.padding, paddingTop: 18, paddingBottom: 20 },
  headerSub:   { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 3 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },

  avatarSection: { alignItems: 'center', paddingVertical: 24 },
  avatar:        { width: 88, height: 88, borderRadius: 44, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center', marginBottom: 12, borderWidth: 3, borderColor: COLORS.sand },
  avatarText:    { fontSize: 32, fontWeight: '700', color: '#fff' },
  avatarName:    { fontSize: 20, fontWeight: '700', color: COLORS.esp, marginBottom: 6 },
  roleBadge:     { backgroundColor: COLORS.esp, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 5, borderWidth: 1, borderColor: COLORS.wal },
  roleText:      { fontSize: 12, fontWeight: '600', color: COLORS.cream },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statBox:  { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.bg3 },
  statNum:  { fontSize: 28, fontWeight: '800', color: COLORS.esp, lineHeight: 34 },
  statLabel:{ fontSize: 9, color: COLORS.wal, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },

  card:      { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: COLORS.bg3 },
  cardTitle: { fontSize: 9, letterSpacing: 2, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 14 },

  label: { fontSize: 9, letterSpacing: 1.5, color: COLORS.wal, fontWeight: '600', textTransform: 'uppercase', marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.esp, backgroundColor: COLORS.bg2 },
  inputDisabled:     { borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#f5f5f5' },
  inputDisabledText: { fontSize: 14, color: '#999' },

  saveBtn:     { backgroundColor: COLORS.esp, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 18 },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.cream },

  infoRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  infoText: { flex: 1, fontSize: 12, color: COLORS.wal, lineHeight: 18 },

  logoutBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FDEDEC', borderRadius: 12, paddingVertical: 14, borderWidth: 1, borderColor: '#F1948A' },
  logoutText: { fontSize: 14, fontWeight: '600', color: '#922B21' },
});
