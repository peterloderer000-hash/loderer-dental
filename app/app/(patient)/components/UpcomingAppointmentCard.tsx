import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../../../styles/theme';

type Props = {
  date: string;
  doctor: string;
  type: string;
  onPress?: () => void;
  onCancel?: () => void;
};

export default function UpcomingAppointmentCard({ date, doctor, type, onPress, onCancel }: Props) {
  return (
    <View style={styles.card}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        <Text style={styles.label}>NAJBLIŽŠÍ TERMÍN</Text>
        <Text style={styles.date}>{date}</Text>
        <View style={styles.divider} />
        <View style={styles.row}>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>DOKTOR</Text>
            <Text style={styles.infoValue}>{doctor}</Text>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>TYP</Text>
            <Text style={styles.infoValue}>{type}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.sand} />
        </View>
      </TouchableOpacity>

      {onCancel && (
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
          <Ionicons name="close-circle-outline" size={15} color="#F1948A" />
          <Text style={styles.cancelText}>Zrušiť termín</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.esp, borderRadius: SIZES.radius + 2, padding: 18,
    marginHorizontal: SIZES.padding, marginBottom: 14,
    borderWidth: 1, borderColor: COLORS.wal,
    shadowColor: '#1a0e08', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 5,
  },
  label:    { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '500', textTransform: 'uppercase', marginBottom: 6 },
  date:     { fontSize: 19, fontWeight: '500', color: '#fff', marginBottom: 14 },
  divider:  { height: 1, backgroundColor: COLORS.wal, marginBottom: 12, opacity: 0.5 },
  row:      { flexDirection: 'row', alignItems: 'center' },
  infoBlock:{ flex: 1 },
  infoLabel:{ fontSize: 8, letterSpacing: 1.5, color: COLORS.sand, fontWeight: '500', textTransform: 'uppercase', marginBottom: 2 },
  infoValue:{ fontSize: 12, color: COLORS.cream, fontWeight: '500' },

  cancelBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  cancelText:{ fontSize: 12, color: '#F1948A', fontWeight: '600' },
});
