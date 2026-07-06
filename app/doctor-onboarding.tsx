import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, KeyboardAvoidingView,
  Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../supabase';
import { COLORS, SPACING, RADII } from '../styles/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type Day = 'Po' | 'Ut' | 'St' | 'Št' | 'Pi' | 'So' | 'Ne';
const DAYS: Day[] = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];

interface DaySchedule {
  enabled: boolean;
  from: string;
  to: string;
}

// ─── Step indicators ──────────────────────────────────────────────────────────

function StepDot({ index, current, total }: { index: number; current: number; total: number }) {
  const done = index < current;
  const active = index === current;
  return (
    <View style={[
      sd.dot,
      active && sd.dotActive,
      done && sd.dotDone,
    ]}>
      {done
        ? <Ionicons name="checkmark" size={12} color="#fff" />
        : <Text style={[sd.dotNum, (active || done) && sd.dotNumLight]}>{index + 1}</Text>}
    </View>
  );
}

const sd = StyleSheet.create({
  dot: {
    width: 28, height: 28, borderRadius: 2,
    backgroundColor: COLORS.bg3, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.bg3,
  },
  dotActive: { backgroundColor: COLORS.esp, borderColor: COLORS.esp },
  dotDone:   { backgroundColor: COLORS.wal, borderColor: COLORS.wal },
  dotNum:    { fontSize: 12, fontWeight: '700', color: COLORS.wal },
  dotNumLight: { color: '#fff' },
});

// ─── Step 1 — Welcome ─────────────────────────────────────────────────────────

