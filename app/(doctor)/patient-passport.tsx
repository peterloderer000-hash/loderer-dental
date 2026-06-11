import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme, AppColors } from '../../context/ThemeContext';

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
  // Základné údaje
  blood_type:              string | null;
  insurance_provider:      string | null;
  insurance_number:        string | null;
  emergency_contact_name:  string | null;
  emergency_contact_phone: string | null;
  is_pregnant:             boolean | null;
  last_dental_visit:       string | null;
};

function Section({ title, emoji, colors }: { title: string; emoji: string; colors: AppColors }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionEmoji}>{emoji}</Text>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
    </View>
  );
}

function InfoRow({ label, value, colors }: { label: string; value: string | null | undefined; colors: AppColors }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

function TagList({ items, colors }: { items: string[] | null | undefined; colors: AppColors }) {
  if (!items || items.length === 0) return <Text style={[styles.empty, { color: colors.textSecondary }]}>Nevyplnené</Text>;
  return (
    <View style={styles.tagWrap}>
      {items.map((item) => (
        <View key={item} style={[styles.tag, { backgroundColor: colors.bg3, borderColor: colors.sand }]}>
          <Text style={[styles.tagText, { color: colors.textPrimary }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export default function PatientPassport() {
  const router = useRouter();
  const { patientId, patientName } = useLocalSearchParams<{ patientId: string; patientName: string }>();
  const { colors, dark } = useAppTheme();
  const [passport, setPassport] = useState<Passport | null>(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!patientId) { setLoading(false); return; }
    supabase.from('health_passports').select('*').eq('patient_id', patientId).maybeSingle()
      .then(({ data }) => { setPassport(data ?? null); setLoading(false); }).catch(() => { setLoading(false); });
  }, [patientId]);

  return (
    <View style={[styles.safe, { backgroundColor: colors.esp }]}>
      <HeroHeader
        title="Zdravotný dotazník"
        subtitle={patientName ?? 'Pacient'}
        icon="fitness-outline"
        onBack={() => router.back()}
      />

      {loading ? (
        <View style={{ flex: 1, backgroundColor: colors.bg2, padding: SPACING.xl, paddingTop: 16 }}>
          <SkeletonList count={5} />
        </View>
      ) : !passport ? (
        <View style={[styles.center, { backgroundColor: colors.bg2 }]}>
          <Text style={{ fontSize: 48, marginBottom: 14 }}>📋</Text>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Dotazník nevyplnený</Text>
          <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Pacient zatiaľ nevyplnil zdravotný dotazník.</Text>
        </View>
      ) : (
        <ScrollView style={[styles.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>

          {/* ── KRITICKÉ UPOZORNENIA ───────────────────────────────────── */}
          {(passport.allergies || passport.is_pregnant ||
            (passport.medical_history && passport.medical_history.length > 0)) && (
            <View style={styles.alertBox}>
              <View style={styles.alertHeader}>
                <Ionicons name="warning" size={18} color="#C0392B" />
                <Text style={styles.alertTitle}>KRITICKÉ UPOZORNENIA</Text>
              </View>
              {passport.allergies && (
                <View style={styles.alertRow}>
                  <Text style={styles.alertEmoji}>🚨</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.alertLbl}>ALERGIE</Text>
                    <Text style={styles.alertText}>{passport.allergies}</Text>
                  </View>
                </View>
              )}
              {passport.is_pregnant && (
                <View style={styles.alertRow}>
                  <Text style={styles.alertEmoji}>🤰</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.alertLbl}>TEHOTENSTVO / DOJČENIE</Text>
                    <Text style={styles.alertText}>Pacient/ka je tehotná alebo dojčí</Text>
                  </View>
                </View>
              )}
              {passport.medical_history && passport.medical_history.length > 0 && (
                <View style={styles.alertRow}>
                  <Text style={styles.alertEmoji}>🏥</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.alertLbl}>CHRONICKÉ OCHORENIA</Text>
                    <Text style={styles.alertText}>{passport.medical_history.join(', ')}</Text>
                  </View>
                </View>
              )}
              {passport.medications && (
                <View style={styles.alertRow}>
                  <Text style={styles.alertEmoji}>💊</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.alertLbl}>LIEKY</Text>
                    <Text style={styles.alertText}>{passport.medications}</Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* ── ZÁKLADNÉ ÚDAJE ─────────────────────────────────────────── */}
          {(passport.blood_type || passport.insurance_provider ||
            passport.emergency_contact_name || passport.last_dental_visit) && (
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <Section title="Základné údaje" emoji="📇" colors={colors} />
              {passport.blood_type && (
                <View style={styles.bloodRow}>
                  <Text style={[styles.bloodLbl, { color: colors.textPrimary }]}>🩸 Krvná skupina</Text>
                  <View style={styles.bloodBadge}>
                    <Text style={styles.bloodText}>{passport.blood_type}</Text>
                  </View>
                </View>
              )}
              <InfoRow label="Poisťovňa" value={passport.insurance_provider} colors={colors} />
              <InfoRow label="Poistenec" value={passport.insurance_number} colors={colors} />
              <InfoRow label="Núdz. kontakt" value={
                passport.emergency_contact_name
                  ? `${passport.emergency_contact_name}${passport.emergency_contact_phone ? ' · ' + passport.emergency_contact_phone : ''}`
                  : null
              } colors={colors} />
              <InfoRow label="Posl. u zubára" value={passport.last_dental_visit} colors={colors} />
            </View>
          )}

          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Section title="Dôvod návštevy" emoji="🎯" colors={colors} />
            <TagList items={passport.main_reasons} colors={colors} />
          </View>

          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Section title="Zdravotná anamnéza" emoji="🏥" colors={colors} />
            <TagList items={passport.medical_history} colors={colors} />
            <InfoRow label="Alergie" value={passport.allergies} colors={colors} />
            <InfoRow label="Lieky" value={passport.medications} colors={colors} />
          </View>

          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Section title="Dentálna história" emoji="🦷" colors={colors} />
            <InfoRow label="Frekvencia návštev" value={passport.dental_history} colors={colors} />
            <InfoRow label="Strach zo zubára" value={passport.fear_level} colors={colors} />
          </View>

          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Section title="Komfort & preferencie" emoji="🎧" colors={colors} />
            <TagList items={passport.comfort_preferences} colors={colors} />
          </View>

          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Section title="Estetické očakávania" emoji="✨" colors={colors} />
            <TagList items={passport.aesthetic_expectations} colors={colors} />
          </View>

          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Section title="Životný štýl" emoji="🌿" colors={colors} />
            <TagList items={passport.lifestyle_habits} colors={colors} />
          </View>

          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Section title="Investícia" emoji="💰" colors={colors} />
            <InfoRow label="Preferencia" value={passport.investment_preference} colors={colors} />
          </View>

          {passport.open_question && (
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
              <Section title="Otvorená otázka" emoji="💬" colors={colors} />
              <Text style={[styles.openText, { color: colors.textPrimary }]}>{passport.open_question}</Text>
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },
  content:{ padding: SPACING.xl },
  center: { flex: 1, backgroundColor: COLORS.bg2, alignItems: 'center', justifyContent: 'center' },

  header: { backgroundColor: COLORS.esp, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SPACING.xl, paddingTop: 14, paddingBottom: 16 },
  backBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  headerSub:   { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 3 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },

  card: { backgroundColor: COLORS.cream, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: COLORS.bg3 },

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

  // Kritické upozornenia
  alertBox:    { backgroundColor: '#FDEDEC', borderWidth: 1.5, borderColor: '#E74C3C', borderRadius: 14, padding: 14, marginBottom: 14 },
  alertHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#F5B7B1' },
  alertTitle:  { fontSize: 12, fontWeight: '800', color: '#C0392B', letterSpacing: 1.5 },
  alertRow:    { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 6 },
  alertEmoji:  { fontSize: 18, width: 24, textAlign: 'center' },
  alertLbl:    { fontSize: 10, fontWeight: '700', color: '#C0392B', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 },
  alertText:   { fontSize: 13, color: '#6A1A12', lineHeight: 18, fontWeight: '500' },

  // Blood type
  bloodRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, marginBottom: 2 },
  bloodLbl:    { fontSize: 12, fontWeight: '600', color: COLORS.esp },
  bloodBadge:  { backgroundColor: '#FDEDEC', borderWidth: 1.5, borderColor: '#E74C3C', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 4 },
  bloodText:   { fontSize: 14, fontWeight: '800', color: '#C0392B', letterSpacing: 1 } });
