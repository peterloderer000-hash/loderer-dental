import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COLORS, SPACING, RADII } from '../../styles/theme';
import { addToCalendar } from '../../utils/calendarSync';
import { useAppTheme } from '../../context/ThemeContext';

export default function BookingSuccessScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const {
    serviceName, serviceEmoji, date, time, doctorName,
    price, duration, notes, isUrgent, familyName,
    appointmentIso, durationMin,
  } = useLocalSearchParams<{
    serviceName: string; serviceEmoji: string; date: string; time: string;
    doctorName: string; price: string; duration: string; notes: string;
    isUrgent: string; familyName?: string;
    appointmentIso?: string; durationMin?: string;
  }>();
  const urgent = isUrgent === '1';
  const isForFamily = !!familyName && familyName.length > 0;
  const [calLoading, setCalLoading] = useState(false);
  const [calAdded,   setCalAdded]   = useState(false);

  // Animácia príchodu
  const scale   = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale,   { toValue: 1, useNativeDriver: true, tension: 60, friction: 7 }),
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  async function handleAddToCalendar() {
    if (!appointmentIso || calAdded || calLoading) return;
    setCalLoading(true);
    const eventId = await addToCalendar({
      title:           serviceName ?? 'Zubná ambulancia',
      startDate:       new Date(appointmentIso),
      durationMinutes: durationMin ? parseInt(durationMin, 10) : 30,
      location:        'Loderer Dental',
      notes:           `Doktor: ${doctorName}\n${notes ?? ''}`.trim(),
    });
    setCalLoading(false);
    if (eventId) setCalAdded(true);
  }

  async function handleShare() {
    try {
      await Share.share({
        title: 'Môj termín v zubnej ambulancii',
        message:
          `🦷 Termín: ${serviceName}\n` +
          `📅 ${date} o ${time}\n` +
          `👨‍⚕️ ${doctorName}\n` +
          `💰 ${price}\n` +
          `⏱ ${duration}`,
      });
    } catch {
      // user dismissed share sheet — nothing to do
    }
  }

  const rows = [
    ...(isForFamily ? [{ icon: 'people-outline' as const, label: 'Pre', value: familyName! }] : []),
    { icon: 'calendar-outline'  as const, label: 'Dátum', value: date },
    { icon: 'time-outline'      as const, label: 'Čas', value: `${time} · ${duration}` },
    { icon: 'person-outline'    as const, label: 'Doktor', value: doctorName },
    { icon: 'pricetag-outline'  as const, label: 'Cena', value: price },
    ...(notes ? [{ icon: 'document-text-outline' as const, label: 'Poznámka', value: notes }] : []),
  ];

  return (
    <View style={[styles.safe, { backgroundColor: colors.bg2 }]}>
      <Animated.View style={{ flex: 1, opacity }}>
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Success ikona */}
          <Animated.View style={[styles.iconWrap, { transform: [{ scale }] }]}>
            <View style={styles.iconCircle}>
              <Ionicons name="hourglass-outline" size={48} color="#fff" />
            </View>
            <Text style={styles.confetti}>📋</Text>
          </Animated.View>

          {/* Titulok */}
          <Text style={[styles.title, { color: colors.textPrimary }]}>Žiadosť odoslaná!</Text>
          <View style={styles.serviceRow}>
            <Text style={styles.serviceEmoji}>{serviceEmoji ?? '🦷'}</Text>
            <Text style={[styles.serviceName, { color: colors.textSecondary }]}>{serviceName}</Text>
          </View>

          {/* Detail karta */}
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            {rows.map((r, idx) => (
              <View key={r.label} style={[styles.row, { borderBottomColor: colors.bg3 }, idx === rows.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={[styles.rowIcon, { backgroundColor: colors.bg2 }]}>
                  <Ionicons name={r.icon} size={16} color={COLORS.wal} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{r.label}</Text>
                  <Text style={[styles.rowValue, { color: colors.textPrimary }]} numberOfLines={2}>{r.value}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Urgentné upozornenie */}
          {urgent && (
            <View style={styles.urgentBox}>
              <Text style={{ fontSize: 18 }}>🚨</Text>
              <Text style={styles.urgentText}>Označené ako URGENTNÉ — doktor to vybavý prednostne.</Text>
            </View>
          )}

          {/* Info */}
          <View style={styles.infoBox}>
            <Ionicons name="time-outline" size={15} color="#B87333" />
            <Text style={styles.infoText}>
              Tvoja žiadosť čaká na schválenie doktorom. Po schválení dostaneš notifikáciu.
            </Text>
          </View>

          {/* Pridať do Kalendára */}
          {!!appointmentIso && (
            <TouchableOpacity
              style={[styles.btnShare, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, calAdded && { borderColor: '#52C896', backgroundColor: '#EDF7F3' }]}
              onPress={handleAddToCalendar}
              activeOpacity={0.85}
              disabled={calAdded || calLoading}
            >
              {calLoading
                ? <ActivityIndicator size="small" color={COLORS.wal} />
                : <Ionicons
                    name={calAdded ? 'checkmark-circle' : 'calendar-outline'}
                    size={16}
                    color={calAdded ? '#52C896' : COLORS.wal}
                  />}
              <Text style={[styles.btnShareText, { color: colors.textSecondary }, calAdded && { color: '#52C896' }]}>
                {calAdded ? 'Pridané do kalendára' : 'Pridať do Google Kalendára'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Zdieľať */}
          <TouchableOpacity style={[styles.btnShare, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]} onPress={handleShare} activeOpacity={0.85}>
            <Ionicons name="share-social-outline" size={16} color={COLORS.wal} />
            <Text style={[styles.btnShareText, { color: colors.textSecondary }]}>Zdieľať termín</Text>
          </TouchableOpacity>

          {/* Akcie */}
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btnSecondary, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}
              onPress={() => router.push('/(patient)/appointments')} activeOpacity={0.85}>
              <Ionicons name="list-outline" size={16} color={COLORS.wal} />
              <Text style={[styles.btnSecondaryText, { color: colors.textSecondary }]}>Moje termíny</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnPrimary}
              onPress={() => router.push('/')} activeOpacity={0.85}>
              <Ionicons name="home-outline" size={16} color="#fff" />
              <Text style={styles.btnPrimaryText}>Domov</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: COLORS.bg2 },
  container: { flexGrow: 1, padding: SPACING.xl, paddingTop: 24, paddingBottom: 100, alignItems: 'center', justifyContent: 'center' },

  // Icon
  iconWrap:   { alignItems: 'center', marginBottom: 20 },
  iconCircle: { width: 100, height: 100, borderRadius: 20, backgroundColor: '#B8ACA0', alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#2E7D5E', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12 },
  confetti:   { fontSize: 32, position: 'absolute', bottom: -8, right: -8 },

  // Text
  title:       { fontSize: 26, fontWeight: '800', color: COLORS.esp, marginBottom: 8, textAlign: 'center' },
  serviceRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24 },
  serviceEmoji:{ fontSize: 22 },
  serviceName: { fontSize: 16, fontWeight: '600', color: COLORS.wal },

  // Detail karta
  card: { width: '100%', backgroundColor: COLORS.cream, borderRadius: 4, padding: 16, borderWidth: 1, borderColor: COLORS.bg3, marginBottom: 14, elevation: 2, shadowColor: '#121417', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
  row:  { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: COLORS.bg3 },
  rowIcon:  { width: 32, height: 32, borderRadius: 2, backgroundColor: '#D0D4DC', alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 9, fontWeight: '700', color: COLORS.wal, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
  rowValue: { fontSize: 14, fontWeight: '600', color: COLORS.esp, lineHeight: 19 },

  // Urgent
  urgentBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#FEF0EF', borderRadius: 2, padding: 12, width: '100%', marginBottom: 10, borderWidth: 1, borderColor: '#F1948A' },
  urgentText: { flex: 1, fontSize: 12, color: '#C0392B', fontWeight: '600', lineHeight: 18 },

  // Info
  infoBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#FDF3E7', borderRadius: 2, padding: 12, width: '100%', marginBottom: 24, borderWidth: 1, borderColor: '#D0D4DC' },
  infoText: { flex: 1, fontSize: 12, color: '#B87333', lineHeight: 18 },

  // Buttons
  btnShare:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12, borderRadius: 2, backgroundColor: COLORS.cream, borderWidth: 1.5, borderColor: COLORS.sand, width: '100%', marginBottom: 10 },
  btnShareText:   { fontSize: 13, fontWeight: '600', color: COLORS.wal },
  actions:        { flexDirection: 'row', gap: 10, width: '100%' },
  btnSecondary:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 14, borderRadius: 2, backgroundColor: COLORS.cream, borderWidth: 1.5, borderColor: COLORS.sand },
  btnSecondaryText:{ fontSize: 13, fontWeight: '700', color: COLORS.wal },
  btnPrimary:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 14, borderRadius: 2, backgroundColor: COLORS.esp },
  btnPrimaryText: { fontSize: 13, fontWeight: '700', color: '#F5F6F8' },
});
