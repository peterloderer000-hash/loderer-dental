-- Migration v20: Rodinné profily (family_members)
-- Spusti v Supabase SQL Editor

CREATE TABLE IF NOT EXISTS family_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  date_of_birth DATE,
  relationship  TEXT NOT NULL DEFAULT 'dieťa'
                CHECK (relationship IN ('dieťa', 'manžel/ka', 'rodič', 'súrodenec', 'iné')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS family_members_patient_idx ON family_members (patient_id);

ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;

-- Pacient: spravuje len svojich rodinných príslušníkov
DROP POLICY IF EXISTS "Patient manages own family" ON family_members;
CREATE POLICY "Patient manages own family"
  ON family_members FOR ALL
  USING  (auth.uid() = patient_id)
  WITH CHECK (auth.uid() = patient_id);

-- Doktor: čítanie (pri rezervácii za rodinného príslušníka)
DROP POLICY IF EXISTS "Doctor reads family members" ON family_members;
CREATE POLICY "Doctor reads family members"
  ON family_members FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'doctor')
  );
