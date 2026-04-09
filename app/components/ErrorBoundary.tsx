import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Ionicons name="warning-outline" size={48} color="#C0392B" />
        </View>
        <Text style={styles.title}>Nastala neočakávaná chyba</Text>
        <Text style={styles.message} numberOfLines={4}>
          {this.state.error?.message ?? 'Neznáma chyba'}
        </Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => this.setState({ hasError: false, error: null })}
          activeOpacity={0.85}
        >
          <Ionicons name="refresh-outline" size={18} color="#fff" />
          <Text style={styles.btnText}>Skúsiť znova</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF7F2', alignItems: 'center', justifyContent: 'center', padding: 32 },
  iconWrap:  { width: 88, height: 88, borderRadius: 44, backgroundColor: '#FDEDEC', alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: 1.5, borderColor: '#F1948A' },
  title:     { fontSize: 20, fontWeight: '700', color: '#2C1F14', marginBottom: 12, textAlign: 'center' },
  message:   { fontSize: 13, color: '#6B4F35', textAlign: 'center', lineHeight: 20, marginBottom: 28, fontFamily: 'monospace' },
  btn:       { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#6B4F35', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 24 },
  btnText:   { fontSize: 14, fontWeight: '700', color: '#fff' },
});
