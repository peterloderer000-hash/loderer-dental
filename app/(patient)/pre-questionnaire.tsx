import React, { useState, useEffect } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../supabase';
import { COLORS, RADII, SHADOWS, SPACING, GRADIENTS } from '../../styles/theme';
import { LinearGradient } from 'expo-linear-gradient';
import HeroHeader from '../../components/ui/HeroHeader';
import { useAppTheme } from '../../context/ThemeContext';

const QUESTIONS = [
  { key: 'reason',    label: 'Hlavný dôvod dnešnej návštevy',     placeholder: 'Napr. bolesť, kontrola, výplň...', multiline: true },
  { key: 'changes',   label: 'Zmeny od poslednej návštevy',        placeholder: 'Nová bolesť, citlivosť, úraz...', multiline: true },
  { key: 'meds',      label: 'Lieky / alergie (ak zmenené)',       placeholder: 'Napr. Ibuprofen, alergia na latex', multiline: false },
  { key: 'pain',      label: 'Intenzita bolesti (0 = žiadna, 10 = silná)', placeholder: 'Zadajte číslo 0–10', multiline: false },
  { key: 'concerns',  label: 'Čoho sa obávate / čo by ste chceli riešiť', placeholder: 'Napr. estetika, bolesť, implantát', multiline: true },
];

