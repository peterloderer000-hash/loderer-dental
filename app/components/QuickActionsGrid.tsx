import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, SIZES } from '../styles/theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

type Action = {
  label: string;
  icon: IoniconsName;
  route: string;
};

const ACTIONS: Action[] = [
  { label: 'Profil',   icon: 'person-outline',      route: '/(patient)/profile' },
  { label: 'Skóre',   icon: 'bar-chart-outline',    route: '/(patient)/score'   },
  { label: 'AI Chat', icon: 'chatbubble-outline',   route: '/(patient)/chat'    },
  { label: 'Shop',    icon: 'bag-outline',           route: '/(patient)/shop'    },
];

export default function QuickActionsGrid() {
  const router = useRouter();

  return (
    <View style={styles.grid}>
      {ACTIONS.map((action) => (
        <TouchableOpacity
          key={action.label}
          style={styles.tile}
          onPress={() => router.push(action.route as any)}
          activeOpacity={0.75}
        >
          <Ionicons name={action.icon} size={24} color={COLORS.wal} />
          <Text style={styles.tileLabel}>{action.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: SIZES.padding,
    marginBottom: 14,
  },
  tile: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.bg3,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 8,
    shadowColor: COLORS.esp,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  tileLabel: {
    fontSize: 9,
    fontWeight: '500',
    color: COLORS.wal,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
});
