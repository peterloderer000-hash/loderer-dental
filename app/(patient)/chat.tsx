import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Animated, KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../../styles/theme';

type Message = { id: number; text: string; from: 'user' | 'bot'; time: string };

// ─── Témy otázok ──────────────────────────────────────────────────────────────
const TOPIC_GROUPS: { label: string; emoji: string; questions: string[] }[] = [
  {
    label: 'Hygiena',
    emoji: '🪥',
    questions: [
      'Ako správne čistiť zuby?',
      'Ako používať zubnú niť?',
      'Ako funguje ústna voda?',
    ],
  },
  {
    label: 'Bolesť',
    emoji: '🦷',
    questions: [
      'Čo robiť pri bolesti zuba?',
      'Ako znížiť citlivosť zubov?',
    ],
  },
  {
    label: 'Liečba',
    emoji: '⚕️',
    questions: [
      'Čo je zubná plomba?',
      'Čo je zubná korunka?',
      'Čo sú zubné implantáty?',
      'Čo je paradentóza?',
    ],
  },
  {
    label: 'Info',
    emoji: '📚',
    questions: [
      'Čo je zubný kameň?',
      'Čo je fluorid?',
      'Čo je zubná sklovina?',
      'Čo je bruxizmus?',
      'Kedy ísť k zubárovi?',
    ],
  },
  {
    label: 'Estetika',
    emoji: '✨',
    questions: [
      'Ako bieleť zuby?',
    ],
  },
];

