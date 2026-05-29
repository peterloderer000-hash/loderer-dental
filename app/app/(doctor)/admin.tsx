import React, { useState, useCallback } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../supabase';
import { COLORS, SPACING, RADII } from '../../styles/theme';
import { SkeletonList } from '../../components/Skeleton';
import { useAppTheme } from '../../context/ThemeContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  full_name: string;
  role: string;
  email?: string;
  phone?: string;
  specialty?: string;
}

interface ClinicInfo {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
}

interface Stats {
  totalPatients: number;
  totalAppointments: number;
  thisMonthAppointments: number;
  pendingAppointments: number;
  totalPayments: number;
  paidPayments: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  doctor: 'Doktor', reception: 'Recepcia', hygienist: 'Hygienista',
  owner: 'Vlastník', patient: 'Pacient',
};

const ROLE_COLORS: Record<string, { bg: string; darkBg: string; text: string; darkText: string }> = {
  doctor:    { bg: '#EBF5FB', darkBg: '#0D2233', text: '#1A5276', darkText: '#5DADE2' },
  reception: { bg: '#FEF9E7', darkBg: '#2D2200', text: '#7D6608', darkText: '#F39C12' },
  hygienist: { bg: '#EAFAF1', darkBg: '#0D3B1F', text: '#1E8449', darkText: '#27AE60' },
  owner:     { bg: '#F5EEF8', darkBg: '#1E0D33', text: '#6C3483', darkText: '#AF7AC5' },
};

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

