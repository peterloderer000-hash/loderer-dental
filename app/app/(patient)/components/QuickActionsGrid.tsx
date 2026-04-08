import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, SIZES } from '../../../styles/theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const ACTIONS: { label: string; icon: IoniconsName; route: string; color: string; bg: string }[] = [
  { label: 'Rezervovať', icon: 'calendar-outline',    route: '/(patient)/book-appointment', color: COLORS.esp, bg: '#FAF7F2' },
  { label: 'Zdravie',    icon: 'clipboard-outline',   route: '/(patient)/health-passport',  color: '#1A5276',  bg: '#EBF5FB' },
  { label: 'Skóre',      icon: 'bar-chart-outline',   route: '/(patient)/score',            color: '#1E8449',  bg: '#EAFAF1' },
  { label: 'AI Chat',    icon: 'chatbubble-outline',  route: '/(patient)/chat',             color: '#6C3483',  bg: '#F5EEF8' },
  { label: 'Profil',     icon: 'person-outline',      route: '/(patient)/profile',          color: COLORS.wal, bg: '#FAF7F2' },
  { label: 'Shop',       icon: 'bag-outline',         route: '/(patient)/shop',             color: '#9A7D0A',  bg: '#FEF9E7' },
];

export default function QuickActionsGrid() {
  const router = useRouter();
  return (
    <View style={styles.grid}>
      {ACTIONS.map((a) => (
        <TouchableOpacity
          key={a.label}
          style={[styles.tile, { backgroundColor: a.bg }]}
          onPress={() => router.push(a.route as any)}
          activeOpacity={0.75}
        >
          <View style={[styles.iconWrap, { backgroundColor: '#fff' }]}>
            <Ionicons name={a.icon} size={22} color={a.color} />
          </View>
          <Text style={[styles.tileLabel, { color: a.color }]}>{a.label}</Text>
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