// ─── Odpovede bota ────────────────────────────────────────────────────────────
const BOT_RESPONSES: Record<string, string> = {
  'Ako správne čistiť zuby?':
    '🪥 Čisti zuby 2× denne — ráno a večer. Používaj mäkkú kefku alebo elektrickú.\n\nTechnika: pohybuj kefkou malými krúživými pohybmi pod uhlom 45° k ďasnám. Každý zub čisti aspoň 2 sekundy. Celkový čas: 2 minúty.\n\nNezabudni na: jazyk, vnútorné plochy, medzizubné priestory pomocou nite.',

  'Čo robiť pri bolesti zuba?':
    '🦷 Pri akútnej bolesti:\n\n1. Vezmi ibuprofén alebo paracetamol\n2. Vypláchnite ústa teplou slanou vodou\n3. Vyhni sa horúcim, studeným a sladkým\n4. Polož studený obklad na líce\n\n⚠️ Bolesť = signál problému. Čo najskôr navštív zubára — rezervuj termín cez záložku Domov.',

  'Kedy ísť k zubárovi?':
    '📅 Preventívna prehliadka: každých 6 mesiacov\n\nOkamžite ísť pri:\n• Bolesti zuba alebo ďasna\n• Opuchu tváre alebo ďasna\n• Krvácajúcich ďasnách\n• Zlomenom alebo stratenom zube\n• Strate výplne alebo korunky\n• Citlivosti na teplotu\n\nPravidelné kontroly zachytia problémy skoro a ušetria peniaze!',

  'Čo je zubný kameň?':
    '🦠 Zubný kameň (tartarus) je zatvrdnutý zubný plak.\n\nVznik: Zubný plak = baktérie na zuboch. Ak sa neodstráni čistením, mineralizuje sa do tvrdého kameňa za 24–72 hodín.\n\nProblém: Kameň dráždi ďasná, spôsobuje paradentózu a zlý dych.\n\n💡 Domáce odstránenie NIE JE možné — musí ho odstrániť dentálna hygienistka ultrazvukom. Odporúčame každých 6 mesiacov.',

  'Ako bieleť zuby?':
    '✨ Možnosti bielenia:\n\n1. Profesionálne bielenie u zubára — najúčinnejšie, výsledky trvajú 1–3 roky\n2. Bieliace pásiky (napr. Crest 3D) — dobré výsledky za 14 dní\n3. Bieliace zubné pasty — pomalé, mierne výsledky\n4. LED bieliace súpravy — menej účinné\n\n⚠️ Vyhni sa: Bikarbonat sódy, aktívne uhlie — poškodzujú sklovinu!',

  'Čo sú zubné implantáty?':
    '🔩 Implantát = umelý koreň zuba z titánu zakotvený do kosti.\n\nPostup:\n1. Chirurgické zavedenie implantátu do kosti\n2. Hojenie 3–6 mesiacov (osseointegrácia)\n3. Nasadenie korunky na implantát\n\nVýhody: Vyzerá a funguje ako prirodzený zub, trvá 15–25 rokov.\nCena: 800–1500 € na zub\n\nVhodný kandidát? Zdravé ďasná, dostatok kosti, nekuřák. Poraď sa s MDDr. Lodererom.',

  'Čo je paradentóza?':
    '🔴 Paradentóza (parodontitída) = zápal tkanív okolo zuba.\n\nPríznaky:\n• Krvácajúce ďasná pri čistení\n• Opuch a sčervenanie ďasien\n• Zápach z úst\n• Ustupujúce ďasná\n• Pohyblivé zuby\n\nPríčina: Baktérie v zubnom kameni\nLiečba: Profesionálne čistenie, v ťažších prípadoch chirurgia\n\n⚠️ Bez liečby vedie k strate zubov!',

  'Čo je zubná sklovina?':
    '💎 Sklovina = najtvrdšia látka v ľudskom tele, kryje korunky zubov.\n\nProblém: Sklovina sa nedokáže regenerovať — poškodenie je trvalé!\n\nPoškodzuje ju:\n• Kyseliny (Cola, citrón, ocot)\n• Bruxizmus (škrípanie zubov)\n• Tvrdá kefka alebo silné čistenie\n• Bikarbonat a aktívne uhlie\n\nOchrana: Zubná pasta s fluoridom, mäkká kefka, vyhýbaj sa kyslým nápojom.',

  'Čo je fluorid?':
    '🛡️ Fluorid = minerál ktorý chráni zuby pred kazom.\n\nAko funguje: Vstrebáva sa do skloviny a robí ju odolnejšou voči kyselinám baktérií.\n\nKde ho nájdeš:\n• Zubná pasta (najdôležitejší zdroj)\n• Ústna voda s fluoridom\n• Voda z vodovodu (v niektorých krajinách)\n\n💡 Tip: Po čistení zubov neoplachuj ústa vodou — nechaj fluorid pôsobiť!',

  'Ako používať zubnú niť?':
    '🧵 Správna technika:\n\n1. Odtrhni ~45 cm nite, oviň okolo prostredníkov\n2. Napni niť medzi palcom a ukazovákom\n3. Jemne zasuň medzi zuby pohybom hore-dole\n4. Obkrúž každý zub do tvaru „C"\n5. Pohybuj nite pod líniou ďasna\n\n⏰ Kedy: Raz denne, ideálne pred spaním\n\n💡 Alternatíva: Medzizubné kefky alebo ústna sprcha (Waterpik)',

  'Čo je bruxizmus?':
    '😬 Bruxizmus = nevedomé škrípanie alebo zvieranie zubov, najčastejšie v noci.\n\nPríznaky:\n• Bolesti hlavy ráno\n• Boľavé čeľuste a svaly\n• Obrúsená sklovina\n• Citlivé zuby\n• Zlomené výplne alebo zuby\n\nPríčiny: Stres, úzkosť, nevhodný sklus\n\nLiečba:\n• Nočná okluzná dlaha (chráni zuby)\n• Fyzioterapia čeľuste\n• Relaxácia, redukcia stresu\n• Botulotoxín (závažné prípady)\n\n🦷 Neliečený bruxizmus môže zničiť celý chrup!',

  'Ako funguje ústna voda?':
    '💧 Ústna voda (ústna voda / mouthwash) doplňuje čistenie zubov.\n\nTypy:\n• Antibakteriálna (chlorhexidín) — proti baktériám, zápalu ďasien\n• Fluoridová — posilňuje sklovinu\n• Sviežosť dychu — maskuje zápach\n\nSpráv­ne použitie:\n1. Čisti zuby a použij niť NAJPRV\n2. Odmer 15–20 ml ústnej vody\n3. Kloktaj 30–60 sekúnd\n4. Vypľuj — NEPIJ!\n5. Nejedz ani nepij 30 min po použití\n\n⚠️ Ústna voda NENAHRÁDZA čistenie zubov kefkou a nite!',

  'Čo je zubná korunka?':
    '👑 Korunka = umelý kryt nasadený na poškodený alebo oslabený zub.\n\nKedy je potrebná:\n• Silno poškodený alebo zlomený zub\n• Po devitalizácii (root canal)\n• Zub s veľkou výplňou\n• Implantát\n\nMateriály:\n• Porcelán (estetický, pre predné zuby)\n• Zirkónium (pevné + estetické)\n• Kovová zliatina (zadné zuby, pevnosť)\n\nPostup:\n1. Obrúsenie zuba\n2. Odtlačok a výroba korunky (1–2 týždne)\n3. Nasadenie a zacementovanie\n\nTrvanlivosť: 10–15 rokov pri správnej hygiene.',

  'Čo je zubná plomba?':
    '🟡 Plomba (výplň) = materiál ktorým sa vyplní dutina po odstránení kazu.\n\nTypy plômb:\n• Kompozit (biela) — estetický, pre predné aj zadné zuby\n• Amalgám (sivá/kovová) — starší typ, veľmi pevný\n• Skloinomér — pre dočasné zuby, uvoľňuje fluorid\n\nPostup pri plombovaní:\n1. Lokálna anestézia\n2. Odstránenie kazu\n3. Čistenie a príprava dutiny\n4. Aplikácia plomby\n5. Tvarovanie a leštenie\n\nTrvanlivosť: 5–15 rokov podľa materiálu a hygieny.\n\n💡 Čím skôr sa kaz lieči, tým menšia plomba — a menšie náklady!',

  'Ako znížiť citlivosť zubov?':
    '⚡ Citlivosť zubov = bolesť pri kontakte s teplom, chladom, kyselinami.\n\nPríčiny:\n• Obnažená dentína (ustupujúce ďasná)\n• Poškodená sklovina\n• Bruxizmus\n• Príliš tvrdé čistenie\n\nLiečba:\n1. Desenzitizačná pasta (Sensodyne, Elmex Sensitive) — používaj pravidelne\n2. Mäkká kefka, jemné čistenie\n3. Vyhýbaj sa kyslým jedlám a nápojom\n4. Fluoridové gély (predpísané zubárom)\n5. Okluzná dlaha (ak je príčina bruxizmus)\n\n⏰ Ak citlivosť trvá dlhšie ako 2 týždne — navštív zubára!',
};