function euros(cents: number) {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

// ─── Invite Modal ─────────────────────────────────────────────────────────────

function InviteModal({
  visible, onClose, onSent,
}: {
  visible: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  const { colors, dark } = useAppTheme();
  const [email, setEmail]   = useState('');
  const [role, setRole]     = useState<'doctor' | 'reception' | 'hygienist'>('doctor');
  const [loading, setLoading] = useState(false);

  const ROLES = [
    { key: 'doctor'    as const, label: 'Doktor' },
    { key: 'reception' as const, label: 'Recepcia' },
    { key: 'hygienist' as const, label: 'Hygienista' },
  ];

  async function handleInvite() {
    if (!email.trim()) { Alert.alert('Chyba', 'Zadaj e-mail.'); return; }
    setLoading(true);

    const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase.from('invitations').insert({
      email: email.trim().toLowerCase(),
      role,
      token,
      expires_at: expiresAt,
    });

    setLoading(false);
    if (error) { Alert.alert('Chyba', error.message); return; }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      'Pozvánka vytvorená',
      `Kód pre ${email.trim()}:\n\n${token}\n\nPlatí 7 dní.`,
      [{ text: 'OK', onPress: () => { setEmail(''); onClose(); onSent(); } }],
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={im.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[im.sheet, { backgroundColor: colors.cardBg }]}>
        <View style={[im.handle, { backgroundColor: colors.bg3 }]} />
        <Text style={[im.title, { color: colors.textPrimary }]}>Pozvať člena tímu</Text>
        <Text style={[im.sub, { color: colors.textSecondary }]}>Pošlite kód novému zamestnancovi</Text>

        <Text style={[im.label, { color: colors.textSecondary }]}>E-MAIL</Text>
        <View style={[im.inputWrap, { backgroundColor: colors.bg2, borderColor: colors.bg3 }]}>
          <Ionicons name="mail-outline" size={17} color={COLORS.wal} style={{ marginRight: 8 }} />
          <TextInput
            style={[im.input, { color: colors.textPrimary }]}
            placeholder="meno@klinika.sk"
            placeholderTextColor={dark ? '#666' : '#999'}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoFocus
          />
        </View>

        <Text style={[im.label, { marginTop: 16, color: colors.textSecondary }]}>ROLA</Text>
        <View style={im.roleRow}>
          {ROLES.map(r => (
            <TouchableOpacity
              key={r.key}
              style={[im.roleBtn, role === r.key && im.roleBtnActive]}
              onPress={() => setRole(r.key)}
              activeOpacity={0.8}
            >
              <Text style={[im.roleBtnText, role === r.key && im.roleBtnTextActive]}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[im.sendBtn, (!email.trim() || loading) && im.sendBtnDisabled]}
          onPress={handleInvite}
          disabled={!email.trim() || loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <><Ionicons name="send-outline" size={16} color="#fff" /><Text style={im.sendBtnText}>Vytvoriť pozvánku</Text></>}
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

type AdminTab = 'team' | 'clinic' | 'stats';

export default function AdminScreen() {
  const { colors, dark } = useAppTheme();
  const [tab, setTab]           = useState<AdminTab>('team');
  const [team, setTeam]         = useState<TeamMember[]>([]);
  const [clinic, setClinic]     = useState<ClinicInfo | null>(null);
  const [stats, setStats]       = useState<Stats | null>(null);
  const [teamStats, setTeamStats] = useState<Map<string, { thisMonth: number; avgRating: number | null; completed: number; cancelled: number }>>(new Map());
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  // Clinic edit state
  const [editing, setEditing]   = useState(false);
  const [editForm, setEditForm] = useState<Partial<ClinicInfo>>({});
  const [savingClinic, setSavingClinic] = useState(false);

  const load = useCallback(async () => {
    // Team
    const { data: teamData } = await supabase
      .from('profiles')
      .select('id, full_name, role, phone, specialty')
      .in('role', ['doctor', 'reception', 'hygienist', 'owner'])
      .order('role')
      .order('full_name');
    setTeam((teamData ?? []) as TeamMember[]);

    // Team stats — per-member appointment stats
    const staffIds = ((teamData ?? []) as TeamMember[])
      .filter(m => m.role === 'doctor' || m.role === 'hygienist')
      .map(m => m.id);
    if (staffIds.length > 0) {
      const mStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const { data: apptData } = await supabase
        .from('appointments')
        .select('doctor_id, status, patient_rating, appointment_date')
        .in('doctor_id', staffIds);
      const tMap = new Map<string, { thisMonth: number; avgRating: number | null; completed: number; cancelled: number }>();
      staffIds.forEach(id => {
        const all       = (apptData ?? []).filter((a: any) => a.doctor_id === id);
        const thisMonth = all.filter((a: any) => a.appointment_date >= mStart).length;
        const completed = all.filter((a: any) => a.status === 'completed').length;
        const cancelled = all.filter((a: any) => a.status === 'cancelled').length;
        const rated     = all.filter((a: any) => a.patient_rating != null && a.patient_rating > 0);
        const avgRating = rated.length > 0
          ? Math.round((rated.reduce((s: number, a: any) => s + (a.patient_rating ?? 0), 0) / rated.length) * 10) / 10
          : null;
        tMap.set(id, { thisMonth, avgRating, completed, cancelled });
      });
      setTeamStats(tMap);
    }

    // Clinic (take first clinic or owner's default)
    const { data: clinicData } = await supabase
      .from('clinics')
      .select('id, name, address, phone, email, website')
      .limit(1)
      .maybeSingle();
    setClinic(clinicData ?? null);
    if (clinicData) setEditForm(clinicData);

    // Stats
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [patients, appts, monthAppts, pending, payments, paid] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'patient'),
      supabase.from('appointments').select('id', { count: 'exact', head: true }),
      supabase.from('appointments').select('id', { count: 'exact', head: true }).gte('appointment_date', monthStart),
      supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('payments').select('amount_cents'),
      supabase.from('payments').select('amount_cents').eq('status', 'paid'),
    ]);

    const totalPay = (payments.data ?? []).reduce((s: number, p: any) => s + (p.amount_cents ?? 0), 0);
    const paidPay  = (paid.data ?? []).reduce((s: number, p: any) => s + (p.amount_cents ?? 0), 0);

    setStats({
      totalPatients:         patients.count ?? 0,
      totalAppointments:     appts.count ?? 0,
      thisMonthAppointments: monthAppts.count ?? 0,
      pendingAppointments:   pending.count ?? 0,
      totalPayments:         totalPay,
      paidPayments:          paidPay,
    });

    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function removeTeamMember(member: TeamMember) {
    Alert.alert(
      'Odstrániť člena',
      `Naozaj chcete odstrániť ${member.full_name} z tímu? Rola bude zmenená na pacienta.`,
      [
        { text: 'Zrušiť', style: 'cancel' },
        {
          text: 'Odstrániť', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('profiles').update({ role: 'patient' }).eq('id', member.id);
            if (error) { Alert.alert('Chyba', error.message); return; }
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            load();
          },
        },
      ],
    );
  }

  async function saveClinic() {
    if (!clinic?.id) return;
    setSavingClinic(true);
    const { error } = await supabase.from('clinics').update({
      name:    editForm.name    ?? clinic.name,
      address: editForm.address ?? null,
      phone:   editForm.phone   ?? null,
      email:   editForm.email   ?? null,
      website: editForm.website ?? null,
    }).eq('id', clinic.id);
    setSavingClinic(false);
    if (error) { Alert.alert('Chyba', error.message); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setClinic(prev => prev ? { ...prev, ...editForm } : prev);
    setEditing(false);
  }

  // ── Render ──

  const TABS: { key: AdminTab; label: string; icon: any }[] = [
    { key: 'team',   label: 'Tím',     icon: 'people' },
    { key: 'clinic', label: 'Klinika', icon: 'business' },
    { key: 'stats',  label: 'Štatistiky', icon: 'stats-chart' },
  ];

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.bg2 }]} edges={['top']}>

      {/* ── Header ── */}
      <View style={s.header}>
        <View style={s.headerIcon}>
          <Ionicons name="settings" size={20} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerSub}>VLASTNÍK</Text>
          <Text style={s.headerTitle}>Admin panel</Text>
        </View>
        {tab === 'team' && (
          <TouchableOpacity style={s.inviteBtn} onPress={() => setInviteOpen(true)} activeOpacity={0.8}>
            <Ionicons name="person-add-outline" size={16} color={COLORS.cream} />
            <Text style={s.inviteBtnText}>Pozvať</Text>
          </TouchableOpacity>
        )}
        {tab === 'clinic' && !editing && (
          <TouchableOpacity style={s.inviteBtn} onPress={() => setEditing(true)} activeOpacity={0.8}>
            <Ionicons name="create-outline" size={16} color={COLORS.cream} />
            <Text style={s.inviteBtnText}>Upraviť</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Tab row ── */}
      <View style={[s.tabRow, { backgroundColor: colors.cardBg, borderBottomColor: colors.bg3 }]}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[s.tabBtn, tab === t.key && s.tabBtnActive, tab === t.key && dark && { borderBottomColor: COLORS.gold }]} onPress={() => setTab(t.key)} activeOpacity={0.75}>
            <Ionicons name={tab === t.key ? t.icon : `${t.icon}-outline` as any} size={16} color={tab === t.key ? colors.textPrimary : '#aaa'} />
            <Text style={[s.tabBtnText, tab === t.key && s.tabBtnTextActive, tab === t.key && { color: colors.textPrimary }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ padding: SPACING.xl }}><SkeletonList count={5} /></View>
      ) : (
        <>
          {/* ── TEAM ── */}
          {tab === 'team' && (
            <FlatList
              data={team}
              keyExtractor={m => m.id}
              style={{ backgroundColor: colors.bg2 }}
              contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 100 }}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.wal} />}
              ListHeaderComponent={
                <Text style={s.listMeta}>{team.length} členov tímu</Text>
              }
              ListEmptyComponent={
                <View style={s.empty}>
                  <Text style={{ fontSize: 36 }}>👥</Text>
                  <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Tím je prázdny</Text>
                  <Text style={[s.emptySub, { color: colors.textSecondary }]}>Pozvite prvého člena tímu.</Text>
                  <TouchableOpacity style={s.emptyCta} onPress={() => setInviteOpen(true)}>
                    <Text style={s.emptyCtaText}>Pozvať člena</Text>
                  </TouchableOpacity>
                </View>
              }
              renderItem={({ item: m }) => {
                const rc = ROLE_COLORS[m.role] ?? { bg: COLORS.bg3, darkBg: '#3D2E22', text: COLORS.wal, darkText: COLORS.sand };
                return (
                  <View style={[s.memberCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                    <View style={s.memberAvatar}>
                      <Text style={s.memberAvatarText}>{initials(m.full_name)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={s.memberTop}>
                        <Text style={[s.memberName, { color: colors.textPrimary }]}>{m.full_name}</Text>
                        <View style={[s.roleBadge, { backgroundColor: dark ? rc.darkBg : rc.bg }]}>
                          <Text style={[s.roleBadgeText, { color: dark ? rc.darkText : rc.text }]}>
                            {ROLE_LABELS[m.role] ?? m.role}
                          </Text>
                        </View>
                      </View>
                      {m.specialty && <Text style={[s.memberSub, { color: colors.textSecondary }]}>{m.specialty}</Text>}
                      {m.phone && (
                        <Text style={s.memberPhone}>
                          <Ionicons name="call-outline" size={11} color={COLORS.wal} /> {m.phone}
                        </Text>
                      )}
                    </View>
                    {m.role !== 'owner' && (
                      <TouchableOpacity onPress={() => removeTeamMember(m)} style={[s.removeBtn, { backgroundColor: dark ? '#4A1010' : '#FDF2F2' }]} activeOpacity={0.8}>
                        <Ionicons name="person-remove-outline" size={16} color={dark ? '#E74C3C' : '#c0392b'} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              }}
            />
          )}

          {/* ── CLINIC ── */}
          {tab === 'clinic' && (
            <ScrollView
              style={{ backgroundColor: colors.bg2 }}
              contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 100 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.wal} />}
            >
              {clinic ? (
                editing ? (
                  <View style={[s.clinicCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                    <Text style={[s.clinicEditTitle, { color: colors.textPrimary }]}>Upraviť kliniku</Text>
                    {[
                      { key: 'name',    label: 'NÁZOV KLINIKY',  icon: 'business-outline',  placeholder: 'Loderer Dental' },
                      { key: 'address', label: 'ADRESA',         icon: 'location-outline',  placeholder: 'Hlavná 1, Bratislava' },
                      { key: 'phone',   label: 'TELEFÓN',        icon: 'call-outline',      placeholder: '+421 9XX XXX XXX' },
                      { key: 'email',   label: 'E-MAIL',         icon: 'mail-outline',      placeholder: 'info@klinika.sk' },
                      { key: 'website', label: 'WEBSTRÁNKA',     icon: 'globe-outline',     placeholder: 'www.klinika.sk' },
                    ].map(f => (
                      <View key={f.key} style={{ marginBottom: 14 }}>
                        <Text style={[s.label, { color: colors.textSecondary }]}>{f.label}</Text>
                        <View style={[s.inputWrap, { backgroundColor: colors.bg2, borderColor: colors.bg3 }]}>
                          <Ionicons name={f.icon as any} size={16} color={COLORS.wal} style={{ marginRight: 8 }} />
                          <TextInput
                            style={[s.input, { color: colors.textPrimary }]}
                            value={(editForm as any)[f.key] ?? ''}
                            onChangeText={v => setEditForm(prev => ({ ...prev, [f.key]: v }))}
                            placeholder={f.placeholder}
                            placeholderTextColor={dark ? '#666' : '#999'}
                            autoCapitalize={f.key === 'email' || f.key === 'website' ? 'none' : 'words'}
                          />
                        </View>
                      </View>
                    ))}
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                      <TouchableOpacity style={[s.cancelBtn, { borderColor: colors.bg3, backgroundColor: colors.cardBg }]} onPress={() => { setEditing(false); setEditForm(clinic); }} activeOpacity={0.8}>
                        <Text style={[s.cancelBtnText, { color: colors.textSecondary }]}>Zrušiť</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.saveBtn, savingClinic && { opacity: 0.5 }]} onPress={saveClinic} disabled={savingClinic} activeOpacity={0.85}>
                        {savingClinic ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Uložiť</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={[s.clinicCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                    <View style={s.clinicHeader}>
                      <View style={s.clinicIcon}>
                        <Ionicons name="business" size={24} color={COLORS.sand} />
                      </View>
                      <Text style={[s.clinicName, { color: colors.textPrimary }]}>{clinic.name}</Text>
                    </View>
                    {[
                      { icon: 'location-outline', value: clinic.address },
                      { icon: 'call-outline',     value: clinic.phone },
                      { icon: 'mail-outline',     value: clinic.email },
                      { icon: 'globe-outline',    value: clinic.website },
                    ].map((row, i) => row.value ? (
                      <View key={i} style={s.clinicRow}>
                        <Ionicons name={row.icon as any} size={16} color={COLORS.wal} />
                        <Text style={[s.clinicRowText, { color: colors.textSecondary }]}>{row.value}</Text>
                      </View>
                    ) : null)}
                  </View>
                )
              ) : (
                <View style={s.empty}>
                  <Text style={{ fontSize: 36 }}>🏥</Text>
                  <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Klinika nenájdená</Text>
                  <Text style={[s.emptySub, { color: colors.textSecondary }]}>Pridajte kliniku cez Supabase dashboard.</Text>
                </View>
              )}
            </ScrollView>
          )}

          {/* ── STATS ── */}
          {tab === 'stats' && stats && (
            <ScrollView
              style={{ backgroundColor: colors.bg2 }}
              contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 100 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.wal} />}
            >
              <Text style={[s.statsSection, { color: colors.textSecondary }]}>PACIENTI & TERMÍNY</Text>
              <View style={s.statsGrid}>
                {[
                  { label: 'Pacienti',         value: stats.totalPatients,         icon: 'people-outline',    color: '#1A5276' },
                  { label: 'Celkom termínov',   value: stats.totalAppointments,     icon: 'calendar-outline',  color: '#1E8449' },
                  { label: 'Tento mesiac',      value: stats.thisMonthAppointments, icon: 'today-outline',     color: '#7D6608' },
                  { label: 'Čakajú na potvrd.', value: stats.pendingAppointments,   icon: 'hourglass-outline', color: '#922B21' },
                ].map((card, i) => (
                  <View key={i} style={[s.statCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>
                    <Ionicons name={card.icon as any} size={22} color={card.color} />
                    <Text style={[s.statValue, { color: card.color }]}>{card.value}</Text>
                    <Text style={[s.statLabel, { color: colors.textSecondary }]}>{card.label}</Text>
                  </View>
                ))}
              </View>

              <Text style={[s.statsSection, { marginTop: 20, color: colors.textSecondary }]}>PLATBY</Text>
              <View style={s.payCards}>
                <View style={[s.payCard, dark && { backgroundColor: colors.cardBg, borderColor: '#1A527644' }]}>
                  <Text style={[s.payCardLabel, dark && { color: '#5DADE2' }]}>Celkový obrat</Text>
                  <Text style={[s.payCardValue, dark && { color: '#5DADE2' }]}>{euros(stats.totalPayments)}</Text>
                </View>
                <View style={[s.payCard, dark ? { backgroundColor: '#0D3B1F', borderColor: '#2ECC7144' } : { backgroundColor: '#EAFAF1', borderColor: '#A9DFBF' }]}>
                  <Text style={[s.payCardLabel, { color: dark ? '#27AE60' : '#1E8449' }]}>Zaplatené</Text>
                  <Text style={[s.payCardValue, { color: dark ? '#27AE60' : '#1E8449' }]}>{euros(stats.paidPayments)}</Text>
                </View>
              </View>

              {/* ── Štatistiky tímu ── */}
              {teamStats.size > 0 && (
                <>
                  <Text style={[s.statsSection, { marginTop: 24, color: colors.textSecondary }]}>ŠTATISTIKY TÍMU</Text>
                  {team.filter(m => teamStats.has(m.id)).map(m => {
                    const ts = teamStats.get(m.id)!;
                    const rc = ROLE_COLORS[m.role] ?? { bg: COLORS.bg3, darkBg: '#3D2E22', text: COLORS.wal, darkText: COLORS.sand };
                    return (
                      <View key={m.id} style={[s.memberCard, { backgroundColor: colors.cardBg, borderColor: colors.bg3, marginBottom: 12 }]}>
                        <View style={s.memberAvatar}>
                          <Text style={s.memberAvatarText}>{initials(m.full_name)}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={s.memberTop}>
                            <Text style={[s.memberName, { color: colors.textPrimary }]} numberOfLines={1}>{m.full_name}</Text>
                            <View style={[s.roleBadge, { backgroundColor: dark ? rc.darkBg : rc.bg }]}>
                              <Text style={[s.roleBadgeText, { color: dark ? rc.darkText : rc.text }]}>{ROLE_LABELS[m.role] ?? m.role}</Text>
                            </View>
                          </View>
                          <View style={s.teamStatsRow}>
                            <View style={[s.tsStat, { backgroundColor: dark ? '#0D2233' : '#EBF5FB' }]}>
                              <Text style={[s.tsNum, { color: dark ? '#5DADE2' : '#1A5276' }]}>{ts.thisMonth}</Text>
                              <Text style={[s.tsLabel, { color: dark ? '#5DADE2' : '#1A5276' }]}>tento mes.</Text>
                            </View>
                            <View style={[s.tsStat, { backgroundColor: dark ? '#0D3B1F' : '#EAFAF1' }]}>
                              <Text style={[s.tsNum, { color: dark ? '#27AE60' : '#1E8449' }]}>{ts.completed}</Text>
                              <Text style={[s.tsLabel, { color: dark ? '#27AE60' : '#1E8449' }]}>dokončené</Text>
                            </View>
                            <View style={[s.tsStat, { backgroundColor: dark ? '#4A1010' : '#FDEDEC' }]}>
                              <Text style={[s.tsNum, { color: dark ? '#E74C3C' : '#922B21' }]}>{ts.cancelled}</Text>
                              <Text style={[s.tsLabel, { color: dark ? '#E74C3C' : '#922B21' }]}>zrušené</Text>
                            </View>
                            <View style={[s.tsStat, { backgroundColor: dark ? '#2D2200' : '#FEF9E7' }]}>
                              <Text style={[s.tsNum, { color: dark ? '#F39C12' : '#7D6608' }]}>
                                {ts.avgRating != null ? `${ts.avgRating}⭐` : '—'}
                              </Text>
                              <Text style={[s.tsLabel, { color: dark ? '#F39C12' : '#7D6608' }]}>hodnotenie</Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </>
              )}
            </ScrollView>
          )}
        </>
      )}

      <InviteModal visible={inviteOpen} onClose={() => setInviteOpen(false)} onSent={load} />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.bg2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { fontSize: 13, color: COLORS.wal },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.esp, paddingHorizontal: SPACING.xl,
    paddingTop: 10, paddingBottom: 16,
  },
  headerIcon: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center',
  },
  headerSub:   { fontSize: 9, letterSpacing: 2, color: COLORS.sand, fontWeight: '600', marginBottom: 2 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  inviteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  inviteBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.cream },

  tabRow: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: COLORS.bg3,
  },
  tabBtn: {
    flex: 1, paddingVertical: 12, alignItems: 'center', gap: 3,
    borderBottomWidth: 3, borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: COLORS.esp },
  tabBtnText:   { fontSize: 11, fontWeight: '600', color: '#aaa' },
  tabBtnTextActive: { color: COLORS.esp },

  listMeta: { fontSize: 11, color: '#aaa', fontWeight: '600', letterSpacing: 1, marginBottom: 12 },

  memberCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: COLORS.bg3, elevation: 1,
  },
  memberAvatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: COLORS.wal, alignItems: 'center', justifyContent: 'center',
  },
  memberAvatarText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  memberTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  memberName: { fontSize: 14, fontWeight: '700', color: COLORS.esp, flex: 1 },
  roleBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  roleBadgeText: { fontSize: 10, fontWeight: '700' },
  memberSub:   { fontSize: 12, color: COLORS.wal, marginBottom: 2 },
  memberPhone: { fontSize: 12, color: '#888' },
  removeBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: '#FDF2F2', alignItems: 'center', justifyContent: 'center',
  },

  clinicCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: COLORS.bg3, elevation: 2,
  },
  clinicHeader: { alignItems: 'center', marginBottom: 20, gap: 10 },
  clinicIcon: {
    width: 60, height: 60, borderRadius: 18,
    backgroundColor: COLORS.esp, alignItems: 'center', justifyContent: 'center',
  },
  clinicName: { fontSize: 20, fontWeight: '800', color: COLORS.esp, textAlign: 'center' },
  clinicRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  clinicRowText: { fontSize: 14, color: COLORS.wal, flex: 1 },

  clinicEditTitle: { fontSize: 18, fontWeight: '700', color: COLORS.esp, marginBottom: 18 },
  label: { fontSize: 10, fontWeight: '700', color: COLORS.wal, letterSpacing: 1.5, marginBottom: 7 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: COLORS.bg3,
    borderRadius: 12, backgroundColor: COLORS.bg2, paddingHorizontal: 12,
  },
  input: { flex: 1, paddingVertical: 12, fontSize: 14, color: COLORS.esp },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1.5, borderColor: COLORS.bg3, alignItems: 'center', backgroundColor: '#fff',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.wal },
  saveBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 12,
    backgroundColor: COLORS.esp, alignItems: 'center',
  },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  statsSection: { fontSize: 10, fontWeight: '700', color: COLORS.wal, letterSpacing: 2, marginBottom: 12 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    width: '47%', backgroundColor: '#fff', borderRadius: 14,
    padding: 16, alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: COLORS.bg3, elevation: 1,
  },
  statValue: { fontSize: 28, fontWeight: '800' },
  statLabel: { fontSize: 11, color: COLORS.wal, textAlign: 'center', lineHeight: 15 },

  payCards: { gap: 10 },
  payCard: {
    backgroundColor: '#EBF5FB', borderRadius: 14, padding: 18,
    borderWidth: 1, borderColor: '#AED6F1',
  },
  payCardLabel: { fontSize: 12, fontWeight: '600', color: '#1A5276', marginBottom: 6 },
  payCardValue: { fontSize: 28, fontWeight: '800', color: '#1A5276' },

  teamStatsRow: { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  tsStat:       { flex: 1, minWidth: 64, borderRadius: 10, padding: 8, alignItems: 'center' },
  tsNum:        { fontSize: 18, fontWeight: '800', lineHeight: 22 },
  tsLabel:      { fontSize: 8, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2, textAlign: 'center' },

  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.esp },
  emptySub:   { fontSize: 13, color: COLORS.wal, textAlign: 'center' },
  emptyCta: {
    backgroundColor: COLORS.esp, borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 12, marginTop: 6,
  },
  emptyCtaText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});

// InviteModal styles
const im = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: SPACING.xl, paddingTop: 12, paddingBottom: 120,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.bg3, alignSelf: 'center', marginBottom: 16 },
  title:  { fontSize: 18, fontWeight: '700', color: COLORS.esp, marginBottom: 2 },
  sub:    { fontSize: 13, color: COLORS.wal, marginBottom: 20 },
  label:  { fontSize: 10, fontWeight: '700', color: COLORS.wal, letterSpacing: 1.5, marginBottom: 7 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: COLORS.bg3,
    borderRadius: 12, backgroundColor: COLORS.bg2, paddingHorizontal: 12, marginBottom: 4,
  },
  input: { flex: 1, paddingVertical: 13, fontSize: 15, color: COLORS.esp },
  roleRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  roleBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    backgroundColor: COLORS.bg3, alignItems: 'center',
  },
  roleBtnActive:     { backgroundColor: COLORS.esp },
  roleBtnText:       { fontSize: 13, fontWeight: '600', color: COLORS.wal },
  roleBtnTextActive: { color: '#fff' },
  sendBtn: {
    backgroundColor: COLORS.esp, borderRadius: 14, paddingVertical: 15,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  sendBtnDisabled: { opacity: 0.35 },
  sendBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
