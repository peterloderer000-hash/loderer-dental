import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ActivityIndicator, FlatList, Image, KeyboardAvoidingView,
  Platform, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, RADII, GRADIENTS } from '../../styles/theme';
import HeroHeader from '../../components/ui/HeroHeader';
import { SkeletonList } from '../../components/Skeleton';
import { AnimatedListItem } from '../../components/ui/AnimatedListItem';
import { useAppTheme } from '../../context/ThemeContext';

type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  is_read: boolean;
  created_at: string;
};

function fmtTime(d: string) {
  const date = new Date(d);
  const now  = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays === 0) return date.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return `včera ${date.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' })}`;
  return date.toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function PatientMessagesScreen() {
  const router  = useRouter();
  const { colors, dark } = useAppTheme();

  const [messages,   setMessages]   = useState<Message[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [text,       setText]       = useState('');
  const [sending,    setSending]    = useState(false);
  const [myId,       setMyId]       = useState('');
  const [doctorId,   setDoctorId]   = useState('');
  const [doctorName, setDoctorName] = useState('MDDr. Loderer');
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setMyId(user.id);

    // Načítaj doktora
    const { data: doctors } = await supabase
      .from('profiles').select('id, full_name').eq('role', 'doctor').limit(1);
    const doc = doctors?.[0];
    if (!doc) { setLoading(false); return; }
    setDoctorId(doc.id);
    setDoctorName(doc.full_name ?? 'MDDr. Loderer');

    // Správy medzi mnou a doktorom
    const { data } = await supabase
      .from('messages')
      .select('id, sender_id, receiver_id, body, is_read, created_at')
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${doc.id}),and(sender_id.eq.${doc.id},receiver_id.eq.${user.id})`)
      .order('created_at', { ascending: true })
      .limit(200);

    setMessages((data ?? []) as Message[]);
    setLoading(false);

    // Označiť prijaté ako prečítané
    if (data && data.length > 0) {
      const unread = data.filter((m) => m.receiver_id === user.id && !m.is_read).map((m) => m.id);
      if (unread.length > 0) {
        await supabase.from('messages').update({ is_read: true }).in('id', unread);
      }
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription
  useEffect(() => {
    if (!myId || !doctorId) return;
    const channel = supabase.channel(`messages-patient-${myId}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'messages',
        filter: `receiver_id=eq.${myId}`,
      }, (payload) => {
        setMessages((prev) => [...prev, payload.new as Message]);
        supabase.from('messages').update({ is_read: true }).eq('id', (payload.new as Message).id);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [myId, doctorId]);

  async function handleSend(body?: string) {
    const trimmed = (body ?? text).trim();
    if (!trimmed || !myId || !doctorId || sending) return;
    setSending(true);
    if (!body) setText('');
    try {
      const { data, error } = await supabase.from('messages').insert({
        sender_id:   myId,
        receiver_id: doctorId,
        body:        trimmed,
      }).select().single();
      if (error) throw error;
      setMessages((prev) => [...prev, data as Message]);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      if (!body) setText(trimmed);
    } finally {
      setSending(false);
    }
  }

  async function handlePickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: false,
    });
    if (result.canceled || !result.assets[0]) return;
    setSending(true);
    try {
      const asset = result.assets[0];
      const ext   = asset.uri.split('.').pop() ?? 'jpg';
      const path  = `messages/${myId}/${Date.now()}.${ext}`;
      const response = await fetch(asset.uri);
      const blob     = await response.blob();
      const { error: upErr } = await supabase.storage.from('message-photos').upload(path, blob, { contentType: `image/${ext}` });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('message-photos').getPublicUrl(path);
      await handleSend(`[FOTO:${urlData.publicUrl}]`);
    } catch {
      // Silent fail — photo upload not critical
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (messages.length > 0)
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 150);
  }, [messages.length]);

  return (
    <View style={styles.safe}>
      <HeroHeader
        title={doctorName}
        subtitle="Zubná ambulancia"
        icon="chatbubbles-outline"
        onBack={() => router.back()}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 80}>
        {loading ? (
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
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyEmoji}>💬</Text>
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Zatiaľ žiadne správy</Text>
                <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Napíšte doktorovi otázku alebo poznámku k termínu.</Text>
              </View>
            }
            renderItem={({ item }) => {
              const isMine  = item.sender_id === myId;
              const isPhoto = item.body.startsWith('[FOTO:') && item.body.endsWith(']');
              const photoUrl = isPhoto ? item.body.slice(6, -1) : null;
              return (
                <View style={[styles.bubble, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  {photoUrl ? (
                    <Image source={{ uri: photoUrl }} style={styles.bubblePhoto} resizeMode="cover" />
                  ) : (
                    <Text style={[styles.bubbleText, { color: colors.textPrimary }, isMine && styles.bubbleTextMine]}>{item.body}</Text>
                  )}
                  <Text style={[styles.bubbleTime, { color: colors.textSecondary }, isMine && styles.bubbleTimeMine]}>{fmtTime(item.created_at)}</Text>
                </View>
              );
            }}
          />
        )}

        {/* Input */}
        <View style={[styles.inputRow, { backgroundColor: colors.cardBg, borderTopColor: colors.bg3 }]}>
          <TouchableOpacity style={styles.photoBtn} onPress={handlePickPhoto} disabled={sending} activeOpacity={0.8}>
            <Ionicons name="image-outline" size={22} color={sending ? colors.bg3 : COLORS.wal} />
          </TouchableOpacity>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bg2, color: colors.textPrimary, borderColor: colors.bg3 }]}
            placeholder="Napíšte správu..."
            placeholderTextColor={dark ? '#B8ACA0' : '#B8ACA0'}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={500}
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
            onPress={() => handleSend()}
            disabled={!text.trim() || sending}
            activeOpacity={0.8}>
            {sending
              ? <ActivityIndicator color="#F5F6F8" size="small" />
              : <Ionicons name="send" size={18} color="#F5F6F8" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.esp },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg2 },

  // Header
  header:     { backgroundColor: COLORS.esp, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SPACING.xl, paddingTop: 14, paddingBottom: 16 },
  backBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  doctorAvatar:{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerName: { fontSize: 15, fontWeight: '700', color: '#F5F6F8' },
  headerSub:  { fontSize: 12, color: COLORS.sand },

  // List
  listContent: { padding: 14, paddingBottom: 10, flexGrow: 1 },
  emptyWrap:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyEmoji:  { fontSize: 48, marginBottom: 14 },
  emptyTitle:  { fontSize: 17, fontWeight: '700', color: COLORS.esp, marginBottom: 6 },
  emptySub:    { fontSize: 13, color: COLORS.wal, textAlign: 'center', paddingHorizontal: 40 },

  // Bubbles
  bubble:          { maxWidth: '80%', borderRadius: 4, padding: 12, marginBottom: 8, backgroundColor: COLORS.cream, borderWidth: 1, borderColor: COLORS.bg3, alignSelf: 'flex-start' },
  bubbleMine:      { backgroundColor: COLORS.esp, borderColor: COLORS.esp, alignSelf: 'flex-end' },
  bubbleTheirs:    {},
  bubbleText:      { fontSize: 14, color: COLORS.esp, lineHeight: 20 },
  bubbleTextMine:  { color: '#F5F6F8' },
  bubbleTime:      { fontSize: 11, color: '#B8ACA0', marginTop: 4, textAlign: 'right' },
  bubbleTimeMine:  { color: COLORS.sand },

  // Input
  inputRow:        { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12, backgroundColor: COLORS.cream, borderTopWidth: 1, borderTopColor: COLORS.bg3 },
  input:           { flex: 1, backgroundColor: COLORS.bg2, borderRadius: 4, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: COLORS.esp, maxHeight: 100, borderWidth: 1, borderColor: COLORS.bg3 },
  photoBtn:        { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  bubblePhoto:     { width: 200, height: 150, borderRadius: 2, marginBottom: 4 },
  sendBtn:         { width: 44, height: 44, borderRadius: 4, backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
});
