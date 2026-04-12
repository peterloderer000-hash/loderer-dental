-- ============================================================
-- Loderer Dental — Zoznam služieb ambulancie
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- ─── 1. Tabuľka services (ak ešte neexistuje) ────────────────
CREATE TABLE IF NOT EXISTS public.services (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  description      text,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  price_min        numeric(8,2),
  price_max        numeric(8,2),
  category         text NOT NULL,
  emoji            text,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz DEFAULT now()
);

-- ─── 2. RLS ──────────────────────────────────────────────────
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Services are publicly readable" ON public.services;
CREATE POLICY "Services are publicly readable"
  ON public.services FOR SELECT USING (true);

-- ─── 3. Pridaj service_id do appointments (ak chýba) ─────────
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS service_id uuid
  REFERENCES public.services(id) ON DELETE SET NULL;

-- ─── 4. Vymaž staré testové služby a vlož reálny cenník ──────
DELETE FROM public.services;

INSERT INTO public.services
  (name, description, duration_minutes, price_min, price_max, category, emoji)
VALUES

  -- ══════════════════════════════════════════════════════
  --  VYŠETRENIE A DIAGNOSTIKA
  -- ══════════════════════════════════════════════════════
  (
    'Vstupné vyšetrenie – dospelí',
    'Anamnéza, klinické vyšetrenie zubov a parodontu, stanovenie liečebného plánu.',
    30, 0, 0,
    'Vyšetrenie a diagnostika', '🔍'
  ),
  (
    'Preventívna prehliadka – dospelí',
    'Pravidelná preventívna prehliadka chrupu pre dospelých pacientov.',
    30, 20, 20,
    'Vyšetrenie a diagnostika', '📋'
  ),
  (
    'Intraorálna RVG snímka',
    'Digitálna röntgenová snímka jedného alebo viacerých zubov.',
    15, 15, 15,
    'Vyšetrenie a diagnostika', '🩻'
  ),
  (
    '3D RTG (CBCT)',
    'Trojrozmerná cone-beam CT snímka pre presnejšiu diagnózu.',
    20, 60, 60,
    'Vyšetrenie a diagnostika', '🩻'
  ),
  (
    'OPG snímka',
    'Panoramatický röntgenový snímok celého chrupu a čeľustí.',
    15, 30, 30,
    'Vyšetrenie a diagnostika', '🩻'
  ),
  (
    'Dentálna hygiena',
    'Profesionálne odstránenie zubného kameňa a povlakov, inštruktáž orálnej hygieny.',
    60, 65, 65,
    'Vyšetrenie a diagnostika', '✨'
  ),
  (
    'Bielenie zubov PUREWHITENING',
    'Profesionálne bielenie zubov prémiovým systémom PUREWHITENING v ambulancii.',
    90, 390, 390,
    'Vyšetrenie a diagnostika', '💎'
  ),
  (
    'Pohotovostná služba',
    'Akútne ošetrenie bolesti alebo úrazu mimo riadnej ordinačnej doby.',
    30, 20, 20,
    'Vyšetrenie a diagnostika', '🚨'
  ),

  -- ══════════════════════════════════════════════════════
  --  ZÁCHOVNÁ STOMATOLÓGIA
  -- ══════════════════════════════════════════════════════
  (
    'Fotokompozitná výplň – 1 plôška',
    'Estetická kompozitná plomba na jednej plôške zuba.',
    45, 60, 120,
    'Záchovná stomatológia', '🦷'
  ),
  (
    'Fotokompozitná výplň – 2 plôšky',
    'Estetická kompozitná plomba zasahujúca dve plôšky zuba.',
    60, 60, 140,
    'Záchovná stomatológia', '🦷'
  ),
  (
    'Fotokompozitná výplň – 3 plôšky',
    'Rozsiahlejšia kompozitná rekonštrukcia na troch plôškach zuba.',
    75, 60, 160,
    'Záchovná stomatológia', '🦷'
  ),
  (
    'Skúška vitality zubov',
    'Testovanie citlivosti zuba na účely diagnostiky stavu nervu.',
    15, 10, 10,
    'Záchovná stomatológia', '🔬'
  ),
  (
    'Ošetrenie pod mikroskopom',
    'Precízne stomatologické ošetrenie s využitím operačného mikroskopu.',
    60, 50, 50,
    'Záchovná stomatológia', '🔬'
  ),
  (
    'Dentálny šperk',
    'Aplikácia dekoratívneho šperku na povrch zuba.',
    30, 45, 45,
    'Záchovná stomatológia', '💫'
  ),

  -- ══════════════════════════════════════════════════════
  --  DETSKÁ STOMATOLÓGIA
  -- ══════════════════════════════════════════════════════
  (
    'Vstupné vyšetrenie – deti',
    'Vstupné vyšetrenie zubov a parodontu pre deti do 16 rokov. Zadarmo.',
    30, 0, 0,
    'Detská stomatológia', '👶'
  ),
  (
    'Preventívna prehliadka – deti',
    'Pravidelná preventívna prehliadka pre deti do 16 rokov.',
    30, 15, 15,
    'Detská stomatológia', '👶'
  ),
  (
    'Pečatenie zubov',
    'Preventívne pečatenie fisúr stálych zubov u detí a mladistvých.',
    30, 25, 25,
    'Detská stomatológia', '🛡️'
  ),
  (
    'Farebná výplň mliečneho zuba',
    'Dekoratívna farebná výplň mliečneho zuba – motivačné ošetrenie pre deti.',
    45, 40, 40,
    'Detská stomatológia', '🌈'
  ),
  (
    'Plomba mliečneho zuba – 1 plôška',
    'Fotokompozitná plomba mliečneho zuba na jednej plôške.',
    30, 50, 90,
    'Detská stomatológia', '🦷'
  ),
  (
    'Plomba mliečneho zuba – 2 plôšky',
    'Fotokompozitná plomba mliečneho zuba na dvoch plôškach.',
    45, 50, 110,
    'Detská stomatológia', '🦷'
  ),
  (
    'Plomba mliečneho zuba – 3 plôšky',
    'Fotokompozitná plomba mliečneho zuba na troch plôškach.',
    60, 50, 130,
    'Detská stomatológia', '🦷'
  ),
  (
    'Extrakcia mliečneho zuba',
    'Bezbolestné vytrhnutie mliečneho zuba s lokálnou anestézou.',
    30, 40, 40,
    'Detská stomatológia', '⚕️'
  ),
  (
    'Dentálna hygiena – deti',
    'Profesionálne čistenie zubov a inštruktáž hygieny pre deti do 16 rokov.',
    45, 40, 40,
    'Detská stomatológia', '✨'
  ),

  -- ══════════════════════════════════════════════════════
  --  ENDODONCIA
  -- ══════════════════════════════════════════════════════
  (
    'Endodoncia – 1 kanálik',
    'Endodontické ošetrenie a plnenie koreňového kanálika (1-kanálový zub).',
    60, 80, 180,
    'Endodoncia', '🔬'
  ),
  (
    'Endodoncia – 2 kanáliky',
    'Endodontické ošetrenie a plnenie koreňových kanálikov (2-kanálový zub).',
    75, 80, 220,
    'Endodoncia', '🔬'
  ),
  (
    'Endodoncia – 3 kanáliky',
    'Endodontické ošetrenie a plnenie koreňových kanálikov (3-kanálový zub).',
    90, 80, 260,
    'Endodoncia', '🔬'
  ),
  (
    'Endodoncia – 4 kanáliky',
    'Endodontické ošetrenie a plnenie koreňových kanálikov (4-kanálový zub).',
    105, 80, 300,
    'Endodoncia', '🔬'
  ),

  -- ══════════════════════════════════════════════════════
  --  CHIRURGICKÉ VÝKONY
  -- ══════════════════════════════════════════════════════
  (
    'Extrakcia jednokoreňového zuba',
    'Extrakcia jednokoreňového stáleho zuba s lokálnou anestézou.',
    30, 60, 120,
    'Chirurgické výkony', '⚕️'
  ),
  (
    'Extrakcia viackoreňového zuba',
    'Extrakcia viackoreňového stáleho zuba s lokálnou anestézou.',
    45, 60, 140,
    'Chirurgické výkony', '⚕️'
  ),
  (
    'Chirurgická extrakcia zuba / koreňa',
    'Chirurgická extrakcia retinovaného alebo zlomeného zuba vrátane anestézy a sutúry.',
    60, 120, 120,
    'Chirurgické výkony', '🏥'
  ),
  (
    'Chirurgická extrakcia – komplikovaná',
    'Komplikovaná chirurgická extrakcia (napr. osmička) vrátane anestézy a sutúry.',
    90, 150, 150,
    'Chirurgické výkony', '🏥'
  ),

  -- ══════════════════════════════════════════════════════
  --  PROTETIKA
  -- ══════════════════════════════════════════════════════
  (
    'Kovokeramická korunka',
    'Pevná zubná náhrada s kovovou výstužou a keramickým povrchom.',
    60, 260, 260,
    'Protetika', '👑'
  ),
  (
    'Zirkónová korunka',
    'Prémiová celokeramická zirkónová korunka – najvyššia estetika a pevnosť.',
    60, 320, 320,
    'Protetika', '👑'
  ),
  (
    'Dočasná korunka (v ambulancii)',
    'Dočasná akrylátová korunka zhotovená priamo na mieste.',
    30, 20, 20,
    'Protetika', '👑'
  ),
  (
    'Totálna protéza živicová',
    'Celková snímateľná zubná protéza z akrylátovej živice (horná alebo dolná).',
    60, 390, 390,
    'Protetika', '🦷'
  ),
  (
    'Totálna protéza termoplastická',
    'Celková snímateľná protéza z ohybného termoplastického materiálu.',
    60, 450, 450,
    'Protetika', '🦷'
  ),
  (
    'Čiastočná protéza termoplastická',
    'Čiastočná snímateľná protéza z termoplastického materiálu (horná alebo dolná).',
    60, 480, 480,
    'Protetika', '🦷'
  ),
  (
    'Oprava protézy',
    'Oprava poškodenej alebo zlomenej zubnej protézy.',
    45, 70, 70,
    'Protetika', '🔧'
  ),
  (
    'Digitálny scan',
    'Intraorálny digitálny odtlačok čeľuste pre protetické alebo ortodontické účely.',
    30, 60, 60,
    'Protetika', '📸'
  );

-- ─── 5. Realtime ─────────────────────────────────────────────
ALTER TABLE public.services REPLICA IDENTITY FULL;

-- ─── 6. Overenie — zobraz všetky vložené služby ──────────────
SELECT
  category,
  name,
  duration_minutes      AS "min",
  price_min             AS "od €",
  price_max             AS "do €",
  emoji
FROM   public.services
ORDER  BY category, duration_minutes;
