import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { supabase } from '../../supabase';
import { COLORS, SIZES } from '../../styles/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [fullName, setFullName]   = useState('');
  const [phone, setPhone]         = useState('');
  const [email, setEmail]         = useState('');
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [hasPassport, setHasPassport] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? '');
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (data) {
        setFullName(data.full_name ?? '');
        setPhone(data.phone_number ?? '');
      }
      const { data: pp } = await supabase.from('health_passports').select('patient_id').eq('patient_id', user.id).maybeSingle();
      setHasPassport(!!pp);
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
      full_name: fullName.trim(),
      phone_number: phone.trim() || null,
    }).eq('id', user.id);
    setSaving(false);
    if (error) Alert.alert('Chyba', error.message);
    else Alert.alert('Uložené ✓', 'Profil bol aktualizovaný.');
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    const parent = navigation.getParent() ?? navigation;
    parent.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'index' }] }));
  }

  const initials = fullName.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={COLORS.wal} size="large" /></View>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Avatar */}
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <Text style={styles.avatarName}>{fullName || 'Pacient'}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>🦷  Pacient</Text>
            </View>
          </View>

          {/* Osobné údaje */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>OSOBNÉ ÚDAJE</Text>

            <Text style={styles.label}>CELÉ MENO</Text>
            <TextInput style={styles.input} value={fullName} onChangeText={setFullName}
              placeholder="Meno a priezvisko" placeholderTextColor="#bbb"
              autoCapitalize="words" />

            <Text style={styles.label}>TELEFÓN</Text>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone}
              placeholder="+421 900 000 000" placeholderTextColor="#bbb"
              keyboardType="phone-pad" />

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

          {/* Zdravotný pas */}
          <TouchableOpacity style={[styles.card, styles.passportCard]}
            onPress={() => router.push('/(patient)/health-passport')} activeOpacity={0.85}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={[styles.passportIcon, { backgroundColor: hasPassport ? '#EAFAF1' : '#FEF9E7' }]}>
                <Text style={{ fontSize: 24 }}>{hasPassport ? '✅' : '📋'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.passportTitle}>Zdravotný dotazník</Text>
                <Text style={styles.passportSub}>
                  {hasPassport ? 'Vyplnený — klikni pre úpravu' : 'Nevyplnený — klikni pre vyplnenie'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.wal} />
            </View>
          </TouchableOpacity>

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
  safe:   { flex: 1, backgroundColor: COLORS.bg2 },
  scroll: { flex: 1 },
  content:{ padding: SIZES.padding },
  center: { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center' },

  avatarWrap: { alignItems: 'center', paddingVertical: 28 },
  avatar:     { width: 88, height: 88, borderRadius: 44, backgroundColor: COLORS.esp, alignItems: 'center', justifyContent: 'center', marginBottom: 12, borderWidth: 3, borderColor: COLORS.sand },
  avatarText: { fontSize: 32, fontWeight: '700', color: COLORS.cream },
  avatarName: { fontSize: 20, fontWeight: '700', color: COLORS.esp, marginBottom: 6 },
  roleBadge:  { backgroundColor: COLORS.bg3, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 5, borderWidth: 1, borderColor: COLORS.sand },
  roleText:   { fontSize: 12, fontWeight: '600', color: COLORS.wal },

  card:      { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: COLORS.bg3 },
  cardTitle: { fontSize: 9, letterSpacing: 2, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 14 },

  label: { fontSize: 9, letterSpacing: 1.5, color: COLORS.wal, fontWeight: '600', textTransform: 'uppercase', marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.esp, backgroundColor: COLORS.bg2 },
  inputDisabled: { borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#f5f5f5' },
  inputDisabledText: { fontSize: 14, color: '#999' },

  saveBtn:     { backgroundColor: COLORS.esp, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 18 },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.cream },

  passportCard: { flexDirection: 'row', alignItems: 'center' },
  passportIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  passportTitle: { fontSize: 14, fontWeight: '600', color: COLORS.esp, marginBottom: 3 },
  passportSub:   { fontSize: 11, color: COLORS.wal },

  logoutBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FDEDEC', borderRadius: 12, paddingVertical: 14, borderWidth: 1, borderColor: '#F1948A', marginBottom: 10 },
  logoutText: { fontSize: 14, fontWeight: '600', color: '#922B21' },
});