function getBotResponse(userText: string): string {
  const text = userText.trim().toLowerCase();

  // Priame zhody
  for (const [key, response] of Object.entries(BOT_RESPONSES)) {
    if (text === key.toLowerCase()) return response;
  }

  // Kľúčové slová
  if (text.includes('bolesť') || text.includes('bolí') || text.includes('boli'))
    return BOT_RESPONSES['Čo robiť pri bolesti zuba?'];
  if (text.includes('čisti') || text.includes('kefk') || text.includes('čistenie'))
    return BOT_RESPONSES['Ako správne čistiť zuby?'];
  if (text.includes('kameň') || text.includes('kamen') || text.includes('tartarus'))
    return BOT_RESPONSES['Čo je zubný kameň?'];
  if (text.includes('biel') || text.includes('whitening'))
    return BOT_RESPONSES['Ako bieleť zuby?'];
  if (text.includes('implantát') || text.includes('implant'))
    return BOT_RESPONSES['Čo sú zubné implantáty?'];
  if (text.includes('paradentóz') || text.includes('ďasn') || text.includes('dasna') || text.includes('dasn'))
    return BOT_RESPONSES['Čo je paradentóza?'];
  if (text.includes('sklovina'))
    return BOT_RESPONSES['Čo je zubná sklovina?'];
  if (text.includes('fluor'))
    return BOT_RESPONSES['Čo je fluorid?'];
  if (text.includes('niť') || text.includes('nite') || text.includes('floss'))
    return BOT_RESPONSES['Ako používať zubnú niť?'];
  if (text.includes('kedy') || text.includes('návštev') || text.includes('zubár'))
    return BOT_RESPONSES['Kedy ísť k zubárovi?'];
  if (text.includes('bruxizm') || text.includes('škríp') || text.includes('skripanie') || text.includes('zvieranie'))
    return BOT_RESPONSES['Čo je bruxizmus?'];
  if (text.includes('ústna voda') || text.includes('vyplach') || text.includes('mouthwash'))
    return BOT_RESPONSES['Ako funguje ústna voda?'];
  if (text.includes('korunka') || text.includes('crown'))
    return BOT_RESPONSES['Čo je zubná korunka?'];
  if (text.includes('plomba') || text.includes('výplň') || text.includes('kaz'))
    return BOT_RESPONSES['Čo je zubná plomba?'];
  if (text.includes('citliv') || text.includes('citlivosť') || text.includes('sensodyne'))
    return BOT_RESPONSES['Ako znížiť citlivosť zubov?'];

  return '😊 Ďakujem za otázku! Pre detailnú odpoveď ti odporúčam konzultáciu priamo s MDDr. Lodererom.\n\nSkús niektorú z pripravených otázok — stačí kliknúť na kategóriu nižšie.';
}

