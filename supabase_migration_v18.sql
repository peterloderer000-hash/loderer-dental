-- Migration v18: Poisťovňa + trvalá poznámka na profile pacienta
-- Spusti v Supabase SQL Editor

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS insurance_company TEXT,
  ADD COLUMN IF NOT EXISTS insurance_number  TEXT,
  ADD COLUMN IF NOT EXISTS patient_note      TEXT;
