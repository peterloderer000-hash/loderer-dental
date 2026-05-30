/**
 * Hodnotenia a recenzie — pacient
 * Prehľad všetkých hodnotení, priemerné skóre, možnosť doplniť recenziu
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  ActivityIndicator, Alert, Animated, Modal, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabase';
import { COLORS, RADII, SHADOWS, SPACING, GRADIENTS } from '../../styles/theme';
import { LinearGradient } from 'expo-linear-gradient';
import HeroHeader from '../../components/ui/HeroHeader';
import { useAppTheme } from '../../context/ThemeContext';
import { SkeletonList } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';

type ReviewAppt = {
  id: string;
  appointment_date: string;
  patient_rating: number | null;
  patient_review: string | null;
  status: string;
  service: { name: string; emoji: string | null } | null;
  doctor: { full_name: string } | null;
};

export default function ReviewsScreen() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [appointments, setAppointments] = useState<ReviewAppt[]>([]);

  // Rating modal
  const [ratingAppt, setRatingAppt] = useState<ReviewAppt | null>(null);
  const [ratingVal, setRatingVal] = useState(0);
  const [ratingText, setRatingText] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('appointments')
        .select('id, appointment_date, patient_rating, patient_review, status, service:services(name, emoji), doctor:profiles!appointments_doctor_id_fkey(full_name)')
        .eq('patient_id', user.id)
        .eq('status', 'completed')
        .order('appointment_date', { ascending: false })
        .limit(50);
      if (!error) setAppointments((data ?? []) as unknown as ReviewAppt[]);
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const rated = useMemo(() => appointments.filter(a => a.patient_rating != null), [appointments]);
  const unrated = useMemo(() => appointments.filter(a => a.patient_rating == null), [appointments]);

  const avgRating = useMemo(() => {
    if (!rated.length) return null;
    const sum = rated.reduce((acc, a) => acc + (a.patient_rating ?? 0), 0);
    return (sum / rated.length).toFixed(1);
  }, [rated]);

  const ratingDistribution = useMemo(() => {
    const dist = [0, 0, 0, 0, 0]; // 1-5
    rated.forEach(a => { if (a.patient_rating) dist[a.patient_rating - 1]++; });
    return dist;
  }, [rated]);

  async function handleSubmitRating() {
    if (!ratingAppt || ratingVal === 0) return;
    setSaving(true);
    const { error } = await supabase.from('appointments').update({
      patient_rating: ratingVal,
      patient_review: ratingText.trim() || null,
    }).eq('id', ratingAppt.id);
    setSaving(false);
    if (error) { Alert.alert('Chyba', error.message); return; }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRatingAppt(null);
    load();
  }

  function openRate(appt: ReviewAppt) {
    setRatingAppt(appt);
    setRatingVal(appt.patient_rating ?? 0);
    setRatingText(appt.patient_review ?? '');
  }

  const RATING_LABELS = ['', 'Veľmi zlý', 'Zlý', 'Dobrý', 'Veľmi dobrý', 'Výborný!'];

  if (loading) {
    return (
      <View style={[styles.safe, { backgroundColor: colors.bg2 }]}>
        <Header dark={dark} colors={colors} router={router} />
        <View style={{ padding: SPACING.lg }}><SkeletonList count={5} /></View>
      </View>
    );
  }

  return (
    <View style={[styles.safe, { backgroundColor: colors.bg2 }]}>
      <Header dark={dark} colors={colors} router={router} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.wal} colors={[COLORS.wal]} />}
      >
        {/* ── Priemerné hodnotenie ── */}
        {rated.length > 0 && (
          <View style={[styles.avgCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <View style={styles.avgLeft}>
              <Text style={[styles.avgNum, { color: colors.textPrimary }]}>{avgRating}</Text>
              <View style={styles.starsRow}>
                {[1,2,3,4,5].map(n => (
                  <Ionicons key={n} name={n <= Math.round(Number(avgRating)) ? 'star' : 'star-outline'} size={16} color="#F39C12" />
                ))}
              </View>
              <Text style={[styles.avgSub, { color: colors.textSecondary }]}>{rated.length} hodnotení</Text>
            </View>
            <View style={styles.avgRight}>
              {[5,4,3,2,1].map(n => {
                const count = ratingDistribution[n - 1];
                const pct = rated.length > 0 ? (count / rated.length) * 100 : 0;
                return (
                  <View key={n} style={styles.distRow}>
                    <Text style={[styles.distLabel, { color: colors.textSecondary }]}>{n}</Text>
                    <View style={[styles.distBarBg, { backgroundColor: colors.bg3 }]}>
                      <View style={[styles.distBarFill, { width: `${pct}%`, backgroundColor: '#F39C12' }]} />
                    </View>
                    <Text style={[styles.distCount, { color: colors.textSecondary }]}>{count}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ── Nehodnotené návštevy ── */}
        {unrated.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: dark ? '#F0A030' : '#7D6608' }]}>
              ⏳ ČAKÁ NA HODNOTENIE ({unrated.length})
            </Text>
            {unrated.map(appt => (
              <TouchableOpacity
                key={appt.id}
                style={[styles.reviewCard, { backgroundColor: dark ? '#2D2200' : '#FEF9E7', borderColor: dark ? '#F39C1244' : '#F9E79F' }]}
                onPress={() => openRate(appt)}
                activeOpacity={0.85}
              >
                <Text style={{ fontSize: 22 }}>{appt.service?.emoji ?? '🦷'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.reviewService, { color: colors.textPrimary }]}>{appt.service?.name ?? 'Návšteva'}</Text>
                  <Text style={[styles.reviewDate, { color: colors.textSecondary }]}>
                    {new Date(appt.appointment_date).toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' })}
                    {appt.doctor?.full_name ? ` · ${appt.doctor.full_name}` : ''}
                  </Text>
                </View>
                <View style={[styles.rateBtn, { backgroundColor: dark ? '#4A3000' : '#FDE8C0' }]}>
                  <Ionicons name="star-outline" size={14} color="#F39C12" />
                  <Text style={styles.rateBtnText}>Ohodnoť</Text>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* ── Hodnotené návštevy ── */}
        {rated.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: unrated.length > 0 ? 20 : 0 }]}>
              ★ MOJE HODNOTENIA ({rated.length})
            </Text>
            {rated.map(appt => (
              <View
                key={appt.id}
                style={[styles.reviewCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}
              >
                <Text style={{ fontSize: 22 }}>{appt.service?.emoji ?? '🦷'}</Text>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <Text style={[styles.reviewService, { color: colors.textPrimary }]}>{appt.service?.name ?? 'Návšteva'}</Text>
                    <View style={styles.starsRowSmall}>
                      {[1,2,3,4,5].map(n => (
                        <Ionicons key={n} name={n <= (appt.patient_rating ?? 0) ? 'star' : 'star-outline'} size={12} color="#F39C12" />
                      ))}
                    </View>
                  </View>
                  <Text style={[styles.reviewDate, { color: colors.textSecondary }]}>
                    {new Date(appt.appointment_date).toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' })}
                    {appt.doctor?.full_name ? ` · ${appt.doctor.full_name}` : ''}
                  </Text>
                  {appt.patient_review ? (
                    <Text style={[styles.reviewText, { color: colors.textPrimary }]} numberOfLines={3}>
                      „{appt.patient_review}"
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </>
        )}

        {appointments.length === 0 && (
          <EmptyState
            icon="star-outline"
            title="Žiadne návštevy"
            subtitle="Po dokončení návštevy tu nájdete možnosť ohodnotenia."
          />
        )}
      </ScrollView>

      {/* ── Rating Modal ── */}
      <Modal visible={!!ratingAppt} transparent animationType="slide" onRequestClose={() => setRatingAppt(null)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setRatingAppt(null)} />
          <View style={[styles.modalSheet, { backgroundColor: colors.cardBg }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.bg3 }]} />
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>🦷 Ohodnoť návštevu</Text>
            <Text style={[styles.modalSub, { color: colors.textSecondary }]}>
              {ratingAppt?.service?.emoji ?? '🦷'} {ratingAppt?.service?.name ?? 'Termín'} ·{' '}
              {ratingAppt ? new Date(ratingAppt.appointment_date).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' }) : ''}
            </Text>

            <View style={styles.starsRowLarge}>
              {[1,2,3,4,5].map(n => (
                <TouchableOpacity key={n} onPress={() => setRatingVal(n)} activeOpacity={0.7}>
                  <Ionicons name={n <= ratingVal ? 'star' : 'star-outline'} size={42} color={n <= ratingVal ? '#F39C12' : '#ddd'} />
                </TouchableOpacity>
              ))}
            </View>
            {ratingVal > 0 && (
              <Text style={styles.ratingLabel}>{RATING_LABELS[ratingVal]}</Text>
            )}

            <TextInput
              style={[styles.reviewInput, { borderColor: colors.bg3, color: colors.textPrimary, backgroundColor: colors.bg2 }]}
              placeholder="Pridaj komentár (voliteľné)..."
              placeholderTextColor={colors.textSecondary}
              value={ratingText}
              onChangeText={setRatingText}
              multiline numberOfLines={3} textAlignVertical="top"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtnSkip, { borderColor: colors.bg3 }]} onPress={() => setRatingAppt(null)} activeOpacity={0.8}>
                <Text style={[styles.modalBtnSkipText, { color: colors.textSecondary }]}>Zrušiť</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnSubmit, (saving || ratingVal === 0) && { opacity: 0.45 }]}
                onPress={handleSubmitRating} disabled={saving || ratingVal === 0} activeOpacity={0.85}
              >
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalBtnSubmitText}>Odoslať ★</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────
function Header({ dark, colors, router }: { dark: boolean; colors: any; router: any }) {
  return (
    <HeroHeader
      title="Hodnotenia"
      subtitle="Vaše recenzie a spätná väzba"
      icon="star-outline"
      onBack={() => router.back()}
    />
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: COLORS.bg2 },
  header:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SPACING.lg, paddingTop: 14, paddingBottom: 16 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 19, fontWeight: '600', color: '#fff' },
  headerSub:   { fontSize: 11, color: COLORS.sand, marginTop: 1 },

  // Avg card
  avgCard:     { flexDirection: 'row', borderRadius: RADII.lg, borderWidth: 1.5, padding: 16, marginBottom: 20, ...SHADOWS.sm },
  avgLeft:     { alignItems: 'center', marginRight: 20, gap: 4 },
  avgNum:      { fontSize: 36, fontWeight: '800' },
  avgSub:      { fontSize: 11, marginTop: 2 },
  avgRight:    { flex: 1, gap: 4 },
  distRow:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  distLabel:   { width: 12, fontSize: 11, fontWeight: '600', textAlign: 'right' },
  distBarBg:   { flex: 1, height: 8, borderRadius: 4 },
  distBarFill: { height: 8, borderRadius: 4 },
  distCount:   { width: 18, fontSize: 11, textAlign: 'right' },

  starsRow:      { flexDirection: 'row', gap: 2 },
  starsRowSmall: { flexDirection: 'row', gap: 1 },
  starsRowLarge: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 8 },

  sectionLabel:  { fontSize: 9, letterSpacing: 2, fontWeight: '700', textTransform: 'uppercase', marginBottom: 10 },

  reviewCard:    { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: RADII.lg, borderWidth: 1.5, padding: 14, marginBottom: 10, ...SHADOWS.sm },
  reviewService: { fontSize: 14, fontWeight: '700', marginBottom: 1 },
  reviewDate:    { fontSize: 11 },
  reviewText:    { fontSize: 12, fontStyle: 'italic', marginTop: 6, lineHeight: 18 },

  rateBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  rateBtnText:   { fontSize: 11, fontWeight: '700', color: '#F39C12' },

  // Modal
  modalOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet:         { borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 24, paddingBottom: 44 },
  modalHandle:        { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle:         { fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  modalSub:           { fontSize: 13, textAlign: 'center', marginBottom: 20 },
  ratingLabel:        { fontSize: 15, fontWeight: '600', color: '#F39C12', textAlign: 'center', marginBottom: 16 },
  reviewInput:        { borderWidth: 1.5, borderRadius: 12, padding: 12, fontSize: 13, minHeight: 76, marginBottom: 20 },
  modalActions:       { flexDirection: 'row', gap: 10 },
  modalBtnSkip:       { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1.5 },
  modalBtnSkipText:   { fontSize: 14, fontWeight: '600' },
  modalBtnSubmit:     { flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#F39C12', justifyContent: 'center' },
  modalBtnSubmitText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