function getTime() {
  return new Date().toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
}

// ─── Typing indicator ─────────────────────────────────────────────────────────
function TypingIndicator() {
  const anims = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  useEffect(() => {
    const anim = Animated.loop(
      Animated.stagger(180, anims.map((a) =>
        Animated.sequence([
          Animated.timing(a, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(a, { toValue: 0, duration: 300, useNativeDriver: true }),
        ])
      ))
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <View style={styles.msgRow}>
      <View style={styles.botIcon}><Text style={{ fontSize: 14 }}>🤖</Text></View>
      <View style={[styles.bubble, styles.bubbleBot, { paddingVertical: 14, paddingHorizontal: 16 }]}>
        <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
          {anims.map((a, i) => (
            <Animated.View key={i} style={[styles.typingDot, { opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] }]} />
          ))}
        </View>
      </View>
    </View>
  );
}

// ─── Hlavná obrazovka ─────────────────────────────────────────────────────────
export default function ChatScreen() {
  const msgId    = useRef(100);
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, from: 'bot', time: getTime(), text: 'Ahoj! Som tvoj dentálny asistent 🦷\n\nPomôžem ti s otázkami o ústnej hygiene, bolestiach alebo návšteve zubára.\n\nVyber kategóriu alebo napíš vlastnú otázku:' },
  ]);
  const [input,       setInput]       = useState('');
  const [isTyping,    setIsTyping]    = useState(false);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const sendMessage = useCallback((text: string) => {
    if (!text.trim()) return;
    const userMsg: Message = { id: ++msgId.current, from: 'user', text: text.trim(), time: getTime() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    const delay = 800 + Math.random() * 500;
    setTimeout(() => {
      setIsTyping(false);
      const botMsg: Message = { id: ++msgId.current, from: 'bot', text: getBotResponse(text), time: getTime() };
      setMessages((prev) => [...prev, botMsg]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }, delay);
  }, []);

  const clearChat = useCallback(() => {
    setMessages([
      { id: ++msgId.current, from: 'bot', time: getTime(), text: 'História bola vymazaná. Čím ti môžem pomôcť? 🦷' },
    ]);
  }, []);

  const activeSuggestions = activeGroup
    ? TOPIC_GROUPS.find((g) => g.label === activeGroup)?.questions ?? []
    : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Hlavička ── */}
      <View style={styles.header}>
        <View style={styles.botAvatar}><Text style={{ fontSize: 22 }}>🤖</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Dentálny asistent</Text>
          <Text style={styles.headerSub}>● online · {TOPIC_GROUPS.reduce((s, g) => s + g.questions.length, 0)} tém</Text>
        </View>
        <TouchableOpacity style={styles.clearBtn} onPress={clearChat} activeOpacity={0.75}>
          <Ionicons name="trash-outline" size={16} color={COLORS.sand} />
        </TouchableOpacity>
      </View>

      {/* ── Témy (kategórie) ── */}
      <View style={styles.groupsRow}>
        {TOPIC_GROUPS.map((g) => (
          <TouchableOpacity
            key={g.label}
            style={[styles.groupChip, activeGroup === g.label && styles.groupChipActive]}
            onPress={() => setActiveGroup(activeGroup === g.label ? null : g.label)}
            activeOpacity={0.78}>
            <Text style={styles.groupEmoji}>{g.emoji}</Text>
            <Text style={[styles.groupLabel, activeGroup === g.label && styles.groupLabelActive]}>{g.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView ref={scrollRef} style={styles.messages} contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}>

          {messages.map((msg) => (
            <View key={msg.id} style={[styles.msgRow, msg.from === 'user' && styles.msgRowUser]}>
              {msg.from === 'bot' && (
                <View style={styles.botIcon}><Text style={{ fontSize: 14 }}>🤖</Text></View>
              )}
              <View style={[styles.bubble, msg.from === 'bot' ? styles.bubbleBot : styles.bubbleUser]}>
                <Text style={[styles.bubbleText, msg.from === 'user' && styles.bubbleTextUser]}>
                  {msg.text}
                </Text>
                <Text style={[styles.bubbleTime, msg.from === 'user' && { color: 'rgba(255,255,255,0.6)' }]}>
                  {msg.time}
                </Text>
              </View>
            </View>
          ))}

          {/* Typing indicator */}
          {isTyping && <TypingIndicator />}

          {/* Suggestions based on selected group */}
          {activeSuggestions && !isTyping && (
            <View style={styles.suggestionsWrap}>
              <Text style={styles.suggestionsLabel}>{activeGroup}:</Text>
              <View style={styles.suggestions}>
                {activeSuggestions.map((s) => (
                  <TouchableOpacity key={s} style={styles.suggestion} onPress={() => sendMessage(s)} activeOpacity={0.75}>
                    <Text style={styles.suggestionText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Default suggestions if no group selected */}
          {!activeGroup && !isTyping && (
            <View style={styles.suggestionsWrap}>
              <Text style={styles.suggestionsLabel}>Populárne otázky:</Text>
              <View style={styles.suggestions}>
                {[
                  'Ako správne čistiť zuby?',
                  'Čo robiť pri bolesti zuba?',
                  'Čo je zubný kameň?',
                  'Čo je bruxizmus?',
                  'Ako bieleť zuby?',
                  'Čo je zubná plomba?',
                ].map((s) => (
                  <TouchableOpacity key={s} style={styles.suggestion} onPress={() => sendMessage(s)} activeOpacity={0.75}>
                    <Text style={styles.suggestionText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        {/* ── Input bar ── */}
        <View style={styles.inputRow}>
          <TextInput style={styles.input} value={input} onChangeText={setInput}
            placeholder="Napíš otázku..." placeholderTextColor="#bbb"
            returnKeyType="send" onSubmitEditing={() => sendMessage(input)}
            multiline maxLength={300} />
          <TouchableOpacity style={[styles.sendBtn, (!input.trim() || isTyping) && { opacity: 0.4 }]}
            onPress={() => sendMessage(input)} disabled={!input.trim() || isTyping} activeOpacity={0.85}>
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.esp },

  header:      { backgroundColor: COLORS.esp, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SIZES.padding, paddingTop: 14, paddingBottom: 14 },
  botAvatar:   { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  headerSub:   { fontSize: 11, color: '#4ade80', marginTop: 2 },
  clearBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },

  // Category tabs
  groupsRow:       { flexDirection: 'row', gap: 6, paddingHorizontal: SIZES.padding, paddingVertical: 10, backgroundColor: COLORS.bg2, borderBottomWidth: 1, borderBottomColor: COLORS.bg3 },
  groupChip:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.bg3 },
  groupChipActive: { backgroundColor: COLORS.esp, borderColor: COLORS.wal },
  groupEmoji:      { fontSize: 13 },
  groupLabel:      { fontSize: 10, fontWeight: '600', color: COLORS.wal },
  groupLabelActive:{ color: '#fff' },

  messages:        { flex: 1, backgroundColor: COLORS.bg2 },
  messagesContent: { padding: SIZES.padding, paddingBottom: 10, gap: 12 },

  msgRow:     { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  msgRowUser: { flexDirection: 'row-reverse' },
  botIcon:    { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.esp, alignItems: 'center', justifyContent: 'center' },

  bubble:         { maxWidth: '80%', borderRadius: 18, padding: 12 },
  bubbleBot:      { backgroundColor: '#fff', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: COLORS.bg3 },
  bubbleUser:     { backgroundColor: COLORS.esp, borderBottomRightRadius: 4 },
  bubbleText:     { fontSize: 13, color: COLORS.esp, lineHeight: 20 },
  bubbleTextUser: { color: '#fff' },
  bubbleTime:     { fontSize: 9, color: '#aaa', marginTop: 6, alignSelf: 'flex-end' },

  // Typing indicator dots
  typingDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: COLORS.wal },

  suggestionsWrap:  { marginTop: 4 },
  suggestionsLabel: { fontSize: 9, letterSpacing: 1.5, color: COLORS.wal, fontWeight: '600', textTransform: 'uppercase', marginBottom: 8 },
  suggestions:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestion:       { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5, borderColor: COLORS.sand },
  suggestionText:   { fontSize: 12, color: COLORS.wal, fontWeight: '500' },

  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: COLORS.bg3 },
  input:    { flex: 1, borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 13, color: COLORS.esp, maxHeight: 100, backgroundColor: COLORS.bg2 },
  sendBtn:  { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.esp, alignItems: 'center', justifyContent: 'center' },
});
