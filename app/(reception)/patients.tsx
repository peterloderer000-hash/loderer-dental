import React, { useState, useEffect, useMemo } from 'react';
import {
  ActivityIndicator, FlatList, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import HeroHeader from '../../components/ui/HeroHeader';
import { supabase } from '../../supabase';
import { COLORS, RADII, SHADOWS, TYPO, GRADIENTS } from '../../styles/theme';
import { SkeletonList } from '../../components/Skeleton';
import { AnimatedListItem } from '../../components/ui/AnimatedListItem';
import { useAppTheme } from '../../context/ThemeContext';

type Patient = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
};

export default function ReceptionPatients() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  const [patients, setPatients]   = useState<Patient[]>([]);
  const [loading, setLoading]     = useState(true);
  const [query, setQuery]         = useState('');

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name, email, phone, date_of_birth')
      .eq('role', 'patient')
      .order('full_name')
      .then(({ data }) => {
        setPatients((data as Patient[]) ?? []);
        setLoading(false);
      })
      .catch((err) => { console.error(err); setLoading(false); });
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return patients;
    const q = query.toLowerCase();
    return patients.filter(p =>
      p.full_name?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q) ||
      p.phone?.includes(q)
    );
  }, [patients, query]);

  const initials = (name: string) =>
    name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.esp }} edges={['top']}>
      <HeroHeader
        title="Pacienti"
        subtitle={`${patients.length} registrovaných`}
        icon="people-outline"
        bottomElement={
          <View style={[s.searchWrap, { backgroundColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)' }]}>
            <Ionicons name="search-outline" size={18} color="rgba(255,255,255,0.6)" />
            <TextInput
              style={s.searchInput}
              placeholder="Hľadať podľa mena, emailu, tel..."
              placeholderTextColor="rgba(255,255,255,0.45)"
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              autoCorrect={false}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            )}
          </View>
        }
      />

      <View style={[s.body, { backgroundColor: colors.bg2 }]}>
        {loading ? (
          <View style={{ flex: 1, backgroundColor: colors.bg2, padding: 16 }}>
            <SkeletonList count={5} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="people-outline" size={48} color={COLORS.sand} />
            <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
              {query ? 'Žiadne výsledky' : 'Žiadni pacienti'}
            </Text>
            <Text style={[s.emptySub, { color: colors.textSecondary }]}>
              {query ? `Nenašiel sa žiaden pacient pre „${query}"` : 'V systéme ešte nie sú registrovaní pacienti'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={p => p.id}
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            renderItem={({ item, index: _aidx }) => (
              <AnimatedListItem index={_aidx}>
              <TouchableOpacity
                style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, SHADOWS.card]}
                onPress={() => router.push(`/(doctor)/patient-detail?id=${item.id}`)}
                activeOpacity={0.85}
              >
                {/* Left accent */}
                <View style={s.accent} />

                {/* Avatar */}
                <View style={[s.avatarCircle, { backgroundColor: dark ? '#1A120B' : COLORS.esp }]}>
                  <Text style={s.avatarText}>{initials(item.full_name ?? 'P')}</Text>
                </View>

                {/* Info */}
                <View style={{ flex: 1 }}>
                  <Text style={[s.name, { color: colors.textPrimary }]} numberOfLines={1}>
                    {item.full_name}
                  </Text>
                  {item.phone && (
                    <Text style={[s.sub, { color: colors.textSecondary }]} numberOfLines={1}>
                      {item.phone}
                    </Text>
                  )}
                  {item.email && !item.phone && (
                    <Text style={[s.sub, { color: colors.textSecondary }]} numberOfLines={1}>
                      {item.email}
                    </Text>
                  )}
                </View>

                <Ionicons name="chevron-forward" size={16} color={COLORS.sand} />
              </TouchableOpacity>
              </AnimatedListItem>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  hero: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 2,
  },
  heroLabel: {
    ...TYPO.overline,
    color: COLORS.sand,
    marginBottom: 2,
  },
  heroTitle: {
    ...TYPO.h1,
    color: '#FAF6F0',
    marginBottom: 2,
  },
  heroSub: {
    ...TYPO.body,
    color: 'rgba(196,168,130,0.8)',
    marginBottom: 14,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: RADII.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  searchInput: {
    flex: 1,
    ...TYPO.body,
    color: '#FAF6F0',
    padding: 0,
  },
  body: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 },
  emptyTitle: { ...TYPO.h2, textAlign: 'center' },
  emptySub:   { ...TYPO.body, textAlign: 'center' },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADII.lg,
    borderWidth: 1,
    overflow: 'hidden',
    paddingVertical: 14,
    paddingRight: 14,
    paddingLeft: 18,
    gap: 12,
  },
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: COLORS.gold,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.esp,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...TYPO.bodyMedium, color: COLORS.sand },
  name: { ...TYPO.bodyMed, marginBottom: 2 },
  sub:  { ...TYPO.bodySm },
});
