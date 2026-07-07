/**
 * Family Dashboard — rodič vidí deti, ich termíny, skóre, streaky
 */
import React, { useState, useCallback } from 'react';
import {
  Alert, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII, SHADOWS } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';

type FamilyMember = {
  id: string;
  member_patient_id: string;
  name: string;
  relationship: string;
  nextAppointment: string | null;
  brushingStreak: number;
  healthScore: number | null;
};

export default function FamilyDashboard() {
  const router = useRouter();
  const { colors, dark } = useAppTheme();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addRelation, setAddRelation] = useState('child');
  const [saving, setSaving] = useState(false);

  const loadMembers = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get family group
      const { data: group } = await supabase.from('family_groups')
        .select('id').eq('parent_id', user.id).maybeSingle();

      if (!group) { setMembers([]); setLoading(false); return; }

      const { data: mbrs } = await supabase.from('family_members')
        .select('id, patient_id, relationship')
        .eq('group_id', group.id);

      if (!mbrs || mbrs.length === 0) { setMembers([]); setLoading(false); return; }

      const enriched: FamilyMember[] = [];
      for (const m of mbrs) {
        const [profRes, apptRes, brushRes, scoreRes] = await Promise.all([
          supabase.from('profiles').select('full_name').eq('id', m.patient_id).single(),
          supabase.from('appointments').select('date').eq('patient_id', m.patient_id)
            .gte('date', new Date().toISOString().split('T')[0])
            .order('date', { ascending: true }).limit(1),
          supabase.from('brushing_logs').select('id').eq('patient_id', m.patient_id)
            .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()),
          supabase.from('risk_predictions').select('overall_risk')
            .eq('patient_id', m.patient_id).order('created_at', { ascending: false }).limit(1),
        ]);

        enriched.push({
          id: m.id,
          member_patient_id: m.patient_id,
          name: profRes.data?.full_name ?? 'Člen',
          relationship: m.relationship,
          nextAppointment: apptRes.data?.[0]?.date ?? null,
          brushingStreak: brushRes.data?.length ?? 0,
          healthScore: scoreRes.data?.[0]?.overall_risk != null
            ? Math.round(100 - (scoreRes.data[0].overall_risk as number) * 100)
            : null,
        });
      }

      setMembers(enriched);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadMembers(); }, [loadMembers]));

  async function addMember() {
    if (!addEmail.trim()) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Find or create family group
      let { data: group } = await supabase.from('family_groups')
        .select('id').eq('parent_id', user.id).maybeSingle();

      if (!group) {
        const { data: ng } = await supabase.from('family_groups')
          .insert({ parent_id: user.id, name: 'Moja rodina' }).select('id').single();
        group = ng;
      }

      // Find member by email
      const { data: memberProfile } = await supabase.from('profiles')
        .select('id').eq('email', addEmail.trim().toLowerCase()).maybeSingle();

      if (!memberProfile) {
        Alert.alert('Nenájdené', 'Pacient s touto emailovou adresou nebol nájdený.');
        setSaving(false);
        return;
      }

      await supabase.from('family_members').insert({
        group_id: group!.id,
        patient_id: memberProfile.id,
        relationship: addRelation,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAddModal(false);
      setAddEmail('');
      loadMembers();
    } catch (e) {
      Alert.alert('Chyba', 'Nepodarilo sa pridať člena.');
    } finally {
      setSaving(false);
    }
  }

  const RELATIONS: { [k: string]: string } = {
    child: 'Dieťa', partner: 'Partner/ka', parent: 'Rodič', other: 'Iné',
  };

  function relEmoji(r: string) {
    if (r === 'child') return '👶';
    if (r === 'partner') return '💑';
    if (r === 'parent') return '👴';
    return '👤';
  }

  return (
    <View style={[st.safe, { backgroundColor: colors.esp }]}>
      <HeroHeader title="Rodina" subtitle="Rodinný dashboard" icon="people-outline" onBack={() => router.back()} />

      <ScrollView style={[st.scroll, { backgroundColor: colors.bg2 }]} contentContainerStyle={st.content}
        showsVerticalScrollIndicator={false}>

        {loading ? <SkeletonList count={3} /> : (
          <>
            {members.length === 0 ? (
              <Animated.View entering={FadeInDown.delay(100)} style={[st.emptyCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <Text style={{ fontSize: 48 }}>👨‍👩‍👧‍👦</Text>
                <Text style={[st.emptyTitle, { color: colors.textPrimary }]}>Žiadni členovia rodiny</Text>
                <Text style={[st.emptySub, { color: colors.textSecondary }]}>
                  Pridajte členov rodiny a sledujte ich dentálne zdravie.
                </Text>
              </Animated.View>
            ) : (
              members.map((m, i) => (
                <Animated.View key={m.id} entering={FadeInDown.delay(100 + i * 80)}
                  style={[st.memberCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                  <View style={st.memberHeader}>
                    <Text style={{ fontSize: 28 }}>{relEmoji(m.relationship)}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[st.memberName, { color: colors.textPrimary }]}>{m.name}</Text>
                      <Text style={[st.memberRel, { color: colors.textSecondary }]}>{RELATIONS[m.relationship] ?? m.relationship}</Text>
                    </View>
                    {m.healthScore != null && (
                      <View style={[st.scoreBadge, {
                        backgroundColor: m.healthScore >= 70 ? COLORS.success + '15' : m.healthScore >= 40 ? COLORS.warning + '15' : COLORS.error + '15',
                      }]}>
                        <Text style={[st.scoreText, {
                          color: m.healthScore >= 70 ? COLORS.success : m.healthScore >= 40 ? COLORS.warning : COLORS.error,
                        }]}>{m.healthScore}%</Text>
                      </View>
                    )}
                  </View>

                  <View style={st.memberStats}>
                    <View style={st.memberStat}>
                      <Ionicons name="calendar-outline" size={16} color={COLORS.info} />
                      <Text style={[st.statText, { color: colors.textSecondary }]}>
                        {m.nextAppointment ? new Date(m.nextAppointment).toLocaleDateString('sk-SK') : 'Žiadny termín'}
                      </Text>
                    </View>
                    <View style={st.memberStat}>
                      <Ionicons name="flame-outline" size={16} color={COLORS.warning} />
                      <Text style={[st.statText, { color: colors.textSecondary }]}>
                        {m.brushingStreak}x tento týždeň
                      </Text>
                    </View>
                  </View>
                </Animated.View>
              ))
            )}

            {/* Add member button */}
            <TouchableOpacity style={st.addBtn} onPress={() => { setAddModal(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              activeOpacity={0.85}>
              <Ionicons name="person-add" size={20} color="#fff" />
              <Text style={st.addBtnText}>Pridať člena rodiny</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Add member modal */}
      <Modal visible={addModal} transparent animationType="fade">
        <View style={st.overlay}>
          <View style={[st.modal, { backgroundColor: colors.cardBg }]}>
            <Text style={[st.modalTitle, { color: colors.textPrimary }]}>Pridať člena rodiny</Text>

            <Text style={[st.label, { color: colors.textSecondary }]}>E-mail pacienta</Text>
            <TextInput
              style={[st.input, { color: colors.textPrimary, backgroundColor: colors.bg2, borderColor: colors.bg3 }]}
              placeholder="email@priklad.sk"
              placeholderTextColor={colors.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              value={addEmail}
              onChangeText={setAddEmail}
            />

            <Text style={[st.label, { color: colors.textSecondary }]}>Vzťah</Text>
            <View style={st.relRow}>
              {Object.entries(RELATIONS).map(([k, v]) => {
                const sel = addRelation === k;
                return (
                  <TouchableOpacity key={k}
                    style={[st.relChip, { backgroundColor: sel ? COLORS.gold : colors.bg2, borderColor: sel ? COLORS.gold : colors.bg3 }]}
                    onPress={() => setAddRelation(k)}>
                    <Text style={[st.relChipText, { color: sel ? '#F5F6F8' : colors.textPrimary }]}>{v}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={st.modalBtns}>
              <TouchableOpacity style={[st.modalBtn, { backgroundColor: colors.bg2 }]} onPress={() => setAddModal(false)}>
                <Text style={[st.modalBtnText, { color: colors.textPrimary }]}>Zrušiť</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.modalBtn, { backgroundColor: COLORS.gold }]} onPress={addMember} disabled={saving}>
                <Text style={st.modalBtnTextW}>{saving ? 'Ukladám...' : 'Pridať'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: SPACING.xl },

  emptyCard: { borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.xxl, alignItems: 'center', marginBottom: SPACING.lg },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  emptySub: { fontSize: 13, textAlign: 'center', marginTop: 6 },

  memberCard: { borderRadius: RADII.lg, borderWidth: 1, padding: SPACING.lg, marginBottom: SPACING.md },
  memberHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  memberName: { fontSize: 16, fontWeight: '700' },
  memberRel: { fontSize: 11, marginTop: 2 },
  scoreBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADII.pill },
  scoreText: { fontSize: 14, fontWeight: '800' },

  memberStats: { flexDirection: 'row', gap: 20, marginTop: 14, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: 'rgba(0,0,0,0.05)' },
  memberStat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statText: { fontSize: 12 },

  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, backgroundColor: COLORS.gold, borderRadius: RADII.pill, ...SHADOWS.gold, marginTop: 4 },
  addBtnText: { color: '#F5F6F8', fontWeight: '700', fontSize: 15 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: SPACING.xl },
  modal: { borderRadius: RADII.lg, padding: SPACING.xl },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: RADII.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  relRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  relChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADII.pill, borderWidth: 1 },
  relChipText: { fontSize: 12, fontWeight: '600' },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 24 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: RADII.pill, alignItems: 'center' },
  modalBtnText: { fontWeight: '700', fontSize: 14 },
  modalBtnTextW: { color: '#F5F6F8', fontWeight: '700', fontSize: 14 },
});
