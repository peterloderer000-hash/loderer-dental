import React, { useState, useEffect } from 'react';
import {
  Alert, Platform, ScrollView, StyleSheet,
  Switch, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HeroHeader from '../../components/ui/HeroHeader';
import { supabase } from '../../supabase';
import { COLORS, RADII, SHADOWS, TYPO } from '../../styles/theme';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';
import { clearAllCache } from '../../utils/offlineCache';

const PERMISSIONS = [
  { label: 'Live prehľad termínov', allowed: true  },
  { label: 'Príchody pacientov',    allowed: true  },
  { label: 'Správa čakárne',        allowed: true  },
  { label: 'Platby a checkout',     allowed: true  },
  { label: 'Medicínske záznamy',    allowed: false },
  { label: 'Štatistiky doktora',    allowed: false },
  { label: 'AI asistent',           allowed: false },
];

export default function ReceptionProfile() {
  const router = useRouter();
  const { colors, dark, toggle: toggleTheme } = useAppTheme();
  const [fullName, setFullName] = useState('');
  const [email,    setEmail]    = useState('');
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }
        setEmail(user.email ?? '');
        const { data } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle();
        setFullName(data?.full_name ?? '');
      } catch (e) {
        console.error('Reception profile load error:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleLogout() {
    try { await clearAllCache(); } catch (_) {}
    // Rovnaký signOut ako doctor/patient (bez scope: 'local')
    try { await supabase.auth.signOut(); } catch (_) {}
    // Manuálne vymaž Supabase auth dáta z AsyncStorage ako failsafe
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const authKeys = allKeys.filter(k =>
        k.includes('supabase') || k.includes('sb-') || k.includes('auth-token')
      );
      if (authKeys.length > 0) await AsyncStorage.multiRemove(authKeys);
    } catch (_) {}
    // Vždy naviguj na login
    if (Platform.OS === 'web') {
      window.location.href = '/';
    } else {
      router.replace('/');
    }
  }

  const initials = fullName.trim().split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '🏥';

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.esp }} edges={['top']}>
        <View style={{ flex: 1, backgroundColor: colors.bg2, padding: 16 }}>
          <SkeletonList count={5} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.esp }} edges={['top']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <HeroHeader
          title={fullName || 'Recepcia'}
          subtitle={email}
          icon="person-circle-outline"
          bottomElement={
            <View style={{ alignItems: 'center', gap: 8 }}>
              <View style={s.avatar}>
                <Text style={s.avatarInitials}>{initials}</Text>
              </View>
              <View style={s.roleBadge}>
                <Text style={s.roleText}>🏥  Recepcia</Text>
              </View>
            </View>
          }
        />

        <View style={{ backgroundColor: colors.bg2, padding: 16, gap: 12 }}>
          {/* Nastavenia */}
          <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, SHADOWS.sm]}>
            <Text style={[s.cardTitle, { color: colors.textSecondary }]}>NASTAVENIA</Text>
            <View style={s.toggleRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[s.toggleIcon, { backgroundColor: dark ? COLORS.esp : COLORS.bg2 }]}>
                  <Ionicons name={dark ? 'moon' : 'moon-outline'} size={18} color={dark ? COLORS.sand : COLORS.wal} />
                </View>
                <View>
                  <Text style={[s.toggleLabel, { color: colors.textPrimary }]}>Tmavý režim</Text>
                  <Text style={[s.toggleSub, { color: colors.textSecondary }]}>{dark ? 'Zapnutý' : 'Vypnutý'}</Text>
                </View>
              </View>
              <Switch
                value={dark}
                onValueChange={toggleTheme}
                trackColor={{ false: COLORS.bg3, true: COLORS.wal }}
                thumbColor={dark ? COLORS.cream : '#fff'}
                ios_backgroundColor={COLORS.bg3}
              />
            </View>
          </View>

          {/* Povolenia */}
          <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, SHADOWS.sm]}>
            <Text style={[s.cardTitle, { color: colors.textSecondary }]}>POVOLENÝ PRÍSTUP</Text>
            <View style={{ gap: 0 }}>
              {PERMISSIONS.map((p, idx) => (
                <View
                  key={p.label}
                  style={[
                    s.permRow,
                    idx < PERMISSIONS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.bg3 },
                  ]}
                >
                  <Ionicons
                    name={p.allowed ? 'checkmark-circle' : 'close-circle'}
                    size={18}
                    color={p.allowed ? COLORS.success : COLORS.error}
                  />
                  <Text style={[s.permLabel, { color: p.allowed ? colors.textPrimary : colors.textSecondary }]}>
                    {p.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Account info */}
          <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, SHADOWS.sm]}>
            <Text style={[s.cardTitle, { color: colors.textSecondary }]}>MÔJ ÚČET</Text>
            <View style={[s.infoRow, { borderBottomColor: colors.bg3 }]}>
              <View style={[s.infoIcon, { backgroundColor: colors.bg2 }]}>
                <Ionicons name="person-outline" size={16} color={COLORS.wal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.infoLabel, { color: colors.textSecondary }]}>Meno</Text>
                <Text style={[s.infoValue, { color: colors.textPrimary }]}>{fullName || '—'}</Text>
              </View>
            </View>
            <View style={[s.infoRow, { borderBottomWidth: 0 }]}>
              <View style={[s.infoIcon, { backgroundColor: colors.bg2 }]}>
                <Ionicons name="mail-outline" size={16} color={COLORS.wal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.infoLabel, { color: colors.textSecondary }]}>Email</Text>
                <Text style={[s.infoValue, { color: colors.textPrimary }]}>{email || '—'}</Text>
              </View>
            </View>
          </View>

          {/* Logout */}
          <TouchableOpacity style={[s.logoutBtn, { backgroundColor: colors.cardBg, borderColor: COLORS.errorBg }]} onPress={handleLogout} activeOpacity={0.85}>
            <Ionicons name="log-out-outline" size={18} color={COLORS.error} />
            <Text style={s.logoutText}>Odhlásiť sa</Text>
          </TouchableOpacity>

          <Text style={[s.version, { color: colors.textSecondary }]}>Loderer Dental · Recepcia · v1.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  hero: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28, alignItems: 'center', overflow: 'hidden', gap: 6 },
  circle: { position: 'absolute', borderRadius: 999, backgroundColor: '#FAF6F0' },

  avatarWrap: { marginBottom: 10 },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: COLORS.sand },
  avatarInitials: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 28, color: COLORS.cream },

  heroName:  { ...TYPO.h2, color: '#FAF6F0', marginBottom: 4 },
  roleBadge: { backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: RADII.full, paddingHorizontal: 14, paddingVertical: 5, marginBottom: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  roleText:  { fontFamily: 'DMSans_500Medium', fontSize: 12, color: COLORS.sand },
  heroEmail: { fontFamily: 'DMSans_400Regular', fontSize: 11, color: 'rgba(196,168,130,0.6)' },

  card:      { borderRadius: RADII.lg, padding: 16, borderWidth: 1 },
  cardTitle: { ...TYPO.label, marginBottom: 14 },

  toggleRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleIcon: { width: 36, height: 36, borderRadius: RADII.sm, alignItems: 'center', justifyContent: 'center' },
  toggleLabel:{ fontFamily: 'DMSans_500Medium', fontSize: 14 },
  toggleSub:  { fontFamily: 'DMSans_400Regular', fontSize: 11, marginTop: 1 },

  permRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  permLabel: { fontFamily: 'DMSans_400Regular', fontSize: 13 },

  infoRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
  infoIcon: { width: 34, height: 34, borderRadius: RADII.sm, alignItems: 'center', justifyContent: 'center' },
  infoLabel:{ fontFamily: 'DMSans_400Regular', fontSize: 11 },
  infoValue:{ fontFamily: 'DMSans_500Medium', fontSize: 13 },

  logoutBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: RADII.lg, paddingVertical: 14, borderWidth: 1.5 },
  logoutText: { fontFamily: 'DMSans_500Medium', fontSize: 15, color: COLORS.error },

  version: { fontFamily: 'DMSans_400Regular', fontSize: 11, textAlign: 'center', marginTop: 4 },
});
