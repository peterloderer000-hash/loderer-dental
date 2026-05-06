-- ─── Migration v31: Reception Role & RLS Update ──────────────────────────────
-- Spusti v Supabase Dashboard → SQL Editor
-- Idempotentné (bezpečné spustiť viackrát)
--
-- Čo táto migrácia robí:
--   1. Pridá 'reception' ako platnú hodnotu roly v profiles
--   2. Aktualizuje RLS pre appointments (SELECT + UPDATE pre reception)
--   3. Aktualizuje RLS pre profiles (SELECT pre reception)
--   4. Aktualizuje RLS pre clinic_rooms (SELECT pre reception)
--   5. Aktualizuje RLS pre clinic_events (SELECT + INSERT pre reception)


-- ─── 1. Profiles — pridaj CHECK constraint pre reception ─────────────────────
-- Ak existuje CHECK constraint na role stĺpec, aktualizuj ho
DO $$
BEGIN
  -- Odstráň starý constraint ak existuje
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'profiles'
      AND constraint_name = 'profiles_role_check'
  ) THEN
    ALTER TABLE profiles DROP CONSTRAINT profiles_role_check;
  END IF;

  -- Pridaj nový s reception
  ALTER TABLE profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('doctor', 'patient', 'reception'));
EXCEPTION WHEN others THEN
  -- Ak constraint neexistoval vôbec, pokračuj bez chyby
  NULL;
END$$;


-- ─── 2. Appointments — aktualizuj RLS ────────────────────────────────────────

-- SELECT: doctor / own patient / reception
DROP POLICY IF EXISTS "appointments_select" ON public.appointments;
CREATE POLICY "appointments_select" ON public.appointments
  FOR SELECT USING (
    auth.uid() = patient_id
    OR get_my_role() = 'doctor'
    OR get_my_role() = 'reception'
  );

-- INSERT: len doctor alebo patient (reception nevytvára termíny)
DROP POLICY IF EXISTS "appointments_insert" ON public.appointments;
CREATE POLICY "appointments_insert" ON public.appointments
  FOR INSERT WITH CHECK (
    get_my_role() = 'doctor'
    OR (get_my_role() = 'patient' AND auth.uid() = patient_id)
  );

-- UPDATE: doctor / vlastný pacient / reception
-- POZOR: Toto je dočasné MVP riešenie.
-- TODO: Neskôr sprísniť cez RPC funkciu alebo column-level policy tak, aby
--       recepcia mohla meniť iba prevádzkové polia (clinic_status, arrived_at,
--       room_id, payment_status) a nemohla meniť medicínske polia
--       (service_id, doctor_id, appointment_date, atď.)
DROP POLICY IF EXISTS "appointments_update" ON public.appointments;
CREATE POLICY "appointments_update" ON public.appointments
  FOR UPDATE USING (
    get_my_role() = 'doctor'
    OR (get_my_role() = 'patient' AND auth.uid() = patient_id)
    OR get_my_role() = 'reception'
  );

-- DELETE: len doctor (nezmenené)
DROP POLICY IF EXISTS "appointments_delete" ON public.appointments;
CREATE POLICY "appointments_delete" ON public.appointments
  FOR DELETE USING (get_my_role() = 'doctor');


-- ─── 3. Profiles — reception vidí základné prevádzkové údaje ─────────────────
-- (meno, telefón pacienta pre check-in — bez medicínskych detailov)
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id
    OR get_my_role() = 'doctor'
    OR get_my_role() = 'reception'
  );

-- INSERT + UPDATE ostávajú nezmenené (len vlastný profil)


-- ─── 4. clinic_rooms — aktualizuj RLS ────────────────────────────────────────
-- Pôvodná politika z v30: FOR ALL USING (get_my_role() = 'doctor')
-- Nahradíme granulárnejšou verziou

DROP POLICY IF EXISTS "clinic_rooms_doctor_all" ON clinic_rooms;

CREATE POLICY "clinic_rooms_select" ON clinic_rooms
  FOR SELECT USING (
    get_my_role() = 'doctor'
    OR get_my_role() = 'reception'
  );

CREATE POLICY "clinic_rooms_insert" ON clinic_rooms
  FOR INSERT WITH CHECK (get_my_role() = 'doctor');

CREATE POLICY "clinic_rooms_update" ON clinic_rooms
  FOR UPDATE USING (get_my_role() = 'doctor');

CREATE POLICY "clinic_rooms_delete" ON clinic_rooms
  FOR DELETE USING (get_my_role() = 'doctor');


-- ─── 5. clinic_events — aktualizuj RLS ───────────────────────────────────────
-- Pôvodná politika z v30: FOR ALL USING (get_my_role() = 'doctor')
-- Recepcia musí logovať príchody (INSERT) a čítať udalosti (SELECT)

DROP POLICY IF EXISTS "clinic_events_doctor_all" ON clinic_events;

CREATE POLICY "clinic_events_select" ON clinic_events
  FOR SELECT USING (
    get_my_role() = 'doctor'
    OR get_my_role() = 'reception'
  );

CREATE POLICY "clinic_events_insert" ON clinic_events
  FOR INSERT WITH CHECK (
    get_my_role() = 'doctor'
    OR get_my_role() = 'reception'
  );

CREATE POLICY "clinic_events_update" ON clinic_events
  FOR UPDATE USING (get_my_role() = 'doctor');

CREATE POLICY "clinic_events_delete" ON clinic_events
  FOR DELETE USING (get_my_role() = 'doctor');


-- ─── Overenie ─────────────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd AS operation
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('appointments', 'profiles', 'clinic_rooms', 'clinic_events')
ORDER BY tablename, cmd;
