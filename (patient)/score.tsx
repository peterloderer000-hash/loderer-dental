import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../styles/theme';

export default function ScoreScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>📊</Text>
      <Text style={styles.title}>Dentálne Skóre</Text>
      <Text style={styles.sub}>— Modul 3 —</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.ivory, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 56, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '600', color: COLORS.esp },
  sub: { fontSize: 13, color: COLORS.wal, marginTop: 6, fontStyle: 'italic' },
});
