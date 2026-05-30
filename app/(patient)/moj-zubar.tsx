import React, { useState, useCallback } from 'react';
import {
  Linking, RefreshControl,
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../supabase';
import { COLORS, RADII, SHADOWS, TYPO, GRADIENTS, SPACING } from '../../styles/theme';
import { useAppTheme } from '../../context/ThemeContext';
import { SkeletonList } from '../../components/Skeleton';

type DoctorInfo = {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  avatar_url: string | null;
  specialty: string | null;
  clinic_name: string | null;
  clinic_address: string | null;
};

type OHRow = {
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
  note: string | null;
};

type RatingSummary = { avg: number; count: number };

const OH_DAYS = ['', 'Pondelok', 'Utorok', 'Streda', 'Štvrtok', 'Piatok', 'Sobota', 'Nedeľa'];

function StarRow({ avg, count }: { avg: number; count: number }) {
  const full  = Math.floor(avg);
  const half  = avg - full >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);
  return (
    <View style={s.starRow}>
      {Array.from({ length: full  }).map((_, i) => <Ionicons key={`f${i}`} name="star"         size={16} color="#F39C12" />)}
      {half &&                                       <Ionicons key="h"       name="star-half"   size={16} color="#F39C12" />}
      {Array.from({ length: empty }).map((_, i) => <Ionicons key={`e${i}`} name="star-outline" size={16} color="#F39C12" />)}
      <Text style={s.starAvg}>{avg.toFixed(1)}</Text>
      <Text style={s.starCount}>({count} hodnotení)</Text>
    </View>
  );
}

