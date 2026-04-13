import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../supabase';
import { COLORS, SIZES } from '../../styles/theme';

// ─── Typy ─────────────────────────────────────────────────────────────────────
type ToothStatus = 'healthy'|'cavity'|'filled'|'crown'|'extracted'|'missing'|'root_canal';
type ToothRecord = { tooth_number: number; status: ToothStatus; notes: string|null };
type ApptRow = {
  id: string; appointment_date: string; status: string;
  doctor_notes: string|null;
  service: { name: string; emoji: string|null } | null;
};

// ─── Skóre (rovnaká logika ako patient/score.tsx) ─────────────────────────────
function getWeight(n: number) {
  const p = n % 10;
  if (p === 6||p === 7) return 3; if (p === 4||p === 5) return 2;
  if (p === 3) return 1.5; if (p === 8) return 0.5; return 1;
}
function isFront(n: number) { const p = n%10; return p>=1&&p<=3; }

const DED: Partial<Record<ToothStatus,number>> = { cavity:15, root_canal:10, extracted:14, missing:10 };
const FRONT_DED: Partial<Record<ToothStatus,number>> = { cavity:18, extracted:22, missing:20, root_canal:12, filled:4, crown:3 };

function calcHealth(teeth: ToothRecord[]) {
  if (!teeth.length) return 70;
  let d=0, h=0;
  teeth.forEach(t=>{ d+=(DED[t.status]??0)*getWeight(t.tooth_number); if(t.status==='healthy')h++; });
  return Math.max(0,Math.min(100,Math.round(100-d+Math.min(15,h*0.8))));
}
function calcAesthetics(teeth: ToothRecord[]) {
  const f=teeth.filter(t=>isFront(t.tooth_number));
  if (!f.length) return 75;
  let s=100,h=0;
  f.forEach(t=>{ s-=FRONT_DED[t.status]??0; if(t.status==='healthy')h++; });
  return Math.max(0,Math.min(100,Math.round(s+Math.min(8,h*1.5))));
}
function calcHygiene(teeth: ToothRecord[], hasPassport: boolean, completed: number) {
  let b = teeth.length===0 ? 55 : Math.round(60+(teeth.filter(t=>t.status==='healthy').length/teeth.length)*30-(teeth.filter(t=>t.status==='cavity'||t.status==='root_canal').length/teeth.length)*40);
  if (hasPassport) b+=5; b+=Math.min(10,completed*3);
  return Math.max(0,Math.min(100,b));
}
function calcPrevention(hasPassport: boolean, hasAppt: boolean, completed: number, hasChart: boolean) {
  let s=0;
  if (hasChart) s+=25; if (hasPassport) s+=25; if (hasAppt) s+=25; s+=Math.min(25,completed*8);
  return Math.min(100,s);
}

// ─── Vernostné úrovne ─────────────────────────────────────────────────────────
const LEVELS = [
  { name:'Bronz',   min:0,    max:299,  color:'#CD7F32', icon:'🥉' },
  { name:'Striebro',min:300,  max:599,  color:'#A0A0A0', icon:'🥈' },
  { name:'Zlato',   min:600,  max:999,  color:'#D4A017', icon:'🥇' },
  { name:'Platina', min:1000, max:99999,color:'#6C3483', icon:'💎' },
];

// ─── Stav statusov ────────────────────────────────────────────────────────────
const STATUS_CFG: Record<ToothStatus,{ label:string; color:string; bg:string; emoji:string }> = {
  healthy:    { label:'Zdravý',        color:'#1E8449', bg:'#EAFAF1', emoji:'✅' },
  filled:     { label:'Plomba',        color:'#9A7D0A', bg:'#FEF9E7', emoji:'🟡' },
  crown:      { label:'Korunka',       color:'#1A5276', bg:'#EBF5FB', emoji:'👑' },
  cavity:     { label:'Kaz',           color:'#922B21', bg:'#FDEDEC', emoji:'🔴' },
  root_canal: { label:'Devitalizácia', color:'#6C3483', bg:'#F5EEF8', emoji:'🟣' },
  extracted:  { label:'Extrahovaný',   color:'#566573', bg:'#F2F3F4', emoji:'⚫' },
  missing:    { label:'Chýba',         color:'#99A3A4', bg:'#FDFEFE', emoji:'⬜' },
};

