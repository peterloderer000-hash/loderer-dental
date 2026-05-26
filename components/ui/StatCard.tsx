import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppCard from './AppCard';
import { COLORS, RADII, SPACING, TYPO } from '../../styles/theme';

interface Props {
  label: string;
  value: string | number;
  unit?: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color?: string;
  trend?: string;
  trendUp?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

function StatCard({ label, value, unit, icon, color = COLORS.gold, trend, trendUp, onPress, style }: Props) {
  return (
    <AppCard onPress={onPress} style={StyleSheet.flatten([s.card, style])} shadow="card">
      <View style={s.iconRow}>
        <View style={[s.iconCircle, { backgroundColor: color + '18' }]}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
        {trend && (
          <View style={[s.trendBadge, { backgroundColor: trendUp ? COLORS.successBg : COLORS.errorBg }]}>
            <Ionicons name={trendUp ? 'trending-up' : 'trending-down'} size={10} color={trendUp ? COLORS.success : COLORS.error} />
            <Text style={[s.trendText, { color: trendUp ? COLORS.success : COLORS.error }]}>{trend}</Text>
          </View>
        )}
      </View>
      <Text style={s.value}>
        {value}{unit ? <Text style={s.unit}> {unit}</Text> : null}
      </Text>
      <Text style={s.label}>{label}</Text>
    </AppCard>
  );
}

export default React.memo(StatCard);

const s = StyleSheet.create({
  card:       { flex: 1, padding: SPACING.lg, gap: SPACING.xs },
  iconRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.xs },
  iconCircle: { width: 36, height: 36, borderRadius: RADII.sm, alignItems: 'center', justifyContent: 'center' },
  trendBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: RADII.pill, paddingHorizontal: 6, paddingVertical: 3 },
  trendText:  { ...TYPO.caption, fontSize: 9 },
  value:      { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 30, lineHeight: 36, color: COLORS.esp },
  unit:       { fontFamily: 'DMSans_400Regular', fontSize: 13, color: COLORS.wal },
  label:      { ...TYPO.label, color: COLORS.wal },
});
