import React from 'react';
import { StyleSheet, View } from 'react-native';

interface Props {
  children: React.ReactNode;
  delay?: number;
}

export function ScreenWrapper({ children }: Props) {
  return <View style={s.root}>{children}</View>;
}

const s = StyleSheet.create({
  root: { flex: 1 },
});