const PAIN_LABELS = ['Žiadna', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10 Silná'];

export default function PreQuestionnaireScreen() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  const { appointmentId, appointmentDate, doctorId, serviceName } =
    useLocalSearchParams<{ appointmentId: string; appointmentDate?: string; doctorId?: string; serviceName?: string }>();

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [pain,    setPain]    = useState<number | null>(null);
  const [saving,  setSaving]  = useState(false);

  const dateStr = appointmentDate
    ? new Date(appointmentDate).toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : '';

  async function handleSubmit() {
    const reason = answers.reason?.trim();
    if (!reason) { Alert.alert('Prosím', 'Vyplňte aspoň dôvod návštevy.'); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Formátuj odpovede
      const lines = [
        `📋 PRE-APPOINTMENT DOTAZNÍK`,
        `Dôvod: ${reason}`,
        answers.changes ? `Zmeny: ${answers.changes.trim()}` : null,
        answers.meds    ? `Lieky/alergie: ${answers.meds.trim()}` : null,
        pain !== null   ? `Bolesť: ${pain}/10` : null,
        answers.concerns ? `Požiadavky: ${answers.concerns.trim()}` : null,
      ].filter(Boolean).join('\n');

      // Ulož do appointment.notes (prepend)
      const { data: appt } = await supabase
        .from('appointments').select('notes').eq('id', appointmentId).maybeSingle();
      const existingNotes = appt?.notes ?? '';
      const merged = lines + (existingNotes ? '\n\n---\n' + existingNotes : '');
      await supabase.from('appointments').update({ notes: merged }).eq('id', appointmentId);

      // Notifikácia doktorovi
      if (doctorId) {
        await supabase.from('notifications').insert({
          user_id:        doctorId,
          title:          '📋 Pacient vyplnil dotazník',
          body:           `${serviceName ?? 'Termín'}: ${reason}${pain !== null ? ` · Bolesť: ${pain}/10` : ''}`,
          type:           'info',
          appointment_id: appointmentId,
        });
      }

      Alert.alert(
        'Odoslané ✓',
        'Váš dotazník bol odoslaný doktorovi. Ďakujeme!',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (e: any) {
      Alert.alert('Chyba', e?.message ?? 'Nepodarilo sa odoslať dotazník.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.esp }}>
      <HeroHeader
        title="Krátky dotazník"
        subtitle="Pred termínom"
        icon="clipboard-outline"
        onBack={() => router.back()}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.bg2 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Info karta */}
          <View style={[s.infoCard, { backgroundColor: dark ? '#0D2233' : '#EBF5FB', borderColor: dark ? '#1A5276' : '#AED6F1' }]}>
            <Ionicons name="information-circle" size={18} color={dark ? '#5DADE2' : COLORS.info} />
            <View style={{ flex: 1 }}>
              <Text style={[s.infoTitle, { color: dark ? '#5DADE2' : COLORS.info }]}>Pomôžte doktorovi pripraviť sa</Text>
              {dateStr ? (
                <Text style={[s.infoSub, { color: dark ? '#7FB3D3' : '#1A5276' }]}>Termín: {dateStr}</Text>
              ) : null}
              <Text style={[s.infoSub, { color: dark ? '#7FB3D3' : '#1A5276' }]}>
                Trvá len 2 minúty. Doktor dostane vaše odpovede pred termínom.
              </Text>
            </View>
          </View>

          {/* Otázky */}
          {QUESTIONS.filter(q => q.key !== 'pain').map((q, i) => (
            <View key={q.key} style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <Text style={[s.qNum, { color: colors.textSecondary }]}>OTÁZKA {i + 1}</Text>
              <Text style={[s.qLabel, { color: colors.textPrimary }]}>{q.label}</Text>
              <TextInput
                style={[s.input, { color: colors.textPrimary, backgroundColor: colors.inputBg, borderColor: colors.bg3 }]}
                placeholder={q.placeholder}
                placeholderTextColor={dark ? '#666' : '#aaa'}
                value={answers[q.key] ?? ''}
                onChangeText={v => setAnswers(prev => ({ ...prev, [q.key]: v }))}
                multiline={q.multiline}
                numberOfLines={q.multiline ? 3 : 1}
                textAlignVertical={q.multiline ? 'top' : 'center'}
              />
            </View>
          ))}

          {/* Škála bolesti */}
          <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Text style={[s.qNum, { color: colors.textSecondary }]}>OTÁZKA 4</Text>
            <Text style={[s.qLabel, { color: colors.textPrimary }]}>Intenzita bolesti</Text>
            <View style={s.painRow}>
              {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
                <TouchableOpacity
                  key={n}
                  style={[s.painBtn,
                    { borderColor: colors.bg3 },
                    pain === n && { backgroundColor: n <= 3 ? '#27AE60' : n <= 6 ? '#F39C12' : '#E74C3C', borderColor: 'transparent' },
                    pain !== n && { backgroundColor: colors.bg2 },
                  ]}
                  onPress={() => setPain(n)} activeOpacity={0.7}
                >
                  <Text style={[s.painNum, { color: pain === n ? '#fff' : colors.textSecondary }]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.painLabels}>
              <Text style={[s.painLabelText, { color: colors.textSecondary }]}>😊 Žiadna</Text>
              <Text style={[s.painLabelText, { color: colors.textSecondary }]}>😣 Silná</Text>
            </View>
          </View>

          {/* Požiadavky */}
          <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Text style={[s.qNum, { color: colors.textSecondary }]}>OTÁZKA 5</Text>
            <Text style={[s.qLabel, { color: colors.textPrimary }]}>Čo by ste chceli riešiť / čoho sa obávate?</Text>
            <TextInput
              style={[s.input, { color: colors.textPrimary, backgroundColor: colors.inputBg, borderColor: colors.bg3 }]}
              placeholder="Napr. estetika, citlivosť, strach zo zákroku..."
              placeholderTextColor={dark ? '#666' : '#aaa'}
              value={answers.concerns ?? ''}
              onChangeText={v => setAnswers(prev => ({ ...prev, concerns: v }))}
              multiline numberOfLines={3} textAlignVertical="top"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Submit */}
      <View style={[s.footer, { backgroundColor: colors.cardBg, borderTopColor: colors.bg3 }]}>
        <TouchableOpacity
          style={[s.submitBtn, saving && { opacity: 0.6 }]}
          onPress={handleSubmit} disabled={saving} activeOpacity={0.85}
        >
          <Ionicons name={saving ? 'hourglass-outline' : 'send'} size={18} color="#fff" />
          <Text style={s.submitText}>{saving ? 'Odosielam...' : 'Odoslať doktorovi'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header:       { backgroundColor: COLORS.esp, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  headerLabel:  { fontSize: 10, fontFamily: 'DMSans_500Medium', color: COLORS.sand, letterSpacing: 1.5 },
  headerTitle:  { fontSize: 20, fontFamily: 'PlayfairDisplay_700Bold', color: '#F8F6F2' },
  infoCard:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderRadius: RADII.lg, padding: 14, marginBottom: 14 },
  infoTitle:    { fontSize: 13, fontFamily: 'DMSans_500Medium', marginBottom: 3 },
  infoSub:      { fontSize: 12, lineHeight: 18 },
  card:         { borderRadius: RADII.lg, borderWidth: 1, padding: 14, marginBottom: 12, ...SHADOWS.sm },
  qNum:         { fontSize: 9, fontFamily: 'DMSans_500Medium', letterSpacing: 1.5, marginBottom: 4 },
  qLabel:       { fontSize: 14, fontFamily: 'DMSans_500Medium', marginBottom: 10, lineHeight: 20 },
  input:        { borderWidth: 1.5, borderRadius: RADII.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, minHeight: 46 },
  painRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  painBtn:      { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  painNum:      { fontSize: 13, fontFamily: 'DMSans_500Medium' },
  painLabels:   { flexDirection: 'row', justifyContent: 'space-between' },
  painLabelText:{ fontSize: 11 },
  footer:       { borderTopWidth: 1, padding: 16, paddingBottom: 34 },
  submitBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: COLORS.esp, borderRadius: RADII.lg, paddingVertical: 16 },
  submitText:   { fontSize: 15, fontFamily: 'DMSans_500Medium', color: '#F8F6F2' },
});
