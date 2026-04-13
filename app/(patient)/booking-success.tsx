import React, { useEffect, useRef } from 'react';
import { Animated, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COLORS, SIZES } from '../../styles/theme';

export default function BookingSuccessScreen() {
  const router = useRouter();
  const {
    serviceName, serviceEmoji, date, time, doctorName,
    price, duration, notes,
  } = useLocalSearchParams<{
    serviceName: string; serviceEmoji: string; date: string; time: string;
    doctorName: string; price: string; duration: string; notes: string;
  }>();

  // Animácia príchodu
  const scale   = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale,   { toValue: 1, useNativeDriver: true, tension: 60, friction: 7 }),
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

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
    { icon: 'calendar-outline'  as const, label: 'Dátum', value: date },
    { icon: 'time-outline'      as const, label: 'Čas', value: `${time} · ${duration}` },
    { icon: 'person-outline'    as const, label: 'Doktor', value: doctorName },
    { icon: 'pricetag-outline'  as const, label: 'Cena', value: price },
    ...(notes ? [{ icon: 'document-text-outline' as const, label: 'Poznámka', value: notes }] : []),
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Animated.View style={[styles.container, { opacity }]}>

        {/* Success ikona */}
        <Animated.View style={[styles.iconWrap, { transform: [{ scale }] }]}>
          <View style={styles.iconCircle}>
            <Ionicons name="checkmark" size={52} color="#fff" />
          </View>
          <Text style={styles.confetti}>🎉</Text>
        </Animated.View>

        {/* Titulok */}
        <Text style={styles.title}>Termín rezervovaný!</Text>
        <View style={styles.serviceRow}>
          <Text style={styles.serviceEmoji}>{serviceEmoji ?? '🦷'}</Text>
          <Text style={styles.serviceName}>{serviceName}</Text>
        </View>

        {/* Detail karta */}
        <View style={styles.card}>
          {rows.map((r, idx) => (
            <View key={r.label} style={[styles.row, idx === rows.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={styles.rowIcon}>
                <Ionicons name={r.icon} size={16} color={COLORS.wal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{r.label}</Text>
                <Text style={styles.rowValue} numberOfLines={2}>{r.value}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Info */}
        <View style={styles.infoBox}>
          <Ionicons name="notifications-outline" size={15} color="#1A5276" />
          <Text style={styles.infoText}>
            Dostaneš notifikáciu deň pred termínom ako pripomienku.
          </Text>
        </View>

        {/* Zdieľať */}
        <TouchableOpacity style={styles.btnShare} onPress={handleShare} activeOpacity={0.85}>
          <Ionicons name="share-social-outline" size={16} color={COLORS.wal} />
          <Text style={styles.btnShareText}>Zdieľať termín</Text>
        </TouchableOpacity>

        {/* Akcie */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.btnSecondary}
            onPress={() => router.push('/(patient)/appointments')} activeOpacity={0.85}>
            <Ionicons name="list-outline" size={16} color={COLORS.wal} />
            <Text style={styles.btnSecondaryText}>Moje termíny</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnPrimary}
            onPress={() => router.push('/')} activeOpacity={0.85}>
            <Ionicons name="home-outline" size={16} color="#fff" />
            <Text style={styles.btnPrimaryText}>Domov</Text>
          </TouchableOpacity>
        </View>

      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: COLORS.bg2 },
  container: { flex: 1, padding: SIZES.padding, alignItems: 'center', justifyContent: 'center' },

  // Icon
  iconWrap:   { alignItems: 'center', marginBottom: 20 },
  iconCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#1E8449', alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: '#1E8449', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12 },
  confetti:   { fontSize: 32, position: 'absolute', bottom: -8, right: -8 },

  // Text
  title:       { fontSize: 26, fontWeight: '800', color: COLORS.esp, marginBottom: 8, textAlign: 'center' },
  serviceRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 24 },
  serviceEmoji:{ fontSize: 22 },
  serviceName: { fontSize: 16, fontWeight: '600', color: COLORS.wal },

  // Detail karta
  card: { width: '100%', backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.bg3, marginBottom: 14, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
  row:  { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: COLORS.bg3 },
  rowIcon:  { width: 32, height: 32, borderRadius: 8, backgroundColor: '#F4ECE4', alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 9, fontWeight: '700', color: COLORS.wal, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
  rowValue: { fontSize: 14, fontWeight: '600', color: COLORS.esp, lineHeight: 19 },

  // Info
  infoBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#EBF5FB', borderRadius: 12, padding: 12, width: '100%', marginBottom: 24, borderWidth: 1, borderColor: '#AED6F1' },
  infoText: { flex: 1, fontSize: 12, color: '#1A5276', lineHeight: 18 },

  // Buttons
  btnShare:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.sand, width: '100%', marginBottom: 10 },
  btnShareText:   { fontSize: 13, fontWeight: '600', color: COLORS.wal },
  actions:        { flexDirection: 'row', gap: 10, width: '100%' },
  btnSecondary:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 14, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.sand },
  btnSecondaryText:{ fontSize: 13, fontWeight: '700', color: COLORS.wal },
  btnPrimary:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 14, borderRadius: 14, backgroundColor: COLORS.esp },
  btnPrimaryText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
