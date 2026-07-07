import React, { useRef, useState, useCallback } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  ListRenderItemInfo,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { supabase } from '../supabase';
import { COLORS, SPACING, RADII } from '../styles/theme';

// ─── Export pre index.tsx ─────────────────────────────────────────────────────
export const ONBOARDING_KEY = 'onboarding_done';

const { width } = Dimensions.get('window');

// ─── Slide dáta ───────────────────────────────────────────────────────────────
type Slide = {
  id:          string;
  emoji:       string;
  title:       string;
  description: string;
  bg:          string;   // pozadie obrazovky
  accent:      string;   // farba textu, dot, tlačidla
  iconBg:      string;   // pozadie emoji circle
};

const SLIDES: Slide[] = [
  {
    id:          '1',
    emoji:       '🦷',
    title:       'Vitaj v Loderer Dental',
    description: 'Vaša zubná ambulancia v digitálnom svete. Rezervácie, zdravotné záznamy aj komunikácia — všetko na jednom mieste.',
    bg:          COLORS.esp,
    accent:      COLORS.sand,
    iconBg:      COLORS.wal,
  },
  {
    id:          '2',
    emoji:       '📅',
    title:       'Rezervuj termín kedykoľvek',
    description: 'Objednajte sa online 24/7. Vyberte si čas ktorý vám vyhovuje — doktor to potvrdí a dostanete pripomienku.',
    bg:          '#1A3A5C',
    accent:      '#AED6F1',
    iconBg:      '#2E5F8C',
  },
  {
    id:          '3',
    emoji:       '🩺',
    title:       'Tvoj zdravotný pas',
    description: 'Uchovajte alergény, lieky a zdravotné informácie na jednom mieste. Doktor bude vždy plne pripravený.',
    bg:          '#1E4D2B',
    accent:      '#A3D4BE',
    iconBg:      '#2E6B3E',
  },
  {
    id:          '4',
    emoji:       '👨‍👩‍👧',
    title:       'Celá rodina na jednom mieste',
    description: 'Spravujte termíny a zdravotné záznamy pre celú rodinu z jedného profilu. Jednoducho a prehľadne.',
    bg:          '#4A2060',
    accent:      '#D7BDE2',
    iconBg:      '#6B3380',
  },
];

// ─── Jeden slide ──────────────────────────────────────────────────────────────
function SlideItem({ item }: { item: Slide }) {
  return (
    <View style={[styles.slide, { width }]}>
      {/* Dekoratívne kruhy v pozadí */}
      <View style={[styles.deco1, { backgroundColor: '#F5F6F8' }]} />
      <View style={[styles.deco2, { backgroundColor: '#F5F6F8' }]} />

      {/* Emoji ikona */}
      <View style={[styles.iconRing, { borderColor: item.accent + '55' }]}>
        <View style={[styles.iconWrap, { backgroundColor: item.iconBg }]}>
          <Text style={styles.emoji}>{item.emoji}</Text>
        </View>
      </View>

      {/* Texty */}
      <Text style={styles.title}>{item.title}</Text>
      <Text style={[styles.description, { color: item.accent }]}>{item.description}</Text>
    </View>
  );
}

// ─── Animované paginator dots ────────────────────────────────────────────────
function Paginator({
  scrollX,
  accent,
}: {
  scrollX: Animated.Value;
  accent:  string;
}) {
  return (
    <View style={styles.dotsRow}>
      {SLIDES.map((_, i) => {
        const inputRange = [(i - 1) * width, i * width, (i + 1) * width];

        const dotWidth = scrollX.interpolate({
          inputRange,
          outputRange: [8, 24, 8],
          extrapolate:  'clamp',
        });
        const opacity = scrollX.interpolate({
          inputRange,
          outputRange: [0.35, 1, 0.35],
          extrapolate:  'clamp',
        });

        return (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              { width: dotWidth, opacity, backgroundColor: accent },
            ]}
          />
        );
      })}
    </View>
  );
}

