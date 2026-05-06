import React, { useState, useEffect, useCallback } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabase';
import { COLORS, RADII, SHADOWS, TYPO, GRADIENTS, SPACING } from '../../styles/theme';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';
import { fmtTime } from '../../utils/clinicMetrics';

type Appointment = {
  id: string;
  appointment_date: string;
  duration_minutes: number;
  clinic_status: string | null;
  arrived_at: string | null;
  patient: { id: string; full_name: string } | null;
  service: { name: string } | null;
};

const STATUS_CFG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  scheduled:     { label: 'Naplánovaný',  bg: '#EBF5FB', text: '#1A5276', border: '#AED6F1' },
  arrived:       { label: 'Prišiel',      bg: '#EDF7F3', text: '#2E7D5E', border: '#A8D5C0' },
  waiting:       { label: 'Čaká',         bg: '#FDF3E7', text: '#B87333', border: '#F0C78A' },
  in_chair:      { label: 'V kresle',     bg: '#F4ECF7', text: '#7D3C98', border: '#D2B4DE' },
  treatment_done:{ label: 'Výkon hotový', bg: '#F5EEF8', text: '#7D3C98', border: '#D7BDE2' },
  checkout:      { label: 'Účet',         bg: '#FEF3E2', text: '#E67E22', border: '#FAD7A0' },
  paid:          { label: 'Zaplatené',    bg: '#EDF7F3', text: '#2E7D5E', border: '#A8D5C0' },
  cancelled:     { label: 'Zrušený',      bg: '#FDEDEC', text: '#C0392B', border: '#F1948A' },
  late:          { label: 'Mešká',        bg: '#FDEDEC', text: '#C0392B', border: '#F1948A' },
  no_show:       { label: 'Neprišiel',    bg: '#FDEDEC', text: '#922B21', border: '#F1948A' },
};

const NEXT_STATUS: Record<string, string> = {
  scheduled: 'arrived',
  arrived:   'waiting',
  waiting:   'in_chair',
  in_chair:  'treatment_done',
};

const NEXT_LABEL: Record<string, string> = {
  scheduled: 'Označiť ako prišiel',
  arrived:   'Presunúť do čakárne',
  waiting:   'Volať do kresla',
  in_chair:  'Dokončiť',
};

