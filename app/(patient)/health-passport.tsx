import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../supabase';
import { COLORS, RADII, SPACING, GRADIENTS } from '../../styles/theme';
import { exportHealthPassport } from '../../utils/exportPDF';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';
import HeroHeader from '../../components/ui/HeroHeader';

const VISIT_REASONS = [
  'Bolesť', 'Estetika úsmevu', 'Kontrola', 'Implantáty',
  'Ortodoncia', 'Výmena starých výplní', 'Komplexná rekonštrukcia chrupu', 'Dentálna hygiena',
];
const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Neviem'];
const INSURANCE_PROVIDERS = ['VšZP', 'Dôvera', 'Union', 'Iné'];
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
  const { colors } = useAppTheme();
  return (
    <TouchableOpacity style={[styles.option, { borderColor: colors.bg3, backgroundColor: colors.cardBg }, selected && styles.optionSel]} onPress={onToggle} activeOpacity={0.75}>
      <View style={[styles.checkbox, { borderColor: colors.bg3 }, selected && styles.checkboxSel]}>
        {selected && <Ionicons name="checkmark" size={11} color="#fff" />}
      </View>
      <Text style={[styles.optionText, { color: colors.textPrimary }, selected && styles.optionTextSel]}>{label}</Text>
    </TouchableOpacity>
  );
}

function RadioItem({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  const { colors } = useAppTheme();
  return (
    <TouchableOpacity style={[styles.option, { borderColor: colors.bg3, backgroundColor: colors.cardBg }, selected && styles.optionSel]} onPress={onSelect} activeOpacity={0.75}>
      <View style={[styles.radio, { borderColor: colors.bg3 }, selected && styles.radioSel]}>
        {selected && <View style={styles.radioDot} />}
      </View>
      <Text style={[styles.optionText, { color: colors.textPrimary }, selected && styles.optionTextSel]}>{label}</Text>
    </TouchableOpacity>
  );
}

function OtherInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { colors, dark } = useAppTheme();
  return (
    <View style={[styles.otherInputWrap, { backgroundColor: colors.bg2, borderColor: colors.bg3 }]}>
      <Ionicons name="create-outline" size={15} color={COLORS.wal} style={{ marginTop: 2 }} />
      <TextInput
        style={[styles.otherInput, { color: colors.textPrimary }]}
        placeholder="Upresni..."
        placeholderTextColor={dark ? '#666' : '#999'}
        value={value}
        onChangeText={onChange}
        autoCapitalize="sentences"
        returnKeyType="done"
      />
    </View>
  );
}

function SectionHeader({ num, title }: { num: string; title: string }) {
  const { colors, dark } = useAppTheme();
  return (
    <View style={styles.secHeader}>
      <LinearGradient colors={[COLORS.goldDark, COLORS.gold]} style={styles.secBadge}>
        <Text style={styles.secBadgeText}>{num}</Text>
      </LinearGradient>
      <Text style={[styles.secTitle, { color: colors.textPrimary }]}>{title}</Text>
    </View>
  );
}

