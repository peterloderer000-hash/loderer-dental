import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Animated, KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { COLORS, RADII, SHADOWS, TYPO, GRADIENTS, SPACING } from '../../styles/theme';
import { useAppTheme } from '../../context/ThemeContext';

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
    '💧 Ústna voda (ústna voda / mouthwash) doplňuje čistenie zubov.\n\nTypy:\n• Antibakteriálna (chlorhexidín) — proti baktériám, zápalu ďasien\n• Fluoridová — posilňuje sklovinu\n• Sviežosť dychu — maskuje zápach\n\nSprávne použitie:\n1. Čisti zuby a použij niť NAJPRV\n2. Odmer 15–20 ml ústnej vody\n3. Kloktaj 30–60 sekúnd\n4. Vypľuj — NEPIJ!\n5. Nejedz ani nepij 30 min po použití\n\n⚠️ Ústna voda NENAHRÁDZA čistenie zubov kefkou a nite!',

  'Čo je zubná korunka?':
    '👑 Korunka = umelý kryt nasadený na poškodený alebo oslabený zub.\n\nKedy je potrebná:\n• Silno poškodený alebo zlomený zub\n• Po devitalizácii (root canal)\n• Zub s veľkou výplňou\n• Implantát\n\nMateriály:\n• Porcelán (estetický, pre predné zuby)\n• Zirkónium (pevné + estetické)\n• Kovová zliatina (zadné zuby, pevnosť)\n\nPostup:\n1. Obrúsenie zuba\n2. Odtlačok a výroba korunky (1–2 týždne)\n3. Nasadenie a zacementovanie\n\nTrvanlivosť: 10–15 rokov pri správnej hygiene.',

  'Čo je zubná plomba?':
    '🟡 Plomba (výplň) = materiál ktorým sa vyplní dutina po odstránení kazu.\n\nTypy plômb:\n• Kompozit (biela) — estetický, pre predné aj zadné zuby\n• Amalgám (sivá/kovová) — starší typ, veľmi pevný\n• Skloinomér — pre dočasné zuby, uvoľňuje fluorid\n\nPostup pri plombovaní:\n1. Lokálna anestézia\n2. Odstránenie kazu\n3. Čistenie a príprava dutiny\n4. Aplikácia plomby\n5. Tvarovanie a leštenie\n\nTrvanlivosť: 5–15 rokov podľa materiálu a hygieny.\n\n💡 Čím skôr sa kaz lieči, tým menšia plomba — a menšie náklady!',

  'Ako znížiť citlivosť zubov?':
    '⚡ Citlivosť zubov = bolesť pri kontakte s teplom, chladom, kyselinami.\n\nPríčiny:\n• Obnažená dentína (ustupujúce ďasná)\n• Poškodená sklovina\n• Bruxizmus\n• Príliš tvrdé čistenie\n\nLiečba:\n1. Desenzitizačná pasta (Sensodyne, Elmex Sensitive) — používaj pravidelne\n2. Mäkká kefka, jemné čistenie\n3. Vyhýbaj sa kyslým jedlám a nápojom\n4. Fluoridové gély (predpísané zubárom)\n5. Okluzná dlaha (ak je príčina bruxizmus)\n\n⏰ Ak citlivosť trvá dlhšie ako 2 týždne — navštív zubára!',
};

// ─── Urgency triage ───────────────────────────────────────────────────────────
function getUrgencyLevel(text: string): 'emergency' | 'urgent' | 'normal' | null {
  const t = text.toLowerCase();
  if (t.includes('silná bolesť') || t.includes('neznesiteľ') || t.includes('opuch') ||
      t.includes('krvácanie') || t.includes('úraz') || t.includes('zlomil') || t.includes('vyrazil'))
    return 'emergency';
  if (t.includes('bol') || t.includes('citliv') || t.includes('ďasn') || t.includes('dlho bol'))
    return 'urgent';
  return null;
}

