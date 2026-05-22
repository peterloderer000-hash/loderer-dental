-- Migration v25: Rozšírenie notifikácií — pacient môže notifikovať doktora (príchod)
-- Spusti v Supabase SQL Editor

-- 1) Nová politika: pacient smie vložiť notifikáciu AK je príjemca doktor
--    (napr. oznámenie o príchode do čakárne)
DROP POLICY IF EXISTS "Patient inserts arrival notification for doctor" ON notifications;
CREATE POLICY "Patient inserts arrival notification for doctor"
  ON notifications FOR INSERT
  WITH CHECK (
    -- Príjemca musí byť doktor
    EXISTS (SELECT 1 FROM profiles WHERE id = user_id AND role = 'doctor')
    -- Vkladateľ musí byť prihlásený pacient
    AND auth.uid() IS NOT NULL
  );

-- 2) Pokyny po ošetrení — pridaj stĺpec 'care_instructions' do appointments
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS care_instructions TEXT;

-- Overenie
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name = 'appointments'
   AND column_name IN ('care_instructions', 'arrived_at')
 ORDER BY column_name;
