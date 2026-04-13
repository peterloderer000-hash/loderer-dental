import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabase';
import { COLORS, SIZES } from '../../styles/theme';

const VISIT_REASONS = [
  'Bolesť', 'Estetika úsmevu', 'Kontrola', 'Implantáty',
  'Ortodoncia', 'Výmena starých výplní', 'Komplexná rekonštrukcia chrupu', 'Dentálna hygiena',
];
const MEDICAL_CONDITIONS = [
  'Vysoký krvný tlak', 'Cukrovka', 'Srdcové ochorenie', 'Epilepsia',
  'Astma', 'Poruchy zrážania krvi', 'Autoimunitné ochorenia',
  'Osteoporóza', 'Onkologické ochorenie',
];
const DENTAL_FREQUENCY = ['Každých 6 mesiacov', 'Raz ročne', 'Iba keď mám problém'];
const FEAR_LEVELS     = ['Žiadny', 'Mierny', 'Stredný', 'Silný'];
const COMFORT_OPTIONS = ['Ticho', 'Hudba', 'Podcast', 'VR relaxácia'];
const AESTHETIC_OPTIONS = ['Farba zubov', 'Tvar zubov', 'Veľkosť zubov', 'Medzery medzi zubami', 'Krivé zuby'];
const LIFESTYLE_OPTIONS = ['Fajčenie', 'Káva', 'Víno'];
const INVESTMENT_OPTIONS = [
  'Najlepšie riešenie bez ohľadu na cenu',
  'Najlepší pomer kvalita/cena',
  'Ekonomické riešenie',
];

function toggle(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
}

function CheckItem({ label, selected, onToggle }: { label: string; selected: boolean; onToggle: () => void }) {
  return (
    <TouchableOpacity style={[styles.option, selected && styles.optionSel]} onPress={onToggle} activeOpacity={0.75}>
      <View style={[styles.checkbox, selected && styles.checkboxSel]}>
        {selected && <Ionicons name="checkmark" size={11} color="#fff" />}
      </View>
      <Text style={[styles.optionText, selected && styles.optionTextSel]}>{label}</Text>
    </TouchableOpacity>
  );
}

function RadioItem({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <TouchableOpacity style={[styles.option, selected && styles.optionSel]} onPress={onSelect} activeOpacity={0.75}>
      <View style={[styles.radio, selected && styles.radioSel]}>
        {selected && <View style={styles.radioDot} />}
      </View>
      <Text style={[styles.optionText, selected && styles.optionTextSel]}>{label}</Text>
    </TouchableOpacity>
  );
}

function SectionHeader({ num, title }: { num: string; title: string }) {
  return (
    <View style={styles.secHeader}>
      <View style={styles.secBadge}><Text style={styles.secBadgeText}>{num}</Text></View>
      <Text style={styles.secTitle}>{title}</Text>
    </View>
  );
}