export default function MojZubarScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [doctor,     setDoctor]     = useState<DoctorInfo | null>(null);
  const [hours,      setHours]      = useState<OHRow[]>([]);
  const [rating,     setRating]     = useState<RatingSummary | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const todayNum = new Date().getDay() === 0 ? 7 : new Date().getDay();

  async function load() {
    try {
      const { data: docs } = await supabase
        .from('profiles')
        .select('id, full_name, phone_number, avatar_url, specialty, clinic_name, clinic_address')
        .eq('role', 'doctor')
        .limit(1);
      const doc = docs?.[0] as DoctorInfo | undefined;
      if (!doc) { setLoading(false); setRefreshing(false); return; }
      setDoctor(doc);

      const { data: oh } = await supabase
        .from('opening_hours')
        .select('day_of_week, open_time, close_time, is_closed, note')
        .eq('doctor_id', doc.id)
        .order('day_of_week');
      setHours((oh ?? []) as OHRow[]);

      const { data: ratings } = await supabase
        .from('appointments')
        .select('patient_rating')
        .eq('doctor_id', doc.id)
        .eq('status', 'completed')
        .not('patient_rating', 'is', null);
      if (ratings && ratings.length > 0) {
        const sum = ratings.reduce((sum: number, r: any) => sum + (r.patient_rating ?? 0), 0);
        setRating({ avg: sum / ratings.length, count: ratings.length });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.esp }}>
        <View style={{ flex: 1, backgroundColor: colors.bg2, padding: 16, paddingTop: 20 }}>
          <SkeletonList count={5} />
        </View>
      </View>
    );
  }

  const FALLBACK: DoctorInfo = {
    id: '',
    full_name: 'MDDr. Loderer',
    phone_number: '+421 000 000 000',
    avatar_url: null,
    specialty: 'Stomatológia',
    clinic_name: 'Loderer Dental',
    clinic_address: null,
  };
  const displayDoctor = doctor ?? FALLBACK;

  const todayRow    = hours.find(h => h.day_of_week === todayNum);
  const isOpenToday = todayRow && !todayRow.is_closed;
  const initials    = (displayDoctor.full_name ?? 'DL').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.esp }}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.gold} />}
      >
        {/* Hero card */}
        <LinearGradient colors={GRADIENTS.hero as [string, string, ...string[]]} style={s.hero}>
          {/* Decorative circles */}
          <View style={[s.circle, { width: 200, height: 200, right: -60, top: -60, opacity: 0.05 }]} />
          <View style={[s.circle, { width: 110, height: 110, right: 30, bottom: 10, opacity: 0.04 }]} />

          {/* Gold double line accent */}
          <View style={s.goldLines}>
            <View style={s.goldLine} />
            <View style={[s.goldLine, { opacity: 0.4 }]} />
          </View>

          <Text style={s.heroLabel}>MÔJ ZUBÁR</Text>

          {/* Avatar */}
          <View style={s.avatarWrap}>
            {displayDoctor.avatar_url ? (
              <Image source={{ uri: displayDoctor.avatar_url }} style={s.avatar} contentFit="cover" />
            ) : (
              <View style={[s.avatar, { alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={s.avatarInitials}>{initials}</Text>
              </View>
            )}
            <View style={s.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
            </View>
          </View>

          <Text style={s.doctorName}>{displayDoctor.full_name ?? 'MDDr. Loderer'}</Text>
          <Text style={s.doctorSpec}>{displayDoctor.specialty ?? 'Zubný lekár'} · Všeobecná stomatológia</Text>

          {/* Rating */}
          {rating && <StarRow avg={rating.avg} count={rating.count} />}

          {/* Today status */}
          <View style={[s.statusBadge, { backgroundColor: isOpenToday ? 'rgba(46,125,94,0.25)' : 'rgba(192,57,43,0.25)' }]}>
            <View style={[s.statusDot, { backgroundColor: isOpenToday ? '#2ECC71' : '#E74C3C' }]} />
            <Text style={[s.statusText, { color: isOpenToday ? '#A8D5C0' : '#F1948A' }]}>
              {isOpenToday
                ? `Dnes otvorené: ${todayRow!.open_time?.slice(0, 5)} – ${todayRow!.close_time?.slice(0, 5)}`
                : 'Dnes zatvorené'}
            </Text>
          </View>
        </LinearGradient>

        <View style={{ backgroundColor: colors.bg2, padding: 16, gap: 12, paddingBottom: 120 }}>

          {/* ── Quick action tlačidlá ── */}
          <View style={qa.row}>
            {displayDoctor.phone_number && (
              <TouchableOpacity style={[qa.btn, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}
                onPress={() => Linking.openURL(`tel:${displayDoctor.phone_number}`)} activeOpacity={0.8}>
                <View style={[qa.icon, { backgroundColor: COLORS.successBg }]}>
                  <Ionicons name="call" size={20} color={COLORS.success} />
                </View>
                <Text style={[qa.label, { color: colors.textPrimary }]}>Volať</Text>
              </TouchableOpacity>
            )}
            {displayDoctor.clinic_address && (
              <TouchableOpacity style={[qa.btn, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}
                onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(displayDoctor.clinic_address!)}`)} activeOpacity={0.8}>
                <View style={[qa.icon, { backgroundColor: '#F5EEF8' }]}>
                  <Ionicons name="navigate" size={20} color="#7D3C98" />
                </View>
                <Text style={[qa.label, { color: colors.textPrimary }]}>Navigovať</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[qa.btn, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}
              onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent((displayDoctor.clinic_address ?? displayDoctor.clinic_name ?? 'Loderer Dental') + ' parkovanie')}`)} activeOpacity={0.8}>
              <View style={[qa.icon, { backgroundColor: COLORS.warningBg }]}>
                <Ionicons name="car" size={20} color={COLORS.warning} />
              </View>
              <Text style={[qa.label, { color: colors.textPrimary }]}>Parkovanie</Text>
            </TouchableOpacity>
          </View>

          {/* Contact */}
          <SectionCard title="KONTAKT" colors={colors}>
            <ContactRow
              icon="call-outline"
              iconBg={COLORS.successBg}
              iconColor={COLORS.success}
              label="Telefón"
              value={displayDoctor.phone_number ?? 'Neuvedené'}
              onPress={displayDoctor.phone_number ? () => Linking.openURL(`tel:${displayDoctor.phone_number}`) : undefined}
              colors={colors}
            />
          </SectionCard>

          {/* Clinic info */}
          {(displayDoctor.clinic_name || displayDoctor.clinic_address) && (
            <SectionCard title="AMBULANCIA" colors={colors}>
              {displayDoctor.clinic_name && (
                <ContactRow
                  icon="business-outline"
                  iconBg={COLORS.infoBg}
                  iconColor={COLORS.info}
                  label="Názov"
                  value={displayDoctor.clinic_name}
                  colors={colors}
                />
              )}
              {displayDoctor.clinic_address && (
                <ContactRow
                  icon="location-outline"
                  iconBg="#F5EEF8"
                  iconColor="#7D3C98"
                  label="Adresa"
                  value={displayDoctor.clinic_address}
                  onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(displayDoctor.clinic_address!)}`)}
                  colors={colors}
                  separator={!!displayDoctor.clinic_name}
                />
              )}
              <ContactRow
                icon="car-outline"
                iconBg={COLORS.warningBg}
                iconColor={COLORS.warning}
                label="Parkovanie"
                value="Parkovisko v blízkosti ambulancie. Platené parkovanie na ulici."
                colors={colors}
                separator
              />
            </SectionCard>
          )}

          {/* Urgentný kontakt */}
          <SectionCard title="URGENTNÁ POMOC" colors={colors}>
            <View style={urg.wrap}>
              <Ionicons name="warning-outline" size={18} color="#E74C3C" />
              <Text style={[urg.text, { color: colors.textSecondary }]}>
                Pri akútnej bolesti alebo úraze nás kontaktujte telefonicky. Mimo ordinačných hodín navštívte pohotovostnú stomatológiu.
              </Text>
            </View>
            {displayDoctor.phone_number && (
              <TouchableOpacity
                style={[urg.callBtn, { backgroundColor: '#FDEDEC', borderColor: '#F1948A' }]}
                onPress={() => Linking.openURL(`tel:${displayDoctor.phone_number}`)}
                activeOpacity={0.8}
              >
                <Ionicons name="call" size={16} color="#E74C3C" />
                <Text style={urg.callText}>Zavolať — {displayDoctor.phone_number}</Text>
              </TouchableOpacity>
            )}
          </SectionCard>

          {/* Opening hours */}
          {hours.length > 0 && (
            <SectionCard title="ORDINAČNÉ HODINY" colors={colors}>
              {hours.map((h, i) => (
                <View
                  key={h.day_of_week}
                  style={[
                    oh.row,
                    i > 0 && { borderTopWidth: 1, borderTopColor: colors.bg3 },
                    h.day_of_week === todayNum && { backgroundColor: COLORS.warningBg },
                  ]}
                >
                  <Text style={[oh.day, { color: h.day_of_week === todayNum ? COLORS.esp : colors.textSecondary, fontFamily: h.day_of_week === todayNum ? 'DMSans_500Medium' : 'DMSans_400Regular' }]}>
                    {OH_DAYS[h.day_of_week]}
                  </Text>
                  {h.is_closed ? (
                    <Text style={oh.closed}>Zatvorené</Text>
                  ) : (
                    <Text style={[oh.time, { color: colors.textPrimary }]}>
                      {h.open_time?.slice(0, 5)} – {h.close_time?.slice(0, 5)}
                    </Text>
                  )}
                  {h.day_of_week === todayNum && (
                    <View style={oh.todayDot} />
                  )}
                </View>
              ))}
            </SectionCard>
          )}

          {/* About (placeholder) */}
          <SectionCard title="O PRAXI" colors={colors}>
            <View style={abt.wrap}>
              <Text style={[abt.text, { color: colors.textSecondary }]}>
                Vitajte v ordinácii MDDr. Loderera. Poskytujeme komplexnú stomatologickú starostlivosť pre celú rodinu — od preventívnych prehliadok až po estetické ošetrenia.
              </Text>
              <View style={abt.badges}>
                {['Prevencia', 'Estetika', 'Implantáty', 'Ortodoncia'].map(tag => (
                  <View key={tag} style={abt.badge}>
                    <Text style={abt.badgeText}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          </SectionCard>

          {/* CTA */}
          <TouchableOpacity
            style={s.ctaBtn}
            onPress={() => router.push('/(patient)/book-appointment')}
            activeOpacity={0.88}
          >
            <LinearGradient colors={GRADIENTS.gold as [string, string, ...string[]]} style={s.ctaGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name="calendar-outline" size={18} color="#fff" />
              <Text style={s.ctaText}>Rezervovať termín</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function SectionCard({ title, children, colors }: { title: string; children: React.ReactNode; colors: any }) {
  return (
    <View style={[sc.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, SHADOWS.sm]}>
      <View style={[sc.header, { backgroundColor: colors.bg2, borderBottomColor: colors.bg3 }]}>
        <Text style={[sc.title, { color: colors.textSecondary }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function ContactRow({ icon, iconBg, iconColor, label, value, onPress, separator, colors }: {
  icon: string; iconBg: string; iconColor: string;
  label: string; value: string;
  onPress?: () => void; separator?: boolean; colors: any;
}) {
  const content = (
    <View style={[cr.row, separator && { borderTopWidth: 1, borderTopColor: colors.bg3 }]}>
      <View style={[cr.iconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={18} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[cr.label, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={[cr.value, { color: colors.textPrimary }]}>{value}</Text>
      </View>
      {onPress && <Ionicons name="chevron-forward" size={16} color={COLORS.sand} />}
    </View>
  );

  if (onPress) {
    return <TouchableOpacity onPress={onPress} activeOpacity={0.8}>{content}</TouchableOpacity>;
  }
  return content;
}

const s = StyleSheet.create({
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { ...TYPO.h2 },

  hero: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28, alignItems: 'center', overflow: 'hidden', gap: 6 },
  circle: { position: 'absolute', borderRadius: 999, backgroundColor: '#FAF6F0' },
  goldLines: { position: 'absolute', top: 28, left: 20, gap: 3 },
  goldLine:  { width: 32, height: 2, backgroundColor: COLORS.gold },

  heroLabel: { ...TYPO.overline, color: COLORS.sand, marginBottom: 8 },

  avatarWrap:      { position: 'relative', marginBottom: 14 },
  avatar:          { width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: COLORS.sand, backgroundColor: COLORS.wal },
  avatarInitials:  { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 32, color: COLORS.cream },
  verifiedBadge:   { position: 'absolute', bottom: 0, right: 0, backgroundColor: COLORS.esp, borderRadius: 12, padding: 1 },

  doctorName: { ...TYPO.h1, color: '#FAF6F0', textAlign: 'center' },
  doctorSpec: { ...TYPO.body, color: 'rgba(196,168,130,0.75)', textAlign: 'center', marginBottom: 8 },

  starRow:   { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 14 },
  starAvg:   { fontFamily: 'DMSans_500Medium', fontSize: 14, color: '#F39C12', marginLeft: 4 },
  starCount: { fontFamily: 'DMSans_400Regular', fontSize: 12, color: 'rgba(196,168,130,0.6)' },

  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: RADII.full, paddingHorizontal: 14, paddingVertical: 7 },
  statusDot:   { width: 7, height: 7, borderRadius: 4 },
  statusText:  { fontFamily: 'DMSans_500Medium', fontSize: 12, letterSpacing: 0.3 },

  ctaBtn:  { borderRadius: RADII.md, overflow: 'hidden' },
  ctaGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
  ctaText: { fontFamily: 'DMSans_500Medium', fontSize: 15, color: '#fff', flex: 1, textAlign: 'center', marginLeft: -26, letterSpacing: 0.3 },
});

const sc = StyleSheet.create({
  card:   { borderRadius: RADII.lg, borderWidth: 1, overflow: 'hidden' },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1 },
  title:  { ...TYPO.label },
});

const cr = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  iconWrap:{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  label:   { ...TYPO.overline, marginBottom: 2 },
  value:   { ...TYPO.bodyMed },
});

const oh = StyleSheet.create({
  row:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11 },
  day:    { width: 82, ...TYPO.body },
  time:   { flex: 1, ...TYPO.bodyMed },
  closed: { flex: 1, fontFamily: 'DMSans_400Regular', fontSize: 13, color: COLORS.sand, fontStyle: 'italic' },
  todayDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.gold },
});

const abt = StyleSheet.create({
  wrap:      { padding: 14, gap: 12 },
  text:      { ...TYPO.body, lineHeight: 22 },
  badges:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge:     { borderRadius: RADII.full, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: COLORS.bg3 },
  badgeText: { fontFamily: 'DMSans_500Medium', fontSize: 11, color: COLORS.wal, letterSpacing: 0.3 },
});

const qa = StyleSheet.create({
  row:   { flexDirection: 'row', gap: 10 },
  btn:   { flex: 1, alignItems: 'center', gap: 8, paddingVertical: 14, borderRadius: RADII.lg, borderWidth: 1, ...SHADOWS.sm },
  icon:  { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: 'DMSans_500Medium', fontSize: 12 },
});

const urg = StyleSheet.create({
  wrap:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, paddingBottom: 10 },
  text:     { flex: 1, ...TYPO.body, lineHeight: 20 },
  callBtn:  { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 14, marginTop: 4, padding: 12, borderRadius: RADII.md, borderWidth: 1 },
  callText: { fontFamily: 'DMSans_500Medium', fontSize: 13, color: '#E74C3C' },
});