function StepWelcome({ name, onNext }: { name: string; onNext: () => void }) {
  return (
    <ScrollView contentContainerStyle={step.scroll} keyboardShouldPersistTaps="handled">
      <View style={step.heroBox}>
        <View style={step.heroBg} />
        <View style={step.heroIcon}>
          <Ionicons name="medical" size={36} color={COLORS.sand} />
        </View>
        <Text style={step.heroGreet}>Vitajte,</Text>
        <Text style={step.heroName}>{name || 'Doktor'} 👋</Text>
        <Text style={step.heroSub}>
          Za pár krokov nastavíme váš profil v Loderer Dental systéme.
        </Text>
      </View>

      <View style={step.infoCards}>
        {[
          { icon: 'person-circle-outline', label: 'Profil', desc: 'Titul, špecializácia, kontakt' },
          { icon: 'time-outline',          label: 'Ordinačné hodiny', desc: 'Nastavte pracovný čas' },
          { icon: 'checkmark-done-circle-outline', label: 'Hotovo', desc: 'Začnite pracovať' },
        ].map((item, i) => (
          <View key={i} style={step.infoCard}>
            <View style={step.infoCardIcon}>
              <Ionicons name={item.icon as any} size={22} color={COLORS.wal} />
            </View>
            <View>
              <Text style={step.infoCardTitle}>{item.label}</Text>
              <Text style={step.infoCardSub}>{item.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      <TouchableOpacity style={step.btn} onPress={onNext} activeOpacity={0.85}>
        <Text style={step.btnText}>Začať nastavenie</Text>
        <Ionicons name="arrow-forward" size={18} color="#fff" />
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Step 2 — Profile ─────────────────────────────────────────────────────────

function StepProfile({
  form, onChange, onNext, onBack, loading,
}: {
  form: { title: string; specialty: string; phone: string; bio: string };
  onChange: (key: string, val: string) => void;
  onNext: () => void;
  onBack: () => void;
  loading: boolean;
}) {
  return (
    <ScrollView contentContainerStyle={step.scroll} keyboardShouldPersistTaps="handled">
      <Text style={step.sectionTitle}>Váš profil</Text>
      <Text style={step.sectionSub}>Tieto údaje uvidia pacienti na vašom profile.</Text>

      {[
        { key: 'title',     label: 'TITUL', placeholder: 'napr. MDDr.', icon: 'ribbon-outline' },
        { key: 'specialty', label: 'ŠPECIALIZÁCIA', placeholder: 'napr. Ortodontia', icon: 'fitness-outline' },
        { key: 'phone',     label: 'TELEFÓN', placeholder: '+421 9XX XXX XXX', icon: 'call-outline', keyboard: 'phone-pad' as const },
      ].map(field => (
        <View key={field.key} style={{ marginBottom: 16 }}>
          <Text style={step.label}>{field.label}</Text>
          <View style={step.inputWrap}>
            <Ionicons name={field.icon as any} size={17} color={COLORS.wal} style={{ marginRight: 8 }} />
            <TextInput
              style={step.input}
              placeholder={field.placeholder}
              placeholderTextColor="#999"
              value={(form as any)[field.key]}
              onChangeText={v => onChange(field.key, v)}
              keyboardType={field.keyboard}
              autoCapitalize={field.key === 'phone' ? 'none' : 'words'}
            />
          </View>
        </View>
      ))}

      <Text style={step.label}>BIO (voliteľné)</Text>
      <TextInput
        style={[step.inputWrap, step.textArea]}
        placeholder="Krátky popis pre pacientov..."
        placeholderTextColor="#999"
        value={form.bio}
        onChangeText={v => onChange('bio', v)}
        multiline
        numberOfLines={3}
      />

      <View style={step.btnRow}>
        <TouchableOpacity style={step.btnSecondary} onPress={onBack} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={16} color={COLORS.wal} />
          <Text style={step.btnSecondaryText}>Späť</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[step.btn, { flex: 1 }]} onPress={onNext} activeOpacity={0.85} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <>
                <Text style={step.btnText}>Pokračovať</Text>
                <Ionicons name="arrow-forward" size={16} color="#fff" />
              </>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ─── Step 3 — Opening Hours ───────────────────────────────────────────────────

function StepHours({
  schedule, onToggle, onChange, onNext, onBack, loading,
}: {
  schedule: Record<Day, DaySchedule>;
  onToggle: (d: Day) => void;
  onChange: (d: Day, key: 'from' | 'to', val: string) => void;
  onNext: () => void;
  onBack: () => void;
  loading: boolean;
}) {
  return (
    <ScrollView contentContainerStyle={step.scroll} keyboardShouldPersistTaps="handled">
      <Text style={step.sectionTitle}>Ordinačné hodiny</Text>
      <Text style={step.sectionSub}>Nastavte dni a časy vašej ordinačnej doby.</Text>

      {DAYS.map(day => {
        const s = schedule[day];
        return (
          <View key={day} style={hrs.row}>
            <TouchableOpacity style={[hrs.dayBtn, s.enabled && hrs.dayBtnOn]} onPress={() => onToggle(day)} activeOpacity={0.8}>
              <Text style={[hrs.dayText, s.enabled && hrs.dayTextOn]}>{day}</Text>
            </TouchableOpacity>
            {s.enabled ? (
              <View style={hrs.timeRow}>
                <TextInput
                  style={hrs.timeInput}
                  value={s.from}
                  onChangeText={v => onChange(day, 'from', v)}
                  placeholder="08:00"
                  placeholderTextColor="#bbb"
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                />
                <Text style={hrs.dash}>–</Text>
                <TextInput
                  style={hrs.timeInput}
                  value={s.to}
                  onChangeText={v => onChange(day, 'to', v)}
                  placeholder="17:00"
                  placeholderTextColor="#bbb"
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                />
              </View>
            ) : (
              <Text style={hrs.closed}>Zatvorené</Text>
            )}
          </View>
        );
      })}

      <View style={[step.btnRow, { marginTop: 24 }]}>
        <TouchableOpacity style={step.btnSecondary} onPress={onBack} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={16} color={COLORS.wal} />
          <Text style={step.btnSecondaryText}>Späť</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[step.btn, { flex: 1 }]} onPress={onNext} activeOpacity={0.85} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <>
                <Text style={step.btnText}>Uložiť a dokončiť</Text>
                <Ionicons name="checkmark" size={16} color="#fff" />
              </>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ─── Step 4 — Done ────────────────────────────────────────────────────────────

function StepDone({ onFinish }: { onFinish: () => void }) {
  return (
    <View style={step.doneWrap}>
      <View style={step.doneCircle}>
        <Ionicons name="checkmark-done" size={48} color="#fff" />
      </View>
      <Text style={step.doneTitle}>Všetko nastavené!</Text>
      <Text style={step.doneSub}>
        Váš profil je aktívny. Môžete začať pracovať so systémom.
      </Text>
      <TouchableOpacity style={[step.btn, { alignSelf: 'stretch', marginTop: 32 }]} onPress={onFinish} activeOpacity={0.85}>
        <Ionicons name="home" size={18} color="#fff" />
        <Text style={step.btnText}>Prejsť do aplikácie</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const defaultSchedule: Record<Day, DaySchedule> = {
  Po: { enabled: true,  from: '08:00', to: '17:00' },
  Ut: { enabled: true,  from: '08:00', to: '17:00' },
  St: { enabled: true,  from: '08:00', to: '17:00' },
  Št: { enabled: true,  from: '08:00', to: '17:00' },
  Pi: { enabled: true,  from: '08:00', to: '14:00' },
  So: { enabled: false, from: '09:00', to: '12:00' },
  Ne: { enabled: false, from: '09:00', to: '12:00' },
};

export default function DoctorOnboarding() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [myName, setMyName] = useState('');

  const [profile, setProfile] = useState({ title: '', specialty: '', phone: '', bio: '' });
  const [schedule, setSchedule] = useState<Record<Day, DaySchedule>>(defaultSchedule);

  const TOTAL_STEPS = 4;

  // Load current user name on mount
  React.useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
      if (data?.full_name) setMyName(data.full_name);
    });
  }, []);

  function updateProfile(key: string, val: string) {
    setProfile(prev => ({ ...prev, [key]: val }));
  }

  function toggleDay(day: Day) {
    setSchedule(prev => ({ ...prev, [day]: { ...prev[day], enabled: !prev[day].enabled } }));
  }

  function updateHour(day: Day, key: 'from' | 'to', val: string) {
    setSchedule(prev => ({ ...prev, [day]: { ...prev[day], [key]: val } }));
  }

  async function saveProfile() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const payload: Record<string, any> = {};
    if (profile.title.trim())    payload.title       = profile.title.trim();
    if (profile.specialty.trim()) payload.specialty   = profile.specialty.trim();
    if (profile.phone.trim())    payload.phone       = profile.phone.trim();
    if (profile.bio.trim())      payload.bio         = profile.bio.trim();

    if (Object.keys(payload).length > 0) {
      const { error } = await supabase.from('profiles').update(payload).eq('id', user.id);
      if (error) {
        Alert.alert('Chyba', error.message);
        setLoading(false);
        return;
      }
    }
    setLoading(false);
    setCurrentStep(2);
  }

  async function saveHours() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const hoursPayload = DAYS.reduce((acc, day) => {
      const s = schedule[day];
      acc[day] = s.enabled ? { open: s.from, close: s.to } : null;
      return acc;
    }, {} as Record<string, any>);

    const { error } = await supabase.from('profiles')
      .update({ opening_hours: hoursPayload })
      .eq('id', user.id);

    setLoading(false);
    if (error) { Alert.alert('Chyba', error.message); return; }
    setCurrentStep(3);
  }

  function finish() {
    router.replace('/(doctor)');
  }

  return (
    <SafeAreaView style={main.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

        {/* ── Progress bar ── */}
        {currentStep < 3 && (
          <View style={main.progress}>
            <View style={main.progressTrack}>
              <View style={[main.progressFill, { width: `${((currentStep + 1) / TOTAL_STEPS) * 100}%` }]} />
            </View>
            <View style={main.dotsRow}>
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <StepDot key={i} index={i} current={currentStep} total={TOTAL_STEPS} />
              ))}
            </View>
            <Text style={main.stepLabel}>
              Krok {currentStep + 1} z {TOTAL_STEPS}
            </Text>
          </View>
        )}

        {/* ── Step content ── */}
        {currentStep === 0 && (
          <StepWelcome name={myName} onNext={() => setCurrentStep(1)} />
        )}
        {currentStep === 1 && (
          <StepProfile
            form={profile}
            onChange={updateProfile}
            onNext={saveProfile}
            onBack={() => setCurrentStep(0)}
            loading={loading}
          />
        )}
        {currentStep === 2 && (
          <StepHours
            schedule={schedule}
            onToggle={toggleDay}
            onChange={updateHour}
            onNext={saveHours}
            onBack={() => setCurrentStep(1)}
            loading={loading}
          />
        )}
        {currentStep === 3 && (
          <StepDone onFinish={finish} />
        )}

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const main = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg2 },

  progress: {
    backgroundColor: COLORS.cream, paddingHorizontal: SPACING.xl,
    paddingTop: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.bg3,
    gap: 12,
  },
  progressTrack: {
    height: 4, borderRadius: 2, backgroundColor: COLORS.bg3, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', borderRadius: 2, backgroundColor: COLORS.wal,
  },
  dotsRow: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  stepLabel: { fontSize: 11, color: COLORS.wal, fontWeight: '600', textAlign: 'center' },
});

