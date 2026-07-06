import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { SkeletonList } from '../../components/Skeleton';
import { exportPatientHistory, exportInvoice } from '../../utils/exportPDF';
import type { Appointment } from '../../hooks/useAppointments';
import { ScreenWrapper } from '../../components/ScreenWrapper';
import { useAppTheme } from '../../context/ThemeContext';

// ─── Typy ─────────────────────────────────────────────────────────────────────
type ToothStatus =
  | 'healthy' | 'cavity' | 'early_cavity' | 'watch'
  | 'filled' | 'large_filling' | 'replace_filling'
  | 'crown' | 'bridge' | 'implant' | 'veneer' | 'sealant'
  | 'root_canal' | 'extracted' | 'missing'
  | 'fracture' | 'erosion' | 'abrasion'
  | 'hypoplasia' | 'hypomineralization'
  | 'periodontal' | 'mobility'
  | 'improve_hygiene' | 'treatment_needed';

type ToothRecord = { tooth_number: number; status: ToothStatus; notes: string | null };
type ApptRow = {
  id: string; appointment_date: string; status: string;
  payment_status: string;
  doctor_notes: string | null; notes: string | null;
  family_member_name: string | null;
  patient_rating: number | null; patient_review: string | null;
  is_urgent: boolean;
  arrived_at: string | null;
  service: { name: string; emoji: string | null; duration_minutes: number; price_min: number | null; price_max: number | null } | null;
  patient: { full_name: string | null; phone_number: string | null } | null;
  doctor: { full_name: string | null } | null;
  doctor_id: string; patient_id: string; service_id: string | null;
  custom_duration_minutes: number | null;
};

// ─── Scoring — rovnaká logika ako patient/score.tsx ───────────────────────────
function getWeight(n: number) {
  const p = n % 10;
  if (p === 6 || p === 7) return 3;
  if (p === 4 || p === 5) return 2;
  if (p === 3) return 1.5;
  if (p === 8) return 0.5;
  return 1;
}
function isFront(n: number) { const p = n % 10; return p >= 1 && p <= 3; }

const HEALTH_DED: Partial<Record<ToothStatus, number>> = {
  cavity: 15, early_cavity: 8, root_canal: 10, extracted: 14,
  missing: 10, fracture: 12, periodontal: 10, mobility: 8
};
const AESTH_DED: Partial<Record<ToothStatus, number>> = {
  cavity: 18, early_cavity: 10, extracted: 22, missing: 20,
  root_canal: 12, erosion: 8, abrasion: 6, hypoplasia: 7, hypomineralization: 7, fracture: 14
};
const HYG_DED: Partial<Record<ToothStatus, number>> = {
  watch: 5, improve_hygiene: 12, large_filling: 4, early_cavity: 8, treatment_needed: 10
};
const HYG_BONUS: Partial<Record<ToothStatus, number>> = { sealant: 4, filled: 1 };

function calcHealth(t: ToothRecord[]): number {
  if (!t.length) return 70;
  let d = 0, h = 0;
  t.forEach(r => { d += (HEALTH_DED[r.status] ?? 0) * getWeight(r.tooth_number); if (r.status === 'healthy') h++; });
  return Math.max(0, Math.min(100, Math.round(100 - d + Math.min(15, h * 0.8))));
}
function calcAesthetics(t: ToothRecord[]): number {
  const f = t.filter(r => isFront(r.tooth_number));
  if (!f.length) return 75;
  let s = 100, h = 0;
  f.forEach(r => { s -= AESTH_DED[r.status] ?? 0; if (r.status === 'healthy') h++; });
  return Math.max(0, Math.min(100, Math.round(s + Math.min(8, h * 1.5))));
}
function calcHygiene(t: ToothRecord[], hasPassport: boolean, completed: number): number {
  if (!t.length) return hasPassport ? 60 : 50;
  let s = 100;
  t.forEach(r => { s -= HYG_DED[r.status] ?? 0; s += HYG_BONUS[r.status] ?? 0; });
  if (hasPassport) s += 5;
  s += Math.min(10, completed * 3);
  return Math.max(0, Math.min(100, Math.round(s)));
}
function calcPrevention(hasPassport: boolean, hasAppt: boolean, completed: number, hasChart: boolean): number {
  let s = 0;
  if (hasChart) s += 25; if (hasPassport) s += 25; if (hasAppt) s += 20;
  s += Math.min(30, completed * 8);
  return Math.min(100, s);
}
function calcOverall(h: number, a: number, hy: number, p: number) {
  return Math.round(h * 0.40 + a * 0.20 + hy * 0.25 + p * 0.15);
}

// ─── Vernostné úrovne ─────────────────────────────────────────────────────────
const LEVELS = [
  { name: 'Bronz',    min: 0,    max: 299,   color: '#CD7F32', icon: '🥉' },
  { name: 'Striebro', min: 300,  max: 599,   color: '#A0A0A0', icon: '🥈' },
  { name: 'Zlato',    min: 600,  max: 999,   color: '#D4A017', icon: '🥇' },
  { name: 'Platina',  min: 1000, max: 99999, color: '#6C3483', icon: '💎' },
];

// ─── Konfigurácia statusov ─────────────────────────────────────────────────────
const STATUS_CFG: Partial<Record<ToothStatus, { label: string; color: string; bg: string; emoji: string }>> = {
  healthy:           { label: 'Zdravý',        color: '#1E8449', bg: '#EAFAF1', emoji: '✅' },
  cavity:            { label: 'Kaz',           color: '#922B21', bg: '#FDEDEC', emoji: '🔴' },
  early_cavity:      { label: 'Začín. kaz',    color: '#CB4335', bg: '#FDEDEC', emoji: '🟠' },
  watch:             { label: 'Pozorovanie',   color: '#E67E22', bg: '#FEF9E7', emoji: '👁' },
  filled:            { label: 'Plomba',        color: '#9A7D0A', bg: '#FEF9E7', emoji: '🟡' },
  large_filling:     { label: 'Veľká plomba',  color: '#7D6608', bg: '#FEF9E7', emoji: '🟤' },
  replace_filling:   { label: 'Vymeniť pl.',   color: '#B7770D', bg: '#FEF9E7', emoji: '🔄' },
  crown:             { label: 'Korunka',       color: '#1A5276', bg: '#EBF5FB', emoji: '👑' },
  bridge:            { label: 'Mostík',        color: '#154360', bg: '#EBF5FB', emoji: '🌉' },
  implant:           { label: 'Implantát',     color: '#117A65', bg: '#E8F8F5', emoji: '🔩' },
  veneer:            { label: 'Fazetka',       color: '#2E86C1', bg: '#EBF5FB', emoji: '💎' },
  sealant:           { label: 'Tesnenie',      color: '#148F77', bg: '#E8F8F5', emoji: '🛡️' },
  root_canal:        { label: 'Devitalizácia', color: '#7D3C98', bg: '#F5EEF8', emoji: '🟣' },
  extracted:         { label: 'Extrahovaný',   color: '#566573', bg: '#F2F3F4', emoji: '⚫' },
  missing:           { label: 'Chýba',         color: '#AAB7B8', bg: '#FDFEFE', emoji: '⬜' },
  fracture:          { label: 'Fraktúra',      color: '#E74C3C', bg: '#FDEDEC', emoji: '💥' },
  erosion:           { label: 'Erózia',        color: '#A04000', bg: '#FEF9E7', emoji: '🌊' },
  abrasion:          { label: 'Abrázia',       color: '#784212', bg: '#FEF9E7', emoji: '⚠️' },
  hypoplasia:        { label: 'Hypoplázia',    color: '#5D6D7E', bg: '#F2F3F4', emoji: '🔵' },
  hypomineralization:{ label: 'Hypominer.',    color: '#2E4057', bg: '#EBF5FB', emoji: '🔷' },
  periodontal:       { label: 'Parodont.',     color: '#C0392B', bg: '#FDEDEC', emoji: '🦷' },
  mobility:          { label: 'Pohyblivosť',   color: '#922B21', bg: '#FDEDEC', emoji: '↔️' },
  improve_hygiene:   { label: 'Zlepš hygienu', color: '#2980B9', bg: '#EBF5FB', emoji: '🪥' },
  treatment_needed:  { label: 'Na prerobenie', color: '#F39C12', bg: '#FEF9E7', emoji: '🔧' }
};

const APPT_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  scheduled:  { label: 'Naplánovaný', color: '#1A5276', bg: '#EBF5FB' },
  completed:  { label: 'Dokončený',   color: '#1E8449', bg: '#EAFAF1' },
  cancelled:  { label: 'Zrušený',     color: '#922B21', bg: '#FDEDEC' },
  pending:    { label: 'Čaká',        color: '#E67E22', bg: '#FEF9E7' }
};

const PAYMENT_CFG: Record<string, { label: string; color: string; bg: string; icon: string; next: string }> = {
  unpaid:  { label: 'Nezaplatené', color: '#922B21', bg: '#FDEDEC', icon: '💸', next: 'paid'    },
  paid:    { label: 'Zaplatené',   color: '#1E8449', bg: '#EAFAF1', icon: '✅', next: 'partial' },
  partial: { label: 'Čiastočne',  color: '#7D6608', bg: '#FEF9E7', icon: '⚠️', next: 'unpaid'  }
};

const RATING_LABELS = ['', 'Veľmi zlý', 'Zlý', 'Dobrý', 'Veľmi dobrý', 'Výborný!'];

