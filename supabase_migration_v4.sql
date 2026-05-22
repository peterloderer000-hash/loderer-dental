-- ═══════════════════════════════════════════════════════════════════════════
-- Loderer Dental App — Migrácia v4
-- Spusti v: Supabase Dashboard → SQL Editor → New query → Run
--
-- Čo rieši:
--   1. RLS politiky pre doktora: INSERT / UPDATE / DELETE na tabuľke services
--   2. Pomocná funkcia is_doctor() pre čistejšie RLS výrazy
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Pomocná funkcia is_doctor() ─────────────────────────────────────────
-- Vráti TRUE ak prihlásený používateľ má role = 'doctor' v tabuľke profiles
CREATE OR REPLACE FUNCTION public.is_doctor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'doctor'
  );
$$;

-- ─── 2. RLS pre tabuľku services — plný prístup pre doktora ─────────────────
-- Doterajšia politika: len SELECT pre všetkých (verejná čítateľnosť)
-- Nová politika: doktori môžu pridávať, upravovať, mazať

DROP POLICY IF EXISTS "Doctors can insert services"   ON public.services;
DROP POLICY IF EXISTS "Doctors can update services"   ON public.services;
DROP POLICY IF EXISTS "Doctors can delete services"   ON public.services;

CREATE POLICY "Doctors can insert services"
  ON public.services FOR INSERT
  TO authenticated
  WITH CHECK (public.is_doctor());

CREATE POLICY "Doctors can update services"
  ON public.services FOR UPDATE
  TO authenticated
  USING (public.is_doctor())
  WITH CHECK (public.is_doctor());

CREATE POLICY "Doctors can delete services"
  ON public.services FOR DELETE
  TO authenticated
  USING (public.is_doctor());

-- ─── 3. Overenie ─────────────────────────────────────────────────────────────
SELECT policyname, cmd
FROM   pg_policies
WHERE  tablename = 'services';

-- ═══════════════════════════════════════════════════════════════════════════
-- HOTOVO — doktor môže teraz zo správy ambulancie:
--   ✅ Pridávať nové služby (INSERT)
--   ✅ Upravovať existujúce (UPDATE)
--   ✅ Mazať nepotrebné (DELETE)
--   ✅ Prepínať aktívne/neaktívne (cez UPDATE)
-- ═══════════════════════════════════════════════════════════════════════════