const step = StyleSheet.create({
  scroll: { padding: SPACING.xl, paddingBottom: 40 },

  heroBox: {
    alignItems: 'center', backgroundColor: COLORS.esp,
    borderRadius: 4, padding: 28, marginBottom: 24, overflow: 'hidden',
  },
  heroBg: {
    position: 'absolute', width: 200, height: 200, borderRadius: 4,
    backgroundColor: COLORS.wal, opacity: 0.15, top: -60, right: -60,
  },
  heroIcon: {
    width: 72, height: 72, borderRadius: 4,
    backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center',
    marginBottom: 16, borderWidth: 2, borderColor: COLORS.sand,
  },
  heroGreet: { fontSize: 14, color: COLORS.sand, fontWeight: '500', marginBottom: 2 },
  heroName:  { fontSize: 26, fontWeight: '800', color: '#fff', marginBottom: 10 },
  heroSub:   { fontSize: 13, color: COLORS.cream, textAlign: 'center', lineHeight: 20, opacity: 0.85 },

  infoCards: { gap: 10, marginBottom: 28 },
  infoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.cream, borderRadius: 2, padding: 14,
    borderWidth: 1, borderColor: COLORS.bg3, elevation: 1,
  },
  infoCardIcon: {
    width: 42, height: 42, borderRadius: 2,
    backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center',
  },
  infoCardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.esp },
  infoCardSub:   { fontSize: 12, color: COLORS.wal, marginTop: 2 },

  sectionTitle: { fontSize: 22, fontWeight: '800', color: COLORS.esp, marginBottom: 6 },
  sectionSub:   { fontSize: 13, color: COLORS.wal, marginBottom: 22, lineHeight: 19 },

  label: {
    fontSize: 10, fontWeight: '700', color: COLORS.wal,
    letterSpacing: 1.5, marginBottom: 7,
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: COLORS.bg3,
    borderRadius: 2, backgroundColor: COLORS.cream,
    paddingHorizontal: 12,
  },
  input: { flex: 1, paddingVertical: 13, fontSize: 15, color: COLORS.esp },
  textArea: {
    borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: 2,
    backgroundColor: COLORS.cream, padding: 12, fontSize: 14, color: COLORS.esp,
    height: 90, textAlignVertical: 'top',
  },

  btnRow: { flexDirection: 'row', gap: 10, marginTop: 24 },
  btn: {
    backgroundColor: COLORS.esp, borderRadius: 2,
    paddingVertical: 15, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 8,
    elevation: 4, shadowColor: COLORS.esp,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
  },
  btnText:        { fontSize: 15, fontWeight: '700', color: '#fff' },
  btnSecondary: {
    paddingHorizontal: 16, paddingVertical: 15,
    borderRadius: 2, borderWidth: 1.5, borderColor: COLORS.bg3,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.cream,
  },
  btnSecondaryText: { fontSize: 14, fontWeight: '600', color: COLORS.wal },

  doneWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  doneCircle: {
    width: 100, height: 100, borderRadius: 20,
    backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center',
    marginBottom: 24, elevation: 8,
    shadowColor: COLORS.wal, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12,
  },
  doneTitle: { fontSize: 26, fontWeight: '800', color: COLORS.esp, marginBottom: 12, textAlign: 'center' },
  doneSub:   { fontSize: 15, color: COLORS.wal, textAlign: 'center', lineHeight: 22 },
});

const hrs = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.cream, borderRadius: 2, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: COLORS.bg3,
  },
  dayBtn: {
    width: 38, height: 38, borderRadius: 2,
    backgroundColor: COLORS.bg3, alignItems: 'center', justifyContent: 'center',
  },
  dayBtnOn: { backgroundColor: COLORS.esp },
  dayText:  { fontSize: 12, fontWeight: '700', color: COLORS.wal },
  dayTextOn: { color: '#fff' },
  timeRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeInput: {
    flex: 1, borderWidth: 1, borderColor: COLORS.bg3,
    borderRadius: 2, paddingHorizontal: 10, paddingVertical: 7,
    fontSize: 14, color: COLORS.esp, textAlign: 'center',
    backgroundColor: COLORS.bg2,
  },
  dash:   { fontSize: 14, color: COLORS.wal, fontWeight: '600' },
  closed: { flex: 1, fontSize: 13, color: '#aaa', fontStyle: 'italic' },
});