// ─── Dim bar (bez animácie — statická) ────────────────────────────────────────
function DimBar({ label, score, color, emoji }: { label: string; score: number; color: string; emoji: string }) {
  const { colors } = useAppTheme();
  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D';
  const gc    = score >= 85 ? '#1E8449' : score >= 70 ? '#9A7D0A' : score >= 50 ? '#E67E22' : '#922B21';
  return (
    <View style={styles.dimRow}>
      <Text style={styles.dimEmoji}>{emoji}</Text>
      <Text style={[styles.dimLabel, { color: colors.textPrimary }]}>{label}</Text>
      <View style={[styles.dimTrack, { backgroundColor: colors.bg3 }]}>
        <View style={[styles.dimFill, { width: `${score}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.dimScore, { color: gc }]}>{score}</Text>
      <View style={[styles.gradeBox, { backgroundColor: gc }]}>
        <Text style={styles.gradeText}>{grade}</Text>
      </View>
    </View>
  );
}

// ─── Kruhové skóre ────────────────────────────────────────────────────────────
function ScoreGauge({ score, size = 110 }: { score: number; size?: number }) {
  const { colors, dark } = useAppTheme();
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, score));
  const offset = c - (pct / 100) * c;
  const col = score >= 80 ? '#1E8449' : score >= 65 ? '#27AE60' : score >= 45 ? '#E67E22' : '#922B21';
  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D';

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* SVG-like ring using border trick */}
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        borderWidth: 6, borderColor: dark ? colors.bg3 : '#E8E0D5',
        alignItems: 'center', justifyContent: 'center', position: 'absolute'
      }} />
      {/* Colored arc overlay — using 4 quadrant trick */}
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        borderWidth: 6,
        borderColor: 'transparent',
        borderTopColor: pct >= 25 ? col : 'transparent',
        borderRightColor: pct >= 50 ? col : 'transparent',
        borderBottomColor: pct >= 75 ? col : 'transparent',
        borderLeftColor: pct >= 95 ? col : 'transparent',
        position: 'absolute',
        transform: [{ rotate: '-45deg' }],
        opacity: 0.35
      }} />
      {/* Full colored ring with dasharray effect */}
      <View style={{
        width: size - 4, height: size - 4, borderRadius: (size - 4) / 2,
        borderWidth: 5,
        borderColor: col,
        position: 'absolute',
        opacity: 0.2
      }} />
      {/* Score text */}
      <View style={{ alignItems: 'center' }}>
        <Text style={{ fontSize: size * 0.32, fontWeight: '800', color: col, lineHeight: size * 0.36 }}>{score}</Text>
        <View style={{ backgroundColor: col, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1, marginTop: 2 }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>{grade}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Hlavná obrazovka ─────────────────────────────────────────────────────────
export default function PatientDetailScreen() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  const { patientId, patientName } = useLocalSearchParams<{ patientId: string; patientName: string }>();

  const [teeth,        setTeeth]        = useState<ToothRecord[]>([]);
  const [appointments, setAppointments] = useState<ApptRow[]>([]);
  const [hasPassport,  setHasPassport]  = useState(false);
  const [phone,        setPhone]        = useState<string | null>(null);
  const [avatarUrl,    setAvatarUrl]    = useState<string | null>(null);
  // Kritické údaje z anamnézy
  const [crit,         setCrit]         = useState<{
    allergies: string | null;
    isPregnant: boolean;
    medicalHistory: string[] | null;
    bloodType: string | null;
  } | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [doctorNotes,  setDoctorNotes]  = useState('');
  const [notesSaving,  setNotesSaving]  = useState(false);
  const [notesId,      setNotesId]      = useState<string | null>(null);
  const [doctorId,     setDoctorId]     = useState<string | null>(null);
  const [doctorName,   setDoctorName]   = useState('MDDr. Loderer');
  // Per-appointment notes editing
  const [editingApptId,  setEditingApptId]  = useState<string | null>(null);
  const [editNoteText,   setEditNoteText]   = useState('');
  const [savingApptNote, setSavingApptNote] = useState(false);
  // Vek, poisťovňa, trvalá poznámka
  const [dateOfBirth,       setDateOfBirth]       = useState<string | null>(null);
  const [insuranceCompany,  setInsuranceCompany]  = useState('');
  const [insuranceNumber,   setInsuranceNumber]   = useState('');
  const [patientNote,       setPatientNote]       = useState('');
  const [patientNoteSaving, setPatientNoteSaving] = useState(false);
  const [showInsEdit,       setShowInsEdit]       = useState(false);
  const [insuranceSaving,   setInsuranceSaving]   = useState(false);
  const [diagnoses,         setDiagnoses]         = useState<{ id: string; icd_code: string; description: string; severity: string | null; created_at: string }[]>([]);
  const [showNotifModal,    setShowNotifModal]    = useState(false);
  const [notifTitle,        setNotifTitle]        = useState('');
  const [notifBody,         setNotifBody]         = useState('');
  const [notifSending,      setNotifSending]      = useState(false);

  useEffect(() => {
    if (!patientId) { setLoading(false); return; }
    let cancelled = false;

    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && !cancelled) {
          setDoctorId(user.id);
          const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
          if (prof?.full_name && !cancelled) setDoctorName(prof.full_name);
        }

        const [teethRes, apptRes, ppRes, profileRes, notesRes, diagRes] = await Promise.all([
          supabase.from('dental_charts')
            .select('tooth_number,status,notes')
            .eq('patient_id', patientId),
          supabase.from('appointments')
            .select('id,appointment_date,status,payment_status,doctor_notes,notes,family_member_name,patient_rating,patient_review,is_urgent,arrived_at,custom_duration_minutes,patient_id,doctor_id,service_id,doctor:profiles!appointments_doctor_id_fkey(full_name),patient:profiles!appointments_patient_id_fkey(full_name,phone_number),service:services(name,emoji,duration_minutes,price_min,price_max)')
            .eq('patient_id', patientId)
            .order('appointment_date', { ascending: false })
            .limit(50),
          supabase.from('health_passports')
            .select('patient_id, allergies, is_pregnant, medical_history, blood_type')
            .eq('patient_id', patientId).maybeSingle(),
          supabase.from('profiles')
            .select('phone_number, avatar_url, date_of_birth, insurance_company, insurance_number, patient_note').eq('id', patientId).maybeSingle(),
          supabase.from('patient_notes')
            .select('id, content')
            .eq('patient_id', patientId)
            .maybeSingle(),
          supabase.from('diagnoses')
            .select('id, icd_code, description, severity, created_at')
            .eq('patient_id', patientId)
            .order('created_at', { ascending: false })
            .limit(20),
        ]);

        if (!cancelled) {
          setTeeth((teethRes.data ?? []) as ToothRecord[]);
          setAppointments((apptRes.data ?? []) as unknown as ApptRow[]);
          setHasPassport(!!ppRes.data);
          if (ppRes.data) {
            setCrit({
              allergies:      ppRes.data.allergies ?? null,
              isPregnant:     !!ppRes.data.is_pregnant,
              medicalHistory: ppRes.data.medical_history ?? null,
              bloodType:      ppRes.data.blood_type ?? null
            });
          }
          setPhone(profileRes.data?.phone_number ?? null);
          setAvatarUrl(profileRes.data?.avatar_url ?? null);
          setDateOfBirth(profileRes.data?.date_of_birth ?? null);
          setInsuranceCompany(profileRes.data?.insurance_company ?? '');
          setInsuranceNumber(profileRes.data?.insurance_number ?? '');
          setPatientNote(profileRes.data?.patient_note ?? '');
          if (notesRes.data) {
            setDoctorNotes(notesRes.data.content ?? '');
            setNotesId(notesRes.data.id);
          }
          setDiagnoses((diagRes.data ?? []) as typeof diagnoses);
          setLoading(false);
        }
      } catch (e) {
        console.error('[PatientDetail] load failed:', e);
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [patientId]);

  // ── Výpočty ─────────────────────────────────────────────────────────────────
  const { overall, dims, statusCounts, loyaltyPts, loyaltyLevel, avgRating } = useMemo(() => {
    const completed = appointments.filter(a => a.status === 'completed').length;
    const hasAppt   = appointments.some(a => a.status === 'scheduled' && new Date(a.appointment_date) >= new Date());
    const hasChart  = teeth.length > 0;

    const h  = calcHealth(teeth);
    const a  = calcAesthetics(teeth);
    const hy = calcHygiene(teeth, hasPassport, completed);
    const p  = calcPrevention(hasPassport, hasAppt, completed, hasChart);
    const ov = calcOverall(h, a, hy, p);

    const sc: Partial<Record<ToothStatus, number>> = {};
    teeth.forEach(t => { sc[t.status] = (sc[t.status] ?? 0) + 1; });

    const pts = completed * 100;
    const lvl = LEVELS.slice().reverse().find(l => pts >= l.min) ?? LEVELS[0];

    const ratings = appointments.filter(a => a.status === 'completed' && a.patient_rating != null);
    const avg = ratings.length
      ? Math.round((ratings.reduce((s, a) => s + (a.patient_rating ?? 0), 0) / ratings.length) * 10) / 10
      : null;

    return {
      overall: ov,
      dims: { health: h, aesthetics: a, hygiene: hy, prevention: p },
      statusCounts: sc,
      loyaltyPts: pts,
      loyaltyLevel: lvl,
      avgRating: avg
    };
  }, [teeth, appointments, hasPassport]);

  async function handleSaveNotes() {
    if (!patientId || !doctorId) return;
    setNotesSaving(true);
    const payload = { doctor_id: doctorId, patient_id: patientId, content: doctorNotes.trim() || null };
    let error;
    if (notesId) {
      ({ error } = await supabase.from('patient_notes').update({ content: payload.content }).eq('id', notesId));
    } else {
      const res = await supabase.from('patient_notes').insert(payload).select('id').single();
      error = res.error;
      if (!error && res.data) setNotesId(res.data.id);
    }
    setNotesSaving(false);
    if (error) Alert.alert('Chyba', error.message);
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function handleSaveApptNote(apptId: string) {
    setSavingApptNote(true);
    const { error } = await supabase
      .from('appointments')
      .update({ doctor_notes: editNoteText.trim() || null })
      .eq('id', apptId);
    setSavingApptNote(false);
    if (error) { Alert.alert('Chyba', error.message); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setAppointments((prev) =>
      prev.map((a) => a.id === apptId ? { ...a, doctor_notes: editNoteText.trim() || null } : a)
    );
    setEditingApptId(null);
  }

  async function handleTogglePayment(apptId: string, current: string) {
    const next = PAYMENT_CFG[current]?.next ?? 'paid';
    const { error } = await supabase
      .from('appointments')
      .update({ payment_status: next })
      .eq('id', apptId);
    if (error) { Alert.alert('Chyba', error.message); return; }
    setAppointments((prev) =>
      prev.map((a) => a.id === apptId ? { ...a, payment_status: next } : a)
    );
  }

  // Celková suma nezaplatených dokončených termínov
  const unpaidTotal = useMemo(() => {
    return appointments
      .filter(a => a.status === 'completed' && a.payment_status !== 'paid')
      .reduce((sum, a) => sum + (a.service?.price_min ?? 0), 0);
  }, [appointments]);

  const unpaidCount = useMemo(() =>
    appointments.filter(a => a.status === 'completed' && a.payment_status !== 'paid').length,
  [appointments]);

  const patientAge = useMemo(() => {
    if (!dateOfBirth) return null;
    const birth = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    if (today.getMonth() < birth.getMonth() ||
       (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
    return age;
  }, [dateOfBirth]);

  async function handleSavePatientNote() {
    if (!patientId) return;
    setPatientNoteSaving(true);
    await supabase.from('profiles').update({ patient_note: patientNote.trim() || null }).eq('id', patientId);
    setPatientNoteSaving(false);
  }

  async function handleSaveInsurance() {
    if (!patientId) return;
    setInsuranceSaving(true);
    await supabase.from('profiles').update({
      insurance_company: insuranceCompany.trim() || null,
      insurance_number:  insuranceNumber.trim()  || null
    }).eq('id', patientId);
    setInsuranceSaving(false);
    setShowInsEdit(false);
  }

  async function handleSendNotification() {
    if (!notifTitle.trim() || !patientId) return;
    setNotifSending(true);
    const { error } = await supabase.from('notifications').insert({
      user_id: patientId,
      title:   notifTitle.trim(),
      body:    notifBody.trim() || null,
      type:    'info'
    });
    setNotifSending(false);
    if (error) { Alert.alert('Chyba', error.message); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowNotifModal(false);
    setNotifTitle('');
    setNotifBody('');
    Alert.alert('Odoslané ✓', 'Notifikácia bola doručená pacientovi.');
  }

  async function handleChangeApptStatus(apptId: string, newStatus: 'completed' | 'cancelled') {
    const label = newStatus === 'completed' ? 'Dokončiť' : 'Zrušiť';
    const msg   = newStatus === 'completed'
      ? 'Označiť termín ako dokončený?'
      : 'Zrušiť termín? Túto akciu nie je možné vrátiť.';
    Alert.alert(label, msg, [
      { text: 'Nie', style: 'cancel' },
      { text: 'Áno', onPress: async () => {
          const { error } = await supabase
            .from('appointments')
            .update({ status: newStatus })
            .eq('id', apptId);
          if (error) { Alert.alert('Chyba', error.message); return; }
          setAppointments((prev) =>
            prev.map((a) => a.id === apptId ? { ...a, status: newStatus } : a)
          );
          // Notify patient
          const appt = appointments.find(a => a.id === apptId);
          if (appt) {
            const dateStr = new Date(appt.appointment_date).toLocaleDateString('sk-SK', { day: 'numeric', month: 'long' });
            await supabase.from('notifications').insert({
              user_id: appt.patient_id,
              title:   newStatus === 'completed' ? '✅ Termín dokončený' : '❌ Termín zrušený',
              body:    newStatus === 'completed'
                ? `Váš termín${appt.service ? ` — ${appt.service.name}` : ''} (${dateStr}) bol dokončený. Ohodnoťte návštevu!`
                : `Váš termín${appt.service ? ` — ${appt.service.name}` : ''} (${dateStr}) bol zrušený.`,
              type:    newStatus === 'completed' ? 'success' : 'warning'
            });
          }
        }
      },
    ]);
  }

  const [activeTab, setActiveTab] = useState<'overview' | 'appointments' | 'plan' | 'payments' | 'messages' | 'records'>('overview');

  const scoreCol = overall >= 80 ? '#1E8449' : overall >= 65 ? '#27AE60' : overall >= 45 ? '#E67E22' : '#922B21';
  const initials = (patientName ?? '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  // Quick stats
  const { nextApptDate, lastVisitDate, completedCount } = useMemo(() => {
    const now = new Date();
    const upcoming = appointments
      .filter(a => a.status === 'scheduled' && new Date(a.appointment_date) >= now)
      .sort((a, b) => new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime());
    const completed = appointments.filter(a => a.status === 'completed');
    const sorted = completed.sort((a, b) => new Date(b.appointment_date).getTime() - new Date(a.appointment_date).getTime());
    return {
      nextApptDate: upcoming[0]?.appointment_date ?? null,
      lastVisitDate: sorted[0]?.appointment_date ?? null,
      completedCount: completed.length
    };
  }, [appointments]);

  // Recall reminder
  const recallNeeded = useMemo(() => {
    const completed = appointments.filter(a => a.status === 'completed');
    if (completed.length === 0) return false;
    const lastDate = new Date(Math.max(...completed.map(a => new Date(a.appointment_date).getTime())));
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    return lastDate < sixMonthsAgo;
  }, [appointments]);

  // Problematické zuby (všetky statusy, ktoré si vyžadujú pozornosť)
  const problemCount = (statusCounts['cavity'] ?? 0)
    + (statusCounts['early_cavity'] ?? 0)
    + (statusCounts['root_canal'] ?? 0)
    + (statusCounts['fracture'] ?? 0)
    + (statusCounts['periodontal'] ?? 0)
    + (statusCounts['mobility'] ?? 0)
    + (statusCounts['treatment_needed'] ?? 0);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg2, padding: SPACING.xl }}>
        <SkeletonList count={6} />
      </View>
    );
  }

  return (
    <ScreenWrapper>
    <View style={styles.safe}>
      <HeroHeader
        title={patientName ?? 'Pacient'}
        subtitle="Profil pacienta"
        icon="person-outline"
        onBack={() => router.back()}
        rightAction={
          <View style={[styles.scoreChip, { borderColor: scoreCol }]}>
            <Text style={[styles.scoreChipNum, { color: scoreCol }]}>{overall}</Text>
            <Text style={[styles.scoreChipLabel, { color: scoreCol }]}>skóre</Text>
          </View>
        }
      />

      {/* ── Tab bar ── */}
      {(() => {
        const TABS: { id: typeof activeTab; label: string; badge?: number }[] = [
          { id: 'overview',     label: 'Prehľad' },
          { id: 'appointments', label: 'Termíny', badge: appointments.filter(a => a.status === 'scheduled').length || undefined },
          { id: 'plan',         label: 'Liečba' },
          { id: 'payments',     label: 'Platby',  badge: unpaidCount || undefined },
          { id: 'messages',     label: 'Správy' },
          { id: 'records',      label: 'Záznamy' },
        ];
        return (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={tabStyles.bar}
            contentContainerStyle={tabStyles.barContent}>
            {TABS.map(tab => {
              const active = activeTab === tab.id;
              return (
                <TouchableOpacity key={tab.id}
                  style={[tabStyles.tab, active && tabStyles.tabActive]}
                  onPress={() => setActiveTab(tab.id)}
                  activeOpacity={0.7}>
                  <View style={tabStyles.tabInner}>
                    <Text style={[tabStyles.tabText, active && tabStyles.tabTextActive]}>
                      {tab.label}
                    </Text>
                    {tab.badge ? (
                      <View style={tabStyles.tabBadge}>
                        <Text style={tabStyles.tabBadgeText}>{tab.badge}</Text>
                      </View>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        );
      })()}

      <ScrollView style={[styles.scroll, { backgroundColor: colors.bg2 }]} showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}>

        {/* ══ TAB: PREHĽAD ══ */}
        {activeTab === 'overview' && <>

        {/* ── Info karta ── */}
        <View style={[styles.infoCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
          <View style={styles.avatarWrap}>
            {avatarUrl
              ? <Image source={{ uri: avatarUrl }} style={styles.avatar} resizeMode="cover" />
              : <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
            }
            <View style={[styles.loyaltyBadge, { backgroundColor: loyaltyLevel.color + '22', borderColor: loyaltyLevel.color }]}>
              <Text style={styles.loyaltyIcon}>{loyaltyLevel.icon}</Text>
              <Text style={[styles.loyaltyName, { color: loyaltyLevel.color }]}>{loyaltyLevel.name}</Text>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.patientName, { color: colors.textPrimary }]}>{patientName ?? 'Pacient'}</Text>
            {phone && (
              <View style={styles.phoneRow}>
                <Ionicons name="call-outline" size={12} color={COLORS.wal} />
                <Text style={[styles.phoneText, { color: colors.textSecondary }]}>{phone}</Text>
              </View>
            )}
            {patientAge !== null && (
              <View style={styles.phoneRow}>
                <Ionicons name="person-outline" size={12} color={COLORS.wal} />
                <Text style={[styles.phoneText, { color: colors.textSecondary }]}>{patientAge} rokov</Text>
              </View>
            )}
            {(insuranceCompany || insuranceNumber) && (
              <View style={styles.phoneRow}>
                <Ionicons name="card-outline" size={12} color={COLORS.wal} />
                <Text style={[styles.phoneText, { color: colors.textSecondary }]} numberOfLines={1}>
                  {[insuranceCompany, insuranceNumber].filter(Boolean).join(' · ')}
                </Text>
              </View>
            )}
            <View style={styles.infoChips}>
              <View style={[styles.chip, hasPassport ? styles.chipGreen : styles.chipOrange,
                hasPassport ? (dark && { backgroundColor: '#0D3B1F', borderColor: '#A9DFBF55' }) : (dark && { backgroundColor: '#2D2200', borderColor: '#F9E79F44' })]}>
                <Text style={[styles.chipText, { color: colors.textPrimary }]}>{hasPassport ? '✓ Anamnéza' : '⚠ Bez anamnézy'}</Text>
              </View>
              <View style={[styles.chip, teeth.length > 0 ? styles.chipGreen : styles.chipGray,
                teeth.length > 0 && dark && { backgroundColor: '#0D3B1F', borderColor: '#A9DFBF55' }]}>
                <Text style={[styles.chipText, { color: colors.textPrimary }]}>{teeth.length > 0 ? `🦷 ${teeth.length} zubov` : 'Karta prázdna'}</Text>
              </View>
            </View>
            <View style={styles.statsRow}>
              <Text style={[styles.loyaltyPts, { color: colors.textSecondary }]}>{loyaltyPts} bodov · {appointments.filter(a => a.status === 'completed').length} návštev</Text>
              {avgRating !== null && (
                <View style={[styles.ratingPill, dark && { backgroundColor: '#2D2200', borderColor: '#B7950B55' }]}>
                  <Ionicons name="star" size={10} color="#F39C12" />
                  <Text style={styles.ratingPillText}>{avgRating.toFixed(1)}</Text>
                </View>
              )}
            </View>
            {unpaidCount > 0 && (
              <View style={styles.unpaidBanner}>
                <Ionicons name="card-outline" size={13} color="#922B21" />
                <Text style={styles.unpaidBannerText}>
                  {unpaidCount}× nezaplatené{unpaidTotal > 0 ? ` · ${unpaidTotal} €` : ''}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Rýchle akcie ── */}
        <View style={{ gap: 8, marginBottom: 14 }}>
          {/* Primárne akcie */}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={[styles.actionBtn, { flex: 1, backgroundColor: colors.cardBg, borderColor: colors.bg3 }]} activeOpacity={0.8}
              onPress={() => router.push({ pathname: '/(doctor)/dental-chart', params: { patientId, patientName } })}>
              <Ionicons name="clipboard-outline" size={22} color={COLORS.wal} />
              <Text style={styles.actionBtnText}>Zubná karta</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { flex: 1, backgroundColor: colors.cardBg, borderColor: colors.bg3 }]} activeOpacity={0.8}
              onPress={() => router.push({ pathname: '/(doctor)/patient-passport', params: { patientId, patientName } })}>
              <Ionicons name="document-text-outline" size={22} color="#1A5276" />
              <Text style={[styles.actionBtnText, { color: '#1A5276' }]}>Anamnéza</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary, { flex: 1 }]} activeOpacity={0.8}
              onPress={() => router.push({ pathname: '/(doctor)/add-appointment', params: { patientId, patientName } })}>
              <Ionicons name="calendar-outline" size={22} color="#fff" />
              <Text style={[styles.actionBtnText, { color: '#fff' }]}>Rezervovať</Text>
            </TouchableOpacity>
          </View>
          {/* Sekundárne akcie */}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={[styles.actionBtnSm, { flex: 1, backgroundColor: colors.cardBg, borderColor: colors.bg3 }]} activeOpacity={0.8}
              onPress={() => router.push({ pathname: '/(doctor)/prescriptions', params: { patientId, patientName } })}>
              <Ionicons name="medical-outline" size={18} color="#1E8449" />
              <Text style={[styles.actionBtnSmText, { color: '#1E8449' }]}>Recepty</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtnSm, { flex: 1, backgroundColor: colors.cardBg, borderColor: colors.bg3 }]} activeOpacity={0.8}
              onPress={() => exportPatientHistory(patientName ?? 'Pacient', appointments as unknown as Appointment[])}>
              <Ionicons name="download-outline" size={18} color="#7D3C98" />
              <Text style={[styles.actionBtnSmText, { color: '#7D3C98' }]}>PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtnSm, { flex: 1, backgroundColor: colors.cardBg, borderColor: colors.bg3 }]} activeOpacity={0.8}
              onPress={() => router.push({ pathname: '/(doctor)/messages', params: { patientId, patientName } })}>
              <Ionicons name="chatbubble-outline" size={18} color="#1A5276" />
              <Text style={[styles.actionBtnSmText, { color: '#1A5276' }]}>Správa</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtnSm, { flex: 1, backgroundColor: colors.cardBg, borderColor: colors.bg3 }]} activeOpacity={0.8}
              onPress={() => router.push({ pathname: '/(doctor)/patient-attachments', params: { patientId, patientName } })}>
              <Ionicons name="attach-outline" size={18} color="#784212" />
              <Text style={[styles.actionBtnSmText, { color: '#784212' }]}>Prílohy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtnSm, { flex: 1, backgroundColor: colors.cardBg, borderColor: colors.bg3 }]} activeOpacity={0.8}
              onPress={() => { setNotifTitle(''); setNotifBody(''); setShowNotifModal(true); }}>
              <Ionicons name="notifications-outline" size={18} color="#0E6655" />
              <Text style={[styles.actionBtnSmText, { color: '#0E6655' }]}>Notif.</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Plán liečby + Súhlasy ── */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          <TouchableOpacity
            style={[styles.planBtn, { flex: 1, marginBottom: 0 }, dark && { backgroundColor: '#0D3B1F', borderColor: '#A9DFBF44' }]}
            activeOpacity={0.8}
            onPress={() => router.push({ pathname: '/(doctor)/treatment-plan', params: { patientId, patientName } })}
          >
            <Ionicons name="list-outline" size={17} color={dark ? '#27AE60' : '#1E8449'} />
            <Text style={[styles.planBtnText, dark && { color: '#27AE60' }]}>Plán liečby</Text>
            <Ionicons name="chevron-forward-outline" size={14} color={dark ? '#27AE60' : '#1E8449'} style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.planBtn, { flex: 1, marginBottom: 0 }, dark ? { backgroundColor: '#1E0D33', borderColor: '#D7BDE244' } : { backgroundColor: '#F5EEF8', borderColor: '#D7BDE2' }]}
            activeOpacity={0.8}
            onPress={() => router.push('/(doctor)/consent-forms')}
          >
            <Ionicons name="document-text-outline" size={17} color="#7D3C98" />
            <Text style={[styles.planBtnText, { color: '#7D3C98' }]}>Súhlasy</Text>
            <Ionicons name="chevron-forward-outline" size={14} color="#7D3C98" style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
        </View>

        {/* ── KRITICKÉ UPOZORNENIA ── */}
        {crit && (crit.allergies || crit.isPregnant || (crit.medicalHistory && crit.medicalHistory.length > 0) || crit.bloodType) && (
          <View style={[styles.critBox, dark && { backgroundColor: '#4A1010', borderColor: '#C0392B55' }]}>
            <View style={styles.critHeader}>
              <Ionicons name="warning" size={15} color="#C0392B" />
              <Text style={styles.critTitle}>KRITICKÉ ÚDAJE</Text>
              {crit.bloodType && (
                <View style={[styles.critBlood, dark && { backgroundColor: '#3B0D0D' }]}>
                  <Text style={styles.critBloodText}>🩸 {crit.bloodType}</Text>
                </View>
              )}
            </View>
            {crit.allergies && (
              <Text style={styles.critLine}>🚨 <Text style={styles.critStrong}>Alergie:</Text> {crit.allergies}</Text>
            )}
            {crit.isPregnant && (
              <Text style={styles.critLine}>🤰 <Text style={styles.critStrong}>Tehotná / dojčí</Text></Text>
            )}
            {crit.medicalHistory && crit.medicalHistory.length > 0 && (
              <Text style={styles.critLine}>🏥 <Text style={styles.critStrong}>Ochorenia:</Text> {crit.medicalHistory.join(', ')}</Text>
            )}
          </View>
        )}

        {/* ── Recall reminder ── */}
        {recallNeeded && (
          <TouchableOpacity
            style={styles.recallBanner}
            onPress={() => router.push({ pathname: '/(doctor)/add-appointment', params: { patientId, patientName } })}
            activeOpacity={0.88}
          >
            <Text style={{ fontSize: 20 }}>🔔</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.recallTitle}>Pacient potrebuje recall!</Text>
              <Text style={styles.recallSub}>Posledná dokončená návšteva bola pred viac ako 6 mesiacmi.</Text>
            </View>
            <Ionicons name="calendar-outline" size={16} color="#0E6655" />
          </TouchableOpacity>
        )}

        {/* ── Rýchly prehľad ── */}
        <View style={[styles.quickStats, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
          <View style={styles.qsRow}>
            <View style={[styles.qsBox, { backgroundColor: dark ? '#0D3B1F' : '#EAFAF1' }]}>
              <Text style={[styles.qsVal, { color: dark ? '#27AE60' : '#1E8449' }]}>{completedCount}</Text>
              <Text style={[styles.qsLabel, { color: colors.textSecondary }]}>Návštevy</Text>
            </View>
            <View style={[styles.qsBox, { backgroundColor: dark ? '#4A1010' : '#FDEDEC' }]}>
              <Text style={[styles.qsVal, { color: dark ? '#E74C3C' : '#922B21' }]}>{problemCount}</Text>
              <Text style={[styles.qsLabel, { color: colors.textSecondary }]}>Probl. zuby</Text>
            </View>
            <View style={[styles.qsBox, { backgroundColor: dark ? '#0D2233' : '#EBF5FB' }]}>
              <Text style={[styles.qsVal, { color: dark ? '#5DADE2' : '#1A5276' }]}>
                {lastVisitDate ? new Date(lastVisitDate).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' }) : '—'}
              </Text>
              <Text style={[styles.qsLabel, { color: colors.textSecondary }]}>Posl. návšteva</Text>
            </View>
            <View style={[styles.qsBox, { backgroundColor: dark ? '#1E0D33' : '#F5EEF8' }]}>
              <Text style={[styles.qsVal, { color: '#7D3C98' }]}>
                {nextApptDate ? new Date(nextApptDate).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' }) : '—'}
              </Text>
              <Text style={[styles.qsLabel, { color: colors.textSecondary }]}>Ďalší termín</Text>
            </View>
          </View>
        </View>

        {/* ── Dentálne skóre ── */}
        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
          <Text style={[styles.cardTitle, { color: colors.textSecondary, marginBottom: 0 }]}>DENTÁLNE SKÓRE</Text>
          <View style={styles.scoreGaugeRow}>
            <ScoreGauge score={overall} size={100} />
            <View style={{ flex: 1 }}>
              <DimBar label="Zdravie"    score={dims.health}     color="#1E8449" emoji="❤️" />
              <DimBar label="Hygiena"    score={dims.hygiene}    color="#148F77" emoji="🪥" />
              <DimBar label="Estetika"   score={dims.aesthetics} color="#1A5276" emoji="✨" />
              <DimBar label="Prevencia"  score={dims.prevention} color="#7D6608" emoji="🛡️" />
            </View>
          </View>
          <View style={styles.dimLegend}>
            {[['A', '≥85', '#1E8449'], ['B', '≥70', '#9A7D0A'], ['C', '≥50', '#E67E22'], ['D', '<50', '#922B21']].map(([g, r, c]) => (
              <View key={g} style={styles.dimLegendItem}>
                <View style={[styles.dimLegendDot, { backgroundColor: c as string }]} />
                <Text style={styles.dimLegendText}>{g}: {r}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Rozklad chrupu ── */}
        {teeth.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>STAV CHRUPU ({teeth.length} zubov)</Text>
            <View style={styles.teethGrid}>
              {(Object.entries(statusCounts) as [ToothStatus, number][])
                .sort(([, a], [, b]) => b - a)
                .map(([key, count]) => {
                  const s = STATUS_CFG[key];
                  if (!s || !count) return null;
                  return (
                    <View key={key} style={[styles.teethChip, { backgroundColor: s.bg, borderColor: s.color + '55' }]}>
                      <Text style={styles.teethEmoji}>{s.emoji}</Text>
                      <Text style={[styles.teethCount, { color: s.color }]}>{count}</Text>
                      <Text style={[styles.teethLabel, { color: s.color }]}>{s.label}</Text>
                    </View>
                  );
                })}
            </View>
            {problemCount > 0 && (
              <View style={styles.warningBox}>
                <Ionicons name="warning-outline" size={14} color="#922B21" />
                <Text style={styles.warningText}>
                  Pacient má {problemCount} {problemCount === 1 ? 'zub' : problemCount < 5 ? 'zuby' : 'zubov'} vyžadujúcich ošetrenie.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── Diagnózy ── */}
        {diagnoses.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>DIAGNÓZY ({diagnoses.length})</Text>
            {diagnoses.slice(0, 8).map(dg => {
              const sevColor = dg.severity === 'high' ? '#922B21' : dg.severity === 'medium' ? '#E67E22' : '#1E8449';
              const sevBg = dg.severity === 'high' ? (dark ? '#4A1010' : '#FDEDEC') : dg.severity === 'medium' ? (dark ? '#2D2200' : '#FEF9E7') : (dark ? '#0D3B1F' : '#EAFAF1');
              const sevLabel = dg.severity === 'high' ? 'Vysoká' : dg.severity === 'medium' ? 'Stredná' : 'Nízka';
              return (
                <View key={dg.id} style={[styles.diagRow, { borderBottomColor: colors.bg3 }]}>
                  <View style={[styles.diagIcd, { backgroundColor: dark ? '#0D2233' : '#EBF5FB' }]}>
                    <Text style={[styles.diagIcdText, { color: dark ? '#5DADE2' : '#1A5276' }]}>{dg.icd_code}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.diagDesc, { color: colors.textPrimary }]}>{dg.description}</Text>
                    <Text style={{ fontSize: 10, color: colors.textSecondary }}>
                      {new Date(dg.created_at).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                  {dg.severity && (
                    <View style={[styles.diagSev, { backgroundColor: sevBg, borderColor: sevColor + '55' }]}>
                      <Text style={[styles.diagSevText, { color: sevColor }]}>{sevLabel}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ── Poisťovňa ── */}
        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>POISŤOVŇA</Text>
            <TouchableOpacity onPress={() => setShowInsEdit(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name={showInsEdit ? 'close-circle-outline' : 'create-outline'} size={16} color={COLORS.wal} />
            </TouchableOpacity>
          </View>
          {showInsEdit ? (
            <>
              <TextInput
                style={[styles.notesInput, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
                value={insuranceCompany}
                onChangeText={setInsuranceCompany}
                placeholder="Názov poisťovne (napr. VšZP, Dôvera...)"
                placeholderTextColor={dark ? '#666' : '#999'}
              />
              <TextInput
                style={[styles.notesInput, { marginTop: 8, backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
                value={insuranceNumber}
                onChangeText={setInsuranceNumber}
                placeholder="Číslo poistenca"
                placeholderTextColor={dark ? '#666' : '#999'}
                keyboardType="numeric"
              />
              <TouchableOpacity
                style={[styles.notesSaveBtn, insuranceSaving && { opacity: 0.5 }]}
                onPress={handleSaveInsurance}
                disabled={insuranceSaving}
                activeOpacity={0.85}
              >
                {insuranceSaving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <><Ionicons name="save-outline" size={14} color="#fff" /><Text style={styles.notesSaveBtnText}>Uložiť</Text></>}
              </TouchableOpacity>
            </>
          ) : (insuranceCompany || insuranceNumber) ? (
            <View style={[styles.insRow, { backgroundColor: colors.bg2 }]}>
              <Ionicons name="card-outline" size={14} color={COLORS.wal} />
              <Text style={[styles.insText, { color: colors.textPrimary }]}>
                {insuranceCompany || '—'}
                {insuranceNumber ? `  ·  č. ${insuranceNumber}` : ''}
              </Text>
            </View>
          ) : (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Poisťovňa nezadaná — klepni na ceruzku</Text>
          )}
        </View>

        {/* ── Trvalá poznámka k pacientovi ── */}
        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
          <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>POZNÁMKA K PACIENTOVI</Text>
          <TextInput
            style={[styles.notesInput, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
            value={patientNote}
            onChangeText={setPatientNote}
            placeholder="Trvalé info o pacientovi (viditeľné pre všetkých doktorov)..."
            placeholderTextColor={dark ? '#666' : '#999'}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
          <TouchableOpacity
            style={[styles.notesSaveBtn, (patientNoteSaving || !patientNote.trim()) && { opacity: 0.45 }]}
            onPress={handleSavePatientNote}
            disabled={patientNoteSaving}
            activeOpacity={0.85}
          >
            {patientNoteSaving
              ? <ActivityIndicator color="#fff" size="small" />
              : <><Ionicons name="save-outline" size={14} color="#fff" /><Text style={styles.notesSaveBtnText}>Uložiť poznámku</Text></>}
          </TouchableOpacity>
        </View>

        {/* ── Interné poznámky doktora ── */}
        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>INTERNÉ POZNÁMKY</Text>
            <View style={[styles.notesPrivateBadge, dark && { backgroundColor: '#0D2233', borderColor: '#AED6F133' }]}>
              <Ionicons name="lock-closed" size={9} color="#1A5276" />
              <Text style={styles.notesPrivateText}>Len pre teba</Text>
            </View>
          </View>
          <TextInput
            style={[styles.notesInput, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
            value={doctorNotes}
            onChangeText={setDoctorNotes}
            placeholder="Alergie, poznámky k liečbe, interné upozornenia..."
            placeholderTextColor={dark ? '#666' : '#999'}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          <TouchableOpacity
            style={[styles.notesSaveBtn, (notesSaving || !doctorNotes.trim()) && { opacity: 0.45 }]}
            onPress={handleSaveNotes}
            disabled={notesSaving}
            activeOpacity={0.85}
          >
            {notesSaving
              ? <ActivityIndicator color="#fff" size="small" />
              : <>
                  <Ionicons name="save-outline" size={14} color="#fff" />
                  <Text style={styles.notesSaveBtnText}>Uložiť poznámky</Text>
                </>}
          </TouchableOpacity>
        </View>

        {/* end overview tab */}
        </>}

        {/* ══ TAB: TERMÍNY ══ */}
        {activeTab === 'appointments' && (
        <View>
          {appointments.length === 0 ? (
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Žiadne termíny</Text>
            </View>
          ) : (() => {
            // Group by month
            const groups: { key: string; label: string; items: typeof appointments }[] = [];
            appointments.forEach(a => {
              const d = new Date(a.appointment_date);
              const key = `${d.getFullYear()}-${d.getMonth()}`;
              const label = d.toLocaleDateString('sk-SK', { month: 'long', year: 'numeric' });
              let g = groups.find(g => g.key === key);
              if (!g) { g = { key, label, items: [] }; groups.push(g); }
              g.items.push(a);
            });
            return groups.map(group => (
              <View key={group.key} style={{ marginBottom: 14 }}>
                <Text style={[styles.tlMonthLabel, { color: colors.textSecondary }]}>{group.label.charAt(0).toUpperCase() + group.label.slice(1)}</Text>
                {group.items.map((a, i) => {
              const st = APPT_STATUS[a.status] ?? APPT_STATUS.scheduled;
              const d  = new Date(a.appointment_date);
              const isEditing = editingApptId === a.id;
              const isFuture  = new Date(a.appointment_date) >= new Date();
              const canAct    = (a.status === 'scheduled' || a.status === 'pending') && isFuture;
              const isLast = i === group.items.length - 1;
              const dotCol = a.status === 'completed' ? '#1E8449' : a.status === 'cancelled' ? '#922B21' : '#1A5276';
              return (
                <View key={a.id} style={styles.tlRow}>
                  {/* Timeline line + dot */}
                  <View style={styles.tlLineWrap}>
                    <View style={[styles.tlDot, { backgroundColor: dotCol, borderColor: dotCol + '44' }]} />
                    {!isLast && <View style={[styles.tlLine, { backgroundColor: colors.bg3 }]} />}
                  </View>
                  {/* Card */}
                  <View style={[styles.tlCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                    <View style={styles.apptTop}>
                      <Text style={[styles.apptDay, { color: colors.textPrimary, fontSize: 14, width: 'auto' }]}>{d.getDate()}</Text>
                      <Text style={[styles.apptTime, { color: colors.textPrimary }]}>
                        {d.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      <View style={[styles.apptBadge, { backgroundColor: dark ? (st.color + '22') : st.bg }]}>
                        <Text style={[styles.apptBadgeText, { color: st.color }]}>{st.label}</Text>
                      </View>
                      {/* Edit notes button */}
                      <TouchableOpacity
                        onPress={() => {
                          if (isEditing) { setEditingApptId(null); return; }
                          setEditingApptId(a.id);
                          setEditNoteText(a.doctor_notes ?? '');
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ marginLeft: 'auto' }}
                      >
                        <Ionicons name={isEditing ? 'close-circle-outline' : 'create-outline'} size={15} color={isEditing ? '#922B21' : COLORS.wal} />
                      </TouchableOpacity>
                    </View>
                    {a.service && (
                      <Text style={[styles.apptService, { color: colors.textSecondary }]}>{a.service.emoji ?? '🦷'} {a.service.name}</Text>
                    )}
                    {a.arrived_at && (
                      <Text style={[styles.apptService, { color: colors.textSecondary }]}>
                        🚪 Príchod: {new Date(a.arrived_at).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    )}
                    {a.family_member_name ? (
                      <Text style={styles.familyTag}>👶 Pre: {a.family_member_name}</Text>
                    ) : null}
                    {/* Notes - show input when editing, otherwise text */}
                    {isEditing ? (
                      <View style={styles.apptNoteEdit}>
                        <TextInput
                          style={[styles.apptNoteInput, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
                          value={editNoteText}
                          onChangeText={setEditNoteText}
                          placeholder="Klinické poznámky, diagnóza..."
                          placeholderTextColor={dark ? '#666' : '#999'}
                          multiline
                          numberOfLines={3}
                          textAlignVertical="top"
                          autoFocus
                        />
                        <TouchableOpacity
                          style={[styles.apptNoteSaveBtn, savingApptNote && { opacity: 0.5 }]}
                          onPress={() => handleSaveApptNote(a.id)}
                          disabled={savingApptNote}
                          activeOpacity={0.85}
                        >
                          {savingApptNote
                            ? <ActivityIndicator color="#fff" size="small" />
                            : <Text style={styles.apptNoteSaveBtnText}>💾 Uložiť poznámku</Text>}
                        </TouchableOpacity>
                      </View>
                    ) : a.doctor_notes ? (
                      <Text style={styles.apptNotes} numberOfLines={3}>📝 {a.doctor_notes}</Text>
                    ) : null}
                    {/* Hodnotenie pacienta */}
                    {a.status === 'completed' && (
                      <>
                        <View style={styles.ratingRow}>
                          {[1, 2, 3, 4, 5].map(n => (
                            <Ionicons
                              key={n}
                              name={n <= (a.patient_rating ?? 0) ? 'star' : 'star-outline'}
                              size={12}
                              color={a.patient_rating ? '#F39C12' : '#ccc'}
                            />
                          ))}
                          {a.patient_rating ? (
                            <Text style={styles.ratingLabel}>{RATING_LABELS[a.patient_rating]}</Text>
                          ) : (
                            <Text style={[styles.ratingLabel, { color: '#888' }]}>Bez hodnotenia</Text>
                          )}
                        </View>
                        {a.patient_rating && a.patient_review ? (
                          <Text style={styles.reviewText}>💬 „{a.patient_review}"</Text>
                        ) : null}
                      </>
                    )}
                    {/* Platba + faktúra pre dokončené */}
                    {a.status === 'completed' && !isEditing && (() => {
                      const pay = PAYMENT_CFG[a.payment_status] ?? PAYMENT_CFG.unpaid;
                      return (
                        <View style={styles.apptPayRow}>
                          <TouchableOpacity
                            style={[styles.payBadge, { backgroundColor: pay.bg, borderColor: pay.color + '88' }]}
                            onPress={() => handleTogglePayment(a.id, a.payment_status)}
                            activeOpacity={0.75}
                          >
                            <Text style={styles.payBadgeIcon}>{pay.icon}</Text>
                            <Text style={[styles.payBadgeText, { color: pay.color }]}>{pay.label}</Text>
                            <Ionicons name="swap-horizontal" size={10} color={pay.color} style={{ marginLeft: 2 }} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.invoiceBtn}
                            onPress={() => exportInvoice(doctorName, patientName ?? 'Pacient', a)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="receipt-outline" size={12} color="#7D3C98" />
                            <Text style={styles.invoiceBtnText}>Faktúra PDF</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })()}
                    {/* Quick status actions + Clone */}
                    {!isEditing && (
                      <View style={styles.apptActRow}>
                        {canAct && (
                          <>
                            <TouchableOpacity
                              style={styles.apptActDone}
                              onPress={() => handleChangeApptStatus(a.id, 'completed')}
                              activeOpacity={0.8}
                            >
                              <Ionicons name="checkmark" size={12} color="#fff" />
                              <Text style={styles.apptActDoneText}>Dokončiť</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.apptActCancel}
                              onPress={() => handleChangeApptStatus(a.id, 'cancelled')}
                              activeOpacity={0.8}
                            >
                              <Ionicons name="close" size={12} color="#922B21" />
                              <Text style={styles.apptActCancelText}>Zrušiť</Text>
                            </TouchableOpacity>
                          </>
                        )}
                        <TouchableOpacity
                          style={styles.apptActClone}
                          onPress={() => router.push({
                            pathname: '/(doctor)/add-appointment',
                            params: { patientId: a.patient_id, patientName: patientName ?? '', serviceId: a.service_id ?? '' }
                          })}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="copy-outline" size={12} color="#7D3C98" />
                          <Text style={styles.apptActCloneText}>Klonovať</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
              </View>
            ));
          })()}
        </View>

        )}

        {/* ══ TAB: LIEČEBNÝ PLÁN ══ */}
        {activeTab === 'plan' && (
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>LIEČEBNÝ PLÁN</Text>
            <TouchableOpacity style={styles.planBtn}
              onPress={() => router.push({ pathname: '/(doctor)/treatment-plan', params: { patientId, patientName } })}
              activeOpacity={0.8}>
              <Ionicons name="list-outline" size={22} color="#1E8449" />
              <View style={{ flex: 1 }}>
                <Text style={styles.planBtnText}>Otvoriť liečebný plán</Text>
                <Text style={[styles.emptyText, { marginTop: 2, color: colors.textSecondary }]}>Prehľad výkonov, stav a ceny</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#1E8449" />
            </TouchableOpacity>
          </View>
        )}

        {/* ══ TAB: PLATBY ══ */}
        {activeTab === 'payments' && (
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>PLATBY</Text>
            {unpaidCount > 0 && (
              <View style={[styles.unpaidBanner, { alignSelf: 'stretch', marginBottom: 14 }]}>
                <Ionicons name="card-outline" size={14} color="#922B21" />
                <Text style={styles.unpaidBannerText}>
                  {unpaidCount}× nezaplatené{unpaidTotal > 0 ? ` · ${unpaidTotal} €` : ''}
                </Text>
              </View>
            )}
            {appointments.filter(a => a.status === 'completed').map(a => {
              const pay = PAYMENT_CFG[a.payment_status] ?? PAYMENT_CFG.unpaid;
              const d = new Date(a.appointment_date);
              return (
                <View key={a.id} style={[styles.apptRow, { borderBottomWidth: 1, borderBottomColor: colors.bg3 }]}>
                  <View style={[styles.apptDateBox, { backgroundColor: colors.bg2 }]}>
                    <Text style={[styles.apptDay, { color: colors.textPrimary }]}>{d.getDate()}</Text>
                    <Text style={[styles.apptMonth, { color: colors.textSecondary }]}>{d.toLocaleDateString('sk-SK', { month: 'short' })}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.apptService, { color: colors.textSecondary }]}>{a.service?.emoji ?? '🦷'} {a.service?.name ?? '—'}</Text>
                    <View style={styles.apptActRow}>
                      <TouchableOpacity
                        style={[styles.payBadge, { backgroundColor: pay.bg, borderColor: pay.color + '88' }]}
                        onPress={() => handleTogglePayment(a.id, a.payment_status)} activeOpacity={0.75}>
                        <Text style={styles.payBadgeIcon}>{pay.icon}</Text>
                        <Text style={[styles.payBadgeText, { color: pay.color }]}>{pay.label}</Text>
                        <Ionicons name="swap-horizontal" size={10} color={pay.color} style={{ marginLeft: 2 }} />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.invoiceBtn}
                        onPress={() => exportInvoice(doctorName, patientName ?? 'Pacient', a)} activeOpacity={0.8}>
                        <Ionicons name="receipt-outline" size={12} color="#7D3C98" />
                        <Text style={styles.invoiceBtnText}>Faktúra</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  {a.service?.price_min != null && (
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary }}>{a.service?.price_min} €</Text>
                  )}
                </View>
              );
            })}
            {appointments.filter(a => a.status === 'completed').length === 0 && (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Žiadne dokončené termíny</Text>
            )}
          </View>
        )}

        {/* ══ TAB: SPRÁVY ══ */}
        {activeTab === 'messages' && (
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>SPRÁVY</Text>
            <TouchableOpacity style={[styles.planBtn, dark ? { backgroundColor: '#0D2233', borderColor: '#AED6F133' } : { backgroundColor: '#EBF5FB', borderColor: '#AED6F1' }]}
              onPress={() => router.push({ pathname: '/(doctor)/messages', params: { patientId, patientName } })}
              activeOpacity={0.8}>
              <Ionicons name="chatbubble-outline" size={22} color="#1A5276" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.planBtnText, { color: '#1A5276' }]}>Otvoriť konverzáciu</Text>
                <Text style={[styles.emptyText, { marginTop: 2, color: colors.textSecondary }]}>Správy s pacientom</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#1A5276" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtnSm, { flexDirection: 'row', gap: 8, alignSelf: 'stretch', marginTop: 10, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}
              onPress={() => { setNotifTitle(''); setNotifBody(''); setShowNotifModal(true); }}
              activeOpacity={0.8}>
              <Ionicons name="notifications-outline" size={18} color="#0E6655" />
              <Text style={[styles.actionBtnSmText, { color: '#0E6655', fontSize: 13 }]}>Poslať notifikáciu</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ══ TAB: ZÁZNAMY ══ */}
        {activeTab === 'records' && (
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>ZÁZNAMY</Text>
            {[
              { label: 'Zubná karta', icon: 'clipboard-outline', color: COLORS.wal, path: '/(doctor)/dental-chart' },
              { label: 'Anamnéza',    icon: 'document-text-outline', color: '#1A5276', path: '/(doctor)/patient-passport' },
              { label: 'Recepty',     icon: 'medical-outline', color: '#1E8449', path: '/(doctor)/prescriptions' },
              { label: 'Prílohy',     icon: 'attach-outline', color: '#784212', path: '/(doctor)/patient-attachments' },
              { label: 'AI RTG',      icon: 'scan-outline', color: '#3A4256', path: '/(doctor)/xray-analysis' },
              { label: 'AI Riziká',   icon: 'analytics-outline', color: '#8E44AD', path: '/(doctor)/risk-prediction' },
              { label: 'Before/After',icon: 'images-outline', color: '#1E8449', path: '/(doctor)/before-after' },
              { label: 'Súhlasy',     icon: 'checkmark-circle-outline', color: '#7D3C98', path: '/(doctor)/consent-forms' },
            ].map(item => (
              <TouchableOpacity key={item.label}
                style={[styles.planBtn, { backgroundColor: colors.bg2, borderColor: colors.bg3, marginBottom: 8 }]}
                onPress={() => router.push({ pathname: item.path as any, params: { patientId, patientName } })}
                activeOpacity={0.8}>
                <Ionicons name={item.icon as any} size={20} color={item.color} />
                <Text style={[styles.planBtnText, { color: item.color, flex: 1 }]}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={14} color={item.color} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.planBtn, dark ? { backgroundColor: '#1E0D33', borderColor: '#D7BDE244' } : { backgroundColor: '#F5EEF8', borderColor: '#D7BDE2' }]}
              onPress={() => exportPatientHistory(patientName ?? 'Pacient', appointments as unknown as Appointment[])}
              activeOpacity={0.8}>
              <Ionicons name="download-outline" size={20} color="#7D3C98" />
              <Text style={[styles.planBtnText, { color: '#7D3C98', flex: 1 }]}>Exportovať históriu (PDF)</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── FAB: Pridať termín ── */}
      <TouchableOpacity style={styles.fab}
        onPress={() => router.push({ pathname: '/(doctor)/add-appointment', params: { patientId, patientName } })}
        activeOpacity={0.85}>
        <Ionicons name="calendar-outline" size={22} color="#fff" />
      </TouchableOpacity>

      {/* ── Modal: Poslať notifikáciu pacientovi ── */}
      <Modal visible={showNotifModal} transparent animationType="slide" onRequestClose={() => setShowNotifModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.notifOverlay}>
            <TouchableOpacity style={{ flex: 0.4 }} activeOpacity={1} onPress={() => setShowNotifModal(false)} />
            <View style={[styles.notifSheet, { backgroundColor: colors.cardBg }]}>
              <View style={[styles.notifHandle, { backgroundColor: colors.bg3 }]} />
              <Text style={[styles.notifTitle, { color: colors.textPrimary }]}>Poslať notifikáciu</Text>
              <Text style={[styles.notifSub, { color: colors.textSecondary }]}>Pacient dostane upozornenie v appke</Text>

              <Text style={[styles.notifLabel, { color: colors.textSecondary }]}>NADPIS *</Text>
              <TextInput
                style={[styles.notifInput, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
                value={notifTitle}
                onChangeText={setNotifTitle}
                placeholder="napr. Výsledky sú pripravené"
                placeholderTextColor={dark ? '#666' : '#999'}
                autoFocus
                maxLength={80}
              />

              <Text style={[styles.notifLabel, { color: colors.textSecondary }]}>SPRÁVA (voliteľné)</Text>
              <TextInput
                style={[styles.notifInput, { minHeight: 80, backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
                value={notifBody}
                onChangeText={setNotifBody}
                placeholder="Detailnejšia správa pre pacienta..."
                placeholderTextColor={dark ? '#666' : '#999'}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                maxLength={300}
              />

              {/* Rýchle šablóny */}
              <Text style={[styles.notifLabel, { color: colors.textSecondary }]}>RÝCHLE ŠABLÓNY</Text>
              <View style={styles.notifTemplates}>
                {[
                  { t: 'Výsledky sú pripravené', b: 'Navštívte nás pre vyzdvihnutie výsledkov.' },
                  { t: 'Pripomienka termínu', b: `Pripomíname váš nadchádzajúci termín u nás.` },
                  { t: 'Recept je pripravený', b: 'Recept si môžete vyzdvihnúť v ordinácii.' },
                ].map(tpl => (
                  <TouchableOpacity key={tpl.t} style={styles.notifTplBtn}
                    onPress={() => { setNotifTitle(tpl.t); setNotifBody(tpl.b); }} activeOpacity={0.8}>
                    <Text style={styles.notifTplText}>{tpl.t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.notifBtnRow}>
                <TouchableOpacity style={[styles.notifBtnCancel, { borderColor: colors.bg3 }]} onPress={() => setShowNotifModal(false)} activeOpacity={0.8}>
                  <Text style={[styles.notifBtnCancelText, { color: colors.textSecondary }]}>Zrušiť</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.notifBtnSend, (!notifTitle.trim() || notifSending) && { opacity: 0.4 }]}
                  onPress={handleSendNotification}
                  disabled={!notifTitle.trim() || notifSending}
                  activeOpacity={0.85}>
                  {notifSending
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <>
                        <Ionicons name="send" size={15} color="#fff" />
                        <Text style={styles.notifBtnSendText}>Odoslať</Text>
                      </>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
    </ScreenWrapper>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: COLORS.esp },
  scroll:  { flex: 1, backgroundColor: COLORS.bg2 },
  content: { padding: SPACING.xl, paddingTop: 12, paddingBottom: 120 },
  center:  { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center' },

  header:         { backgroundColor: COLORS.esp, paddingHorizontal: SPACING.xl, paddingTop: 10, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn:        { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerSub:      { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  headerTitle:    { fontSize: 17, fontWeight: '700', color: '#fff' },
  scoreChip:      { width: 44, height: 44, borderRadius: 4, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  scoreChipNum:   { fontSize: 16, fontWeight: '800', lineHeight: 18 },
  scoreChipLabel: { fontSize: 7, fontWeight: '600', textTransform: 'uppercase' },

  // Info karta
  infoCard:    { backgroundColor: COLORS.cream, borderRadius: 2, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: COLORS.bg3, flexDirection: 'row', gap: 14 },
  avatarWrap:  { alignItems: 'center', gap: 6 },
  avatar:      { width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.sand, overflow: 'hidden' },
  avatarText:  { fontSize: 22, fontWeight: '700', color: '#fff' },
  loyaltyBadge:{ flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 2, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 2 },
  loyaltyIcon: { fontSize: 10 },
  loyaltyName: { fontSize: 8, fontWeight: '700' },
  patientName: { fontSize: 16, fontWeight: '700', color: COLORS.esp, marginBottom: 4 },
  phoneRow:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  phoneText:   { fontSize: 12, color: COLORS.wal },
  infoChips:   { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 5 },
  chip:        { borderRadius: 2, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  chipGreen:   { backgroundColor: '#EAFAF1', borderColor: '#A9DFBF' },
  chipOrange:  { backgroundColor: '#FEF9E7', borderColor: '#F9E79F' },
  chipGray:    { backgroundColor: COLORS.bg3, borderColor: COLORS.bg3 },
  chipText:    { fontSize: 9, fontWeight: '700', color: COLORS.esp },

  // Interné poznámky
  notesPrivateBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EBF5FB', borderRadius: 2, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#AED6F1' },
  notesPrivateText:  { fontSize: 9, fontWeight: '700', color: '#1A5276' },
  notesInput:        { borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: 2, padding: 12, fontSize: 13, color: COLORS.esp, minHeight: 90, backgroundColor: COLORS.bg2, marginBottom: 10, lineHeight: 20 },
  notesSaveBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1A5276', borderRadius: 2, paddingVertical: 11 },
  notesSaveBtnText:  { fontSize: 13, fontWeight: '700', color: '#fff' },
  statsRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loyaltyPts:  { fontSize: 10, color: COLORS.wal },
  ratingPill:  { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FEF9E7', borderRadius: 2, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#F39C12' },
  ratingPillText: { fontSize: 10, fontWeight: '700', color: '#F39C12' },

  // Akcie
  actionsRow:       { flexDirection: 'row', gap: 8 },
  actionBtn:        { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.cream, borderRadius: 2, paddingVertical: 14, borderWidth: 1, borderColor: COLORS.bg3 },
  actionBtnPrimary: { backgroundColor: COLORS.wal, borderColor: COLORS.wal },
  actionBtnText:    { fontSize: 11, fontWeight: '700', color: COLORS.wal, textAlign: 'center' },
  actionBtnSm:      { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: COLORS.cream, borderRadius: 2, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.bg3 },
  actionBtnSmText:  { fontSize: 10, fontWeight: '600', color: COLORS.wal, textAlign: 'center' },
  // Plán liečby
  planBtn:          { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#EAFAF1', borderRadius: 2, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 14, borderWidth: 1.5, borderColor: '#A9DFBF' },
  planBtnText:      { fontSize: 13, fontWeight: '700', color: '#1E8449' },

  // Karta
  card:           { backgroundColor: COLORS.cream, borderRadius: 2, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: COLORS.bg3 },
  cardTitle:      { fontSize: 9, letterSpacing: 2, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 12 },
  cardTitleRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  scoreCircleMini:{ width: 42, height: 42, borderRadius: 21, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  scoreCircleNum: { fontSize: 15, fontWeight: '800' },

  // Dim bar
  dimRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  dimEmoji:    { fontSize: 14, width: 22, textAlign: 'center' },
  dimLabel:    { fontSize: 10, fontWeight: '600', color: COLORS.esp, width: 65 },
  dimTrack:    { flex: 1, height: 8, backgroundColor: COLORS.bg3, borderRadius: 4, overflow: 'hidden' },
  dimFill:     { height: 8, borderRadius: 4 },
  dimScore:    { fontSize: 12, fontWeight: '800', width: 24, textAlign: 'right' },
  gradeBox:    { width: 20, height: 20, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
  gradeText:   { fontSize: 9, fontWeight: '800', color: '#fff' },
  dimLegend:   { flexDirection: 'row', gap: 10, marginTop: 4, justifyContent: 'flex-end' },
  dimLegendItem:{ flexDirection: 'row', alignItems: 'center', gap: 3 },
  dimLegendDot:{ width: 7, height: 7, borderRadius: 4 },
  dimLegendText:{ fontSize: 9, color: COLORS.wal },

  // Zuby
  teethGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  teethChip:  { borderRadius: 2, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7, alignItems: 'center', minWidth: 72 },
  teethEmoji: { fontSize: 14, marginBottom: 2 },
  teethCount: { fontSize: 18, fontWeight: '800', lineHeight: 22 },
  teethLabel: { fontSize: 8, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 1 },
  warningBox: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: '#FDEDEC', borderRadius: 2, padding: 10, marginTop: 4 },
  warningText:{ flex: 1, fontSize: 11, color: '#922B21', lineHeight: 16 },


  // Termíny
  emptyText:     { fontSize: 12, color: COLORS.wal, fontStyle: 'italic' },
  apptRow:       { flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.bg3 },
  apptDateBox:   { width: 38, alignItems: 'center', backgroundColor: COLORS.bg2, borderRadius: 2, paddingVertical: 5 },
  apptDay:       { fontSize: 18, fontWeight: '800', color: COLORS.esp, lineHeight: 22 },
  apptMonth:     { fontSize: 9, fontWeight: '600', color: COLORS.wal, textTransform: 'uppercase' },
  apptYear:      { fontSize: 10, color: '#888' },
  apptTop:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  apptTime:      { fontSize: 13, fontWeight: '700', color: COLORS.esp },
  apptBadge:     { borderRadius: 2, paddingHorizontal: 7, paddingVertical: 2 },
  apptBadgeText: { fontSize: 9, fontWeight: '700' },
  apptService:   { fontSize: 12, color: COLORS.wal, marginBottom: 2 },
  familyTag:     { fontSize: 10, color: '#784212', fontWeight: '600', marginBottom: 2 },
  apptNotes:     { fontSize: 11, color: '#888', fontStyle: 'italic', lineHeight: 15, marginBottom: 2 },
  ratingRow:     { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  ratingLabel:   { fontSize: 11, color: '#F39C12', fontWeight: '600', marginLeft: 2 },
  reviewText:    { fontSize: 11, color: '#888', fontStyle: 'italic', lineHeight: 15, marginTop: 2, paddingLeft: 2 },
  // Appointment note editing
  apptNoteEdit:      { marginTop: 6, marginBottom: 4 },
  apptNoteInput:     { borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: 2, padding: 8, fontSize: 12, color: COLORS.esp, minHeight: 64, backgroundColor: COLORS.bg2, lineHeight: 18, marginBottom: 6 },
  apptNoteSaveBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#1A5276', borderRadius: 2, paddingVertical: 7 },
  apptNoteSaveBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  // Faktúra
  invoiceBtn:        { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 2, backgroundColor: '#F5EEF8', borderWidth: 1, borderColor: '#D7BDE2' },
  invoiceBtnText:    { fontSize: 11, fontWeight: '700', color: '#7D3C98' },
  // Quick status actions
  apptActRow:        { flexDirection: 'row', gap: 6, marginTop: 7 },
  apptActDone:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 6, borderRadius: 2, backgroundColor: '#1E8449' },
  apptActDoneText:   { fontSize: 11, fontWeight: '700', color: '#fff' },
  apptActCancel:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 6, borderRadius: 2, backgroundColor: '#FDEDEC', borderWidth: 1, borderColor: '#F5B7B1' },
  apptActCancelText: { fontSize: 11, fontWeight: '700', color: '#922B21' },
  apptActClone:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 2, backgroundColor: '#F5EEF8', borderWidth: 1, borderColor: '#D7BDE2' },
  apptActCloneText:  { fontSize: 11, fontWeight: '700', color: '#7D3C98' },

  // Poisťovňa
  insRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.bg2, borderRadius: 2, padding: 10 },
  insText: { flex: 1, fontSize: 13, color: COLORS.esp, fontWeight: '600' },

  // Platby
  unpaidBanner:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5, backgroundColor: '#FDEDEC', borderRadius: 2, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#F5B7B1', alignSelf: 'flex-start' },
  unpaidBannerText:{ fontSize: 10, fontWeight: '700', color: '#922B21' },
  apptPayRow:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  payBadge:        { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 2, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  payBadgeIcon:    { fontSize: 11 },
  payBadgeText:    { fontSize: 10, fontWeight: '700' },

  // Kritické upozornenia
  recallBanner:    { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#E8F8F5', borderWidth: 1.5, borderColor: '#A2D9CE', borderRadius: 2, padding: 12, marginBottom: 12 },
  recallTitle:     { fontSize: 13, fontWeight: '700', color: '#0E6655', marginBottom: 2 },
  recallSub:       { fontSize: 11, color: '#17A589' },
  critBox:         { backgroundColor: '#FDEDEC', borderWidth: 1.5, borderColor: '#E74C3C', borderRadius: 2, padding: 12, marginBottom: 12 },
  critHeader:      { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#F5B7B1' },
  critTitle:       { fontSize: 10, fontWeight: '800', color: '#C0392B', letterSpacing: 1.5, flex: 1 },
  critBlood:       { backgroundColor: COLORS.cream, borderWidth: 1.5, borderColor: '#E74C3C', borderRadius: 2, paddingHorizontal: 10, paddingVertical: 2 },
  critBloodText:   { fontSize: 11, fontWeight: '800', color: '#C0392B' },
  critLine:        { fontSize: 13, color: '#6A1A12', lineHeight: 18, marginTop: 3 },
  critStrong:      { fontWeight: '800' },

  // Quick stats
  quickStats:    { borderRadius: 2, padding: 12, marginBottom: 14, borderWidth: 1 },
  qsRow:         { flexDirection: 'row', gap: 8 },
  qsBox:         { flex: 1, alignItems: 'center', borderRadius: 2, paddingVertical: 10, paddingHorizontal: 4 },
  qsVal:         { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  qsLabel:       { fontSize: 8, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, textAlign: 'center' },

  // Score gauge row
  scoreGaugeRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12 },

  // Diagnózy
  diagRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1 },
  diagIcd:       { borderRadius: 2, paddingHorizontal: 8, paddingVertical: 4 },
  diagIcdText:   { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  diagDesc:      { fontSize: 12, fontWeight: '600', marginBottom: 2 },
  diagSev:       { borderRadius: 2, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  diagSevText:   { fontSize: 9, fontWeight: '700' },

  // Timeline
  tlMonthLabel:  { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginLeft: 28 },
  tlRow:         { flexDirection: 'row', gap: 0 },
  tlLineWrap:    { width: 22, alignItems: 'center' },
  tlDot:         { width: 10, height: 10, borderRadius: 2, borderWidth: 2, zIndex: 1 },
  tlLine:        { width: 2, flex: 1, marginTop: -1 },
  tlCard:        { flex: 1, borderRadius: 2, padding: 12, marginBottom: 10, marginLeft: 6, borderWidth: 1 },

  // FAB
  fab: { position: 'absolute', bottom: 84, right: 20, width: 54, height: 54, borderRadius: 27, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: COLORS.esp, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, borderWidth: 2, borderColor: COLORS.sand },

  // Notifikačný modal
  notifOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  notifSheet:         { backgroundColor: COLORS.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 36 },
  notifHandle:        { width: 38, height: 4, borderRadius: 2, backgroundColor: COLORS.bg3, alignSelf: 'center', marginBottom: 18 },
  notifTitle:         { fontSize: 20, fontWeight: '700', color: COLORS.esp, marginBottom: 4 },
  notifSub:           { fontSize: 12, color: COLORS.wal, marginBottom: 16 },
  notifLabel:         { fontSize: 9, letterSpacing: 1.5, color: COLORS.wal, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6, marginTop: 10 },
  notifInput:         { borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: 2, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.esp, backgroundColor: COLORS.bg2 },
  notifTemplates:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  notifTplBtn:        { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 4, backgroundColor: '#E8F8F5', borderWidth: 1, borderColor: '#A2D9CE' },
  notifTplText:       { fontSize: 11, fontWeight: '600', color: '#0E6655' },
  notifBtnRow:        { flexDirection: 'row', gap: 10, marginTop: 18 },
  notifBtnCancel:     { flex: 1, paddingVertical: 14, borderRadius: 2, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.bg3 },
  notifBtnCancelText: { fontSize: 14, fontWeight: '600', color: COLORS.wal },
  notifBtnSend:       { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 2, backgroundColor: '#0E6655' },
  notifBtnSendText:   { fontSize: 14, fontWeight: '700', color: '#fff' }
});

const tabStyles = StyleSheet.create({
  bar:           { backgroundColor: COLORS.esp, maxHeight: 44, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.10)' },
  barContent:    { paddingHorizontal: 4, alignItems: 'stretch' },
  tab:           { paddingHorizontal: 14, height: 44, justifyContent: 'center', borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
  tabActive:     { borderBottomColor: COLORS.gold },
  tabInner:      { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tabText:       { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.45)' },
  tabTextActive: { color: COLORS.gold, fontWeight: '700' },
  tabBadge:      { minWidth: 16, height: 16, borderRadius: 2, backgroundColor: '#E74C3C', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  tabBadgeText:  { fontSize: 9, fontWeight: '800', color: '#fff' }
});
