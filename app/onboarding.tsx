import React, { useRef, useState } from 'react';
import {
  Dimensions, FlatList, StyleSheet, Text,
  TouchableOpacity, View, ViewToken,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { COLORS } from '../styles/theme';

const { width } = Dimensions.get('window');

export const ONBOARDING_KEY = 'onboarding_done';

type Slide = {
  key: string;
  emoji: string;
  title: string;
  sub: string;
  bg: string;
  accent: string;
};

const SLIDES: Slide[] = [
  {
    key: '1',
    emoji: '🦷',
    title: 'Vitajte v Loderer Dental',
    sub: 'Vaša zubná ambulancia v digitálnej podobe. Rezervácie, história a zdravotné záznamy — všetko na jednom mieste.',
    bg: COLORS.esp,
    accent: COLORS.sand,
  },
  {
    key: '2',
    emoji: '📅',
    title: 'Rezervujte termín jednoducho',
    sub: 'Vyberte doktora, dátum a čas za pár sekúnd. Dostanete pripomienku deň pred termínom priamo v appke.',
    bg: '#1A3A5C',
    accent: '#AED6F1',
  },
  {
    key: '3',
    emoji: '📋',
    title: 'Zdravotný dotazník',
    sub: 'Vyplňte zdravotnú anamnézu raz a doktor bude vždy pripravený. Vaše dáta sú šifrované a bezpečné.',
    bg: '#1E4D2B',
    accent: '#A9DFBF',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const ref = useRef<FlatList>(null);

  const onViewRef = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]?.index != null) setCurrent(viewableItems[0].index);
  });

  async function finish() {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    router.replace('/');
  }

  function next() {
    if (current < SLIDES.length - 1) {
      ref.current?.scrollToIndex({ index: current + 1, animated: true });
    } else {
      finish();
    }
  }

  const slide = SLIDES[current];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: slide.bg }]} edges={['top', 'bottom']}>

      {/* Skip */}
      <TouchableOpacity style={styles.skip} onPress={finish} activeOpacity={0.7}>
        <Text style={[styles.skipText, { color: slide.accent }]}>Preskočiť</Text>
      </TouchableOpacity>

      {/* Slides */}
      <FlatList
        ref={ref}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.key}
        onViewableItemsChanged={onViewRef.current}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            {/* Dekor kruhy */}
            <View style={[styles.deco1, { backgroundColor: '#ffffff', opacity: 0.04 }]} />
            <View style={[styles.deco2, { backgroundColor: '#ffffff', opacity: 0.07 }]} />

            {/* Emoji ikona */}
            <View style={[styles.iconWrap, { borderColor: item.accent + '44' }]}>
              <Text style={styles.emoji}>{item.emoji}</Text>
            </View>

            <Text style={styles.title}>{item.title}</Text>
            <Text style={[styles.sub, { color: item.accent }]}>{item.sub}</Text>
          </View>
        )}
      />

      {/* Dots */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { backgroundColor: i === current ? slide.accent : slide.accent + '44' },
              i === current && styles.dotActive,
            ]}
          />
        ))}
      </View>

      {/* Tlačidlo */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: slide.accent }]}
          onPress={next}
          activeOpacity={0.85}
        >
          {current < SLIDES.length - 1 ? (
            <>
              <Text style={[styles.btnText, { color: slide.bg }]}>Ďalej</Text>
              <Ionicons name="arrow-forward" size={18} color={slide.bg} />
            </>
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={18} color={slide.bg} />
              <Text style={[styles.btnText, { color: slide.bg }]}>Začať</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },

  skip: { alignSelf: 'flex-end', paddingHorizontal: 22, paddingTop: 10, paddingBottom: 4 },
  skipText: { fontSize: 13, fontWeight: '600' },

  slide: {
    width,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    overflow: 'hidden',
  },
  deco1: { position: 'absolute', width: 320, height: 320, borderRadius: 160, top: -120, right: -100 },
  deco2: { position: 'absolute', width: 200, height: 200, borderRadius: 100, bottom: -60, left: -60 },

  iconWrap: {
    width: 120, height: 120, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 40,
    borderWidth: 2,
  },
  emoji: { fontSize: 60 },

  title: {
    fontSize: 26, fontWeight: '800', color: '#fff',
    textAlign: 'center', marginBottom: 18, lineHeight: 33,
  },
  sub: {
    fontSize: 15, textAlign: 'center', lineHeight: 24, fontWeight: '400',
  },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 20 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { width: 22, borderRadius: 4 },

  footer: { paddingHorizontal: 30, paddingBottom: 16 },
  btn: {
    borderRadius: 16, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
  },
  btnText: { fontSize: 16, fontWeight: '700' },
});
