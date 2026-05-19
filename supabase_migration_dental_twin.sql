-- ─── Dental Twin Migration ───────────────────────────────────────────────────
-- Spustiť v Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS dental_snapshots (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id           uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  snapshot_date        date NOT NULL,
  snapshot_type        text NOT NULL CHECK (snapshot_type IN ('real', 'predicted')),
  prediction_year_offset int,                    -- NULL pre real, 1-10 pre predicted
  tooth_states         jsonb NOT NULL DEFAULT '{}'::jsonb, -- {11: 'healthy', 36: 'caries_deep', ...}
  new_issues           jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{tooth, from_status, to_status, cost}]
  estimated_cost       numeric DEFAULT 0,
  prevention_cost      numeric DEFAULT 0,        -- cena prevencie v tomto roku
  created_at           timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE dental_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pacient vidí vlastné snapshoty"
  ON dental_snapshots FOR SELECT
  USING (auth.uid() = patient_id);

CREATE POLICY "Doktor vkladá snapshoty"
  ON dental_snapshots FOR INSERT
  WITH CHECK (true);  -- doktor/systém vkladá pri návšteve

CREATE POLICY "Systém aktualizuje"
  ON dental_snapshots FOR UPDATE
  USING (auth.uid() = patient_id OR true);

-- Index pre rýchly fetch
CREATE INDEX IF NOT EXISTS idx_dental_snapshots_patient
  ON dental_snapshots (patient_id, snapshot_date);

-- ─── Rozšíriť dental_charts o dátum diagnostiky ───────────────────────────────
ALTER TABLE dental_charts
  ADD COLUMN IF NOT EXISTS date_diagnosed date,
  ADD COLUMN IF NOT EXISTS date_treated   date,
  ADD COLUMN IF NOT EXISTS snapshot_id    uuid REFERENCES dental_snapshots(id);
