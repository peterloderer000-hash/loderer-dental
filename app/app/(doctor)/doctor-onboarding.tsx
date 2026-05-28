import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Animated,
  Dimensions, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../supabase';
import { useAppTheme } from '../../context/ThemeContext';

const { width } = Dimensions.get('window');

export default function DoctorOnboardingScreen() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  const [step,    setStep]    = useState(1);
  const [loading, setLoading] = useState(false);

  const [fullName,       setFullName]       = useState('');
  const [clinicName,     setClinicName]     = useState('');
  const [clinicAddress,  setClinicAddress]  = useState('');
  const [phoneNumber,    setPhoneNumber]    = useState('');

  const slideAnim = useRef(new Animated.Value(0)).current;

  function goToStep(nextStep: number) {
    Animated.timing(slideAnim, {
      toValue: nextStep - 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
    setStep(nextStep);
  }

  async function handleSaveStep2() {
    if (!fullName || !clinicName || !clinicAddress || !phoneNumber) {
      Alert.alert('Chyba', 'Prosím vyplňte všetky údaje.');
      return;
    }
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName, clinic_name: clinicName, clinic_address: clinicAddress, phone_number: phoneNumber })
        .eq('id', user.id);
      if (error) { Alert.alert('Chyba', 'Nepodarilo sa uložiť údaje.'); setLoading(false); return; }
    }
    setLoading(false);
    goToStep(3);
  }

  const translateX = slideAnim.interpolate({
    inputRange:  [0, 1, 2],
    outputRange: [0, -width, -width * 2],
  });

  const progressWidth = slideAnim.interpolate({
    inputRange:  [0, 1, 2],
    outputRange: ['33.33%', '66.66%', '100%'],
  });

  return (
    <SafeAreaView style={[s.container, { backgroundColor: colors.bg2 }]}>
      <View style={s.header}>
        <View style={s.headerSide}>
          {step === 2 && (
            <TouchableOpacity onPress={() => goToStep(step - 1)} style={s.backBtn} activeOpacity={0.75}>
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
        </View>
        <Text style={[s.stepText, { color: colors.textPrimary }]}>Krok {step}/3</Text>
        <View style={s.headerSide} />
      </View>

      <View style={s.progressBg}>
        <Animated.View style={[s.progressFill, { width: progressWidth as any }]} />
      </View>

      <View style={s.sliderWrap}>
        <Animated.View style={[s.slider, { transform: [{ translateX }] }]}>

          {/* Krok 1 — Vitajte */}
          <View style={s.slide}>
            <View style={s.center}>
              <Text style={s.emoji}>🦷</Text>
              <Text style={[s.title, { color: colors.textPrimary }]}>Vitajte v Loderer Dental</Text>
              <Text style={[s.subtitle, { color: colors.textSecondary }]}>Nastavme vašu ordináciu za 2 minúty</Text>
            </View>
            <TouchableOpacity style={s.btn} onPress={() => goToStep(2)} activeOpacity={0.85}>
              <Text style={s.btnText}>Začať</Text>
            </TouchableOpacity>
          </View>

          {/* Krok 2 — Základné údaje */}
          <View style={s.slide}>
            <View style={{ flex: 1, paddingTop: 24 }}>
              <Text style={[s.stepTitle, { color: colors.textPrimary }]}>Základné údaje</Text>
              {[
                { placeholder: 'Vaše meno (MDDr. ...)',  value: fullName,      set: setFullName,      keyboard: 'default' as const },
                { placeholder: 'Názov kliniky',           value: clinicName,    set: setClinicName,    keyboard: 'default' as const },
                { placeholder: 'Adresa ordinacie',        value: clinicAddress, set: setClinicAddress, keyboard: 'default' as const },
                { placeholder: 'Telefón (+421...)',       value: phoneNumber,   set: setPhoneNumber,   keyboard: 'phone-pad' as const },
              ].map((f, i) => (
                <TextInput
                  key={i}
                  style={[s.input, { backgroundColor: colors.cardBg, borderColor: colors.bg3, color: colors.textPrimary }]}
                  placeholder={f.placeholder}
                  placeholderTextColor={dark ? '#666' : '#C4A882'}
                  value={f.value}
                  onChangeText={f.set}
                  keyboardType={f.keyboard}
                />
              ))}
            </View>
            <TouchableOpacity style={[s.btn, loading && { opacity: 0.6 }]} onPress={handleSaveStep2} disabled={loading} activeOpacity={0.85}>
              {loading ? <ActivityIndicator color="#2C1F14" /> : <Text style={s.btnText}>Pokračovať</Text>}
            </TouchableOpacity>
          </View>

          {/* Krok 3 — Hotovo */}
          <View style={s.slide}>
            <View style={s.center}>
              <Text style={s.emoji}>✅</Text>
              <Text style={[s.title, { color: colors.textPrimary }]}>Všetko je pripravené!</Text>
              <View style={s.bullets}>
                {[
                  'Spravovať termíny a kalendár',
                  'Sledovať kartu pacienta',
                  'Pridávať výkony a cenník',
                  'Automatizovať recall pacientov',
                ].map((b, i) => (
                  <View key={i} style={s.bulletRow}>
                    <Text style={s.bulletDot}>•</Text>
                    <Text style={[s.bulletText, { color: colors.textSecondary }]}>{b}</Text>
                  </View>
                ))}
              </View>
            </View>
            <TouchableOpacity style={s.btn} onPress={() => router.replace('/(doctor)/' as any)} activeOpacity={0.85}>
              <Text style={s.btnText}>Prejsť do aplikácie</Text>
            </TouchableOpacity>
          </View>

        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#FAF6F0' },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerSide:  { width: 40 },
  backBtn:     { padding: 8, marginLeft: -8 },
  stepText:    { fontSize: 15, fontWeight: '700', color: '#2C1F14' },
  progressBg:  { height: 4, backgroundColor: '#F4EDE4' },
  progressFill:{ height: 4, backgroundColor: '#C9A84C' },
  sliderWrap:  { flex: 1, overflow: 'hidden' },
  slider:      { flex: 1, flexDirection: 'row', width: width * 3 },
  slide:       { width, flex: 1, padding: 24, justifyContent: 'space-between' },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emoji:       { fontSize: 80, marginBottom: 24 },
  title:       { fontSize: 26, fontWeight: '800', color: '#2C1F14', textAlign: 'center', marginBottom: 12 },
  subtitle:    { fontSize: 16, color: '#6B4F3A', textAlign: 'center' },
  stepTitle:   { fontSize: 22, fontWeight: '800', color: '#2C1F14', marginBottom: 24 },
  input:       { backgroundColor: '#fff', borderWidth: 1, borderColor: '#C4A882', borderRadius: 10, padding: 16, fontSize: 16, color: '#2C1F14', marginBottom: 14 },
  bullets:     { marginTop: 28, width: '100%', paddingHorizontal: 8 },
  bulletRow:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  bulletDot:   { fontSize: 20, color: '#C9A84C', marginRight: 12, lineHeight: 24 },
  bulletText:  { fontSize: 15, color: '#6B4F3A', lineHeight: 24, flex: 1 },
  btn:         { backgroundColor: '#C9A84C', paddingVertical: 16, borderRadius: 10, alignItems: 'center', marginBottom: 16 },
  btnText:     { color: '#2C1F14', fontSize: 17, fontWeight: '800' },
});
