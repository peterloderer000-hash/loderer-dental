-- Migration v24: Arrived / Check-in status + Waiting Room
-- Spusti v Supabase SQL Editor

-- 1) Pridaj 'arrived' do CHECK constraintu termínov
ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_status_check
    CHECK (status IN ('pending', 'scheduled', 'arrived', 'completed', 'cancelled'));

-- 2) Timestamp kedy pacient prišiel
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;

-- 3) Index pre rýchle načítanie čakajúcich pacientov (dnes + arrived)
CREATE INDEX IF NOT EXISTS appointments_arrived_idx
  ON appointments (status, appointment_date DESC)
  WHERE status = 'arrived';

-- 4) RLS: pacient smie meniť vlastný termín na 'arrived'
--    (existujúca politika pre pacienta UPDATE už pokrýva patient_id = auth.uid())
--    Len overíme — žiadna zmena nie je potrebná ak už existuje UPDATE politika

-- 5) Doctor smie meniť arrived → completed/cancelled (existujúca politika)
--    Tiež žiadna zmena nie je potrebná.

-- Overenie:
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name = 'appointments'
   AND column_name IN ('status','arrived_at')
 ORDER BY column_name;
