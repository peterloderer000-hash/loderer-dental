/**
 * OnboardingTour — feature intro slides
 * Zobrazuje sa raz po prvom prihlásení (AsyncStorage flag)
 */
import React, { useRef, useState } from 'react';
import {
  Animated, Dimensions, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { COLORS, RADII, TYPO, GRADIENTS } from '../styles/theme';

const { width } = Dimensions.get('window');

type Slide = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  color: string;
};

const DOCTOR_SLIDES: Slide[] = [
  { icon: 'calendar', title: 'Správa termínov', description: 'Prehľadný kalendár s farebnými slotmi, rýchle pridanie termínov a realtime notifikácie.', color: '#1A5276' },
  { icon: 'people', title: 'Pacienti na dosah', description: 'Kompletná karta pacienta — história, diagnózy, dentálny graf, liečebné plány a fotodokumentácia.', color: '#2E7D5E' },
  { icon: 'bar-chart', title: 'Štatistiky & KPI', description: 'Sledujte výkon kliniky — tržby, vyťaženosť, hodnotenia a trendy v reálnom čase.', color: '#6C3483' },
  { icon: 'search', title: 'Globálne vyhľadávanie', description: 'Nájdite pacienta, termín, diagnózu alebo službu z jedného miesta.', color: '#3A4256' },
  { icon: 'document-text', title: 'PDF & Reporty', description: 'Generujte faktúry, mesačné reporty a liečebné plány jedným kliknutím.', color: '#922B21' },
];

const PATIENT_SLIDES: Slide[] = [
  { icon: 'calendar', title: 'Rezervácia online', description: 'Vyberte si termín, službu a lekára pohodlne z mobilu — 24/7.', color: '#1A5276' },
  { icon: 'heart', title: 'Zdravotný prehľad', description: 'Vaše dentálne skóre, história návštev a odporúčania na jednom mieste.', color: '#2E7D5E' },
  { icon: 'notifications', title: 'Pripomienky', description: 'Nikdy nezabudnete na termín — notifikácie vás upozornia včas.', color: '#6C3483' },
  { icon: 'document', title: 'Formuláre digitálne', description: 'Súhlasy a dotazníky vyplníte online ešte pred návštevou.', color: '#3A4256' },
  { icon: 'star', title: 'Hodnotenia', description: 'Ohodnoťte návštevu a pomôžte nám zlepšovať služby.', color: '#922B21' },
];

const STORAGE_KEY_DOCTOR = '@loderer_onboarding_doctor_done';
const STORAGE_KEY_PATIENT = '@loderer_onboarding_patient_done';

export function getOnboardingKey(role: 'doctor' | 'patient') {
  return role === 'doctor' ? STORAGE_KEY_DOCTOR : STORAGE_KEY_PATIENT;
}

type Props = {
  role: 'doctor' | 'patient';
  onFinish: () => void;
};

export default function OnboardingTour({ role, onFinish }: Props) {
  const slides = role === 'doctor' ? DOCTOR_SLIDES : PATIENT_SLIDES;
  const [current, setCurrent] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef<any>(null);

  function goTo(index: number) {
    flatListRef.current?.scrollToOffset({ offset: index * width, animated: true });
    setCurrent(index);
    Haptics.selectionAsync();
  }

  async function handleFinish() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await AsyncStorage.setItem(getOnboardingKey(role), '1');
    onFinish();
  }

  const isLast = current === slides.length - 1;

  return (
    <LinearGradient colors={GRADIENTS.hero as [string, string, ...string[]]} style={styles.container}>
      <Animated.FlatList
        ref={flatListRef}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => String(i)}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
        onMomentumScrollEnd={(e: any) => setCurrent(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }: { item: Slide }) => (
          <View style={styles.slide}>
            <View style={[styles.iconCircle, { backgroundColor: item.color + '33' }]}>
              <Ionicons name={item.icon} size={56} color={item.color} />
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.desc}>{item.description}</Text>
          </View>
        )}
      />

      {/* Dots */}
      <View style={styles.dots}>
        {slides.map((_, i) => {
          const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
          const dotWidth = scrollX.interpolate({ inputRange, outputRange: [8, 24, 8], extrapolate: 'clamp' });
          const opacity = scrollX.interpolate({ inputRange, outputRange: [0.4, 1, 0.4], extrapolate: 'clamp' });
          return <Animated.View key={i} style={[styles.dot, { width: dotWidth, opacity }]} />;
        })}
      </View>

      {/* Buttons */}
      <View style={styles.footer}>
        {!isLast ? (
          <>
            <TouchableOpacity onPress={handleFinish} activeOpacity={0.7}>
              <Text style={styles.skipText}>Preskočiť</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.nextBtn} onPress={() => goTo(current + 1)} activeOpacity={0.8}>
              <Text style={styles.nextText}>Ďalej</Text>
              <Ionicons name="arrow-forward" size={16} color="#F5F6F8" />
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={[styles.nextBtn, { flex: 1 }]} onPress={handleFinish} activeOpacity={0.8}>
            <Text style={styles.nextText}>Začať používať</Text>
            <Ionicons name="checkmark-circle" size={16} color="#F5F6F8" />
          </TouchableOpacity>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  slide: { width, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingTop: 80 },
  iconCircle: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center', marginBottom: 32 },
  title: { ...TYPO.h1, color: '#F5F6F8', textAlign: 'center', marginBottom: 16 },
  desc: { ...TYPO.body, color: COLORS.sand, textAlign: 'center', lineHeight: 22, fontSize: 15 },
  dots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 32 },
  dot: { height: 8, borderRadius: 4, backgroundColor: COLORS.gold },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 48 },
  skipText: { fontFamily: 'DMSans_500Medium', fontSize: 14, color: COLORS.sand },
  nextBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.gold, borderRadius: RADII.md, paddingHorizontal: 24, paddingVertical: 14, justifyContent: 'center' },
  nextText: { fontFamily: 'DMSans_500Medium', fontSize: 14, color: '#F5F6F8' },
});
