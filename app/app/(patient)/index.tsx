import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Image, Modal,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Reanimated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES, GRADIENTS, SHADOWS, RADII, SPACING, TYPO } from '../../styles/theme';
import { useAppTheme } from '../../context/ThemeContext';
import { useProfile } from '../../hooks/useProfile';
import { useAppointments } from '../../hooks/useAppointments';
import { useNotifications } from '../../hooks/useNotifications';
import { supabase } from '../../supabase';
import { ProgressRing, StatusPill, SectionHeader } from '../../components/ui';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const HEALTH_DED: Partial<Record<string, number>> = {
  cavity: 15, early_cavity: 8, root_canal: 10, extracted: 14,
  missing: 10, fracture: 12, periodontal: 10, mobility: 8,
};
function getWeight(n: number) { const p = n % 10; if (p === 6 || p === 7) return 3; if (p === 4 || p === 5) return 2; if (p === 3) return 1.5; if (p === 8) return 0.5; return 1; }
function calcScore(teeth: { tooth_number: number; status: string }[]) {
  if (!teeth.length) return 70;
  let ded = 0; let healthy = 0;
  teeth.forEach(t => { ded += (HEALTH_DED[t.status] ?? 0) * getWeight(t.tooth_number); if (t.status === 'healthy') healthy++; });
  return Math.max(0, Math.min(100, Math.round(100 - ded + Math.min(15, healthy * 0.8))));
}

function isToday(dateStr: string) {
  const d = new Date(dateStr); const n = new Date();
  return d.getDate() === n.getDate() && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Dobré ráno';
  if (h < 17) return 'Dobrý deň';
  return 'Dobrý večer';
}