export default function HealthPassportScreen() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();

  const [visitReasons, setVisitReasons] = useState<string[]>([]);
  const [visitReasonsOther, setVisitReasonsOther] = useState('');
  const [medConditions, setMedConditions] = useState<string[]>([]);
  const [medConditionsOther, setMedConditionsOther] = useState('');
  const [allergies, setAllergies] = useState('');
  const [medications, setMedications] = useState('');
  const [dentalFreq, setDentalFreq] = useState('');
  const [dentalFreqOther, setDentalFreqOther] = useState('');
  const [fearLevel, setFearLevel] = useState('');
  const [comfort, setComfort] = useState('');
  const [comfortOther, setComfortOther] = useState('');
  const [aesthetics, setAesthetics] = useState<string[]>([]);
  const [aestheticsOther, setAestheticsOther] = useState('');
  const [lifestyle, setLifestyle] = useState<string[]>([]);
  const [lifestyleOther, setLifestyleOther] = useState('');
  const [investment, setInvestment] = useState('');
  const [openQ, setOpenQ] = useState('');
  // ── Nové: Základné údaje ─────────────────────────────────────────────────
  const [bloodType, setBloodType]                 = useState('');
  const [insuranceProvider, setInsuranceProvider] = useState('');
  const [insuranceProviderOther, setInsuranceProviderOther] = useState('');
  const [insuranceNumber, setInsuranceNumber]     = useState('');
  const [emergencyName, setEmergencyName]         = useState('');
  const [emergencyPhone, setEmergencyPhone]       = useState('');
  const [isPregnant, setIsPregnant]               = useState(false);
  const [lastDentalVisit, setLastDentalVisit]     = useState('');
  const [loadingData, setLoadingData] = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [exporting,   setExporting]   = useState(false);
  const [saveError,   setSaveError]   = useState<string | null>(null);
  const [patientName, setPatientName] = useState('Pacient');
  const [showQR,      setShowQR]      = useState(false);

  // ── Pomocné funkcie pre „Iné" ──────────────────────────────────────────────
  // Extrahuje vlastný text z "Iné: text" položky v poli
  function extractOtherFromArray(arr: string[]): { items: string[]; otherText: string } {
    const otherItem = arr.find((v) => v.startsWith('Iné:'));
    const otherText = otherItem ? otherItem.replace(/^Iné:\s*/, '') : '';
    const items = arr.map((v) => (v.startsWith('Iné:') ? 'Iné' : v));
    return { items, otherText };
  }
  // Extrahuje vlastný text z "Iné: text" rádio hodnoty
  function extractOtherFromRadio(val: string): { value: string; otherText: string } {
    if (val?.startsWith('Iné:')) return { value: 'Iné', otherText: val.replace(/^Iné:\s*/, '') };
    return { value: val ?? '', otherText: '' };
  }
  // Zakóduje "Iné" + vlastný text späť do uložiteľného formátu (pre pole)
  function encodeOtherArray(arr: string[], otherText: string): string[] {
    return arr.map((v) => (v === 'Iné' ? (otherText.trim() ? `Iné: ${otherText.trim()}` : 'Iné') : v));
  }
  // Zakóduje "Iné" + vlastný text pre rádio
  function encodeOtherRadio(val: string, otherText: string): string {
    if (val === 'Iné') return otherText.trim() ? `Iné: ${otherText.trim()}` : 'Iné';
    return val;
  }

  useEffect(() => {
    let cancelled = false;
    async function loadExisting() {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) { setLoadingData(false); return; }
      // Načítaj meno pacienta
      supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
        .then(({ data: p }) => { if (p?.full_name) setPatientName(p.full_name); });
      const { data } = await supabase.from('health_passports').select('*').eq('patient_id', user.id).maybeSingle();
      if (cancelled) return;
      if (data) {
        try {
          if (data.main_reasons) {
            const { items, otherText } = extractOtherFromArray(data.main_reasons ?? []);
            setVisitReasons(items); setVisitReasonsOther(otherText);
          }
          if (data.medical_history) {
            const { items, otherText } = extractOtherFromArray(data.medical_history ?? []);
            setMedConditions(items); setMedConditionsOther(otherText);
          }
          if (data.allergies)    setAllergies(data.allergies);
          if (data.medications)  setMedications(data.medications);
          if (data.dental_history) {
            const { value, otherText } = extractOtherFromRadio(data.dental_history);
            setDentalFreq(value); setDentalFreqOther(otherText);
          }
          if (data.fear_level)   setFearLevel(data.fear_level);
          if (data.comfort_preferences) {
            const { value, otherText } = extractOtherFromRadio(data.comfort_preferences?.[0] ?? '');
            setComfort(value); setComfortOther(otherText);
          }
          if (data.aesthetic_expectations) {
            const { items, otherText } = extractOtherFromArray(data.aesthetic_expectations ?? []);
            setAesthetics(items); setAestheticsOther(otherText);
          }
          if (data.lifestyle_habits) {
            const { items, otherText } = extractOtherFromArray(data.lifestyle_habits ?? []);
            setLifestyle(items); setLifestyleOther(otherText);
          }
          if (data.investment_preference) setInvestment(data.investment_preference);
          if (data.open_question)         setOpenQ(data.open_question);
          // Základné údaje
          if (data.blood_type)              setBloodType(data.blood_type);
          if (data.insurance_provider) {
            if (INSURANCE_PROVIDERS.includes(data.insurance_provider)) {
              setInsuranceProvider(data.insurance_provider);
            } else {
              setInsuranceProvider('Iné');
              setInsuranceProviderOther(data.insurance_provider);
            }
          }
          if (data.insurance_number)        setInsuranceNumber(data.insurance_number);
          if (data.emergency_contact_name)  setEmergencyName(data.emergency_contact_name);
          if (data.emergency_contact_phone) setEmergencyPhone(data.emergency_contact_phone);
          if (typeof data.is_pregnant === 'boolean') setIsPregnant(data.is_pregnant);
          if (data.last_dental_visit)       setLastDentalVisit(data.last_dental_visit);
        } catch (e) {
          console.warn('[HealthPassport] Failed to populate form fields:', e);
        }
      }
      if (!cancelled) setLoadingData(false);
    }
    loadExisting();
    return () => { cancelled = true; };
  }, []);

  async function handleExport() {
    setExporting(true);
    try {
      await exportHealthPassport({
        patientName,
        bloodType,
        insuranceProvider: insuranceProvider === 'Iné' ? insuranceProviderOther : insuranceProvider,
        insuranceNumber,
        emergencyName,
        emergencyPhone,
        isPregnant,
        lastDentalVisit,
        medConditions: medConditions.map((v) => v === 'Iné' ? `Iné: ${medConditionsOther}` : v).filter(Boolean),
        allergies,
        medications,
        visitReasons: visitReasons.map((v) => v === 'Iné' ? `Iné: ${visitReasonsOther}` : v).filter(Boolean),
        dentalFreq:   dentalFreq === 'Iné' ? `Iné: ${dentalFreqOther}` : dentalFreq,
        fearLevel,
        comfort:      comfort === 'Iné' ? `Iné: ${comfortOther}` : comfort,
        aesthetics:   aesthetics.map((v) => v === 'Iné' ? `Iné: ${aestheticsOther}` : v).filter(Boolean),
        lifestyle:    lifestyle.map((v) => v === 'Iné' ? `Iné: ${lifestyleOther}` : v).filter(Boolean),
        investment,
        openQ,
      });
    } finally {
      setExporting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nie si prihlásený.');
      const { error } = await supabase.from('health_passports').upsert(
        {
          patient_id: user.id,
          main_reasons:           encodeOtherArray(visitReasons, visitReasonsOther),
          medical_history:        encodeOtherArray(medConditions, medConditionsOther),
          allergies:              allergies.trim() || null,
          medications:            medications.trim() || null,
          dental_history:         encodeOtherRadio(dentalFreq, dentalFreqOther) || null,
          fear_level:             fearLevel || null,
          comfort_preferences:    comfort ? [encodeOtherRadio(comfort, comfortOther)] : [],
          aesthetic_expectations: encodeOtherArray(aesthetics, aestheticsOther),
          lifestyle_habits:       encodeOtherArray(lifestyle, lifestyleOther),
          investment_preference:  investment || null,
          open_question:          openQ.trim() || null,
          // Základné údaje
          blood_type:              bloodType || null,
          insurance_provider:      insuranceProvider === 'Iné'
                                     ? (insuranceProviderOther.trim() || null)
                                     : (insuranceProvider || null),
          insurance_number:        insuranceNumber.trim() || null,
          emergency_contact_name:  emergencyName.trim() || null,
          emergency_contact_phone: emergencyPhone.trim() || null,
          is_pregnant:             isPregnant,
          last_dental_visit:       lastDentalVisit.trim() || null,
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
      <View style={[styles.safe, { backgroundColor: dark ? '#0A0806' : colors.bg2 }]}>
        <HeroHeader title="Zdravotný pas" subtitle="Anamnestický dotazník" icon="shield-checkmark-outline" onBack={() => router.back()} />
        <View style={{ flex: 1, padding: SPACING.xl, paddingTop: 16 }}>
          <SkeletonList count={6} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.safe, { backgroundColor: dark ? '#0A0806' : colors.bg2 }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <HeroHeader
          title="Zdravotný pas"
          subtitle="Anamnestický dotazník"
          icon="shield-checkmark-outline"
          onBack={() => router.back()}
          rightElement={
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={styles.exportBtn} onPress={() => setShowQR(true)} activeOpacity={0.8}>
                <Ionicons name="qr-code-outline" size={18} color={COLORS.cream} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.exportBtn, exporting && { opacity: 0.5 }]} onPress={handleExport} disabled={exporting} activeOpacity={0.8}>
                {exporting ? <ActivityIndicator color={COLORS.cream} size="small" /> : <Ionicons name="download-outline" size={18} color={COLORS.cream} />}
              </TouchableOpacity>
            </View>
          }
        />

        {/* ── QR Modal ── */}
        <Modal visible={showQR} transparent animationType="fade" onRequestClose={() => setShowQR(false)}>
          <TouchableOpacity style={qrS.overlay} onPress={() => setShowQR(false)} activeOpacity={1}>
            <TouchableOpacity style={[qrS.sheet, { backgroundColor: colors.cardBg }]} onPress={() => {}} activeOpacity={1}>
              <View style={qrS.handleWrap}>
                <View style={[qrS.handle, { backgroundColor: colors.bg3 }]} />
              </View>
              <Text style={[qrS.title, { color: colors.textPrimary }]}>Zdravotný pas — QR kód</Text>
              <Text style={[qrS.sub, { color: colors.textSecondary }]}>Ukážte doktorovi pre rýchle načítanie</Text>

              {/* QR kód */}
              <View style={qrS.qrWrap}>
                <Image
                  source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                    [
                      `LODERER DENTAL — ${patientName}`,
                      bloodType        ? `Krvná sk.: ${bloodType}` : null,
                      allergies        ? `Alergie: ${allergies}` : null,
                      medications      ? `Lieky: ${medications}` : null,
                      emergencyName    ? `Núdz. kontakt: ${emergencyName} ${emergencyPhone}` : null,
                      insuranceProvider && insuranceNumber ? `Poistenie: ${insuranceProvider} ${insuranceNumber}` : null,
                    ].filter(Boolean).join('\n')
                  )}` }}
                  style={qrS.qr}
                  resizeMode="contain"
                />
              </View>

              {/* Emergency card */}
              <View style={[qrS.card, { backgroundColor: dark ? '#0D3B1F' : '#EAFAF1', borderColor: dark ? '#27AE6044' : '#A9DFBF' }]}>
                <Text style={[qrS.cardTitle, { color: dark ? '#58D68D' : '#1E8449' }]}>🚨 Núdzové info</Text>
                {bloodType     ? <Text style={[qrS.cardRow, { color: colors.textPrimary }]}>🩸 Krvná skupina: <Text style={{ fontFamily: 'DMSans_500Medium' }}>{bloodType}</Text></Text> : null}
                {allergies     ? <Text style={[qrS.cardRow, { color: colors.textPrimary }]}>⚠️ Alergie: <Text style={{ fontFamily: 'DMSans_500Medium' }}>{allergies}</Text></Text> : null}
                {medications   ? <Text style={[qrS.cardRow, { color: colors.textPrimary }]}>💊 Lieky: <Text style={{ fontFamily: 'DMSans_500Medium' }}>{medications}</Text></Text> : null}
                {emergencyName ? <Text style={[qrS.cardRow, { color: colors.textPrimary }]}>📞 Kontakt: <Text style={{ fontFamily: 'DMSans_500Medium' }}>{emergencyName} {emergencyPhone}</Text></Text> : null}
                {!bloodType && !allergies && !emergencyName && (
                  <Text style={[qrS.cardRow, { color: colors.textSecondary }]}>Vyplňte základné údaje pre núdzovú kartu.</Text>
                )}
              </View>

              <TouchableOpacity style={[qrS.closeBtn, { backgroundColor: COLORS.esp }]} onPress={() => setShowQR(false)} activeOpacity={0.85}>
                <Text style={qrS.closeBtnText}>Zavrieť</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        <ScrollView style={[styles.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <View style={[styles.introBanner, { backgroundColor: dark ? '#1E1610' : COLORS.bg3, borderLeftColor: COLORS.gold }]}>
            <Ionicons name="shield-checkmark-outline" size={15} color={COLORS.gold} />
            <Text style={[styles.introText, { color: dark ? COLORS.sand : COLORS.wal }]}>
              Dotazník je dôverný. Pomáha nám poskytovať vám bezpečnú a personalizovanú starostlivosť.
            </Text>
          </View>

          {/* ── NOVÁ SEKCIA: ZÁKLADNÉ ÚDAJE ─────────────────────────────── */}
          <SectionHeader num="0" title="ZÁKLADNÉ ÚDAJE" />
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Text style={styles.fieldLabel}>KRVNÁ SKUPINA</Text>
            <View style={styles.chipRow}>
              {BLOOD_TYPES.map((bt) => (
                <TouchableOpacity key={bt}
                  style={[styles.chip, bloodType === bt && styles.chipSel]}
                  onPress={() => setBloodType(bloodType === bt ? '' : bt)}
                  activeOpacity={0.75}>
                  <Text style={[styles.chipText, bloodType === bt && styles.chipTextSel]}>{bt}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.dividerLine} />
            <Text style={styles.fieldLabel}>ZDRAVOTNÁ POISŤOVŇA</Text>
            <View style={styles.chipRow}>
              {INSURANCE_PROVIDERS.map((p) => (
                <TouchableOpacity key={p}
                  style={[styles.chip, insuranceProvider === p && styles.chipSel]}
                  onPress={() => setInsuranceProvider(insuranceProvider === p ? '' : p)}
                  activeOpacity={0.75}>
                  <Text style={[styles.chipText, insuranceProvider === p && styles.chipTextSel]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {insuranceProvider === 'Iné' && (
              <OtherInput value={insuranceProviderOther} onChange={setInsuranceProviderOther} />
            )}

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>ČÍSLO POISTENCA</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
              placeholder="napr. 8501234567"
              placeholderTextColor={dark ? '#666' : '#999'}
              value={insuranceNumber} onChangeText={setInsuranceNumber}
              keyboardType="numeric" returnKeyType="done" />

            <View style={styles.dividerLine} />
            <Text style={styles.fieldLabel}>KONTAKTNÁ OSOBA V PRÍPADE NÚDZE</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
              placeholder="Meno a priezvisko"
              placeholderTextColor={dark ? '#666' : '#999'}
              value={emergencyName} onChangeText={setEmergencyName}
              autoCapitalize="words" returnKeyType="next" />
            <TextInput style={[styles.input, { marginTop: 8, backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
              placeholder="Telefón"
              placeholderTextColor={dark ? '#666' : '#999'}
              value={emergencyPhone} onChangeText={setEmergencyPhone}
              keyboardType="phone-pad" returnKeyType="done" />

            <View style={styles.dividerLine} />
            <Text style={styles.fieldLabel}>POSLEDNÁ NÁVŠTEVA U ZUBÁRA</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
              placeholder="napr. 2024-06-15 alebo 'Pred rokom'"
              placeholderTextColor={dark ? '#666' : '#999'}
              value={lastDentalVisit} onChangeText={setLastDentalVisit}
              autoCapitalize="sentences" returnKeyType="done" />

            <View style={styles.dividerLine} />
            <TouchableOpacity
              style={[styles.option, isPregnant && styles.optionSel]}
              onPress={() => setIsPregnant((v) => !v)}
              activeOpacity={0.75}>
              <View style={[styles.checkbox, isPregnant && styles.checkboxSel]}>
                {isPregnant && <Ionicons name="checkmark" size={11} color="#fff" />}
              </View>
              <Text style={[styles.optionText, isPregnant && styles.optionTextSel]}>
                🤰 Som tehotná / dojčím
              </Text>
            </TouchableOpacity>
          </View>

          <SectionHeader num="1" title="HLAVNÝ DÔVOD NÁVŠTEVY" />
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            {VISIT_REASONS.map((item) => (
              <CheckItem key={item} label={item} selected={visitReasons.includes(item)}
                onToggle={() => setVisitReasons((p) => toggle(p, item))} />
            ))}
            <CheckItem label="Iné" selected={visitReasons.includes('Iné')}
              onToggle={() => setVisitReasons((p) => toggle(p, 'Iné'))} />
            {visitReasons.includes('Iné') && (
              <OtherInput value={visitReasonsOther} onChange={setVisitReasonsOther} />
            )}
          </View>

          <SectionHeader num="2" title="MEDICÍNSKA ANAMNÉZA" />
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Text style={styles.cardSub}>Zaškrtnite, čo sa Vás týka:</Text>
            {MEDICAL_CONDITIONS.map((item) => (
              <CheckItem key={item} label={item} selected={medConditions.includes(item)}
                onToggle={() => setMedConditions((p) => toggle(p, item))} />
            ))}
            <CheckItem label="Iné" selected={medConditions.includes('Iné')}
              onToggle={() => setMedConditions((p) => toggle(p, 'Iné'))} />
            {medConditions.includes('Iné') && (
              <OtherInput value={medConditionsOther} onChange={setMedConditionsOther} />
            )}
            <View style={styles.dividerLine} />
            <Text style={styles.fieldLabel}>ALERGIE</Text>
            <TextInput style={[styles.input, { minHeight: 60, backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]} placeholder="napr. Penicilín, latex..."
              placeholderTextColor={dark ? '#666' : '#999'} value={allergies} onChangeText={setAllergies}
              multiline numberOfLines={2} textAlignVertical="top" />
            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>LIEKY (pravidelne užívané)</Text>
            <TextInput style={[styles.input, { minHeight: 60, backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]} placeholder="napr. Warfarín 5mg..."
              placeholderTextColor={dark ? '#666' : '#999'} value={medications} onChangeText={setMedications}
              multiline numberOfLines={2} textAlignVertical="top" />
          </View>

          <SectionHeader num="3" title="DENTÁLNA ANAMNÉZA" />
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Text style={styles.cardSub}>Ako často chodíte k zubárovi?</Text>
            {DENTAL_FREQUENCY.map((item) => (
              <RadioItem key={item} label={item} selected={dentalFreq === item}
                onSelect={() => setDentalFreq(item)} />
            ))}
            <RadioItem label="Iné" selected={dentalFreq === 'Iné'}
              onSelect={() => setDentalFreq('Iné')} />
            {dentalFreq === 'Iné' && (
              <OtherInput value={dentalFreqOther} onChange={setDentalFreqOther} />
            )}
          </View>

          <SectionHeader num="4" title="STRACH ZO ZUBÁRA" />
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            {FEAR_LEVELS.map((item) => (
              <RadioItem key={item} label={item} selected={fearLevel === item}
                onSelect={() => setFearLevel(item)} />
            ))}
          </View>

          <SectionHeader num="5" title="KOMFORT POČAS OŠETRENIA" />
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Text style={styles.cardSub}>Čo vám pomáha relaxovať?</Text>
            {COMFORT_OPTIONS.map((item) => (
              <RadioItem key={item} label={item} selected={comfort === item}
                onSelect={() => setComfort(item)} />
            ))}
            <RadioItem label="Iné" selected={comfort === 'Iné'}
              onSelect={() => setComfort('Iné')} />
            {comfort === 'Iné' && (
              <OtherInput value={comfortOther} onChange={setComfortOther} />
            )}
          </View>

          <SectionHeader num="6" title="ESTETICKÉ OČAKÁVANIA" />
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Text style={styles.cardSub}>Čo by ste chceli zlepšiť?</Text>
            {AESTHETIC_OPTIONS.map((item) => (
              <CheckItem key={item} label={item} selected={aesthetics.includes(item)}
                onToggle={() => setAesthetics((p) => toggle(p, item))} />
            ))}
            <CheckItem label="Iné" selected={aesthetics.includes('Iné')}
              onToggle={() => setAesthetics((p) => toggle(p, 'Iné'))} />
            {aesthetics.includes('Iné') && (
              <OtherInput value={aestheticsOther} onChange={setAestheticsOther} />
            )}
          </View>

          <SectionHeader num="7" title="ŽIVOTNÝ ŠTÝL" />
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            {LIFESTYLE_OPTIONS.map((item) => (
              <CheckItem key={item} label={item} selected={lifestyle.includes(item)}
                onToggle={() => setLifestyle((p) => toggle(p, item))} />
            ))}
            <CheckItem label="Iné" selected={lifestyle.includes('Iné')}
              onToggle={() => setLifestyle((p) => toggle(p, 'Iné'))} />
            {lifestyle.includes('Iné') && (
              <OtherInput value={lifestyleOther} onChange={setLifestyleOther} />
            )}
          </View>

          <SectionHeader num="8" title="INVESTIČNÉ OČAKÁVANIA" />
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            {INVESTMENT_OPTIONS.map((item) => (
              <RadioItem key={item} label={item} selected={investment === item}
                onSelect={() => setInvestment(item)} />
            ))}
          </View>

          <SectionHeader num="9" title="OTVORENÁ OTÁZKA" />
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Text style={styles.cardSub}>Čo by sme mohli urobiť, aby bola vaša návšteva čo najpríjemnejšia?</Text>
            <TextInput style={[styles.input, { minHeight: 90, backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
              placeholder="Napíšte nám..." placeholderTextColor={dark ? '#666' : '#999'}
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
            <LinearGradient colors={[COLORS.goldDark, COLORS.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveGrad}>
              {saving
                ? <ActivityIndicator color="#1A1209" size="small" />
                : <><Ionicons name="checkmark-circle-outline" size={18} color="#1A1209" /><Text style={styles.saveBtnText}>Uložiť dotazník</Text></>}
            </LinearGradient>
          </TouchableOpacity>
          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },
  content: { paddingBottom: 120 },
  header: { backgroundColor: COLORS.esp, paddingHorizontal: SPACING.xl, paddingTop: 14, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn:   { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(201,168,76,0.15)', alignItems: 'center', justifyContent: 'center' },
  exportBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(201,168,76,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerLabel: { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '500', textTransform: 'uppercase', marginBottom: 3 },
  headerTitle: { fontSize: 19, fontWeight: '600', color: '#fff' },
  introBanner: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: COLORS.bg3, borderRadius: RADII.md, borderLeftWidth: 3, borderLeftColor: COLORS.gold, padding: 12, margin: SPACING.xl, marginBottom: 4 },
  introText: { flex: 1, fontSize: 13, color: COLORS.wal, lineHeight: 20 },
  secHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: SPACING.xl, paddingTop: 18, paddingBottom: 8 },
  secBadge: { width: 22, height: 22, borderRadius: 11, overflow: 'hidden' as const, alignItems: 'center', justifyContent: 'center' },
  secBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  secTitle: { fontSize: 12, letterSpacing: 1.5, color: COLORS.esp, fontWeight: '700', textTransform: 'uppercase' },
  card: { backgroundColor: COLORS.cream, borderRadius: RADII.md, marginHorizontal: SPACING.xl, padding: 14, borderWidth: 1, borderColor: COLORS.bg3, gap: 6 },
  cardSub: { fontSize: 12, color: COLORS.wal, marginBottom: 6, lineHeight: 18 },
  dividerLine: { height: 1, backgroundColor: COLORS.bg3, marginVertical: 10 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 10, borderRadius: RADII.xs, borderWidth: 1, borderColor: COLORS.bg3, backgroundColor: '#FAFAF8' },
  optionSel: { backgroundColor: COLORS.esp, borderColor: COLORS.gold },
  optionText: { flex: 1, fontSize: 13, color: COLORS.esp },
  optionTextSel: { color: COLORS.cream, fontWeight: '500' },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: COLORS.sand, alignItems: 'center', justifyContent: 'center' },
  checkboxSel: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: COLORS.sand, alignItems: 'center', justifyContent: 'center' },
  radioSel: { borderColor: COLORS.gold },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.gold },
  fieldLabel: { fontSize: 9, letterSpacing: 1.8, color: COLORS.wal, fontWeight: '600', textTransform: 'uppercase', marginBottom: 6 },
  input: { backgroundColor: COLORS.bg2, borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: RADII.sm, padding: 10, fontSize: 13, color: COLORS.esp, minHeight: 42, lineHeight: 20 },
  chipRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 4 },
  chip:        { paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADII.pill, borderWidth: 1.5, borderColor: COLORS.bg3, backgroundColor: '#FAFAF8' },
  chipSel:     { backgroundColor: COLORS.esp, borderColor: COLORS.gold },
  chipText:    { fontSize: 13, fontWeight: '600', color: COLORS.esp },
  chipTextSel: { color: COLORS.cream },
  otherInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.bg2, borderRadius: RADII.xs, borderWidth: 1.5, borderColor: COLORS.sand, paddingHorizontal: 10, paddingVertical: 4, marginTop: 2 },
  otherInput:     { flex: 1, fontSize: 13, color: COLORS.esp, paddingVertical: 8 },
  errorBox: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#FAE8E5', borderWidth: 1, borderColor: '#CC7060', borderRadius: RADII.md, padding: 12, marginHorizontal: SPACING.xl, marginTop: 12 },
  errorText: { flex: 1, fontSize: 13, color: '#8C2A18' },
  saveBtn: { borderRadius: RADII.md, marginHorizontal: SPACING.xl, marginTop: 20, overflow: 'hidden' as const, elevation: 4 },
  saveGrad: { paddingVertical: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  saveBtnDisabled: { opacity: 0.55 },
  saveBtnText: { fontSize: 15, fontWeight: '600', color: '#1A1209', letterSpacing: 0.3 },
});

const qrS = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, alignItems: 'center' },
  handleWrap: { width: '100%', alignItems: 'center', marginBottom: 16 },
  handle:     { width: 38, height: 4, borderRadius: 2 },
  title:      { fontSize: 20, fontFamily: 'PlayfairDisplay_700Bold', marginBottom: 4, textAlign: 'center' },
  sub:        { fontSize: 13, textAlign: 'center', marginBottom: 20 },
  qrWrap:     { backgroundColor: COLORS.cream, borderRadius: 16, padding: 12, marginBottom: 20, elevation: 4 },
  qr:         { width: 220, height: 220 },
  card:       { width: '100%', borderRadius: 14, borderWidth: 1.5, padding: 14, gap: 4, marginBottom: 20 },
  cardTitle:  { fontSize: 14, fontFamily: 'DMSans_500Medium', marginBottom: 6 },
  cardRow:    { fontSize: 13, lineHeight: 20 },
  closeBtn:   { width: '100%', paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  closeBtnText:{ fontSize: 15, fontFamily: 'DMSans_500Medium', color: '#FAF6F0' },
});