export default function HealthPassportScreen() {
  const router = useRouter();

  const [visitReasons, setVisitReasons] = useState<string[]>([]);
  const [medConditions, setMedConditions] = useState<string[]>([]);
  const [allergies, setAllergies] = useState('');
  const [medications, setMedications] = useState('');
  const [dentalFreq, setDentalFreq] = useState('');
  const [fearLevel, setFearLevel] = useState('');
  const [comfort, setComfort] = useState('');
  const [aesthetics, setAesthetics] = useState<string[]>([]);
  const [lifestyle, setLifestyle] = useState<string[]>([]);
  const [investment, setInvestment] = useState('');
  const [openQ, setOpenQ] = useState('');
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadExisting() {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) { setLoadingData(false); return; }
      const { data } = await supabase.from('health_passports').select('*').eq('patient_id', user.id).maybeSingle();
      if (cancelled) return;
      if (data) {
        try {
          if (data.main_reasons)           setVisitReasons(data.main_reasons ?? []);
          if (data.medical_history)        setMedConditions(data.medical_history ?? []);
          if (data.allergies)              setAllergies(data.allergies);
          if (data.medications)            setMedications(data.medications);
          if (data.dental_history)         setDentalFreq(data.dental_history);
          if (data.fear_level)             setFearLevel(data.fear_level);
          if (data.comfort_preferences)    setComfort(data.comfort_preferences?.[0] ?? '');
          if (data.aesthetic_expectations) setAesthetics(data.aesthetic_expectations ?? []);
          if (data.lifestyle_habits)       setLifestyle(data.lifestyle_habits ?? []);
          if (data.investment_preference)  setInvestment(data.investment_preference);
          if (data.open_question)          setOpenQ(data.open_question);
        } catch (e) {
          console.warn('[HealthPassport] Failed to populate form fields:', e);
        }
      }
      if (!cancelled) setLoadingData(false);
    }
    loadExisting();
    return () => { cancelled = true; };
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nie si prihlásený.');
      const { error } = await supabase.from('health_passports').upsert(
        {
          patient_id: user.id,
          main_reasons: visitReasons,
          medical_history: medConditions,
          allergies: allergies.trim() || null,
          medications: medications.trim() || null,
          dental_history: dentalFreq || null,
          fear_level: fearLevel || null,
          comfort_preferences: comfort ? [comfort] : [],
          aesthetic_expectations: aesthetics,
          lifestyle_habits: lifestyle,
          investment_preference: investment || null,
          open_question: openQ.trim() || null,
        },
        { onConflict: 'patient_id' },
      );
      if (error) throw error;
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e: any) {
      setSaveError(e?.message ?? 'Nastala chyba pri ukladaní.');
    } finally {
      setSaving(false);
    }
  }

  if (loadingData) {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={COLORS.sand} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
            <Ionicons name="chevron-back" size={22} color={COLORS.cream} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerLabel}>ZDRAVOTNÝ PAS</Text>
            <Text style={styles.headerTitle}>Anamnestický dotazník</Text>
          </View>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <View style={styles.introBanner}>
            <Ionicons name="shield-checkmark-outline" size={15} color={COLORS.wal} />
            <Text style={styles.introText}>
              Dotazník je dôverný. Pomáha nám poskytovať vám bezpečnú a personalizovanú starostlivosť.
            </Text>
          </View>

          <SectionHeader num="1" title="HLAVNÝ DÔVOD NÁVŠTEVY" />
          <View style={styles.card}>
            {VISIT_REASONS.map((item) => (
              <CheckItem key={item} label={item} selected={visitReasons.includes(item)}
                onToggle={() => setVisitReasons((p) => toggle(p, item))} />
            ))}
          </View>

          <SectionHeader num="2" title="MEDICÍNSKA ANAMNÉZA" />
          <View style={styles.card}>
            <Text style={styles.cardSub}>Zaškrtnite, čo sa Vás týka:</Text>
            {MEDICAL_CONDITIONS.map((item) => (
              <CheckItem key={item} label={item} selected={medConditions.includes(item)}
                onToggle={() => setMedConditions((p) => toggle(p, item))} />
            ))}
            <View style={styles.dividerLine} />
            <Text style={styles.fieldLabel}>ALERGIE</Text>
            <TextInput style={styles.input} placeholder="napr. Penicilín, latex..."
              placeholderTextColor={COLORS.sand} value={allergies} onChangeText={setAllergies}
              multiline numberOfLines={2} textAlignVertical="top" />
            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>LIEKY (pravidelne užívané)</Text>
            <TextInput style={styles.input} placeholder="napr. Warfarín 5mg..."
              placeholderTextColor={COLORS.sand} value={medications} onChangeText={setMedications}
              multiline numberOfLines={2} textAlignVertical="top" />
          </View>

          <SectionHeader num="3" title="DENTÁLNA ANAMNÉZA" />
          <View style={styles.card}>
            <Text style={styles.cardSub}>Ako často chodíte k zubárovi?</Text>
            {DENTAL_FREQUENCY.map((item) => (
              <RadioItem key={item} label={item} selected={dentalFreq === item}
                onSelect={() => setDentalFreq(item)} />
            ))}
          </View>

          <SectionHeader num="4" title="STRACH ZO ZUBÁRA" />
          <View style={styles.card}>
            {FEAR_LEVELS.map((item) => (
              <RadioItem key={item} label={item} selected={fearLevel === item}
                onSelect={() => setFearLevel(item)} />
            ))}
          </View>

          <SectionHeader num="5" title="KOMFORT POČAS OŠETRENIA" />
          <View style={styles.card}>
            <Text style={styles.cardSub}>Čo vám pomáha relaxovať?</Text>
            {COMFORT_OPTIONS.map((item) => (
              <RadioItem key={item} label={item} selected={comfort === item}
                onSelect={() => setComfort(item)} />
            ))}
          </View>

          <SectionHeader num="6" title="ESTETICKÉ OČAKÁVANIA" />
          <View style={styles.card}>
            <Text style={styles.cardSub}>Čo by ste chceli zlepšiť?</Text>
            {AESTHETIC_OPTIONS.map((item) => (
              <CheckItem key={item} label={item} selected={aesthetics.includes(item)}
                onToggle={() => setAesthetics((p) => toggle(p, item))} />
            ))}
          </View>

          <SectionHeader num="7" title="ŽIVOTNÝ ŠTÝL" />
          <View style={styles.card}>
            {LIFESTYLE_OPTIONS.map((item) => (
              <CheckItem key={item} label={item} selected={lifestyle.includes(item)}
                onToggle={() => setLifestyle((p) => toggle(p, item))} />
            ))}
          </View>

          <SectionHeader num="8" title="INVESTIČNÉ OČAKÁVANIA" />
          <View style={styles.card}>
            {INVESTMENT_OPTIONS.map((item) => (
              <RadioItem key={item} label={item} selected={investment === item}
                onSelect={() => setInvestment(item)} />
            ))}
          </View>

          <SectionHeader num="9" title="OTVORENÁ OTÁZKA" />
          <View style={styles.card}>
            <Text style={styles.cardSub}>Čo by sme mohli urobiť, aby bola vaša návšteva čo najpríjemnejšia?</Text>
            <TextInput style={[styles.input, { minHeight: 90 }]}
              placeholder="Napíšte nám..." placeholderTextColor={COLORS.sand}
              value={openQ} onChangeText={setOpenQ}
              multiline numberOfLines={4} textAlignVertical="top" />
          </View>

          {saveError && (
            <View style={styles.errorBox}>
              <Ionicons name="warning-outline" size={14} color="#c0392b" />
              <Text style={styles.errorText}>{saveError}</Text>
            </View>
          )}

          <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave} disabled={saving} activeOpacity={0.85}>
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <><Ionicons name="checkmark-circle-outline" size={18} color="#fff" /><Text style={styles.saveBtnText}>Uložiť dotazník</Text></>}
          </TouchableOpacity>
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },
  content: { paddingBottom: 20 },
  header: { backgroundColor: COLORS.esp, paddingHorizontal: SIZES.padding, paddingTop: 14, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerLabel: { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '500', textTransform: 'uppercase', marginBottom: 3 },
  headerTitle: { fontSize: 19, fontWeight: '600', color: '#fff' },
  introBanner: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: COLORS.bg3, borderRadius: SIZES.radius, borderLeftWidth: 3, borderLeftColor: COLORS.sand, padding: 12, margin: SIZES.padding, marginBottom: 4 },
  introText: { flex: 1, fontSize: 12, color: COLORS.wal, lineHeight: 19 },
  secHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: SIZES.padding, paddingTop: 18, paddingBottom: 8 },
  secBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  secBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  secTitle: { fontSize: 11, letterSpacing: 1.5, color: COLORS.esp, fontWeight: '700', textTransform: 'uppercase' },
  card: { backgroundColor: '#fff', borderRadius: SIZES.radius, marginHorizontal: SIZES.padding, padding: 14, borderWidth: 1, borderColor: COLORS.bg3, gap: 6 },
  cardSub: { fontSize: 11, color: COLORS.wal, marginBottom: 6, lineHeight: 17 },
  dividerLine: { height: 1, backgroundColor: COLORS.bg3, marginVertical: 10 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.bg3, backgroundColor: '#FAFAF8' },
  optionSel: { backgroundColor: COLORS.esp, borderColor: COLORS.wal },
  optionText: { flex: 1, fontSize: 13, color: COLORS.esp },
  optionTextSel: { color: COLORS.cream, fontWeight: '500' },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: COLORS.sand, alignItems: 'center', justifyContent: 'center' },
  checkboxSel: { backgroundColor: COLORS.wal, borderColor: COLORS.wal },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: COLORS.sand, alignItems: 'center', justifyContent: 'center' },
  radioSel: { borderColor: COLORS.wal },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.wal },
  fieldLabel: { fontSize: 9, letterSpacing: 1.8, color: COLORS.wal, fontWeight: '600', textTransform: 'uppercase', marginBottom: 6 },
  input: { backgroundColor: COLORS.bg2, borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: SIZES.radius - 2, padding: 10, fontSize: 13, color: COLORS.esp, minHeight: 60, lineHeight: 20 },
  errorBox: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#FAE8E5', borderWidth: 1, borderColor: '#CC7060', borderRadius: SIZES.radius, padding: 12, marginHorizontal: SIZES.padding, marginTop: 12 },
  errorText: { flex: 1, fontSize: 12, color: '#8C2A18' },
  saveBtn: { backgroundColor: COLORS.wal, borderRadius: SIZES.radius, paddingVertical: 15, marginHorizontal: SIZES.padding, marginTop: 20, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, elevation: 4 },
  saveBtnDisabled: { opacity: 0.55 },
  saveBtnText: { fontSize: 15, fontWeight: '600', color: '#fff', letterSpacing: 0.3 },
});
