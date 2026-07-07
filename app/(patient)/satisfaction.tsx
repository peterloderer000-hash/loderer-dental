/**
 * Satisfaction Survey — po návšteve hodnotenie
 */
import React, { useState } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII, SHADOWS } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { useAppTheme } from '../../context/ThemeContext';

const CATEGORIES = [
  { key: 'staff', label: 'Personál', icon: '👨‍⚕️' },
  { key: 'cleanliness', label: 'Čistota', icon: '✨' },
  { key: 'wait_time', label: 'Čakanie', icon: '⏱️' },
  { key: 'pain_management', label: 'Bezbolesť', icon: '💊' },
  { key: 'communication', label: 'Komunikácia', icon: '💬' },
];

export default function Satisfaction() {
  const router = useRouter();
  const { appointmentId } = useLocalSearchParams<{ appointmentId?: string }>();
  const { colors, dark } = useAppTheme();

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  function toggleCat(key: string) {
    setSelectedCats(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  async function submit() {
    if (rating === 0) { Alert.alert('', 'Prosím vyberte hodnotenie.'); return; }
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('satisfaction_surveys').insert({
        patient_id: user.id,
        appointment_id: appointmentId || null,
        rating,
        comment: comment || null,
        categories: selectedCats,
      });

      // Loyalty body za recenziu
      await supabase.from('loyalty_points').insert({
        patient_id: user.id, points: 10,
        reason: 'Hodnotenie návštevy', type: 'earned',
      }).then(() => {});

      setSubmitted(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Chyba', 'Nepodarilo sa odoslať.');
    } finally {
      setSaving(false);
    }
  }

  if (submitted) {
    return (
      <View style={[st.safe, { backgroundColor: colors.esp }]}>
        <HeroHeader title="Ďakujeme!" subtitle="Spätná väzba" icon="heart-outline" onBack={() => router.back()} />
        <View style={[st.centerBox, { backgroundColor: colors.bg2 }]}>
          <Text style={{ fontSize: 64 }}>🎉</Text>
          <Text style={[st.thankTitle, { color: colors.textPrimary }]}>Ďakujeme za hodnotenie!</Text>
          <Text style={[st.thankSub, { color: colors.textSecondary }]}>
            Vaša spätná väzba nám pomáha zlepšovať naše služby. Získali ste +10 loyalty bodov!
          </Text>
          <TouchableOpacity style={st.doneBtn} onPress={() => router.back()}>
            <Text style={st.doneBtnText}>Hotovo</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[st.safe, { backgroundColor: colors.esp }]}>
      <HeroHeader title="Hodnotenie návštevy" subtitle="Spätná väzba" icon="star-outline" onBack={() => router.back()} />

      <ScrollView style={[st.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={st.content}
        showsVerticalScrollIndicator={false}>

        {/* Stars */}
        <Animated.View entering={FadeInDown.delay(100)} style={[st.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
          <Text style={[st.cardTitle, { color: colors.textPrimary }]}>Ako ste spokojní?</Text>
          <View style={st.starsRow}>
            {[1,2,3,4,5].map(n => (
              <TouchableOpacity key={n} onPress={() => { setRating(n); Haptics.selectionAsync(); }} activeOpacity={0.7}>
                <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={42}
                  color={n <= rating ? COLORS.gold : colors.bg3} />
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[st.ratingLabel, { color: colors.textSecondary }]}>
            {rating === 0 ? 'Ťuknite na hviezdu' : rating === 1 ? 'Slabé' : rating === 2 ? 'Mohlo byť lepšie' : rating === 3 ? 'Dobré' : rating === 4 ? 'Veľmi dobré' : 'Výborné!'}
          </Text>
        </Animated.View>

        {/* Categories */}
        <Animated.View entering={FadeInDown.delay(200)} style={[st.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
          <Text style={[st.cardTitle, { color: colors.textPrimary }]}>Čo sa vám páčilo?</Text>
          <View style={st.catsWrap}>
            {CATEGORIES.map(c => {
              const sel = selectedCats.includes(c.key);
              return (
                <TouchableOpacity key={c.key}
                  style={[st.catChip, { backgroundColor: sel ? COLORS.gold + '15' : colors.bg2, borderColor: sel ? COLORS.gold : colors.bg3 }]}
                  onPress={() => toggleCat(c.key)}>
                  <Text style={{ fontSize: 18 }}>{c.icon}</Text>
                  <Text style={[st.catText, { color: sel ? COLORS.gold : colors.textPrimary }]}>{c.label}</Text>
                  {sel && <Ionicons name="checkmark-circle" size={16} color={COLORS.gold} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>

        {/* Comment */}
        <Animated.View entering={FadeInDown.delay(300)} style={[st.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
          <Text style={[st.cardTitle, { color: colors.textPrimary }]}>Komentár (voliteľné)</Text>
          <TextInput
            style={[st.commentInput, { color: colors.textPrimary, backgroundColor: colors.bg2, borderColor: colors.bg3 }]}
            multiline numberOfLines={4} textAlignVertical="top"
            placeholder="Napíšte nám čokoľvek..."
            placeholderTextColor={colors.textSecondary}
            value={comment} onChangeText={setComment}
          />
        </Animated.View>

        <TouchableOpacity style={[st.submitBtn, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
          <Ionicons name="send" size={18} color="#F5F6F8" />
          <Text style={st.submitText}>{saving ? 'Odosielam...' : 'Odoslať hodnotenie'}</Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: SPACING.xl },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },

  card: { borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.lg, marginBottom: SPACING.lg },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 14 },

  starsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 8 },
  ratingLabel: { textAlign: 'center', fontSize: 13 },

  catsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADII.pill, borderWidth: 1 },
  catText: { fontSize: 13, fontWeight: '600' },

  commentInput: { borderWidth: 1, borderRadius: RADII.md, padding: 14, fontSize: 14, minHeight: 100, lineHeight: 20 },

  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, backgroundColor: COLORS.gold, borderRadius: RADII.pill, ...SHADOWS.gold },
  submitText: { color: '#F5F6F8', fontWeight: '700', fontSize: 16 },

  thankTitle: { fontSize: 22, fontWeight: '800', marginTop: 16 },
  thankSub: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginTop: 8, marginBottom: 24, paddingHorizontal: 20 },
  doneBtn: { paddingHorizontal: 32, paddingVertical: 12, backgroundColor: COLORS.gold, borderRadius: RADII.pill },
  doneBtnText: { color: '#F5F6F8', fontWeight: '700', fontSize: 15 },
});
