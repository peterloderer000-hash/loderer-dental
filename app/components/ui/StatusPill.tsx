import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { COLORS, RADII } from '../../styles/theme';

type Status = 'scheduled' | 'arrived' | 'completed' | 'cancelled' | 'pending' | 'paid' | 'unpaid' | 'partial';

interface Props {
  status: Status;
  style?: ViewStyle;
  size?: 'sm' | 'md';
}

const STATUS_CONFIG: Record<Status, { label: string; bg: string; text: string; border: string }> = {
  scheduled: { label: 'Naplánovaný', bg: '#EBF5FB', text: '#1A5276', border: '#AED6F1' },
  arrived:   { label: 'Prišiel',     bg: '#EDF7F3', text: '#2E7D5E', border: '#A8D5C0' },
  completed: { label: 'Dokončený',   bg: '#F0FAF5', text: '#1E6B45', border: '#A8D5B8' },
  cancelled: { label: 'Zrušený',     bg: '#FDEDEC', text: '#922B21', border: '#F1948A' },
  pending:   { label: 'Čaká',        bg: '#FEF9E7', text: '#7D6608', border: '#F9E79F' },
  paid:      { label: 'Zaplatené',   bg: COLORS.successBg, text: COLORS.success, border: '#A8D5C0' },
  unpaid:    { label: 'Nezapl.',     bg: COLORS.errorBg,   text: COLORS.error,   border: '#F1948A' },
  partial:   { label: 'Čiastočne',   bg: COLORS.warningBg, text: COLORS.warning, border: '#F0B97D' },
};

function StatusPill({ status, style, size = 'sm' }: Props) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.scheduled;
  const isSmall = size === 'sm';

  return (
    <View style={[
      s.pill,
      { backgroundColor: cfg.bg, borderColor: cfg.border },
      isSmall ? s.sm : s.md,
      style,
    ]}>
      <Text style={[s.label, { color: cfg.text }, isSmall ? s.labelSm : s.labelMd]}>
        {cfg.label}
      </Text>
    </View>
  );
}

export default React.memo(StatusPill);

const s = StyleSheet.create({
  pill:    { borderRadius: RADII.pill, borderWidth: 1, alignSelf: 'flex-start', alignItems: 'center', justifyContent: 'center' },
  sm:      { paddingHorizontal: 10, paddingVertical: 4 },
  md:      { paddingHorizontal: 12, paddingVertical: 5 },
  label:   { fontFamily: 'DMSans_500Medium' },
  labelSm: { fontSize: 10, letterSpacing: 0.3 },
  labelMd: { fontSize: 11, letterSpacing: 0.3 },
});