const APPT_STATUS: Record<string,{ label:string; color:string; bg:string }> = {
  scheduled:  { label:'Naplánovaný', color:'#1A5276', bg:'#EBF5FB' },
  completed:  { label:'Dokončený',   color:'#1E8449', bg:'#EAFAF1' },
  cancelled:  { label:'Zrušený',     color:'#922B21', bg:'#FDEDEC' },
};

// ─── Dimenzionálny prúžok ─────────────────────────────────────────────────────
function DimBar({ label, score, color, emoji }: { label:string; score:number; color:string; emoji:string }) {
  const grade = score>=85?'A':score>=70?'B':score>=50?'C':'D';
  const gradeColor = score>=85?'#1E8449':score>=70?'#9A7D0A':score>=50?'#E67E22':'#922B21';
  return (
    <View style={styles.dimRow}>
      <Text style={styles.dimEmoji}>{emoji}</Text>
      <Text style={styles.dimLabel}>{label}</Text>
      <View style={styles.dimTrack}>
        <View style={[styles.dimFill,{width:`${score}%`,backgroundColor:color}]}/>
      </View>
      <Text style={[styles.dimScore,{color:gradeColor}]}>{score}</Text>
      <View style={[styles.gradeBox,{backgroundColor:gradeColor}]}>
        <Text style={styles.gradeText}>{grade}</Text>
      </View>
    </View>
  );
}

