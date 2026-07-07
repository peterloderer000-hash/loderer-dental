import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';

interface EmptyStateProps {
  icon: string;
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
}

export const EmptyState = React.memo(function EmptyState({ icon, title, subtitle, action }: EmptyStateProps) {
  const { colors } = useAppTheme();
  return (
    <View style={s.container}>
      <Text style={s.icon}>{icon}</Text>
      <Text style={[s.title, { color: colors.textPrimary }]}>{title}</Text>
      {!!subtitle && <Text style={[s.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>}
      {!!action && (
        <TouchableOpacity style={s.button} onPress={action.onPress} activeOpacity={0.85}>
          <Text style={s.buttonText}>{action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

export function EmptyAppointments({ onPress }: { onPress?: () => void } = {}) {
  return <EmptyState icon="📅" title="Žiadne termíny" subtitle="Zatiaľ nemáte žiadne naplánované termíny"
    action={onPress ? { label: 'Rezervovať termín', onPress } : undefined} />;
}

export function EmptyPatients() {
  return <EmptyState icon="👥" title="Žiadni pacienti" subtitle="V systéme nie sú žiadni pacienti" />;
}

export function EmptyNotifications() {
  return <EmptyState icon="🔔" title="Žiadne notifikácie" subtitle="Všetko je aktuálne" />;
}

export function EmptyRecall() {
  return <EmptyState icon="👍" title="Všetci pacienti sú aktívni" subtitle="Žiadni pacienti nie sú 6+ mesiacov bez návštevy" />;
}

export function EmptyWaitlist() {
  return <EmptyState icon="✅" title="Poradovník je prázdny" subtitle="Žiadni pacienti nečakajú na termín" />;
}

const s = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  icon:       { fontSize: 64, marginBottom: 16 },
  title:      { fontSize: 20, fontWeight: '700', color: '#121417', marginBottom: 8, textAlign: 'center' },
  subtitle:   { fontSize: 14, color: '#3A4256', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  button:     { backgroundColor: '#3A4256', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  buttonText: { color: '#F5F6F8', fontSize: 15, fontWeight: '700' },
});
