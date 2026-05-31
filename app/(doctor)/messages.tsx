import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';

type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  is_read: boolean;
  created_at: string;
};

type Conversation = {
  patientId:   string;
  patientName: string;
  lastMessage: string;
  lastTime:    string;
  unreadCount: number;
};

function fmtTime(d: string) {
  const date = new Date(d);
  const now  = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays === 0) return date.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'včera';
  return date.toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' });
}

function fmtFull(d: string) {
  return new Date(d).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
}

export default function DoctorMessagesScreen() {
  const router  = useRouter();
  const { colors, dark } = useAppTheme();
  const { patientId: initPatientId, patientName: initPatientName } =
    useLocalSearchParams<{ patientId?: string; patientName?: string }>();

  const [myId,        setMyId]        = useState('');
  const [view,        setView]        = useState<'list' | 'chat'>(() => initPatientId ? 'chat' : 'list');
  const [activePatient, setActive]    = useState<{ id: string; name: string } | null>(
    initPatientId ? { id: initPatientId, name: initPatientName ?? 'Pacient' } : null
  );
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages,    setMessages]    = useState<Message[]>([]);
  const [text,        setText]        = useState('');
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [sending,     setSending]     = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const listRef = useRef<FlatList>(null);

  const MESSAGE_TEMPLATES = [
    { icon: '✅', label: 'Potvrdenie',   text: 'Dobrý deň, potvrdzujem Váš termín. Tešíme sa na Vašu návštevu. 🦷' },
    { icon: '📅', label: 'Pripomienka',  text: 'Dobrý deň, pripomíname Váš blížiaci sa termín v našej ambulancii. Ak potrebujete termín zmeniť, kontaktujte nás prosím.' },
    { icon: '❌', label: 'Zrušenie',     text: 'Dobrý deň, Váš termín bol žiaľ zrušený. Kontaktujte nás prosím pre dohodnutie nového termínu.' },
    { icon: '🙏', label: 'Po ošetrení', text: 'Dobrý deň, ako sa cítite po dnešnom ošetrení? V prípade akýchkoľvek ťažkostí nás neváhajte kontaktovať.' },
    { icon: '📋', label: 'Výsledky',    text: 'Dobrý deň, odporúčania po Vašom ošetrení sú pripravené. Prosím kontaktujte nás pre ďalší postup.' },
    { icon: '💰', label: 'Platba',      text: 'Dobrý deň, dovoľujeme si Vás informovať o úhrade za poskytnuté ošetrenie. Ďakujeme za Vašu dôveru.' },
    { icon: '🔔', label: 'Recall',      text: 'Dobrý deň, od Vašej poslednej návštevy ubehlo viac ako 6 mesiacov. Odporúčame preventívnu prehliadku. Radi Vám rezervujeme termín.' },
  ];

  // ── Načítaj zoznam konverzácií ──────────────────────────────────────────────
  const loadConversations = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('messages')
      .select('sender_id, receiver_id, body, is_read, created_at')
      .or(`sender_id.eq.${uid},receiver_id.eq.${uid}`)
      .order('created_at', { ascending: false });

    if (!data) { setLoading(false); return; }

    // Skupiny podľa partnera
    const map = new Map<string, { messages: typeof data; name: string }>();
    const partnerIds = new Set<string>();
    data.forEach((m) => {
      const partnerId = m.sender_id === uid ? m.receiver_id : m.sender_id;
      partnerIds.add(partnerId);
      if (!map.has(partnerId)) map.set(partnerId, { messages: [], name: partnerId });
      map.get(partnerId)!.messages.push(m);
    });

    // Načítaj mená partnerov (pacientov)
    if (partnerIds.size > 0) {
      const { data: profiles } = await supabase
        .from('profiles').select('id, full_name').in('id', [...partnerIds]);
      profiles?.forEach((p) => {
        if (map.has(p.id)) map.get(p.id)!.name = p.full_name ?? 'Pacient';
      });
    }

    const convs: Conversation[] = [];
    map.forEach((val, partnerId) => {
      const msgs = val.messages;
      const last = msgs[0];
      const unread = msgs.filter((m) => m.receiver_id === uid && !m.is_read).length;
      convs.push({
        patientId:   partnerId,
        patientName: val.name,
        lastMessage: last.body,
        lastTime:    last.created_at,
        unreadCount: unread
      });
    });
    convs.sort((a, b) => new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime());
    setConversations(convs);
    setLoading(false);
  }, []);

  // ── Načítaj správy konkrétnej konverzácie ───────────────────────────────────
  const loadChat = useCallback(async (uid: string, patId: string) => {
    setChatLoading(true);
    const { data } = await supabase
      .from('messages')
      .select('id, sender_id, receiver_id, body, is_read, created_at')
      .or(`and(sender_id.eq.${uid},receiver_id.eq.${patId}),and(sender_id.eq.${patId},receiver_id.eq.${uid})`)
      .order('created_at', { ascending: true })
      .limit(200);
    setMessages((data ?? []) as Message[]);
    setChatLoading(false);

    // Označiť ako prečítané
    const unread = (data ?? []).filter((m) => m.receiver_id === uid && !m.is_read).map((m) => m.id);
    if (unread.length > 0) await supabase.from('messages').update({ is_read: true }).in('id', unread);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setMyId(user.id);
      await loadConversations(user.id);
      if (initPatientId) await loadChat(user.id, initPatientId);
    })();
  }, [loadConversations, loadChat, initPatientId]);

  // Realtime — nové správy
  useEffect(() => {
    if (!myId) return;
    const channel = supabase.channel(`messages-doctor-${myId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `receiver_id=eq.${myId}`
      }, (payload) => {
        const msg = payload.new as Message;
        if (activePatient && msg.sender_id === activePatient.id) {
          setMessages((prev) => [...prev, msg]);
          supabase.from('messages').update({ is_read: true }).eq('id', msg.id);
        } else {
          loadConversations(myId);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [myId, activePatient, loadConversations]);

  useEffect(() => {
    if (messages.length > 0)
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 150);
  }, [messages.length]);

  function openChat(patId: string, patName: string) {
    setActive({ id: patId, name: patName });
    setView('chat');
    if (myId) loadChat(myId, patId);
  }

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || !myId || !activePatient || sending) return;
    setSending(true);
    setText('');
    try {
      const { data, error } = await supabase.from('messages').insert({
        sender_id:   myId,
        receiver_id: activePatient.id,
        body:        trimmed
      }).select().single();
      if (error) throw error;
      setMessages((prev) => [...prev, data as Message]);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setText(trimmed);
    } finally {
      setSending(false);
    }
  }

  // ── ZOZNAM KONVERZÁCIÍ ──────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <View style={styles.safe}>
        <HeroHeader
          title="Konverzácie"
          subtitle="Správy"
          icon="chatbubbles-outline"
          onBack={() => router.back()}
        />

        {loading ? (
          <View style={{ flex: 1, backgroundColor: colors.bg2, padding: 16, paddingTop: 14 }}>
            <SkeletonList count={5} />
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1, backgroundColor: colors.bg2 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  loadConversations(myId).then(() => setRefreshing(false));
                }}
                tintColor={COLORS.wal}
                colors={[COLORS.wal]}
              />
            }
          >
            {conversations.length === 0 ? (
              <View style={[styles.center, { backgroundColor: colors.bg2, paddingTop: 80 }]}>
                <Text style={{ fontSize: 52, marginBottom: 14 }}>💬</Text>
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Žiadne správy</Text>
                <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Pacienti vám ešte nepísali.</Text>
              </View>
            ) : conversations.map((c) => (
              <TouchableOpacity key={c.patientId}
                style={[styles.convRow, { backgroundColor: colors.cardBg, borderBottomColor: colors.bg3 }]}
                onPress={() => openChat(c.patientId, c.patientName)}
                activeOpacity={0.8}>
                <View style={styles.convAvatar}>
                  <Text style={{ fontSize: 18 }}>👤</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.convTopRow}>
                    <Text style={[styles.convName, { color: colors.textPrimary }, c.unreadCount > 0 && { fontWeight: '800' }]}>{c.patientName}</Text>
                    <Text style={[styles.convTime, { color: colors.textSecondary }]}>{fmtTime(c.lastTime)}</Text>
                  </View>
                  <View style={styles.convBottomRow}>
                    <Text style={[styles.convLast, { color: colors.textSecondary }, c.unreadCount > 0 && { color: COLORS.esp, fontWeight: '600' }]}
                      numberOfLines={1}>{c.lastMessage}</Text>
                    {c.unreadCount > 0 && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadText}>{c.unreadCount}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))}
            <View style={{ height: 100 }} />
          </ScrollView>
        )}
      </View>
    );
  }

  // ── CHAT ────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { setView('list'); setMessages([]); }} style={styles.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <View style={styles.convAvatar}>
            <Text style={{ fontSize: 18 }}>👤</Text>
          </View>
          <View>
            <Text style={styles.headerName}>{activePatient?.name ?? 'Pacient'}</Text>
            <Text style={styles.headerSub2}>Správa</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => router.push({
          pathname: '/(doctor)/patient-detail',
          params: { patientId: activePatient?.id, patientName: activePatient?.name }
        })} activeOpacity={0.75}>
          <Ionicons name="person-circle-outline" size={26} color={COLORS.cream} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {chatLoading ? (
          <View style={{ flex: 1, backgroundColor: colors.bg2, padding: 16 }}>
            <SkeletonList count={4} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            style={{ backgroundColor: colors.bg2 }}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyInChat}>
                <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Napíšte pacientovi prvú správu.</Text>
              </View>
            }
            renderItem={({ item }) => {
              const isMine = item.sender_id === myId;
              return (
                <View style={[styles.bubble, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={[styles.bubbleText, { color: colors.textPrimary }, isMine && styles.bubbleTextMine]}>{item.body}</Text>
                  <Text style={[styles.bubbleTime, { color: colors.textSecondary }, isMine && styles.bubbleTimeMine]}>{fmtFull(item.created_at)}</Text>
                </View>
              );
            }}
          />
        )}
        {/* ── Šablóny správ ── */}
        {showTemplates && (
          <View style={[styles.templatesWrap, { backgroundColor: colors.cardBg, borderTopColor: colors.bg3 }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.templatesScroll}>
              {MESSAGE_TEMPLATES.map((t, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.templateChip, { backgroundColor: colors.bg2, borderColor: colors.bg3 }]}
                  onPress={() => { setText(t.text); setShowTemplates(false); }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.templateIcon}>{t.icon}</Text>
                  <Text style={[styles.templateLabel, { color: colors.textPrimary }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={[styles.inputRow, { backgroundColor: colors.cardBg, borderTopColor: colors.bg3 }]}>
          <TouchableOpacity
            style={[styles.templateBtn, { backgroundColor: colors.bg3, borderColor: colors.bg3 }, showTemplates && styles.templateBtnActive]}
            onPress={() => setShowTemplates(p => !p)}
            activeOpacity={0.8}
          >
            <Ionicons name="flash-outline" size={18} color={showTemplates ? '#fff' : COLORS.wal} />
          </TouchableOpacity>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
            placeholder="Napíšte správu..."
            placeholderTextColor={dark ? '#666' : '#bbb'}
            value={text}
            onChangeText={setText}
            multiline maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSend} disabled={!text.trim() || sending} activeOpacity={0.8}>
            {sending
              ? <ActivityIndicator color="#fff" size="small" />
              : <Ionicons name="send" size={18} color="#fff" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg2 },

  header:     { backgroundColor: COLORS.esp, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SPACING.xl, paddingTop: 14, paddingBottom: 16 },
  backBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  headerSub:  { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', textTransform: 'uppercase', marginBottom: 3 },
  headerTitle:{ fontSize: 18, fontWeight: '700', color: '#fff' },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  headerSub2: { fontSize: 11, color: COLORS.sand },

  // Conversations list
  convRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.cream, padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.bg3 },
  convAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.bg3, alignItems: 'center', justifyContent: 'center' },
  convTopRow:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  convName:      { fontSize: 14, fontWeight: '700', color: COLORS.esp },
  convTime:      { fontSize: 11, color: COLORS.wal },
  convBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  convLast:      { flex: 1, fontSize: 12, color: COLORS.wal },
  unreadBadge:   { backgroundColor: COLORS.wal, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  unreadText:    { fontSize: 10, fontWeight: '800', color: '#fff' },

  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.esp, marginBottom: 6 },
  emptySub:   { fontSize: 13, color: COLORS.wal, textAlign: 'center', paddingHorizontal: 40 },
  emptyInChat:{ padding: 20, alignItems: 'center' },

  // Chat
  listContent:     { padding: 14, paddingBottom: 10, flexGrow: 1 },
  bubble:          { maxWidth: '80%', borderRadius: 16, padding: 12, marginBottom: 8, backgroundColor: COLORS.cream, borderWidth: 1, borderColor: COLORS.bg3, alignSelf: 'flex-start' },
  bubbleMine:      { backgroundColor: COLORS.esp, borderColor: COLORS.esp, alignSelf: 'flex-end' },
  bubbleTheirs:    {},
  bubbleText:      { fontSize: 14, color: COLORS.esp, lineHeight: 20 },
  bubbleTextMine:  { color: '#fff' },
  bubbleTime:      { fontSize: 10, color: '#bbb', marginTop: 4, textAlign: 'right' },
  bubbleTimeMine:  { color: COLORS.sand },

  inputRow:        { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, backgroundColor: COLORS.cream, borderTopWidth: 1, borderTopColor: COLORS.bg3 },
  input:           { flex: 1, backgroundColor: COLORS.bg2, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: COLORS.esp, maxHeight: 100, borderWidth: 1, borderColor: COLORS.bg3 },
  sendBtn:         { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  templateBtn:     { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.bg3, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: COLORS.bg3 },
  templateBtnActive: { backgroundColor: COLORS.wal, borderColor: COLORS.wal },
  templatesWrap:   { backgroundColor: COLORS.cream, borderTopWidth: 1, borderTopColor: COLORS.bg3, paddingVertical: 10 },
  templatesScroll: { paddingHorizontal: 12, gap: 8 },
  templateChip:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.bg2, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1.5, borderColor: COLORS.bg3 },
  templateIcon:    { fontSize: 14 },
  templateLabel:   { fontSize: 12, fontWeight: '700', color: COLORS.esp }
});
