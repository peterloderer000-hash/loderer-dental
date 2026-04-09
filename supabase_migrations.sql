-- ============================================================
-- Loderer Dental — Migrácie (spusti po supabase_schema.sql)
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- ─── 1. Stĺpec doctor_notes v appointments ───────────────────
-- Klinické poznámky doktora pridané pri dokončení termínu
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS doctor_notes text;

-- ─── 2. Chýbajúca RLS politika: doktor môže vytvoriť termín ─
-- Bez toho add-appointment.tsx (doktor) zlyhá s 403
DROP POLICY IF EXISTS "Doctors can book for patients" ON public.appointments;
CREATE POLICY "Doctors can book for patients"
  ON public.appointments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'doctor'
    )
  );

-- ─── 3. Doktor môže aktualizovať doctor_notes ───────────────
-- (existujúca politika "Doctors can update status" to pokrýva,
--  ale explicitne overíme že UPDATE je povolený pre doctor_id)
-- Politika "Doctors can update status" v schema.sql je OK.

-- ─── 4. Overenie ─────────────────────────────────────────────
SELECT policyname, cmd
FROM   pg_policies
WHERE  tablename = 'appointments'
ORDER  BY policyname;
