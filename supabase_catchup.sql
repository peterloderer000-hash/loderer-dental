-- ══════════════════════════════════════════════════════════════════════════════
-- CATCH-UP MIGRATION — spusti JEDENKRÁT v Supabase SQL Editor
-- Opravuje chýbajúce/nesprávne tabuľky a stĺpce
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── 1) appointments: chýbajúce stĺpce ───────────────────────────────────────
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS arrived_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS care_instructions  TEXT;

-- ─── 2) time_blocks: oprava schémy (starý typ TIME → TIMESTAMPTZ) ─────────────
-- Stará schéma mala: block_date date, start_time time, end_time time, reason
-- Kód očakáva: start_time TIMESTAMPTZ, end_time TIMESTAMPTZ, title, block_type

ALTER TABLE time_blocks
  DROP COLUMN IF EXISTS block_date,
  DROP COLUMN IF EXISTS reason;

-- Prekonvertuj start_time time → timestamptz (výmaza staré hodnoty, dev prostredie)
ALTER TABLE time_blocks DROP COLUMN IF EXISTS start_time;
ALTER TABLE time_blocks DROP COLUMN IF EXISTS end_time;
ALTER TABLE time_blocks
  ADD COLUMN IF NOT EXISTS start_time  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS end_time    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS title       TEXT        NOT NULL DEFAULT 'Blokovaný čas',
  ADD COLUMN IF NOT EXISTS block_type  TEXT        NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS note        TEXT;

-- Odstráň DEFAULT po pridaní (NOT NULL bez default už funguje pre nové záznamy)
ALTER TABLE time_blocks
  ALTER COLUMN start_time DROP DEFAULT,
  ALTER COLUMN end_time   DROP DEFAULT;

-- Obnov index pre nové typy
DROP INDEX IF EXISTS time_blocks_doctor_time_idx;
CREATE INDEX IF NOT EXISTS time_blocks_doctor_time_idx
  ON time_blocks (doctor_id, start_time, end_time);

-- ─── 3) messages ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body        TEXT        NOT NULL,
  is_read     BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own messages" ON messages;
CREATE POLICY "Users manage own messages"
  ON messages
  USING  (sender_id = auth.uid() OR receiver_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

CREATE INDEX IF NOT EXISTS messages_receiver_idx ON messages (receiver_id, is_read);
CREATE INDEX IF NOT EXISTS messages_conv_idx     ON messages (sender_id, receiver_id, created_at);

-- ─── 4) patient_notes ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_notes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  patient_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content    TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (doctor_id, patient_id)
);

ALTER TABLE patient_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctor manages own patient notes" ON patient_notes;
CREATE POLICY "Doctor manages own patient notes"
  ON patient_notes
  USING  (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

-- ─── 5) consent_forms ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consent_forms (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL,
  content    TEXT        NOT NULL,
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE consent_forms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctor manages own consent forms" ON consent_forms;
DROP POLICY IF EXISTS "Anyone reads active consent forms" ON consent_forms;
CREATE POLICY "Doctor manages own consent forms"
  ON consent_forms
  USING  (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());
CREATE POLICY "Anyone reads active consent forms"
  ON consent_forms FOR SELECT
  USING (is_active = true);

-- ─── 6) patient_consents ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_consents (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id     UUID        NOT NULL REFERENCES consent_forms(id) ON DELETE CASCADE,
  patient_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status      TEXT        NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'signed', 'declined')),
  signed_at   TIMESTAMPTZ,
  signed_name TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE patient_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctor reads consents for own forms" ON patient_consents;
DROP POLICY IF EXISTS "Patient manages own consents"        ON patient_consents;
CREATE POLICY "Doctor reads consents for own forms"
  ON patient_consents FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM consent_forms cf WHERE cf.id = form_id AND cf.doctor_id = auth.uid())
  );
CREATE POLICY "Patient manages own consents"
  ON patient_consents
  USING  (patient_id = auth.uid())
  WITH CHECK (patient_id = auth.uid());

-- ─── 7) diagnoses (Fáza 18) ───────────────────────────────────────────────────
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

ALTER TABLE diagnoses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctor full access diagnoses"  ON diagnoses;
DROP POLICY IF EXISTS "Patient reads own diagnoses"   ON diagnoses;
CREATE POLICY "Doctor full access diagnoses"
  ON diagnoses
  USING  (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());
CREATE POLICY "Patient reads own diagnoses"
  ON diagnoses FOR SELECT
  USING (patient_id = auth.uid());

CREATE INDEX IF NOT EXISTS diagnoses_patient_idx ON diagnoses (patient_id, created_at DESC);

-- ─── 8) prescriptions (Fáza 18) ───────────────────────────────────────────────
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

ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctor full access prescriptions" ON prescriptions;
DROP POLICY IF EXISTS "Patient reads own prescriptions"  ON prescriptions;
CREATE POLICY "Doctor full access prescriptions"
  ON prescriptions
  USING  (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());
CREATE POLICY "Patient reads own prescriptions"
  ON prescriptions FOR SELECT
  USING (patient_id = auth.uid());

CREATE INDEX IF NOT EXISTS prescriptions_patient_idx ON prescriptions (patient_id, created_at DESC);

-- ─── 9) notifications: oprava politík (pacient môže vkladať pre doktora) ──────
DROP POLICY IF EXISTS "Patient inserts arrival notification for doctor" ON notifications;
CREATE POLICY "Patient inserts arrival notification for doctor"
  ON notifications FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = user_id AND role = 'doctor')
    AND auth.uid() IS NOT NULL
  );

-- ─── Overenie ─────────────────────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
