/**
 * Globálne vyhľadávanie — doktor
 * Hľadá naprieč: pacienti, termíny, poznámky, služby
 */
import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  StyleSheet, Text, TextInput,
  TouchableOpacity, View, SectionList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII } from '../../styles/theme';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';

type Patient = {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  date_of_birth: string | null;
};

type Appt = {
  id: string;
  appointment_date: string;
  status: string;
  notes: string | null;
  doctor_notes: string | null;
  patient: { id: string; full_name: string | null } | null;
  service: { name: string; emoji: string | null } | null;
};

type Service = {
  id: string;
  name: string;
  emoji: string | null;
  category: string;
  price_min: number | null;
};

type Diagnosis = {
  id: string;
  icd_code: string;
  description: string | null;
  patient_id: string;
  patient: { full_name: string | null } | null;
  created_at: string;
};

type TreatmentPlan = {
  id: string;
  title: string;
  patient_id: string;
  patient: { id: string; full_name: string | null } | null;
  status: string;
  created_at: string;
};

type Section = {
  title: string;
  icon: string;
  data: Array<{ type: 'patient' | 'appt' | 'service' | 'diagnosis' | 'plan'; item: Patient | Appt | Service | Diagnosis | TreatmentPlan }>;
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Naplánovaný', completed: 'Dokončený',
  cancelled: 'Zrušený',    pending:   'Čaká',    arrived: 'V čakárni',
};
const STATUS_COLOR: Record<string, string> = {
  scheduled: '#1A5276', completed: '#1E8449', cancelled: '#922B21', pending: '#E67E22',
};