function getBotResponse(userText: string): string {
  const text = userText.trim().toLowerCase();

  // Urgency triage — priorita č.1
  const urgency = getUrgencyLevel(text);
  if (urgency === 'emergency') {
    return '🚨 URGENTNÉ — OKAMŽITE KONAJTE!\n\nOpísal/a ste príznaky, ktoré vyžadujú okamžitú pozornosť.\n\n1️⃣ Zavolajte ihneď na ambulanciu\n2️⃣ Alebo choďte na pohotovostnú stomatológiu\n3️⃣ Ak máte silné krvácanie: hryzite na gázu 20 min\n\n⚠️ Nečakajte — stav sa môže rýchlo zhoršiť!\n\n👆 Použite tlačidlo "Volať" v sekcii Môj zubár.';
  }
  if (urgency === 'urgent') {
    return '⚡ Odporúčam rezervovať termín čo najskôr.\n\nMedzitým:\n• Ibuprofén/paracetamol na tlmenie bolesti\n• Studený obklad na líce\n• Vyhýbaj sa veľmi horúcim/studeným jedlám\n• Nefajči\n\nRezerváciu urobíš priamo cez záložku "Termíny" → "Bolí ma zub". Dostaneš prednostný termín.';
  }

  // Presná zhoda
  for (const [key, response] of Object.entries(BOT_RESPONSES)) {
    if (text === key.toLowerCase()) return response;
  }

  // Symptómové párovanie — rozšírené
  const MATCHES: [string[], string][] = [
    [['bolesť','bolí','bolest','bol','buľi','boli '], 'Čo robiť pri bolesti zuba?'],
    [['čisti','kefk','čistenie','umývanie zubov','zubná pasta'], 'Ako správne čistiť zuby?'],
    [['kameň','kamen','tartarus','usadeniny','zubný kameň'], 'Čo je zubný kameň?'],
    [['biel','whitening','bielenie','žlté zuby'], 'Ako bieleť zuby?'],
    [['implantát','implant','skrutka do kosti'], 'Čo sú zubné implantáty?'],
    [['paradentóz','ďasn','dasna','dasn','parodont','krvácajúce ďasná'], 'Čo je paradentóza?'],
    [['sklovina','skloven','email'], 'Čo je zubná sklovina?'],
    [['fluor','fluorid','zubná pasta s fluorom'], 'Čo je fluorid?'],
    [['niť','nite','floss','medzizubn'], 'Ako používať zubnú niť?'],
    [['kedy','návštev','zubár','prehliadka','kontrola','každých 6'], 'Kedy ísť k zubárovi?'],
    [['bruxizm','škríp','skripanie','zvieranie','chrúpanie'], 'Čo je bruxizmus?'],
    [['ústna voda','vyplach','mouthwash','kloktanie'], 'Ako funguje ústna voda?'],
    [['korunka','crown','čiapočka na zub'], 'Čo je zubná korunka?'],
    [['plomba','výplň','kaz','otvor v zube','čierna škvrna'], 'Čo je zubná plomba?'],
    [['citliv','citlivosť','sensodyne','studená voda bolí','horúce bolí'], 'Ako znížiť citlivosť zubov?'],
    [['mosty','zubný most','bridge'], 'Čo sú zubné implantáty?'],
    [['extrakcia','vytiahnutie','trhanie zuba','extraction'], 'Kedy ísť k zubárovi?'],
    [['suchý ústny zápal','dry socket','alveolitis'], 'Čo robiť pri bolesti zuba?'],
    [['tehotná','tehotenstvo','gravida'], 'Kedy ísť k zubárovi?'],
    [['deti','detský zubár','mliečne zuby','dieťa'], 'Kedy ísť k zubárovi?'],
  ];

  for (const [keywords, key] of MATCHES) {
    if (keywords.some(kw => text.includes(kw))) return BOT_RESPONSES[key] ?? '';
  }

  // Pozdravy
  if (['ahoj','čau','nazdar','dobrý deň','dobrý ráno','dobré ráno'].some(g => text.includes(g)))
    return '😊 Ahoj! Som váš dentálny asistent.\n\nMôžem vám pomôcť s otázkami o ústnej hygiene, liečbách, bolestiach alebo návšte­ve. Čo vás trápi?';

  // Vďaka
  if (text.includes('ďakuj') || text.includes('dakuj') || text.includes('super') || text.includes('skvelé'))
    return '😊 Rád/a pomôžem! Ak máte ďalšie otázky, som tu. Prajeme vám zdravý úsmev! 🦷';

  return '🤔 Nerozumel/a som otázke úplne.\n\nSkúste ju preformulovať, alebo vyberte tému z kategórií nižšie. Pre presné odporúčania je najlepšia priama konzultácia s MDDr. Lodererom.\n\n📞 Môžete nás aj priamo kontaktovať cez záložku Môj zubár.';
}

function getTime() {
  return new Date().toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
}

