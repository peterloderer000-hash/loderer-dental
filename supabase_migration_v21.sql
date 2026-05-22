-- Migration v21: Digitálny informovaný súhlas
-- Spusti v Supabase SQL Editor

-- Šablóny súhlasov (vytvára doktor)
CREATE TABLE IF NOT EXISTS consent_forms (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consent_forms_doctor_idx ON consent_forms (doctor_id, is_active);

-- Podpisy pacientov
CREATE TABLE IF NOT EXISTS patient_consents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id        UUID NOT NULL REFERENCES consent_forms(id) ON DELETE CASCADE,
  patient_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  signed_name    TEXT,
  signed_at      TIMESTAMPTZ,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'signed', 'declined')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS patient_consents_patient_idx ON patient_consents (patient_id, status);
CREATE INDEX IF NOT EXISTS patient_consents_form_idx    ON patient_consents (form_id);

-- RLS: consent_forms
ALTER TABLE consent_forms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctor manages own forms" ON consent_forms;
CREATE POLICY "Doctor manages own forms"
  ON consent_forms FOR ALL
  USING  (auth.uid() = doctor_id)
  WITH CHECK (auth.uid() = doctor_id);

DROP POLICY IF EXISTS "Patient reads consent forms" ON consent_forms;
CREATE POLICY "Patient reads consent forms"
  ON consent_forms FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM patient_consents
      WHERE form_id = consent_forms.id AND patient_id = auth.uid()
    )
  );

-- RLS: patient_consents
ALTER TABLE patient_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctor manages patient consents" ON patient_consents;
CREATE POLICY "Doctor manages patient consents"
  ON patient_consents FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'doctor')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'doctor')
  );

DROP POLICY IF EXISTS "Patient manages own consents" ON patient_consents;
CREATE POLICY "Patient manages own consents"
  ON patient_consents FOR ALL
  USING  (auth.uid() = patient_id)
  WITH CHECK (auth.uid() = patient_id);