// ─── Hlavná obrazovka ─────────────────────────────────────────────────────────
export default function OnboardingScreen() {
  const router      = useRouter();
  const listRef     = useRef<FlatList<Slide>>(null);
  const scrollX     = useRef(new Animated.Value(0)).current;
  const [idx, setIdx] = useState(0);

  const currentSlide = SLIDES[idx];
  const isLast       = idx === SLIDES.length - 1;

  // ── Dokončenie onboardingu ──────────────────────────────────────────────────
  // Uloží flag a presmeruje podľa roly (ak existuje session) alebo na login.
  const finish = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();
      if (data?.role === 'doctor')       { router.replace('/(doctor)');    return; }
      if (data?.role === 'patient')      { router.replace('/(patient)');   return; }
      router.replace('/setup-role');
      return;
    }

    // Žiadna session → zobraz login
    router.replace('/');
  }, [router]);

  // ── Presun na ďalší slide ──────────────────────────────────────────────────
  const goNext = useCallback(() => {
    if (isLast) {
      finish();
    } else {
      listRef.current?.scrollToIndex({ index: idx + 1, animated: true });
    }
  }, [isLast, idx, finish]);

  // ── Tracking aktuálneho slide pri konci scrollu ────────────────────────────
  const onMomentumScrollEnd = useCallback((e: any) => {
    setIdx(Math.round(e.nativeEvent.contentOffset.x / width));
  }, []);

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: false },
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Slide>) => <SlideItem item={item} />,
    [],
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({ length: width, offset: width * index, index }),
    [],
  );

  return (
    // Animated background — mení sa spolu so scrollom
    <Animated.View style={[styles.root, { backgroundColor: currentSlide.bg }]}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>

        {/* ── Skip tlačidlo ── */}
        <TouchableOpacity style={styles.skipBtn} onPress={finish} activeOpacity={0.7}>
          <Text style={[styles.skipText, { color: currentSlide.accent }]}>Preskočiť</Text>
        </TouchableOpacity>

        {/* ── Slidy ── */}
        <FlatList
          ref={listRef}
          data={SLIDES}
          renderItem={renderItem}
          keyExtractor={(s) => s.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={handleScroll}
          onMomentumScrollEnd={onMomentumScrollEnd}
          bounces={false}
          getItemLayout={getItemLayout}
        />

        {/* ── Spodná lišta ── */}
        <View style={styles.footer}>
          <Paginator scrollX={scrollX} accent={currentSlide.accent} />

          <TouchableOpacity
            style={[
              styles.nextBtn,
              { backgroundColor: currentSlide.accent },
              isLast && styles.nextBtnWide,
            ]}
            onPress={goNext}
            activeOpacity={0.85}
          >
            {isLast ? (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color={currentSlide.bg} />
                <Text style={[styles.nextBtnText, { color: currentSlide.bg }]}>Začať</Text>
              </>
            ) : (
              <Ionicons name="arrow-forward" size={22} color={currentSlide.bg} />
            )}
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },

  // Skip
  skipBtn: {
    alignSelf:         'flex-end',
    paddingHorizontal: SPACING.xl,
    paddingTop:        8,
    paddingBottom:     4,
    zIndex:            10,
  },
  skipText: {
    fontSize:   13,
    fontWeight: '600',
    opacity:    0.85,
  },

  // Slide
  slide: {
    flex:              1,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: 36,
    overflow:          'hidden',
  },

  // Dekorácie
  deco1: {
    position:     'absolute',
    width:        340,
    height:       340,
    borderRadius: 170,
    opacity:      0.04,
    top:          -130,
    right:        -100,
  },
  deco2: {
    position:     'absolute',
    width:        220,
    height:       220,
    borderRadius: 20,
    opacity:      0.06,
    bottom:       -70,
    left:         -60,
  },

  // Emoji
  iconRing: {
    width:           140,
    height:          140,
    borderRadius:    70,
    borderWidth:     2,
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    44,
  },
  iconWrap: {
    width:           120,
    height:          120,
    borderRadius:    60,
    alignItems:      'center',
    justifyContent:  'center',
    elevation:       12,
    shadowColor:     '#121417',
    shadowOffset:    { width: 0, height: 6 },
    shadowOpacity:   0.3,
    shadowRadius:    10,
  },
  emoji: { fontSize: 58 },

  // Texty
  title: {
    fontSize:    26,
    fontWeight:  '800',
    color:       '#F5F6F8',
    textAlign:   'center',
    marginBottom: 16,
    lineHeight:  33,
    letterSpacing: 0.2,
  },
  description: {
    fontSize:   15,
    textAlign:  'center',
    lineHeight: 24,
    fontWeight: '400',
    opacity:    0.9,
  },

  // Spodná lišta
  footer: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: SPACING.xl + 4,
    paddingBottom:   24,
    paddingTop:      20,
  },

  // Dots
  dotsRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           7,
  },
  dot: {
    height:       8,
    borderRadius: 4,
  },

  // Tlačidlo Ďalej / Začať
  nextBtn: {
    minWidth:        52,
    height:          52,
    borderRadius:    26,
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: 18,
    elevation:       6,
    shadowColor:     '#121417',
    shadowOffset:    { width: 0, height: 3 },
    shadowOpacity:   0.2,
    shadowRadius:    6,
  },
  nextBtnWide: {
    flexDirection: 'row',
    gap:           8,
    borderRadius:  26,
    paddingHorizontal: 24,
  },
  nextBtnText: {
    fontSize:   15,
    fontWeight: '700',
  },
});
