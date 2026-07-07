/**
 * Čakáreň — recepcia/doktor
 * waiting → Zavolať (room picker → started_at) → Ukončiť (ended_at)
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator, Modal, ScrollView, StyleSheet, Text,
  TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabase';
import { COLORS } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';

type Patient = {
  id: string;
  appointment_date: string;
  arrived_at:  string | null;
  started_at:  string | null;
  room_id:     string | null;
  room_name: string | null;
  clinic_status: string;
  patient: { full_name: string } | null;
  service: { name: string; emoji: string | null } | null;
};

type Room = { id: string; name: string; color: string };

function waitMins(from: string | null): number {
  if (!from) return 0;
  return Math.round((Date.now() - new Date(from).getTime()) / 60000);
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
}

export default function WaitingRoomScreen() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  const [waiting,    setWaiting]    = useState<Patient[]>([]);
  const [inChair,    setInChair]    = useState<Patient[]>([]);
  const [rooms,      setRooms]      = useState<Room[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [tick,       setTick]       = useState(0);

  const [pickerOpen,   setPickerOpen]   = useState(false);
  const [pickerApptId, setPickerApptId] = useState<string | null>(null);
  const [saving,       setSaving]       = useState(false);

  const load = useCallback(async () => {
    const [{ data: appts }, { data: roomData }] = await Promise.all([
      supabase
        .from('appointments')
        .select('id, appointment_date, arrived_at, started_at, room_id, clinic_status, patient:profiles!appointments_patient_id_fkey(full_name), service:services(name, emoji)')
        .in('clinic_status', ['waiting', 'in_chair'])
        .order('arrived_at', { ascending: true }),
      supabase.from('clinic_rooms').select('id, name, color').eq('is_active', true).order('sort_order'),
    ]);

    const rData = (roomData ?? []) as Room[];

    const mapped = (appts ?? []).map((r: any) => ({
      id:               r.id,
      appointment_date: r.appointment_date,
      arrived_at:  r.arrived_at,
      started_at:  r.started_at,
      room_id:          r.room_id,
      room_name:        rData.find((rm) => rm.id === r.room_id)?.name ?? null,
      clinic_status:    r.clinic_status,
      patient:  Array.isArray(r.patient) ? r.patient[0] : r.patient,
      service:  Array.isArray(r.service) ? r.service[0] : r.service }));

    setWaiting(mapped.filter((p) => p.clinic_status === 'waiting'));
    setInChair(mapped.filter((p) => p.clinic_status === 'in_chair'));
    setRooms(rData);
    setLastUpdate(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel('waiting-room-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  async function callToRoom(roomId: string) {
    if (!pickerApptId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    await supabase.from('appointments').update({
      clinic_status: 'in_chair',
      started_at:    new Date().toISOString(),
      room_id:       roomId }).eq('id', pickerApptId);
    setSaving(false);
    setPickerOpen(false);
    setPickerApptId(null);
    load();
  }

  async function finishTreatment(apptId: string) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaving(true);
    await supabase.from('appointments').update({
      clinic_status: 'treatment_done',
      ended_at:      new Date().toISOString(),
      status:        'completed' }).eq('id', apptId);
    setSaving(false);
    load();
  }

  const total = waiting.length + inChair.length;

  return (
    <View style={s.safe}>
      <HeroHeader
        title="Aktuálne poradie"
        subtitle="Čakáreň"
        icon="tv-outline"
        onBack={() => router.back()}
      />

      {loading ? (
        <View style={{ flex: 1, backgroundColor: colors.bg2, padding: 16 }}>
          <SkeletonList count={4} />
        </View>
      ) : total === 0 ? (
        <View style={[s.center, { backgroundColor: colors.bg2 }]}>
          <Text style={s.emptyIcon}>🏥</Text>
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Čakáreň je prázdna</Text>
          <Text style={[s.emptySub, { color: colors.textSecondary }]}>Žiadni pacienti momentálne nečakajú</Text>
        </View>
      ) : (
        <ScrollView style={[s.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

          {/* ── V ordinácii ── */}
          {inChair.length > 0 && (
            <>
              <View style={s.sectionHeader}>
                <View style={[s.sectionDot, { backgroundColor: '#52C896' }]} />
                <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>V ORDINÁCII ({inChair.length})</Text>
              </View>
              {inChair.map((p) => {
                const treatMin = waitMins(p.started_at);
                return (
                  <View key={p.id} style={[s.card, { backgroundColor: dark ? '#1A3D2E' : '#EDF7F3', borderColor: dark ? '#52C89655' : '#A3D4BE' }]}>
                    <View style={s.cardTop}>
                      <View style={[s.numBadge, { backgroundColor: '#2E7D5E' }]}>
                        <Ionicons name="medical" size={18} color="#F5F6F8" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.name, { color: colors.textPrimary }]}>{p.patient?.full_name ?? 'Pacient'}</Text>
                        {p.service && (
                          <Text style={[s.service, { color: colors.textSecondary }]}>{p.service.emoji ?? '🦷'} {p.service.name}</Text>
                        )}
                        {p.room_name && (
                          <View style={s.roomBadge}>
                            <Ionicons name="bed-outline" size={11} color="#2E7D5E" />
                            <Text style={s.roomBadgeText}>{p.room_name}</Text>
                          </View>
                        )}
                      </View>
                      <View style={s.waitBox}>
                        <Text style={[s.waitNum, { color: '#2E7D5E' }]}>{treatMin}</Text>
                        <Text style={[s.waitLabel, { color: '#2E7D5E' }]}>min</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[s.actionBtn, { backgroundColor: '#2E7D5E' }, saving && { opacity: 0.5 }]}
                      onPress={() => finishTreatment(p.id)}
                      disabled={saving}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="checkmark-circle" size={18} color="#F5F6F8" />
                      <Text style={s.actionBtnText}>Ukončiť ošetrenie</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </>
          )}

          {/* ── Čaká ── */}
          {waiting.length > 0 && (
            <>
              <View style={s.sectionHeader}>
                <View style={[s.sectionDot, { backgroundColor: COLORS.gold }]} />
                <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>ČAKÁ ({waiting.length})</Text>
              </View>
              {waiting.map((p, idx) => {
                const mins = waitMins(p.arrived_at);
                const isLong = mins >= 20;
                return (
                  <View key={p.id} style={[s.card, { backgroundColor: isLong ? (dark ? '#3B0D0D' : '#F5F6F8') : colors.cardBg, borderColor: isLong ? '#F1948A' : colors.bg3 }]}>
                    <View style={s.cardTop}>
                      <View style={[s.numBadge, isLong && { backgroundColor: '#C0392B' }]}>
                        <Text style={s.numText}>{idx + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.name, { color: colors.textPrimary }]}>{p.patient?.full_name ?? 'Pacient'}</Text>
                        {p.service && (
                          <Text style={[s.service, { color: colors.textSecondary }]}>{p.service.emoji ?? '🦷'} {p.service.name}</Text>
                        )}
                        <Text style={s.apptTime}>Termín: {fmtTime(p.appointment_date)}</Text>
                      </View>
                      <View style={s.waitBox}>
                        <Text style={[s.waitNum, isLong && { color: '#C0392B' }]}>{mins}</Text>
                        <Text style={[s.waitLabel, isLong && { color: '#C0392B' }]}>min</Text>
                        {isLong && <Ionicons name="alert-circle" size={13} color="#C0392B" />}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[s.actionBtn, { backgroundColor: COLORS.wal }]}
                      onPress={() => { setPickerApptId(p.id); setPickerOpen(true); }}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="megaphone" size={16} color="#F5F6F8" />
                      <Text style={s.actionBtnText}>Zavolať do ordinácie</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      <View style={[s.footer, { backgroundColor: colors.bg3, borderTopColor: colors.bg3 }]}>
        <Ionicons name="sync-outline" size={11} color={colors.textSecondary} />
        <Text style={[s.footerText, { color: colors.textSecondary }]}>Živá aktualizácia cez Supabase Realtime</Text>
      </View>

      {/* ── Room picker modal ── */}
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { backgroundColor: colors.cardBg }]}>
            <Text style={[s.modalTitle, { color: colors.textPrimary }]}>Vyber kreslo</Text>
            <Text style={[s.modalSub, { color: colors.textSecondary }]}>Pacient bude presunutý do ordinácie</Text>
            {rooms.length === 0 && (
              <Text style={{ color: COLORS.wal, textAlign: 'center', marginVertical: 12 }}>
                Žiadne kreslá nie sú definované.
              </Text>
            )}
            {rooms.map((rm) => (
              <TouchableOpacity
                key={rm.id}
                style={[s.chairBtn, { borderColor: rm.color, opacity: saving ? 0.5 : 1 }]}
                onPress={() => callToRoom(rm.id)}
                disabled={saving}
                activeOpacity={0.85}
              >
                <View style={[s.chairDot, { backgroundColor: rm.color }]} />
                <Text style={[s.chairBtnText, { color: rm.color }]}>{rm.name}</Text>
                {saving && <ActivityIndicator size="small" color={rm.color} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.cancelBtn} onPress={() => setPickerOpen(false)}>
              <Text style={[s.cancelBtnText, { color: colors.textSecondary }]}>Zrušiť</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: COLORS.esp },
  scroll:  { flex: 1, backgroundColor: COLORS.bg2 },
  content: { padding: 16 },
  center:  { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center', padding: 32 },

  header: {
    backgroundColor: COLORS.esp, paddingHorizontal: 16,
    paddingTop: 14, paddingBottom: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerSub:   { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#F5F6F8' },
  timeBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, paddingHorizontal: 8, paddingVertical: 4 },
  timeText:    { fontSize: 11, color: COLORS.sand, fontWeight: '500' },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, marginTop: 4 },
  sectionDot:    { width: 8, height: 8, borderRadius: 4 },
  sectionLabel:  { fontSize: 10, fontWeight: '700', color: COLORS.wal, letterSpacing: 1.5, textTransform: 'uppercase' },

  card: {
    backgroundColor: COLORS.cream, borderRadius: 4, padding: 14, marginBottom: 10,
    borderWidth: 1.5, borderColor: COLORS.bg3,
    elevation: 2, shadowColor: '#121417', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4,
    gap: 12 },
  cardUrgent:     { borderColor: '#F1948A', backgroundColor: '#F5F6F8' },
  cardInProgress: { borderColor: '#A3D4BE', backgroundColor: '#EDF7F3' },
  cardTop:        { flexDirection: 'row', alignItems: 'center', gap: 14 },

  numBadge: { width: 44, height: 44, borderRadius: 4, backgroundColor: COLORS.esp, alignItems: 'center', justifyContent: 'center' },
  numText:  { fontSize: 20, fontWeight: '900', color: '#F5F6F8' },

  name:     { fontSize: 16, fontWeight: '800', color: COLORS.esp, marginBottom: 2 },
  service:  { fontSize: 12, color: COLORS.wal, marginBottom: 2 },
  apptTime: { fontSize: 11, color: '#B8ACA0' },

  roomBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  roomBadgeText: { fontSize: 11, fontWeight: '600', color: '#2E7D5E' },

  waitBox:   { alignItems: 'center', minWidth: 48 },
  waitNum:   { fontSize: 26, fontWeight: '900', color: '#0E6655', lineHeight: 30 },
  waitLabel: { fontSize: 10, fontWeight: '700', color: '#0E6655', textTransform: 'uppercase' },

  actionBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 2, paddingVertical: 11 },
  actionBtnText: { fontSize: 13, fontWeight: '700', color: '#F5F6F8' },

  emptyIcon:  { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: COLORS.esp, marginBottom: 6, textAlign: 'center' },
  emptySub:   { fontSize: 14, color: COLORS.wal, textAlign: 'center' },

  footer:     { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', paddingVertical: 10, backgroundColor: COLORS.bg3, borderTopWidth: 1, borderTopColor: COLORS.bg3 },
  footerText: { fontSize: 10, color: COLORS.wal },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard:    { backgroundColor: COLORS.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 12 },
  modalTitle:   { fontSize: 20, fontWeight: '800', color: COLORS.esp, textAlign: 'center' },
  modalSub:     { fontSize: 13, color: COLORS.wal, textAlign: 'center', marginBottom: 4 },
  chairBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 2, borderRadius: 2, paddingVertical: 16, paddingHorizontal: 20 },
  chairDot:     { width: 16, height: 16, borderRadius: 2 },
  chairBtnText: { fontSize: 17, fontWeight: '700', flex: 1 },
  cancelBtn:    { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  cancelBtnText:{ fontSize: 15, color: COLORS.wal, fontWeight: '600' } });
