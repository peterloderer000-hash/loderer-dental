-- ═══════════════════════════════════════════════════════════════════════════════
-- supabase_migration_v39_doctor_visibility.sql
-- Fix: pacienti nemohli vidieť doktorov pri rezervácii termínu
--
-- Problém: profiles_select politika dovolila pacientovi čítať LEN VLASTNÝ profil.
--          Rezervačná obrazovka potrebuje zobraziť zoznam doktorov.
--
-- Riešenie: Pridáme podmienku — každý prihlásený používateľ môže čítať profily
--           kde role IN ('doctor', 'hygienist') — len tie potrebné pre booking.
--
-- Spustenie: Supabase Dashboard → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════════════════════

-- Helper funkcia (ak ešte neexistuje)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- ── profiles_select ────────────────────────────────────────────────────────────
-- Pred touto migráciou:
--   auth.uid() = id  OR  get_my_role() = 'doctor'
-- Problém: pacient nemohol vidieť profily doktorov (len vlastný)
--
-- Po migrácii:
--   + role IN ('doctor','hygienist','reception','owner') → všetci prihlásení
--     môžu čítať tieto profily (potrebné pre booking, správy, atď.)
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    -- Každý vidí vlastný profil
    auth.uid() = id

    -- Doktor / recepcia / owner vidí všetky profily
    OR get_my_role() IN ('doctor', 'reception', 'hygienist', 'owner')

    -- Každý prihlásený používateľ vidí profily personálu
    -- (pacienti potrebujú vidieť doktorov pri rezervácii termínov)
    OR (
      role IN ('doctor', 'hygienist', 'reception', 'owner')
      AND auth.uid() IS NOT NULL
    )
  );

-- Ostatné políky na profiles zostávajú nezmenené:
-- profiles_insert: auth.uid() = id
-- profiles_update: auth.uid() = id

-- ── opening_hours — uisti sa, že pacient môže čítať ──────────────────────────
-- (Toto by malo byť nastavené z predchádzajúcich migrácií, ale pre istotu)
DROP POLICY IF EXISTS "opening_hours_select" ON public.opening_hours;
CREATE POLICY "opening_hours_select" ON public.opening_hours
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ── Overenie ──────────────────────────────────────────────────────────────────
-- Spusti a skontroluj, že nová politika je v zozname:
SELECT tablename, policyname, qual AS using_expr
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;
