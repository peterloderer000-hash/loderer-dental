import React, { useState, useRef } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../../styles/theme';

type Message = { id: number; text: string; from: 'user' | 'bot'; time: string };

const SUGGESTIONS = [
  'Ako správne čistiť zuby?',
  'Čo robiť pri bolesti zuba?',
  'Kedy ísť k zubárovi?',
  'Čo je zubný kameň?',
  'Ako bieleť zuby?',
  'Čo sú zubné implantáty?',
];

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
    '🔩 Implantát = umelý koreň zuba z titánu zakotvený do kosti.\n\nPostup:\n1. Chirurgické zavedenie implantátu do kosti\n2. Hojenie 3–6 mesiacov (osseointegrácia)\n3. Nasadenie korunky na implantát\n\nVýhody: Vyzerá a funguje ako prirodzený zub, trvá 15–25 rokov.\nCena: 800–1500€ na zub\n\nVhodný kandidát? Zdravé ďasná, dostatok kosti, nekuřák. Poraď sa s MDDr. Lodererom.',

  'Čo je paradentóza?':
    '🔴 Paradentóza (parodontitída) = zápal tkanív okolo zuba.\n\nPríznaky:\n• Krvácajúce ďasná pri čistení\n• Opuch a sčervenanie ďasien\n• Zápach z úst\n• Ustupujúce ďasná\n• Pohyblivé zuby\n\nPríčina: Baktérie v zubnom kameni\nLiečba: Profesionálne čistenie, v ťažších prípadoch chirurgia\n\n⚠️ Bez liečby vedie k strate zubov!',

  'Čo je zubná sklovina?':
    '💎 Sklovina = najtvrdšia látka v ľudskom tele, kryje korunky zubov.\n\nProblém: Sklovina sa nedokáže regenerovať — poškodenie je trvalé!\n\nPoškodzuje ju:\n• Kyseliny (Cola, citrón, ocot)\n• Bruxizmus (škrípanie zubov)\n• Tvrdá kefka alebo silné čistenie\n• Bikarbonat a aktívne uhlie\n\nOchrana: Zubná pasta s fluoridom, mäkká kefka, vyhýbaj sa kyslým nápojom.',

  'Čo je fluorid?':
    '🛡️ Fluorid = minerál ktorý chráni zuby pred kazom.\n\nAko funguje: Vstrebáva sa do skloviny a robí ju odolnejšou voči kyselinám baktérií.\n\nKde ho nájdeš:\n• Zubná pasta (najdôležitejší zdroj)\n• Ústna voda s fluoridom\n• Voda z vodovodu (v niektorých krajinách)\n\n💡 Tip: Po čistení zubov neoplachuj ústa vodou — nechaj fluorid pôsobiť!',

  'Ako používať zubnú niť?':
    '🧵 Správna technika:\n\n1. Odtrhni ~45cm nite, oviň okolo prostredníkov\n2. Napni niť medzi palcom a ukazovákom\n3. Jemne zasuň medzi zuby pohybom hore-dole\n4. Obkrúž každý zub do tvaru "C"\n5. Pohybuj nite pod líniou ďasna\n\n⏰ Kedy: Raz denne, ideálne pred spaním\n\n💡 Alternatíva: Medzizubné kefky alebo ústna sprcha (Waterpik)',
};

function getBotResponse(userText: string): string {
  const text = userText.trim().toLowerCase();

  // Priame zhody
  for (const [key, response] of Object.entries(BOT_RESPONSES)) {
    if (text === key.toLowerCase()) return response;
  }

  // Kľúčové slová
  if (text.includes('bolesť') || text.includes('bolí'))
    return BOT_RESPONSES['Čo robiť pri bolesti zuba?'];
  if (text.includes('čisti') || text.includes('kefk'))
    return BOT_RESPONSES['Ako správne čistiť zuby?'];
  if (text.includes('kameň') || text.includes('kamen'))
    return BOT_RESPONSES['Čo je zubný kameň?'];
  if (text.includes('biel'))
    return BOT_RESPONSES['Ako bieleť zuby?'];
  if (text.includes('implantát') || text.includes('implant'))
    return BOT_RESPONSES['Čo sú zubné implantáty?'];
  if (text.includes('paradentóz') || text.includes('ďasn'))
    return BOT_RESPONSES['Čo je paradentóza?'];
  if (text.includes('sklovina'))
    return BOT_RESPONSES['Čo je zubná sklovina?'];
  if (text.includes('fluor'))
    return BOT_RESPONSES['Čo je fluorid?'];
  if (text.includes('niť') || text.includes('nite'))
    return BOT_RESPONSES['Ako používať zubnú niť?'];
  if (text.includes('kedy') || text.includes('návštev') || text.includes('zubár'))
    return BOT_RESPONSES['Kedy ísť k zubárovi?'];

  return '😊 Ďakujem za otázku! Pre detailnú odpoveď ti odporúčam konzultáciu priamo s MDDr. Lodererom.\n\nMôžeš sa opýtať na: čistenie zubov, bolesť, zubný kameň, bielenie, implantáty, paradentózu, sklovinu, fluorid alebo zubnú niť.';
}

