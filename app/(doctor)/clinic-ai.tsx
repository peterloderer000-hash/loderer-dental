/**
 * Clinic AI — doctor's AI assistant with clinic context.
 * Uses clinic state (today's appointments, metrics) as context.
 * Mock responses in MVP (no API key required).
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useClinic } from '../../hooks/useClinic';
import { computeDayMetrics, fmtMins, CLINIC_STATUS_CFG } from '../../utils/clinicMetrics';
import { COLORS } from '../../styles/theme';
import { useAppTheme } from '../../context/ThemeContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type Message = {
  id:      string;
  role:    'user' | 'assistant';
  text:    string;
  time:    Date;
};

// ─── Suggested prompts ────────────────────────────────────────────────────────

const SUGGESTIONS = [
  'Kto čaká najdlhšie?',
  'Zhrň dnešný deň',
  'Koľko pacientov je dnes?',
  'Aká je priemerná doba čakania?',
];

// ─── Mock AI response generator ──────────────────────────────────────────────

function generateMockResponse(
  question:    string,
  appointments: ReturnType<typeof useClinic>['appointments'],
  metrics:     ReturnType<typeof computeDayMetrics>,
): string {
  const q = question.toLowerCase();

  // Longest waiting
  if (q.includes('čaká') && (q.includes('dlh') || q.includes('najdlh'))) {
    const waiting = appointments.filter(a => a.clinic_status === 'waiting' && a.arrived_at);
    if (waiting.length === 0) return 'Momentálne nikto nečaká.';
    const sorted = [...waiting].sort((a, b) =>
      new Date(a.arrived_at!).getTime() - new Date(b.arrived_at!).getTime(),
    );
    const p = sorted[0];
    const mins = Math.round((Date.now() - new Date(p.arrived_at!).getTime()) / 60000);
    return `Najdlhšie čaká **${p.patient?.full_name ?? 'Pacient'}** — ${mins} minút od príchodu.${mins > 15 ? ' ⚠️ Odporúčam urýchlene zavolať.' : ''}`;
  }

  // Summary
  if (q.includes('zhrn') || q.includes('súhrn') || q.includes('prehľad') || q.includes('deň')) {
    const parts = [
      `Dnes máte **${metrics.totalToday}** termínov.`,
      metrics.inChairNow   > 0 ? `V kresle: **${metrics.inChairNow}**.` : '',
      metrics.waitingNow   > 0 ? `V čakárni: **${metrics.waitingNow}**.` : '',
      metrics.completedToday > 0 ? `Dokončených: **${metrics.completedToday}**.` : '',
      metrics.noShowToday  > 0 ? `No-show: ${metrics.noShowToday}.` : '',
      metrics.utilizationPct !== null ? `Využitie: **${metrics.utilizationPct}%**.` : '',
    ].filter(Boolean);
    return parts.join(' ');
  }

  // Count
  if (q.includes('koľko') && (q.includes('pacient') || q.includes('termín'))) {
    return `Dnes máte celkovo **${metrics.totalToday}** termínov. Dokončených: ${metrics.completedToday}, čaká: ${metrics.waitingNow}, v kresle: ${metrics.inChairNow}.`;
  }

  // Average waiting
  if (q.includes('priemerná') || q.includes('čakanie') || (q.includes('čakania') && q.includes('čas'))) {
    if (metrics.avgWaitingMins === null) return 'Zatiaľ nemám dostatok dát pre výpočet priemerného čakania.';
    const color = metrics.avgWaitingMins > 15 ? '⚠️' : '✅';
    return `Priemerné čakanie dnes je **${fmtMins(metrics.avgWaitingMins)}**. ${color}${metrics.avgWaitingMins > 15 ? ' Odporúčam zrýchliť priebeh.' : ' V norme.'}`;
  }

  // Average treatment
  if (q.includes('zákrok') || q.includes('liečb') || q.includes('trvanie')) {
    if (metrics.avgTreatmentMins === null) return 'Zatiaľ žiadne dokončené zákroky pre štatistiku.';
    return `Priemerná dĺžka zákroku dnes je **${fmtMins(metrics.avgTreatmentMins)}**.`;
  }

  // No-show
  if (q.includes('no-show') || q.includes('neprišiel') || q.includes('neprišli')) {
    if (metrics.noShowToday === 0) return 'Dnes žiadne no-show. Výborne!';
    const nsList = appointments
      .filter(a => a.clinic_status === 'no_show')
      .map(a => a.patient?.full_name ?? 'Pacient')
      .join(', ');
    return `Dnes ${metrics.noShowToday} no-show: ${nsList}.`;
  }

  // Waiting list
  if (q.includes('čakár') || (q.includes('kto') && q.includes('čaká'))) {
    const waiting = appointments.filter(a => a.clinic_status === 'waiting');
    if (waiting.length === 0) return 'Čakáreň je prázdna.';
    const names = waiting.map(a => a.patient?.full_name ?? 'Pacient').join(', ');
    return `V čakárni: **${names}**.`;
  }

  // In chair
  if (q.includes('kreslo') || q.includes('v kresle')) {
    const inChair = appointments.filter(a => a.clinic_status === 'in_chair');
    if (inChair.length === 0) return 'Momentálne nie je nikto v kresle.';
    const names = inChair.map(a => `${a.patient?.full_name ?? 'Pacient'} (${a.service?.name ?? '—'})`).join(', ');
    return `V kresle: ${names}.`;
  }

  // Next patient
  if (q.includes('ďalší') || q.includes('nasledujúci')) {
    const next = appointments.find(a => ['scheduled','late'].includes(a.clinic_status));
    if (!next) return 'Žiadny ďalší plánovaný pacient na dnes.';
    const t = new Date(next.appointment_date).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
    return `Ďalší pacient: **${next.patient?.full_name ?? 'Pacient'}** o ${t} (${next.service?.name ?? '—'}).`;
  }

  // Default
  return `Mám prehľad o ${metrics.totalToday} termínoch na dnes. Môžem odpovedať na otázky o čakaní, stave pacientov, štatistikách alebo zhrnutí dňa. Čo vás zaujíma?`;
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function Bubble({ msg }: { msg: Message }) {
  const { colors } = useAppTheme();
  const isUser = msg.role === 'user';
  const parts  = msg.text.split(/\*\*(.*?)\*\*/g);

  return (
    <View style={[bbl.wrap, isUser ? bbl.wrapUser : bbl.wrapAI]}>
      {!isUser && (
        <View style={bbl.avatar}>
          <Text style={bbl.avatarEmoji}>🤖</Text>
        </View>
      )}
      <View style={[bbl.bubble, isUser ? bbl.bubbleUser : [bbl.bubbleAI, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]]}>
        <Text style={isUser ? bbl.textUser : [bbl.textAI, { color: colors.textPrimary }]}>
          {parts.map((part, i) =>
            i % 2 === 1
              ? <Text key={i} style={{ fontWeight: '800' }}>{part}</Text>
              : part,
          )}
        </Text>
        <Text style={[bbl.time, isUser && { color: 'rgba(255,255,255,0.6)' }]}>
          {msg.time.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
}

const bbl = StyleSheet.create({
  wrap:       { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 12 },
  wrapUser:   { justifyContent: 'flex-end' },
  wrapAI:     { justifyContent: 'flex-start' },
  avatar:     { width: 32, height: 32, borderRadius: 4, backgroundColor: COLORS.esp, alignItems: 'center', justifyContent: 'center' },
  avatarEmoji:{ fontSize: 16 },
  bubble:     { maxWidth: '78%', borderRadius: 4, padding: 12 },
  bubbleUser: { backgroundColor: COLORS.esp, borderBottomRightRadius: 4 },
  bubbleAI:   { backgroundColor: COLORS.cream, borderBottomLeftRadius: 4, borderWidth: 1.5, borderColor: COLORS.bg3, elevation: 1 },
  textUser:   { fontSize: 14, color: '#fff', lineHeight: 20 },
  textAI:     { fontSize: 14, color: COLORS.esp, lineHeight: 20 },
  time:       { fontSize: 9, color: '#999', marginTop: 4, textAlign: 'right' }
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ClinicAIScreen() {
  const router  = useRouter();
  const { colors, dark } = useAppTheme();
  const clinic  = useClinic();
  const metrics = computeDayMetrics(clinic.appointments);

  // All hooks BEFORE any conditional return (Rules of Hooks)
  const [messages,  setMessages]  = useState<Message[]>([{
    id:   'welcome',
    role: 'assistant',
    text: `Dobrý deň! Som váš AI asistent pre kliniku. Načítavam dáta...`,
    time: new Date()
  }]);
  const [input,     setInput]     = useState('');
  const [thinking,  setThinking]  = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Update welcome message once data loads
  useEffect(() => {
    if (!clinic.loading && messages.length === 1 && messages[0].id === 'welcome') {
      setMessages([{
        id:   'welcome',
        role: 'assistant',
        text: `Dobrý deň! Som váš AI asistent pre kliniku.\n\nDnes: **${metrics.totalToday}** termínov · ${metrics.waitingNow} čaká · ${metrics.inChairNow} v kresle · ${metrics.completedToday} hotových. Na čo sa chcete opýtať?`,
        time: new Date()
      }]);
    }
  }, [clinic.loading]);

  // Role guard — len doctor
  if (!clinic.loading && clinic.clinicRole !== 'doctor') {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.esp }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🔒</Text>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 8 }}>Prístup zamietnutý</Text>
          <Text style={{ fontSize: 13, color: COLORS.sand, textAlign: 'center' }}>AI asistent je dostupný len pre doktora.</Text>
        </View>
      </View>
    );
  }

  async function send(text: string) {
    if (!text.trim()) return;
    setInput('');

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: text.trim(), time: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setThinking(true);

    // Simulate AI thinking delay (300–600 ms)
    await new Promise(r => setTimeout(r, 300 + Math.random() * 300));

    const response = generateMockResponse(text.trim(), clinic.appointments, metrics);
    const aiMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', text: response, time: new Date() };

    setMessages(prev => [...prev, aiMsg]);
    setThinking(false);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }

  return (
    <View style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerSub}>KLINIKA · AI</Text>
          <Text style={s.headerTitle}>AI Asistent</Text>
        </View>
        <View style={s.aiBadge}>
          <Text style={s.aiBadgeText}>MVP</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={[s.scroll, { backgroundColor: colors.bg2 }]}
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.map(m => <Bubble key={m.id} msg={m} />)}

          {thinking && (
            <View style={s.thinkingRow}>
              <View style={[s.thinkingBubble, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                <ActivityIndicator size="small" color={COLORS.wal} />
                <Text style={s.thinkingText}>Premýšľam...</Text>
              </View>
            </View>
          )}
          <View style={{ height: 8 }} />
        </ScrollView>

        {/* Suggestions */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[s.suggestScroll, { backgroundColor: colors.cardBg, borderTopColor: colors.bg3 }]} contentContainerStyle={s.suggestRow}>
          {SUGGESTIONS.map(sug => (
            <TouchableOpacity key={sug} style={[s.suggestChip, { backgroundColor: colors.bg2, borderColor: colors.bg3 }]} onPress={() => send(sug)} activeOpacity={0.8}>
              <Text style={[s.suggestText, { color: colors.textSecondary }]}>{sug}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Input */}
        <View style={[s.inputBar, { backgroundColor: colors.cardBg, borderTopColor: colors.bg3 }]}>
          <TextInput
            style={[s.input, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
            placeholder="Opýtajte sa na stav kliniky..."
            placeholderTextColor={dark ? '#555' : '#bbb'}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={() => send(input)}
          />
          <TouchableOpacity
            style={[s.sendBtn, !input.trim() && s.sendBtnDisabled]}
            onPress={() => send(input)}
            disabled={!input.trim() || thinking}
            activeOpacity={0.85}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  scroll: { flex: 1, backgroundColor: COLORS.bg2 },
  content:{ padding: 14, paddingTop: 16 },

  header: {
    backgroundColor: COLORS.esp,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10
  },
  backBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  headerSub:  { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  headerTitle:{ fontSize: 18, fontWeight: '700', color: '#fff' },
  aiBadge:    { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2, paddingHorizontal: 8, paddingVertical: 4 },
  aiBadgeText:{ fontSize: 10, fontWeight: '700', color: COLORS.cream, letterSpacing: 1 },

  thinkingRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  thinkingBubble: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.cream, borderRadius: 4, borderBottomLeftRadius: 4, padding: 12, borderWidth: 1.5, borderColor: COLORS.bg3 },
  thinkingText:   { fontSize: 13, color: COLORS.wal, fontStyle: 'italic' },

  suggestScroll: { maxHeight: 44, backgroundColor: COLORS.cream, borderTopWidth: 1, borderTopColor: COLORS.bg3 },
  suggestRow:    { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  suggestChip:   { backgroundColor: COLORS.bg2, borderRadius: 2, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.bg3 },
  suggestText:   { fontSize: 12, fontWeight: '600', color: COLORS.wal },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    padding: 12, backgroundColor: COLORS.cream,
    borderTopWidth: 1, borderTopColor: COLORS.bg3
  },
  input: {
    flex: 1, borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: 4,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: COLORS.esp, backgroundColor: COLORS.bg2,
    maxHeight: 100
  },
  sendBtn:         { width: 44, height: 44, borderRadius: 4, backgroundColor: COLORS.esp, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: COLORS.bg3 }
});