export default function SearchScreen() {
  const router     = useRouter();
  const { colors, dark } = useAppTheme();
  const inputRef   = useRef<TextInput>(null);
  const [query,    setQuery]    = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appts,    setAppts]    = useState<Appt[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [plans, setPlans] = useState<TreatmentPlan[]>([]);
  const [loading,  setLoading]  = useState(true);

  // Načítaj všetky dáta raz (cache)
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    let focusTimeout: ReturnType<typeof setTimeout> | null = null;
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        const [patsRes, apptsRes, svcsRes, diagRes, planRes] = await Promise.all([
          supabase.from('profiles')
            .select('id, full_name, phone_number, date_of_birth')
            .eq('role', 'patient')
            .order('full_name'),
          supabase.from('appointments')
            .select('id, appointment_date, status, notes, doctor_notes, patient:profiles!appointments_patient_id_fkey(id, full_name), service:services(name, emoji)')
            .eq('doctor_id', user.id)
            .order('appointment_date', { ascending: false })
            .limit(200),
          supabase.from('services')
            .select('id, name, emoji, category, price_min')
            .order('name'),
          supabase.from('diagnoses')
            .select('id, icd_code, description, patient_id, patient:profiles!diagnoses_patient_id_fkey(full_name), created_at')
            .eq('doctor_id', user.id)
            .order('created_at', { ascending: false })
            .limit(100),
          supabase.from('treatment_plans')
            .select('id, title, patient_id, patient:profiles!treatment_plans_patient_id_fkey(id, full_name), status, created_at')
            .eq('doctor_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50),
        ]);

        if (!cancelled) {
          setPatients((patsRes.data ?? []) as Patient[]);
          setAppts((apptsRes.data ?? []) as unknown as Appt[]);
          setServices((svcsRes.data ?? []) as Service[]);
          setDiagnoses((diagRes.data ?? []) as unknown as Diagnosis[]);
          setPlans((planRes.data ?? []) as unknown as TreatmentPlan[]);
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) { console.error('[Search] load failed:', e?.message); setLoading(false); }
      }
    }
    load();
    focusTimeout = setTimeout(() => inputRef.current?.focus(), 300);
    return () => { cancelled = true; if (focusTimeout) clearTimeout(focusTimeout); };
  }, []));

  const sections: Section[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 2) return [];

    const matchedPatients = patients.filter((p) =>
      (p.full_name     ?? '').toLowerCase().includes(q) ||
      (p.phone_number  ?? '').toLowerCase().includes(q)
    ).slice(0, 5);

    const matchedAppts = appts.filter((a) =>
      (a.patient?.full_name ?? '').toLowerCase().includes(q) ||
      (a.notes              ?? '').toLowerCase().includes(q) ||
      (a.doctor_notes       ?? '').toLowerCase().includes(q) ||
      (a.service?.name      ?? '').toLowerCase().includes(q)
    ).slice(0, 5);

    const matchedServices = services.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q)
    ).slice(0, 5);

    const matchedDiagnoses = diagnoses.filter((d) =>
      (d.icd_code ?? '').toLowerCase().includes(q) ||
      (d.description ?? '').toLowerCase().includes(q) ||
      (d.patient?.full_name ?? '').toLowerCase().includes(q)
    ).slice(0, 5);

    const matchedPlans = plans.filter((p) =>
      p.title.toLowerCase().includes(q) ||
      (p.patient?.full_name ?? '').toLowerCase().includes(q)
    ).slice(0, 5);

    const result: Section[] = [];
    if (matchedPatients.length > 0) result.push({
      title: 'Pacienti', icon: '👤',
      data: matchedPatients.map((item) => ({ type: 'patient' as const, item })),
    });
    if (matchedAppts.length > 0) result.push({
      title: 'Termíny', icon: '📅',
      data: matchedAppts.map((item) => ({ type: 'appt' as const, item })),
    });
    if (matchedDiagnoses.length > 0) result.push({
      title: 'Diagnózy', icon: '🩺',
      data: matchedDiagnoses.map((item) => ({ type: 'diagnosis' as const, item })),
    });
    if (matchedPlans.length > 0) result.push({
      title: 'Liečebné plány', icon: '📋',
      data: matchedPlans.map((item) => ({ type: 'plan' as const, item })),
    });
    if (matchedServices.length > 0) result.push({
      title: 'Služby', icon: '🦷',
      data: matchedServices.map((item) => ({ type: 'service' as const, item })),
    });
    return result;
  }, [query, patients, appts, services, diagnoses, plans]);

  const totalResults = sections.reduce((n, s) => n + s.data.length, 0);

  function renderItem({ item: row }: { item: Section['data'][number] }) {
    if (row.type === 'patient') {
      const p = row.item as Patient;
      return (
        <TouchableOpacity style={[styles.resultRow, { backgroundColor: colors.cardBg, borderBottomColor: colors.bg3 }]}
          onPress={() => router.push({ pathname: '/(doctor)/patient-detail', params: { patientId: p.id, patientName: p.full_name ?? '' } })}
          activeOpacity={0.8}>
          <View style={styles.resultIcon}>
            <Text style={styles.resultInitials}>
              {(p.full_name ?? '?').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.resultTitle, { color: colors.textPrimary }]}>{p.full_name ?? 'Pacient'}</Text>
            {p.phone_number && <Text style={[styles.resultSub, { color: colors.textSecondary }]}>{p.phone_number}</Text>}
          </View>
          <Ionicons name="chevron-forward" size={14} color={colors.bg3} />
        </TouchableOpacity>
      );
    }

    if (row.type === 'appt') {
      const a = row.item as Appt;
      const d = new Date(a.appointment_date);
      const statusColor = STATUS_COLOR[a.status] ?? COLORS.wal;
      return (
        <TouchableOpacity style={[styles.resultRow, { backgroundColor: colors.cardBg, borderBottomColor: colors.bg3 }]}
          onPress={() => router.push({ pathname: '/(doctor)/patient-detail', params: { patientId: (a.patient as any)?.id ?? '', patientName: a.patient?.full_name ?? '' } })}
          activeOpacity={0.8}>
          <View style={[styles.resultIcon, { backgroundColor: statusColor + '22' }]}>
            <Text style={{ fontSize: 16 }}>{a.service?.emoji ?? '🦷'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.resultTitle, { color: colors.textPrimary }]}>
              {a.patient?.full_name ?? 'Pacient'} — {a.service?.name ?? 'Termín'}
            </Text>
            <Text style={[styles.resultSub, { color: colors.textSecondary }]}>
              {d.toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' })}
              {' · '}
              <Text style={{ color: statusColor }}>{STATUS_LABEL[a.status] ?? a.status}</Text>
            </Text>
            {a.notes && <Text style={[styles.resultNote, { color: colors.textSecondary }]} numberOfLines={1}>📝 {a.notes}</Text>}
          </View>
          <Ionicons name="chevron-forward" size={14} color={colors.bg3} />
        </TouchableOpacity>
      );
    }

    if (row.type === 'diagnosis') {
      const d = row.item as Diagnosis;
      return (
        <TouchableOpacity style={[styles.resultRow, { backgroundColor: colors.cardBg, borderBottomColor: colors.bg3 }]}
          onPress={() => router.push({ pathname: '/(doctor)/patient-detail', params: { patientId: d.patient_id } })}
          activeOpacity={0.8}>
          <View style={[styles.resultIcon, { backgroundColor: dark ? '#4A1010' : '#FDEDEC' }]}>
            <Text style={{ fontSize: 16 }}>🩺</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.resultTitle, { color: colors.textPrimary }]}>{d.icd_code}{d.description ? ` — ${d.description}` : ''}</Text>
            <Text style={[styles.resultSub, { color: colors.textSecondary }]}>
              {d.patient?.full_name ?? 'Pacient'} · {new Date(d.created_at).toLocaleDateString('sk-SK')}
            </Text>
          </View>
        </TouchableOpacity>
      );
    }
    if (row.type === 'plan') {
      const p = row.item as TreatmentPlan;
      return (
        <TouchableOpacity style={[styles.resultRow, { backgroundColor: colors.cardBg, borderBottomColor: colors.bg3 }]}
          onPress={() => router.push({ pathname: '/(doctor)/treatment-plan', params: { patientId: p.patient?.id ?? p.patient_id } })}
          activeOpacity={0.8}>
          <View style={[styles.resultIcon, { backgroundColor: dark ? '#0D2233' : '#EBF5FB' }]}>
            <Text style={{ fontSize: 16 }}>📋</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.resultTitle, { color: colors.textPrimary }]}>{p.title}</Text>
            <Text style={[styles.resultSub, { color: colors.textSecondary }]}>
              {p.patient?.full_name ?? 'Pacient'} · {p.status === 'active' ? 'Aktívny' : p.status}
            </Text>
          </View>
        </TouchableOpacity>
      );
    }
    // service
    const s = row.item as Service;
    return (
      <View style={[styles.resultRow, { backgroundColor: colors.cardBg, borderBottomColor: colors.bg3 }, { cursor: 'default' } as any]}>
        <View style={[styles.resultIcon, { backgroundColor: colors.bg2 }]}>
          <Text style={{ fontSize: 18 }}>{s.emoji ?? '🦷'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.resultTitle, { color: colors.textPrimary }]}>{s.name}</Text>
          <Text style={[styles.resultSub, { color: colors.textSecondary }]}>{s.category}{s.price_min ? ` · od ${s.price_min} €` : ''}</Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Hlavička + search bar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color={COLORS.wal} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Hľadaj pacienta, termín, diagnózu..."
            placeholderTextColor={COLORS.sand + 'AA'}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="while-editing"
            selectionColor={COLORS.cream}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={16} color={COLORS.sand} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, backgroundColor: colors.bg2, padding: SPACING.xl }}>
          <SkeletonList count={5} />
        </View>
      ) : query.trim().length < 2 ? (
        <View style={[styles.hint, { backgroundColor: colors.bg2 }]}>
          <Ionicons name="search" size={40} color={colors.bg3} />
          <Text style={[styles.hintTitle, { color: colors.textPrimary }]}>Zadaj aspoň 2 znaky</Text>
          <Text style={[styles.hintSub, { color: colors.textSecondary }]}>Hľadaj podľa mena, telefónu, diagnózy alebo názvu služby</Text>
        </View>
      ) : totalResults === 0 ? (
        <View style={[styles.hint, { backgroundColor: colors.bg2 }]}>
          <Ionicons name="search-outline" size={40} color={colors.bg3} />
          <Text style={[styles.hintTitle, { color: colors.textPrimary }]}>Žiadne výsledky pre „{query}"</Text>
          <Text style={[styles.hintSub, { color: colors.textSecondary }]}>Skús iný výraz</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, i) => `${item.type}-${(item.item as any).id}-${i}`}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader, { backgroundColor: colors.bg3, borderBottomColor: colors.bg3 }]}>
              <Text style={styles.sectionIcon}>{section.icon}</Text>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{section.title}</Text>
              <Text style={[styles.sectionCount, { color: colors.textSecondary, backgroundColor: colors.bg2 }]}>{section.data.length}</Text>
            </View>
          )}
          contentContainerStyle={[styles.listContent, { backgroundColor: colors.bg2 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },

  header:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: SPACING.xl, paddingTop: 10, paddingBottom: 12, backgroundColor: COLORS.esp },
  backBtn:   { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  searchInput:{ flex: 1, fontSize: 14, color: '#fff', paddingVertical: 0 },

  hint:      { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: 8 },
  hintTitle: { fontSize: 16, fontWeight: '700', color: COLORS.esp, textAlign: 'center' },
  hintSub:   { fontSize: 12, color: COLORS.wal, textAlign: 'center', lineHeight: 18 },

  listContent: { paddingBottom: 120, backgroundColor: COLORS.bg2 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: SPACING.xl, paddingVertical: 8, backgroundColor: COLORS.bg3, borderBottomWidth: 1, borderBottomColor: COLORS.bg3 },
  sectionIcon:   { fontSize: 14 },
  sectionTitle:  { flex: 1, fontSize: 9, fontWeight: '800', color: COLORS.wal, letterSpacing: 1.5, textTransform: 'uppercase' },
  sectionCount:  { fontSize: 11, fontWeight: '700', color: COLORS.wal, backgroundColor: COLORS.bg2, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },

  resultRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SPACING.xl, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.bg3, backgroundColor: '#fff' },
  resultIcon:     { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.esp, alignItems: 'center', justifyContent: 'center' },
  resultInitials: { fontSize: 14, fontWeight: '700', color: COLORS.cream },
  resultTitle:    { fontSize: 13, fontWeight: '700', color: COLORS.esp, marginBottom: 2 },
  resultSub:      { fontSize: 11, color: COLORS.wal },
  resultNote:     { fontSize: 10, color: '#888', fontStyle: 'italic', marginTop: 2 },
});
