import { Stack } from 'expo-router';

export default function DoctorLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Doktor Dashboard', headerShown: false }} />
    </Stack>
  );
}
