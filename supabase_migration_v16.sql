-- Migration v16: Stav platby na termínoch
-- Spusti v Supabase SQL Editor

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid'
  CHECK (payment_status IN ('unpaid', 'paid', 'partial'));

-- Index pre filter nezaplatených
CREATE INDEX IF NOT EXISTS appointments_payment_status_idx
  ON appointments (payment_status, doctor_id)
  WHERE payment_status != 'paid';
