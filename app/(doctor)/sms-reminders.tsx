/**
 * SMS Pripomienky — nastavenia a log odoslaných SMS
 * Pripravené na Twilio integráciu
 */
import React, { useState, useCallback } from 'react';
import {
  Alert, ScrollView, StyleSheet, Switch, Text,
  TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII, SHADOWS } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';

type SmsLog = {
  id: string;
  patient_name: string;
  phone: string;
  message: string;
  status: 'sent' | 'failed' | 'pending';
  sent_at: string;
};

export default function SmsReminders() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<SmsLog[]>([]);

  // Settings
  const [enabled, setEnabled] = useState(true);
  const [reminder24h, setReminder24h] = useState(true);
  const [reminder1h, setReminder1h] = useState(true);
  const [recallSms, setRecallSms] = useState(false);

  const loadLogs = useCallback(async () => {
    try {
      const { data } = await supabase.from('sms_logs')
        .select('*, patient:profiles!patient_id(full_name, phone)')
        .order('created_at', { ascending: false })
        .limit(30);

      setLogs((data ?? []).map(d => ({
        id: d.id,
        patient_name: d.patient?.full_name ?? 'Pacient',
        phone: d.patient?.phone ?? d.phone ?? '',
        message: d.message ?? '',
        status: d.status ?? 'sent',
        sent_at: d.created_at,
      })));
    } catch (e) {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadLogs(); }, [loadLogs]));

  const sentCount = logs.filter(l => l.status === 'sent').length;
  const failedCount = logs.filter(l => l.status === 'failed').length;

  return (
    <View style={[st.safe, { backgroundColor: colors.esp }]}>
      <HeroHeader title="SMS pripomienky" subtitle="Automatické SMS" icon="chatbox-outline" onBack={() => router.back()} />

      <ScrollView style={[st.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={st.content}
        showsVerticalScrollIndicator={false}>

        {loading ? <SkeletonList count={4} /> : (
          <>
            {/* Stats */}
            <Animated.View entering={FadeInDown.delay(100)} style={st.statsRow}>
              <View style={[st.statCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <Text style={[st.statNum, { color: COLORS.success }]}>{sentCount}</Text>
                <Text style={[st.statLabel, { color: colors.textSecondary }]}>Odoslaných</Text>
              </View>
              <View style={[st.statCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <Text style={[st.statNum, { color: COLORS.error }]}>{failedCount}</Text>
                <Text style={[st.statLabel, { color: colors.textSecondary }]}>Neúspešných</Text>
              </View>
            </Animated.View>

            {/* Settings */}
            <Animated.View entering={FadeInDown.delay(200)} style={[st.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <Text style={[st.cardTitle, { color: colors.textPrimary }]}>Nastavenia</Text>

              {[
                { label: 'SMS pripomienky aktívne', value: enabled, set: setEnabled },
                { label: 'Pripomienka 24h pred termínom', value: reminder24h, set: setReminder24h },
                { label: 'Pripomienka 1h pred termínom', value: reminder1h, set: setReminder1h },
                { label: 'Recall SMS (kontrolné prehliadky)', value: recallSms, set: setRecallSms },
              ].map((item, i) => (
                <View key={i} style={[st.settingRow, i > 0 && { borderTopWidth: 0.5, borderTopColor: colors.bg3 }]}>
                  <Text style={[st.settingLabel, { color: colors.textPrimary }]}>{item.label}</Text>
                  <Switch
                    value={item.value}
                    onValueChange={(v) => { item.set(v); Haptics.selectionAsync(); }}
                    trackColor={{ false: colors.bg3, true: COLORS.gold + '50' }}
                    thumbColor={item.value ? COLORS.gold : '#D0D4DC'}
                  />
                </View>
              ))}
            </Animated.View>

            {/* SMS templates */}
            <Animated.View entering={FadeInDown.delay(300)} style={[st.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <Text style={[st.cardTitle, { color: colors.textPrimary }]}>Šablóny správ</Text>
              {[
                { type: '24h pripomienka', msg: 'Pripomíname Vám termín u zubára zajtra o {time}. Loderer Dental.' },
                { type: '1h pripomienka', msg: 'Váš termín u zubára je o 1 hodinu ({time}). Tešíme sa na Vás!' },
                { type: 'Recall', msg: 'Je čas na preventívnu prehliadku! Objednajte sa na {link}.' },
              ].map((t, i) => (
                <View key={i} style={[st.tplRow, i > 0 && { borderTopWidth: 0.5, borderTopColor: colors.bg3 }]}>
                  <Text style={[st.tplType, { color: COLORS.gold }]}>{t.type}</Text>
                  <Text style={[st.tplMsg, { color: colors.textSecondary }]}>{t.msg}</Text>
                </View>
              ))}
            </Animated.View>

            {/* Log */}
            <Text style={[st.sectionTitle, { color: colors.textPrimary }]}>Posledné SMS</Text>
            {logs.length === 0 ? (
              <View style={[st.empty, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <Ionicons name="chatbox-outline" size={40} color={colors.textSecondary} />
                <Text style={[st.emptyText, { color: colors.textSecondary }]}>
                  Žiadne odoslané SMS. Twilio integrácia bude aktivovaná v ďalšej verzii.
                </Text>
              </View>
            ) : (
              logs.map((log, i) => (
                <View key={log.id} style={[st.logRow, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                  <Ionicons name={log.status === 'sent' ? 'checkmark-circle' : log.status === 'failed' ? 'close-circle' : 'time'}
                    size={18} color={log.status === 'sent' ? COLORS.success : log.status === 'failed' ? COLORS.error : COLORS.warning} />
                  <View style={{ flex: 1 }}>
                    <Text style={[st.logName, { color: colors.textPrimary }]}>{log.patient_name}</Text>
                    <Text style={[st.logMsg, { color: colors.textSecondary }]} numberOfLines={1}>{log.message}</Text>
                  </View>
                  <Text style={[st.logDate, { color: colors.textSecondary }]}>
                    {new Date(log.sent_at).toLocaleDateString('sk-SK')}
                  </Text>
                </View>
              ))
            )}

            <View style={[st.info, { backgroundColor: dark ? 'rgba(26,82,118,0.15)' : COLORS.infoBg }]}>
              <Ionicons name="information-circle" size={14} color={COLORS.info} />
              <Text style={[st.infoText, { color: colors.textSecondary }]}>
                SMS pripomienky vyžadujú Twilio účet. Integrácia bude dostupná v ďalšej verzii.
              </Text>
            </View>
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: SPACING.xl },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: SPACING.lg },
  statCard: { flex: 1, borderRadius: RADII.md, borderWidth: 1, padding: 14, alignItems: 'center' },
  statNum: { fontSize: 24, fontWeight: '800' },
  statLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', marginTop: 2 },

  card: { borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.lg, marginBottom: SPACING.lg },
  cardTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12 },

  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  settingLabel: { fontSize: 13, fontWeight: '600', flex: 1, paddingRight: 10 },

  tplRow: { paddingVertical: 10 },
  tplType: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  tplMsg: { fontSize: 12, marginTop: 4, lineHeight: 18, fontStyle: 'italic' },

  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },

  empty: { borderRadius: RADII.lg, borderWidth: 1, padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 12, textAlign: 'center', marginTop: 8, lineHeight: 18 },

  logRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: RADII.md, borderWidth: 1, padding: 12, marginBottom: 6 },
  logName: { fontSize: 13, fontWeight: '600' },
  logMsg: { fontSize: 10, marginTop: 2 },
  logDate: { fontSize: 10 },

  info: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: RADII.sm, alignItems: 'flex-start', marginTop: SPACING.lg },
  infoText: { flex: 1, fontSize: 11, lineHeight: 16 },
});
