-- ─── Migration v29: patient rating columns ────────────────────────────────────
-- Spusti v Supabase Dashboard → SQL Editor

-- Pridaj stĺpce ak neexistujú (idempotentné)
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS patient_rating INTEGER CHECK (patient_rating >= 1 AND patient_rating <= 5),
  ADD COLUMN IF NOT EXISTS patient_review  TEXT;

-- Voliteľné: index pre rýchle načítanie priemerného hodnotenia doktora
CREATE INDEX IF NOT EXISTS idx_appointments_rating
  ON appointments (doctor_id, status, patient_rating)
  WHERE patient_rating IS NOT NULL;

-- Overenie
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'appointments'
  AND column_name IN ('patient_rating', 'patient_review');
