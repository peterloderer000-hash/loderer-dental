import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { COLORS, RADII, SPACING, TYPO } from '../../styles/theme';

interface Props {
  title: string;
  subtitle?: string;
  action?: { text: string; onPress: () => void };
  style?: ViewStyle;
}

const SectionHeader = React.memo(function SectionHeader({ title, subtitle, action, style }: Props) {
  return (
    <View style={[s.row, style]}>
      <View style={s.leftAccent} />
      <View style={{ flex: 1 }}>
        <Text style={s.title}>{title}</Text>
        {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
      </View>
      {action && (
        <TouchableOpacity onPress={action.onPress} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.action}>{action.text}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

export default SectionHeader;

const s = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md },
  leftAccent:{ width: 3, height: 18, borderRadius: RADII.pill, backgroundColor: COLORS.gold },
  title:     { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 20, lineHeight: 26, color: COLORS.esp },
  subtitle:  { ...TYPO.bodySm, color: COLORS.wal, marginTop: 2 },
  action:    { fontSize: 14, color: '#3A4256', fontWeight: '600' },
});
