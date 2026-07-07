import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Modal,
  Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII, SHADOWS } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { SkeletonList } from '../../components/Skeleton';
import { AnimatedListItem } from '../../components/ui/AnimatedListItem';
import { useAppTheme } from '../../context/ThemeContext';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  body: string;
  created_at: string;
  sender_id: string;
  recipient_id: string | null;
  read_at: string | null;
  sender?: { full_name: string | null } | null;
}

interface StaffMember {
  id: string;
  full_name: string;
  role: string;
}

interface Thread {
  partner: StaffMember;
  lastMsg: Message;
  unread: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString())
    return d.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === yesterday.toDateString()) return 'Včera';
  return d.toLocaleDateString('sk-SK', { day: 'numeric', month: 'short' });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Dnes';
  if (d.toDateString() === yesterday.toDateString()) return 'Včera';
  return d.toLocaleDateString('sk-SK', { day: 'numeric', month: 'long' });
}

const ROLE_LABELS: Record<string, string> = {
  doctor: 'Doktor', reception: 'Recepcia', hygienist: 'Hygienista', owner: 'Vlastník'
};

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

// ─── ChatBubble ───────────────────────────────────────────────────────────────

function ChatBubble({ msg, isMe }: { msg: Message; isMe: boolean }) {
  const { colors: bc } = useAppTheme();
  return (
    <View style={[bubble.wrap, isMe && bubble.wrapMe]}>
      {!isMe && (
        <View style={bubble.avatar}>
          <Text style={bubble.avatarText}>
            {initials(msg.sender?.full_name ?? '?')}
          </Text>
        </View>
      )}
      <View style={[bubble.box, isMe ? bubble.boxMe : [bubble.boxOther, { backgroundColor: bc.cardBg }]]}>
        {!isMe && msg.sender?.full_name && (
          <Text style={bubble.senderName}>{msg.sender.full_name}</Text>
        )}
        <Text style={[bubble.text, { color: bc.textPrimary }, isMe && bubble.textMe]}>{msg.body}</Text>
        <View style={bubble.footer}>
          <Text style={[bubble.time, isMe && bubble.timeMe]}>
            {new Date(msg.created_at).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {isMe && (
            <Ionicons
              name={msg.read_at ? 'checkmark-done' : 'checkmark'}
              size={12}
              color={msg.read_at ? '#A5D8FF' : 'rgba(255,255,255,0.5)'}
              style={{ marginLeft: 4 }}
            />
          )}
        </View>
      </View>
    </View>
  );
}

// ─── ChatView (shared between broadcast + DM) ─────────────────────────────────

function ChatView({
  messages,
  loading,
  myId,
  onSend,
  placeholder
}: {
  messages: Message[];
  loading: boolean;
  myId: string;
  onSend: (text: string) => Promise<void>;
  placeholder: string;
}) {
  const { colors: cvc } = useAppTheme();
  const flatRef = useRef<FlatList>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  // Group by date
  const grouped: { date: string; msgs: Message[] }[] = [];
  for (const m of messages) {
    const label = formatDate(m.created_at);
    const last = grouped[grouped.length - 1];
    if (!last || last.date !== label) grouped.push({ date: label, msgs: [m] });
    else last.msgs.push(m);
  }

  async function handleSend() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText('');
    await onSend(body);
    setSending(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg2, padding: SPACING.xl }}>
        <SkeletonList count={5} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 80}
    >
      <FlatList
        ref={flatRef}
        data={grouped}
        keyExtractor={g => g.date}
        contentContainerStyle={cv.msgList}
        showsVerticalScrollIndicator={false}
        onLayout={() => flatRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={cv.empty}>
            <Text style={cv.emptyIcon}>💬</Text>
            <Text style={[cv.emptyTitle, { color: cvc.textPrimary }]}>Žiadne správy</Text>
            <Text style={[cv.emptySub, { color: cvc.textSecondary }]}>Začnite konverzáciu s tímom</Text>
          </View>
        }
        renderItem={({ item: group }) => (
          <View>
            <View style={cv.dateSep}>
              <View style={cv.dateLine} />
              <Text style={cv.dateLabel}>{group.date}</Text>
              <View style={cv.dateLine} />
            </View>
            {group.msgs.map((m: Message) => (
              <ChatBubble key={m.id} msg={m} isMe={m.sender_id === myId} />
            ))}
          </View>
        )}
      />

      <View style={[cv.inputBar, { backgroundColor: cvc.cardBg, borderTopColor: cvc.bg3 }]}>
        <TextInput
          style={[cv.input, { backgroundColor: cvc.bg2, color: cvc.textPrimary, borderColor: cvc.bg3 }]}
          placeholder={placeholder}
          placeholderTextColor={cvc.textSecondary}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[cv.sendBtn, (!text.trim() || sending) && cv.sendDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
          activeOpacity={0.8}
        >
          {sending
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="send" size={18} color="#fff" />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── NewConversationModal ─────────────────────────────────────────────────────

function NewConvoModal({
  visible,
  staff,
  myId,
  onSelect,
  onClose
}: {
  visible: boolean;
  staff: StaffMember[];
  myId: string;
  onSelect: (member: StaffMember) => void;
  onClose: () => void;
}) {
  const { colors: nc } = useAppTheme();
  const others = staff.filter(s => s.id !== myId);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={nm.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[nm.sheet, { backgroundColor: nc.cardBg }]}>
        <View style={[nm.handle, { backgroundColor: nc.bg3 }]} />
        <Text style={[nm.title, { color: nc.textPrimary }]}>Nová konverzácia</Text>
        <Text style={[nm.sub, { color: nc.textSecondary }]}>Vyber člena tímu</Text>
        <ScrollView style={{ maxHeight: 360 }}>
          {others.map(s => (
            <TouchableOpacity key={s.id} style={nm.row} onPress={() => onSelect(s)} activeOpacity={0.75}>
              <View style={nm.avatar}>
                <Text style={nm.avatarText}>{initials(s.full_name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[nm.name, { color: nc.textPrimary }]}>{s.full_name}</Text>
                <Text style={[nm.role, { color: nc.textSecondary }]}>{ROLE_LABELS[s.role] ?? s.role}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={COLORS.sand} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function StaffChatScreen() {
  const { colors } = useAppTheme();
  const dyn = {
    bg:   { backgroundColor: colors.bg2 },
    card: { backgroundColor: colors.cardBg, borderColor: colors.bg3 },
    text: { color: colors.textPrimary },
    sub:  { color: colors.textSecondary }
  };
  const [tab, setTab] = useState<'broadcast' | 'dm'>('broadcast');

  const [myId, setMyId]               = useState('');
  const [staff, setStaff]             = useState<StaffMember[]>([]);
  const [broadcastMsgs, setBroadcast] = useState<Message[]>([]);
  const [dmMsgs, setDmMsgs]           = useState<Message[]>([]);
  const [threads, setThreads]         = useState<Thread[]>([]);
  const [dmPartner, setDmPartner]     = useState<StaffMember | null>(null);
  const [loadingB, setLoadingB]       = useState(true);
  const [loadingDM, setLoadingDM]     = useState(false);
  const [refreshingDM, setRefreshingDM] = useState(false);
  const [newConvoOpen, setNewConvoOpen] = useState(false);

  const staffRef     = useRef<StaffMember[]>([]);
  const dmPartnerRef = useRef<StaffMember | null>(null);
  useEffect(() => { staffRef.current = staff; }, [staff]);
  useEffect(() => { dmPartnerRef.current = dmPartner; }, [dmPartner]);

  // Auth + initial load
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setMyId(user.id);
    }).catch(console.error);
  }, []);

  // Load staff list
  useEffect(() => {
    supabase.from('profiles')
      .select('id, full_name, role')
      .in('role', ['doctor', 'reception', 'hygienist', 'owner'])
      .order('full_name')
      .then(({ data }) => setStaff((data ?? []) as StaffMember[]))
      .catch(console.error);
  }, []);

  // Load broadcast
  const loadBroadcast = useCallback(async () => {
    setLoadingB(true);
    const { data } = await supabase
      .from('staff_messages')
      .select('id, body, created_at, sender_id, recipient_id, read_at, sender:sender_id(full_name)')
      .is('recipient_id', null)
      .order('created_at', { ascending: true })
      .limit(200);
    setBroadcast((data ?? []) as unknown as Message[]);
    setLoadingB(false);
  }, []);

  useFocusEffect(useCallback(() => { loadBroadcast(); }, [loadBroadcast]));

  // Broadcast realtime
  useEffect(() => {
    if (!myId) return;
    const ch = supabase
      .channel('staff_broadcast_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'staff_messages' },
        (payload) => {
          const raw = payload.new as Message;
          const senderName = staffRef.current.find(s => s.id === raw.sender_id)?.full_name ?? null;
          const msg: Message = { ...raw, sender: { full_name: senderName } };
          if (msg.recipient_id === null) {
            setBroadcast(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
          } else if (msg.sender_id === myId || msg.recipient_id === myId) {
            const partner = dmPartnerRef.current;
            if (partner && (msg.sender_id === partner.id || msg.recipient_id === partner.id)) {
              setDmMsgs(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
            }
            loadThreads();
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [myId]);

  // Load DM threads
  const loadThreads = useCallback(async () => {
    if (!myId) return;
    const { data } = await supabase
      .from('staff_messages')
      .select('id, body, created_at, sender_id, recipient_id, read_at')
      .or(`sender_id.eq.${myId},recipient_id.eq.${myId}`)
      .not('recipient_id', 'is', null)
      .order('created_at', { ascending: false });

    if (!data) return;

    const threadMap = new Map<string, { msgs: Message[]; unread: number }>();
    for (const m of data as Message[]) {
      const partnerId = m.sender_id === myId ? m.recipient_id! : m.sender_id;
      if (!threadMap.has(partnerId)) threadMap.set(partnerId, { msgs: [], unread: 0 });
      const t = threadMap.get(partnerId)!;
      t.msgs.push(m);
      if (m.recipient_id === myId && !m.read_at) t.unread++;
    }

    const result: Thread[] = [];
    for (const [partnerId, { msgs, unread }] of threadMap) {
      const partner = staff.find(s => s.id === partnerId);
      if (partner) result.push({ partner, lastMsg: msgs[0], unread });
    }
    result.sort((a, b) => new Date(b.lastMsg.created_at).getTime() - new Date(a.lastMsg.created_at).getTime());
    setThreads(result);
  }, [myId, staff]);

  useEffect(() => { if (myId) loadThreads(); }, [myId, staff]);

  // Open a DM conversation
  async function openDm(partner: StaffMember) {
    setDmPartner(partner);
    setNewConvoOpen(false);
    setLoadingDM(true);
    const { data } = await supabase
      .from('staff_messages')
      .select('id, body, created_at, sender_id, recipient_id, read_at, sender:sender_id(full_name)')
      .or(`and(sender_id.eq.${myId},recipient_id.eq.${partner.id}),and(sender_id.eq.${partner.id},recipient_id.eq.${myId})`)
      .order('created_at', { ascending: true })
      .limit(200);
    setDmMsgs((data ?? []) as unknown as Message[]);
    setLoadingDM(false);

    // Mark received as read
    await supabase
      .from('staff_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', myId)
      .eq('sender_id', partner.id)
      .is('read_at', null);
    loadThreads();
  }

  // Send broadcast — realtime handles the append
  async function sendBroadcast(body: string) {
    if (!myId) return;
    await supabase.from('staff_messages').insert({ sender_id: myId, recipient_id: null, body });
  }

  // Send DM — realtime handles the append
  async function sendDm(body: string) {
    if (!myId || !dmPartner) return;
    await supabase.from('staff_messages').insert({
      sender_id: myId,
      recipient_id: dmPartner.id,
      body
    });
  }

  // ── DM conversation view ──
  if (dmPartner) {
    return (
      <View style={[s.safe, dyn.bg]}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => { setDmPartner(null); loadThreads(); }} style={s.backBtn} activeOpacity={0.75}>
            <Ionicons name="arrow-back" size={20} color={COLORS.cream} />
          </TouchableOpacity>
          <View style={s.dmAvatar}>
            <Text style={s.dmAvatarText}>{initials(dmPartner.full_name)}</Text>
          </View>
          <View>
            <Text style={s.headerTitle}>{dmPartner.full_name || 'Člen tímu'}</Text>
            <Text style={s.headerSub}>{ROLE_LABELS[dmPartner.role] ?? dmPartner.role}</Text>
          </View>
        </View>
        <ChatView
          messages={dmMsgs}
          loading={loadingDM}
          myId={myId}
          onSend={sendDm}
          placeholder={`Napíš ${(dmPartner.full_name || 'správu').split(' ')[0]}...`}
        />
      </View>
    );
  }

  // ── Main tab view ──
  return (
    <View style={[s.safe, dyn.bg]}>

      {/* ── Header ── */}
      <View style={s.header}>
        <View style={s.headerIcon}>
          <Ionicons name="chatbubbles" size={20} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerSub}>TÍM</Text>
          <Text style={s.headerTitle}>Správy</Text>
        </View>
        {tab === 'dm' && (
          <TouchableOpacity style={s.newBtn} onPress={() => setNewConvoOpen(true)} activeOpacity={0.8}>
            <Ionicons name="create-outline" size={18} color={COLORS.cream} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Tabs ── */}
      <View style={s.tabRow}>
        {(['broadcast', 'dm'] as const).map(t => (
          <TouchableOpacity key={t} style={[s.tabBtn, tab === t && s.tabBtnActive]} onPress={() => setTab(t)} activeOpacity={0.75}>
            <Text style={[s.tabBtnText, tab === t && s.tabBtnTextActive]}>
              {t === 'broadcast' ? 'Broadcast' : 'Konverzácie'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Content ── */}
      {tab === 'broadcast' ? (
        <ChatView
          messages={broadcastMsgs}
          loading={loadingB}
          myId={myId}
          onSend={sendBroadcast}
          placeholder="Napíš správu celému tímu..."
        />
      ) : (
        <View style={{ flex: 1 }}>
          {threads.length === 0 ? (
            <View style={s.emptyCenter}>
              <Text style={{ fontSize: 40 }}>📨</Text>
              <Text style={[s.emptyTitle, dyn.text]}>Žiadne konverzácie</Text>
              <Text style={[s.emptySub, dyn.sub]}>Začni novú správu stlačením + vpravo hore.</Text>
            </View>
          ) : (
            <FlatList
              data={threads}
              keyExtractor={t => t.partner.id}
              contentContainerStyle={{ paddingTop: 8, paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshingDM}
                  onRefresh={() => { setRefreshingDM(true); loadThreads().then(() => setRefreshingDM(false)); }}
                  tintColor={COLORS.wal}
                  colors={[COLORS.wal]}
                />
              }
              renderItem={({ item: thread }) => (
                <TouchableOpacity style={[s.threadRow, dyn.card]} onPress={() => openDm(thread.partner)} activeOpacity={0.75}>
                  <View style={s.threadAvatar}>
                    <Text style={s.threadAvatarText}>{initials(thread.partner.full_name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={s.threadTop}>
                      <Text style={[s.threadName, dyn.text, thread.unread > 0 && s.threadNameBold]}>
                        {thread.partner.full_name}
                      </Text>
                      <Text style={s.threadTime}>{formatTime(thread.lastMsg.created_at)}</Text>
                    </View>
                    <View style={s.threadBottom}>
                      <Text style={[s.threadPreview, thread.unread > 0 && [s.threadPreviewBold, dyn.text]]} numberOfLines={1}>
                        {thread.lastMsg.sender_id === myId ? 'Ty: ' : ''}{thread.lastMsg.body}
                      </Text>
                      {thread.unread > 0 && (
                        <View style={s.unreadBadge}>
                          <Text style={s.unreadText}>{thread.unread}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}

      <NewConvoModal
        visible={newConvoOpen}
        staff={staff}
        myId={myId}
        onSelect={openDm}
        onClose={() => setNewConvoOpen(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg2 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.esp, paddingHorizontal: SPACING.xl,
    paddingTop: 10, paddingBottom: 16
  },
  headerIcon: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center'
  },
  headerSub:   { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', marginBottom: 2 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#F5F6F8' },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center'
  },
  dmAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center'
  },
  dmAvatarText: { fontSize: 14, fontWeight: '700', color: '#F5F6F8' },
  newBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center'
  },

  tabRow: {
    flexDirection: 'row', backgroundColor: COLORS.esp,
    paddingHorizontal: SPACING.xl, paddingBottom: 14, gap: 8
  },
  tabBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 2,
    alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)'
  },
  tabBtnActive: { backgroundColor: COLORS.wal },
  tabBtnText:   { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  tabBtnTextActive: { color: '#F5F6F8' },

  emptyCenter: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10
  },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.esp },
  emptySub:   { fontSize: 13, color: COLORS.wal, textAlign: 'center', lineHeight: 18 },

  threadRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.cream, marginHorizontal: SPACING.xl,
    marginBottom: 8, borderRadius: 2, padding: 14,
    borderWidth: 1, borderColor: COLORS.bg3, elevation: 1
  },
  threadAvatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center'
  },
  threadAvatarText: { fontSize: 16, fontWeight: '700', color: '#F5F6F8' },
  threadTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  threadName: { fontSize: 14, fontWeight: '600', color: COLORS.esp },
  threadNameBold: { fontWeight: '700' },
  threadTime: { fontSize: 11, color: '#aaa' },
  threadBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  threadPreview: { flex: 1, fontSize: 13, color: '#888', lineHeight: 18 },
  threadPreviewBold: { color: COLORS.esp, fontWeight: '600' },
  unreadBadge: {
    backgroundColor: COLORS.wal, borderRadius: 2,
    minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 5, marginLeft: 8
  },
  unreadText: { fontSize: 11, fontWeight: '700', color: '#F5F6F8' }
});

// ChatView styles
const cv = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { fontSize: 13, color: COLORS.wal },
  msgList: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 },
  dateSep:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 16 },
  dateLine:  { flex: 1, height: 1, backgroundColor: COLORS.bg3 },
  dateLabel: { fontSize: 11, color: '#888', fontWeight: '600', letterSpacing: 0.5 },
  empty:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyIcon:  { fontSize: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.esp },
  emptySub:   { fontSize: 13, color: COLORS.wal },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: COLORS.cream, borderTopWidth: 1, borderTopColor: COLORS.bg3
  },
  input: {
    flex: 1, backgroundColor: COLORS.bg2, borderRadius: 4,
    paddingHorizontal: 14, paddingVertical: 9,
    fontSize: 14, color: COLORS.esp, maxHeight: 100,
    borderWidth: 1, borderColor: COLORS.bg3
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center'
  },
  sendDisabled: { opacity: 0.35 }
});

// Bubble styles
const bubble = StyleSheet.create({
  wrap:   { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 6 },
  wrapMe: { flexDirection: 'row-reverse' },
  avatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center', marginBottom: 2
  },
  avatarText: { fontSize: 11, fontWeight: '700', color: '#F5F6F8' },
  box: {
    maxWidth: '75%', borderRadius: 4, paddingHorizontal: 12, paddingVertical: 8,
    elevation: 1, shadowColor: '#121417', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2
  },
  boxMe:    { backgroundColor: COLORS.esp, borderBottomRightRadius: 4 },
  boxOther: { backgroundColor: COLORS.cream, borderBottomLeftRadius: 4 },
  senderName: { fontSize: 11, fontWeight: '700', color: COLORS.wal, marginBottom: 3 },
  text:   { fontSize: 14, color: COLORS.esp, lineHeight: 20 },
  textMe: { color: '#F5F6F8' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  time:   { fontSize: 10, color: '#aaa' },
  timeMe: { color: 'rgba(255,255,255,0.55)' }
});

// NewConvoModal styles
const nm = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: COLORS.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: SPACING.xl, paddingTop: 12, paddingBottom: 32
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.bg3,
    alignSelf: 'center', marginBottom: 16
  },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.esp, marginBottom: 2 },
  sub:   { fontSize: 13, color: COLORS.wal, marginBottom: 16 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.bg3
  },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center'
  },
  avatarText: { fontSize: 15, fontWeight: '700', color: '#F5F6F8' },
  name: { fontSize: 14, fontWeight: '600', color: COLORS.esp },
  role: { fontSize: 12, color: COLORS.wal, marginTop: 2 }
});
