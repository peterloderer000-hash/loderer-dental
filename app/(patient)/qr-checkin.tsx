/**
 * QR Check-in — pacient naskenuje QR kód v čakárni
 * Automaticky zmení status termínu na 'arrived'
 */
import React, { useState, useEffect } from 'react';
import {
  Alert, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII } from '../../styles/theme';
import { useAppTheme } from '../../context/ThemeContext';

export default function QRCheckinScreen() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  async function handleBarCodeScanned({ data }: { data: string }) {
    if (scanned || processing) return;
    setScanned(true);
    setProcessing(true);

    try {
      // QR kód formát: "loderer-dental-checkin:{clinic_id}"
      if (!data.startsWith('loderer-dental-checkin:')) {
        setResult({ success: false, message: 'Neplatný QR kód. Skúste ten v čakárni ambulancie.' });
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setResult({ success: false, message: 'Nie ste prihlásený.' });
        return;
      }

      // Nájdi dnešný termín pacienta
      const today = new Date().toISOString().slice(0, 10);
      const { data: appointments } = await supabase
        .from('appointments')
        .select('id, appointment_date, status, service:service_id(name, emoji)')
        .eq('patient_id', user.id)
        .eq('status', 'scheduled')
        .gte('appointment_date', `${today}T00:00:00`)
        .lte('appointment_date', `${today}T23:59:59`)
        .order('appointment_date')
        .limit(1);

      if (!appointments || appointments.length === 0) {
        setResult({ success: false, message: 'Nemáte na dnes žiadny naplánovaný termín.' });
        return;
      }

      const appt = appointments[0] as any;

      // Označ ako arrived
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'arrived', arrived_at: new Date().toISOString() })
        .eq('id', appt.id);

      if (error) {
        setResult({ success: false, message: error.message });
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const time = new Date(appt.appointment_date).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
      const serviceName = appt.service?.name ?? 'Termín';

      setResult({
        success: true,
        message: `Ste zaregistrovaný v čakárni!\n\n${appt.service?.emoji ?? '🦷'} ${serviceName}\n⏰ ${time}\n\nSadnite si prosím a počkajte na privolanie.`,
      });

    } catch (e: any) {
      setResult({ success: false, message: e?.message ?? 'Nastala chyba' });
    } finally {
      setProcessing(false);
    }
  }

  if (!permission) {
    return (
      <View style={[s.center, { backgroundColor: colors.bg2 }]}>
        <Text style={{ color: colors.textSecondary }}>Načítavam...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[s.center, { backgroundColor: colors.bg2 }]}>
        <Ionicons name="camera-outline" size={48} color={COLORS.sand} />
        <Text style={[s.permTitle, { color: colors.textPrimary }]}>Povolenie pre fotoaparát</Text>
        <Text style={[s.permDesc, { color: colors.textSecondary }]}>
          Na skenovanie QR kódu potrebujeme prístup k fotoaparátu.
        </Text>
        <TouchableOpacity style={s.permBtn} onPress={requestPermission} activeOpacity={0.85}>
          <Text style={s.permBtnText}>Povoliť fotoaparát</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={[s.backLink, { color: colors.textSecondary }]}>Späť</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Výsledok skenovania
  if (result) {
    return (
      <View style={[s.center, { backgroundColor: colors.bg2 }]}>
        <Animated.View entering={FadeInDown.duration(400)} style={[s.resultCard, { backgroundColor: colors.cardBg }]}>
          <View style={[s.resultIcon, { backgroundColor: result.success ? (dark ? '#0D3B1F' : '#EAFAF1') : (dark ? '#4A1010' : '#FDEDEC') }]}>
            <Ionicons
              name={result.success ? 'checkmark-circle' : 'close-circle'}
              size={48}
              color={result.success ? '#27AE60' : '#E74C3C'}
            />
          </View>
          <Text style={[s.resultTitle, { color: colors.textPrimary }]}>
            {result.success ? 'Check-in úspešný!' : 'Nepodarilo sa'}
          </Text>
          <Text style={[s.resultMsg, { color: colors.textSecondary }]}>{result.message}</Text>

          <TouchableOpacity
            style={[s.resultBtn, { backgroundColor: result.success ? '#27AE60' : COLORS.wal }]}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <Text style={s.resultBtnText}>{result.success ? 'Hotovo' : 'Späť'}</Text>
          </TouchableOpacity>

          {!result.success && (
            <TouchableOpacity onPress={() => { setScanned(false); setResult(null); }} style={{ marginTop: 12 }}>
              <Text style={[s.backLink, { color: COLORS.gold }]}>Skúsiť znovu</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      {/* Overlay */}
      <View style={s.overlay}>
        {/* Back button */}
        <TouchableOpacity style={s.closeBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>

        {/* Scan frame */}
        <View style={s.scanFrame}>
          <View style={[s.corner, s.cornerTL]} />
          <View style={[s.corner, s.cornerTR]} />
          <View style={[s.corner, s.cornerBL]} />
          <View style={[s.corner, s.cornerBR]} />
        </View>

        {/* Instructions */}
        <View style={s.instructions}>
          <Text style={s.instrTitle}>Naskenujte QR kód</Text>
          <Text style={s.instrSub}>Namierte kameru na QR kód v čakárni</Text>
        </View>
      </View>
    </View>
  );
}

const FRAME = 220;
const CORNER = 30;
const BORDER = 3;

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },

  permTitle: { fontSize: 18, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  permDesc:  { fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  permBtn:   { backgroundColor: COLORS.wal, borderRadius: RADII.md, paddingHorizontal: 28, paddingVertical: 12 },
  permBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  backLink:  { fontSize: 13, fontWeight: '600' },

  overlay:   { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  closeBtn:  { position: 'absolute', top: 54, left: 20, width: 40, height: 40, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },

  scanFrame: { width: FRAME, height: FRAME, position: 'relative' },
  corner:    { position: 'absolute', width: CORNER, height: CORNER, borderColor: COLORS.gold },
  cornerTL:  { top: 0, left: 0, borderTopWidth: BORDER, borderLeftWidth: BORDER, borderTopLeftRadius: 8 },
  cornerTR:  { top: 0, right: 0, borderTopWidth: BORDER, borderRightWidth: BORDER, borderTopRightRadius: 8 },
  cornerBL:  { bottom: 0, left: 0, borderBottomWidth: BORDER, borderLeftWidth: BORDER, borderBottomLeftRadius: 8 },
  cornerBR:  { bottom: 0, right: 0, borderBottomWidth: BORDER, borderRightWidth: BORDER, borderBottomRightRadius: 8 },

  instructions: { marginTop: 40, alignItems: 'center' },
  instrTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 6 },
  instrSub:   { fontSize: 13, color: 'rgba(255,255,255,0.7)' },

  resultCard:  { borderRadius: RADII.xl, padding: 32, alignItems: 'center', width: '100%', maxWidth: 340 },
  resultIcon:  { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  resultTitle: { fontSize: 20, fontWeight: '800', marginBottom: 12 },
  resultMsg:   { fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  resultBtn:   { borderRadius: RADII.md, paddingHorizontal: 32, paddingVertical: 12 },
  resultBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
