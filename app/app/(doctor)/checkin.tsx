import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabase';
import { COLORS, SIZES } from '../../styles/theme';

type FoundAppt = {
  id: string;
  appointment_date: string;
  patient: { full_name: string } | null;
  service: { name: string; emoji: string | null } | null;
};

export default function CheckInScreen() {
  const router = useRouter();
  const [code, setCode]           = useState('');
  const [searching, setSearching] = useState(false);
  const [found, setFound]         = useState<FoundAppt | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function handleSearch() {
    const trimmed = code.trim().toLowerCase();
    if (trimmed.length < 4) { Alert.alert('Zadaj kód', 'Kód musí mať aspoň 4 znaky.'); return; }
    setSearching(true);
    setFound(null);
    const { data, error } = await supabase
      .from('appointments')
      .select('id, appointment_date, status, patient:profiles!appointments_patient_id_fkey(full_name), service:services(name, emoji)')
      .eq('status', 'scheduled')
      .ilike('id', `${trimmed}%`)
      .limit(1)
      .maybeSingle();
    setSearching(false);
    if (error || !data) {
      Alert.alert('Nenájdený', 'Termín s týmto kódom neexistuje alebo pacient už bol ohlásený.');
      return;
    }
    setFound({
      id: data.id,
      appointment_date: data.appointment_date,
      patient: Array.isArray(data.patient) ? data.patient[0] : (data.patient as any),
      service: Array.isArray(data.service) ? data.service[0] : (data.service as any),
    });
  }

  async function handleConfirm() {
    if (!found) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setConfirming(true);
    const { error } = await supabase.from('appointments').update({
      status:     'arrived',
      arrived_at: new Date().toISOString(),
    }).eq('id', found.id);
    setConfirming(false);
    if (error) { Alert.alert('Chyba', error.message); return; }
    Alert.alert(
      '✅ Príchod potvrdený',
      `${found.patient?.full_name ?? 'Pacient'} je v čakárni.`,
      [{ text: 'OK', onPress: () => { setFound(null); setCode(''); } }],
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Hlavička */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerLabel}>RECEPCIA</Text>
          <Text style={s.headerTitle}>Check-in pacienta</Text>
        </View>
        <Ionicons name="qr-code-outline" size={28} color={COLORS.sand} />
      </View>

      <View style={s.body}>
        {/* Input karta */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Zadajte check-in kód</Text>
          <Text style={s.cardSub}>
            Pacient vidí kód v aplikácii pod detailom termínu (sekcia „Kód pre príchod").
          </Text>

          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              placeholder="napr. A1B2C3D4"
              placeholderTextColor="#bbb"
              value={code}
              onChangeText={(t) => { setCode(t.toUpperCase()); setFound(null); }}
              autoCapitalize="characters"
              maxLength={8}
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
            />
            <TouchableOpacity
              style={[s.searchBtn, (!code.trim() || searching) && { opacity: 0.4 }]}
              onPress={handleSearch}
              disabled={!code.trim() || searching}
              activeOpacity={0.8}
            >
              {searching
                ? <ActivityIndicator color="#fff" size="small" />
                : <Ionicons name="search" size={20} color="#fff" />}
            </TouchableOpacity>
          </View>

          {/* Výsledok */}
          {found && (
            <View style={s.resultCard}>
              <View style={s.resultTop}>
                <View style={s.avatarCircle}>
                  <Ionicons name="person" size={22} color={COLORS.wal} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.resultName}>{found.patient?.full_name ?? 'Pacient'}</Text>
                  {found.service && (
                    <Text style={s.resultService}>
                      {found.service.emoji ?? '🦷'} {found.service.name}
                    </Text>
                  )}
                  <Text style={s.resultTime}>
                    {new Date(found.appointment_date).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' })}
                    {' · '}
                    {new Date(found.appointment_date).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[s.confirmBtn, confirming && { opacity: 0.5 }]}
                onPress={handleConfirm}
                disabled={confirming}
                activeOpacity={0.85}
              >
                {confirming
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Ionicons name="checkmark-circle" size={20} color="#fff" />
                      <Text style={s.confirmText}>Potvrdiť príchod do čakárne</Text>
                    </>}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Hint */}
        <View style={s.hintCard}>
          <Ionicons name="information-circle-outline" size={20} color={COLORS.wal} />
          <Text style={s.hintText}>
            Stačí zadať prvých 4–8 znakov kódu. Systém automaticky nájde zodpovedajúci naplánovaný termín.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  header: {
    backgroundColor: COLORS.esp, paddingHorizontal: SIZES.padding,
    paddingTop: 14, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerLabel: { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '500', textTransform: 'uppercase', marginBottom: 3 },
  headerTitle: { fontSize: 19, fontWeight: '600', color: '#fff' },

  body:     { flex: 1, backgroundColor: COLORS.bg2, padding: SIZES.padding, gap: 14 },
  card:     { backgroundColor: '#fff', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: COLORS.bg3 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: COLORS.esp, marginBottom: 4 },
  cardSub:   { fontSize: 12, color: COLORS.wal, marginBottom: 18, lineHeight: 18 },

  inputRow:  { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input:     {
    flex: 1, height: 52, borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: 12,
    paddingHorizontal: 16, fontSize: 22, fontWeight: '800', color: COLORS.esp,
    letterSpacing: 4, backgroundColor: COLORS.bg2, textAlign: 'center',
  },
  searchBtn: { width: 52, height: 52, borderRadius: 12, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },

  resultCard:    { marginTop: 16, backgroundColor: '#E8F8F5', borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: '#A2D9CE' },
  resultTop:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  avatarCircle:  { width: 44, height: 44, borderRadius: 22, backgroundColor: '#D5EEF7', alignItems: 'center', justifyContent: 'center' },
  resultName:    { fontSize: 16, fontWeight: '700', color: COLORS.esp, marginBottom: 2 },
  resultService: { fontSize: 12, color: COLORS.wal, marginBottom: 2 },
  resultTime:    { fontSize: 12, fontWeight: '600', color: '#0E6655' },
  confirmBtn:    {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#0E6655', borderRadius: 12, paddingVertical: 13,
  },
  confirmText:   { fontSize: 14, fontWeight: '700', color: '#fff' },

  hintCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.bg3,
  },
  hintText: { flex: 1, fontSize: 12, color: COLORS.wal, lineHeight: 18 },
});
