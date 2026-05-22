-- ─── Fáza 18: Recepty & Diagnózy ─────────────────────────────────────────────
-- Spusti v Supabase SQL Editor

-- 1) Diagnózy
CREATE TABLE IF NOT EXISTS diagnoses (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  doctor_id      UUID        NOT NULL REFERENCES profiles(id),
  appointment_id UUID        REFERENCES appointments(id) ON DELETE SET NULL,
  icd_code       TEXT,
  description    TEXT        NOT NULL,
  severity       TEXT        CHECK (severity IN ('mild', 'moderate', 'severe')) DEFAULT 'mild',
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- 2) Recepty
CREATE TABLE IF NOT EXISTS prescriptions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  doctor_id      UUID        NOT NULL REFERENCES profiles(id),
  appointment_id UUID        REFERENCES appointments(id) ON DELETE SET NULL,
  medication     TEXT        NOT NULL,
  dosage         TEXT,
  instructions   TEXT,
  valid_until    DATE,
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- 3) RLS
ALTER TABLE diagnoses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctor full access diagnoses"     ON diagnoses;
DROP POLICY IF EXISTS "Patient reads own diagnoses"      ON diagnoses;
DROP POLICY IF EXISTS "Doctor full access prescriptions" ON prescriptions;
DROP POLICY IF EXISTS "Patient reads own prescriptions"  ON prescriptions;

CREATE POLICY "Doctor full access diagnoses"
  ON diagnoses
  USING  (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

CREATE POLICY "Patient reads own diagnoses"
  ON diagnoses FOR SELECT
  USING (patient_id = auth.uid());

CREATE POLICY "Doctor full access prescriptions"
  ON prescriptions
  USING  (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

CREATE POLICY "Patient reads own prescriptions"
  ON prescriptions FOR SELECT
  USING (patient_id = auth.uid());

-- 4) Indexy
CREATE INDEX IF NOT EXISTS diagnoses_patient_idx     ON diagnoses     (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS prescriptions_patient_idx ON prescriptions (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS prescriptions_active_idx  ON prescriptions (patient_id, is_active);
