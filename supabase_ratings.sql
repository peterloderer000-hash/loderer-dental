-- ═══════════════════════════════════════════════════════════════
-- Hodnotenie termínov pacientom
-- Spusti v Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Pridaj stĺpce k tabuľke appointments
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS patient_rating  smallint CHECK (patient_rating >= 1 AND patient_rating <= 5),
  ADD COLUMN IF NOT EXISTS patient_review  text;

-- 2. RLS: pacient môže aktualizovať len svoj vlastný rating (nie status atď.)
-- (Existujúce RLS politiky by mali pokryť UPDATE pre pacienta)
-- Ak nie, pridaj:
-- CREATE POLICY "patient_can_rate_own" ON appointments
--   FOR UPDATE TO authenticated
--   USING (patient_id = auth.uid())
--   WITH CHECK (patient_id = auth.uid());

-- 3. Overenie
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'appointments'
  AND column_name IN ('patient_rating', 'patient_review');
