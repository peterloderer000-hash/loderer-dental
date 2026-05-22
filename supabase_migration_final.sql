-- ══════════════════════════════════════════════════════════════════════════════
-- FINÁLNA MIGRÁCIA — spusti JEDENKRÁT v Supabase SQL Editor
-- Pridáva: treatment_plans, treatment_plan_items, family_members
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── 1) treatment_plans ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS treatment_plans (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  doctor_id  UUID        NOT NULL REFERENCES profiles(id),
  title      TEXT        NOT NULL,
  notes      TEXT,
  status     TEXT        NOT NULL DEFAULT 'active'
             CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

ALTER TABLE treatment_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctor full access treatment_plans"  ON treatment_plans;
DROP POLICY IF EXISTS "Patient reads own treatment_plans"   ON treatment_plans;
CREATE POLICY "Doctor full access treatment_plans"
  ON treatment_plans
  USING  (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());
CREATE POLICY "Patient reads own treatment_plans"
  ON treatment_plans FOR SELECT
  USING (patient_id = auth.uid());

CREATE INDEX IF NOT EXISTS treatment_plans_patient_idx
  ON treatment_plans (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS treatment_plans_doctor_idx
  ON treatment_plans (doctor_id, created_at DESC);

-- ─── 2) treatment_plan_items ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS treatment_plan_items (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id        UUID        NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
  title          TEXT        NOT NULL,
  description    TEXT,
  estimated_cost NUMERIC(10,2),
  status         TEXT        NOT NULL DEFAULT 'planned'
                 CHECK (status IN ('planned', 'scheduled', 'completed', 'skipped')),
  tooth_number   INTEGER,
  sort_order     INTEGER     NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE treatment_plan_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctor full access plan_items"  ON treatment_plan_items;
DROP POLICY IF EXISTS "Patient reads own plan_items"   ON treatment_plan_items;
CREATE POLICY "Doctor full access plan_items"
  ON treatment_plan_items
  USING  (EXISTS (SELECT 1 FROM treatment_plans tp WHERE tp.id = plan_id AND tp.doctor_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM treatment_plans tp WHERE tp.id = plan_id AND tp.doctor_id = auth.uid()));
CREATE POLICY "Patient reads own plan_items"
  ON treatment_plan_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM treatment_plans tp WHERE tp.id = plan_id AND tp.patient_id = auth.uid()));

CREATE INDEX IF NOT EXISTS treatment_plan_items_plan_idx
  ON treatment_plan_items (plan_id, sort_order);

-- ─── 3) family_members ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS family_members (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  full_name     TEXT        NOT NULL,
  date_of_birth DATE,
  relationship  TEXT        NOT NULL DEFAULT 'iné',
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patient manages own family_members" ON family_members;
CREATE POLICY "Patient manages own family_members"
  ON family_members
  USING  (patient_id = auth.uid())
  WITH CHECK (patient_id = auth.uid());

CREATE INDEX IF NOT EXISTS family_members_patient_idx
  ON family_members (patient_id, created_at);

-- ─── 4) Storage bucket: avatars ──────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars', 'avatars', true, 5242880,
  ARRAY['image/jpeg','image/png','image/webp','image/heic']
)
ON CONFLICT (id) DO UPDATE SET
  public            = true,
  file_size_limit   = 5242880,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic'];

DROP POLICY IF EXISTS "Users upload own avatar"  ON storage.objects;
DROP POLICY IF EXISTS "Users update own avatar"  ON storage.objects;
DROP POLICY IF EXISTS "Users delete own avatar"  ON storage.objects;
DROP POLICY IF EXISTS "Public read avatars"      ON storage.objects;

CREATE POLICY "Users upload own avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users update own avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users delete own avatar"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'avatars');

-- ─── Overenie ─────────────────────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
