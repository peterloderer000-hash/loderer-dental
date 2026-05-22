-- Migration v22: Liečebný plán pacienta
-- Spusti v Supabase SQL Editor

-- Čistý štart — zmaže prípadné staré/neúplné tabuľky
DROP TABLE IF EXISTS treatment_plan_items CASCADE;
DROP TABLE IF EXISTS treatment_plans CASCADE;

-- ─── Hlavný plán ────────────────────────────────────────────────────────────
CREATE TABLE treatment_plans (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  doctor_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT 'Liečebný plán',
  notes      TEXT,
  status     TEXT NOT NULL DEFAULT 'active'
             CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX treatment_plans_patient_idx ON treatment_plans (patient_id, status);
CREATE INDEX treatment_plans_doctor_idx  ON treatment_plans (doctor_id);

-- ─── Položky plánu ──────────────────────────────────────────────────────────
CREATE TABLE treatment_plan_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id        UUID NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT,
  estimated_cost NUMERIC(10,2),
  status         TEXT NOT NULL DEFAULT 'planned'
                 CHECK (status IN ('planned', 'scheduled', 'completed', 'skipped')),
  tooth_number   INT,
  sort_order     INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX plan_items_plan_idx ON treatment_plan_items (plan_id, sort_order);

-- ─── RLS: treatment_plans ───────────────────────────────────────────────────
ALTER TABLE treatment_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctor manages treatment plans"
  ON treatment_plans FOR ALL
  USING  (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'doctor'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'doctor'));

CREATE POLICY "Patient reads own treatment plans"
  ON treatment_plans FOR SELECT
  USING (auth.uid() = patient_id);

-- ─── RLS: treatment_plan_items ──────────────────────────────────────────────
ALTER TABLE treatment_plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctor manages plan items"
  ON treatment_plan_items FOR ALL
  USING  (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'doctor'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'doctor'));

CREATE POLICY "Patient reads own plan items"
  ON treatment_plan_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM treatment_plans tp
      WHERE tp.id = treatment_plan_items.plan_id AND tp.patient_id = auth.uid()
    )
  );