export default function ReceptionCheckin() {
  const { colors, dark } = useAppTheme();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [query, setQuery]               = useState('');
  const [updating, setUpdating]         = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    const { data } = await supabase
      .from('appointments')
      .select('id, appointment_date, duration_minutes, clinic_status, arrived_at, patient:profiles!appointments_patient_id_fkey(id, full_name), service:services(name)')
      .gte('appointment_date', `${today}T00:00:00`)
      .lte('appointment_date', `${today}T23:59:59`)
      .not('clinic_status', 'eq', 'cancelled')
      .order('appointment_date');
    setAppointments((data as unknown as Appointment[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel('reception-checkin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
        load(true);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, []);

  async function advance(apt: Appointment) {
    const next = NEXT_STATUS[apt.clinic_status ?? 'scheduled'];
    if (!next) return;
    setUpdating(apt.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const updates: Record<string, any> = { clinic_status: next };
    if (next === 'arrived') {
      updates.arrived_at = new Date().toISOString();
      updates.status     = 'arrived';
    }
    if (next === 'in_chair')       updates.chair_start_at   = new Date().toISOString();
    if (next === 'treatment_done') {
      updates.treatment_end_at = new Date().toISOString();
      updates.status           = 'completed';
    }
    await supabase.from('appointments').update(updates).eq('id', apt.id);
    setUpdating(null);
    load(true);
  }

  const filtered = query.trim()
    ? appointments.filter(a =>
        a.patient?.full_name?.toLowerCase().includes(query.toLowerCase()) ||
        a.service?.name?.toLowerCase().includes(query.toLowerCase())
      )
    : appointments;

  const waiting  = filtered.filter(a => ['arrived', 'waiting'].includes(a.clinic_status ?? ''));
  const inChair  = filtered.filter(a => a.clinic_status === 'in_chair');
  const upcoming = filtered.filter(a => a.clinic_status === 'scheduled');
  const done     = filtered.filter(a => ['treatment_done', 'checkout', 'paid', 'late', 'no_show'].includes(a.clinic_status ?? ''));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.esp }} edges={['top']}>
      {/* Hero */}
      <LinearGradient colors={GRADIENTS.hero as [string, string, ...string[]]} style={s.hero}>
        <Text style={s.heroLabel}>RECEPCIA</Text>
        <Text style={s.heroTitle}>Check-in</Text>

        {/* Live badges */}
        <View style={s.heroBadges}>
          <Badge count={waiting.length}  label="Čaká"    color="#F0C78A" textColor="#7D5A0A" />
          <Badge count={inChair.length}  label="V kresle" color="#D2B4DE" textColor="#5B2C6F" />
          <Badge count={upcoming.length} label="Príde"    color={COLORS.sand} textColor={COLORS.esp} />
        </View>

        {/* Search */}
        <View style={[s.searchWrap, { backgroundColor: 'rgba(255,255,255,0.10)' }]}>
          <Ionicons name="search-outline" size={16} color="rgba(255,255,255,0.55)" />
          <TextInput
            style={s.searchInput}
            placeholder="Hľadať pacienta..."
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      {loading ? (
        <View style={{ flex: 1, backgroundColor: colors.bg2, padding: 16 }}>
          <SkeletonList count={4} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.bg2 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} />}
        >
          {/* In chair */}
          {inChair.length > 0 && (
            <Section title={`V kresle (${inChair.length})`} accentColor="#7D3C98">
              {inChair.map(a => (
                <AptRow key={a.id} apt={a} colors={colors} updating={updating} onAdvance={advance} />
              ))}
            </Section>
          )}

          {/* Waiting */}
          {waiting.length > 0 && (
            <Section title={`Čakáreň (${waiting.length})`} accentColor={COLORS.warning}>
              {waiting.map(a => (
                <AptRow key={a.id} apt={a} colors={colors} updating={updating} onAdvance={advance} />
              ))}
            </Section>
          )}

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <Section title={`Nadchádzajúce (${upcoming.length})`} accentColor={COLORS.gold}>
              {upcoming.map(a => (
                <AptRow key={a.id} apt={a} colors={colors} updating={updating} onAdvance={advance} />
              ))}
            </Section>
          )}

          {/* Done */}
          {done.length > 0 && (
            <Section title={`Dokončené (${done.length})`} accentColor={COLORS.success}>
              {done.map(a => (
                <AptRow key={a.id} apt={a} colors={colors} updating={updating} onAdvance={advance} />
              ))}
            </Section>
          )}

          {filtered.length === 0 && (
            <View style={s.empty}>
              <Ionicons name="enter-outline" size={48} color={COLORS.sand} />
              <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Žiadne termíny</Text>
              <Text style={[s.emptySub, { color: colors.textSecondary }]}>
                {query ? `Nenašli sa termíny pre „${query}"` : 'Na dnešný deň nie sú naplánované žiadne termíny'}
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Badge({ count, label, color, textColor }: { count: number; label: string; color: string; textColor: string }) {
  return (
    <View style={[sb.wrap, { backgroundColor: color }]}>
      <Text style={[sb.count, { color: textColor }]}>{count}</Text>
      <Text style={[sb.label, { color: textColor }]}>{label}</Text>
    </View>
  );
}

function Section({ title, accentColor, children }: { title: string; accentColor: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 20 }}>
      <View style={ss.header}>
        <View style={[ss.dot, { backgroundColor: accentColor }]} />
        <Text style={ss.title}>{title}</Text>
      </View>
      <View style={{ gap: 8 }}>{children}</View>
    </View>
  );
}

function AptRow({ apt, colors, updating, onAdvance }: {
  apt: Appointment;
  colors: any;
  updating: string | null;
  onAdvance: (a: Appointment) => void;
}) {
  const cfg = STATUS_CFG[apt.clinic_status ?? 'scheduled'] ?? STATUS_CFG.scheduled;
  const nextLabel = NEXT_LABEL[apt.clinic_status ?? 'scheduled'];
  const isLoading = updating === apt.id;

  const waitMins = apt.arrived_at
    ? Math.round((Date.now() - new Date(apt.arrived_at).getTime()) / 60000)
    : null;

  const accentColor: Record<string, string> = {
    arrived:   COLORS.warning,
    waiting:   COLORS.warning,
    in_chair:  '#7D3C98',
    completed: COLORS.success,
    scheduled: COLORS.gold,
    late:      COLORS.error,
  };

  return (
    <View style={[ar.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, SHADOWS.card]}>
      <View style={[ar.accent, { backgroundColor: accentColor[apt.clinic_status ?? 'scheduled'] ?? COLORS.gold }]} />

      <View style={ar.top}>
        <View style={{ flex: 1 }}>
          <Text style={[ar.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {apt.patient?.full_name ?? 'Pacient'}
          </Text>
          <Text style={[ar.service, { color: colors.textSecondary }]} numberOfLines={1}>
            {apt.service?.name ?? '—'} · {fmtTime(apt.appointment_date)}
          </Text>
        </View>

        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <View style={[ar.statusPill, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
            <Text style={[ar.statusText, { color: cfg.text }]}>{cfg.label}</Text>
          </View>
          {waitMins !== null && (
            <Text style={[ar.waitTime, { color: waitMins > 15 ? COLORS.error : COLORS.success }]}>
              {waitMins} min
            </Text>
          )}
        </View>
      </View>

      {nextLabel && (
        <TouchableOpacity
          style={ar.advBtn}
          onPress={() => onAdvance(apt)}
          activeOpacity={0.8}
          disabled={isLoading}
        >
          {isLoading
            ? <ActivityIndicator size="small" color={COLORS.gold} />
            : <>
                <Ionicons name="arrow-forward-circle-outline" size={16} color={COLORS.gold} />
                <Text style={ar.advText}>{nextLabel}</Text>
              </>
          }
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  hero: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, gap: 2 },
  heroLabel: { ...TYPO.overline, color: COLORS.sand, marginBottom: 2 },
  heroTitle: { ...TYPO.h1, color: '#FAF6F0', marginBottom: 12 },
  heroBadges: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: RADII.md, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  searchInput: { flex: 1, ...TYPO.body, color: '#FAF6F0', padding: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty:  { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyTitle: { ...TYPO.h2, textAlign: 'center' },
  emptySub:   { ...TYPO.body, textAlign: 'center' },
});

const sb = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: RADII.full, paddingHorizontal: 10, paddingVertical: 5 },
  count: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 16, lineHeight: 20 },
  label: { fontFamily: 'DMSans_500Medium', fontSize: 10, letterSpacing: 0.5 },
});

const ss = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  dot:    { width: 8, height: 8, borderRadius: 4 },
  title:  { ...TYPO.label, color: COLORS.wal },
});

const ar = StyleSheet.create({
  card: {
    borderRadius: RADII.lg,
    borderWidth: 1,
    overflow: 'hidden',
    paddingLeft: 18,
    paddingRight: 14,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 10,
  },
  accent: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 4,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  name:    { ...TYPO.bodyMed },
  service: { ...TYPO.bodySm, marginTop: 2 },
  statusPill: {
    borderRadius: RADII.full,
    paddingHorizontal: 10, paddingVertical: 3,
    borderWidth: 1,
  },
  statusText: { fontFamily: 'DMSans_500Medium', fontSize: 11, letterSpacing: 0.3 },
  waitTime:   { fontFamily: 'DMSans_500Medium', fontSize: 11 },
  advBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(201,168,76,0.10)',
    borderRadius: RADII.sm,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)',
    alignSelf: 'flex-start',
  },
  advText: { fontFamily: 'DMSans_500Medium', fontSize: 13, color: COLORS.gold },
});