// ─── Hlavná obrazovka ─────────────────────────────────────────────────────────
export default function PatientDetailScreen() {
  const router = useRouter();
  const { patientId, patientName } = useLocalSearchParams<{ patientId: string; patientName: string }>();

  const [teeth,        setTeeth]        = useState<ToothRecord[]>([]);
  const [appointments, setAppointments] = useState<ApptRow[]>([]);
  const [hasPassport,  setHasPassport]  = useState(false);
  const [phone,        setPhone]        = useState<string|null>(null);
  const [loading,      setLoading]      = useState(true);

  useEffect(() => {
    if (!patientId) { setLoading(false); return; }
    let cancelled = false;

    async function load() {
      try {
        const [teethRes, apptRes, ppRes, profileRes] = await Promise.all([
          supabase.from('dental_charts').select('tooth_number,status,notes').eq('patient_id', patientId),
          supabase.from('appointments')
            .select('id,appointment_date,status,doctor_notes,service:services(name,emoji)')
            .eq('patient_id', patientId)
            .order('appointment_date', { ascending: false })
            .limit(10),
          supabase.from('health_passports').select('patient_id').eq('patient_id', patientId).maybeSingle(),
          supabase.from('profiles').select('phone_number').eq('id', patientId).maybeSingle(),
        ]);

        if (!cancelled) {
          setTeeth((teethRes.data ?? []) as ToothRecord[]);
          setAppointments((apptRes.data ?? []) as ApptRow[]);
          setHasPassport(!!ppRes.data);
          setPhone(profileRes.data?.phone_number ?? null);
          setLoading(false);
        }
      } catch (e) {
        console.error('[PatientDetail] Failed to load patient data:', e);
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [patientId]);

  // ── Výpočty ───────────────────────────────────────────────────────────────
  const { overall, dims, stats, loyaltyPts, loyaltyLevel } = useMemo(() => {
    const completed   = appointments.filter(a=>a.status==='completed').length;
    const hasAppt     = appointments.some(a=>a.status==='scheduled'&&new Date(a.appointment_date)>=new Date());
    const hasChart    = teeth.length > 0;

    const health     = calcHealth(teeth);
    const aesthetics = calcAesthetics(teeth);
    const hygiene    = calcHygiene(teeth, hasPassport, completed);
    const prevention = calcPrevention(hasPassport, hasAppt, completed, hasChart);
    const ov = Math.round(health*0.4+aesthetics*0.25+hygiene*0.2+prevention*0.15);

    const st: Partial<Record<ToothStatus,number>> = {};
    teeth.forEach(t=>{ st[t.status]=(st[t.status]??0)+1; });

    const pts = completed * 100;
    const lvl = LEVELS.slice().reverse().find(l=>pts>=l.min) ?? LEVELS[0];

    return {
      overall: ov,
      dims: { health, aesthetics, hygiene, prevention },
      stats: st,
      loyaltyPts: pts,
      loyaltyLevel: lvl,
    };
  }, [teeth, appointments, hasPassport]);

  const scoreColor = overall>=80?'#1E8449':overall>=65?'#9A7D0A':overall>=45?'#E67E22':'#922B21';
  const initials = (patientName??'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={COLORS.wal} size="large"/></View>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Hlavička ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={()=>router.back()} style={styles.backBtn} activeOpacity={0.75}>
          <Ionicons name="arrow-back" size={20} color={COLORS.cream}/>
        </TouchableOpacity>
        <View style={{flex:1}}>
          <Text style={styles.headerSub}>PROFIL PACIENTA</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>{patientName}</Text>
        </View>
        {/* Celkové skóre v hlavičke */}
        <View style={[styles.scoreChip,{borderColor:scoreColor}]}>
          <Text style={[styles.scoreChipNum,{color:scoreColor}]}>{overall}</Text>
          <Text style={[styles.scoreChipLabel,{color:scoreColor}]}>skóre</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}>

        {/* ── Info karta ── */}
        <View style={styles.infoCard}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={[styles.loyaltyBadge,{backgroundColor:loyaltyLevel.color+'22',borderColor:loyaltyLevel.color}]}>
              <Text style={styles.loyaltyIcon}>{loyaltyLevel.icon}</Text>
              <Text style={[styles.loyaltyName,{color:loyaltyLevel.color}]}>{loyaltyLevel.name}</Text>
            </View>
          </View>
          <View style={{flex:1}}>
            <Text style={styles.patientName}>{patientName ?? 'Pacient'}</Text>
            {phone && (
              <View style={styles.phoneRow}>
                <Ionicons name="call-outline" size={12} color={COLORS.wal}/>
                <Text style={styles.phoneText}>{phone}</Text>
              </View>
            )}
            <View style={styles.infoChips}>
              <View style={[styles.chip, hasPassport?styles.chipGreen:styles.chipOrange]}>
                <Text style={styles.chipText}>{hasPassport?'✓ Anamnéza':'⚠ Bez anamnézy'}</Text>
              </View>
              <View style={[styles.chip, teeth.length>0?styles.chipGreen:styles.chipGray]}>
                <Text style={styles.chipText}>{teeth.length>0?`🦷 ${teeth.length} zubov`:'Karta prázdna'}</Text>
              </View>
            </View>
            <Text style={styles.loyaltyPts}>{loyaltyPts} bodov · {appointments.filter(a=>a.status==='completed').length} návštev</Text>
          </View>
        </View>

        {/* ── Rýchle akcie ── */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionBtn} activeOpacity={0.8}
            onPress={()=>router.push({pathname:'/(doctor)/dental-chart',params:{patientId,patientName}})}>
            <Ionicons name="clipboard-outline" size={18} color={COLORS.wal}/>
            <Text style={styles.actionBtnText}>Zubná karta</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} activeOpacity={0.8}
            onPress={()=>router.push({pathname:'/(doctor)/patient-passport',params:{patientId,patientName}})}>
            <Ionicons name="document-text-outline" size={18} color="#1A5276"/>
            <Text style={[styles.actionBtnText,{color:'#1A5276'}]}>Anamnéza</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn,styles.actionBtnPrimary]} activeOpacity={0.8}
            onPress={()=>router.push({pathname:'/(doctor)/add-appointment',params:{patientId,patientName}})}>
            <Ionicons name="calendar-outline" size={18} color="#fff"/>
            <Text style={[styles.actionBtnText,{color:'#fff'}]}>Rezervovať</Text>
          </TouchableOpacity>
        </View>

        {/* ── Dentálne skóre ── */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>DENTÁLNE SKÓRE</Text>
            <View style={[styles.scoreCircleMini,{borderColor:scoreColor}]}>
              <Text style={[styles.scoreCircleNum,{color:scoreColor}]}>{overall}</Text>
            </View>
          </View>
          <DimBar label="Zdravie"   score={dims.health}     color="#1E8449" emoji="🏥"/>
          <DimBar label="Estetika"  score={dims.aesthetics} color="#1A5276" emoji="😁"/>
          <DimBar label="Hygiena"   score={dims.hygiene}    color="#148F77" emoji="🪥"/>
          <DimBar label="Preventíva"score={dims.prevention} color="#7D6608" emoji="📅"/>
        </View>

        {/* ── Rozklad chrupu ── */}
        {teeth.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>STAV CHRUPU</Text>
            <View style={styles.teethGrid}>
              {(Object.keys(STATUS_CFG) as ToothStatus[]).map(key=>{
                const count = stats[key]??0;
                if (!count) return null;
                const s = STATUS_CFG[key];
                return (
                  <View key={key} style={[styles.teethChip,{backgroundColor:s.bg,borderColor:s.color}]}>
                    <Text style={styles.teethEmoji}>{s.emoji}</Text>
                    <Text style={[styles.teethCount,{color:s.color}]}>{count}</Text>
                    <Text style={[styles.teethLabel,{color:s.color}]}>{s.label}</Text>
                  </View>
                );
              })}
            </View>
            {((stats.cavity||0)>0 || (stats.root_canal||0)>0) && (
              <View style={styles.warningBox}>
                <Ionicons name="warning-outline" size={14} color="#922B21"/>
                <Text style={styles.warningText}>
                  Pacient má {(stats.cavity??0)+(stats.root_canal??0)} problematických zubov vyžadujúcich ošetrenie.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── História termínov ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>HISTÓRIA TERMÍNOV</Text>
          {appointments.length === 0 ? (
            <Text style={styles.emptyText}>Žiadne termíny</Text>
          ) : (
            appointments.map(a=>{
              const st = APPT_STATUS[a.status] ?? APPT_STATUS.scheduled;
              const d  = new Date(a.appointment_date);
              return (
                <View key={a.id} style={styles.apptRow}>
                  <View style={styles.apptDateBox}>
                    <Text style={styles.apptDay}>{d.getDate()}</Text>
                    <Text style={styles.apptMonth}>{d.toLocaleDateString('sk-SK',{month:'short'})}</Text>
                    <Text style={styles.apptYear}>{d.getFullYear()}</Text>
                  </View>
                  <View style={{flex:1}}>
                    <View style={styles.apptTop}>
                      <Text style={styles.apptTime}>
                        {d.toLocaleTimeString('sk-SK',{hour:'2-digit',minute:'2-digit'})}
                      </Text>
                      <View style={[styles.apptBadge,{backgroundColor:st.bg}]}>
                        <Text style={[styles.apptBadgeText,{color:st.color}]}>{st.label}</Text>
                      </View>
                    </View>
                    {a.service && (
                      <Text style={styles.apptService}>{a.service.emoji??'🦷'} {a.service.name}</Text>
                    )}
                    {a.doctor_notes && (
                      <Text style={styles.apptNotes} numberOfLines={2}>📝 {a.doctor_notes}</Text>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={{height:30}}/>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:    {flex:1,backgroundColor:COLORS.esp},
  scroll:  {flex:1,backgroundColor:COLORS.bg2},
  content: {padding:SIZES.padding,paddingTop:12},
  center:  {flex:1,backgroundColor:COLORS.bg2,alignItems:'center',justifyContent:'center'},

  header:      {backgroundColor:COLORS.esp,paddingHorizontal:SIZES.padding,paddingTop:14,paddingBottom:16,flexDirection:'row',alignItems:'center',gap:12},
  backBtn:     {width:36,height:36,borderRadius:18,backgroundColor:COLORS.wal,alignItems:'center',justifyContent:'center'},
  headerSub:   {fontSize:9,letterSpacing:2,color:COLORS.sand,fontWeight:'600',textTransform:'uppercase',marginBottom:3},
  headerTitle: {fontSize:18,fontWeight:'700',color:'#fff'},
  scoreChip:   {width:52,height:52,borderRadius:26,borderWidth:3,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,0.08)'},
  scoreChipNum:{fontSize:18,fontWeight:'800',lineHeight:20},
  scoreChipLabel:{fontSize:8,fontWeight:'600',textTransform:'uppercase'},

  // Info karta
  infoCard:   {backgroundColor:'#fff',borderRadius:14,padding:14,marginBottom:14,borderWidth:1,borderColor:COLORS.bg3,flexDirection:'row',gap:14},
  avatarWrap: {alignItems:'center',gap:6},
  avatar:     {width:60,height:60,borderRadius:30,backgroundColor:COLORS.wal,alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:COLORS.sand},
  avatarText: {fontSize:22,fontWeight:'700',color:'#fff'},
  loyaltyBadge:{flexDirection:'row',alignItems:'center',gap:3,borderRadius:8,borderWidth:1,paddingHorizontal:5,paddingVertical:2},
  loyaltyIcon: {fontSize:10},
  loyaltyName: {fontSize:8,fontWeight:'700'},
  patientName: {fontSize:16,fontWeight:'700',color:COLORS.esp,marginBottom:4},
  phoneRow:    {flexDirection:'row',alignItems:'center',gap:5,marginBottom:6},
  phoneText:   {fontSize:12,color:COLORS.wal},
  infoChips:   {flexDirection:'row',gap:6,flexWrap:'wrap',marginBottom:5},
  chip:        {borderRadius:6,borderWidth:1,paddingHorizontal:7,paddingVertical:3},
  chipGreen:   {backgroundColor:'#EAFAF1',borderColor:'#A9DFBF'},
  chipOrange:  {backgroundColor:'#FEF9E7',borderColor:'#F9E79F'},
  chipGray:    {backgroundColor:COLORS.bg3,borderColor:COLORS.bg3},
  chipText:    {fontSize:9,fontWeight:'700',color:COLORS.esp},
  loyaltyPts:  {fontSize:10,color:COLORS.wal},

  // Rýchle akcie
  actionsRow:      {flexDirection:'row',gap:8,marginBottom:14},
  actionBtn:       {flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5,backgroundColor:'#fff',borderRadius:12,paddingVertical:10,borderWidth:1,borderColor:COLORS.bg3},
  actionBtnPrimary:{backgroundColor:COLORS.wal,borderColor:COLORS.wal},
  actionBtnText:   {fontSize:10,fontWeight:'700',color:COLORS.wal,textTransform:'uppercase',letterSpacing:0.3},

  // Karta
  card:         {backgroundColor:'#fff',borderRadius:14,padding:14,marginBottom:14,borderWidth:1,borderColor:COLORS.bg3},
  cardTitle:    {fontSize:9,letterSpacing:2,color:COLORS.wal,fontWeight:'700',textTransform:'uppercase',marginBottom:12},
  cardTitleRow: {flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12},
  scoreCircleMini:{width:42,height:42,borderRadius:21,borderWidth:3,alignItems:'center',justifyContent:'center'},
  scoreCircleNum: {fontSize:15,fontWeight:'800'},

  // Dim bar
  dimRow:   {flexDirection:'row',alignItems:'center',gap:8,marginBottom:8},
  dimEmoji: {fontSize:14,width:20,textAlign:'center'},
  dimLabel: {fontSize:10,fontWeight:'600',color:COLORS.esp,width:68},
  dimTrack: {flex:1,height:8,backgroundColor:COLORS.bg3,borderRadius:4,overflow:'hidden'},
  dimFill:  {height:8,borderRadius:4},
  dimScore: {fontSize:12,fontWeight:'800',width:24,textAlign:'right'},
  gradeBox: {width:20,height:20,borderRadius:5,alignItems:'center',justifyContent:'center'},
  gradeText:{fontSize:9,fontWeight:'800',color:'#fff'},

  // Zuby
  teethGrid:  {flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:8},
  teethChip:  {borderRadius:10,borderWidth:1,paddingHorizontal:10,paddingVertical:7,alignItems:'center',minWidth:72},
  teethEmoji: {fontSize:14,marginBottom:2},
  teethCount: {fontSize:18,fontWeight:'800',lineHeight:22},
  teethLabel: {fontSize:8,fontWeight:'600',textTransform:'uppercase',letterSpacing:0.3,marginTop:1},
  warningBox: {flexDirection:'row',gap:8,alignItems:'flex-start',backgroundColor:'#FDEDEC',borderRadius:8,padding:10,marginTop:4},
  warningText:{flex:1,fontSize:11,color:'#922B21',lineHeight:16},

  // Termíny
  emptyText:     {fontSize:12,color:COLORS.wal,fontStyle:'italic'},
  apptRow:       {flexDirection:'row',gap:12,paddingVertical:10,borderBottomWidth:1,borderBottomColor:COLORS.bg3},
  apptDateBox:   {width:38,alignItems:'center',backgroundColor:COLORS.bg2,borderRadius:8,paddingVertical:5},
  apptDay:       {fontSize:18,fontWeight:'800',color:COLORS.esp,lineHeight:22},
  apptMonth:     {fontSize:9,fontWeight:'600',color:COLORS.wal,textTransform:'uppercase'},
  apptYear:      {fontSize:8,color:'#bbb'},
  apptTop:       {flexDirection:'row',alignItems:'center',gap:8,marginBottom:3},
  apptTime:      {fontSize:13,fontWeight:'700',color:COLORS.esp},
  apptBadge:     {borderRadius:6,paddingHorizontal:7,paddingVertical:2},
  apptBadgeText: {fontSize:9,fontWeight:'700'},
  apptService:   {fontSize:11,color:COLORS.wal,marginBottom:2},
  apptNotes:     {fontSize:10,color:'#888',fontStyle:'italic',lineHeight:15},
});
