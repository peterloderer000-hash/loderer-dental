import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { ComponentProps } from 'react';
import { COLORS, SIZES } from '../../../styles/theme';
import { useAppTheme } from '../../../context/ThemeContext';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

const ACTIONS: { label: string; icon: IoniconsName; route: string; color: string; bg: string; darkBg: string }[] = [
  { label: 'Rezervovať', icon: 'calendar-outline',    route: '/(patient)/book-appointment', color: COLORS.esp, bg: '#FAF7F2', darkBg: '#3D2E22' },
  { label: 'Termíny',    icon: 'list-outline',        route: '/(patient)/appointments',     color: '#1A5276',  bg: '#EBF5FB', darkBg: '#0D2233' },
  { label: 'Kalkulačka', icon: 'calculator-outline',  route: '/(patient)/calculator',       color: '#7D6608',  bg: '#FEF9E7', darkBg: '#2D2200' },
  { label: 'Zdravie',    icon: 'clipboard-outline',   route: '/(patient)/health-passport',  color: '#17A589',  bg: '#E8F8F5', darkBg: '#0D3B1F' },
  { label: 'Skóre',      icon: 'bar-chart-outline',   route: '/(patient)/score',            color: '#1E8449',  bg: '#EAFAF1', darkBg: '#0D3B1F' },
  { label: 'AI Chat',    icon: 'chatbubble-outline',  route: '/(patient)/chat',             color: '#6C3483',  bg: '#F5EEF8', darkBg: '#1E0D33' },
  { label: 'Recepty',    icon: 'medical-outline',     route: '/(patient)/prescriptions',    color: '#1E8449',  bg: '#EAFAF1', darkBg: '#0D3B1F' },
  { label: 'Správy',    icon: 'mail-outline',        route: '/(patient)/messages',          color: '#1A5276',  bg: '#EBF5FB', darkBg: '#0D2233' },
  { label: 'Liečba',   icon: 'clipboard-outline',   route: '/(patient)/treatment-plan',    color: '#7D3C98',  bg: '#F5EEF8', darkBg: '#1E0D33' },
  { label: 'Rodina',   icon: 'people-outline',      route: '/(patient)/family',            color: '#784212',  bg: '#FEF9E7', darkBg: '#2D2200' },
  { label: 'Platby',   icon: 'card-outline',        route: '/(patient)/payment-history',   color: '#1A5276',  bg: '#EBF5FB', darkBg: '#0D2233' },
  { label: 'Shop',     icon: 'bag-outline',         route: '/(patient)/shop',              color: '#9A7D0A',  bg: '#FEF9E7', darkBg: '#2D2200' },
  { label: 'Môj zubár',icon: 'person-circle-outline',route: '/(patient)/moj-zubar',        color: '#0E6655',  bg: '#E8F8F5', darkBg: '#0D3B1F' },
  { label: 'Súhlasy',  icon: 'shield-checkmark-outline', route: '/(patient)/consents',     color: '#6C3483',  bg: '#F5EEF8', darkBg: '#1E0D33' },
];

export default function QuickActionsGrid() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  return (
    <View style={styles.grid}>
      {ACTIONS.map((a) => (
        <TouchableOpacity
          key={a.label}
          style={[styles.tile, { backgroundColor: dark ? a.darkBg : a.bg, borderColor: colors.bg3 }]}
          onPress={() => router.push(a.route as any)}
          activeOpacity={0.75}
        >
          <View style={[styles.iconWrap, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
            <Ionicons name={a.icon} size={22} color={dark ? colors.textPrimary : a.color} />
          </View>
          <Text style={[styles.tileLabel, { color: dark ? colors.textPrimary : a.color }]}>{a.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: SIZES.padding,
    marginBottom: 14,
  },
  tile: {
    width: '30%',
    flexGrow: 1,
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.bg3,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 8,
    elevation: 1,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.bg3,
  },
  tileLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
});