// ─── Typing indicator ─────────────────────────────────────────────────────────
function TypingIndicator() {
  const anims = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  useEffect(() => {
    const anim = Animated.loop(
      Animated.stagger(180, anims.map(a =>
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
    <View style={s.msgRow}>
      <View style={s.botAvatar}><Text style={{ fontSize: 14 }}>🤖</Text></View>
      <View style={[s.bubbleBot, { paddingVertical: 14, paddingHorizontal: 18 }]}>
        <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
          {anims.map((a, i) => (
            <Animated.View
              key={i}
              style={[s.typingDot, {
                opacity: a,
                transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
              }]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function ChatScreen() {
  const { colors, dark } = useAppTheme();
  const msgId = useRef(100);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1, from: 'bot', time: getTime(),
      text: 'Ahoj! Som tvoj dentálny asistent 🦷\n\nPomôžem ti s otázkami o ústnej hygiene, bolestiach alebo návšteve zubára.\n\nVyber kategóriu alebo napíš vlastnú otázku:',
    },
  ]);
  const [input,       setInput]       = useState('');
  const [isTyping,    setIsTyping]    = useState(false);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const sendMessage = useCallback((text: string) => {
    if (!text.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const userMsg: Message = { id: ++msgId.current, from: 'user', text: text.trim(), time: getTime() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    const delay = 800 + Math.random() * 500;
    setTimeout(() => {
      setIsTyping(false);
      const botMsg: Message = { id: ++msgId.current, from: 'bot', text: getBotResponse(text), time: getTime() };
      setMessages(prev => [...prev, botMsg]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }, delay);
  }, []);

  const clearChat = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMessages([
      { id: ++msgId.current, from: 'bot', time: getTime(), text: 'História bola vymazaná. Čím ti môžem pomôcť? 🦷' },
    ]);
    setActiveGroup(null);
  }, []);

  const activeSuggestions = activeGroup
    ? TOPIC_GROUPS.find(g => g.label === activeGroup)?.questions ?? []
    : null;

  const totalTopics = TOPIC_GROUPS.reduce((sum, g) => sum + g.questions.length, 0);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.esp }}>
      {/* ── Hero header ── */}
      <LinearGradient colors={GRADIENTS.hero as [string, string, ...string[]]} style={s.hero}>
        <View style={[s.heroCircle, { width: 160, height: 160, right: -30, top: -50 }]} />

        <View style={s.heroRow}>
          {/* Bot avatar */}
          <View style={s.botAvatarHero}>
            <Text style={{ fontSize: 22 }}>🤖</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.heroTitle}>Dentálny asistent</Text>
            <View style={s.onlineBadge}>
              <View style={s.onlineDot} />
              <Text style={s.onlineText}>online · {totalTopics} tém</Text>
            </View>
          </View>
          <TouchableOpacity style={s.clearBtn} onPress={clearChat} activeOpacity={0.75}>
            <Ionicons name="trash-outline" size={16} color={COLORS.sand} />
          </TouchableOpacity>
        </View>

        {/* Category pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.groupsRow}>
          {TOPIC_GROUPS.map(g => (
            <TouchableOpacity
              key={g.label}
              style={[s.groupChip, activeGroup === g.label && s.groupChipActive]}
              onPress={() => {
                setActiveGroup(activeGroup === g.label ? null : g.label);
                Haptics.selectionAsync();
              }}
              activeOpacity={0.78}
            >
              <Text style={s.groupEmoji}>{g.emoji}</Text>
              <Text style={[s.groupLabel, activeGroup === g.label && s.groupLabelActive]}>
                {g.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 80}>
        {/* ── Messages ── */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1, backgroundColor: colors.bg2 }}
          contentContainerStyle={s.messagesContent}
          showsVerticalScrollIndicator={false}
        >
          {messages.map(msg => (
            <View key={msg.id} style={[s.msgRow, msg.from === 'user' && s.msgRowUser]}>
              {msg.from === 'bot' && (
                <View style={s.botAvatar}><Text style={{ fontSize: 14 }}>🤖</Text></View>
              )}
              <View style={msg.from === 'bot' ? [s.bubbleBot, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }] : s.bubbleUser}>
                <Text style={[s.bubbleText, { color: msg.from === 'bot' ? colors.textPrimary : '#F5F6F8' }]}>
                  {msg.text}
                </Text>
                <Text style={[s.bubbleTime, { color: msg.from === 'bot' ? colors.textSecondary : 'rgba(255,255,255,0.55)' }]}>
                  {msg.time}
                </Text>
              </View>
            </View>
          ))}

          {isTyping && <TypingIndicator />}

          {/* Suggestions for active group */}
          {activeSuggestions && !isTyping && (
            <View style={s.suggestionsWrap}>
              <Text style={[s.suggestionsLabel, { color: colors.textSecondary }]}>
                {activeGroup}:
              </Text>
              <View style={s.suggestions}>
                {activeSuggestions.map(q => (
                  <TouchableOpacity
                    key={q}
                    style={[s.suggestionChip, { backgroundColor: colors.cardBg, borderColor: COLORS.goldLight }]}
                    onPress={() => sendMessage(q)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.suggestionText, { color: colors.textPrimary }]}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Default suggestions when no group selected */}
          {!activeGroup && !isTyping && (
            <View style={s.suggestionsWrap}>
              <Text style={[s.suggestionsLabel, { color: colors.textSecondary }]}>Populárne otázky:</Text>
              <View style={s.suggestions}>
                {[
                  'Ako správne čistiť zuby?',
                  'Čo robiť pri bolesti zuba?',
                  'Čo je zubný kameň?',
                  'Čo je bruxizmus?',
                  'Ako bieleť zuby?',
                  'Čo je zubná plomba?',
                ].map(q => (
                  <TouchableOpacity
                    key={q}
                    style={[s.suggestionChip, { backgroundColor: colors.cardBg, borderColor: COLORS.goldLight }]}
                    onPress={() => sendMessage(q)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.suggestionText, { color: colors.textPrimary }]}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Disclaimer */}
          <View style={[s.disclaimer, { backgroundColor: colors.bg2 }]}>
            <Ionicons name="information-circle-outline" size={13} color={COLORS.sand} />
            <Text style={[s.disclaimerText, { color: colors.textSecondary }]}>
              Odpovede sú informatívne a nenahradzujú lekárske vyšetrenie.
            </Text>
          </View>
        </ScrollView>

        {/* ── Input bar ── */}
        <View style={[s.inputBar, { backgroundColor: colors.cardBg, borderTopColor: colors.bg3 }]}>
          <TextInput
            style={[s.input, { backgroundColor: colors.inputBg, borderColor: colors.bg3, color: colors.textPrimary }]}
            value={input}
            onChangeText={setInput}
            placeholder="Napíš otázku..."
            placeholderTextColor={COLORS.sand}
            returnKeyType="send"
            onSubmitEditing={() => sendMessage(input)}
            multiline
            maxLength={300}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!input.trim() || isTyping) && { opacity: 0.4 }]}
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || isTyping}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={GRADIENTS.gold as [string, string, ...string[]]}
              style={s.sendGrad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="send" size={16} color="#F5F6F8" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Hero
  hero:         { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 0, overflow: 'hidden' },
  heroCircle:   { position: 'absolute', borderRadius: 999, backgroundColor: '#F5F6F8', opacity: 0.05 },
  heroRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  botAvatarHero:{ width: 44, height: 44, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  heroTitle:    { ...TYPO.bodyMed, color: '#F5F6F8', fontSize: 16 },
  onlineBadge:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  onlineDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ade80' },
  onlineText:   { fontFamily: 'DMSans_400Regular', fontSize: 11, color: 'rgba(196,168,130,0.7)' },
  clearBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },

  // Category pills
  groupsRow:       { flexDirection: 'row', gap: 8, paddingBottom: 14 },
  groupChip:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADII.full, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  groupChipActive: { backgroundColor: COLORS.gold, borderColor: COLORS.goldDark },
  groupEmoji:      { fontSize: 13 },
  groupLabel:      { fontFamily: 'DMSans_500Medium', fontSize: 11, color: 'rgba(196,168,130,0.75)', letterSpacing: 0.3 },
  groupLabelActive:{ color: '#F5F6F8' },

  // Messages
  messagesContent: { padding: 16, paddingBottom: 8, gap: 12 },
  msgRow:          { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  msgRowUser:      { flexDirection: 'row-reverse' },

  botAvatar: {
    width: 28, height: 28, borderRadius: 2,
    backgroundColor: COLORS.esp, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.wal,
  },

  bubbleBot: {
    maxWidth: '80%', borderRadius: RADII.lg, borderBottomLeftRadius: 4,
    padding: 12, borderWidth: 1,
    ...SHADOWS.sm,
  },
  bubbleUser: {
    maxWidth: '80%', borderRadius: RADII.lg, borderBottomRightRadius: 4,
    padding: 12, backgroundColor: COLORS.esp,
  },
  bubbleText: { fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 20 },
  bubbleTime: { fontFamily: 'DMSans_400Regular', fontSize: 9, marginTop: 6, alignSelf: 'flex-end' },

  typingDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: COLORS.wal },

  // Suggestions
  suggestionsWrap:  { marginTop: 4 },
  suggestionsLabel: { ...TYPO.label, marginBottom: 10 },
  suggestions:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestionChip:   { borderRadius: RADII.full, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1 },
  suggestionText:   { fontFamily: 'DMSans_500Medium', fontSize: 12 },

  // Disclaimer
  disclaimer:     { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 16, padding: 10, borderRadius: RADII.sm },
  disclaimerText: { flex: 1, fontFamily: 'DMSans_400Regular', fontSize: 10, lineHeight: 15 },

  // Input bar
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12, borderTopWidth: 1 },
  input:    { flex: 1, borderWidth: 1, borderRadius: RADII.pill, paddingHorizontal: 16, paddingVertical: 10, fontFamily: 'DMSans_400Regular', fontSize: 13, maxHeight: 100 },
  sendBtn:  { width: 44, height: 44, borderRadius: 4, overflow: 'hidden' },
  sendGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
