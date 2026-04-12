import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../supabase';
import { COLORS, SIZES } from '../../styles/theme';

type Passport = {
  main_reasons:           string[] | null;
  medical_history:        string[] | null;
  comfort_preferences:    string[] | null;
  aesthetic_expectations: string[] | null;
  lifestyle_habits:       string[] | null;
  allergies:              string | null;
  medications:            string | null;
  dental_history:         string | null;
  fear_level:             string | null;
  investment_preference:  string | null;
  open_question:          string | null;
};

function Section({ title, emoji }: { title: string; emoji: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionEmoji}>{emoji}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function TagList({ items }: { items: string[] | null | undefined }) {
  if (!items || items.length === 0) return <Text style={styles.empty}>Nevyplnené</Text>;
  return (
    <View style={styles.tagWrap}>
      {items.map((item) => (
        <View key={item} style={styles.tag}>
          <Text style={styles.tagText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export default function PatientPassport() {
  const router = useRouter();
  const { patientId, patientName } = useLocalSearchParams<{ patientId: string; patientName: string }>();
  const [passport, setPassport] = useState<Passport | null>(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!patientId) { setLoading(false); return; }
    supabase.from('health_passports').select('*').eq('patient_id', patientId).maybeSingle()
      .then(({ data }) => { setPassport(data ?? null); setLoading(false); });
  }, [patientId]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerSub}>ZDRAVOTNÝ DOTAZNÍK</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>{patientName ?? 'Pacient'}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.wal} size="large" />
        </View>
      ) : !passport ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 48, marginBottom: 14 }}>📋</Text>
          <Text style={styles.emptyTitle}>Dotazník nevyplnený</Text>
          <Text style={styles.emptySub}>Pacient zatiaľ nevyplnil zdravotný dotazník.</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>

          <View style={styles.card}>
            <Section title="Dôvod návštevy" emoji="🎯" />
            <TagList items={passport.main_reasons} />
          </View>

          <View style={styles.card}>
            <Section title="Zdravotná anamnéza" emoji="🏥" />
            <TagList items={passport.medical_history} />
            <InfoRow label="Alergie" value={passport.allergies} />
            <InfoRow label="Lieky" value={passport.medications} />
          </View>

          <View style={styles.card}>
            <Section title="Dentálna história" emoji="🦷" />
            <InfoRow label="Frekvencia návštev" value={passport.dental_history} />
            <InfoRow label="Strach zo zubára" value={passport.fear_level} />
          </View>

          <View style={styles.card}>
            <Section title="Komfort & preferencie" emoji="🎧" />
            <TagList items={passport.comfort_preferences} />
          </View>

          <View style={styles.card}>
            <Section title="Estetické očakávania" emoji="✨" />
            <TagList items={passport.aesthetic_expectations} />
          </View>

          <View style={styles.card}>
            <Section title="Životný štýl" emoji="🌿" />
            <TagList items={passport.lifestyle_habits} />
          </View>

          <View style={styles.card}>
            <Section title="Investícia" emoji="💰" />
            <InfoRow label="Preferencia" value={passport.investment_preference} />
          </View>

          {passport.open_question && (
            <View style={styles.card}>
              <Section title="Otvorená otázka" emoji="💬" />
              <Text style={styles.openText}>{passport.open_question}</Text>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },
  content:{ padding: SIZES.padding },
  center: { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center' },

  header: { backgroundColor: COLORS.esp, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SIZES.padding, paddingTop: 14, paddingBottom: 16 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  headerSub:   { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 3 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },

  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: COLORS.bg3 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionEmoji:  { fontSize: 18 },
  sectionTitle:  { fontSize: 13, fontWeight: '700', color: COLORS.esp, textTransform: 'uppercase', letterSpacing: 0.5 },

  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag:     { backgroundColor: COLORS.bg3, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.sand },
  tagText: { fontSize: 12, color: COLORS.esp, fontWeight: '500' },

  infoRow:   { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'flex-start' },
  infoLabel: { fontSize: 11, fontWeight: '700', color: COLORS.wal, textTransform: 'uppercase', width: 90 },
  infoValue: { flex: 1, fontSize: 13, color: COLORS.esp, lineHeight: 19 },

  empty:      { fontSize: 12, color: '#bbb', fontStyle: 'italic' },
  openText:   { fontSize: 13, color: COLORS.esp, lineHeight: 20, fontStyle: 'italic' },

  emptyTitle: { fontSize: 18, fontWeight: '600', color: COLORS.esp, marginBottom: 8 },
  emptySub:   { fontSize: 13, color: COLORS.wal, textAlign: 'center', paddingHorizontal: 40 },
});
