import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SIZES } from '../../styles/theme';
import { useProfile } from '../../hooks/useProfile';
import { useAppointments } from '../../hooks/useAppointments';
import { useNotifications } from '../../hooks/useNotifications';
import { supabase } from '../../supabase';
import UpcomingAppointmentCard from './components/UpcomingAppointmentCard';
import QuickActionsGrid from './components/QuickActionsGrid';

// ─── Ordinačné hodiny widget ──────────────────────────────────────────────────
const OH_DAYS = ['','Pon','Ut','St','Št','Pi','So','Ne'];
type OHRow = { day_of_week: number; open_time: string|null; close_time: string|null; is_closed: boolean; note: string|null };

function OpeningHoursWidget() {
  const [hours, setHours] = React.useState<OHRow[]>([]);
  const todayNum = new Date().getDay() === 0 ? 7 : new Date().getDay(); // 1=Pon..7=Ned

  React.useEffect(() => {
    supabase.from('opening_hours')
      .select('day_of_week,open_time,close_time,is_closed,note')
      .order('day_of_week')
      .then(({ data }) => { if (data) setHours(data as OHRow[]); });
  }, []);

  if (hours.length === 0) return null;

  const todayRow = hours.find(h => h.day_of_week === todayNum);
  const isOpenToday = todayRow && !todayRow.is_closed;

  return (
    <View style={ohStyles.card}>
      {/* Dnešný stav */}
      <View style={[ohStyles.todayBanner, isOpenToday ? ohStyles.todayOpen : ohStyles.todayClosed]}>
        <View style={[ohStyles.dot, {backgroundColor: isOpenToday ? '#2ECC71' : '#E74C3C'}]}/>
        <Text style={[ohStyles.todayStatus, {color: isOpenToday ? '#1E8449' : '#922B21'}]}>
          {isOpenToday ? 'Dnes otvorené' : 'Dnes zatvorené'}
        </Text>
        {isOpenToday && todayRow && (
          <Text style={ohStyles.todayTime}>{todayRow.open_time?.slice(0,5)} – {todayRow.close_time?.slice(0,5)}</Text>
        )}
      </View>
      {/* Celý týždeň */}
      {hours.map(h => (
        <View key={h.day_of_week} style={[ohStyles.row, h.day_of_week === todayNum && ohStyles.rowToday]}>
          <Text style={[ohStyles.dayLabel, h.day_of_week === todayNum && ohStyles.dayLabelToday]}>
            {OH_DAYS[h.day_of_week]}
          </Text>
          {h.is_closed
            ? <Text style={ohStyles.closed}>Zatvorené</Text>
            : <Text style={ohStyles.time}>{h.open_time?.slice(0,5)} – {h.close_time?.slice(0,5)}</Text>
          }
          {h.note ? <Text style={ohStyles.note} numberOfLines={1}>{h.note}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const ohStyles = StyleSheet.create({
  card:        { backgroundColor:'#fff', borderRadius:SIZES.radius, marginHorizontal:SIZES.padding, marginBottom:14, borderWidth:1, borderColor:COLORS.bg3, overflow:'hidden' },
  todayBanner: { flexDirection:'row', alignItems:'center', gap:8, paddingHorizontal:14, paddingVertical:11, borderBottomWidth:1, borderBottomColor:COLORS.bg3 },
  todayOpen:   { backgroundColor:'#EAFAF1' },
  todayClosed: { backgroundColor:'#FDEDEC' },
  dot:         { width:8, height:8, borderRadius:4 },
  todayStatus: { fontSize:13, fontWeight:'700', flex:1 },
  todayTime:   { fontSize:12, fontWeight:'600', color:COLORS.esp },
  row:         { flexDirection:'row', alignItems:'center', paddingHorizontal:14, paddingVertical:9, borderBottomWidth:1, borderBottomColor:COLORS.bg3 },
  rowToday:    { backgroundColor:COLORS.bg2 },
  dayLabel:    { width:28, fontSize:11, fontWeight:'600', color:COLORS.wal },
  dayLabelToday:{ color:COLORS.esp, fontWeight:'800' },
  time:        { flex:1, fontSize:12, color:COLORS.esp, fontWeight:'500' },
  closed:      { flex:1, fontSize:12, color:'#bbb', fontStyle:'italic' },
  note:        { fontSize:10, color:COLORS.wal, fontStyle:'italic', maxWidth:120 },
});

type ToothStatus = 'healthy'|'cavity'|'filled'|'crown'|'extracted'|'missing'|'root_canal';
const DEDUCTIONS: Partial<Record<ToothStatus,number>> = { cavity:10, root_canal:8, extracted:12, missing:8 };
function getWeight(n:number){const p=n%10;if(p===6||p===7)return 3;if(p===4||p===5)return 2;if(p===3)return 1.5;if(p===8)return 0.5;return 1;}
function calcScore(teeth:{tooth_number:number;status:string}[]){
  if(!teeth.length) return 70;
  let ded=0;let healthy=0;
  teeth.forEach(t=>{const d=DEDUCTIONS[t.status as ToothStatus]??0;ded+=d*getWeight(t.tooth_number);if(t.status==='healthy')healthy++;});
  return Math.max(0,Math.min(100,Math.round(100-ded+Math.min(10,healthy*0.5))));
}

// Dátum formátuje UpcomingAppointmentCard interne

export default function PatientHome() {
  const router = useRouter();
  const { profile, hasHealthPassport, loading: profileLoading, refetch: refetchProfile } = useProfile();
  const { appointments, loading: apptLoading, refetch: refetchAppts, updateStatus } = useAppointments('patient');
  const { unreadCount } = useNotifications();
  const [refreshing, setRefreshing]       = useState(false);
  const [dentalScore, setDentalScore]     = useState<number|null>(null);
  const [scoreLoading, setScoreLoading]   = useState(true);

  const loadScore = useCallback(async () => {
    setScoreLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setScoreLoading(false); return; }
    const { data } = await supabase.from('dental_charts').select('tooth_number, status').eq('patient_id', user.id);
    setDentalScore(data ? calcScore(data) : null);
    setScoreLoading(false);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    refetchProfile();
    refetchAppts();
    loadScore();
    setTimeout(() => setRefreshing(false), 800);
  }, [refetchProfile, refetchAppts, loadScore]);

  useFocusEffect(useCallback(() => {
    refetchProfile();
    refetchAppts();
    loadScore();
  }, [refetchProfile, refetchAppts, loadScore]));

  async function handleCancelAppointment(id: string) {
    Alert.alert('Zrušiť termín', 'Naozaj chcete zrušiť tento termín?', [
      { text: 'Nie', style: 'cancel' },
      { text: 'Áno, zrušiť', style: 'destructive', onPress: async () => {
        await updateStatus(id, 'cancelled');
        refetchAppts();
      }},
    ]);
  }

  const displayName = profile?.full_name ?? 'Pacient';

  // Kompletnosť profilu
  const profileCompleteness = useMemo(() => {
    const items = [
      { label: 'Telefónne číslo',    done: !!profile?.phone_number,  points: 25, route: '/(patient)/profile'        as const },
      { label: 'Zdravotný dotazník', done: hasHealthPassport,         points: 35, route: '/(patient)/health-passport' as const },
      { label: 'Zubná karta',        done: dentalScore !== null,      points: 25, route: '/(patient)/score'          as const },
      { label: 'Prvý termín',        done: appointments.length > 0,  points: 15, route: '/(patient)/book-appointment' as const },
    ];
    const pct = items.reduce((s, i) => s + (i.done ? i.points : 0), 0);
    const first = items.find(i => !i.done) ?? null;
    return { items, pct, first };
  }, [profile, hasHealthPassport, dentalScore, appointments]);

  const { reminderAppt, reminderIsToday, nextAppointment } = useMemo(() => {
    const now      = new Date();
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    const reminder = appointments.find((a) => {
      if (a.status !== 'scheduled') return false;
      const d = new Date(a.appointment_date);
      return d.toDateString() === now.toDateString() || d.toDateString() === tomorrow.toDateString();
    });
    return {
      reminderAppt:    reminder,
      reminderIsToday: reminder
        ? new Date(reminder.appointment_date).toDateString() === now.toDateString()
        : false,
      nextAppointment: appointments.find(
        (a) => a.status === 'scheduled' && new Date(a.appointment_date) > now
      ),
    };
  }, [appointments]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Hlavička ── */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>VITAJ SPÄŤ</Text>
          {profileLoading
            ? <ActivityIndicator color={COLORS.sand} size="small" style={{ alignSelf: 'flex-start', marginTop: 4 }} />
            : <Text style={styles.headerTitle}>Ahoj, {displayName}! 👋</Text>}
        </View>
        {/* Zvonček */}
        <TouchableOpacity style={styles.bellBtn} onPress={() => router.push('/(patient)/notifications')} activeOpacity={0.8}>
          <Ionicons name="notifications-outline" size={20} color={COLORS.cream} />
          {unreadCount > 0 && (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.avatar} onPress={() => router.push('/(patient)/profile')} activeOpacity={0.8}>
          <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.wal} colors={[COLORS.wal]} />}>

        {/* ── 🔔 Reminder Banner ── */}
        {!apptLoading && reminderAppt && (
          <TouchableOpacity
            style={[styles.reminderBanner, reminderIsToday ? styles.reminderToday : styles.reminderTomorrow]}
            onPress={() => router.push('/(patient)/appointments')}
            activeOpacity={0.88}
          >
            <Text style={styles.reminderIcon}>{reminderIsToday ? '🔔' : '📅'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.reminderTitle, reminderIsToday && styles.reminderTodayText]}>
                {reminderIsToday ? 'Dnes máš termín!' : 'Zajtra máš termín!'}
              </Text>
              <Text style={styles.reminderSub}>
                {new Date(reminderAppt.appointment_date).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' })}
                {' · '}
                {reminderAppt.doctor?.full_name ?? 'MDDr. Loderer'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={reminderIsToday ? '#7D2A1A' : '#1A5276'} />
          </TouchableOpacity>
        )}

        {/* ── ⚠️ Health Passport Banner ── */}
        {!profileLoading && !hasHealthPassport && (
          <TouchableOpacity style={styles.hpBanner}
            onPress={() => router.push('/(patient)/health-passport')} activeOpacity={0.88}>
            <View style={styles.hpBannerLeft}>
              <Text style={styles.hpIcon}>⚠️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.hpTitle}>Vyplňte zdravotný dotazník</Text>
                <Text style={styles.hpSub}>Pomôže nám poskytovať vám bezpečnejšiu starostlivosť.</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#8C2A18" />
          </TouchableOpacity>
        )}

        {/* ── Najbližší termín ── */}
        <View style={[styles.body, styles.bodyRow]}>
          <Text style={styles.sectionLabel}>NAJBLIŽŠÍ TERMÍN</Text>
          <TouchableOpacity onPress={() => router.push('/(patient)/appointments')} activeOpacity={0.75} style={styles.historyBtn}>
            <Text style={styles.historyBtnText}>História</Text>
            <Ionicons name="chevron-forward" size={12} color={COLORS.wal} />
          </TouchableOpacity>
        </View>
        {apptLoading ? (
          <ActivityIndicator color={COLORS.wal} style={{ marginVertical: 12 }} />
        ) : nextAppointment ? (
          <UpcomingAppointmentCard
            appointment={nextAppointment}
            onPress={() => router.push('/(patient)/appointments')}
            onReschedule={() => router.push('/(patient)/appointments')}
            onCancel={() => handleCancelAppointment(nextAppointment.id)}
          />
        ) : (
          <TouchableOpacity style={styles.noApptCard}
            onPress={() => router.push('/(patient)/book-appointment')} activeOpacity={0.85}>
            <Ionicons name="calendar-outline" size={20} color={COLORS.wal} />
            <View style={{ flex: 1 }}>
              <Text style={styles.noApptText}>Žiadny nadchádzajúci termín</Text>
              <Text style={styles.noApptSub}>Kliknite sem a rezervujte si nový termín →</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ── Rýchle akcie ── */}
        <View style={styles.body}><Text style={styles.sectionLabel}>RÝCHLE AKCIE</Text></View>
        <QuickActionsGrid />

        {/* ── Kompletnosť profilu ── */}
        {!profileLoading && profileCompleteness.pct < 100 && (
          <View style={styles.body}>
            <Text style={styles.sectionLabel}>PROFIL</Text>
            <View style={styles.completenessCard}>
              <View style={styles.completenessTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.completenessTitle}>Kompletnosť profilu</Text>
                  <Text style={styles.completenessSubtitle}>
                    Doplň údaje pre lepší zážitok
                  </Text>
                </View>
                <Text style={styles.completenessPct}>{profileCompleteness.pct}%</Text>
              </View>
              {/* Progress bar */}
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${profileCompleteness.pct}%` }]} />
              </View>
              {/* Položky */}
              <View style={styles.completenessItems}>
                {profileCompleteness.items.map(item => (
                  <View key={item.label} style={styles.completenessItem}>
                    <Ionicons
                      name={item.done ? 'checkmark-circle' : 'ellipse-outline'}
                      size={15}
                      color={item.done ? '#1E8449' : '#ccc'}
                    />
                    <Text style={[styles.completenessItemText, item.done && styles.completenessItemDone]}>
                      {item.label}
                    </Text>
                    {item.done && (
                      <View style={styles.completenessPoints}>
                        <Text style={styles.completenessPointsText}>+{item.points}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
              {/* CTA */}
              {profileCompleteness.first && (
                <TouchableOpacity
                  style={styles.completenessBtn}
                  onPress={() => router.push(profileCompleteness.first!.route)}
                  activeOpacity={0.85}>
                  <Text style={styles.completenessBtnText}>Doplniť: {profileCompleteness.first.label}</Text>
                  <Ionicons name="arrow-forward" size={14} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* ── Ordinačné hodiny ── */}
        <View style={styles.body}><Text style={styles.sectionLabel}>ORDINAČNÉ HODINY</Text></View>
        <OpeningHoursWidget />

        {/* ── Upozornenia ── */}
        <View style={styles.body}>
          <Text style={styles.sectionLabel}>UPOZORNENIA</Text>
          <View style={styles.alertCard}>
            <Ionicons name="warning-outline" size={15} color="#c0392b" />
            <Text style={styles.alertText}>Odporúčaná preventívna prehliadka každých 6 mesiacov.</Text>
          </View>
        </View>

        {/* ── Dentálne skóre mini-karta ── */}
        <View style={styles.body}>
          <Text style={styles.sectionLabel}>DENTÁLNE SKÓRE</Text>
        </View>
        <TouchableOpacity
          style={styles.scoreCard}
          onPress={() => router.push('/(patient)/score')}
          activeOpacity={0.85}
        >
          {scoreLoading ? (
            <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
          ) : (
            <>
              <View style={[
                styles.scoreCircleMini,
                { borderColor: dentalScore == null ? 'rgba(255,255,255,0.3)'
                    : dentalScore >= 80 ? '#2ECC71'
                    : dentalScore >= 60 ? '#F4D03F'
                    : '#E74C3C' }
              ]}>
                <Text style={styles.scoreMiniNum}>{dentalScore ?? '?'}</Text>
                <Text style={styles.scoreMiniSub}>/100</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.scoreMiniTitle}>
                  {dentalScore == null
                    ? 'Skóre nedostupné'
                    : dentalScore >= 80 ? '🌟 Výborný chrup!'
                    : dentalScore >= 60 ? '👍 Dobrý stav'
                    : dentalScore >= 40 ? '⚠️ Priemerný stav'
                    : '🔴 Vyžaduje pozornosť'}
                </Text>
                <Text style={styles.scoreMiniSub2}>
                  {dentalScore == null
                    ? 'Navštívte doktora pre vyplnenie zubnej karty'
                    : 'Kliknite pre detailnú analýzu chrupu →'}
                </Text>
              </View>
            </>
          )}
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ── FAB: Rezervovať termín ── */}
      <TouchableOpacity style={styles.fab}
        onPress={() => router.push('/(patient)/book-appointment')} activeOpacity={0.85}>
        <Ionicons name="add" size={24} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },

  header: { backgroundColor: COLORS.esp, paddingHorizontal: SIZES.padding + 4, paddingTop: 20, paddingBottom: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLabel: { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '500', textTransform: 'uppercase', marginBottom: 4 },
  headerTitle: { fontSize: 22, fontWeight: '500', color: '#fff' },
  avatar:     { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.wal, borderWidth: 2, borderColor: COLORS.sand, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontWeight: '700', color: COLORS.cream },
  bellBtn:    { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  bellBadge:  { position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#E74C3C', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 1.5, borderColor: COLORS.esp },
  bellBadgeText: { fontSize: 8, fontWeight: '800', color: '#fff' },

  reminderBanner:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: SIZES.radius, marginHorizontal: SIZES.padding, marginTop: 14, marginBottom: 4, paddingVertical: 13, paddingHorizontal: 14, borderWidth: 1.5 },
  reminderToday:      { backgroundColor: '#FEF0EE', borderColor: '#E8917F' },
  reminderTomorrow:   { backgroundColor: '#EBF5FB', borderColor: '#AED6F1' },
  reminderTodayText:  { color: '#7D2A1A' },
  reminderIcon:       { fontSize: 26 },
  reminderTitle:      { fontSize: 14, fontWeight: '700', color: '#1A5276', marginBottom: 2 },
  reminderSub:        { fontSize: 12, color: COLORS.wal },

  hpBanner: { backgroundColor: '#FAE8E5', borderWidth: 1.5, borderColor: '#CC7060', borderRadius: SIZES.radius, marginHorizontal: SIZES.padding, marginTop: 16, marginBottom: 4, paddingVertical: 13, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  hpBannerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  hpIcon:  { fontSize: 22 },
  hpTitle: { fontSize: 14, fontWeight: '700', color: '#8C2A18', marginBottom: 2 },
  hpSub:   { fontSize: 11, color: '#a84030', lineHeight: 16 },

  body:    { paddingHorizontal: SIZES.padding, paddingTop: 18, paddingBottom: 8 },
  bodyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { fontSize: 9, letterSpacing: 2, color: COLORS.wal, fontWeight: '500', textTransform: 'uppercase', marginBottom: 9 },
  historyBtn:     { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 9 },
  historyBtnText: { fontSize: 11, fontWeight: '600', color: COLORS.wal },

  noApptCard: { backgroundColor: '#fff', borderRadius: SIZES.radius, marginHorizontal: SIZES.padding, marginBottom: 14, padding: 16, borderWidth: 1.5, borderColor: COLORS.bg3, borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', gap: 12 },
  noApptText: { fontSize: 13, fontWeight: '600', color: COLORS.esp, marginBottom: 3 },
  noApptSub:  { fontSize: 11, color: COLORS.wal },

  alertCard: { backgroundColor: '#FAE8E5', borderWidth: 1, borderColor: '#CC7060', borderRadius: SIZES.radius, padding: 12, flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  alertText:  { flex: 1, fontSize: 12, color: '#8C2A18', lineHeight: 18 },

  // Kompletnosť profilu
  completenessCard:      { backgroundColor: '#fff', borderRadius: SIZES.radius, padding: 16, borderWidth: 1.5, borderColor: COLORS.bg3 },
  completenessTop:       { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  completenessTitle:     { fontSize: 14, fontWeight: '700', color: COLORS.esp, marginBottom: 2 },
  completenessSubtitle:  { fontSize: 11, color: COLORS.wal },
  completenessPct:       { fontSize: 28, fontWeight: '800', color: COLORS.wal },
  progressTrack:         { height: 6, backgroundColor: COLORS.bg3, borderRadius: 3, marginBottom: 14, overflow: 'hidden' },
  progressFill:          { height: 6, backgroundColor: COLORS.wal, borderRadius: 3 },
  completenessItems:     { gap: 8, marginBottom: 14 },
  completenessItem:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  completenessItemText:  { flex: 1, fontSize: 12, color: COLORS.wal },
  completenessItemDone:  { color: '#1E8449', textDecorationLine: 'line-through' },
  completenessPoints:    { backgroundColor: '#EAFAF1', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  completenessPointsText:{ fontSize: 9, fontWeight: '700', color: '#1E8449' },
  completenessBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.wal, borderRadius: 10, paddingVertical: 11 },
  completenessBtnText:   { fontSize: 12, fontWeight: '700', color: '#fff' },

  scoreCard:        { backgroundColor: COLORS.esp, borderRadius: SIZES.radius, marginHorizontal: SIZES.padding, marginBottom: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  scoreCircleMini:  { width: 56, height: 56, borderRadius: 28, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  scoreMiniNum:     { fontSize: 20, fontWeight: '800', color: '#fff', lineHeight: 22 },
  scoreMiniSub:     { fontSize: 8,  fontWeight: '600', color: 'rgba(255,255,255,0.6)', lineHeight: 10 },
  scoreMiniTitle:   { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 3 },
  scoreMiniSub2:    { fontSize: 11, color: COLORS.sand },

  fab: { position: 'absolute', bottom: 80, right: 20, width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: COLORS.esp, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6 },
});