function getTime() {
  return new Date().toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
}

let msgId = 100;

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, from: 'bot', time: getTime(), text: 'Ahoj! Som tvoj dentálny asistent 🦷\n\nPomôžem ti s otázkami o ústnej hygiene, bolestiach alebo návšteve zubára.\n\nNiektoré otázky ktoré môžeš položiť:' },
  ]);
  const [input, setInput]   = useState('');
  const scrollRef           = useRef<ScrollView>(null);

  function sendMessage(text: string) {
    if (!text.trim()) return;
    const userMsg: Message = { id: ++msgId, from: 'user', text: text.trim(), time: getTime() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    setTimeout(() => {
      const botMsg: Message = { id: ++msgId, from: 'bot', text: getBotResponse(text), time: getTime() };
      setMessages((prev) => [...prev, botMsg]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }, 500);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.botAvatar}><Text style={{ fontSize: 22 }}>🤖</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Dentálny asistent</Text>
          <Text style={styles.headerSub}>● online</Text>
        </View>
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

          {/* Suggestions */}
          <View style={styles.suggestionsWrap}>
            <Text style={styles.suggestionsLabel}>Navrhované otázky:</Text>
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <TouchableOpacity key={s} style={styles.suggestion} onPress={() => sendMessage(s)} activeOpacity={0.75}>
                  <Text style={styles.suggestionText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>

        <View style={styles.inputRow}>
          <TextInput style={styles.input} value={input} onChangeText={setInput}
            placeholder="Napíš otázku..." placeholderTextColor="#bbb"
            returnKeyType="send" onSubmitEditing={() => sendMessage(input)}
            multiline maxLength={300} />
          <TouchableOpacity style={[styles.sendBtn, !input.trim() && { opacity: 0.4 }]}
            onPress={() => sendMessage(input)} disabled={!input.trim()} activeOpacity={0.85}>
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.esp },

  header:      { backgroundColor: COLORS.esp, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: SIZES.padding, paddingTop: 14, paddingBottom: 16 },
  botAvatar:   { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  headerSub:   { fontSize: 11, color: '#4ade80', marginTop: 2 },

  messages:        { flex: 1, backgroundColor: COLORS.bg2 },
  messagesContent: { padding: SIZES.padding, paddingBottom: 10, gap: 12 },

  msgRow:     { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  msgRowUser: { flexDirection: 'row-reverse' },
  botIcon:    { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.esp, alignItems: 'center', justifyContent: 'center' },

  bubble:     { maxWidth: '78%', borderRadius: 16, padding: 12 },
  bubbleBot:  { backgroundColor: '#fff', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: COLORS.bg3 },
  bubbleUser: { backgroundColor: COLORS.esp, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 13, color: COLORS.esp, lineHeight: 20 },
  bubbleTextUser: { color: '#fff' },
  bubbleTime: { fontSize: 9, color: '#aaa', marginTop: 6, alignSelf: 'flex-end' },

  suggestionsWrap:  { marginTop: 8 },
  suggestionsLabel: { fontSize: 9, letterSpacing: 1.5, color: COLORS.wal, fontWeight: '600', textTransform: 'uppercase', marginBottom: 8 },
  suggestions:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestion:       { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.sand },
  suggestionText:   { fontSize: 12, color: COLORS.wal, fontWeight: '500' },

  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: COLORS.bg3 },
  input:    { flex: 1, borderWidth: 1.5, borderColor: COLORS.bg3, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 13, color: COLORS.esp, maxHeight: 100, backgroundColor: COLORS.bg2 },
  sendBtn:  { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.esp, alignItems: 'center', justifyContent: 'center' },
});