function formatDate() {
  return new Date().toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatApptDate(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString('sk-SK', { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

// ─── Opening Hours compact ────────────────────────────────────────────────────

const OH_DAYS = ['', 'Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];
type OHRow = { day_of_week: number; open_time: string | null; close_time: string | null; is_closed: boolean; note: string | null };

function OpeningHoursCompact() {
  const { colors } = useAppTheme();
  const [hours, setHours] = React.useState<OHRow[]>([]);
  const todayNum = new Date().getDay() === 0 ? 7 : new Date().getDay();

  React.useEffect(() => {
    let cancelled = false;
    supabase.from('opening_hours').select('day_of_week,open_time,close_time,is_closed,note').order('day_of_week')
      .then(({ data, error }) => { if (!cancelled && !error && data) setHours(data as OHRow[]); });
    return () => { cancelled = true; };
  }, []);

  if (!hours.length) return null;
  const todayRow = hours.find(h => h.day_of_week === todayNum);
  const isOpen = todayRow && !todayRow.is_closed;

  return (
    <View style={[ohS.card, { backgroundColor: colors.cardBg }]}>
      <LinearGradient colors={isOpen ? ['#EAFAF1', '#D5F5E3'] : ['#FDEDEC', '#F5B7B1']} style={ohS.banner}>
        <View style={[ohS.dot, { backgroundColor: isOpen ? '#2ECC71' : '#E74C3C' }]} />
        <Text style={[ohS.bannerText, { color: isOpen ? '#1E8449' : '#922B21' }]}>
          {isOpen ? `Dnes otvorené · ${todayRow?.open_time?.slice(0, 5)} – ${todayRow?.close_time?.slice(0, 5)}` : 'Dnes zatvorené'}
        </Text>
      </LinearGradient>
      {hours.map(h => (
        <View key={h.day_of_week} style={[ohS.row, { borderTopColor: colors.bg3 }, h.day_of_week === todayNum && [ohS.rowToday, { backgroundColor: colors.bg2 }]]}>
          <Text style={[ohS.day, { color: colors.textSecondary }, h.day_of_week === todayNum && { color: colors.textPrimary, fontFamily: 'DMSans_500Medium' }]}>{OH_DAYS[h.day_of_week]}</Text>
          <Text style={[ohS.time, { color: colors.textPrimary }]}>{h.is_closed ? 'Zatvorené' : `${h.open_time?.slice(0, 5)} – ${h.close_time?.slice(0, 5)}`}</Text>
        </View>
      ))}
    </View>
  );
}

const ohS = StyleSheet.create({
  card:       { backgroundColor: '#fff', borderRadius: RADII.lg, marginHorizontal: SPACING.lg, marginBottom: 14, overflow: 'hidden', ...SHADOWS.sm },
  banner:     { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  dot:        { width: 8, height: 8, borderRadius: 4 },
  bannerText: { fontSize: 13, fontFamily: 'DMSans_500Medium' },
  row:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.bg3 },
  rowToday:   { backgroundColor: COLORS.bg2 },
  day:        { width: 26, fontSize: 11, fontFamily: 'DMSans_500Medium', color: COLORS.wal },
  time:       { flex: 1, fontSize: 12, color: COLORS.esp, fontFamily: 'DMSans_400Regular' },
});

// ─── Dental Tip ───────────────────────────────────────────────────────────────

const DENTAL_TIPS = [
  { emoji: '🪥', text: 'Čistite zuby aspoň 2 minúty dvakrát denne — ráno aj večer.' },
  { emoji: '🧵', text: 'Medzizubná niť odstraňuje zvyšky jedla tam, kde kefka nedostane.' },
  { emoji: '💧', text: 'Pite dostatok vody — pomáha produkcii sliny, ktorá chráni zuby.' },
  { emoji: '🥛', text: 'Mlieko a mliečne výrobky posilňujú sklovinu vďaka vápniku.' },
  { emoji: '🚫', text: 'Vyhýbajte sa sladkým nápojom — cukor je hlavnou príčinou zubného kazu.' },
  { emoji: '🍎', text: 'Jablká a mrkva prirodzene čistia zuby pri žuvaní.' },
  { emoji: '🔬', text: 'Preventívna prehliadka každých 6 mesiacov predchádza vážnym problémom.' },
  { emoji: '🌿', text: 'Ústna voda s fluoridom dopĺňa čistenie kefkou a chráni sklovinu.' },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function PatientHome() {
  const { colors, dark } = useAppTheme();
  const router = useRouter();
  const { profile, hasHealthPassport, loading: profileLoading, refetch: refetchProfile } = useProfile();
  const { appointments, loading: apptLoading, refetch: refetchAppts, updateStatus } = useAppointments('patient');
  const { unreadCount } = useNotifications();

  const [refreshing, setRefreshing]       = useState(false);
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const [dentalScore, setDentalScore]     = useState<number | null>(null);
  const [scoreLoading, setScoreLoading]   = useState(true);
  const [problemTeeth, setProblemTeeth]   = useState(0);
  const [ratingAppt, setRatingAppt]       = useState<typeof appointments[0] | null>(null);
  const [ratingVal, setRatingVal]         = useState(0);
  const [ratingText, setRatingText]       = useState('');
  const [ratingSaving, setRatingSaving]   = useState(false);
  const starScale = useRef(new Animated.Value(1)).current;
  const seenCompletedRef = useRef<Set<string> | null>(null);

  const loadUnreadMsgs = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { count, error } = await supabase.from('messages').select('*', { count: 'exact', head: true })
        .eq('receiver_id', user.id).eq('is_read', false);
      if (!error) setUnreadMsgCount(count ?? 0);
    } catch { /* silent — non-critical badge */ }
  }, []);

  const loadScore = useCallback(async () => {
    setScoreLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setScoreLoading(false); return; }
      const { data, error } = await supabase.from('dental_charts').select('tooth_number, status').eq('patient_id', user.id);
      if (!error && data) {
        setDentalScore(calcScore(data));
        const WARN = ['cavity', 'early_cavity', 'watch', 'treatment_needed', 'fracture', 'periodontal', 'mobility'];
        setProblemTeeth(data.filter(t => WARN.includes(t.status)).length);
      } else {
        setDentalScore(null);
      }
    } catch {
      setDentalScore(null);
    } finally {
      setScoreLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadScore(), loadUnreadMsgs()]);
      refetchProfile();
      refetchAppts();
    } catch { /* silent — pull-to-refresh error */ }
    setRefreshing(false);
  }, [refetchProfile, refetchAppts, loadScore, loadUnreadMsgs]);

  useFocusEffect(useCallback(() => {
    refetchProfile(); refetchAppts(); loadScore(); loadUnreadMsgs();
  }, [refetchProfile, refetchAppts, loadScore, loadUnreadMsgs]));

  useEffect(() => {
    if (apptLoading || appointments.length === 0) return;
    if (seenCompletedRef.current === null) {
      seenCompletedRef.current = new Set(appointments.filter(a => a.status === 'completed').map(a => a.id));
      return;
    }
    const fresh = appointments.find(a => a.status === 'completed' && !a.patient_rating && !seenCompletedRef.current!.has(a.id));
    if (fresh) { seenCompletedRef.current!.add(fresh.id); setRatingAppt(fresh); setRatingVal(0); setRatingText(''); }
  }, [appointments, apptLoading]);

  async function handleSubmitRating() {
    if (!ratingAppt || ratingVal === 0) return;
    setRatingSaving(true);
    const { error } = await supabase.from('appointments').update({ patient_rating: ratingVal, patient_review: ratingText.trim() || null }).eq('id', ratingAppt.id);
    setRatingSaving(false);
    if (error) { Alert.alert('Chyba', error.message); return; }
    setRatingAppt(null); refetchAppts();
  }

  function animateStar() {
    Animated.sequence([
      Animated.timing(starScale, { toValue: 1.25, duration: 90, useNativeDriver: true }),
      Animated.spring(starScale, { toValue: 1, useNativeDriver: true }),
    ]).start();
  }

  async function handleCancelAppointment(id: string) {
    Alert.alert('Zrušiť termín', 'Naozaj chcete zrušiť tento termín?', [
      { text: 'Nie', style: 'cancel' },
      { text: 'Áno, zrušiť', style: 'destructive', onPress: async () => { await updateStatus(id, 'cancelled'); refetchAppts(); } },
    ]);
  }

  const displayName = profile?.full_name?.split(' ')[0] ?? 'Pacient';
  const tip = DENTAL_TIPS[new Date().getDate() % DENTAL_TIPS.length];

  // Live queue state
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [queueTotal,    setQueueTotal]    = useState<number>(0);

  const { nextAppointment, pendingAppointments, recentAppointments, daysUntilNext, postVisitAppt, arrivedAppt } = useMemo(() => {
    const next = appointments.find(a => a.status === 'scheduled' && new Date(a.appointment_date) > new Date());
    const days = next
      ? Math.ceil((new Date(next.appointment_date).getTime() - Date.now()) / 86400000)
      : null;
    const twoDaysAgo = Date.now() - 48 * 60 * 60 * 1000;
    const postVisit  = appointments.find(a =>
      a.status === 'completed' &&
      new Date(a.appointment_date).getTime() > twoDaysAgo &&
      (a.care_instructions || a.doctor_notes)
    ) ?? null;
    const arrived = appointments.find(a => a.status === 'arrived' && isToday(a.appointment_date)) ?? null;
    return {
      nextAppointment:    next,
      daysUntilNext:      days,
      pendingAppointments: appointments.filter(a => a.status === 'pending'),
      recentAppointments:  appointments.filter(a => a.status === 'completed').slice(0, 4),
      postVisitAppt:      postVisit,
      arrivedAppt:        arrived,
    };
  }, [appointments]);

  // Live queue — načítaj pozíciu v rade
  useEffect(() => {
    if (!arrivedAppt) { setQueuePosition(null); return; }
    let cancelled = false;
    async function loadQueue() {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const { data, error } = await supabase
          .from('appointments')
          .select('id, arrived_at, clinic_status')
          .gte('appointment_date', `${today}T00:00:00`)
          .lte('appointment_date', `${today}T23:59:59`)
          .eq('status', 'arrived')
          .order('arrived_at');
        if (cancelled || error || !data) return;
        const queue   = data as any[];
        const myIdx   = queue.findIndex(a => a.id === arrivedAppt.id);
        setQueuePosition(myIdx >= 0 ? myIdx + 1 : null);
        setQueueTotal(queue.length);
      } catch {
        // silent — queue position is non-critical UI
      }
    }
    loadQueue();
    // Realtime update
    const ch = supabase.channel('queue-watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, loadQueue)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [arrivedAppt]);

  const scoreColor = dentalScore == null ? COLORS.sand
    : dentalScore >= 80 ? '#27AE60'
    : dentalScore >= 60 ? '#F4C95D'
    : '#E74C3C';

  const scoreLabel = dentalScore == null ? '?' : String(dentalScore);

  const bg = dark ? colors.bg2 : COLORS.bg2;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.esp }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.sand} colors={[COLORS.wal]} />}
      >

        {/* ── HERO ── */}
        <LinearGradient colors={GRADIENTS.hero as [string,string,...string[]]} style={styles.hero}>
          <SafeAreaView edges={['top']} style={styles.heroSafe}>

            {/* Decorative circles */}
            <View style={[styles.decCircle, { width: 180, height: 180, top: -60, right: -50, opacity: 0.06 }]} />
            <View style={[styles.decCircle, { width: 100, height: 100, top: 40, left: -30, opacity: 0.04 }]} />

            {/* Header row */}
            <View style={styles.heroHeader}>
              <TouchableOpacity onPress={() => router.push('/(patient)/notifications')} style={styles.iconBtn} activeOpacity={0.8}>
                <Ionicons name="notifications-outline" size={20} color={COLORS.cream} />
                {unreadCount > 0 && <View style={styles.notifDot} />}
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
              {unreadMsgCount > 0 && (
                <TouchableOpacity onPress={() => router.push('/(patient)/messages')} style={styles.iconBtn} activeOpacity={0.8}>
                  <Ionicons name="chatbubble-outline" size={20} color={COLORS.cream} />
                  <View style={styles.msgBadge}><Text style={styles.msgBadgeText}>{unreadMsgCount}</Text></View>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => router.push('/(patient)/profile')} activeOpacity={0.8}>
                <View style={styles.avatar}>
                  {profile?.avatar_url
                    ? <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} />
                    : <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>}
                </View>
              </TouchableOpacity>
            </View>

            {/* Gold accent line */}
            <View style={styles.goldLine} />

            {/* Greeting */}
            <Reanimated.View entering={FadeInDown.delay(100).duration(600)}>
              <Text style={styles.greeting}>{getGreeting()},</Text>
              <Text style={styles.name}>{displayName}.</Text>
              <Text style={styles.heroDate}>{formatDate()}</Text>
            </Reanimated.View>

            {/* Pending badge */}
            {pendingAppointments.length > 0 && (
              <Reanimated.View entering={FadeInDown.delay(200).duration(500)}>
                <TouchableOpacity style={styles.pendingPill} onPress={() => router.push('/(patient)/appointments')} activeOpacity={0.85}>
                  <Text style={styles.pendingPillText}>⏳ {pendingAppointments.length} žiadosť čaká na schválenie</Text>
                  <Ionicons name="chevron-forward" size={12} color={COLORS.cream} />
                </TouchableOpacity>
              </Reanimated.View>
            )}
          </SafeAreaView>
        </LinearGradient>

        {/* ── LIVE QUEUE WIDGET ── */}
        {arrivedAppt && queuePosition !== null && (
          <Reanimated.View entering={FadeInUp.delay(100).duration(500)} style={{ paddingHorizontal: SPACING.lg, marginTop: -20, marginBottom: 8 }}>
            <TouchableOpacity
              style={[styles.queueCard, { backgroundColor: dark ? '#0D3B1F' : '#EAFAF1', borderColor: dark ? '#27AE6044' : '#82E0AA' }]}
              onPress={() => router.push('/(patient)/appointments')} activeOpacity={0.9}
            >
              <View style={styles.queueLeft}>
                <Text style={styles.queueEmoji}>🏥</Text>
                <View>
                  <Text style={[styles.queueTitle, { color: dark ? '#58D68D' : '#1E8449' }]}>Ste v čakárni</Text>
                  <Text style={[styles.queueSub, { color: dark ? '#A9DFBF' : '#27AE60' }]}>
                    {arrivedAppt.service?.name ?? 'Termín'}
                  </Text>
                </View>
              </View>
              <View style={styles.queueRight}>
                <Text style={[styles.queueNum, { color: dark ? '#58D68D' : '#1E8449' }]}>{queuePosition}</Text>
                <Text style={[styles.queueDen, { color: dark ? '#A9DFBF' : '#27AE60' }]}>/ {queueTotal}</Text>
                <Text style={[styles.queueLabel, { color: dark ? '#A9DFBF' : '#27AE60' }]}>v rade</Text>
              </View>
            </TouchableOpacity>
          </Reanimated.View>
        )}

        {/* ── NEXT APPOINTMENT CARD (overlap) ── */}
        <Reanimated.View entering={FadeInUp.delay(150).duration(500)} style={styles.apptCardWrap}>
          {apptLoading ? (
            <View style={[styles.apptCard, { alignItems: 'center', justifyContent: 'center', paddingVertical: 28, backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <ActivityIndicator color={COLORS.wal} />
            </View>
          ) : nextAppointment ? (
            <TouchableOpacity
              style={[styles.apptCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}
              onPress={() => router.push('/(patient)/appointments')}
              activeOpacity={0.92}
            >
              <View style={styles.apptCardTop}>
                <View>
                  <Text style={styles.apptLabel}>TVOJ ĎALŠÍ TERMÍN</Text>
                  <Text style={[styles.apptTime, { color: colors.textPrimary }]}>
                    {new Date(nextAppointment.appointment_date).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <Text style={styles.apptDate}>{formatApptDate(nextAppointment.appointment_date)}</Text>
                  {daysUntilNext !== null && (
                    <View style={[styles.countdownPill, {
                      backgroundColor: daysUntilNext === 0 ? '#E74C3C' : daysUntilNext <= 3 ? '#E67E22' : '#1E8449',
                    }]}>
                      <Text style={styles.countdownText}>
                        {daysUntilNext === 0 ? 'DNES' : daysUntilNext === 1 ? 'o 1 deň' : daysUntilNext < 5 ? `o ${daysUntilNext} dni` : `o ${daysUntilNext} dní`}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.apptRight}>
                  <View style={[styles.apptServiceCircle, { backgroundColor: colors.bg2 }]}>
                    <Text style={{ fontSize: 22 }}>{nextAppointment.service?.emoji ?? '🦷'}</Text>
                  </View>
                  <StatusPill status="scheduled" size="sm" style={{ marginTop: 6 }} />
                </View>
              </View>
              {nextAppointment.service && (
                <View style={[styles.apptService, { backgroundColor: colors.bg2 }]}>
                  <Text style={[styles.apptServiceName, { color: colors.textPrimary }]}>{nextAppointment.service.name}</Text>
                </View>
              )}
              <View style={styles.apptActions}>
                <TouchableOpacity style={[styles.apptBtnSecondary, { borderColor: colors.bg3 }]} onPress={() => router.push('/(patient)/appointments')} activeOpacity={0.8}>
                  <Text style={[styles.apptBtnSecondaryText, { color: colors.textSecondary }]}>Detail</Text>
                </TouchableOpacity>
                <LinearGradient colors={GRADIENTS.gold as [string,string,...string[]]} style={styles.apptBtnPrimary}>
                  <TouchableOpacity onPress={() => router.push('/(patient)/book-appointment')} activeOpacity={0.85} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={styles.apptBtnPrimaryText}>+ Rezervovať</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.apptCardEmpty} onPress={() => router.push('/(patient)/book-appointment')} activeOpacity={0.88}>
              <LinearGradient colors={GRADIENTS.cream as [string,string,...string[]]} style={styles.apptCardEmptyGrad}>
                <View style={styles.apptEmptyIcon}>
                  <Ionicons name="calendar-outline" size={28} color={COLORS.wal} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.apptEmptyTitle}>Žiadny termín</Text>
                  <Text style={styles.apptEmptySub}>Rezervujte si prvý termín →</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.wal} />
              </LinearGradient>
            </TouchableOpacity>
          )}
        </Reanimated.View>

        {/* ── QUICK ACTIONS ── */}
        <Reanimated.View entering={FadeInUp.delay(250).duration(500)} style={styles.quickSection}>
          <Text style={[styles.quickLabel, { color: colors.textPrimary }]}>Rýchle akcie</Text>

          {/* 🚨 URGENTNÝ TERMÍN */}
          <TouchableOpacity
            style={[styles.urgentBtn, { backgroundColor: dark ? '#4A1010' : '#FDEDEC', borderColor: dark ? '#E74C3C44' : '#F1948A' }]}
            onPress={() => router.push({ pathname: '/(patient)/book-appointment', params: { urgent: '1' } })}
            activeOpacity={0.85}
          >
            <View style={[styles.urgentIconWrap, { backgroundColor: dark ? '#7B1A1A' : '#FADBD8' }]}>
              <Text style={{ fontSize: 20 }}>🦷</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.urgentTitle, { color: dark ? '#F1948A' : '#C0392B' }]}>Bolí ma zub / Urgentný termín</Text>
              <Text style={[styles.urgentSub, { color: dark ? '#E57373' : '#E74C3C' }]}>Prednostná rezervácia — čo najskôr</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={dark ? '#F1948A' : '#E74C3C'} />
          </TouchableOpacity>

          <View style={styles.quickRow}>
            {([
              { icon: 'calendar', label: 'Rezervovať', route: '/(patient)/book-appointment', gold: true },
              { icon: 'time-outline', label: 'Záznamy', route: '/(patient)/appointments', gold: false },
              { icon: 'chatbubble-outline', label: 'Správy', route: '/(patient)/messages', gold: false },
              { icon: 'person-outline', label: 'Doktor', route: '/(patient)/moj-zubar', gold: false },
            ] as { icon: any; label: string; route: any; gold: boolean }[]).map((item) => (
              <TouchableOpacity
                key={item.label}
                style={[styles.quickBtn, item.gold && styles.quickBtnGold, !item.gold && { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}
                onPress={() => router.push(item.route)}
                activeOpacity={0.8}
              >
                <View style={[styles.quickIconWrap, item.gold && styles.quickIconWrapGold, !item.gold && { backgroundColor: colors.bg2 }]}>
                  <Ionicons name={item.icon} size={28} color={item.gold ? '#1A110A' : COLORS.gold} />
                </View>
                <Text style={[styles.quickBtnLabel, item.gold && styles.quickBtnLabelGold, !item.gold && { color: colors.textSecondary }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Reanimated.View>

        {/* ── DENTAL TWIN BANNER ── */}
        <Reanimated.View entering={FadeInUp.delay(310).duration(500)} style={{ paddingHorizontal: SPACING.lg, marginBottom: 14 }}>
          <TouchableOpacity
            style={styles.twinBanner}
            onPress={() => router.push('/(patient)/dental-twin')}
            activeOpacity={0.9}
          >
            <LinearGradient colors={['#1A1209', '#2C1F14']} style={styles.twinGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <View style={styles.twinLeft}>
                <Text style={styles.twinEmoji}>🦷</Text>
                <View>
                  <Text style={styles.twinLabel}>DENTAL TWIN</Text>
                  <Text style={styles.twinTitle}>Digitálny dvojník chrupu</Text>
                  <Text style={styles.twinSub}>5-ročná predikcia vývoja · Cenové porovnanie</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(201,168,76,0.7)" />
            </LinearGradient>
          </TouchableOpacity>
        </Reanimated.View>

        {/* ── POST-VISIT KARTA ── */}
        {postVisitAppt && (
          <Reanimated.View entering={FadeInUp.delay(290).duration(500)} style={{ paddingHorizontal: SPACING.lg, marginBottom: 12 }}>
            <TouchableOpacity
              style={[styles.postVisitCard, { backgroundColor: colors.cardBg, borderColor: dark ? '#27AE6044' : '#A9DFBF' }]}
              onPress={() => router.push('/(patient)/appointments')}
              activeOpacity={0.88}
            >
              <View style={[styles.postVisitIcon, { backgroundColor: dark ? '#0D3B1F' : '#EAFAF1' }]}>
                <Text style={{ fontSize: 22 }}>🦷</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.postVisitTitle, { color: colors.textPrimary }]}>Pokyny po ošetrení</Text>
                <Text style={[styles.postVisitService, { color: colors.textSecondary }]}>
                  {postVisitAppt.service?.name ?? 'Ošetrenie'} · dnes/včera
                </Text>
                {postVisitAppt.care_instructions ? (
                  <Text style={[styles.postVisitText, { color: colors.textSecondary }]} numberOfLines={2}>
                    {postVisitAppt.care_instructions}
                  </Text>
                ) : postVisitAppt.doctor_notes ? (
                  <Text style={[styles.postVisitText, { color: colors.textSecondary }]} numberOfLines={2}>
                    {postVisitAppt.doctor_notes}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color={dark ? '#27AE60' : '#1E8449'} />
            </TouchableOpacity>
          </Reanimated.View>
        )}

        {/* ── ODPORÚČANIA ── */}
        {problemTeeth > 0 && (
          <Reanimated.View entering={FadeInUp.delay(310).duration(500)} style={{ paddingHorizontal: SPACING.lg, marginBottom: 10 }}>
            <TouchableOpacity
              style={[styles.warnCard, { backgroundColor: dark ? '#2D2200' : '#FEF9E7', borderColor: dark ? '#E67E2233' : '#F9E79F' }]}
              onPress={() => router.push('/(patient)/score')}
              activeOpacity={0.85}
            >
              <View style={[styles.warnIconWrap, { backgroundColor: dark ? '#3D1A00' : '#FDE8C0' }]}>
                <Ionicons name="warning" size={20} color="#E67E22" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.warnTitle, { color: dark ? '#F0A030' : '#7D6608' }]}>Odporúčame návštevu</Text>
                <Text style={[styles.warnSub, { color: dark ? '#C09028' : '#9A7D0A' }]}>
                  Máte {problemTeeth} {problemTeeth === 1 ? 'zub' : problemTeeth < 5 ? 'zuby' : 'zubov'} vyžadujúcich pozornosť
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={dark ? '#F0A030' : '#E67E22'} />
            </TouchableOpacity>
          </Reanimated.View>
        )}

        {/* ── HEALTH SCORE ── */}
        <Reanimated.View entering={FadeInUp.delay(350).duration(500)} style={styles.scoreSection}>
          <LinearGradient colors={GRADIENTS.hero as [string,string,...string[]]} style={styles.scoreCard}>
            <View style={styles.scoreLeft}>
              <Text style={styles.scoreSectionLabel}>DENTÁLNE SKÓRE</Text>
              <Text style={styles.scoreTitle}>
                {dentalScore == null ? 'Skóre nedostupné'
                  : dentalScore >= 80 ? '🌟 Výborný chrup!'
                  : dentalScore >= 60 ? '👍 Dobrý stav'
                  : dentalScore >= 40 ? '⚠️ Priemerný stav'
                  : '🔴 Vyžaduje pozornosť'}
              </Text>
              <Text style={styles.scoreSub}>
                {dentalScore == null
                  ? 'Navštívte doktora pre vyplnenie zubnej karty'
                  : 'Kliknite pre detailnú analýzu chrupu'}
              </Text>
              <TouchableOpacity onPress={() => router.push('/(patient)/score')} activeOpacity={0.85}>
                <LinearGradient colors={GRADIENTS.gold as [string,string,...string[]]} style={styles.scoreBtn}>
                  <Text style={styles.scoreBtnText}>Zobraziť analýzu</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => router.push('/(patient)/score')} activeOpacity={0.85}>
              {scoreLoading
                ? <ActivityIndicator color={COLORS.gold} size="large" />
                : <ProgressRing
                    value={dentalScore ?? 0}
                    size="lg"
                    color={scoreColor}
                    trackColor="rgba(255,255,255,0.1)"
                    label="/100"
                    style={{ opacity: dentalScore == null ? 0.4 : 1 }}
                  />
              }
            </TouchableOpacity>
          </LinearGradient>
        </Reanimated.View>

        {/* ── RECENT ACTIVITY ── */}
        {recentAppointments.length > 0 && (
          <Reanimated.View entering={FadeInUp.delay(400).duration(500)}>
            <SectionHeader
              title="Posledné návštevy"
              action={{ text: 'Všetky →', onPress: () => router.push('/(patient)/appointments') }}
              style={{ marginTop: SPACING.sm }}
            />
            <View style={{ paddingHorizontal: SPACING.lg, gap: SPACING.sm }}>
              {recentAppointments.map((appt, i) => (
                <Reanimated.View key={appt.id} entering={FadeInUp.delay(420 + i * 60).duration(400)}>
                  <View style={styles.timelineItem}>
                    <View style={styles.timelineDot} />
                    {i < recentAppointments.length - 1 && <View style={[styles.timelineLine, { backgroundColor: colors.bg3 }]} />}
                    <View style={[styles.timelineCard, SHADOWS.sm, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                      <View style={styles.timelineCardRow}>
                        <Text style={{ fontSize: 20, marginRight: 10 }}>{appt.service?.emoji ?? '🦷'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.timelineService, { color: colors.textPrimary }]}>{appt.service?.name ?? 'Termín'}</Text>
                          <Text style={[styles.timelineDate, { color: colors.textSecondary }]}>{formatApptDate(appt.appointment_date)}</Text>
                        </View>
                        {appt.patient_rating ? (
                          <View style={styles.ratingMini}>
                            <Ionicons name="star" size={10} color="#F39C12" />
                            <Text style={styles.ratingMiniText}>{appt.patient_rating}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </View>
                </Reanimated.View>
              ))}
            </View>
          </Reanimated.View>
        )}

        {/* ── DENTAL TIP ── */}
        <Reanimated.View entering={FadeInUp.delay(500).duration(400)} style={{ paddingHorizontal: SPACING.xl, marginTop: SPACING.xl }}>
          <View style={styles.tipCard}>
            <View style={styles.tipIconWrap}>
              <Text style={styles.tipEmoji}>{tip.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.tipLabel}>TIP DŇA</Text>
              <Text style={styles.tipText}>{tip.text}</Text>
            </View>
          </View>
        </Reanimated.View>

        {/* ── OPENING HOURS ── */}
        <Reanimated.View entering={FadeInUp.delay(550).duration(400)}>
          <SectionHeader title="Ordinačné hodiny" style={{ marginTop: SPACING.lg }} />
          <OpeningHoursCompact />
        </Reanimated.View>

      </ScrollView>

      {/* ── Rating Modal ── */}
      <Modal visible={!!ratingAppt} transparent animationType="slide" onRequestClose={() => setRatingAppt(null)}>
        <View style={styles.ratingOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setRatingAppt(null)} />
          <View style={[styles.ratingSheet, { backgroundColor: colors.cardBg }]}>
            <View style={[styles.ratingHandle, { backgroundColor: colors.bg3 }]} />
            <Text style={[styles.ratingTitle, { color: colors.textPrimary }]}>🦷 Ohodnoť návštevu</Text>
            <Text style={[styles.ratingSubtitle, { color: colors.textSecondary }]}>
              {ratingAppt?.service?.emoji ?? '🦷'} {ratingAppt?.service?.name ?? 'Termín'} ·{' '}
              {ratingAppt ? new Date(ratingAppt.appointment_date).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' }) : ''}
            </Text>
            <Animated.View style={[styles.starsRow, { transform: [{ scale: starScale }] }]}>
              {[1, 2, 3, 4, 5].map(n => (
                <TouchableOpacity key={n} onPress={() => { setRatingVal(n); animateStar(); }} activeOpacity={0.7}>
                  <Ionicons name={n <= ratingVal ? 'star' : 'star-outline'} size={42} color={n <= ratingVal ? '#F39C12' : '#ddd'} />
                </TouchableOpacity>
              ))}
            </Animated.View>
            {ratingVal > 0 && <Text style={styles.ratingLabel}>{['', 'Veľmi zlý 😞', 'Zlý 😐', 'Dobrý 🙂', 'Veľmi dobrý 😊', 'Výborný! 🤩'][ratingVal]}</Text>}
            <TextInput
              style={[styles.ratingInput, { borderColor: colors.bg3, color: colors.textPrimary, backgroundColor: colors.bg2 }]}
              placeholder="Pridaj komentár (voliteľné)..."
              placeholderTextColor={colors.textSecondary}
              value={ratingText}
              onChangeText={setRatingText}
              multiline numberOfLines={3} textAlignVertical="top"
            />
            <View style={styles.ratingActions}>
              <TouchableOpacity style={[styles.ratingBtnSkip, { borderColor: colors.bg3 }]} onPress={() => setRatingAppt(null)} activeOpacity={0.8}>
                <Text style={[styles.ratingBtnSkipText, { color: colors.textSecondary }]}>Neskôr</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ratingBtnSubmit, (ratingSaving || ratingVal === 0) && { opacity: 0.45 }]}
                onPress={handleSubmitRating} disabled={ratingSaving || ratingVal === 0} activeOpacity={0.85}
              >
                {ratingSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.ratingBtnSubmitText}>Odoslať ★</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // Hero
  hero: {
    minHeight: 220,
    paddingBottom: 44,
  },
  heroSafe: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  decCircle: {
    position: 'absolute',
    borderRadius: 9999,
    backgroundColor: '#C9A84C',
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  notifDot: {
    position: 'absolute', top: 6, right: 6,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#E74C3C',
    borderWidth: 1.5, borderColor: COLORS.esp,
  },
  msgBadge: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: '#4A90E2', borderRadius: 9999,
    minWidth: 14, height: 14,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  msgBadgeText: { fontSize: 7, fontFamily: 'DMSans_500Medium', color: '#fff' },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.wal,
    borderWidth: 2, borderColor: COLORS.gold,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 44, height: 44, borderRadius: 22 },
  avatarText: { fontSize: 18, fontFamily: 'PlayfairDisplay_700Bold', color: COLORS.cream },
  goldLine: {
    height: 1, backgroundColor: COLORS.gold, opacity: 0.4,
    marginBottom: SPACING.lg,
  },
  greeting: {
    ...TYPO.heroItalic,
    color: COLORS.sand,
    fontSize: 20,
    marginBottom: 2,
  },
  name: {
    ...TYPO.hero,
    color: '#FAF6F0',
    marginBottom: 6,
  },
  heroDate: {
    ...TYPO.caption,
    color: COLORS.sand,
    opacity: 0.7,
    textTransform: 'capitalize',
    marginBottom: SPACING.lg,
  },
  pendingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(244,201,93,0.15)',
    borderRadius: RADII.full,
    paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(244,201,93,0.3)',
    alignSelf: 'flex-start',
  },
  pendingPillText: {
    ...TYPO.caption,
    color: COLORS.cream,
    fontSize: 11,
  },

  // Next appointment card
  apptCardWrap: {
    marginHorizontal: SPACING.lg,
    marginTop: -36,
    marginBottom: SPACING.xl,
  },
  apptCard: {
    backgroundColor: '#FFFDF9',
    borderRadius: RADII.xl,
    padding: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.bg3,
    ...SHADOWS.card,
  },
  apptCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  apptLabel: {
    ...TYPO.overline,
    color: COLORS.wal,
    marginBottom: SPACING.xs,
  },
  apptTime: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 32,
    color: COLORS.esp,
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  apptDate: {
    ...TYPO.caption,
    color: COLORS.wal,
    marginTop: 2,
  },
  countdownPill: {
    alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6,
  },
  countdownText: { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  warnCard:        { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1.5, padding: 14 },
  warnIconWrap:    { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  warnTitle:       { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  queueCard:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, borderWidth: 1.5, padding: 14 },
  queueLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  queueEmoji: { fontSize: 28 },
  queueTitle: { fontSize: 14, fontFamily: 'DMSans_500Medium', marginBottom: 2 },
  queueSub:   { fontSize: 12 },
  queueRight: { alignItems: 'center' },
  queueNum:   { fontSize: 32, fontFamily: 'PlayfairDisplay_700Bold', lineHeight: 36 },
  queueDen:   { fontSize: 14, fontFamily: 'DMSans_500Medium' },
  queueLabel: { fontSize: 10, letterSpacing: 0.5 },
  twinBanner: { borderRadius: 16, overflow: 'hidden' },
  twinGrad:   { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  twinLeft:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  twinEmoji:  { fontSize: 32 },
  twinLabel:  { fontSize: 9, letterSpacing: 2, color: 'rgba(201,168,76,0.7)', fontFamily: 'DMSans_500Medium', marginBottom: 2 },
  twinTitle:  { fontSize: 15, fontFamily: 'PlayfairDisplay_700Bold', color: '#FAF6F0', marginBottom: 2 },
  twinSub:    { fontSize: 11, color: 'rgba(196,168,130,0.6)', fontFamily: 'DMSans_400Regular' },
  urgentBtn:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1.5, padding: 14, marginBottom: 10 },
  urgentIconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  urgentTitle:    { fontSize: 14, fontFamily: 'DMSans_500Medium', marginBottom: 2 },
  urgentSub:      { fontSize: 11 },
  postVisitCard:   { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1.5, padding: 14 },
  postVisitIcon:   { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  postVisitTitle:  { fontSize: 13, fontWeight: '700', marginBottom: 1 },
  postVisitService:{ fontSize: 11, marginBottom: 3 },
  postVisitText:   { fontSize: 12, lineHeight: 17 },
  warnSub:      { fontSize: 11 },
  apptRight: {
    alignItems: 'center',
    marginLeft: 'auto',
  },
  apptServiceCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: COLORS.bg2,
    alignItems: 'center', justifyContent: 'center',
  },
  apptService: {
    backgroundColor: COLORS.bg2,
    borderRadius: RADII.sm,
    paddingHorizontal: 10, paddingVertical: 6,
    marginBottom: SPACING.md,
  },
  apptServiceName: {
    ...TYPO.bodyMedium,
    color: COLORS.esp,
  },
  apptActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  apptBtnSecondary: {
    flex: 1, paddingVertical: 12,
    borderRadius: RADII.md,
    borderWidth: 1.5, borderColor: COLORS.bg3,
    alignItems: 'center', justifyContent: 'center',
  },
  apptBtnSecondaryText: {
    ...TYPO.bodyMedium,
    color: COLORS.wal,
    fontSize: 13,
  },
  apptBtnPrimary: {
    flex: 1, height: 44,
    borderRadius: RADII.md,
    overflow: 'hidden',
  },
  apptBtnPrimaryText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13,
    color: '#1A110A',
  },
  apptCardEmpty: {
    borderRadius: RADII.xl,
    overflow: 'hidden',
    ...SHADOWS.md,
  },
  apptCardEmptyGrad: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    padding: SPACING.lg,
  },
  apptEmptyIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  apptEmptyTitle: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 16, color: COLORS.esp, marginBottom: 2,
  },
  apptEmptySub: {
    ...TYPO.caption,
    color: COLORS.wal,
  },

  // Quick actions
  quickSection: {
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.xl,
  },
  quickLabel: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 18, color: COLORS.esp,
    marginBottom: SPACING.md,
  },
  quickRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  quickBtn: {
    flex: 1, alignItems: 'center', paddingVertical: SPACING.md,
    borderRadius: RADII.lg,
    backgroundColor: '#FFFDF9',
    borderWidth: 1, borderColor: COLORS.bg3,
    ...SHADOWS.card,
    gap: 6,
  },
  quickBtnGold: {
    backgroundColor: COLORS.gold,
    borderColor: COLORS.goldDark,
  },
  quickIconWrap: {
    width: 48, height: 48, borderRadius: RADII.md,
    backgroundColor: COLORS.bg2,
    alignItems: 'center', justifyContent: 'center',
  },
  quickIconWrapGold: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  quickBtnLabel: {
    ...TYPO.caption, fontSize: 10, color: COLORS.wal, textAlign: 'center',
  },
  quickBtnLabelGold: {
    color: '#1A110A',
  },

  // Score
  scoreSection: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
  },
  scoreCard: {
    borderRadius: RADII.xl,
    padding: SPACING.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
    ...SHADOWS.lg,
  },
  scoreLeft: { flex: 1 },
  scoreSectionLabel: {
    ...TYPO.overline,
    color: COLORS.sand,
    marginBottom: SPACING.sm,
  },
  scoreTitle: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 18, color: '#FAF6F0',
    lineHeight: 24, marginBottom: SPACING.sm,
  },
  scoreSub: {
    ...TYPO.caption,
    color: COLORS.sand,
    opacity: 0.7,
    marginBottom: SPACING.lg,
    lineHeight: 16,
  },
  scoreBtn: {
    paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: RADII.md, alignSelf: 'flex-start',
  },
  scoreBtnText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 12, color: '#1A110A',
  },

  // Section headers
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, marginTop: SPACING.xl, marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 18, color: COLORS.esp,
  },
  sectionLink: {
    ...TYPO.caption,
    color: COLORS.wal,
  },

  // Timeline
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    position: 'relative',
  },
  timelineDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: COLORS.gold,
    marginTop: 14,
    zIndex: 1,
  },
  timelineLine: {
    position: 'absolute',
    left: 4, top: 24,
    width: 2, height: '100%',
    backgroundColor: COLORS.bg3,
  },
  timelineCard: {
    flex: 1,
    backgroundColor: '#FFFDF9',
    borderRadius: RADII.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.bg3,
    ...SHADOWS.sm,
  },
  timelineCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timelineService: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 13, color: COLORS.esp, marginBottom: 2,
  },
  timelineDate: {
    ...TYPO.caption,
    color: COLORS.wal,
  },
  ratingMini: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: '#FEF9E7', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 3,
  },
  ratingMiniText: {
    fontSize: 10, fontFamily: 'DMSans_500Medium', color: '#F39C12',
  },

  // Tip card
  tipCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    borderRadius: RADII.lg, padding: SPACING.lg,
    backgroundColor: COLORS.infoBg,
    borderWidth: 1, borderColor: '#AED6F1',
    ...SHADOWS.sm,
  },
  tipIconWrap: {
    width: 44, height: 44, borderRadius: RADII.md,
    backgroundColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  tipEmoji:  { fontSize: 22 },
  tipLabel:  { ...TYPO.label, color: COLORS.info, marginBottom: 4 },
  tipText:   { ...TYPO.bodySm, color: COLORS.info, lineHeight: 18 },

  // FAB
  fab: {
    position: 'absolute', bottom: 90, right: 20,
    width: 56, height: 56, borderRadius: 28,
    overflow: 'hidden',
    ...SHADOWS.gold,
  },
  fabGrad: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },

  // Rating modal
  ratingOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  ratingSheet:       { backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 24, paddingBottom: 44 },
  ratingHandle:      { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.bg3, alignSelf: 'center', marginBottom: 20 },
  ratingTitle:       { fontSize: 22, fontFamily: 'PlayfairDisplay_700Bold', color: COLORS.esp, textAlign: 'center', marginBottom: 4 },
  ratingSubtitle:    { fontSize: 13, color: COLORS.wal, textAlign: 'center', marginBottom: 20, fontFamily: 'DMSans_400Regular' },
  starsRow:          { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 8 },
  ratingLabel:       { fontSize: 15, fontFamily: 'DMSans_500Medium', color: '#F39C12', textAlign: 'center', marginBottom: 16 },
  ratingInput:       { borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: 12, padding: 12, fontSize: 13, color: COLORS.esp, minHeight: 76, backgroundColor: COLORS.bg2, marginBottom: 20, fontFamily: 'DMSans_400Regular' },
  ratingActions:     { flexDirection: 'row', gap: 10 },
  ratingBtnSkip:     { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.bg3 },
  ratingBtnSkipText: { fontSize: 14, fontFamily: 'DMSans_500Medium', color: COLORS.wal },
  ratingBtnSubmit:   { flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#F39C12', justifyContent: 'center' },
  ratingBtnSubmitText: { fontSize: 14, fontFamily: 'DMSans_500Medium', color: '#fff' },
});
