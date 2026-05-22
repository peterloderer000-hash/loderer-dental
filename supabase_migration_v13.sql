-- ============================================================
-- Migration v13: Birthdays + Treatment Plans
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Dátum narodenia pacienta v profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- 2. Tabuľka plánov liečby
CREATE TABLE IF NOT EXISTS treatment_plans (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Kroky plánu liečby
CREATE TABLE IF NOT EXISTS treatment_steps (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id        UUID NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
  step_number    INTEGER NOT NULL,
  title          TEXT NOT NULL,
  notes          TEXT,
  status         TEXT DEFAULT 'pending'
                 CHECK (status IN ('pending','in_progress','completed','cancelled')),
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- 4. Indexy
CREATE INDEX IF NOT EXISTS idx_treatment_plans_patient ON treatment_plans(patient_id);
CREATE INDEX IF NOT EXISTS idx_treatment_plans_doctor  ON treatment_plans(doctor_id);
CREATE INDEX IF NOT EXISTS idx_treatment_steps_plan    ON treatment_steps(plan_id);

-- 5. RLS — plány liečby
ALTER TABLE treatment_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctor manages own treatment plans" ON treatment_plans
  FOR ALL USING (auth.uid() = doctor_id)
  WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Patient reads own treatment plans" ON treatment_plans
  FOR SELECT USING (auth.uid() = patient_id);

-- 6. RLS — kroky
ALTER TABLE treatment_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctor manages steps via plan" ON treatment_steps
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM treatment_plans tp
      WHERE tp.id = treatment_steps.plan_id
        AND tp.doctor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM treatment_plans tp
      WHERE tp.id = treatment_steps.plan_id
        AND tp.doctor_id = auth.uid()
    )
  );

CREATE POLICY "Patient reads own steps" ON treatment_steps
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM treatment_plans tp
      WHERE tp.id = treatment_steps.plan_id
        AND tp.patient_id = auth.uid()
    )
  );
